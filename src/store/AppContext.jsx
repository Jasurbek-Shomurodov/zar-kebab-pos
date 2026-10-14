import { getActiveTableOrders } from '../lib/tableGuestEntry'
import { useOrderDeletion } from './useOrderDeletion'
import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react'
import { isRecoverableIdleError, loadOperationalTableData, loadPOSData, refreshSupabaseSession, waitForKitchenRoundSubmission, writeToSupabase, subscribeToRealtime } from '../lib/db'
import { REALTIME_STABLE_MS, realtimeRecoveryDelay, shouldRecoverOnResume } from '../lib/resumeRecovery'
import { appMetaReducer } from './appMetaReducer'
import { cartReducer } from './cartReducer'
import { menuReducer } from './menuReducer'
import { ordersReducer } from './ordersReducer'
import { DEFAULT_SETTINGS, loadInitialLang, loadSettings, makeLocalId, makeOrderNumber, normalizeOrderType } from './reducerHelpers'
import { settingsReducer } from './settingsReducer'
import { tablesReducer } from './tablesReducer'
import { isOffPremiseOrderType } from '../lib/orderTypes'
import { DEFAULT_PRICE_MODE, normalizePriceMode, withPriceModeFields } from '../lib/priceModes'
import { isWriteTimeoutError, withWriteTimeout } from '../lib/writeTimeout'
import { getKitchenBillBlockError } from '../lib/billHandoff'
import { formatWriteError, writeErrorReason } from '../lib/writeErrorMessage'
import { useAuth } from '../contexts/AuthContext'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'

const AppContext = createContext(null)
const KITCHEN_SUBMISSION_CONFIRM_TIMEOUT_MS = 10000
const KITCHEN_SUBMISSION_FINAL_CHECK_TIMEOUT_MS = 3000
const PENDING_KITCHEN_SUBMISSION_STORAGE_KEY = 'zar-kebab-pending-kitchen-submission-v1'

function isValidPendingKitchenSubmission(action) {
  const items = Array.isArray(action?._items) ? action._items : []
  return action?.type === 'SEND_TO_KITCHEN' &&
    String(action?._submittedByUserId || '').trim() !== '' &&
    String(action?._orderId || '').trim() !== '' &&
    String(action?._kitchenRoundId || '').trim() !== '' &&
    items.length > 0 &&
    items.every(item => String(item?.id || '').trim() !== '')
}

function readPendingKitchenSubmission(userId) {
  if (!userId || typeof window === 'undefined') return null
  try {
    const storageKey = `${PENDING_KITCHEN_SUBMISSION_STORAGE_KEY}:${userId}`
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null')
    return saved?.userId === userId && saved?.action?._submittedByUserId === userId && isValidPendingKitchenSubmission(saved?.action)
      ? saved.action
      : null
  } catch {
    return null
  }
}

function storePendingKitchenSubmission(userId, action) {
  if (!userId || typeof window === 'undefined') return
  try {
    const storageKey = `${PENDING_KITCHEN_SUBMISSION_STORAGE_KEY}:${userId}`
    if (!isValidPendingKitchenSubmission(action)) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify({ userId, action }))
  } catch {
    // The in-memory attempt still keeps retry identity when browser storage is unavailable.
  }
}

function isAmbiguousKitchenHttpFailure(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.code,
    error?.message,
    error?.details,
  ]
  const ambiguousStatus = /(?:^|[^0-9])(408|425|429|5\d{2})(?:[^0-9]|$)/

  return candidates.some(value => ambiguousStatus.test(String(value ?? ''))) ||
    /bad gateway|gateway timeout|service unavailable|upstream (?:connect|connection|request|response|server)|internal server error/i.test(
      `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`
    )
}

export function isKitchenWriteOutcomeUnknown(error) {
  if (isWriteTimeoutError(error)) return true
  if (isAmbiguousKitchenHttpFailure(error)) return true
  const text = `${error?.name || ''} ${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('load failed') ||
    text.includes('network') ||
    text.includes('offline') ||
    text.includes('connection') ||
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('abort')
  )
}

function pendingKitchenCartSnapshot(action) {
  if (Array.isArray(action?._cart) && action._cart.length > 0) {
    return action._cart.map(item => ({ ...item }))
  }
  return (Array.isArray(action?._items) ? action._items : []).map(item => {
    const {
      id: _submittedItemId,
      status: _submittedStatus,
      order_type: _submittedOrderType,
      kitchen_round_id: _submittedRoundId,
      submitted_at: _submittedAt,
      created_at: _createdAt,
      ...cartItem
    } = item || {}
    return cartItem
  })
}

const WRITE_BEFORE_LOCAL_ACTIONS = new Set([
  'UPDATE_ORDER_ITEM_STATUS',
  'SEND_TO_KITCHEN',
  'CONFIRM_ORDER_DELIVERED',
  'MARK_TABLE_NEEDS_BILL',
  'RECALL_TABLE_FROM_CASHIER',
  'MARK_ORDER_PAID',
  'CHANGE_PAID_ORDER_PAYMENT_METHOD',
  'CHANGE_PAID_ORDER_PAYMENT_METHODS',
  'DELETE_ORDER',
  'DELETE_TABLE',
  'ADD_MENU_ITEM',
  'DELETE_MENU_ITEM',
  'DELETE_CATEGORY',
  'RESTORE_MENU_ITEM',
  'RESTORE_CATEGORY',
])

const LOCAL_ONLY_ACTIONS = new Set([
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'UPDATE_CART_QTY',
  'UPDATE_CART_NOTES',
  'UPDATE_CART_PRICE_MODE',
  'REPLACE_CART',
  'CLEAR_CART',
  'SYNC_CASHIER_BILL_ORDERS',
  'SET_MENU_ITEM_COST',
])

const initialState = {
  lang:           loadInitialLang(),
  settings:       { ...DEFAULT_SETTINGS, ...loadSettings() },
  user:           null,
  tables:         [],
  tableZones:     [],
  menuItems:      [],
  categories:     [],
  orders:         [],
  cart:           [],
  currentTableId: null,
  connectionNotice: null,
  loadError: null,
  loaded:         false,
}

const domainReducers = [
  settingsReducer,
  appMetaReducer,
  tablesReducer,
  menuReducer,
  cartReducer,
  ordersReducer,
]

function reducer(state, action) {
  for (const domainReducer of domainReducers) {
    const next = domainReducer(state, action)
    if (next !== state) return next
  }
  return state
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { loading: authLoading, session } = useAuth()
  const sessionUserId = session?.user?.id || null
  const [pendingKitchenSubmission, setPendingKitchenSubmission] = React.useState(null)
  const pendingKitchenSubmissionRef = useRef(null)
  const sessionUserIdRef = useRef(sessionUserId)
  sessionUserIdRef.current = sessionUserId

  useEffect(() => {
    sessionUserIdRef.current = sessionUserId
    if (authLoading) return
    const restored = readPendingKitchenSubmission(sessionUserId)
    pendingKitchenSubmissionRef.current = restored
    setPendingKitchenSubmission(restored)
  }, [authLoading, sessionUserId])

  function rememberPendingKitchenSubmission(action) {
    if (!isValidPendingKitchenSubmission(action)) return
    pendingKitchenSubmissionRef.current = action
    setPendingKitchenSubmission(action)
    storePendingKitchenSubmission(action?._submittedByUserId || sessionUserIdRef.current, action)
  }

  function clearPendingKitchenSubmission(action) {
    const pending = pendingKitchenSubmissionRef.current
    if (action && pending && action._kitchenRoundId !== pending._kitchenRoundId) return
    pendingKitchenSubmissionRef.current = null
    setPendingKitchenSubmission(null)
    storePendingKitchenSubmission(action?._submittedByUserId || pending?._submittedByUserId || sessionUserIdRef.current, null)
  }

  function assertKitchenSubmissionUser(action) {
    const expectedUserId = String(action?._submittedByUserId || '').trim()
    const currentUserId = String(sessionUserIdRef.current || '').trim()
    if (expectedUserId && currentUserId === expectedUserId) return

    const identityError = new Error('The signed-in waiter changed while the order result was unresolved. Sign back in with the original account to retry safely.')
    identityError.code = 'POS_KITCHEN_SUBMISSION_USER_CHANGED'
    identityError.kitchenSubmissionUnresolved = true
    throw identityError
  }

  // Always-current state reference for async callbacks (avoids stale closures)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const recoverFromIdleRef = useRef(() => {})
  const refreshPOSDataRef = useRef(() => Promise.resolve())

  const refreshPOSData = useCallback(function refreshPOSData() {
    return Promise.resolve()
      .then(() => refreshPOSDataRef.current())
      .catch(err => {
        console.error('[db] POS data refresh failed:', err)
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'error',
            message: stateRef.current.lang === 'ru'
              ? 'Не удалось обновить столы. Проверьте соединение и попробуйте ещё раз.'
              : stateRef.current.lang === 'uz'
                ? 'Stollarni yangilab bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring.'
                : 'Could not refresh tables. Check the connection and try again.',
          },
        })
        return { error: err }
      })
  }, [])

  async function writeKitchenAttempt(action, stateSnapshot) {
    assertKitchenSubmissionUser(action)
    if (action._kitchenSubmissionRetry) {
      try {
        const alreadyCommitted = await withWriteTimeout(
          signal => waitForKitchenRoundSubmission(action, { signal, attempts: 1 }),
          'CONFIRM_KITCHEN_SUBMISSION',
          KITCHEN_SUBMISSION_FINAL_CHECK_TIMEOUT_MS
        )
        if (alreadyCommitted) return { reconciled: true }
      } catch (preflightError) {
        assertKitchenSubmissionUser(action)
        preflightError.kitchenSubmissionUnresolved = true
        throw preflightError
      }
    }
    try {
      await withWriteTimeout(signal => writeToSupabase(action, stateSnapshot, { signal }), action.type)
      return { reconciled: false }
    } catch (error) {
      assertKitchenSubmissionUser(action)
      const outcomeUnknown = isKitchenWriteOutcomeUnknown(error)
      try {
        const committed = await withWriteTimeout(
          signal => waitForKitchenRoundSubmission(action, {
            signal,
            ...(outcomeUnknown ? {} : { attempts: 1 }),
          }),
          'CONFIRM_KITCHEN_SUBMISSION',
          outcomeUnknown
            ? KITCHEN_SUBMISSION_CONFIRM_TIMEOUT_MS
            : KITCHEN_SUBMISSION_FINAL_CHECK_TIMEOUT_MS
        )
        if (committed) {
          console.warn('[db] kitchen submission was confirmed after its response was lost')
          return { reconciled: true }
        }
      } catch (confirmationError) {
        if (confirmationError?.kitchenSubmissionUnresolved) throw confirmationError
        console.warn('[db] kitchen submission could not yet be reconciled:', confirmationError)
      }
      if (!outcomeUnknown) throw error
      error.kitchenSubmissionUnresolved = true
      throw error
    }
  }

  async function writeWithIdleRecovery(action, stateSnapshot) {
    const writeAttempt = action.type === 'SEND_TO_KITCHEN'
      ? writeKitchenAttempt
      : async (nextAction, nextState) => {
          await withWriteTimeout(signal => writeToSupabase(nextAction, nextState, { signal }), nextAction.type)
        }

    try {
      return await writeAttempt(action, stateSnapshot)
    } catch (error) {
      if (isWriteTimeoutError(error)) throw error
      if (!isRecoverableIdleError(error)) throw error
      let refreshedSession
      try {
        refreshedSession = await withWriteTimeout(refreshSupabaseSession(), 'REFRESH_SESSION')
      } catch (refreshError) {
        if (action.type === 'SEND_TO_KITCHEN' && error?.kitchenSubmissionUnresolved) {
          refreshError.kitchenSubmissionUnresolved = true
        }
        throw refreshError
      }
      if (action.type === 'SEND_TO_KITCHEN') {
        const expectedUserId = String(action._submittedByUserId || '').trim()
        const refreshedUserId = String(refreshedSession?.user?.id || '').trim()
        if (!expectedUserId || refreshedUserId !== expectedUserId) {
          const identityError = new Error('The signed-in waiter changed while the order result was unresolved. Sign back in with the original account to retry safely.')
          identityError.code = 'POS_KITCHEN_SUBMISSION_USER_CHANGED'
          identityError.kitchenSubmissionUnresolved = true
          throw identityError
        }
      }
      recoverFromIdleRef.current?.()
      const retryResult = await writeAttempt(action, stateRef.current)
      return action.type === 'SEND_TO_KITCHEN' && error?.kitchenSubmissionUnresolved
        ? { ...retryResult, recoveredAfterUnknown: true }
        : retryResult
    }
  }

  // dbDispatch: optimistic local update + async Supabase write
  const dbDispatch = useCallback(function dbDispatch(action) {
    let enriched = action
    let reusedPendingKitchenSubmission = false
    if (action.type === 'SEND_TO_KITCHEN') {
      const pendingAttempt = pendingKitchenSubmissionRef.current
      if (pendingAttempt) {
        reusedPendingKitchenSubmission = true
        enriched = { ...pendingAttempt, _kitchenSubmissionRetry: true }
      } else {
        const orderType = normalizeOrderType(action.payload?.orderType)
        const isOffPremise = isOffPremiseOrderType(orderType)
        const submittedAt = action._submittedAt || new Date().toISOString()
        const activeOrder = isOffPremise ? null : getActiveTableOrders(stateRef.current.currentTableId, stateRef.current.orders)[0]
        const billError = !isOffPremise && getKitchenBillBlockError(activeOrder, stateRef.current.user)
        if (billError) {
          dispatch({ type: 'SET_CONNECTION_NOTICE', payload: { tone: 'error', error: billError, actionType: action.type } })
          return Promise.resolve({ error: billError, action })
        }
        const priceMode = normalizePriceMode(action.payload?.priceMode || activeOrder?.price_mode || DEFAULT_PRICE_MODE)
        const activeOrderMatchesPriceMode = !activeOrder || normalizePriceMode(activeOrder.price_mode) === priceMode
        const serviceRatePct = isOffPremise
          ? 0
          : activeOrderMatchesPriceMode && Number.isFinite(Number(activeOrder?.service_rate_pct))
            ? Number(activeOrder.service_rate_pct)
            : getConfiguredServiceRatePct(stateRef.current.settings, priceMode)
        const kitchenRoundId = action._kitchenRoundId || `round-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`
        const submissionCart = Array.isArray(action._cart) ? action._cart : stateRef.current.cart
        enriched = {
          ...action,
          _submittedByUserId: sessionUserIdRef.current,
          _tableId: isOffPremise ? null : stateRef.current.currentTableId,
          _priceMode: priceMode,
          _serviceRatePct: serviceRatePct,
          _submittedAt: submittedAt,
          _kitchenRoundId: kitchenRoundId,
          _orderId: action._orderId || (isOffPremise
            ? `${orderType === 'game_club' ? 'gc' : orderType === 'delivery' ? 'dl' : 'ta'}-${Date.now()}`
            : activeOrder?.id || 'o' + Date.now()),
          _orderNumber: action._orderNumber || (isOffPremise
            ? makeOrderNumber(Date.now(), orderType)
            : undefined),
          _cart: Array.isArray(action._cart)
            ? action._cart.map(item => ({ ...item }))
            : submissionCart.map(item => ({ ...item })),
          _items: action._items || submissionCart.map(i => ({
            ...withPriceModeFields(i, i.price_mode || priceMode),
            id: makeLocalId('oi'),
            status: 'new',
            order_type: orderType,
            kitchen_round_id: kitchenRoundId,
            submitted_at: submittedAt,
            created_at: submittedAt,
          })),
        }
        rememberPendingKitchenSubmission(enriched)
      }
    } else if (action.type === 'UPDATE_BILL_ITEM_QTY') {
      enriched = { ...action, _billEditRequestId: action._billEditRequestId || makeLocalId() }
    } else if (action.type === 'ADD_QUICK_ITEM_TO_ORDER') {
      enriched = {
        ...action,
        _itemId: makeLocalId('oi'),
      }
    } else if (
      action.type === 'CONFIRM_ORDER_DELIVERED' ||
      action.type === 'MARK_TABLE_NEEDS_BILL' ||
      action.type === 'RECALL_TABLE_FROM_CASHIER'
    ) {
      enriched = {
        ...action,
        _statusChangedAt: action._statusChangedAt || new Date().toISOString(),
      }
    }

    if (LOCAL_ONLY_ACTIONS.has(enriched.type)) {
      dispatch(enriched)
      return { error: null, action: enriched }
    }

    if (WRITE_BEFORE_LOCAL_ACTIONS.has(enriched.type)) {
      return writeWithIdleRecovery(enriched, stateRef.current)
        .then(writeResult => {
          if (enriched.type === 'SEND_TO_KITCHEN') {
            const expectedUserId = String(enriched._submittedByUserId || '').trim()
            if (!expectedUserId || sessionUserIdRef.current !== expectedUserId) {
              const identityError = new Error('The signed-in waiter changed before the order result was applied. Sign back in with the original account to recover it safely.')
              identityError.code = 'POS_KITCHEN_SUBMISSION_USER_CHANGED'
              identityError.kitchenSubmissionUnresolved = true
              throw identityError
            }
            clearPendingKitchenSubmission(enriched)
          }
          const requiresAuthoritativeKitchenRefresh = enriched.type === 'SEND_TO_KITCHEN' && (
            writeResult?.reconciled ||
            writeResult?.recoveredAfterUnknown ||
            reusedPendingKitchenSubmission
          )
          const completedAction = requiresAuthoritativeKitchenRefresh
            ? { ...enriched, _kitchenSubmissionReconciled: true }
            : enriched
          dispatch(completedAction)
          if (completedAction._kitchenSubmissionReconciled) refreshPOSData()
          dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
          return { error: null, action: completedAction }
        })
        .catch(err => {
          if (enriched.type === 'SEND_TO_KITCHEN') {
            const expectedUserId = String(enriched._submittedByUserId || '').trim()
            const initiatingUserStillActive = expectedUserId && sessionUserIdRef.current === expectedUserId
            if (!initiatingUserStillActive) err.kitchenSubmissionUnresolved = true
            if (initiatingUserStillActive && !err?.kitchenSubmissionUnresolved) {
              const cartSnapshot = pendingKitchenCartSnapshot(enriched)
              if (cartSnapshot.length > 0) dispatch({ type: 'REPLACE_CART', payload: cartSnapshot })
              clearPendingKitchenSubmission(enriched)
              // The server saw a newer table state than this device; resync before a retry.
              if (['closed', 'priceMode'].includes(writeErrorReason(err))) refreshPOSData()
            }
          }
          console.error('[db] write failed:', action.type, err)
          dispatch({
            type: 'SET_CONNECTION_NOTICE',
            payload: {
              tone: 'error',
              error: err,
              actionType: action.type,
            },
          })
          return { error: err, action: enriched }
        })
    }

    dispatch(enriched)
    return writeWithIdleRecovery(enriched, stateRef.current)
      .then(() => {
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
        return { error: null, action: enriched }
      })
      .catch(err => {
        if (enriched.type === 'UPDATE_BILL_ITEM_QTY') refreshPOSData()
        console.error('[db] write failed:', action.type, err)
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'error',
            error: err,
            actionType: action.type,
          },
        })
        return { error: err, action: enriched }
      })
  }, [])

  // Load from Supabase on mount + subscribe to realtime
  useEffect(() => {
    if (authLoading) return undefined
    // Signed-out pages (public menu, vacancies, login) read only the language.
    // Loading POS data for every guest cost ~14 requests per visit and
    // permission-denied errors on staff-only tables. Drop a previous user's data.
    if (!sessionUserId) {
      dispatch({ type: 'SET_LOADING' })
      dispatch({ type: 'SET_ORDERS', payload: [] })
      dispatch({ type: 'SET_TABLES', payload: [] })
      return undefined
    }

    let unsubscribe = () => {}
    let mounted = true
    let hydratePromise = null
    let tableRefreshPromise = null
    let reconnectTimer = null
    let backOnlineTimer = null
    let lastResumeAt = 0
    let awaySince = null
    let realtimeHealthy = false
    let realtimeFailures = 0
    let realtimeStableTimer = null

    async function restoreSession() {
      const activeSession = await refreshSupabaseSession()
      if (sessionUserId && activeSession?.user?.id !== sessionUserId) {
        throw new Error('The signed-in session could not be restored. Please reload and sign in again.')
      }
    }

    async function performHydration() {
      const { tables, tableZones, categories, menuItems, orders, settings } = await loadPOSData()
      if (!mounted) return
      dispatch({ type: 'SET_TABLES',     payload: tables })
      dispatch({ type: 'SET_TABLE_ZONES', payload: tableZones || [] })
      dispatch({ type: 'SET_CATEGORIES', payload: categories })
      dispatch({ type: 'SET_MENU_ITEMS', payload: menuItems })
      dispatch({ type: 'SET_ORDERS',     payload: orders })
      if (settings) dispatch({ type: 'SET_SETTINGS', payload: settings })
      dispatch({ type: 'SET_LOADED' })
      dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
    }

    function hydratePOSData({ afterCurrent = false } = {}) {
      if (!mounted) return Promise.resolve()
      if (hydratePromise) {
        if (afterCurrent) {
          return hydratePromise
            .catch(() => undefined)
            .then(() => hydratePOSData())
        }
        return hydratePromise
      }

      const request = performHydration()
      const trackedRequest = request.finally(() => {
        if (hydratePromise === trackedRequest) hydratePromise = null
      })
      hydratePromise = trackedRequest
      return trackedRequest
    }

    function connectRealtime() {
      unsubscribe()
      realtimeHealthy = false
      if (realtimeStableTimer) clearTimeout(realtimeStableTimer)
      unsubscribe = subscribeToRealtime(dispatch, {
        onSubscribed: () => {
          realtimeHealthy = true
          // A channel that subscribes and drops again keeps its backoff.
          if (realtimeStableTimer) clearTimeout(realtimeStableTimer)
          realtimeStableTimer = setTimeout(() => {
            realtimeStableTimer = null
            if (realtimeHealthy) realtimeFailures = 0
          }, REALTIME_STABLE_MS)
        },
        onConnectionIssue: () => {
          realtimeHealthy = false
          if (realtimeStableTimer) clearTimeout(realtimeStableTimer)
          realtimeStableTimer = null
          // Repeated error/timeout events for one outage share one scheduled recovery.
          if (reconnectTimer) return
          scheduleIdleRecovery(realtimeRecoveryDelay(realtimeFailures))
          realtimeFailures += 1
        },
      })
    }

    function scheduleIdleRecovery(delay = 0) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        dispatch({
          type: 'SET_CONNECTION_NOTICE',
          payload: {
            tone: 'info',
            message: stateRef.current.lang === 'ru'
              ? 'Восстанавливаем соединение...'
              : stateRef.current.lang === 'uz'
                ? 'Ulanish tiklanmoqda...'
                : 'Reconnecting...',
          },
        })
        restoreSession()
          .then(() => hydratePOSData({ afterCurrent: true }))
          .then(() => {
            if (mounted) connectRealtime()
            if (!mounted) return
            if (backOnlineTimer) clearTimeout(backOnlineTimer)
            dispatch({
              type: 'SET_CONNECTION_NOTICE',
              payload: {
                tone: 'success',
                message: stateRef.current.lang === 'ru'
                  ? 'Соединение восстановлено.'
                  : stateRef.current.lang === 'uz'
                    ? 'Ulanish tiklandi.'
                    : 'Back online.',
              },
            })
            backOnlineTimer = setTimeout(() => {
              backOnlineTimer = null
              if (mounted) dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
            }, 2200)
          })
          .catch(err => {
            if (!mounted) return
            console.error('[db] idle recovery failed:', err)
            dispatch({
              type: 'SET_CONNECTION_NOTICE',
              payload: {
                tone: 'error',
                message: stateRef.current.lang === 'ru'
                  ? 'Соединение устарело. Обновите страницу, если данные не обновятся.'
                  : stateRef.current.lang === 'uz'
                    ? 'Ulanish eskirdi. Ma’lumotlar yangilanmasa, sahifani yangilang.'
                    : 'Connection was stale. Refresh the page if data does not update.',
              },
            })
          })
      }, delay)
    }

    function markAway() {
      if (awaySince === null) awaySince = Date.now()
    }

    function handleResume(event) {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        markAway()
        return
      }
      const now = Date.now()
      const awayMs = awaySince === null ? 0 : now - awaySince
      awaySince = null
      if (!shouldRecoverOnResume({ eventType: event?.type, awayMs, realtimeHealthy })) return
      if (now - lastResumeAt < 5000) return
      lastResumeAt = now
      scheduleIdleRecovery(0)
    }

    recoverFromIdleRef.current = () => scheduleIdleRecovery(0)
    refreshPOSDataRef.current = () => {
      if (tableRefreshPromise) return tableRefreshPromise
      const request = (async () => {
        if (hydratePromise) await hydratePromise.catch(() => undefined)
        if (!mounted) return
        const { tables, orders } = await loadOperationalTableData()
        if (!mounted) return
        dispatch({ type: 'SET_TABLES', payload: tables })
        dispatch({ type: 'SET_ORDERS', payload: orders })
        dispatch({ type: 'SET_CONNECTION_NOTICE', payload: null })
        connectRealtime()
        return { tables, orders }
      })()
      const trackedRequest = request.finally(() => {
        if (tableRefreshPromise === trackedRequest) tableRefreshPromise = null
      })
      tableRefreshPromise = trackedRequest
      return trackedRequest
    }

    dispatch({ type: 'SET_LOADING' })
    hydratePOSData()
      .then(() => {
        if (mounted) connectRealtime()
      })
      .catch(err => {
        if (!mounted) return
        console.error('[db] initial load failed:', err)
        dispatch({ type: 'SET_LOAD_ERROR', payload: err?.message || 'Failed to load POS data' })
      })

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResume)
      window.addEventListener('focus', handleResume)
      window.addEventListener('blur', markAway)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume)
    }

    return () => {
      mounted = false
      recoverFromIdleRef.current = () => {}
      refreshPOSDataRef.current = () => Promise.resolve()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (backOnlineTimer) clearTimeout(backOnlineTimer)
      if (realtimeStableTimer) clearTimeout(realtimeStableTimer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleResume)
        window.removeEventListener('focus', handleResume)
        window.removeEventListener('blur', markAway)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume)
      }
      unsubscribe()
    }
  }, [authLoading, sessionUserId])

  const { guardedDispatch, deletionDialog } = useOrderDeletion(dbDispatch, state.lang)

  return (
    <AppContext.Provider value={{ state, dispatch: guardedDispatch, refreshPOSData, pendingKitchenSubmission }}>
      {state.connectionNotice && (
        <div role="alert" className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[9999] max-w-[calc(100vw-2rem)] -translate-x-1/2 break-words rounded-xl px-4 py-2 text-center text-sm font-semibold shadow-lg ${
          state.connectionNotice.tone === 'error'
            ? 'bg-red-600 text-white'
            : state.connectionNotice.tone === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-[#1F2937] text-white'
        }`}>
          {state.connectionNotice.error
            ? formatWriteError(state.connectionNotice.error, state.lang, state.connectionNotice.actionType)
            : state.connectionNotice.message}
        </div>
      )}
      {children}
      {deletionDialog}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}

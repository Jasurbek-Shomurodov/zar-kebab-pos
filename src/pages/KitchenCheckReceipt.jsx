import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { getItemName } from '../lib/i18n'
import { getGroupedOrderItems } from '../lib/analytics'
import { formatTime } from '../lib/dateFormat'
import {
  formatKitchenOrderNumber,
  formatKitchenTableName,
  getKitchenCheckGroup,
  kitchenItemName,
} from '../lib/kitchenCheck'
import { loadKitchenCheckOrder } from '../lib/db'
import { getManualOrderNotes, getOrderItemOptionLines } from '../components/MenuProductCards'
import { useAppDataStatus } from '../store/appHooks'
import { formatMenuQuantity, isMenuItemSoldByWeight } from '../lib/menuSaleUnits'

const PRINT_CSS = `
@page {
  size: 80mm auto;
  margin: 0;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html,
  body {
    width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }
  body * {
    visibility: hidden !important;
  }
  .no-print { display: none !important; }
  button,
  nav,
  aside,
  header,
  footer,
  dialog,
  [role="dialog"] {
    display: none !important;
  }
  .kitchen-check-bg {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: 80mm !important;
    background: #fff !important;
    padding: 0 !important;
    min-height: unset !important;
  }
  .kitchen-check-print-area,
  .kitchen-check-print-area * {
    visibility: visible !important;
  }
  .kitchen-check-print-area {
    position: static !important;
    display: block !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 3mm !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    font-family: "Courier New", monospace !important;
    font-size: 14px !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
  }
  .kitchen-check-bg > div {
    display: block !important;
  }
  .kitchen-check-print-area + .kitchen-check-print-area {
    break-before: page;
    page-break-before: always;
  }
  .kitchen-check-print-area * {
    color: #000 !important;
    border-color: #000 !important;
    box-shadow: none !important;
  }
}
`

function sanitizeBackPath(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

function handlePrintKitchenCheck(delay = 300) {
  window.setTimeout(() => window.print(), delay)
}

function localizeKitchenGroup(group, menuItemMap, lang = 'ru') {
  return {
    ...group,
    items: (group?.items || []).map(item => {
      const menuItem = menuItemMap?.[item.menu_item_id]
      return {
        ...item,
        name: menuItem ? getItemName(menuItem, lang) : item.name,
        notes: [
          ...getOrderItemOptionLines(item, menuItem, lang),
          getManualOrderNotes(item, menuItem, lang),
        ].filter(Boolean).join('\n'),
      }
    }),
  }
}

function KitchenCheckPaper({ group }) {
  const time = formatTime(group?.createdAt || new Date())
  const orderNumber = formatKitchenOrderNumber(group)
  const tableName = formatKitchenTableName(group?.tableName)
  const waiterName = group?.waiterName || '-'

  return (
    <div
      className="kitchen-check-print-area bg-white"
      style={{
        width: '320px',
        maxWidth: '100%',
        padding: '14px 12px',
        fontFamily: '"Courier New", monospace',
        color: '#000',
        fontSize: '14px',
        lineHeight: 1.2,
        fontWeight: 700,
      }}
    >
      <h1 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: '17px', lineHeight: 1.05, fontWeight: 900 }}>
        ЧЕК ДЛЯ КУХНИ
      </h1>

      <div style={{ display: 'grid', gap: '2px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', whiteSpace: 'nowrap' }}>
          <span>{tableName}</span>
          <span>{orderNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', whiteSpace: 'nowrap' }}>
          <span>{time}</span>
          <span>{waiterName}</span>
        </div>
      </div>

      <div aria-hidden="true" style={{ margin: '7px 0', borderTop: '2px solid #000' }} />

      <div style={{ display: 'grid', gap: '6px' }}>
        {getGroupedOrderItems(group?.items || []).map(item => (
          <div
            key={item.id || `${item.menu_item_id}-${item.name}`}
            style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: '7px', fontSize: '15px', fontWeight: 900 }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>
              {isMenuItemSoldByWeight(item)
                ? `${formatMenuQuantity(item.quantity, item)} ·`
                : `${formatMenuQuantity(item.quantity, item)} ×`}
            </span>
            <span>{kitchenItemName(item)}</span>
            {item.notes && (
              <div style={{ gridColumn: '2', marginTop: '1px', fontSize: '11px', lineHeight: 1.15, fontWeight: 700, textTransform: 'uppercase' }}>
                {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div aria-hidden="true" style={{ margin: '7px 0 0', borderTop: '2px solid #000' }} />
    </div>
  )
}

function kitchenTargetKey(target) {
  return `${target.orderId}\n${target.roundId}`
}

export default function KitchenCheckReceipt() {
  const { orderId: routeOrderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { state } = useApp()
  const { loaded, loadError } = useAppDataStatus()
  const params = new URLSearchParams(location.search)
  const autoPrint = params.get('print') === '1'
  const backPath = sanitizeBackPath(params.get('back')) || '/waiter/tables'
  const lang = state.lang || 'ru'
  const [fetchedGroups, setFetchedGroups] = useState({})
  const [roundLookupState, setRoundLookupState] = useState('idle')
  const printedRoundRef = useRef('')

  // One check per `round`; repeated `round`/`order` pairs print several rounds at once.
  const targets = useMemo(() => {
    const search = new URLSearchParams(location.search)
    const rounds = search.getAll('round').filter(Boolean)
    const orderIds = search.getAll('order')
    if (rounds.length === 0) return [{ orderId: routeOrderId, roundId: '' }]
    return rounds.map((roundId, index) => ({ orderId: orderIds[index] || routeOrderId, roundId }))
  }, [location.search, routeOrderId])

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(item => { map[item.id] = item })
    return map
  }, [state.menuItems])

  const stateGroups = useMemo(() => targets.map(({ orderId, roundId }) => {
    const order = state.orders.find(item => item.id === orderId)
    const selected = getKitchenCheckGroup(order, roundId)
    return selected ? localizeKitchenGroup(selected, menuItemMap, 'ru') : null
  }), [menuItemMap, state.orders, targets])

  const missingTargets = targets.filter((target, index) => target.roundId && !stateGroups[index])
  const missingKey = missingTargets.map(kitchenTargetKey).join('\n\n')

  const groups = targets
    .map((target, index) => stateGroups[index] || fetchedGroups[kitchenTargetKey(target)] || null)
    .filter(Boolean)

  useEffect(() => {
    setFetchedGroups({})
    if (!loaded || loadError || !missingKey) {
      setRoundLookupState('idle')
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    setRoundLookupState('loading')

    const lookups = missingKey.split('\n\n').map(key => {
      const [orderId, roundId] = key.split('\n')
      return { key, orderId, roundId }
    })
    const orderIds = [...new Set(lookups.map(lookup => lookup.orderId))]

    Promise.all(orderIds.map(orderId => loadKitchenCheckOrder(orderId, { signal: controller.signal })))
      .then(orders => {
        if (cancelled) return
        const found = {}
        for (const { key, orderId, roundId } of lookups) {
          const order = orders[orderIds.indexOf(orderId)]
          const selected = getKitchenCheckGroup(order, roundId)
          if (selected) found[key] = localizeKitchenGroup(selected, menuItemMap, 'ru')
        }
        setFetchedGroups(found)
        setRoundLookupState(Object.keys(found).length > 0 ? 'found' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setRoundLookupState('error')
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [loaded, loadError, menuItemMap, missingKey])

  const isLookingUpRound = loaded && !loadError && !!missingKey && (
    roundLookupState === 'idle' || roundLookupState === 'loading'
  )
  const printKey = groups.map(group => `${group.orderId}:${group.roundId}`).join('|')

  useEffect(() => {
    if (!autoPrint || !printKey || isLookingUpRound) return
    if (printedRoundRef.current === printKey) return
    const timer = setTimeout(() => {
      printedRoundRef.current = printKey
      handlePrintKitchenCheck(0)
    }, 600)
    return () => clearTimeout(timer)
  }, [autoPrint, isLookingUpRound, printKey])

  if (!loaded || isLookingUpRound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Loader2 size={28} className="animate-spin text-[#ff5a00]" />
      </div>
    )
  }

  if (loadError || groups.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="mb-4 text-sm font-black text-red-600">
            {lang === 'uz' ? 'Oshxona cheki topilmadi.' : lang === 'ru' ? 'Чек кухни не найден.' : 'Kitchen check not found.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white"
          >
            {lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          {lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back'}
        </button>
        <button
          type="button"
          onClick={() => handlePrintKitchenCheck()}
          className="flex items-center gap-2 rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#e64d00]"
        >
          <Printer size={15} />
          {lang === 'uz' ? 'Chop etish' : lang === 'ru' ? 'Печать' : 'Print'}
        </button>
      </div>

      <div className="kitchen-check-bg flex min-h-screen justify-center px-4 py-4">
        <div className="flex flex-col items-center gap-4">
          {groups.map(group => (
            <KitchenCheckPaper key={`${group.orderId}:${group.roundId}`} group={group} />
          ))}
        </div>
      </div>
    </div>
  )
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { getItemName } from '../lib/i18n'
import {
  buildKitchenCheckModel,
  getKitchenCheckGroup,
  resolveKitchenCheckTargets,
} from '../lib/kitchenCheck'
import { loadKitchenCheckOrder } from '../lib/db'
import { getManualOrderNotes, getOrderItemOptionLines } from '../components/MenuProductCards'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import ReceiptTopBar from '../components/ReceiptTopBar'
import { useAppDataStatus } from '../store/appHooks'
import { stripPrintParam, usePrintOnce } from '../lib/usePrintOnce'

// Screen chrome only: the slip itself is always printed in Russian for the kitchen.
const L = {
  uz: {
    loading: 'Oshxona cheki yuklanmoqda',
    loadFailedTitle: 'Oshxona chekini yuklab bo‘lmadi',
    loadFailedHint: 'Ulanishni tekshirib, qayta urinib ko‘ring. Buyurtmani qayta yubormang: u saqlangan.',
    retry: 'Qayta urinish',
    reload: 'Qayta yuklash',
    notFoundTitle: 'Oshxona cheki topilmadi',
    notFoundHint: 'Bu buyurtmada chop etiladigan taom yo‘q yoki u bekor qilingan.',
    back: 'Orqaga',
    missing: (missing, total) => `${total} ta chekdan ${missing} tasi topilmadi va chop etilmaydi. Avtomatik chop etish to‘xtatildi: avval tekshiring.`,
  },
  ru: {
    loading: 'Загрузка чека кухни',
    loadFailedTitle: 'Не удалось загрузить чек кухни',
    loadFailedHint: 'Проверьте соединение и повторите. Не отправляйте заказ повторно: он сохранён.',
    retry: 'Повторить',
    reload: 'Перезагрузить',
    notFoundTitle: 'Чек кухни не найден',
    notFoundHint: 'В этом заказе нет блюд для печати, или он отменён.',
    back: 'Назад',
    missing: (missing, total) => `Не найдено чеков: ${missing} из ${total}. Они не будут напечатаны. Автопечать остановлена: сначала проверьте.`,
  },
  en: {
    loading: 'Loading kitchen check',
    loadFailedTitle: 'Could not load the kitchen check',
    loadFailedHint: 'Check the connection and try again. Do not resend the order: it is saved.',
    retry: 'Try again',
    reload: 'Reload',
    notFoundTitle: 'Kitchen check not found',
    notFoundHint: 'This order has nothing to print, or it was cancelled.',
    back: 'Back',
    missing: (missing, total) => `${missing} of ${total} checks could not be found and will not print. Automatic printing is stopped: check first.`,
  },
}

const PRINT_CSS = `
/* "80mm auto" is not a valid size value (CSS Paged Media: a length cannot be combined with
   auto), so browsers ignore it and the roll width comes from the printer driver's paper size.
   Left as is: the valid forms ("80mm" = an 80x80mm page, or a fixed height) would cut or feed
   real tickets differently. See PRINTING.md. */
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

// One meta line of the slip: the fixed part (order number, time) never shrinks, the name next
// to it is cut with an ellipsis instead of pushing the line off the 80mm paper.
const META_ROW = { display: 'flex', justifyContent: 'space-between', gap: '6px', whiteSpace: 'nowrap' }
const META_FIXED = { flexShrink: 0 }
const META_FLEXIBLE = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }

function KitchenCheckPaper({ group }) {
  const check = buildKitchenCheckModel(group)

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
        {check.title}
      </h1>

      <div style={{ display: 'grid', gap: '2px' }}>
        <div style={META_ROW}>
          <span style={META_FLEXIBLE}>{check.tableName}</span>
          <span style={META_FIXED}>{check.orderNumber}</span>
        </div>
        <div style={META_ROW}>
          <span style={META_FIXED}>{check.time}</span>
          <span style={{ ...META_FLEXIBLE, textAlign: 'right' }}>{check.waiterName}</span>
        </div>
      </div>

      <div aria-hidden="true" style={{ margin: '7px 0', borderTop: '2px solid #000' }} />

      <div style={{ display: 'grid', gap: '6px' }}>
        {check.rows.map(row => (
          <div
            key={row.key}
            style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: '7px', fontSize: '15px', fontWeight: 900 }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{row.quantity}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{row.name}</span>
            {row.notes && (
              // Options and the waiter's note are separate lines joined with "\n": keep the breaks.
              <div style={{ gridColumn: '2', marginTop: '1px', fontSize: '12px', lineHeight: 1.15, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {row.notes}
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
  const l = L[lang] || L.en
  const [fetchedGroups, setFetchedGroups] = useState({})
  const [roundLookupState, setRoundLookupState] = useState('idle')
  const [lookupVersion, setLookupVersion] = useState(0)

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

  // Anything this device does not hold (another waiter's round, a paid order) is read directly.
  const missingTargets = targets.filter((target, index) => target.orderId && !stateGroups[index])
  const missingKey = missingTargets.map(kitchenTargetKey).join('\n\n')

  const { groups, missingCount } = resolveKitchenCheckTargets(
    targets,
    target => stateGroups[targets.indexOf(target)] || fetchedGroups[kitchenTargetKey(target)] || null,
  )

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
      .catch(error => {
        if (cancelled) return
        // A failed or timed-out read is not "no such check": say so and offer a retry.
        console.error('[kitchen-check] round lookup failed', error)
        setRoundLookupState('error')
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [loaded, loadError, lookupVersion, menuItemMap, missingKey])

  const isLookingUpRound = loaded && !loadError && !!missingKey && (
    roundLookupState === 'idle' || roundLookupState === 'loading'
  )
  const lookupFailed = !!missingKey && roundLookupState === 'error'
  const settled = loaded && !loadError && !isLookingUpRound && !lookupFailed
  const hasMissingRounds = settled && groups.length > 0 && missingCount > 0

  // `print=1` is used up by the one automatic print (or by the decision not to print):
  // without it Back, a reload or a restored tab shows the check and prints nothing.
  const consumeAutoPrint = useCallback(() => {
    navigate(`${location.pathname}${stripPrintParam(location.search)}`, { replace: true })
  }, [location.pathname, location.search, navigate])

  const { busy: printBusy, print } = usePrintOnce({
    autoPrint,
    ready: settled && groups.length > 0 && missingCount === 0,
    blocked: hasMissingRounds,
    onAutoPrintConsumed: consumeAutoPrint,
  })

  // Replace, so the waiter's own Back from the table does not land on this check again.
  const goBack = () => navigate(backPath, { replace: true })

  if (!loaded || isLookingUpRound) {
    return (
      <div className="min-h-screen bg-[#f6f5f3]">
        <OperationalLoading layout="form" title={l.loading} className="mx-auto max-w-md" />
      </div>
    )
  }

  if (loadError || lookupFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] p-4">
        <div className="grid justify-items-center">
          <OperationalError
            lang={lang}
            title={l.loadFailedTitle}
            description={l.loadFailedHint}
            actionLabel={lookupFailed ? l.retry : l.reload}
            // The app data has no loader a page can call; a failed round lookup is re-run in place.
            onAction={lookupFailed ? () => setLookupVersion(version => version + 1) : () => window.location.reload()}
          />
          <button type="button" onClick={goBack} className="ws-btn ws-btn-ghost min-h-11">{l.back}</button>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] p-4">
        <div className="ws-empty">
          <FileQuestion aria-hidden="true" />
          <h3>{l.notFoundTitle}</h3>
          <p>{l.notFoundHint}</p>
          <button type="button" onClick={goBack} className="ws-btn ws-btn-outline min-h-11">{l.back}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f5f3]">
      <style>{PRINT_CSS}</style>

      <ReceiptTopBar lang={lang} onBack={goBack} onPrint={print} printBusy={printBusy} />

      {hasMissingRounds && (
        <div role="alert" className="no-print ws-notice ws-tone-caution mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-md flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 basis-56">{l.missing(missingCount, targets.length)}</span>
          <button type="button" onClick={() => setLookupVersion(version => version + 1)} className="ws-btn ws-btn-sm ws-btn-outline min-h-11">
            {l.retry}
          </button>
        </div>
      )}

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

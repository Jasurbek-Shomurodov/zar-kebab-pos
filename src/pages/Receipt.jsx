import React, { useCallback, useMemo, useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { getItemName, t } from '../lib/i18n'
import { FileQuestion } from 'lucide-react'
import {
  getGroupedOrderItems,
  getOrderItemLineTotal,
  getOrderItemProductId,
  isCancelledOrderItem,
} from '../lib/analytics'
import { PRICE_MODE_TOURIST } from '../lib/priceModes'
import { isCashierQuickItem } from '../lib/menuItems'
import { inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { expensePaymentMethodLabel } from '../lib/expenses'
import { getOrderPaymentBreakdown } from '../lib/analytics'
import { formatDateTime } from '../lib/dateFormat'
import { loadReceiptOrderGroup } from '../lib/db'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { formatMenuQuantity } from '../lib/menuSaleUnits'
import { getReceiptFooterVisibility, normalizeReceiptMarketing } from '../lib/receiptMarketing'
import { getFreshCashierPaymentQuote, getOrderGroupPaymentQuote } from '../lib/cashierCheckout'
import { formatCurrency, formatGroupedNumber } from '../lib/formatCurrency'
import { stripPrintParam, usePrintOnce } from '../lib/usePrintOnce'
import { useAppDataStatus } from '../store/appHooks'
import ReceiptTopBar from '../components/ReceiptTopBar'

// ── Localisation ──────────────────────────────────────────────────────────────

const L = {
  uz: {
    slogan:      "Olov. Ta'm. An'ana.",
    table:       'Stol',
    waiter:      'Ofitsiant',
    completedBy: 'Yopgan',
    date:        'Sana',
    itemCol:     'Taom',
    qtyCol:      'Soni',
    amountCol:   'Summa',
    orderAmount: 'Buyurtma summasi',
    servicePct:  n => n == null ? 'Xizmat haqi' : `Xizmat haqi ${n}%`,
    loyaltyUsed: 'Sodiqlik ishlatildi',
    cashbackEarned: 'Cashback hisoblandi',
    total:       "To'lovga jami",
    thanks1:     'Tashrifingiz uchun rahmat!',
    cashbackPromo: 'Cashback 10% gacha',
    loadFailedTitle: 'Chekni yuklab bo‘lmadi',
    loadFailedHint: 'Ulanishni tekshiring va chekni qayta yuklang. Buyurtmani qayta yubormang.',
    retry: 'Qayta urinish',
    reload: 'Qayta yuklash',
  },
  ru: {
    slogan:      'Огонь. Вкус. Традиции.',
    table:       'Стол',
    waiter:      'Официант',
    completedBy: 'Закрыл',
    date:        'Дата',
    itemCol:     'Блюдо',
    qtyCol:      'Кол-во',
    amountCol:   'Сумма',
    orderAmount: 'Сумма заказа',
    servicePct:  n => n == null ? 'Обслуживание' : `Обслуживание ${n}%`,
    loyaltyUsed: 'Использовано с карты',
    cashbackEarned: 'Начислен кешбэк',
    total:       'Итого к оплате',
    thanks1:     'Спасибо, что выбрали ZarKebab!',
    cashbackPromo: 'Cashback до 10%',
    loadFailedTitle: 'Не удалось загрузить чек',
    loadFailedHint: 'Проверьте соединение и повторите загрузку чека. Не отправляйте заказ повторно.',
    retry: 'Повторить',
    reload: 'Перезагрузить',
  },
  en: {
    slogan:      'Fire. Flavor. Tradition.',
    table:       'Table',
    waiter:      'Waiter',
    completedBy: 'Completed by',
    date:        'Date',
    itemCol:     'Item',
    qtyCol:      'Qty',
    amountCol:   'Amount',
    orderAmount: 'Order amount',
    servicePct:  n => n == null ? 'Service' : `Service ${n}%`,
    loyaltyUsed: 'Loyalty used',
    cashbackEarned: 'Cashback earned',
    total:       'Total to pay',
    thanks1:     'Thank you for choosing ZarKebab!',
    cashbackPromo: 'Cashback up to 10%',
    loadFailedTitle: 'Could not load receipt',
    loadFailedHint: 'Check the connection and retry loading the receipt. Do not resubmit the order.',
    retry: 'Try again',
    reload: 'Reload',
  },
}

// ── Number formatters ─────────────────────────────────────────────────────────

// Whole UZS through the shared formatter, so the receipt groups digits like every other screen.
function fmtNum(n) {
  return formatGroupedNumber(Math.round(n))
}
function fmtUZS(n) {
  return formatCurrency(Math.round(n))
}

function normalizeReceiptItems(rawItems, menuItemMap) {
  return rawItems.map(item => {
    const productId = getOrderItemProductId(item)
    const menuItem = productId != null ? menuItemMap[productId] : null
    return isCashierQuickItem(menuItem)
      ? { ...item, sale_unit: item.sale_unit || menuItem?.sale_unit, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
      : { ...item, sale_unit: item.sale_unit || menuItem?.sale_unit }
  })
}

function getReceiptItems(rawItems, menuItemMap, lang) {
  // Never group by localized/display name. Shared grouping uses product id plus
  // selected modifiers/options, and leaves rows without product ids separate.
  const normalizedItems = normalizeReceiptItems(rawItems, menuItemMap)
  return getGroupedOrderItems(normalizedItems, item => {
    const productId = getOrderItemProductId(item)
    const menuItem = productId != null ? menuItemMap[productId] : null
    return (menuItem && getItemName(menuItem, lang)) || item.name
  })
}

// The parts of a receipt that depend on the language printed on it. The quote (money) is
// computed once; switching the receipt language only renames things.
function localizeReceipt(data, menuItemMap, lang) {
  if (!data) return null
  const { rawItems, labelOrder, table, tableFallback, ...rest } = data
  return {
    ...rest,
    tableName: receiptTableLabel(labelOrder, table, lang, tableFallback),
    items: getReceiptItems(rawItems, menuItemMap, lang),
    salaryLabel: expensePaymentMethodLabel('salary', lang),
  }
}

function receiptTableLabel(order, table, lang, fallback) {
  const orderType = inferOrderType(order)
  return isOffPremiseOrderType(orderType) ? orderTypeLabel(orderType, lang) : (table?.name || order?.table_name || fallback)
}

// ── Shared font styles ────────────────────────────────────────────────────────

const INTER   = "'Onest', sans-serif"
const POPPINS = "'Onest', sans-serif"

// ── Print + font CSS ──────────────────────────────────────────────────────────

// Onest is loaded once by index.html; the receipt does not import it again.
const PRINT_CSS = `
/* "80mm auto" is not a valid size value (CSS Paged Media: a length cannot be combined with
   auto), so browsers ignore it and the roll width comes from the printer driver's paper size.
   Left as is: the valid forms ("80mm" = an 80x80mm page, or a fixed height) would cut or feed
   real receipts differently. See PRINTING.md. */
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
  .receipt-bg {
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
    min-height: unset !important;
  }
  .receipt-bg > div {
    overflow: visible !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    display: block !important;
  }
  .receipt-print-area,
  .receipt-print-area * {
    visibility: visible !important;
  }
  .receipt-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: 80mm !important;
    max-width: 80mm !important;
    min-height: auto !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 2mm !important;
    border: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    font-family: 'Onest', Arial, sans-serif !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
  }
  .receipt-print-area *,
  .receipt-print-area svg,
  .receipt-print-area img {
    color: #000 !important;
    background: #fff !important;
    border-color: #000 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .receipt-marketing {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`

// Printing goes through usePrintOnce (one print at a time). Browser JavaScript cannot select a
// printer: for silent Windows thermal printing, set the Xprinter as the Windows default printer
// and launch Chrome with --kiosk-printing; the browser print call then goes straight to it.

// ── ReceiptPaper ──────────────────────────────────────────────────────────────

const LOYALTY_LEVELS = 'Bronze 3% | Silver 5% | Gold 7% | Premium 10%'

function ReceiptMarketingFooter({ labels, mode, priceMode, receiptFooter }) {
  const {
    mode: marketingMode,
    showCustomFooter,
    showLoyalty,
    showInstagram,
  } = getReceiptFooterVisibility(mode, priceMode)
  const hasMarketingContent = (showCustomFooter && !!receiptFooter) || showLoyalty || showInstagram

  return (
    <>
      <Divider dashed style={{ margin: '5px 0 4px' }} />
      <div className={`receipt-marketing receipt-marketing-${marketingMode}`} style={{
        textAlign: 'center',
        fontFamily: INTER,
        fontSize: '10px',
        lineHeight: 1.2,
        color: '#111',
        pageBreakInside: 'avoid',
      }}>
        {showCustomFooter && receiptFooter && (
          <div style={{ fontSize: '10px', fontWeight: 400, color: '#333', marginBottom: '3px' }}>
            {receiptFooter}
          </div>
        )}
        {showLoyalty && (
          <>
            <div style={{ fontSize: '10px', fontWeight: 700, marginBottom: '2px' }}>{labels.cashbackPromo}</div>
            <div style={{ fontSize: '10px', color: '#333', marginBottom: showInstagram ? '3px' : 0 }}>{LOYALTY_LEVELS}</div>
          </>
        )}
        {showInstagram && (
          <div style={{ fontWeight: 600 }}>Instagram: @zarkebab</div>
        )}
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          marginTop: hasMarketingContent ? '4px' : 0,
        }}>
          {labels.thanks1}
        </div>
      </div>
    </>
  )
}

function firstNonEmpty(orders, keys, fallback = '—') {
  for (const order of orders) {
    for (const key of keys) {
      const value = String(order?.[key] || '').trim()
      if (value) return value
    }
  }
  return fallback
}

// The language printed on this receipt. It is the receipt's own choice: English by default for
// a Tourist bill, the staff language otherwise, and the switcher above the paper changes only
// this receipt. The app language (and every other screen) is never touched from here.
function useReceiptLanguage(appLang, priceMode) {
  const [chosenLang, setChosenLang] = useState(null)
  const fallback = priceMode === PRICE_MODE_TOURIST ? 'en' : appLang
  const receiptLang = chosenLang || (L[fallback] ? fallback : 'en')
  return [receiptLang, setChosenLang]
}

function ReceiptPaper({ restaurantName, tableName, priceMode, waiterName, completedByName, dateStr, items, subtotal, serviceFee, serviceRate, loyaltyAmt, cashbackEarned, total, salaryAmount = 0, salaryLabel, labels, receiptFooter, receiptMarketing }) {
  const marketingMode = normalizeReceiptMarketing(receiptMarketing)
  const brandName = String(restaurantName || '').trim() || 'ZarKebab'

  return (
    <div
      className="receipt-paper receipt-print-area bg-white"
      style={{
        width: '320px',
        maxWidth: '100%',
        padding: '12px 16px 14px',
        fontFamily: INTER,
        fontVariantNumeric: 'tabular-nums',
        color: '#111',
        fontSize: '11px',
        lineHeight: 1.22,
      }}
    >

      {/* ── Brand header ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '3px' }}>
        <div style={{
          fontFamily: INTER,
          fontSize: '19px',
          fontWeight: 800,
          color: '#111',
          letterSpacing: '0',
          lineHeight: 1.05,
          marginBottom: '2px',
          overflowWrap: 'anywhere',
        }}>
          {brandName}
        </div>
        <div style={{
          fontFamily: INTER,
          fontSize: '10px',
          fontWeight: 500,
          color: '#333',
        }}>
          {labels.slogan}
        </div>
      </div>

      <Divider dashed style={{ margin: '4px 0' }} />

      {/* ── Order meta ───────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3px' }}>
        <tbody>
          <MetaRow label={labels.table} value={tableName} />
          <MetaRow label={labels.waiter} value={waiterName} />
          {completedByName && completedByName !== '—' && <MetaRow label={labels.completedBy} value={completedByName} />}
          <MetaRow label={labels.date} value={dateStr} />
        </tbody>
      </table>

      <Divider dashed style={{ margin: '0 0 4px' }} />

      {/* ── Items table header ───────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 48px 74px',
        fontFamily: INTER,
        fontSize: '10px',
        fontWeight: 700,
        color: '#111',
        paddingBottom: '2px',
        borderBottom: '1px solid #ddd',
        marginBottom: '2px',
      }}>
        <span style={{ fontStyle: 'italic' }}>{labels.itemCol}</span>
        <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{labels.qtyCol}</span>
        <span style={{ textAlign: 'right' }}>{labels.amountCol}</span>
      </div>

      {/* ── Item rows ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '3px' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 48px 74px',
            alignItems: 'baseline',
            padding: '2px 0',
            borderBottom: '1px solid #eee',
            fontFamily: INTER,
            fontSize: '10.5px',
            fontWeight: 400,
          }}>
            <span style={{ paddingRight: '6px', lineHeight: 1.25, color: '#111', fontStyle: 'italic' }}>{item.name}</span>
            <span style={{ textAlign: 'center', fontWeight: 500, color: '#333' }}>{formatMenuQuantity(item.quantity, item)}</span>
            <span style={{ textAlign: 'right', fontWeight: 600, color: '#111', whiteSpace: 'nowrap' }}>
              {fmtNum(getOrderItemLineTotal(item))}
            </span>
          </div>
        ))}
      </div>

      {/* ── Subtotals ────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2px' }}>
        <tbody>
          {salaryAmount > 0 && <TotalRow label={salaryLabel} value={fmtUZS(salaryAmount)} />}
          <TotalRow label={labels.orderAmount} value={fmtUZS(subtotal)} />
          <TotalRow label={labels.servicePct(serviceRate)} value={fmtUZS(serviceFee)} />
          {loyaltyAmt > 0 && (
            <TotalRow label={labels.loyaltyUsed} value={`− ${fmtUZS(loyaltyAmt)}`} color="#111" />
          )}
          {cashbackEarned > 0 && (
            <TotalRow label={labels.cashbackEarned} value={`+ ${fmtUZS(cashbackEarned)}`} color="#111" />
          )}
        </tbody>
      </table>

      <Divider solid style={{ margin: '4px 0' }} />

      {/* ── Grand total ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '8px',
        fontFamily: POPPINS,
        fontSize: '14px',
        fontWeight: 800,
        color: '#111',
        marginBottom: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ minWidth: 0 }}>{labels.total}</span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtUZS(total)}</span>
      </div>

      <ReceiptMarketingFooter
        labels={labels}
        mode={marketingMode}
        priceMode={priceMode}
        receiptFooter={receiptFooter}
      />
    </div>
  )
}

// ── Divider variants ──────────────────────────────────────────────────────────

function Divider({ dashed, solid, style }) {
  return (
    <div style={{
      borderTop: dashed
        ? '1px dashed #ccc'
        : solid
        ? '1.5px solid #222'
        : '1px solid #e5e5e5',
      ...style,
    }} />
  )
}

// ── Table row helpers ─────────────────────────────────────────────────────────

function MetaRow({ label, value }) {
  return (
    <tr>
      <td style={{
        fontFamily: INTER,
        fontSize: '12px',
        fontWeight: 500,
        color: '#555',
        paddingRight: '8px',
        paddingBottom: '2px',
        whiteSpace: 'nowrap',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '12px',
        fontWeight: 600,
        color: '#111',
        textAlign: 'right',
        paddingBottom: '2px',
      }}>
        {value}
      </td>
    </tr>
  )
}

function TotalRow({ label, value, color }) {
  return (
    <tr>
      <td style={{
        fontFamily: INTER,
        fontSize: '11px',
        fontWeight: 500,
        color: color || '#555',
        paddingBottom: '2px',
      }}>
        {label}:
      </td>
      <td style={{
        fontFamily: INTER,
        fontSize: '11px',
        fontWeight: 600,
        color: color || '#111',
        textAlign: 'right',
        paddingBottom: '2px',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </td>
    </tr>
  )
}

// ── Route: /receipt/table/:tableId ────────────────────────────────────────────

export function TableReceipt() {
  const { tableId } = useParams()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { state } = useApp()
  const { loaded, loadError, retry: retryPOSLoad } = useAppDataStatus()
  const lang     = state.lang
  const screenLabels = L[lang] || L.en
  const settings = state.settings

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const candidateOrders = state.orders.filter(
      o => o.table_id === tableId && o.payment_status !== 'paid'
    )
    if (candidateOrders.length === 0) return null

    const quote = getFreshCashierPaymentQuote({
      orders: candidateOrders,
      menuItems: state.menuItems,
      settings,
      tableId,
    })
    if (!quote.primaryOrderId) return null

    const contributingIds = new Set(quote.contributingOrderIds)
    const orders = candidateOrders.filter(order => contributingIds.has(order.id))
    const primaryOrder = orders.find(order => order.id === quote.primaryOrderId) || orders[0]

    const table    = state.tables.find(t => t.id === tableId)
    const allItems = normalizeReceiptItems(
      orders.flatMap(o => o.items || []).filter(item => !isCancelledOrderItem(item)),
      menuItemMap
    )

    return {
      rawItems: allItems,
      labelOrder: primaryOrder,
      table,
      tableFallback: tableId,
      priceMode: quote.priceMode,
      waiterName: firstNonEmpty(orders, ['opened_by_name', 'waiter_name']),
      completedByName: firstNonEmpty(orders, ['completed_by_name']),
      receiptAt:  primaryOrder?.paid_at || primaryOrder?.created_at,
      subtotal: quote.subtotal,
      serviceFee: quote.serviceFee,
      serviceRate: quote.serviceRatePct,
      loyaltyAmt: quote.loyaltyUsedAmount,
      cashbackEarned: quote.cashbackEarned,
      total: quote.total,
    }
  }, [state.orders, state.tables, state.menuItems, tableId, settings, menuItemMap])

  const [receiptLang, setReceiptLang] = useReceiptLanguage(lang, data?.priceMode)
  const paper = useMemo(() => localizeReceipt(data, menuItemMap, receiptLang), [data, menuItemMap, receiptLang])

  // Orders arrive with the app data: until it has loaded, "no open bill" is not known yet.
  if (!loaded) return <OperationalLoading layout="form" title={t(lang, 'loading')} />

  if (loadError) {
    return (
      <OperationalError
        lang={lang}
        title={screenLabels.loadFailedTitle}
        description={screenLabels.loadFailedHint}
        actionLabel={screenLabels.reload}
        // The app data has no loader a page can call.
        onAction={retryPOSLoad}
      />
    )
  }

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell
      lang={lang}
      receiptLang={receiptLang}
      onReceiptLangChange={setReceiptLang}
      onBack={() => navigate(-1)}
      autoPrint={new URLSearchParams(location.search).get('print') === '1'}
    >
      <ReceiptPaper
        {...paper}
        dateStr={formatDateTime(data.receiptAt)}
        labels={L[receiptLang]}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
        receiptMarketing={settings.receiptMarketing}
      />
    </ReceiptShell>
  )
}

// ── Route: /receipt/:orderId  (legacy) ───────────────────────────────────────

export default function Receipt() {
  const { orderId } = useParams()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { state } = useApp()
  const lang     = state.lang
  const screenLabels = L[lang] || L.en
  const settings = state.settings
  const localOrder = state.orders.find(order => order.id === orderId)
  const [historicalOrders, setHistoricalOrders] = useState([])
  const [lookupState, setLookupState] = useState({ loading: !localOrder, error: '' })
  const [lookupVersion, setLookupVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (localOrder) {
      setHistoricalOrders([])
      setLookupState({ loading: false, error: '' })
      return () => { cancelled = true }
    }

    setLookupState({ loading: true, error: '' })
    loadReceiptOrderGroup(orderId)
      .then(orders => {
        if (cancelled) return
        setHistoricalOrders(orders)
        setLookupState({ loading: false, error: '' })
      })
      .catch(error => {
        if (cancelled) return
        setHistoricalOrders([])
        // Only a code is kept: the message is translated at render, the raw one stays in the console.
        console.error('[receipt] order lookup failed', error)
        setLookupState({ loading: false, error: 'load_failed' })
      })
    return () => { cancelled = true }
  }, [localOrder, lookupVersion, orderId])

  const receiptOrders = localOrder ? state.orders : historicalOrders

  const menuItemMap = useMemo(() => {
    const m = {}
    state.menuItems.forEach(mi => { m[mi.id] = mi })
    return m
  }, [state.menuItems])

  const data = useMemo(() => {
    const order = receiptOrders.find(o => o.id === orderId)
    if (!order) return null

    const isOffPremise = isOffPremiseOrderType(inferOrderType(order))

    // Off-premise bills do not share a table, so the order route must stay
    // one receipt per order. Dine-in table receipts can still merge rounds.
    const allOrders = isOffPremise
      ? [order]
      : order.payment_status === 'paid' && order.paid_at
        ? receiptOrders.filter(
            o => o.table_id === order.table_id &&
                 o.payment_status === 'paid' &&
                 o.paid_at?.slice(0, 16) === order.paid_at.slice(0, 16)
          )
        : (() => {
            const siblings = receiptOrders.filter(
              o => o.table_id === order.table_id && o.payment_status !== 'paid'
            )
            return siblings.length > 0 ? siblings : [order]
          })()

    const quote = order.payment_status === 'paid'
      ? getOrderGroupPaymentQuote({ orders: allOrders, menuItems: state.menuItems, settings })
      : getFreshCashierPaymentQuote({
          orders: allOrders,
          menuItems: state.menuItems,
          settings,
          ...(isOffPremise ? { orderId } : { tableId: order.table_id }),
        })
    if (!quote.primaryOrderId) return null

    const contributingIds = new Set(quote.contributingOrderIds)
    const contributingOrders = allOrders.filter(candidate => contributingIds.has(candidate.id))
    const primaryOrder = contributingOrders.find(candidate => candidate.id === quote.primaryOrderId) || contributingOrders[0]
    const allItems = normalizeReceiptItems(
      contributingOrders.flatMap(o => o.items || []).filter(item => !isCancelledOrderItem(item)),
      menuItemMap
    )
    const table      = state.tables.find(t => t.id === order.table_id)

    return {
      rawItems: allItems,
      labelOrder: primaryOrder,
      table,
      tableFallback: '—',
      priceMode: quote.priceMode,
      waiterName: firstNonEmpty(contributingOrders, ['opened_by_name', 'waiter_name']),
      completedByName: firstNonEmpty(contributingOrders, ['completed_by_name']),
      receiptAt:  order.paid_at || order.created_at,
      subtotal: quote.subtotal,
      serviceFee: quote.serviceFee,
      serviceRate: quote.serviceRatePct,
      loyaltyAmt: quote.loyaltyUsedAmount,
      salaryAmount: allOrders.flatMap(getOrderPaymentBreakdown).filter(row => row.method === 'salary').reduce((sum, row) => sum + row.amount, 0),
      cashbackEarned: quote.cashbackEarned,
      total: quote.total,
    }
  }, [receiptOrders, state.tables, state.menuItems, orderId, settings, menuItemMap])

  const [receiptLang, setReceiptLang] = useReceiptLanguage(lang, data?.priceMode)
  const paper = useMemo(() => localizeReceipt(data, menuItemMap, receiptLang), [data, menuItemMap, receiptLang])

  if (!localOrder && lookupState.loading) {
    return <OperationalLoading layout="form" title={t(lang, 'loading')} />
  }

  if (!localOrder && lookupState.error) {
    return (
      <OperationalError
        lang={lang}
        title={screenLabels.loadFailedTitle}
        description={screenLabels.loadFailedHint}
        actionLabel={screenLabels.retry}
        onAction={() => setLookupVersion(version => version + 1)}
      />
    )
  }

  if (!data) return <NotFound onBack={() => navigate(-1)} />

  return (
    <ReceiptShell
      lang={lang}
      receiptLang={receiptLang}
      onReceiptLangChange={setReceiptLang}
      onBack={() => navigate(-1)}
      autoPrint={new URLSearchParams(location.search).get('print') === '1'}
    >
      <ReceiptPaper
        {...paper}
        dateStr={formatDateTime(data.receiptAt)}
        labels={L[receiptLang]}
        restaurantName={settings.restaurantName}
        receiptFooter={settings.receiptFooter}
        receiptMarketing={settings.receiptMarketing}
      />
    </ReceiptShell>
  )
}

// ── Shell (screen top-bar + background) ──────────────────────────────────────

function ReceiptShell({ lang, receiptLang, onReceiptLangChange, onBack, autoPrint, children }) {
  const navigate = useNavigate()
  const location = useLocation()

  // `print=1` is used up by the one automatic print: Back, a reload or a restored tab then
  // shows the receipt without printing it again.
  const consumeAutoPrint = useCallback(() => {
    navigate(`${location.pathname}${stripPrintParam(location.search)}`, { replace: true })
  }, [location.pathname, location.search, navigate])

  const { busy: printBusy, print } = usePrintOnce({ autoPrint, ready: true, onAutoPrintConsumed: consumeAutoPrint })

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Top bar – hidden during print */}
      <ReceiptTopBar
        lang={lang}
        onBack={onBack}
        onPrint={print}
        printBusy={printBusy}
        receiptLang={receiptLang}
        onReceiptLangChange={onReceiptLangChange}
      />

      {/* Receipt preview background */}
      <div className="receipt-bg min-h-screen bg-gray-100 flex justify-center py-10 px-4">
        <div className="shadow-2xl rounded-2xl overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )
}

function NotFound({ onBack }) {
  const { state } = useApp()
  const lang = state.lang || 'ru'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] p-4">
      <div className="ws-empty">
        <FileQuestion aria-hidden="true" />
        <h3>{t(lang, 'orderNotFound')}</h3>
        <button type="button" onClick={onBack} className="ws-btn ws-btn-outline min-h-11">{t(lang, 'back')}</button>
      </div>
    </div>
  )
}

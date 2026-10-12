import { getActiveWaiterNames } from '../lib/activeOrderWaiters'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  Clock, CheckCircle2, Receipt,
  Search, CreditCard, Settings, CalendarClock, Phone,
  ShoppingBag, Truck, Gamepad2,
} from 'lucide-react'
import { getOrderTotal } from '../lib/analytics'
import { getReservationSummary, getWaiterTableStatus, sortWaiterTableInfosByOpenedTime } from '../lib/tableManagement'
import { clearReservationPatch, getTodaysReservations } from '../lib/tableActivity'
import { formatDateTime, formatElapsedSince, formatTime } from '../lib/dateFormat'
import { earliestReliableTime, getReliableOrderItemTime } from '../lib/orderTimestamps'
import { canEditFeature, canUseOffPremiseOrders } from '../lib/permissions'
import { getActiveTableOrders, getTableGuestEntryContext } from '../lib/tableGuestEntry'
import { getTableZoneName, getTableZoneVisual, groupTableInfosByZone } from '../lib/tableZoneColors'
import { TableGuestEntryDialog } from '../components/GuestModeUI'
import { completeBillHandoff } from '../lib/billHandoff'

// ── Localization ──────────────────────────────────────────────────────────────

const L = {
  en: {
    tables: 'Tables',
    welcome: 'Welcome back',
    all: 'All',
    available: 'Available',
    waitingKitchen: 'Waiting',
    preparing: 'Preparing',
    readyFromKitchen: 'Ready',
    occupied: 'Occupied',
    reserved: 'Reserved',
    needsBill: 'Needs Bill',
    tapToStart: 'Tap to start order',
    reservedFor: 'Reserved for',
    seatReserved: 'Seat guest',
    itemsNew: n => `${n} new`,
    itemsPreparing: n => `${n} preparing`,
    itemsReady: n => `${n} ready`,
    viewOrder: 'View Order',
    manageOrder: 'Manage order',
    requestBill: 'Request Bill',
    tableSingular: 'table',
    tablePlural: 'tables',
    confirmServed: 'Confirm served',
    viewKitchen: 'View orders',
    viewTable: 'View table',
    takePayment: 'Take payment',
    takeAwayOrder: 'Take Away Order',
    deliveryOrder: 'Delivery Order',
    manageTables: 'Manage tables',
    todaysReservations: 'Today’s Reservations',
    zones: 'Zones',
    seat: 'Seat',
    cancelReservation: 'Cancel',
    call: 'Call',
    lessThanMinuteAgo: '< 1 min ago',
    minutesAgo: n => `${n} min ago`,
    hoursMinutesAgo: (h, m) => `${h}h ${m}m ago`,
  },
  ru: {
    tables: 'Столы',
    welcome: 'Добро пожаловать',
    all: 'Все',
    available: 'Свободен',
    waitingKitchen: 'Ожидание',
    preparing: 'Готовится',
    readyFromKitchen: 'Готово',
    occupied: 'Занят',
    reserved: 'Бронь',
    needsBill: 'Счёт',
    tapToStart: 'Нажмите для заказа',
    reservedFor: 'Бронь на',
    seatReserved: 'Посадить гостя',
    itemsNew: n => `${n} новых`,
    itemsPreparing: n => `${n} готовится`,
    itemsReady: n => `${n} готово`,
    viewOrder: 'Посмотреть',
    manageOrder: 'Управлять',
    requestBill: 'Запросить счёт',
    tableSingular: 'стол',
    tablePlural: 'столов',
    confirmServed: 'Подтвердить подачу',
    viewKitchen: 'Заказы',
    viewTable: 'Открыть стол',
    takePayment: 'Оплата',
    takeAwayOrder: 'Заказ с собой',
    deliveryOrder: 'Доставка',
    manageTables: 'Управление столами',
    todaysReservations: 'Брони сегодня',
    zones: 'Зоны',
    seat: 'Посадить',
    cancelReservation: 'Отменить',
    call: 'Позвонить',
    lessThanMinuteAgo: '< 1 мин назад',
    minutesAgo: n => `${n} мин назад`,
    hoursMinutesAgo: (h, m) => `${h}ч ${m}м назад`,
  },
  uz: {
    tables: 'Stollar',
    welcome: 'Xush kelibsiz',
    all: 'Hammasi',
    available: 'Bo\'sh',
    waitingKitchen: 'Kutilmoqda',
    preparing: 'Tayyorlanmoqda',
    readyFromKitchen: 'Tayyor',
    occupied: 'Band',
    reserved: 'Band qilingan',
    needsBill: 'Hisob',
    tapToStart: 'Buyurtma boshlash uchun bosing',
    reservedFor: 'Bron',
    seatReserved: 'Mehmonni joylashtirish',
    itemsNew: n => `${n} yangi`,
    itemsPreparing: n => `${n} tayyorlanmoqda`,
    itemsReady: n => `${n} tayyor`,
    viewOrder: 'Ko\'rish',
    manageOrder: 'Buyurtma',
    requestBill: 'Hisob so\'rash',
    tableSingular: 'stol',
    tablePlural: 'stol',
    confirmServed: 'Yetkazildi',
    viewKitchen: 'Buyurtmalar',
    viewTable: 'Stolni ko‘rish',
    takePayment: 'To‘lov olish',
    takeAwayOrder: 'Olib ketish buyurtmasi',
    deliveryOrder: 'Yetkazib berish',
    manageTables: 'Stollarni boshqarish',
    todaysReservations: 'Bugungi bronlar',
    zones: 'Zonalar',
    seat: 'Joylashtirish',
    cancelReservation: 'Bekor qilish',
    call: 'Qo‘ng‘iroq',
    lessThanMinuteAgo: '< 1 daqiqa oldin',
    minutesAgo: n => `${n} daqiqa oldin`,
    hoursMinutesAgo: (h, m) => `${h} soat ${m} daqiqa oldin`,
  },
}

function tr(lang, key, ...args) {
  const v = (L[lang] || L.en)[key]
  if (typeof v === 'function') return v(...args)
  return v ?? key
}

// ── Status config ─────────────────────────────────────────────────────────────

// Each status keeps its own pill tone and 3px card edge so the floor stays scannable:
// free → positive, kitchen work → accent, food ready → caution, bill → negative,
// reserved → info, eating → neutral.
const STATUS_CFG = {
  available: {
    tone: 'ws-tone-positive',
    edge: 'bg-[#1d7a52]',
    dot: 'bg-[#1d7a52]',
  },
  waiting_kitchen: {
    tone: 'ws-tone-accent',
    edge: 'bg-[#ff5a00]/60',
    dot: 'bg-[#ff5a00]/60',
  },
  preparing: {
    tone: 'ws-tone-accent',
    edge: 'bg-[#ff5a00]',
    dot: 'bg-[#ff5a00]',
  },
  ready: {
    tone: 'ws-tone-caution',
    edge: 'bg-[#9a5a00]',
    dot: 'bg-[#9a5a00]',
  },
  occupied: {
    tone: '',
    edge: 'bg-[#68655f]',
    dot: 'bg-[#68655f]',
  },
  reserved: {
    tone: 'ws-tone-info',
    edge: 'bg-[#2a6fdb]',
    dot: 'bg-[#2a6fdb]',
  },
  needs_bill: {
    tone: 'ws-tone-negative',
    edge: 'bg-[#c4262c]',
    dot: 'bg-[#c4262c]',
  },
}

// ── Status derivation ─────────────────────────────────────────────────────────

function getVisibleActiveOrdersForTable(tableId, orders) {
  return getActiveTableOrders(tableId, orders)
}

function deriveStatus(tableId, orders) {
  const active = getVisibleActiveOrdersForTable(tableId, orders)
  if (active.length === 0) return 'available'

  // delivered = waiter confirmed → occupied (eating)
  if (active.every(o => o.status === 'delivered')) return 'occupied'

  const allItems = active.flatMap(o => o.items || []).filter(i => i.status !== 'cancelled')
  if (allItems.length === 0) return 'waiting_kitchen'

  const statuses = allItems.map(i => i.status || 'new')
  const hasNew = statuses.some(s => s === 'new')
  const hasPreparing = statuses.some(s => s === 'preparing')
  const hasReady = statuses.some(s => s === 'ready')
  const allServed = statuses.every(s => s === 'served')
  const hasWaitingOrder = active.some(o => o.status === 'sent_to_kitchen')

  if (allServed && hasWaitingOrder) return 'waiting_kitchen'
  if (hasWaitingOrder) return 'waiting_kitchen'
  // needs_bill only applies while the bill is still with the cashier.
  if (active.some(o => o.status === 'needs_bill')) return 'needs_bill'
  if (allServed) return 'occupied'
  if (hasReady && !hasNew && !hasPreparing) return 'ready'
  if (hasPreparing) return 'preparing'
  if (hasNew && !hasPreparing && !hasReady) return 'waiting_kitchen'
  if (hasReady || hasPreparing) return 'preparing'

  return 'waiting_kitchen'
}

function deriveStatusForTable(table, orders) {
  const active = getVisibleActiveOrdersForTable(table.id, orders)
  return getWaiterTableStatus(table, active, () => deriveStatus(table.id, orders))
}

function getPreparationCounts(tableId, orders) {
  const active = getVisibleActiveOrdersForTable(tableId, orders)
  const items = active.flatMap(o => o.items || []).filter(i => i.status !== 'cancelled')
  const pendingItemTimes = active.flatMap(o => (o.items || [])
    .filter(i => i.status !== 'cancelled' && i.status !== 'served')
    .map(i => getReliableOrderItemTime(i, o))
    .filter(Boolean)
  )
  const billableItemTimes = active.flatMap(o => (o.items || [])
    .filter(i => i.status !== 'cancelled')
    .map(i => getReliableOrderItemTime(i, o))
    .filter(Boolean)
  )
  const orderTimes = active.map(o => o.created_at).filter(Boolean)
  return {
    waiterNames: getActiveWaiterNames(active),
    newCount: items.filter(i => (i.status || 'new') === 'new').length,
    preparingCount: items.filter(i => i.status === 'preparing').length,
    readyCount: items.filter(i => i.status === 'ready').length,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    total: active.reduce((s, o) => s + getOrderTotal(o), 0),
    createdAt: earliestReliableTime(pendingItemTimes) || earliestReliableTime(billableItemTimes) || earliestReliableTime(orderTimes),
  }
}

function elapsedSince(isoString, lang) {
  return formatElapsedSince(isoString, {
    lessThanMinute: () => tr(lang, 'lessThanMinuteAgo'),
    minutes: diff => tr(lang, 'minutesAgo', diff),
    hoursMinutes: (hours, minutes) => tr(lang, 'hoursMinutesAgo', hours, minutes),
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, cfg, onClick }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}>
      {cfg?.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />}
      {label}
      <span className="ws-count">{count}</span>
    </button>
  )
}

function StatusChip({ label, tone = '' }) {
  return (
    <span className={`ws-badge ${tone}`}>
      {label}
    </span>
  )
}

function tableCountLabel(lang, count) {
  return `${count} ${count === 1 ? tr(lang, 'tableSingular') : tr(lang, 'tablePlural')}`
}

function statusLabel(lang, status) {
  return status === 'available'       ? tr(lang, 'available')        :
         status === 'waiting_kitchen' ? tr(lang, 'waitingKitchen')   :
         status === 'preparing'       ? tr(lang, 'preparing')         :
         status === 'ready'           ? tr(lang, 'readyFromKitchen')  :
         status === 'reserved'        ? tr(lang, 'reserved')          :
         status === 'occupied'        ? tr(lang, 'occupied')          :
                                        tr(lang, 'needsBill')
}

function actionForStatus(lang, status) {
  if (status === 'ready') return { label: tr(lang, 'confirmServed'), Icon: CheckCircle2, cls: 'ws-btn-primary' }
  if (status === 'preparing') return { label: tr(lang, 'viewKitchen'), Icon: Clock, cls: 'ws-btn-outline' }
  if (status === 'waiting_kitchen') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'ws-btn-outline' }
  if (status === 'needs_bill') return { label: tr(lang, 'takePayment'), Icon: CreditCard, cls: 'ws-btn-primary' }
  if (status === 'reserved') return { label: tr(lang, 'seatReserved'), Icon: CalendarClock, cls: 'ws-btn-primary' }
  if (status === 'occupied') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'ws-btn-outline' }
  return null
}

function ItemCountAndTotal({ counts, className = 'mt-2' }) {
  return (
    <div className={`flex w-full items-center justify-between gap-2 ${className}`}>
      <span className="ws-count">×{counts.itemCount}</span>
      <p className="text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(counts.total)}</p>
    </div>
  )
}

function TableCard({ table, zones, status, counts, lang, canEdit, onClick, onAction, onManage }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.available
  const zone = getTableZoneVisual(table, zones)
  const zoneName = getTableZoneName(table)
  // Free tables show their zone colour on the edge; busy tables show their status colour.
  const cardEdge = status === 'available' ? zone.dot : cfg.edge
  const elapsed = counts?.createdAt ? elapsedSince(counts.createdAt, lang) : null
  const action = actionForStatus(lang, status)
  const ActionIcon = action?.Icon
  const reservation = getReservationSummary(table)
  const canManageActiveOrder = ['waiting_kitchen', 'preparing'].includes(status)

  return (
    <div
      onClick={canEdit ? onClick : undefined}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={e => canEdit && e.key === 'Enter' && onClick()}
      className={`ws-panel group relative flex min-h-[116px] w-full flex-col overflow-hidden !py-3 !pl-4 !pr-3 text-left transition-shadow ${canEdit ? 'cursor-pointer hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${cardEdge}`} aria-hidden="true" />
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-semibold leading-tight text-[#22201d]">{table.name}</p>
        {counts?.waiterNames?.length > 0 && (
          <p className="ws-caption min-w-0 max-w-[55%] break-words text-right !text-xs !leading-4">
            {lang === 'ru' ? 'Официант' : lang === 'uz' ? 'Ofitsiant' : 'Waiter'}: {counts.waiterNames.join(', ')}
          </p>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={`ws-status ${cfg.tone}`}>{statusLabel(lang, status)}</span>
        <span className="ws-badge min-w-0">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${zone.dot}`} aria-hidden="true" />
          <span className="truncate">{zoneName}</span>
        </span>
        {elapsed && status !== 'available' && (
          <p className="ws-caption ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap !text-xs tabular-nums">
            <Clock size={11} className="shrink-0" />
            {elapsed}
          </p>
        )}
      </div>

      {/* State-specific content */}
      {status === 'available' && (
        <p className="ws-caption mt-auto !text-xs">{tr(lang, 'tapToStart')}</p>
      )}

      {status === 'reserved' && reservation && (
        <div className="mt-1 space-y-1">
          <p className="text-sm font-semibold text-[#22201d]">{tr(lang, 'reservedFor')}: {reservation.name || '-'}</p>
          {reservation.startsAt && (
            <p className="ws-caption flex items-center gap-1 tabular-nums">
              <Clock size={12} />
              {formatDateTime(reservation.startsAt)}
            </p>
          )}
          {reservation.phone && (
            <p className="ws-caption flex items-center gap-1 tabular-nums">
              <Phone size={12} />
              {reservation.phone}
            </p>
          )}
        </div>
      )}

      {(status === 'waiting_kitchen') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} />
          )}
          <ItemCountAndTotal counts={counts} />
        </div>
      )}

      {(status === 'preparing') && (
        <div className="flex flex-wrap gap-1 mt-1">
          {counts.newCount > 0 && (
            <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} />
          )}
          {counts.preparingCount > 0 && (
            <StatusChip label={tr(lang, 'itemsPreparing', counts.preparingCount)} tone="ws-tone-accent" />
          )}
          {counts.readyCount > 0 && (
            <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} tone="ws-tone-caution" />
          )}
          <ItemCountAndTotal counts={counts} />
        </div>
      )}

      {status === 'ready' && (
        <div className="mt-1">
          {counts.readyCount > 0 && (
            <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} tone="ws-tone-caution" />
          )}
          <ItemCountAndTotal counts={counts} />
        </div>
      )}

      {status === 'occupied' && (
        <ItemCountAndTotal counts={counts} className="mt-auto" />
      )}

      {status === 'needs_bill' && (
        <ItemCountAndTotal counts={counts} className="mt-auto" />
      )}

      {canEdit && (action || canManageActiveOrder) && (
        <div className="mt-auto grid grid-cols-1 gap-2 pt-4">
          {canManageActiveOrder && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onManage?.(table)
              }}
              className="ws-btn ws-btn-outline !h-11 w-full !px-3"
            >
              <Search size={15} />
              {tr(lang, 'manageOrder')}
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onAction?.(status, table)
              }}
              className={`ws-btn !h-11 w-full !px-3 ${action.cls}`}
            >
              <ActionIcon size={15} />
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ReservationStrip({ reservations, lang, canEdit, onSeat, onCancel, onCall }) {
  if (reservations.length === 0) {
    return null
  }

  return (
    <section className="ws-panel">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="ws-heading">{tr(lang, 'todaysReservations')}</h2>
        <span className="ws-count">{tableCountLabel(lang, reservations.length)}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {reservations.map(({ table, reservation }) => (
          <div key={table.id} className="relative min-w-[260px] overflow-hidden rounded-[12px] border border-[#e4e1de] bg-white py-3 pl-4 pr-3">
            <span className="absolute inset-y-0 left-0 w-[3px] bg-[#2a6fdb]" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#22201d]">{table.name}</p>
                <p className="ws-caption truncate">{reservation.name || '-'}</p>
              </div>
              <span className="ws-status ws-tone-info tabular-nums">
                {formatTime(reservation.startsAt)}
              </span>
            </div>
            <div className={`mt-3 grid gap-1.5 ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
              {canEdit && (
                <>
                  <button type="button" onClick={() => onSeat(table)} className="ws-btn ws-btn-primary ws-btn-sm !px-2">
                    {tr(lang, 'seat')}
                  </button>
                  <button type="button" onClick={() => onCancel(table)} className="ws-btn ws-btn-outline ws-btn-sm !px-2">
                    {tr(lang, 'cancelReservation')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onCall(reservation.phone)}
                disabled={!reservation.phone}
                className="ws-btn ws-btn-outline ws-btn-sm !px-2"
              >
                <Phone size={12} />
                {tr(lang, 'call')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_ORDER = ['all', 'available', 'reserved', 'waiting_kitchen', 'preparing', 'ready', 'needs_bill', 'occupied']
const SECTION_ORDER = ['ready', 'preparing', 'waiting_kitchen', 'needs_bill', 'reserved', 'occupied', 'available']

export default function WaiterTables() {
  const { state, dispatch, refreshPOSData } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const [activeFilter, setActiveFilter] = useState('all')
  const [pendingGuestTable, setPendingGuestTable] = useState(null)
  const [pendingGuestPriceMode, setPendingGuestPriceMode] = useState('')
  const [guestEntryBusy, setGuestEntryBusy] = useState(false)
  const [guestEntryError, setGuestEntryError] = useState('')
  const guestEntryRequestRef = useRef(false)

  useEffect(() => {
    refreshPOSData()

    function handlePageShow(event) {
      if (event.persisted) refreshPOSData()
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [refreshPOSData])

  const role = (profile?.role || state.user?.role || '').toLowerCase()
  const canEditTables = canEditFeature(profile || { role }, 'tables')
  const canCreateOffPremiseOrders = canUseOffPremiseOrders(profile || { role })
  const canManageTables = canEditFeature(profile || { role }, 'settings')

  const tableInfos = useMemo(() =>
    state.tables
      .filter(table => table.is_active !== false)
      .sort((a, b) =>
        (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
        String(a.name || '').localeCompare(String(b.name || ''))
      )
      .map(table => {
        const status = deriveStatusForTable(table, state.orders)
        const active = getVisibleActiveOrdersForTable(table.id, state.orders)
        const counts = active.length > 0 ? getPreparationCounts(table.id, state.orders) : null
        return { table, status, counts }
      }),
    [state.tables, state.orders]
  )

  const visibleZones = useMemo(() => {
    const zones = (state.tableZones || []).filter(zone => zone.is_active !== false)
    tableInfos.forEach(({ table }) => {
      const tableZoneId = String(table.zone_id || '').toLowerCase()
      const tableZoneName = getTableZoneName(table).toLowerCase()
      const alreadyKnown = zones.some(zone =>
        (tableZoneId && String(zone.id || '').toLowerCase() === tableZoneId) ||
        String(zone.name || '').toLowerCase() === tableZoneName
      )
      if (!alreadyKnown) {
        zones.push({
          id: table.zone_id || tableZoneName,
          name: getTableZoneName(table),
          sort_order: 999,
        })
      }
    })
    return zones.sort((a, b) =>
      (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    )
  }, [state.tableZones, tableInfos])

  const countsPerStatus = useMemo(() => {
    const c = { all: tableInfos.length }
    tableInfos.forEach(({ status }) => { c[status] = (c[status] || 0) + 1 })
    return c
  }, [tableInfos])

  const filtered = useMemo(() => {
    return tableInfos.filter(({ status }) => {
      const matchStatus = activeFilter === 'all' || status === activeFilter
      return matchStatus
    })
  }, [tableInfos, activeFilter])

  const sections = useMemo(() =>
    SECTION_ORDER
      .map(status => ({
        status,
        items: sortWaiterTableInfosByOpenedTime(
          filtered.filter(info => info.status === status),
          status
        ),
      }))
      .filter(section => section.items.length > 0),
    [filtered]
  )

  const todaysReservations = useMemo(() =>
    getTodaysReservations(state.tables.filter(table => table.is_active !== false), new Date()),
    [state.tables]
  )

  function handleTable(table) {
    if (!canEditTables) return
    const entryContext = getTableGuestEntryContext(table.id, state.orders)
    if (entryContext.hasConflictingPriceModes) {
      setGuestEntryError(lang === 'uz'
        ? 'Bu stolda turli narx turlaridagi faol buyurtmalar bor. Avval buyurtmani xodim sifatida tekshiring.'
        : lang === 'ru'
          ? 'На этом столе есть активные заказы с разными типами цен. Сначала проверьте заказ как сотрудник.'
          : 'This table has active orders with different pricing types. Review the order as staff first.')
      setPendingGuestTable({ table, entryContext })
      setPendingGuestPriceMode('')
      return
    }
    setPendingGuestTable({ table, entryContext })
    setPendingGuestPriceMode(entryContext.priceModeLocked ? entryContext.priceMode : '')
    setGuestEntryError('')
  }

  function closeGuestEntry() {
    if (guestEntryBusy) return
    setPendingGuestTable(null)
    setPendingGuestPriceMode('')
    setGuestEntryError('')
  }

  async function openTable() {
    if (!canEditTables || !pendingGuestTable || guestEntryBusy || guestEntryRequestRef.current) return
    const { table } = pendingGuestTable
    const latestContext = getTableGuestEntryContext(table.id, state.orders)
    if (latestContext.hasConflictingPriceModes) {
      setGuestEntryError(lang === 'uz'
        ? 'Stol buyurtmasi o‘zgardi. Uni xodim sifatida tekshiring.'
        : lang === 'ru'
          ? 'Заказ стола изменился. Проверьте его как сотрудник.'
          : 'The table order changed. Review it as staff.')
      return
    }
    const entryChanged = latestContext.activeOrderIds.join('|') !== pendingGuestTable.entryContext.activeOrderIds.join('|') ||
      latestContext.priceModeLocked !== pendingGuestTable.entryContext.priceModeLocked ||
      latestContext.priceMode !== pendingGuestTable.entryContext.priceMode
    if (entryChanged) {
      setPendingGuestTable({ table, entryContext: latestContext })
      setPendingGuestPriceMode(latestContext.priceModeLocked ? latestContext.priceMode : pendingGuestPriceMode)
      setGuestEntryError(lang === 'uz'
        ? 'Bu stol boshqa qurilmada o‘zgardi. Yangilangan narx turini tekshirib, yana tasdiqlang.'
        : lang === 'ru'
          ? 'Этот стол изменился на другом устройстве. Проверьте обновлённый тип цен и подтвердите ещё раз.'
          : 'This table changed on another device. Review the updated pricing type and confirm again.')
      return
    }
    const selectedPriceMode = latestContext.priceModeLocked ? latestContext.priceMode : pendingGuestPriceMode
    if (!selectedPriceMode) return

    guestEntryRequestRef.current = true
    setGuestEntryBusy(true)
    setGuestEntryError('')
    try {
      if (table.status === 'reserved') {
        const reservationResult = await dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
        if (reservationResult?.error) throw reservationResult.error
      }
      dispatch({ type: 'SET_TABLE', payload: table.id })
      dispatch({ type: 'CLEAR_CART' })
      // Price mode travels in history state, not the URL, so guests never see it in the address bar.
      navigate(`/waiter/order/${encodeURIComponent(table.id)}`, { state: { priceMode: selectedPriceMode } })
    } catch {
      setGuestEntryError(lang === 'uz'
        ? 'Stolni ochib bo‘lmadi. Qayta urinib ko‘ring.'
        : lang === 'ru'
          ? 'Не удалось открыть стол. Попробуйте снова.'
          : 'The table could not be opened. Please try again.')
    } finally {
      guestEntryRequestRef.current = false
      setGuestEntryBusy(false)
    }
  }

  function handleManageOrder(table) {
    if (!canEditTables) return
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}?panel=order`)
  }

  async function moveTableToCashier(table) {
    const autoPrint = !!state.settings?.autoPrint
    const result = await dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: table.id })
    if (result?.error) return
    completeBillHandoff({ navigate, tableId: table.id, autoPrint })
  }

  function handleCardAction(status, table) {
    if (!canEditTables) return
    if (status === 'ready') {
      dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: table.id })
      return
    }
    if (status === 'preparing') return
    if (status === 'needs_bill') {
      navigate(`/cashier/bill/${table.id}`)
      return
    }
    if (status === 'waiting_kitchen') {
      moveTableToCashier(table)
      return
    }
    if (status === 'occupied') {
      moveTableToCashier(table)
      return
    }
    if (status === 'reserved') {
      handleTable(table)
      return
    }
    handleTable(table)
  }

  function seatReservation(table) {
    if (!canEditTables) return
    handleTable(table)
  }

  function cancelReservation(table) {
    if (!canEditTables) return
    dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
  }

  function callReservation(phone) {
    if (!phone) return
    window.location.href = `tel:${phone}`
  }

  function handleTakeAway() {
    if (!canCreateOffPremiseOrders) return
    dispatch({ type: 'SET_TABLE', payload: null })
    dispatch({ type: 'CLEAR_CART' })
    navigate('/waiter/take-away')
  }

  function handleDelivery() {
    if (!canCreateOffPremiseOrders) return
    dispatch({ type: 'SET_TABLE', payload: null })
    dispatch({ type: 'CLEAR_CART' })
    navigate('/waiter/take-away?orderType=delivery')
  }

  // Header buttons stay 38px on desktop and grow to a 44px target on touch screens.
  const headerButton = 'ws-btn ws-btn-sm !h-[38px] [@media(pointer:coarse)]:!h-11 [@media(pointer:coarse)]:min-w-[44px]'

  const headerActions = (canCreateOffPremiseOrders || canManageTables) ? (
    <>
      {canCreateOffPremiseOrders && (
        <>
          <button
            type="button"
            onClick={handleTakeAway}
            aria-label={tr(lang, 'takeAwayOrder')}
            title={tr(lang, 'takeAwayOrder')}
            className={`${headerButton} ws-btn-primary`}
          >
            <ShoppingBag />
            <span className="hidden md:inline">{tr(lang, 'takeAwayOrder')}</span>
          </button>
          <button
            type="button"
            onClick={handleDelivery}
            aria-label={tr(lang, 'deliveryOrder')}
            title={tr(lang, 'deliveryOrder')}
            className={`${headerButton} ws-btn-outline`}
          >
            <Truck />
            <span className="hidden md:inline">{tr(lang, 'deliveryOrder')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/waiter/take-away?orderType=game_club')}
            aria-label="Game Club"
            title="Game Club"
            className={`${headerButton} ws-btn-outline`}
          >
            <Gamepad2 />
            <span className="hidden md:inline">Game Club</span>
          </button>
        </>
      )}
      {canManageTables && (
        <button
          type="button"
          onClick={() => navigate('/admin/tables')}
          aria-label={tr(lang, 'manageTables')}
          title={tr(lang, 'manageTables')}
          className={`${headerButton} ws-btn-outline`}
        >
          <Settings />
          <span className="hidden 2xl:inline">{tr(lang, 'manageTables')}</span>
        </button>
      )}
    </>
  ) : null

  return (
    <AppShell title={tr(lang, 'tables')} headerActions={headerActions}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">

          <ReservationStrip
            reservations={todaysReservations}
            lang={lang}
            canEdit={canEditTables}
            onSeat={seatReservation}
            onCancel={cancelReservation}
            onCall={callReservation}
          />

          {/* Status filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={tr(lang, 'tables')}
              className="ws-segmented [@media(pointer:coarse)]:[&>button]:!h-11"
            >
              <FilterChip
                label={tr(lang, 'all')}
                count={countsPerStatus.all}
                active={activeFilter === 'all'}
                onClick={() => setActiveFilter('all')}
              />
              {FILTER_ORDER.filter(s => s !== 'all').map(status => {
                const cnt = countsPerStatus[status] || 0
                const cfg = STATUS_CFG[status]
                return (
                  <FilterChip
                    key={status}
                    label={statusLabel(lang, status)}
                    count={cnt}
                    active={activeFilter === status}
                    cfg={cfg}
                    onClick={() => setActiveFilter(status)}
                  />
                )
              })}
            </div>
          </div>

          {/* Zone color legend */}
          {visibleZones.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <span className="ws-caption shrink-0">{tr(lang, 'zones')}</span>
              {visibleZones.map(zoneItem => {
                const zone = getTableZoneVisual(zoneItem, visibleZones)
                return (
                  <span key={zoneItem.id || zoneItem.name} className="ws-badge shrink-0 !bg-white">
                    <span className={`h-2 w-2 rounded-full ${zone.dot}`} aria-hidden="true" />
                    {zoneItem.name}
                  </span>
                )
              })}
            </div>
          )}

          {/* Status sections */}
          <div className="space-y-8">
            {sections.map(({ status, items }) => {
              const cfg = STATUS_CFG[status]
              const availableZoneGroups = status === 'available'
                ? groupTableInfosByZone(items, visibleZones)
                : []
              return (
                <section key={status} className="border-t border-[#e4e1de] pt-5 first:border-t-0 first:pt-0">
                  <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2.5 bg-[#f6f5f3]/95 px-1 py-2 backdrop-blur">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />
                    <h3 className="ws-heading min-w-0 truncate">{statusLabel(lang, status)}</h3>
                    <span className="ws-count">{tableCountLabel(lang, items.length)}</span>
                  </div>
                  {status === 'available' ? (
                    <div className="space-y-6">
                      {availableZoneGroups.map(({ zone: zoneItem, items: zoneItems }) => {
                        const zone = getTableZoneVisual(zoneItem, visibleZones)
                        return (
                          <div key={zoneItem.id || zoneItem.name}>
                            <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${zone.dot}`} aria-hidden="true" />
                                <h4 className="truncate text-[15px] font-semibold text-[#22201d]">{zoneItem.name}</h4>
                              </div>
                              <span className="ws-caption shrink-0">{tableCountLabel(lang, zoneItems.length)}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                              {zoneItems.map(({ table, status: itemStatus, counts }) => (
                                <TableCard
                                  key={table.id}
                                  table={table}
                                  zones={visibleZones}
                                  status={itemStatus}
                                  counts={counts}
                                  lang={lang}
                                  canEdit={canEditTables}
                                  onClick={() => handleTable(table)}
                                  onAction={handleCardAction}
                                  onManage={handleManageOrder}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
                      {items.map(({ table, status: itemStatus, counts }) => (
                        <TableCard
                          key={table.id}
                          table={table}
                          zones={visibleZones}
                          status={itemStatus}
                          counts={counts}
                          lang={lang}
                          canEdit={canEditTables}
                          onClick={() => handleTable(table)}
                          onAction={handleCardAction}
                          onManage={handleManageOrder}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}

            {sections.length === 0 && (
              <div className="ws-panel ws-panel-flush">
                <div className="ws-empty">
                  <Search />
                  <h3>
                    {lang === 'uz' ? 'Stol topilmadi' : lang === 'ru' ? 'Стол не найден' : 'No tables found'}
                  </h3>
                </div>
              </div>
            )}
          </div>

          {pendingGuestTable && (
            <TableGuestEntryDialog
              tableName={pendingGuestTable.table.name || pendingGuestTable.table.label}
              lang={lang}
              priceMode={pendingGuestPriceMode}
              onPriceModeChange={setPendingGuestPriceMode}
              priceModeLocked={pendingGuestTable.entryContext.priceModeLocked}
              busy={guestEntryBusy}
              error={guestEntryError}
              onCancel={closeGuestEntry}
              onSubmit={openTable}
            />
          )}
        </div>
      </div>
    </AppShell>
  )
}

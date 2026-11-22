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
  ShoppingBag, Truck, Gamepad2, Plus, Users, Loader2,
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
import { PRICE_MODE_REGULAR } from '../lib/priceModes'
import { completeBillHandoff } from '../lib/billHandoff'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { useAppDataStatus } from '../store/appHooks'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { STATUS_TONE } from '../components/StatusBadge'

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
    needsBill: 'Needs bill',
    tapToStart: 'Tap to start order',
    reservedFor: 'Reserved for',
    seatReserved: 'Seat guest',
    itemsNew: n => `${n} new`,
    itemsPreparing: n => `${n} preparing`,
    itemsReady: n => `${n} ready`,
    viewOrder: 'View order',
    manageOrder: 'Manage order',
    requestBill: 'Request bill',
    tableSingular: 'table',
    tablePlural: 'tables',
    confirmServed: 'Confirm served',
    viewTable: 'View table',
    takePayment: 'Take payment',
    takeAwayOrder: 'Take-away order',
    deliveryOrder: 'Delivery order',
    manageTables: 'Manage tables',
    todaysReservations: 'Today’s reservations',
    seat: 'Seat',
    cancelReservation: 'Cancel',
    call: 'Call',
    lessThanMinuteAgo: '< 1 min ago',
    minutesAgo: n => `${n} min ago`,
    hoursMinutesAgo: (h, m) => `${h}h ${m}m ago`,
    cancelReservationQuestion: 'Cancel this reservation?',
    cancelReservationConfirm: 'Cancel reservation',
    keepReservation: 'Keep',
    cancelReservationFailed: 'The reservation was not cancelled. Try again.',
    actionFailed: 'That did not go through. Try again.',
    waiter: 'Waiter',
    noTablesFound: 'No tables found',
    noTablesInFilter: 'No table has this status right now.',
    noTablesYet: 'There are no active tables yet.',
    showAllTables: 'Show all tables',
    loadingTables: 'Loading tables',
    loadFailedTitle: 'Could not load the tables',
    reload: 'Reload',
    statusFilter: 'Filter tables by status',
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
    viewTable: 'Открыть стол',
    takePayment: 'Оплата',
    takeAwayOrder: 'Заказ с собой',
    deliveryOrder: 'Доставка',
    manageTables: 'Управление столами',
    todaysReservations: 'Брони сегодня',
    seat: 'Посадить',
    cancelReservation: 'Отменить',
    call: 'Позвонить',
    lessThanMinuteAgo: '< 1 мин назад',
    minutesAgo: n => `${n} мин назад`,
    hoursMinutesAgo: (h, m) => `${h}ч ${m}м назад`,
    cancelReservationQuestion: 'Отменить эту бронь?',
    cancelReservationConfirm: 'Отменить бронь',
    keepReservation: 'Оставить',
    cancelReservationFailed: 'Бронь не отменена. Попробуйте ещё раз.',
    actionFailed: 'Не получилось. Попробуйте ещё раз.',
    waiter: 'Официант',
    noTablesFound: 'Стол не найден',
    noTablesInFilter: 'Сейчас нет столов с этим статусом.',
    noTablesYet: 'Активных столов пока нет.',
    showAllTables: 'Показать все столы',
    loadingTables: 'Загрузка столов',
    loadFailedTitle: 'Не удалось загрузить столы',
    reload: 'Перезагрузить',
    statusFilter: 'Фильтр столов по статусу',
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
    viewTable: 'Stolni ko‘rish',
    takePayment: 'To‘lov olish',
    takeAwayOrder: 'Olib ketish buyurtmasi',
    deliveryOrder: 'Yetkazib berish',
    manageTables: 'Stollarni boshqarish',
    todaysReservations: 'Bugungi bronlar',
    seat: 'Joylashtirish',
    cancelReservation: 'Bekor qilish',
    call: 'Qo‘ng‘iroq',
    lessThanMinuteAgo: '< 1 daqiqa oldin',
    minutesAgo: n => `${n} daqiqa oldin`,
    hoursMinutesAgo: (h, m) => `${h} soat ${m} daqiqa oldin`,
    cancelReservationQuestion: 'Bu bron bekor qilinsinmi?',
    cancelReservationConfirm: 'Bronni bekor qilish',
    keepReservation: 'Qoldirish',
    cancelReservationFailed: 'Bron bekor qilinmadi. Qayta urinib ko‘ring.',
    actionFailed: 'Bajarilmadi. Qayta urinib ko‘ring.',
    waiter: 'Ofitsiant',
    noTablesFound: 'Stol topilmadi',
    noTablesInFilter: 'Hozir bu holatdagi stol yo‘q.',
    noTablesYet: 'Hozircha faol stollar yo‘q.',
    showAllTables: 'Barcha stollarni ko‘rsatish',
    loadingTables: 'Stollar yuklanmoqda',
    loadFailedTitle: 'Stollarni yuklab bo‘lmadi',
    reload: 'Qayta yuklash',
    statusFilter: 'Stollarni holat bo‘yicha saralash',
  },
}

function tr(lang, key, ...args) {
  const v = (L[lang] || L.en)[key]
  if (typeof v === 'function') return v(...args)
  return v ?? key
}

// ── Status config ─────────────────────────────────────────────────────────────

// One status, one tone on every screen: the tone comes from STATUS_TONE (StatusBadge.jsx).
// Statuses that exist only on this floor view add theirs here: a reserved table is information,
// and a table whose kitchen is working is "preparing" for both waiting and cooking.
const FLOOR_STATUS_TONE = { ...STATUS_TONE, reserved: 'info' }

// The pill class plus the 3px card edge and the dot, all from the same tone tokens (theme-aware).
const TONE_STYLE = {
  positive: { tone: 'ws-tone-positive', edge: 'bg-[var(--ws-positive)]', dot: 'bg-[var(--ws-positive)]' },
  accent: { tone: 'ws-tone-accent', edge: 'bg-[var(--ws-primary)]', dot: 'bg-[var(--ws-primary)]' },
  caution: { tone: 'ws-tone-caution', edge: 'bg-[var(--ws-caution)]', dot: 'bg-[var(--ws-caution)]' },
  negative: { tone: 'ws-tone-negative', edge: 'bg-[var(--ws-negative)]', dot: 'bg-[var(--ws-negative)]' },
  info: { tone: 'ws-tone-info', edge: 'bg-[var(--ws-info)]', dot: 'bg-[var(--ws-info)]' },
  neutral: { tone: '', edge: 'bg-[var(--ws-muted-foreground)]', dot: 'bg-[var(--ws-muted-foreground)]' },
}

function statusConfig(status) {
  return TONE_STYLE[FLOOR_STATUS_TONE[status]] || TONE_STYLE.neutral
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

function getPreparationCounts(tableId, orders, settings) {
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
    // An order without a stored rate uses the configured one, as the cashier tiles do.
    total: active.reduce((s, o) => s + getOrderTotal(o, getConfiguredServiceRatePct(settings, o.price_mode)), 0),
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
      {/* An empty status stays readable: only its decorative dot is dimmed, never the text. */}
      {cfg?.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot} ${!active && count === 0 ? 'opacity-40' : ''}`} aria-hidden="true" />}
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
  if (status === 'waiting_kitchen') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'ws-btn-outline' }
  if (status === 'needs_bill') return { label: tr(lang, 'takePayment'), Icon: CreditCard, cls: 'ws-btn-primary' }
  if (status === 'reserved') return { label: tr(lang, 'seatReserved'), Icon: CalendarClock, cls: 'ws-btn-primary' }
  if (status === 'occupied') return { label: tr(lang, 'requestBill'), Icon: Receipt, cls: 'ws-btn-outline' }
  return null
}

function ItemCountAndTotal({ counts, className = 'mt-2' }) {
  return (
    <span className={`flex w-full items-center justify-between gap-2 ${className}`}>
      <span className="ws-count">×{counts.itemCount}</span>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(counts.total)}</span>
    </span>
  )
}

function TableCard({ table, zones, status, counts, lang, canEdit, busy = false, failed = false, onClick, onAction, onManage }) {
  const cfg = statusConfig(status)
  const zone = getTableZoneVisual(table, zones)
  const zoneName = getTableZoneName(table)
  // Free tables show their zone colour on the edge; busy tables show their status colour.
  const cardEdge = status === 'available' ? zone.dot : cfg.edge
  const elapsed = counts?.createdAt ? elapsedSince(counts.createdAt, lang) : null
  const action = actionForStatus(lang, status)
  const ActionIcon = action?.Icon
  const reservation = getReservationSummary(table)
  const canManageActiveOrder = ['waiting_kitchen', 'preparing'].includes(status)
  const capacity = Number(table.capacity) || 0

  // Free tables sit under their zone heading, so a compact tile is enough:
  // the name, seat count and a start affordance, with the zone on the edge.
  if (status === 'available') {
    const Tile = canEdit ? 'button' : 'div'
    return (
      <Tile
        {...(canEdit ? { type: 'button', onClick, 'aria-label': `${table.name} — ${tr(lang, 'tapToStart')}` } : {})}
        className={`ws-panel group relative flex min-h-[64px] w-full items-center gap-2 overflow-hidden !py-2.5 !pl-4 !pr-2.5 text-left transition-[box-shadow,border-color] ${canEdit ? 'cursor-pointer hover:border-[#ff5a00]/40 hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40' : ''}`}
      >
        <span className={`absolute inset-y-0 left-0 w-[3px] ${cardEdge}`} aria-hidden="true" />
        <span className="block min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight text-[#22201d]">{table.name}</span>
          {capacity > 0 && (
            <span className="ws-caption mt-1 flex items-center gap-1 !text-xs tabular-nums">
              <Users size={12} className="shrink-0" aria-hidden="true" />
              {capacity}
            </span>
          )}
        </span>
        {canEdit && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1d7a52]/10 text-[#1d7a52] transition-colors group-hover:bg-[#cc4800] group-hover:text-white" aria-hidden="true">
            <Plus size={16} />
          </span>
        )}
      </Tile>
    )
  }

  // The card is a plain container: the summary is one real button and the actions are its
  // siblings, so no button is nested inside another and each is reachable by keyboard.
  const Summary = canEdit ? 'button' : 'div'
  return (
    <div className="ws-panel relative flex min-h-[116px] w-full flex-col overflow-hidden !p-0 text-left transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)]">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${cardEdge}`} aria-hidden="true" />
      <Summary
        {...(canEdit ? { type: 'button', onClick } : {})}
        className={`flex w-full flex-1 flex-col py-3 pl-4 pr-3 text-left ${canEdit ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a00]/40' : ''}`}
      >
        {/* Header */}
        <span className="mb-2 flex w-full items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[15px] font-semibold leading-tight text-[#22201d]">{table.name}</span>
          {counts?.waiterNames?.length > 0 && (
            <span className="ws-caption min-w-0 max-w-[55%] break-words text-right !text-xs !leading-4">
              {tr(lang, 'waiter')}: {counts.waiterNames.join(', ')}
            </span>
          )}
        </span>

        {/* The status is already the section heading and the card edge colour. */}
        <span className="mb-2 flex w-full flex-wrap items-center gap-1.5">
          <span className="ws-badge min-w-0">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${zone.dot}`} aria-hidden="true" />
            <span className="truncate">{zoneName}</span>
          </span>
          {elapsed && (
            <span className="ws-caption ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap !text-xs tabular-nums">
              <Clock size={12} className="shrink-0" aria-hidden="true" />
              {elapsed}
            </span>
          )}
        </span>

        {/* State-specific content */}
        {status === 'reserved' && reservation && (
          <span className="mt-1 block space-y-1">
            <span className="block text-sm font-semibold text-[#22201d]">{tr(lang, 'reservedFor')}: {reservation.name || '-'}</span>
            {reservation.startsAt && (
              <span className="ws-caption flex items-center gap-1 tabular-nums">
                <Clock size={12} aria-hidden="true" />
                {formatDateTime(reservation.startsAt)}
              </span>
            )}
            {reservation.phone && (
              <span className="ws-caption flex items-center gap-1 tabular-nums">
                <Phone size={12} aria-hidden="true" />
                {reservation.phone}
              </span>
            )}
          </span>
        )}

        {(status === 'waiting_kitchen') && (
          <span className="mt-1 flex w-full flex-wrap gap-1">
            {counts.newCount > 0 && (
              <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} />
            )}
            <ItemCountAndTotal counts={counts} />
          </span>
        )}

        {(status === 'preparing') && (
          <span className="mt-1 flex w-full flex-wrap gap-1">
            {counts.newCount > 0 && (
              <StatusChip label={tr(lang, 'itemsNew', counts.newCount)} />
            )}
            {counts.preparingCount > 0 && (
              <StatusChip label={tr(lang, 'itemsPreparing', counts.preparingCount)} tone={statusConfig('preparing').tone} />
            )}
            {counts.readyCount > 0 && (
              <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} tone={statusConfig('ready').tone} />
            )}
            <ItemCountAndTotal counts={counts} />
          </span>
        )}

        {status === 'ready' && (
          <span className="mt-1 block w-full">
            {counts.readyCount > 0 && (
              <StatusChip label={tr(lang, 'itemsReady', counts.readyCount)} tone={statusConfig('ready').tone} />
            )}
            <ItemCountAndTotal counts={counts} />
          </span>
        )}

        {status === 'occupied' && (
          <ItemCountAndTotal counts={counts} className="mt-auto" />
        )}

        {status === 'needs_bill' && (
          <ItemCountAndTotal counts={counts} className="mt-auto" />
        )}
      </Summary>

      {canEdit && (action || canManageActiveOrder) && (
        <div className="grid grid-cols-1 gap-2 pb-3 pl-4 pr-3 pt-1">
          {canManageActiveOrder && (
            <button
              type="button"
              onClick={() => onManage?.(table)}
              disabled={busy}
              className="ws-btn ws-btn-outline !h-11 w-full !px-3"
            >
              <Search size={15} aria-hidden="true" />
              {tr(lang, 'manageOrder')}
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={() => onAction?.(status, table)}
              disabled={busy}
              aria-busy={busy || undefined}
              className={`ws-btn !h-11 w-full !px-3 ${action.cls}`}
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ActionIcon size={15} aria-hidden="true" />}
              {action.label}
            </button>
          )}
          {failed && (
            <p role="alert" className="text-xs font-medium text-[#c4262c]">{tr(lang, 'actionFailed')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ReservationStrip({ reservations, lang, canEdit, busyTableId, failedTableId, onSeat, onCancel, onCall }) {
  // Cancelling a booking is a two-step choice made inside its own card.
  const [confirmingId, setConfirmingId] = useState(null)

  if (reservations.length === 0) {
    return null
  }

  return (
    <section className="ws-panel">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="ws-heading">{tr(lang, 'todaysReservations')}</h2>
        <span className="ws-count">{tableCountLabel(lang, reservations.length)}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {reservations.map(({ table, reservation }) => {
          const busy = busyTableId === table.id
          const confirming = confirmingId === table.id
          return (
            <div key={table.id} className="relative w-[min(300px,82vw)] shrink-0 overflow-hidden rounded-[12px] border border-[#e4e1de] bg-white py-3 pl-4 pr-3">
              <span className={`absolute inset-y-0 left-0 w-[3px] ${statusConfig('reserved').edge}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[#22201d]">{table.name}</p>
                  <p className="ws-caption truncate">{reservation.name || '-'}</p>
                </div>
                <span className={`ws-status tabular-nums ${statusConfig('reserved').tone}`}>
                  {formatTime(reservation.startsAt)}
                </span>
              </div>
              {confirming ? (
                <div className="mt-3" role="group" aria-label={tr(lang, 'cancelReservationQuestion')}>
                  <p className="text-sm font-medium text-[#22201d]">{tr(lang, 'cancelReservationQuestion')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busy}
                      className="ws-btn ws-btn-outline ws-btn-sm min-w-0 flex-1 basis-[6rem] !px-2"
                    >
                      {tr(lang, 'keepReservation')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const cancelled = await onCancel(table)
                        if (cancelled) setConfirmingId(null)
                      }}
                      disabled={busy}
                      aria-busy={busy || undefined}
                      className="ws-btn ws-btn-danger-solid ws-btn-sm min-w-0 flex-1 basis-[9rem] !px-2"
                    >
                      {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {tr(lang, 'cancelReservationConfirm')}
                    </button>
                  </div>
                </div>
              ) : (
                // Buttons wrap instead of clipping their Russian and Uzbek labels.
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit && (
                    <button type="button" onClick={() => onSeat(table)} disabled={busy} className="ws-btn ws-btn-primary ws-btn-sm min-w-0 flex-1 basis-[7rem] !px-2">
                      {tr(lang, 'seat')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onCall(reservation.phone)}
                    disabled={!reservation.phone}
                    className="ws-btn ws-btn-outline ws-btn-sm min-w-0 flex-1 basis-[7rem] !px-2"
                  >
                    <Phone aria-hidden="true" />
                    {tr(lang, 'call')}
                  </button>
                  {canEdit && (
                    <button type="button" onClick={() => setConfirmingId(table.id)} disabled={busy} className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm min-w-0 flex-1 basis-full !px-2">
                      {tr(lang, 'cancelReservationConfirm')}
                    </button>
                  )}
                </div>
              )}
              {failedTableId === table.id && (
                <p role="alert" className="mt-2 text-xs font-medium text-[#c4262c]">{tr(lang, 'cancelReservationFailed')}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_ORDER = ['all', 'available', 'reserved', 'waiting_kitchen', 'preparing', 'ready', 'needs_bill', 'occupied']
const SECTION_ORDER = ['ready', 'preparing', 'waiting_kitchen', 'needs_bill', 'reserved', 'occupied', 'available']

export default function WaiterTables() {
  const { state, dispatch, refreshPOSData } = useApp()
  const touristMenuEnabled = state.settings?.touristMenuEnabled !== false
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const [activeFilter, setActiveFilter] = useState('all')
  const [pendingGuestTable, setPendingGuestTable] = useState(null)
  const [pendingGuestPriceMode, setPendingGuestPriceMode] = useState('')
  const [guestEntryBusy, setGuestEntryBusy] = useState(false)
  const [guestEntryError, setGuestEntryError] = useState('')
  const guestEntryRequestRef = useRef(false)
  const { loaded, loadError, retry: retryPOSLoad } = useAppDataStatus()
  // One table write at a time per card: a second tap while it is in flight does nothing.
  const [busyTableId, setBusyTableId] = useState(null)
  const [failedTableId, setFailedTableId] = useState(null)
  const busyTableRef = useRef(null)

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
        const counts = active.length > 0 ? getPreparationCounts(table.id, state.orders, state.settings) : null
        return { table, status, counts }
      }),
    [state.tables, state.orders, state.settings]
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
    if (!touristMenuEnabled && !entryContext.priceModeLocked) {
      // With the Tourist menu off there is nothing to choose: open with Regular prices.
      openTable({ table, entryContext }, PRICE_MODE_REGULAR)
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

  async function openTable(directEntry = null, directPriceMode = '') {
    const entry = directEntry || pendingGuestTable
    if (!canEditTables || !entry || guestEntryBusy || guestEntryRequestRef.current) return
    const { table } = entry
    const chosenPriceMode = directEntry ? directPriceMode : pendingGuestPriceMode
    const latestContext = getTableGuestEntryContext(table.id, state.orders)
    if (latestContext.hasConflictingPriceModes) {
      setGuestEntryError(lang === 'uz'
        ? 'Stol buyurtmasi o‘zgardi. Uni xodim sifatida tekshiring.'
        : lang === 'ru'
          ? 'Заказ стола изменился. Проверьте его как сотрудник.'
          : 'The table order changed. Review it as staff.')
      return
    }
    const entryChanged = latestContext.activeOrderIds.join('|') !== entry.entryContext.activeOrderIds.join('|') ||
      latestContext.priceModeLocked !== entry.entryContext.priceModeLocked ||
      latestContext.priceMode !== entry.entryContext.priceMode
    if (entryChanged) {
      setPendingGuestTable({ table, entryContext: latestContext })
      setPendingGuestPriceMode(latestContext.priceModeLocked ? latestContext.priceMode : chosenPriceMode)
      setGuestEntryError(lang === 'uz'
        ? 'Bu stol boshqa qurilmada o‘zgardi. Yangilangan narx turini tekshirib, yana tasdiqlang.'
        : lang === 'ru'
          ? 'Этот стол изменился на другом устройстве. Проверьте обновлённый тип цен и подтвердите ещё раз.'
          : 'This table changed on another device. Review the updated pricing type and confirm again.')
      return
    }
    const selectedPriceMode = latestContext.priceModeLocked ? latestContext.priceMode : chosenPriceMode
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
      if (directEntry) {
        setPendingGuestTable(directEntry)
        setPendingGuestPriceMode(directPriceMode)
      }
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

  // Runs one table write behind a busy guard and reports whether it went through.
  async function runTableWrite(table, write) {
    if (busyTableRef.current) return false
    busyTableRef.current = table.id
    setBusyTableId(table.id)
    setFailedTableId(null)
    try {
      const result = await write()
      if (result?.error) {
        console.error('[tables] table action failed:', result.error)
        setFailedTableId(table.id)
        return false
      }
      return true
    } catch (error) {
      console.error('[tables] table action failed:', error)
      setFailedTableId(table.id)
      return false
    } finally {
      busyTableRef.current = null
      setBusyTableId(null)
    }
  }

  async function moveTableToCashier(table) {
    const autoPrint = !!state.settings?.autoPrint
    const moved = await runTableWrite(table, () => dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: table.id }))
    if (!moved) return
    completeBillHandoff({ navigate, tableId: table.id, autoPrint })
  }

  function handleCardAction(status, table) {
    if (!canEditTables || busyTableRef.current) return
    if (status === 'ready') {
      runTableWrite(table, () => dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: table.id }))
      return
    }
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

  // Called from the in-card confirmation; resolves true once the reservation is cleared.
  function cancelReservation(table) {
    if (!canEditTables) return Promise.resolve(false)
    return runTableWrite(table, () => dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) }))
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

          {loadError ? (
            // The first load failed and nothing can re-run it from here, so the retry reloads the app.
            <OperationalError
              lang={lang}
              title={tr(lang, 'loadFailedTitle')}
              actionLabel={tr(lang, 'reload')}
              onAction={retryPOSLoad}
            />
          ) : !loaded ? (
            // Counts and cards are data: a skeleton, never "0 tables", while they load.
            <OperationalLoading layout="cards" title={tr(lang, 'loadingTables')} className="!p-0" />
          ) : (
            <>
            <ReservationStrip
              reservations={todaysReservations}
              lang={lang}
              canEdit={canEditTables}
              busyTableId={busyTableId}
              failedTableId={failedTableId}
              onSeat={seatReservation}
              onCancel={cancelReservation}
              onCall={callReservation}
            />

            {/* Status filter */}
            {/* The chips wrap onto more rows on a phone, so no status hides off-screen. */}
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label={tr(lang, 'statusFilter')}
                className="ws-segmented !flex flex-wrap !overflow-visible"
              >
                <FilterChip
                  label={tr(lang, 'all')}
                  count={countsPerStatus.all}
                  active={activeFilter === 'all'}
                  onClick={() => setActiveFilter('all')}
                />
                {FILTER_ORDER.filter(s => s !== 'all').map(status => {
                  const cnt = countsPerStatus[status] || 0
                  const cfg = statusConfig(status)
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

            {/* Status sections */}
            <div className="space-y-8">
              {sections.map(({ status, items }) => {
                const cfg = statusConfig(status)
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
                      <div className="space-y-5">
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
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
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
                            busy={busyTableId === table.id}
                            failed={failedTableId === table.id}
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
                    <Search aria-hidden="true" />
                    <h3>{tr(lang, 'noTablesFound')}</h3>
                    <p>{tr(lang, activeFilter !== 'all' ? 'noTablesInFilter' : 'noTablesYet')}</p>
                    {activeFilter !== 'all' ? (
                      <button type="button" onClick={() => setActiveFilter('all')} className="ws-btn ws-btn-outline">
                        {tr(lang, 'showAllTables')}
                      </button>
                    ) : canManageTables ? (
                      <button type="button" onClick={() => navigate('/admin/tables')} className="ws-btn ws-btn-outline">
                        <Settings aria-hidden="true" />
                        {tr(lang, 'manageTables')}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            </>
          )}

          {pendingGuestTable && (
            <TableGuestEntryDialog
              tableName={pendingGuestTable.table.name || pendingGuestTable.table.label}
              lang={lang}
              priceMode={pendingGuestPriceMode}
              onPriceModeChange={setPendingGuestPriceMode}
              priceModeLocked={pendingGuestTable.entryContext.priceModeLocked}
              touristMenuEnabled={touristMenuEnabled}
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

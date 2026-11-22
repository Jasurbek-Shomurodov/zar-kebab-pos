import { DateTimePicker } from '../components/CalendarPicker'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Edit2, Trash2, Table2, MapPin, Users, Hash, Power, PowerOff,
  CalendarClock, Phone, CheckCircle2, GripVertical, Loader2, RefreshCw,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import AppShell from '../components/AppShell'
import WorkspaceDialog from '../components/WorkspaceDialog'
import StatusBadge from '../components/StatusBadge'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import { canDeleteTable, canDisableTable } from '../lib/tableManagement'
import { clearReservationPatch, getTodaysReservations } from '../lib/tableActivity'
import { formatDateTime, formatTime } from '../lib/dateFormat'
import { canEditFeature } from '../lib/permissions'
import { loadTableOrderHistoryIds } from '../lib/db'
import { getTableZoneVisual } from '../lib/tableZoneColors'

const DEFAULT_ZONES = ['Main Hall', 'VIP', 'Outdoor', 'Second Floor']

const L = {
  en: {
    title: 'Tables',
    description: 'Manage restaurant tables, zones, and availability',
    addTable: 'Add table',
    tables: 'Tables',
    active: 'Active',
    reserved: 'Reserved',
    disabled: 'Disabled',
    zones: 'Zones',
    zonesDescription: 'Create sections like Main Hall, VIP, Outdoor, or Second Floor.',
    addZonePlaceholder: 'Add zone, e.g. Patio',
    addZone: 'Add zone',
    tableName: 'Table name',
    zoneSection: 'Zone / section',
    capacity: 'Capacity',
    status: 'Status',
    sortOrder: 'Sort order',
    actions: 'Actions',
    hasActiveOrders: 'Has active orders',
    hasOrderHistory: 'Has order history',
    edit: 'Edit',
    reserve: 'Reserve',
    disable: 'Disable',
    delete: 'Delete',
    addTableTitle: 'Add table',
    editTableTitle: 'Edit table',
    modalDescription: 'Set table name, zone, capacity, ordering, and availability.',
    tableNamePlaceholder: 'Table 1, VIP 1, Outdoor 3',
    reservationDescription: 'Capture guest details for this table reservation.',
    guestName: 'Guest name',
    customerNamePlaceholder: 'Customer name',
    phone: 'Phone',
    reservationTime: 'Reservation time',
    reservedUntil: 'Reserved until',
    notes: 'Notes',
    notesPlaceholder: 'Guest preferences, occasion, seating notes...',
    activeDescription: 'Disabled tables do not appear for waiters.',
    cancel: 'Cancel',
    save: 'Save',
    requiredTableName: 'Table name is required',
    uniqueTableName: 'Table name must be unique',
    positiveCapacity: 'Capacity should be a positive number',
    numericSortOrder: 'Sort order should be a number',
    requiredZone: 'Zone / section is required',
    requiredGuestName: 'Guest name is required for reservations',
    requiredReservationTime: 'Reservation time is required',
    invalidReservationEnd: 'End time should be after reservation time',
    requiredZoneName: 'Zone name is required',
    uniqueZoneName: 'Zone name must be unique',
    couldNotAddZone: 'Could not add zone',
    zoneAdded: 'Zone added',
    closeActiveBeforeDisable: 'Close active orders before disabling this table.',
    disableTitle: name => `Disable ${name}?`,
    disableMessage: 'Disabled tables stay visible here, keep their history, and disappear from the waiter Tables screen.',
    disableTable: 'Disable table',
    couldNotDisable: 'Could not disable table',
    disabledNotice: name => `${name} disabled`,
    activeOrdersDeleteBlock: 'Do not delete a table while it has active orders.',
    historyDeleteBlock: 'This table has order history. You can disable it instead.',
    historyCheckFailed: 'Could not check table history, so tables cannot be deleted yet.',
    deleteTitle: name => `Delete ${name}?`,
    deleteMessage: 'This permanently removes the table. This is only allowed because it has no order history.',
    deleteTable: 'Delete table',
    couldNotDelete: 'Could not delete table',
    deletedNotice: name => `${name} deleted`,
    couldNotSave: 'Could not save the table. Check the connection and press Save again: it will not be added twice.',
    tableAdded: 'Table added',
    tableUpdated: 'Table updated',
    todaysReservations: 'Today’s reservations',
    noReservationsToday: 'No reservations today',
    seat: 'Seat',
    cancelReservation: 'Cancel reservation',
    call: 'Call',
    select: 'Select',
    selected: count => `${count} selected`,
    bulkActions: 'Bulk actions',
    bulkZone: 'Set zone',
    bulkCapacity: 'Set capacity',
    applyBulk: 'Apply',
    renumberSelected: 'Renumber',
    clearSelection: 'Clear',
    bulkUpdated: 'Tables updated',
    dragTable: 'Drag to reorder table',
    reorderFailed: 'Could not save the new table order',
    saving: 'Saving…',
    close: 'Close',
    retry: 'Try again',
    zoneName: 'Zone name',
    defaultZone: 'Main hall',
    selectAll: 'Select all tables',
    noPhone: 'No phone number',
    reservationCount: count => `${count} today`,
    lockedByActiveOrders: 'Locked while the table has active orders.',
    keepReservation: 'Keep reservation',
    cancelReservationTitle: name => `Cancel the reservation for ${name}?`,
    cancelReservationMessage: 'The guest details are removed and the table becomes free.',
    couldNotCancelReservation: 'Could not cancel the reservation. Try again.',
    reservationCancelled: name => `Reservation for ${name} cancelled`,
    couldNotSeat: name => `Could not seat guests at ${name}. Try again.`,
    bulkResult: (updated, failed) => `${updated} updated, ${failed} failed. Apply again to retry.`,
    bulkNothingChosen: 'Choose a zone or a capacity first.',
    noTables: 'No tables yet',
    noTablesHint: 'Add the first table so waiters can take orders.',
  },
  ru: {
    title: 'Столы',
    description: 'Управление столами, зонами и доступностью',
    addTable: 'Добавить стол',
    tables: 'Столы',
    active: 'Активные',
    reserved: 'Бронь',
    disabled: 'Отключены',
    zones: 'Зоны',
    zonesDescription: 'Создавайте секции: основной зал, VIP, улица или второй этаж.',
    addZonePlaceholder: 'Добавить зону, например Патио',
    addZone: 'Добавить зону',
    tableName: 'Название стола',
    zoneSection: 'Зона / секция',
    capacity: 'Мест',
    status: 'Статус',
    sortOrder: 'Порядок',
    actions: 'Действия',
    hasActiveOrders: 'Есть активные заказы',
    hasOrderHistory: 'Есть история заказов',
    edit: 'Изменить',
    reserve: 'Забронировать',
    disable: 'Отключить',
    delete: 'Удалить',
    addTableTitle: 'Добавить стол',
    editTableTitle: 'Изменить стол',
    modalDescription: 'Укажите название, зону, вместимость, порядок и доступность.',
    tableNamePlaceholder: 'Стол 1, VIP 1, Улица 3',
    reservationDescription: 'Сохраните данные гостя для брони этого стола.',
    guestName: 'Имя гостя',
    customerNamePlaceholder: 'Имя клиента',
    phone: 'Телефон',
    reservationTime: 'Время брони',
    reservedUntil: 'Бронь до',
    notes: 'Заметки',
    notesPlaceholder: 'Пожелания гостя, повод, место посадки...',
    activeDescription: 'Отключённые столы не показываются официантам.',
    cancel: 'Отмена',
    save: 'Сохранить',
    requiredTableName: 'Название стола обязательно',
    uniqueTableName: 'Название стола должно быть уникальным',
    positiveCapacity: 'Вместимость должна быть положительным числом',
    numericSortOrder: 'Порядок должен быть числом',
    requiredZone: 'Зона / секция обязательна',
    requiredGuestName: 'Для брони нужно имя гостя',
    requiredReservationTime: 'Укажите время брони',
    invalidReservationEnd: 'Время окончания должно быть позже начала',
    requiredZoneName: 'Название зоны обязательно',
    uniqueZoneName: 'Название зоны должно быть уникальным',
    couldNotAddZone: 'Не удалось добавить зону',
    zoneAdded: 'Зона добавлена',
    closeActiveBeforeDisable: 'Закройте активные заказы перед отключением стола.',
    disableTitle: name => `Отключить ${name}?`,
    disableMessage: 'Отключённые столы остаются здесь, сохраняют историю и скрываются с экрана официанта.',
    disableTable: 'Отключить стол',
    couldNotDisable: 'Не удалось отключить стол',
    disabledNotice: name => `${name} отключён`,
    activeOrdersDeleteBlock: 'Нельзя удалять стол с активными заказами.',
    historyDeleteBlock: 'У этого стола есть история заказов. Вместо удаления его можно отключить.',
    historyCheckFailed: 'Не удалось проверить историю столов, поэтому удаление пока недоступно.',
    deleteTitle: name => `Удалить ${name}?`,
    deleteMessage: 'Стол будет удалён навсегда. Это разрешено только если у него нет истории заказов.',
    deleteTable: 'Удалить стол',
    couldNotDelete: 'Не удалось удалить стол',
    deletedNotice: name => `${name} удалён`,
    couldNotSave: 'Не удалось сохранить стол. Проверьте интернет и нажмите «Сохранить» ещё раз: стол не добавится дважды.',
    tableAdded: 'Стол добавлен',
    tableUpdated: 'Стол обновлён',
    todaysReservations: 'Брони сегодня',
    noReservationsToday: 'Сегодня броней нет',
    seat: 'Посадить',
    cancelReservation: 'Отменить бронь',
    call: 'Позвонить',
    select: 'Выбрать',
    selected: count => `Выбрано: ${count}`,
    bulkActions: 'Массовые действия',
    bulkZone: 'Зона',
    bulkCapacity: 'Вместимость',
    applyBulk: 'Применить',
    renumberSelected: 'Перенумеровать',
    clearSelection: 'Очистить',
    bulkUpdated: 'Столы обновлены',
    dragTable: 'Перетащите, чтобы изменить порядок',
    reorderFailed: 'Не удалось сохранить новый порядок столов',
    saving: 'Сохранение…',
    close: 'Закрыть',
    retry: 'Повторить',
    zoneName: 'Название зоны',
    defaultZone: 'Основной зал',
    selectAll: 'Выбрать все столы',
    noPhone: 'Телефон не указан',
    reservationCount: count => `Сегодня: ${count}`,
    lockedByActiveOrders: 'Недоступно, пока у стола есть активные заказы.',
    keepReservation: 'Оставить бронь',
    cancelReservationTitle: name => `Отменить бронь стола ${name}?`,
    cancelReservationMessage: 'Данные гостя будут удалены, стол станет свободным.',
    couldNotCancelReservation: 'Не удалось отменить бронь. Попробуйте ещё раз.',
    reservationCancelled: name => `Бронь стола ${name} отменена`,
    couldNotSeat: name => `Не удалось посадить гостей за ${name}. Попробуйте ещё раз.`,
    bulkResult: (updated, failed) => `Обновлено: ${updated}, не удалось: ${failed}. Нажмите «Применить» ещё раз.`,
    bulkNothingChosen: 'Сначала выберите зону или вместимость.',
    noTables: 'Столов пока нет',
    noTablesHint: 'Добавьте первый стол, чтобы официанты могли принимать заказы.',
  },
  uz: {
    title: 'Stollar',
    description: 'Restoran stollari, zonalari va mavjudligini boshqarish',
    addTable: 'Stol qo‘shish',
    tables: 'Stollar',
    active: 'Faol',
    reserved: 'Bron',
    disabled: 'O‘chirilgan',
    zones: 'Zonalar',
    zonesDescription: 'Asosiy zal, VIP, tashqi hudud yoki ikkinchi qavat kabi bo‘limlar yarating.',
    addZonePlaceholder: 'Zona qo‘shing, masalan Patio',
    addZone: 'Zona qo‘shish',
    tableName: 'Stol nomi',
    zoneSection: 'Zona / bo‘lim',
    capacity: 'Sig‘im',
    status: 'Holat',
    sortOrder: 'Tartib',
    actions: 'Amallar',
    hasActiveOrders: 'Faol buyurtmalar bor',
    hasOrderHistory: 'Buyurtma tarixi bor',
    edit: 'Tahrirlash',
    reserve: 'Bron qilish',
    disable: 'O‘chirish',
    delete: 'O‘chirib tashlash',
    addTableTitle: 'Stol qo‘shish',
    editTableTitle: 'Stolni tahrirlash',
    modalDescription: 'Stol nomi, zona, sig‘im, tartib va mavjudlikni sozlang.',
    tableNamePlaceholder: 'Stol 1, VIP 1, Outdoor 3',
    reservationDescription: 'Bu stol bron qilinishi uchun mehmon ma’lumotlarini kiriting.',
    guestName: 'Mehmon ismi',
    customerNamePlaceholder: 'Mijoz ismi',
    phone: 'Telefon',
    reservationTime: 'Bron vaqti',
    reservedUntil: 'Bron tugashi',
    notes: 'Izohlar',
    notesPlaceholder: 'Mehmon istaklari, sabab, joylashuv izohlari...',
    activeDescription: 'O‘chirilgan stollar ofitsiantlarga ko‘rinmaydi.',
    cancel: 'Bekor qilish',
    save: 'Saqlash',
    requiredTableName: 'Stol nomi majburiy',
    uniqueTableName: 'Stol nomi yagona bo‘lishi kerak',
    positiveCapacity: 'Sig‘im musbat son bo‘lishi kerak',
    numericSortOrder: 'Tartib raqam bo‘lishi kerak',
    requiredZone: 'Zona / bo‘lim majburiy',
    requiredGuestName: 'Bron uchun mehmon ismi kerak',
    requiredReservationTime: 'Bron vaqti kerak',
    invalidReservationEnd: 'Tugash vaqti bron vaqtidan keyin bo‘lishi kerak',
    requiredZoneName: 'Zona nomi majburiy',
    uniqueZoneName: 'Zona nomi yagona bo‘lishi kerak',
    couldNotAddZone: 'Zona qo‘shilmadi',
    zoneAdded: 'Zona qo‘shildi',
    closeActiveBeforeDisable: 'Stolni o‘chirishdan oldin faol buyurtmalarni yoping.',
    disableTitle: name => `${name} o‘chirilsinmi?`,
    disableMessage: 'O‘chirilgan stollar shu yerda qoladi, tarixi saqlanadi va ofitsiant ekranidan yashiriladi.',
    disableTable: 'Stolni o‘chirish',
    couldNotDisable: 'Stolni o‘chirib bo‘lmadi',
    disabledNotice: name => `${name} o‘chirildi`,
    activeOrdersDeleteBlock: 'Faol buyurtmalari bor stolni o‘chirib tashlamang.',
    historyDeleteBlock: 'Bu stolda buyurtma tarixi bor. Uni o‘chirib tashlash o‘rniga o‘chirib qo‘yishingiz mumkin.',
    historyCheckFailed: 'Stollar tarixini tekshirib bo‘lmadi, shuning uchun stolni o‘chirib tashlash hozircha mumkin emas.',
    deleteTitle: name => `${name} o‘chirib tashlansinmi?`,
    deleteMessage: 'Bu stol butunlay o‘chiriladi. Bu faqat buyurtma tarixi bo‘lmasa mumkin.',
    deleteTable: 'Stolni o‘chirib tashlash',
    couldNotDelete: 'Stol o‘chirilmadi',
    deletedNotice: name => `${name} o‘chirib tashlandi`,
    couldNotSave: 'Stol saqlanmadi. Internetni tekshirib, «Saqlash»ni yana bosing: stol ikki marta qo‘shilmaydi.',
    tableAdded: 'Stol qo‘shildi',
    tableUpdated: 'Stol yangilandi',
    todaysReservations: 'Bugungi bronlar',
    noReservationsToday: 'Bugun bron yo‘q',
    seat: 'Joylashtirish',
    cancelReservation: 'Bronni bekor qilish',
    call: 'Qo‘ng‘iroq',
    select: 'Tanlash',
    selected: count => `${count} tanlandi`,
    bulkActions: 'Ommaviy amallar',
    bulkZone: 'Zonani o‘zgartirish',
    bulkCapacity: 'Sig‘imni o‘zgartirish',
    applyBulk: 'Qo‘llash',
    renumberSelected: 'Raqamlash',
    clearSelection: 'Tozalash',
    bulkUpdated: 'Stollar yangilandi',
    dragTable: 'Tartibni o‘zgartirish uchun torting',
    reorderFailed: 'Stollarning yangi tartibi saqlanmadi',
    saving: 'Saqlanmoqda…',
    close: 'Yopish',
    retry: 'Qayta urinish',
    zoneName: 'Zona nomi',
    defaultZone: 'Asosiy zal',
    selectAll: 'Barcha stollarni tanlash',
    noPhone: 'Telefon raqami yo‘q',
    reservationCount: count => `Bugun: ${count} ta`,
    lockedByActiveOrders: 'Stolda faol buyurtmalar bor ekan, o‘zgartirib bo‘lmaydi.',
    keepReservation: 'Bronni qoldirish',
    cancelReservationTitle: name => `${name} broni bekor qilinsinmi?`,
    cancelReservationMessage: 'Mehmon ma’lumotlari o‘chiriladi va stol bo‘shaydi.',
    couldNotCancelReservation: 'Bronni bekor qilib bo‘lmadi. Qayta urinib ko‘ring.',
    reservationCancelled: name => `${name} broni bekor qilindi`,
    couldNotSeat: name => `${name} stoliga mehmonlarni joylashtirib bo‘lmadi. Qayta urinib ko‘ring.`,
    bulkResult: (updated, failed) => `${updated} ta yangilandi, ${failed} ta yangilanmadi. «Qo‘llash»ni yana bosing.`,
    bulkNothingChosen: 'Avval zona yoki sig‘imni tanlang.',
    noTables: 'Hozircha stollar yo‘q',
    noTablesHint: 'Ofitsiantlar buyurtma olishi uchun birinchi stolni qo‘shing.',
  },
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `zone-${Date.now()}`
}

// The id is made once, when the sheet opens, so saving again after an unknown
// outcome reuses it and can never insert a second table.
function makeTableId() {
  return `tbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isDuplicateIdError(error) {
  return error?.code === '23505' && /pkey/i.test(String(error?.message || ''))
}

function uniqueById(tables) {
  const seen = new Set()
  return tables.filter(table => {
    if (seen.has(table.id)) return false
    seen.add(table.id)
    return true
  })
}

function normalizeTable(table, zones = []) {
  const zone = zones.find(z => z.id === table.zone_id || z.name === table.zone_name)
  return {
    id: table.id || '',
    name: table.name || '',
    zone_id: table.zone_id || zone?.id || '',
    zone_name: table.zone_name || zone?.name || 'Main Hall',
    capacity: Number(table.capacity) || 4,
    sort_order: Number(table.sort_order) || 0,
    status: table.status || 'available',
    is_active: table.is_active !== false,
    reserved_for_name: table.reserved_for_name || '',
    reserved_for_phone: table.reserved_for_phone || '',
    reserved_at: table.reserved_at ? String(table.reserved_at).slice(0, 16) : '',
    reserved_until: table.reserved_until ? String(table.reserved_until).slice(0, 16) : '',
    reservation_notes: table.reservation_notes || '',
  }
}

/** A stored notice is a label key plus arguments, so it follows the language. */
function noticeText(labels, notice) {
  const value = labels[notice.key]
  return typeof value === 'function' ? value(...(notice.args || [])) : value
}

function Field({ label, error, children, as: Wrapper = 'label' }) {
  return (
    <Wrapper className="block">
      <span className="ws-caption mb-1.5 block font-medium">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-[#c4262c]">{error}</span>}
    </Wrapper>
  )
}

function TableStatus({ table, labels, lang }) {
  if (table.is_active === false) return <StatusBadge status="disabled" lang={lang} />
  if (table.status === 'reserved') return <span className="ws-status ws-tone-caution">{labels.reserved}</span>
  return <StatusBadge status="active" lang={lang} />
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="ws-panel flex items-center gap-3 !p-4">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#efece9] text-[#68655f]">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums text-[#22201d]">{value}</p>
        <p className="ws-caption mt-1">{label}</p>
      </div>
    </div>
  )
}

function ReservationStrip({ reservations, labels, canEdit, busyId, onSeat, onCancel }) {
  return (
    <section className="ws-panel">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#efece9] text-[#68655f]">
          <CalendarClock size={17} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#22201d]">{labels.todaysReservations}</h2>
          <p className="ws-caption tabular-nums">
            {reservations.length > 0 ? labels.reservationCount(reservations.length) : labels.noReservationsToday}
          </p>
        </div>
      </div>
      {reservations.length > 0 && (
        <div className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {reservations.map(({ table, reservation }) => (
            <div key={table.id} className="min-w-0 rounded-[10px] bg-[#efece9] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#22201d]">{table.name}</p>
                  <p className="ws-caption truncate">{reservation.name || '—'}</p>
                </div>
                <span className="ws-badge tabular-nums">{formatTime(reservation.startsAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canEdit && (
                  <button type="button" onClick={() => onSeat(table)} disabled={busyId === table.id} className="ws-btn ws-btn-primary ws-btn-sm">
                    {busyId === table.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                    {labels.seat}
                  </button>
                )}
                {reservation.phone ? (
                  <a href={`tel:${reservation.phone}`} className="ws-btn ws-btn-outline ws-btn-sm">
                    <Phone size={14} aria-hidden="true" />
                    {labels.call}
                  </a>
                ) : (
                  <button type="button" disabled title={labels.noPhone} className="ws-btn ws-btn-outline ws-btn-sm">
                    <Phone size={14} aria-hidden="true" />
                    {labels.call}
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={() => onCancel(table)} disabled={busyId === table.id} className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ml-auto">
                    {labels.cancelReservation}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SortableTableRow({ tableId, disabled, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tableId,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'bg-[#fff1e8] shadow-xl ring-2 ring-[#ff5a00]/40' : ''}`}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

const ROW_GRID = 'md:grid-cols-[96px_minmax(0,1.3fr)_minmax(0,1fr)_64px_minmax(0,1fr)_56px_200px]'

// What each confirmation says and which label reports its failure; the texts are
// read from the label object at render so they follow the language.
const CONFIRMS = {
  disable: { title: 'disableTitle', message: 'disableMessage', action: 'disableTable', failed: 'couldNotDisable', done: 'disabledNotice', danger: false },
  delete: { title: 'deleteTitle', message: 'deleteMessage', action: 'deleteTable', failed: 'couldNotDelete', done: 'deletedNotice', danger: true },
  cancelReservation: { title: 'cancelReservationTitle', message: 'cancelReservationMessage', action: 'cancelReservation', failed: 'couldNotCancelReservation', done: 'reservationCancelled', danger: true },
}

export default function AdminTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const { loaded, loadError, retry: retryPOSLoad } = useAppDataStatus()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const l = L[lang] || L.en
  const canManageTables = canEditFeature(profile || { role: state.user?.role }, 'settings')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(() => normalizeTable({}))
  const [zoneName, setZoneName] = useState('')
  const [zoneError, setZoneError] = useState('')
  const [zoneBusy, setZoneBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [reservationBusyId, setReservationBusyId] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkZoneId, setBulkZoneId] = useState('')
  const [bulkCapacity, setBulkCapacity] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [historicalTableIds, setHistoricalTableIds] = useState(null)
  const [historyFailed, setHistoryFailed] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const nameInputRef = useRef(null)
  // True after a failed "add table" write whose outcome is unknown: the row may exist.
  const newTableAttemptedRef = useRef(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  // Language is not a dependency: the failure is kept as a flag and worded at render.
  useEffect(() => {
    let cancelled = false
    setHistoryFailed(false)
    loadTableOrderHistoryIds()
      .then(ids => {
        if (!cancelled) setHistoricalTableIds(new Set(ids))
      })
      .catch(error => {
        if (cancelled) return
        console.error('[tables] order history check failed:', error)
        setHistoricalTableIds(null)
        setHistoryFailed(true)
      })
    return () => { cancelled = true }
  }, [historyAttempt])

  // A failed optimistic add can leave a local copy behind; never render one table twice.
  const tables = useMemo(() => uniqueById(state.tables), [state.tables])

  const tableZones = useMemo(() => {
    const stored = state.tableZones || []
    const names = new Map()
    stored.forEach(zone => names.set(zone.name.toLowerCase(), zone))
    tables.forEach(table => {
      const name = table.zone_name || 'Main Hall'
      if (!names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), {
          id: slugify(name),
          name,
          sort_order: 999,
          is_active: true,
        })
      }
    })
    DEFAULT_ZONES.forEach((name, index) => {
      if (!names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), {
          id: slugify(name),
          name,
          sort_order: index + 1,
          is_active: true,
        })
      }
    })
    return [...names.values()]
      .filter(zone => zone.is_active !== false)
      .sort((a, b) => (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999) || a.name.localeCompare(b.name))
  }, [state.tableZones, tables])

  const sortedTables = useMemo(() =>
    [...tables].sort((a, b) =>
      (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
      String(a.zone_name || '').localeCompare(String(b.zone_name || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    ),
    [tables]
  )

  const orderStats = useMemo(() => {
    const active = new Set()
    const history = new Set(historicalTableIds || [])
    state.orders.forEach(order => {
      if (!order.table_id) return
      history.add(order.table_id)
      if (order.payment_status !== 'paid' && order.status !== 'cancelled') active.add(order.table_id)
    })
    return { active, history }
  }, [historicalTableIds, state.orders])

  const activeCount = tables.filter(table => table.is_active !== false).length
  const disabledCount = tables.length - activeCount
  const reservedCount = tables.filter(table => table.is_active !== false && table.status === 'reserved').length
  const todaysReservations = useMemo(() => getTodaysReservations(tables, new Date()), [tables])
  const selectedTables = useMemo(() =>
    sortedTables.filter(table => selectedIds.includes(table.id)),
    [selectedIds, sortedTables]
  )
  const allSelected = sortedTables.length > 0 && selectedIds.length === sortedTables.length

  function openNew() {
    if (!canManageTables) return
    const nextSort = tables.reduce((max, table) => Math.max(max, Number(table.sort_order) || 0), 0) + 1
    const firstZone = tableZones[0] || { id: 'main-hall', name: 'Main Hall' }
    setForm(normalizeTable({
      id: makeTableId(),
      name: '',
      zone_id: firstZone.id,
      zone_name: firstZone.name,
      capacity: 4,
      sort_order: nextSort,
      status: 'available',
      is_active: true,
      reserved_for_name: '',
      reserved_for_phone: '',
      reserved_at: '',
      reserved_until: '',
      reservation_notes: '',
    }, tableZones))
    newTableAttemptedRef.current = false
    setErrors({})
    setSaveError('')
    setModal('new')
  }

  function openEdit(table) {
    if (!canManageTables) return
    setForm(normalizeTable(table, tableZones))
    setErrors({})
    setSaveError('')
    setModal('edit')
  }

  function closeModal() {
    if (saving) return
    setModal(null)
    setSaveError('')
  }

  // Returns label keys; they are worded at render.
  function validate(nextForm) {
    const nextErrors = {}
    const name = nextForm.name.trim()
    if (!name) nextErrors.name = 'requiredTableName'
    const duplicate = tables.some(table =>
      table.id !== nextForm.id && table.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) nextErrors.name = 'uniqueTableName'
    if (!Number.isFinite(Number(nextForm.capacity)) || Number(nextForm.capacity) <= 0) {
      nextErrors.capacity = 'positiveCapacity'
    }
    if (!Number.isFinite(Number(nextForm.sort_order))) {
      nextErrors.sort_order = 'numericSortOrder'
    }
    if (!nextForm.zone_name.trim()) nextErrors.zone = 'requiredZone'
    if (nextForm.status === 'reserved') {
      if (!nextForm.reserved_for_name.trim()) nextErrors.reserved_for_name = 'requiredGuestName'
      if (!nextForm.reserved_at) nextErrors.reserved_at = 'requiredReservationTime'
      if (nextForm.reserved_until && nextForm.reserved_at && new Date(nextForm.reserved_until) <= new Date(nextForm.reserved_at)) {
        nextErrors.reserved_until = 'invalidReservationEnd'
      }
    }
    return nextErrors
  }

  function updateZone(zoneId) {
    const zone = tableZones.find(z => z.id === zoneId)
    setForm(current => ({
      ...current,
      zone_id: zone?.id || '',
      zone_name: zone?.name || current.zone_name,
    }))
  }

  async function save(event) {
    event?.preventDefault()
    if (!canManageTables || saving) return
    const isNew = modal === 'new'
    const selectedZone = tableZones.find(z => z.id === form.zone_id || z.name === form.zone_name)
    const payload = {
      ...form,
      id: form.id || makeTableId(),
      name: form.name.trim(),
      zone_id: selectedZone?.id || slugify(form.zone_name),
      zone_name: selectedZone?.name || form.zone_name.trim(),
      capacity: Math.max(1, Math.round(Number(form.capacity) || 1)),
      sort_order: Math.round(Number(form.sort_order) || 0),
      status: form.is_active === false ? 'available' : form.status || 'available',
      is_active: form.is_active !== false,
      reserved_for_name: form.is_active !== false && form.status === 'reserved' ? form.reserved_for_name.trim() : '',
      reserved_for_phone: form.is_active !== false && form.status === 'reserved' ? form.reserved_for_phone.trim() : '',
      reserved_at: form.is_active !== false && form.status === 'reserved' && form.reserved_at ? form.reserved_at : null,
      reserved_until: form.is_active !== false && form.status === 'reserved' && form.reserved_until ? form.reserved_until : null,
      reservation_notes: form.is_active !== false && form.status === 'reserved' ? form.reservation_notes.trim() : '',
    }
    const nextErrors = validate(payload)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    setSaveError('')
    const result = await dispatch({ type: isNew ? 'ADD_TABLE' : 'UPDATE_TABLE', payload })
    setSaving(false)
    // The same id was already inserted by an earlier attempt whose answer was lost: it is saved.
    const alreadySaved = isNew && newTableAttemptedRef.current && isDuplicateIdError(result?.error)
    if (result?.error && !alreadySaved) {
      console.error('[tables] save failed:', result.error)
      if (isNew) newTableAttemptedRef.current = true
      setSaveError('couldNotSave')
      return
    }
    setModal(null)
    setNotice({ tone: 'success', key: isNew ? 'tableAdded' : 'tableUpdated' })
  }

  async function addZone(event) {
    event?.preventDefault()
    if (!canManageTables || zoneBusy) return
    const name = zoneName.trim()
    setZoneError('')
    if (!name) {
      setZoneError('requiredZoneName')
      return
    }
    if (tableZones.some(zone => zone.name.toLowerCase() === name.toLowerCase())) {
      setZoneError('uniqueZoneName')
      return
    }
    const payload = {
      id: slugify(name),
      name,
      sort_order: tableZones.reduce((max, zone) => Math.max(max, Number(zone.sort_order) || 0), 0) + 1,
      is_active: true,
    }
    setZoneBusy(true)
    const result = await dispatch({ type: 'ADD_TABLE_ZONE', payload })
    setZoneBusy(false)
    if (result?.error) {
      console.error('[tables] add zone failed:', result.error)
      setZoneError('couldNotAddZone')
      return
    }
    setZoneName('')
    setNotice({ tone: 'success', key: 'zoneAdded' })
  }

  function openConfirm(kind, table) {
    setConfirmError('')
    setConfirm({ kind, table })
  }

  function closeConfirm() {
    if (confirmBusy) return
    setConfirm(null)
    setConfirmError('')
  }

  function requestDisable(table) {
    if (!canManageTables) return
    const check = canDisableTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', key: 'closeActiveBeforeDisable' })
      return
    }
    openConfirm('disable', table)
  }

  function requestDelete(table) {
    if (!canManageTables) return
    if (!historicalTableIds) {
      setNotice({ tone: 'error', key: 'historyCheckFailed' })
      return
    }
    const check = canDeleteTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', key: 'activeOrdersDeleteBlock' })
      return
    }
    if (!check.ok && check.reason === 'order_history') {
      setNotice({ tone: 'error', key: 'historyDeleteBlock' })
      return
    }
    if (orderStats.history.has(table.id)) {
      setNotice({ tone: 'error', key: 'historyDeleteBlock' })
      return
    }
    openConfirm('delete', table)
  }

  function confirmAction({ kind, table }) {
    if (kind === 'delete') return { type: 'DELETE_TABLE', payload: table.id }
    if (kind === 'cancelReservation') return { type: 'UPDATE_TABLE', payload: clearReservationPatch(table) }
    return {
      type: 'UPDATE_TABLE',
      payload: {
        ...table,
        is_active: false,
        status: 'available',
        reserved_for_name: '',
        reserved_for_phone: '',
        reserved_at: null,
        reserved_until: null,
        reservation_notes: '',
      },
    }
  }

  async function runConfirm() {
    if (!canManageTables || !confirm || confirmBusy) return
    const spec = CONFIRMS[confirm.kind]
    setConfirmBusy(true)
    setConfirmError('')
    const result = await dispatch(confirmAction(confirm))
    setConfirmBusy(false)
    if (result?.error) {
      console.error(`[tables] ${confirm.kind} failed:`, result.error)
      setConfirmError(spec.failed)
      return
    }
    setNotice({ tone: 'success', key: spec.done, args: [confirm.table.name] })
    setConfirm(null)
  }

  function toggleSelected(tableId) {
    if (!canManageTables) return
    setSelectedIds(current => current.includes(tableId)
      ? current.filter(id => id !== tableId)
      : [...current, tableId]
    )
  }

  function toggleAllSelected() {
    if (!canManageTables) return
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(sortedTables.map(table => table.id))
    }
  }

  async function applyBulkUpdates({ renumber = false } = {}) {
    if (!canManageTables || bulkBusy) return
    if (selectedTables.length === 0) return
    const selectedZone = tableZones.find(zone => zone.id === bulkZoneId)
    const nextCapacity = bulkCapacity === '' ? null : Math.max(1, Math.round(Number(bulkCapacity) || 1))
    if (!selectedZone && !nextCapacity && !renumber) {
      setNotice({ tone: 'error', key: 'bulkNothingChosen' })
      return
    }
    setBulkBusy(true)
    let updated = 0
    let failed = 0
    for (let index = 0; index < selectedTables.length; index += 1) {
      const table = selectedTables[index]
      const result = await dispatch({
        type: 'UPDATE_TABLE',
        payload: {
          ...table,
          ...(selectedZone ? { zone_id: selectedZone.id, zone_name: selectedZone.name } : {}),
          ...(nextCapacity ? { capacity: nextCapacity } : {}),
          ...(renumber ? { sort_order: index + 1 } : {}),
        },
      })
      if (result?.error) {
        console.error('[tables] bulk update failed:', table.id, result.error)
        failed += 1
      } else {
        updated += 1
      }
    }
    setBulkBusy(false)
    setNotice(failed > 0
      ? { tone: 'error', key: 'bulkResult', args: [updated, failed] }
      : { tone: 'success', key: 'bulkUpdated' })
  }

  async function handleTableDragEnd({ active, over }) {
    if (!canManageTables || !over || active.id === over.id) return
    const oldIndex = sortedTables.findIndex(table => table.id === active.id)
    const newIndex = sortedTables.findIndex(table => table.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const updates = arrayMove(sortedTables, oldIndex, newIndex).map((table, index) => ({
      id: table.id,
      sort_order: index + 1,
    }))
    const result = await dispatch({ type: 'REORDER_TABLES', payload: { updates } })
    if (result?.error) {
      console.error('[tables] reorder failed:', result.error)
      setNotice({ tone: 'error', key: 'reorderFailed' })
    }
  }

  // The guest is seated only once the reservation is really cleared.
  async function seatReservation(table) {
    if (!canManageTables || reservationBusyId) return
    setReservationBusyId(table.id)
    const result = await dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
    setReservationBusyId('')
    if (result?.error) {
      console.error('[tables] seat reservation failed:', result.error)
      setNotice({ tone: 'error', key: 'couldNotSeat', args: [table.name] })
      return
    }
    navigate(`/waiter/order/${table.id}`)
  }

  function cancelReservation(table) {
    if (!canManageTables) return
    openConfirm('cancelReservation', table)
  }

  const confirmSpec = confirm ? CONFIRMS[confirm.kind] : null
  const reservationLocked = modal === 'edit' && orderStats.active.has(form.id)

  return (
    <AppShell title={l.title}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page mx-auto max-w-[1180px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="ws-muted min-w-0 flex-1 basis-64">{l.description}</p>
            {canManageTables && loaded && !loadError && (
              <button type="button" onClick={openNew} className="ws-btn ws-btn-primary">
                <Plus size={16} aria-hidden="true" />
                {l.addTable}
              </button>
            )}
          </div>

          {!loaded ? (
            <OperationalLoading title={l.title} layout="table" className="!p-0" />
          ) : loadError ? (
            <OperationalError lang={lang} onAction={retryPOSLoad} />
          ) : (
            <>
              {notice && (
                <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`ws-notice ${notice.tone === 'error' ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
                  {noticeText(l, notice)}
                </div>
              )}
              {historyFailed && (
                <div role="alert" className="ws-notice ws-tone-caution flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 basis-56">{l.historyCheckFailed}</span>
                  <button type="button" onClick={() => setHistoryAttempt(count => count + 1)} className="ws-btn ws-btn-outline ws-btn-sm">
                    <RefreshCw size={14} aria-hidden="true" />
                    {l.retry}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryCard icon={Table2} label={l.tables} value={tables.length} />
                <SummaryCard icon={Power} label={l.active} value={activeCount} />
                <SummaryCard icon={CalendarClock} label={l.reserved} value={reservedCount} />
                <SummaryCard icon={PowerOff} label={l.disabled} value={disabledCount} />
              </div>

              <ReservationStrip
                reservations={todaysReservations}
                labels={l}
                canEdit={canManageTables}
                busyId={reservationBusyId}
                onSeat={seatReservation}
                onCancel={cancelReservation}
              />

              <section className="ws-panel">
                <h2 className="text-sm font-semibold text-[#22201d]">{l.zones}</h2>
                <p className="ws-caption">{l.zonesDescription}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tableZones.map(zone => (
                    <span key={zone.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${getTableZoneVisual(zone, tableZones).badge}`}>
                      <span className={`h-2 w-2 rounded-full ${getTableZoneVisual(zone, tableZones).dot}`} aria-hidden="true" />
                      {zone.name}
                    </span>
                  ))}
                </div>
                {canManageTables && (
                  <form onSubmit={addZone} className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={zoneName}
                      onChange={e => setZoneName(e.target.value)}
                      placeholder={l.addZonePlaceholder}
                      aria-label={l.zoneName}
                      aria-invalid={zoneError ? true : undefined}
                      className="ws-input min-w-0 flex-1 basis-56"
                    />
                    <button type="submit" disabled={zoneBusy} className="ws-btn ws-btn-outline">
                      {zoneBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                      {l.addZone}
                    </button>
                    {zoneError && <p role="alert" className="w-full text-xs font-medium text-[#c4262c]">{l[zoneError]}</p>}
                  </form>
                )}
              </section>

              {canManageTables && selectedIds.length > 0 && (
                <section className="ws-panel" aria-busy={bulkBusy || undefined}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#22201d]">{l.bulkActions}</h2>
                      <p className="ws-caption tabular-nums">{l.selected(selectedIds.length)}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedIds([])} disabled={bulkBusy} className="ws-btn ws-btn-ghost ws-btn-sm">
                      {l.clearSelection}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={bulkZoneId}
                      onChange={e => setBulkZoneId(e.target.value)}
                      disabled={bulkBusy}
                      aria-label={l.bulkZone}
                      className="ws-input min-w-0 flex-1 basis-48"
                    >
                      <option value="">{l.bulkZone}</option>
                      {tableZones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                    </select>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={bulkCapacity}
                      onChange={e => setBulkCapacity(e.target.value)}
                      disabled={bulkBusy}
                      placeholder={l.bulkCapacity}
                      aria-label={l.bulkCapacity}
                      className="ws-input min-w-0 flex-1 basis-40 tabular-nums"
                    />
                    <button type="button" onClick={() => applyBulkUpdates()} disabled={bulkBusy} className="ws-btn ws-btn-primary">
                      {bulkBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                      {l.applyBulk}
                    </button>
                    <button type="button" onClick={() => applyBulkUpdates({ renumber: true })} disabled={bulkBusy} className="ws-btn ws-btn-outline">
                      {l.renumberSelected}
                    </button>
                  </div>
                </section>
              )}

              {sortedTables.length === 0 ? (
                <section className="ws-panel">
                  <div className="ws-empty">
                    <Table2 aria-hidden="true" />
                    <h3>{l.noTables}</h3>
                    {canManageTables && (
                      <>
                        <p>{l.noTablesHint}</p>
                        <button type="button" onClick={openNew} className="ws-btn ws-btn-primary">
                          <Plus size={16} aria-hidden="true" />
                          {l.addTable}
                        </button>
                      </>
                    )}
                  </div>
                </section>
              ) : (
                <section className="ws-panel ws-panel-flush">
                  <div className={`ws-table-head hidden items-center gap-3 px-4 py-2 md:grid ${ROW_GRID}`}>
                    <label className="flex h-10 w-10 items-center justify-center justify-self-end">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={!canManageTables}
                        onChange={toggleAllSelected}
                        className="h-4 w-4 rounded border-gray-300 accent-[#cc4800]"
                        aria-label={l.selectAll}
                      />
                    </label>
                    <span>{l.tableName}</span>
                    <span>{l.zoneSection}</span>
                    <span>{l.capacity}</span>
                    <span>{l.status}</span>
                    <span>{l.sortOrder}</span>
                    <span className="text-right">{l.actions}</span>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
                    <SortableContext items={sortedTables.map(table => table.id)} strategy={verticalListSortingStrategy}>
                      <div>
                        {sortedTables.map(table => {
                          const zoneVisual = getTableZoneVisual(table, tableZones)
                          const activeOrders = orderStats.active.has(table.id)
                          const hasHistory = orderStats.history.has(table.id)
                          const canHardDelete = historicalTableIds !== null && !activeOrders && !hasHistory
                          const deleteTitle = historicalTableIds === null
                            ? l.historyCheckFailed
                            : activeOrders
                              ? l.activeOrdersDeleteBlock
                              : hasHistory
                                ? l.historyDeleteBlock
                                : l.delete
                          const selected = selectedIds.includes(table.id)
                          const zoneLabel = table.zone_name || l.defaultZone
                          return (
                            <SortableTableRow
                              key={table.id}
                              tableId={table.id}
                              disabled={!canManageTables}
                              className={`ws-row grid gap-3 px-4 py-3 md:items-center ${ROW_GRID} ${table.is_active === false ? 'bg-[#f6f5f3]' : selected ? 'bg-[#fff1e8]' : 'bg-white'}`}
                            >
                              {({ attributes, listeners }) => <>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    {...attributes}
                                    {...listeners}
                                    disabled={!canManageTables}
                                    className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon touch-none cursor-grab active:cursor-grabbing"
                                    title={l.dragTable}
                                    aria-label={`${l.dragTable}: ${table.name}`}
                                  >
                                    <GripVertical size={17} aria-hidden="true" />
                                  </button>
                                  <label className="flex h-10 w-10 items-center justify-center">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={!canManageTables}
                                      onChange={() => toggleSelected(table.id)}
                                      className="h-4 w-4 rounded border-gray-300 accent-[#cc4800]"
                                      aria-label={`${l.select} ${table.name}`}
                                    />
                                  </label>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#22201d]">{table.name}</p>
                                  <p className="ws-caption md:hidden">{zoneLabel} · {l.sortOrder} {Number(table.sort_order) || 0}</p>
                                  {activeOrders && <p className="mt-1 text-xs font-medium text-[#bf4300]">{l.hasActiveOrders}</p>}
                                  {!activeOrders && hasHistory && <p className="ws-caption mt-1">{l.hasOrderHistory}</p>}
                                  {table.status === 'reserved' && table.reserved_for_name && (
                                    <p className="ws-caption mt-1 truncate">{table.reserved_for_name}</p>
                                  )}
                                </div>
                                <div className={`flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${zoneVisual.badge}`}>
                                  <MapPin size={12} aria-hidden="true" className="flex-shrink-0" />
                                  <span className="truncate">{zoneLabel}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-sm tabular-nums text-[#22201d]">
                                  <Users size={14} className="text-[#68655f]" aria-hidden="true" />
                                  <span className="sr-only">{l.capacity}: </span>
                                  {Number(table.capacity) || 4}
                                </div>
                                <div>
                                  <TableStatus table={table} labels={l} lang={lang} />
                                  {table.status === 'reserved' && table.reserved_at && (
                                    <p className="ws-caption mt-1 tabular-nums">{formatDateTime(table.reserved_at)}</p>
                                  )}
                                </div>
                                <div className="hidden items-center gap-1.5 text-sm tabular-nums text-[#22201d] md:flex">
                                  <Hash size={14} className="text-[#68655f]" aria-hidden="true" />
                                  {Number(table.sort_order) || 0}
                                </div>
                                <div className="flex items-center justify-end gap-1">
                                  {canManageTables ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openEdit(table)}
                                        className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"
                                        title={l.edit}
                                        aria-label={`${l.edit}: ${table.name}`}
                                      >
                                        <Edit2 size={15} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openEdit({ ...table, status: 'reserved' })}
                                        disabled={activeOrders || table.is_active === false}
                                        className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"
                                        title={l.reserve}
                                        aria-label={`${l.reserve}: ${table.name}`}
                                      >
                                        <CalendarClock size={15} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => requestDisable(table)}
                                        disabled={table.is_active === false}
                                        className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"
                                        title={l.disable}
                                        aria-label={`${l.disable}: ${table.name}`}
                                      >
                                        <PowerOff size={15} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => requestDelete(table)}
                                        disabled={!canHardDelete}
                                        className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon ml-2"
                                        title={deleteTitle}
                                        aria-label={`${deleteTitle}: ${table.name}`}
                                      >
                                        <Trash2 size={15} aria-hidden="true" />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="ws-caption" aria-hidden="true">—</span>
                                  )}
                                </div>
                              </>}
                            </SortableTableRow>
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {modal && (
        <WorkspaceDialog
          as="form"
          panelProps={{ onSubmit: save, noValidate: true }}
          variant="sheet"
          size="lg"
          title={modal === 'new' ? l.addTableTitle : l.editTableTitle}
          description={l.modalDescription}
          onClose={closeModal}
          closeLabel={l.close}
          busy={saving}
          initialFocusRef={nameInputRef}
          notice={saveError ? <p role="alert" className="ws-notice ws-tone-negative">{l[saveError]}</p> : null}
          footer={(
            <>
              <button type="button" onClick={closeModal} disabled={saving} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="submit" disabled={saving} className="ws-btn ws-btn-primary">
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {saving ? l.saving : l.save}
              </button>
            </>
          )}
        >
          <fieldset disabled={saving} className="grid gap-4">
            <Field label={l.tableName} error={l[errors.name]}>
              <input
                ref={nameInputRef}
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                placeholder={l.tableNamePlaceholder}
                aria-invalid={errors.name ? true : undefined}
                className="ws-input"
              />
            </Field>

            <Field label={l.zoneSection} error={l[errors.zone]}>
              <select
                value={form.zone_id}
                onChange={e => updateZone(e.target.value)}
                aria-invalid={errors.zone ? true : undefined}
                className="ws-input"
              >
                {tableZones.map(zone => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={l.capacity} error={l[errors.capacity]}>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={e => setForm(current => ({ ...current, capacity: e.target.value }))}
                  placeholder="4"
                  aria-invalid={errors.capacity ? true : undefined}
                  className="ws-input tabular-nums"
                />
              </Field>
              <Field label={l.sortOrder} error={l[errors.sort_order]}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.sort_order}
                  onChange={e => setForm(current => ({ ...current, sort_order: e.target.value }))}
                  placeholder="1"
                  aria-invalid={errors.sort_order ? true : undefined}
                  className="ws-input tabular-nums"
                />
              </Field>
            </div>

            <div className="border-t border-[#e4e1de] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p id="table-reserved-label" className="text-sm font-semibold text-[#22201d]">{l.reserved}</p>
                  <p id="table-reserved-hint" className="ws-caption">{reservationLocked ? l.lockedByActiveOrders : l.reservationDescription}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.status === 'reserved'}
                  aria-labelledby="table-reserved-label"
                  aria-describedby="table-reserved-hint"
                  disabled={reservationLocked}
                  onClick={() => setForm(current => {
                    const value = current.status !== 'reserved'
                    return {
                      ...current,
                      status: value ? 'reserved' : 'available',
                      reserved_for_name: value ? current.reserved_for_name : '',
                      reserved_for_phone: value ? current.reserved_for_phone : '',
                      reserved_at: value ? current.reserved_at : '',
                      reserved_until: value ? current.reserved_until : '',
                      reservation_notes: value ? current.reservation_notes : '',
                    }
                  })}
                  className="ws-switch flex-shrink-0"
                />
              </div>
              {form.status === 'reserved' && (
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
                    <Field label={l.guestName} error={l[errors.reserved_for_name]}>
                      <input
                        value={form.reserved_for_name}
                        onChange={e => setForm(current => ({ ...current, reserved_for_name: e.target.value }))}
                        placeholder={l.customerNamePlaceholder}
                        autoComplete="off"
                        aria-invalid={errors.reserved_for_name ? true : undefined}
                        className="ws-input"
                      />
                    </Field>
                    <Field label={l.phone}>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={form.reserved_for_phone}
                        onChange={e => setForm(current => ({ ...current, reserved_for_phone: e.target.value }))}
                        placeholder="+998..."
                        autoComplete="off"
                        className="ws-input"
                      />
                    </Field>
                  </div>
                  <Field as="div" label={l.reservationTime} error={l[errors.reserved_at]}>
                    <DateTimePicker
                      lang={lang} label={l.reservationTime}
                      value={form.reserved_at}
                      onChange={value => setForm(current => ({ ...current, reserved_at: value }))}
                      className="ws-input text-left"
                    />
                  </Field>
                  <Field as="div" label={l.reservedUntil} error={l[errors.reserved_until]}>
                    <DateTimePicker
                      lang={lang} label={l.reservedUntil}
                      value={form.reserved_until}
                      onChange={value => setForm(current => ({ ...current, reserved_until: value }))}
                      className="ws-input text-left"
                    />
                  </Field>
                  <Field label={l.notes}>
                    <textarea
                      value={form.reservation_notes}
                      onChange={e => setForm(current => ({ ...current, reservation_notes: e.target.value }))}
                      placeholder={l.notesPlaceholder}
                      rows={3}
                      className="ws-input"
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#e4e1de] pt-4">
              <div className="min-w-0">
                <p id="table-active-label" className="text-sm font-semibold text-[#22201d]">{l.active}</p>
                <p id="table-active-hint" className="ws-caption">{reservationLocked ? l.lockedByActiveOrders : l.activeDescription}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_active !== false}
                aria-labelledby="table-active-label"
                aria-describedby="table-active-hint"
                disabled={reservationLocked}
                onClick={() => setForm(current => ({ ...current, is_active: current.is_active === false }))}
                className="ws-switch flex-shrink-0"
              />
            </div>
          </fieldset>
        </WorkspaceDialog>
      )}

      {confirm && (
        <WorkspaceDialog
          variant="alert"
          size="md"
          title={l[confirmSpec.title](confirm.table.name)}
          description={l[confirmSpec.message]}
          onClose={closeConfirm}
          closeLabel={l.close}
          busy={confirmBusy}
          notice={confirmError ? <p role="alert" className="ws-notice ws-tone-negative">{l[confirmError]}</p> : null}
          footer={(
            <>
              <button type="button" onClick={closeConfirm} disabled={confirmBusy} className="ws-btn ws-btn-outline">
                {confirm.kind === 'cancelReservation' ? l.keepReservation : l.cancel}
              </button>
              <button
                type="button"
                onClick={runConfirm}
                disabled={confirmBusy}
                className={`ws-btn ${confirmSpec.danger ? 'ws-btn-danger-solid' : 'ws-btn-primary'}`}
              >
                {confirmBusy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {l[confirmSpec.action]}
              </button>
            </>
          )}
        />
      )}
    </AppShell>
  )
}

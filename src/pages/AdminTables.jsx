import { DateTimePicker } from '../components/CalendarPicker'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Edit2, Trash2, X, Table2, MapPin, Users, Hash, Power, PowerOff,
  CalendarClock, Phone, CheckCircle2, GripVertical,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import AppShell from '../components/AppShell'
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
    historyCheckFailed: 'Could not verify table history. Reload this page before deleting a table.',
    deleteTitle: name => `Delete ${name}?`,
    deleteMessage: 'This permanently removes the table. This is only allowed because it has no order history.',
    deleteTable: 'Delete table',
    couldNotDelete: 'Could not delete table',
    deletedNotice: name => `${name} deleted`,
    couldNotSave: 'Could not save table',
    tableAdded: 'Table added',
    tableUpdated: 'Table updated',
    todaysReservations: 'Today’s Reservations',
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
    historyCheckFailed: 'Не удалось проверить историю стола. Обновите страницу перед удалением.',
    deleteTitle: name => `Удалить ${name}?`,
    deleteMessage: 'Стол будет удалён навсегда. Это разрешено только если у него нет истории заказов.',
    deleteTable: 'Удалить стол',
    couldNotDelete: 'Не удалось удалить стол',
    deletedNotice: name => `${name} удалён`,
    couldNotSave: 'Не удалось сохранить стол',
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
    historyCheckFailed: 'Stol tarixini tekshirib bo‘lmadi. Stolni o‘chirishdan oldin sahifani yangilang.',
    deleteTitle: name => `${name} o‘chirib tashlansinmi?`,
    deleteMessage: 'Bu stol butunlay o‘chiriladi. Bu faqat buyurtma tarixi bo‘lmasa mumkin.',
    deleteTable: 'Stolni o‘chirib tashlash',
    couldNotDelete: 'Stol o‘chirilmadi',
    deletedNotice: name => `${name} o‘chirib tashlandi`,
    couldNotSave: 'Stol saqlanmadi',
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
  },
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `zone-${Date.now()}`
}

function makeTableId(name) {
  const suffix = slugify(name).slice(0, 36)
  return `tbl-${suffix}-${Date.now().toString(36)}`
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

function Modal({ title, description, onClose, children, maxWidth = 'sm:max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-dialog flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-black text-gray-900">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="max-h-[calc(92dvh-76px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${value ? 'bg-[#ff5a00]' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-gray-500">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  )
}

function StatusPill({ table, labels }) {
  if (table.is_active === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-black text-gray-500">
        <PowerOff size={11} /> {labels.disabled}
      </span>
    )
  }
  if (table.status === 'reserved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-black text-purple-700">
        <CalendarClock size={11} /> {labels.reserved}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
      <Power size={11} /> {labels.active}
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    orange: 'bg-orange-50 text-[#ff5a00]',
    green: 'bg-emerald-50 text-emerald-600',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.gray}`}>
        <Icon size={17} />
      </div>
      <p className="text-2xl font-black leading-none text-[#1F2937]">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

function ReservationStrip({ reservations, labels, canEdit, onSeat, onCancel, onCall }) {
  return (
    <div className="mb-5 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <CalendarClock size={17} />
          </span>
          <div>
            <p className="text-sm font-black text-[#1F2937]">{labels.todaysReservations}</p>
            <p className="text-xs font-semibold text-gray-400">
              {reservations.length > 0 ? `${reservations.length}` : labels.noReservationsToday}
            </p>
          </div>
        </div>
      </div>
      {reservations.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {reservations.map(({ table, reservation }) => (
            <div key={table.id} className="min-w-[270px] rounded-2xl border border-purple-100 bg-purple-50/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#1F2937]">{table.name}</p>
                  <p className="truncate text-xs font-bold text-purple-700">{reservation.name || '-'}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-purple-700">
                  {formatTime(reservation.startsAt)}
                </span>
              </div>
              <div className={`mt-3 grid gap-1.5 ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {canEdit && (
                  <>
                    <button onClick={() => onSeat(table)} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-purple-600 text-[11px] font-black text-white">
                      <CheckCircle2 size={12} />
                      {labels.seat}
                    </button>
                    <button onClick={() => onCancel(table)} className="h-8 rounded-lg border border-purple-100 bg-white text-[11px] font-black text-purple-700">
                      {labels.cancelReservation}
                    </button>
                  </>
                )}
                <button
                  onClick={() => onCall(reservation.phone)}
                  disabled={!reservation.phone}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-purple-100 bg-white text-[11px] font-black text-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Phone size={12} />
                  {labels.call}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
      className={`${className} ${isDragging ? 'bg-blue-50 shadow-xl ring-2 ring-blue-300' : ''}`}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

export default function AdminTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'en'
  const l = L[lang] || L.en
  const canManageTables = canEditFeature(profile || { role: state.user?.role }, 'settings')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(() => normalizeTable({}))
  const [zoneName, setZoneName] = useState('')
  const [zoneError, setZoneError] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkZoneId, setBulkZoneId] = useState('')
  const [bulkCapacity, setBulkCapacity] = useState('')
  const [historicalTableIds, setHistoricalTableIds] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  useEffect(() => {
    let cancelled = false
    loadTableOrderHistoryIds()
      .then(ids => {
        if (!cancelled) setHistoricalTableIds(new Set(ids))
      })
      .catch(error => {
        if (cancelled) return
        setHistoricalTableIds(null)
        setNotice({ tone: 'error', message: error?.message || l.historyCheckFailed })
      })
    return () => { cancelled = true }
  }, [l.historyCheckFailed])

  const tableZones = useMemo(() => {
    const stored = state.tableZones || []
    const names = new Map()
    stored.forEach(zone => names.set(zone.name.toLowerCase(), zone))
    state.tables.forEach(table => {
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
  }, [state.tableZones, state.tables])

  const sortedTables = useMemo(() =>
    [...state.tables].sort((a, b) =>
      (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
      String(a.zone_name || '').localeCompare(String(b.zone_name || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    ),
    [state.tables]
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

  const activeCount = state.tables.filter(table => table.is_active !== false).length
  const disabledCount = state.tables.length - activeCount
  const reservedCount = state.tables.filter(table => table.is_active !== false && table.status === 'reserved').length
  const todaysReservations = useMemo(() => getTodaysReservations(state.tables, new Date()), [state.tables])
  const selectedTables = useMemo(() =>
    sortedTables.filter(table => selectedIds.includes(table.id)),
    [selectedIds, sortedTables]
  )

  function openNew() {
    if (!canManageTables) return
    const nextSort = state.tables.reduce((max, table) => Math.max(max, Number(table.sort_order) || 0), 0) + 1
    const firstZone = tableZones[0] || { id: 'main-hall', name: 'Main Hall' }
    setForm(normalizeTable({
      id: '',
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
    setErrors({})
    setModal('new')
  }

  function openEdit(table) {
    if (!canManageTables) return
    setForm(normalizeTable(table, tableZones))
    setErrors({})
    setModal('edit')
  }

  function validate(nextForm) {
    const nextErrors = {}
    const name = nextForm.name.trim()
    if (!name) nextErrors.name = l.requiredTableName
    const duplicate = state.tables.some(table =>
      table.id !== nextForm.id && table.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) nextErrors.name = l.uniqueTableName
    if (!Number.isFinite(Number(nextForm.capacity)) || Number(nextForm.capacity) <= 0) {
      nextErrors.capacity = l.positiveCapacity
    }
    if (!Number.isFinite(Number(nextForm.sort_order))) {
      nextErrors.sort_order = l.numericSortOrder
    }
    if (!nextForm.zone_name.trim()) nextErrors.zone = l.requiredZone
    if (nextForm.status === 'reserved') {
      if (!nextForm.reserved_for_name.trim()) nextErrors.reserved_for_name = l.requiredGuestName
      if (!nextForm.reserved_at) nextErrors.reserved_at = l.requiredReservationTime
      if (nextForm.reserved_until && nextForm.reserved_at && new Date(nextForm.reserved_until) <= new Date(nextForm.reserved_at)) {
        nextErrors.reserved_until = l.invalidReservationEnd
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

  async function save() {
    if (!canManageTables) return
    const selectedZone = tableZones.find(z => z.id === form.zone_id || z.name === form.zone_name)
    const payload = {
      ...form,
      id: form.id || makeTableId(form.name),
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

    const result = await dispatch({ type: modal === 'new' ? 'ADD_TABLE' : 'UPDATE_TABLE', payload })
    if (result?.error) {
      setNotice({ tone: 'error', message: result.error.message || l.couldNotSave })
      return
    }
    setModal(null)
    setNotice({ tone: 'success', message: modal === 'new' ? l.tableAdded : l.tableUpdated })
  }

  async function addZone() {
    if (!canManageTables) return
    const name = zoneName.trim()
    setZoneError('')
    if (!name) {
      setZoneError(l.requiredZoneName)
      return
    }
    if (tableZones.some(zone => zone.name.toLowerCase() === name.toLowerCase())) {
      setZoneError(l.uniqueZoneName)
      return
    }
    const payload = {
      id: slugify(name),
      name,
      sort_order: tableZones.reduce((max, zone) => Math.max(max, Number(zone.sort_order) || 0), 0) + 1,
      is_active: true,
    }
    const result = await dispatch({ type: 'ADD_TABLE_ZONE', payload })
    if (result?.error) {
      setZoneError(result.error.message || l.couldNotAddZone)
      return
    }
    setZoneName('')
    setNotice({ tone: 'success', message: l.zoneAdded })
  }

  function requestDisable(table) {
    if (!canManageTables) return
    const check = canDisableTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', message: l.closeActiveBeforeDisable })
      return
    }
    setConfirm({
      title: l.disableTitle(table.name),
      message: l.disableMessage,
      actionLabel: l.disableTable,
      tone: 'orange',
      onConfirm: async () => {
        const result = await dispatch({
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
        })
        if (result?.error) {
          setNotice({ tone: 'error', message: result.error.message || l.couldNotDisable })
        } else {
          setNotice({ tone: 'success', message: l.disabledNotice(table.name) })
        }
        setConfirm(null)
      },
    })
  }

  function requestDelete(table) {
    if (!canManageTables) return
    if (!historicalTableIds) {
      setNotice({ tone: 'error', message: l.historyCheckFailed })
      return
    }
    const check = canDeleteTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', message: l.activeOrdersDeleteBlock })
      return
    }
    if (!check.ok && check.reason === 'order_history') {
      setNotice({ tone: 'error', message: l.historyDeleteBlock })
      return
    }
    if (orderStats.history.has(table.id)) {
      setNotice({ tone: 'error', message: l.historyDeleteBlock })
      return
    }
    setConfirm({
      title: l.deleteTitle(table.name),
      message: l.deleteMessage,
      actionLabel: l.deleteTable,
      tone: 'red',
      onConfirm: async () => {
        const result = await dispatch({ type: 'DELETE_TABLE', payload: table.id })
        if (result?.error) {
          setNotice({ tone: 'error', message: result.error.message || l.couldNotDelete })
        } else {
          setNotice({ tone: 'success', message: l.deletedNotice(table.name) })
        }
        setConfirm(null)
      },
    })
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
    if (selectedIds.length === sortedTables.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(sortedTables.map(table => table.id))
    }
  }

  async function applyBulkUpdates({ renumber = false } = {}) {
    if (!canManageTables) return
    if (selectedTables.length === 0) return
    const selectedZone = tableZones.find(zone => zone.id === bulkZoneId)
    const nextCapacity = bulkCapacity === '' ? null : Math.max(1, Math.round(Number(bulkCapacity) || 1))
    for (let index = 0; index < selectedTables.length; index += 1) {
      const table = selectedTables[index]
      await dispatch({
        type: 'UPDATE_TABLE',
        payload: {
          ...table,
          ...(selectedZone ? { zone_id: selectedZone.id, zone_name: selectedZone.name } : {}),
          ...(nextCapacity ? { capacity: nextCapacity } : {}),
          ...(renumber ? { sort_order: index + 1 } : {}),
        },
      })
    }
    setNotice({ tone: 'success', message: l.bulkUpdated })
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
      setNotice({ tone: 'error', message: result.error.message || l.reorderFailed })
    }
  }

  function seatReservation(table) {
    if (!canManageTables) return
    dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
    navigate(`/waiter/order/${table.id}`)
  }

  function cancelReservation(table) {
    if (!canManageTables) return
    dispatch({ type: 'UPDATE_TABLE', payload: clearReservationPatch(table) })
  }

  function callReservation(phone) {
    if (!phone) return
    window.location.href = `tel:${phone}`
  }

  return (
    <AppShell title={l.title}>
      <div className="mx-auto max-w-[1180px] px-5 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">{l.description}</p>
          </div>
          {canManageTables && (
            <button
              onClick={openNew}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white shadow-lg shadow-orange-100 transition-colors hover:bg-[#cc4800]"
            >
              <Plus size={16} />
              {l.addTable}
            </button>
          )}
        </div>

        {notice && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
            notice.tone === 'error'
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}>
            {notice.message}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={Table2} label={l.tables} value={state.tables.length} tone="orange" />
          <SummaryCard icon={Power} label={l.active} value={activeCount} tone="green" />
          <SummaryCard icon={CalendarClock} label={l.reserved} value={reservedCount} tone="purple" />
          <SummaryCard icon={PowerOff} label={l.disabled} value={disabledCount} tone="gray" />
        </div>

        <ReservationStrip
          reservations={todaysReservations}
          labels={l}
          canEdit={canManageTables}
          onSeat={seatReservation}
          onCancel={cancelReservation}
          onCall={callReservation}
        />

        <div className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#1F2937]">{l.zones}</p>
              <p className="text-xs text-gray-500">{l.zonesDescription}</p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {tableZones.map(zone => (
              <span key={zone.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getTableZoneVisual(zone, tableZones).badge}`}>
                <span className={`h-2 w-2 rounded-full ${getTableZoneVisual(zone, tableZones).dot}`} aria-hidden="true" />
                {zone.name}
              </span>
            ))}
          </div>
          {canManageTables && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={zoneName}
                  onChange={e => setZoneName(e.target.value)}
                  placeholder={l.addZonePlaceholder}
                  className="h-10 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                />
                <button
                  onClick={addZone}
                  className="h-10 rounded-xl border border-[#E5E7EB] bg-gray-50 px-4 text-sm font-black text-[#1F2937] transition-colors hover:bg-gray-100"
                >
                  {l.addZone}
                </button>
              </div>
              {zoneError && <p className="mt-2 text-xs font-bold text-red-600">{zoneError}</p>}
            </>
          )}
        </div>

        {canManageTables && selectedIds.length > 0 && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-[#1F2937]">{l.bulkActions}</p>
                <p className="text-xs font-semibold text-blue-700">{l.selected(selectedIds.length)}</p>
              </div>
              <button onClick={() => setSelectedIds([])} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
                {l.clearSelection}
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_160px_auto_auto]">
              <select
                value={bulkZoneId}
                onChange={e => setBulkZoneId(e.target.value)}
                className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-[#1F2937] outline-none"
              >
                <option value="">{l.bulkZone}</option>
                {tableZones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
              <input
                type="number"
                min="1"
                value={bulkCapacity}
                onChange={e => setBulkCapacity(e.target.value)}
                placeholder={l.bulkCapacity}
                className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-[#1F2937] outline-none"
              />
              <button onClick={() => applyBulkUpdates()} className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-black text-white">
                {l.applyBulk}
              </button>
              <button onClick={() => applyBulkUpdates({ renumber: true })} className="h-10 rounded-xl border border-blue-100 bg-white px-4 text-sm font-black text-blue-700">
                {l.renumberSelected}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="hidden grid-cols-[64px_1.3fr_1fr_0.7fr_1fr_0.7fr_150px] gap-3 border-b border-[#F3F4F6] bg-gray-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 md:grid">
            <button onClick={toggleAllSelected} className="text-left">{l.select}</button>
            <span>{l.tableName}</span>
            <span>{l.zoneSection}</span>
            <span>{l.capacity}</span>
            <span>{l.status}</span>
            <span>{l.sortOrder}</span>
            <span className="text-right">{l.actions}</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
            <SortableContext items={sortedTables.map(table => table.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-[#F3F4F6]">
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
              return (
                <SortableTableRow
                  key={table.id}
                  tableId={table.id}
                  disabled={!canManageTables}
                  className={`grid gap-3 px-4 py-4 md:grid-cols-[64px_1.3fr_1fr_0.7fr_1fr_0.7fr_150px] md:items-center ${table.is_active === false ? 'bg-gray-50/70' : selected ? 'bg-blue-50/40' : 'bg-white'}`}
                >
                  {({ attributes, listeners }) => <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      {...attributes}
                      {...listeners}
                      disabled={!canManageTables}
                      className="touch-none cursor-grab rounded-lg p-1 text-gray-300 transition-colors hover:bg-blue-50 hover:text-blue-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
                      title={l.dragTable}
                      aria-label={`${l.dragTable}: ${table.name}`}
                    >
                      <GripVertical size={17} />
                    </button>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!canManageTables}
                      onChange={() => toggleSelected(table.id)}
                      className="h-4 w-4 rounded border-gray-300 text-[#ff5a00]"
                      aria-label={`${l.select} ${table.name}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1F2937]">{table.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400 md:hidden">{table.zone_name || 'Main Hall'} · sort {Number(table.sort_order) || 0}</p>
                    {activeOrders && <p className="mt-1 text-xs font-bold text-orange-600">{l.hasActiveOrders}</p>}
                    {!activeOrders && hasHistory && <p className="mt-1 text-xs font-semibold text-gray-400">{l.hasOrderHistory}</p>}
                    {table.status === 'reserved' && table.reserved_for_name && (
                      <p className="mt-1 text-xs font-bold text-purple-600">{table.reserved_for_name}</p>
                    )}
                  </div>
                  <div className={`flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold ${zoneVisual.badge}`}>
                    <MapPin size={12} />
                    {table.zone_name || 'Main Hall'}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
                    <Users size={14} className="text-gray-300" />
                    {Number(table.capacity) || 4}
                  </div>
                  <div>
                    <StatusPill table={table} labels={l} />
                    {table.status === 'reserved' && table.reserved_at && (
                      <p className="mt-1 text-xs font-semibold text-gray-400">{formatDateTime(table.reserved_at)}</p>
                    )}
                  </div>
                  <div className="hidden items-center gap-1.5 text-sm font-semibold text-gray-600 md:flex">
                    <Hash size={14} className="text-gray-300" />
                    {Number(table.sort_order) || 0}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {canManageTables ? (
                      <>
                        <button
                          onClick={() => openEdit(table)}
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-orange-50 hover:text-[#ff5a00]"
                          title={l.edit}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => openEdit({ ...table, status: 'reserved' })}
                          disabled={activeOrders || table.is_active === false}
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-purple-50 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
                          title={l.reserve}
                        >
                          <CalendarClock size={15} />
                        </button>
                        <button
                          onClick={() => requestDisable(table)}
                          disabled={table.is_active === false}
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                          title={l.disable}
                        >
                          <PowerOff size={15} />
                        </button>
                        <button
                          onClick={() => requestDelete(table)}
                          disabled={!canHardDelete}
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          title={deleteTitle}
                          aria-label={deleteTitle}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-gray-300">—</span>
                    )}
                  </div>
                  </>}
                </SortableTableRow>
              )
            })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'new' ? l.addTableTitle : l.editTableTitle}
          description={l.modalDescription}
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            <Field label={l.tableName} error={errors.name}>
              <input
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                placeholder={l.tableNamePlaceholder}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </Field>

            <Field label={l.zoneSection} error={errors.zone}>
              <select
                value={form.zone_id}
                onChange={e => updateZone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
              >
                {tableZones.map(zone => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={l.capacity} error={errors.capacity}>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={e => setForm(current => ({ ...current, capacity: e.target.value }))}
                  placeholder="4"
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </Field>
              <Field label={l.sortOrder} error={errors.sort_order}>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(current => ({ ...current, sort_order: e.target.value }))}
                  placeholder="1"
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-[#E5E7EB] bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#1F2937]">{l.reserved}</p>
                  <p className="text-xs text-gray-500">{l.reservationDescription}</p>
                </div>
                <Toggle
                  value={form.status === 'reserved'}
                  onChange={value => setForm(current => ({
                    ...current,
                    status: value ? 'reserved' : 'available',
                    reserved_for_name: value ? current.reserved_for_name : '',
                    reserved_for_phone: value ? current.reserved_for_phone : '',
                    reserved_at: value ? current.reserved_at : '',
                    reserved_until: value ? current.reserved_until : '',
                    reservation_notes: value ? current.reservation_notes : '',
                  }))}
                  disabled={modal === 'edit' && orderStats.active.has(form.id)}
                />
              </div>
              {form.status === 'reserved' && (
                <div className="grid gap-3">
                  <Field label={l.guestName} error={errors.reserved_for_name}>
                    <input
                      value={form.reserved_for_name}
                      onChange={e => setForm(current => ({ ...current, reserved_for_name: e.target.value }))}
                      placeholder={l.customerNamePlaceholder}
                      className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={l.phone}>
                      <input
                        value={form.reserved_for_phone}
                        onChange={e => setForm(current => ({ ...current, reserved_for_phone: e.target.value }))}
                        placeholder="+998..."
                        className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                      />
                    </Field>
                    <Field label={l.reservationTime} error={errors.reserved_at}>
                      <DateTimePicker
                        lang={lang} label={l.reservationTime}
                        value={form.reserved_at}
                        onChange={value => setForm(current => ({ ...current, reserved_at: value }))}
                        className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                      />
                    </Field>
                  </div>
                  <Field label={l.reservedUntil} error={errors.reserved_until}>
                    <DateTimePicker
                      lang={lang} label={l.reservedUntil}
                      value={form.reserved_until}
                      onChange={value => setForm(current => ({ ...current, reserved_until: value }))}
                      className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                  <Field label={l.notes}>
                    <textarea
                      value={form.reservation_notes}
                      onChange={e => setForm(current => ({ ...current, reservation_notes: e.target.value }))}
                      placeholder={l.notesPlaceholder}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[#E5E7EB] bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1F2937]">{l.active}</p>
                <p className="text-xs text-gray-500">{l.activeDescription}</p>
              </div>
              <Toggle
                value={form.is_active !== false}
                onChange={value => setForm(current => ({ ...current, is_active: value }))}
                disabled={modal === 'edit' && orderStats.active.has(form.id)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-black text-gray-600 transition-colors hover:bg-gray-50"
              >
                {l.cancel}
              </button>
              <button
                onClick={save}
                className="h-11 flex-1 rounded-xl bg-[#ff5a00] text-sm font-black text-white shadow-md shadow-orange-100 transition-colors hover:bg-[#cc4800]"
              >
                {l.save}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} description={confirm.message} onClose={() => setConfirm(null)} maxWidth="sm:max-w-md">
          <div className="flex gap-2">
            <button
              onClick={() => setConfirm(null)}
              className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-black text-gray-600 transition-colors hover:bg-gray-50"
            >
              {l.cancel}
            </button>
            <button
              onClick={confirm.onConfirm}
              className={`h-11 flex-1 rounded-xl text-sm font-black text-white transition-colors ${
                confirm.tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#ff5a00] hover:bg-[#cc4800]'
              }`}
            >
              {confirm.actionLabel}
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}

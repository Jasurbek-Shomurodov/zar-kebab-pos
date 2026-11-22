import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2, ReceiptText, RefreshCw, SearchX, ShieldCheck, UserRound } from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError } from '../components/OperationalState'
import { Shimmer } from '../components/PageShimmer'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'
import { ORDER_TYPE_LABELS, inferOrderType, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { formatDateTime, parseInstantDate } from '../lib/dateFormat'

// The page reads the newest changes only; the list says so (see `limitNote`).
const AUDIT_LIMIT = 100

function fmtDate(value, lang = 'ru') {
  return formatDateTime(value, '—')
}

function shortOrderId(orderId) {
  return String(orderId || '').slice(-6).toUpperCase() || '—'
}

function actorLabel(row) {
  return row.actor?.full_name || row.actor?.email || row.actor_id || '—'
}

function orderAuditLabel(row, lang) {
  const order = row.order
  if (!order) return `#${shortOrderId(row.order_id)}`
  const orderType = inferOrderType(order)
  if (isOffPremiseOrderType(orderType)) {
    return `${orderTypeLabel(orderType, lang)} · ${order.order_number || row.order_id}`
  }
  return order.table_name || `#${shortOrderId(row.order_id)}`
}

function orderAuditMeta(row, l) {
  const order = row.order
  const parts = []
  if (order?.order_number && !orderAuditLabel(row, 'en').includes(order.order_number)) parts.push(order.order_number)
  if (order?.waiter_name) parts.push(order.waiter_name)
  parts.push(`${l.rawId}: ${shortOrderId(row.order_id)}`)
  return parts.join(' · ')
}

function groupAuditRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = row.order_id || row.id
    if (!map.has(key)) map.set(key, { orderId: key, order: row.order, rows: [] })
    const group = map.get(key)
    group.order ||= row.order
    group.rows.push(row)
  }
  return [...map.values()]
    .map(group => ({
      ...group,
      rows: group.rows.sort((a, b) => parseInstantDate(b.changed_at || 0) - parseInstantDate(a.changed_at || 0)),
    }))
    .sort((a, b) => parseInstantDate(b.rows[0]?.changed_at || 0) - parseInstantDate(a.rows[0]?.changed_at || 0))
}

function actionLabel(action, lang) {
  const labels = {
    mark_paid: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', en: 'Payment confirmed' },
    payment_fields_changed: { uz: 'To‘lov summasi o‘zgardi', ru: 'Изменены суммы оплаты', en: 'Payment fields changed' },
    status_changed: { uz: 'Status o‘zgardi', ru: 'Статус изменён', en: 'Status changed' },
    reopen_paid_order: { uz: 'To‘langan buyurtma ochildi', ru: 'Оплаченный заказ открыт', en: 'Paid order reopened' },
    payment_method_changed: { uz: 'To‘lov turi o‘zgardi', ru: 'Способ оплаты изменён', en: 'Payment method changed' },
    order_item_deleted: { uz: 'Taom o‘chirildi', ru: 'Блюдо удалено', en: 'Order item deleted' },
    order_cancelled: { uz: 'Buyurtma bekor qilindi', ru: 'Заказ отменён', en: 'Order cancelled' },
    settle_loyalty_wallet_payment: { uz: 'Sodiqlik to‘lovi hisoblandi', ru: 'Расчёт оплаты лояльностью', en: 'Loyalty wallet payment settled' },
  }
  return labels[action]?.[lang] || action || '—'
}

function paymentMethodLabel(method, lang) {
  const labels = {
    cash: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
    card: { uz: 'Karta', ru: 'Карта', en: 'Card' },
    terminal: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
    qr: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
    qr_code: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
    loyalty: { uz: 'Sodiqlik balansi', ru: 'Баланс лояльности', en: 'Loyalty balance' },
    loyalty_card: { uz: 'Sodiqlik kartasi', ru: 'Карта лояльности', en: 'Loyalty card' },
    split: { uz: 'Bo‘lingan to‘lov', ru: 'Раздельная оплата', en: 'Split payment' },
  }
  if (!method) return '—'
  return labels[method]?.[lang] || method
}

function statusLabel(status, lang) {
  const labels = {
    active: { uz: 'Faol', ru: 'Активен', en: 'Active' },
    preparing: { uz: 'Tayyorlanmoqda', ru: 'Готовится', en: 'Preparing' },
    ready: { uz: 'Tayyor', ru: 'Готов', en: 'Ready' },
    served: { uz: 'Berildi', ru: 'Подано', en: 'Served' },
    needs_bill: { uz: 'Hisob kerak', ru: 'Нужен счёт', en: 'Needs bill' },
    paid: { uz: 'To‘landi', ru: 'Оплачен', en: 'Paid' },
    cancelled: { uz: 'Bekor qilingan', ru: 'Отменён', en: 'Cancelled' },
    unpaid: { uz: 'To‘lanmagan', ru: 'Не оплачен', en: 'Unpaid' },
    pending: { uz: 'Kutilmoqda', ru: 'Ожидает', en: 'Pending' },
    take_away: ORDER_TYPE_LABELS.take_away,
    delivery: ORDER_TYPE_LABELS.delivery,
    game_club: ORDER_TYPE_LABELS.game_club,
    'Game Club': ORDER_TYPE_LABELS.game_club,
    'Take Away': ORDER_TYPE_LABELS.take_away,
    Delivery: ORDER_TYPE_LABELS.delivery,
  }
  if (!status) return '—'
  return labels[status]?.[lang] || status
}

export default function AdminAudit() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const l = {
    uz: {
      title: 'Audit',
      sub: 'To‘lovlar va pul maydonlari o‘zgarishlari',
      refresh: 'Yangilash',
      empty: 'Audit yozuvlari yo‘q',
      emptyHint: 'To‘lov yoki buyurtma summasi o‘zgarganda yozuv shu yerda paydo bo‘ladi.',
      noMatches: 'Filtrlarga mos yozuv yo‘q',
      noMatchesHint: 'Qidiruv faqat oxirgi 100 ta o‘zgarish ichida ishlaydi.',
      clearFilters: 'Filtrlarni tozalash',
      limitNote: count => `Oxirgi ${count} ta o‘zgarish ko‘rsatiladi. Eskilari bu ro‘yxatda yo‘q.`,
      loading: 'Audit yuklanmoqda',
      error: 'Auditni yuklab bo‘lmadi',
      order: 'Buyurtma',
      action: 'Amal',
      total: 'Jami',
      service: 'Servis',
      discount: 'Sodiqlik',
      method: 'To‘lov',
      status: 'Status',
      time: 'Vaqt',
      latest: 'Oxirgi',
      changes: 'O‘zgarishlar',
      actor: 'Kim o‘zgartirdi',
      rawId: 'ID',
      details: 'Tafsilotlar',
      before: 'Oldin',
      after: 'Keyin',
      filters: 'Filtrlar',
      searchPlaceholder: 'Buyurtma, foydalanuvchi yoki amal...',
      allActions: 'Barcha amallar',
      allStatuses: 'Barcha statuslar',
      migrationMissing: 'Audit jadvali hali bazada yaratilmagan. Supabase SQL editorida migrations/010_order_payment_audit_and_guards.sql migratsiyasini ishga tushiring.',
    },
    ru: {
      title: 'Аудит',
      sub: 'Изменения оплат и денежных полей',
      refresh: 'Обновить',
      empty: 'Записей аудита пока нет',
      emptyHint: 'Запись появится здесь, когда изменится оплата или сумма заказа.',
      noMatches: 'Нет записей по этим фильтрам',
      noMatchesHint: 'Поиск идёт только среди последних 100 изменений.',
      clearFilters: 'Сбросить фильтры',
      limitNote: count => `Показаны последние ${count} изменений. Более старых в этом списке нет.`,
      loading: 'Загрузка аудита',
      error: 'Не удалось загрузить аудит',
      order: 'Заказ',
      action: 'Действие',
      total: 'Итого',
      service: 'Сервис',
      discount: 'Лояльность',
      method: 'Оплата',
      status: 'Статус',
      time: 'Время',
      latest: 'Последнее',
      changes: 'Изменения',
      actor: 'Кто изменил',
      rawId: 'ID',
      details: 'Детали',
      before: 'Было',
      after: 'Стало',
      filters: 'Фильтры',
      searchPlaceholder: 'Заказ, пользователь или действие...',
      allActions: 'Все действия',
      allStatuses: 'Все статусы',
      migrationMissing: 'Таблица аудита ещё не создана в базе. Запустите миграцию migrations/010_order_payment_audit_and_guards.sql в Supabase SQL Editor.',
    },
    en: {
      title: 'Audit',
      sub: 'Payment and money-field changes',
      refresh: 'Refresh',
      empty: 'No audit records yet',
      emptyHint: 'A record appears here when a payment or an order amount changes.',
      noMatches: 'Nothing matches the filters',
      noMatchesHint: 'The search covers only the latest 100 changes.',
      clearFilters: 'Clear filters',
      limitNote: count => `Showing the latest ${count} changes. Older ones are not in this list.`,
      loading: 'Loading the audit',
      error: 'Could not load audit',
      order: 'Order',
      action: 'Action',
      total: 'Total',
      service: 'Service',
      discount: 'Loyalty used',
      method: 'Payment',
      status: 'Status',
      time: 'Time',
      latest: 'Latest',
      changes: 'Changes',
      actor: 'Changed by',
      rawId: 'ID',
      details: 'Details',
      before: 'Before',
      after: 'After',
      filters: 'Filters',
      searchPlaceholder: 'Order, user or action…',
      allActions: 'All actions',
      allStatuses: 'All statuses',
      migrationMissing: 'The audit table has not been created in the database yet. Run migrations/010_order_payment_audit_and_guards.sql in the Supabase SQL Editor.',
    },
  }[lang] || {}

  async function loadAudit() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('order_payment_audit')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(AUDIT_LIMIT)

    if (error) {
      // Kept as a code and worded at render; the raw backend text stays in the console.
      console.error('[audit] load failed:', error)
      const tableMissing = /order_payment_audit|schema cache|does not exist|not find the table/i.test(error.message || '')
        || error.code === '42P01' || error.code === 'PGRST205'
      setError(tableMissing ? 'migrationMissing' : 'failed')
      setRows([])
    } else {
      const auditRows = data || []
      const orderIds = [...new Set(auditRows.map(row => row.order_id).filter(Boolean))]
      const actorIds = [...new Set(auditRows.map(row => row.actor_id).filter(Boolean))]

      const [ordersRes, profilesRes] = await Promise.all([
        orderIds.length > 0
          ? supabase
              .from('orders')
              .select('id, order_number, table_name, table_id, order_type, status, payment_status, waiter_name, total, created_at, paid_at')
              .in('id', orderIds)
          : Promise.resolve({ data: [] }),
        actorIds.length > 0
          ? supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', actorIds)
          : Promise.resolve({ data: [] }),
      ])

      const ordersById = Object.fromEntries((ordersRes.data || []).map(order => [order.id, order]))
      const profilesById = Object.fromEntries((profilesRes.data || []).map(profile => [profile.id, profile]))
      setRows(auditRows.map(row => ({
        ...row,
        order: ordersById[row.order_id] || null,
        actor: profilesById[row.actor_id] || null,
      })))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAudit()
  }, [])

  const actions = useMemo(() => [...new Set(rows.map(row => row.action).filter(Boolean))].sort(), [rows])
  const statuses = useMemo(() => [...new Set(rows.flatMap(row => [row.old_status, row.new_status, row.old_payment_status, row.new_payment_status]).filter(Boolean))].sort(), [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row => {
      const matchAction = actionFilter === 'all' || row.action === actionFilter
      const matchStatus = statusFilter === 'all' ||
        row.old_status === statusFilter ||
        row.new_status === statusFilter ||
        row.old_payment_status === statusFilter ||
        row.new_payment_status === statusFilter
      const haystack = [
        row.order_id,
        row.order?.order_number,
        row.order?.table_name,
        orderAuditLabel(row, lang),
        row.action,
        row.actor_id,
        actorLabel(row),
        row.old_status,
        row.new_status,
        row.old_payment_status,
        row.new_payment_status,
        row.old_payment_method,
        row.new_payment_method,
      ].join(' ').toLowerCase()
      return matchAction && matchStatus && (!q || haystack.includes(q))
    })
  }, [actionFilter, lang, rows, search, statusFilter])

  const groupedRows = useMemo(() => groupAuditRows(filteredRows), [filteredRows])

  const content = useMemo(() => {
    if (loading) {
      return (
        <div role="status" aria-label={l.loading}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="ws-row flex items-center gap-3 px-5 py-4">
              <Shimmer className="h-9 w-9 flex-shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Shimmer className="h-3 w-16" />
                <Shimmer className={`h-4 ${index % 2 ? 'w-2/5' : 'w-1/3'}`} />
                <Shimmer className="h-3 w-1/2" />
              </div>
              <Shimmer className="hidden h-6 w-28 rounded-full sm:block" />
              <Shimmer className="hidden h-3 w-24 sm:block" />
            </div>
          ))}
        </div>
      )
    }

    if (error === 'migrationMissing') {
      return (
        <div className="p-4">
          <div className="ws-notice ws-tone-negative" role="alert">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} aria-hidden="true" />
              {l.error}
            </div>
            <p className="mt-1.5 font-normal">{l.migrationMissing}</p>
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs font-normal text-[#22201d] [overflow-wrap:anywhere]">
              migrations/010_order_payment_audit_and_guards.sql
            </p>
          </div>
        </div>
      )
    }

    if (error) {
      return <OperationalError lang={lang} title={l.error} onAction={loadAudit} />
    }

    if (rows.length === 0) {
      return (
        <div className="ws-empty">
          <ShieldCheck aria-hidden="true" />
          <h3>{l.empty}</h3>
          <p>{l.emptyHint}</p>
        </div>
      )
    }

    if (groupedRows.length === 0) {
      return (
        <div className="ws-empty">
          <SearchX aria-hidden="true" />
          <h3>{l.noMatches}</h3>
          <p>{l.noMatchesHint}</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setActionFilter('all'); setStatusFilter('all') }}
            className="ws-btn ws-btn-outline"
          >
            {l.clearFilters}
          </button>
        </div>
      )
    }

    return groupedRows.map((group, index) => {
      const latest = group.rows[0]
      return (
        <details key={group.orderId} open={index === 0} className="ws-row group">
          <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 outline-none marker:hidden focus-visible:bg-[#f6f5f3] sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#ff5a00]/10 text-[#ff5a00]">
                <ReceiptText size={16} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="ws-caption font-medium">{l.order}</p>
                <p className="truncate text-[15px] font-semibold text-[#22201d]">{orderAuditLabel(latest, lang)}</p>
                <p className="ws-caption truncate">{orderAuditMeta(latest, l)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className={`ws-badge ${actionTone(latest.action)}`}>
                {actionLabel(latest.action, lang)}
              </span>
              <span className="ws-badge">
                <span className="tabular-nums">{group.rows.length}</span> {l.changes}
              </span>
              <span className="ws-caption tabular-nums">{fmtDate(latest.changed_at, lang)}</span>
              <ChevronDown size={16} aria-hidden="true" className="text-[#68655f] transition-transform group-open:rotate-180" />
            </div>
          </summary>

          <div className="border-t border-[#e4e1de] bg-[#faf9f7]">
            {group.rows.map(row => (
              <div key={row.id} className="grid gap-4 border-b border-[#e4e1de] px-5 py-4 text-sm last:border-b-0 md:grid-cols-[180px_1fr]">
                <div className="space-y-3">
                  <div>
                    <p className="ws-caption font-medium">{l.time}</p>
                    <p className="mt-0.5 font-medium tabular-nums text-[#22201d]">{fmtDate(row.changed_at, lang)}</p>
                  </div>
                  <div>
                    <p className="ws-caption font-medium">{l.action}</p>
                    <span className={`ws-badge mt-1 ${actionTone(row.action)}`}>{actionLabel(row.action, lang)}</span>
                  </div>
                  <div>
                    <p className="ws-caption flex items-center gap-1 font-medium">
                      <UserRound size={12} aria-hidden="true" />
                      {l.actor}
                    </p>
                    <p className="mt-0.5 break-words font-medium text-[#22201d]">{actorLabel(row)}</p>
                  </div>
                </div>

                <div className="grid content-start gap-x-4 gap-y-3 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
                  <AuditValue label={l.total} oldValue={formatCurrency(row.old_total || 0)} newValue={formatCurrency(row.new_total || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.service} oldValue={formatCurrency(row.old_service_fee || 0)} newValue={formatCurrency(row.new_service_fee || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.discount} oldValue={formatCurrency(row.old_discount_amount || 0)} newValue={formatCurrency(row.new_discount_amount || 0)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.method} oldValue={paymentMethodLabel(row.old_payment_method, lang)} newValue={paymentMethodLabel(row.new_payment_method, lang)} beforeLabel={l.before} afterLabel={l.after} />
                  <AuditValue label={l.status} oldValue={`${statusLabel(row.old_status, lang)} / ${statusLabel(row.old_payment_status, lang)}`} newValue={`${statusLabel(row.new_status, lang)} / ${statusLabel(row.new_payment_status, lang)}`} beforeLabel={l.before} afterLabel={l.after} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )
    })
  }, [error, groupedRows, l, lang, loading, rows.length])

  return (
    <AppShell
      title={l.title}
      headerActions={(
        <button type="button" onClick={loadAudit} disabled={loading} aria-label={l.refresh} className="ws-btn ws-btn-outline">
          {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}<span className="hidden sm:inline">{l.refresh}</span>
        </button>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <section className="ws-panel">
            <div className="mb-3">
              <h2 className="ws-heading">{l.filters}</h2>
              <p className="ws-muted">{l.sub}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_220px_220px]">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={l.searchPlaceholder}
                aria-label={l.searchPlaceholder}
                className="ws-input"
              />
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                aria-label={l.action}
                className="ws-input"
              >
                <option value="all">{l.allActions}</option>
                {actions.map(action => <option key={action} value={action}>{actionLabel(action, lang)}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label={l.status}
                className="ws-input"
              >
                <option value="all">{l.allStatuses}</option>
                {statuses.map(status => <option key={status} value={status}>{statusLabel(status, lang)}</option>)}
              </select>
            </div>
          </section>
          <section className="ws-panel ws-panel-flush" aria-busy={loading}>{content}</section>
          {!loading && !error && rows.length >= AUDIT_LIMIT && (
            <p className="ws-caption text-center">{l.limitNote(AUDIT_LIMIT)}</p>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function actionTone(action) {
  if (action === 'mark_paid') return 'ws-tone-positive'
  if (action === 'reopen_paid_order' || action === 'order_item_deleted' || action === 'order_cancelled') return 'ws-tone-negative'
  if (action === 'payment_fields_changed' || action === 'payment_method_changed') return 'ws-tone-caution'
  if (action === 'status_changed') return 'ws-tone-info'
  if (action === 'settle_loyalty_wallet_payment') return 'ws-tone-accent'
  return ''
}

// Before and after are the point of the audit: they wrap, they are never cut.
function AuditValue({ label, oldValue, newValue, beforeLabel = '', afterLabel = '' }) {
  return (
    <div className="min-w-0">
      <p className="ws-caption font-medium">{label}</p>
      <p className="mt-0.5 tabular-nums text-[#68655f]">{beforeLabel ? `${beforeLabel}: ` : ''}<span className="inline-block">{oldValue}</span></p>
      <p className="font-semibold tabular-nums text-[#22201d]">{afterLabel ? `${afterLabel}: ` : ''}<span className="inline-block">{newValue}</span></p>
    </div>
  )
}

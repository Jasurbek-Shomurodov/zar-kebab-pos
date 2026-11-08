import React, { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import DateRangePicker from './DateRangePicker'
import BazaarCategoryPicker from './BazaarCategoryPicker'
import { OperationalLoading } from './OperationalState'
import { supabase } from '../lib/supabase'
import { todayBazaarDate, bazaarCategoryLabel, bazaarUnitLabel, bazaarPaymentMethodLabel, formatBazaarQuantity, getBazaarRange } from '../lib/bazaar'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate, formatTime } from '../lib/dateFormat'
import { averageUnitPrice, buildPurchaseSheet, sheetDates } from '../lib/ingredientPurchaseSheet'

const COPY = {
  en: { title: 'Purchase sheet', from: 'From', to: 'To', note: 'Daily Bazaar purchases of added ingredients: ingredients down the side, dates across the top. Tap a cell, an ingredient or a day total to see what was bought, by whom and for how much.', ingredient: 'Ingredient', total: 'Total', dayTotal: 'Spent per day', quantity: 'Quantity', amount: 'Amount', show: 'Show', search: 'Search ingredients…', category: 'Category', allCategories: 'All categories', uncategorized: 'Uncategorized', clear: 'Clear filters', results: 'Ingredients', empty: 'No ingredient purchases in this period.', noMatches: 'No ingredients match these filters.', loading: 'Loading purchases…', failed: 'Could not load purchases. Please try again.', range: 'Choose a valid range of at most 366 days.', retry: 'Try again', close: 'Close', bought: 'Bought', spent: 'Spent', avgPrice: 'Average price', purchases: 'Purchases', unitPrice: 'Price', normal: 'Usual price', above: 'above usual', below: 'below usual', buyer: 'Buyer', allDay: 'All purchases', period: 'Whole period' },
  ru: { title: 'Таблица закупок', from: 'С', to: 'По', note: 'Закупки добавленных ингредиентов на базаре: ингредиенты по строкам, даты по столбцам. Нажмите на ячейку, ингредиент или итог дня, чтобы увидеть, что купили, кто и за сколько.', ingredient: 'Ингредиент', total: 'Итого', dayTotal: 'Потрачено за день', quantity: 'Количество', amount: 'Сумма', show: 'Показать', search: 'Поиск ингредиентов…', category: 'Категория', allCategories: 'Все категории', uncategorized: 'Без категории', clear: 'Сбросить фильтры', results: 'Ингредиенты', empty: 'За этот период закупок ингредиентов нет.', noMatches: 'Нет ингредиентов по выбранным фильтрам.', loading: 'Загрузка закупок…', failed: 'Не удалось загрузить закупки. Попробуйте ещё раз.', range: 'Выберите корректный период не более 366 дней.', retry: 'Повторить', close: 'Закрыть', bought: 'Куплено', spent: 'Потрачено', avgPrice: 'Средняя цена', purchases: 'Закупки', unitPrice: 'Цена', normal: 'Обычная цена', above: 'выше обычной', below: 'ниже обычной', buyer: 'Покупатель', allDay: 'Все закупки', period: 'Весь период' },
  uz: { title: 'Xaridlar jadvali', from: 'Dan', to: 'Gacha', note: 'Qo‘shilgan masalliqlarning bozor xaridlari: masalliqlar qatorlarda, sanalar ustunlarda. Nima, kim tomonidan va qanchaga olinganini ko‘rish uchun katak, masalliq yoki kun jamisini bosing.', ingredient: 'Masalliq', total: 'Jami', dayTotal: 'Kunlik sarf', quantity: 'Miqdor', amount: 'Summa', show: 'Ko‘rsatish', search: 'Masalliqlarni qidirish…', category: 'Kategoriya', allCategories: 'Barcha kategoriyalar', uncategorized: 'Kategoriyasiz', clear: 'Filtrlarni tozalash', results: 'Masalliqlar', empty: 'Bu davrda masalliq xaridlari yo‘q.', noMatches: 'Bu filtrlarga mos masalliq topilmadi.', loading: 'Xaridlar yuklanmoqda…', failed: 'Xaridlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.', range: '366 kundan oshmaydigan to‘g‘ri davrni tanlang.', retry: 'Qayta urinish', close: 'Yopish', bought: 'Xarid qilingan', spent: 'Sarflangan', avgPrice: 'O‘rtacha narx', purchases: 'Xaridlar', unitPrice: 'Narx', normal: 'Odatiy narx', above: 'odatiydan yuqori', below: 'odatiydan past', buyer: 'Xaridor', allDay: 'Barcha xaridlar', period: 'Butun davr' },
}

const DATE_LABELS = {
  en: { today: 'Today', month: 'This month', previousMonth: 'Previous month', presets: 'Presets', previousWeek: 'Previous week', previousCurrentWeek: 'Previous & current week', currentWeek: 'Current week', currentNextWeek: 'Current & next week', nextWeek: 'Next week', nextMonth: 'Next month', applyRange: 'Apply range', cancel: 'Cancel', selectDateRange: 'Select date range', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  ru: { today: 'Сегодня', month: 'Текущий месяц', previousMonth: 'Прошлый месяц', presets: 'Готовые периоды', previousWeek: 'Прошлая неделя', previousCurrentWeek: 'Прошлая и текущая неделя', currentWeek: 'Текущая неделя', currentNextWeek: 'Текущая и следующая неделя', nextWeek: 'Следующая неделя', nextMonth: 'Следующий месяц', applyRange: 'Применить период', cancel: 'Отмена', selectDateRange: 'Выбрать период', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] },
  uz: { today: 'Bugun', month: 'Joriy oy', previousMonth: 'O‘tgan oy', presets: 'Tayyor davrlar', previousWeek: 'O‘tgan hafta', previousCurrentWeek: 'O‘tgan va joriy hafta', currentWeek: 'Joriy hafta', currentNextWeek: 'Joriy va keyingi hafta', nextWeek: 'Keyingi hafta', nextMonth: 'Keyingi oy', applyRange: 'Davrni qo‘llash', cancel: 'Bekor qilish', selectDateRange: 'Davrni tanlang', weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'] },
}

const searchKey = value => String(value || '').toLowerCase().replace(/[’‘ʻʼ`]/g, "'").trim().replace(/\s+/g, ' ')
const unitLabel = (unit, lang) => bazaarUnitLabel(unit === 'piece' ? 'pcs' : unit, lang)
const compactAmount = value => {
  const amount = Number(value) || 0
  if (amount >= 1000000) return `${formatBazaarQuantity(amount / 1000000, 1)}M`
  if (amount >= 1000) return `${formatBazaarQuantity(amount / 1000, 0)}k`
  return formatBazaarQuantity(amount, 0)
}
const weekdayIndex = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
const categoryName = (category, lang, l) => (category || 'uncategorized') === 'uncategorized' ? l.uncategorized : bazaarCategoryLabel(category, lang)

export default function IngredientPurchaseSheet({ lang = 'ru' }) {
  const l = COPY[lang] || COPY.en
  const dl = DATE_LABELS[lang] || DATE_LABELS.en
  const initialRange = useMemo(() => getBazaarRange('month'), [])
  const [from, setFrom] = useState(initialRange.dateFrom)
  const [to, setTo] = useState(initialRange.dateTo)
  const [rangeKey, setRangeKey] = useState('month')
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [mode, setMode] = useState('quantity')
  const [detail, setDetail] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const days = (Date.parse(to) - Date.parse(from)) / 86400000
    setData(null)
    setError('')
    setDetail(null)
    if (!from || !to || !Number.isFinite(days) || days < 0 || days > 365) {
      setError('range')
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    setLoading(true)
    const timeout = setTimeout(() => controller.abort(), 20000)
    async function load() {
      try {
        const { data: result, error: requestError } = await supabase.rpc('get_ingredient_purchase_sheet', { p_date_from: from, p_date_to: to }).abortSignal(controller.signal)
        if (requestError) throw requestError
        if (active) setData(result)
      } catch {
        if (active) setError('failed')
      } finally {
        clearTimeout(timeout)
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [from, to, retry])

  const dates = useMemo(() => sheetDates(from, to), [from, to])
  const sheet = useMemo(() => buildPurchaseSheet(data?.rows || []), [data])
  const categoryRows = useMemo(() => sheet.rows.map(row => ({ category: row.category || 'uncategorized' })), [sheet])
  const visibleRows = useMemo(() => {
    const words = searchKey(query).split(' ').filter(Boolean)
    return sheet.rows
      .filter(row => words.every(word => searchKey(row.name).includes(word)))
      .filter(row => categoryFilter === 'all' || (row.category || 'uncategorized') === categoryFilter)
      .sort((left, right) => left.name.localeCompare(right.name, lang) || left.unit.localeCompare(right.unit))
  }, [sheet, query, categoryFilter, lang])
  // Footer follows the filters so the day totals always add up to the visible rows.
  const visibleTotals = useMemo(() => {
    const days = {}
    let total = 0
    for (const row of visibleRows) {
      for (const [date, cell] of Object.entries(row.cells)) days[date] = (days[date] || 0) + cell.paid
      total += row.paid
    }
    return { days, total }
  }, [visibleRows])
  const today = todayBazaarDate()
  const filtered = Boolean(query || categoryFilter !== 'all')

  function openCell(row, date) {
    const cell = row.cells[date]
    setDetail({ title: row.name, subtitle: formatLongDate(date, lang), unit: row.unit, quantity: cell.quantity, paid: cell.paid, lines: cell.lines, showDate: false, showName: false })
  }
  function openRow(row) {
    const lines = dates.flatMap(date => row.cells[date]?.lines || [])
    setDetail({ title: row.name, subtitle: `${l.period} · ${formatLongDate(from, lang)} – ${formatLongDate(to, lang)}`, unit: row.unit, quantity: row.quantity, paid: row.paid, lines, showDate: true, showName: false })
  }
  function openDay(date) {
    const lines = visibleRows.flatMap(row => row.cells[date]?.lines || [])
    setDetail({ title: formatLongDate(date, lang), subtitle: l.allDay, paid: visibleTotals.days[date] || 0, lines, showDate: false, showName: true })
  }

  return (
    <section className="ws-panel">
      <h2 className="ws-display">{l.title}</h2>
      <div className="mt-4">
        <DateRangePicker l={{ ...l, ...dl }} lang={lang} rangeKey={rangeKey} dateFrom={from} dateTo={to} today={today}
          onPreset={key => { const range = getBazaarRange(key); setRangeKey(key); setFrom(range.dateFrom); setTo(range.dateTo) }}
          onApply={(dateFrom, dateTo) => { setRangeKey('custom'); setFrom(dateFrom); setTo(dateTo) }} />
      </div>
      <p className="ws-muted my-4">{l.note}</p>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.7fr)_auto]">
        <label className="ws-caption block font-medium">{l.search}
          <div className="relative mt-1.5"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className="ws-input !pl-9" />
          </div>
        </label>
        <div className="ws-caption block font-medium">{l.category}
          <div className="mt-1.5">
            <BazaarCategoryPicker value={categoryFilter} ingredients={categoryRows} onChange={setCategoryFilter} lang={lang} allLabel={l.allCategories} uncategorizedLabel={l.uncategorized} />
          </div>
        </div>
        <div className="ws-caption block font-medium">{l.show}
          <div role="group" aria-label={l.show} className="ws-segmented mt-1.5 flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
            {['quantity', 'amount'].map(option => (
              <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>{l[option]}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
        {!loading && !error && <p role="status" className="ws-caption">{l.results}: {visibleRows.length} / {sheet.rows.length} · {l.spent}: <span className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(visibleTotals.total)}</span></p>}
        {filtered && <button type="button" onClick={() => { setQuery(''); setCategoryFilter('all') }} className="ws-btn ws-btn-ghost ws-btn-sm"><X size={14} />{l.clear}</button>}
      </div>
      {error ? (
        <div role="alert" className="ws-notice ws-tone-negative"><p>{l[error]}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="ws-btn ws-btn-outline ws-btn-sm mt-2">{l.retry}</button></div>
      ) : loading ? <OperationalLoading title={l.loading} layout="ingredientSheetGrid" /> : !sheet.rows.length ? <p className="ws-empty">{l.empty}</p> : !visibleRows.length ? <p className="ws-empty">{l.noMatches}</p> : (
        // Ingredients down the side, dates across the top; the name column and header stay pinned while scrolling.
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-[#e4e1de]">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-30 min-w-[180px] max-w-[220px] border-b border-r border-[#e4e1de] bg-[#f6f5f3] px-3 py-2 text-left text-xs font-semibold text-[#68655f]">{l.ingredient}</th>
                {dates.map(date => (
                  <th key={date} scope="col" className={`sticky top-0 z-20 min-w-[76px] border-b border-r border-[#e4e1de] px-2 py-1.5 text-center text-xs font-semibold ${date === today ? 'bg-[#fff4ec] text-[#ff5a00]' : 'bg-[#f6f5f3] text-[#68655f]'}`}>
                    <span className="block tabular-nums text-[13px] text-inherit">{Number(date.slice(8))}.{date.slice(5, 7)}</span>
                    <span className="block font-medium">{dl.weekdays[weekdayIndex(date)]}</span>
                  </th>
                ))}
                <th scope="col" className="sticky top-0 z-20 min-w-[120px] border-b border-[#e4e1de] bg-[#f6f5f3] px-3 py-2 text-right text-xs font-semibold text-[#68655f]">{l.total}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const unit = unitLabel(row.unit, lang)
                return (
                  <tr key={row.key} className="group">
                    <th scope="row" className="sticky left-0 z-10 max-w-[220px] border-b border-r border-[#e4e1de] bg-white p-0 text-left font-normal">
                      <button type="button" onClick={() => openRow(row)} className="block w-full px-3 py-2 text-left hover:bg-[#f6f5f3]">
                        <span className="block truncate font-semibold text-[#22201d]">{row.name}</span>
                        <span className="ws-caption block truncate">{categoryName(row.category, lang, l)} · {unit}</span>
                      </button>
                    </th>
                    {dates.map(date => {
                      const cell = row.cells[date]
                      return (
                        <td key={date} className={`border-b border-r border-[#e4e1de] p-0 text-center ${date === today ? 'bg-[#fff4ec]' : 'bg-white'}`}>
                          {cell ? (
                            <button type="button" onClick={() => openCell(row, date)} aria-label={`${row.name}, ${formatLongDate(date, lang)}: ${formatBazaarQuantity(cell.quantity)} ${unit}, ${formatCurrency(cell.paid)}`}
                              className="block h-full w-full px-2 py-2 font-semibold tabular-nums text-[#ff5a00] hover:bg-orange-50">
                              {mode === 'quantity' ? formatBazaarQuantity(cell.quantity) : compactAmount(cell.paid)}
                              {cell.lines.length > 1 && <sup className="ml-0.5 text-[10px] font-medium text-[#68655f]">×{cell.lines.length}</sup>}
                            </button>
                          ) : <span aria-hidden="true" className="text-[#c9c5c0]">·</span>}
                        </td>
                      )
                    })}
                    <td className="border-b border-[#e4e1de] bg-white px-3 py-2 text-right tabular-nums">
                      <span className="block font-semibold text-[#22201d]">{formatCurrency(row.paid)}</span>
                      <span className="ws-caption block">{formatBazaarQuantity(row.quantity)} {unit}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky bottom-0 left-0 z-30 border-r border-t border-[#e4e1de] bg-[#f6f5f3] px-3 py-2 text-left text-xs font-semibold text-[#22201d]">{l.dayTotal}</th>
                {dates.map(date => {
                  const paid = visibleTotals.days[date] || 0
                  return (
                    <td key={date} className="sticky bottom-0 z-20 border-r border-t border-[#e4e1de] bg-[#f6f5f3] p-0 text-center">
                      {paid ? (
                        <button type="button" onClick={() => openDay(date)} aria-label={`${l.dayTotal}, ${formatLongDate(date, lang)}: ${formatCurrency(paid)}`} className="block w-full px-2 py-2 text-xs font-semibold tabular-nums text-[#22201d] hover:bg-orange-50">{compactAmount(paid)}</button>
                      ) : <span aria-hidden="true" className="text-[#c9c5c0]">·</span>}
                    </td>
                  )
                })}
                <td className="sticky bottom-0 z-20 border-t border-[#e4e1de] bg-[#f6f5f3] px-3 py-2 text-right text-sm font-semibold tabular-nums text-[#22201d]">{formatCurrency(visibleTotals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {detail && <PurchaseDetail detail={detail} lang={lang} l={l} onClose={() => setDetail(null)} />}
    </section>
  )
}

function PurchaseDetail({ detail, lang, l, onClose }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const unit = detail.unit ? unitLabel(detail.unit, lang) : ''
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title" className="ws-dialog max-h-[92vh] w-full overflow-y-auto !rounded-b-none sm:max-w-lg sm:!rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e4e1de] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="purchase-detail-title" className="ws-heading">{detail.title}</h2>
            <p className="ws-caption mt-1">{detail.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={l.close} className="ws-btn ws-btn-ghost !h-10 !w-10 !px-0"><X size={19} /></button>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <dl className={`grid gap-3 ${detail.unit ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {detail.unit && <div className="rounded-xl bg-[#f6f5f3] px-3 py-2.5"><dt className="ws-caption">{l.bought}</dt><dd className="mt-0.5 font-semibold tabular-nums text-[#22201d]">{formatBazaarQuantity(detail.quantity)} {unit}</dd></div>}
            <div className="rounded-xl bg-[#f6f5f3] px-3 py-2.5"><dt className="ws-caption">{l.spent}</dt><dd className="mt-0.5 font-semibold tabular-nums text-[#22201d]">{formatCurrency(detail.paid)}</dd></div>
            {detail.unit
              ? <div className="rounded-xl bg-[#f6f5f3] px-3 py-2.5"><dt className="ws-caption">{l.avgPrice}</dt><dd className="mt-0.5 font-semibold tabular-nums text-[#22201d]">{formatCurrency(averageUnitPrice(detail.paid, detail.quantity))}<span className="ws-caption"> / {unit}</span></dd></div>
              : <div className="rounded-xl bg-[#f6f5f3] px-3 py-2.5"><dt className="ws-caption">{l.purchases}</dt><dd className="mt-0.5 font-semibold tabular-nums text-[#22201d]">{detail.lines.length}</dd></div>}
          </dl>
          <ol className="space-y-2">
            {detail.lines.map((line, index) => {
              const enteredUnit = bazaarUnitLabel(line.entered_unit, lang)
              const difference = Number(line.normal_paid) > 0 ? Number(line.paid) - Number(line.normal_paid) : 0
              const notes = [line.item_notes, line.purchase_notes].map(value => String(value || '').trim()).filter(Boolean)
              return (
                <li key={`${line.purchase_id}-${index}`} className="rounded-xl border border-[#e4e1de] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#22201d]">
                        {detail.showName ? line.name : `${formatBazaarQuantity(line.entered_quantity)} ${enteredUnit}`}
                      </p>
                      <p className="ws-caption mt-0.5">
                        {[detail.showDate ? formatLongDate(line.date, lang, '', { includeYear: false }) : null, formatTime(line.created_at), bazaarPaymentMethodLabel(line.payment_method, lang), line.buyer_name ? `${l.buyer}: ${line.buyer_name}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-[#22201d]">{formatCurrency(line.paid)}</p>
                      <p className="ws-caption tabular-nums">
                        {detail.showName && `${formatBazaarQuantity(line.entered_quantity)} ${enteredUnit} · `}
                        {formatCurrency(averageUnitPrice(line.paid, line.entered_quantity))} / {enteredUnit}
                      </p>
                    </div>
                  </div>
                  {difference !== 0 && (
                    <p className={`mt-1.5 text-xs font-medium tabular-nums ${difference > 0 ? 'text-[#c4262c]' : 'text-[#15803D]'}`}>
                      {difference > 0 ? '+' : '−'}{formatCurrency(Math.abs(difference))} {difference > 0 ? l.above : l.below} ({l.normal}: {formatCurrency(line.normal_paid)})
                    </p>
                  )}
                  {notes.length > 0 && <p className="mt-1.5 whitespace-pre-line text-sm text-[#68655f]">{notes.join('\n')}</p>}
                </li>
              )
            })}
          </ol>
        </div>
      </section>
    </div>
  )
}

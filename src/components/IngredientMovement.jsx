import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react'
import DateRangePicker from './DateRangePicker'
import { supabase } from '../lib/supabase'
import { todayBazaarDate, bazaarCategoryLabel, bazaarUnitLabel, formatBazaarQuantity, getBazaarRange } from '../lib/bazaar'
import { formatCurrency } from '../lib/formatCurrency'

const COPY = {
  en: { title: 'Purchases & usage', from: 'From', to: 'To', retry: 'Try again', name: 'Ingredient', bought: 'Bought', used: 'Recipe usage', movement: 'Remaining (period)', paid: 'Purchase amount', note: 'Theoretical usage from paid orders and their saved tech cards. Remaining = bought − recipe usage for this period; excludes opening stock, waste, and stock adjustments.', missing: 'Sold items without complete recipe snapshots', unmatched: 'Unmatched recipe name', empty: 'No purchases or recorded recipe usage in this period.', loading: 'Loading movement…', failed: 'Could not load ingredient movement. Please try again.', range: 'Choose a valid range of at most 366 days.' },
  ru: { title: 'Закупки и расход', from: 'С', to: 'По', retry: 'Повторить', name: 'Ингредиент', bought: 'Куплено', used: 'Расход по рецептам', movement: 'Остаток за период', paid: 'Сумма закупок', note: 'Расчётный расход по оплаченным заказам и сохранённым техкартам. Остаток за период = куплено − расход по рецептам; без начального остатка, списаний и корректировок.', missing: 'Проданные позиции без полного снимка рецепта', unmatched: 'Название рецепта не сопоставлено', empty: 'За этот период нет закупок или записанного расхода.', loading: 'Загрузка движения…', failed: 'Не удалось загрузить движение. Попробуйте ещё раз.', range: 'Выберите корректный период не более 366 дней.' },
  uz: { title: 'Xaridlar va sarf', from: 'Dan', to: 'Gacha', retry: 'Qayta urinish', name: 'Masalliq', bought: 'Xarid qilingan', used: 'Retsept bo‘yicha sarf', movement: 'Davr qoldig‘i', paid: 'Xarid summasi', note: 'To‘langan buyurtmalar va saqlangan texkartalar bo‘yicha hisoblangan sarf. Davr qoldig‘i = xarid − retsept bo‘yicha sarf; boshlang‘ich qoldiq, chiqindi va tuzatishlar hisobga olinmaydi.', missing: 'To‘liq retsept nusxasi yo‘q sotilgan qatorlar', unmatched: 'Retsept nomi mos kelmadi', empty: 'Bu davrda xarid yoki qayd etilgan sarf yo‘q.', loading: 'Harakat yuklanmoqda…', failed: 'Harakatni yuklab bo‘lmadi. Qayta urinib ko‘ring.', range: '366 kundan oshmaydigan to‘g‘ri davrni tanlang.' },
}

const FILTER_LABELS = {
  en: { search: 'Search ingredients…', category: 'Category', allCategories: 'All categories', uncategorized: 'Uncategorized', sort: 'Sort by', default: 'Default order', boughtAsc: 'Bought: low to high', usedAsc: 'Recipe usage: low to high', movementAsc: 'Remaining: low to high', nameAsc: 'Name: A–Z', nameDesc: 'Name: Z–A', boughtDesc: 'Bought: high to low', usedDesc: 'Recipe usage: high to low', movementDesc: 'Remaining: high to low', paidDesc: 'Purchase amount: high to low', paidAsc: 'Purchase amount: low to high', clear: 'Clear filters', results: 'Results', noMatches: 'No ingredients match these filters.' },
  ru: { search: 'Поиск ингредиентов…', category: 'Категория', allCategories: 'Все категории', uncategorized: 'Без категории', sort: 'Сортировка', default: 'По умолчанию', boughtAsc: 'Куплено: по возрастанию', usedAsc: 'Расход по рецептам: по возрастанию', movementAsc: 'Остаток: по возрастанию', nameAsc: 'Название: А–Я', nameDesc: 'Название: Я–А', boughtDesc: 'Куплено: по убыванию', usedDesc: 'Расход по рецептам: по убыванию', movementDesc: 'Остаток: по убыванию', paidDesc: 'Сумма закупок: по убыванию', paidAsc: 'Сумма закупок: по возрастанию', clear: 'Сбросить фильтры', results: 'Результаты', noMatches: 'Нет ингредиентов по выбранным фильтрам.' },
  uz: { search: 'Masalliqlarni qidirish…', category: 'Kategoriya', allCategories: 'Barcha kategoriyalar', uncategorized: 'Kategoriyasiz', sort: 'Saralash', default: 'Standart tartib', boughtAsc: 'Xarid qilingan: o‘sish', usedAsc: 'Retsept bo‘yicha sarf: o‘sish', movementAsc: 'Qoldiq: o‘sish', nameAsc: 'Nom: A–Z', nameDesc: 'Nom: Z–A', boughtDesc: 'Xarid qilingan: kamayish', usedDesc: 'Retsept bo‘yicha sarf: kamayish', movementDesc: 'Qoldiq: kamayish', paidDesc: 'Xarid summasi: kamayish', paidAsc: 'Xarid summasi: o‘sish', clear: 'Filtrlarni tozalash', results: 'Natijalar', noMatches: 'Bu filtrlarga mos masalliq topilmadi.' },
}
const FILTER_INPUT = 'ws-input'
const searchKey = value => String(value || '').toLowerCase().replace(/[’‘ʻʼ`]/g, "'").trim().replace(/\s+/g, ' ')

const DATE_LABELS = {
  en: { today: 'Today', month: 'This month', previousMonth: 'Previous month', presets: 'Presets', previousWeek: 'Previous week', previousCurrentWeek: 'Previous & current week', currentWeek: 'Current week', currentNextWeek: 'Current & next week', nextWeek: 'Next week', nextMonth: 'Next month', applyRange: 'Apply range', cancel: 'Cancel', selectDateRange: 'Select date range', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  ru: { today: 'Сегодня', month: 'Текущий месяц', previousMonth: 'Прошлый месяц', presets: 'Готовые периоды', previousWeek: 'Прошлая неделя', previousCurrentWeek: 'Прошлая и текущая неделя', currentWeek: 'Текущая неделя', currentNextWeek: 'Текущая и следующая неделя', nextWeek: 'Следующая неделя', nextMonth: 'Следующий месяц', applyRange: 'Применить период', cancel: 'Отмена', selectDateRange: 'Выбрать период', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] },
  uz: { today: 'Bugun', month: 'Joriy oy', previousMonth: 'O‘tgan oy', presets: 'Tayyor davrlar', previousWeek: 'O‘tgan hafta', previousCurrentWeek: 'O‘tgan va joriy hafta', currentWeek: 'Joriy hafta', currentNextWeek: 'Joriy va keyingi hafta', nextWeek: 'Keyingi hafta', nextMonth: 'Keyingi oy', applyRange: 'Davrni qo‘llash', cancel: 'Bekor qilish', selectDateRange: 'Davrni tanlang', weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'] },
}

export default function IngredientMovement({ lang = 'ru' }) {
  const l = COPY[lang] || COPY.en
  const f = FILTER_LABELS[lang] || FILTER_LABELS.en
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState('default')
  const [from, setFrom] = useState(todayBazaarDate)
  const [to, setTo] = useState(todayBazaarDate)
  const [retry, setRetry] = useState(0)
  const [rangeKey, setRangeKey] = useState('today')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const days = (Date.parse(to) - Date.parse(from)) / 86400000
    setData(null)
    setError('')
    if (!from || !to || !Number.isFinite(days) || days < 0 || days > 365) {
      setError('range')
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    setLoading(true)
    const timeout = setTimeout(() => controller.abort(), 20000)
    async function load() {
      try {
        const { data: result, error: requestError } = await supabase.rpc('get_ingredient_movement', { p_date_from: from, p_date_to: to }).abortSignal(controller.signal)
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
  const categories = useMemo(() => [...new Set((data?.rows || []).map(row => row.category || 'uncategorized'))].sort(), [data])
  const visibleRows = useMemo(() => {
    const words = searchKey(query).split(' ').filter(Boolean)
    return (data?.rows || []).filter(row => {
      if (!words.every(word => searchKey(row.name).includes(word))) return false
      if (categoryFilter !== 'all' && (row.category || 'uncategorized') !== categoryFilter) return false
      return true
    }).sort((left, right) => {
      if (sort === 'default') return 0
      const byName = left.name.localeCompare(right.name, lang) || left.unit.localeCompare(right.unit)
      if (sort === 'nameDesc') return -byName
      const descendingField = { boughtDesc: 'bought', usedDesc: 'used', movementDesc: 'movement', paidDesc: 'paid' }[sort]
      if (descendingField) return Number(right[descendingField]) - Number(left[descendingField]) || byName
      const ascendingField = { boughtAsc: 'bought', usedAsc: 'used', movementAsc: 'movement', paidAsc: 'paid' }[sort]
      if (ascendingField) return Number(left[ascendingField]) - Number(right[ascendingField]) || byName
      return byName
    })
  }, [data, query, categoryFilter, sort, lang])
  const filtered = Boolean(query || categoryFilter !== 'all' || sort !== 'default')
  function clearFilters() { setQuery(''); setCategoryFilter('all'); setSort('default') }
  return (
    <section className="ws-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="ws-display">{l.title}</h2>

      </div>
      <div className="mt-4">
        <DateRangePicker l={{ ...l, ...(DATE_LABELS[lang] || DATE_LABELS.en) }} lang={lang} rangeKey={rangeKey} dateFrom={from} dateTo={to} today={todayBazaarDate()}
          onPreset={key => { const range = getBazaarRange(key); setRangeKey(key); setFrom(range.dateFrom); setTo(range.dateTo) }}
          onApply={(dateFrom, dateTo) => { setRangeKey('custom'); setFrom(dateFrom); setTo(dateTo) }} />
      </div>
      <p className="ws-muted my-4">{l.note}</p>
      {data?.uncovered_items > 0 && <p role="status" className="ws-notice ws-tone-caution mb-4">{l.missing}: {data.uncovered_items}</p>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.7fr)]">
        <label className="ws-caption block font-medium">{f.search}
          <div className="relative mt-1.5"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={f.search} className={`${FILTER_INPUT} !pl-9`} />
          </div>
        </label>
        <label className="ws-caption block font-medium">{f.category}
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className={`${FILTER_INPUT} mt-1.5`}>
            <option value="all">{f.allCategories}</option>
            {[...new Set([...categories, ...(categoryFilter !== 'all' ? [categoryFilter] : [])])].map(category => <option key={category} value={category}>{category === 'uncategorized' ? f.uncategorized : bazaarCategoryLabel(category, lang)}</option>)}
          </select>
        </label>
      </div>
      <div className="mb-2 flex min-h-9 flex-wrap items-center justify-between gap-2">
        {!loading && !error && <p role="status" className="ws-caption">{f.results}: {visibleRows.length} / {data?.rows?.length || 0}</p>}
        {filtered && <button type="button" onClick={clearFilters} className="ws-btn ws-btn-ghost ws-btn-sm"><X size={14} />{f.clear}</button>}
      </div>
      {error ? <div role="alert" className="ws-notice ws-tone-negative"><p>{l[error]}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="ws-btn ws-btn-outline ws-btn-sm mt-2">{l.retry}</button></div> : loading ? <p role="status" className="ws-muted py-4">{l.loading}</p> : !data?.rows?.length ? <p className="ws-empty">{l.empty}</p> : !visibleRows.length ? <p className="ws-empty">{f.noMatches}</p> : (
        <div className="-mx-5 overflow-x-auto border-t border-[#e4e1de] max-sm:-mx-4"><table className="w-full min-w-[680px] text-sm text-[#22201d]">
          <thead><tr className="ws-table-head text-left">
            {['name', 'bought', 'used', 'paid', 'movement'].map(field => {
              const active = sort === `${field}Asc` || sort === `${field}Desc`
              const ascending = sort === `${field}Asc`
              const firstSort = `${field}${field === 'name' ? 'Asc' : 'Desc'}`
              const secondSort = `${field}${field === 'name' ? 'Desc' : 'Asc'}`
              const nextSort = sort === firstSort ? secondSort : sort === secondSort ? 'default' : firstSort
              const Icon = active ? (ascending ? ArrowUp : ArrowDown) : ArrowUpDown
              return <th key={field} scope="col" aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => setSort(nextSort)} title={f[nextSort]} className={`flex w-full items-center gap-2 px-5 py-3 text-left font-medium hover:text-[#22201d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff5a00] ${active ? 'text-[#22201d]' : ''}`}>
                  {l[field]}<Icon size={13} aria-hidden="true" className="shrink-0" />
                </button>
              </th>
            })}
          </tr></thead>
          <tbody>{visibleRows.map(row => {
            const unit = bazaarUnitLabel(row.unit === 'piece' ? 'pcs' : row.unit, lang)
            return <tr key={`${row.identity}::${row.unit}`} className="ws-row">
              <td className="px-5 py-3 font-semibold">{row.name}</td>
              <td className="px-5 py-3 tabular-nums">{formatBazaarQuantity(row.bought)} {unit}</td>
              <td className="px-5 py-3 tabular-nums">{formatBazaarQuantity(row.used)} {unit}</td>
              <td className="px-5 py-3 tabular-nums">{formatCurrency(row.paid)}</td>
              <td className={`px-5 py-3 font-semibold tabular-nums ${Number(row.movement) < 0 ? 'text-[#c4262c]' : 'text-[#22201d]'}`}>{formatBazaarQuantity(row.movement)} {unit}</td>
            </tr>
          })}</tbody>
        </table></div>
      )}
    </section>
  )
}

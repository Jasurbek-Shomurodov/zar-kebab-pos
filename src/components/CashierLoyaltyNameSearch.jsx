import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { withReadTimeout } from '../lib/writeTimeout'
import { Shimmer } from './PageShimmer'

export default function CashierLoyaltyNameSearch({ lang, onSelect, onSearchChange }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const labels = lang === 'uz' ? {
    search: 'Karta egasining ismi bo‘yicha qidirish', loading: 'Qidirilmoqda…',
    empty: 'Faol karta topilmadi', failed: 'Qidirib bo‘lmadi. Qayta urinib ko‘ring.',
    retry: 'Qayta urinish', more: 'Ko‘proq natija bor. Ismni aniqroq kiriting.',
  } : lang === 'ru' ? {
    search: 'Поиск по имени владельца карты', loading: 'Поиск…',
    empty: 'Активная карта не найдена', failed: 'Не удалось выполнить поиск. Попробуйте снова.',
    retry: 'Повторить', more: 'Есть ещё результаты. Уточните имя.',
  } : {
    search: 'Search by cardholder name', loading: 'Searching…',
    empty: 'No active cards found', failed: 'Could not search. Please try again.',
    retry: 'Retry', more: 'More matches available. Enter a more specific name.',
  }

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // Escape LIKE wildcards so names are always searched as literal text.
        const name = query.trim().replace(/[\\%_]/g, '\\$&')
        const { data, error } = await withReadTimeout(signal => supabase
          .from('loyalty_cards')
          .select('id, customer_name, card_number')
          .eq('is_active', true)
          .ilike('customer_name', `%${name}%`)
          .order('customer_name')
          .order('card_number')
          .limit(21)
          .abortSignal(signal), 'cashier-loyalty-name-search')
        if (error) throw error
        if (!cancelled) setResult({ query, cards: data || [] })
      } catch {
        if (!cancelled) setResult({ query, error: true })
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, retry])

  const current = result?.query === query ? result : null
  return (
    <div className="mb-3">
      <input
        type="search"
        aria-label={labels.search}
        placeholder={labels.search}
        value={query}
        onChange={event => {
          setQuery(event.target.value)
          setResult(null)
          onSearchChange()
        }}
        className="ws-input w-full"
      />
      {query.trim() && (
        <div className="mt-2 rounded-xl border border-[#E5E7EB] overflow-hidden">
          <div role="status" className="text-xs text-[#68655f]">
            {/* Results are data: a row-shaped shimmer, with the words kept for screen readers. */}
            {!current && <div className="grid gap-2 p-3"><span className="sr-only">{labels.loading}</span><Shimmer className="h-5 w-2/3 rounded" /><Shimmer className="h-5 w-1/2 rounded" /></div>}
            {current?.error && <p className="flex flex-wrap items-center justify-between gap-2 p-3 text-[#c4262c]"><span className="min-w-0 flex-1 basis-40">{labels.failed}</span><button type="button" className="ws-btn ws-btn-outline ws-btn-sm" onClick={() => { setResult(null); setRetry(value => value + 1) }}>{labels.retry}</button></p>}
            {current?.cards?.length === 0 && <p className="p-3">{labels.empty}</p>}
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {current?.cards?.slice(0, 20).map(card => (
              <li key={card.id}>
                <button type="button" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-3 text-left text-sm hover:bg-orange-50 focus:bg-orange-50" onClick={() => {
                  setQuery('')
                  setResult(null)
                  onSelect(card.card_number)
                }}>
                  <span className="min-w-0 font-semibold text-[#1F2937]">{card.customer_name}</span>
                  <span className="shrink-0 tabular-nums text-[#68655f]">{card.card_number}</span>
                </button>
              </li>
            ))}
          </ul>
          {current?.cards?.length > 20 && <p className="p-3 text-xs text-[#68655f]">{labels.more}</p>}
        </div>
      )}
    </div>
  )
}

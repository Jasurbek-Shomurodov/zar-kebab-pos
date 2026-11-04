import React, { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { expensePaymentMethodLabel } from '../lib/expenses'
import { PAYMENT_FEE_METHODS, parsePaymentFeeRate, savePaymentFeeRate } from '../lib/paymentFees'

// Financial analysis add-ons (migration 278): the sold-item cost warning and
// the card/terminal bank fee rates. Labels are read at render, so a language
// switch only changes words.

const L = {
  uz: {
    anomalyTitle: '{n} ta sotilgan mahsulot narxidan qimmat tannarx bilan saqlangan',
    anomalySub: 'Ular sotilgan mahsulot tannarxiga {excess} qo‘shadi, shuning uchun yalpi foyda shuncha kam ko‘rinadi. Texnologik kartadagi tannarxni tuzating; to‘langan buyurtmalardagi saqlangan tannarx o‘zgarmaydi.',
    showItems: 'Mahsulotlarni ko‘rsatish', hideItems: 'Yashirish',
    item: 'Mahsulot', soldOn: 'Sana', qty: 'Soni', price: 'Narx', savedCost: 'Saqlangan tannarx', more: 'Yana {n} ta ko‘rsatilmadi',
    feesTitle: 'Bank komissiyasi', feesSub: 'Karta va terminal to‘lovlaridan bank oladigan foiz. Taxminiy komissiya xarajatga qo‘shiladi; Buxgalteriyaga yozilmaydi.',
    rate: 'Foiz', feeInPeriod: 'Davrdagi komissiya', save: 'Saqlash', from: 'Qachondan', fromToday: 'Bugundan', fromPeriod: '{date} dan',
    invalidRate: '0 dan 20 gacha foiz kiriting', saveFailed: 'Saqlab bo‘lmadi. Qayta urinib ko‘ring.', saved: 'Saqlandi', notSet: 'Belgilanmagan',
    feesFailed: 'Bank komissiyasini yuklab bo‘lmadi; tahlil komissiyasiz ko‘rsatilmoqda.', retry: 'Qayta urinish',
    feesMissing: 'Bu bo‘lim uchun migrations/278_payment_fees_and_cost_checks.sql ni qo‘llang.',
  },
  ru: {
    anomalyTitle: '{n} проданных позиций сохранены с себестоимостью выше цены',
    anomalyTitleOne: '1 проданная позиция сохранена с себестоимостью выше цены',
    anomalySub: 'Они добавляют {excess} к себестоимости проданного, поэтому валовая прибыль занижена на эту сумму. Исправьте себестоимость в техкарте; сохранённая себестоимость в оплаченных заказах не меняется.',
    showItems: 'Показать позиции', hideItems: 'Скрыть',
    item: 'Позиция', soldOn: 'Дата', qty: 'Кол-во', price: 'Цена', savedCost: 'Сохранённая себестоимость', more: 'Ещё {n} не показано',
    feesTitle: 'Комиссия банка', feesSub: 'Процент, который банк берёт с оплат картой и терминалом. Расчётная комиссия входит в расходы анализа; в Бухгалтерию не записывается.',
    rate: 'Процент', feeInPeriod: 'Комиссия за период', save: 'Сохранить', from: 'С какого дня', fromToday: 'С сегодня', fromPeriod: 'С {date}',
    invalidRate: 'Введите процент от 0 до 20', saveFailed: 'Не удалось сохранить. Попробуйте ещё раз.', saved: 'Сохранено', notSet: 'Не задано',
    feesFailed: 'Не удалось загрузить комиссию банка; анализ показан без неё.', retry: 'Повторить',
    feesMissing: 'Для этого раздела примените migrations/278_payment_fees_and_cost_checks.sql.',
  },
  en: {
    anomalyTitle: '{n} sold items were saved with a cost above their price',
    anomalyTitleOne: '1 sold item was saved with a cost above its price',
    anomalySub: 'They add {excess} to the cost of items sold, so gross profit reads that much lower. Fix the cost in the Tech Card; the cost saved on paid orders stays as it is.',
    showItems: 'Show items', hideItems: 'Hide',
    item: 'Item', soldOn: 'Date', qty: 'Qty', price: 'Price', savedCost: 'Saved cost', more: '{n} more not shown',
    feesTitle: 'Bank fees', feesSub: 'The share the bank keeps from card and terminal payments. The estimated fee counts as spending here; nothing is written to Accounting.',
    rate: 'Rate', feeInPeriod: 'Fee in period', save: 'Save', from: 'Applies from', fromToday: 'Today', fromPeriod: '{date}',
    invalidRate: 'Enter a rate from 0 to 20', saveFailed: 'Could not save. Try again.', saved: 'Saved', notSet: 'Not set',
    feesFailed: 'Could not load bank fees; the analysis is shown without them.', retry: 'Try again',
    feesMissing: 'Apply migrations/278_payment_fees_and_cost_checks.sql to use bank fees.',
  },
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? ''))
}

function labelsFor(lang) {
  return L[lang] || L.en
}

export function CostAnomaliesNotice({ anomalies, lang }) {
  const [open, setOpen] = useState(false)
  if (!anomalies || anomalies.count <= 0) return null
  const l = labelsFor(lang)
  const hidden = Math.max(0, anomalies.count - anomalies.items.length)
  return (
    <section role="alert" className="ws-notice ws-tone-caution">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{anomalies.count === 1 && l.anomalyTitleOne ? l.anomalyTitleOne : fill(l.anomalyTitle, { n: anomalies.count })}</p>
            <p className="mt-0.5 text-sm">{fill(l.anomalySub, { excess: formatCurrency(anomalies.excessTotal) })}</p>
          </div>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="ws-btn ws-btn-outline ws-btn-sm">
          {open ? l.hideItems : l.showItems}
          <ChevronDown size={14} className={open ? 'rotate-180' : ''} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="mt-3 overflow-x-auto rounded-lg bg-[var(--ws-card,#fff)] text-[#22201d]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-[11px] font-semibold uppercase tracking-wide text-[#8a867f]">
              <tr>{[l.item, l.soldOn, l.qty, l.price, l.savedCost].map(heading => <th key={heading} className="px-3 py-2">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {anomalies.items.map(row => (
                <tr key={row.id} className="border-t border-[#efece9]">
                  <td className="px-3 py-2 font-semibold">{row.name || '—'}</td>
                  <td className="px-3 py-2">{row.soldOn ? formatLongDate(row.soldOn, lang, row.soldOn) : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(row.price)}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-[#c4262c]">{formatCurrency(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && <p className="ws-caption px-3 py-2">{fill(l.more, { n: hidden })}</p>}
        </div>
      )}
    </section>
  )
}

function FeeRateRow({ method, rate, fee, periodStart, today, lang, l, onSaved }) {
  const [value, setValue] = useState(rate ? String(rate) : '')
  const [from, setFrom] = useState('today')
  const [state, setState] = useState({ status: 'idle', error: '' })
  useEffect(() => { setValue(rate ? String(rate) : '') }, [rate])
  const parsed = parsePaymentFeeRate(value === '' ? '0' : value)
  const changed = parsed != null && parsed !== (rate || 0)
  const canPickPeriod = periodStart && periodStart < today

  async function save() {
    if (parsed == null) {
      setState({ status: 'error', error: l.invalidRate })
      return
    }
    setState({ status: 'saving', error: '' })
    try {
      await savePaymentFeeRate(method, parsed, from === 'period' && canPickPeriod ? periodStart : today)
      setState({ status: 'saved', error: '' })
      onSaved()
    } catch {
      // The save is an upsert on (method, date): retrying the same value is safe.
      setState({ status: 'error', error: l.saveFailed })
    }
  }

  return (
    <div className="rounded-xl border border-[#e4e1de] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#22201d]">{expensePaymentMethodLabel(method, lang)}</span>
        <span className="ws-caption tabular-nums">{l.feeInPeriod}: <span className="font-semibold text-[#22201d]">{formatCurrency(fee)}</span></span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="ws-caption">{l.rate}</span>
          <span className="flex items-center gap-1">
            <input
              className="ws-input !h-9 w-24 tabular-nums"
              inputMode="decimal"
              value={value}
              placeholder={l.notSet}
              aria-invalid={parsed == null}
              onChange={event => { setValue(event.target.value); setState({ status: 'idle', error: '' }) }}
            />
            <span className="text-sm text-[#68655f]">%</span>
          </span>
        </label>
        {canPickPeriod && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="ws-caption">{l.from}</span>
            <select className="ws-input !h-9" value={from} onChange={event => setFrom(event.target.value)}>
              <option value="today">{l.fromToday}</option>
              <option value="period">{fill(l.fromPeriod, { date: formatLongDate(periodStart, lang, periodStart) })}</option>
            </select>
          </label>
        )}
        <button type="button" onClick={save} disabled={!changed && from === 'today' || state.status === 'saving' || parsed == null} className="ws-btn ws-btn-primary ws-btn-sm !h-9">
          {state.status === 'saving' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {l.save}
        </button>
      </div>
      {state.status === 'error' && <p role="alert" className="mt-1.5 text-xs font-semibold text-[#c4262c]">{state.error}</p>}
      {state.status === 'saved' && <p role="status" className="mt-1.5 text-xs font-semibold text-[#1d7a52]">{l.saved}</p>}
    </div>
  )
}

export function PaymentFeeRatesPanel({ fees, status, periodStart, today, lang, onSaved, onRetry }) {
  const l = labelsFor(lang)
  if (status === 'missing') return <p className="ws-caption mt-4">{l.feesMissing}</p>
  if (status === 'error') {
    return (
      <div role="alert" className="ws-notice ws-tone-negative mt-4 flex flex-wrap items-center justify-between gap-3">
        <span>{l.feesFailed}</span>
        <button type="button" onClick={onRetry} className="ws-btn ws-btn-outline ws-btn-sm">{l.retry}</button>
      </div>
    )
  }
  if (status !== 'ready' || !fees) return null
  return (
    <div className="mt-5 border-t border-[#efece9] pt-4">
      <h4 className="text-sm font-semibold text-[#22201d]">{l.feesTitle}</h4>
      <p className="ws-caption mt-0.5">{l.feesSub}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {PAYMENT_FEE_METHODS.map(method => (
          <FeeRateRow
            key={method}
            method={method}
            rate={fees.rates[method]}
            fee={fees.totals[method]}
            periodStart={periodStart}
            today={today}
            lang={lang}
            l={l}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  )
}

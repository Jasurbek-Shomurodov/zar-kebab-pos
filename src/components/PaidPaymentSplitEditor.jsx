import React, { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { getPaymentSplitAmounts } from '../lib/paidPaymentSplit'
import { splitCompletedOrderPayment } from '../lib/db'

const labels = {
  en: { title: 'Split into two payments', note: 'The two amounts must equal the original payment. The order total and loyalty balance stay unchanged.', first: 'Payment 1', second: 'Payment 2', amount: 'Amount (UZS)', method: 'Method', cash: 'Cash', terminal: 'Terminal', card: 'Card (historical)', total: 'Original payment', invalid: 'Enter a whole amount greater than zero and less than the original payment.', save: 'Save payments', saving: 'Saving…', retry: 'Retry save', cancel: 'Cancel', error: 'Could not confirm the split. Retry to check and save safely, or reopen the order to refresh it.' },
  ru: { title: 'Разделить на два платежа', note: 'Сумма двух платежей должна равняться исходной. Итог заказа и баланс лояльности не изменятся.', first: 'Платёж 1', second: 'Платёж 2', amount: 'Сумма (UZS)', method: 'Способ', cash: 'Наличные', terminal: 'Терминал', card: 'Карта (исторический)', total: 'Исходный платёж', invalid: 'Введите целую сумму больше нуля и меньше исходного платежа.', save: 'Сохранить платежи', saving: 'Сохранение…', retry: 'Повторить сохранение', cancel: 'Отмена', error: 'Не удалось подтвердить разделение. Повторите сохранение для безопасной проверки или заново откройте заказ.' },
  uz: { title: 'Ikkita to‘lovga bo‘lish', note: 'Ikki to‘lov yig‘indisi dastlabki summaga teng bo‘lishi kerak. Buyurtma jami va sodiqlik balansi o‘zgarmaydi.', first: '1-to‘lov', second: '2-to‘lov', amount: 'Summa (UZS)', method: 'To‘lov turi', cash: 'Naqd', terminal: 'Terminal', card: 'Karta (tarixiy)', total: 'Dastlabki to‘lov', invalid: 'Noldan katta va dastlabki to‘lovdan kichik butun summani kiriting.', save: 'To‘lovlarni saqlash', saving: 'Saqlanmoqda…', retry: 'Qayta saqlash', cancel: 'Bekor qilish', error: 'Bo‘lish tasdiqlanmadi. Xavfsiz tekshirish uchun qayta saqlang yoki buyurtmani qayta oching.' },
}

export default function PaidPaymentSplitEditor({ orderId, payment, lang, onSaved, onCancel, onSavingChange }) {
  const l = labels[lang] || labels.en
  const [first, setFirst] = useState(String(Math.floor(Number(payment.amount) / 2)))
  const [methods, setMethods] = useState([['cash', 'card', 'terminal'].includes(payment.method) ? payment.method : 'cash', payment.method === 'cash' ? 'terminal' : 'cash'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const attempt = useRef(null)
  const inFlight = useRef(false)
  const split = getPaymentSplitAmounts(payment.amount, first)

  async function save() {
    if (!split.valid || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    onSavingChange(true)
    attempt.current ||= {
      p_request_id: crypto.randomUUID(), p_order_id: payment.order_id || orderId,
      p_payment_id: payment.id && payment.id !== 'legacy' ? payment.id : null,
      p_expected_amount: Number(payment.amount), p_expected_method: payment.method,
      p_first_amount: split.firstAmount, p_first_method: methods[0], p_second_method: methods[1],
    }
    try {
      const result = await splitCompletedOrderPayment(attempt.current)
      onSaved(result)
    } catch (err) {
      console.error('[paid-payment-split] save failed', err)
      setError(err)
    } finally {
      inFlight.current = false
      setSaving(false)
      onSavingChange(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-[#e4e1de] bg-[#fff1e8] p-3">
      <p className="text-sm font-semibold text-[#22201d]">{l.title}</p>
      <p className="text-xs text-[#68655f]">{l.note}</p>
      <p className="flex flex-wrap justify-between gap-x-3 text-sm font-semibold text-[#22201d]"><span>{l.total}</span><span className="whitespace-nowrap tabular-nums">{formatCurrency(payment.amount)}</span></p>
      {[l.first, l.second].map((title, index) => (
        <fieldset key={index} disabled={saving || !!attempt.current} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
          <legend className="mb-1 text-xs font-semibold text-[#22201d]">{title}</legend>
          <label className="grid min-w-0 gap-1 text-xs text-[#68655f]">
            {l.amount}
            <input aria-label={`${title}: ${l.amount}`} type="text" inputMode="numeric"
              value={formatMoneyInput(index === 0 ? first : split.secondAmount ?? '')} readOnly={index === 1}
              onChange={event => setFirst(normalizeMoneyInput(event.target.value))}
              className="ws-input w-full tabular-nums" />
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-[#68655f]">
            {l.method}
            <select aria-label={`${title}: ${l.method}`} value={methods[index]}
              onChange={event => setMethods(current => current.map((method, i) => i === index ? event.target.value : method))}
              className="ws-input w-full">
              <option value="cash">{l.cash}</option>
              {payment.method === 'card' && <option value="card">{l.card}</option>}
              <option value="terminal">{l.terminal}</option>
            </select>
          </label>
        </fieldset>
      ))}
      {!split.valid && <p role="alert" className="text-xs text-[#c4262c]">{l.invalid}</p>}
      {error && <p role="alert" className="text-xs text-[#c4262c]">{l.error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="ws-btn ws-btn-outline flex-1 basis-32">{l.cancel}</button>
        <button type="button" onClick={save} disabled={saving || !split.valid} className="ws-btn ws-btn-primary flex-1 basis-32">
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {saving ? l.saving : error ? l.retry : l.save}
        </button>
      </div>
    </div>
  )
}

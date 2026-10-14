import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { withReadTimeout, withWriteTimeout } from '../lib/writeTimeout'
import { formatCurrency } from '../lib/formatCurrency'
import { notifyTelegramOrderStatus, notifyTelegramSalaryOrderPayment, loadOrderSalaryEmployeeBalances } from '../lib/telegramNotifications'

export const salaryOrderCopy = {
  en: { available: 'Available salary', after: 'After deduction', advance: 'Existing advance', advanceAfter: 'Advance after deduction', unavailable: 'Unavailable', title: 'Deduct from salary', employee: 'Employee', choose: 'Select employee', amount: 'Salary deduction', loyalty: 'Loyalty used', cashback: 'Cashback earned', note: 'The balance after loyalty will be deducted from salary. Cash and terminal balances will not change. Any amount above the salary balance carries forward as an advance.', confirm: 'Cover order from salary', cancel: 'Close', retry: 'Retry', loading: 'Loading…', saving: 'Saving…', failed: 'Could not complete the request. Retry to check the same settlement safely.', changed: 'The bill changed. Review the updated amount and try again.', notices: 'Order paid. Telegram delivery needs attention; retry notifications below.', sent: 'Order paid and Telegram notifications sent.', done: 'Done' },
  ru: { available: 'Доступная зарплата', after: 'Останется после списания', advance: 'Текущий аванс', advanceAfter: 'Аванс после списания', unavailable: 'Недоступно', title: 'Списать из зарплаты', employee: 'Сотрудник', choose: 'Выберите сотрудника', amount: 'Списание из зарплаты', loyalty: 'Использовано бонусов', cashback: 'Начисленный кешбэк', note: 'Остаток после бонусов будет списан из зарплаты. Наличные и терминал не изменятся. Сумма сверх остатка зарплаты переносится как аванс.', confirm: 'Оплатить из зарплаты', cancel: 'Закрыть', retry: 'Повторить', loading: 'Загрузка…', saving: 'Сохранение…', failed: 'Не удалось завершить запрос. Повторите для безопасной проверки той же оплаты.', changed: 'Счёт изменился. Проверьте обновлённую сумму и повторите.', notices: 'Заказ оплачен. Повторите отправку уведомлений Telegram ниже.', sent: 'Заказ оплачен, уведомления Telegram отправлены.', done: 'Готово' },
  uz: { available: 'Mavjud maosh', after: 'Yechilgandan keyin qoladi', advance: 'Joriy avans', advanceAfter: 'Yechilgandan keyingi avans', unavailable: 'Mavjud emas', title: 'Maoshdan yechish', employee: 'Xodim', choose: 'Xodimni tanlang', amount: 'Maoshdan yechiladigan summa', loyalty: 'Ishlatilgan bonus', cashback: 'Hisoblangan keshbek', note: 'Bonusdan keyingi qoldiq maoshdan yechiladi. Naqd va terminal qoldig‘i o‘zgarmaydi. Maoshdan ortiq summa avans sifatida keyingi davrga o‘tadi.', confirm: 'Maoshdan to‘lash', cancel: 'Yopish', retry: 'Qayta urinish', loading: 'Yuklanmoqda…', saving: 'Saqlanmoqda…', failed: 'So‘rovni yakunlab bo‘lmadi. Shu to‘lovni xavfsiz tekshirish uchun qayta urinib ko‘ring.', changed: 'Hisob o‘zgardi. Yangilangan summani tekshiring va qayta urinib ko‘ring.', notices: 'Buyurtma to‘landi. Quyida Telegram xabarlarini qayta yuboring.', sent: 'Buyurtma to‘landi va Telegram xabarlari yuborildi.', done: 'Tayyor' },
}

export default function SalaryOrderPayment({ lang, disabled, total, loyaltyUsed, cashback, cardNumber, tableId, orderId, getFreshQuote, onDone, onOpenChange }) {
  const copy = salaryOrderCopy[lang] || salaryOrderCopy.en
  const storageKey = `salary-order:${orderId || tableId}`
  const [open, setOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [notified, setNotified] = useState(false)
  const request = useRef(null)
  const inFlight = useRef(false)

  async function loadEmployees() {
    setBusy(true)
    setError('')
    setEmployees([])
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        request.current = JSON.parse(saved)
        setEmployeeId(request.current.salary_profile_id)
      }
      const data = await withReadTimeout(signal => loadOrderSalaryEmployeeBalances(signal))
      setEmployees(data.employees || [])
    } catch { setError('failed') } finally { setBusy(false) }
  }

  async function notify(saved) {
    const [employee, status] = await withReadTimeout(() => Promise.all([
      notifyTelegramSalaryOrderPayment(saved.salary_payment_id),
      notifyTelegramOrderStatus(saved.order_ids, 'completed'),
    ]), 'SALARY_ORDER_NOTIFICATIONS', 30000)
    setNotified(employee?.employee?.status === 'sent' || employee?.employee?.status === 'confirmed'
      ? status?.ok === true : false)
  }

  async function confirm() {
    if (inFlight.current || (!employeeId && !request.current)) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      if (result) { await notify(result); return }
      if (!request.current) {
        const fresh = await getFreshQuote()
        if (!fresh.orderIds.length || fresh.total !== total) { setError('changed'); return }
        request.current = {
          order_id: orderId || null, table_id: tableId || null,
          salary_profile_id: employeeId, request_id: crypto.randomUUID(),
          expected_order_ids: fresh.contributingOrderIds,
          payments: [{ method: 'salary', amount: fresh.total }],
          loyalty_card_number: cardNumber || null, loyalty_used_amount: loyaltyUsed,
        }
        sessionStorage.setItem(storageKey, JSON.stringify(request.current))
      }
      // The server reconciles the durable receipt before considering any new write.
      const { data, error: saveError } = await withWriteTimeout(() => supabase.rpc('settle_orders_payment', { payload: request.current }))
      if (saveError) {
        // A definitive database rejection rolled back. Transport errors keep identity.
        if (['22023', '42501', '40001', 'PT409', 'P0001', 'P0002', '23514'].includes(saveError.code)) {
          request.current = null
          sessionStorage.removeItem(storageKey)
        }
        throw saveError
      }
      setResult(data)
      try {
        const refreshed = await withReadTimeout(signal => loadOrderSalaryEmployeeBalances(signal))
        setEmployees(refreshed.employees || [])
      } catch { setEmployees([]) }
      await notify(data)
    } catch { setError('failed') } finally { inFlight.current = false; setBusy(false) }
  }

  const selectedEmployee = employees.find(employee => employee.id === employeeId)
  const balance = selectedEmployee?.salary_balance
  const hasBalance = typeof balance === 'number' && Number.isFinite(balance)
  const afterDeduction = hasBalance ? balance - total : null

  return <>
    <button type="button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); void loadEmployees() }} className="w-full rounded-xl border-2 border-[#0f3b2e] py-3 font-bold text-[#0f3b2e] disabled:opacity-50">{copy.title}</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="salary-order-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <h2 id="salary-order-title" className="text-xl font-bold">{copy.title}</h2>
        <label className="block text-sm font-semibold">{copy.employee}
          <select autoFocus value={employeeId} disabled={busy || !!request.current || !!result} onChange={e => setEmployeeId(e.target.value)} className="mt-2 w-full rounded-xl border p-3">
            <option value="">{copy.choose}</option>
            {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_name} — {typeof employee.salary_balance === 'number' ? formatCurrency(Math.max(0, employee.salary_balance)) : copy.unavailable}</option>)}
          </select>
        </label>
        <dl className="space-y-2 text-sm">
          {employeeId && <div className="flex justify-between gap-3 rounded-lg bg-emerald-50 p-3 font-bold"><dt>{copy.available}</dt><dd>{busy && !hasBalance ? copy.loading : hasBalance ? formatCurrency(Math.max(0, balance)) : copy.unavailable}</dd></div>}
          {hasBalance && balance < 0 && <div className="flex justify-between text-amber-700"><dt>{copy.advance}</dt><dd>{formatCurrency(-balance)}</dd></div>}
          {hasBalance && !request.current && !result && <div className="flex justify-between gap-3"><dt>{afterDeduction < 0 ? copy.advanceAfter : copy.after}</dt><dd className={afterDeduction < 0 ? 'text-amber-700 font-bold' : 'font-bold'}>{formatCurrency(Math.abs(afterDeduction))}</dd></div>}
          <div className="flex justify-between"><dt>{copy.loyalty}</dt><dd>{formatCurrency(request.current?.loyalty_used_amount ?? loyaltyUsed)}</dd></div>
          <div className="flex justify-between"><dt>{copy.cashback}</dt><dd>{formatCurrency(result?.cashback_earned ?? cashback)}</dd></div>
          <div className="flex justify-between font-bold"><dt>{copy.amount}</dt><dd>{formatCurrency(request.current?.payments[0].amount ?? total)}</dd></div>
        </dl>
        <p className="text-sm text-gray-600">{copy.note}</p>
        {error && <p role="alert" className="text-sm text-red-700">{copy[error]}</p>}
        {result && <p role="status" className="text-sm">{notified ? copy.sent : copy.notices}</p>}
        {!notified && <button disabled={busy || (!employeeId && !request.current)} onClick={confirm} className="w-full rounded-xl bg-[#0f3b2e] p-3 font-bold text-white disabled:opacity-50">{busy ? copy.saving : result || request.current ? copy.retry : copy.confirm}</button>}
        {!employees.length && !busy && !request.current && <button onClick={loadEmployees}>{copy.retry}</button>}
        <button disabled={busy} onClick={() => {
          setOpen(false)
          onOpenChange(false)
          if (result) { sessionStorage.removeItem(storageKey); onDone() }
        }} className="w-full rounded-xl border p-3">{result ? copy.done : copy.cancel}</button>
      </section>
    </div>}
  </>
}

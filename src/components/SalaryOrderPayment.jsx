import React, { useState, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { withReadTimeout, withWriteTimeout } from '../lib/writeTimeout'
import { formatCurrency } from '../lib/formatCurrency'
import WorkspaceDialog from './WorkspaceDialog'
import { Shimmer } from './PageShimmer'
import { notifyTelegramOrderStatus, notifyTelegramSalaryOrderPayment, loadOrderSalaryEmployeeBalances } from '../lib/telegramNotifications'

export const salaryOrderCopy = {
  en: { available: 'Available salary', after: 'After deduction', advance: 'Existing advance', advanceAfter: 'Advance after deduction', unavailable: 'Unavailable', title: 'Deduct from salary', employee: 'Employee', choose: 'Select employee', amount: 'Salary deduction', loyalty: 'Loyalty used', cashback: 'Cashback earned', note: 'The balance after loyalty will be deducted from salary. Cash and terminal balances will not change. Any amount above the salary balance carries forward as an advance.', confirm: 'Cover order from salary', cancel: 'Close', retry: 'Retry', saving: 'Saving…', loadFailed: 'Could not load employees and salary balances. Check the connection and retry.', failed: 'Could not complete the request. Retry to check the same settlement safely.', changed: 'The bill changed. Review the updated amount and try again.', notices: 'Order paid. Telegram delivery needs attention; retry notifications below.', sent: 'Order paid and Telegram notifications sent.', done: 'Done' },
  ru: { available: 'Доступная зарплата', after: 'Останется после списания', advance: 'Текущий аванс', advanceAfter: 'Аванс после списания', unavailable: 'Недоступно', title: 'Списать из зарплаты', employee: 'Сотрудник', choose: 'Выберите сотрудника', amount: 'Списание из зарплаты', loyalty: 'Использовано бонусов', cashback: 'Начисленный кешбэк', note: 'Остаток после бонусов будет списан из зарплаты. Наличные и терминал не изменятся. Сумма сверх остатка зарплаты переносится как аванс.', confirm: 'Оплатить из зарплаты', cancel: 'Закрыть', retry: 'Повторить', saving: 'Сохранение…', loadFailed: 'Не удалось загрузить сотрудников и остатки зарплаты. Проверьте соединение и повторите.', failed: 'Не удалось завершить запрос. Повторите для безопасной проверки той же оплаты.', changed: 'Счёт изменился. Проверьте обновлённую сумму и повторите.', notices: 'Заказ оплачен. Повторите отправку уведомлений Telegram ниже.', sent: 'Заказ оплачен, уведомления Telegram отправлены.', done: 'Готово' },
  uz: { available: 'Mavjud maosh', after: 'Yechilgandan keyin qoladi', advance: 'Joriy avans', advanceAfter: 'Yechilgandan keyingi avans', unavailable: 'Mavjud emas', title: 'Maoshdan yechish', employee: 'Xodim', choose: 'Xodimni tanlang', amount: 'Maoshdan yechiladigan summa', loyalty: 'Ishlatilgan bonus', cashback: 'Hisoblangan keshbek', note: 'Bonusdan keyingi qoldiq maoshdan yechiladi. Naqd va terminal qoldig‘i o‘zgarmaydi. Maoshdan ortiq summa avans sifatida keyingi davrga o‘tadi.', confirm: 'Maoshdan to‘lash', cancel: 'Yopish', retry: 'Qayta urinish', saving: 'Saqlanmoqda…', loadFailed: 'Xodimlar va maosh qoldiqlarini yuklab bo‘lmadi. Ulanishni tekshirib, qayta urinib ko‘ring.', failed: 'So‘rovni yakunlab bo‘lmadi. Shu to‘lovni xavfsiz tekshirish uchun qayta urinib ko‘ring.', changed: 'Hisob o‘zgardi. Yangilangan summani tekshiring va qayta urinib ko‘ring.', notices: 'Buyurtma to‘landi. Quyida Telegram xabarlarini qayta yuboring.', sent: 'Buyurtma to‘landi va Telegram xabarlari yuborildi.', done: 'Tayyor' },
}

export default function SalaryOrderPayment({ lang, disabled, total, loyaltyUsed, cashback, cardNumber, tableId, orderId, getFreshQuote, onDone, onOpenChange }) {
  const copy = salaryOrderCopy[lang] || salaryOrderCopy.en
  const storageKey = `salary-order:${orderId || tableId}`
  const [open, setOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  // Reading the employee list and writing the settlement are different waits: the first
  // shimmers the balances, only the second shows "Saving" on the pressed button.
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [notified, setNotified] = useState(false)
  const request = useRef(null)
  const inFlight = useRef(false)
  const employeeSelect = useRef(null)

  async function loadEmployees() {
    setLoading(true)
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
    } catch (loadError) {
      console.error('[salary-order] employee balances failed to load', loadError)
      setError('loadFailed')
    } finally { setLoading(false) }
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
    setSaving(true)
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
    } catch (saveError) {
      console.error('[salary-order] settlement request failed', saveError)
      setError('failed')
    } finally { inFlight.current = false; setSaving(false) }
  }

  function close() {
    if (saving) return
    setOpen(false)
    onOpenChange(false)
    if (result) { sessionStorage.removeItem(storageKey); onDone() }
  }

  const selectedEmployee = employees.find(employee => employee.id === employeeId)
  const balance = selectedEmployee?.salary_balance
  const hasBalance = typeof balance === 'number' && Number.isFinite(balance)
  const afterDeduction = hasBalance ? balance - total : null
  const canConfirm = !loading && !saving && (!!employeeId || !!request.current)
  const money = 'whitespace-nowrap tabular-nums'

  return <>
    <button type="button" disabled={disabled} onClick={() => { setOpen(true); onOpenChange(true); void loadEmployees() }} className="ws-btn ws-btn-outline w-full">{copy.title}</button>
    {open && (
      <WorkspaceDialog
        title={copy.title}
        onClose={close}
        closeLabel={result ? copy.done : copy.cancel}
        busy={saving}
        initialFocusRef={employeeSelect}
        notice={(error || result) ? (
          <div className="grid gap-2">
            {error && (
              <div role="alert" className="ws-notice ws-tone-negative flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 basis-48 text-[#c4262c]">{copy[error]}</span>
                {error === 'loadFailed' && (
                  <button type="button" onClick={loadEmployees} disabled={loading} className="ws-btn ws-btn-outline ws-btn-sm">{copy.retry}</button>
                )}
              </div>
            )}
            {result && <p role="status" className={`ws-notice ${notified ? 'ws-tone-positive' : 'ws-tone-caution'}`}>{notified ? copy.sent : copy.notices}</p>}
          </div>
        ) : null}
        footer={<>
          <button type="button" disabled={saving} onClick={close} className="ws-btn ws-btn-outline">{result ? copy.done : copy.cancel}</button>
          {!notified && (
            <button type="button" disabled={!canConfirm} onClick={confirm} className="ws-btn ws-btn-primary">
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {saving ? copy.saving : result || request.current ? copy.retry : copy.confirm}
            </button>
          )}
        </>}
      >
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-[#22201d]">
            {copy.employee}
            <select ref={employeeSelect} value={employeeId} disabled={loading || saving || !!request.current || !!result} onChange={e => setEmployeeId(e.target.value)} className="ws-input w-full">
              <option value="">{copy.choose}</option>
              {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_name} · {typeof employee.salary_balance === 'number' ? formatCurrency(Math.max(0, employee.salary_balance)) : copy.unavailable}</option>)}
            </select>
          </label>
          <dl className="grid gap-2 text-sm text-[#22201d]" aria-busy={loading || undefined}>
            {loading && <Shimmer className="h-11 w-full rounded-[10px]" />}
            {!loading && employeeId && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[10px] bg-[#efece9] px-3 py-2.5 font-semibold">
                <dt>{copy.available}</dt>
                <dd className={`${money} ${hasBalance ? 'text-[#1d7a52]' : 'text-[#68655f]'}`}>{hasBalance ? formatCurrency(Math.max(0, balance)) : copy.unavailable}</dd>
              </div>
            )}
            {hasBalance && balance < 0 && <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[#9a5a00]"><dt>{copy.advance}</dt><dd className={money}>{formatCurrency(-balance)}</dd></div>}
            {hasBalance && !request.current && !result && <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt>{afterDeduction < 0 ? copy.advanceAfter : copy.after}</dt><dd className={`${money} font-semibold ${afterDeduction < 0 ? 'text-[#9a5a00]' : ''}`}>{formatCurrency(Math.abs(afterDeduction))}</dd></div>}
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt>{copy.loyalty}</dt><dd className={money}>{formatCurrency(request.current?.loyalty_used_amount ?? loyaltyUsed)}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><dt>{copy.cashback}</dt><dd className={money}>{formatCurrency(result?.cashback_earned ?? cashback)}</dd></div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[#e4e1de] pt-2 font-semibold"><dt>{copy.amount}</dt><dd className={`${money} text-base`}>{formatCurrency(request.current?.payments[0].amount ?? total)}</dd></div>
          </dl>
          <p className="ws-caption">{copy.note}</p>
        </div>
      </WorkspaceDialog>
    )}
  </>
}

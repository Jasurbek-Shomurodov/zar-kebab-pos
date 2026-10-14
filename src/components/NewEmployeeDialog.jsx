import React, { useEffect, useState } from 'react'
import { CheckCircle2, Copy, Loader2, Plus, Send, X } from 'lucide-react'
import CalendarPicker from './CalendarPicker'
import { supabase } from '../lib/supabase'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../lib/employeeJobFunctions'
import {
  EMPLOYEE_TELEGRAM_POLL_MS,
  buildEmployeeTelegramStartUrl,
  canCreateEmployee,
  employeeCreationErrorCode,
  isEmployeeTelegramLinked,
  normalizeEmployeeTelegramRegistration,
} from '../lib/employeeTelegramRegistration'
import {
  SALARY_RATE_UNITS,
  convertSalaryAmountToDaily,
  getExpenseEntryMinDate,
  isExpenseEntryDateAllowed,
  normalizeExpenseAmount,
  todayExpenseDate,
} from '../lib/expenses'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { notifyTelegramEmployeeLifecycle } from '../lib/telegramNotifications'

const FIELD = 'ws-input !h-11 min-w-0 w-full font-medium disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'

const LABELS = {
  uz: {
    add: 'Yangi xodim',
    addHelp: 'Yangi xodim va uning boshlang‘ich maoshini kiriting.',
    employeeName: 'Xodim ismi',
    jobFunction: 'Lavozim',
    selectJobFunction: 'Lavozimni tanlang',
    effectiveDate: 'Qachondan',
    salaryDateLimit: 'Ish haqi sanasi bugundan uch kundan ortiq oldin bo‘lishi mumkin emas.',
    salaryAmount: 'Maosh summasi',
    salaryUnit: 'Maosh turi',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    lifecycleTelegramFailed: 'Xodim o‘zgarishi saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
    telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME sozlanmagan.',
    telegramCopy: 'Nusxalash',
    newTelegramTitle: 'Telegram (majburiy)',
    newTelegramHelp: 'Xodim havolani ochib, botda «Start» ni bossin. Telegram ulanmaguncha xodim qo‘shilmaydi.',
    newTelegramConnect: 'Telegramni ulash',
    newTelegramNewLink: 'Yangi havola',
    newTelegramWaiting: 'Xodim botda «Start» ni bosishi kutilmoqda',
    newTelegramLinked: 'Telegram ulandi',
    newTelegramExpired: 'Havola eskirdi. Yangisini yarating.',
    newTelegramRequired: 'Saqlashdan oldin xodimning Telegramini ulang.',
    newTelegramAlreadyLinked: 'Bu Telegram akkaunt boshqa xodimga ulangan. Boshqa akkaunt bilan yangi havola yarating.',
    newTelegramRegistrationInvalid: 'Telegram havolasi endi ishlamaydi. Yangisini yarating.',
    employeeDetailsInvalid: 'Ism, sana va maosh summasini tekshiring.',
  },
  ru: {
    add: 'Новый сотрудник',
    addHelp: 'Укажите нового сотрудника и его первоначальную зарплату.',
    employeeName: 'Имя сотрудника',
    jobFunction: 'Должность',
    selectJobFunction: 'Выберите должность',
    effectiveDate: 'Действует с',
    salaryDateLimit: 'Дата зарплаты не может быть раньше, чем три дня назад.',
    salaryAmount: 'Сумма зарплаты',
    salaryUnit: 'Тип зарплаты',
    save: 'Сохранить',
    cancel: 'Отмена',
    lifecycleTelegramFailed: 'Изменение сотрудника сохранено, но сообщение в группу ZarKebab Investor не отправлено.',
    telegramBotMissing: 'Не настроен VITE_TELEGRAM_BOT_USERNAME.',
    telegramCopy: 'Копировать',
    newTelegramTitle: 'Telegram (обязательно)',
    newTelegramHelp: 'Сотрудник открывает ссылку и нажимает «Start» в боте. Без подключённого Telegram сотрудника добавить нельзя.',
    newTelegramConnect: 'Подключить Telegram',
    newTelegramNewLink: 'Новая ссылка',
    newTelegramWaiting: 'Ждём, когда сотрудник нажмёт «Start» в боте',
    newTelegramLinked: 'Telegram подключён',
    newTelegramExpired: 'Ссылка устарела. Создайте новую.',
    newTelegramRequired: 'Подключите Telegram сотрудника перед сохранением.',
    newTelegramAlreadyLinked: 'Этот Telegram-аккаунт уже привязан к другому сотруднику. Создайте новую ссылку для другого аккаунта.',
    newTelegramRegistrationInvalid: 'Ссылка Telegram больше не действует. Создайте новую.',
    employeeDetailsInvalid: 'Проверьте имя, дату и сумму зарплаты.',
  },
  en: {
    add: 'New employee',
    addHelp: 'Enter a new employee and their starting salary.',
    employeeName: 'Employee name',
    jobFunction: 'Role',
    selectJobFunction: 'Select a role',
    effectiveDate: 'Effective date',
    salaryDateLimit: 'Salary dates cannot be more than three days before today.',
    salaryAmount: 'Salary amount',
    salaryUnit: 'Salary type',
    save: 'Save',
    cancel: 'Cancel',
    lifecycleTelegramFailed: 'The employee change was saved, but the ZarKebab Investor group notification was not sent.',
    telegramBotMissing: 'VITE_TELEGRAM_BOT_USERNAME is not configured.',
    telegramCopy: 'Copy',
    newTelegramTitle: 'Telegram (required)',
    newTelegramHelp: 'The employee opens the link and presses Start in the bot. An employee cannot be added until Telegram is connected.',
    newTelegramConnect: 'Connect Telegram',
    newTelegramNewLink: 'New link',
    newTelegramWaiting: 'Waiting for the employee to press Start in the bot',
    newTelegramLinked: 'Telegram connected',
    newTelegramExpired: 'The link expired. Create a new one.',
    newTelegramRequired: "Connect the employee's Telegram before saving.",
    newTelegramAlreadyLinked: 'This Telegram account is already linked to another employee. Create a new link for a different account.',
    newTelegramRegistrationInvalid: 'This Telegram link no longer works. Create a new one.',
    employeeDetailsInvalid: 'Check the name, date and salary amount.',
  },
}

const UNIT_LABELS = {
  daily: { uz: 'Kunlik', ru: 'Дневная', en: 'Daily' },
  monthly: { uz: 'Oylik', ru: 'Месячная', en: 'Monthly' },
}

function emptyForm() {
  return { employee_name: '', job_function: '', joined_at: todayExpenseDate(), salary_amount: '', salary_unit: 'daily', payment_method: 'cash' }
}

// Hiring needs a linked Telegram first (migration 248): the employee presses Start
// on a registration link, then one RPC creates the profile, first rate and link.
export default function NewEmployeeDialog({ lang, canManage, onClose, onCreated }) {
  const l = LABELS[lang] || LABELS.en
  const today = todayExpenseDate()
  const [form, setForm] = useState(emptyForm)
  const [registration, setRegistration] = useState(null)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  const pendingToken = registration?.status === 'pending' ? registration.token : ''
  useEffect(() => {
    if (!pendingToken) return undefined
    let cancelled = false
    async function checkRegistration() {
      const { data, error: statusError } = await supabase.rpc('get_employee_telegram_registration', {
        p_token: pendingToken,
      })
      // A failed check is retried on the next tick.
      if (cancelled || statusError) return
      const next = normalizeEmployeeTelegramRegistration(Array.isArray(data) ? data[0] : data)
      setRegistration(current => (
        current?.token === pendingToken && current.status === 'pending'
          ? { ...current, ...next, errorCode: '' }
          : current
      ))
    }
    const timer = setInterval(checkRegistration, EMPLOYEE_TELEGRAM_POLL_MS)
    void checkRegistration()
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pendingToken])

  async function createTelegramLink() {
    const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim()
    if (!botUsername) {
      setError(l.telegramBotMissing)
      return
    }
    if (!canManage) return
    setError('')
    setSaving('telegram')
    const { data: token, error: registrationError } = await supabase.rpc('create_employee_telegram_registration')
    setSaving('')
    if (registrationError) {
      setError(registrationError.message)
      return
    }
    setRegistration({ token, url: buildEmployeeTelegramStartUrl(botUsername, token), status: 'pending', username: '', errorCode: '' })
  }

  async function copyTelegramLink() {
    if (!registration?.url) return
    try {
      await navigator.clipboard.writeText(registration.url)
    } catch {
      setError(registration.url)
    }
  }

  async function createSalaryProfile(event) {
    event.preventDefault()
    if (!canManage) return
    setError('')
    const employeeName = String(form.employee_name || '').trim()
    const amount = normalizeExpenseAmount(form.salary_amount)
    if (!isExpenseEntryDateAllowed(form.joined_at)) {
      setError(l.salaryDateLimit)
      return
    }
    if (!employeeName || !EMPLOYEE_JOB_FUNCTIONS.some(item => item.value === form.job_function) || !form.joined_at || amount <= 0) return
    // An employee cannot be added without a linked Telegram account.
    if (!isEmployeeTelegramLinked(registration)) {
      setRegistration(current => ({ ...(current || { token: '', url: '', status: '', username: '' }), errorCode: 'employee_telegram_not_linked' }))
      return
    }
    setSaving('create')
    // One transaction creates the profile, first rate and Telegram link. The
    // token makes it idempotent, so after a timeout Save can be pressed again.
    const { data: salaryProfileId, error: createError } = await supabase.rpc('create_employee_salary_profile_with_telegram', {
      p_token: registration.token,
      p_employee_name: employeeName,
      p_job_function: form.job_function,
      p_joined_at: form.joined_at,
      p_payment_method: form.payment_method,
      p_amount: amount,
      p_rate_unit: form.salary_unit,
      p_daily_amount: convertSalaryAmountToDaily(amount, form.salary_unit),
    })
    setSaving('')
    if (createError) {
      const errorCode = employeeCreationErrorCode(createError)
      if (!errorCode) {
        setError(createError.message)
        return
      }
      setRegistration(current => ({
        ...current,
        errorCode,
        status: errorCode === 'employee_telegram_not_linked'
          ? 'pending'
          : errorCode === 'employee_details_invalid' ? current.status : 'expired',
      }))
      return
    }
    const notification = await notifyTelegramEmployeeLifecycle(salaryProfileId, 'created')
    onCreated({ salaryProfileId, notificationError: notification?.ok ? '' : l.lifecycleTelegramFailed })
  }

  const busy = Boolean(saving)
  const close = () => { if (saving !== 'create') onClose() }
  const status = registration?.token ? registration.status : ''
  const telegramError = {
    employee_telegram_not_linked: l.newTelegramRequired,
    employee_telegram_already_linked: l.newTelegramAlreadyLinked,
    employee_telegram_registration_not_found: l.newTelegramRegistrationInvalid,
    employee_telegram_registration_consumed: l.newTelegramRegistrationInvalid,
    employee_details_invalid: l.employeeDetailsInvalid,
  }[registration?.errorCode || '']

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <button type="button" aria-label={l.cancel} onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm" />
      <form role="dialog" aria-modal="true" aria-labelledby="new-employee-title" onSubmit={createSalaryProfile}
        onKeyDown={event => { if (event.key === 'Escape') close() }}
        className="ws-dialog relative flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[#e4e1de] px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 id="new-employee-title" className="ws-display !text-[22px]">{l.add}</h2>
            <p className="ws-caption mt-0.5">{l.addHelp}</p>
          </div>
          <button type="button" onClick={close} aria-label={l.cancel} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="ws-caption flex min-w-0 flex-col gap-1.5 font-medium">
              {l.employeeName}
              <input type="text" value={form.employee_name} maxLength={120} autoFocus disabled={busy}
                onChange={event => setForm(current => ({ ...current, employee_name: event.target.value }))} className={FIELD} />
            </label>
            <label className="ws-caption flex min-w-0 flex-col gap-1.5 font-medium">
              {l.jobFunction}
              <select value={form.job_function} required disabled={busy}
                onChange={event => setForm(current => ({ ...current, job_function: event.target.value }))} className={FIELD}>
                <option value="" disabled>{l.selectJobFunction}</option>
                {EMPLOYEE_JOB_FUNCTIONS.map(item => (
                  <option key={item.value} value={item.value}>{employeeJobFunctionLabel(item.value, lang)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="ws-caption flex min-w-0 flex-col gap-1.5 font-medium">
              {l.salaryAmount}
              <div className="relative min-w-0">
                <input type="text" inputMode="numeric" value={formatMoneyInput(form.salary_amount)} disabled={busy}
                  onChange={event => setForm(current => ({ ...current, salary_amount: normalizeMoneyInput(event.target.value) }))}
                  className={`${FIELD} pr-12 tabular-nums`} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-[#68655f]">UZS</span>
              </div>
            </label>
            <label className="ws-caption flex min-w-0 flex-col gap-1.5 font-medium">
              {l.salaryUnit}
              <select value={form.salary_unit} disabled={busy}
                onChange={event => setForm(current => ({ ...current, salary_unit: event.target.value }))} className={FIELD}>
                {SALARY_RATE_UNITS.map(unit => <option key={unit} value={unit}>{UNIT_LABELS[unit]?.[lang] || UNIT_LABELS[unit]?.en || unit}</option>)}
              </select>
            </label>
            <label className="ws-caption flex min-w-0 flex-col gap-1.5 font-medium">
              {l.effectiveDate}
              <CalendarPicker value={form.joined_at} lang={lang} min={getExpenseEntryMinDate(today)} disabled={busy}
                onChange={value => setForm(current => ({ ...current, joined_at: value }))} />
            </label>
          </div>

          <div className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] p-3" data-testid="new-employee-telegram">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#22201d]">{l.newTelegramTitle}</p>
                <p className="ws-caption mt-0.5">{l.newTelegramHelp}</p>
              </div>
              {status !== 'linked' && (
                <button type="button" onClick={createTelegramLink} disabled={busy}
                  className={`ws-btn ${status ? 'ws-btn-outline' : 'ws-btn-primary'} ws-btn-sm`}>
                  {saving === 'telegram' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {status ? l.newTelegramNewLink : l.newTelegramConnect}
                </button>
              )}
            </div>
            {status === 'pending' && registration.url && (
              <div className="flex min-w-0 items-center gap-2">
                <input readOnly value={registration.url} aria-label={l.newTelegramTitle} onFocus={event => event.target.select()}
                  className="ws-input min-w-0 flex-1 font-mono !text-xs" />
                <button type="button" onClick={copyTelegramLink} className="ws-btn ws-btn-outline ws-btn-sm">
                  <Copy size={14} />{l.telegramCopy}
                </button>
              </div>
            )}
            {status === 'pending' && <p className="ws-notice ws-tone-caution" role="status">{l.newTelegramWaiting}</p>}
            {status === 'linked' && (
              <p className="ws-notice ws-tone-positive flex items-center gap-2" role="status">
                <CheckCircle2 size={15} />
                {l.newTelegramLinked}{registration.username ? ` · @${registration.username}` : ''}
              </p>
            )}
            {(status === 'expired' || status === 'consumed') && !telegramError && (
              <p className="ws-notice ws-tone-caution" role="status">{l.newTelegramExpired}</p>
            )}
            {telegramError && <p className="ws-notice ws-tone-negative" role="alert">{telegramError}</p>}
          </div>
        </div>

        <div className="border-t border-[#e4e1de] px-6 py-4">
          {error && <p role="alert" className="ws-notice ws-tone-negative mb-3 break-words">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={saving === 'create'} className="ws-btn ws-btn-outline">{l.cancel}</button>
            <button type="submit"
              disabled={!canManage || busy || !canCreateEmployee({ ...form, salary_amount: normalizeExpenseAmount(form.salary_amount) }, registration)}
              className="ws-btn ws-btn-primary">
              {saving === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{l.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

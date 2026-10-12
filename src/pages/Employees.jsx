import CalendarPicker from '../components/CalendarPicker'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../lib/employeeJobFunctions'
import React, { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, CalendarDays, CalendarX2, Check, ChevronDown, ChevronUp, History, Loader2, Pencil, Power, UserRound, Users, WalletCards, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import PageShimmer from '../components/PageShimmer'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { canEditFeature, normalizeRole } from '../lib/permissions'
import { compareSalaryAbsencesNewestFirst } from '../lib/salaryTransactions'
import { loadSalaryRows } from '../lib/salaryData'
import { formatKpiRatePercent, formatKpiSalesBasis, formatKpiStartTime, getEffectiveKpiRule } from '../lib/dailyKpi'
import { notifyTelegramAbsenceUndo, notifyTelegramEmployeeLifecycle } from '../lib/telegramNotifications'
import {
  getDailySalaryAmount,
  getSalaryAbsenceForDate,
  getSalaryAbsenceDates,
  getSalaryActiveUntil,
  getSalaryBalance,
  getTotalSalaryDue,
  buildSalaryReactivationAbsenceRows,
  normalizeSalaryEndDate,
  todayExpenseDate,
} from '../lib/expenses'

function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  )
}

function composeEmployees(rows = [], rates = [], payments = [], bonuses = [], fines = [], absences = [], profiles = []) {
  const profileMap = Object.fromEntries(profiles.map(profile => [profile.id, profile]))
  return rows.map(row => ({
    ...row,
    profile: profileMap[row.profile_id] || null,
    rates: rates
      .filter(rate => rate.salary_profile_id === row.id)
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || ''))),
    payments: payments.filter(payment => payment.salary_profile_id === row.id),
    bonuses: bonuses.filter(bonus => bonus.salary_profile_id === row.id),
    fines: fines.filter(fine => fine.salary_profile_id === row.id),
    absences: absences
      .filter(absence => absence.salary_profile_id === row.id)
      .sort(compareSalaryAbsencesNewestFirst),
  }))
}

function employeeName(employee) {
  return employee.employee_name || employee.profile?.full_name || employee.profile?.email || 'Employee'
}

export default function Employees() {
  const { state } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const today = todayExpenseDate()
  const canManage = canEditFeature(profile || { role: state.user?.role }, 'expenses')
  const isOwner = normalizeRole(profile?.role || state.user?.role) === 'owner'
  const canEditName = canManage && isOwner

  const L = {
    uz: {
      title: 'Xodimlar',
      allRoles: 'Barcha lavozimlar',
      sortBy: 'Saralash',
      defaultSort: 'Odatiy tartib',
      balanceDesc: 'Balans: yuqoridan pastga',
      balanceAsc: 'Balans: pastdan yuqoriga',
      salaryDesc: 'Kunlik maosh: yuqoridan pastga',
      salaryAsc: 'Kunlik maosh: pastdan yuqoriga',
      nameAsc: 'Ism: A–Z',
      joinedDesc: 'Ishga kirgan: eng yangi',
      joinedAsc: 'Ishga kirgan: eng eski',
      noMatches: 'Bu lavozimda xodimlar topilmadi',
      resetFilters: 'Filtrlarni tozalash',
      sub: 'Maosh tizimidagi xodimlar ro‘yxati',
      back: 'Maoshlarga qaytish',
      active: 'Faol',
      inactive: 'Nofaol',
      inactiveSection: 'Faolsizlantirilgan xodimlar',
      inactiveSalaryDue: 'To‘lanadigan maosh',
      inactiveNewestFirst: 'Eng oxirgi faolsizlantirilgan xodim birinchi',
      joined: 'Ishga kirgan',
      ended: 'Tugagan',
      daily: 'Kunlik',
      kpi: 'KPI',
      kpiEnabled: 'Faol',
      kpiDisabled: 'O‘chirilgan',
      kpiNotConfigured: 'Belgilanmagan',
      kpiUnavailable: 'Mavjud emas',
      activeDaily: 'Kunlik faol',
      absentToday: 'Bugun kelmagan',
      undoAbsence: 'Yo‘qlikni bekor qilish',
      undoAbsenceWarning: 'Bugungi maosh qayta hisoblanadi. Telegramdagi yuborilgan xabarlar o‘chirilmaydi.',
      undoAbsenceFailed: 'Bugungi yo‘qlikni bekor qilib bo‘lmadi.',
      undoAbsenceNotificationFailed: 'Yo‘qlik bekor qilindi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
      balance: 'Balans',
      due: 'Qarz',
      endDate: 'Tugash sanasi',
      status: 'Holat',
      history: 'Maosh tarixi',
      historyBtn: 'Tarix',
      paymentHistory: 'To‘lovlar / bonuslar / jarimalar',
      paymentLabel: 'To‘lov',
      bonusLabel: 'Bonus',
      fineLabel: 'Jarima',
      absenceHistory: 'Kelmagan kunlar',
      absentLabel: 'Kelmagan',
      editName: 'Xodimni tahrirlash',
      jobFunction: 'Lavozim',
      noJobFunction: 'Lavozim belgilanmagan',
      employeeName: 'Xodim ismi',
      saveName: 'Saqlash',
      cancel: 'Bekor qilish',
      nameRequired: 'Xodim ismini kiriting.',
      deactivate: 'Faolsizlantirish',
      reactivate: 'Qayta yoqish',
      confirm: 'Tasdiqlash',
      empty: 'Xodimlar hali qo‘shilmagan',
      migration: 'Maosh jadvallari yangilanmagan. Supabase SQL editorida employee_salary migratsiyalarini ishga tushiring.',
      lifecycleNotificationFailed: 'Xodim holati saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
    },
    ru: {
      title: 'Сотрудники',
      allRoles: 'Все должности',
      sortBy: 'Сортировка',
      defaultSort: 'По умолчанию',
      balanceDesc: 'Баланс: по убыванию',
      balanceAsc: 'Баланс: по возрастанию',
      salaryDesc: 'Дневная зарплата: по убыванию',
      salaryAsc: 'Дневная зарплата: по возрастанию',
      nameAsc: 'Имя: А–Я',
      joinedDesc: 'Дата выхода: сначала новые',
      joinedAsc: 'Дата выхода: сначала старые',
      noMatches: 'Нет сотрудников с этой должностью',
      resetFilters: 'Сбросить фильтры',
      sub: 'Список сотрудников в зарплатной системе',
      back: 'Назад к зарплатам',
      active: 'Активен',
      inactive: 'Неактивен',
      inactiveSection: 'Деактивированные сотрудники',
      inactiveSalaryDue: 'Зарплата к выплате',
      inactiveNewestFirst: 'Сначала недавно деактивированные',
      joined: 'Дата выхода',
      ended: 'Дата окончания',
      daily: 'За день',
      kpi: 'KPI',
      kpiEnabled: 'Включён',
      kpiDisabled: 'Выключен',
      kpiNotConfigured: 'Не настроен',
      kpiUnavailable: 'Недоступно',
      activeDaily: 'Активные за день',
      absentToday: 'Сегодня отсутствует',
      undoAbsence: 'Отменить отсутствие',
      undoAbsenceWarning: 'Зарплата за сегодня будет восстановлена. Отправленные сообщения Telegram не удаляются.',
      undoAbsenceFailed: 'Не удалось отменить сегодняшнее отсутствие.',
      undoAbsenceNotificationFailed: 'Отсутствие отменено, но сообщение в группу ZarKebab Investor не отправлено.',
      balance: 'Баланс',
      due: 'Долг',
      endDate: 'Дата окончания',
      status: 'Статус',
      history: 'История зарплаты',
      historyBtn: 'История',
      paymentHistory: 'Выплаты / бонусы / штрафы',
      paymentLabel: 'Выплата',
      bonusLabel: 'Бонус',
      fineLabel: 'Штраф',
      absenceHistory: 'Дни отсутствия',
      absentLabel: 'Отсутствовал',
      editName: 'Редактировать сотрудника',
      jobFunction: 'Должность',
      noJobFunction: 'Должность не указана',
      employeeName: 'Имя сотрудника',
      saveName: 'Сохранить',
      cancel: 'Отмена',
      nameRequired: 'Введите имя сотрудника.',
      deactivate: 'Деактивировать',
      reactivate: 'Включить снова',
      confirm: 'Подтвердить',
      empty: 'Сотрудники еще не добавлены',
      migration: 'Таблицы зарплат не обновлены. Запустите миграции employee_salary в Supabase SQL Editor.',
      lifecycleNotificationFailed: 'Статус сотрудника сохранён, но сообщение в группу ZarKebab Investor не отправлено.',
    },
    en: {
      title: 'Employees',
      allRoles: 'All roles',
      sortBy: 'Sort by',
      defaultSort: 'Default order',
      balanceDesc: 'Balance: highest first',
      balanceAsc: 'Balance: lowest first',
      salaryDesc: 'Daily salary: highest first',
      salaryAsc: 'Daily salary: lowest first',
      nameAsc: 'Name: A–Z',
      joinedDesc: 'Joined: newest first',
      joinedAsc: 'Joined: oldest first',
      noMatches: 'No employees match this role',
      resetFilters: 'Reset filters',
      sub: 'Employee list from the salary system',
      back: 'Back to salaries',
      active: 'Active',
      inactive: 'Inactive',
      inactiveSection: 'Deactivated employees',
      inactiveSalaryDue: 'Salary due',
      inactiveNewestFirst: 'Most recently deactivated first',
      joined: 'Joined',
      ended: 'Ended',
      daily: 'Daily',
      kpi: 'KPI',
      kpiEnabled: 'Enabled',
      kpiDisabled: 'Disabled',
      kpiNotConfigured: 'Not configured',
      kpiUnavailable: 'Unavailable',
      activeDaily: 'Active daily',
      absentToday: 'Absent today',
      undoAbsence: 'Undo absence',
      undoAbsenceWarning: "Today's salary will be restored. Sent Telegram messages are not recalled.",
      undoAbsenceFailed: "Could not undo today's absence.",
      undoAbsenceNotificationFailed: 'Absence was undone, but the ZarKebab Investor group notification was not sent.',
      balance: 'Balance',
      due: 'Due',
      endDate: 'End date',
      status: 'Status',
      history: 'Salary history',
      historyBtn: 'History',
      paymentHistory: 'Payments / bonuses / fines',
      paymentLabel: 'Payment',
      bonusLabel: 'Bonus',
      fineLabel: 'Fine',
      absenceHistory: 'Absent dates',
      absentLabel: 'Absent',
      editName: 'Edit employee',
      jobFunction: 'Role',
      noJobFunction: 'Role not assigned',
      employeeName: 'Employee name',
      saveName: 'Save',
      cancel: 'Cancel',
      nameRequired: 'Enter the employee name.',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      confirm: 'Confirm',
      empty: 'No employees added yet',
      migration: 'Salary tables are not up to date. Run the employee_salary migrations in Supabase SQL Editor.',
      lifecycleNotificationFailed: 'The employee status was saved, but the ZarKebab Investor group notification was not sent.',
    },
  }
  const l = L[lang] || L.en

  const [employees, setEmployees] = useState([])
  const [kpiRules, setKpiRules] = useState([])
  const [kpiRulesAvailable, setKpiRulesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [confirmActionKey, setConfirmActionKey] = useState('')
  const [deactivateDates, setDeactivateDates] = useState({})
  const [inactiveExpanded, setInactiveExpanded] = useState(false)
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('default')
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingJobFunction, setEditingJobFunction] = useState('')
  const [error, setError] = useState('')

  async function loadEmployees() {
    setLoading(true)
    setError('')
    const [teamRes, profileRes, rateRes, paymentRes, bonusRes, fineRes, absenceRes, kpiRuleRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, status, created_at').order('full_name'),
      loadSalaryRows(() => supabase.from('employee_salary_profiles').select('*').order('employee_name')),
      loadSalaryRows(() => supabase.from('employee_salary_rates').select('*').order('effective_from', { ascending: false })),
      loadSalaryRows(() => supabase.from('employee_salary_payments').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_bonuses').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_fines').select('*')),
      loadSalaryRows(() => supabase.from('employee_salary_absences').select('*')),
      supabase.from('employee_kpi_rules')
        .select('id, salary_profile_id, effective_from, rate_bps, is_enabled, sales_basis, start_time, created_at, updated_at')
        .lte('effective_from', today)
        .order('effective_from', { ascending: false })
        .order('updated_at', { ascending: false }),
    ])

    setKpiRules(kpiRuleRes.error ? [] : kpiRuleRes.data || [])
    setKpiRulesAvailable(!kpiRuleRes.error)

    const salaryError = profileRes.error || rateRes.error || paymentRes.error || bonusRes.error || absenceRes.error
    if (salaryError) {
      setError(isMissingSalaryMigration(salaryError) ? l.migration : salaryError.message)
      setEmployees([])
    } else {
      if (fineRes.error) setError(isMissingSalaryMigration(fineRes.error) ? l.migration : fineRes.error.message)
      setEmployees(composeEmployees(
        profileRes.data || [],
        rateRes.data || [],
        paymentRes.data || [],
        bonusRes.data || [],
        fineRes.error ? [] : fineRes.data || [],
        absenceRes.data || [],
        teamRes.data || [],
      ).filter(employee => !employee.deleted_at))
    }
    setLoading(false)
  }

  useEffect(() => { loadEmployees() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeEmployees = useMemo(() => employees.filter(item => item.is_active !== false), [employees])
  const absentTodayEmployeeIds = useMemo(() => new Set(
    activeEmployees
      .filter(employee => getSalaryAbsenceDates(employee).has(today))
      .map(employee => employee.id)
  ), [activeEmployees, today])
  const defaultActiveEmployees = useMemo(() => (
    [...activeEmployees].sort((a, b) => (
      getDailySalaryAmount(a, getSalaryActiveUntil(a, today)) - getDailySalaryAmount(b, getSalaryActiveUntil(b, today)) ||
      employeeName(a).localeCompare(employeeName(b))
    ))
  ), [activeEmployees, today])
  const defaultInactiveEmployees = useMemo(() => (
    employees
      .filter(item => item.is_active === false)
      .sort((a, b) => (
        String(b.ended_at || '').localeCompare(String(a.ended_at || '')) ||
        employeeName(a).localeCompare(employeeName(b))
      ))
  ), [employees])
  const { sortedActiveEmployees, inactiveEmployees } = useMemo(() => {
    const matches = [...defaultActiveEmployees, ...defaultInactiveEmployees].filter(employee => roleFilter === 'all' || (
      roleFilter === 'unassigned' ? !employee.job_function : employee.job_function === roleFilter
    ))
    // Compute ledger values once per employee, using the same dates as the cards.
    const values = new Map(matches.map(employee => [employee.id, {
      balance: getSalaryBalance(employee, today),
      salary: getDailySalaryAmount(employee, getSalaryActiveUntil(employee, today)),
    }]))
    const compare = (a, b) => {
      const byName = employeeName(a).localeCompare(employeeName(b), lang)
      switch (sortBy) {
        case 'balanceDesc': return values.get(b.id).balance - values.get(a.id).balance || byName
        case 'balanceAsc': return values.get(a.id).balance - values.get(b.id).balance || byName
        case 'salaryDesc': return values.get(b.id).salary - values.get(a.id).salary || byName
        case 'salaryAsc': return values.get(a.id).salary - values.get(b.id).salary || byName
        case 'nameAsc': return byName
        case 'joinedDesc': return String(b.joined_at || '').localeCompare(String(a.joined_at || '')) || byName
        case 'joinedAsc': return String(a.joined_at || '').localeCompare(String(b.joined_at || '')) || byName
        default: return 0
      }
    }
    return {
      sortedActiveEmployees: matches.filter(employee => employee.is_active !== false).sort(compare),
      inactiveEmployees: matches.filter(employee => employee.is_active === false).sort(compare),
    }
  }, [defaultActiveEmployees, defaultInactiveEmployees, roleFilter, sortBy, today, lang])
  const employeeGridEntries = [
    ...sortedActiveEmployees.map(employee => ({ type: 'employee', employee })),
    ...(inactiveEmployees.length > 0 ? [{ type: 'inactive-toggle', id: 'inactive-toggle' }] : []),
    ...(inactiveExpanded ? inactiveEmployees.map(employee => ({ type: 'employee', employee })) : []),
  ]
  const activeCount = activeEmployees.length
  const absentTodayCount = absentTodayEmployeeIds.size
  const activeDailySalary = useMemo(() => (
    activeEmployees.reduce((sum, item) => sum + getDailySalaryAmount(item, today), 0)
  ), [activeEmployees, today])
  const totalDue = useMemo(() => getTotalSalaryDue(employees, today), [employees, today])
  const inactiveSalaryDue = useMemo(() => getTotalSalaryDue(inactiveEmployees, today), [inactiveEmployees, today])

  async function toggleEmployeeActive(employee) {
    if (!canManage || !employee?.id) return
    const key = `employee-toggle-${employee.id}`
    const nextActive = employee.is_active === false
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      if (!nextActive) {
        setDeactivateDates(current => ({
          ...current,
          [employee.id]: normalizeSalaryEndDate(employee, current[employee.id], today),
        }))
      }
      return
    }
    setSaving(key)
    setError('')
    if (nextActive) {
      const absenceRows = buildSalaryReactivationAbsenceRows(employee, today)
      if (absenceRows.length > 0) {
        const { error: absenceError } = await supabase
          .from('employee_salary_absences')
          .upsert(absenceRows, { onConflict: 'salary_profile_id,absence_date', ignoreDuplicates: true })
        if (absenceError) {
          setSaving('')
          setConfirmActionKey('')
          setError(absenceError.message)
          return
        }
      }
    }
    const patch = nextActive
      ? { is_active: true, ended_at: null }
      : { is_active: false, ended_at: normalizeSalaryEndDate(employee, deactivateDates[employee.id], today) }
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update(patch)
      .eq('id', employee.id)
    setSaving('')
    setConfirmActionKey('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDeactivateDates(current => {
      const next = { ...current }
      delete next[employee.id]
      return next
    })
    const notification = await notifyTelegramEmployeeLifecycle(
      employee.id,
      nextActive ? 'activated' : 'deactivated',
    )
    await loadEmployees()
    if (!notification?.ok) setError(l.lifecycleNotificationFailed)
  }

  async function undoEmployeeAbsence(employee) {
    if (!canManage || !employee?.id) return
    const absence = getSalaryAbsenceForDate(employee, today)
    if (!absence?.id) {
      setError(l.undoAbsenceFailed)
      await loadEmployees()
      return
    }
    const key = `absence-undo-${employee.id}`
    if (confirmActionKey !== key) {
      setConfirmActionKey(key)
      return
    }

    setSaving(key)
    setError('')
    const { data, error: deleteError } = await supabase
      .from('employee_salary_absences')
      .delete()
      .eq('id', absence.id)
      .eq('salary_profile_id', employee.id)
      .eq('absence_date', today)
      .select('id')
    setSaving('')
    setConfirmActionKey('')
    if (deleteError || !data?.length) {
      setError(deleteError?.message || l.undoAbsenceFailed)
      return
    }
    const notification = await notifyTelegramAbsenceUndo(absence.id)
    if (!notification?.ok) setError(l.undoAbsenceNotificationFailed)
    await loadEmployees()
  }
  function startNameEdit(employee) {
    if (!canEditName || !employee?.id) return
    setEditingNameId(employee.id)
    setEditingName(employeeName(employee))
    setEditingJobFunction(employee.job_function || '')
    setConfirmActionKey('')
    setError('')
  }

  function cancelNameEdit() {
    setEditingNameId(null)
    setEditingName('')
    setEditingJobFunction('')
  }

  async function saveEmployeeName(employee) {
    if (!canEditName || !employee?.id || editingNameId !== employee.id) return
    const nextName = editingName.trim()
    if (!nextName) {
      setError(l.nameRequired)
      return
    }

    const key = `employee-name-${employee.id}`
    setSaving(key)
    setError('')
    const { error: updateError } = await supabase
      .from('employee_salary_profiles')
      .update({ employee_name: nextName, job_function: editingJobFunction || null })
      .eq('id', employee.id)
    setSaving('')
    if (updateError) {
      setError(updateError.message)
      return
    }
    cancelNameEdit()
    await loadEmployees()
  }

  const back = { label: l.back, onClick: () => navigate('/admin/accounting/salaries') }

  return (
    <AppShell title={l.title} back={back}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Users} label={l.active} value={activeCount} />
            <Kpi icon={CalendarX2} label={l.absentToday} value={absentTodayCount} danger={absentTodayCount > 0} />
            <Kpi icon={CalendarDays} label={l.activeDaily} value={formatCurrency(activeDailySalary)} />
            <Kpi icon={WalletCards} label={l.due} value={formatCurrency(totalDue)} hot={totalDue > 0} />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="ws-caption flex w-full flex-col gap-1.5 font-medium sm:w-auto">
              {l.jobFunction}
              <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="ws-input sm:w-[240px] sm:min-w-[220px]">
                <option value="all">{l.allRoles}</option>
                {EMPLOYEE_JOB_FUNCTIONS.map(job => <option key={job.value} value={job.value}>{employeeJobFunctionLabel(job.value, lang)}</option>)}
                <option value="unassigned">{l.noJobFunction}</option>
              </select>
            </label>
            <label className="ws-caption flex w-full flex-col gap-1.5 font-medium sm:w-auto">
              {l.sortBy}
              <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="ws-input sm:w-[240px] sm:min-w-[220px]">
                <option value="default">{l.defaultSort}</option>
                {['balanceDesc', 'balanceAsc', 'salaryDesc', 'salaryAsc', 'nameAsc', 'joinedDesc', 'joinedAsc'].map(value => <option key={value} value={value}>{l[value]}</option>)}
              </select>
            </label>
            {(roleFilter !== 'all' || sortBy !== 'default') && (
              <button type="button" onClick={() => { setRoleFilter('all'); setSortBy('default') }} className="ws-btn ws-btn-ghost h-11">{l.resetFilters}</button>
            )}
          </div>

          {error && <div className="ws-notice ws-tone-negative">{error}</div>}

          {loading ? (
            <PageShimmer layout="table" className="!p-0" />
          ) : employees.length === 0 ? (
            <div className="ws-panel ws-empty"><Users /><p>{l.empty}</p></div>
          ) : employeeGridEntries.length === 0 ? (
            <div role="status" className="ws-panel ws-empty"><Users /><p>{l.noMatches}</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {employeeGridEntries.map(entry => {
                if (entry.type === 'inactive-toggle') {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setInactiveExpanded(current => !current)}
                      aria-expanded={inactiveExpanded}
                      className="ws-panel ws-inactive-card flex min-h-20 items-center justify-between gap-4 !py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 md:col-span-2 xl:col-span-3"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="ws-inactive-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full">
                          <Users size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-[#22201d]">{l.inactiveSection}</span>
                          <span className="ws-caption mt-0.5 block">{sortBy === 'default' ? l.inactiveNewestFirst : l[sortBy]}</span>
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2 sm:gap-4">
                        <span className="text-right text-[13px] text-[#68655f]">{l.inactiveSalaryDue}: <span className="whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(inactiveSalaryDue)}</span></span>
                        <span className="ws-count ws-tone-caution-strong flex-shrink-0">{inactiveEmployees.length}</span>
                        {inactiveExpanded ? <ChevronUp size={18} className="text-[#68655f]" /> : <ChevronDown size={18} className="text-[#68655f]" />}
                      </span>
                    </button>
                  )
                }
                const employee = entry.employee
                const inactive = employee.is_active === false
                const todayAbsence = getSalaryAbsenceForDate(employee, today)
                const absentToday = !inactive && Boolean(todayAbsence)
                const activeUntil = getSalaryActiveUntil(employee, today)
                const salaryBalance = getSalaryBalance(employee, today)
                const toggleKey = `employee-toggle-${employee.id}`
                const confirmToggle = confirmActionKey === toggleKey
                const undoAbsenceKey = `absence-undo-${employee.id}`
                const confirmUndoAbsence = confirmActionKey === undoAbsenceKey
                const editingEmployeeName = editingNameId === employee.id
                const nameSavingKey = `employee-name-${employee.id}`
                const joinedDate = String(employee.joined_at || '').slice(0, 10)
                const deactivateDate = normalizeSalaryEndDate(employee, deactivateDates[employee.id], today)
                const effectiveKpiRule = getEffectiveKpiRule(kpiRules, employee.id, today)
                return (
                  <section key={employee.id} className={`ws-panel group flex flex-col ${
                    inactive
                      ? 'ws-inactive-card'
                      : absentToday
                        ? '!border-[#c4262c]/40 ring-2 ring-[#c4262c]/10'
                        : ''
                  }`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-semibold ${
                          inactive
                            ? 'ws-inactive-avatar'
                            : absentToday
                              ? 'bg-[#c4262c]/10 text-[#c4262c]'
                              : 'bg-[#ff5a00]/10 text-[#c24400]'
                        }`}>
                          {absentToday ? <CalendarX2 size={17} /> : (employeeName(employee).trim().charAt(0).toUpperCase() || <UserRound size={17} />)}
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingEmployeeName ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <input
                                type="text"
                                value={editingName}
                                onChange={event => setEditingName(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') saveEmployeeName(employee)
                                  if (event.key === 'Escape') cancelNameEdit()
                                }}
                                maxLength={120}
                                autoFocus
                                aria-label={l.employeeName}
                                className="ws-input !h-9 flex-1 !px-2.5 !py-0 font-semibold"
                              />
                              <button
                                type="button"
                                onClick={() => saveEmployeeName(employee)}
                                disabled={saving === nameSavingKey}
                                title={l.saveName}
                                aria-label={l.saveName}
                                className="ws-btn ws-btn-primary ws-btn-sm ws-btn-icon"
                              >
                                {saving === nameSavingKey ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={cancelNameEdit}
                                disabled={saving === nameSavingKey}
                                title={l.cancel}
                                aria-label={l.cancel}
                                className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex min-w-0 items-center gap-1">
                              <h2 className={`truncate text-[15px] font-semibold text-[#22201d]`}>{employeeName(employee)}</h2>
                              {canEditName && (
                                <button
                                  type="button"
                                  onClick={() => startNameEdit(employee)}
                                  title={l.editName}
                                  aria-label={`${l.editName}: ${employeeName(employee)}`}
                                  className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon text-[#9b978f] transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                            </div>
                          )}
                          {editingEmployeeName ? (
                            <label className="ws-caption mt-2 block font-medium">
                              {l.jobFunction}
                              <select
                                value={editingJobFunction}
                                onChange={event => setEditingJobFunction(event.target.value)}
                                disabled={saving === nameSavingKey}
                                className="ws-input mt-1 !h-9 !py-0"
                              >
                                <option value="">{l.noJobFunction}</option>
                                {EMPLOYEE_JOB_FUNCTIONS.map(job => (
                                  <option key={job.value} value={job.value}>{employeeJobFunctionLabel(job.value, lang)}</option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <p className="ws-caption">{employeeJobFunctionLabel(employee.job_function, lang) || l.noJobFunction}</p>
                          )}
                        </div>
                      </div>
                      {/* Active is the normal state; only call out exceptions. */}
                      {(inactive || absentToday) && (
                        <span className={`ws-status ${inactive ? 'ws-tone-caution-strong' : 'ws-tone-negative'}`}>
                          {inactive ? l.inactive : absentToday ? l.absentToday : l.active}
                        </span>
                      )}
                    </div>

                    <div className={`mt-4 grid grid-cols-2 gap-3 rounded-xl px-3.5 py-3 ${inactive ? 'ws-inactive-stats' : 'bg-[#f8f6f3]'}`}>
                      <Stat
                        label={l.balance}
                        value={formatCurrency(salaryBalance)}
                        hot={salaryBalance > 0}
                        negative={salaryBalance < 0}
                        large
                      />
                      <Stat label={l.daily} value={formatCurrency(getDailySalaryAmount(employee, activeUntil))} />
                    </div>

                    <div className="mt-1 divide-y divide-[#e4e1de]/60">
                      <Row label={l.joined} value={formatLongDate(employee.joined_at, lang, employee.joined_at)} />
                      {inactive && employee.ended_at && <Row label={l.ended} value={formatLongDate(employee.ended_at, lang, employee.ended_at)} />}
                      <EmployeeKpiRow
                        label={l.kpi}
                        rule={effectiveKpiRule}
                        lang={lang}
                        available={kpiRulesAvailable}
                        enabledLabel={l.kpiEnabled}
                        disabledLabel={l.kpiDisabled}
                        notConfiguredLabel={l.kpiNotConfigured}
                        unavailableLabel={l.kpiUnavailable}
                      />
                    </div>

                    {!inactive && confirmToggle && (
                      <label className="ws-notice ws-tone-negative mt-3 block !px-3 !py-2">
                        <span className="mb-1 block text-[13px] font-medium">{l.endDate}</span>
                        <DateInput
                          value={deactivateDate}
                          min={joinedDate || undefined}
                          max={today}
                          lang={lang}
                          onChange={value => setDeactivateDates(current => ({
                            ...current,
                            [employee.id]: normalizeSalaryEndDate(employee, value, today),
                          }))}
                        />
                      </label>
                    )}

                    {confirmUndoAbsence && (
                      <p role="alert" className="ws-notice ws-tone-caution mt-3 !px-3 !py-2 text-[13px] leading-relaxed">
                        {l.undoAbsenceWarning}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#e4e1de]/60 pt-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/accounting/employees/${employee.id}/history`)}
                        className="ws-btn ws-btn-outline ws-btn-sm"
                      >
                        <History size={14} />{l.historyBtn}
                      </button>
                      {canManage && (
                        <>
                          {absentToday && (
                            <button
                              type="button"
                              onClick={() => undoEmployeeAbsence(employee)}
                              disabled={saving === undoAbsenceKey}
                              className={`ws-btn ws-btn-sm ${
                                confirmUndoAbsence
                                  ? 'ws-btn-danger-solid'
                                  : 'ws-btn-outline'
                              }`}
                            >
                              {saving === undoAbsenceKey
                                ? <Loader2 size={14} className="animate-spin" />
                                : <CalendarCheck2 size={14} />}
                              {confirmUndoAbsence ? l.confirm : l.undoAbsence}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleEmployeeActive(employee)}
                            disabled={saving === `employee-toggle-${employee.id}`}
                            className={`ws-btn ws-btn-sm ml-auto ${
                              inactive
                                ? confirmToggle ? 'ws-btn-primary' : 'ws-btn-outline'
                                : confirmToggle ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'
                            }`}
                          >
                            {saving === toggleKey ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                            {confirmToggle ? l.confirm : inactive ? l.reactivate : l.deactivate}
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function Kpi({ icon: Icon, label, value, hot = false, danger = false }) {
  const valueTone = danger ? 'text-[#c4262c]' : hot ? 'text-[#9a5a00]' : 'text-[#22201d]'
  return (
    <div className="ws-panel min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ws-caption">{label}</p>
          <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueTone}`}>{value}</p>
        </div>
        <div className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f] sm:flex">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, hot = false, negative = false }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-[#68655f]">{label}</span>
      <span className={`min-w-0 break-words text-right text-[13px] font-semibold tabular-nums ${negative ? 'text-[#c4262c]' : hot ? 'text-[#9a5a00]' : 'text-[#22201d]'}`}>{value}</span>
    </div>
  )
}

function Stat({ label, value, hot = false, negative = false, large = false }) {
  const tone = negative ? 'text-[#c4262c]' : hot ? 'text-[#9a5a00]' : 'text-[#22201d]'
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#68655f]">{label}</p>
      <p className={`mt-0.5 break-words font-semibold leading-tight tabular-nums tracking-[-.01em] ${large ? 'text-[19px]' : 'text-[15px] pt-[3px]'} ${tone}`}>{value}</p>
    </div>
  )
}

function EmployeeKpiRow({
  label,
  rule,
  lang,
  available,
  enabledLabel,
  disabledLabel,
  notConfiguredLabel,
  unavailableLabel,
}) {
  const configured = Boolean(rule)
  const enabled = configured && rule.is_enabled !== false
  const statusLabel = !available
    ? unavailableLabel
    : !configured
      ? notConfiguredLabel
      : enabled
        ? enabledLabel
        : disabledLabel

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#68655f]">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          {configured && available && (
            <span className={`text-[13px] font-semibold tabular-nums ${enabled ? 'text-[#22201d]' : 'text-[#68655f]'}`}>
              {formatKpiRatePercent(rule.rate_bps, lang)}
            </span>
          )}
          <span className={`ws-badge ${enabled ? 'ws-tone-positive' : ''}`}>
            {statusLabel}
          </span>
        </span>
      </div>
      {configured && available && (
        <p className="mt-1 text-right text-[12px] leading-snug text-[#68655f]">
          {formatKpiSalesBasis(rule.sales_basis, lang)} · {formatKpiStartTime(rule.start_time, lang)}
        </p>
      )}
    </div>
  )
}

function DateInput(props) {
  return <CalendarPicker {...props} />
}

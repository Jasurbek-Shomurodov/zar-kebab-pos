import {
  convertSalaryAmountToDaily,
  getCurrentSalaryRate,
  normalizeExpenseAmount,
  normalizeSalaryRateUnit,
} from './expenses.js'
import {
  formatKpiRateInput,
  getEffectiveKpiRule,
  getKpiAccountConflicts,
  getKpiRuleEditDate,
  normalizeKpiStartTime,
  parseKpiPercentToBps,
} from './dailyKpi.js'

export function buildSalaryRatePayload({ salaryProfileId, effectiveFrom, amount, salaryUnit, note = '', createdBy = null }) {
  return {
    salary_profile_id: salaryProfileId,
    effective_from: effectiveFrom,
    amount,
    rate_unit: salaryUnit,
    daily_amount: convertSalaryAmountToDaily(amount, salaryUnit),
    note,
    created_by: createdBy,
  }
}

// The rate as entered (monthly stays monthly); legacy rows only carry daily_amount.
function salaryRateInputAmount(rate) {
  const amount = normalizeExpenseAmount(rate?.amount)
  if (amount > 0) return amount
  const daily = normalizeExpenseAmount(rate?.daily_amount)
  return normalizeSalaryRateUnit(rate?.rate_unit) === 'monthly' ? daily * 30 : daily
}

export function buildEmployeeSalaryForm(employee, today) {
  const rate = getCurrentSalaryRate(employee, today)
  const amount = salaryRateInputAmount(rate)
  return {
    effective_from: today,
    salary_amount: amount > 0 ? String(amount) : '',
    salary_unit: normalizeSalaryRateUnit(rate?.rate_unit),
  }
}

// A new rate row is written only when the amount or unit actually differs and an
// identical row for that date is not already stored (a retry after an unknown outcome).
export function isEmployeeSalaryChanged(employee, form, today) {
  const amount = normalizeExpenseAmount(form?.salary_amount)
  const unit = normalizeSalaryRateUnit(form?.salary_unit)
  const current = buildEmployeeSalaryForm(employee, today)
  if (amount === normalizeExpenseAmount(current.salary_amount) && unit === current.salary_unit) return false
  return !(employee?.rates || []).some(rate => (
    String(rate.effective_from || '').slice(0, 10) === form?.effective_from
    && salaryRateInputAmount(rate) === amount
    && normalizeSalaryRateUnit(rate.rate_unit) === unit
  ))
}

export function buildEmployeeKpiForm(rules, employee, today) {
  const rule = getEffectiveKpiRule(rules, employee?.id, today)
  return {
    effective_from: getKpiRuleEditDate(null, today),
    rate_percentage: rule ? formatKpiRateInput(rule.rate_bps) : '1',
    sales_basis: rule?.sales_basis || 'employee_opened_orders',
    order_opener_profile_id: rule?.order_opener_profile_id || employee?.profile_id || '',
    start_time: normalizeKpiStartTime(rule?.start_time),
    is_enabled: rule ? rule.is_enabled !== false : false,
  }
}

function kpiOpenerId(form) {
  return form.sales_basis === 'employee_opened_orders' ? form.order_opener_profile_id || null : null
}

export function isEmployeeKpiChanged(rules, employee, form, today) {
  const rule = getEffectiveKpiRule(rules, employee?.id, today)
  // Without a rule, leaving KPI off means there is nothing to save.
  if (!rule) return Boolean(form?.is_enabled)
  return Number(rule.rate_bps) !== parseKpiPercentToBps(form.rate_percentage)
    || rule.sales_basis !== form.sales_basis
    || (rule.order_opener_profile_id || null) !== kpiOpenerId(form)
    || normalizeKpiStartTime(rule.start_time) !== normalizeKpiStartTime(form.start_time)
    || (rule.is_enabled !== false) !== Boolean(form.is_enabled)
    || form.effective_from !== getKpiRuleEditDate(null, today)
}

// Returns null when the rule may be saved, otherwise { code, conflicts? }.
export function getEmployeeKpiFormError({ form, salaryProfileId, today, kpiAccounts = [], kpiAccountLinks }) {
  if (!salaryProfileId || !form?.effective_from || form.effective_from < today) return { code: 'date' }
  if (parseKpiPercentToBps(form.rate_percentage) <= 0) return { code: 'rate' }
  if (!normalizeKpiStartTime(form.start_time)) return { code: 'start_required' }
  if (form.is_enabled && form.sales_basis === 'employee_opened_orders') {
    if (!kpiAccounts.some(account => account.id === form.order_opener_profile_id)) return { code: 'account_required' }
    const conflicts = getKpiAccountConflicts(kpiAccountLinks, form.order_opener_profile_id, salaryProfileId)
    if (conflicts.length) return { code: 'account_taken', conflicts }
  }
  return null
}

export function buildEmployeeKpiRulePayload({ form, salaryProfileId, createdBy = null, createdByName = '' }) {
  return {
    salary_profile_id: salaryProfileId,
    effective_from: form.effective_from,
    rate_bps: parseKpiPercentToBps(form.rate_percentage),
    sales_basis: form.sales_basis,
    order_opener_profile_id: kpiOpenerId(form),
    start_time: normalizeKpiStartTime(form.start_time),
    is_enabled: Boolean(form.is_enabled),
    created_by: createdBy,
    created_by_name: createdByName,
  }
}

// Salary-group delivery is queued only when the stored rule for that date really changes.
export function isKpiRulePayloadChanged(rules = [], payload) {
  const existing = rules.find(rule => (
    rule.salary_profile_id === payload.salary_profile_id
    && String(rule.effective_from || '').slice(0, 10) === payload.effective_from
  ))
  return !existing
    || normalizeKpiStartTime(existing.start_time) !== payload.start_time
    || existing.sales_basis !== payload.sales_basis
    || (existing.order_opener_profile_id || null) !== payload.order_opener_profile_id
    || Number(existing.rate_bps) !== payload.rate_bps
    || Boolean(existing.is_enabled) !== payload.is_enabled
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// PostgreSQL returns HH:MM:SS; the setting is deliberately minute precision.
export function normalizeKpiStartTime(value = '00:00') {
  const time = String(value ?? '00:00')
  return /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time) ? time.slice(0, 5) : ''
}

// From this KPI date the window starts at the attendance QR check-in (254);
// a rule's start_time only describes earlier dates.
export const KPI_CHECKIN_START_DATE = '2026-10-16'

export function kpiRuleStartTimeApplies(effectiveFrom) {
  const date = effectiveFrom instanceof Date ? effectiveFrom.toISOString() : String(effectiveFrom || '')
  return date.slice(0, 10) < KPI_CHECKIN_START_DATE
}

export function formatKpiStartTime(value, lang = 'en') {
  const time = normalizeKpiStartTime(value)
  if (!time) return ''
  const labels = { en: `From ${time} (Tashkent)`, ru: `С ${time} (Ташкент)`, uz: `${time} dan (Toshkent)` }
  return labels[lang] || labels.en
}

function normalizeWholeAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0
}

export function parseKpiPercentToBps(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return 0
  const percentage = Number(normalized)
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return 0
  return Math.round(percentage * 100)
}

export function formatKpiRatePercent(rateBps, lang = 'en') {
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate)) return '0%'
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US'
  const percent = normalizedRate / 100
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(percent)}%`
}

export function formatKpiRateInput(rateBps) {
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return ''
  return (normalizedRate / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function calculateDailyKpiBonus(baseAmountUzs, rateBps) {
  const baseAmount = normalizeWholeAmount(baseAmountUzs)
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return 0
  return Math.round((baseAmount * normalizedRate) / 10000)
}

export function getDefaultKpiHistoryRange(today) {
  const normalizedToday = String(today || '').slice(0, 10)
  if (!ISO_DATE_PATTERN.test(normalizedToday)) return { dateFrom: '', dateTo: '' }
  return {
    dateFrom: `${normalizedToday.slice(0, 8)}01`,
    dateTo: normalizedToday,
  }
}

export function getKpiRuleEditDate(effectiveFrom, today) {
  const normalizedToday = String(today || '').slice(0, 10)
  const normalizedEffectiveFrom = String(effectiveFrom || '').slice(0, 10)
  if (!ISO_DATE_PATTERN.test(normalizedToday)) return ''
  return ISO_DATE_PATTERN.test(normalizedEffectiveFrom) && normalizedEffectiveFrom > normalizedToday
    ? normalizedEffectiveFrom
    : normalizedToday
}

// POS account id -> salary profiles whose current own-orders KPI rule counts that account's orders.
export function getKpiAccountLinks(rules = [], salaryProfiles = [], date) {
  const links = new Map()
  for (const salaryProfile of salaryProfiles) {
    const rule = getEffectiveKpiRule(rules, salaryProfile?.id, date)
    const accountId = rule?.sales_basis === 'employee_opened_orders' ? rule.order_opener_profile_id : null
    if (!accountId) continue
    links.set(accountId, [...(links.get(accountId) || []), salaryProfile])
  }
  return links
}

// Other salary profiles whose own-orders KPI already counts this POS account.
// One account must credit one employee, otherwise both earn the same orders.
export function getKpiAccountConflicts(links, accountId, salaryProfileId) {
  const linked = links instanceof Map ? links.get(accountId) || [] : []
  return linked.filter(item => item?.id !== salaryProfileId)
}

export function getEffectiveKpiRule(rules = [], salaryProfileId, date) {
  const normalizedDate = String(date || '').slice(0, 10)
  if (!salaryProfileId || !ISO_DATE_PATTERN.test(normalizedDate)) return null
  return [...rules]
    .filter(rule => (
      rule?.salary_profile_id === salaryProfileId &&
      ISO_DATE_PATTERN.test(String(rule.effective_from || '').slice(0, 10)) &&
      String(rule.effective_from).slice(0, 10) <= normalizedDate
    ))
    .sort((a, b) => (
      String(b.effective_from).localeCompare(String(a.effective_from)) ||
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    ))[0] || null
}

export async function removeKpiRulePreservingHistory({
  client,
  rule,
  effectiveFrom,
  createdBy = null,
  createdByName = '',
}) {
  const normalizedEffectiveFrom = String(effectiveFrom || '').slice(0, 10)
  const normalizedRuleStart = String(rule?.effective_from || '').slice(0, 10)
  if (
    !ISO_DATE_PATTERN.test(normalizedEffectiveFrom)
    || !ISO_DATE_PATTERN.test(normalizedRuleStart)
    || normalizedEffectiveFrom < normalizedRuleStart
  ) {
    const error = new Error('KPI removal date must be on or after the rule effective date')
    error.code = 'KPI_RULE_REMOVAL_DATE_INVALID'
    return { action: 'failed', rule: null, error }
  }

  if (normalizedEffectiveFrom > normalizedRuleStart) {
    // Keep the original rule effective through the day before the selected
    // boundary. A disabled successor changes only the selected date onward.
    const { data: disabledRule, error: disableError } = await client
      .from('employee_kpi_rules')
      .upsert({
        salary_profile_id: rule.salary_profile_id,
        effective_from: normalizedEffectiveFrom,
        rate_bps: rule.rate_bps,
        ...(rule.start_time != null ? { start_time: rule.start_time } : {}),
        ...(rule.sales_basis ? { sales_basis: rule.sales_basis, order_opener_profile_id: rule.order_opener_profile_id || null } : {}),
        is_enabled: false,
        created_by: createdBy,
        created_by_name: createdByName,
      }, { onConflict: 'salary_profile_id,effective_from' })
      .select('id, last_change_event_id')
      .single()

    return disableError
      ? { action: 'failed', rule: null, error: disableError }
      : { action: 'disabled', rule: disabledRule, error: null }
  }

  const { data: deletedRules, error: deleteError } = await client
    .from('employee_kpi_rules')
    .delete()
    .eq('id', rule.id)
    .select('id')

  if (!deleteError) {
    return Array.isArray(deletedRules) && deletedRules.length === 1
      ? { action: 'deleted', rule: deletedRules[0], error: null }
      : { action: 'not_deleted', rule: null, error: null }
  }

  return { action: 'failed', rule: null, error: deleteError }
}

export function normalizeKpiResult(result = {}) {
  return {
    ...result,
    baseAmountUzs: normalizeWholeAmount(result.sales_base_amount),
    bonusAmountUzs: normalizeWholeAmount(result.bonus_amount),
    rateBps: Number.isFinite(Number(result.rate_bps)) ? Number(result.rate_bps) : 0,
  }
}

export function indexKpiResultsByBonusId(results = []) {
  return new Map(results
    .filter(result => result?.bonus_id)
    .map(result => [result.bonus_id, normalizeKpiResult(result)]))
}

export function formatKpiSalesBasis(basis, lang = 'en') {
  const labels = {
    en: ['Own opened orders', 'All paid dine-in orders'],
    ru: ['Свои открытые заказы', 'Все оплаченные заказы в зале'],
    uz: ['O‘zi ochgan buyurtmalar', 'Zaldagi barcha to‘langan buyurtmalar'],
  }
  return (labels[lang] || labels.en)[basis === 'restaurant' ? 1 : 0]
}

export function getActiveKpiAccounts(accounts = []) {
  return accounts.filter(account => account?.id && account.status === 'active')
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')))
}

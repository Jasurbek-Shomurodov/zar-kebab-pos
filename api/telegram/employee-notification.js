import { retractDeletedOrderStatusMessages } from './_lib/orderStatusDelivery.js'
import { json, methodNotAllowed, readJson, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { buildEmployeeFineMessage } from './_lib/fineMessages.js'
import {
  buildEmployeePaymentMessage,
  buildEmployeeSalaryRateMessage,
  buildEmployeeSalaryEventMessage,
  buildKpiRuleGroupMessage,
  buildSalaryGroupEventMessage,
  buildSalaryPaymentGroupMessage,
  buildSalaryRateGroupMessage,
  buildSalaryTeamEventMessage,
  getEmployeePaymentConfirmationCopy,
} from './_lib/paymentMessages.js'
import { getDailySalaryNotificationSummary, getTashkentDate } from './_lib/salaryMessages.js'
import { loadOrderSalaryBalances } from './_lib/orderSalaryBalances.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { editTelegramMessage, deleteTelegramMessage, sendTelegramMessage, sendTelegramPhoto } from './_lib/telegram.js'
import { deliverTeamDailyKpi, retractTeamDailyKpiItem } from './_lib/teamDailyKpiDelivery.js'
import {
  buildAbsenceUndoInvestorMessage,
  buildEmployeeLifecycleInvestorMessage,
  buildEmployeeProfileChangeInvestorMessage,
  buildInvestorExpenseGroupMessage,
  buildInvestorIncomeGroupMessage,
  buildInvestorOrderChangeMessage,
} from './_lib/investorIncomeMessages.js'
import {
  buildMenuArchivedTeamMessage,
  buildMenuAvailableTeamMessage,
  buildMenuCreatedTeamMessage,
  buildMenuUnavailableTeamMessage,
  buildMenuVariantVisibilityTeamMessage,
} from './_lib/menuAvailabilityMessages.js'
import {
  getSalaryEventRetryTargets,
  getSalaryPaymentRetryTargets,
} from './_lib/deliveryRetry.js'

const EDITOR_ROLES = new Set(['owner', 'admin'])
const FEATURE_ACCESS_MANAGER_EMAILS = new Set(['dangerhoggish@gmail.com'])
const PENDING_DELIVERY_RETRY_MS = 2 * 60 * 1000
const TEAM_EVENT_TYPES = new Set(['bonus', 'fine', 'absence'])
const COMBINED_DAILY_KPI_EMPLOYEE_REASON = 'Automatic KPI is included in the combined daily salary summary'
const DAILY_KPI_GROUP_REASON = 'Automatic KPI details are sent only to ZarKebab Team'
const INACTIVE_EMPLOYEE_REASON = 'Employee is deactivated; private Telegram notifications are disabled'
const GROUP_EVENT_CONFIG = {
  bonus: {
    table: 'employee_salary_bonuses',
    select: 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by, created_by_name, source_type, source_metadata, salary_profile:employee_salary_profiles(employee_name)',
    legacySelect: 'id, salary_profile_id, bonus_date, amount, payment_method, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  fine: {
    table: 'employee_salary_fines',
    select: 'id, salary_profile_id, fine_date, amount, reason, created_by, created_by_name, source_type, salary_profile:employee_salary_profiles(employee_name)',
    legacySelect: 'id, salary_profile_id, fine_date, amount, reason, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  absence: {
    table: 'employee_salary_absences',
    select: 'id, salary_profile_id, absence_date, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)',
  },
  rate: {
    table: 'employee_salary_rates',
    select: 'id, salary_profile_id, effective_from, amount, rate_unit, note, created_by, created_at, salary_profile:employee_salary_profiles(employee_name)',
  },
  kpi_rule: {
    table: 'employee_kpi_rule_change_events',
    select: 'id, rule_id, salary_profile_id, employee_name_snapshot, change_kind, effective_from, previous_rate_bps, previous_is_enabled, new_rate_bps, new_is_enabled, previous_sales_basis, new_sales_basis, previous_start_time, new_start_time, previous_order_opener_name, new_order_opener_name, created_by, created_by_name, created_at, salary_profile:employee_salary_profiles(employee_name)',
  },
}

const RETRACTABLE_SALARY_EVENT_TABLES = {
  rate: 'employee_salary_rates',
  payment: 'employee_salary_payments',
  bonus: 'employee_salary_bonuses',
  fine: 'employee_salary_fines',
  absence: 'employee_salary_absences',
}

function isMissingKpiBonusSourceColumns(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (message.includes('source_type') || message.includes('source_metadata')) && (
    message.includes('schema cache') ||
    message.includes('column') ||
    message.includes('42703') ||
    message.includes('pgrst204')
  )
}

function isMissingKpiRulesTable(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('employee_kpi_rules') && (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('42p01')
    || message.includes('pgrst205')
  )
}

function isMissingMenuAvailabilityEventColumn(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('availability_event') && (
    message.includes('schema cache')
    || message.includes('column')
    || message.includes('42703')
    || message.includes('pgrst204')
  )
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return ['waiter', 'cashier', 'kitchen'].includes(value) ? 'admin' : value
}

async function requireExpensesWriteAccess(req) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, full_name, email, feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = normalizeRole(profile?.role)
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = role === 'owner' && access === null
  const hasExplicitExpensesWrite = EDITOR_ROLES.has(role) && access?.includes('expenses')
  if (profile?.status !== 'active' || (!isPrimaryOwner && !hasImplicitOwnerAccess && !hasExplicitExpensesWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return {
    supabase,
    user,
    role,
    actorName: profile?.full_name || profile?.email || user.email || '',
  }
}

async function requireExpenseNotificationAccess(req) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, full_name, email, feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = normalizeRole(profile?.role)
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = role === 'owner' && access === null
  const hasExpenseOrBazaarWrite = EDITOR_ROLES.has(role)
    && (access?.includes('expenses') || access?.includes('bazaar'))
  if (profile?.status !== 'active' || (!isPrimaryOwner && !hasImplicitOwnerAccess && !hasExpenseOrBazaarWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return { supabase, user }
}

async function requireOrderChangeNotificationAccess(req) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })
  const { data: profile, error } = await supabase.from('profiles')
    .select('role, status, feature_access').eq('id', user.id).maybeSingle()
  if (error) throw error
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  if (profile?.status !== 'active' || !(profile?.role === 'owner' || access?.includes('delete_paid_orders'))) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  return { supabase, user }
}

async function requireMenuWriteAccess(req) {
  const token = getBearerToken(req)
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, full_name, email, feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  const role = String(profile?.role || '').toLowerCase()
  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = role === 'owner' && access === null
  const hasExplicitMenuWrite = EDITOR_ROLES.has(role) && access?.includes('menu')
  if (profile?.status !== 'active' || (!isPrimaryOwner && !hasImplicitOwnerAccess && !hasExplicitMenuWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return { supabase, user }
}

async function loadSalaryGroupTarget(supabase) {
  const fallback = {
    chatId: String(process.env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim(),
    language: String(process.env.TELEGRAM_SALARY_PAYMENTS_LANGUAGE || 'ru').trim(),
  }
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, language, is_enabled')
    .eq('target_key', 'salary_events')
    .maybeSingle()
  if (error) {
    const missingMigration = ['42P01', 'PGRST205'].includes(error.code)
      || (
        /telegram_notification_targets/i.test(error.message || '')
        && /does not exist|schema cache/i.test(error.message || '')
      )
    if (!missingMigration) throw error
    return fallback
  }
  if (!data?.is_enabled) return { chatId: '', language: data?.language || fallback.language }
  return {
    chatId: String(data.chat_id || fallback.chatId).trim(),
    language: String(data.language || fallback.language || 'ru').trim(),
  }
}

async function loadSalaryTeamTarget(supabase) {
  const fallback = {
    chatId: String(process.env.TELEGRAM_TEAM_CHAT_ID || '').trim(),
    language: String(process.env.TELEGRAM_TEAM_LANGUAGE || 'ru').trim(),
  }
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, language, is_enabled')
    .eq('target_key', 'team_events')
    .maybeSingle()
  if (error) {
    const missingMigration = ['42P01', 'PGRST205'].includes(error.code)
      || (
        /telegram_notification_targets/i.test(error.message || '')
        && /does not exist|schema cache/i.test(error.message || '')
      )
    if (!missingMigration) throw error
    return fallback
  }
  if (!data) return fallback
  if (!data.is_enabled) return { chatId: '', language: data.language || fallback.language }
  return {
    chatId: String(data.chat_id || fallback.chatId).trim(),
    language: String(data.language || fallback.language || 'ru').trim(),
  }
}

async function loadOwnedSalaryEvent(supabase, user, type, eventId, actorName = '') {
  const config = GROUP_EVENT_CONFIG[type]
  if (!config) throw Object.assign(new Error('Unsupported salary event type'), { status: 400 })
  let { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('id', eventId)
    .maybeSingle()
  if (error && config.legacySelect && isMissingKpiBonusSourceColumns(error)) {
    ;({ data, error } = await supabase
      .from(config.table)
      .select(config.legacySelect)
      .eq('id', eventId)
      .maybeSingle())
  }
  if (error) throw error
  const isAutomaticKpiBonus = type === 'bonus'
    && data?.created_by == null
    && data?.source_type === 'daily_kpi'
  const isLateCheckinFine = type === 'fine'
    && data?.created_by == null
    && data?.source_type === 'late_checkin'
  if (!data || (data.created_by !== user.id && !isAutomaticKpiBonus && !isLateCheckinFine)) {
    throw Object.assign(new Error('Salary event not found'), { status: 404 })
  }
  let previousRate = null
  let kpiRule = null
  if (type === 'rate') {
    const [previousRateResult, kpiRuleResult] = await Promise.all([
      supabase
        .from('employee_salary_rates')
        .select('id, amount, rate_unit, effective_from, created_at')
        .eq('salary_profile_id', data.salary_profile_id)
        .neq('id', data.id)
        .lte('effective_from', data.effective_from)
        .lte('created_at', data.created_at)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('employee_kpi_rules')
        .select('id, effective_from, rate_bps, is_enabled, start_time, created_at')
        .eq('salary_profile_id', data.salary_profile_id)
        .lte('effective_from', data.effective_from)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (previousRateResult.error) throw previousRateResult.error
    if (kpiRuleResult.error && !isMissingKpiRulesTable(kpiRuleResult.error)) {
      throw kpiRuleResult.error
    }
    previousRate = previousRateResult.data || null
    kpiRule = kpiRuleResult.error ? null : kpiRuleResult.data || null
  }
  return {
    ...data,
    employee_name: data.employee_name_snapshot || data.salary_profile?.employee_name || '',
    created_by_name: data.created_by_name || actorName,
    previous_rate: previousRate,
    kpi_rule: kpiRule,
  }
}

function getTelegramMessageId(response) {
  const messageId = String(response?.result?.message_id || '').trim()
  if (!messageId) throw new Error('Telegram did not return a message id')
  return messageId
}

function savedGroupDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.status || 'pending',
    duplicate,
    telegramMessageId: delivery?.telegram_message_id || null,
    sentAt: delivery?.sent_at || null,
    errorMessage: delivery?.error_message || '',
  }
}

function savedEmployeeEventDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.employee_status || 'pending',
    duplicate,
    telegramMessageId: delivery?.employee_telegram_message_id || null,
    sentAt: delivery?.employee_sent_at || null,
    errorMessage: delivery?.employee_error_message || '',
  }
}

function savedTeamDeliveryResult(delivery, duplicate = true) {
  return {
    status: delivery?.team_status || 'pending',
    duplicate,
    telegramMessageId: delivery?.team_telegram_message_id || null,
    sentAt: delivery?.team_sent_at || null,
    errorMessage: delivery?.team_error_message || '',
  }
}

function savedMenuUnavailableDeliveryResult(delivery, duplicate = true) {
  return {
    ok: delivery?.status === 'sent',
    status: delivery?.status || 'pending',
    duplicate,
    deliveryId: delivery?.id || null,
    telegramMessageId: delivery?.telegram_message_id || null,
    sentAt: delivery?.sent_at || null,
    errorMessage: delivery?.error_message || '',
  }
}

function savedInvestorExpenseDeliveryResult(delivery, duplicate = true) {
  return {
    ok: delivery?.status === 'sent',
    status: delivery?.status || 'pending',
    duplicate,
    deliveryId: delivery?.expense_id || null,
    target: delivery?.target_key || 'salary_events',
    telegramMessageId: delivery?.telegram_message_id || null,
    sentAt: delivery?.sent_at || null,
    errorMessage: delivery?.error_message || '',
  }
}

function savedEmployeeLifecycleDeliveryResult(delivery, duplicate = true) {
  return {
    ok: delivery?.status === 'sent',
    status: delivery?.status || 'pending',
    duplicate,
    deliveryId: delivery?.id || null,
    target: delivery?.target_key || 'salary_events',
    telegramMessageId: delivery?.telegram_message_id || null,
    sentAt: delivery?.sent_at || null,
    errorMessage: delivery?.error_message || '',
  }
}

function canRetryMenuEventDelivery(delivery) {
  if (!delivery) return false
  if (['not_attempted', 'failed'].includes(delivery.status)) return true
  if (delivery.status !== 'pending') return false
  const attemptedAt = Date.parse(delivery.attempted_at || '')
  return !Number.isFinite(attemptedAt) || Date.now() - attemptedAt >= PENDING_DELIVERY_RETRY_MS
}

function canRetryInvestorExpenseDelivery(delivery) {
  if (!delivery) return false
  if (['not_attempted', 'failed'].includes(delivery.status)) return true
  if (delivery.status !== 'pending') return false
  const attemptedAt = Date.parse(delivery.attempted_at || '')
  return !Number.isFinite(attemptedAt) || Date.now() - attemptedAt >= PENDING_DELIVERY_RETRY_MS
}

async function notifyMenuEvent(supabase, user, menuItemId, availabilityEvent) {
  const normalizedMenuItemId = String(menuItemId || '').trim()
  if (!normalizedMenuItemId) {
    throw Object.assign(new Error('menuItemId is required'), { status: 400 })
  }
  if (!['unavailable', 'available', 'created', 'archived', 'variant_visibility'].includes(availabilityEvent)) {
    throw Object.assign(new Error('Unsupported menu event'), { status: 400 })
  }

  let existingResult = await supabase
    .from('menu_item_unavailable_notification_deliveries')
    .select('*')
    .eq('menu_item_id', normalizedMenuItemId)
    .eq('actor_id', user.id)
    .eq('availability_event', availabilityEvent)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (
    existingResult.error
    && availabilityEvent === 'unavailable'
    && isMissingMenuAvailabilityEventColumn(existingResult.error)
  ) {
    existingResult = await supabase
      .from('menu_item_unavailable_notification_deliveries')
      .select('*')
      .eq('menu_item_id', normalizedMenuItemId)
      .eq('actor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }
  const { data: existing, error: existingError } = existingResult
  if (existingError) throw existingError
  if (!existing && availabilityEvent === 'variant_visibility') {
    // Product saves without a variant visibility change queue nothing.
    return { ok: true, status: 'no_change', duplicate: false, deliveryId: null, telegramMessageId: null, errorMessage: '' }
  }
  if (!existing) {
    const eventLabel = {
      available: 'Available',
      unavailable: 'Unavailable',
      created: 'Created',
      archived: 'Archived',
    }[availabilityEvent]
    throw Object.assign(new Error(`${eventLabel} menu item event not found`), { status: 404 })
  }
  if (!canRetryMenuEventDelivery(existing)) {
    return savedMenuUnavailableDeliveryResult(existing)
  }

  const target = await loadSalaryTeamTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    status: target.chatId ? 'pending' : 'skipped',
    telegram_chat_id: target.chatId || null,
    telegram_message_id: null,
    error_message: target.chatId ? '' : 'ZarKebab Team Telegram group is not configured',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  const claimed = await supabase
    .from('menu_item_unavailable_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('*')
    .maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('menu_item_unavailable_notification_deliveries')
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedMenuUnavailableDeliveryResult(concurrent)
  }
  if (!target.chatId) {
    return savedMenuUnavailableDeliveryResult(claimed.data, false)
  }

  try {
    const messageBuilders = {
      available: buildMenuAvailableTeamMessage,
      unavailable: buildMenuUnavailableTeamMessage,
      created: buildMenuCreatedTeamMessage,
      archived: buildMenuArchivedTeamMessage,
      variant_visibility: buildMenuVariantVisibilityTeamMessage,
    }
    const text = messageBuilders[availabilityEvent](claimed.data)
    const response = await sendTelegramMessage(target.chatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { data: sentDelivery, error: updateError } = await supabase
      .from('menu_item_unavailable_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return savedMenuUnavailableDeliveryResult(sentDelivery, false)
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('menu_item_unavailable_notification_deliveries')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return {
      ...savedMenuUnavailableDeliveryResult(existing, false),
      ok: false,
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

async function notifyMenuUnavailable(supabase, user, menuItemId) {
  return notifyMenuEvent(supabase, user, menuItemId, 'unavailable')
}

async function notifyMenuAvailable(supabase, user, menuItemId) {
  return notifyMenuEvent(supabase, user, menuItemId, 'available')
}

async function notifyMenuCreated(supabase, user, menuItemId) {
  return notifyMenuEvent(supabase, user, menuItemId, 'created')
}

async function notifyMenuArchived(supabase, user, menuItemId) {
  return notifyMenuEvent(supabase, user, menuItemId, 'archived')
}

async function notifyMenuVariantVisibility(supabase, user, menuItemId) {
  return notifyMenuEvent(supabase, user, menuItemId, 'variant_visibility')
}

async function deliverSalaryGroupEvent(supabase, type, event, remainingDue) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).group) {
    return savedGroupDeliveryResult(existing)
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    event_type: type,
    event_id: event.id,
    salary_profile_id: event.salary_profile_id,
    status: target.chatId ? 'pending' : 'skipped',
    telegram_chat_id: target.chatId || null,
    telegram_message_id: null,
    error_message: target.chatId ? '' : 'Salary events Telegram group is not configured',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  let delivery
  if (!existing) {
    const created = await supabase
      .from('employee_salary_group_notification_deliveries')
      .insert(pendingFields)
      .select('id')
      .single()
    if (created.error?.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('employee_salary_group_notification_deliveries')
        .select('*')
        .eq('event_type', type)
        .eq('event_id', event.id)
        .single()
      if (concurrentError) throw concurrentError
      return savedGroupDeliveryResult(concurrent)
    }
    if (created.error) throw created.error
    delivery = created.data
  } else {
    const claimed = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update(pendingFields)
      .eq('id', existing.id)
      .eq('updated_at', existing.updated_at)
      .select('id')
      .maybeSingle()
    if (claimed.error) throw claimed.error
    if (!claimed.data) {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('employee_salary_group_notification_deliveries')
        .select('*')
        .eq('id', existing.id)
        .single()
      if (concurrentError) throw concurrentError
      return savedGroupDeliveryResult(concurrent)
    }
    delivery = claimed.data
  }

  if (!target.chatId) {
    return {
      status: 'skipped',
      telegramMessageId: null,
      sentAt: null,
      errorMessage: 'Salary events Telegram group is not configured',
    }
  }

  try {
    const eventLanguage = type === 'bonus' && event?.source_type === 'daily_kpi'
      ? 'ru'
      : target.language
    const text = type === 'rate'
      ? buildSalaryRateGroupMessage(event, remainingDue, target.language)
      : type === 'kpi_rule'
        ? buildKpiRuleGroupMessage(event, target.language)
        : buildSalaryGroupEventMessage(type, event, remainingDue, eventLanguage)
    const response = await sendTelegramMessage(target.chatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', delivery.id)
    if (updateError) throw updateError
    return { status: 'sent', telegramMessageId, sentAt, errorMessage: '' }
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return {
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

async function deliverSalaryTeamEvent(supabase, type, event) {
  if (!TEAM_EVENT_TYPES.has(type)) {
    return {
      status: 'skipped',
      telegramMessageId: null,
      sentAt: null,
      errorMessage: 'ZarKebab Team notifications apply only to bonuses, fines, and absences',
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .single()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).team) {
    return savedTeamDeliveryResult(existing)
  }

  const target = await loadSalaryTeamTarget(supabase)
  if (type === 'bonus' && event.source_type === 'daily_kpi') {
    const daily = await deliverTeamDailyKpi(supabase, event.bonus_date, target.chatId)
    if (daily.status === 'sent') {
      const updated = await supabase.from('employee_salary_group_notification_deliveries')
        .update({ team_status: 'sent', team_chat_id: target.chatId,
          team_telegram_message_id: null, team_sent_at: daily.sentAt,
          team_error_message: '', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updated.error) throw updated.error
    }
    return daily
  }
  const now = new Date().toISOString()
  const pendingFields = {
    team_status: target.chatId ? 'pending' : 'skipped',
    team_chat_id: target.chatId || null,
    team_telegram_message_id: null,
    team_error_message: target.chatId ? '' : 'ZarKebab Team Telegram group is not configured',
    team_attempted_at: now,
    team_sent_at: null,
    updated_at: now,
  }
  let claimQuery = supabase
    .from('employee_salary_group_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('team_status', existing.team_status)
  if (existing.team_attempted_at) {
    claimQuery = claimQuery.eq('team_attempted_at', existing.team_attempted_at)
  } else {
    claimQuery = claimQuery.is('team_attempted_at', null)
  }
  const claimed = await claimQuery.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedTeamDeliveryResult(concurrent)
  }
  if (!target.chatId) {
    return savedTeamDeliveryResult(claimed.data, false)
  }

  try {
    const eventLanguage = type === 'bonus' && event?.source_type === 'daily_kpi'
      ? 'ru'
      : target.language
    const text = buildSalaryTeamEventMessage(type, event, eventLanguage)
    const response = await sendTelegramMessage(target.chatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        team_status: 'sent',
        team_telegram_message_id: telegramMessageId,
        team_error_message: '',
        team_sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
    if (updateError) throw updateError
    return { status: 'sent', telegramMessageId, sentAt, errorMessage: '' }
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        team_status: 'failed',
        team_error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return {
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

async function deliverEmployeeSalaryEvent(supabase, type, event, remainingDue, salaryProfile) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('*')
    .eq('event_type', type)
    .eq('event_id', event.id)
    .single()
  if (existingError) throw existingError
  if (!getSalaryEventRetryTargets(existing, {
    pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
  }).employee) {
    return savedEmployeeEventDeliveryResult(existing)
  }

  const employeeIsActive = salaryProfile?.is_active !== false && !salaryProfile?.deleted_at
  const { data: employeeLink, error: linkError } = employeeIsActive
    ? await supabase
        .from('employee_salary_telegram_links')
        .select('chat_id, notifications_enabled, preferred_language')
        .eq('salary_profile_id', event.salary_profile_id)
        .maybeSingle()
    : { data: null, error: null }
  if (linkError) throw linkError

  const employeeChatId = employeeLink?.notifications_enabled === false
    ? ''
    : String(employeeLink?.chat_id || '').trim()
  const now = new Date().toISOString()
  const pendingFields = {
    employee_status: employeeChatId ? 'pending' : 'skipped',
    employee_chat_id: employeeChatId || null,
    employee_telegram_message_id: null,
    employee_error_message: employeeChatId
      ? ''
      : employeeIsActive
        ? 'Employee Telegram is not linked or notifications are disabled'
        : INACTIVE_EMPLOYEE_REASON,
    employee_attempted_at: now,
    employee_sent_at: null,
    updated_at: now,
  }
  let claimQuery = supabase
    .from('employee_salary_group_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('employee_status', existing.employee_status)
  if (existing.employee_attempted_at) {
    claimQuery = claimQuery.eq('employee_attempted_at', existing.employee_attempted_at)
  }
  const claimed = await claimQuery.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedEmployeeEventDeliveryResult(concurrent)
  }
  if (!employeeChatId) {
    return savedEmployeeEventDeliveryResult(claimed.data, false)
  }

  try {
    const text = type === 'fine'
      ? buildEmployeeFineMessage(event)
      : type === 'rate'
        ? buildEmployeeSalaryRateMessage(
            event,
            remainingDue,
            employeeLink.preferred_language
          )
        : buildEmployeeSalaryEventMessage(
            type,
            event,
            remainingDue,
            employeeLink.preferred_language
          )
    const response = await sendTelegramMessage(employeeChatId, text)
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { error: updateError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        employee_status: 'sent',
        employee_telegram_message_id: telegramMessageId,
        employee_error_message: '',
        employee_sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
    if (updateError) throw updateError
    return { status: 'sent', telegramMessageId, sentAt, errorMessage: '' }
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_salary_group_notification_deliveries')
      .update({
        employee_status: 'failed',
        employee_error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return {
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

function normalizeDeliverySettlement(settled) {
  return settled.status === 'fulfilled'
    ? settled.value
    : {
        status: 'failed',
        telegramMessageId: null,
        sentAt: null,
        errorMessage: String(settled.reason?.message || settled.reason).slice(0, 1000),
      }
}

async function requireQueuedSalaryGroupDelivery(supabase, type, eventId, missingMessage) {
  const { data, error } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('id')
    .eq('event_type', type)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw Object.assign(
      new Error(missingMessage),
      { status: 409 }
    )
  }
}

async function notifyKpiRuleChange(supabase, user, actorName, eventId) {
  const event = await loadOwnedSalaryEvent(
    supabase,
    user,
    'kpi_rule',
    eventId,
    actorName
  )
  await requireQueuedSalaryGroupDelivery(
    supabase,
    'kpi_rule',
    event.id,
    'KPI rule change notification was not queued'
  )
  const [groupSettled] = await Promise.allSettled([
    deliverSalaryGroupEvent(supabase, 'kpi_rule', event, 0),
  ])
  const group = normalizeDeliverySettlement(groupSettled)
  const skippedEmployee = {
    status: 'skipped',
    telegramMessageId: null,
    sentAt: null,
    errorMessage: 'KPI rule changes notify only the Salary group',
  }
  const skippedTeam = {
    status: 'skipped',
    telegramMessageId: null,
    sentAt: null,
    errorMessage: 'KPI rule changes do not notify ZarKebab Team',
  }
  return {
    ok: group.status === 'sent',
    allSent: group.status === 'sent',
    employee: skippedEmployee,
    group,
    team: skippedTeam,
  }
}

async function notifySalaryEvent(supabase, user, actorName, type, eventId) {
  if (type === 'kpi_rule') {
    return notifyKpiRuleChange(supabase, user, actorName, eventId)
  }
  const event = await loadOwnedSalaryEvent(supabase, user, type, eventId, actorName)
  const isAutomaticKpi = type === 'bonus' && event.source_type === 'daily_kpi'
  // The check-in reply already told the employee about a late fine (273).
  const isLateCheckinFine = type === 'fine' && event.source_type === 'late_checkin'
  return notifyLoadedSalaryEvent(supabase, type, event, {
    includeEmployee: !isAutomaticKpi && !isLateCheckinFine,
    includeGroup: !isAutomaticKpi,
  })
}

async function notifyLoadedSalaryEvent(supabase, type, event, {
  includeEmployee = true,
  includeGroup = true,
} = {}) {
  if (type === 'rate') {
    await requireQueuedSalaryGroupDelivery(
      supabase,
      'rate',
      event.id,
      'Initial salary setup is not a salary-change notification'
    )
  }
  const salaryProfiles = await loadSalaryProfiles(supabase, [event.salary_profile_id])
  const salaryProfile = salaryProfiles.get(event.salary_profile_id)
  const salaryEvent = type === 'bonus'
    ? {
        ...event,
        accrues_to_salary: salaryProfile?.bonuses
          ?.find(bonus => bonus.id === event.id)?.accrues_to_salary === true,
      }
    : event
  const remainingDue = salaryProfile
    ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
    : 0
  const groupDelivery = includeGroup
    ? deliverSalaryGroupEvent(supabase, type, salaryEvent, remainingDue)
    : supabase
        .from('employee_salary_group_notification_deliveries')
        .update({
          status: 'skipped',
          telegram_chat_id: null,
          telegram_message_id: null,
          error_message: DAILY_KPI_GROUP_REASON,
          sent_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('event_type', type)
        .eq('event_id', event.id)
        .neq('status', 'sent')
        .select('*')
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error
          return data
            ? savedGroupDeliveryResult(data, false)
            : {
                status: 'skipped',
                telegramMessageId: null,
                sentAt: null,
                errorMessage: DAILY_KPI_GROUP_REASON,
              }
        })
  const [groupSettled] = await Promise.allSettled([groupDelivery])
  const employeeDelivery = includeEmployee
    ? deliverEmployeeSalaryEvent(supabase, type, salaryEvent, remainingDue, salaryProfile)
    : Promise.resolve({
        status: 'skipped',
        telegramMessageId: null,
        sentAt: null,
        errorMessage: COMBINED_DAILY_KPI_EMPLOYEE_REASON,
      })
  const [employeeSettled, teamSettled] = await Promise.allSettled([
    employeeDelivery,
    deliverSalaryTeamEvent(supabase, type, salaryEvent),
  ])
  const employee = normalizeDeliverySettlement(employeeSettled)
  const group = normalizeDeliverySettlement(groupSettled)
  const team = normalizeDeliverySettlement(teamSettled)
  const employeeSent = employee.status === 'sent'
  const employeeSatisfied = !includeEmployee || employeeSent
  const groupSent = group.status === 'sent'
  const groupSatisfied = !includeGroup || groupSent
  const teamSent = team.status === 'sent'
  const teamRequired = TEAM_EVENT_TYPES.has(type)
  return {
    ok: employeeSatisfied || groupSent || teamSent,
    allSent: employeeSatisfied && groupSatisfied && (!teamRequired || teamSent),
    employeeIncludedInDailySummary: !includeEmployee,
    groupExcludedForAutomaticKpi: !includeGroup,
    employee,
    group,
    team,
  }
}

// Late check-in fines are written by the database with the check-in (273).
export async function loadLateCheckinFine(supabase, checkinId) {
  const { data, error } = await supabase
    .from('employee_salary_fines')
    .select('id, amount, reason')
    .eq('source_checkin_id', checkinId)
    .maybeSingle()
  if (error) {
    // Rolling deployment: before migration 273 check-ins carry no fines.
    if (['42703', 'PGRST204'].includes(error.code)) return null
    throw error
  }
  return data || null
}

// Salary group + Team announcement; duplicate-safe through the delivery ledger.
export async function notifyLateCheckinFine(supabase, fineId) {
  const event = await loadOwnedSalaryEvent(supabase, { id: null }, 'fine', fineId, 'Система')
  if (event.source_type !== 'late_checkin' || event.created_by != null) {
    throw Object.assign(new Error('Late check-in fine not found'), { status: 404 })
  }
  return notifyLoadedSalaryEvent(supabase, 'fine', event, {
    includeEmployee: false,
    includeGroup: true,
  })
}

// Minute-cron retry for late fines whose Salary/Team send failed or never ran.
export async function retryLateCheckinFineDeliveries(supabase, now = new Date()) {
  const since = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: fines, error } = await supabase
    .from('employee_salary_fines')
    .select('id')
    .eq('source_type', 'late_checkin')
    .gte('created_at', since)
  if (error) {
    if (['42703', 'PGRST204'].includes(error.code)) return []
    throw error
  }
  if (!fines?.length) return []
  const { data: deliveries, error: deliveriesError } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .select('event_id, status, attempted_at, employee_status, employee_attempted_at, team_status, team_attempted_at, event_type')
    .eq('event_type', 'fine')
    .in('event_id', fines.map(fine => fine.id))
  if (deliveriesError) throw deliveriesError
  const results = []
  for (const delivery of deliveries || []) {
    const targets = getSalaryEventRetryTargets(delivery, { pendingRetryMs: PENDING_DELIVERY_RETRY_MS })
    if (!targets.group && !targets.team) continue
    try {
      const result = await notifyLateCheckinFine(supabase, delivery.event_id)
      results.push({ fineId: delivery.event_id, status: result.allSent ? 'sent' : result.ok ? 'partial' : 'failed' })
    } catch (retryError) {
      results.push({ fineId: delivery.event_id, status: 'failed', error: String(retryError?.message || retryError).slice(0, 1000) })
    }
  }
  return results
}

export async function notifyAutomaticKpiBonus(supabase, bonusId) {
  const event = await loadOwnedSalaryEvent(
    supabase,
    { id: null },
    'bonus',
    bonusId,
    'Автоматический KPI'
  )
  if (event.source_type !== 'daily_kpi' || event.created_by != null) {
    throw Object.assign(new Error('Automatic KPI bonus not found'), { status: 404 })
  }
  return notifyLoadedSalaryEvent(supabase, 'bonus', event, {
    includeEmployee: false,
    includeGroup: false,
  })
}

async function notifyPayment(supabase, user, paymentId, salaryOrderOnly = false) {
  let deliveryId = null
  let employeeShouldSend = false
  let groupShouldSend = false
  let employeeAlreadyDelivered = false
  let groupAlreadyDelivered = false
  try {
    const { data: payment, error } = await supabase
      .from('employee_salary_payments')
      .select('id, salary_profile_id, paid_date, amount, payment_method, note, created_by, created_by_name, salary_profile:employee_salary_profiles(employee_name)')
      .eq('id', paymentId)
      .maybeSingle()
    if (error) throw error
    if (!payment || payment.created_by !== user.id || (salaryOrderOnly && payment.payment_method !== 'salary')) {
      throw Object.assign(new Error('Payment not found'), { status: 404 })
    }

    const { data: existingDelivery, error: existingError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle()
    if (existingError) throw existingError
    const retryTargets = getSalaryPaymentRetryTargets(existingDelivery, {
      pendingRetryMs: PENDING_DELIVERY_RETRY_MS,
    })
    employeeShouldSend = retryTargets.employee
    groupShouldSend = payment.payment_method !== 'salary' && retryTargets.group
    employeeAlreadyDelivered = ['sent', 'confirmed'].includes(existingDelivery?.status)
    groupAlreadyDelivered = payment.payment_method === 'salary' || existingDelivery?.group_status === 'sent'
    if (!employeeShouldSend && !groupShouldSend) {
      return {
        ok: employeeAlreadyDelivered || groupAlreadyDelivered,
        allSent: employeeAlreadyDelivered && groupAlreadyDelivered,
        duplicate: true,
        deliveryId: existingDelivery.id,
        employee: {
          status: existingDelivery.status,
          telegramMessageId: existingDelivery.telegram_message_id,
          sentAt: existingDelivery.sent_at,
          errorMessage: existingDelivery.error_message || '',
        },
        group: {
          status: existingDelivery.group_status,
          telegramMessageId: existingDelivery.group_telegram_message_id,
          sentAt: existingDelivery.group_sent_at,
          errorMessage: existingDelivery.group_error_message || '',
        },
      }
    }

    const now = new Date().toISOString()
    const groupTarget = groupShouldSend
      ? await loadSalaryGroupTarget(supabase)
      : {
          chatId: String(existingDelivery?.group_chat_id || '').trim(),
          language: 'ru',
        }
    const groupChatId = groupTarget.chatId
    const groupLanguage = groupTarget.language
    let delivery = existingDelivery
    if (!delivery) {
      const { data: createdDelivery, error: deliveryError } = await supabase
        .from('employee_salary_payment_notification_deliveries')
        .insert({
          payment_id: payment.id,
          salary_profile_id: payment.salary_profile_id,
          status: 'pending',
          telegram_message_id: null,
          error_message: '',
          attempted_at: now,
          group_status: groupChatId ? 'pending' : 'skipped',
          group_chat_id: groupChatId || null,
          group_telegram_message_id: null,
          group_error_message: groupChatId
            ? ''
            : 'Salary payment Telegram group is not configured',
          group_attempted_at: now,
          group_sent_at: null,
          updated_at: now,
        })
        .select('*')
        .single()
      if (deliveryError?.code === '23505') {
        const { data: concurrent, error: concurrentError } = await supabase
          .from('employee_salary_payment_notification_deliveries')
          .select('*')
          .eq('payment_id', payment.id)
          .single()
        if (concurrentError) throw concurrentError
        return {
          ok: ['sent', 'confirmed'].includes(concurrent.status)
            || concurrent.group_status === 'sent',
          allSent: ['sent', 'confirmed'].includes(concurrent.status)
            && concurrent.group_status === 'sent',
          duplicate: true,
          deliveryId: concurrent.id,
          employee: {
            status: concurrent.status,
            telegramMessageId: concurrent.telegram_message_id,
            sentAt: concurrent.sent_at,
            errorMessage: concurrent.error_message || '',
          },
          group: {
            status: concurrent.group_status,
            telegramMessageId: concurrent.group_telegram_message_id,
            sentAt: concurrent.group_sent_at,
            errorMessage: concurrent.group_error_message || '',
          },
        }
      }
      if (deliveryError) throw deliveryError
      delivery = createdDelivery
    } else {
      const retryFields = { updated_at: now }
      if (employeeShouldSend) {
        Object.assign(retryFields, {
          status: 'pending',
          telegram_message_id: null,
          error_message: '',
          attempted_at: now,
          sent_at: null,
        })
      }
      if (groupShouldSend) {
        Object.assign(retryFields, {
          group_status: groupChatId ? 'pending' : 'skipped',
          group_chat_id: groupChatId || null,
          group_telegram_message_id: null,
          group_error_message: groupChatId
            ? ''
            : 'Salary payment Telegram group is not configured',
          group_attempted_at: now,
          group_sent_at: null,
        })
      }
      const claim = await supabase
        .from('employee_salary_payment_notification_deliveries')
        .update(retryFields)
        .eq('id', delivery.id)
        .eq('updated_at', delivery.updated_at)
        .select('*')
        .maybeSingle()
      if (claim.error) throw claim.error
      if (!claim.data) {
        const { data: concurrent, error: concurrentError } = await supabase
          .from('employee_salary_payment_notification_deliveries')
          .select('*')
          .eq('id', delivery.id)
          .single()
        if (concurrentError) throw concurrentError
        return {
          ok: ['sent', 'confirmed'].includes(concurrent.status)
            || concurrent.group_status === 'sent',
          allSent: ['sent', 'confirmed'].includes(concurrent.status)
            && concurrent.group_status === 'sent',
          duplicate: true,
          deliveryId: concurrent.id,
          employee: {
            status: concurrent.status,
            telegramMessageId: concurrent.telegram_message_id,
            sentAt: concurrent.sent_at,
            errorMessage: concurrent.error_message || '',
          },
          group: {
            status: concurrent.group_status,
            telegramMessageId: concurrent.group_telegram_message_id,
            sentAt: concurrent.group_sent_at,
            errorMessage: concurrent.group_error_message || '',
          },
        }
      }
      delivery = claim.data
    }
    deliveryId = delivery.id

    const salaryProfiles = await loadSalaryProfiles(supabase, [payment.salary_profile_id])
    const salaryProfile = salaryProfiles.get(payment.salary_profile_id)
    const remainingDue = salaryProfile
      ? getDailySalaryNotificationSummary(salaryProfile, getTashkentDate()).due
      : 0
    const paymentWithEmployee = {
      ...payment,
      employee_name: payment.salary_profile?.employee_name || '',
    }

    const employeeDelivery = !employeeShouldSend
      ? Promise.resolve({
          status: delivery.status,
          telegramMessageId: delivery.telegram_message_id,
          sentAt: delivery.sent_at,
          errorMessage: delivery.error_message || '',
        })
      : (async () => {
          if (salaryProfile?.is_active === false || salaryProfile?.deleted_at) {
            return {
              status: 'skipped',
              telegramMessageId: null,
              sentAt: null,
              errorMessage: INACTIVE_EMPLOYEE_REASON,
            }
          }
          const { data: employeeLink, error: linkError } = await supabase
            .from('employee_salary_telegram_links')
            .select('chat_id, notifications_enabled, preferred_language')
            .eq('salary_profile_id', payment.salary_profile_id)
            .maybeSingle()
          if (linkError) throw linkError
          if (!employeeLink?.chat_id || employeeLink.notifications_enabled === false) {
            return {
              status: 'skipped',
              telegramMessageId: null,
              sentAt: null,
              errorMessage: 'Employee Telegram is not linked or notifications are disabled',
            }
          }
          const text = buildEmployeePaymentMessage(
            paymentWithEmployee,
            remainingDue,
            employeeLink.preferred_language
          )
          const confirmation = getEmployeePaymentConfirmationCopy(employeeLink.preferred_language)
          const response = await sendTelegramMessage(employeeLink.chat_id, text, payment.payment_method === 'salary' ? {} : {
            reply_markup: {
              inline_keyboard: [[{
                text: confirmation.button,
                callback_data: `salary_payment_confirm:${deliveryId}`,
              }]],
            },
          })
          return {
            status: 'sent',
            telegramMessageId: getTelegramMessageId(response),
            sentAt: new Date().toISOString(),
            errorMessage: '',
          }
        })()

    const groupDelivery = !groupShouldSend
      ? Promise.resolve({
          status: delivery.group_status,
          telegramMessageId: delivery.group_telegram_message_id,
          sentAt: delivery.group_sent_at,
          errorMessage: delivery.group_error_message || '',
        })
      : (async () => {
          if (!groupChatId) {
            return {
              status: 'skipped',
              telegramMessageId: null,
              sentAt: null,
              errorMessage: 'Salary payment Telegram group is not configured',
            }
          }
          const text = buildSalaryPaymentGroupMessage(
            paymentWithEmployee,
            remainingDue,
            groupLanguage
          )
          const response = await sendTelegramMessage(groupChatId, text)
          return {
            status: 'sent',
            telegramMessageId: getTelegramMessageId(response),
            sentAt: new Date().toISOString(),
            errorMessage: '',
          }
        })()

    const [employeeSettled, groupSettled] = await Promise.allSettled([
      employeeDelivery,
      groupDelivery,
    ])
    const normalizeDelivery = settled => (
      settled.status === 'fulfilled'
        ? settled.value
        : {
            status: 'failed',
            telegramMessageId: null,
            sentAt: null,
            errorMessage: String(settled.reason?.message || settled.reason).slice(0, 1000),
          }
    )
    const employeeResult = normalizeDelivery(employeeSettled)
    const groupResult = normalizeDelivery(groupSettled)
    const updatedAt = new Date().toISOString()
    const deliveredFields = { updated_at: updatedAt }
    if (employeeShouldSend) {
      Object.assign(deliveredFields, {
        status: employeeResult.status,
        telegram_message_id: employeeResult.telegramMessageId,
        error_message: employeeResult.errorMessage,
        sent_at: employeeResult.sentAt,
      })
    }
    if (groupShouldSend) {
      Object.assign(deliveredFields, {
        group_status: groupResult.status,
        group_chat_id: groupChatId || delivery.group_chat_id || null,
        group_telegram_message_id: groupResult.telegramMessageId,
        group_error_message: groupResult.errorMessage,
        group_sent_at: groupResult.sentAt,
      })
    }
    const { error: sentUpdateError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .update(deliveredFields)
      .eq('id', deliveryId)
    if (sentUpdateError) throw sentUpdateError

    const employeeSent = ['sent', 'confirmed'].includes(employeeResult.status)
    const groupSent = payment.payment_method === 'salary' || groupResult.status === 'sent'
    return {
      ok: employeeSent || groupSent,
      allSent: employeeSent && groupSent,
      deliveryId,
      employee: employeeResult,
      group: groupResult,
    }
  } catch (error) {
    if (deliveryId) {
      const errorMessage = String(error?.message || error).slice(0, 1000)
      const failureFields = { updated_at: new Date().toISOString() }
      if (employeeShouldSend) {
        failureFields.status = 'failed'
        failureFields.error_message = errorMessage
      }
      if (groupShouldSend) {
        failureFields.group_status = 'failed'
        failureFields.group_error_message = errorMessage
      }
      await supabase
        .from('employee_salary_payment_notification_deliveries')
        .update(failureFields)
        .eq('id', deliveryId)
    }
    throw error
  }
}

function telegramMessageWasAlreadyDeleted(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('message to delete not found')
    || message.includes('message_id_invalid')
}

async function retractTrackedTelegramMessage(target) {
  try {
    await deleteTelegramMessage(target.chatId, target.messageId)
    return { ...target, status: 'deleted' }
  } catch (error) {
    if (telegramMessageWasAlreadyDeleted(error)) {
      return { ...target, status: 'already_deleted' }
    }
    // Telegram refuses deletion after 48h. A bot can still edit its own rate notice.
    if (target.cancelText && /message (?:can't|cannot) be deleted/i.test(String(error?.message || error))) {
      try {
        await editTelegramMessage(target.chatId, target.messageId, target.cancelText)
        return { ...target, status: 'cancelled' }
      } catch (editError) {
        if (/message is not modified/i.test(String(editError?.message || editError))) {
          return { ...target, status: 'cancelled' }
        }
        if (telegramMessageWasAlreadyDeleted(editError) || /message to edit not found/i.test(String(editError?.message || editError))) {
          return { ...target, status: 'already_deleted' }
        }
        error = editError
      }
    }
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      targetLabel: target.label,
    })
  }
}

function addTrackedRetractionTarget(targets, label, chatId, messageId) {
  const normalizedMessageId = String(messageId || '').trim()
  if (!normalizedMessageId) return
  const normalizedChatId = String(chatId || '').trim()
  if (!normalizedChatId) {
    throw Object.assign(
      new Error(`The stored Telegram chat id is missing for: ${label}`),
      { status: 409 }
    )
  }
  targets.push({ label, chatId: normalizedChatId, messageId: normalizedMessageId })
}

async function retractSalaryEventMessages(supabase, eventType, eventId) {
  const table = RETRACTABLE_SALARY_EVENT_TABLES[eventType]
  if (!table) throw Object.assign(new Error('Unsupported salary event type'), { status: 400 })

  const { data: event, error: eventError } = await supabase
    .from(table)
    .select(eventType === 'bonus' ? 'id, salary_profile_id, source_type, bonus_date' : eventType === 'payment' ? 'id, salary_profile_id, payment_method' : 'id, salary_profile_id')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) throw eventError
  if (!event) throw Object.assign(new Error('Salary event not found'), { status: 404 })
  if (eventType === 'payment' && event.payment_method === 'salary') {
    throw Object.assign(new Error('Linked salary order payments cannot be deleted independently'), { status: 409 })
  }

  if (eventType === 'bonus' && event.source_type === 'daily_kpi') {
    await retractTeamDailyKpiItem(supabase, event.bonus_date, eventId)
  }

  const targets = []
  if (eventType === 'payment') {
    const deliveryResult = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .select('employee_chat_id, telegram_message_id, group_chat_id, group_telegram_message_id')
      .eq('payment_id', eventId)
      .maybeSingle()
    if (deliveryResult.error) throw deliveryResult.error
    const delivery = deliveryResult.data
    addTrackedRetractionTarget(
      targets,
      'employee',
      delivery?.employee_chat_id,
      delivery?.telegram_message_id
    )
    addTrackedRetractionTarget(
      targets,
      'salary_group',
      delivery?.group_chat_id,
      delivery?.group_telegram_message_id
    )
  } else {
    const { data: delivery, error: deliveryError } = await supabase
      .from('employee_salary_group_notification_deliveries')
      .select('telegram_chat_id, telegram_message_id, employee_chat_id, employee_telegram_message_id, team_chat_id, team_telegram_message_id')
      .eq('event_type', eventType)
      .eq('event_id', eventId)
      .maybeSingle()
    if (deliveryError) throw deliveryError
    addTrackedRetractionTarget(
      targets,
      'employee',
      delivery?.employee_chat_id,
      delivery?.employee_telegram_message_id
    )
    addTrackedRetractionTarget(
      targets,
      'salary_group',
      delivery?.telegram_chat_id,
      delivery?.telegram_message_id
    )
    addTrackedRetractionTarget(
      targets,
      'team_group',
      delivery?.team_chat_id,
      delivery?.team_telegram_message_id
    )
  }

  const uniqueTargets = [...new Map(
    targets.map(target => [`${target.chatId}:${target.messageId}`, target])
  ).values()]
  if (eventType === 'rate') {
    for (const target of uniqueTargets) {
      target.cancelText = '<b>❌ Изменение зарплаты отменено / Salary change cancelled</b>\n<s>Изменение ставки / Salary rate change</s>'
    }
  }
  const settled = await Promise.allSettled(uniqueTargets.map(retractTrackedTelegramMessage))
  const failures = settled
    .filter(result => result.status === 'rejected')
    .map(result => ({
      target: result.reason?.targetLabel || 'telegram',
      error: String(result.reason?.message || result.reason).slice(0, 1000),
    }))
  if (failures.length > 0) {
    const targetNames = failures.map(failure => failure.target).join(', ')
    const detail = failures.map(failure => failure.error).join('; ')
    throw Object.assign(
      new Error(`Could not delete the Telegram message from: ${targetNames}. ${detail}`),
      { status: 409 }
    )
  }

  return {
    ok: true,
    eventType,
    eventId,
    retracted: settled.map(result => result.value),
  }
}

async function notifyInvestorExpense(supabase, user, expenseId) {
  const normalizedExpenseId = String(expenseId || '').trim()
  if (!normalizedExpenseId) {
    throw Object.assign(new Error('expenseId is required'), { status: 400 })
  }

  const { data: existing, error: existingError } = await supabase
    .from('expense_investor_notification_deliveries')
    .select('*')
    .eq('expense_id', normalizedExpenseId)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing || existing.actor_id !== user.id) {
    throw Object.assign(new Error('Expense notification event not found'), { status: 404 })
  }
  if (!canRetryInvestorExpenseDelivery(existing)) {
    return savedInvestorExpenseDeliveryResult(existing)
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    status: target.chatId ? 'pending' : 'skipped',
    telegram_chat_id: target.chatId || null,
    telegram_message_id: null,
    error_message: target.chatId ? '' : 'ZarKebab Investor Telegram group is not configured',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  const claimed = await supabase
    .from('expense_investor_notification_deliveries')
    .update(pendingFields)
    .eq('expense_id', existing.expense_id)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('*')
    .maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('expense_investor_notification_deliveries')
      .select('*')
      .eq('expense_id', existing.expense_id)
      .single()
    if (concurrentError) throw concurrentError
    return savedInvestorExpenseDeliveryResult(concurrent)
  }
  if (!target.chatId) {
    return savedInvestorExpenseDeliveryResult(claimed.data, false)
  }

  try {
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(claimed.data.expense_date || ''))
      ? claimed.data.expense_date
      : getTashkentDate()
    const monthStart = `${normalizedDate.slice(0, 7)}-01`
    const [year, month] = monthStart.split('-').map(Number)
    const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
    const { data: monthEntries, error: monthError } = await supabase
      .from('expenses')
      .select('amount')
      .eq('entry_type', 'expense')
      .gte('expense_date', monthStart)
      .lt('expense_date', nextMonthStart)
    if (monthError) throw monthError
    const monthTotal = (monthEntries || []).reduce(
      (total, entry) => total + (Number(entry?.amount) || 0),
      0
    )
    let bazaarPurchase = null
    if (claimed.data.category === 'products_bazaar') {
      const { data: purchase, error: purchaseError } = await supabase
        .from('bazaar_purchases')
        .select(`
          id,
          purchase_date,
          total_amount,
          bazaar_purchase_items (
            id,
            product_name,
            product_key,
            category,
            quantity,
            unit,
            line_total,
            normal_unit_price,
            normal_line_total,
            price_difference,
            sort_order
          )
        `)
        .eq('expense_id', normalizedExpenseId)
        .maybeSingle()
      if (purchaseError) throw purchaseError
      bazaarPurchase = purchase
    }
    let response
    if (bazaarPurchase) {
      const { buildDailyBazaarReportPng } = await import('./_lib/dailyOperationsReportImages.js')
      const photo = await buildDailyBazaarReportPng(
        [bazaarPurchase],
        normalizedDate,
        target.language,
      )
      const caption = buildInvestorExpenseGroupMessage(
        claimed.data,
        target.language,
        monthTotal,
      )
      response = await sendTelegramPhoto(target.chatId, photo, {
        caption,
        filename: `zar-kebab-bazaar-expense-${normalizedDate}.png`,
      })
    } else {
      const text = buildInvestorExpenseGroupMessage(claimed.data, target.language, monthTotal)
      response = await sendTelegramMessage(target.chatId, text)
    }
    const sentAt = new Date().toISOString()
    const telegramMessageId = getTelegramMessageId(response)
    const { data: sentDelivery, error: updateError } = await supabase
      .from('expense_investor_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('expense_id', existing.expense_id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return savedInvestorExpenseDeliveryResult(sentDelivery, false)
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('expense_investor_notification_deliveries')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('expense_id', existing.expense_id)
    return {
      ...savedInvestorExpenseDeliveryResult(existing, false),
      ok: false,
      status: 'failed',
      telegramMessageId: null,
      sentAt: null,
      errorMessage,
    }
  }
}

// Migration 216 snapshots the starting salary on the event. Events queued
// before it fall back to the employee's first saved rate.
async function withStartingSalary(supabase, delivery) {
  if (delivery?.event_type !== 'created' || Number(delivery?.salary_amount) > 0) return delivery
  const { data: firstRate, error } = await supabase
    .from('employee_salary_rates')
    .select('amount, rate_unit')
    .eq('salary_profile_id', delivery.salary_profile_id)
    .order('effective_from', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return firstRate
    ? { ...delivery, salary_amount: firstRate.amount, salary_unit: firstRate.rate_unit }
    : delivery
}

async function notifyEmployeeLifecycle(supabase, user, salaryProfileId, lifecycleEventType) {
  const normalizedProfileId = String(salaryProfileId || '').trim()
  const normalizedEventType = String(lifecycleEventType || '').trim()
  if (!normalizedProfileId || !['created', 'activated', 'deactivated'].includes(normalizedEventType)) {
    throw Object.assign(new Error('salaryProfileId and a valid lifecycleEventType are required'), { status: 400 })
  }

  const { data: existing, error: existingError } = await supabase
    .from('employee_lifecycle_investor_notification_deliveries')
    .select('*')
    .eq('salary_profile_id', normalizedProfileId)
    .eq('event_type', normalizedEventType)
    .eq('actor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw Object.assign(new Error('Employee lifecycle notification event not found'), { status: 404 })
  if (!canRetryInvestorExpenseDelivery(existing)) {
    return savedEmployeeLifecycleDeliveryResult(existing)
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  const pendingFields = {
    status: target.chatId ? 'pending' : 'skipped',
    telegram_chat_id: target.chatId || null,
    telegram_message_id: null,
    error_message: target.chatId ? '' : 'ZarKebab Investor Telegram group is not configured',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  const claimed = await supabase
    .from('employee_lifecycle_investor_notification_deliveries')
    .update(pendingFields)
    .eq('id', existing.id)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('*')
    .maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from('employee_lifecycle_investor_notification_deliveries')
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedEmployeeLifecycleDeliveryResult(concurrent)
  }
  if (!target.chatId) return savedEmployeeLifecycleDeliveryResult(claimed.data, false)

  try {
    const delivery = await withStartingSalary(supabase, claimed.data)
    const response = await sendTelegramMessage(
      target.chatId,
      buildEmployeeLifecycleInvestorMessage(delivery, 'ru'),
    )
    const sentAt = new Date().toISOString()
    const { data: sentDelivery, error: updateError } = await supabase
      .from('employee_lifecycle_investor_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: getTelegramMessageId(response),
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return savedEmployeeLifecycleDeliveryResult(sentDelivery, false)
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from('employee_lifecycle_investor_notification_deliveries')
      .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ...savedEmployeeLifecycleDeliveryResult(existing, false), ok: false, status: 'failed', errorMessage }
  }
}

// Name, role and work-start changes: the same claim/send flow and Investor
// (salary_events) target as lifecycle events, keyed by the trigger's row.
async function notifyEmployeeProfileChange(supabase, user, salaryProfileId) {
  const normalizedProfileId = String(salaryProfileId || '').trim()
  if (!normalizedProfileId) {
    throw Object.assign(new Error('salaryProfileId is required'), { status: 400 })
  }

  const table = 'employee_profile_change_investor_notification_deliveries'
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select('*')
    .eq('salary_profile_id', normalizedProfileId)
    .eq('actor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw Object.assign(new Error('Employee profile change notification event not found'), { status: 404 })
  if (!canRetryInvestorExpenseDelivery(existing)) {
    return savedEmployeeLifecycleDeliveryResult(existing)
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  const claimed = await supabase
    .from(table)
    .update({
      status: target.chatId ? 'pending' : 'skipped',
      telegram_chat_id: target.chatId || null,
      telegram_message_id: null,
      error_message: target.chatId ? '' : 'ZarKebab Investor Telegram group is not configured',
      attempted_at: now,
      sent_at: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('status', existing.status)
    .eq('updated_at', existing.updated_at)
    .select('*')
    .maybeSingle()
  if (claimed.error) throw claimed.error
  if (!claimed.data) {
    const { data: concurrent, error: concurrentError } = await supabase
      .from(table)
      .select('*')
      .eq('id', existing.id)
      .single()
    if (concurrentError) throw concurrentError
    return savedEmployeeLifecycleDeliveryResult(concurrent)
  }
  if (!target.chatId) return savedEmployeeLifecycleDeliveryResult(claimed.data, false)

  try {
    const response = await sendTelegramMessage(
      target.chatId,
      buildEmployeeProfileChangeInvestorMessage(claimed.data, 'ru'),
    )
    const sentAt = new Date().toISOString()
    const { data: sentDelivery, error: updateError } = await supabase
      .from(table)
      .update({
        status: 'sent',
        telegram_message_id: getTelegramMessageId(response),
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    return savedEmployeeLifecycleDeliveryResult(sentDelivery, false)
  } catch (error) {
    const errorMessage = String(error?.message || error).slice(0, 1000)
    await supabase
      .from(table)
      .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ...savedEmployeeLifecycleDeliveryResult(existing, false), ok: false, status: 'failed', errorMessage }
  }
}

async function notifyInvestorIncome(supabase, user, expenseId) {
  const { data: expense, error } = await supabase
    .from('expenses')
    .select('id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name')
    .eq('id', expenseId)
    .maybeSingle()
  if (error) throw error
  if (
    !expense ||
    expense.created_by !== user.id ||
    expense.entry_type !== 'income' ||
    expense.category !== 'investor_support'
  ) {
    throw Object.assign(new Error('Investor income entry not found'), { status: 404 })
  }

  const target = await loadSalaryGroupTarget(supabase)
  if (!target.chatId) {
    throw Object.assign(new Error('Salary Events Telegram channel is not configured'), { status: 503 })
  }
  const currentDate = getTashkentDate()
  const currentMonthStart = `${currentDate.slice(0, 7)}-01`
  const [year, month] = currentMonthStart.split('-').map(Number)
  const nextMonthStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const { data: currentMonthEntries, error: currentMonthError } = await supabase
    .from('expenses')
    .select('amount')
    .eq('entry_type', 'income')
    .eq('category', 'investor_support')
    .gte('expense_date', currentMonthStart)
    .lt('expense_date', nextMonthStart)
  if (currentMonthError) throw currentMonthError
  const currentMonthTotal = (currentMonthEntries || []).reduce(
    (total, entry) => total + (Number(entry?.amount) || 0),
    0
  )
  const text = buildInvestorIncomeGroupMessage(expense, target.language, currentMonthTotal)
  const response = await sendTelegramMessage(target.chatId, text)
  return {
    ok: true,
    target: 'salary_events',
    telegramMessageId: getTelegramMessageId(response),
  }
}

async function notifyInvestorOrderChanges(supabase, user, orderIds) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).map(String).filter(Boolean))]
  if (ids.length === 0) throw Object.assign(new Error('orderIds is required'), { status: 400 })
  const { data: deliveries, error } = await supabase
    .from('order_change_investor_notification_deliveries').select('*')
    .in('order_id', ids).eq('actor_id', user.id).order('created_at', { ascending: true })
  if (error) throw error
  if (!deliveries?.length) throw Object.assign(new Error('Order change notification event not found'), { status: 404 })
  const target = await loadSalaryGroupTarget(supabase)
  const results = []
  for (const delivery of deliveries) {
    if (!canRetryInvestorExpenseDelivery(delivery)) {
      results.push(savedInvestorExpenseDeliveryResult(delivery))
      continue
    }
    const now = new Date().toISOString()
    const pending = {
      status: target.chatId ? 'pending' : 'skipped', telegram_chat_id: target.chatId || null,
      telegram_message_id: null, error_message: target.chatId ? '' : 'ZarKebab Investor Telegram group is not configured',
      attempted_at: now, sent_at: null, updated_at: now,
    }
    const claimed = await supabase.from('order_change_investor_notification_deliveries')
      .update(pending).eq('id', delivery.id).eq('status', delivery.status)
      .eq('updated_at', delivery.updated_at).select('*').maybeSingle()
    if (claimed.error) throw claimed.error
    if (!claimed.data || !target.chatId) {
      results.push(savedInvestorExpenseDeliveryResult(claimed.data || delivery, !claimed.data))
      continue
    }
    try {
      const response = await sendTelegramMessage(target.chatId, buildInvestorOrderChangeMessage(claimed.data, target.language))
      const sentAt = new Date().toISOString()
      const telegramMessageId = getTelegramMessageId(response)
      const saved = await supabase.from('order_change_investor_notification_deliveries').update({
        status: 'sent', telegram_message_id: telegramMessageId, error_message: '', sent_at: sentAt, updated_at: sentAt,
      }).eq('id', delivery.id).select('*').single()
      if (saved.error) throw saved.error
      results.push(savedInvestorExpenseDeliveryResult(saved.data, false))
    } catch (sendError) {
      const errorMessage = String(sendError?.message || sendError).slice(0, 1000)
      await supabase.from('order_change_investor_notification_deliveries')
        .update({ status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString() }).eq('id', delivery.id)
      results.push({ ok: false, status: 'failed', errorMessage })
    }
  }
  return { ok: results.every(result => result.ok), deliveries: results }
}

async function notifyAbsenceUndo(supabase, user, absenceId) {
  const { data: delivery, error } = await supabase
    .from('salary_absence_undo_notification_deliveries')
    .select('*')
    .eq('absence_id', absenceId)
    .eq('actor_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!delivery) throw Object.assign(new Error('Absence undo delivery was not queued'), { status: 404 })
  if (delivery.status === 'sent' && delivery.telegram_message_id) {
    return { ok: true, duplicate: true, status: 'sent', telegramMessageId: delivery.telegram_message_id }
  }

  const target = await loadSalaryGroupTarget(supabase)
  const now = new Date().toISOString()
  if (!target.chatId) {
    await supabase.from('salary_absence_undo_notification_deliveries').update({
      status: 'skipped',
      telegram_chat_id: null,
      error_message: 'ZarKebab Investor Telegram group is not configured',
      attempted_at: now,
      updated_at: now,
    }).eq('id', delivery.id)
    return { ok: false, status: 'skipped', telegramMessageId: null }
  }

  const { data: claimed, error: claimError } = await supabase
    .from('salary_absence_undo_notification_deliveries')
    .update({
      status: 'pending',
      telegram_chat_id: target.chatId,
      telegram_message_id: null,
      error_message: '',
      attempted_at: now,
      sent_at: null,
      updated_at: now,
    })
    .eq('id', delivery.id)
    .eq('status', delivery.status)
    .select('*')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) return { ok: true, duplicate: true, status: 'pending', telegramMessageId: null }

  try {
    const response = await sendTelegramMessage(
      target.chatId,
      buildAbsenceUndoInvestorMessage(claimed, target.language)
    )
    const telegramMessageId = getTelegramMessageId(response)
    const sentAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('salary_absence_undo_notification_deliveries')
      .update({ status: 'sent', telegram_message_id: telegramMessageId, sent_at: sentAt, updated_at: sentAt })
      .eq('id', delivery.id)
    if (updateError) throw updateError
    return { ok: true, status: 'sent', telegramMessageId }
  } catch (sendError) {
    await supabase.from('salary_absence_undo_notification_deliveries').update({
      status: 'failed',
      error_message: String(sendError?.message || sendError).slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq('id', delivery.id)
    throw sendError
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const {
      type,
      eventType,
      eventId,
      fineId,
      paymentId,
      bonusId,
      absenceId,
      rateId,
      kpiRuleEventId,
      expenseId,
      orderIds,
      menuItemId,
      salaryProfileId,
      lifecycleEventType,
    } = await readJson(req)
    const notificationType = type
      || (paymentId
        ? 'payment'
        : fineId
          ? 'fine'
          : bonusId
            ? 'bonus'
            : absenceId
              ? 'absence'
              : rateId
              ? 'rate'
              : kpiRuleEventId
                ? 'kpi_rule'
                : expenseId
                  ? 'investor_income'
                  : menuItemId
                    ? 'menu_unavailable'
                    : '')
    if (notificationType === 'salary_order_balances') {
      const { supabase, user } = await requireOrderChangeNotificationAccess(req)
      return json(res, 200, await loadOrderSalaryBalances(supabase, user.id))
    }
    const eventIds = {
      salary_order: paymentId,
      payment: paymentId,
      fine: fineId,
      bonus: bonusId,
      absence: absenceId,
      rate: rateId,
      kpi_rule: kpiRuleEventId,
      expense: expenseId,
      investor_income: expenseId,
      absence_undo: absenceId,
      order_change: orderIds?.[0],
      employee_lifecycle: salaryProfileId,
      employee_profile_change: salaryProfileId,
    }
    const isMenuUnavailable = notificationType === 'menu_unavailable'
    const isMenuAvailable = notificationType === 'menu_available'
    const isMenuCreated = notificationType === 'menu_created'
    const isMenuArchived = notificationType === 'menu_archived'
    const isMenuVariantVisibility = notificationType === 'menu_variant_visibility'
    const isMenuEvent = isMenuUnavailable || isMenuAvailable || isMenuCreated || isMenuArchived || isMenuVariantVisibility
    const isSalaryRetraction = notificationType === 'retract_salary_event'
    if (!isMenuEvent && !isSalaryRetraction && !['salary_order', 'fine', 'payment', 'bonus', 'absence', 'absence_undo', 'rate', 'kpi_rule', 'expense', 'investor_income', 'order_change', 'employee_lifecycle', 'employee_profile_change'].includes(notificationType)) {
      return json(res, 400, { error: 'Unsupported notification type' })
    }
    if (isMenuEvent && !menuItemId) {
      return json(res, 400, { error: 'menuItemId is required' })
    }
    if (isSalaryRetraction && (!eventType || !eventId)) {
      return json(res, 400, { error: 'eventType and eventId are required' })
    }
    if (!isMenuEvent && !isSalaryRetraction && !eventIds[notificationType]) {
      return json(res, 400, { error: `${notificationType}Id is required` })
    }

    const access = isMenuEvent
      ? await requireMenuWriteAccess(req)
      : ['order_change', 'salary_order'].includes(notificationType)
        ? await requireOrderChangeNotificationAccess(req)
      : notificationType === 'expense'
        ? await requireExpenseNotificationAccess(req)
        : await requireExpensesWriteAccess(req)
    if (isSalaryRetraction && access.role !== 'owner') {
      throw Object.assign(new Error('Only owners can retract salary messages'), { status: 403 })
    }
    const { supabase, user, actorName } = access
    let result
    if (isSalaryRetraction) {
      result = await retractSalaryEventMessages(supabase, eventType, eventId)
    } else if (isMenuCreated) {
      result = await notifyMenuCreated(supabase, user, menuItemId)
    } else if (isMenuArchived) {
      result = await notifyMenuArchived(supabase, user, menuItemId)
    } else if (isMenuVariantVisibility) {
      result = await notifyMenuVariantVisibility(supabase, user, menuItemId)
    } else if (isMenuAvailable) {
      result = await notifyMenuAvailable(supabase, user, menuItemId)
    } else if (isMenuUnavailable) {
      result = await notifyMenuUnavailable(supabase, user, menuItemId)
    } else if (notificationType === 'expense') {
      result = await notifyInvestorExpense(supabase, user, expenseId)
    } else if (notificationType === 'order_change') {
      try {
        await retractDeletedOrderStatusMessages(supabase, orderIds)
      } catch (error) {
        console.error('[telegram] Order status cleanup deferred to cron:', error)
      }
      result = await notifyInvestorOrderChanges(supabase, user, orderIds)
    } else if (notificationType === 'investor_income') {
      result = await notifyInvestorIncome(supabase, user, expenseId)
    } else if (notificationType === 'absence_undo') {
      result = await notifyAbsenceUndo(supabase, user, absenceId)
    } else if (notificationType === 'employee_lifecycle') {
      result = await notifyEmployeeLifecycle(supabase, user, salaryProfileId, lifecycleEventType)
    } else if (notificationType === 'employee_profile_change') {
      result = await notifyEmployeeProfileChange(supabase, user, salaryProfileId)
    } else if (notificationType === 'salary_order') {
      result = await notifyPayment(supabase, user, paymentId, true)
    } else if (notificationType === 'payment') {
      result = await notifyPayment(supabase, user, paymentId)
    } else {
      result = await notifySalaryEvent(
        supabase,
        user,
        actorName,
        notificationType,
        eventIds[notificationType]
      )
    }
    return json(res, 200, result)
  } catch (error) {
    console.error('[telegram/employee-notification]', error)
    return json(res, error?.status || 400, { error: error.message || 'Could not notify Telegram' })
  }
}

import { drainEmployeeOrderKpiNotifications } from './_lib/employeeOrderKpiNotifications.js'
import { drainIngredientNotifications } from './_lib/ingredientNotifications.js'
import { retractDeletedOrderStatusMessages } from './_lib/orderStatusDelivery.js'
import { drainGameClubNotifications } from './_lib/gameClubNotifications.js'
import { renderEmployeePayrollImage } from './_lib/employeePayrollImages.js'
import { json, methodNotAllowed, getBearerToken } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import {
  addSalaryDateDays,
  getDailyPayrollGroupSummary,
  getCompletedTashkentDate,
  getCompletedTashkentDates,
  getTashkentDate,
} from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { loadSalaryRows } from '../../src/lib/salaryData.js'
import {
  escapeTelegramHtml,
  sendTelegramMediaGroup,
  sendTelegramMessage,
  sendTelegramPhoto,
} from './_lib/telegram.js'
import {
  buildDailyUnavailableMenuTeamMessage,
  getRussianMenuCategoryName,
  getRussianMenuItemName,
} from './_lib/menuAvailabilityMessages.js'
import { renderDailyUnavailableMenuImage } from './_lib/menuAvailabilityImage.js'
import { notifyAutomaticKpiBonus } from './employee-notification.js'
import {
  getInclusiveCalendarDayCount,
  getOrderPayments,
  getOrderRevenueTotal,
} from '../../src/lib/analytics.js'
import { getOrdersCostTotal, hasOrdersCostCoverage } from '../../src/lib/profit.js'
import { allocateMonthlySalaryToDate } from '../../src/lib/expenses.js'
import { getGameClubRevenue } from '../../src/lib/gameClubRevenue.js'
import { inferOrderType, isDineInOrderType } from '../../src/lib/orderTypes.js'
import { PRICE_MODE_TOURIST } from '../../src/lib/priceModes.js'
import { formatLongDate } from '../../src/lib/dateFormat.js'
import { getDailySalesMix } from '../../src/lib/salesMix.js'
import { buildDailyBreakEvenSnapshotRow } from '../../src/lib/dailyBreakEven.js'

const KPI_RETRY_LOOKBACK_DAYS = 7
const KPI_MISSING_DATE_BATCH_SIZE = 31
const PENDING_DELIVERY_RETRY_MS = 2 * 60 * 1000
const CRON_FAILURE_ALERT_MARKER = '[cron-failure-alerted]'
const WATCHDOG_ACTIVE_RUN_GRACE_MS = 3 * 60 * 1000
// First day closed by the no-check-in rule (269): the attendance start date.
export const MISSING_CHECKIN_ABSENCE_START_DATE = '2026-10-15'

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET
  if (!expected || getBearerToken(req) !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function getCronTask(req) {
  const requestUrl = new URL(req.url || '/', 'http://localhost')
  return String(requestUrl.searchParams.get('task') || '').trim()
}

function isMissingDailyKpiMigration(error) {
  return ['42883', 'PGRST202', 'PGRST205'].includes(error?.code)
    || (
      /generate_daily_kpi_bonuses|get_pending_daily_kpi_dates|employee_daily_kpi|generate_employee_daily_meal_expense|employee_daily_meal/i.test(error?.message || '')
      && /does not exist|schema cache|could not find/i.test(error?.message || '')
    )
}

async function loadKpiCatchUpDates(supabase, now) {
  const retryDates = getCompletedTashkentDates(now, KPI_RETRY_LOOKBACK_DAYS)
  const [kpiPendingResult, mealPendingResult] = await Promise.all([
    supabase.rpc('get_pending_daily_kpi_dates', {
      p_limit: KPI_MISSING_DATE_BATCH_SIZE,
    }),
    supabase.rpc('get_pending_employee_meal_dates', {
      p_limit: KPI_MISSING_DATE_BATCH_SIZE,
    }),
  ])
  const pendingError = kpiPendingResult.error || mealPendingResult.error
  if (pendingError) {
    // Rolling-deployment fallback. Migration 147 removes the permanent
    // seven-day recovery ceiling by returning outstanding KPI and meal dates.
    if (isMissingDailyKpiMigration(pendingError)) return retryDates
    throw pendingError
  }
  const missingDates = [
    ...(kpiPendingResult.data || []),
    ...(mealPendingResult.data || []),
  ]
    .map(row => String(row?.business_date || row || '').slice(0, 10))
    .filter(Boolean)
  const notificationDate = getCompletedTashkentDate(now)
  return [...new Set([...retryDates, ...missingDates])].sort((a, b) => (
    a === notificationDate ? -1 : b === notificationDate ? 1 : a.localeCompare(b)
  ))
}

function isEligibleForSalaryDate(salaryProfile, notificationDate) {
  if (!salaryProfile) return false
  const joinedAt = String(salaryProfile.joined_at || '').slice(0, 10)
  const endedAt = String(salaryProfile.ended_at || '').slice(0, 10)
  const deletedAt = salaryProfile.deleted_at
    ? getTashkentDate(new Date(salaryProfile.deleted_at))
    : ''
  if (joinedAt && joinedAt > notificationDate) return false
  if (endedAt && endedAt < notificationDate) return false
  if (deletedAt && deletedAt <= notificationDate) return false
  if (salaryProfile.is_active === false && !endedAt) return false
  return true
}

function canRetryPending(attemptedAt) {
  const attemptedAtMs = new Date(attemptedAt || 0).getTime()
  return !Number.isFinite(attemptedAtMs)
    || Date.now() - attemptedAtMs >= PENDING_DELIVERY_RETRY_MS
}

function getTelegramMessageId(response) {
  const messageId = String(response?.result?.message_id || '').trim()
  if (!messageId) throw new Error('Telegram did not return a message id')
  return messageId
}

function getTelegramMediaGroupMessageIds(response, expectedCount) {
  const messageIds = Array.isArray(response?.result)
    ? response.result.map(message => String(message?.message_id || '').trim())
    : []
  if (messageIds.length !== expectedCount || messageIds.some(messageId => !messageId)) {
    throw new Error('Telegram did not return every media-group message id')
  }
  return messageIds
}

function getOptionalTashkentDate(value) {
  if (!value) return ''
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? getTashkentDate(timestamp) : ''
}

// `salary_events` is the legacy database key for the private ZarKebab Investor
// group. Keep the key stable because existing delivery ledgers reference it.
async function loadInvestorGroupTarget(supabase) {
  const fallback = {
    chatId: String(process.env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim(),
    language: String(process.env.TELEGRAM_SALARY_PAYMENTS_LANGUAGE || 'ru').trim(),
  }
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, language, is_enabled')
    .eq('target_key', 'salary_events')
    .maybeSingle()
  if (error) throw error
  if (!data?.is_enabled) return { chatId: '', language: data?.language || fallback.language }
  return {
    chatId: String(data.chat_id || fallback.chatId).trim(),
    language: String(data.language || fallback.language || 'ru').trim(),
  }
}

async function loadTeamGroupTarget(supabase) {
  const fallbackChatId = String(process.env.TELEGRAM_TEAM_CHAT_ID || '').trim()
  const { data, error } = await supabase
    .from('telegram_notification_targets')
    .select('chat_id, is_enabled')
    .eq('target_key', 'team_events')
    .maybeSingle()
  if (error) throw error
  if (data && !data.is_enabled) return { chatId: '' }
  return { chatId: String(data?.chat_id || fallbackChatId).trim() }
}

function buildDailySalaryCronFailureMessage(notificationDate, error) {
  const detail = String(error?.message || error || 'Unknown cron failure').slice(0, 800)
  return [
    '🚨 <b>Ошибка ежедневного финансового отчёта</b>',
    `Дата отчёта: ${escapeTelegramHtml(formatLongDate(notificationDate, 'ru', notificationDate || '—'))}`,
    `Ошибка: ${escapeTelegramHtml(detail)}`,
    '',
    'Отчёт остаётся в очереди и будет доступен для повторной отправки.',
  ].join('\n')
}

async function notifyDailySalaryCronFailure(supabase, notificationDate, error) {
  let target = {
    chatId: String(process.env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim(),
  }
  try {
    if (supabase) target = await loadInvestorGroupTarget(supabase)
  } catch (targetError) {
    console.error('[telegram/daily-salary] could not load failure-alert target:', targetError)
  }
  if (!target.chatId) {
    console.error('[telegram/daily-salary] failure alert skipped: Investor group is not configured')
    return { status: 'skipped' }
  }
  let telegramMessageId = ''
  try {
    const response = await sendTelegramMessage(
      target.chatId,
      buildDailySalaryCronFailureMessage(notificationDate, error)
    )
    telegramMessageId = getTelegramMessageId(response)
  } catch (notificationError) {
    console.error('[telegram/daily-salary] could not send failure alert:', notificationError)
    return { status: 'failed' }
  }
  try {
    if (supabase && notificationDate) {
      const now = new Date().toISOString()
      const detail = String(error?.message || error || 'Unknown cron failure').slice(0, 700)
      const errorMessage = `${CRON_FAILURE_ALERT_MARKER} Telegram message ${telegramMessageId}; chat ${target.chatId}; ${detail}`
      const existing = await supabase
        .from('daily_payroll_group_notification_deliveries')
        .select('business_date, status')
        .eq('business_date', notificationDate)
        .maybeSingle()
      if (existing.error) throw existing.error
      if (!existing.data) {
        const created = await supabase
          .from('daily_payroll_group_notification_deliveries')
          .insert({
            business_date: notificationDate,
            target_key: 'salary_events',
            status: 'failed',
            error_message: errorMessage,
            attempted_at: now,
            updated_at: now,
          })
        if (created.error) throw created.error
      } else if (existing.data.status !== 'sent') {
        const updated = await supabase
          .from('daily_payroll_group_notification_deliveries')
          .update({ status: 'failed', error_message: errorMessage, updated_at: now })
          .eq('business_date', notificationDate)
          .neq('status', 'sent')
        if (updated.error) throw updated.error
      }
    }
  } catch (persistenceError) {
    console.error('[telegram/daily-salary] failure alert sent but marker was not persisted:', persistenceError)
  }
  return { status: 'sent', telegramMessageId }
}

async function notifySecondaryCronFailure(supabase, businessDate, error) {
  let target = {
    chatId: String(process.env.TELEGRAM_SALARY_PAYMENTS_CHAT_ID || '').trim(),
  }
  try {
    if (supabase) target = await loadInvestorGroupTarget(supabase)
  } catch (targetError) {
    console.error('[telegram/daily-salary] could not load secondary-cron alert target:', targetError)
  }
  if (!target.chatId) {
    console.error('[telegram/daily-salary] secondary cron alert skipped: Investor group is not configured')
    return { status: 'skipped' }
  }
  const detail = String(error?.message || error || 'Unknown cron failure').slice(0, 800)
  try {
    const response = await sendTelegramMessage(target.chatId, [
      '🚨 <b>Ошибка резервной проверки cron</b>',
      `Дата: ${escapeTelegramHtml(formatLongDate(businessDate, 'ru', businessDate || '—'))}`,
      `Ошибка: ${escapeTelegramHtml(detail)}`,
      '',
      'Проверьте ежедневный финансовый отчёт и список недоступных блюд.',
    ].join('\n'))
    return { status: 'sent', telegramMessageId: getTelegramMessageId(response) }
  } catch (notificationError) {
    console.error('[telegram/daily-salary] could not send secondary-cron alert:', notificationError)
    return { status: 'failed' }
  }
}

function dailySalaryRunCanStillBeActive(delivery) {
  if (delivery?.status !== 'pending') return false
  const attemptedAt = new Date(delivery.attempted_at || 0).getTime()
  return Number.isFinite(attemptedAt) && Date.now() - attemptedAt < WATCHDOG_ACTIVE_RUN_GRACE_MS
}

function buildDailySalaryWatchdogMessage(businessDate, delivery) {
  const status = delivery?.status || 'not_started'
  const detail = String(delivery?.error_message || 'Vercel did not complete the scheduled report run')
    .replace(CRON_FAILURE_ALERT_MARKER, '')
    .trim()
    .slice(0, 800)
  return [
    '🚨 <b>Ежедневный финансовый отчёт не отправлен</b>',
    `Дата отчёта: ${escapeTelegramHtml(formatLongDate(businessDate, 'ru', businessDate || '—'))}`,
    `Статус: ${escapeTelegramHtml(status)}`,
    `Причина: ${escapeTelegramHtml(detail || 'Неизвестная ошибка')}`,
    '',
    'Отчёт оставлен в очереди для повторной отправки.',
  ].join('\n')
}

async function markDailySalaryWatchdogAlerted(supabase, businessDate, delivery, telegramMessageId) {
  const now = new Date().toISOString()
  const errorMessage = `${CRON_FAILURE_ALERT_MARKER} Telegram message ${telegramMessageId}`
  if (!delivery) {
    const created = await supabase
      .from('daily_payroll_group_notification_deliveries')
      .insert({
        business_date: businessDate,
        target_key: 'salary_events',
        status: 'failed',
        error_message: errorMessage,
        attempted_at: now,
        updated_at: now,
      })
    if (created.error) throw created.error
    return
  }
  const updated = await supabase
    .from('daily_payroll_group_notification_deliveries')
    .update({ status: 'failed', error_message: errorMessage, updated_at: now })
    .eq('business_date', businessDate)
    .neq('status', 'sent')
  if (updated.error) throw updated.error
}

async function verifyDailySalaryCronDelivery(supabase, businessDate) {
  const { data: delivery, error } = await supabase
    .from('daily_payroll_group_notification_deliveries')
    .select('business_date, status, attempted_at, sent_at, telegram_message_id, error_message')
    .eq('business_date', businessDate)
    .maybeSingle()
  if (error) throw error
  if (delivery?.status === 'sent' && delivery?.telegram_message_id) {
    return { status: 'healthy' }
  }
  if (dailySalaryRunCanStillBeActive(delivery)) return { status: 'in_progress' }
  // Recover only known failures/unstarted reports. A pending send can have an
  // unknown Telegram outcome and must not be replayed by the watchdog.
  if (!delivery || ['failed', 'skipped'].includes(delivery.status)) {
    try {
      await recordMissingCheckinAbsences(supabase, businessDate)
      await finalizeEmployeeMealDate(supabase, businessDate)
      const kpiResults = await finalizeDailyKpiDate(supabase, businessDate)
      await sendDailyInvestorReportAlbum(supabase, businessDate, kpiResults)
      const recovered = await supabase
        .from('daily_payroll_group_notification_deliveries')
        .select('status, telegram_message_id')
        .eq('business_date', businessDate)
        .maybeSingle()
      if (recovered.error) throw recovered.error
      if (recovered.data?.status === 'sent' && recovered.data?.telegram_message_id) {
        return { status: 'recovered' }
      }
    } catch (recoveryError) {
      console.error('[telegram/daily-salary] watchdog report recovery failed:', recoveryError)
    }
  }
  if (delivery?.error_message?.includes(CRON_FAILURE_ALERT_MARKER)) {
    return { status: 'alert_already_sent' }
  }

  const target = await loadInvestorGroupTarget(supabase)
  const response = await sendTelegramMessage(
    target.chatId,
    buildDailySalaryWatchdogMessage(businessDate, delivery)
  )
  const telegramMessageId = getTelegramMessageId(response)
  if (!telegramMessageId) {
    throw new Error('Telegram did not return a message id for the cron failure alert')
  }
  await markDailySalaryWatchdogAlerted(supabase, businessDate, delivery, telegramMessageId)
  return { status: 'alert_sent', telegramMessageId }
}

async function loadUnavailableMenuItems(supabase) {
  const { data: categories, error: categoryError } = await supabase
    .from('menu_categories')
    .select('id, name_ru, name_uz, name_en, sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
  if (categoryError) throw categoryError
  const activeCategoryIds = (categories || []).map(category => category.id).filter(Boolean)
  if (activeCategoryIds.length === 0) return []
  const categoriesById = new Map((categories || []).map((category, index) => [
    category.id,
    { ...category, category_order: index },
  ]))

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, category_id, name_ru, name_uz, name_en, sort_order')
    .eq('available', false)
    .is('deleted_at', null)
    .in('category_id', activeCategoryIds)
    .order('sort_order', { ascending: true })
    .order('name_ru', { ascending: true })
  if (error) throw error
  return (data || [])
    .map(item => {
      const category = categoriesById.get(item.category_id) || {}
      return {
        ...item,
        category_name_ru: category.name_ru || '',
        category_name_uz: category.name_uz || '',
        category_name_en: category.name_en || '',
        category_order: Number.isFinite(category.category_order)
          ? category.category_order
          : Number.MAX_SAFE_INTEGER,
      }
    })
    .sort((left, right) => (
      left.category_order - right.category_order
      || (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
      || getRussianMenuItemName(left).localeCompare(getRussianMenuItemName(right), 'ru')
    ))
}

function unavailableMenuSnapshot(items) {
  return {
    item_count: items.length,
    item_ids: items.map(item => String(item.id || '')).filter(Boolean),
    item_names: items.map(getRussianMenuItemName),
    item_categories: items.map(getRussianMenuCategoryName),
  }
}

async function claimDailyUnavailableMenuDelivery(supabase, businessDate, items) {
  const { data: existing, error: existingError } = await supabase
    .from('daily_unavailable_menu_notification_deliveries')
    .select('*')
    .eq('business_date', businessDate)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.status === 'sent' || existing?.status === 'skipped') return null
  if (existing?.status === 'pending' && !canRetryPending(existing.attempted_at)) return null

  const now = new Date().toISOString()
  const pendingFields = {
    target_key: 'team_events',
    ...unavailableMenuSnapshot(items),
    status: 'pending',
    telegram_chat_id: null,
    telegram_message_id: null,
    error_message: '',
    attempted_at: now,
    sent_at: null,
    updated_at: now,
  }
  if (!existing) {
    const created = await supabase
      .from('daily_unavailable_menu_notification_deliveries')
      .insert({ business_date: businessDate, ...pendingFields })
      .select('*')
      .single()
    if (created.error?.code === '23505') return null
    if (created.error) throw created.error
    return created.data
  }

  let claim = supabase
    .from('daily_unavailable_menu_notification_deliveries')
    .update(pendingFields)
    .eq('business_date', businessDate)
    .eq('status', existing.status)
  if (existing.attempted_at) claim = claim.eq('attempted_at', existing.attempted_at)
  else claim = claim.is('attempted_at', null)
  const claimed = await claim.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data || null
}

async function markDailyUnavailableMenuDeliverySent(
  supabase,
  businessDate,
  target,
  telegramMessageId
) {
  let lastError = null
  const sentAt = new Date().toISOString()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await supabase
      .from('daily_unavailable_menu_notification_deliveries')
      .update({
        status: 'sent',
        telegram_chat_id: target.chatId,
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('business_date', businessDate)
      .select('business_date')
      .maybeSingle()
    if (!updated.error && updated.data) return
    lastError = updated.error || new Error('Unavailable-menu delivery row disappeared')
  }
  throw lastError
}

// Non-empty snapshots go out as one PNG with no text copy; it is the tracked message.
// Rendering happens before the send, so a render failure leaves nothing to resend.
function getTashkentClockTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

async function sendDailyUnavailableMenuSnapshot(chatId, items, businessDate) {
  const snapshotTime = getTashkentClockTime()
  if (items.length === 0) {
    return sendTelegramMessage(chatId, buildDailyUnavailableMenuTeamMessage(items, businessDate, snapshotTime))
  }
  const photo = await renderDailyUnavailableMenuImage(items, businessDate, snapshotTime)
  return sendTelegramPhoto(chatId, photo, { filename: `unavailable-menu-${businessDate}.png` })
}

async function sendDailyUnavailableMenuNotification(supabase, businessDate) {
  const items = await loadUnavailableMenuItems(supabase)
  const delivery = await claimDailyUnavailableMenuDelivery(supabase, businessDate, items)
  if (!delivery) return { businessDate, itemCount: items.length, status: 'duplicate' }

  let target = { chatId: '' }
  let telegramMessageId = ''
  try {
    target = await loadTeamGroupTarget(supabase)
    if (!target.chatId) throw new Error('ZarKebab Team Telegram group is not configured')
    const response = await sendDailyUnavailableMenuSnapshot(target.chatId, items, businessDate)
    telegramMessageId = getTelegramMessageId(response)
    await markDailyUnavailableMenuDeliverySent(
      supabase,
      businessDate,
      target,
      telegramMessageId
    )
    return { businessDate, itemCount: items.length, status: 'sent' }
  } catch (error) {
    if (!telegramMessageId) {
      await supabase
        .from('daily_unavailable_menu_notification_deliveries')
        .update({
          status: 'failed',
          telegram_chat_id: target.chatId || null,
          error_message: String(error?.message || error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('business_date', businessDate)
    } else {
      console.error('[telegram/daily-salary] unavailable-menu message sent but delivery status was not persisted:', error)
    }
    throw error
  }
}

export async function loadDailyPayrollGroupSummary(supabase, businessDate, kpiResults) {
  const monthStart = `${businessDate.slice(0, 8)}01`
  const { data: profileRows, error: profilesError } = await loadSalaryRows(() => supabase
    .from('employee_salary_profiles')
    .select('id, employee_name, joined_at, ended_at, deleted_at, is_active'))
  if (profilesError) throw profilesError

  const eligibleProfiles = (profileRows || []).filter(profile => (
    isEligibleForSalaryDate(profile, businessDate)
  ))
  const profileIds = eligibleProfiles.map(profile => profile.id)
  const emptyRelatedResult = { data: [], error: null }
  const [ratesResult, absencesResult, salesResult, monthlySalesResult, settingsResult, employeeMealResult, openOrdersResult] = await Promise.all([
    profileIds.length > 0
      ? loadSalaryRows(() => supabase
          .from('employee_salary_rates')
          .select('id, salary_profile_id, effective_from, amount, rate_unit')
          .in('salary_profile_id', profileIds)
          .lte('effective_from', businessDate))
      : Promise.resolve(emptyRelatedResult),
    profileIds.length > 0
      ? loadSalaryRows(() => supabase
          .from('employee_salary_absences')
          .select('id, salary_profile_id, absence_date')
          .in('salary_profile_id', profileIds)
          .eq('absence_date', businessDate))
      : Promise.resolve(emptyRelatedResult),
    supabase
      .from('orders')
      .select('status, payment_status, payment_method, order_type, price_mode, subtotal, service_fee, total, loyalty_used_amount, loyalty_redeem_amount, loyalty_discount_amount, id, items:order_items(menu_item_id, name, category_id_snapshot, quantity, sale_unit, price, unit_price, base_price, item_type, is_counter_item, cost_price, status), payments:order_payments(method, amount)')
      .eq('payment_status', 'paid')
      .gte('paid_at', `${businessDate}T00:00:00+05:00`)
      .lt('paid_at', `${addSalaryDateDays(businessDate, 1)}T00:00:00+05:00`),
    // Month-to-date easily exceeds PostgREST's 1000-row cap; page it so the average is not truncated.
    loadSalaryRows(() => supabase
      .from('orders')
      .select('id, status, subtotal, service_fee, total, loyalty_used_amount, loyalty_redeem_amount, loyalty_discount_amount')
      .eq('payment_status', 'paid')
      .gte('paid_at', `${monthStart}T00:00:00+05:00`)
      .lt('paid_at', `${addSalaryDateDays(businessDate, 1)}T00:00:00+05:00`)),
    supabase
      .from('business_settings')
      .select('monthly_rent_uzs, monthly_utilities_uzs')
      .eq('id', 'default')
      .maybeSingle(),
    supabase
      .from('employee_daily_meal_expenses')
      .select('business_date, average_daily_amount, present_employee_count, total_amount')
      .eq('business_date', businessDate)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, table_id, table_name, order_type, created_at, subtotal, service_fee, total, status, payment_status, items:order_items(menu_item_id, name, quantity, price, unit_price, status, selected_options, notes)')
      .eq('payment_status', 'unpaid')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true }),
  ])
  if (ratesResult.error) throw ratesResult.error
  if (absencesResult.error) throw absencesResult.error
  if (salesResult.error) throw salesResult.error
  if (monthlySalesResult.error) throw monthlySalesResult.error
  if (settingsResult.error) throw settingsResult.error
  if (employeeMealResult.error) throw employeeMealResult.error
  if (openOrdersResult.error) throw openOrdersResult.error
  const openOrders = openOrdersResult.data || []
  const menuIds = [...new Set(openOrders.flatMap(order => (order.items || [])
    .filter(item => item.status !== 'cancelled').map(item => item.menu_item_id)).filter(Boolean))]
  if (menuIds.length > 0) {
    const { data: menuItems, error } = await supabase.from('menu_items')
      .select('id, name_ru, option_groups').in('id', menuIds)
    if (error) throw error
    const menuById = new Map((menuItems || []).map(item => [item.id, item]))
    for (const order of openOrders) {
      order.items = (order.items || []).map(item => ({ ...item, menu_item: menuById.get(item.menu_item_id) }))
    }
  }
  const paidOrdersForMix = (salesResult.data || []).filter(order => order?.status !== 'cancelled')
  const soldMenuIds = [...new Set(paidOrdersForMix.flatMap(order => (order.items || [])
    .filter(item => item.status !== 'cancelled').map(item => item.menu_item_id)).filter(Boolean))]
  const [soldMenuResult, categoriesResult] = await Promise.all([
    soldMenuIds.length > 0
      ? supabase.from('menu_items').select('id, name_ru, name_en, category_id, sale_unit').in('id', soldMenuIds)
      : Promise.resolve(emptyRelatedResult),
    supabase.from('menu_categories').select('id, name_ru, name_en, name_uz'),
  ])
  if (soldMenuResult.error) throw soldMenuResult.error
  if (categoriesResult.error) throw categoriesResult.error
  const salesMix = getDailySalesMix(paidOrdersForMix, {
    menuItems: soldMenuResult.data || [],
    categories: categoriesResult.data || [],
  })
  if (!employeeMealResult.data) throw new Error(`Employee meal expense was not finalized for ${businessDate}`)

  const salaryProfiles = eligibleProfiles.map(profile => ({
    ...profile,
    rates: (ratesResult.data || []).filter(rate => rate.salary_profile_id === profile.id),
    absences: (absencesResult.data || []).filter(absence => absence.salary_profile_id === profile.id),
  }))
  const paidOrders = (salesResult.data || []).filter(order => order?.status !== 'cancelled')
  const monthToDateCafeIncome = (monthlySalesResult.data || [])
    .filter(order => order?.status !== 'cancelled')
    .reduce((total, order) => total + getOrderRevenueTotal(order), 0)
  const cafeIncome = paidOrders.reduce(
    (total, order) => total + getOrderRevenueTotal(order),
    0
  )
  const paymentIncome = paidOrders.reduce((totals, order) => {
    getOrderPayments(order).forEach(payment => {
      if (payment.method === 'cash') totals.cash += payment.amount
      if (payment.method === 'terminal') totals.terminal += payment.amount
    })
    return totals
  }, { cash: 0, terminal: 0 })
  const gameClubIncome = getGameClubRevenue(paidOrders)
  const touristIncome = paidOrders.reduce(
    (total, order) => total + (order?.price_mode === PRICE_MODE_TOURIST && inferOrderType(order) !== 'game_club' ? getOrderRevenueTotal(order) : 0),
    0
  )
  const regularDineInIncome = paidOrders.reduce(
    (total, order) => total + (
      order?.price_mode !== PRICE_MODE_TOURIST && isDineInOrderType(order?.order_type)
        ? getOrderRevenueTotal(order)
        : 0
    ),
    0
  )
  const regularOffPremiseIncome = cafeIncome - touristIncome - regularDineInIncome - gameClubIncome
  const grossProfit = hasOrdersCostCoverage(paidOrders)
    ? cafeIncome - getOrdersCostTotal(paidOrders)
    : null
  const dailyRent = allocateMonthlySalaryToDate(settingsResult.data?.monthly_rent_uzs, businessDate)
  const dailyUtilities = allocateMonthlySalaryToDate(settingsResult.data?.monthly_utilities_uzs, businessDate)
  const summary = getDailyPayrollGroupSummary(salaryProfiles, kpiResults, businessDate, {
    cafeIncome,
    cashIncome: paymentIncome.cash,
    terminalIncome: paymentIncome.terminal,
    monthToDateCafeIncome,
    monthToDateCalendarDayCount: getInclusiveCalendarDayCount(monthStart, businessDate),
    regularDineInIncome,
    regularOffPremiseIncome,
    gameClubIncome,
    touristIncome,
    grossProfit,
    rent: dailyRent,
    utilities: dailyUtilities,
    employeeMealPerEmployee: employeeMealResult.data.average_daily_amount,
    employeeMealPresentEmployeeCount: employeeMealResult.data.present_employee_count,
  })
  return {
    ...summary,
    openOrders,
    salesMix,
  }
}

async function claimDailyPayrollGroupDelivery(supabase, businessDate) {
  const { data: existing, error: existingError } = await supabase
    .from('daily_payroll_group_notification_deliveries')
    .select('*')
    .eq('business_date', businessDate)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.status === 'sent' || existing?.status === 'skipped') return null
  if (existing?.status === 'pending' && !canRetryPending(existing.attempted_at)) return null

  const now = new Date().toISOString()
  if (!existing) {
    const created = await supabase
      .from('daily_payroll_group_notification_deliveries')
      .insert({
        business_date: businessDate,
        target_key: 'salary_events',
        status: 'pending',
        error_message: '',
        attempted_at: now,
        sent_at: null,
        updated_at: now,
      })
      .select('*')
      .single()
    if (created.error?.code === '23505') return null
    if (created.error) throw created.error
    return created.data
  }

  let claim = supabase
    .from('daily_payroll_group_notification_deliveries')
    .update({
      status: 'pending',
      telegram_chat_id: null,
      telegram_message_id: null,
      error_message: '',
      attempted_at: now,
      sent_at: null,
      updated_at: now,
    })
    .eq('business_date', businessDate)
    .eq('status', existing.status)
  if (existing.attempted_at) claim = claim.eq('attempted_at', existing.attempted_at)
  else claim = claim.is('attempted_at', null)
  const claimed = await claim.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data || null
}

async function markDailyPayrollGroupDeliverySent(supabase, businessDate, target, messageId) {
  let lastError = null
  const sentAt = new Date().toISOString()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await supabase
      .from('daily_payroll_group_notification_deliveries')
      .update({
        status: 'sent',
        telegram_chat_id: target.chatId,
        telegram_message_id: messageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('business_date', businessDate)
      .select('business_date')
      .maybeSingle()
    if (!updated.error && updated.data) return
    lastError = updated.error || new Error('Daily payroll group delivery row disappeared')
  }
  throw lastError
}

async function updateInvestorReportDeliveryStatus(
  supabase,
  table,
  dateColumn,
  businessDate,
  status,
  target,
  errorMessage
) {
  const updatedAt = new Date().toISOString()
  const update = await supabase.from(table).update({
    status,
    telegram_chat_id: target?.chatId || null,
    error_message: String(errorMessage || '').slice(0, 1000),
    updated_at: updatedAt,
  }).eq(dateColumn, businessDate)
  if (update.error) throw update.error
}

function isMissingDailyBreakEvenTable(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || /daily_break_even_snapshots/.test(error?.message || '')
}

// Saves the finished day's break-even calculation once (rows are immutable),
// dates its target on that day in the history and, when it is the newest day,
// makes it the current Settings value (migration 263).
export async function recordDailyBreakEven(supabase, businessDate, summary) {
  const row = buildDailyBreakEvenSnapshotRow(summary, businessDate)
  const inserted = await supabase
    .from('daily_break_even_snapshots')
    .upsert(row, { onConflict: 'business_date', ignoreDuplicates: true })
  if (inserted.error) {
    if (isMissingDailyBreakEvenTable(inserted.error)) return { businessDate, status: 'unavailable' }
    throw inserted.error
  }
  const applied = await supabase.rpc('apply_daily_break_even', { p_business_date: businessDate })
  if (applied.error) throw applied.error
  return { businessDate, status: applied.data == null ? 'recorded' : 'applied', breakEven: applied.data ?? null }
}

async function recordDailyBreakEvenSafely(supabase, businessDate, summary) {
  try {
    return await recordDailyBreakEven(supabase, businessDate, summary)
  } catch (error) {
    console.error('[telegram/daily-salary] daily break-even was not recorded:', error)
    return { businessDate, status: 'failed', error: String(error?.message || error).slice(0, 1000) }
  }
}

// The report may already have been sent (or skipped) before this existed:
// calculate the finished day on its own when no row is stored yet.
async function ensureDailyBreakEven(supabase, businessDate) {
  const existing = await supabase
    .from('daily_break_even_snapshots')
    .select('business_date')
    .eq('business_date', businessDate)
    .maybeSingle()
  if (existing.error) {
    if (isMissingDailyBreakEvenTable(existing.error)) return { businessDate, status: 'unavailable' }
    throw existing.error
  }
  if (existing.data) return { businessDate, status: 'exists' }
  const { data: kpiResults, error: kpiResultsError } = await supabase
    .from('employee_daily_kpi_results')
    .select('*')
    .eq('business_date', businessDate)
  if (kpiResultsError) throw kpiResultsError
  const summary = await loadDailyPayrollGroupSummary(supabase, businessDate, kpiResults || [])
  return recordDailyBreakEven(supabase, businessDate, summary)
}

async function sendDailyInvestorReportAlbum(supabase, businessDate, kpiResults) {
  const payrollDelivery = await claimDailyPayrollGroupDelivery(supabase, businessDate)
  // Retain the response field for existing cron consumers; Bazaar reporting is disabled.
  const bazaar = { businessDate: addSalaryDateDays(businessDate, -1), status: 'disabled' }
  if (!payrollDelivery) {
    return { payroll: { businessDate, status: 'duplicate' }, bazaar }
  }

  const target = await loadInvestorGroupTarget(supabase)
  if (!target.chatId) {
    await updateInvestorReportDeliveryStatus(
      supabase, 'daily_payroll_group_notification_deliveries', 'business_date',
      businessDate, 'skipped', target, 'ZarKebab Investor Telegram group is not configured'
    )
    return { payroll: { businessDate, status: 'skipped' }, bazaar }
  }

  let telegramMessageIds = []
  try {
    const payrollModule = await import('./_lib/payrollReportImage.js')
    const operationsModule = await import('./_lib/dailyOperationsReportImages.js')
    const summary = await loadDailyPayrollGroupSummary(supabase, businessDate, kpiResults)
    await recordDailyBreakEvenSafely(supabase, businessDate, summary)
    const photos = [
      {
        kind: 'payroll',
        photo: await payrollModule.buildDailyPayrollGroupReportPng(summary, businessDate),
        filename: `zar-kebab-payroll-${businessDate}.png`,
        caption: payrollModule.buildDailyPayrollGroupReportCaption(businessDate),
      },
      {
        kind: 'openOrders',
        photo: await operationsModule.buildOpenOrdersReportPng(summary.openOrders),
        filename: `zar-kebab-open-orders-${businessDate}.png`,
        caption: '',
      },
      {
        kind: 'salesMix',
        photo: await operationsModule.buildDailySalesMixReportPng(summary.salesMix, businessDate),
        filename: `zar-kebab-sales-mix-${businessDate}.png`,
        caption: '',
      },
    ]
    const response = await sendTelegramMediaGroup(target.chatId, photos)
    telegramMessageIds = getTelegramMediaGroupMessageIds(response, photos.length)
    await markDailyPayrollGroupDeliverySent(supabase, businessDate, target, telegramMessageIds[0])
    return { payroll: { businessDate, status: 'sent', format: 'photo', album: photos.length > 1 }, bazaar }
  } catch (error) {
    if (telegramMessageIds.length === 0) {
      await updateInvestorReportDeliveryStatus(
        supabase, 'daily_payroll_group_notification_deliveries', 'business_date',
        businessDate, 'failed', target, error?.message || error
      )
    } else {
      console.error('[telegram/daily-salary] Investor report album sent but delivery status was not persisted:', error)
    }
    throw error
  }
}

async function markDailySalaryDeliverySent(supabase, deliveryId, telegramMessageId, sentAt) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updated = await supabase
      .from('employee_salary_notification_deliveries')
      .update({
        status: 'sent',
        telegram_message_id: telegramMessageId,
        error_message: '',
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', deliveryId)
      .select('id')
      .maybeSingle()
    if (!updated.error && updated.data) return
    lastError = updated.error || new Error('Daily salary delivery row disappeared')
  }
  throw lastError
}

async function claimDelivery(supabase, salaryProfileId, notificationDate) {
  const { data: existing, error: existingError } = await supabase
    .from('employee_salary_notification_deliveries')
    .select('*')
    .eq('salary_profile_id', salaryProfileId)
    .eq('notification_date', notificationDate)
    .eq('notification_type', 'daily_salary')
    .maybeSingle()
  if (existingError) throw existingError

  if (!existing) {
    const now = new Date().toISOString()
    const created = await supabase
      .from('employee_salary_notification_deliveries')
      .insert({
        salary_profile_id: salaryProfileId,
        notification_date: notificationDate,
        notification_type: 'daily_salary',
        status: 'pending',
        error_message: '',
        attempted_at: now,
        sent_at: null,
        updated_at: now,
      })
      .select('*')
      .single()
    if (created.error?.code === '23505') return null
    if (created.error) throw created.error
    return created.data
  }

  if (existing.status === 'sent') return null
  if (existing.status === 'pending' && !canRetryPending(existing.attempted_at)) return null

  const now = new Date().toISOString()
  let claim = supabase
    .from('employee_salary_notification_deliveries')
    .update({
      status: 'pending',
      telegram_message_id: null,
      error_message: '',
      attempted_at: now,
      sent_at: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('status', existing.status)
  if (existing.attempted_at) {
    claim = claim.eq('attempted_at', existing.attempted_at)
  } else {
    claim = claim.is('attempted_at', null)
  }
  const claimed = await claim.select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data || null
}

// A closed day without a QR check-in becomes an absence before the meal count,
// KPI and salary summaries read it, so every balance drops that day's pay.
export async function recordMissingCheckinAbsences(supabase, businessDate) {
  if (businessDate < MISSING_CHECKIN_ABSENCE_START_DATE) return []
  const { data, error } = await supabase.rpc('record_missing_checkin_absences', {
    p_business_date: businessDate,
  })
  if (error) {
    // Rolling deployment: before migration 269 days keep the old pay rule.
    if (['42883', 'PGRST202'].includes(error.code)) return []
    throw error
  }
  return data || []
}

async function finalizeDailyKpiDate(supabase, businessDate) {
  const { data, error } = await supabase.rpc('generate_daily_kpi_bonuses', {
    p_business_date: businessDate,
  })
  if (error) throw error
  return data || []
}

async function finalizeEmployeeMealDate(supabase, businessDate) {
  const { data, error } = await supabase.rpc('generate_employee_daily_meal_expense', {
    p_business_date: businessDate,
  })
  if (error) throw error
  return data?.[0] || null
}

async function ensureAutomaticKpiDeliveryQueued(supabase, result) {
  const attemptedAt = new Date().toISOString()
  const { error } = await supabase
    .from('employee_salary_group_notification_deliveries')
    .upsert({
      event_type: 'bonus',
      event_id: result.bonus_id,
      salary_profile_id: result.salary_profile_id,
      status: 'skipped',
      error_message: 'Automatic KPI details are sent only to ZarKebab Team',
      attempted_at: attemptedAt,
      employee_status: 'skipped',
      employee_error_message: 'Automatic KPI is included in the combined daily salary summary',
      employee_attempted_at: attemptedAt,
      team_status: 'not_attempted',
      team_error_message: 'Notification request has not started',
      team_attempted_at: attemptedAt,
    }, {
      onConflict: 'event_type,event_id',
      ignoreDuplicates: true,
    })
  if (error) throw error
}

async function deliverAutomaticKpiBonuses(supabase, results) {
  const generatedResults = (results || []).filter(
    result => result.status === 'generated' && result.bonus_id
  )
  const deliveries = []
  for (const result of generatedResults) {
    try {
      // Self-heal a missing database trigger/ledger row before attempting Team
      // delivery. The unique event identity keeps cron retries duplicate-safe.
      await ensureAutomaticKpiDeliveryQueued(supabase, result)
      const delivery = await notifyAutomaticKpiBonus(supabase, result.bonus_id)
      deliveries.push({
        businessDate: result.business_date,
        salaryProfileId: result.salary_profile_id,
        bonusId: result.bonus_id,
        status: delivery.allSent ? 'sent' : delivery.ok ? 'partial' : 'failed',
        delivery,
      })
    } catch (error) {
      deliveries.push({
        businessDate: result.business_date,
        salaryProfileId: result.salary_profile_id,
        bonusId: result.bonus_id,
        status: 'failed',
        error: String(error?.message || error).slice(0, 1000),
      })
    }
  }
  return deliveries
}

async function sendDailySalaryNotifications(supabase, notificationDate) {
  const { data: links, error: linksError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id, chat_id, preferred_language, linked_at')
    .eq('notifications_enabled', true)
    .not('chat_id', 'is', null)
  if (linksError) throw linksError

  const salaryProfiles = await loadSalaryProfiles(
    supabase,
    (links || []).map(link => link.salary_profile_id)
  )
  const results = []

  for (const link of links || []) {
    const linkedDate = getOptionalTashkentDate(link.linked_at)
    if (linkedDate && linkedDate > notificationDate) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'skipped' })
      continue
    }
    const salaryProfile = salaryProfiles.get(link.salary_profile_id)
    if (salaryProfile?.is_active === false || !isEligibleForSalaryDate(salaryProfile, notificationDate)) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'skipped' })
      continue
    }

    const delivery = await claimDelivery(supabase, link.salary_profile_id, notificationDate)
    if (!delivery) {
      results.push({ salaryProfileId: link.salary_profile_id, status: 'duplicate' })
      continue
    }

    let telegramMessageId = ''
    try {
      const response = await sendTelegramPhoto(
        link.chat_id,
        await renderEmployeePayrollImage(salaryProfile, notificationDate),
        { filename: 'daily-salary.png' }
      )
      telegramMessageId = getTelegramMessageId(response)
      const sentAt = new Date().toISOString()
      await markDailySalaryDeliverySent(
        supabase,
        delivery.id,
        telegramMessageId,
        sentAt
      )
      const lastNotifiedUpdate = await supabase
        .from('employee_salary_telegram_links')
        .update({
          last_notified_at: sentAt,
          updated_at: sentAt,
        })
        .eq('salary_profile_id', link.salary_profile_id)
      if (lastNotifiedUpdate.error) {
        console.warn('[telegram/daily-salary] could not update last_notified_at:', lastNotifiedUpdate.error)
      }
      results.push({ salaryProfileId: link.salary_profile_id, status: 'sent' })
    } catch (error) {
      if (!telegramMessageId) {
        await supabase.from('employee_salary_notification_deliveries').update({
          status: 'failed',
          error_message: String(error?.message || error).slice(0, 1000),
          updated_at: new Date().toISOString(),
        }).eq('id', delivery.id)
      } else {
        console.error('[telegram/daily-salary] message sent but delivery status was not persisted:', error)
      }
      results.push({ salaryProfileId: link.salary_profile_id, status: 'failed' })
    }
  }

  return results
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST'])

  const now = new Date()
  const notificationDate = getCompletedTashkentDate(now)
  let cronAuthorized = false
  let cronTask = ''
  let supabase = null
  try {
    requireCronSecret(req)
    cronAuthorized = true
    cronTask = getCronTask(req)
    supabase = getSupabaseAdmin({ retryReportReads: true })
    if (cronTask === 'employee-order-kpi') {
      return json(res, 200, await drainEmployeeOrderKpiNotifications(supabase))
    }
    if (cronTask === 'order-status-cleanup') {
      return json(res, 200, await retractDeletedOrderStatusMessages(supabase))
    }
    if (cronTask === 'ingredient-events') {
      return json(res, 200, await drainIngredientNotifications(supabase))
    }
    if (cronTask === 'game-club-orders') {
      return json(res, 200, await drainGameClubNotifications(supabase))
    }
    if (cronTask === 'investor-report') {
      const { data: kpiResults, error: kpiResultsError } = await supabase
        .from('employee_daily_kpi_results')
        .select('*')
        .eq('business_date', notificationDate)
      if (kpiResultsError) throw kpiResultsError
      const result = await sendDailyInvestorReportAlbum(
        supabase,
        notificationDate,
        kpiResults || []
      )
      return json(res, 200, { ok: true, notificationDate, result })
    }
    if (cronTask === 'break-even') {
      return json(res, 200, { ok: true, notificationDate, breakEven: await ensureDailyBreakEven(supabase, notificationDate) })
    }
    if (cronTask === 'unavailable-products') {
      const businessDate = getTashkentDate(now)
      const [watchdogRun, unavailableRun] = await Promise.allSettled([
        verifyDailySalaryCronDelivery(supabase, notificationDate),
        sendDailyUnavailableMenuNotification(supabase, businessDate),
      ])
      // After the watchdog, so a recovered report records the day itself.
      const breakEvenRun = await ensureDailyBreakEven(supabase, notificationDate)
        .catch(error => ({ businessDate: notificationDate, status: 'failed', error: String(error?.message || error).slice(0, 1000) }))
      if (watchdogRun.status === 'rejected') throw watchdogRun.reason
      if (unavailableRun.status === 'rejected') throw unavailableRun.reason
      return json(res, 200, {
        ok: true,
        ...unavailableRun.value,
        dailySalaryWatchdog: watchdogRun.value,
        dailyBreakEven: breakEvenRun,
      })
    }
    const catchUpDates = await loadKpiCatchUpDates(supabase, now)
    const kpiRuns = []
    const kpiDeliveries = []
    const kpiResultsByDate = new Map()
    let kpiUnavailable = false

    for (const businessDate of catchUpDates) {
      try {
        await recordMissingCheckinAbsences(supabase, businessDate)
        await finalizeEmployeeMealDate(supabase, businessDate)
        const results = await finalizeDailyKpiDate(supabase, businessDate)
        kpiResultsByDate.set(businessDate, results)
        const deliveries = await deliverAutomaticKpiBonuses(supabase, results)
        kpiRuns.push({
          businessDate,
          resultCount: results.length,
          generatedCount: results.filter(result => result.status === 'generated').length,
          status: 'completed',
        })
        kpiDeliveries.push(...deliveries)
      } catch (error) {
        if (isMissingDailyKpiMigration(error)) {
          kpiUnavailable = true
          kpiRuns.push({
            businessDate,
            status: 'unavailable',
            error: 'Run migrations/129_daily_kpi_bonuses.sql and migrations/147_financial_report_history_snapshots.sql',
          })
          break
        }
        kpiRuns.push({
          businessDate,
          status: 'failed',
          error: String(error?.message || error).slice(0, 1000),
        })
      }
    }

    const notificationKpiRun = kpiRuns.find(run => run.businessDate === notificationDate)
    const kpiFinalizationFailed = notificationKpiRun?.status !== 'completed'
    const summaryRetryDates = new Set(getCompletedTashkentDates(now, KPI_RETRY_LOOKBACK_DAYS))
    const dailySummaryRuns = []
    const dailyBazaarRuns = []
    const dailyIngredientConsumptionRuns = []
    const dailyPayrollGroupRuns = []

    for (const kpiRun of kpiRuns) {
      if (kpiRun.status !== 'completed') continue
      if (!summaryRetryDates.has(kpiRun.businessDate)) {
        dailySummaryRuns.push({
          businessDate: kpiRun.businessDate,
          status: 'skipped_outside_delivery_window',
          sentCount: 0,
          failedCount: 0,
        })
        continue
      }
      try {
        const summaryResults = await sendDailySalaryNotifications(
          supabase,
          kpiRun.businessDate
        )
        const failedCount = summaryResults.filter(result => result.status === 'failed').length
        let payrollGroupResult
        let bazaarResult
        try {
          const investorReports = await sendDailyInvestorReportAlbum(
            supabase,
            kpiRun.businessDate,
            kpiResultsByDate.get(kpiRun.businessDate) || []
          )
          payrollGroupResult = investorReports.payroll
          bazaarResult = investorReports.bazaar
        } catch (error) {
          payrollGroupResult = {
            businessDate: kpiRun.businessDate,
            status: 'failed',
            error: String(error?.message || error).slice(0, 1000),
          }
          bazaarResult = { businessDate: addSalaryDateDays(kpiRun.businessDate, -1), status: 'disabled' }
        }
        dailyPayrollGroupRuns.push(payrollGroupResult)
        dailyBazaarRuns.push(bazaarResult)
        const ingredientConsumptionResult = { businessDate: kpiRun.businessDate, status: 'disabled' }
        dailyIngredientConsumptionRuns.push(ingredientConsumptionResult)
        dailySummaryRuns.push({
          businessDate: kpiRun.businessDate,
          status: failedCount > 0
            ? 'partial'
            : payrollGroupResult.status === 'failed'
              ? 'partial'
              : 'completed',
          sentCount: summaryResults.filter(result => result.status === 'sent').length,
          failedCount,
          payrollGroupStatus: payrollGroupResult.status,
          bazaarStatus: bazaarResult.status,
          ingredientConsumptionStatus: ingredientConsumptionResult.status,
          results: summaryResults,
        })
      } catch (error) {
        dailyPayrollGroupRuns.push({
          businessDate: kpiRun.businessDate,
          status: 'deferred',
          error: 'Daily payroll group notification could not be prepared',
        })
        dailyBazaarRuns.push({ businessDate: kpiRun.businessDate, status: 'disabled' })
        dailyIngredientConsumptionRuns.push({ businessDate: kpiRun.businessDate, status: 'disabled' })
        dailySummaryRuns.push({
          businessDate: kpiRun.businessDate,
          status: 'failed',
          error: String(error?.message || error).slice(0, 1000),
          results: [],
        })
      }
    }

    // The unavailable-dishes snapshot goes out with the other morning reports.
    // It is claimed once per Tashkent date, so the 08:00 task only retries a
    // failed send; its own failure never defers the salary summary.
    let dailyUnavailableMenu
    try {
      dailyUnavailableMenu = await sendDailyUnavailableMenuNotification(supabase, getTashkentDate(now))
    } catch (error) {
      dailyUnavailableMenu = { status: 'failed', error: String(error?.message || error).slice(0, 1000) }
    }

    const notificationSummaryRun = dailySummaryRuns.find(
      run => run.businessDate === notificationDate
    )
    const dailySummaryFailed = !kpiFinalizationFailed
      && notificationSummaryRun?.status !== 'completed'
    const requestFailed = kpiFinalizationFailed || dailySummaryFailed

    // Never permanently claim a salary summary that is missing its KPI bonus.
    // Missing migrations, schema-cache misses, and operational failures all
    // return 500 and leave delivery unclaimed for a complete retry.
    const results = notificationSummaryRun?.results || []
    const responseStatus = requestFailed ? 500 : 200
    const responseError = kpiFinalizationFailed
      ? 'Daily salary summary deferred because KPI finalization failed'
      : 'Daily salary summary delivery could not be prepared'

    if (requestFailed) {
      const failureDetail = notificationKpiRun?.error
        || notificationSummaryRun?.error
        || responseError
      await notifyDailySalaryCronFailure(supabase, notificationDate, failureDetail)
    }

    return json(res, responseStatus, {
      ok: !requestFailed,
      notificationDate,
      dailySummaryStatus: kpiFinalizationFailed
        ? 'deferred'
        : notificationSummaryRun?.status || 'deferred',
      catchUpDates,
      kpiUnavailable,
      kpiRuns,
      dailySummaryRuns,
      dailyUnavailableMenu,
      dailyPayrollGroupRuns,
      dailyPayrollGroupSentCount: dailyPayrollGroupRuns.filter(result => result.status === 'sent').length,
      dailyPayrollGroupFailedCount: dailyPayrollGroupRuns.filter(result => result.status === 'failed').length,
      dailyBazaarRuns,
      dailyBazaarSentCount: dailyBazaarRuns.filter(result => result.status === 'sent').length,
      dailyBazaarFailedCount: dailyBazaarRuns.filter(result => result.status === 'failed').length,
      dailyIngredientConsumptionRuns,
      dailyIngredientConsumptionSentCount: dailyIngredientConsumptionRuns.filter(result => result.status === 'sent').length,
      dailyIngredientConsumptionFailedCount: dailyIngredientConsumptionRuns.filter(result => result.status === 'failed').length,
      kpiDeliverySentCount: kpiDeliveries.filter(result => result.status === 'sent').length,
      kpiDeliveryPartialCount: kpiDeliveries.filter(result => result.status === 'partial').length,
      kpiDeliveryFailedCount: kpiDeliveries.filter(result => result.status === 'failed').length,
      kpiDeliveries,
      sentCount: results.filter(result => result.status === 'sent').length,
      failedCount: results.filter(result => result.status === 'failed').length,
      results,
      ...(requestFailed
        ? { error: responseError }
        : {}),
    })
  } catch (error) {
    console.error('[telegram/daily-salary]', error)
    if (cronTask === 'employee-order-kpi') {
      return json(res, error?.status || 500, { error: error.message || 'Employee order notifications failed' })
    }
    if (cronTask === 'order-status-cleanup') {
      return json(res, error?.status || 500, { error: error.message || 'Order status cleanup failed' })
    }
    if (cronTask === 'ingredient-events') {
      return json(res, error?.status || 500, { error: error.message || 'Ingredient notifications failed' })
    }
    if (cronTask === 'game-club-orders') {
      return json(res, error?.status || 500, { error: error.message || 'Game Club notifications failed' })
    }
    if (cronAuthorized) {
      if (cronTask === 'unavailable-products') {
        await notifySecondaryCronFailure(supabase, getTashkentDate(now), error)
      } else {
        await notifyDailySalaryCronFailure(supabase, notificationDate, error)
      }
    }
    return json(res, error?.status || 500, {
      error: error.message || 'Could not finalize KPI bonuses and send salary notifications',
    })
  }
}

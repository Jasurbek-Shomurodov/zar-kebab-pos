import { migrationFiles, migrationStatus, migrationHealthIssues } from './migrationTools.js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout))
    },
  },
})

function classifyError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  if (error?.name === 'AbortError' || text.includes('fetch failed') || text.includes('aborted')) return 'network'
  if (text.includes('permission denied') || text.includes('42501')) return 'permission'
  if (text.includes('does not exist') || text.includes('schema cache') || text.includes('42p01') || text.includes('42703')) return 'missing'
  if (text.includes('function') && text.includes('not found')) return 'missing'
  return 'error'
}

function missingColumnMessage(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  const schemaCacheMatch = message.match(/["']([a-z0-9_]+)["']\s+column/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]
  const qualifiedMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)/i)
  if (qualifiedMatch?.[1]) return qualifiedMatch[1]
  const match = message.match(/column ["']?([a-z0-9_]+)["']?/i)
  return match?.[1] || null
}

function makeCheck(name, ok, detail, required = true) {
  return { name, ok, detail, required }
}

async function checkTable(name, select, required = true) {
  let error = null
  try {
    ;({ error } = await supabase
      .from(name)
      .select(select)
      .limit(1))
  } catch (err) {
    error = err
  }

  if (!error) {
    return makeCheck(name, true, `table/columns OK: ${select}`, required)
  }

  const kind = classifyError(error)
  const ok = kind === 'permission' && !process.env.SUPABASE_SERVICE_ROLE_KEY
  const hint = ok
    ? 'permission denied with anon key; rerun with SUPABASE_SERVICE_ROLE_KEY for a stronger check'
    : kind === 'network'
      ? `network/request failed: ${error.message}`
      : missingColumnMessage(error)
        ? `missing column: ${missingColumnMessage(error)}`
        : `${error.code || 'ERROR'} ${error.message}`
  return makeCheck(name, ok, hint, required)
}

async function checkRpc(name, invoke, expectedError, required = true) {
  let error = null
  try {
    ;({ error } = await invoke())
  } catch (err) {
    error = err
  }
  if (!error) {
    return makeCheck(name, true, 'RPC callable', required)
  }

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (expectedError && message.includes(expectedError)) {
    return makeCheck(name, true, `RPC exists; validation returned "${error.message}"`, required)
  }

  const kind = classifyError(error)
  return makeCheck(
    name,
    false,
    kind === 'network' ? `network/request failed: ${error.message}` : `${error.code || 'ERROR'} ${error.message}`,
    required
  )
}

const checks = await Promise.all([
  checkTable('ingredient_investor_notifications', 'id, product_key, event_type, snapshot, status, chat_id, telegram_message_ids, error_message, attempted_at, sent_at, created_at'),
  checkTable('app_schema_migrations', 'filename, sha256, applied_at'),
  checkTable('profiles', 'id, role, status, full_name, email, feature_access'),
  checkTable('employee_salary_profiles', 'id, profile_id, employee_name, joined_at, ended_at, deleted_at, pay_schedule, payment_method, is_active', false),
  checkTable('employee_salary_rates', 'id, salary_profile_id, effective_from, amount, rate_unit', false),
  checkTable('employee_salary_payments', 'id, salary_profile_id, paid_date, amount, payment_method', false),
  checkTable('employee_salary_bonuses', 'id, salary_profile_id, bonus_date, amount, payment_method, source_type, source_metadata, accrues_to_salary', false),
  checkTable('employee_kpi_rules', 'id, salary_profile_id, effective_from, rate_bps, is_enabled, sales_basis, start_time, last_change_event_id', false),
  checkTable('employee_kpi_rule_change_events', 'id, rule_id, salary_profile_id, employee_name_snapshot, change_kind, effective_from, previous_rate_bps, previous_is_enabled, new_rate_bps, new_is_enabled, previous_start_time, new_start_time, created_by, created_by_name, created_at', false),
  checkTable('employee_daily_kpi_runs', 'business_date, sales_base_amount, completed_at', false),
  checkTable('employee_daily_kpi_results', 'id, business_date, salary_profile_id, rule_id, sales_base_amount, rate_bps, bonus_amount, payment_method, status, bonus_id, start_time_snapshot', false),
  checkTable('employee_daily_meal_expenses', 'business_date, average_daily_amount, present_employee_count, total_amount, source_type, finalized_at'),
  checkTable('dashboard_monthly_income_snapshots', 'month_start, total_income, day_count, average_daily_income, order_count, source_type, finalized_at'),
  checkTable('employee_salary_fines', 'id, salary_profile_id, fine_date, amount, reason, created_by_name', false),
  checkTable('employee_salary_absences', 'id, salary_profile_id, absence_date', false),
  checkTable('employee_salary_telegram_links', 'salary_profile_id, telegram_user_id, chat_id, preferred_language, notifications_enabled, linked_at', false),
  checkTable('employee_salary_notification_deliveries', 'id, salary_profile_id, notification_date, notification_type, status, sent_at', false),
  checkTable('employee_salary_payment_notification_deliveries', 'id, payment_id, salary_profile_id, status, employee_chat_id, telegram_message_id, error_message, attempted_at, sent_at, confirmed_at, group_status, group_chat_id, group_telegram_message_id, group_error_message, group_attempted_at, group_sent_at', false),
  checkTable('telegram_notification_targets', 'target_key, chat_id, language, is_enabled, updated_at', false),
  checkTable('employee_salary_group_notification_deliveries', 'id, event_type, event_id, salary_profile_id, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, employee_status, employee_chat_id, employee_telegram_message_id, employee_error_message, employee_attempted_at, employee_sent_at, team_status, team_chat_id, team_telegram_message_id, team_error_message, team_attempted_at, team_sent_at', false),
  checkTable('accounting_record_audit', 'id, entity_type, entity_id, action, old_record, new_record, changed_by, changed_at', false),
  checkTable('restaurant_tables', 'id, name, status, zone_id, zone_name, capacity, sort_order, is_active, reserved_for_name, reserved_for_phone, reserved_at, reserved_until, reservation_notes, created_at, updated_at'),
  checkTable('table_zones', 'id, name, sort_order, is_active, created_at, updated_at'),
  checkTable('menu_categories', 'id, name_uz, name_ru, name_en, hidden, waiter_hidden, tourist_hidden, visible_from_time, visible_until_time, sort_order, deleted_at'),
  checkTable('menu_category_user_schedule_overrides', 'category_id, profile_id, created_by, created_at'),
  checkTable('menu_items', 'id, category_id, name_uz, name_ru, name_en, price, sale_unit, image_url, media_urls, available, cashier_only, public_hidden, waiter_hidden, visible_from_time, visible_until_time, sort_order, stock_count, option_groups, estimated_prep_minutes, deleted_at'),
  checkTable('menu_item_unavailable_notification_deliveries', 'id, menu_item_id, menu_item_name, actor_id, actor_name, availability_event, variant_changes, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('daily_unavailable_menu_notification_deliveries', 'business_date, target_key, item_count, item_ids, item_names, item_categories, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('menu_item_costs', 'menu_item_id, cost_price, variant_costs, cost_source, updated_at'),
  checkTable('menu_item_tech_cards', 'menu_item_id, portion_count, batch_output_quantity, batch_output_unit, preparation_steps, notes, updated_by, created_at, updated_at'),
  checkTable('menu_item_tech_card_ingredients', 'id, menu_item_id, name, quantity, unit, unit_price_uzs, sort_order, created_at, updated_at'),
  checkTable('menu_item_tech_card_components', 'id, menu_item_id, component_menu_item_id, selected_options, quantity, sort_order, created_at, updated_at'),
  checkTable('orders', 'id, table_id, table_name, status, payment_status, service_rate_pct, order_type, order_number, loyalty_card_number, loyalty_used_amount, cashback_earned, stock_deducted_at'),
  checkTable('order_items', 'id, order_id, menu_item_id, status, quantity, sale_unit, order_type, kitchen_round_id, submitted_at, item_type, is_counter_item, selected_options, cost_price, category_id_snapshot, category_snapshot_captured, tech_card_component_snapshot'),
  checkTable('order_item_tech_card_ingredient_snapshots', 'order_item_id, ingredients, is_complete, captured_at'),
  checkTable('order_kitchen_rounds', 'order_id, kitchen_round_id, item_ids, table_id, submitted_by, submitted_at, created_at'),
  checkTable('business_settings', 'id, restaurant_name, service_rate_pct, tourist_service_rate_pct, monthly_rent_uzs, monthly_utilities_uzs, average_daily_employee_meal_uzs, average_daily_break_even_income_uzs, receipt_footer, auto_print, auto_print_kitchen_check'),
  checkTable('order_payments', 'id, order_id, method, amount'),
  checkTable('loyalty_cards', 'id, card_number, public_token, customer_name, phone_number, cashback_type, balance, total_earned, total_redeemed, is_active, created_at, updated_at'),
  checkTable('loyalty_transactions', 'id, loyalty_card_id, order_id, type, amount, balance_before, balance_after, reason, created_by, cashback_percent_used, card_type_at_transaction, card_number_at_transaction, customer_name_at_transaction, phone_number_at_transaction, created_at'),
  checkTable('expenses', 'id, entry_type, expense_date, category, payment_method, amount, vendor, description, created_by, created_by_name, created_at, updated_at', false),
  checkTable('expense_investor_notification_deliveries', 'expense_id, target_key, expense_date, category, payment_method, amount, vendor, description, actor_id, actor_name, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('order_change_investor_notification_deliveries', 'id, event_type, order_id, transaction_id, order_number, table_name, total, old_payment_methods, new_payment_methods, actor_id, actor_name, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('employee_lifecycle_investor_notification_deliveries', 'id, event_type, salary_profile_id, employee_name, effective_date, actor_id, actor_name, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('salary_absence_undo_notification_deliveries', 'audit_id, absence_id, salary_profile_id, absence_date, employee_name, actor_id, actor_name, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, created_at, updated_at'),
  checkTable('bazaar_purchases', 'id, request_key, expense_id, purchase_date, payment_method, buyer_profile_id, buyer_name, notes, total_amount, entry_source, created_by, created_by_name, created_at, updated_at'),
  checkTable('bazaar_purchase_items', 'id, purchase_id, product_name, product_key, category, quantity, unit, line_total, normal_unit_price, normal_line_total, price_difference, sort_order, notes, created_at'),
  checkTable('bazaar_product_catalog', 'product_key, product_name, category, unit, last_purchase_date, created_at, updated_at'),
  checkTable('bazaar_purchase_audit', 'id, purchase_id, action, old_snapshot, new_snapshot, changed_by, changed_by_name, changed_at'),
  checkTable('daily_bazaar_telegram_deliveries', 'purchase_date, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, updated_at'),
  checkTable('daily_payroll_group_notification_deliveries', 'business_date, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, updated_at'),
  checkTable('daily_ingredient_consumption_deliveries', 'business_date, target_key, status, telegram_chat_id, telegram_message_id, error_message, attempted_at, sent_at, updated_at'),
  checkRpc(
    'get_public_menu_data()',
    () => supabase.rpc('get_public_menu_data'),
    null,
    false
  ),
  checkRpc(
    'submit_order_to_kitchen(payload)',
    () => supabase.rpc('submit_order_to_kitchen', { payload: {} }),
    'order id is required'
  ),
  checkRpc(
    'kitchen_round_receipts_version()',
    () => supabase.rpc('kitchen_round_receipts_version'),
    null
  ),
  checkRpc(
    'create_menu_item_with_cost(payload)',
    () => supabase.rpc('create_menu_item_with_cost', { payload: {} }),
    'menu write access is required'
  ),
  checkRpc(
    'create_menu_item_with_media_and_cost(payload)',
    () => supabase.rpc('create_menu_item_with_media_and_cost', { payload: {} }),
    'menu write access is required'
  ),
  checkRpc(
    'save_menu_item_tech_card(payload)',
    () => supabase.rpc('save_menu_item_tech_card', { payload: {} }),
    'manage menu and tech cards access are required'
  ),
  checkRpc(
    'update_bill_item_quantity(payload)',
    () => supabase.rpc('update_bill_item_quantity', { payload: {} }),
    'bill edit permission required'
  ),
  checkRpc(
    'settle_orders_payment(payload)',
    () => supabase.rpc('settle_orders_payment', { payload: {} }),
    'cashier write access is required'
  ),
  checkRpc(
    'change_paid_order_payment_methods_owner(p_changes)',
    () => supabase.rpc('change_paid_order_payment_methods_owner', { p_changes: [] }),
    'delete completed orders access is required'
  ),
  checkRpc(
    'recall_table_from_cashier(p_table_id)',
    () => supabase.rpc('recall_table_from_cashier', { p_table_id: '__db_health_check__' }),
    'cashier access is required'
  ),
  checkRpc(
    'current_staff_can_view_menu_catalog()',
    () => supabase.rpc('current_staff_can_view_menu_catalog'),
    null
  ),
  checkRpc(
    'current_staff_can_access(feature_key)',
    () => supabase.rpc('current_staff_can_access', { feature_key: 'bazaar' }),
    null
  ),
  checkRpc(
    'current_staff_can_write(feature_key)',
    () => supabase.rpc('current_staff_can_write', { feature_key: 'bazaar' }),
    null
  ),
  checkRpc(
    'save_bazaar_purchase(payload)',
    () => supabase.rpc('save_bazaar_purchase', { payload: {} }),
    'bazaar write access is required'
  ),
  checkRpc(
    'delete_bazaar_purchase(p_purchase_id)',
    () => supabase.rpc('delete_bazaar_purchase', { p_purchase_id: '00000000-0000-0000-0000-000000000000' }),
    'bazaar write access is required'
  ),
  checkRpc(
    'get_accounting_paid_order_summary(p_date_from,p_date_to)',
    () => supabase.rpc('get_accounting_paid_order_summary', {
      p_date_from: '2000-01-01',
      p_date_to: '2000-01-01',
    }),
    'accounting access is required'
  ),
  checkRpc(
    'generate_daily_kpi_bonuses(p_business_date)',
    () => supabase.rpc('generate_daily_kpi_bonuses', { p_business_date: null }),
    'business date is required',
    false
  ),
  checkRpc(
    'generate_employee_daily_meal_expense(p_business_date)',
    () => supabase.rpc('generate_employee_daily_meal_expense', { p_business_date: null }),
    'business date is required'
  ),
  checkRpc(
    'get_pending_daily_kpi_dates(p_limit)',
    () => supabase.rpc('get_pending_daily_kpi_dates', { p_limit: 1 })
  ),
  checkRpc(
    'get_pending_employee_meal_dates(p_limit)',
    () => supabase.rpc('get_pending_employee_meal_dates', { p_limit: 1 })
  ),
  checkRpc(
    'get_dashboard_monthly_average_income(p_month_count)',
    () => supabase.rpc('get_dashboard_monthly_average_income', { p_month_count: 1 }),
    'dashboard access is required'
  ),
  checkRpc(
    'remove_loyalty_card(p_card_id)',
    () => supabase.rpc('remove_loyalty_card', { p_card_id: '00000000-0000-0000-0000-000000000000' }),
    'only owner can remove loyalty cards',
    false
  ),
])

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { data: catalog, error: catalogError } = await supabase.rpc('get_database_migration_health')
  const issues = catalogError ? [catalogError.message] : migrationHealthIssues(catalog || {})
  checks.push(makeCheck('migration definitions, triggers and schedules', !issues.length,
    issues.length ? issues.join('; ') : 'Recent function bodies and required triggers/cron match repository'))
  const { data: receipts, error: receiptError } = await supabase.from('app_schema_migrations').select('filename,sha256')
  if (!receiptError) {
    const statuses = migrationStatus(migrationFiles(), receipts || [])
    const failures = statuses.filter(row => ['CHANGED', 'PENDING', 'MISSING_FILE'].includes(row.status))
    checks.push(makeCheck('migration receipts', !failures.length,
      failures.length ? failures.map(row => `${row.status}: ${row.filename}`).join('; ')
        : 'Tracked checksums match; legacy-untracked files are not assumed applied'))
  }
} else {
  checks.push(makeCheck('migration definitions and receipts', false,
    'Set SUPABASE_SERVICE_ROLE_KEY to verify function drift and protected migration receipts', false))
}

const failedRequired = checks.filter(check => check.required && !check.ok)
const failedOptional = checks.filter(check => !check.required && !check.ok)

console.log('\nSupabase health check\n')
for (const check of checks) {
  const marker = check.ok ? 'OK ' : check.required ? 'FAIL' : 'WARN'
  console.log(`${marker} ${check.name}`)
  console.log(`     ${check.detail}`)
}

if (failedOptional.length > 0) {
  console.log('\nOptional warnings:')
  for (const check of failedOptional) console.log(`- ${check.name}: ${check.detail}`)
}

if (failedRequired.length > 0) {
  const networkFailures = failedRequired.filter(check => check.detail.includes('network/request failed')).length
  if (networkFailures === failedRequired.length) {
    console.log('\nRequired checks failed because Supabase could not be reached. Check network access and Supabase env values, then rerun this script.')
  } else {
    console.log('\nRequired checks failed. Inspect the failures and migration status; apply only reviewed missing repairs. Do not replay legacy migrations blindly.')
  }
  process.exit(1)
}

console.log('\nAll required Supabase checks passed.')

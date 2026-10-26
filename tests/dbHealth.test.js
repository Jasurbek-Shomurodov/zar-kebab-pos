import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'
import migrationManifest from '../src/generated/migrationManifest.js'

const cliHealthSource = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

// Live catalog that matches the committed migration manifest exactly.
function healthyMigrationCatalog() {
  return {
    functions: migrationManifest.functions.map(({ name, md5 }) => ({ name, md5 })),
    triggers: [
      ['menu_item_tech_cards', 'tech_cards_mark_costs_dirty'],
      ['menu_item_tech_card_ingredients', 'tech_card_ingredients_mark_costs_dirty'],
      ['menu_item_tech_card_components', 'tech_card_components_mark_costs_dirty'],
      ['bazaar_product_catalog', 'queue_ingredient_investor_notification'],
      ['game_club_team_notifications', 'kick_game_club_team_queue'],
      ['ingredient_investor_notifications', 'kick_ingredient_investor_queue'],
      ['order_status_telegram_messages', 'kick_order_status_cleanup_insert'],
      ['order_status_telegram_messages', 'kick_order_status_cleanup_update'],
      ['employee_order_kpi_notifications', 'kick_employee_order_kpi_insert'],
      ['employee_order_kpi_notifications', 'kick_employee_order_kpi_update'],
    ].map(([table, name]) => ({ table, name, enabled: 'O' })),
    jobs: [{ name: 'zar-kebab-queue-sweep', active: true, schedule: '*/15 * * * *' }],
    receipts: migrationManifest.files.filter(file => Number(file.filename.slice(0, 3)) >= 199),
  }
}

function makeClient({ missingTable = null, missingColumnTable = null, missingColumn = null, missingRpc = false, permissionDeniedTables = [], migrationHealth = () => ({ data: healthyMigrationCatalog(), error: null }) } = {}) {
  return {
    from(name) {
      return {
        select(columns) {
          return {
            limit() {
              if (name === missingTable) {
                return Promise.resolve({ error: { message: `relation "${name}" does not exist` } })
              }
              if (name === missingColumnTable && columns?.includes(missingColumn)) {
                return Promise.resolve({
                  error: {
                    message: `column ${name}.${missingColumn} does not exist`,
                  },
                })
              }
              if (permissionDeniedTables.includes(name)) {
                return Promise.resolve({
                  error: {
                    code: '42501',
                    message: `permission denied for table ${name}`,
                  },
                })
              }
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
    rpc(name) {
      if (missingRpc) {
        return Promise.resolve({ error: { message: `Could not find the function public.${name}` } })
      }
      if (name === 'get_app_migration_health') return Promise.resolve(migrationHealth())
      return Promise.resolve({ error: { message: 'order id is required' } })
    },
  }
}

test('database health passes when tables exist and RPC responds with a validation error', async () => {
  const result = await runDbHealthChecks(makeClient())
  assert.equal(result.ok, true)
  assert.equal(result.failed.length, 0)
  assert.equal(result.checks.some(check => check.name === 'submit_order_to_kitchen' && check.ok), true)
  assert.equal(result.checks.some(check => check.name === 'kitchen_round_receipts_version' && check.ok), true)
  assert.equal(result.checks.find(check => check.name === 'restaurant_tables').messageKey, 'ok')
  assert.equal(result.checks.find(check => check.name === 'submit_order_to_kitchen').messageKey, 'available')
})

test('browser health treats expected service-only delivery tables as protected and healthy', async () => {
  const result = await runDbHealthChecks(makeClient({
    permissionDeniedTables: [
      'daily_bazaar_telegram_deliveries',
      'daily_payroll_group_notification_deliveries',
    ],
  }))

  assert.equal(result.ok, true)
  assert.equal(
    result.checks.find(check => check.name === 'daily_bazaar_telegram_deliveries').messageKey,
    'protected'
  )
  assert.equal(
    result.checks.find(check => check.name === 'daily_payroll_group_notification_deliveries').messageKey,
    'protected'
  )
})

test('browser health still reports unexpected permission failures', async () => {
  const result = await runDbHealthChecks(makeClient({
    permissionDeniedTables: ['orders'],
  }))

  assert.equal(result.ok, false)
  assert.equal(result.failed.find(check => check.name === 'orders').messageKey, 'rawError')
})

test('database health reports the actual missing schema-cache column', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'loyalty_cards',
    missingColumn: 'cashback_type',
  }))

  const failed = result.failed.find(check => check.name === 'loyalty_cards')
  assert.equal(result.ok, false)
  assert.equal(failed.messageKey, 'missingColumn')
  assert.equal(failed.detail, 'cashback_type')
})

test('database health catches a profiles table missing feature access', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'profiles',
    missingColumn: 'feature_access',
  }))

  const failed = result.failed.find(check => check.name === 'profiles')
  assert.equal(result.ok, false)
  assert.equal(failed.detail, 'feature_access')
  assert.match(failed.hint, /097_daily_bazaar/)
})

test('database health requires private menu costs and order cost snapshots', async () => {
  const missingCosts = await runDbHealthChecks(makeClient({ missingTable: 'menu_item_costs' }))
  assert.equal(missingCosts.ok, false)
  assert.match(missingCosts.failed.find(check => check.name === 'menu_item_costs').hint, /098_menu_item_costs_and_profit/)
  assert.match(missingCosts.failed.find(check => check.name === 'menu_item_costs').hint, /100_menu_variant_costs_and_accounting_profit/)
  assert.match(missingCosts.failed.find(check => check.name === 'menu_item_costs').hint, /155_tech_card_real_costs/)

  const missingSnapshot = await runDbHealthChecks(makeClient({
    missingColumnTable: 'order_items',
    missingColumn: 'cost_price',
  }))
  assert.equal(missingSnapshot.ok, false)
  assert.equal(missingSnapshot.failed.find(check => check.name === 'order_items').detail, 'cost_price')
})

test('database health requires the tech-card cost source marker', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'menu_item_costs',
    missingColumn: 'cost_source',
  }))

  assert.equal(result.ok, false)
  assert.equal(result.failed.find(check => check.name === 'menu_item_costs').detail, 'cost_source')
  assert.match(cliHealthSource, /menu_item_costs', 'menu_item_id, cost_price, variant_costs, cost_source, updated_at'/)
})

test('database health requires durable kitchen-round retry receipts', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_kitchen_rounds' }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'order_kitchen_rounds').hint,
    /128_durable_kitchen_round_receipts/
  )
  assert.match(cliHealthSource, /checkTable\('order_kitchen_rounds'/)
  assert.match(cliHealthSource, /kitchen_round_receipts_version\(\)/)
})

test('database health requires the employee salary fines migration', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'employee_salary_fines' }))

  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'employee_salary_fines').hint, /099_employee_salary_fines/)
  assert.match(cliHealthSource, /checkTable\('employee_salary_fines'/)
})

test('database health requires auditable salary payment notifications', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingTable: 'employee_salary_payment_notification_deliveries',
  }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'employee_salary_payment_notification_deliveries').hint,
    /108_employee_salary_payment_notification_deliveries/
  )
  assert.match(
    result.failed.find(check => check.name === 'employee_salary_payment_notification_deliveries').hint,
    /110_salary_payment_group_notifications/
  )
  assert.match(cliHealthSource, /checkTable\('employee_salary_payment_notification_deliveries'/)
})

test('database health requires duplicate-safe Daily Bazaar Telegram delivery tracking', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingTable: 'daily_bazaar_telegram_deliveries',
  }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'daily_bazaar_telegram_deliveries').hint,
    /131_daily_bazaar_telegram_deliveries/
  )
  assert.match(cliHealthSource, /checkTable\('daily_bazaar_telegram_deliveries'/)
})

test('database health requires duplicate-safe daily payroll group delivery tracking', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingTable: 'daily_payroll_group_notification_deliveries',
  }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'daily_payroll_group_notification_deliveries').hint,
    /134_daily_payroll_group_notifications/
  )
  assert.match(cliHealthSource, /checkTable\('daily_payroll_group_notification_deliveries'/)
})

test('database health requires waiter category schedule overrides', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingTable: 'menu_category_user_schedule_overrides',
  }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'menu_category_user_schedule_overrides').hint,
    /132_menu_category_user_schedule_overrides/
  )
  assert.match(cliHealthSource, /checkTable\('menu_category_user_schedule_overrides'/)
})

test('database health requires the salary group target and event delivery history', async () => {
  const missingTarget = await runDbHealthChecks(makeClient({
    missingTable: 'telegram_notification_targets',
  }))
  const missingDeliveries = await runDbHealthChecks(makeClient({
    missingTable: 'employee_salary_group_notification_deliveries',
  }))

  assert.equal(missingTarget.ok, false)
  assert.match(
    missingTarget.failed.find(check => check.name === 'telegram_notification_targets').hint,
    /111_salary_group_event_notifications/
  )
  assert.equal(missingDeliveries.ok, false)
  assert.match(
    missingDeliveries.failed.find(check => check.name === 'employee_salary_group_notification_deliveries').hint,
    /111_salary_group_event_notifications/
  )
  assert.match(
    missingDeliveries.failed.find(check => check.name === 'employee_salary_group_notification_deliveries').hint,
    /112_salary_event_employee_notifications/
  )
  assert.match(
    missingDeliveries.failed.find(check => check.name === 'employee_salary_group_notification_deliveries').hint,
    /119_salary_event_team_notifications/
  )
  assert.match(
    missingDeliveries.failed.find(check => check.name === 'employee_salary_group_notification_deliveries').hint,
    /170_kpi_rule_group_notifications/
  )
  assert.match(cliHealthSource, /checkTable\('telegram_notification_targets'/)
  assert.match(cliHealthSource, /checkTable\('employee_salary_group_notification_deliveries'/)
})

test('database health requires independent ZarKebab Team salary-event delivery tracking', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'employee_salary_group_notification_deliveries',
    missingColumn: 'team_status',
  }))

  assert.equal(result.ok, false)
  const failed = result.failed.find(check => check.name === 'employee_salary_group_notification_deliveries')
  assert.equal(failed.detail, 'team_status')
  assert.match(failed.hint, /119_salary_event_team_notifications/)
  assert.match(cliHealthSource, /team_status/)
  assert.match(cliHealthSource, /team_telegram_message_id/)
})

test('database health requires daily KPI calculation and source tracking', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'employee_daily_kpi_results' }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'employee_daily_kpi_results').hint,
    /129_daily_kpi_bonuses/
  )
  assert.match(cliHealthSource, /checkTable\('employee_kpi_rules'/)
  assert.match(cliHealthSource, /checkTable\('employee_daily_kpi_runs'/)
  assert.match(cliHealthSource, /checkTable\('employee_daily_kpi_results'/)
  assert.match(cliHealthSource, /generate_daily_kpi_bonuses\(p_business_date\)/)
  assert.match(cliHealthSource, /p_business_date: null/)
})

test('database health requires duplicate-safe KPI rule group notification snapshots', async () => {
  const missingEvents = await runDbHealthChecks(makeClient({
    missingTable: 'employee_kpi_rule_change_events',
  }))
  const missingPointer = await runDbHealthChecks(makeClient({
    missingColumnTable: 'employee_kpi_rules',
    missingColumn: 'last_change_event_id',
  }))

  assert.equal(missingEvents.ok, false)
  assert.match(
    missingEvents.failed.find(check => check.name === 'employee_kpi_rule_change_events').hint,
    /170_kpi_rule_group_notifications/
  )
  assert.equal(missingPointer.ok, false)
  assert.equal(
    missingPointer.failed.find(check => check.name === 'employee_kpi_rules').detail,
    'last_change_event_id'
  )
  assert.match(cliHealthSource, /checkTable\('employee_kpi_rule_change_events'/)
  assert.match(cliHealthSource, /employee_kpi_rules[^\n]*last_change_event_id/)
})

test('database health requires salary bonus accrual tracking', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'employee_salary_bonuses',
    missingColumn: 'accrues_to_salary',
  }))

  assert.equal(result.ok, false)
  const failed = result.failed.find(check => check.name === 'employee_salary_bonuses')
  assert.equal(failed.detail, 'accrues_to_salary')
  assert.match(failed.hint, /169_salary_bonus_accrual/)
  assert.match(cliHealthSource, /employee_salary_bonuses[^\n]*accrues_to_salary/)
})

test('database health requires immutable meal and sold-category snapshots', async () => {
  const missingMeals = await runDbHealthChecks(makeClient({ missingTable: 'employee_daily_meal_expenses' }))
  assert.equal(missingMeals.ok, false)
  assert.match(
    missingMeals.failed.find(check => check.name === 'employee_daily_meal_expenses').hint,
    /147_financial_report_history_snapshots/
  )

  const missingCategory = await runDbHealthChecks(makeClient({
    missingColumnTable: 'order_items',
    missingColumn: 'category_id_snapshot',
  }))
  assert.equal(missingCategory.ok, false)
  assert.equal(
    missingCategory.failed.find(check => check.name === 'order_items').detail,
    'category_id_snapshot'
  )
  const missingCategoryCapture = await runDbHealthChecks(makeClient({
    missingColumnTable: 'order_items',
    missingColumn: 'category_snapshot_captured',
  }))
  assert.equal(missingCategoryCapture.ok, false)
  assert.match(cliHealthSource, /employee_daily_meal_expenses/)
  assert.match(cliHealthSource, /category_id_snapshot/)
})

test('database health requires Dashboard monthly income snapshots and aggregate RPC', async () => {
  const missingSnapshots = await runDbHealthChecks(makeClient({
    missingTable: 'dashboard_monthly_income_snapshots',
  }))
  assert.equal(missingSnapshots.ok, false)
  assert.match(
    missingSnapshots.failed.find(check => check.name === 'dashboard_monthly_income_snapshots').hint,
    /157_dashboard_monthly_income_snapshots/
  )
  assert.match(cliHealthSource, /dashboard_monthly_income_snapshots/)
  assert.match(cliHealthSource, /get_dashboard_monthly_average_income\(p_month_count\)/)
})

test('database health reports missing tables and missing RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_payments', missingRpc: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(result.failed.map(check => check.name).sort(), [
    'change_paid_order_payment_method_owner',
    'change_paid_order_payment_methods_owner',
    'create_menu_item_with_cost',
    'create_menu_item_with_media_and_cost',
    'current_staff_can_access',
    'current_staff_can_manage_bazaar_ingredients',
    'current_staff_can_view_menu_catalog',
    'current_staff_can_write',
    'delete_bazaar_purchase',
    'generate_daily_kpi_bonuses',
    'generate_employee_daily_meal_expense',
    'get_accounting_all_time_balance',
    'get_accounting_daily_cafe_income',
    'get_accounting_monthly_breakdown',
    'get_accounting_monthly_cashflow',
    'get_accounting_owner_profit',
    'get_accounting_paid_order_summary',
    'get_bazaar_ingredient_tech_card_usage',
    'get_dashboard_monthly_average_income',
    'get_financial_analysis',
    'get_ingredient_movement',
    'get_monthly_estimate',
    'get_pending_daily_kpi_dates',
    'get_pending_employee_meal_dates',
    'get_reports_accounting',
    'kitchen_round_receipts_version',
    'migration_definitions',
    'order_payments',
    'recall_table_from_cashier',
    'save_bazaar_ingredient',
    'save_bazaar_purchase',
    'save_menu_item_tech_card',
    'set_bazaar_ingredient_active',
    'settle_loyalty_wallet_payment',
    'settle_orders_payment',
    'split_paid_order_payment',
    'submit_order_to_kitchen',
  ])
  assert.equal(result.failed.find(check => check.name === 'order_payments').messageKey, 'rawError')
  assert.match(result.failed.find(check => check.name === 'settle_loyalty_wallet_payment').hint, /027_atomic_loyalty_wallet_settlement/)
  assert.match(result.failed.find(check => check.name === 'settle_orders_payment').hint, /083_atomic_order_payment_settlement/)
  assert.match(result.failed.find(check => check.name === 'change_paid_order_payment_method_owner').hint, /090_owner_change_completed_order_payment_method/)
  assert.match(result.failed.find(check => check.name === 'change_paid_order_payment_methods_owner').hint, /117_owner_change_individual_payment_methods/)
  assert.match(result.failed.find(check => check.name === 'split_paid_order_payment').hint, /201_split_completed_order_payment/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_cost').hint, /102_atomic_menu_item_cost_creation/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_media_and_cost').hint, /103_menu_item_media_gallery/)
  assert.match(result.failed.find(check => check.name === 'recall_table_from_cashier').hint, /094_admin_cashier_recall_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_view_menu_catalog').hint, /095_read_only_menu_catalog_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_access').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_write').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_manage_bazaar_ingredients').hint, /162_owner_only_bazaar_ingredient_management/)
  assert.match(result.failed.find(check => check.name === 'save_bazaar_purchase').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'delete_bazaar_purchase').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'save_bazaar_ingredient').hint, /160_daily_bazaar_ingredient_catalog/)
  assert.match(result.failed.find(check => check.name === 'set_bazaar_ingredient_active').hint, /160_daily_bazaar_ingredient_catalog/)
  assert.match(result.failed.find(check => check.name === 'get_accounting_paid_order_summary').hint, /109_accounting_paid_order_summary/)
  assert.match(result.failed.find(check => check.name === 'generate_daily_kpi_bonuses').hint, /129_daily_kpi_bonuses/)
})

test('database health requires the lightweight Accounting summary RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingRpc: true }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'get_accounting_paid_order_summary').hint,
    /109_accounting_paid_order_summary/
  )
  assert.match(cliHealthSource, /get_accounting_paid_order_summary\(p_date_from,p_date_to\)/)
  assert.match(cliHealthSource, /p_date_from: '2000-01-01'/)
  assert.match(cliHealthSource, /p_date_to: '2000-01-01'/)
})

test('daily Bazaar schema and RPC checks are required in the CLI health command', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'bazaar_product_catalog' }))
  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'bazaar_product_catalog').hint, /097_daily_bazaar/)

  assert.match(cliHealthSource, /checkTable\('bazaar_purchases',[^\n]+\),/)
  assert.match(cliHealthSource, /checkTable\('bazaar_product_catalog',[^\n]+\),/)
  assert.match(cliHealthSource, /checkTable\('profiles', 'id, role, status, full_name, email, feature_access'\)/)
  assert.match(cliHealthSource, /current_staff_can_access\(feature_key\)/)
  assert.match(cliHealthSource, /current_staff_can_write\(feature_key\)/)
  assert.doesNotMatch(cliHealthSource, /checkTable\('bazaar_(?:purchases|purchase_items|product_catalog|purchase_audit)'[^\n]+false\)/)
  assert.doesNotMatch(cliHealthSource, /save_bazaar_purchase[\s\S]{0,220}'bazaar write access is required',\s*false/)
  assert.doesNotMatch(cliHealthSource, /delete_bazaar_purchase[\s\S]{0,240}'bazaar write access is required',\s*false/)
})

test('atomic menu creation and media gallery RPCs are required by both health checks', async () => {
  const result = await runDbHealthChecks(makeClient({ missingRpc: true }))

  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_cost').hint, /102_atomic_menu_item_cost_creation/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_media_and_cost').hint, /103_menu_item_media_gallery/)
  assert.match(cliHealthSource, /create_menu_item_with_cost\(payload\)/)
  assert.match(cliHealthSource, /supabase\.rpc\('create_menu_item_with_cost', \{ payload: \{\} \}\)/)
  assert.match(cliHealthSource, /create_menu_item_with_media_and_cost\(payload\)/)
  assert.match(cliHealthSource, /supabase\.rpc\('create_menu_item_with_media_and_cost', \{ payload: \{\} \}\)/)
})

test('database health requires the menu media gallery column', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'menu_items',
    missingColumn: 'media_urls',
  }))

  assert.equal(result.ok, false)
  const failed = result.failed.find(check => check.name === 'menu_items')
  assert.equal(failed.detail, 'media_urls')
  assert.match(failed.hint, /103_menu_item_media_gallery/)
  assert.match(cliHealthSource, /menu_items', '[^']*media_urls/)
})

test('settings health fails when a migration only rewrote a function and was never applied', async () => {
  const catalog = healthyMigrationCatalog()
  catalog.functions = catalog.functions.filter(fn => fn.name !== 'employee_kpi_start_time')
  const result = await runDbHealthChecks(makeClient({ migrationHealth: () => ({ data: catalog, error: null }) }))
  const check = result.checks.find(item => item.name === 'migration_definitions')
  assert.equal(result.ok, false)
  assert.equal(check.messageKey, 'migrationIssues')
  assert.ok(check.items.some(item => /254_kpi_starts_at_checkin\.sql: employee_kpi_start_time/.test(item)))
})

test('settings health fails for migrations without a receipt', async () => {
  const catalog = healthyMigrationCatalog()
  const latest = catalog.receipts.at(-1).filename
  catalog.receipts = catalog.receipts.slice(0, -1)
  const result = await runDbHealthChecks(makeClient({ migrationHealth: () => ({ data: catalog, error: null }) }))
  const check = result.checks.find(item => item.name === 'migration_receipts')
  assert.equal(result.ok, false)
  assert.deepEqual(check.items, [`PENDING: ${latest}`])
})

test('settings health passes migration checks when the live database matches the manifest', async () => {
  const result = await runDbHealthChecks(makeClient())
  assert.equal(result.checks.find(item => item.name === 'migration_definitions').ok, true)
  assert.equal(result.checks.find(item => item.name === 'migration_receipts').ok, true)
})

test('settings health reports the missing owner migration RPC and treats non-owners as protected', async () => {
  const missing = await runDbHealthChecks(makeClient({
    migrationHealth: () => ({ data: null, error: { message: 'Could not find the function public.get_app_migration_health' } }),
  }))
  const missingCheck = missing.checks.find(item => item.name === 'migration_definitions')
  assert.equal(missing.ok, false)
  assert.match(missingCheck.hint, /255_owner_migration_health\.sql/)

  const admin = await runDbHealthChecks(makeClient({
    migrationHealth: () => ({ data: null, error: { code: '42501', message: 'Owner access is required' } }),
  }))
  assert.equal(admin.checks.find(item => item.name === 'migration_definitions').messageKey, 'ownerOnly')
  assert.equal(admin.ok, true)
})

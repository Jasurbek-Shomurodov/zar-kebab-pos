import { supabase } from './supabase.js'
import { migrationHealthIssues, migrationReceiptFailures } from './migrationHealth.js'

const TABLE_CHECKS = [
  { name: 'restaurant_tables', columns: ['id', 'name', 'status', 'capacity', 'sort_order', 'is_active', 'reserved_at'] },
  { name: 'table_zones', columns: ['id', 'name', 'sort_order', 'is_active'] },
  { name: 'orders', columns: ['id', 'table_id', 'status', 'payment_status', 'total', 'service_rate_pct', 'loyalty_card_number', 'loyalty_used_amount', 'cashback_earned', 'price_mode', 'opened_by_name', 'completed_by_name', 'stock_deducted_at'] },
  { name: 'order_items', columns: ['id', 'order_id', 'menu_item_id', 'status', 'quantity', 'sale_unit', 'base_price', 'unit_price', 'price_mode', 'selected_options', 'cost_price', 'category_id_snapshot', 'category_snapshot_captured', 'tech_card_component_snapshot'] },
  { name: 'ingredient_investor_notifications', columns: ['id', 'product_key', 'event_type', 'snapshot', 'status', 'chat_id', 'telegram_message_ids', 'error_message', 'attempted_at', 'sent_at', 'created_at'], access: 'service_only' },
  { name: 'order_item_tech_card_ingredient_snapshots', columns: ['order_item_id', 'ingredients', 'is_complete', 'captured_at'], access: 'service_only' },
  { name: 'order_kitchen_rounds', columns: ['order_id', 'kitchen_round_id', 'item_ids', 'table_id', 'submitted_by', 'submitted_at', 'created_at'] },
  { name: 'order_payments', columns: ['id', 'order_id', 'method', 'amount'] },
  { name: 'business_settings', columns: ['id', 'service_rate_pct', 'tourist_service_rate_pct', 'restaurant_name', 'monthly_rent_uzs', 'monthly_utilities_uzs', 'average_daily_employee_meal_uzs', 'average_daily_break_even_income_uzs', 'receipt_marketing', 'auto_print', 'auto_print_kitchen_check', 'tourist_menu_enabled', 'public_tourist_prices'] },
  { name: 'business_break_even_target_history', columns: ['effective_from', 'amount_uzs', 'changed_by', 'changed_at'] },
  { name: 'daily_break_even_snapshots', columns: ['business_date', 'cafe_income_uzs', 'cost_of_goods_uzs', 'fixed_costs_uzs', 'break_even_income_uzs', 'calculated_at'] },
  { name: 'loyalty_cards', columns: ['id', 'card_number', 'cashback_type', 'balance', 'total_earned', 'total_redeemed', 'is_active'] },
  { name: 'loyalty_transactions', columns: ['id', 'loyalty_card_id', 'type', 'amount', 'balance_before', 'balance_after', 'cashback_percent_used', 'card_type_at_transaction', 'card_number_at_transaction', 'customer_name_at_transaction', 'phone_number_at_transaction'] },
  { name: 'expenses', columns: ['id', 'entry_type', 'expense_date', 'category', 'payment_method', 'amount', 'vendor', 'description', 'created_by_name'] },
  { name: 'expense_investor_notification_deliveries', columns: ['expense_id', 'target_key', 'expense_date', 'category', 'payment_method', 'amount', 'vendor', 'description', 'actor_id', 'actor_name', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'created_at', 'updated_at'], access: 'service_only' },
  { name: 'order_change_investor_notification_deliveries', columns: ['id', 'event_type', 'order_id', 'transaction_id', 'order_number', 'table_name', 'total', 'old_payment_methods', 'new_payment_methods', 'actor_id', 'actor_name', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'created_at', 'updated_at'], access: 'service_only' },
  { name: 'salary_absence_undo_notification_deliveries', columns: ['audit_id', 'absence_id', 'salary_profile_id', 'absence_date', 'employee_name', 'actor_id', 'actor_name', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'created_at', 'updated_at'], access: 'service_only' },
  { name: 'bazaar_purchases', columns: ['id', 'request_key', 'expense_id', 'purchase_date', 'payment_method', 'buyer_profile_id', 'buyer_name', 'notes', 'total_amount', 'entry_source', 'created_by_name', 'created_at', 'updated_at'] },
  { name: 'bazaar_purchase_items', columns: ['id', 'purchase_id', 'product_name', 'product_key', 'category', 'quantity', 'unit', 'line_total', 'normal_unit_price', 'normal_line_total', 'price_difference', 'sort_order', 'notes'] },
  { name: 'bazaar_product_catalog', columns: ['product_key', 'product_name', 'category', 'unit', 'normal_unit_price', 'is_active', 'is_catalog_managed', 'last_purchase_date', 'created_at', 'updated_at'] },
  { name: 'bazaar_purchase_audit', columns: ['id', 'purchase_id', 'action', 'old_snapshot', 'new_snapshot', 'changed_by', 'changed_by_name', 'changed_at'] },
  { name: 'daily_bazaar_telegram_deliveries', columns: ['purchase_date', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'updated_at'], access: 'service_only' },
  { name: 'daily_payroll_group_notification_deliveries', columns: ['business_date', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'updated_at'], access: 'service_only' },
  { name: 'daily_ingredient_consumption_deliveries', columns: ['business_date', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'updated_at'], access: 'service_only' },
  { name: 'menu_items', columns: ['id', 'external_id', 'name_uz', 'name_ru', 'name_en', 'price', 'old_price', 'sale_unit', 'grams', 'millilitres', 'kcal', 'stock_count', 'image_url', 'media_urls', 'option_groups', 'cashier_only', 'public_hidden', 'waiter_hidden', 'visible_from_time', 'visible_until_time', 'sort_order', 'deleted_at'] },
  { name: 'menu_item_unavailable_notification_deliveries', columns: ['id', 'menu_item_id', 'menu_item_name', 'actor_id', 'actor_name', 'availability_event', 'variant_changes', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'created_at', 'updated_at'] },
  { name: 'daily_unavailable_menu_notification_deliveries', columns: ['business_date', 'target_key', 'item_count', 'item_ids', 'item_names', 'item_categories', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'created_at', 'updated_at'], access: 'service_only' },
  { name: 'menu_item_costs', columns: ['menu_item_id', 'cost_price', 'variant_costs', 'cost_source', 'updated_at'] },
  { name: 'menu_item_tech_cards', columns: ['menu_item_id', 'variant_option_id', 'portion_count', 'batch_output_quantity', 'batch_output_unit', 'preparation_steps', 'notes', 'updated_by', 'created_at', 'updated_at'] },
  { name: 'menu_item_tech_card_ingredients', columns: ['id', 'menu_item_id', 'name', 'quantity', 'unit', 'unit_price_uzs', 'sort_order', 'created_at', 'updated_at'] },
  { name: 'menu_item_tech_card_components', columns: ['id', 'menu_item_id', 'component_menu_item_id', 'selected_options', 'quantity', 'sort_order', 'created_at', 'updated_at'] },
  { name: 'menu_categories', columns: ['id', 'name_uz', 'name_ru', 'name_en', 'hidden', 'waiter_hidden', 'tourist_hidden', 'always_visible_game_club', 'always_visible_take_away', 'always_visible_delivery', 'visible_from_time', 'visible_until_time', 'sort_order', 'deleted_at'] },
  { name: 'menu_category_user_schedule_overrides', columns: ['category_id', 'profile_id', 'created_by', 'created_at'] },
  { name: 'profiles', columns: ['id', 'role', 'full_name', 'feature_access'] },
  { name: 'employee_salary_profiles', columns: ['id', 'profile_id', 'employee_name', 'job_function', 'joined_at', 'ended_at', 'deleted_at', 'pay_schedule', 'payment_method', 'is_active', 'works_remotely'] },
  { name: 'employee_salary_rates', columns: ['id', 'salary_profile_id', 'effective_from', 'amount', 'rate_unit'] },
  { name: 'employee_salary_payments', columns: ['id', 'salary_profile_id', 'paid_date', 'amount', 'payment_method'] },
  { name: 'employee_salary_bonuses', columns: ['id', 'salary_profile_id', 'bonus_date', 'amount', 'payment_method', 'source_type', 'source_metadata', 'accrues_to_salary'] },
  { name: 'employee_kpi_rules', columns: ['id', 'salary_profile_id', 'effective_from', 'rate_bps', 'is_enabled', 'sales_basis', 'order_opener_profile_id', 'start_time', 'last_change_event_id'] },
  { name: 'employee_kpi_rule_change_events', columns: ['id', 'rule_id', 'salary_profile_id', 'employee_name_snapshot', 'change_kind', 'effective_from', 'previous_rate_bps', 'previous_is_enabled', 'new_rate_bps', 'new_is_enabled', 'previous_sales_basis', 'new_sales_basis', 'previous_start_time', 'new_start_time', 'previous_order_opener_name', 'new_order_opener_name', 'created_by', 'created_by_name', 'created_at'] },
  { name: 'daily_team_kpi_image_deliveries', columns: ['business_date', 'status', 'chat_id', 'telegram_message_id', 'items'], access: 'service_only' },
  { name: 'employee_order_kpi_notifications', columns: ['id', 'order_id', 'status', 'telegram_message_id', 'delete_requested', 'deleted_at', 'cleanup_attempted_at', 'cleanup_error'], access: 'service_only' },
  { name: 'employee_daily_kpi_runs', columns: ['business_date', 'sales_base_amount', 'completed_at'] },
  { name: 'employee_daily_kpi_results', columns: ['id', 'business_date', 'salary_profile_id', 'rule_id', 'sales_base_amount', 'rate_bps', 'bonus_amount', 'payment_method', 'status', 'bonus_id', 'start_time_snapshot'] },
  { name: 'employee_daily_meal_expenses', columns: ['business_date', 'average_daily_amount', 'present_employee_count', 'total_amount', 'source_type', 'finalized_at'] },
  { name: 'dashboard_monthly_income_snapshots', columns: ['month_start', 'total_income', 'day_count', 'average_daily_income', 'order_count', 'source_type', 'finalized_at'] },
  { name: 'employee_salary_fines', columns: ['id', 'salary_profile_id', 'fine_date', 'amount', 'reason', 'created_by_name'] },
  { name: 'employee_salary_absences', columns: ['id', 'salary_profile_id', 'absence_date'] },
  { name: 'employee_salary_telegram_links', columns: ['salary_profile_id', 'telegram_user_id', 'chat_id', 'preferred_language', 'notifications_enabled', 'linked_at'] },
  { name: 'employee_telegram_registrations', columns: ['token', 'telegram_user_id', 'chat_id', 'username', 'expires_at', 'linked_at', 'consumed_at', 'salary_profile_id'], access: 'service_only' },
  { name: 'employee_attendance_checkins', columns: ['salary_profile_id', 'business_date', 'checked_in_at', 'scheduled_start_time', 'minutes_late', 'arrival_status'] },
  { name: 'employee_salary_notification_deliveries', columns: ['id', 'salary_profile_id', 'notification_date', 'notification_type', 'status', 'sent_at'] },
  { name: 'employee_salary_payment_notification_deliveries', columns: ['id', 'payment_id', 'salary_profile_id', 'status', 'employee_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'confirmed_at', 'group_status', 'group_chat_id', 'group_telegram_message_id', 'group_error_message', 'group_attempted_at', 'group_sent_at'] },
  { name: 'telegram_notification_targets', columns: ['target_key', 'chat_id', 'language', 'is_enabled', 'updated_at'] },
  { name: 'employee_salary_group_notification_deliveries', columns: ['id', 'event_type', 'event_id', 'salary_profile_id', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'employee_status', 'employee_chat_id', 'employee_telegram_message_id', 'employee_error_message', 'employee_attempted_at', 'employee_sent_at', 'team_status', 'team_chat_id', 'team_telegram_message_id', 'team_error_message', 'team_attempted_at', 'team_sent_at'] },
  { name: 'accounting_record_audit', columns: ['id', 'entity_type', 'entity_id', 'action', 'old_record', 'new_record', 'changed_by', 'changed_at'] },
  { name: 'order_payment_audit', columns: ['id', 'order_id', 'action', 'changed_at'] },
  { name: 'profile_audit', columns: ['id', 'profile_id', 'action', 'changed_at'] },
]

const MIGRATION_HINTS = {
  order_payments: 'Run migrations/012_split_order_payments.sql',
  business_settings: 'Run business settings migrations through migrations/158_business_settings_daily_break_even_income.sql and migrations/238_tourist_menu_toggle.sql',
  business_break_even_target_history: 'Run migrations/260_break_even_target_history.sql',
  daily_break_even_snapshots: 'Run migrations/263_daily_break_even_snapshots.sql',
  table_zones: 'Run migrations/019_table_management.sql',
  loyalty_cards: 'Run migrations/022_loyalty_cashback_wallet.sql and migrations/061_loyalty_special_card.sql',
  loyalty_transactions: 'Run migrations/022_loyalty_cashback_wallet.sql, migrations/051_remove_loyalty_cards_preserve_history.sql, and migrations/061_loyalty_special_card.sql',
  expenses: 'Run migrations/048_expenses.sql and migrations/059_expense_income_entries.sql',
  expense_investor_notification_deliveries: 'Run migrations/144_expense_investor_group_notifications.sql',
  order_change_investor_notification_deliveries: 'Run migrations/175_order_change_investor_notifications.sql',
  salary_absence_undo_notification_deliveries: 'Run migrations/148_salary_absence_undo_investor_notifications.sql',
  profiles: 'Run migrations/064_profile_feature_access.sql or the latest migrations/097_daily_bazaar.sql',
  bazaar_purchases: 'Run migrations/097_daily_bazaar.sql',
  bazaar_purchase_items: 'Run migrations/097_daily_bazaar.sql and migrations/163_daily_bazaar_price_variance_snapshots.sql',
  bazaar_product_catalog: 'Run migrations/097_daily_bazaar.sql, migrations/160_daily_bazaar_ingredient_catalog.sql, and migrations/161_reset_daily_bazaar_ingredient_catalog.sql',
  bazaar_purchase_audit: 'Run migrations/097_daily_bazaar.sql',
  daily_bazaar_telegram_deliveries: 'Run migrations/131_daily_bazaar_telegram_deliveries.sql',
  daily_payroll_group_notification_deliveries: 'Run migrations/134_daily_payroll_group_notifications.sql',
  daily_ingredient_consumption_deliveries: 'Run migrations/165_daily_ingredient_consumption_deliveries.sql',
  ingredient_investor_notifications: 'Run migrations/189_ingredient_investor_notifications.sql',
  order_item_tech_card_ingredient_snapshots: 'Run migrations/164_order_item_tech_card_ingredient_snapshots.sql',
  order_items: 'Run migrations/070_price_modes.sql, migrations/072_order_item_selected_options.sql, migrations/098_menu_item_costs_and_profit.sql, migrations/105_menu_items_sold_by_weight.sql, migrations/114_freeze_historical_order_prices_and_costs.sql, migrations/147_financial_report_history_snapshots.sql, and migrations/149_tech_card_menu_item_components.sql',
  order_kitchen_rounds: 'Run migrations/128_durable_kitchen_round_receipts.sql',
  order_payment_audit: 'Run migrations/010_order_payment_audit_and_guards.sql',
  orders: 'Run migrations/075_order_actor_tracking.sql, migrations/106_atomic_paid_order_stock_deduction.sql, migrations/150_tech_card_component_stock_deduction.sql, migrations/151_tech_card_component_piece_quantities.sql, and migrations/154_tech_card_component_variants.sql',
  profile_audit: 'Run migrations/028_profile_role_audit.sql',
  menu_items: 'Run migrations/103_menu_item_media_gallery.sql and migrations/105_menu_items_sold_by_weight.sql',
  menu_item_unavailable_notification_deliveries: 'Run migrations/142_menu_unavailable_team_notifications.sql, migrations/146_menu_available_team_notifications.sql, migrations/168_menu_catalog_team_notifications.sql, and migrations/256_menu_variant_visibility_team_notifications.sql',
  daily_unavailable_menu_notification_deliveries: 'Run migrations/143_daily_unavailable_menu_team_notifications.sql and migrations/145_daily_unavailable_menu_categories.sql',
  menu_item_costs: 'Run migrations/098_menu_item_costs_and_profit.sql, migrations/100_menu_variant_costs_and_accounting_profit.sql, and migrations/155_tech_card_real_costs.sql',
  menu_item_tech_cards: 'Run migrations/139_menu_item_tech_cards.sql and migrations/156_variant_tech_cards.sql',
  menu_item_tech_card_ingredients: 'Run migrations/139_menu_item_tech_cards.sql',
  menu_item_tech_card_components: 'Run migrations/149_tech_card_menu_item_components.sql and migrations/154_tech_card_component_variants.sql',
  menu_categories: 'Run migrations/053_hidden_menu_categories.sql, migrations/080_menu_category_waiter_hidden.sql, migrations/082_menu_visibility_windows.sql, migrations/115_archive_menu_catalog_deletions.sql, migrations/133_menu_category_tourist_visibility.sql, and migrations/205_game_club_category_schedule.sql',
  menu_category_user_schedule_overrides: 'Run migrations/132_menu_category_user_schedule_overrides.sql',
  employee_salary_profiles: 'Run migrations/054_employee_salary_profiles.sql, migrations/056_employee_salary_profile_end_date.sql, migrations/060_employee_salary_manual_names.sql, migrations/076_employee_salary_safe_delete.sql, migrations/194_employee_job_function.sql, and migrations/252_employee_works_remotely.sql',
  employee_salary_rates: 'Run migrations/054_employee_salary_profiles.sql, migrations/055_employee_salary_rate_amount_upgrade.sql, migrations/058_employee_salary_daily_amount_compat.sql, and migrations/116_salary_rate_change_telegram_notifications.sql',
  employee_salary_payments: 'Run migrations/054_employee_salary_profiles.sql and migrations/062_drop_salary_payment_period_columns.sql',
  employee_salary_bonuses: 'Run migrations/057_employee_salary_bonuses.sql, migrations/129_daily_kpi_bonuses.sql, and migrations/169_salary_bonus_accrual.sql',
  employee_kpi_rules: 'Run migrations/129_daily_kpi_bonuses.sql, migrations/170_kpi_rule_group_notifications.sql, migrations/196_configurable_kpi_sales_basis.sql, and migrations/203_kpi_workday_start_time.sql',
  employee_kpi_rule_change_events: 'Run migrations/170_kpi_rule_group_notifications.sql, migrations/196_configurable_kpi_sales_basis.sql, and migrations/203_kpi_workday_start_time.sql',
  daily_team_kpi_image_deliveries: 'Run migrations/181_daily_team_kpi_images.sql',
  employee_order_kpi_notifications: 'Run migrations/197_employee_order_kpi_notifications.sql and migrations/202_current_day_order_deletion.sql',
  employee_daily_kpi_runs: 'Run migrations/129_daily_kpi_bonuses.sql',
  employee_daily_kpi_results: 'Run migrations/129_daily_kpi_bonuses.sql and migrations/203_kpi_workday_start_time.sql',
  employee_daily_meal_expenses: 'Run migrations/147_financial_report_history_snapshots.sql',
  dashboard_monthly_income_snapshots: 'Run migrations/157_dashboard_monthly_income_snapshots.sql',
  employee_salary_fines: 'Run migrations/099_employee_salary_fines.sql',
  employee_salary_absences: 'Run migrations/063_employee_salary_absences.sql',
  employee_salary_telegram_links: 'Run migrations/107_employee_salary_telegram_notifications.sql',
  employee_telegram_registrations: 'Run migrations/248_employee_creation_requires_telegram.sql',
  employee_attendance_checkins: 'Run migrations/243_employee_attendance_checkins.sql',
  employee_salary_notification_deliveries: 'Run migrations/107_employee_salary_telegram_notifications.sql',
  employee_salary_payment_notification_deliveries: 'Run migrations/108_employee_salary_payment_notification_deliveries.sql, migrations/110_salary_payment_group_notifications.sql, migrations/113_salary_notification_attempt_tracking.sql, and migrations/157_salary_payment_employee_chat_tracking.sql',
  telegram_notification_targets: 'Run migrations/111_salary_group_event_notifications.sql and migrations/119_salary_event_team_notifications.sql',
  employee_salary_group_notification_deliveries: 'Run migrations/111_salary_group_event_notifications.sql, migrations/112_salary_event_employee_notifications.sql, migrations/113_salary_notification_attempt_tracking.sql, migrations/116_salary_rate_change_telegram_notifications.sql, migrations/119_salary_event_team_notifications.sql, migrations/170_kpi_rule_group_notifications.sql, migrations/196_configurable_kpi_sales_basis.sql, and migrations/203_kpi_workday_start_time.sql',
  accounting_record_audit: 'Run migrations/084_accounting_record_audit.sql',
  submit_order_to_kitchen: 'Run migrations/018_submit_order_to_kitchen_rpc.sql',
  kitchen_round_receipts_version: 'Run migrations/128_durable_kitchen_round_receipts.sql completely',
  settle_loyalty_wallet_payment: 'Run migrations/027_atomic_loyalty_wallet_settlement.sql',
  settle_orders_payment: 'Run migrations/083_atomic_order_payment_settlement.sql',
  change_paid_order_payment_method_owner: 'Run migrations/090_owner_change_completed_order_payment_method.sql',
  change_paid_order_payment_methods_owner: 'Run migrations/117_owner_change_individual_payment_methods.sql',
  split_paid_order_payment: 'Run migrations/201_split_completed_order_payment.sql',
  recall_table_from_cashier: 'Run migrations/094_admin_cashier_recall_access.sql',
  current_staff_can_view_menu_catalog: 'Run migrations/095_read_only_menu_catalog_access.sql',
  current_staff_can_access: 'Run the latest migrations/097_daily_bazaar.sql',
  current_staff_can_write: 'Run the latest migrations/097_daily_bazaar.sql',
  save_bazaar_purchase: 'Run migrations/097_daily_bazaar.sql',
  delete_bazaar_purchase: 'Run migrations/097_daily_bazaar.sql',
  get_ingredient_movement: 'Run migrations/186_ingredients_feature_and_movement.sql',
  save_bazaar_ingredient: 'Run migrations/160_daily_bazaar_ingredient_catalog.sql',
  set_bazaar_ingredient_active: 'Run migrations/160_daily_bazaar_ingredient_catalog.sql',
  get_bazaar_ingredient_tech_card_usage: 'Run migrations/242_bazaar_ingredient_tech_card_usage.sql',
  current_staff_can_manage_bazaar_ingredients: 'Run migrations/162_owner_only_bazaar_ingredient_management.sql',
  create_employee_salary_telegram_link: 'Run migrations/107_employee_salary_telegram_notifications.sql',
  create_employee_telegram_registration: 'Run migrations/248_employee_creation_requires_telegram.sql',
  get_employee_telegram_registration: 'Run migrations/248_employee_creation_requires_telegram.sql',
  create_employee_salary_profile_with_telegram: 'Run migrations/248_employee_creation_requires_telegram.sql',
  create_attendance_kiosk: 'Run migrations/245_attendance_kiosk_rotating_qr.sql',
  get_attendance_kiosk_token: 'Run migrations/245_attendance_kiosk_rotating_qr.sql',
  get_attendance_qr_token: 'Run migrations/247_attendance_qr_drawer_access.sql',
  get_my_attendance_qr_access: 'Run migrations/247_attendance_qr_drawer_access.sql',
  generate_daily_kpi_bonuses: 'Run migrations/129_daily_kpi_bonuses.sql',
  generate_employee_daily_meal_expense: 'Run migrations/147_financial_report_history_snapshots.sql',
  get_pending_daily_kpi_dates: 'Run migrations/147_financial_report_history_snapshots.sql',
  get_pending_employee_meal_dates: 'Run migrations/147_financial_report_history_snapshots.sql',
  get_dashboard_monthly_average_income: 'Run migrations/157_dashboard_monthly_income_snapshots.sql',
  create_menu_item_with_cost: 'Run migrations/102_atomic_menu_item_cost_creation.sql',
  create_menu_item_with_media_and_cost: 'Run migrations/103_menu_item_media_gallery.sql',
  save_menu_item_tech_card: 'Run migrations/139_menu_item_tech_cards.sql, migrations/149_tech_card_menu_item_components.sql, and migrations/154_tech_card_component_variants.sql',
  get_accounting_paid_order_summary: 'Run migrations/109_accounting_paid_order_summary.sql',
  get_accounting_all_time_balance: 'Run migrations/177_accounting_all_time_balance.sql',
  get_accounting_monthly_cashflow: 'Run migrations/229_accounting_monthly_cashflow.sql',
  get_accounting_monthly_breakdown: 'Run migrations/261_accounting_monthly_breakdown.sql',
  get_accounting_owner_profit: 'Run migrations/257_accounting_month_closes.sql',
  get_financial_analysis: 'Run migrations/231_financial_analysis_bundle.sql',
  get_monthly_estimate: 'Run migrations/233_monthly_estimate_bundle.sql',
  get_reports_accounting: 'Run migrations/235_reports_accounting_bundle.sql',
  get_app_migration_health: 'Run migrations/255_owner_migration_health.sql',
}

const MIGRATION_DEFINITIONS_HINT = 'Apply the listed migration files with node migrations/migrate.js --sql <file> (records a receipt), then check again'
const MIGRATION_RECEIPTS_HINT = 'PENDING files have no receipt: apply them with node migrations/migrate.js --sql <file>; if one was already applied by hand, record its receipt instead of re-running it'

function missingColumnMessage(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  const schemaCacheMatch = message.match(/["']([a-z0-9_]+)["']\s+column/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]
  const qualifiedMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)/i)
  if (qualifiedMatch?.[1]) return qualifiedMatch[1]
  const match = message.match(/column ["']?([a-z0-9_]+)["']?/i)
  return match?.[1] || null
}

async function checkTable(dbClient, check) {
  const { error } = await dbClient
    .from(check.name)
    .select(check.columns.join(','))
    .limit(1)

  if (!error) return { type: 'table', name: check.name, ok: true, messageKey: 'ok' }

  const permissionDenied = error?.code === '42501' || /permission denied/i.test(String(error?.message || ''))
  if (check.access === 'service_only' && permissionDenied) {
    return { type: 'table', name: check.name, ok: true, messageKey: 'protected' }
  }

  const missingColumn = missingColumnMessage(error)
  return {
    type: 'table',
    name: check.name,
    ok: false,
    messageKey: missingColumn ? 'missingColumn' : 'rawError',
    detail: missingColumn || error.message,
    hint: MIGRATION_HINTS[check.name] || null,
  }
}

async function checkRpc(dbClient, name, args = { payload: {} }) {
  const { error } = await dbClient.rpc(name, args)
  if (!error) return { type: 'rpc', name, ok: true, messageKey: 'ok' }
  const message = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  const missing = message.includes('could not find the function') ||
    message.includes('schema cache') && message.includes(name) ||
    message.includes('function') && message.includes('not found')
  return {
    type: 'rpc',
    name,
    ok: !missing,
    messageKey: missing ? 'rawError' : 'available',
    detail: missing ? error.message : null,
    hint: missing ? MIGRATION_HINTS[name] : null,
  }
}

async function loadMigrationManifest() {
  return (await import('../generated/migrationManifest.js')).default
}

// Function bodies, triggers, schedules and receipts versus the deployed migrations/ folder.
// Catches migrations that only rewrite functions, which table/RPC probes cannot see.
async function checkMigrations(dbClient, manifestLoader) {
  const { data, error } = await dbClient.rpc('get_app_migration_health')
  if (error) {
    const message = `${error.code || ''} ${error.message || ''}`
    if (error.code === '42501' || /owner access is required/i.test(message)) {
      return [{ type: 'migration', name: 'migration_definitions', ok: true, messageKey: 'ownerOnly' }]
    }
    return [{ type: 'migration', name: 'migration_definitions', ok: false, messageKey: 'rawError', detail: error.message, hint: MIGRATION_HINTS.get_app_migration_health }]
  }
  const manifest = await manifestLoader()
  const issues = migrationHealthIssues(data || {}, manifest.functions)
  const receiptFailures = migrationReceiptFailures(manifest.files, data?.receipts || [])
  return [
    issues.length
      ? { type: 'migration', name: 'migration_definitions', ok: false, messageKey: 'migrationIssues', items: issues, detail: issues.join('; '), hint: MIGRATION_DEFINITIONS_HINT }
      : { type: 'migration', name: 'migration_definitions', ok: true, messageKey: 'ok' },
    receiptFailures.length
      ? { type: 'migration', name: 'migration_receipts', ok: false, messageKey: 'migrationIssues', items: receiptFailures.map(row => `${row.status}: ${row.filename}`), detail: receiptFailures.map(row => `${row.status}: ${row.filename}`).join('; '), hint: MIGRATION_RECEIPTS_HINT }
      : { type: 'migration', name: 'migration_receipts', ok: true, messageKey: 'ok' },
  ]
}

export async function runDbHealthChecks(dbClient = supabase, { manifestLoader = loadMigrationManifest } = {}) {
  const startedAt = new Date().toISOString()
  const checks = await Promise.all(TABLE_CHECKS.map(check => checkTable(dbClient, check)))
  checks.push(await checkRpc(dbClient, 'submit_order_to_kitchen'))
  checks.push(await checkRpc(dbClient, 'kitchen_round_receipts_version', {}))
  checks.push(await checkRpc(dbClient, 'create_menu_item_with_cost'))
  checks.push(await checkRpc(dbClient, 'create_menu_item_with_media_and_cost'))
  checks.push(await checkRpc(dbClient, 'save_menu_item_tech_card'))
  checks.push(await checkRpc(dbClient, 'settle_loyalty_wallet_payment'))
  checks.push(await checkRpc(dbClient, 'settle_orders_payment'))
  checks.push(await checkRpc(dbClient, 'change_paid_order_payment_method_owner', { p_order_ids: [], p_payment_method: 'cash' }))
  checks.push(await checkRpc(dbClient, 'change_paid_order_payment_methods_owner', { p_changes: [] }))
  checks.push(await checkRpc(dbClient, 'split_paid_order_payment', {
    p_request_id: null, p_order_id: null, p_payment_id: null, p_expected_amount: null,
    p_expected_method: null, p_first_amount: null, p_first_method: null, p_second_method: null,
  }))
  checks.push(await checkRpc(dbClient, 'recall_table_from_cashier', { p_table_id: '__db_health_check__' }))
  checks.push(await checkRpc(dbClient, 'current_staff_can_view_menu_catalog', {}))
  checks.push(await checkRpc(dbClient, 'current_staff_can_access', { feature_key: 'bazaar' }))
  checks.push(await checkRpc(dbClient, 'current_staff_can_write', { feature_key: 'bazaar' }))
  checks.push(await checkRpc(dbClient, 'current_staff_can_manage_bazaar_ingredients', {}))
  checks.push(await checkRpc(dbClient, 'save_bazaar_purchase'))
  checks.push(await checkRpc(dbClient, 'delete_bazaar_purchase', { p_purchase_id: '00000000-0000-0000-0000-000000000000' }))
  checks.push(await checkRpc(dbClient, 'get_ingredient_movement', { p_date_from: null, p_date_to: null }))
  checks.push(await checkRpc(dbClient, 'save_bazaar_ingredient'))
  checks.push(await checkRpc(dbClient, 'set_bazaar_ingredient_active', { p_product_key: '__db_health_check__', p_is_active: false }))
  checks.push(await checkRpc(dbClient, 'get_bazaar_ingredient_tech_card_usage', { p_product_key: '__db_health_check__' }))
  checks.push(await checkRpc(dbClient, 'get_accounting_paid_order_summary', {
    p_date_from: '2000-01-01',
    p_date_to: '2000-01-01',
  }))
  checks.push(await checkRpc(dbClient, 'get_accounting_all_time_balance', {}))
  checks.push(await checkRpc(dbClient, 'get_accounting_monthly_cashflow', { p_month_count: 1 }))
  checks.push(await checkRpc(dbClient, 'get_accounting_monthly_breakdown', { p_month_count: 1 }))
  checks.push(await checkRpc(dbClient, 'get_accounting_owner_profit', {}))
  checks.push(await checkRpc(dbClient, 'get_financial_analysis', { p_date_from: '2000-01-01', p_date_to: '2000-01-01', p_previous_from: '1999-12-31', p_previous_to: '1999-12-31', p_include_growth: false }))
  checks.push(await checkRpc(dbClient, 'get_monthly_estimate', { p_month_start: '2000-01-01', p_month_end: '2000-01-31', p_completed_sales_to: null, p_previous_start: '1999-12-01', p_previous_end: '1999-12-31' }))
  checks.push(await checkRpc(dbClient, 'get_reports_accounting', { p_date_from: '2000-01-01', p_date_to: '2000-01-01' }))
  checks.push(await checkRpc(dbClient, 'generate_daily_kpi_bonuses', { p_business_date: null }))
  checks.push(await checkRpc(dbClient, 'generate_employee_daily_meal_expense', { p_business_date: null }))
  checks.push(await checkRpc(dbClient, 'get_pending_daily_kpi_dates', { p_limit: 1 }))
  checks.push(await checkRpc(dbClient, 'get_pending_employee_meal_dates', { p_limit: 1 }))
  checks.push(await checkRpc(dbClient, 'get_dashboard_monthly_average_income', { p_month_count: 1 }))
  checks.push(...await checkMigrations(dbClient, manifestLoader))
  const failed = checks.filter(check => !check.ok)
  return {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    startedAt,
    checks,
    failed,
  }
}

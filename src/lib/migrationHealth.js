// Pure migration comparisons shared by the CLI health check and the Settings button.
// No Node imports: the browser bundle uses this with the generated manifest.

export const RECEIPT_FAILURE_STATUSES = ['CHANGED', 'PENDING', 'MISSING_FILE']

export function migrationStatus(files, receipts) {
  const recorded = new Map(receipts.map(row => [row.filename, row.sha256]))
  const statuses = files.map(file => ({ filename: file.filename, status: recorded.has(file.filename)
    ? recorded.get(file.filename) === file.sha256 ? 'applied' : 'CHANGED'
    : Number(file.filename.slice(0, 3)) < 199 ? 'legacy-untracked' : 'PENDING' }))
  const filenames = new Set(files.map(file => file.filename))
  for (const row of receipts) if (!filenames.has(row.filename)) statuses.push({filename: row.filename, status: 'MISSING_FILE'})
  return statuses
}

export function migrationReceiptFailures(files, receipts) {
  return migrationStatus(files, receipts).filter(row => RECEIPT_FAILURE_STATUSES.includes(row.status))
}

export function migrationHealthIssues(catalog, expected) {
  const issues = []
  for (const f of expected) {
    if (!(catalog.functions || []).some(actual => actual.name === f.name && actual.md5 === f.md5)) issues.push(`${f.filename}: ${f.name} missing or definition differs`)
  }
  for (const [table, name] of [
    ['menu_item_tech_cards','tech_cards_mark_costs_dirty'],
    ['menu_item_tech_card_ingredients','tech_card_ingredients_mark_costs_dirty'],
    ['menu_item_tech_card_components','tech_card_components_mark_costs_dirty'],
    ['bazaar_product_catalog','queue_ingredient_investor_notification'],
    // Migration 219: new Telegram queue rows wake their sender immediately.
    ['game_club_team_notifications','kick_game_club_team_queue'],
    ['ingredient_investor_notifications','kick_ingredient_investor_queue'],
    ['order_status_telegram_messages','kick_order_status_cleanup_insert'],
    ['order_status_telegram_messages','kick_order_status_cleanup_update'],
    ['employee_order_kpi_notifications','kick_employee_order_kpi_insert'],
    ['employee_order_kpi_notifications','kick_employee_order_kpi_update'],
  ]) if (!(catalog.triggers || []).some(t => t.table === table && t.name === name && ['O','A'].includes(t.enabled))) issues.push(`Missing enabled trigger: ${table}.${name}`)
  // Migration 219 replaced the per-queue minute crons with one retry sweep.
  if (!(catalog.jobs || []).some(j => j.name === 'zar-kebab-queue-sweep' && j.active && j.schedule === '*/15 * * * *')) issues.push('Missing active 15-minute schedule: zar-kebab-queue-sweep')
  return issues
}

// Payroll balances need the complete ledger, including records beyond the
// database's default response limit. Create a fresh, stably ordered query per page.
export async function loadSalaryRows(createQuery) {
  const pageSize = 500
  const rows = []
  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await createQuery().order('id').range(offset, offset + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if ((data || []).length < pageSize) return { data: rows, error: null }
    }
  } catch (error) {
    // Never calculate a plausible but incomplete balance after a later page fails.
    return { data: [], error }
  }
}

/** A salary table or column that an older database does not have yet (the page then asks for the migration). */
export function isMissingSalaryMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('employee_salary') && (
    text.includes('does not exist') ||
    text.includes('could not find the') ||
    text.includes('column') ||
    text.includes('schema cache') ||
    text.includes('42p01') ||
    text.includes('42703')
  )
}

/**
 * The error that must stop a salary balance from being shown, or null when the ledger is complete.
 *
 * Fines reduce what an employee is owed, so a failed fines read is a failed ledger: showing the
 * balance without them overstates the amount due and invites an overpayment. The one tolerated
 * case is a database from before the fines migration, where there are no fines to miss.
 */
export function getSalaryLedgerLoadError(requiredResults = [], fineResult = null) {
  const required = requiredResults.find(result => result?.error)?.error
  if (required) return required
  const fineError = fineResult?.error
  if (fineError && !isMissingSalaryMigration(fineError)) return fineError
  return null
}

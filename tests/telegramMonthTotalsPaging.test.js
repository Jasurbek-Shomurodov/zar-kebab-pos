import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')

test('Investor month totals page past the 1000-row PostgREST cap', () => {
  assert.match(source, /monthEntries, error: monthError \} = await loadSalaryRows\(\(\) => supabase\s*\.from\('expenses'\)/)
  assert.match(source, /currentMonthEntries, error: currentMonthError \} = await loadSalaryRows\(\(\) => supabase\s*\.from\('expenses'\)/)
})

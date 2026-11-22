import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const salaries = read('src/pages/Salaries.jsx')
const employees = read('src/pages/Employees.jsx')
const history = read('src/pages/EmployeeSalaryHistory.jsx')
const newEmployee = read('src/components/NewEmployeeDialog.jsx')
const rateHistory = read('src/components/SalaryRateHistory.jsx')
const all = { salaries, employees, history, newEmployee, rateHistory }
const languageBlock = (source, lang) => {
  const start = source.search(new RegExp(`\\n\\s+${lang}: \\{`))
  return source.slice(start, source.indexOf('\n    },', start))
}

test('payroll amounts never break or truncate: tiles reflow instead', () => {
  // The 320px bug: "26 073 194" split between digits by break-words on a two-column tile grid.
  const kpi = employees.slice(employees.indexOf('function Kpi('), employees.indexOf('function Fact('))
  const stat = employees.slice(employees.indexOf('function Stat('), employees.indexOf('function EmployeeKpiRow('))
  for (const block of [kpi, stat, salaries.slice(salaries.indexOf('function MetricCard('))]) {
    assert.match(block, /whitespace-nowrap[^"`]*tabular-nums/)
    assert.doesNotMatch(block, /break-words[^"`]*tabular-nums|truncate/)
  }
  assert.match(employees, /grid-cols-\[repeat\(auto-fit,minmax\(13rem,1fr\)\)\] gap-3">\s*\{\/\* Absences/)
  assert.match(salaries, /grid min-w-0 grid-cols-\[repeat\(auto-fit,minmax\(15rem,1fr\)\)\] gap-3/)
  const summary = history.slice(history.indexOf('function SummaryItem('), history.indexOf('function CalendarWorkStatus('))
  assert.match(summary, /whitespace-nowrap text-\[15px\] font-semibold tabular-nums/)
  assert.doesNotMatch(history, /truncate text-sm|break-words font-extrabold|break-all/)
  // An awaiting card no longer greys its balance below readable contrast.
  assert.doesNotMatch(employees, /ws-awaiting-dim/)
})

test('the five-word note rule is visible under every note with a live count', () => {
  assert.equal((salaries.match(/<NoteWordsHint id="salary-(absence|fine|payment|bonus)-note-hint"/g) || []).length, 4)
  for (const kind of ['absence', 'fine', 'payment', 'bonus']) {
    assert.match(salaries, new RegExp(`aria-describedby="salary-${kind}-note-hint"`))
  }
  const hint = salaries.slice(salaries.indexOf('function NoteWordsHint('), salaries.indexOf('function DateInput('))
  assert.match(hint, /countNoteWords\(value\)/)
  assert.match(hint, /count >= MIN_NOTE_WORDS/)
  assert.match(hint, /aria-live="polite"/)
  for (const lang of ['uz', 'ru', 'en']) {
    const block = languageBlock(salaries, lang)
    assert.match(block, /noteMinWords: '[^']*5/, lang)
    assert.match(block, /noteWordCount: '[^']*\{count\}[^']*5/, lang)
  }
})

test('payroll errors are stored as codes, translated at render, and raw database text stays in the console', () => {
  for (const [name, source] of Object.entries(all)) {
    assert.doesNotMatch(source, /set(?:Edit|Load)?Error\([^)\n]*\.message/, name)
    assert.doesNotMatch(source, /set(?:Edit|Load)?Error\(l\./, name)
    assert.doesNotMatch(source, /error: [a-zA-Z]+Error\??\.message/, name)
  }
  assert.match(salaries, /const errorText = error \? l\[error\] \|\| l\.saveFailed : ''/)
  assert.match(employees, /const errorText = error \? l\[error\] \|\| l\.saveFailed : ''/)
  assert.match(history, /const errorText = error \? l\[error\] \|\| l\.deleteFailed : ''/)
  assert.match(newEmployee, /const errorText = error \? l\[error\] \|\| l\.createFailed : ''/)
  for (const [source, keys] of [
    [salaries, ['loadFailed', 'saveFailed', 'linkFailed', 'copyFailed', 'retry']],
    [employees, ['loadFailed', 'loadFailedTitle', 'saveFailed', 'linkFailed', 'copyFailed', 'screenActionFailed']],
    [history, ['loadFailedHint', 'advance', 'dismiss']],
    [newEmployee, ['linkFailed', 'createFailed', 'copyFailed']],
  ]) {
    for (const key of keys) assert.equal(source.split(`\n      ${key}: '`).length + source.split(`\n    ${key}: '`).length - 2, 3, key)
  }
})

test('a failed payroll load offers a retry and never shows zero totals or an empty list', () => {
  assert.match(salaries, /loadErrorText && \([\s\S]*?onClick=\{\(\) => loadData\(\{ showLoader: true \}\)\}[\s\S]*?\{l\.retry\}/)
  assert.match(salaries, /loadError \? '—' : formatCurrency\(totalDue\)/)
  assert.match(employees, /\{failed \? \([\s\S]*?<OperationalError lang=\{lang\}[^>]*onAction=\{loadEmployees\} \/>[\s\S]*?\) : tilesLoading \? \([\s\S]*?\) : employees\.length === 0 \?/)
  assert.match(employees, /unavailable \? '—' : <RollingValue value=\{value\} \/>/)
  assert.match(history, /\{loadError \? \([\s\S]*?<OperationalError[\s\S]*?onAction=\{\(\) => loadHistory\(\)\}/)
  // An error set before a reload used to be wiped by the loader; it is now set after it.
  assert.match(employees, /await loadEmployees\(\)\n\s*if \(!notification\?\.ok\) setError\('undoAbsenceNotificationFailed'\)/)
})

test('payroll dialogs are the shared WorkspaceDialog and the saved toast sits on the toast layer', () => {
  assert.equal((employees.match(/<WorkspaceDialog\b/g) || []).length, 2)
  assert.match(newEmployee, /<WorkspaceDialog\s+as="form"\s+panelProps=\{\{ onSubmit: createSalaryProfile \}\}/)
  for (const source of [employees, newEmployee, history]) {
    assert.doesNotMatch(source, /fixed inset-0 z-dialog|role="dialog"|backdrop-blur/)
  }
  assert.match(employees, /className="zk-sheet-in pointer-events-none fixed [^"]*z-toast/)
  assert.doesNotMatch(employees, /style=\{\{ animation/)
  assert.match(history, /role="alert" aria-live="assertive" className="fixed [^"]*z-toast/)
  // On/off settings are the shared switch, not a two-line button.
  assert.equal((employees.match(/role="switch"[\s\S]{0,260}?className="ws-switch"/g) || []).length, 2)
  assert.match(employees, /motion-safe:animate-pulse/)
  // Date fields are full-size workspace fields.
  assert.match(employees, /return <CalendarPicker className=\{DIALOG_FIELD\} \{\.\.\.props\} \/>/)
  assert.match(newEmployee, /<CalendarPicker [^>]*className=\{FIELD\}/)
})

test('one tone per payroll entry kind across Salaries, Employees and the history calendar', () => {
  for (const source of [salaries, employees, history]) assert.match(source, /SALARY_ENTRY_TONES/)
  assert.doesNotMatch(history, /violet|bg-blue-|text-blue-|emerald|orange-\d|red-\d|amber-\d/)
  assert.match(history, /const tone = salaryEntryTone\(entry\.entryType\)/)
  assert.match(history, /SALARY_ENTRY_TONES\[type\]\.dot/)
  assert.match(salaries, /\(SALARY_ENTRY_TONES\[transactionForm\.entry_type\] \|\| SALARY_ENTRY_TONES\.payment\)\.badge/)
  // One minus glyph: balances and signed amounts go through the shared formatters.
  assert.doesNotMatch(employees + history, /[`'"]−\s?[`'"$]|'− '/)
  assert.match(history, /formatSalaryEntryAmount\(entry\.entryType, entry\.amount\)/)
})

test('salary history is a workspace page: tabs stay, the calendar fits a phone, nothing under 12px', () => {
  assert.match(history, /const accountingTabs = buildAccountingTabs\(lang, 'employees', navigate\)/)
  assert.match(history, /title=\{accountingTitle\(lang\)\}\s*tabs=\{tabs\}/)
  assert.match(history, /<div className="ws-page">/)
  for (const source of [history, rateHistory]) {
    assert.doesNotMatch(source, /text-\[(?:8|9|10|11)px\]/)
    assert.doesNotMatch(source, /uppercase|tracking-wide|font-black/)
    assert.doesNotMatch(source, /\bh-8\b|\bw-8\b[^"]*items-center justify-center rounded-lg/)
  }
  assert.doesNotMatch(history, /min-w-\[770px\]|overflow-x-auto/)
  assert.match(history, /className="grid grid-cols-7 gap-1" role="grid"/)
  assert.match(history, /className="mb-5 flex flex-wrap gap-2" role="group"/)
  // Exact amounts are in the day list; cells carry dots on phones and a short figure from md.
  assert.match(history, /formatCompactCurrency\(key === 'fine' \? -amount : amount, lang/)
  // The header and headings render at once; data shimmers in the shape of the page.
  assert.doesNotMatch(history, /if \(loading\) \{\s*return|<OperationalLoading/)
  assert.match(history, /loading && Array\.from\(\{ length: 35 \}/)
  assert.match(rateHistory, /loading \? <div role="status" aria-busy="true"[\s\S]*?<Shimmer/)
  assert.doesNotMatch(rateHistory, /Loading changes…|\{l\.loading\}<\/p>/)
  // Delete controls are full-size workspace buttons.
  for (const source of [history, rateHistory]) {
    assert.match(source, /'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger ws-btn-icon'/)
  }
  // A negative balance is named as an advance next to "Left to pay".
  assert.match(history, /advance: balance < 0 \? Math\.abs\(balance\) : 0/)
  assert.match(history, /headerTotals\.advance > 0 \? `\$\{l\.advance\}: \$\{formatCurrency\(headerTotals\.advance\)\}`/)
})

test('a nameless employee falls back to a translated word, not a literal English one', () => {
  assert.doesNotMatch(employees, /\|\| 'Employee'/)
  assert.match(employees, /employeeName\(employee, l\.profileSection\)/)
})

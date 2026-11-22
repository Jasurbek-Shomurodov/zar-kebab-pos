import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('menu, ingredient and tech card pop-ups are the shared WorkspaceDialog, not hand-rolled overlays', () => {
  for (const path of [
    'src/pages/AdminMenu.jsx',
    'src/pages/BazaarIngredients.jsx',
    'src/components/IngredientPurchaseSheet.jsx',
    'src/components/TechCardPdfDownload.jsx',
  ]) {
    const source = read(path)
    assert.match(source, /import WorkspaceDialog from/, path)
    // A hand-rolled overlay scrolls title and buttons away and has no focus trap.
    assert.doesNotMatch(source, /className="fixed inset-0/, path)
    assert.doesNotMatch(source, /<dialog\b|showModal\(\)/, path)
    assert.doesNotMatch(source, /role="(alert)?dialog"/, path)
  }
  const adminMenu = read('src/pages/AdminMenu.jsx')
  const modal = adminMenu.slice(adminMenu.indexOf('function Modal('), adminMenu.indexOf('function closeDialogLabel'))
  assert.match(modal, /<WorkspaceDialog/)
  // Every use names its close button.
  assert.equal(adminMenu.match(/<Modal\b/g).length, adminMenu.match(/<Modal\b[\s\S]*?closeLabel=\{closeDialogLabel\(lang\)\}/g).length)

  const ingredients = read('src/pages/BazaarIngredients.jsx')
  assert.equal(ingredients.match(/<WorkspaceDialog\b/g).length, 3)
  assert.match(ingredients, /variant="alert"[\s\S]*?initialFocusRef=\{archiveCancelRef\}/)
  // Staff read a translated message; the raw database text goes to the console.
  assert.doesNotMatch(ingredients, /requestError\?\.message \|\| fallback/)
})

test('menu schedules use the 24-hour picker and keep an empty time possible', () => {
  const adminMenu = read('src/pages/AdminMenu.jsx')
  assert.doesNotMatch(adminMenu, /type="time"/)
  assert.equal(adminMenu.match(/<ScheduleTimeField /g).length, 6)
  const field = adminMenu.slice(adminMenu.indexOf('function ScheduleTimeField('), adminMenu.indexOf('function Field('))
  assert.match(field, /<TimePicker24/)
  // Stored value stays HH:MM; picking only an hour or only a minute never stores "08:" or ":30".
  assert.match(field, /onChange\(`\$\{hour \|\| '00'\}:\$\{minute \|\| '00'\}`\)/)
  // Empty means "always shown", so a set time can be cleared again.
  assert.match(field, /onClick=\{\(\) => onChange\(''\)\}/)
})

test('staff override list shimmers in row shape while loading', () => {
  const adminMenu = read('src/pages/AdminMenu.jsx')
  const block = adminMenu.slice(adminMenu.indexOf('{categoryOverrideProfilesLoading && ('), adminMenu.indexOf('{!categoryOverrideProfilesLoading && categoryOverrideProfilesError'))
  assert.match(block, /<Shimmer /)
  assert.doesNotMatch(block, /animate-spin|Loading staff…/)
})

test('menu item picker fits a phone and says when nothing matches', () => {
  const picker = read('src/components/MenuItemPicker.jsx')
  // A fixed 145..230px category column left 66px for dishes on a 320px phone.
  assert.doesNotMatch(picker, /className="grid min-h-0 flex-1 grid-cols-\[minmax\(145px,230px\)/)
  assert.match(picker, /\[container-type:inline-size\]/)
  assert.match(picker, /grid-cols-1 grid-rows-\[auto_minmax\(0,1fr\)\][^"]*\[@container_\(min-width:480px\)\]:grid-cols-\[minmax\(145px,230px\)_minmax\(0,1fr\)\]/)
  assert.match(picker, /\{l\.empty\}/)
  for (const word of ['Hech narsa topilmadi', 'Ничего не найдено', 'Nothing found']) assert.ok(picker.includes(word), word)
  // Prices go through the shared formatter.
  assert.match(picker, /formatCurrency\(option\.price\)/)
  assert.doesNotMatch(picker, /Intl\.NumberFormat|toLocaleString/)
  assert.doesNotMatch(picker, /text-\[1[01]px\]|uppercase/)
})

test('purchase detail tiles wrap instead of squeezing three money figures into 320px', () => {
  const sheet = read('src/components/IngredientPurchaseSheet.jsx')
  const detail = sheet.slice(sheet.indexOf('function PurchaseDetail('))
  assert.match(detail, /grid-cols-\[repeat\(auto-fit,minmax\(8\.5rem,1fr\)\)\]/)
  assert.doesNotMatch(detail, /grid-cols-3/)
  assert.match(detail, /whitespace-nowrap font-semibold tabular-nums/)
  assert.doesNotMatch(sheet, /uppercase|text-\[10px\]|text-\[#c9c5c0\]/)
})

test('weekday picker explains why the last day stays selected', () => {
  const picker = read('src/components/MenuWeekdayPicker.jsx')
  assert.match(picker, /setLastDayRefused\(nextDays\.length === 0\)/)
  assert.match(picker, /role="status"[\s\S]*?labels\.lastDay/)
  for (const word of ['Kamida bitta kun', 'хотя бы один день', 'At least one day']) assert.ok(picker.includes(word), word)
})

test('tech card PDF is named with the restaurant date, not the UTC date', () => {
  const pdf = read('src/components/TechCardPdfDownload.jsx')
  assert.match(pdf, /doc\.save\(`tech-cards-\$\{restaurantTodayStr\(\)\}\.pdf`\)/)
  assert.doesNotMatch(pdf, /new Date\(\)\.toISOString\(\)/)
  for (const lang of ['en', 'ru', 'uz']) assert.match(pdf, new RegExp(`\\n  ${lang}: \\[`))
})

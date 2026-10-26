import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { MANUAL_EXPENSE_CATEGORIES, expenseCategoryLabel } from '../src/lib/expenses.js'

const migration = fs.readFileSync(
  new URL('../migrations/264_expense_investment_category.sql', import.meta.url),
  'utf8'
)

test('investment is a localized manual Accounting expense category', () => {
  assert.equal(MANUAL_EXPENSE_CATEGORIES.some(category => category.key === 'investment'), true)
  assert.equal(expenseCategoryLabel('investment', 'uz'), 'Investitsiya')
  assert.equal(expenseCategoryLabel('investment', 'ru'), 'Инвестиция')
  assert.equal(expenseCategoryLabel('investment', 'en'), 'Investment')
})

test('investment expenses are accepted by the database category constraint', () => {
  assert.match(migration, /drop constraint if exists expenses_category_check/)
  assert.match(migration, /add constraint expenses_category_check/)
  assert.match(migration, /'investment'/)
})

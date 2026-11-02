import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildInvestorExpenseGroupMessage } from '../api/telegram/_lib/investorIncomeMessages.js'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'

const migration = readFileSync(
  new URL('../migrations/144_expense_investor_group_notifications.sql', import.meta.url),
  'utf8'
)
const endpoint = readFileSync(
  new URL('../api/telegram/employee-notification.js', import.meta.url),
  'utf8'
)
const expensesPage = readFileSync(
  new URL('../src/pages/Expenses.jsx', import.meta.url),
  'utf8'
)
const bazaarPage = readFileSync(
  new URL('../src/pages/DailyBazaar.jsx', import.meta.url),
  'utf8'
)
const notifications = readFileSync(
  new URL('../src/lib/telegramNotifications.js', import.meta.url),
  'utf8'
)
const cliHealth = readFileSync(
  new URL('../scripts/check-db-health.js', import.meta.url),
  'utf8'
)

function makeHealthClient({ missingTable = '' } = {}) {
  return {
    from(name) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve(name === missingTable
                ? { error: { message: `relation "${name}" does not exist` } }
                : { data: [], error: null })
            },
          }
        },
      }
    },
    rpc() {
      return Promise.resolve({ error: { message: 'validation error' } })
    },
  }
}

test('Investor expense message contains the saved expense, actor, and monthly total', () => {
  const message = buildInvestorExpenseGroupMessage({
    amount: 750_000,
    expense_date: '2026-08-26',
    category: 'repair',
    payment_method: 'card',
    vendor: 'Master <Ali>',
    description: 'Kitchen & ventilation',
    actor_name: 'Anna <Admin>',
  }, 'ru', 4_300_000)

  assert.match(message, /🧾 <b>Новый расход<\/b>/)
  assert.match(message, /Сумма: <b>750\D000 UZS<\/b>/)
  assert.match(message, /Дата: 26 августа 2026/)
  assert.match(message, /Категория: Ремонт/)
  assert.doesNotMatch(message, /Способ оплаты:/)
  assert.match(message, /Master &lt;Ali&gt;/)
  assert.match(message, /Kitchen &amp; ventilation/)
  assert.match(message, /Добавил\(а\): Anna &lt;Admin&gt;/)
  assert.match(message, /Расходы за месяц: <b>4\D300\D000 UZS<\/b>/)
})

test('Investor expense message localizes the Daily Bazaar fallback description', () => {
  const message = buildInvestorExpenseGroupMessage({
    amount: 120_000,
    expense_date: '2026-08-26',
    category: 'products_bazaar',
    payment_method: 'cash',
    description: 'Daily Bazaar purchase (4 items)',
    actor_name: 'Анна',
  }, 'ru')

  assert.match(message, /Описание: Покупка на ежедневном базаре \(4 поз\.\)/)
  assert.doesNotMatch(message, /Daily Bazaar purchase/)
})

test('Investor Bazaar expense message builder retains line and overall normal-price differences', () => {
  const message = buildInvestorExpenseGroupMessage({
    amount: 8_000,
    expense_date: '2026-08-26',
    category: 'products_bazaar',
    description: 'Daily Bazaar purchase (1 item)',
    actor_name: 'Анна',
  }, 'en', null, {
    bazaar_purchase_items: [{
      id: 'line-1', product_name: 'Kartoshka', quantity: 1, unit: 'kg', line_total: 8_000,
      normal_unit_price: 7_500, normal_line_total: 7_500, price_difference: 500, sort_order: 0,
    }],
  })

  assert.match(message, /Kartoshka/)
  assert.match(message, /Normal-price total: 7\D500 UZS · Paid: 8\D000 UZS/)
  assert.match(message, /Difference: <b>\+500 UZS<\/b>/)
})

test('new expenses queue immutable Investor delivery snapshots without replaying history', () => {
  assert.match(migration, /expense_investor_notification_deliveries/)
  assert.match(migration, /expense_id\s+uuid primary key references public\.expenses\(id\) on delete cascade/i)
  assert.match(migration, /target_key\s+text not null default 'salary_events'/i)
  assert.match(migration, /after insert on public\.expenses/i)
  assert.match(migration, /when \(new\.entry_type = 'expense'\)/i)
  assert.match(migration, /new\.expense_date[\s\S]*new\.category[\s\S]*new\.amount/)
  assert.doesNotMatch(migration, /select[\s\S]+from public\.expenses[\s\S]+insert into public\.expense_investor_notification_deliveries/i)
})

test('manual Accounting and new Daily Bazaar expenses request one shared Investor notification', () => {
  assert.match(notifications, /notifyTelegramInvestorExpense\(expenseId\)/)
  assert.match(notifications, /type: 'expense',[\s\S]*expenseId/)
  assert.equal((notifications.match(/\/api\/telegram\/employee-notification/g) || []).length, 1)
  assert.match(expensesPage, /notifyTelegramInvestorExpense\(savedExpense\.id\)/)
  assert.match(bazaarPage, /data: savedPurchase/)
  assert.match(bazaarPage, /!wasEditing && savedPurchase\?\.expense_id/)
  assert.match(bazaarPage, /notifyTelegramInvestorExpense\(savedPurchase\.expense_id\)/)
})

test('Investor expense delivery is creator-bound, Bazaar-authorized, and duplicate-safe', () => {
  assert.match(endpoint, /requireExpenseNotificationAccess/)
  assert.match(endpoint, /access\?\.includes\('expenses'\) \|\| access\?\.includes\('bazaar'\)/)
  assert.match(endpoint, /notifyInvestorExpense\(supabase, user, expenseId\)/)
  assert.match(endpoint, /existing\.actor_id !== user\.id/)
  assert.match(endpoint, /canRetryInvestorExpenseDelivery/)
  assert.match(endpoint, /PENDING_DELIVERY_RETRY_MS/)
  assert.match(endpoint, /loadSalaryGroupTarget\(supabase\)/)
  assert.match(endpoint, /from\('bazaar_purchases'\)/)
  assert.match(endpoint, /normal_unit_price,[\s\S]*normal_line_total,[\s\S]*price_difference/)
  assert.match(endpoint, /buildDailyBazaarReportPng/)
  assert.match(endpoint, /sendTelegramPhoto\(target\.chatId, photo/)
  assert.match(endpoint, /zar-kebab-bazaar-expense-\$\{normalizedDate\}\.png/)
  assert.match(endpoint, /buildInvestorExpenseGroupMessage\([\s\S]*?claimed\.data,[\s\S]*?target\.language,[\s\S]*?monthTotal,[\s\S]*?\)/)
  assert.doesNotMatch(endpoint, /buildInvestorExpenseGroupMessage\(claimed\.data, target\.language, monthTotal, bazaarPurchase\)/)
  assert.match(endpoint, /else \{[\s\S]*?sendTelegramMessage\(target\.chatId, text\)/)
  assert.match(endpoint, /target: delivery\?\.target_key \|\| 'salary_events'/)
  assert.match(endpoint, /telegram_message_id: telegramMessageId/)
})

test('Bazaar expense PNG renderer is bundled with its fonts in the notification function', () => {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(
    vercelConfig.functions?.['api/telegram/employee-notification.js']?.includeFiles,
    '{node_modules/@img/sharp-libvips-linux-x64/**,node_modules/notosans-fontface/fonts/NotoSans-{Regular,Italic,SemiBold,Bold,ExtraBold}.ttf}'
  )
})

test('database health requires Investor expense delivery tracking', async () => {
  const result = await runDbHealthChecks(makeHealthClient({
    missingTable: 'expense_investor_notification_deliveries',
  }))
  const failed = result.failed.find(check => (
    check.name === 'expense_investor_notification_deliveries'
  ))

  assert.equal(result.ok, false)
  assert.match(failed.hint, /144_expense_investor_group_notifications/)
  assert.match(cliHealth, /checkTable\('expense_investor_notification_deliveries'/)
})

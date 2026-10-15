import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MANUAL_EXPENSE_CATEGORIES,
  DEFAULT_MONTHLY_RENT_UZS,
  DEFAULT_MONTHLY_UTILITIES_UZS,
  getAccountingHistoryRange,
  buildEmployeeMealExpenseRows,
  buildFinalizedEmployeeMealExpenseRows,
  buildSalaryBonusExpenseRows,
  buildSalaryExpenseRows,
  buildSalaryPaymentExpenseRows,
  buildSalaryReactivationAbsenceRows,
  canRecordSalaryTransaction,
  convertSalaryAmountToDaily,
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expenseMatchesRange,
  expensePaymentMethodLabel,
  getDailySalaryAmount,
  getEmployeeMealExpenseEstimate,
  getEstimatedMonthlyExpenseSummary,
  getExpenseHistoryDeleteTarget,
  getNetIncome,
  getSalaryActiveUntil,
  getSalaryAbsenceForDate,
  getSalaryAbsenceDates,
  getSalaryBalance,
  getSalaryBonusAccruedAmount,
  getSalaryDue,
  getSalaryFineAmount,
  getSalaryCategoryForRole,
  getSalaryMonthEndDate,
  getSelectedMonthSalaryOperatingSummary,
  getTotalMonthlySalaryCommitment,
  getTotalSalaryDue,
  isGeneratedSalaryExpense,
  listLocalDateRange,
  normalizeExpenseAmount,
  normalizeSalaryEndDate,
  summarizeIncomeEntries,
  summarizeExpenseCashflow,
  summarizeExpenses,
} from '../src/lib/expenses.js'

test('accounting history presets cover this month, last month, and all time', () => {
  assert.deepEqual(
    getAccountingHistoryRange('thisMonth', '2026-07-14'),
    { dateFrom: '2026-07-01', dateTo: '2026-07-14' }
  )
  assert.deepEqual(
    getAccountingHistoryRange('lastMonth', '2026-07-14'),
    { dateFrom: '2026-06-01', dateTo: '2026-06-30' }
  )
  assert.deepEqual(
    getAccountingHistoryRange('lastMonth', '2026-01-10'),
    { dateFrom: '2025-12-01', dateTo: '2025-12-31' }
  )
  assert.deepEqual(
    getAccountingHistoryRange('allTime', '2026-07-14'),
    { dateFrom: '2000-01-01', dateTo: '2026-07-14' }
  )
})

test('system-generated expense descriptions follow the selected language', () => {
  assert.equal(expenseDescriptionLabel('Salary payment', 'ru'), 'Выплата зарплаты')
  assert.equal(expenseDescriptionLabel('Salary payment', 'uz'), 'Maosh to‘lovi')
  assert.equal(expenseDescriptionLabel('Employee bonus', 'ru'), 'Бонус сотруднику')
  assert.equal(
    expenseDescriptionLabel('Daily Bazaar purchase (12 items)', 'ru'),
    'Покупка на ежедневном базаре (12 поз.)'
  )
  assert.equal(
    expenseDescriptionLabel('Daily Bazaar purchase (1 item)', 'uz'),
    'Kunlik bozor xaridi (1 ta mahsulot)'
  )
  assert.equal(expenseDescriptionLabel('Manager-entered note', 'ru'), 'Manager-entered note')
  assert.equal(expenseDescriptionLabel('Order: TA-7570, o1790853706131', 'ru'), 'Заказ: TA-7570, o1790853706131')
  assert.equal(expenseDescriptionLabel('Order: TA-7570', 'uz'), 'Buyurtma: TA-7570')
  assert.equal(expenseDescriptionLabel('Order: TA-7570', 'en'), 'Order: TA-7570')
})

test('expense summary totals category and payment method spending', () => {
  const summary = summarizeExpenses([
    { category: 'salary_cook', payment_method: 'cash', amount: 1_200_000 },
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 900_000 },
    { category: 'products_bazaar', payment_method: 'terminal', amount: 450_000 },
    { category: 'products_bazaar', payment_method: 'card', amount: 150_000 },
    { category: 'equipment', payment_method: 'cash', amount: 0 },
  ])

  assert.equal(summary.total, 1_800_000)
  assert.equal(summary.count, 3)
  assert.equal(summary.byCategory.salary_cook, 1_200_000)
  assert.equal(summary.byCategory.products_bazaar, 600_000)
  assert.equal(summary.byMethod.cash, 1_200_000)
  assert.equal(summary.byMethod.terminal, 450_000)
  assert.equal(summary.byMethod.card, 150_000)
})

test('net income subtracts expenses from cafe revenue', () => {
  assert.equal(getNetIncome(2_700_000, [
    { category: 'salary_waiter', payment_method: 'cash', amount: 400_000 },
    { category: 'products_bazaar', payment_method: 'terminal', amount: 950_000 },
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 500_000 },
  ]), 1_850_000)
})

test('expense cashflow shows what is left by tracked payment method', () => {
  const cashflow = summarizeExpenseCashflow([
    { payment_status: 'paid', payment_method: 'cash', total: 1_000_000 },
    {
      payment_status: 'paid',
      payment_method: 'mixed',
      total: 600_000,
      loyalty_used_amount: 50_000,
      payments: [
        { method: 'card', amount: 250_000 },
        { method: 'terminal', amount: 350_000 },
      ],
    },
    {
      payment_status: 'paid',
      payment_method: 'qr',
      total: 90_000,
    },
  ], [
    { payment_method: 'cash', amount: 300_000 },
    { payment_method: 'card', amount: 100_000 },
    { payment_method: 'terminal', amount: 400_000 },
    { entry_type: 'income', payment_method: 'cash', amount: 200_000 },
  ])

  assert.equal(cashflow.byMethod.cash.income, 1_200_000)
  assert.equal(cashflow.byMethod.cash.expenses, 300_000)
  assert.equal(cashflow.byMethod.cash.left, 900_000)
  assert.equal(cashflow.byMethod.card.left, 150_000)
  assert.equal(cashflow.byMethod.terminal.income, 440_000)
  assert.equal(cashflow.byMethod.terminal.left, 40_000)
  assert.equal(cashflow.byMethod.qr, undefined)
  assert.equal(cashflow.byMethod.loyalty_card.income, 50_000)
  assert.equal(cashflow.byMethod.loyalty_card.left, 50_000)
  assert.deepEqual(cashflow.rows.map(row => row.method), ['cash', 'card', 'terminal', 'loyalty_card', 'salary'])
})

test('expense cashflow does not double count explicit loyalty payment rows', () => {
  const cashflow = summarizeExpenseCashflow([
    {
      payment_status: 'paid',
      payment_method: 'mixed',
      total: 120_000,
      loyalty_used_amount: 30_000,
      payments: [
        { method: 'cash', amount: 90_000 },
        { method: 'loyalty_card', amount: 30_000 },
      ],
    },
  ], [])

  assert.equal(cashflow.byMethod.cash.income, 90_000)
  assert.equal(cashflow.byMethod.loyalty_card.income, 30_000)
})

test('report cashflow can start from cafe sales without adding investor support', () => {
  const cashflow = summarizeExpenseCashflow([
    { payment_status: 'paid', payment_method: 'cash', total: 6_449_513 },
  ], [
    { entry_type: 'income', category: 'investor_support', payment_method: 'card', amount: 1_820_000 },
    { entry_type: 'expense', category: 'products_bazaar', payment_method: 'cash', amount: 1_215_500 },
    { entry_type: 'expense', category: 'salary_waiter', payment_method: 'cash', amount: 250_000 },
  ], { includeIncomeEntries: false })

  assert.equal(cashflow.byMethod.cash.income, 6_449_513)
  assert.equal(cashflow.byMethod.cash.left, 4_984_013)
  assert.equal(cashflow.byMethod.card.income, 0)
})

test('income summary tracks investor support separately from cafe sales', () => {
  const summary = summarizeIncomeEntries([
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 2_000_000 },
    { entry_type: 'income', category: 'other_income', payment_method: 'card', amount: 500_000 },
    { entry_type: 'expense', category: 'rent', payment_method: 'cash', amount: 800_000 },
  ])

  assert.equal(summary.total, 2_500_000)
  assert.equal(summary.count, 2)
  assert.equal(summary.byCategory.investor_support, 2_000_000)
  assert.equal(summary.byMethod.cash, 2_000_000)
  assert.equal(summary.byMethod.card, 500_000)
})

test('expense helpers normalize values and labels for accountant entry', () => {
  assert.equal(normalizeExpenseAmount('12000.7'), 12001)
  assert.equal(normalizeExpenseAmount('-5000'), 0)
  assert.equal(normalizeExpenseAmount('1 000 000'), 1_000_000)
  assert.equal(convertSalaryAmountToDaily(8_000_000, 'monthly'), 266_667)
  assert.equal(convertSalaryAmountToDaily(350_000, 'daily'), 350_000)
  assert.equal(expenseCategoryLabel('salary_manager', 'ru'), 'Зарплата менеджера')
  assert.equal(expenseCategoryLabel('salary_one_time', 'en'), 'One-time employee salary')
  assert.equal(expenseCategoryLabel('charcoal', 'uz'), 'Ko‘mir')
  assert.equal(expenseCategoryLabel('tax', 'uz'), 'Soliq')
  assert.equal(expenseCategoryLabel('tax', 'ru'), 'Налоги')
  assert.equal(expenseCategoryLabel('tax', 'en'), 'Taxes')
  assert.equal(expensePaymentMethodLabel('terminal', 'uz'), 'Terminal')
  assert.equal(expenseMatchesRange({ expense_date: '2026-06-15' }, '2026-06-01', '2026-06-30'), true)
  assert.equal(expenseMatchesRange({ expense_date: '2026-07-01' }, '2026-06-01', '2026-06-30'), false)
})

test('manual expense categories offer specific tracking choices without removing legacy other labels', () => {
  const manualKeys = MANUAL_EXPENSE_CATEGORIES.map(category => category.key)

  assert.equal(EXPENSE_CATEGORIES.some(category => category.key === 'other'), true)
  assert.equal(manualKeys.includes('other'), false)
  assert.equal(manualKeys.includes('products_bazaar'), false)
  assert.equal(manualKeys.includes('salary_one_time'), true)
  assert.equal(manualKeys.includes('charcoal'), true)
  assert.equal(manualKeys.includes('tax'), true)
})

test('new income entry offers investor support only while retaining legacy labels', () => {
  assert.deepEqual(INCOME_CATEGORIES.map(category => category.key), ['investor_support'])
  assert.equal(expenseCategoryLabel('other_income', 'en'), 'Other income')
})

test('employee salary ledger generates effective-dated daily expense rows and due balance', () => {
  const waiterProfile = {
    id: 'salary-waiter-1',
    profile_id: 'waiter-1',
    employee_name: 'Ali Waiter',
    joined_at: '2026-06-15',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [
      { effective_from: '2026-06-15', amount: 8_100_000, rate_unit: 'monthly', created_at: '2026-06-15T08:00:00Z' },
      { effective_from: '2026-06-16', amount: 350_000, rate_unit: 'daily', created_at: '2026-06-16T08:00:00Z' },
    ],
    payments: [
      { paid_date: '2026-06-16', amount: 270_000 },
    ],
  }

  const salaryRows = buildSalaryExpenseRows([
    waiterProfile,
    {
      id: 'salary-cashier-1',
      profile_id: 'cashier-1',
      employee_name: 'Cashier',
      joined_at: '2026-06-16',
      payment_method: 'terminal',
      profile: { role: 'cashier' },
      rates: [{ effective_from: '2026-06-16', amount: 350_000, rate_unit: 'daily' }],
      payments: [],
    },
  ], '2026-06-14', '2026-06-16')

  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-15'), 270_000)
  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-16'), 350_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-16'), 350_000)
  assert.equal(getSalaryCategoryForRole('waiter'), 'salary_waiter')
  assert.equal(getSalaryCategoryForRole('cashier'), 'salary_manager')
  assert.deepEqual(salaryRows.map(row => row.expense_date), ['2026-06-15', '2026-06-16', '2026-06-16'])
  assert.equal(salaryRows[0].amount, 270_000)
  assert.equal(salaryRows[1].amount, 350_000)
  assert.equal(salaryRows[2].payment_method, 'terminal')

  const summary = summarizeExpenses(salaryRows)
  assert.equal(summary.total, 970_000)
  assert.equal(summary.byCategory.salary_waiter, 620_000)
  assert.equal(summary.byCategory.salary_manager, 350_000)
})

test('monthly salary commitment sums current active employee rates', () => {
  const employeeA = {
    id: 'salary-monthly-commitment-a',
    is_active: true,
    rates: [{ effective_from: '2026-06-01', amount: 2_000_000, rate_unit: 'monthly' }],
  }
  const employeeB = {
    id: 'salary-monthly-commitment-b',
    is_active: true,
    rates: [{ effective_from: '2026-06-01', amount: 5_000_000, rate_unit: 'monthly' }],
  }
  const dailyEmployee = {
    id: 'salary-monthly-commitment-daily',
    is_active: true,
    rates: [{ effective_from: '2026-06-01', amount: 100_000, rate_unit: 'daily' }],
  }
  const inactiveEmployee = {
    id: 'salary-monthly-commitment-inactive',
    is_active: false,
    rates: [{ effective_from: '2026-06-01', amount: 9_000_000, rate_unit: 'monthly' }],
  }
  const futureRaise = {
    id: 'salary-monthly-commitment-future',
    is_active: true,
    rates: [
      { effective_from: '2026-07-01', amount: 7_000_000, rate_unit: 'monthly' },
      { effective_from: '2026-06-01', amount: 1_000_000, rate_unit: 'monthly' },
    ],
  }

  assert.equal(
    getTotalMonthlySalaryCommitment([employeeA, employeeB], '2026-06-20'),
    7_000_000,
  )
  assert.equal(
    getTotalMonthlySalaryCommitment([employeeA, employeeB, dailyEmployee, inactiveEmployee, futureRaise], '2026-06-20'),
    11_000_000,
  )
})

test('deactivated salary profiles stop accruing after ended_at while keeping due history', () => {
  const formerWaiter = {
    id: 'salary-former-1',
    profile_id: 'waiter-2',
    employee_name: 'Former Waiter',
    joined_at: '2026-06-01',
    ended_at: '2026-06-10',
    is_active: false,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [{ paid_date: '2026-06-05', amount: 900_000 }],
  }

  const rows = buildSalaryExpenseRows([formerWaiter], '2026-06-01', '2026-06-16')

  assert.equal(getSalaryActiveUntil(formerWaiter, '2026-06-16'), '2026-06-10')
  assert.equal(rows.length, 10)
  assert.equal(rows.at(-1).expense_date, '2026-06-10')
  assert.equal(getSalaryDue(formerWaiter, '2026-06-16'), 2_100_000)
  assert.equal(getTotalSalaryDue([formerWaiter], '2026-06-16'), 2_100_000)
  assert.equal(canRecordSalaryTransaction(formerWaiter, 'payment', '2026-06-16'), true)
  assert.equal(canRecordSalaryTransaction(formerWaiter, 'bonus', '2026-06-16'), false)
})

test('inactive salary profiles remain payable only while cafe debt is outstanding', () => {
  const inactiveEmployee = {
    id: 'salary-inactive-payable-1',
    joined_at: '2026-06-01',
    ended_at: '2026-06-10',
    is_active: false,
    rates: [{ effective_from: '2026-06-01', amount: 100_000, rate_unit: 'daily' }],
    payments: [],
  }

  assert.equal(canRecordSalaryTransaction(inactiveEmployee, 'payment', '2026-06-16'), true)
  assert.equal(canRecordSalaryTransaction({
    ...inactiveEmployee,
    payments: [{ paid_date: '2026-06-16', amount: 1_000_000 }],
  }, 'payment', '2026-06-16'), false)
  assert.equal(canRecordSalaryTransaction({ ...inactiveEmployee, is_active: true }, 'bonus', '2026-06-16'), true)
  assert.equal(canRecordSalaryTransaction({ ...inactiveEmployee, deleted_at: '2026-06-16T10:00:00Z' }, 'payment', '2026-06-16'), false)
})

test('backdated salary deactivation uses selected end date for due balance', () => {
  const forgottenDeactivation = {
    id: 'salary-backdated-end-1',
    profile_id: 'oybek-1',
    employee_name: 'Oybek',
    joined_at: '2026-05-01',
    ended_at: '2026-05-30',
    is_active: false,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-05-01', amount: 400_000, rate_unit: 'daily' }],
    payments: [],
  }

  const rows = buildSalaryExpenseRows([forgottenDeactivation], '2026-05-01', '2026-07-05')

  assert.equal(normalizeSalaryEndDate(forgottenDeactivation, '2026-05-30', '2026-07-05'), '2026-05-30')
  assert.equal(rows.length, 30)
  assert.equal(rows.at(-1).expense_date, '2026-05-30')
  assert.equal(getSalaryDue(forgottenDeactivation, '2026-07-05'), 12_000_000)
})

test('salary end date normalization keeps deactivation dates inside valid employment window', () => {
  const employee = {
    joined_at: '2026-05-10',
    ended_at: null,
  }

  assert.equal(normalizeSalaryEndDate(employee, '2026-05-09', '2026-07-05'), '2026-05-10')
  assert.equal(normalizeSalaryEndDate(employee, '2026-08-01', '2026-07-05'), '2026-07-05')
  assert.equal(normalizeSalaryEndDate(employee, '', '2026-07-05'), '2026-07-05')
})

test('reactivated salary profiles skip the inactive dates before accruing again', () => {
  const employee = {
    id: 'salary-reactivated-gap-1',
    profile_id: 'waiter-reactivated-gap-1',
    employee_name: 'Reactivated Waiter',
    joined_at: '2026-05-28',
    ended_at: '2026-06-01',
    is_active: false,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-05-28', amount: 100_000, rate_unit: 'daily' }],
    payments: [],
    absences: [],
  }

  const reactivationAbsences = buildSalaryReactivationAbsenceRows(employee, '2026-06-05')
  const reactivatedEmployee = {
    ...employee,
    ended_at: null,
    is_active: true,
    absences: reactivationAbsences,
  }
  const rows = buildSalaryExpenseRows([reactivatedEmployee], '2026-06-01', '2026-06-07')

  assert.deepEqual(listLocalDateRange('2026-06-01', '2026-06-05'), [
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
    '2026-06-05',
  ])
  assert.deepEqual(reactivationAbsences.map(row => row.absence_date), [
    '2026-06-02',
    '2026-06-03',
    '2026-06-04',
  ])
  assert.deepEqual(rows.map(row => row.expense_date), ['2026-06-01', '2026-06-05', '2026-06-06', '2026-06-07'])
  assert.equal(getSalaryDue(reactivatedEmployee, '2026-06-07'), 800_000)
})

test('safe-deleted salary profiles keep recorded accounting payment and bonus history', () => {
  const deletedEmployee = {
    id: 'salary-safe-deleted-1',
    profile_id: 'deleted-user-1',
    employee_name: 'Deleted Employee Name',
    joined_at: '2026-06-01',
    ended_at: '2026-06-10',
    deleted_at: '2026-06-12T09:00:00Z',
    is_active: false,
    payment_method: 'cash',
    profile: { role: 'cashier' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'deleted-payment-1', paid_date: '2026-06-10', amount: 1_500_000, payment_method: 'terminal', note: 'Final payout' },
    ],
    bonuses: [
      { id: 'deleted-bonus-1', bonus_date: '2026-06-08', amount: 250_000, payment_method: 'cash', note: 'Shift bonus' },
    ],
  }

  const accountingRows = [
    ...buildSalaryPaymentExpenseRows([deletedEmployee], '2026-06-01', '2026-06-30'),
    ...buildSalaryBonusExpenseRows([deletedEmployee], '2026-06-01', '2026-06-30'),
  ]

  assert.deepEqual(accountingRows.map(row => [row.id, row.vendor, row.amount, row.payment_method]), [
    ['salary-payment-deleted-payment-1', 'Deleted Employee Name', 1_500_000, 'terminal'],
    ['salary-bonus-deleted-bonus-1', 'Deleted Employee Name', 250_000, 'cash'],
  ])
  assert.equal(summarizeExpenses(accountingRows).total, 1_750_000)
})

test('salary absences skip daily accrual and reduce salary due for those dates', () => {
  const waiterProfile = {
    id: 'salary-absence-1',
    profile_id: 'waiter-absence-1',
    employee_name: 'Absent Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 200_000, rate_unit: 'daily' }],
    payments: [],
    absences: [
      { id: 'absence-1', absence_date: '2026-06-02' },
      { id: 'absence-2', absence_date: '2026-06-04' },
    ],
  }

  const rows = buildSalaryExpenseRows([waiterProfile], '2026-06-01', '2026-06-05')

  assert.deepEqual(rows.map(row => row.expense_date), ['2026-06-01', '2026-06-03', '2026-06-05'])
  assert.equal(summarizeExpenses(rows).total, 600_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-05'), 600_000)
})

test('salary absence dates collapse duplicate rows into one employee day', () => {
  const absenceDates = getSalaryAbsenceDates({
    absences: [
      { id: 'absence-1', absence_date: '2026-07-23' },
      { id: 'absence-duplicate', absence_date: '2026-07-23' },
      { id: 'absence-2', absence_date: '2026-07-24' },
    ],
  })

  assert.deepEqual([...absenceDates], ['2026-07-23', '2026-07-24'])
  assert.equal(absenceDates.has('2026-07-23'), true)
  assert.equal(absenceDates.has('2026-07-25'), false)
})

test('salary absence lookup returns the exact record for a same-day undo', () => {
  const salaryProfile = {
    absences: [
      { id: 'yesterday-absence', absence_date: '2026-08-12' },
      { id: 'today-absence', absence_date: '2026-08-13' },
    ],
  }

  assert.equal(getSalaryAbsenceForDate(salaryProfile, '2026-08-13')?.id, 'today-absence')
  assert.equal(getSalaryAbsenceForDate(salaryProfile, '2026-08-14'), null)
  assert.equal(getSalaryAbsenceForDate(salaryProfile, 'not-a-date'), null)
})

test('legacy salary bonuses remain separate expenses without changing salary due', () => {
  const waiterProfile = {
    id: 'salary-bonus-1',
    profile_id: 'waiter-3',
    employee_name: 'Bonus Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [],
    bonuses: [
      { id: 'bonus-1', bonus_date: '2026-06-16', amount: 500_000, payment_method: 'card', note: 'Great service', created_at: '2026-06-16T09:24:00Z', accrues_to_salary: false },
    ],
  }

  const bonusRows = buildSalaryBonusExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')

  assert.equal(bonusRows.length, 1)
  assert.equal(bonusRows[0].amount, 500_000)
  assert.equal(bonusRows[0].payment_method, 'card')
  assert.equal(bonusRows[0].created_at, '2026-06-16T09:24:00Z')
  assert.equal(getSalaryDue(waiterProfile, '2026-06-16'), 4_800_000)
})

test('new manual and automatic KPI bonuses accumulate in salary due until payment', () => {
  const waiterProfile = {
    id: 'salary-accrued-bonuses-1',
    profile_id: 'waiter-accrued-bonuses-1',
    employee_name: 'Accrued Bonus Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [{ id: 'payment-1', paid_date: '2026-06-03', amount: 400_000 }],
    fines: [],
    bonuses: [
      { id: 'manual-accrual', bonus_date: '2026-06-02', amount: 500_000, source_type: 'manual', accrues_to_salary: true },
      { id: 'kpi-accrual', bonus_date: '2026-06-03', amount: 250_000, source_type: 'daily_kpi', accrues_to_salary: true },
      { id: 'future-accrual', bonus_date: '2026-06-04', amount: 1_000_000, source_type: 'manual', accrues_to_salary: true },
      { id: 'legacy-paid', bonus_date: '2026-06-02', amount: 100_000, payment_method: 'card', accrues_to_salary: false },
    ],
  }

  assert.equal(getSalaryBonusAccruedAmount(waiterProfile, '2026-06-01', '2026-06-02'), 500_000)
  assert.equal(getSalaryBonusAccruedAmount(waiterProfile, '', '2026-06-03'), 750_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-03'), 1_250_000)
  assert.deepEqual(
    buildSalaryBonusExpenseRows([waiterProfile], '2026-06-01', '2026-06-03').map(row => row.id),
    ['salary-bonus-legacy-paid'],
  )
})

test('salary expense history uses recorded salary payments, not daily accrual rows', () => {
  const waiterProfile = {
    id: 'salary-payment-1',
    profile_id: 'waiter-4',
    employee_name: 'Paid Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'payment-1', paid_date: '2026-06-16', amount: 900_000, payment_method: 'card', note: 'Week payout', created_at: '2026-06-16T11:42:00Z' },
    ],
  }

  const paymentRows = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')
  const accrualRows = buildSalaryExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')

  assert.equal(paymentRows.length, 1)
  assert.equal(paymentRows[0].amount, 900_000)
  assert.equal(paymentRows[0].payment_method, 'card')
  assert.equal(paymentRows[0].created_at, '2026-06-16T11:42:00Z')
  assert.equal(accrualRows.length, 16)
})

test('salary rate changes are effective-dated and do not rewrite old accrual history', () => {
  const waiterProfile = {
    id: 'salary-rate-change-1',
    profile_id: 'waiter-rate-change-1',
    employee_name: 'Stable History Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [
      { id: 'rate-old', effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily', created_at: '2026-06-01T08:00:00Z' },
      { id: 'rate-new', effective_from: '2026-06-10', amount: 450_000, rate_unit: 'daily', created_at: '2026-06-10T08:00:00Z' },
      { id: 'rate-future', effective_from: '2026-07-01', amount: 900_000, rate_unit: 'daily', created_at: '2026-07-01T08:00:00Z' },
    ],
    payments: [],
  }

  const rowsBeforeChange = buildSalaryExpenseRows([waiterProfile], '2026-06-01', '2026-06-09')
  const rowsAcrossChange = buildSalaryExpenseRows([waiterProfile], '2026-06-08', '2026-06-12')

  assert.deepEqual(rowsBeforeChange.map(row => row.amount), Array(9).fill(300_000))
  assert.deepEqual(rowsAcrossChange.map(row => [row.expense_date, row.amount]), [
    ['2026-06-08', 300_000],
    ['2026-06-09', 300_000],
    ['2026-06-10', 450_000],
    ['2026-06-11', 450_000],
    ['2026-06-12', 450_000],
  ])
  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-09'), 300_000)
  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-10'), 450_000)
  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-30'), 450_000)
})

test('same-day salary changes use the latest created rate without touching previous days', () => {
  const cashierProfile = {
    id: 'salary-same-day-rate-1',
    profile_id: 'cashier-rate-1',
    employee_name: 'Same Day Cashier',
    joined_at: '2026-06-01',
    payment_method: 'terminal',
    profile: { role: 'cashier' },
    rates: [
      { id: 'rate-morning', effective_from: '2026-06-05', amount: 200_000, rate_unit: 'daily', created_at: '2026-06-05T08:00:00Z' },
      { id: 'rate-evening', effective_from: '2026-06-05', amount: 250_000, rate_unit: 'daily', created_at: '2026-06-05T18:00:00Z' },
      { id: 'rate-initial', effective_from: '2026-06-01', amount: 150_000, rate_unit: 'daily', created_at: '2026-06-01T08:00:00Z' },
    ],
    payments: [],
  }

  const rows = buildSalaryExpenseRows([cashierProfile], '2026-06-04', '2026-06-06')

  assert.deepEqual(rows.map(row => [row.expense_date, row.amount]), [
    ['2026-06-04', 150_000],
    ['2026-06-05', 250_000],
    ['2026-06-06', 250_000],
  ])
})

test('salary due honors old and new rates, ignores future rates, and subtracts only payments up to date', () => {
  const cookProfile = {
    id: 'salary-due-rate-change-1',
    profile_id: 'cook-rate-1',
    employee_name: 'Due Cook',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'cook' },
    rates: [
      { effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' },
      { effective_from: '2026-06-04', amount: 600_000, rate_unit: 'daily' },
      { effective_from: '2026-06-20', amount: 1_200_000, rate_unit: 'daily' },
    ],
    payments: [
      { paid_date: '2026-06-03', amount: 600_000 },
      { paid_date: '2026-06-07', amount: 600_000 },
      { paid_date: '2026-06-21', amount: 9_000_000 },
    ],
  }

  assert.equal(getSalaryDue(cookProfile, '2026-06-03'), 300_000)
  assert.equal(getSalaryDue(cookProfile, '2026-06-06'), 2_100_000)
})

test('recorded salary payments keep their original amounts after a later salary change', () => {
  const waiterProfile = {
    id: 'salary-payment-history-rate-change-1',
    profile_id: 'waiter-payment-history-1',
    employee_name: 'Paid History Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [
      { effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' },
      { effective_from: '2026-06-15', amount: 600_000, rate_unit: 'daily' },
    ],
    payments: [
      { id: 'payment-old', paid_date: '2026-06-10', amount: 3_000_000, payment_method: 'cash', note: 'Old rate payout' },
      { id: 'payment-new', paid_date: '2026-06-20', amount: 3_600_000, payment_method: 'terminal', note: 'New rate payout' },
    ],
  }

  const juneRows = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-30')
  const oldHistoryRows = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-14')

  assert.deepEqual(juneRows.map(row => [row.id, row.expense_date, row.amount, row.payment_method]), [
    ['salary-payment-payment-old', '2026-06-10', 3_000_000, 'cash'],
    ['salary-payment-payment-new', '2026-06-20', 3_600_000, 'terminal'],
  ])
  assert.deepEqual(oldHistoryRows.map(row => row.amount), [3_000_000])
  assert.equal(summarizeExpenses(oldHistoryRows).total, 3_000_000)
})

test('salary payments and bonuses appear in expenses without double-counting daily accruals', () => {
  const waiterProfile = {
    id: 'salary-expenses-page-1',
    profile_id: 'waiter-expenses-page-1',
    employee_name: 'Expenses Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [
      { effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' },
      { effective_from: '2026-06-15', amount: 600_000, rate_unit: 'daily' },
    ],
    payments: [
      { id: 'payment-june', paid_date: '2026-06-10', amount: 3_000_000, payment_method: 'cash', note: 'Salary paid' },
    ],
    bonuses: [
      { id: 'bonus-june', bonus_date: '2026-06-16', amount: 500_000, payment_method: 'card', note: 'Holiday bonus' },
    ],
  }

  const salaryExpenses = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-30')
  const salaryBonusExpenses = buildSalaryBonusExpenseRows([waiterProfile], '2026-06-01', '2026-06-30')
  const manualExpenses = [
    { id: 'bazaar-1', expense_date: '2026-06-12', category: 'products_bazaar', payment_method: 'terminal', amount: 900_000 },
  ]
  const allExpenses = [...salaryExpenses, ...salaryBonusExpenses, ...manualExpenses]
  const accrualRows = buildSalaryExpenseRows([waiterProfile], '2026-06-01', '2026-06-30')

  const summary = summarizeExpenses(allExpenses)

  assert.equal(accrualRows.length, 30)
  assert.equal(summary.total, 4_400_000)
  assert.equal(summary.count, 3)
  assert.equal(summary.byCategory.salary_waiter, 3_500_000)
  assert.equal(summary.byCategory.products_bazaar, 900_000)
  assert.equal(summary.byMethod.cash, 3_000_000)
  assert.equal(summary.byMethod.card, 500_000)
  assert.equal(summary.byMethod.terminal, 900_000)
})

test('salary payment and bonus expenses are filtered by their recorded dates', () => {
  const managerProfile = {
    id: 'salary-filtered-expenses-1',
    profile_id: 'manager-filter-1',
    employee_name: 'Filtered Manager',
    joined_at: '2026-05-01',
    payment_method: 'terminal',
    profile: { role: 'owner' },
    rates: [{ effective_from: '2026-05-01', amount: 10_000_000, rate_unit: 'monthly' }],
    payments: [
      { id: 'payment-may', paid_date: '2026-05-31', amount: 5_000_000 },
      { id: 'payment-june', paid_date: '2026-06-30', amount: 5_000_000, payment_method: 'card' },
      { id: 'payment-july', paid_date: '2026-07-01', amount: 5_000_000 },
    ],
    bonuses: [
      { id: 'bonus-may', bonus_date: '2026-05-31', amount: 700_000 },
      { id: 'bonus-june', bonus_date: '2026-06-15', amount: 800_000, payment_method: 'cash' },
      { id: 'bonus-july', bonus_date: '2026-07-01', amount: 900_000 },
    ],
  }

  const rows = [
    ...buildSalaryPaymentExpenseRows([managerProfile], '2026-06-01', '2026-06-30'),
    ...buildSalaryBonusExpenseRows([managerProfile], '2026-06-01', '2026-06-30'),
  ]

  assert.deepEqual(rows.map(row => [row.id, row.expense_date, row.amount, row.category, row.payment_method]), [
    ['salary-payment-payment-june', '2026-06-30', 5_000_000, 'salary_manager', 'card'],
    ['salary-bonus-bonus-june', '2026-06-15', 800_000, 'salary_manager', 'cash'],
  ])
})

test('salary transaction payment methods flow into accounting summaries', () => {
  const salaryProfile = {
    id: 'salary-accounting-methods-1',
    profile_id: 'salary-accounting-methods-user-1',
    employee_name: 'Method Cashier',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'cashier' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'payment-card', paid_date: '2026-06-12', amount: 1_200_000, payment_method: 'card', note: 'Paid by card' },
      { id: 'payment-fallback', paid_date: '2026-06-13', amount: 800_000, note: 'Uses profile method' },
    ],
    bonuses: [
      { id: 'bonus-terminal', bonus_date: '2026-06-14', amount: 500_000, payment_method: 'terminal', note: 'Terminal bonus' },
    ],
  }

  const accountingRows = [
    ...buildSalaryPaymentExpenseRows([salaryProfile], '2026-06-01', '2026-06-30'),
    ...buildSalaryBonusExpenseRows([salaryProfile], '2026-06-01', '2026-06-30'),
  ]
  const summary = summarizeExpenses(accountingRows)
  const cashflow = summarizeExpenseCashflow([
    { payment_status: 'paid', payment_method: 'cash', total: 2_000_000 },
    { payment_status: 'paid', payment_method: 'card', total: 2_000_000 },
    { payment_status: 'paid', payment_method: 'terminal', total: 2_000_000 },
  ], accountingRows)

  assert.deepEqual(accountingRows.map(row => [row.id, row.payment_method, row.amount]), [
    ['salary-payment-payment-card', 'card', 1_200_000],
    ['salary-payment-payment-fallback', 'cash', 800_000],
    ['salary-bonus-bonus-terminal', 'terminal', 500_000],
  ])
  assert.equal(summary.byMethod.card, 1_200_000)
  assert.equal(summary.byMethod.cash, 800_000)
  assert.equal(summary.byMethod.terminal, 500_000)
  assert.equal(cashflow.byMethod.card.expenses, 1_200_000)
  assert.equal(cashflow.byMethod.card.left, 800_000)
  assert.equal(cashflow.byMethod.cash.expenses, 800_000)
  assert.equal(cashflow.byMethod.cash.left, 1_200_000)
  assert.equal(cashflow.byMethod.terminal.expenses, 500_000)
  assert.equal(cashflow.byMethod.terminal.left, 1_500_000)
})

test('legacy paid bonuses do not alter salary due or payment history balances', () => {
  const waiterProfile = {
    id: 'salary-bonus-due-1',
    profile_id: 'waiter-bonus-due-1',
    employee_name: 'Bonus Due Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [{ id: 'payment-1', paid_date: '2026-06-05', amount: 900_000 }],
    bonuses: [{ id: 'bonus-1', bonus_date: '2026-06-06', amount: 2_000_000, accrues_to_salary: false }],
  }

  const paymentRows = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-10')
  const bonusRows = buildSalaryBonusExpenseRows([waiterProfile], '2026-06-01', '2026-06-10')

  assert.equal(getSalaryDue(waiterProfile, '2026-06-10'), 2_100_000)
  assert.equal(summarizeExpenses(paymentRows).total, 900_000)
  assert.equal(summarizeExpenses(bonusRows).total, 2_000_000)
})

test('salary balance preserves advance payments and carries their credit forward', () => {
  const salaryProfile = {
    id: 'salary-advance-balance-1',
    joined_at: '2026-08-01',
    rates: [{ effective_from: '2026-08-01', amount: 100_000, rate_unit: 'daily' }],
    payments: [
      { id: 'payment-settle-first-day', paid_date: '2026-08-01', amount: 100_000 },
    ],
    fines: [],
    absences: [],
  }

  assert.equal(getSalaryBalance(salaryProfile, '2026-08-01'), 0)

  salaryProfile.payments.push(
    { id: 'payment-advance', paid_date: '2026-08-01', amount: 500_000 },
    { id: 'payment-future', paid_date: '2026-08-03', amount: 200_000 },
  )

  assert.equal(getSalaryBalance(salaryProfile, '2026-08-01'), -500_000)
  assert.equal(getSalaryDue(salaryProfile, '2026-08-01'), 0)
  assert.equal(getSalaryBalance(salaryProfile, '2026-08-02'), -400_000)
  assert.equal(getSalaryBalance(salaryProfile, '2026-08-03'), -500_000)
})

test('total salary due remains gross liability and does not net another employee advance', () => {
  const employeeWithAdvance = {
    id: 'salary-advance-total-1',
    joined_at: '2026-08-01',
    rates: [{ effective_from: '2026-08-01', amount: 100_000, rate_unit: 'daily' }],
    payments: [{ paid_date: '2026-08-01', amount: 600_000 }],
    fines: [],
    absences: [],
  }
  const employeeWithLiability = {
    id: 'salary-liability-total-1',
    joined_at: '2026-08-01',
    rates: [{ effective_from: '2026-08-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [],
    fines: [],
    absences: [],
  }

  assert.equal(getSalaryBalance(employeeWithAdvance, '2026-08-01'), -500_000)
  assert.equal(getSalaryDue(employeeWithAdvance, '2026-08-01'), 0)
  assert.equal(getSalaryDue(employeeWithLiability, '2026-08-01'), 300_000)
  assert.equal(getTotalSalaryDue([employeeWithAdvance, employeeWithLiability], '2026-08-01'), 300_000)
})

test('salary fines reduce the amount due from their recorded date and carry forward', () => {
  const waiterProfile = {
    id: 'salary-fine-due-1',
    joined_at: '2026-06-01',
    rates: [{ effective_from: '2026-06-01', amount: 100_000, rate_unit: 'daily' }],
    payments: [{ id: 'payment-1', paid_date: '2026-06-02', amount: 100_000 }],
    fines: [
      { id: 'fine-1', fine_date: '2026-06-03', amount: 500_000, reason: 'Repeated lateness' },
      { id: 'fine-2', fine_date: '2026-06-10', amount: 200_000, reason: 'Damaged equipment' },
    ],
  }

  assert.equal(getSalaryFineAmount(waiterProfile, '2026-06-02'), 0)
  assert.equal(getSalaryFineAmount(waiterProfile, '2026-06-03'), 500_000)
  assert.equal(getSalaryBalance(waiterProfile, '2026-06-03'), -300_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-03'), 0)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-08'), 200_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-10'), 200_000)
  assert.equal(canRecordSalaryTransaction({ ...waiterProfile, is_active: false }, 'fine', '2026-06-10'), true)
  assert.equal(canRecordSalaryTransaction({ ...waiterProfile, deleted_at: '2026-06-10T12:00:00Z' }, 'fine', '2026-06-10'), false)
})

test('salary fines reduce projected payroll but never become cash expenses', () => {
  const salaryProfile = {
    id: 'salary-fine-estimate-1',
    joined_at: '2026-06-01',
    rates: [{ effective_from: '2026-06-01', amount: 100_000, rate_unit: 'daily' }],
    payments: [{ id: 'payment-1', paid_date: '2026-06-05', amount: 200_000 }],
    fines: [{ id: 'fine-1', fine_date: '2026-06-10', amount: 500_000, reason: 'Repeated lateness' }],
    absences: [],
  }

  const summary = getEstimatedMonthlyExpenseSummary([salaryProfile], '2026-06-16')

  assert.equal(summary.employeePaidToDate, 200_000)
  assert.equal(summary.employeeFineToDate, 500_000)
  assert.equal(summary.employeeProjectedMonth, 3_000_000)
  assert.equal(summary.employeeRemainingThisMonth, 2_300_000)
  assert.equal(summarizeExpenses(buildSalaryPaymentExpenseRows([salaryProfile], '2026-06-01', '2026-06-30')).total, 200_000)
})

test('selected-month salary operating cost excludes prior arrears and employee overpayments', () => {
  const summary = getSelectedMonthSalaryOperatingSummary([
    {
      id: 'monthly-cost-with-arrears',
      joined_at: '2026-05-01',
      rates: [{ effective_from: '2026-05-01', amount: 100_000, rate_unit: 'daily' }],
      payments: [{ paid_date: '2026-06-10', amount: 2_000_000 }],
      fines: [{ fine_date: '2026-06-12', amount: 500_000 }],
      absences: [],
    },
    {
      id: 'monthly-cost-with-overpayment',
      joined_at: '2026-06-01',
      rates: [{ effective_from: '2026-06-01', amount: 100_000, rate_unit: 'daily' }],
      payments: [{ paid_date: '2026-06-10', amount: 4_000_000 }],
      fines: [],
      absences: [],
    },
  ], '2026-06-16')

  assert.equal(summary.projectedSalary, 6_000_000)
  assert.equal(summary.fines, 500_000)
  assert.equal(summary.expectedSalaryCost, 5_500_000)
  assert.equal(summary.appliedPayments, 3_000_000)
  assert.equal(summary.remainingSalary, 2_500_000)
  assert.equal(summary.excludedPayments, 3_000_000)
})

test('salary expenses participate in expense cashflow by recorded payment method', () => {
  const cashierProfile = {
    id: 'salary-cashflow-1',
    profile_id: 'cashier-cashflow-1',
    employee_name: 'Cashflow Cashier',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'cashier' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [{ id: 'payment-1', paid_date: '2026-06-16', amount: 1_000_000, payment_method: 'terminal' }],
    bonuses: [{ id: 'bonus-1', bonus_date: '2026-06-16', amount: 250_000, payment_method: 'cash' }],
  }
  const expenses = [
    ...buildSalaryPaymentExpenseRows([cashierProfile], '2026-06-01', '2026-06-30'),
    ...buildSalaryBonusExpenseRows([cashierProfile], '2026-06-01', '2026-06-30'),
  ]

  const cashflow = summarizeExpenseCashflow([
    { payment_status: 'paid', payment_method: 'cash', total: 2_000_000 },
    { payment_status: 'paid', payment_method: 'terminal', total: 1_500_000 },
  ], expenses)

  assert.equal(cashflow.byMethod.cash.expenses, 250_000)
  assert.equal(cashflow.byMethod.cash.left, 1_750_000)
  assert.equal(cashflow.byMethod.terminal.expenses, 1_000_000)
  assert.equal(cashflow.byMethod.terminal.left, 500_000)
})

test('salary payment rows never carry period_from or period_to — those columns are dropped', () => {
  const profile = {
    id: 'salary-no-period-1',
    profile_id: 'waiter-no-period-1',
    employee_name: 'No Period Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'p1', paid_date: '2026-06-16', amount: 1_000_000, payment_method: 'cash' },
    ],
    bonuses: [],
  }

  const rows = buildSalaryPaymentExpenseRows([profile], '2026-06-01', '2026-06-30')

  assert.equal(rows.length, 1)
  assert.equal('period_from' in rows[0], false, 'period_from must not appear on payment expense rows')
  assert.equal('period_to' in rows[0], false, 'period_to must not appear on payment expense rows')
  assert.equal(rows[0].amount, 1_000_000)
  assert.equal(rows[0].expense_date, '2026-06-16')
})

test('salary payment note is shown instead of period range when present', () => {
  const profile = {
    id: 'salary-payment-note-1',
    profile_id: 'waiter-note-1',
    employee_name: 'Note Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'p-note', paid_date: '2026-06-16', amount: 900_000, payment_method: 'cash', note: 'June payout' },
      { id: 'p-no-note', paid_date: '2026-06-20', amount: 600_000, payment_method: 'cash', note: '' },
    ],
    bonuses: [],
  }

  const rows = buildSalaryPaymentExpenseRows([profile], '2026-06-01', '2026-06-30')

  assert.equal(rows.length, 2)
  // payment note flows into description so the accounting tab can display it
  assert.equal(rows.find(r => r.id === 'salary-payment-p-note')?.description, 'June payout')
  assert.equal(rows.find(r => r.id === 'salary-payment-p-no-note')?.description, 'Salary payment')
})

test('generated salary accounting rows are not real manual expenses', () => {
  assert.equal(isGeneratedSalaryExpense({ id: 'salary-payment-0983840e-ddeb-4291-bec4-c1726a50b37e' }), true)
  assert.equal(isGeneratedSalaryExpense({ id: 'salary-bonus-0983840e-ddeb-4291-bec4-c1726a50b37e' }), true)
  assert.equal(isGeneratedSalaryExpense({ id: 'salary-0983840e-ddeb-4291-bec4-c1726a50b37e-2026-07-07' }), true)
  assert.equal(isGeneratedSalaryExpense({ id: '0983840e-ddeb-4291-bec4-c1726a50b37e' }), false)
})

test('expense history deletes bonuses from their source while protecting generated salary rows', () => {
  assert.deepEqual(
    getExpenseHistoryDeleteTarget({
      id: 'salary-bonus-display-id',
      source_id: 'bonus-source-id',
      is_salary_bonus: true,
    }),
    { table: 'employee_salary_bonuses', id: 'bonus-source-id' }
  )
  assert.deepEqual(
    getExpenseHistoryDeleteTarget({ id: 'salary-bonus-fallback-id', is_salary_bonus: true }),
    { table: 'employee_salary_bonuses', id: 'fallback-id' }
  )
  assert.deepEqual(
    getExpenseHistoryDeleteTarget({ id: 'manual-expense-id' }),
    { table: 'expenses', id: 'manual-expense-id' }
  )
  assert.equal(getExpenseHistoryDeleteTarget({ id: 'salary-payment-id', is_salary_payment: true }), null)
  assert.equal(getExpenseHistoryDeleteTarget({ id: 'salary-accrual-id', is_salary_auto: true }), null)
  assert.equal(getExpenseHistoryDeleteTarget({ id: 'bazaar-total-id', is_bazaar_daily_total: true }), null)
  assert.equal(getExpenseHistoryDeleteTarget({ id: 'not-a-bonus-source', is_salary_bonus: true }), null)
})

test('monthly expense estimate tracks employee paid amount, fines, remaining salary, rent, and utilities', () => {
  const waiterProfile = {
    id: 'salary-monthly-estimate-1',
    profile_id: 'waiter-monthly-estimate-1',
    employee_name: 'Monthly Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'paid-before-now', paid_date: '2026-06-10', amount: 1_200_000 },
      { id: 'paid-after-now', paid_date: '2026-06-25', amount: 900_000 },
    ],
    fines: [
      { id: 'fine-before-now', fine_date: '2026-06-14', amount: 300_000 },
      { id: 'fine-after-now', fine_date: '2026-06-25', amount: 500_000 },
    ],
    absences: [
      { id: 'absence-before-now', absence_date: '2026-06-12' },
      { id: 'absence-after-now', absence_date: '2026-06-20' },
    ],
  }

  const summary = getEstimatedMonthlyExpenseSummary([waiterProfile], '2026-06-16', {
    monthlyRentUzs: 24_000_000,
    monthlyUtilitiesUzs: 4_500_000,
  })

  assert.equal(summary.monthStart, '2026-06-01')
  assert.equal(summary.monthEnd, '2026-06-30')
  assert.equal(summary.paidThroughDate, '2026-06-16')
  assert.equal(DEFAULT_MONTHLY_RENT_UZS, 0)
  assert.equal(DEFAULT_MONTHLY_UTILITIES_UZS, 0)
  assert.equal(summary.monthlyRentUzs, 24_000_000)
  assert.equal(summary.monthlyUtilitiesUzs, 4_500_000)
  assert.equal(summary.employeePaidToDate, 1_200_000)
  assert.equal(summary.employeeFineToDate, 300_000)
  assert.equal(summary.employeeProjectedMonth, 8_400_000)
  assert.equal(summary.employeeRemainingThisMonth, 6_900_000)
  assert.equal(summary.estimatedMonthlyExpenseUzs, 8_400_000)
})

test('employee meal estimate counts present employee-days inside employment windows', () => {
  const salaryProfiles = [
    {
      id: 'meal-active',
      joined_at: '2026-08-02',
      is_active: true,
      absences: [{ absence_date: '2026-08-03' }],
    },
    {
      id: 'meal-ended',
      joined_at: '2026-08-01',
      ended_at: '2026-08-02',
      is_active: false,
      absences: [],
    },
  ]
  const summary = getEmployeeMealExpenseEstimate(salaryProfiles, '2026-08-01', '2026-08-04', 50_000)

  assert.deepEqual(summary, {
    averageDailyEmployeeMealUzs: 50_000,
    presentEmployeeDays: 4,
    total: 200_000,
  })

  assert.deepEqual(
    buildEmployeeMealExpenseRows(salaryProfiles, '2026-08-01', '2026-08-04', 50_000)
      .map(row => [row.expense_date, row.present_employee_count, row.amount, row.payment_method]),
    [
      ['2026-08-01', 1, 50_000, 'calculated'],
      ['2026-08-02', 2, 100_000, 'calculated'],
      ['2026-08-04', 1, 50_000, 'calculated'],
    ],
  )
})

test('finalized employee meal rows preserve their saved rate attendance and total', () => {
  const rows = buildFinalizedEmployeeMealExpenseRows([
    {
      business_date: '2026-08-01',
      average_daily_amount: 50_000,
      present_employee_count: 3,
      total_amount: 150_000,
      source_type: 'daily_finalizer',
      finalized_at: '2026-08-02T01:00:00+05:00',
    },
    {
      business_date: '2026-08-02',
      average_daily_amount: 80_000,
      present_employee_count: 0,
      total_amount: 0,
      source_type: 'daily_finalizer',
    },
  ])

  assert.deepEqual(rows.map(row => ({
    date: row.expense_date,
    amount: row.amount,
    rate: row.average_daily_employee_meal_uzs,
    employees: row.present_employee_count,
    method: row.payment_method,
  })), [{
    date: '2026-08-01',
    amount: 150_000,
    rate: 50_000,
    employees: 3,
    method: 'calculated',
  }])
})

test('salary month-end debt projects the full remaining liability', () => {
  const profile = {
    id: 'salary-month-end-debt',
    profile_id: 'salary-month-end-employee',
    employee_name: 'Monthly Employee',
    joined_at: '2026-07-01',
    is_active: true,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' }],
    payments: [{ paid_date: '2026-07-10', amount: 1_000_000 }],
    fines: [],
    absences: [],
  }

  const monthEnd = getSalaryMonthEndDate('2026-07-22')

  assert.equal(monthEnd, '2026-07-31')
  assert.equal(getTotalSalaryDue([profile], '2026-07-22'), 1_200_000)
  assert.equal(getTotalSalaryDue([profile], monthEnd), 2_100_000)
})

test('monthly expense estimate does not project salary or rent before POS activity starts', () => {
  const legacyProfileWithoutJoinDate = {
    id: 'salary-before-pos-activity',
    profile_id: 'waiter-before-pos-activity',
    employee_name: 'Future Waiter',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-05-01', amount: 10_000_000, rate_unit: 'monthly' }],
    payments: [],
    absences: [],
  }

  const summary = getEstimatedMonthlyExpenseSummary(
    [legacyProfileWithoutJoinDate],
    '2026-05-31',
    { activeFromDate: '2026-06-01' },
  )

  assert.equal(summary.monthStart, '2026-05-01')
  assert.equal(summary.monthEnd, '2026-05-31')
  assert.equal(summary.activeFromDate, '2026-06-01')
  assert.equal(summary.isBeforeActiveMonth, true)
  assert.equal(summary.monthlyRentUzs, 0)
  assert.equal(summary.monthlyUtilitiesUzs, 0)
  assert.equal(summary.employeePaidToDate, 0)
  assert.equal(summary.employeeProjectedMonth, 0)
  assert.equal(summary.employeeRemainingThisMonth, 0)
  assert.equal(summary.estimatedMonthlyExpenseUzs, 0)
})

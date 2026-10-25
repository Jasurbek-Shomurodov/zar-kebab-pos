// Daily break-even income worked out from one finished day: the same figures
// as the Investor daily payroll report. Cost of goods and the estimated soliq
// grow with sales; accrued salary, KPI bonuses, the day's rent and utilities
// and employee meals do not. Break-even is the cafe income at which net
// profit reaches zero: fixed costs ÷ (1 − cost-of-goods share − soliq rate).
// Kept pure so the Telegram cron and the browser share it.

function toAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

function toNullableAmount(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

export function calculateDailyBreakEven({
  cafeIncome = 0,
  costOfGoods = null,
  salary = 0,
  kpiBonus = 0,
  rent = 0,
  utilities = 0,
  employeeMeal = 0,
  taxRatePercent = 4,
} = {}) {
  const income = toAmount(cafeIncome)
  const cost = toNullableAmount(costOfGoods)
  const fixedCosts = toAmount(salary) + toAmount(kpiBonus) + toAmount(rent) + toAmount(utilities) + toAmount(employeeMeal)
  const taxRate = Math.max(0, Number(taxRatePercent) || 0) / 100
  const costOfGoodsRate = income > 0 && cost != null ? Math.max(0, cost) / income : null
  const variableRate = costOfGoodsRate == null ? null : costOfGoodsRate + taxRate
  const breakEven = variableRate != null && variableRate < 1
    ? Math.round(fixedCosts / (1 - variableRate))
    : null
  return { fixedCosts, costOfGoodsRate, variableRate, breakEven }
}

// The cron's daily payroll summary (getDailyPayrollGroupSummary) as a stored
// snapshot row; cafeNetProfit is income minus cost of goods, null when costs
// are not known for every item sold.
export function buildDailyBreakEvenSnapshotRow(summary = {}, businessDate) {
  const cafeIncome = toAmount(summary.cafeIncomeTotal)
  const grossProfit = toNullableAmount(summary.cafeNetProfit)
  const costOfGoods = grossProfit == null ? null : cafeIncome - grossProfit
  const calculation = calculateDailyBreakEven({
    cafeIncome,
    costOfGoods,
    salary: summary.salaryTotal,
    kpiBonus: summary.kpiBonusTotal,
    rent: summary.rentTotal,
    utilities: summary.utilitiesTotal,
    employeeMeal: summary.employeeMealTotal,
    taxRatePercent: summary.estimatedTaxRatePercent ?? 4,
  })
  return {
    business_date: businessDate,
    cafe_income_uzs: cafeIncome,
    cost_of_goods_uzs: costOfGoods,
    salary_uzs: toAmount(summary.salaryTotal),
    kpi_bonus_uzs: toAmount(summary.kpiBonusTotal),
    rent_uzs: toAmount(summary.rentTotal),
    utilities_uzs: toAmount(summary.utilitiesTotal),
    employee_meal_count: toAmount(summary.presentEmployeeCount),
    employee_meal_per_employee_uzs: toAmount(summary.employeeMealPerEmployeeTotal),
    employee_meal_uzs: toAmount(summary.employeeMealTotal),
    tax_rate_pct: Math.max(0, Number(summary.estimatedTaxRatePercent ?? 4) || 0),
    tax_uzs: toAmount(summary.estimatedTaxTotal),
    net_profit_uzs: toNullableAmount(summary.netProfit),
    fixed_costs_uzs: calculation.fixedCosts,
    break_even_income_uzs: calculation.breakEven,
  }
}

export function normalizeDailyBreakEvenSnapshot(row) {
  if (!row?.business_date) return null
  const cafeIncome = toAmount(row.cafe_income_uzs)
  const costOfGoods = toNullableAmount(row.cost_of_goods_uzs)
  const taxRatePercent = Math.max(0, Number(row.tax_rate_pct) || 0)
  const calculation = calculateDailyBreakEven({
    cafeIncome,
    costOfGoods,
    salary: row.salary_uzs,
    kpiBonus: row.kpi_bonus_uzs,
    rent: row.rent_uzs,
    utilities: row.utilities_uzs,
    employeeMeal: row.employee_meal_uzs,
    taxRatePercent,
  })
  return {
    businessDate: String(row.business_date).slice(0, 10),
    cafeIncome,
    costOfGoods,
    costOfGoodsRate: calculation.costOfGoodsRate,
    salary: toAmount(row.salary_uzs),
    kpiBonus: toAmount(row.kpi_bonus_uzs),
    rent: toAmount(row.rent_uzs),
    utilities: toAmount(row.utilities_uzs),
    employeeMealCount: toAmount(row.employee_meal_count),
    employeeMealPerEmployee: toAmount(row.employee_meal_per_employee_uzs),
    employeeMeal: toAmount(row.employee_meal_uzs),
    taxRatePercent,
    tax: toAmount(row.tax_uzs),
    netProfit: toNullableAmount(row.net_profit_uzs),
    fixedCosts: toAmount(row.fixed_costs_uzs),
    breakEven: toNullableAmount(row.break_even_income_uzs),
    calculatedAt: row.calculated_at || '',
  }
}

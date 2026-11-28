// Read-at-a-glance figures for the Dashboard and Financial analysis: the
// hours and days money came in, the same-time comparison with yesterday, the
// month so far against its break-even target, and where the money went. Pure:
// pages pass rows they already loaded (paid orders, per-day cafe income from
// migration 286, monthly spending from 261) and only draw the result. Money
// is never recomputed here: every amount is a sum of the shared helpers' totals.

import { listIsoDates } from './accountingAnalysis.js'
import { isoWeekday } from './sheetKit.js'

const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0)
const changePct = (current, previous) => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null)

function daysInMonthOf(iso) {
  const [year, month] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function previousMonthStart(monthStart) {
  const [year, month] = monthStart.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Today's income hour by hour beside yesterday's. Rows run from the first hour
 * either day sold something to the later of now and yesterday's last sale, so
 * the chart shows the trading day, not midnight to 8am. Future hours today are
 * null (not zero): they have not happened yet.
 */
export function buildHourlyComparison(todayOrders = [], yesterdayOrders = [], currentHour, { hourOf, revenueOf }) {
  const byHour = orders => {
    const hours = new Array(24).fill(0)
    for (const order of orders || []) {
      const hour = hourOf(order)
      if (Number.isInteger(hour) && hour >= 0 && hour < 24) hours[hour] += Math.max(0, Number(revenueOf(order)) || 0)
    }
    return hours
  }
  const today = byHour(todayOrders)
  const yesterday = byHour(yesterdayOrders)
  const sold = [...today.map((value, hour) => (value > 0 && hour <= currentHour ? hour : null)), ...yesterday.map((value, hour) => (value > 0 ? hour : null))].filter(hour => hour != null)
  const first = sold.length ? Math.min(...sold, currentHour) : currentHour
  const lastYesterday = yesterday.reduce((last, value, hour) => (value > 0 ? hour : last), -1)
  const last = Math.max(currentHour, lastYesterday)
  const rows = []
  for (let hour = first; hour <= last; hour += 1) {
    rows.push({ hour, today: hour <= currentHour ? today[hour] : null, yesterday: yesterday[hour], isCurrent: hour === currentHour })
  }
  return rows
}

/**
 * Today against the same part of yesterday: yesterday's income up to the end
 * of the current hour is the fair comparison while the day is still running.
 */
export function buildTodayGlance(rows = [], { orderCount = 0, revenue = 0 } = {}) {
  const sameTimeYesterday = sum(rows.filter(row => row.today != null).map(row => row.yesterday))
  const peak = rows.reduce((best, row) => (row.today > (best?.today || 0) ? row : best), null)
  const yesterdayPeak = rows.reduce((best, row) => (row.yesterday > (best?.yesterday || 0) ? row : best), null)
  return {
    averageCheck: orderCount > 0 ? Math.round(revenue / orderCount) : null,
    sameTimeYesterday,
    sameTimeChangePct: changePct(revenue, sameTimeYesterday),
    peakHour: peak ? { hour: peak.hour, amount: peak.today } : null,
    yesterdayPeakHour: yesterdayPeak ? { hour: yesterdayPeak.hour, amount: yesterdayPeak.yesterday } : null,
  }
}

/**
 * Average income per weekday over completed days, best first. A weekday with
 * no completed day in the window is left out rather than shown as zero.
 */
export function buildWeekdayAverages(days = []) {
  const buckets = new Map()
  for (const day of days || []) {
    const weekday = isoWeekday(day.date)
    if (weekday == null) continue
    const bucket = buckets.get(weekday) || { weekday, total: 0, count: 0, sample: day.date }
    bucket.total += Math.max(0, Number(day.income) || 0)
    bucket.count += 1
    buckets.set(weekday, bucket)
  }
  return [...buckets.values()]
    .map(bucket => ({ weekday: bucket.weekday, sample: bucket.sample, average: Math.round(bucket.total / bucket.count), days: bucket.count }))
    .sort((a, b) => b.average - a.average || a.weekday - b.weekday)
}

/**
 * The month so far: income per day with each day's break-even target, the
 * completed-day average and a straight-line forecast, the same days of last
 * month for comparison, the best and weakest days, the best weekday over both
 * months, and spending by category (this month against last).
 *
 * dailyRows:   [{ date, cafe_income }] from previous month start to today
 * spending:    buildMonthlySpending(rows, [previousMonth, thisMonth]) or null
 * targetOn:    date => that day's break-even target (0 when none)
 */
export function buildMonthGlance({ dailyRows = [], spending = null, today, targetOn = () => 0 }) {
  const monthStart = `${today.slice(0, 8)}01`
  const previousStart = previousMonthStart(monthStart)
  const income = new Map((dailyRows || []).map(row => [row.date, Math.max(0, Number(row.cafe_income) || 0)]))
  const days = listIsoDates(monthStart, today).map(date => ({ date, income: income.get(date) || 0, target: Math.max(0, Number(targetOn(date)) || 0), isToday: date === today }))
  const completed = days.filter(day => !day.isToday)
  const completedIncome = sum(completed.map(day => day.income))
  const averageDaily = completed.length ? Math.round(completedIncome / completed.length) : null
  const monthLength = daysInMonthOf(monthStart)
  // Last month's same calendar days that are complete this month (1st to yesterday).
  const previousDays = listIsoDates(previousStart, `${previousStart.slice(0, 8)}${String(daysInMonthOf(previousStart)).padStart(2, '0')}`)
  const previousSameDays = previousDays.slice(0, completed.length)
  const previousSameIncome = sum(previousSameDays.map(date => income.get(date) || 0))
  const previousMonthIncome = sum(previousDays.map(date => income.get(date) || 0))
  const withTarget = completed.filter(day => day.target > 0)
  const best = days.reduce((top, day) => (day.income > (top?.income || 0) ? day : top), null)
  // A closed day (no sales) is not a weak trading day: the weakest is the lowest day that sold.
  const weakest = completed.filter(day => day.income > 0).reduce((low, day) => (low == null || day.income < low.income ? day : low), null)
  const weekdays = buildWeekdayAverages([
    ...previousDays.filter(date => date < monthStart).map(date => ({ date, income: income.get(date) || 0 })),
    ...completed,
  ])

  const spentThisMonth = spending ? sum(spending.categories.map(category => category.current)) : null
  const spentLastMonth = spending ? sum(spending.categories.map(category => category.previous || 0)) : null
  const categories = spending
    ? spending.categories
      .filter(category => category.current > 0)
      .map(category => ({ key: category.key, isOther: category.isOther, color: category.color, amount: category.current, previous: category.previous || 0, sharePct: spentThisMonth > 0 ? Math.round((category.current / spentThisMonth) * 100) : 0, changePct: changePct(category.current, category.previous || 0) }))
      .sort((a, b) => b.amount - a.amount)
    : []

  const incomeToDate = sum(days.map(day => day.income))
  return {
    monthStart,
    previousStart,
    days,
    incomeToDate,
    completedDays: completed.length,
    averageDaily,
    forecast: averageDaily == null ? null : Math.round(averageDaily * monthLength),
    previousSameIncome,
    previousMonthIncome,
    sameDaysChangePct: completed.length ? changePct(completedIncome, previousSameIncome) : null,
    bestDay: best && best.income > 0 ? { date: best.date, amount: best.income } : null,
    weakestDay: weakest ? { date: weakest.date, amount: weakest.income } : null,
    daysAboveTarget: withTarget.filter(day => day.income >= day.target).length,
    daysWithTarget: withTarget.length,
    targetGap: withTarget.length ? sum(withTarget.map(day => day.income - day.target)) : null,
    bestWeekday: weekdays[0] || null,
    weakestWeekday: weekdays.length > 1 ? weekdays.at(-1) : null,
    spentThisMonth,
    spentLastMonth,
    categories,
    left: spentThisMonth == null ? null : incomeToDate - spentThisMonth,
  }
}

/**
 * Highlights of a Financial analysis period: when the most and least came in,
 * the strongest weekday, the day the most went out, the biggest category and
 * single payment, and how many days income covered that day's spending.
 *
 * incomeDays:   buildDailyIncome rows ({ date, total }) or null while loading
 * spendingDays: buildDailySpending rows ({ date, total })
 * categories:   getTopExpenseCategories rows ({ key, amount, isOther })
 * largest:      buildLargestPayments rows (largest first)
 */
export function buildPeriodHighlights({ incomeDays = null, spendingDays = [], categories = [], largest = [], today }) {
  const closed = day => !today || day.date < today
  const income = (incomeDays || []).filter(closed)
  const best = (incomeDays || []).reduce((top, day) => (day.total > (top?.total || 0) ? day : top), null)
  const traded = income.filter(day => day.total > 0)
  const weakest = traded.reduce((low, day) => (low == null || day.total < low.total ? day : low), null)
  const weekdays = buildWeekdayAverages(income.map(day => ({ date: day.date, income: day.total })))
  const spendPeak = (spendingDays || []).reduce((top, day) => (day.total > (top?.total || 0) ? day : top), null)
  const spentTotal = sum((categories || []).map(category => category.amount))
  const topCategory = (categories || []).find(category => !category.isOther) || null
  const incomeByDate = new Map((incomeDays || []).map(day => [day.date, day.total]))
  const comparable = (spendingDays || []).filter(day => closed(day) && incomeByDate.has(day.date))
  const incomeTotal = sum((incomeDays || []).map(day => day.total))
  // Income in the half of the period that is closed, first half against second.
  const half = Math.floor(income.length / 2)
  const firstHalf = half ? sum(income.slice(0, half).map(day => day.total)) / half : null
  const secondHalf = half ? sum(income.slice(-half).map(day => day.total)) / half : null
  return {
    incomeReady: Array.isArray(incomeDays),
    bestDay: best && best.total > 0 ? { date: best.date, amount: best.total, sharePct: incomeTotal > 0 ? Math.round((best.total / incomeTotal) * 100) : 0 } : null,
    weakestDay: weakest && traded.length > 1 ? { date: weakest.date, amount: weakest.total } : null,
    bestWeekday: weekdays.length > 1 ? weekdays[0] : null,
    biggestSpendDay: spendPeak && spendPeak.total > 0 ? { date: spendPeak.date, amount: spendPeak.total } : null,
    topCategory: topCategory && spentTotal > 0 ? { key: topCategory.key, amount: topCategory.amount, sharePct: Math.round((topCategory.amount / spentTotal) * 100) } : null,
    largestPayment: largest?.[0] || null,
    coveredDays: comparable.filter(day => (incomeByDate.get(day.date) || 0) >= day.total).length,
    comparableDays: comparable.length,
    momentumPct: firstHalf && half >= 3 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : null,
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildDailyPayrollGroupMessage,
  buildDailySalaryMessage,
  formatSalaryNotificationAmount,
  getCompletedTashkentDate,
  getCompletedTashkentDates,
  getDailySalaryNotificationSummary,
  getDailyPayrollGroupSummary,
  getTashkentDate,
  parseEmployeeStartToken,
} from '../api/telegram/_lib/salaryMessages.js'
import {
  buildEmployeePaymentMessage,
  buildEmployeeSalaryRateMessage,
  buildEmployeeSalaryEventMessage,
  buildKpiRuleGroupMessage,
  buildSalaryRateGroupMessage,
  buildSalaryGroupEventMessage,
  buildSalaryTeamEventMessage,
  buildSalaryPaymentGroupMessage,
} from '../api/telegram/_lib/paymentMessages.js'
import {
  buildDailyPayrollGroupReportCaption,
  buildDailyPayrollGroupReportPng,
  buildDailyPayrollGroupReportSvg,
} from '../api/telegram/_lib/payrollReportImage.js'
import { sendTelegramMediaGroup, sendTelegramPhoto } from '../api/telegram/_lib/telegram.js'

const salaryProfile = {
  id: 'salary-1',
  employee_name: 'Иван Петров',
  joined_at: '2026-07-01',
  is_active: true,
  rates: [{
    id: 'rate-1',
    effective_from: '2026-07-01',
    amount: 150_000,
    rate_unit: 'daily',
  }],
  payments: [
    { paid_date: '2026-07-10', amount: 300_000 },
    { paid_date: '2026-07-29', amount: 100_000, payment_method: 'cash', note: 'Аванс' },
  ],
  bonuses: [{
    bonus_date: '2026-07-29',
    amount: 50_000,
    payment_method: 'card',
    note: '<Good work>',
  }],
  absences: [],
  fines: [{
    fine_date: '2026-07-29',
    amount: 20_000,
    reason: '<Late arrival>',
  }],
}

test('daily salary summary uses shared accrual, fine, and due calculations', () => {
  const summary = getDailySalaryNotificationSummary(salaryProfile, '2026-07-29')
  assert.equal(summary.earned, 150_000)
  assert.equal(summary.bonusTotal, 50_000)
  assert.equal(summary.fineTotal, 20_000)
  assert.equal(summary.paymentTotal, 100_000)
  assert.equal(summary.due, 3_930_000)
})

test('daily salary message shows salary and bonuses without repeating fines or payments', () => {
  const message = buildDailySalaryMessage(salaryProfile, '2026-07-29', 'ru')
  assert.match(message, /Ежедневный отчёт по зарплате/)
  assert.match(message, /📅 29 июля 2026/)
  assert.match(message, /Здравствуйте, Иван Петров!/)
  assert.match(message, /Спасибо за ваш труд\./)
  assert.match(message, /Статус дня:<\/b> Рабочий день/)
  assert.match(message, /150 000 UZS/)
  assert.match(message, /Бонусы за день:<\/b> 50 000 UZS/)
  assert.match(message, /&lt;Good work&gt;/)
  assert.doesNotMatch(message, /<Good work>/)
  assert.doesNotMatch(message, /Штрафы за день/)
  assert.doesNotMatch(message, /Выплачено за день/)
  assert.doesNotMatch(message, /Аванс/)
  assert.doesNotMatch(message, /Late arrival/)
})

test('daily payroll group message reports aggregate earned salary and automatic KPI totals', () => {
  const summary = getDailyPayrollGroupSummary([
    salaryProfile,
    {
      ...salaryProfile,
      id: 'salary-2',
      rates: [{ effective_from: '2026-07-01', amount: 100_000, rate_unit: 'daily' }],
      absences: [{ absence_date: '2026-07-29' }],
    },
  ], [
    { status: 'generated', bonus_amount: 75_000 },
    { status: 'skipped_absent', bonus_amount: 0 },
  ], '2026-07-29', {
    cafeIncome: 3_500_000,
    cashIncome: 1_200_000,
    terminalIncome: 2_300_000,
    monthToDateCafeIncome: 87_000_000,
    monthToDateCalendarDayCount: 29,
    regularDineInIncome: 1_925_000,
    regularOffPremiseIncome: 875_000,
    touristIncome: 700_000,
    grossProfit: 2_000_000,
    rent: 800_000,
    utilities: 700_000,
    employeeMealPerEmployee: 50_000,
  })

  assert.deepEqual(summary, {
    date: '2026-07-29',
    cafeIncomeTotal: 3_500_000,
    cashIncomeTotal: 1_200_000,
    terminalIncomeTotal: 2_300_000,
    monthlyAverageCafeIncome: 3_000_000,
    dineInIncomeTotal: 1_925_000,
    offPremiseIncomeTotal: 875_000,
    touristIncomeTotal: 700_000,
    gameClubIncomeTotal: 0,
    gameClubPercentage: 0,
    dineInPercentage: 55,
    offPremisePercentage: 25,
    touristPercentage: 20,
    cafeNetProfit: 2_000_000,
    salaryTotal: 150_000,
    kpiBonusTotal: 75_000,
    combinedTotal: 225_000,
    rentTotal: 800_000,
    utilitiesTotal: 700_000,
    presentEmployeeCount: 1,
    employeeMealPerEmployeeTotal: 50_000,
    employeeMealTotal: 50_000,
    estimatedTaxRatePercent: 4,
    estimatedTaxTotal: 140_000,
    netProfit: 85_000,
  })

  const message = buildDailyPayrollGroupMessage(summary, '2026-07-29', 'ru')
  assert.match(message, /Общий отчёт по зарплате и KPI/)
  assert.match(message, /📅 29-июля/)
  assert.doesNotMatch(message, /29\.07\.2026/)
  assert.match(message, /Выручка кафе за день:<\/b> 3 500 000 UZS/)
  assert.match(message, /Наличные:<\/b> 1 200 000 UZS/)
  assert.match(message, /Терминал:<\/b> 2 300 000 UZS/)
  assert.match(message, /Средняя дневная выручка кафе за месяц:<\/b> 3 000 000 UZS/)
  assert.match(message, /Доля обычной выручки в зале:<\/b> 55%/)
  assert.match(message, /Доля обычной выручки с собой \+ доставка:<\/b> 25%/)
  assert.match(message, /Доля туристической выручки:<\/b> 20%/)
  assert.match(message, /Чистая прибыль кафе:<\/b> 2 000 000 UZS/)
  assert.match(message, /Начисленная зарплата:<\/b> 150 000 UZS/)
  assert.match(message, /Автоматические KPI-бонусы:<\/b> 75 000 UZS/)
  assert.doesNotMatch(message, /Общая сумма/)
  assert.match(message, /Аренда:<\/b> 800 000 UZS/)
  assert.match(message, /Коммуналка:<\/b> 700 000 UZS/)
  assert.match(message, /Среднее питание сотрудников \(1 × 50 000\):<\/b> 50 000 UZS/)
  assert.match(message, /Оценочный soliq \(4%\):<\/b> 140 000 UZS/)
  assert.match(message, /Чистая прибыль за день:<\/b> 85 000 UZS/)
  assert.match(message, /────────────/)
  assert.ok(
    message.indexOf('Чистая прибыль за день') < message.indexOf('Средняя дневная выручка кафе за месяц')
  )
  assert.doesNotMatch(message, /Иван Петров/)
})

test('daily payroll group image contains the full Russian report and renders as PNG', async () => {
  const summary = getDailyPayrollGroupSummary([salaryProfile], [
    { status: 'generated', bonus_amount: 485_015 },
  ], '2026-08-27', {
    cafeIncome: 7_594_000,
    cashIncome: 2_594_000,
    terminalIncome: 5_000_000,
    monthToDateCafeIncome: 175_500_000,
    monthToDateCalendarDayCount: 27,
    regularDineInIncome: 3_257_826,
    regularOffPremiseIncome: 364_512,
    touristIncome: 3_971_662,
    grossProfit: 5_112_967,
    rent: 774_193,
    utilities: 645_161,
    employeeMealPerEmployee: 25_000,
    employeeMealPresentEmployeeCount: 12,
  })
  const svg = buildDailyPayrollGroupReportSvg(summary, '2026-08-27')
  const png = await buildDailyPayrollGroupReportPng(summary, '2026-08-27')

  assert.doesNotMatch(svg, /Зарплата, KPI и прибыль/)
  assert.doesNotMatch(svg, /27-августа/)
  assert.match(svg, /7 594 000 UZS/)
  assert.match(svg, /НАЛИЧНЫЕ/)
  assert.match(svg, /2 594 000 UZS/)
  assert.match(svg, /ТЕРМИНАЛ/)
  assert.match(svg, /5 000 000 UZS/)
  assert.match(svg, />34,2%<\/text>/)
  assert.match(svg, />65,8%<\/text>/)
  assert.match(svg, /● ЗАЛ/)
  assert.match(svg, /3 257 826 UZS/)
  assert.match(svg, /Обычная выручка/)
  assert.match(svg, /С собой \+ доставка/)
  assert.match(svg, /364 512 UZS/)
  assert.match(svg, /Туристическая выручка/)
  assert.match(svg, /3 971 662 UZS/)
  assert.match(svg, /Чистая прибыль кафе/i)
  assert.match(svg, /Начисленная зарплата/)
  assert.match(svg, /Автоматические KPI-бонусы/)
  assert.match(svg, /Среднее питание сотрудников/)
  assert.match(svg, /ОБЩИЙ РАСХОД · 2 658 129 UZS/)
  assert.match(svg, /Оценочный soliq \(4%\)/)
  assert.match(svg, /Чистая прибыль за день/i)
  assert.match(svg, /Средняя дневная/i)
  assert.match(svg, /Выручка кафе за месяц/i)
  assert.match(svg, />42,9%<\/text>/)
  assert.match(svg, />4,8%<\/text>/)
  assert.match(svg, />52,3%<\/text>/)
  assert.match(svg, /#0D9488/)
  assert.match(svg, /#F97316/)
  assert.match(svg, /#C026D3/)
  assert.match(svg, /font-family="Noto Sans"/)
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})

test('daily payroll image configures the bundled Cyrillic font for serverless rendering', () => {
  const imageSource = fs.readFileSync(
    new URL('../api/telegram/_lib/payrollReportImage.js', import.meta.url),
    'utf8'
  )
  assert.match(imageSource, /notosans-fontface\/fonts/)
  assert.match(imageSource, /process\.env\.FONTCONFIG_FILE = configPath/)
  assert.match(imageSource, /configurePayrollFonts\(\)[\s\S]*sharp\(Buffer\.from\(svg\)\)/)
})

test('daily payroll group image title and date live in the Telegram caption', () => {
  const caption = buildDailyPayrollGroupReportCaption('2026-08-27')
  assert.equal(caption, '💼 <b>Зарплата, KPI и прибыль</b>\n📅 27-августа')
})

test('Telegram photo delivery uploads the generated PNG as multipart form data', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 321 } }),
    }
  }

  try {
    const response = await sendTelegramPhoto('-100123', Buffer.from([137, 80, 78, 71]), {
      filename: 'daily-report.png',
    })
    assert.equal(response.result.message_id, 321)
    assert.match(request.url, /\/bottest-token\/sendPhoto$/)
    assert.equal(request.options.method, 'POST')
    assert.equal(request.options.body.get('chat_id'), '-100123')
    assert.equal(request.options.body.get('photo').name, 'daily-report.png')
    assert.equal(request.options.body.get('photo').type, 'image/png')
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})

test('Telegram media-group delivery uploads two PNG reports as one album', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return {
      ok: true,
      json: async () => ({ ok: true, result: [{ message_id: 401 }, { message_id: 402 }] }),
    }
  }

  try {
    const response = await sendTelegramMediaGroup('-100123', [
      {
        photo: Buffer.from([137, 80, 78, 71]),
        filename: 'daily-report.png',
        caption: '<b>Daily reports</b>',
      },
      {
        photo: Buffer.from([137, 80, 78, 71]),
        filename: 'daily-bazaar.png',
      },
    ])
    const media = JSON.parse(request.options.body.get('media'))

    assert.deepEqual(response.result.map(item => item.message_id), [401, 402])
    assert.match(request.url, /\/bottest-token\/sendMediaGroup$/)
    assert.equal(request.options.method, 'POST')
    assert.equal(request.options.body.get('chat_id'), '-100123')
    assert.deepEqual(media, [
      {
        type: 'photo',
        media: 'attach://photo0',
        caption: '<b>Daily reports</b>',
        parse_mode: 'HTML',
      },
      { type: 'photo', media: 'attach://photo1' },
    ])
    assert.equal(request.options.body.get('photo0').name, 'daily-report.png')
    assert.equal(request.options.body.get('photo1').name, 'daily-bazaar.png')
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})

test('salary payment notification includes the saved payment and remaining due', () => {
  const message = buildEmployeePaymentMessage({
    employee_name: 'Зилола <кассир>',
    paid_date: '2026-07-29',
    amount: 300_000,
    payment_method: 'cash',
    note: '<Аванс>',
    created_by_name: 'Jasurbek & Co',
  }, 200_000, 'ru')

  assert.match(message, /Выплата зарплаты/)
  assert.match(message, /Зилола &lt;кассир&gt;/)
  assert.match(message, /Выплачено:<\/b> 300 000 UZS/)
  assert.match(message, /Дата выплаты:<\/b> 29 июля 2026/)
  assert.match(message, /Наличные/)
  assert.match(message, /&lt;Аванс&gt;/)
  assert.match(message, /Осталось к выплате:<\/b> 200 000 UZS/)
  assert.match(message, /Jasurbek &amp; Co/)
  assert.doesNotMatch(message, /<Аванс>/)
})

test('salary payment group notification identifies the employee without a private greeting', () => {
  const message = buildSalaryPaymentGroupMessage({
    employee_name: 'Зилола <кассир>',
    paid_date: '2026-07-29',
    amount: 300_000,
    payment_method: 'cash',
    note: '<Аванс>',
    created_by_name: 'Jasurbek & Co',
  }, 200_000, 'ru')

  assert.match(message, /Зарегистрирована выплата сотруднику/)
  assert.match(message, /Сотрудник:<\/b> Зилола &lt;кассир&gt;/)
  assert.match(message, /Выплачено:<\/b> 300 000 UZS/)
  assert.match(message, /Осталось к выплате:<\/b> 200 000 UZS/)
  assert.match(message, /Jasurbek &amp; Co/)
  assert.doesNotMatch(message, /Здравствуйте/)
  assert.doesNotMatch(message, /Подтвердить получение/)
})

test('salary notifications preserve a negative balance after an overpayment', () => {
  const overpaidProfile = {
    id: 'salary-overpaid',
    employee_name: 'Nodir',
    joined_at: '2026-07-29',
    is_active: true,
    rates: [{ effective_from: '2026-07-29', amount: 100_000, rate_unit: 'daily' }],
    payments: [{ paid_date: '2026-07-29', amount: 600_000, payment_method: 'cash' }],
    bonuses: [],
    fines: [],
    absences: [],
  }

  const summary = getDailySalaryNotificationSummary(overpaidProfile, '2026-07-29')
  const dailyMessage = buildDailySalaryMessage(overpaidProfile, '2026-07-29', 'en')
  const payment = {
    employee_name: 'Nodir',
    paid_date: '2026-07-29',
    amount: 500_000,
    payment_method: 'cash',
    created_by_name: 'Owner',
  }
  const employeeMessage = buildEmployeePaymentMessage(payment, -500_000, 'en')
  const groupMessage = buildSalaryPaymentGroupMessage(payment, -500_000, 'en')

  assert.equal(formatSalaryNotificationAmount(-500_000), '-500 000')
  assert.equal(summary.due, -500_000)
  assert.match(dailyMessage, /Current salary due:<\/b> -500 000 UZS/)
  assert.match(employeeMessage, /Remaining salary due:<\/b> -500 000 UZS/)
  assert.match(groupMessage, /Remaining salary due:<\/b> -500 000 UZS/)
})

test('salary group messages cover bonuses, fines, and absences', () => {
  const common = {
    employee_name: 'Зилола <кассир>',
    created_by_name: 'Jasurbek & Co',
  }
  const bonus = buildSalaryGroupEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-29',
    amount: 100_000,
    payment_method: 'card',
    accrues_to_salary: true,
    note: '<Отличная работа>',
  }, 250_000, 'ru')
  const fine = buildSalaryGroupEventMessage('fine', {
    ...common,
    fine_date: '2026-07-29',
    amount: 20_000,
    reason: '<Опоздание>',
  }, 230_000, 'ru')
  const absence = buildSalaryGroupEventMessage('absence', {
    ...common,
    absence_date: '2026-07-29',
    note: '<Болезнь>',
  }, 80_000, 'ru')

  assert.match(bonus, /Бонус сотруднику/)
  assert.match(bonus, /100 000 UZS/)
  assert.match(bonus, /Дата:<\/b> 29 июля 2026/)
  assert.doesNotMatch(bonus, /Способ оплаты|Payment method|To‘lov turi|Карта/)
  assert.match(bonus, /&lt;Отличная работа&gt;/)
  assert.match(fine, /Штраф сотрудника/)
  assert.match(fine, /20 000 UZS/)
  assert.match(fine, /Дата:<\/b> 29 июля 2026/)
  assert.match(fine, /&lt;Опоздание&gt;/)
  assert.match(absence, /Отсутствие сотрудника/)
  assert.match(absence, /Дата:<\/b> 29 июля 2026/)
  assert.match(absence, /&lt;Болезнь&gt;/)
  assert.doesNotMatch(absence, /<Болезнь>/)
  assert.match(absence, /К выплате:<\/b> 80 000 UZS/)
})

test('ZarKebab Team messages publish full bonus, fine, and absence details without private salary fields', () => {
  const common = {
    employee_name: 'Зилола <кассир>',
    created_by_name: 'Jasurbek & Co',
  }
  const bonus = buildSalaryTeamEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-29',
    amount: 100_000,
    payment_method: 'card',
    note: '<Отличная работа & помощь команде>',
  }, 'ru')
  const fine = buildSalaryTeamEventMessage('fine', {
    ...common,
    fine_date: '2026-07-30',
    amount: 20_000,
    reason: '<Опоздание & невыполненная уборка>',
  }, 'ru')
  const absence = buildSalaryTeamEventMessage('absence', {
    ...common,
    absence_date: '2026-07-31',
    note: '<Болезнь & визит к врачу>',
  }, 'ru')
  const bonusWithoutNote = buildSalaryTeamEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-29',
    amount: 93_000,
    payment_method: 'cash',
    note: '',
  }, 'ru')

  assert.equal(bonus, [
    '🎁 <b>Бонус сотруднику</b>',
    '👤 <b>Зилола &lt;кассир&gt;</b> · <b>100 000 UZS</b>',
    '🗓 29 июля 2026',
    '📝 <b>Примечание:</b> &lt;Отличная работа &amp; помощь команде&gt;',
    '✍️ <b>Оформил:</b> Jasurbek &amp; Co',
  ].join('\n'))
  assert.equal(fine, [
    '⚠️ <b>Штраф сотрудника</b>',
    '👤 <b>Зилола &lt;кассир&gt;</b> · <b>20 000 UZS</b>',
    '🗓 30 июля 2026',
    '📝 <b>Причина:</b> &lt;Опоздание &amp; невыполненная уборка&gt;',
    '✍️ <b>Оформил:</b> Jasurbek &amp; Co',
  ].join('\n'))
  assert.equal(absence, [
    '📅 <b>Отсутствие сотрудника</b>',
    '👤 <b>Зилола &lt;кассир&gt;</b> · 🗓 31 июля 2026',
    '📝 &lt;Болезнь &amp; визит к врачу&gt;',
    '✍️ <b>Оформил:</b> Jasurbek &amp; Co',
  ].join('\n'))
  assert.equal(bonusWithoutNote, [
    '🎁 <b>Бонус сотруднику</b>',
    '👤 <b>Зилола &lt;кассир&gt;</b> · <b>93 000 UZS</b>',
    '🗓 29 июля 2026',
    '✍️ <b>Оформил:</b> Jasurbek &amp; Co',
  ].join('\n'))

  for (const message of [bonus, fine, absence, bonusWithoutNote]) {
    assert.doesNotMatch(message, /\n\n/)
    assert.doesNotMatch(message, /К выплате|Осталось к выплате|Salary due|Remaining salary due/)
    assert.match(message, /Jasurbek/)
    assert.doesNotMatch(message, /<(?:кассир|Отличная|Опоздание|Болезнь)/)
  }
})

test('ZarKebab Team bonus and fine messages localize while absence stays Russian', () => {
  const uz = buildSalaryTeamEventMessage('bonus', {
    employee_name: 'Nodir',
    bonus_date: '2026-08-08',
    amount: 500_000,
    payment_method: 'cash',
    note: 'Mehmonlarga yaxshi xizmat',
  }, 'uz')
  const en = buildSalaryTeamEventMessage('fine', {
    employee_name: 'Alex',
    fine_date: '2026-08-08',
    amount: 75_000,
    reason: 'Late arrival',
  }, 'en')
  const uzAbsence = buildSalaryTeamEventMessage('absence', {
    employee_name: 'Gavhar',
    absence_date: '2026-08-09',
    note: '',
  }, 'uz')
  const enAbsence = buildSalaryTeamEventMessage('absence', {
    employee_name: 'Gavhar',
    absence_date: '2026-08-09',
    note: 'Sick leave',
  }, 'en')

  assert.match(uz, /Xodim bonusi/)
  assert.match(uz, /500 000 UZS/)
  assert.match(uz, /8 avgust 2026/)
  assert.doesNotMatch(uz, /To‘lov turi|Naqd/)
  assert.match(uz, /Mehmonlarga yaxshi xizmat/)
  assert.match(en, /Employee fine/)
  assert.match(en, /75 000 UZS/)
  assert.match(en, /8 August 2026/)
  assert.match(en, /Reason:<\/b> Late arrival/)
  assert.equal(uzAbsence, [
    '📅 <b>Отсутствие сотрудника</b>',
    '👤 <b>Gavhar</b> · 🗓 9 августа 2026',
    '✍️ <b>Оформил:</b> Система',
  ].join('\n'))
  assert.equal(enAbsence, [
    '📅 <b>Отсутствие сотрудника</b>',
    '👤 <b>Gavhar</b> · 🗓 9 августа 2026',
    '📝 Sick leave',
    '✍️ <b>Оформил:</b> Система',
  ].join('\n'))
})

test('employee bonus and absence messages are private and localized', () => {
  const common = {
    employee_name: 'Зилола <кассир>',
    created_by_name: 'Jasurbek & Co',
  }
  const bonus = buildEmployeeSalaryEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-29',
    amount: 100_000,
    payment_method: 'card',
    accrues_to_salary: true,
    note: '<Отличная работа>',
  }, 250_000, 'ru')
  const absence = buildEmployeeSalaryEventMessage('absence', {
    ...common,
    absence_date: '2026-07-29',
    note: '<Болезнь>',
  }, 80_000, 'ru')
  const kpi = buildEmployeeSalaryEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-29',
    amount: 75_000,
    source_type: 'daily_kpi',
    accrues_to_salary: true,
  }, 325_000, 'en')
  const legacyKpi = buildEmployeeSalaryEventMessage('bonus', {
    ...common,
    bonus_date: '2026-07-28',
    amount: 50_000,
    source_type: 'daily_kpi',
    accrues_to_salary: false,
  }, 250_000, 'en')

  assert.match(bonus, /Здравствуйте, Зилола &lt;кассир&gt;!/)
  assert.match(bonus, /Ваш бонус начислен и добавлен к балансу зарплаты\./)
  assert.match(bonus, /100 000 UZS/)
  assert.match(bonus, /Дата:<\/b> 29 июля 2026/)
  assert.match(bonus, /&lt;Отличная работа&gt;/)
  assert.doesNotMatch(bonus, /Способ оплаты|Payment method|To‘lov turi|Карта/)
  assert.match(absence, /Здравствуйте, Зилола &lt;кассир&gt;!/)
  assert.match(absence, /Ваше отсутствие зарегистрировано\./)
  assert.match(absence, /Дата:<\/b> 29 июля 2026/)
  assert.match(absence, /&lt;Болезнь&gt;/)
  assert.match(absence, /К выплате:<\/b> 80 000 UZS/)
  assert.doesNotMatch(absence, /<Болезнь>/)
  assert.match(kpi, /daily KPI bonus was calculated and added to your salary balance/i)
  assert.doesNotMatch(kpi, /calculated and paid/i)
  assert.match(legacyKpi, /daily KPI bonus was calculated and paid/i)
})

test('salary rate change messages show localized previous and new rates to the group and employee', () => {
  const rateChange = {
    employee_name: 'Зилола <кассир>',
    effective_from: '2026-08-15',
    amount: 8_500_000,
    rate_unit: 'monthly',
    previous_rate: {
      amount: 7_500_000,
      rate_unit: 'monthly',
    },
    kpi_rule: {
      effective_from: '2026-08-10',
      rate_bps: 125,
      is_enabled: true,
    },
    note: '<Повышение>',
    created_by_name: 'Jasurbek & Co',
  }

  const group = buildSalaryRateGroupMessage(rateChange, 910_000, 'ru')
  const employee = buildEmployeeSalaryRateMessage(rateChange, 910_000, 'en')

  assert.match(group, /Изменение зарплаты/)
  assert.match(group, /Сотрудник:<\/b> Зилола &lt;кассир&gt;/)
  assert.match(group, /Предыдущая зарплата:<\/b> 7 500 000 UZS \(месячная\)/)
  assert.match(group, /Новая зарплата:<\/b> 8 500 000 UZS \(месячная\)/)
  assert.match(group, /Действует с:<\/b> 15 августа 2026/)
  assert.match(group, /Процент KPI:<\/b> 1\.25%/)
  assert.match(group, /&lt;Повышение&gt;/)
  assert.match(group, /Jasurbek &amp; Co/)
  assert.doesNotMatch(group, /Здравствуйте/)

  assert.match(employee, /Great news — your salary has increased!/)
  assert.match(employee, /Congratulations! Your hard work and contribution to the team have been recognized\. 🎉/)
  assert.match(employee, /Hello, Зилола &lt;кассир&gt;!/)
  assert.match(employee, /Previous salary:<\/b> 7 500 000 UZS \(monthly\)/)
  assert.match(employee, /New salary:<\/b> 8 500 000 UZS \(monthly\)/)
  assert.match(employee, /Effective from:<\/b> 15 August 2026/)
  assert.match(employee, /KPI rate:<\/b> 1\.25%/)
  assert.match(employee, /Salary due:<\/b> 910 000 UZS/)
  assert.match(employee, /Changed by:<\/b> Jasurbek &amp; Co/)
  assert.match(employee, /Thank you for growing with Zar Kebab/)
  assert.match(employee, /achievements ahead! 🌟/)
  assert.match(employee, /&lt;Повышение&gt;/)
  assert.doesNotMatch(employee, /<Повышение>/)
})

test('salary rate messages always state whether KPI is disabled or not configured', () => {
  const baseRate = {
    employee_name: 'Alex',
    effective_from: '2026-08-15',
    amount: 200_000,
    rate_unit: 'daily',
    created_by_name: 'Owner',
  }

  const disabled = buildSalaryRateGroupMessage({
    ...baseRate,
    kpi_rule: { rate_bps: 100, is_enabled: false },
  }, 0, 'ru')
  const notConfigured = buildEmployeeSalaryRateMessage(baseRate, 0, 'en')

  assert.match(disabled, /Процент KPI:<\/b> выключен/)
  assert.match(notConfigured, /KPI rate:<\/b> not configured/)
})

test('KPI rule additions and changes produce localized Salary-group messages', () => {
  const added = buildKpiRuleGroupMessage({
    change_kind: 'added',
    employee_name: 'Aziz <waiter>',
    effective_from: '2026-09-02',
    new_rate_bps: 125,
    new_is_enabled: true,
    created_by_name: 'Owner & Co',
  }, 'en')
  const changed = buildKpiRuleGroupMessage({
    change_kind: 'changed',
    employee_name: 'Азиз',
    effective_from: '2026-09-03',
    previous_rate_bps: 125,
    previous_is_enabled: true,
    new_rate_bps: 125,
    new_is_enabled: false,
    created_by_name: 'Владелец',
  }, 'ru')

  assert.match(added, /KPI setting added/)
  assert.match(added, /Employee:<\/b> Aziz &lt;waiter&gt;/)
  assert.doesNotMatch(added, /Previous KPI/)
  assert.match(added, /New KPI:<\/b> 1\.25%/)
  assert.match(added, /Effective from:<\/b> 2 September 2026/)
  assert.match(added, /Owner &amp; Co/)
  assert.match(changed, /Настройка KPI изменена/)
  assert.match(changed, /Предыдущий KPI:<\/b> 1\.25%/)
  assert.match(changed, /Новый KPI:<\/b> выключен/)
  assert.match(changed, /Действует с:<\/b> 3 сентября 2026/)
})

test('salary decreases remain clear and neutral instead of being presented as a celebration', () => {
  const employee = buildEmployeeSalaryRateMessage({
    employee_name: 'Alex',
    effective_from: '2026-08-15',
    amount: 180_000,
    rate_unit: 'daily',
    previous_rate: { amount: 200_000, rate_unit: 'daily' },
    created_by_name: 'Owner',
  }, 0, 'en')

  assert.match(employee, /📈 <b>Salary change<\/b>/)
  assert.match(employee, /Your salary rate was changed\./)
  assert.doesNotMatch(employee, /Congratulations|Great news|🎉|🌟/)
})

test('salary payments, salary-rate changes, and KPI rule changes never target ZarKebab Team', () => {
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  const notifyPaymentSource = endpoint.slice(
    endpoint.indexOf('async function notifyPayment'),
    endpoint.indexOf('export default async function handler')
  )
  const teamDeliverySource = endpoint.slice(
    endpoint.indexOf('async function deliverSalaryTeamEvent'),
    endpoint.indexOf('async function deliverEmployeeSalaryEvent')
  )

  assert.match(endpoint, /const TEAM_EVENT_TYPES = new Set\(\['bonus', 'fine', 'absence'\]\)/)
  assert.match(teamDeliverySource, /if \(!TEAM_EVENT_TYPES\.has\(type\)\)[\s\S]*?status: 'skipped'/)
  assert.doesNotMatch(notifyPaymentSource, /deliverSalaryTeamEvent|loadSalaryTeamTarget|buildSalaryTeamEventMessage|team_events/)
  assert.match(salariesPage, /const teamDeliveryRequired = \['bonus', 'fine', 'absence'\]\.includes\(eventType\)/)
  assert.match(salariesPage, /showTeamDelivery: \['bonus', 'fine', 'absence'\]\.includes\(delivery\.event_type\)/)
  assert.match(endpoint, /KPI rule changes do not notify ZarKebab Team/)
})

test('recorded salary operations trigger the authenticated shared Telegram endpoint', () => {
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  const notifications = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const salaryGroupTargetSource = endpoint.slice(
    endpoint.indexOf('async function loadSalaryGroupTarget'),
    endpoint.indexOf('async function loadSalaryTeamTarget')
  )
  // Rate changes moved to the Employees edit dialog; creation to NewEmployeeDialog.
  const employeesPage = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
  const createSalaryProfileSource = fs.readFileSync(new URL('../src/components/NewEmployeeDialog.jsx', import.meta.url), 'utf8')
  const addRateSource = employeesPage.slice(
    employeesPage.indexOf('async function saveEmployeeSalary'),
    employeesPage.indexOf('async function saveEmployeeKpi')
  )

  assert.match(salariesPage, /\.select\('id'\)\.single\(\)/)
  assert.match(salariesPage, /runTelegramNotificationInBackground\(entryType, writeResult\.data\?\.id\)/)
  assert.match(salariesPage, /runTelegramNotificationInBackground\('absence', savedAbsence\?\.id\)/)
  assert.match(addRateSource, /\.insert\(buildSalaryRatePayload\([\s\S]*?\.select\('id'\)\s*\.single\(\)/)
  assert.match(addRateSource, /notifySalaryChangeInBackground\(notifyTelegramEmployeeRate, savedRate\?\.id, l\.rateTelegramFailed\)/)
  assert.match(addRateSource, /const isInitialRate = \(employee\.rates \|\| \[\]\)\.length === 0/)
  assert.match(addRateSource, /if \(!isInitialRate\) notifySalaryChangeInBackground\(notifyTelegramEmployeeRate/)
  assert.doesNotMatch(createSalaryProfileSource, /notifyTelegramEmployeeRate/)
  assert.match(employeesPage, /void send\(eventId\)/)
  assert.match(salariesPage, /void send\(eventId\)/)
  assert.doesNotMatch(addRateSource, /await\s+(?:notifySalaryChangeInBackground|notifyTelegramEmployeeRate)/)
  assert.match(salariesPage, /rate:\s*notifyTelegramEmployeeRate/)
  assert.match(salariesPage, /const collections = \{[\s\S]*?rate:\s*'rates'[\s\S]*?\}/)
  assert.match(salariesPage, /const dateFields = \{[\s\S]*?rate:\s*'effective_from'[\s\S]*?\}/)
  assert.match(salariesPage, /const groupEventTypeLabels = \{[\s\S]*?rate:\s*l\.[A-Za-z]+[\s\S]*?\}/)
  assert.match(notifications, /\/api\/telegram\/employee-notification/)
  assert.match(notifications, /keepalive: true/)
  assert.match(notifications, /\[[^\]]*'payment'[^\]]*'rate'[^\]]*\]\.includes\(type\)/)
  assert.match(notifications, /const eventIdKey = type === 'kpi_rule' \? 'kpiRuleEventId' : `\$\{type\}Id`/)
  assert.match(notifications, /\[eventIdKey\]: eventId/)
  assert.match(notifications, /export function notifyTelegramEmployeeRate\(rateId\)/)
  assert.match(notifications, /notifyTelegramSalaryEvent\('rate', rateId\)/)
  assert.match(notifications, /export function notifyTelegramKpiRuleChange\(changeEventId\)/)
  assert.match(notifications, /notifyTelegramSalaryEvent\('kpi_rule', changeEventId\)/)
  assert.match(notifications, /team: \{ status: 'failed' \}/)
  assert.match(endpoint, /payment\.created_by !== user\.id/)
  assert.match(endpoint, /loadOwnedSalaryEvent/)
  assert.match(endpoint, /rate:\s*\{[\s\S]*?table:\s*'employee_salary_rates'[\s\S]*?effective_from[\s\S]*?rate_unit[\s\S]*?created_by/)
  assert.match(endpoint, /kpi_rule:\s*\{[\s\S]*?table:\s*'employee_kpi_rule_change_events'[\s\S]*?previous_rate_bps[\s\S]*?new_rate_bps/)
  assert.match(endpoint, /\.from\('employee_kpi_rules'\)[\s\S]*?\.lte\('effective_from', data\.effective_from\)[\s\S]*?\.maybeSingle\(\)/)
  assert.match(endpoint, /kpi_rule:\s*kpiRule/)
  assert.match(endpoint, /\.eq\('id', eventId\)/)
  assert.match(endpoint, /rate:\s*rateId/)
  assert.match(endpoint, /\[[^\]]*'payment'[^\]]*'rate'[^\]]*\]\.includes\(notificationType\)/)
  assert.match(endpoint, /requireQueuedSalaryGroupDelivery\([\s\S]*?'rate',[\s\S]*?event\.id/)
  assert.match(endpoint, /\.eq\('event_type', type\)[\s\S]*?\.eq\('event_id', eventId\)/)
  assert.match(endpoint, /Initial salary setup is not a salary-change notification/)
  assert.match(endpoint, /buildEmployeePaymentMessage/)
  assert.match(endpoint, /buildSalaryPaymentGroupMessage/)
  assert.match(endpoint, /buildSalaryGroupEventMessage/)
  assert.match(endpoint, /buildEmployeeSalaryEventMessage/)
  assert.match(endpoint, /salaryProfile\?\.bonuses[\s\S]*?accrues_to_salary/)
  assert.match(endpoint, /buildSalaryRateGroupMessage\(event, remainingDue, target\.language\)/)
  assert.match(endpoint, /buildKpiRuleGroupMessage\(event, target\.language\)/)
  assert.match(endpoint, /async function notifyKpiRuleChange[\s\S]*?deliverSalaryGroupEvent\(supabase, 'kpi_rule', event, 0\)/)
  assert.match(endpoint, /buildEmployeeSalaryRateMessage\([\s\S]*?event,[\s\S]*?remainingDue,[\s\S]*?employeeLink\.preferred_language/)
  assert.match(endpoint, /deliverEmployeeSalaryEvent/)
  assert.match(endpoint, /employee_salary_telegram_links/)
  assert.match(endpoint, /telegram_notification_targets/)
  assert.match(endpoint, /TELEGRAM_SALARY_PAYMENTS_CHAT_ID/)
  assert.doesNotMatch(salaryGroupTargetSource, /TELEGRAM_TEAM_CHAT_ID/)
  assert.match(endpoint, /async function loadSalaryTeamTarget/)
  assert.match(endpoint, /TELEGRAM_TEAM_CHAT_ID/)
  assert.match(endpoint, /Promise\.allSettled/)
})

test('salary loading is visible while Telegram delivery refresh stays non-blocking', () => {
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')

  assert.match(salariesPage, /loadData\(\{ showLoader: true \}\)/)
  // Only data-driven values shimmer; the static operations form is never hidden behind a loader.
  assert.match(salariesPage, /value=\{loading \? <Shimmer [^>]*\/> : formatCurrency\(totalDue\)\}/)
  assert.doesNotMatch(salariesPage, /if \(loading\) \{\s*return/)
  assert.match(salariesPage, /async function loadData\(\{ showLoader = false, refreshTelegram = true \} = \{\}\)/)
  assert.match(salariesPage, /await loadData\(\{ refreshTelegram: false \}\)/)
  assert.match(salariesPage, /\.finally\(\(\) => \{[\s\S]*?void loadTelegramDeliveryData\(\)/)
  assert.match(salariesPage, /disabled=\{!canManage \|\| telegramSendingKeys\.includes\(retryKey\)\}/)
  assert.doesNotMatch(salariesPage, /saving === retryKey \? <Loader2/)
})

test('salary payment notifications persist delivery status and employee confirmation', () => {
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  const migration = fs.readFileSync(new URL('../migrations/108_employee_salary_payment_notification_deliveries.sql', import.meta.url), 'utf8')
  const groupMigration = fs.readFileSync(new URL('../migrations/110_salary_payment_group_notifications.sql', import.meta.url), 'utf8')
  const groupEventMigration = fs.readFileSync(new URL('../migrations/111_salary_group_event_notifications.sql', import.meta.url), 'utf8')
  const employeeEventMigration = fs.readFileSync(new URL('../migrations/112_salary_event_employee_notifications.sql', import.meta.url), 'utf8')
  const attemptTrackingMigration = fs.readFileSync(new URL('../migrations/113_salary_notification_attempt_tracking.sql', import.meta.url), 'utf8')

  assert.match(endpoint, /employee_salary_payment_notification_deliveries/)
  assert.match(endpoint, /salary_payment_confirm:\$\{deliveryId\}/)
  assert.match(endpoint, /telegram_message_id/)
  assert.match(endpoint, /status: 'failed'/)
  assert.match(webhook, /handleSalaryPaymentConfirmation/)
  assert.match(webhook, /confirmed_by_telegram_user_id/)
  assert.match(webhook, /editMessageReplyMarkup/)
  assert.match(salariesPage, /telegramDeliveryTitle/)
  assert.match(salariesPage, /paymentDeliveryStatusClasses/)
  assert.match(salariesPage, /telegramSalaryGroup/)
  assert.match(salariesPage, /telegramTeam/)
  assert.match(salariesPage, /group_telegram_message_id/)
  assert.match(salariesPage, /team_telegram_message_id/)
  assert.match(salariesPage, /showTeamDelivery: \['bonus', 'fine', 'absence'\]\.includes/)
  assert.match(salariesPage, /if \(!event\) return null/)
  assert.match(migration, /unique\s+references public\.employee_salary_payments|payment_id\s+uuid not null unique/)
  assert.match(migration, /'confirmed'/)
  assert.match(groupMigration, /group_status/)
  assert.match(groupMigration, /group_telegram_message_id/)
  assert.match(groupMigration, /group_error_message/)
  assert.match(groupMigration, /group_sent_at/)
  assert.match(endpoint, /employee_salary_group_notification_deliveries/)
  assert.match(endpoint, /getTelegramMessageId/)
  assert.match(endpoint, /Telegram did not return a message id/)
  assert.match(endpoint, /PENDING_DELIVERY_RETRY_MS/)
  assert.match(endpoint, /getSalaryPaymentRetryTargets/)
  assert.match(endpoint, /getSalaryEventRetryTargets/)
  assert.match(endpoint, /\.eq\('updated_at', delivery\.updated_at\)/)
  assert.match(endpoint, /if \(employeeShouldSend\)/)
  assert.match(endpoint, /if \(groupShouldSend\)/)
  assert.match(endpoint, /created\.error\?\.code === '23505'/)
  assert.match(salariesPage, /groupEventDeliveryRows/)
  assert.match(groupEventMigration, /telegram_notification_targets/)
  assert.match(groupEventMigration, /employee_salary_group_notification_deliveries/)
  assert.match(groupEventMigration, /unique \(event_type, event_id\)/)
  assert.match(groupEventMigration, /'-1003915715160'/)
  assert.match(employeeEventMigration, /employee_status/)
  assert.match(employeeEventMigration, /employee_chat_id/)
  assert.match(employeeEventMigration, /employee_telegram_message_id/)
  assert.match(employeeEventMigration, /employee_error_message/)
  assert.match(employeeEventMigration, /employee_attempted_at/)
  assert.match(employeeEventMigration, /employee_sent_at/)
  assert.match(salariesPage, /delivery\.employee_status/)
  assert.match(salariesPage, /delivery\.employee_telegram_message_id/)
  assert.match(salariesPage, /TELEGRAM_DELIVERY_PAGE_SIZE = 5/)
  assert.match(salariesPage, /pagedTelegramDeliveryRows/)
  assert.match(salariesPage, /retryTelegramDelivery/)
  assert.match(attemptTrackingMigration, /queue_salary_payment_telegram_delivery_trigger/)
  assert.match(attemptTrackingMigration, /queue_salary_bonus_telegram_delivery_trigger/)
  assert.match(attemptTrackingMigration, /queue_salary_fine_telegram_delivery_trigger/)
  assert.match(attemptTrackingMigration, /queue_salary_absence_telegram_delivery_trigger/)
  assert.match(attemptTrackingMigration, /'not_attempted'/)
  assert.match(attemptTrackingMigration, /Notification request was not recorded when the operation was saved/)
})

test('salary rate delivery tracking queues genuine changes but skips an employee initial rate', () => {
  const migration = fs.readFileSync(new URL('../migrations/116_salary_rate_change_telegram_notifications.sql', import.meta.url), 'utf8')

  assert.match(migration, /drop constraint if exists\s+employee_salary_group_notification_deliveries_event_type_check/i)
  assert.match(migration, /check\s*\(event_type in \([^)]*'rate'[^)]*\)\)/i)
  assert.match(migration, /create or replace function public\.queue_salary_rate(?:_change)?_telegram_delivery\(\)/i)
  assert.match(migration, /new\.created_by is null/i)
  assert.match(migration, /not exists\s*\([\s\S]*?from public\.employee_salary_rates[\s\S]*?salary_profile_id\s*=\s*new\.salary_profile_id[\s\S]*?id\s*(?:<>|!=)\s*new\.id[\s\S]*?\)/i)
  assert.match(migration, /insert into public\.employee_salary_group_notification_deliveries/i)
  assert.match(migration, /'rate'/)
  assert.ok((migration.match(/'not_attempted'/g) || []).length >= 2)
  assert.match(migration, /create trigger\s+queue_salary_rate(?:_change)?_telegram_delivery_trigger[\s\S]*?after insert on public\.employee_salary_rates[\s\S]*?queue_salary_rate(?:_change)?_telegram_delivery\(\)/i)
  assert.doesNotMatch(migration, /with\s+tracking_start/i)
})

test('employee salary notifications share one endpoint within the Hobby function limit', () => {
  const notifications = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const apiRoot = new URL('../api/', import.meta.url)

  function countApiFunctions(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
      if (entry.name === '_lib') return total
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
      if (entry.isDirectory()) return total + countApiFunctions(child)
      return total + (entry.name.endsWith('.js') ? 1 : 0)
    }, 0)
  }

  assert.equal((notifications.match(/\/api\/telegram\/employee-notification/g) || []).length, 1)
  assert.match(endpoint, /fine: fineId/)
  assert.match(endpoint, /rate:\s*rateId/)
  assert.match(endpoint, /\[[^\]]*'payment'[^\]]*'rate'[^\]]*\]\.includes\(notificationType\)/)
  assert.match(endpoint, /notifyPayment\(supabase, user, paymentId\)/)
  assert.match(endpoint, /notifySalaryEvent/)
  assert.match(endpoint, /deliverEmployeeSalaryEvent/)
  assert.match(endpoint, /buildSalaryPaymentGroupMessage/)
  assert.match(endpoint, /buildSalaryRateGroupMessage/)
  assert.match(endpoint, /buildEmployeeSalaryRateMessage/)
  assert.equal(fs.existsSync(new URL('../api/telegram/fine-notification.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../api/telegram/payment-notification.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../api/telegram/rate-notification.js', import.meta.url)), false)
  assert.ok(countApiFunctions(apiRoot) <= 12)
})

test('deactivated employees never receive private salary notifications', () => {
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const dailySalary = fs.readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  const employeeEventDelivery = endpoint.slice(
    endpoint.indexOf('async function deliverEmployeeSalaryEvent'),
    endpoint.indexOf('function normalizeDeliverySettlement')
  )
  const paymentDelivery = endpoint.slice(
    endpoint.indexOf('async function notifyPayment'),
    endpoint.indexOf('export default async function handler')
  )

  assert.match(employeeEventDelivery, /salaryProfile\?\.is_active !== false/)
  assert.match(employeeEventDelivery, /INACTIVE_EMPLOYEE_REASON/)
  assert.match(paymentDelivery, /salaryProfile\?\.is_active === false \|\| salaryProfile\?\.deleted_at/)
  assert.match(paymentDelivery, /status: 'skipped'[\s\S]*INACTIVE_EMPLOYEE_REASON/)
  assert.match(dailySalary, /salaryProfile\?\.is_active === false \|\| !isEligibleForSalaryDate/)
})

test('daily salary message shows absence while retaining the daily salary and bonus fields', () => {
  const message = buildDailySalaryMessage({
    ...salaryProfile,
    absences: [{ absence_date: '2026-07-29', note: '<Болезнь>' }],
  }, '2026-07-29', 'ru')

  assert.match(message, /Статус дня:<\/b> Отсутствовал — &lt;Болезнь&gt;/)
  assert.match(message, /Начислено за день:<\/b> 0 UZS/)
  assert.match(message, /Бонусы за день:<\/b> 50 000 UZS/)
  assert.doesNotMatch(message, /<Болезнь>/)
})

test('daily salary message always shows salary and bonus fields while omitting other zero-value sections', () => {
  const message = buildDailySalaryMessage({
    id: 'salary-zero',
    employee_name: 'Новый сотрудник',
    joined_at: '2026-07-29',
    is_active: true,
    rates: [{ effective_from: '2026-07-29', amount: 150_000, rate_unit: 'daily' }],
    payments: [],
    bonuses: [],
    fines: [],
    absences: [{ absence_date: '2026-07-29', note: 'Болезнь' }],
  }, '2026-07-29', 'ru')

  assert.match(message, /Здравствуйте, Новый сотрудник!/)
  assert.match(message, /Статус дня:<\/b> Отсутствовал — Болезнь/)
  assert.match(message, /Начислено за день:<\/b> 0 UZS/)
  assert.match(message, /Бонусы за день:<\/b> 0 UZS/)
  assert.doesNotMatch(message, /Штрафы за день/)
  assert.doesNotMatch(message, /Выплачено за день/)
  assert.doesNotMatch(message, /К выплате/)
})

test('employee start links accept only the expected token shape', () => {
  const token = 'd1d8de7b-80bf-4f82-84b1-341f06356f75'
  assert.equal(parseEmployeeStartToken(`/start employee_${token}`), token)
  assert.equal(parseEmployeeStartToken(`/start@zar_bot employee_${token}`), token)
  assert.equal(parseEmployeeStartToken('/start employee_not-a-token'), '')
})

test('employee linking sends the current Tashkent salary status after confirmation', () => {
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  assert.match(webhook, /loadSalaryProfiles\(supabase, \[link\.salary_profile_id\]\)/)
  assert.match(webhook, /buildDailySalaryMessage\(salaryProfile, getTashkentDate\(\), 'ru'\)/)
  assert.match(webhook, /Текущий статус/)
  assert.match(webhook, /linkedMessage\(\)/)
})

test('Telegram webhook can reveal the exact salary group chat id during setup', () => {
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  assert.match(webhook, /\/chatid/)
  assert.match(webhook, /Telegram chat ID for/)
  assert.match(webhook, /escapeTelegramHtml\(message\.chat\.id\)/)
})

test('group start returns its chat id while language selection stays private', () => {
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  assert.match(webhook, /const isPrivateChat = message\?\.chat\?\.type === 'private'/)
  assert.match(webhook, /isLanguageCommand && isPrivateChat/)
  assert.match(webhook, /isLanguageCommand\) \{\s*await sendChatIdMessage\(message\)/)
  assert.match(webhook, /token && isPrivateChat/)
})

test('current employee status uses the Tashkent calendar date', () => {
  assert.equal(getTashkentDate(new Date('2026-07-28T18:59:59Z')), '2026-07-28')
  assert.equal(getTashkentDate(new Date('2026-07-28T19:00:00Z')), '2026-07-29')
})

test('daily salary cron runs at 01:00 Tashkent and reports the completed day', () => {
  const supabaseCron = fs.readFileSync(
    new URL('../migrations/152_supabase_daily_report_cron.sql', import.meta.url),
    'utf8'
  )
  const dailySalaryEndpoint = fs.readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')

  assert.match(supabaseCron, /'0 20 \* \* \*'/)
  assert.equal(getCompletedTashkentDate(new Date('2026-07-29T20:00:00Z')), '2026-07-29')
  assert.deepEqual(
    getCompletedTashkentDates(new Date('2026-07-29T20:00:00Z'), 3),
    ['2026-07-27', '2026-07-28', '2026-07-29']
  )
  assert.match(dailySalaryEndpoint, /const notificationDate = getCompletedTashkentDate\(now\)/)
  assert.match(dailySalaryEndpoint, /getCompletedTashkentDates\(now, KPI_RETRY_LOOKBACK_DAYS\)/)
  assert.match(dailySalaryEndpoint, /get_pending_daily_kpi_dates/)
  assert.match(dailySalaryEndpoint, /get_pending_employee_meal_dates/)
  assert.match(dailySalaryEndpoint, /finalizeDailyKpiDate[\s\S]*?sendDailySalaryNotifications/)
})


test('private manual bonus notifications use Russian regardless of employee language', () => {
  for (const language of ['ru', 'uz', 'en']) {
    const message = buildEmployeeSalaryEventMessage('bonus', {
      employee_name: 'Азиз',
      bonus_date: '2026-09-13',
      amount: 150_000,
      accrues_to_salary: true,
      note: 'Отличная работа',
      created_by_name: 'Администратор',
    }, 500_000, language)
    assert.match(message, /Здравствуйте, Азиз!/)
    assert.match(message, /Ваш бонус начислен и добавлен к балансу зарплаты/)
    assert.match(message, /150 000 UZS/)
    assert.match(message, /13 сентября 2026/)
    assert.match(message, /Отличная работа/)
  }
})

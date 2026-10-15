import { expenseCategoryLabel, expensePaymentMethodLabel } from '../expenses.js'

// Sheet titles, column headers and metric names for assistant Excel exports.
const DATASET_LABELS = {
  summary: { uz: 'Umumiy', ru: 'Итоги', en: 'Summary' },
  daily: { uz: 'Kunlar bo‘yicha', ru: 'По дням', en: 'By day' },
  monthly: { uz: 'Oylar bo‘yicha', ru: 'По месяцам', en: 'By month' },
  categories: { uz: 'Xarajat toifalari', ru: 'Категории расходов', en: 'Expense categories' },
  expenses: { uz: 'Xarajatlar', ru: 'Расходы', en: 'Expenses' },
  dish_sales: { uz: 'Taomlar savdosi', ru: 'Продажи блюд', en: 'Dish sales' },
}

const COLUMN_LABELS = {
  metric: { uz: 'Ko‘rsatkich', ru: 'Показатель', en: 'Metric' },
  value: { uz: 'Qiymat', ru: 'Значение', en: 'Value' },
  unit: { uz: 'Birlik', ru: 'Ед.', en: 'Unit' },
  date: { uz: 'Sana', ru: 'Дата', en: 'Date' },
  month: { uz: 'Oy', ru: 'Месяц', en: 'Month' },
  cafeIncome: { uz: 'Kafe daromadi', ru: 'Доход кафе', en: 'Cafe income' },
  orderCount: { uz: 'Buyurtmalar', ru: 'Заказы', en: 'Orders' },
  salesCost: { uz: 'Tannarx', ru: 'Себестоимость', en: 'Cost of sales' },
  spent: { uz: 'Sarflangan', ru: 'Потрачено', en: 'Spent' },
  salaryExpenses: { uz: 'Maoshlar', ru: 'Зарплаты', en: 'Salaries' },
  bazaarExpenses: { uz: 'Bozor', ru: 'Базар', en: 'Bazaar' },
  employeeMealExpenses: { uz: 'Xodimlar ovqati', ru: 'Питание сотрудников', en: 'Staff meals' },
  otherExpenses: { uz: 'Boshqa xarajatlar', ru: 'Прочие расходы', en: 'Other expenses' },
  left: { uz: 'Qoldi', ru: 'Осталось', en: 'Left' },
  otherIncome: { uz: 'Boshqa daromad', ru: 'Прочий доход', en: 'Other income' },
  investorSupport: { uz: 'Investor yordami', ru: 'Поддержка инвестора', en: 'Investor support' },
  operatingResult: { uz: 'Operatsion natija', ru: 'Операционный итог', en: 'Operating result' },
  category: { uz: 'Toifa', ru: 'Категория', en: 'Category' },
  amount: { uz: 'Summa', ru: 'Сумма', en: 'Amount' },
  sharePct: { uz: 'Ulushi, %', ru: 'Доля, %', en: 'Share, %' },
  count: { uz: 'Soni', ru: 'Количество', en: 'Count' },
  paymentMethod: { uz: 'To‘lov usuli', ru: 'Способ оплаты', en: 'Payment method' },
  vendor: { uz: 'Kimga', ru: 'Получатель', en: 'Vendor' },
  description: { uz: 'Izoh', ru: 'Описание', en: 'Description' },
  dish: { uz: 'Taom', ru: 'Блюдо', en: 'Dish' },
  quantity: { uz: 'Soni', ru: 'Количество', en: 'Quantity' },
  itemRevenue: { uz: 'Savdo (xizmatsiz)', ru: 'Продажи (без обслуживания)', en: 'Sales (before service)' },
}

const METRIC_LABELS = {
  cafeIncome: COLUMN_LABELS.cafeIncome,
  orderCount: COLUMN_LABELS.orderCount,
  averageCheck: { uz: 'O‘rtacha chek', ru: 'Средний чек', en: 'Average check' },
  averageDailyIncome: { uz: 'Kunlik o‘rtacha daromad', ru: 'Средний доход в день', en: 'Average daily income' },
  loyaltyIncome: { uz: 'Sodiqlik kartasi bilan to‘lov', ru: 'Оплата картой лояльности', en: 'Paid with loyalty card' },
  salesCost: COLUMN_LABELS.salesCost,
  grossProfit: { uz: 'Yalpi foyda', ru: 'Валовая прибыль', en: 'Gross profit' },
  grossMarginPct: { uz: 'Yalpi marja', ru: 'Валовая маржа', en: 'Gross margin' },
  incomeCash: { uz: 'Naqd tushum', ru: 'Наличные', en: 'Cash income' },
  incomeCard: { uz: 'Karta tushumi', ru: 'Карта', en: 'Card income' },
  incomeTerminal: { uz: 'Terminal tushumi', ru: 'Терминал', en: 'Terminal income' },
  incomeLoyaltyCard: { uz: 'Sodiqlik kartasi', ru: 'Карта лояльности', en: 'Loyalty card' },
  incomeSalary: { uz: 'Maoshdan (naqdsiz)', ru: 'Из зарплаты (безналичный зачёт)', en: 'Salary deduction (non-cash)' },
  investorSupport: COLUMN_LABELS.investorSupport,
  otherIncome: COLUMN_LABELS.otherIncome,
  totalExpenses: { uz: 'Jami xarajatlar', ru: 'Все расходы', en: 'All expenses' },
  salaryExpenses: COLUMN_LABELS.salaryExpenses,
  bazaarExpenses: COLUMN_LABELS.bazaarExpenses,
  employeeMealExpenses: COLUMN_LABELS.employeeMealExpenses,
  otherExpenses: COLUMN_LABELS.otherExpenses,
  netIncome: { uz: 'Sof natija', ru: 'Чистый итог', en: 'Net result' },
}

export const DEFAULT_FILE_NAME = { uz: 'Zar Kebab hisobot', ru: 'Отчёт Zar Kebab', en: 'Zar Kebab report' }

function pick(labels, lang) {
  return labels ? labels[lang] || labels.en : null
}

export function createAssistantLabels(lang) {
  return {
    lang,
    dataset: key => pick(DATASET_LABELS[key], lang) || key,
    column: key => pick(COLUMN_LABELS[key], lang) || key,
    // Stored keys shown as words in the user's language; null keeps the raw value.
    value: (columnKey, value) => {
      if (columnKey === 'category') return expenseCategoryLabel(value, lang)
      if (columnKey === 'paymentMethod') return expensePaymentMethodLabel(value, lang)
      if (columnKey === 'metric') return pick(METRIC_LABELS[value], lang)
      return null
    },
    defaultFileName: () => pick(DEFAULT_FILE_NAME, lang),
  }
}

import CalendarPicker from '../components/CalendarPicker'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Banknote,
  BarChart2,
  CalendarDays,
  CreditCard,
  Edit3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingBasket,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { ChoiceGroup, ChoiceTile } from '../components/ChoiceTiles'
import BazaarIngredientPicker from '../components/BazaarIngredientPicker'
import DateRangePicker from '../components/DateRangePicker'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canEditFeature } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatLongDate } from '../lib/dateFormat'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { withWriteTimeout } from '../lib/writeTimeout'
import { notifyTelegramInvestorExpense } from '../lib/telegramNotifications'
import { getExpenseEntryMinDate, isExpenseEntryDateAllowed } from '../lib/expenses'
import {
  BAZAAR_CATEGORIES,
  bazaarCategoriesFor,
  isValidBazaarCategory,
  BAZAAR_ENTRY_UNITS,
  BAZAAR_ENTRY_PAYMENT_METHODS,
  BAZAAR_PAYMENT_METHODS,
  bazaarCategoryLabel,
  bazaarPaymentMethodLabel,
  bazaarUnitLabel,
  calculateBazaarTotal,
  calculateBazaarNormalTotal,
  calculateBazaarExpectedTotal,
  calculateBazaarPriceDifference,
  filterBazaarPurchases,
  formatBazaarQuantity,
  getBazaarPurchaseScopedItems,
  getBazaarPurchaseScopedTotal,
  getBazaarDisplayQuantity,
  getBazaarRange,
  getBazaarSubmissionAttempt,
  getBazaarUnitCost,
  getBazaarNormalLineTotal,
  getBazaarPriceDifference,
  normalizeBazaarProductKey,
  normalizeBazaarPurchase,
  normalizeBazaarQuantity,
  normalizeBazaarQuantityToBase,
  summarizeBazaarPurchases,
  todayBazaarDate,
  validateBazaarPurchase,
} from '../lib/bazaar'

const PURCHASE_COLUMNS = `
  id,
  expense_id,
  purchase_date,
  payment_method,
  buyer_profile_id,
  buyer_name,
  notes,
  total_amount,
  entry_source,
  created_by,
  created_by_name,
  created_at,
  updated_at,
  bazaar_purchase_items (
    id,
    product_name,
    product_key,
    category,
    quantity,
    unit,
    line_total,
    normal_unit_price,
    normal_line_total,
    price_difference,
    sort_order,
    notes
  )
`

const INPUT = 'ws-input disabled:cursor-not-allowed disabled:bg-[#efece9] disabled:text-[#68655f]'
const SELECT = `${INPUT} pr-8`
const LOAD_PAGE_SIZE = 500
const HISTORY_PAGE_SIZE = 10

const EN = {
  title: 'Daily Bazaar',
  sub: 'Record exactly what arrived and where every sum of bazaar money went',
  entry: 'New entry',
  history: 'History',
  analytics: 'Analytics',
  ingredientCatalog: 'Ingredients & normal prices',
  newEntry: 'New bazaar entry',
  editEntry: 'Edit bazaar entry',
  entryHint: 'One entry should use one payment method. Add another entry when payment methods differ.',
  purchaseDate: 'Purchase date',
  buyer: 'Buyer',
  selectBuyer: 'Select an employee',
  payment: 'Payment method',
  notes: 'Entry notes',
  notesPlaceholder: 'Optional context for this bazaar trip',
  products: 'Products received',
  productsHint: 'Quantity and total paid are the source of truth. Unit cost is calculated automatically.',
  addProduct: 'Add product',
  editProduct: 'Edit product',
  addLine: 'Add to bazaar',
  saveLine: 'Save product',
  noProducts: 'No products yet. Add what was bought at the bazaar.',
  missingProduct: 'Product not selected',
  fixLine: 'Fix this product',
  item: 'Item',
  product: 'Product',
  productPlaceholder: 'e.g. Tomatoes',
  selectProduct: 'Select an ingredient',
  noIngredients: 'No active ingredients. Add ingredients and normal prices first.',
  normalPrice: 'Normal price',
  normalTotal: 'Normal total',
  difference: 'Difference',
  category: 'Category',
  quantity: 'Quantity',
  unit: 'Unit',
  totalPaid: 'Total paid',
  unitCost: 'Cost per unit',
  lineNotes: 'Line note',
  lineNotesPlaceholder: 'Grade, seller, purpose…',
  removeLine: 'Remove line',
  totalBazaar: 'Bazaar total',
  itemCount: 'Product lines',
  exactHint: 'This total is mirrored into Accounting as one Products / bazaar expense.',
  save: 'Save bazaar',
  saving: 'Saving…',
  cancelEdit: 'Cancel edit',
  readOnly: 'Your access is read-only. You can review history and analytics.',
  saved: 'Bazaar entry saved and added to Accounting.',
  investorNotificationFailed: 'The Bazaar expense was saved, but the ZarKebab Investor group notification was not sent.',
  updated: 'Bazaar entry and its Accounting expense were updated.',
  deleted: 'Bazaar entry removed.',
  saveFailed: 'Could not save the bazaar entry.',
  expenseDateLimit: 'A Bazaar expense can be added only for today or the previous 3 calendar days.',
  deleteFailed: 'Could not delete the bazaar entry.',
  loadFailed: 'Could not load bazaar data',
  migrationMissing: 'Daily Bazaar is not ready in the database yet. Apply the latest bazaar migration, then refresh.',
  refresh: 'Refresh',
  dateRange: 'Date range',
  today: 'Today',
  week: '7 days',
  month: 'This month',
  previousMonth: 'Previous month',
  from: 'From',
  to: 'To',
  search: 'Search product, buyer or note',
  searchLabel: 'Search bazaar history',
  clearSearch: 'Clear bazaar search',
  closeSearch: 'Close bazaar search',
  allCategories: 'All categories',
  allPayments: 'All payment methods',
  results: 'entries',
  noHistory: 'No bazaar entries match this period and filters.',
  noAnalytics: 'No bazaar spend is recorded for this period.',
  productName: 'Product name',
  itemPrice: 'Item total',
  actions: 'Actions',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  of: 'of',
  details: 'Details',
  hideDetails: 'Hide details',
  edit: 'Edit',
  delete: 'Delete',
  confirmDelete: 'Confirm delete',
  deleting: 'Deleting…',
  addedBy: 'Added by',
  unspecifiedBuyer: 'Not specified',
  legacy: 'Historical entry',
  legacyReadOnly: 'Backfilled historical expense details cannot be edited here.',
  totalSpent: 'Total bazaar spend',
  averageDaily: 'Average per calendar day',
  calendarDays: 'calendar days',
  purchases: 'Bazaar entries',
  uniqueProducts: 'Unique products',
  activeDays: 'Days with bazaar',
  dailySpend: 'Daily spend',
  categorySpend: 'Spend by category',
  paymentSpend: 'Payment methods',
  buyerSpend: 'Spend by buyer',
  topProducts: 'Top products',
  ofTotal: 'of total',
  purchasesShort: 'entries',
  averageUnitCost: 'Avg unit cost',
  latestUnitCost: 'Latest',
  priceUp: 'up',
  priceDown: 'down',
  selectedCategory: 'Analytics are scoped to the selected category.',
  presets: 'Presets',
  previousWeek: 'Previous week',
  previousCurrentWeek: 'Previous & current week',
  currentWeek: 'Current week',
  currentNextWeek: 'Current & next week',
  nextWeek: 'Next week',
  nextMonth: 'Next month',
  applyRange: 'Apply range',
  cancel: 'Cancel',
  selectDateRange: 'Select date range',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  validation: {
    purchase_date_required: 'Choose the purchase date.',
    buyer_profile_id_required: 'Choose the employee who made the purchase.',
    payment_method_required: 'Choose a valid payment method.',
    items_required: 'Add at least one product.',
    product_name_required: 'Enter the product name.',
    category_required: 'Choose a valid category.',
    unit_required: 'Choose a valid unit.',
    quantity_required: 'Enter a quantity greater than zero.',
    quantity_must_be_whole: 'This unit requires a whole-number quantity.',
    quantity_precision: 'Weight and volume can have at most 3 decimal places.',
    line_total_required: 'Enter the total amount paid for this product.',
    total_required: 'Bazaar total must be greater than zero.',
  },
}

const LABELS = {
  en: EN,
  uz: {
    title: 'Kunlik bozor',
    sub: 'Nima kelgani va bozor pulining har bir so‘mi qayerga ketganini aniq yozing',
    entry: 'Yangi yozuv', history: 'Tarix', analytics: 'Tahlil', ingredientCatalog: 'Masalliqlar va odatiy narxlar',
    newEntry: 'Yangi bozor yozuvi', editEntry: 'Bozor yozuvini tahrirlash',
    entryHint: 'Bitta yozuvda bitta to‘lov turidan foydalaning. To‘lov turi boshqacha bo‘lsa, alohida yozuv qo‘shing.',
    purchaseDate: 'Xarid sanasi', buyer: 'Xarid qilgan', selectBuyer: 'Xodimni tanlang',
    payment: 'To‘lov turi', notes: 'Umumiy izoh', notesPlaceholder: 'Bozor xaridi haqida ixtiyoriy izoh',
    products: 'Kelgan mahsulotlar', productsHint: 'Miqdor va to‘langan summa asosiy ma’lumot. Birlik narxi avtomatik hisoblanadi.',
    addProduct: 'Mahsulot qo‘shish', editProduct: 'Mahsulotni tahrirlash', addLine: 'Bozorga qo‘shish', saveLine: 'Mahsulotni saqlash', noProducts: 'Hali mahsulot yo‘q. Bozordan olingan narsalarni qo‘shing.', missingProduct: 'Mahsulot tanlanmagan', fixLine: 'Mahsulotni tuzating', item: 'Qator', product: 'Mahsulot', productPlaceholder: 'Masalan: Pomidor', selectProduct: 'Masalliqni tanlang', noIngredients: 'Faol masalliq yo‘q. Avval masalliq va odatiy narxlarni qo‘shing.', normalPrice: 'Odatiy narx', normalTotal: 'Odatiy jami', difference: 'Farq', category: 'Kategoriya',
    quantity: 'Miqdor', unit: 'Birlik', totalPaid: 'To‘langan jami', unitCost: 'Birlik narxi', lineNotes: 'Qator izohi',
    lineNotesPlaceholder: 'Navi, sotuvchi, maqsad…', removeLine: 'Qatorni o‘chirish', totalBazaar: 'Bozor jami', itemCount: 'Mahsulot qatorlari',
    exactHint: 'Bu jami Buxgalteriyaga bitta Bozor mahsulotlari xarajati sifatida tushadi.', save: 'Bozorni saqlash', saving: 'Saqlanmoqda…', cancelEdit: 'Tahrirni bekor qilish',
    readOnly: 'Siz faqat ko‘rishingiz mumkin. Tarix va tahlil mavjud.', saved: 'Bozor yozuvi saqlandi va Buxgalteriyaga qo‘shildi.',
    investorNotificationFailed: 'Bozor xarajati saqlandi, lekin ZarKebab Investor guruhiga xabar yuborilmadi.',
    updated: 'Bozor yozuvi va Buxgalteriyadagi xarajat yangilandi.', deleted: 'Bozor yozuvi o‘chirildi.', saveFailed: 'Bozor yozuvini saqlab bo‘lmadi.',
    expenseDateLimit: 'Bozor xarajati faqat bugun yoki oldingi 3 kalendar kun uchun kiritilishi mumkin.',
    deleteFailed: 'Bozor yozuvini o‘chirib bo‘lmadi.', loadFailed: 'Bozor ma’lumotlarini yuklab bo‘lmadi',
    migrationMissing: 'Kunlik bozor bazada hali tayyor emas. Oxirgi bozor migratsiyasini ishga tushiring va yangilang.', refresh: 'Yangilash',
    dateRange: 'Sana oralig‘i', today: 'Bugun', week: '7 kun', month: 'Joriy oy', previousMonth: 'O‘tgan oy', from: 'Dan', to: 'Gacha',
    search: 'Mahsulot, xaridor yoki izoh', searchLabel: 'Bozor tarixidan qidirish', clearSearch: 'Qidiruvni tozalash', closeSearch: 'Qidiruvni yopish',
    allCategories: 'Barcha kategoriyalar', allPayments: 'Barcha to‘lovlar', results: 'yozuv', noHistory: 'Bu davr va filtrlarga mos bozor yozuvi yo‘q.',
    productName: 'Mahsulot nomi', itemPrice: 'Mahsulot summasi', actions: 'Amallar', previous: 'Oldingi', next: 'Keyingi', page: 'Sahifa', of: '/',
    noAnalytics: 'Bu davr uchun bozor xarajati yozilmagan.', details: 'Tafsilotlar', hideDetails: 'Yopish', edit: 'Tahrirlash', delete: 'O‘chirish',
    confirmDelete: 'O‘chirishni tasdiqlash', deleting: 'O‘chirilmoqda…', addedBy: 'Kiritgan',
    unspecifiedSupplier: 'Ko‘rsatilmagan', unspecifiedBuyer: 'Ko‘rsatilmagan', legacy: 'Tarixiy yozuv', legacyReadOnly: 'Oldingi xarajatlardan ko‘chirilgan yozuvni bu yerda tahrirlab bo‘lmaydi.',
    totalSpent: 'Bozor jami xarajati', averageDaily: 'Kalendar kuniga o‘rtacha', calendarDays: 'kalendar kun', purchases: 'Bozor yozuvlari', uniqueProducts: 'Turli mahsulotlar', activeDays: 'Bozor qilingan kunlar',
    dailySpend: 'Kunlar bo‘yicha xarajat', categorySpend: 'Kategoriya bo‘yicha', paymentSpend: 'To‘lov turlari', buyerSpend: 'Xarid qilgan xodim bo‘yicha', topProducts: 'Eng ko‘p xarajatli mahsulotlar',
    ofTotal: 'jami ichida', purchasesShort: 'yozuv', averageUnitCost: 'O‘rtacha birlik narxi', latestUnitCost: 'Oxirgi', priceUp: 'oshdi', priceDown: 'tushdi',
    selectedCategory: 'Tahlil tanlangan kategoriya bo‘yicha hisoblandi.',
    presets: 'Tayyor davrlar', previousWeek: 'O‘tgan hafta', previousCurrentWeek: 'O‘tgan va joriy hafta', currentWeek: 'Joriy hafta',
    currentNextWeek: 'Joriy va keyingi hafta', nextWeek: 'Keyingi hafta', nextMonth: 'Keyingi oy', applyRange: 'Davrni qo‘llash', cancel: 'Bekor qilish',
    selectDateRange: 'Sana oralig‘ini tanlash', weekdays: ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'],
    validation: {
      purchase_date_required: 'Xarid sanasini tanlang.', buyer_profile_id_required: 'Xarid qilgan xodimni tanlang.', payment_method_required: 'To‘g‘ri to‘lov turini tanlang.', items_required: 'Kamida bitta mahsulot qo‘shing.',
      product_name_required: 'Mahsulot nomini kiriting.', category_required: 'To‘g‘ri kategoriyani tanlang.', unit_required: 'To‘g‘ri birlikni tanlang.',
      quantity_required: 'Noldan katta miqdor kiriting.', quantity_must_be_whole: 'Bu birlik uchun miqdor butun son bo‘lishi kerak.',
      quantity_precision: 'Og‘irlik va hajmda ko‘pi bilan 3 ta kasr xonasi bo‘lishi mumkin.', line_total_required: 'Mahsulot uchun to‘langan jami summani kiriting.',
      total_required: 'Bozor jami noldan katta bo‘lishi kerak.',
    },
  },
  ru: {
    title: 'Ежедневный базар',
    sub: 'Фиксируйте, что именно пришло и куда ушёл каждый сум',
    entry: 'Новая запись', history: 'История', analytics: 'Аналитика', ingredientCatalog: 'Ингредиенты и обычные цены',
    newEntry: 'Новая запись базара', editEntry: 'Изменить запись базара',
    entryHint: 'В одной записи используйте один способ оплаты. Для другого способа создайте новую запись.',
    purchaseDate: 'Дата покупки', buyer: 'Закупщик', selectBuyer: 'Выберите сотрудника',
    payment: 'Способ оплаты', notes: 'Общее примечание', notesPlaceholder: 'Необязательный контекст закупки',
    products: 'Поступившие продукты', productsHint: 'Количество и оплаченная сумма — источник истины. Цена за единицу считается автоматически.',
    addProduct: 'Добавить продукт', editProduct: 'Изменить продукт', addLine: 'Добавить в базар', saveLine: 'Сохранить продукт', noProducts: 'Пока нет продуктов. Добавьте то, что купили на базаре.', missingProduct: 'Продукт не выбран', fixLine: 'Исправьте продукт', item: 'Строка', product: 'Продукт', productPlaceholder: 'Например: Помидоры', selectProduct: 'Выберите ингредиент', noIngredients: 'Нет активных ингредиентов. Сначала добавьте ингредиенты и обычные цены.', normalPrice: 'Обычная цена', normalTotal: 'Итого по обычной цене', difference: 'Разница', category: 'Категория',
    quantity: 'Количество', unit: 'Единица', totalPaid: 'Оплачено всего', unitCost: 'Цена за единицу', lineNotes: 'Примечание',
    lineNotesPlaceholder: 'Сорт, продавец, назначение…', removeLine: 'Удалить строку', totalBazaar: 'Итого базар', itemCount: 'Строк продуктов',
    exactHint: 'Эта сумма попадёт в Бухгалтерию одним расходом «Продукты / базар».', save: 'Сохранить базар', saving: 'Сохраняется…', cancelEdit: 'Отменить изменение',
    readOnly: 'У вас доступ только для просмотра. История и аналитика доступны.', saved: 'Запись базара сохранена и добавлена в Бухгалтерию.',
    investorNotificationFailed: 'Расход базара сохранён, но сообщение в группу ZarKebab Investor не отправлено.',
    updated: 'Запись базара и расход в Бухгалтерии обновлены.', deleted: 'Запись базара удалена.', saveFailed: 'Не удалось сохранить запись базара.',
    expenseDateLimit: 'Расход базара можно добавить только за сегодня или за предыдущие 3 календарных дня.',
    deleteFailed: 'Не удалось удалить запись базара.', loadFailed: 'Не удалось загрузить данные базара',
    migrationMissing: 'Ежедневный базар ещё не готов в базе. Примените последнюю миграцию базара и обновите.', refresh: 'Обновить',
    dateRange: 'Период', today: 'Сегодня', week: '7 дней', month: 'Текущий месяц', previousMonth: 'Прошлый месяц', from: 'С', to: 'По',
    search: 'Продукт, закупщик или примечание', searchLabel: 'Поиск по истории базара', clearSearch: 'Очистить поиск', closeSearch: 'Закрыть поиск',
    allCategories: 'Все категории', allPayments: 'Все способы оплаты', results: 'записей', noHistory: 'Нет записей базара для этого периода и фильтров.',
    productName: 'Название продукта', itemPrice: 'Сумма товара', actions: 'Действия', previous: 'Назад', next: 'Далее', page: 'Страница', of: 'из',
    noAnalytics: 'За этот период расходов базара нет.', details: 'Детали', hideDetails: 'Скрыть', edit: 'Изменить', delete: 'Удалить',
    confirmDelete: 'Подтвердить удаление', deleting: 'Удаляется…', addedBy: 'Добавил',
    unspecifiedSupplier: 'Не указано', unspecifiedBuyer: 'Не указано', legacy: 'Историческая запись', legacyReadOnly: 'Запись, перенесённую из старых расходов, нельзя изменить здесь.',
    totalSpent: 'Всего на базар', averageDaily: 'Среднее на календарный день', calendarDays: 'календарных дней', purchases: 'Записи базара', uniqueProducts: 'Разные продукты', activeDays: 'Дни с базаром',
    dailySpend: 'Расходы по дням', categorySpend: 'По категориям', paymentSpend: 'Способы оплаты', buyerSpend: 'Расходы по закупщику', topProducts: 'Главные продукты по расходам',
    ofTotal: 'от общей суммы', purchasesShort: 'записей', averageUnitCost: 'Средняя цена за ед.', latestUnitCost: 'Последняя', priceUp: 'выше', priceDown: 'ниже',
    selectedCategory: 'Аналитика рассчитана по выбранной категории.',
    presets: 'Готовые периоды', previousWeek: 'Прошлая неделя', previousCurrentWeek: 'Прошлая и текущая неделя', currentWeek: 'Текущая неделя',
    currentNextWeek: 'Текущая и следующая неделя', nextWeek: 'Следующая неделя', nextMonth: 'Следующий месяц', applyRange: 'Применить период', cancel: 'Отмена',
    selectDateRange: 'Выбрать период', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    validation: {
      purchase_date_required: 'Выберите дату покупки.', buyer_profile_id_required: 'Выберите сотрудника, который сделал закупку.', payment_method_required: 'Выберите корректный способ оплаты.', items_required: 'Добавьте хотя бы один продукт.',
      product_name_required: 'Введите название продукта.', category_required: 'Выберите корректную категорию.', unit_required: 'Выберите корректную единицу.',
      quantity_required: 'Введите количество больше нуля.', quantity_must_be_whole: 'Для этой единицы нужно целое количество.',
      quantity_precision: 'Вес и объём могут иметь не более 3 знаков после запятой.', line_total_required: 'Введите общую сумму за этот продукт.',
      total_required: 'Общая сумма базара должна быть больше нуля.',
    },
  },
}

function labelsFor(lang) {
  const localized = LABELS[lang] || EN
  return { ...EN, ...localized, validation: { ...EN.validation, ...(localized.validation || {}) } }
}

function methodIcon(method) {
  if (method === 'card') return CreditCard
  if (method === 'terminal') return Terminal
  return Banknote
}


let lineSequence = 0
function blankItem(overrides = {}) {
  lineSequence += 1
  return {
    _key: `bazaar-line-${Date.now()}-${lineSequence}`,
    product_key: '',
    product_name: '',
    category: 'vegetables',
    quantity: '',
    unit: 'kg',
    line_total: '',
    notes: '',
    ...overrides,
  }
}

function emptyForm(buyerName = '', buyerProfileId = '') {
  return {
    id: '',
    purchase_date: todayBazaarDate(),
    payment_method: 'cash',
    buyer_profile_id: buyerProfileId,
    buyer_name: buyerName,
    notes: '',
    items: [],
  }
}

function formFromPurchase(purchase) {
  const normalized = normalizeBazaarPurchase(purchase)
  return {
    id: normalized.id,
    purchase_date: normalized.purchase_date,
    payment_method: normalized.payment_method,
    buyer_profile_id: normalized.buyer_profile_id || '',
    buyer_name: normalized.buyer_name,
    notes: normalized.notes,
    items: normalized.items.map(item => blankItem({
      id: item.id,
      product_name: item.product_name,
      product_key: item.product_key,
      category: item.category,
      quantity: String(item.quantity || ''),
      unit: item.unit,
      line_total: String(item.line_total || ''),
      normal_unit_price: item.normal_unit_price || '',
      notes: item.notes,
    })),
  }
}

function isLegacyPurchase(purchase) {
  return purchase?.entry_source === 'accounting_backfill'
}

function createBazaarRequestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16)
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function bazaarErrorMessage(error, l, fallback) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  const missing = (
    text.includes('bazaar_purchases') ||
    text.includes('bazaar_purchase_items') ||
    text.includes('save_bazaar_purchase') ||
    text.includes('delete_bazaar_purchase')
  ) && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('42p01') ||
    text.includes('pgrst202') ||
    text.includes('pgrst205')
  )
  return missing ? l.migrationMissing : (error?.message || fallback)
}

function validationMessage(validationError, l) {
  const message = l.validation[validationError?.code] || l.saveFailed
  return Number.isInteger(validationError?.index)
    ? `${l.item} ${validationError.index + 1}: ${message}`
    : message
}

function formatBazaarSignedCurrency(value) {
  const amount = Math.round(Number(value) || 0)
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount)
}

function bazaarDifferenceTone(value) {
  const amount = Number(value) || 0
  if (amount > 0) return 'ws-tone-negative'
  if (amount < 0) return 'ws-tone-positive'
  return 'border-[#e4e1de] bg-white text-[#68655f]'
}

export default function DailyBazaar() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = useMemo(() => labelsFor(lang), [lang])
  const role = profile?.role || state.user?.role || 'guest'
  const canManage = canEditFeature(profile || { role }, 'bazaar')
  const defaultBuyer = profile?.full_name || profile?.email || state.user?.name || ''
  const defaultBuyerProfileId = profile?.id || state.user?.id || ''
  const expenseEntryMinDate = getExpenseEntryMinDate()

  const initialRange = useMemo(() => getBazaarRange('today'), [])
  const [tab, setTab] = useState(canManage ? 'entry' : 'history')
  const [rangeKey, setRangeKey] = useState('today')
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  const [form, setForm] = useState(() => emptyForm(defaultBuyer, defaultBuyerProfileId))
  const [employees, setEmployees] = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])
  const requestRef = useRef(0)
  const labelsRef = useRef(l)
  const submissionAttemptRef = useRef(null)
  const loadedRangeRef = useRef('')

  useEffect(() => {
    labelsRef.current = l
  }, [l])

  useEffect(() => {
    if (!defaultBuyer) return
    setForm(current => current.buyer_name ? current : {
      ...current,
      buyer_profile_id: defaultBuyerProfileId,
      buyer_name: defaultBuyer,
    })
  }, [defaultBuyer, defaultBuyerProfileId])

  useEffect(() => {
    let active = true

    async function loadReferenceData() {
      try {
        const [profilesResult, catalogResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, email, role, status')
            .eq('status', 'active')
            .neq('role', 'guest')
            .order('full_name'),
          supabase
            .from('bazaar_product_catalog')
            .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
            .eq('is_catalog_managed', true)
            .eq('is_active', true)
            .order('last_purchase_date', { ascending: false })
            .order('updated_at', { ascending: false }),
        ])
        if (!active) return
        if (!profilesResult.error) setEmployees(profilesResult.data || [])
        if (!catalogResult.error) setCatalogProducts(catalogResult.data || [])
      } catch {
        // The current signed-in employee and range purchases remain usable fallbacks.
      }
    }

    loadReferenceData()
    return () => { active = false }
  }, [])

  const loadPurchases = useCallback(async () => {
    const requestId = requestRef.current + 1
    const requestedRange = `${dateFrom}:${dateTo}`
    requestRef.current = requestId
    setLoading(true)
    setError('')
    const rows = []
    let from = 0

    try {
      while (true) {
        const { data, error: loadError } = await supabase
          .from('bazaar_purchases')
          .select(PURCHASE_COLUMNS)
          .gte('purchase_date', dateFrom)
          .lte('purchase_date', dateTo)
          .order('purchase_date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + LOAD_PAGE_SIZE - 1)

        if (requestId !== requestRef.current) return
        if (loadError) throw loadError

        const page = data || []
        rows.push(...page)
        if (page.length < LOAD_PAGE_SIZE) break
        from += LOAD_PAGE_SIZE
      }

      if (requestId !== requestRef.current) return
      setPurchases(rows.map(normalizeBazaarPurchase))
      loadedRangeRef.current = requestedRange
    } catch (loadError) {
      if (requestId !== requestRef.current) return
      if (loadedRangeRef.current !== requestedRange) setPurchases([])
      const currentLabels = labelsRef.current
      setError(bazaarErrorMessage(loadError, currentLabels, currentLabels.loadFailed))
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    loadPurchases()
    return () => { requestRef.current += 1 }
  }, [loadPurchases])

  const productSuggestions = useMemo(() => catalogProducts
    .map(product => ({
      key: product.product_key || normalizeBazaarProductKey(product.product_name),
      name: product.product_name,
      category: product.category,
      unit: product.unit,
      normalUnitPrice: Number(product.normal_unit_price) || 0,
    }))
    .filter(product => product.key && product.name)
    .sort((a, b) => a.name.localeCompare(b.name)), [catalogProducts])

  const buyerOptions = useMemo(() => {
    const options = new Map()
    for (const employee of employees) {
      const name = String(employee.full_name || employee.email || '').trim()
      if (employee.id && name) options.set(employee.id, { id: employee.id, name })
    }
    if (defaultBuyerProfileId && defaultBuyer && !options.has(defaultBuyerProfileId)) {
      options.set(defaultBuyerProfileId, { id: defaultBuyerProfileId, name: defaultBuyer })
    }
    if (form.buyer_profile_id && form.buyer_name && !options.has(form.buyer_profile_id)) {
      options.set(form.buyer_profile_id, { id: form.buyer_profile_id, name: form.buyer_name })
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, defaultBuyerProfileId, defaultBuyer, form.buyer_profile_id, form.buyer_name])

  const historyRows = useMemo(() => filterBazaarPurchases(
    purchases.filter(purchase => purchase.entry_source === 'daily_bazaar'),
    {
      dateFrom,
      dateTo,
      query,
      category: categoryFilter,
      paymentMethod: paymentFilter,
    },
  ), [purchases, dateFrom, dateTo, query, categoryFilter, paymentFilter])

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE))
  const pagedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE
    return historyRows.slice(start, start + HISTORY_PAGE_SIZE)
  }, [historyRows, historyPage])

  useEffect(() => {
    setHistoryPage(1)
  }, [dateFrom, dateTo, query, categoryFilter, paymentFilter])

  useEffect(() => {
    setHistoryPage(current => Math.min(current, historyPageCount))
  }, [historyPageCount])

  const analytics = useMemo(() => summarizeBazaarPurchases(purchases, {
    dateFrom,
    dateTo,
    category: categoryFilter,
    paymentMethod: paymentFilter,
  }), [purchases, dateFrom, dateTo, categoryFilter, paymentFilter])

  const formTotal = useMemo(() => calculateBazaarTotal(form.items), [form.items])
  const formNormalTotal = useMemo(() => calculateBazaarExpectedTotal(form.items), [form.items])
  const formDifference = useMemo(() => calculateBazaarPriceDifference(form.items), [form.items])

  function selectRange(key) {
    const range = getBazaarRange(key)
    setRangeKey(key)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  function setCustomRange(from, to) {
    if (!from || !to) return
    setRangeKey('custom')
    setDateFrom(from <= to ? from : to)
    setDateTo(from <= to ? to : from)
  }

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setValidationErrors(current => current.filter(item => item.field !== field))
  }

  function updateBuyer(profileId) {
    const selected = buyerOptions.find(employee => employee.id === profileId)
    setForm(current => ({
      ...current,
      buyer_profile_id: profileId,
      buyer_name: selected?.name || '',
    }))
    setValidationErrors(current => current.filter(item => item.field !== 'buyer_profile_id'))
  }

  function updateItem(index, field, value) {
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        if (field === 'quantity' && item._uses_normal_price) {
          return {
            ...item,
            quantity: value,
            line_total: String(calculateBazaarNormalTotal(value, item.normal_unit_price) || ''),
          }
        }
        return { ...item, [field]: value, ...(field === 'line_total' ? { _uses_normal_price: false } : {}) }
      }),
    }))
    setValidationErrors(current => current.filter(item => item.index !== index || item.field !== field))
  }

  function updateProductName(index, value) {
    const matched = productSuggestions.find(item => item.key === value)
    setForm(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        product_key: matched?.key || '',
        product_name: matched?.name || '',
        ...(matched ? {
          ...(isValidBazaarCategory(matched.category) ? { category: matched.category } : {}),
          unit: matched.unit,
          normal_unit_price: matched.normalUnitPrice,
          line_total: String(calculateBazaarNormalTotal(item.quantity, matched.normalUnitPrice) || ''),
          _uses_normal_price: true,
        } : {}),
      } : item),
    }))
    setValidationErrors(current => current.filter(item => item.index !== index || item.field !== 'product_name'))
  }

  function addItem() {
    setForm(current => ({ ...current, items: [...current.items, blankItem()] }))
  }

  // Restores a line when its edit dialog is cancelled.
  function replaceItem(index, item) {
    setForm(current => ({ ...current, items: current.items.map((line, itemIndex) => itemIndex === index ? item : line) }))
  }

  function removeItem(index) {
    setForm(current => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
    setValidationErrors([])
  }

  function resetEntry() {
    setForm(emptyForm(defaultBuyer, defaultBuyerProfileId))
    setValidationErrors([])
    submissionAttemptRef.current = null
  }

  async function savePurchase(event) {
    event.preventDefault()
    if (!canManage || saving) return
    setError('')
    setNotice('')
    if (!form.id && !isExpenseEntryDateAllowed(form.purchase_date)) {
      setError(l.expenseDateLimit)
      return
    }
    const validation = validateBazaarPurchase(form)
    setValidationErrors(validation.errors)
    if (!validation.valid) {
      setError(validationMessage(validation.errors[0], l))
      return
    }

    const normalized = validation.purchase
    const payload = {
      ...(normalized.id ? { id: normalized.id } : {}),
      purchase_date: normalized.purchase_date,
      payment_method: normalized.payment_method,
      buyer_profile_id: normalized.buyer_profile_id || null,
      buyer_name: normalized.buyer_name,
      notes: normalized.notes,
      items: normalized.items.map(item => ({
        id: item.id || undefined,
        product_key: item.product_key,
        product_name: item.product_name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        line_total: item.line_total,
        notes: item.notes,
      })),
    }

    if (!normalized.id) {
      const attempt = getBazaarSubmissionAttempt(
        submissionAttemptRef.current,
        payload,
        createBazaarRequestKey,
      )
      submissionAttemptRef.current = attempt
      payload.request_key = attempt.requestKey
    }

    const wasEditing = Boolean(normalized.id)
    setSaving(true)
    try {
      const { data: savedPurchase, error: saveError } = await withWriteTimeout(
        signal => supabase.rpc('save_bazaar_purchase', { payload }).abortSignal(signal),
        'SAVE_BAZAAR_PURCHASE',
      )
      if (saveError) throw saveError

      resetEntry()
      setNotice(wasEditing ? l.updated : l.saved)
      if (!wasEditing && savedPurchase?.expense_id) {
        const notification = await notifyTelegramInvestorExpense(savedPurchase.expense_id)
        if (!notification.ok) setError(l.investorNotificationFailed)
      }
      await loadPurchases()
      if (wasEditing) setTab('history')
    } catch (saveError) {
      setError(bazaarErrorMessage(saveError, l, l.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  function beginEdit(purchase) {
    if (!canManage) return
    if (isLegacyPurchase(purchase)) {
      setError(l.legacyReadOnly)
      return
    }
    setError('')
    setNotice('')
    setForm(formFromPurchase(purchase))
    setValidationErrors([])
    setTab('entry')
  }

  async function deletePurchase(purchase) {
    if (!canManage || !purchase?.id || deletingId) return
    if (confirmDeleteId !== purchase.id) {
      setConfirmDeleteId(purchase.id)
      return
    }
    setError('')
    setNotice('')
    setDeletingId(purchase.id)
    try {
      const { error: deleteError } = await withWriteTimeout(
        signal => supabase.rpc('delete_bazaar_purchase', { p_purchase_id: purchase.id }).abortSignal(signal),
        'DELETE_BAZAAR_PURCHASE',
      )
      if (deleteError) throw deleteError

      setConfirmDeleteId('')
      setNotice(l.deleted)
      await loadPurchases()
    } catch (deleteError) {
      setError(bazaarErrorMessage(deleteError, l, l.deleteFailed))
    } finally {
      setDeletingId('')
    }
  }

  function lineHasError(index, field) {
    return validationErrors.some(errorItem => errorItem.index === index && errorItem.field === field)
  }

  return (
    <AppShell
      title={l.title}
      tabs={{
        label: l.title,
        value: tab,
        onChange: setTab,
        items: [
          { key: 'entry', label: l.entry, hidden: !canManage },
          { key: 'history', label: l.history },
          { key: 'analytics', label: l.analytics },
        ].filter(item => !item.hidden),
      }}
      headerActions={(
        <button type="button" onClick={loadPurchases} disabled={loading} aria-label={l.refresh} className="ws-btn ws-btn-outline !h-[38px]">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">{l.refresh}</span>
        </button>
      )}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {tab !== 'entry' && (
            <RangeAndFilters
              l={l}
              lang={lang}
              rangeKey={rangeKey}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onRange={selectRange}
              onCustomRange={setCustomRange}
              query={query}
              onQuery={setQuery}
              categoryFilter={categoryFilter}
              categories={bazaarCategoriesFor([...productSuggestions, ...purchases.flatMap(purchase => purchase.bazaar_purchase_items || purchase.items || []), categoryFilter])}
              onCategory={setCategoryFilter}
              paymentFilter={paymentFilter}
              onPayment={setPaymentFilter}
              showSearch={tab === 'history'}
            />
          )}

          {error && (tab === 'entry' || purchases.length > 0) && (
            <div role="alert" className="ws-notice ws-tone-negative">
              {error}
            </div>
          )}
          {notice && !error && (
            <div role="status" aria-live="polite" className="ws-notice ws-tone-positive">
              {notice}
            </div>
          )}

          {tab === 'entry' && canManage && (
            <div id="bazaar-entry-panel" role="tabpanel">
              <BazaarEntryForm
                l={l}
                lang={lang}
                form={form}
                buyerOptions={buyerOptions}
                total={formTotal}
                normalTotal={formNormalTotal}
                difference={formDifference}
                saving={saving}
                suggestions={productSuggestions}
                validationErrors={validationErrors}
                onUpdateForm={updateForm}
                onUpdateBuyer={updateBuyer}
                onUpdateItem={updateItem}
                onUpdateProduct={updateProductName}
                onAddItem={addItem}
                onReplaceItem={replaceItem}
                onRemoveItem={removeItem}
                onSubmit={savePurchase}
                onCancelEdit={resetEntry}
                lineHasError={lineHasError}
                expenseEntryMinDate={expenseEntryMinDate}
              />
            </div>
          )}

          {tab === 'entry' && !canManage && (
            <div className="ws-panel ws-panel-flush">
              <div className="ws-empty"><ShoppingBasket /><p>{l.readOnly}</p></div>
            </div>
          )}

          {tab === 'history' && (
            <div id="bazaar-history-panel" role="tabpanel">
              {loading ? (
                <OperationalLoading layout="table" title={l.history} description="" />
              ) : error && purchases.length === 0 ? (
                <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadPurchases} />
              ) : (
                <BazaarHistory
                  l={l}
                  lang={lang}
                  purchases={pagedHistoryRows}
                  resultCount={historyRows.length}
                  page={historyPage}
                  pageCount={historyPageCount}
                  canManage={canManage}
                  confirmDeleteId={confirmDeleteId}
                  deletingId={deletingId}
                  categoryFilter={categoryFilter}
                  query={query}
                  onPage={setHistoryPage}
                  onEdit={beginEdit}
                  onDelete={deletePurchase}
                />
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div id="bazaar-analytics-panel" role="tabpanel">
              {loading ? (
                <OperationalLoading layout="dashboard" title={l.analytics} description="" />
              ) : error && purchases.length === 0 ? (
                <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadPurchases} />
              ) : (
                <BazaarAnalytics
                  l={l}
                  lang={lang}
                  summary={analytics}
                  categoryFilter={categoryFilter}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function RangeAndFilters({
  l,
  lang,
  rangeKey,
  dateFrom,
  dateTo,
  onRange,
  onCustomRange,
  query,
  onQuery,
  categoryFilter,
  categories = BAZAAR_CATEGORIES,
  onCategory,
  paymentFilter,
  onPayment,
  showSearch,
}) {
  // One compact toolbar row: the range button already shows the selected dates.
  return (
    <section aria-labelledby="bazaar-range-heading" className="flex flex-wrap items-center gap-2">
      <h2 id="bazaar-range-heading" className="sr-only">{l.dateRange}</h2>
      <DateRangePicker
        l={l}
        lang={lang}
        rangeKey={rangeKey}
        dateFrom={dateFrom}
        dateTo={dateTo}
        today={todayBazaarDate()}
        onPreset={onRange}
        onApply={onCustomRange}
        className="w-full sm:w-auto sm:min-w-[220px] sm:max-w-[340px] sm:flex-none"
      />
      <select value={categoryFilter} onChange={event => onCategory(event.target.value)} aria-label={l.category} className={`${SELECT} !w-auto min-w-[190px] flex-1 sm:flex-none`}>
        <option value="all">{l.allCategories}</option>
        {categories.map(category => <option key={category.key} value={category.key}>{bazaarCategoryLabel(category.key, lang)}</option>)}
      </select>
      <select value={paymentFilter} onChange={event => onPayment(event.target.value)} aria-label={l.payment} className={`${SELECT} !w-auto min-w-[220px] flex-1 sm:flex-none`}>
        <option value="all">{l.allPayments}</option>
        {BAZAAR_PAYMENT_METHODS.map(method => <option key={method.key} value={method.key}>{bazaarPaymentMethodLabel(method.key, lang)}</option>)}
      </select>
      {showSearch && (
        <div className="relative w-full min-w-[220px] sm:w-auto sm:flex-1">
          <label htmlFor="bazaar-history-search" className="sr-only">{l.searchLabel}</label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
          <input
            id="bazaar-history-search"
            type="text"
            autoComplete="off"
            value={query}
            onChange={event => onQuery(event.target.value)}
            placeholder={l.search}
            className={`${INPUT} !pl-9 !pr-11`}
          />
          {query && (
            <button type="button" onClick={() => onQuery('')} aria-label={l.clearSearch} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#22201d]">
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function BazaarEntryForm({
  l,
  lang,
  form,
  buyerOptions,
  total,
  normalTotal,
  difference,
  saving,
  suggestions,
  validationErrors,
  onUpdateForm,
  onUpdateBuyer,
  onUpdateItem,
  onUpdateProduct,
  onAddItem,
  onReplaceItem,
  onRemoveItem,
  onSubmit,
  onCancelEdit,
  lineHasError,
  expenseEntryMinDate,
}) {
  // { index, isNew, snapshot }: the line open in the product dialog.
  const [lineDialog, setLineDialog] = useState(null)

  function openNewLine() {
    const index = form.items.length
    onAddItem()
    setLineDialog({ index, isNew: true, snapshot: null })
  }

  function openLine(index) {
    setLineDialog({ index, isNew: false, snapshot: form.items[index] })
  }

  function cancelLine() {
    if (!lineDialog) return
    if (lineDialog.isNew) onRemoveItem(lineDialog.index)
    else if (lineDialog.snapshot) onReplaceItem(lineDialog.index, lineDialog.snapshot)
    setLineDialog(null)
  }

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(320px,22vw,380px)]">
      <fieldset disabled={saving} className="contents">
        <div className="min-w-0 space-y-5">
        <section className="ws-panel">
          <div className="ws-panel-title mb-5 !items-start">
            <div>
              <h2 className="ws-display">{form.id ? l.editEntry : l.newEntry}</h2>
              <p className="ws-muted mt-1.5 max-w-2xl">{l.entryHint}</p>
            </div>
            {form.id && (
              <button type="button" onClick={onCancelEdit} className="ws-btn ws-btn-outline ws-btn-sm">
                <X size={14} />{l.cancelEdit}
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={l.purchaseDate} icon={CalendarDays}>
              <FormattedDateInput value={form.purchase_date} lang={lang} onChange={value => onUpdateForm('purchase_date', value)} min={form.id ? undefined : expenseEntryMinDate} className={`${INPUT}`} />
              {!form.id && <p className="ws-caption mt-1">{l.expenseDateLimit}</p>}
            </Field>
            <Field label={l.buyer} icon={UserRound} error={validationErrors.some(item => item.field === 'buyer_profile_id')}>
              <select aria-invalid={validationErrors.some(item => item.field === 'buyer_profile_id')} value={form.buyer_profile_id || ''} onChange={event => onUpdateBuyer(event.target.value)} className={SELECT}>
                <option value="">{l.selectBuyer}</option>
                {buyerOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <ChoiceGroup
              label={l.payment}
              icon={WalletCards}
              legendClassName="ws-caption mb-1.5 flex items-center gap-1.5 font-medium"
              columns="grid-cols-2"
            >
              {BAZAAR_ENTRY_PAYMENT_METHODS.map(method => {
                const active = form.payment_method === method.key
                return (
                  <ChoiceTile
                    key={method.key}
                    active={active}
                    icon={methodIcon(method.key)}
                    title={bazaarPaymentMethodLabel(method.key, lang)}
                    compact
                    onClick={() => onUpdateForm('payment_method', method.key)}
                  />
                )
              })}
            </ChoiceGroup>
            <Field label={l.notes} icon={FileText}>
              <textarea value={form.notes} onChange={event => onUpdateForm('notes', event.target.value)} rows={2} placeholder={l.notesPlaceholder} className={`${INPUT} !h-auto min-h-[88px] resize-y`} />
            </Field>
          </div>
        </section>

        <section className="ws-panel ws-panel-flush">
          <div className="ws-panel-title border-b border-[#e4e1de] px-5 py-4 max-sm:px-4">
            <div>
              <h2 className="ws-heading">{l.products}</h2>
              <p className="ws-muted mt-1">{l.productsHint}</p>
            </div>
            <button type="button" onClick={openNewLine} className="ws-btn ws-btn-outline">
              <Plus size={15} />{l.addProduct}
            </button>
          </div>

          {suggestions.length === 0 && (
            <div className="ws-notice ws-tone-caution mx-4 mt-4 sm:mx-5">
              <span>{l.noIngredients}</span>
            </div>
          )}

          <div className="p-4 sm:p-5">
            {form.items.length === 0 ? (
              <button
                type="button"
                onClick={openNewLine}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#dcd9d6] px-4 py-8 text-center transition-colors hover:border-[#ff5a00] hover:bg-[#fff4ec]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]"><ShoppingBasket size={18} /></span>
                <span className="ws-muted">{l.noProducts}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#ff5a00]"><Plus size={15} />{l.addProduct}</span>
              </button>
            ) : (
              <ul className="divide-y divide-[#efece9] overflow-hidden rounded-[12px] border border-[#e4e1de]">
                {form.items.map((item, index) => (
                  <BazaarLineRow
                    key={item._key}
                    l={l}
                    lang={lang}
                    item={item}
                    index={index}
                    hasError={validationErrors.some(errorItem => errorItem.index === index)}
                    onOpen={() => openLine(index)}
                    onRemove={() => onRemoveItem(index)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
        </div>

        <aside className="ws-panel xl:sticky xl:top-5">
        <p className="ws-caption font-medium">{l.totalBazaar}</p>
        <p className="mt-1 break-words text-3xl font-semibold tracking-tight text-[#22201d] tabular-nums">{formatCurrency(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[10px] bg-[#f6f5f3] px-3 py-2.5">
            <p className="ws-caption">{l.normalTotal}</p>
            <p className="mt-1 text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(normalTotal)}</p>
          </div>
          <div className={`rounded-[10px] border px-3 py-2.5 ${bazaarDifferenceTone(difference)}`}>
            <p className="text-[13px] opacity-80">{l.difference}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatBazaarSignedCurrency(difference)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[#f6f5f3] px-3 py-2.5 text-sm text-[#68655f]">
          <span>{l.itemCount}</span>
          <span className="font-semibold text-[#22201d] tabular-nums">{form.items.length}</span>
        </div>
        <p className="ws-caption mt-3">{l.exactHint}</p>
        {validationErrors.length > 0 && (
          <p role="alert" className="ws-notice ws-tone-negative mt-3">
            {validationMessage(validationErrors[0], l)}
          </p>
        )}
        <button type="submit" disabled={saving || total <= 0} className="ws-btn ws-btn-primary mt-4 !h-12 w-full">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? l.saving : l.save}
        </button>
        </aside>
      </fieldset>
      {lineDialog && form.items[lineDialog.index] && (
        <BazaarLineDialog
          l={l}
          lang={lang}
          item={form.items[lineDialog.index]}
          index={lineDialog.index}
          isNew={lineDialog.isNew}
          suggestions={suggestions}
          saving={saving}
          lineHasError={lineHasError}
          onUpdateItem={onUpdateItem}
          onUpdateProduct={onUpdateProduct}
          onDone={() => setLineDialog(null)}
          onCancel={cancelLine}
        />
      )}
    </form>
  )
}

function BazaarLineRow({ l, lang, item, index, hasError, onOpen, onRemove }) {
  const quantity = normalizeBazaarQuantity(item.quantity)
  const base = normalizeBazaarQuantityToBase(quantity, item.unit)
  const unitCost = getBazaarUnitCost(item)
  const normalLineTotal = getBazaarNormalLineTotal(item)
  const priceDifference = getBazaarPriceDifference(item)
  return (
    <li className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${hasError ? 'bg-[#fdf3f3]' : 'bg-white'}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-xs font-semibold text-[#68655f] tabular-nums">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${item.product_name ? 'text-[#22201d]' : 'text-[#c4262c]'}`}>
            {item.product_name || l.missingProduct}
          </span>
          <span className="ws-caption block truncate">
            {bazaarCategoryLabel(item.category, lang)} · {item.quantity || 0} {bazaarUnitLabel(item.unit, lang)}
            {unitCost > 0 ? ` · ${formatCurrency(Math.round(unitCost))} / ${bazaarUnitLabel(base.unit, lang)}` : ''}
            {item.notes ? ` · ${item.notes}` : ''}
          </span>
        </span>
        <span className="flex-shrink-0 text-right">
          <span className="block text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(Number(item.line_total) || 0)}</span>
          {normalLineTotal > 0 && item.line_total ? (
            <span className={`mt-0.5 inline-block rounded-full border px-1.5 text-[11px] font-semibold tabular-nums ${bazaarDifferenceTone(priceDifference)}`}>
              {formatBazaarSignedCurrency(priceDifference)}
            </span>
          ) : null}
        </span>
        <Edit3 size={15} className="flex-shrink-0 text-[#8a867f]" aria-hidden="true" />
      </button>
      <button type="button" onClick={onRemove} aria-label={l.removeLine} className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon flex-shrink-0">
        <Trash2 size={14} />
      </button>
    </li>
  )
}

function BazaarLineDialog({ l, lang, item, index, isNew, suggestions, saving, lineHasError, onUpdateItem, onUpdateProduct, onDone, onCancel }) {
  const [localErrors, setLocalErrors] = useState([])
  const quantity = normalizeBazaarQuantity(item.quantity)
  const base = normalizeBazaarQuantityToBase(quantity, item.unit)
  const unitCost = getBazaarUnitCost(item)
  const normalLineTotal = getBazaarNormalLineTotal(item)
  const priceDifference = getBazaarPriceDifference(item)
  const hasError = field => lineHasError(index, field) || localErrors.some(errorItem => errorItem.field === field)

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  function updateItem(field, value) {
    setLocalErrors(current => current.filter(errorItem => errorItem.field !== field))
    onUpdateItem(index, field, value)
  }

  function confirm(event) {
    event.preventDefault()
    // A portal still bubbles React events to the entry form; keep this submit local.
    event.stopPropagation()
    const lineErrors = validateBazaarPurchase({ items: [item] }).errors.filter(errorItem => errorItem.index === 0)
    if (lineErrors.length) {
      setLocalErrors(lineErrors)
      return
    }
    onDone()
  }

  const firstError = localErrors[0] ? { ...localErrors[0], index } : null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="bazaar-line-dialog-title"
        onSubmit={confirm}
        className="ws-dialog max-h-[92vh] w-full overflow-y-auto !rounded-b-none sm:max-w-[760px] sm:overflow-visible sm:!rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e4e1de] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="ws-caption font-medium">{l.item} {index + 1}</p>
            <h2 id="bazaar-line-dialog-title" className="ws-heading mt-0.5">{isNew ? l.addProduct : l.editProduct}</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label={l.cancel} className="ws-btn ws-btn-ghost !h-10 !w-10 !px-0">
            <X size={19} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div data-bazaar-line-fields="true" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_minmax(140px,0.9fr)]">
            <Field label={l.product} error={hasError('product_name')}>
              <BazaarIngredientPicker suggestions={suggestions} value={item.product_key || ''} onChange={value => { setLocalErrors(current => current.filter(errorItem => errorItem.field !== 'product_name')); onUpdateProduct(index, value) }} lang={lang} disabled={saving} invalid={hasError('product_name')} />
            </Field>
            <Field label={l.category} error={hasError('category')}>
              <select aria-invalid={hasError('category')} value={item.category} disabled className={SELECT}>
                {bazaarCategoriesFor(suggestions).map(category => <option key={category.key} value={category.key}>{bazaarCategoryLabel(category.key, lang)}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid items-end gap-3 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.2fr)]">
            <Field label={l.quantity} error={hasError('quantity')}>
              <input aria-invalid={hasError('quantity')} type="text" inputMode="decimal" value={item.quantity} onChange={event => updateItem('quantity', event.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" className={`${INPUT} tabular-nums ${hasError('quantity') ? '!border-[#c4262c] !bg-[#fdf3f3]' : ''}`} />
            </Field>
            <Field label={l.unit} error={hasError('unit')}>
              <select aria-invalid={hasError('unit')} value={item.unit} disabled className={SELECT}>
                {BAZAAR_ENTRY_UNITS.map(unit => <option key={unit.key} value={unit.key}>{bazaarUnitLabel(unit.key, lang)}</option>)}
              </select>
            </Field>
            <div className="col-span-2 sm:col-span-1">
              <Field label={l.totalPaid} error={hasError('line_total')}>
                <input aria-invalid={hasError('line_total')} type="text" inputMode="numeric" value={formatMoneyInput(item.line_total)} onChange={event => updateItem('line_total', normalizeMoneyInput(event.target.value))} placeholder="0" className={`${INPUT} text-right font-semibold tabular-nums ${hasError('line_total') ? '!border-[#c4262c] !bg-[#fdf3f3]' : ''}`} />
              </Field>
            </div>
          </div>

          <div data-bazaar-line-summary="true" className="grid gap-3 sm:w-full sm:max-w-[430px] sm:grid-cols-2 sm:items-stretch sm:max-w-none">
            <div className="flex h-full min-h-[70px] flex-col justify-center rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-4 py-3">
              <p className="ws-caption">{l.unitCost}</p>
              <p className="mt-0.5 text-sm font-semibold text-[#22201d] tabular-nums">
                {unitCost > 0 ? `${formatCurrency(Math.round(unitCost))} / ${bazaarUnitLabel(base.unit, lang)}` : '—'}
              </p>
              <p className="ws-caption mt-0.5 truncate">{l.normalPrice}: {item.normal_unit_price ? formatCurrency(item.normal_unit_price) : '—'}</p>
            </div>
            <div className={`flex h-full min-h-[70px] flex-col justify-center rounded-[10px] border px-4 py-3 ${bazaarDifferenceTone(priceDifference)}`}>
              <p className="text-[13px] opacity-80">{l.difference}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{normalLineTotal > 0 && item.line_total ? formatBazaarSignedCurrency(priceDifference) : '—'}</p>
            </div>
          </div>

          <div data-bazaar-line-notes="true">
            <Field label={l.lineNotes}>
              <textarea
                value={item.notes}
                onChange={event => updateItem('notes', event.target.value)}
                rows={3}
                placeholder={l.lineNotesPlaceholder}
                className={`${INPUT} !h-auto min-h-[88px] resize-y leading-5`}
              />
            </Field>
          </div>

          {firstError && <p role="alert" className="ws-notice ws-tone-negative">{validationMessage(firstError, l)}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e4e1de] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onCancel} className="ws-btn ws-btn-outline !h-11">{l.cancel}</button>
          <button type="submit" disabled={saving} className="ws-btn ws-btn-primary !h-11">
            {isNew ? <Plus size={16} /> : <Save size={16} />}{isNew ? l.addLine : l.saveLine}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function BazaarHistory({
  l,
  lang,
  purchases,
  resultCount,
  page,
  pageCount,
  canManage,
  confirmDeleteId,
  deletingId,
  categoryFilter,
  query,
  onPage,
  onEdit,
  onDelete,
}) {
  if (purchases.length === 0) {
    return <EmptyState icon={ShoppingBasket} title={l.noHistory} />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="ws-caption font-medium"><span className="ws-count mr-1.5">{resultCount}</span>{l.results}</p>
        {pageCount > 1 && <p className="ws-caption tabular-nums">{l.page} {page} {l.of} {pageCount}</p>}
      </div>
      <div className="ws-panel ws-panel-flush">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="ws-table-head">
              <tr>
                <th className="min-w-[240px] px-4 py-3 font-medium">{l.productName}</th>
                <th className="w-[140px] px-4 py-3 font-medium">{l.quantity}</th>
                <th className="w-[180px] px-4 py-3 text-right font-medium">{l.unitCost}</th>
                <th className="w-[160px] px-4 py-3 text-right font-medium">{l.itemPrice}</th>
                <th className="w-[160px] px-4 py-3 font-medium">{l.category}</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase, purchaseIndex) => {
                const items = getBazaarPurchaseScopedItems(purchase, categoryFilter, query)
                const total = getBazaarPurchaseScopedTotal(purchase, categoryFilter, query)
                const MethodIcon = methodIcon(purchase.payment_method)
                const columnCount = 5
                return (
                  <React.Fragment key={purchase.id}>
                    {purchaseIndex > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={columnCount} className="h-3 border-y border-[#e4e1de] bg-[#f6f5f3] p-0" />
                      </tr>
                    )}
                    <tr data-bazaar-purchase-summary="true" className="border-b border-[#e4e1de] bg-[#faf9f7] text-sm text-[#68655f]">
                      <td colSpan={columnCount} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                          <p className="whitespace-nowrap font-semibold text-[#22201d]">
                            {formatLongDate(purchase.purchase_date, lang, purchase.purchase_date)}
                          </p>
                          <p className="ws-caption whitespace-nowrap">
                            {l.itemCount}: {items.length}
                          </p>
                          <p className="max-w-[220px] truncate font-medium text-[#22201d]" title={purchase.notes || undefined}>
                            {purchase.created_by_name || '—'}
                          </p>
                          <p className="whitespace-nowrap text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(total)}</p>
                          <span className="ws-badge">
                            <MethodIcon />{bazaarPaymentMethodLabel(purchase.payment_method, lang)}
                          </span>
                          {canManage && (
                            <div className="flex gap-1.5">
                              <button type="button" onClick={() => onEdit(purchase)} aria-label={l.edit} title={l.edit} className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon">
                                <Edit3 size={14} />
                              </button>
                              <button type="button" disabled={deletingId === purchase.id} onClick={() => onDelete(purchase)} aria-label={confirmDeleteId === purchase.id ? l.confirmDelete : l.delete} title={confirmDeleteId === purchase.id ? l.confirmDelete : l.delete} className={`ws-btn ws-btn-sm ${
                                confirmDeleteId === purchase.id ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger ws-btn-icon'
                              }`}>
                                {deletingId === purchase.id ? <Loader2 size={14} className="animate-spin" /> : confirmDeleteId === purchase.id ? l.confirmDelete : <Trash2 size={14} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {items.map((item, index) => {
                      const unitCost = getBazaarUnitCost(item)
                      const baseUnit = normalizeBazaarQuantityToBase(item.quantity, item.unit).unit
                      const displayQuantity = getBazaarDisplayQuantity(item.quantity, item.unit)
                      return (
                        <tr key={`${purchase.id}-${item.id || index}`} className="ws-row text-sm text-[#68655f]">
                          <td className="px-4 py-2.5" title={item.notes || undefined}>
                            <p className="truncate font-medium text-[#22201d]">{item.product_name}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-[#22201d] tabular-nums">
                            {formatBazaarQuantity(displayQuantity.quantity)} {bazaarUnitLabel(displayQuantity.unit, lang)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-[#22201d] tabular-nums">
                            {unitCost > 0 ? `${formatCurrency(Math.round(unitCost))} / ${bazaarUnitLabel(baseUnit, lang)}` : '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-[#22201d] tabular-nums">
                            {formatCurrency(item.line_total)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="ws-badge">{bazaarCategoryLabel(item.category, lang)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <nav aria-label={l.history} className="flex items-center justify-center gap-2 pt-1">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="ws-btn ws-btn-outline ws-btn-sm">
            {l.previous}
          </button>
          <span className="ws-caption min-w-[100px] text-center font-medium tabular-nums">{l.page} {page} {l.of} {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className="ws-btn ws-btn-outline ws-btn-sm">
            {l.next}
          </button>
        </nav>
      )}
    </div>
  )
}

function BazaarAnalytics({ l, lang, summary, categoryFilter, dateFrom, dateTo }) {
  if (summary.totalSpent <= 0) return <EmptyState icon={BarChart2} title={l.noAnalytics} />
  const maxDaily = Math.max(...summary.daily.map(row => row.total), 1)
  const maxProduct = Math.max(...summary.products.map(row => row.spend), 1)

  return (
    <div className="space-y-5">
      {categoryFilter !== 'all' && (
        <div className="ws-notice ws-tone-info">
          {l.selectedCategory} <span className="font-semibold">{bazaarCategoryLabel(categoryFilter, lang)}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={l.totalSpent} value={formatCurrency(summary.totalSpent)} sub={`${formatLongDate(dateFrom, lang, dateFrom)} — ${formatLongDate(dateTo, lang, dateTo)}`} />
        <MetricCard label={l.averageDaily} value={formatCurrency(Math.round(summary.averagePerDay))} sub={`${summary.activeDays} ${l.activeDays.toLowerCase()} · ${summary.dayCount} ${l.calendarDays}`} />
        <MetricCard label={l.purchases} value={summary.purchaseCount} />
        <MetricCard label={l.uniqueProducts} value={summary.uniqueProducts} sub={`${summary.totalItemLines} ${l.itemCount.toLowerCase()}`} />
        <MetricCard label={l.activeDays} value={summary.activeDays} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AnalyticsSection title={l.dailySpend}>
          <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
            {summary.daily.map(row => {
              const width = Math.max(4, (row.total / maxDaily) * 100)
              return (
                <div key={row.date} className="grid grid-cols-[92px_minmax(0,1fr)_112px] items-center gap-2 sm:grid-cols-[140px_minmax(0,1fr)_140px]">
                  <span className="ws-caption truncate">{formatLongDate(row.date, lang, row.date, { includeYear: false })}</span>
                  <div className="h-8 overflow-hidden rounded-md bg-[#efece9]">
                    <div className="flex h-full items-center rounded-md bg-[#ff5a00] px-2" style={{ width: `${width}%` }}>
                      {width > 24 && <span className="truncate text-xs font-medium text-white">{row.purchases} {l.purchasesShort}</span>}
                    </div>
                  </div>
                  <span className="text-right text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(row.total)}</span>
                </div>
              )
            })}
          </div>
        </AnalyticsSection>

        <AnalyticsSection title={l.categorySpend}>
          <RankedMoneyBars
            rows={summary.categories.map(row => ({ ...row, label: bazaarCategoryLabel(row.key, lang) }))}
            total={summary.totalSpent}
            color="#ff5a00"
            l={l}
          />
        </AnalyticsSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <AnalyticsSection title={l.paymentSpend}>
          <div className="space-y-3">
            {summary.payments.map(row => {
              const Icon = methodIcon(row.key)
              return (
                <div key={row.key} className="rounded-[10px] border border-[#e4e1de] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-[#68655f]" />
                      <span className="text-sm font-medium text-[#22201d]">{bazaarPaymentMethodLabel(row.key, lang)}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(row.amount)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${Math.max(3, row.percent)}%` }} /></div>
                  <p className="ws-caption mt-1 text-right tabular-nums">{Math.round(row.percent)}% {l.ofTotal}</p>
                </div>
              )
            })}
          </div>
        </AnalyticsSection>

        <AnalyticsSection title={l.buyerSpend}>
          <RankedMoneyBars
            rows={summary.buyers.slice(0, 10).map(row => ({
              ...row,
              label: row.name || l.unspecifiedBuyer,
              sub: `${row.purchases} ${l.purchasesShort}`,
            }))}
            total={summary.totalSpent}
            color="#ff5a00"
            l={l}
          />
        </AnalyticsSection>
      </div>

      <AnalyticsSection title={l.topProducts} flush>
        <div>
          {summary.products.slice(0, 12).map((product, index) => {
            const width = Math.max(3, (product.spend / maxProduct) * 100)
            const change = product.unitCostChangePct
            return (
              <div key={product.key} className="ws-row px-5 py-3.5 max-sm:px-4">
                <div className="grid gap-3 sm:grid-cols-[38px_minmax(160px,1fr)_140px_170px] sm:items-center">
                  <span className="ws-count justify-self-start">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-[#22201d]">{product.product_name}</p>
                      <span className="ws-badge">{bazaarCategoryLabel(product.category, lang)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full bg-[#ff5a00]" style={{ width: `${width}%` }} /></div>
                  </div>
                  <div>
                    <p className="ws-caption">{l.quantity}</p>
                    <p className="text-sm font-medium text-[#22201d] tabular-nums">{formatBazaarQuantity(product.quantity)} {bazaarUnitLabel(product.unit, lang)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-base font-semibold text-[#22201d] tabular-nums">{formatCurrency(product.spend)}</p>
                    <p className="ws-caption tabular-nums">{l.averageUnitCost}: {formatCurrency(Math.round(product.averageUnitCost))} / {bazaarUnitLabel(product.unit, lang)}</p>
                    <p className="ws-caption tabular-nums">{l.latestUnitCost}: {formatCurrency(Math.round(product.latestUnitCost))} / {bazaarUnitLabel(product.unit, lang)}</p>
                    {product.previousUnitCost > 0 && Math.abs(change) >= 0.1 && (
                      <p className={`ws-badge mt-1 tabular-nums ${change > 0 ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
                        {change > 0 ? <TrendingUp /> : <TrendingDown />}
                        {Math.abs(change).toFixed(1)}% {change > 0 ? l.priceUp : l.priceDown}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </AnalyticsSection>
    </div>
  )
}

function RankedMoneyBars({ rows, total, color, l }) {
  if (rows.length === 0) return <p className="ws-muted py-8 text-center">{l.noAnalytics}</p>
  return (
    <div className="space-y-3">
      {rows.map(row => {
        const percent = total > 0 ? (row.amount / total) * 100 : 0
        return (
          <div key={row.key}>
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#22201d]">{row.label}</p>
                {row.sub && <p className="ws-caption truncate">{row.sub}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold text-[#22201d] tabular-nums">{formatCurrency(row.amount)}</p>
                <p className="ws-caption tabular-nums">{Math.round(percent)}%</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#efece9]"><div className="h-full rounded-full" style={{ width: `${Math.max(3, percent)}%`, backgroundColor: color }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function AnalyticsSection({ title, flush = false, children }) {
  return (
    <section className={`ws-panel ${flush ? 'ws-panel-flush' : ''}`}>
      <h2 className={`ws-heading ${flush ? 'border-b border-[#e4e1de] px-5 py-4 max-sm:px-4' : 'mb-4'}`}>{title}</h2>
      {children}
    </section>
  )
}

function MetricCard({ label, value, sub = '' }) {
  return (
    <div className="ws-panel">
      <p className="ws-caption font-medium">{label}</p>
      <p className="mt-1.5 break-words text-2xl font-semibold tracking-tight text-[#22201d] tabular-nums">{value}</p>
      {sub && <p className="ws-caption mt-1">{sub}</p>}
    </div>
  )
}

function EmptyState({ icon: Icon, title }) {
  return (
    <div className="ws-panel ws-panel-flush">
      <div className="ws-empty">
        <Icon />
        <p>{title}</p>
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, error = false, children }) {
  return (
    <label className="block min-w-0">
      <span className={`ws-caption mb-1.5 flex items-center gap-1.5 font-medium ${error ? '!text-[#c4262c]' : ''}`}>
        {Icon && <Icon size={13} />}{label}
      </span>
      {children}
    </label>
  )
}

function FormattedDateInput(props) {
  return <CalendarPicker className={INPUT} {...props} />
}

import React, { useEffect, useRef, useState } from 'react'
import { Search, BadgeDollarSign, Plus, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, Trash2, X, Copy, Check, Loader2 } from 'lucide-react'
import AppShell from '../components/AppShell'
import { Shimmer } from '../components/PageShimmer'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { formatSignedMoneyInput, normalizeSignedMoneyInput } from '../lib/moneyInput'
import {
  CASHBACK_TYPES,
  DEFAULT_CASHBACK_TYPE,
  adjustLoyaltyBalance,
  canAdjustLoyaltyBalance,
  canCreateLoyaltyCard,
  canDeleteLoyaltyTransaction,
  getLoyaltyTransactionDelta,
  canEditLoyaltyCard,
  canRemoveLoyaltyCard,
  createLoyaltyCardRecord,
  editLoyaltyCardRecord,
  formatUzPhoneNumberInput,
  getCashbackTypePercent,
  isMissingLoyaltySchemaColumn,
} from '../lib/loyalty'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { formatLongDateTime } from '../lib/dateFormat'
import { RollingText } from '../components/RollingNumber'

const CARD_PAGE_SIZE = 8
const TRANSACTION_PAGE_SIZE = 5
const CARD_SELECT_COLUMNS = 'id, card_number, public_token, customer_name, phone_number, cashback_type, balance, total_earned, total_redeemed, is_active, created_at, updated_at'
const TRANSACTION_SELECT_COLUMNS = 'id, loyalty_card_id, order_id, type, amount, balance_before, balance_after, reason, created_by, cashback_percent_used, card_type_at_transaction, card_number_at_transaction, customer_name_at_transaction, phone_number_at_transaction, created_at'

// Skeletons shaped like a loaded card row / transaction so paging doesn't jump.
function CardRowShimmer() {
  return (
    <div className="rounded-[10px] border border-[#e4e1de] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <Shimmer className="h-5 w-24 rounded-md" />
        <Shimmer className="h-4 w-20 rounded-md" />
      </div>
      <Shimmer className="mt-2 h-3.5 w-36 rounded-md" />
      <Shimmer className="mt-1.5 h-3 w-48 rounded-md" />
    </div>
  )
}

function TransactionShimmer() {
  return (
    <div className="rounded-xl border border-[#e4e1de] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Shimmer className="h-4 w-32 rounded-md" />
          <Shimmer className="mt-2 h-3 w-24 rounded-md" />
        </div>
        <Shimmer className="h-5 w-24 rounded-md" />
      </div>
      <Shimmer className="mt-4 h-3 w-52 rounded-md" />
      <Shimmer className="mt-2.5 h-3.5 w-56 rounded-md" />
      <div className="mt-4 flex justify-end">
        <Shimmer className="h-6 w-16 rounded-md" />
      </div>
    </div>
  )
}

export default function AdminLoyalty() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const role = profile?.role || state.user?.role || 'guest'
  const canCreate = canCreateLoyaltyCard(role)
  const canEdit = canEditLoyaltyCard(role)
  const canAdjust = canAdjustLoyaltyBalance(role)
  const canRemoveCard = canRemoveLoyaltyCard(role)
  const canDeleteTransactions = canDeleteLoyaltyTransaction(role)
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [selected, setSelected] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [transactionPage, setTransactionPage] = useState(0)
  const [totalTransactions, setTotalTransactions] = useState(0)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [form, setForm] = useState({ card_number: '', customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
  const [profileForm, setProfileForm] = useState({ customer_name: '', phone_number: '' })
  const [adjustment, setAdjustment] = useState({ amount: '', reason: '' })
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  const [deletingTransactionId, setDeletingTransactionId] = useState('')
  const [supportsCashbackType, setSupportsCashbackType] = useState(true)
  const [loadingCards, setLoadingCards] = useState(true)
  const [cardPage, setCardPage] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [copiedCardNumber, setCopiedCardNumber] = useState('')
  const cardSearchRequestRef = useRef(0)
  const transactionRequestRef = useRef(0)
  const transactionListTopRef = useRef(null)
  const copiedFeedbackTimeoutRef = useRef(null)
  const cardListTopRef = useRef(null)
  // One write at a time: a second tap while a card, profile, balance or delete write is in
  // flight is ignored (the ref) and every write button shows it (the state).
  const [busyAction, setBusyAction] = useState('')
  const busyRef = useRef(false)
  const busy = busyAction !== ''

  async function runBusy(name, work) {
    if (busyRef.current) return
    busyRef.current = true
    setBusyAction(name)
    try {
      await work()
    } catch (error) {
      console.error(`[loyalty] ${name} failed`, error)
      setMessage('actionFailed')
    } finally {
      busyRef.current = false
      setBusyAction('')
    }
  }

  const L = {
    uz: {
      title: 'Sodiqlik kartalari',
      subtitle: 'Cashback hamyon balanslari va tranzaksiya tarixi',
      refresh: 'Yangilash',
      loading: 'Yuklanmoqda...',
      previousPage: 'Oldingi sahifa',
      nextPage: 'Keyingi sahifa',
      page: 'Sahifa',
      noCards: 'Sodiqlik kartalari topilmadi',
      detailsTitle: 'Sodiqlik kartasi tafsilotlari',
      back: 'Orqaga',
      createTitle: 'Sodiqlik kartasini yaratish',
      cardNumber: 'Karta raqami',
      customerName: 'Mijoz ismi',
      phoneNumber: 'Telefon raqami',
      createCard: 'Sodiqlik kartasini ro‘yxatdan o‘tkazish',
      profileTitle: 'Mijoz sodiqlik profili',
      cardNo: 'Karta raqami',
      balance: 'Balans',
      cashbackType: 'Cashback turi',
      cashbackRate: 'Cashback foizi',
      searchPlaceholder: 'Karta, ism yoki telefon bo‘yicha qidirish',
      copyCardNumber: 'Karta raqamini nusxalash',
      cardNumberCopied: 'Karta raqami nusxalandi',
      copyCardNumberFailed: 'Karta raqamini nusxalab bo‘lmadi.',
      unnamedCustomer: 'Nomsiz mijoz',
      active: 'Faol',
      inactive: 'Faol emas',
      cashbackBalance: 'Cashback balansi',
      removeCard: 'Kartani o‘chirish',
      confirmRemoveCard: 'O‘chirishni tasdiqlash',
      removeCardHelp: 'Karta o‘chiriladi, lekin eski tranzaksiyalar va hisobotlar saqlanadi. Bu karta raqamini boshqa mijozga qayta berish mumkin.',
      removeCardFailed: 'Kartani o‘chirib bo‘lmadi. 051 migratsiyasini ishga tushiring.',
      totalEarned: 'Jami cashback',
      totalUsed: 'Jami ishlatilgan sodiqlik balansi',
      status: 'Status',
      ownerActions: 'Owner moliyaviy amallari',
      manualAdjustment: 'Balansni qo‘lda tuzatish',
      adjustmentHelper: 'Har bir qo‘lda tuzatish tranzaksiya yozuvini yaratadi.',
      ownerAdjustOnly: 'Faqat owner sodiqlik balansini qo‘lda tuzatishi mumkin.',
      ownerTypeOnly: 'Cashback turi ro‘yxatdan o‘tkazilgandan keyin qulflanadi, chunki u jismoniy kartaga bosilgan.',
      saveCustomer: 'Mijoz ma’lumotlarini saqlash',
      amountPlaceholder: '+/- summa',
      reason: 'Sabab',
      apply: 'Qo‘llash',
      transactionHistory: 'Balans tranzaksiyalari tarixi',
      noTransactions: 'Hali tranzaksiyalar yo‘q.',
      latestTransactions: 'So‘nggi tranzaksiyalar',
      noCustomerName: 'Mijoz ismi yo‘q',
      noPhoneNumber: 'Telefon raqami yo‘q',
      orderPrefix: 'Buyurtma',
      balanceFlow: 'Balans',
      cashbackMeta: 'karta · Cashback',
      usedForOrder: 'Buyurtma to‘lovi uchun ishlatildi',
      manualAdjustmentDesc: 'Qo‘lda balans tuzatildi',
      selectCard: 'Sodiqlik kartasini tanlang',
      selectCardSub: 'Balans, buyurtma faoliyati va hamyon tranzaksiyalarini ko‘ring.',
      adjustmentRequired: 'Tuzatish summasi va sababini kiriting.',
      balanceNegative: 'Sodiqlik balansi manfiy bo‘la olmaydi.',
      ownerOnly: 'Bu amal faqat owner uchun ruxsat etilgan.',
      deleteTransaction: 'O‘chirish',
      confirmDelete: 'O‘chirishni tasdiqlash',
      cancel: 'Bekor qilish',
      deletingTransaction: 'O‘chirilmoqda…',
      ownerDeleteOnly: 'Faqat owner test tranzaksiyalarini o‘chirishi mumkin.',
      deleteTransactionFailed: 'Tranzaksiyani o‘chirib bo‘lmadi. 042 migratsiyasini ishga tushiring.',
      cashbackTypeUnavailable: 'Cashback turi ustuni hali bazada qo‘llanmagan. 022 migratsiyasini ishga tushiring.',
      loadCardsFailed: 'Kartalarni yuklab bo‘lmadi. Ulanishni tekshirib, «Yangilash»ni bosing.',
      loadTransactionsFailed: 'Tranzaksiya tarixini yuklab bo‘lmadi. Kartani qayta oching.',
      createCardFailed: 'Kartani ro‘yxatdan o‘tkazib bo‘lmadi. Karta raqami band emasligini tekshirib, qayta urinib ko‘ring.',
      saveCustomerFailed: 'Mijoz ma’lumotlarini saqlab bo‘lmadi. Qayta urinib ko‘ring.',
      adjustFailed: 'Balans o‘zgartirilmadi. Kartani qayta ochib, balansni tekshiring va qayta urinib ko‘ring.',
      adjustHistoryFailed: 'Balans o‘zgartirildi, lekin tarix yozuvi saqlanmadi. Tuzatishni qayta kiritmang: kartani qayta ochib, balansni tekshiring.',
      actionFailed: 'Amal bajarilmadi. Ulanishni tekshirib, qayta urinib ko‘ring.',
      saving: 'Saqlanmoqda…',
      clearSearch: 'Qidiruvni tozalash',
      removingCard: 'Karta o‘chirilmoqda…',
      cardFormRequired: '8 xonali karta raqamini kiriting. Telefon ixtiyoriy, lekin kiritilsa +998 XX XXX XX XX formatida bo‘lishi kerak.',
      transactionTypes: {
        cashback_earned: 'Cashback hisoblandi',
        redeemed: 'Sodiqlik balansi ishlatildi',
        manual_adjustment: 'Qo‘lda tuzatish',
        refund_reversal: 'Qaytarish bekor qilindi',
        migrated_discount_card: 'Eski kartadan ko‘chirildi',
      },
    },
    ru: {
      title: 'Карты лояльности',
      subtitle: 'Балансы кешбэк-кошельков и история транзакций',
      refresh: 'Обновить',
      loading: 'Загрузка...',
      previousPage: 'Предыдущая страница',
      nextPage: 'Следующая страница',
      page: 'Страница',
      noCards: 'Карты лояльности не найдены',
      detailsTitle: 'Детали карты лояльности',
      back: 'Назад',
      createTitle: 'Создать карту лояльности',
      cardNumber: 'Номер карты',
      customerName: 'Имя клиента',
      phoneNumber: 'Номер телефона',
      createCard: 'Зарегистрировать карту лояльности',
      profileTitle: 'Профиль лояльности клиента',
      cardNo: 'Карта №',
      balance: 'Баланс',
      cashbackType: 'Тип кешбэка',
      cashbackRate: 'Процент кешбэка',
      searchPlaceholder: 'Поиск по карте, имени или телефону',
      copyCardNumber: 'Скопировать номер карты',
      cardNumberCopied: 'Номер карты скопирован',
      copyCardNumberFailed: 'Не удалось скопировать номер карты.',
      unnamedCustomer: 'Клиент без имени',
      active: 'Активна',
      inactive: 'Неактивна',
      cashbackBalance: 'Баланс кешбэка',
      removeCard: 'Удалить карту',
      confirmRemoveCard: 'Подтвердить удаление',
      removeCardHelp: 'Карта будет удалена, но старые транзакции и отчёты сохранятся. Этот номер карты можно будет выдать другому клиенту.',
      removeCardFailed: 'Не удалось удалить карту. Запустите миграцию 051.',
      totalEarned: 'Всего кешбэка начислено',
      totalUsed: 'Всего использовано с баланса',
      status: 'Статус',
      ownerActions: 'Финансовые действия владельца',
      manualAdjustment: 'Ручная корректировка баланса',
      adjustmentHelper: 'Каждая ручная корректировка создаёт запись транзакции.',
      ownerAdjustOnly: 'Только владелец может вручную изменять баланс лояльности.',
      ownerTypeOnly: 'Тип кешбэка заблокирован после регистрации, потому что он напечатан на физической карте.',
      saveCustomer: 'Сохранить данные клиента',
      amountPlaceholder: '+/- сумма',
      reason: 'Причина',
      apply: 'Применить',
      transactionHistory: 'История транзакций баланса',
      noTransactions: 'Транзакций пока нет.',
      latestTransactions: 'Последние транзакции',
      noCustomerName: 'Имя клиента не указано',
      noPhoneNumber: 'Номер телефона не указан',
      orderPrefix: 'Заказ',
      balanceFlow: 'Баланс',
      cashbackMeta: 'карта · Кешбэк',
      usedForOrder: 'Использовано для оплаты заказа',
      manualAdjustmentDesc: 'Ручная корректировка баланса',
      selectCard: 'Выберите карту лояльности',
      selectCardSub: 'Просмотрите баланс, активность заказов и транзакции кошелька.',
      adjustmentRequired: 'Введите сумму корректировки и причину.',
      balanceNegative: 'Баланс лояльности не может быть отрицательным.',
      ownerOnly: 'Это действие доступно только владельцу.',
      deleteTransaction: 'Удалить',
      confirmDelete: 'Подтвердить удаление',
      cancel: 'Отмена',
      deletingTransaction: 'Удаление…',
      ownerDeleteOnly: 'Только владелец может удалять тестовые транзакции.',
      deleteTransactionFailed: 'Не удалось удалить транзакцию. Запустите миграцию 042.',
      cashbackTypeUnavailable: 'Колонка типа кешбэка ещё не применена в базе. Запустите миграцию 022.',
      loadCardsFailed: 'Не удалось загрузить карты. Проверьте соединение и нажмите «Обновить».',
      loadTransactionsFailed: 'Не удалось загрузить историю транзакций. Откройте карту заново.',
      createCardFailed: 'Не удалось зарегистрировать карту. Проверьте, что номер не занят, и повторите.',
      saveCustomerFailed: 'Не удалось сохранить данные клиента. Повторите попытку.',
      adjustFailed: 'Баланс не изменён. Откройте карту заново, проверьте баланс и повторите.',
      adjustHistoryFailed: 'Баланс изменён, но запись в истории не сохранилась. Не вводите корректировку повторно: откройте карту заново и проверьте баланс.',
      actionFailed: 'Действие не выполнено. Проверьте соединение и повторите.',
      saving: 'Сохранение…',
      clearSearch: 'Очистить поиск',
      removingCard: 'Удаление карты…',
      cardFormRequired: 'Введите 8-значный номер карты. Телефон необязателен, но если указан, должен быть в формате +998 XX XXX XX XX.',
      transactionTypes: {
        cashback_earned: 'Кешбэк начислен',
        redeemed: 'Использовано с баланса',
        manual_adjustment: 'Ручная корректировка',
        refund_reversal: 'Отмена возврата',
        migrated_discount_card: 'Перенесено со старой карты',
      },
    },
    en: {
      title: 'Loyalty cards',
      subtitle: 'Cashback wallet balances and transaction history',
      refresh: 'Refresh',
      loading: 'Loading...',
      previousPage: 'Previous page',
      nextPage: 'Next page',
      page: 'Page',
      noCards: 'No loyalty cards found',
      detailsTitle: 'Loyalty card details',
      back: 'Back',
      createTitle: 'Create loyalty card',
      cardNumber: 'Card number',
      customerName: 'Customer name',
      phoneNumber: 'Phone number',
      createCard: 'Register loyalty card',
      profileTitle: 'Customer loyalty profile',
      cardNo: 'Card No',
      balance: 'Balance',
      cashbackType: 'Cashback type',
      cashbackRate: 'Cashback rate',
      searchPlaceholder: 'Search card, name, phone',
      copyCardNumber: 'Copy card number',
      cardNumberCopied: 'Card number copied',
      copyCardNumberFailed: 'Could not copy the card number.',
      unnamedCustomer: 'Unnamed customer',
      active: 'Active',
      inactive: 'Inactive',
      cashbackBalance: 'Cashback balance',
      removeCard: 'Remove card',
      confirmRemoveCard: 'Confirm remove',
      removeCardHelp: 'The card will be removed, but old transactions and reports stay preserved. This card number can be issued to another customer.',
      removeCardFailed: 'Could not remove card. Run migration 051.',
      totalEarned: 'Total cashback earned',
      totalUsed: 'Total loyalty used',
      status: 'Status',
      ownerActions: 'Owner financial actions',
      manualAdjustment: 'Manual balance adjustment',
      adjustmentHelper: 'Every manual adjustment creates a transaction record.',
      ownerAdjustOnly: 'Only owner can manually adjust loyalty balance.',
      ownerTypeOnly: 'Cashback type is locked after card registration because it is printed on the physical card.',
      saveCustomer: 'Save customer details',
      amountPlaceholder: '+/- amount',
      reason: 'Reason',
      apply: 'Apply',
      transactionHistory: 'Balance transaction history',
      noTransactions: 'No transactions yet.',
      latestTransactions: 'Latest transactions',
      noCustomerName: 'No customer name',
      noPhoneNumber: 'No phone number',
      orderPrefix: 'Order',
      balanceFlow: 'Balance',
      cashbackMeta: 'card · Cashback',
      usedForOrder: 'Used for order payment',
      manualAdjustmentDesc: 'Manual balance adjustment',
      selectCard: 'Select a loyalty card',
      selectCardSub: 'View balance, order activity, and wallet transactions.',
      adjustmentRequired: 'Enter an adjustment amount and reason.',
      balanceNegative: 'Loyalty balance cannot go negative.',
      ownerOnly: 'Only the owner can perform this action.',
      deleteTransaction: 'Delete',
      confirmDelete: 'Confirm delete',
      cancel: 'Cancel',
      deletingTransaction: 'Deleting…',
      ownerDeleteOnly: 'Only owner can delete test transactions.',
      deleteTransactionFailed: 'Could not delete transaction. Run migration 042.',
      cashbackTypeUnavailable: 'Cashback type is not available in the database yet. Run migration 022.',
      loadCardsFailed: 'Could not load cards. Check the connection and press Refresh.',
      loadTransactionsFailed: 'Could not load the transaction history. Open the card again.',
      createCardFailed: 'Could not register the card. Check that the number is not already in use and try again.',
      saveCustomerFailed: 'Could not save the customer details. Try again.',
      adjustFailed: 'The balance was not changed. Reopen the card, check the balance and try again.',
      adjustHistoryFailed: 'The balance was changed, but its history entry was not saved. Do not enter the adjustment again: reopen the card and check the balance.',
      actionFailed: 'The action was not completed. Check the connection and try again.',
      saving: 'Saving…',
      clearSearch: 'Clear search',
      removingCard: 'Removing card…',
      cardFormRequired: 'Enter an 8-digit card number. Phone is optional, but must match +998 XX XXX XX XX when provided.',
      transactionTypes: {
        cashback_earned: 'Cashback earned',
        redeemed: 'Loyalty balance used',
        manual_adjustment: 'Manual adjustment',
        refund_reversal: 'Refund reversal',
        migrated_discount_card: 'Migrated from old card',
      },
    },
  }
  const l = L[lang] || L.en

  function statusLabel(card) {
    return card?.is_active === false ? l.inactive : l.active
  }

  function transactionTypeLabel(type) {
    return l.transactionTypes[type] || String(type || '').replaceAll('_', ' ')
  }

  function cashbackTypeLabel(type) {
    const normalized = String(type || DEFAULT_CASHBACK_TYPE).toLowerCase()
    const config = CASHBACK_TYPES[normalized] || CASHBACK_TYPES[DEFAULT_CASHBACK_TYPE]
    return `${config.label} · ${config.percent}%`
  }

  function selectedName(card) {
    return card?.customer_name || l.noCustomerName
  }

  function selectedPhone(card) {
    return card?.phone_number || l.noPhoneNumber
  }

  async function copyCardNumber(cardNumber) {
    try {
      await navigator.clipboard.writeText(String(cardNumber))
      setCopiedCardNumber(String(cardNumber))
      clearTimeout(copiedFeedbackTimeoutRef.current)
      copiedFeedbackTimeoutRef.current = setTimeout(() => setCopiedCardNumber(''), 1600)
    } catch {
      setMessage('copyCardNumberFailed')
    }
  }

  // Direction comes from the balance flow (shared with the delete RPC), so a deduction
  // saved with an unsigned amount still reads as a minus.
  function transactionAmount(tx) {
    const delta = getLoyaltyTransactionDelta(tx)
    return `${delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`
  }

  function transactionAmountClass(tx) {
    return getLoyaltyTransactionDelta(tx) >= 0
      ? 'text-[#1d7a52]'
      : 'text-[#c4262c]'
  }

  function transactionDescription(tx) {
    if (tx.reason) return tx.reason
    if (tx.type === 'redeemed') return l.usedForOrder
    if (tx.type === 'manual_adjustment') return l.manualAdjustmentDesc
    return ''
  }

  function formatTransactionDate(value) {
    return formatLongDateTime(value, lang, value)
  }

  function transactionCardType(tx) {
    const type = tx.card_type_at_transaction || DEFAULT_CASHBACK_TYPE
    const label = CASHBACK_TYPES[type]?.label || CASHBACK_TYPES[DEFAULT_CASHBACK_TYPE].label
    const percent = tx.cashback_percent_used ?? getCashbackTypePercent(type)
    return `${label} ${l.cashbackMeta} ${percent}%`
  }

  async function searchCards(term = query, { page = 0 } = {}) {
    const requestId = cardSearchRequestRef.current + 1
    cardSearchRequestRef.current = requestId
    setMessage('')
    setLoadingCards(true)
    const nextPage = Math.max(0, page)
    const from = nextPage * CARD_PAGE_SIZE
    const to = from + CARD_PAGE_SIZE - 1
    let request = supabase
      .from('loyalty_cards')
      .select(CARD_SELECT_COLUMNS, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, to)
    const trimmed = term.trim()
    if (trimmed) {
      const safeTerm = trimmed.replace(/[%,]/g, '')
      request = request.or(`card_number.ilike.%${safeTerm}%,customer_name.ilike.%${safeTerm}%,phone_number.ilike.%${safeTerm}%`)
    }
    const { data, error, count } = await request
    if (requestId !== cardSearchRequestRef.current) return
    setLoadingCards(false)
    if (error) {
      console.error('[loyalty] card search failed', error)
      setMessage('loadCardsFailed')
      return
    }
    if ((data || []).some(card => !Object.prototype.hasOwnProperty.call(card, 'cashback_type'))) {
      setSupportsCashbackType(false)
    }
    setCards(data || [])
    setCardPage(nextPage)
    setTotalCards(count ?? (data || []).length)
    return true
  }

  async function goToCardPage(page) {
    if (loadingCards || page === cardPage || page < 0 || page >= Math.ceil(totalCards / CARD_PAGE_SIZE)) return
    const loaded = await searchCards(query, { page })
    if (loaded) cardListTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function loadTransactions(card, { page = 0 } = {}) {
    const requestId = transactionRequestRef.current + 1
    transactionRequestRef.current = requestId
    if (selected?.id !== card.id) {
      setTransactions([])
      setTotalTransactions(0)
      setTransactionPage(0)
    }
    setSelected(card)
    setConfirmDeleteId('')
    setProfileForm({
      customer_name: card.customer_name || '',
      phone_number: card.phone_number || '',
    })
    setLoadingTransactions(true)
    const nextPage = Math.max(0, page)
    const from = nextPage * TRANSACTION_PAGE_SIZE
    const { data, error, count } = await supabase
      .from('loyalty_transactions')
      .select(TRANSACTION_SELECT_COLUMNS, { count: 'exact' })
      .eq('loyalty_card_id', card.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TRANSACTION_PAGE_SIZE - 1)
    if (requestId !== transactionRequestRef.current) return
    setLoadingTransactions(false)
    if (error) {
      console.error('[loyalty] transactions failed to load', error)
      setMessage('loadTransactionsFailed')
      setTransactions([])
      return
    }
    const total = count ?? (data || []).length
    const lastPage = Math.max(0, Math.ceil(total / TRANSACTION_PAGE_SIZE) - 1)
    // A delete can empty the last page; step back to the new last page.
    if (nextPage > lastPage) return loadTransactions(card, { page: lastPage })
    setTransactions(data || [])
    setTransactionPage(nextPage)
    setTotalTransactions(total)
    return true
  }

  async function goToTransactionPage(page) {
    if (!selected || loadingTransactions || page === transactionPage || page < 0 || page >= Math.ceil(totalTransactions / TRANSACTION_PAGE_SIZE)) return
    const loaded = await loadTransactions(selected, { page })
    if (loaded) transactionListTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function createCard() {
    setMessage('')
    if (!canCreate) {
      setMessage('ownerOnly')
      return
    }
    const now = new Date().toISOString()
    let cardRecord
    try {
      cardRecord = createLoyaltyCardRecord({
        role,
        cardNumber: form.card_number,
        customerName: form.customer_name,
        phoneNumber: form.phone_number,
        cashbackType: form.cashback_type,
        existingCardNumbers: cards.map(card => card.card_number),
        now,
      })
    } catch (error) {
      if (!['invalid_card_number', 'invalid_phone_number'].includes(error.code)) console.error('[loyalty] card form rejected', error)
      setMessage(['invalid_card_number', 'invalid_phone_number'].includes(error.code) ? 'cardFormRequired' : 'createCardFailed')
      return
    }
    const { cashback_type: ignoredCashbackType, ...legacyCardRecord } = cardRecord
    let insertRecord = supportsCashbackType ? cardRecord : legacyCardRecord
    let { data, error } = await supabase
      .from('loyalty_cards')
      .insert(insertRecord)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error && isMissingLoyaltySchemaColumn(error, 'cashback_type')) {
      setSupportsCashbackType(false)
      ;({ data, error } = await supabase
        .from('loyalty_cards')
        .insert(legacyCardRecord)
        .select(CARD_SELECT_COLUMNS)
        .single())
    }
    if (error) {
      console.error('[loyalty] card insert failed', error)
      setMessage('createCardFailed')
      return
    }
    setForm({ card_number: '', customer_name: '', phone_number: '', cashback_type: DEFAULT_CASHBACK_TYPE })
    await searchCards(query, { page: 0 })
    loadTransactions(data)
  }

  async function removeCard(card) {
    if (!canRemoveCard) {
      setMessage('ownerOnly')
      return
    }
    if (confirmDeleteId !== `card:${card.id}`) {
      setConfirmDeleteId(`card:${card.id}`)
      return
    }
    const { error } = await supabase.rpc('remove_loyalty_card', {
      p_card_id: card.id,
    })
    if (error) {
      console.error('[loyalty] card removal failed', error)
      setMessage('removeCardFailed')
      return
    }
    setSelected(null)
    setTransactions([])
    setTotalTransactions(0)
    setTransactionPage(0)
    setConfirmDeleteId('')
    setMessage('')
    const nextPage = cards.length === 1 && cardPage > 0 ? cardPage - 1 : cardPage
    await searchCards(query, { page: nextPage })
  }

  async function updateCustomerProfile() {
    if (!selected) return
    if (!canEdit) {
      setMessage('ownerOnly')
      return
    }
    let next
    try {
      next = editLoyaltyCardRecord({
        role,
        card: selected,
        patch: {
          customer_name: profileForm.customer_name,
          phone_number: profileForm.phone_number,
        },
      })
    } catch (error) {
      if (error.code !== 'invalid_phone_number') console.error('[loyalty] customer profile rejected', error)
      setMessage(error.code === 'invalid_phone_number' ? 'cardFormRequired' : 'saveCustomerFailed')
      return
    }
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({
        customer_name: next.customer_name,
        phone_number: next.phone_number,
        updated_at: next.updated_at,
      })
      .eq('id', selected.id)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error) {
      console.error('[loyalty] customer profile update failed', error)
      setMessage('saveCustomerFailed')
      return
    }
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    setSelected(data)
    setProfileForm({ customer_name: data.customer_name || '', phone_number: data.phone_number || '' })
    setMessage('')
  }

  async function adjustBalance() {
    if (!selected) return
    if (!canAdjust) {
      setMessage('ownerOnly')
      return
    }
    let settlement
    try {
      settlement = adjustLoyaltyBalance({
        role,
        card: selected,
        amount: Number(adjustment.amount),
        reason: adjustment.reason,
        createdBy: profile?.id || state.user?.id || null,
      })
    } catch (error) {
      setMessage(error.code === 'negative_balance' ? 'balanceNegative' : 'adjustmentRequired')
      return
    }
    const { data, error } = await supabase
      .from('loyalty_cards')
      .update({
        balance: settlement.card.balance,
        total_earned: settlement.card.total_earned,
        total_redeemed: settlement.card.total_redeemed,
        updated_at: settlement.card.updated_at,
      })
      .eq('id', selected.id)
      .select(CARD_SELECT_COLUMNS)
      .single()
    if (error) {
      console.error('[loyalty] balance adjustment failed', error)
      setMessage('adjustFailed')
      return
    }
    // The balance is already saved. If its history row fails, say so instead of looking
    // successful: re-entering the adjustment would change the balance a second time.
    const { error: historyError } = await supabase.from('loyalty_transactions').insert(settlement.transaction)
    if (historyError) console.error('[loyalty] adjustment history row was not saved', historyError)
    setMessage(historyError ? 'adjustHistoryFailed' : '')
    setAdjustment({ amount: '', reason: '' })
    setCards(prev => prev.map(row => row.id === data.id ? data : row))
    loadTransactions(data)
  }

  async function deleteTransaction(tx) {
    if (!selected || !tx?.id) return
    if (!canDeleteTransactions) {
      setMessage('ownerOnly')
      return
    }
    if (confirmDeleteId !== tx.id) {
      setConfirmDeleteId(tx.id)
      return
    }
    setMessage('')
    setDeletingTransactionId(tx.id)
    const { data, error } = await supabase.rpc('delete_loyalty_transaction', {
      p_transaction_id: tx.id,
    })
    setDeletingTransactionId('')
    if (error) {
      console.error('[loyalty] transaction delete failed', error)
      setMessage('deleteTransactionFailed')
      return
    }
    const nextCard = data?.card || selected
    setCards(prev => prev.map(row => row.id === nextCard.id ? nextCard : row))
    setSelected(nextCard)
    setConfirmDeleteId('')
    loadTransactions(nextCard, { page: transactionPage })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCards(query, { page: 0 })
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => () => clearTimeout(copiedFeedbackTimeoutRef.current), [])

  const totalCardPages = Math.ceil(totalCards / CARD_PAGE_SIZE)
  const firstVisibleCardPage = Math.max(0, Math.min(cardPage - 2, totalCardPages - 5))
  const visibleCardPages = Array.from(
    { length: Math.min(5, totalCardPages) },
    (_, index) => firstVisibleCardPage + index,
  )
  const totalTransactionPages = Math.ceil(totalTransactions / TRANSACTION_PAGE_SIZE)
  const firstVisibleTransactionPage = Math.max(0, Math.min(transactionPage - 2, totalTransactionPages - 5))
  const visibleTransactionPages = Array.from(
    { length: Math.min(5, totalTransactionPages) },
    (_, index) => firstVisibleTransactionPage + index,
  )

  return (
    <AppShell
      title={selected ? l.detailsTitle : l.title}
      headerActions={(
        <button type="button" onClick={() => searchCards(query, { page: cardPage })} disabled={loadingCards} aria-label={l.refresh} className="ws-btn ws-btn-outline ws-btn-sm">
          <RefreshCw size={16} className={loadingCards ? 'animate-spin' : ''} aria-hidden="true" /><span className="hidden sm:inline">{l.refresh}</span>
        </button>
      )}
    >
      <div className="min-h-full w-full max-w-full overflow-x-hidden bg-[#f6f5f3]">
        <div className="ws-page">
        {message && <div role="alert" className="ws-notice ws-tone-caution">{l[message] || l.actionFailed}</div>}

        <div className="grid max-w-full gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className={`${selected ? 'hidden lg:block' : ''} ws-panel self-start`}>
            <h2 className="ws-heading mb-4">{l.createTitle}</h2>
            <div className="space-y-2">
              <input value={form.card_number} onChange={e => setForm({ ...form, card_number: String(e.target.value || '').replace(/\D/g, '').slice(0, 8) })} placeholder={l.cardNumber} aria-label={l.cardNumber} inputMode="numeric" maxLength={8} className="ws-input" />
              <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder={l.customerName} aria-label={l.customerName} className="ws-input" />
              <input value={form.phone_number} onChange={e => setForm({ ...form, phone_number: formatUzPhoneNumberInput(e.target.value) })} placeholder="+998 91 132 32 32" aria-label={l.phoneNumber} inputMode="tel" className="ws-input" />
              <select aria-label={l.cashbackType} value={form.cashback_type} onChange={e => setForm({ ...form, cashback_type: e.target.value })} disabled={!canCreate} className="ws-input">
                {Object.entries(CASHBACK_TYPES).map(([key, config]) => (
                  <option key={key} value={key}>{config.label} · {config.percent}%</option>
                ))}
              </select>
              <button type="button" onClick={() => runBusy('create', createCard)} disabled={!canCreate || busy} className="ws-btn ws-btn-primary w-full">
                {busyAction === 'create' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {busyAction === 'create' ? l.saving : l.createCard}
              </button>
              {!canCreate && <p className="ws-caption">{l.ownerOnly}</p>}
            </div>

            <div ref={cardListTopRef} className="mt-5 scroll-mt-4">
              <div className="relative mb-3">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={l.searchPlaceholder} aria-label={l.searchPlaceholder} className="ws-input !pl-9" />
              </div>
              <div className="space-y-2" aria-busy={loadingCards}>
                {loadingCards && Array.from({ length: cards.length || CARD_PAGE_SIZE }, (_, index) => <CardRowShimmer key={index} />)}
                {!loadingCards && cards.map(card => {
                  const isCopied = copiedCardNumber === String(card.card_number)
                  return (
                    <div key={card.id} className={`relative w-full rounded-[10px] border p-3 transition-colors ${selected?.id === card.id ? 'border-[#ff5a00] bg-[#fff1e8]' : 'border-[#e4e1de] bg-white hover:bg-[#f6f5f3]'}`}>
                      <button
                        type="button"
                        onClick={() => loadTransactions(card)}
                        aria-label={`${card.card_number}, ${card.customer_name || l.unnamedCustomer}`}
                        className="absolute inset-0 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00] focus-visible:ring-offset-1"
                      />
                      <div className="pointer-events-none relative flex flex-wrap items-center justify-between gap-x-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold tabular-nums text-[#22201d]">{card.card_number}</span>
                          <button
                            type="button"
                            onClick={() => copyCardNumber(card.card_number)}
                            aria-label={isCopied ? l.cardNumberCopied : `${l.copyCardNumber} ${card.card_number}`}
                            title={isCopied ? l.cardNumberCopied : l.copyCardNumber}
                            className={`ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon pointer-events-auto relative z-10 ${isCopied ? '!text-[#1d7a52]' : ''}`}
                          >
                            {isCopied ? <Check size={15} strokeWidth={3} /> : <Copy size={14} />}
                          </button>
                        </div>
                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[#1d7a52]">{formatCurrency(card.balance || 0)}</span>
                      </div>
                      <div className="pointer-events-none relative mt-1 flex min-w-0 items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] text-[#22201d] [overflow-wrap:anywhere]">{card.customer_name || l.unnamedCustomer} · {statusLabel(card)}</p>
                          <p className="ws-caption mt-0.5"><span className="whitespace-nowrap">{card.phone_number || l.noPhoneNumber}</span> · <span className="whitespace-nowrap">{cashbackTypeLabel(card.cashback_type)}</span></p>
                        </div>
                        <ChevronRight size={16} className="flex-shrink-0 text-[#68655f] lg:hidden" />
                      </div>
                    </div>
                  )
                })}
                {!loadingCards && cards.length === 0 && (
                  <div className="ws-empty">
                    <p>{l.noCards}</p>
                    {query.trim() !== '' && (
                      <button type="button" onClick={() => setQuery('')} className="ws-btn ws-btn-outline ws-btn-sm">{l.clearSearch}</button>
                    )}
                  </div>
                )}
                {totalCardPages > 1 && (
                  <nav className="flex items-center justify-center gap-1 pt-2" aria-label={l.page}>
                    <button
                      type="button"
                      onClick={() => goToCardPage(cardPage - 1)}
                      disabled={loadingCards || cardPage === 0}
                      aria-label={l.previousPage}
                      title={l.previousPage}
                      className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    {visibleCardPages.map(page => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => goToCardPage(page)}
                        disabled={loadingCards}
                        aria-label={`${l.page} ${page + 1}`}
                        aria-current={page === cardPage ? 'page' : undefined}
                        className={`ws-btn ws-btn-sm min-w-[34px] !px-2 tabular-nums ${page === cardPage ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
                      >
                        {page + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => goToCardPage(cardPage + 1)}
                      disabled={loadingCards || cardPage >= totalCardPages - 1}
                      aria-label={l.nextPage}
                      title={l.nextPage}
                      className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </nav>
                )}
              </div>
            </div>
          </section>

          <section className={`${selected ? '' : 'hidden lg:block'} ws-panel min-w-0`}>
            {selected ? (
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
                <div className="xl:col-span-2 lg:hidden">
                  <button type="button" onClick={() => setSelected(null)} className="ws-btn ws-btn-outline ws-btn-sm mb-1">
                    <ArrowLeft aria-hidden="true" /> {l.back}
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="ws-caption font-medium">{l.profileTitle}</p>
                        <h2 className="ws-display mt-1 [overflow-wrap:anywhere]">{selectedName(selected)}</h2>
                        <p className="ws-muted mt-1">{selectedPhone(selected)} · {l.cardNo}: {selected.card_number}</p>
                      </div>
                      <span className={`ws-status ${selected.is_active === false ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
                        {statusLabel(selected)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl bg-white p-4">
                      <p className="ws-caption font-medium">{l.customerName}</p>
                      {canEdit ? (
                        <div className="mt-3 grid gap-2">
                          <input value={profileForm.customer_name} onChange={e => setProfileForm({ ...profileForm, customer_name: e.target.value })} placeholder={l.noCustomerName} aria-label={l.customerName} className="ws-input" />
                          <input value={profileForm.phone_number} onChange={e => setProfileForm({ ...profileForm, phone_number: formatUzPhoneNumberInput(e.target.value) })} placeholder="+998 91 132 32 32" aria-label={l.phoneNumber} inputMode="tel" className="ws-input" />
                          <button type="button" onClick={() => runBusy('profile', updateCustomerProfile)} disabled={busy} className="ws-btn ws-btn-outline">
                            {busyAction === 'profile' && <Loader2 className="animate-spin" aria-hidden="true" />}
                            {busyAction === 'profile' ? l.saving : l.saveCustomer}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-semibold text-[#22201d]">{selectedName(selected)}</p>
                          <p className="ws-muted">{selectedPhone(selected)}</p>
                        </div>
                      )}
                      <p className="ws-caption mt-3">{l.cardNo}: {selected.card_number}</p>
                    </div>

                    <div className="mt-4 rounded-xl bg-white px-4 py-4">
                      <p className="ws-caption font-medium">{l.balance}</p>
                      <p className="mt-1 whitespace-nowrap text-[clamp(24px,2.4vw,32px)] font-semibold tracking-[-.02em] tabular-nums text-[#1d7a52]"><RollingText text={formatCurrency(selected.balance || 0)} /></p>
                    </div>

                    <div className="mt-4 rounded-xl bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="ws-caption font-medium">{l.cashbackType}</p>
                          <p className="mt-1 text-sm font-semibold text-[#22201d]">{cashbackTypeLabel(selected.cashback_type)}</p>
                        </div>
                        <span className="ws-badge ws-tone-accent">{l.cashbackRate}: {getCashbackTypePercent(selected.cashback_type || DEFAULT_CASHBACK_TYPE)}%</span>
                      </div>
                      <p className="ws-caption mt-3 rounded-lg bg-[#efece9] px-3 py-2">{l.ownerTypeOnly}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
                    <div className="rounded-xl border border-[#e4e1de] bg-white p-4"><p className="ws-caption">{l.totalEarned}</p><p className="mt-1 whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(selected.total_earned || 0)}</p></div>
                    <div className="rounded-xl border border-[#e4e1de] bg-white p-4"><p className="ws-caption">{l.totalUsed}</p><p className="mt-1 whitespace-nowrap font-semibold tabular-nums text-[#22201d]">{formatCurrency(selected.total_redeemed || 0)}</p></div>
                    <div className="rounded-xl border border-[#e4e1de] bg-white p-4"><p className="ws-caption">{l.status}</p><p className="mt-1 font-semibold tabular-nums text-[#22201d]">{statusLabel(selected)}</p></div>
                    <div className="rounded-xl border border-[#e4e1de] bg-white p-4"><p className="ws-caption">{l.cashbackType}</p><p className="mt-1 font-semibold tabular-nums text-[#22201d]">{cashbackTypeLabel(selected.cashback_type)}</p></div>
                  </div>

                  <div className="rounded-xl border border-[#e4e1de] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#22201d]"><BadgeDollarSign size={16} aria-hidden="true" /> {l.ownerActions}</h3>
                        <p className="ws-caption mt-1">{l.manualAdjustment}</p>
                      </div>
                      <button type="button" onClick={() => runBusy('remove', () => removeCard(selected))} disabled={!canRemoveCard || busy} className={`ws-btn ws-btn-sm ${confirmDeleteId === `card:${selected.id}` ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}>
                        {busyAction === 'remove' && confirmDeleteId === `card:${selected.id}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                        {confirmDeleteId === `card:${selected.id}` ? (busyAction === 'remove' ? l.removingCard : l.confirmRemoveCard) : l.removeCard}
                      </button>
                    </div>
                    {canRemoveCard && <p className="ws-caption mb-3 !text-[#c4262c]">{l.removeCardHelp}</p>}
                    <p className="ws-caption mb-3">{canAdjust ? l.adjustmentHelper : l.ownerAdjustOnly}</p>
                    <div className="grid gap-2">
                      <input type="text" value={formatSignedMoneyInput(adjustment.amount)} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, amount: normalizeSignedMoneyInput(e.target.value) })} placeholder={l.amountPlaceholder} aria-label={l.amountPlaceholder} inputMode="numeric" className="ws-input tabular-nums" />
                      <textarea rows={2} value={adjustment.reason} disabled={!canAdjust} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} placeholder={l.reason} aria-label={l.reason} className="ws-input" />
                      <button type="button" onClick={() => runBusy('adjust', adjustBalance)} disabled={!canAdjust || busy} className="ws-btn ws-btn-primary">
                        {busyAction === 'adjust' && <Loader2 className="animate-spin" aria-hidden="true" />}
                        {busyAction === 'adjust' ? l.saving : l.apply}
                      </button>
                    </div>
                  </div>
                </div>

                <div ref={transactionListTopRef} className="scroll-mt-4 rounded-xl border border-[#e4e1de] bg-[#f6f5f3] p-5">
                  <div className="mb-4">
                    <h3 className="ws-heading">{l.transactionHistory}</h3>
                    <p className="ws-caption mt-1">{canDeleteTransactions ? l.latestTransactions : l.ownerDeleteOnly}</p>
                  </div>
                  <div className="space-y-3" aria-busy={loadingTransactions}>
                    {loadingTransactions && Array.from({ length: transactions.length || TRANSACTION_PAGE_SIZE }, (_, index) => <TransactionShimmer key={index} />)}
                    {!loadingTransactions && transactions.map(tx => (
                      <div key={tx.id} className="rounded-xl border border-[#e4e1de] bg-white p-4 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#22201d]">{transactionTypeLabel(tx.type)}</p>
                            <p className="ws-caption mt-1 [overflow-wrap:anywhere]">{transactionDescription(tx)}</p>
                          </div>
                          <p className={`whitespace-nowrap text-base font-semibold tabular-nums ${transactionAmountClass(tx)}`}>{transactionAmount(tx)}</p>
                        </div>
                        {tx.type === 'cashback_earned' && (
                          <p className="ws-caption mt-3 !text-[#9a5a00]">{transactionCardType(tx)}</p>
                        )}
                        <div className="ws-caption mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          {tx.order_id && <span>{l.orderPrefix} #{tx.order_id}</span>}
                          {tx.created_at && <span>{formatTransactionDate(tx.created_at)}</span>}
                        </div>
                        {tx.balance_before != null && tx.balance_after != null && (
                          <p className="mt-2 text-[13px] font-medium tabular-nums text-[#22201d]">{l.balanceFlow}: <span className="whitespace-nowrap">{formatCurrency(tx.balance_before)}</span> → <span className="whitespace-nowrap">{formatCurrency(tx.balance_after)}</span></p>
                        )}
                        {canDeleteTransactions && (
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            {confirmDeleteId === tx.id && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId('')}
                                disabled={busy}
                                className="ws-btn ws-btn-outline ws-btn-sm"
                              >
                                <X aria-hidden="true" /> {l.cancel}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => runBusy('delete', () => deleteTransaction(tx))}
                              disabled={busy}
                              className={`ws-btn ws-btn-sm ${confirmDeleteId === tx.id ? 'ws-btn-danger-solid' : 'ws-btn-ghost ws-btn-danger'}`}
                            >
                              {deletingTransactionId === tx.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                              {deletingTransactionId === tx.id
                                ? l.deletingTransaction
                                : confirmDeleteId === tx.id ? l.confirmDelete : l.deleteTransaction}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!loadingTransactions && transactions.length === 0 && (
                      <div className="ws-empty rounded-xl bg-white"><p>{l.noTransactions}</p></div>
                    )}
                    {totalTransactionPages > 1 && (
                      <nav className="flex items-center justify-center gap-1 pt-1" aria-label={l.page}>
                        <button
                          type="button"
                          onClick={() => goToTransactionPage(transactionPage - 1)}
                          disabled={loadingTransactions || transactionPage === 0}
                          aria-label={l.previousPage}
                          title={l.previousPage}
                          className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                        >
                          <ChevronLeft size={17} />
                        </button>
                        {visibleTransactionPages.map(page => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => goToTransactionPage(page)}
                            disabled={loadingTransactions}
                            aria-label={`${l.page} ${page + 1}`}
                            aria-current={page === transactionPage ? 'page' : undefined}
                            className={`ws-btn ws-btn-sm min-w-[34px] !px-2 tabular-nums ${page === transactionPage ? 'ws-btn-primary' : 'ws-btn-ghost'}`}
                          >
                            {page + 1}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => goToTransactionPage(transactionPage + 1)}
                          disabled={loadingTransactions || transactionPage >= totalTransactionPages - 1}
                          aria-label={l.nextPage}
                          title={l.nextPage}
                          className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon"
                        >
                          <ChevronRight size={17} />
                        </button>
                      </nav>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ws-empty flex min-h-[420px] content-center">
                <BadgeDollarSign />
                <h3>{l.selectCard}</h3>
                <p>{l.selectCardSub}</p>
              </div>
            )}
          </section>
        </div>
        </div>
      </div>
    </AppShell>
  )
}

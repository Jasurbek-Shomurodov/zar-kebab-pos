import React, { useEffect, useMemo, useState } from 'react'
import { X, ShoppingCart, Minus, Plus, Trash2, UtensilsCrossed, Loader2, CheckCircle2 } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemDesc, getItemName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { getOrderPaymentSummary } from '../lib/analytics'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { ORDER_TYPE_LABELS, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { DEFAULT_PRICE_MODE, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import { formatWriteError } from '../lib/writeErrorMessage'
import { isMenuItemOrderable } from '../lib/menuItems'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { getManualOrderNotes, getOrderItemOptionLines } from './MenuProductCards'
import {
  changeMenuQuantity,
  formatMenuQuantity,
  isMenuItemSoldByWeight,
  menuQuantityStep,
  normalizeMenuQuantity,
} from '../lib/menuSaleUnits'

const ORDER_TYPES = [
  { key: 'dine_in', ...ORDER_TYPE_LABELS.dine_in },
  { key: 'take_away', ...ORDER_TYPE_LABELS.take_away },
  { key: 'delivery', ...ORDER_TYPE_LABELS.delivery },
  { key: 'game_club', ...ORDER_TYPE_LABELS.game_club },
]

// ── Cart item row ──────────────────────────────────────────────────────────────
function getCartItemKey(item) {
  return item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
}

function CartItemRow({ item, lang, dispatch, menuItem }) {
  const desc = menuItem ? getItemDesc(menuItem, lang) : null
  const grams = gramsLabel(menuItem, lang)
  const millilitres = millilitresLabel(menuItem, lang)
  const kcal = kcalLabel(menuItem, lang)
  const cartItemKey = getCartItemKey(item)
  const optionLines = getOrderItemOptionLines(item, menuItem, lang)
  const notesValue = getManualOrderNotes(item, menuItem, lang)
  const displayName = menuItem ? getItemName(menuItem, lang) : item.name
  const quantitySource = { ...menuItem, sale_unit: item.sale_unit || menuItem?.sale_unit }
  const soldByWeight = isMenuItemSoldByWeight(quantitySource)
  const unavailable = !isMenuItemOrderable(menuItem)
  const unavailableLabel = lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'

  function decrement() {
    const qty = changeMenuQuantity(item.quantity, quantitySource, -1)
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: cartItemKey })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { cart_item_key: cartItemKey, qty } })
  }

  function increment() {
    dispatch({ type: 'UPDATE_CART_QTY', payload: { cart_item_key: cartItemKey, qty: changeMenuQuantity(item.quantity, quantitySource, 1) } })
  }

  return (
    <div className="lux-glass mb-2.5 flex gap-3 rounded-[22px] p-2.5">
      {/* Thumbnail */}
      <div className="h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-[16px] bg-orange-50">
        {menuItem?.image_url ? (
          <img src={menuItem.image_url} alt="" className={`h-full w-full object-cover ${unavailable ? 'grayscale opacity-55' : ''}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={16} className="lux-gold" />
          </div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <p className="zk-serif lux-title min-w-0 flex-1 line-clamp-1 text-[18px] font-semibold leading-tight">
            {displayName}
          </p>
          <button
            onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: cartItemKey })}
            aria-label={lang === 'uz' ? "O'chirish" : lang === 'ru' ? 'Удалить' : 'Remove'}
            className="lux-muted flex-shrink-0 rounded-full p-1.5 transition-colors hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {unavailable && (
          <p className="lux-soft lux-muted mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {unavailableLabel}
          </p>
        )}

        {desc && <p className="lux-fade-text lux-muted mb-1 text-[12px]">{desc}</p>}
        {optionLines.map((line, index) => (
          <p key={`${cartItemKey}-option-${index}`} className="lux-title mb-0.5 text-[12px] font-semibold">
            {line}
          </p>
        ))}
        {(grams || millilitres || kcal) && (
          <p className="lux-muted mb-1.5 text-[11.5px]">{[grams, millilitres, kcal].filter(Boolean).join(' · ')}</p>
        )}

        {/* Qty stepper + price */}
        <div className="flex items-center justify-between mt-1">
          <div className="lux-soft flex items-center gap-2 rounded-full p-1">
            <button
              onClick={decrement}
              aria-label={lang === 'ru' ? 'Уменьшить' : lang === 'uz' ? 'Kamaytirish' : 'Decrease'}
              className="lux-chip lux-chip-static flex h-10 w-12 items-center justify-center rounded-full transition-transform active:scale-95"
            >
              <Minus size={17} />
            </button>
            {soldByWeight ? (
              <label className="flex min-w-[84px] items-center justify-center gap-1">
                <input
                  type="number"
                  min={menuQuantityStep(quantitySource)}
                  step={menuQuantityStep(quantitySource)}
                  value={item.quantity}
                  disabled={unavailable}
                  onChange={event => dispatch({
                    type: 'UPDATE_CART_QTY',
                    payload: { cart_item_key: cartItemKey, qty: normalizeMenuQuantity(event.target.value, quantitySource) },
                  })}
                  className="lux-title w-14 bg-transparent text-center text-[16px] font-semibold leading-none tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={lang === 'ru' ? 'Вес (кг)' : lang === 'uz' ? 'Og‘irligi (kg)' : 'Weight (kg)'}
                />
                <span className="lux-muted text-[11px] font-semibold">kg</span>
              </label>
            ) : (
              <span className="lux-title min-w-[22px] text-center text-[16px] font-semibold leading-none tabular-nums">
                {formatMenuQuantity(item.quantity, quantitySource)}
              </span>
            )}
            <button
              onClick={increment}
              disabled={unavailable}
              aria-label={lang === 'ru' ? 'Добавить' : lang === 'uz' ? "Qo'shish" : 'Increase'}
              className="lux-primary flex h-10 w-12 items-center justify-center rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={17} />
            </button>
          </div>
          <span className="lux-title text-[15px] font-semibold tabular-nums">
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>

        {/* Order note */}
        <div className="lux-input mt-2 rounded-2xl">
          <textarea
            rows={1}
            placeholder={t(lang, 'notes') || (lang === 'uz' ? 'Izoh...' : lang === 'ru' ? 'Заметка...' : 'Notes (optional)')}
            value={notesValue}
            onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { cart_item_key: cartItemKey, notes: e.target.value } })}
            className="block min-h-[36px] w-full resize-y bg-transparent px-3 py-2 text-[12px] leading-5 outline-none"
          />
        </div>
      </div>
    </div>
  )
}

// ── Cart panel ─────────────────────────────────────────────────────────────────
export default function CartPanel({
  tableName,
  orderType,
  onOrderTypeChange,
  onClose,
  priceMode = DEFAULT_PRICE_MODE,
  allowOrderTypeChange = true,
  showOrderBadges = true,
  isSending = false,
  onSendingChange,
  onSubmitSuccess,
  lang: langProp,
  guestMode = false,
  onGuestFinish,
  reviewWarning = '',
  reviewKey = '',
  hasSubmittedItems = false,
}) {
  const { state, dispatch, pendingKitchenSubmission } = useApp()
  const lang    = langProp || state.lang
  const cart    = state.cart
  const normalizedPriceMode = normalizePriceMode(priceMode)
  const [message, setMessage] = useState(null)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const hasPendingSubmission = !guestMode && !!pendingKitchenSubmission
  const cartIsLocked = isSending || hasPendingSubmission

  useEffect(() => {
    setReviewConfirmed(false)
  }, [reviewWarning, reviewKey])

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(i => { map[i.id] = i })
    return map
  }, [state.menuItems])
  const unavailableCartItems = useMemo(
    () => cart.filter(item => {
      const menuItem = menuItemMap[item.menu_item_id]
      return !isMenuItemOrderable(menuItem)
    }),
    [cart, menuItemMap]
  )
  const hasUnavailableCartItems = unavailableCartItems.length > 0
  const unavailableCartMessage = lang === 'uz'
    ? 'Mavjud bo‘lmagan taomlarni savatdan olib tashlang. Ularni buyurtmaga yuborib bo‘lmaydi.'
    : lang === 'ru'
      ? 'Удалите недоступные блюда из корзины. Их нельзя отправить в заказ.'
      : 'Remove unavailable meals from the cart. They cannot be submitted with the order.'

  const configuredServiceRatePct = getConfiguredServiceRatePct(state.settings, normalizedPriceMode)
  const serviceRatePct = isOffPremiseOrderType(orderType) ? 0 : configuredServiceRatePct
  const payment = getOrderPaymentSummary({ order_type: orderType, service_rate_pct: serviceRatePct }, cart, configuredServiceRatePct)
  const subtotal  = payment.subtotal
  const service   = payment.serviceFee
  const total     = payment.total
  const itemCount = cart.length

  async function handleSend() {
    if ((cart.length === 0 && !hasPendingSubmission) || isSending) return
    if (!hasPendingSubmission && reviewWarning && !reviewConfirmed) return
    if (!hasPendingSubmission && hasUnavailableCartItems) {
      setMessage({ tone: 'error', text: unavailableCartMessage })
      return
    }
    setMessage(null)
    onSendingChange?.(true)
    const submittedAt = pendingKitchenSubmission?._submittedAt || new Date().toISOString()
    const kitchenRoundId = pendingKitchenSubmission?._kitchenRoundId || `round-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`
    const submitAction = pendingKitchenSubmission || {
      type: 'SEND_TO_KITCHEN',
      payload: { orderType, priceMode: normalizedPriceMode },
      _kitchenRoundId: kitchenRoundId,
      _submittedAt: submittedAt,
    }
    try {
      const result = await dispatch(submitAction)
      if (result?.error) {
        setMessage({
          tone: 'error',
          error: result.error,
        })
        return
      }
      const completedAction = result?.action || submitAction
      setMessage({
        tone: 'success',
        text: lang === 'uz'
          ? 'Buyurtma yuborildi.'
          : lang === 'ru'
            ? 'Заказ отправлен.'
            : 'Order submitted.',
      })
      onSubmitSuccess?.({
        orderId: completedAction._orderId,
        kitchenRoundId: completedAction._kitchenRoundId || kitchenRoundId,
        submittedAt: completedAction._submittedAt || submittedAt,
        orderType: completedAction.payload?.orderType || orderType,
      })
      onClose?.()
    } finally {
      onSendingChange?.(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="lux-line flex-shrink-0 border-b px-4 pb-3 pt-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {onClose && (
              <button
                onClick={onClose}
                disabled={cartIsLocked}
                aria-label={lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close'}
                className="lux-chip lux-chip-static flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full disabled:cursor-wait disabled:opacity-50"
              >
                <X size={17} />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="zk-serif lux-title text-[24px] font-semibold leading-none">{tableName}</p>
                {showOrderBadges && (
                  <>
                    {orderType && (
                      <span className="lux-soft lux-gold flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                        {orderTypeLabel(orderType, lang)}
                      </span>
                    )}
                    <span className="lux-soft lux-gold flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      {getPriceModeLabel(normalizedPriceMode, lang)}
                    </span>
                  </>
                )}
              </div>
              <p className="lux-muted mt-1 text-[12px]">
                {itemCount > 0
                  ? `${itemCount} ${lang === 'uz' ? 'ta mahsulot' : lang === 'ru' ? 'позиций' : 'items'}`
                  : hasSubmittedItems
                    ? (lang === 'uz' ? "Yangi mahsulotlar yo'q" : lang === 'ru' ? 'Нет новых позиций' : 'No new items yet')
                  : lang === 'uz' ? "Buyurtma yo'q" : lang === 'ru' ? 'Нет позиций' : 'No items yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Order type tabs */}
        {allowOrderTypeChange && (
          <div className="lux-soft mt-3 flex gap-1 rounded-full p-1">
            {ORDER_TYPES.map(ot => (
              <button
                key={ot.key}
                onClick={() => onOrderTypeChange?.(ot.key)}
                disabled={cartIsLocked}
                className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-all ${
                  orderType === ot.key ? 'lux-primary' : 'lux-muted'
                }`}
              >
                {ot[lang] || ot.en}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Cart items ─────────────────────────────────────────────────────── */}
      <div className="lux-no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 select-none">
            <div className="lux-soft mb-3 flex h-16 w-16 items-center justify-center rounded-full">
              <ShoppingCart size={24} strokeWidth={1.5} className="lux-gold" />
            </div>
            <p className="zk-serif lux-title text-[20px] font-semibold">
              {hasSubmittedItems
                ? (lang === 'uz' ? "Yangi mahsulotlar yo'q" : lang === 'ru' ? 'Нет новых позиций' : 'No new items')
                : (lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty')}
            </p>
            <p className="lux-muted mt-1 text-[12px]">
              {hasSubmittedItems
                ? (lang === 'uz' ? "Keyingi buyurtmaga taom qo'shing" : lang === 'ru' ? 'Добавьте блюда в следующий заказ' : 'Add items for the next order batch')
                : (lang === 'uz' ? "Menyudan taom qo'shing" : lang === 'ru' ? 'Добавьте блюда из меню' : 'Add items from the menu')}
            </p>
          </div>
        ) : (
          cart.map(item => (
            <CartItemRow
              key={getCartItemKey(item)}
              item={item}
              lang={lang}
              dispatch={cartIsLocked ? () => {} : dispatch}
              menuItem={menuItemMap[item.menu_item_id]}
            />
          ))
        )}
      </div>

      {/* ── Summary + Send button ──────────────────────────────────────────── */}
      <div className="lux-line flex-shrink-0 border-t px-4 pb-5 pt-4">
        {hasPendingSubmission && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-5 text-amber-900">
            {lang === 'uz'
              ? 'Oldingi yuborish natijasi tasdiqlanmadi. Xuddi shu buyurtmani xavfsiz tekshirish uchun qayta urinib ko‘ring.'
              : lang === 'ru'
                ? 'Результат прошлой отправки не подтверждён. Повторите попытку — будет проверен тот же заказ без дублирования.'
                : 'The previous send was not confirmed. Retry safely to check the same order without duplicating it.'}
          </div>
        )}
        {reviewWarning && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-5 text-amber-900">
            <p>{reviewWarning}</p>
            <button
              type="button"
              onClick={() => setReviewConfirmed(true)}
              disabled={reviewConfirmed || cartIsLocked}
              className={`mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg px-3 text-[11px] font-black transition-colors ${
                reviewConfirmed
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-900 text-white hover:bg-amber-950'
              }`}
            >
              {reviewConfirmed
                ? (lang === 'uz' ? 'Tekshirildi' : lang === 'ru' ? 'Проверено' : 'Reviewed')
                : (lang === 'uz' ? 'Stol va tanlovni tekshirdim' : lang === 'ru' ? 'Я проверил стол и выбор' : 'I reviewed the table and selection')}
            </button>
          </div>
        )}
        {hasUnavailableCartItems && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
            {unavailableCartMessage}
          </div>
        )}
        {message && (
          <div className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-bold ${
            message.tone === 'error'
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-green-50 text-green-700 border border-green-100'
          }`}>
            {message.error ? formatWriteError(message.error, lang, 'SEND_TO_KITCHEN') : message.text}
          </div>
        )}

        {cart.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-[13px]">
              <span className="lux-muted">
                {lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Order amount'}
              </span>
              <span className="lux-title font-medium tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="lux-muted">
                {lang === 'uz' ? `Xizmat (${serviceRatePct}%)` : lang === 'ru' ? `Сервис (${serviceRatePct}%)` : `Service (${serviceRatePct}%)`}
              </span>
              <span className="lux-title font-medium tabular-nums">{formatCurrency(service)}</span>
            </div>
            <div className="lux-line flex items-baseline justify-between border-t border-dashed pt-3">
              <span className="zk-serif lux-title text-[19px] font-semibold">
                {lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total to pay'}
              </span>
              <span className="lux-title text-[22px] font-semibold leading-none tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        {guestMode && cart.length > 0 && !hasUnavailableCartItems && (
          <p className="lux-muted mb-3 text-center text-[12px] leading-5">
            {lang === 'uz'
              ? 'Ofitsiant tanlovni tekshiradi va oshxonaga yuboradi.'
              : lang === 'ru'
                ? 'Официант проверит выбор и отправит его на кухню.'
                : 'A waiter will review and send this selection to the kitchen.'}
          </p>
        )}

        <button
          onClick={guestMode ? onGuestFinish : handleSend}
          disabled={isSending || (!hasPendingSubmission && (cart.length === 0 || hasUnavailableCartItems || (!!reviewWarning && !reviewConfirmed)))}
          className={`flex w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-all active:scale-[0.98] ${
            hasPendingSubmission && !isSending
              ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-200'
              : cart.length > 0 && !isSending && !hasUnavailableCartItems && (!reviewWarning || reviewConfirmed)
              ? 'lux-primary'
              : cart.length > 0 && isSending
                ? 'lux-primary cursor-wait opacity-80'
                : 'lux-soft lux-muted cursor-not-allowed'
          }`}
          style={{ height: '52px' }}
        >
          {guestMode
            ? <CheckCircle2 size={17} />
            : isSending ? <Loader2 size={17} className="animate-spin" /> : <UtensilsCrossed size={17} />}
          {guestMode
            ? hasUnavailableCartItems
              ? (lang === 'uz' ? 'Mavjud bo‘lmagan taomni olib tashlang' : lang === 'ru' ? 'Удалите недоступное блюдо' : 'Remove unavailable meal')
              : (lang === 'uz' ? 'Tanlovni yakunlash' : lang === 'ru' ? 'Завершить выбор' : 'Finish selection')
            : reviewWarning && !reviewConfirmed
              ? (lang === 'uz' ? 'Avval tekshiruvni tasdiqlang' : lang === 'ru' ? 'Сначала подтвердите проверку' : 'Confirm the review first')
            : isSending
            ? (lang === 'uz' ? 'Yuborilmoqda...' : lang === 'ru' ? 'Отправка...' : 'Sending...')
            : hasPendingSubmission
              ? (lang === 'uz' ? 'Yuborishni qayta tekshirish' : lang === 'ru' ? 'Повторить отправку' : 'Retry submission')
            : hasUnavailableCartItems
              ? (lang === 'uz' ? 'Mavjud bo‘lmagan taomni olib tashlang' : lang === 'ru' ? 'Удалите недоступное блюдо' : 'Remove unavailable meal')
              : (lang === 'uz' ? 'Buyurtmani yuborish' : lang === 'ru' ? 'Отправить заказ' : 'Submit order')}
        </button>
      </div>
    </div>
  )
}

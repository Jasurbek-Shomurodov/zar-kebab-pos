import React, { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, LockKeyhole, ShieldCheck, ShoppingCart } from 'lucide-react'
import { GUEST_MODE_PIN_LENGTH, LEGACY_GUEST_MODE_PIN_LENGTH, normalizeGuestModePin } from '../lib/guestMode'
import { PRICE_MODE_REGULAR, PRICE_MODE_TOURIST } from '../lib/priceModes'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from './LanguageSwitcher'

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function modalFocusableElements(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
}

function focusWithoutScrolling(element) {
  if (!element?.focus) return
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

function blockNonNumericPinKey(event) {
  if (event.ctrlKey || event.metaKey) return
  if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault()
}

function blockNonNumericPinInput(event) {
  if (typeof event.data === 'string' && /\D/.test(event.data)) event.preventDefault()
}

function useModalKeyboard({ dialogRef, initialFocusRef, onEscape }) {
  const previousFocusRef = useRef(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const preferredTarget = initialFocusRef?.current
      const target = preferredTarget && !preferredTarget.disabled
        ? preferredTarget
        : modalFocusableElements(dialog)[0] || dialog
      focusWithoutScrolling(target)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected) focusWithoutScrolling(previousFocus)
    }
  }, [dialogRef, initialFocusRef])

  return event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onEscapeRef.current?.()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    const focusable = modalFocusableElements(dialog)
    if (focusable.length === 0) {
      event.preventDefault()
      focusWithoutScrolling(dialog)
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    const activeIsFocusable = focusable.includes(active)
    if (event.shiftKey && (active === first || !activeIsFocusable)) {
      event.preventDefault()
      focusWithoutScrolling(last)
    } else if (!event.shiftKey && (active === last || !activeIsFocusable)) {
      event.preventDefault()
      focusWithoutScrolling(first)
    }
  }
}

export function guestModeCopy(lang = 'en') {
  const copy = {
    uz: {
      handToGuest: 'Mehmonga berish',
      touristMenu: 'Turist menyusi',
      staff: 'Xodim',
      setupEyebrow: 'Mehmon rejimi',
      setupTitle: 'Planshetni qulflash',
      setupBody: '2 xonali vaqtinchalik PIN yarating. Mehmon menyuni ko‘rishi va savatni tayyorlashi mumkin, lekin xodimlar bo‘limiga kira olmaydi.',
      pin: length => `${length} xonali PIN`,
      confirmPin: 'PIN-ni takrorlang',
      pinLength: length => `${length} ta raqam kiriting.`,
      pinMismatch: 'PIN kodlari mos kelmadi.',
      activate: 'Qulflash va mehmonga berish',
      cancel: 'Bekor qilish',
      unlockTitle: 'Xodim kirishi',
      unlockBody: 'Mehmon rejimidan chiqish uchun shu topshirishda yaratilgan PIN-ni kiriting.',
      unlock: 'Qulfni ochish',
      wrongPin: 'PIN noto‘g‘ri. Qayta urinib ko‘ring.',
      locked: seconds => `Juda ko‘p urinish. ${seconds} soniyadan keyin qayta urinib ko‘ring.`,
      readyTitle: 'Tanlovingiz tayyor',
      readyBody: 'Planshetni ofitsiantga qaytaring. Buyurtma hali oshxonaga yuborilmadi.',
      continue: 'Tanlashni davom ettirish',
      items: count => `${count} ta mahsulot`,
      emptyCart: 'Avval menyudan taom tanlang.',
      entryEyebrow: 'Stolga kirish',
      entryTitle: tableName => `${tableName || 'Stol'} ni ochish`,
      entryBody: 'R yoki T narx turini tanlab stolga kiring.',
      pricingTitle: 'Variant',
      regularPrice: 'Oddiy',
      touristPrice: 'Turist',
      priceModeRequired: 'R yoki T-ni tanlang.',
      pricingLocked: 'Bu stolda faol buyurtma bor. Tanlangan variantni o‘zgartirib bo‘lmaydi.',
      entryActivate: 'Stolga kirish',
    },
    ru: {
      handToGuest: 'Передать гостю',
      touristMenu: 'Туристическое меню',
      staff: 'Сотрудник',
      setupEyebrow: 'Гостевой режим',
      setupTitle: 'Заблокировать планшет',
      setupBody: 'Создайте временный PIN из 2 цифр. Гость сможет смотреть меню и собирать корзину, но не получит доступ к функциям персонала.',
      pin: length => `PIN из ${length} цифр`,
      confirmPin: 'Повторите PIN',
      pinLength: length => `Введите ${length} цифры.`,
      pinMismatch: 'PIN-коды не совпадают.',
      activate: 'Заблокировать и передать гостю',
      cancel: 'Отмена',
      unlockTitle: 'Доступ для сотрудника',
      unlockBody: 'Введите PIN, созданный при передаче планшета, чтобы выйти из гостевого режима.',
      unlock: 'Разблокировать',
      wrongPin: 'Неверный PIN. Попробуйте ещё раз.',
      locked: seconds => `Слишком много попыток. Повторите через ${seconds} сек.`,
      readyTitle: 'Ваш выбор готов',
      readyBody: 'Верните планшет официанту. Заказ ещё не отправлен на кухню.',
      continue: 'Продолжить выбор',
      items: count => `${count} поз.`,
      emptyCart: 'Сначала выберите блюда из меню.',
      entryEyebrow: 'Открытие стола',
      entryTitle: tableName => `Открыть ${tableName || 'стол'}`,
      entryBody: 'Выберите тип цены R или T и войдите в стол.',
      pricingTitle: 'Вариант',
      regularPrice: 'Обычное',
      touristPrice: 'Турист',
      priceModeRequired: 'Выберите R или T.',
      pricingLocked: 'У стола уже есть активный заказ. Выбранный вариант изменить нельзя.',
      entryActivate: 'Войти в стол',
    },
    en: {
      handToGuest: 'Hand to guest',
      touristMenu: 'Tourist menu',
      staff: 'Staff',
      setupEyebrow: 'Guest mode',
      setupTitle: 'Lock this tablet',
      setupBody: 'Create a temporary 2-digit PIN. The guest can browse and build a cart, but cannot access staff controls.',
      pin: length => `${length}-digit PIN`,
      confirmPin: 'Confirm PIN',
      pinLength: length => `Enter exactly ${length} digits.`,
      pinMismatch: 'The PINs do not match.',
      activate: 'Lock and hand to guest',
      cancel: 'Cancel',
      unlockTitle: 'Staff access',
      unlockBody: 'Enter the PIN created for this handoff to leave Guest mode.',
      unlock: 'Unlock',
      wrongPin: 'Incorrect PIN. Please try again.',
      locked: seconds => `Too many attempts. Try again in ${seconds} seconds.`,
      readyTitle: 'Your selection is ready',
      readyBody: 'Please return the tablet to a waiter. Nothing has been sent to the kitchen yet.',
      continue: 'Continue ordering',
      items: count => `${count} items`,
      emptyCart: 'Choose something from the menu first.',
      entryEyebrow: 'Table access',
      entryTitle: tableName => `Open ${tableName || 'table'}`,
      entryBody: 'Choose the R or T price type and enter the table.',
      pricingTitle: 'Option',
      regularPrice: 'Regular',
      touristPrice: 'Tourist',
      priceModeRequired: 'Choose R or T.',
      pricingLocked: 'This table has an active order. Its selected option cannot be changed.',
      entryActivate: 'Enter table',
    },
  }
  return copy[lang] || copy.en
}

export function GuestModeUtilities({
  lang = 'en',
  staffLang = lang,
  onLanguageChange,
  onStaffAccess,
  compact = false,
}) {
  const staffCopy = guestModeCopy(staffLang)

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <LanguageSwitcher value={lang} onChange={onLanguageChange} />
      <button
        type="button"
        onClick={onStaffAccess}
        aria-label={staffCopy.staff}
        title={staffCopy.staff}
        className={`inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-[11px] font-black text-[#6B7280] shadow-sm transition-colors hover:border-orange-200 hover:text-[#ff5a00] ${
          compact ? 'w-9 px-0 sm:w-auto sm:px-3' : 'px-3'
        }`}
      >
        <LockKeyhole size={14} />
        <span className={compact ? 'hidden sm:inline' : ''}>{staffCopy.staff}</span>
      </button>
    </div>
  )
}

export function GuestPinDialog({ mode = 'setup', lang = 'en', pinLength = GUEST_MODE_PIN_LENGTH, busy = false, error = '', lockSeconds = 0, onCancel, onSubmit, onInput }) {
  const l = guestModeCopy(lang)
  const expectedPinLength = Number(pinLength) === LEGACY_GUEST_MODE_PIN_LENGTH
    ? LEGACY_GUEST_MODE_PIN_LENGTH
    : GUEST_MODE_PIN_LENGTH
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [validationError, setValidationError] = useState('')
  const pinInputRef = useRef(null)
  const confirmPinInputRef = useRef(null)
  const submitRequestRef = useRef(false)
  const dialogRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const setup = mode === 'setup'
  const handleModalKeyDown = useModalKeyboard({
    dialogRef,
    initialFocusRef: pinInputRef,
    onEscape: () => { if (!busy) onCancel?.() },
  })

  useEffect(() => {
    setPin('')
    setConfirmPin('')
    setValidationError('')
  }, [mode, expectedPinLength])

  useEffect(() => {
    if (setup || (!error && lockSeconds <= 0)) return
    setPin('')
    setValidationError('')
    requestAnimationFrame(() => pinInputRef.current?.focus())
  }, [setup, error, lockSeconds > 0])

  function changePin(value) {
    const nextPin = normalizeGuestModePin(value, expectedPinLength)
    setPin(nextPin)
    setValidationError('')
    onInput?.()
    if (setup && nextPin.length === expectedPinLength) {
      focusWithoutScrolling(confirmPinInputRef.current)
    } else if (!setup && lockSeconds <= 0 && nextPin.length === expectedPinLength) {
      submitPin(nextPin)
    }
  }

  function changeConfirmPin(value) {
    const nextConfirmPin = normalizeGuestModePin(value, expectedPinLength)
    setConfirmPin(nextConfirmPin)
    setValidationError('')
    onInput?.()
    if (
      setup &&
      !busy &&
      pin.length === expectedPinLength &&
      nextConfirmPin.length === expectedPinLength &&
      nextConfirmPin === pin
    ) {
      submitPin(pin)
    }
  }

  function moveToConfirmPin(event) {
    blockNonNumericPinKey(event)
    if (event.defaultPrevented) return
    if (!setup || event.key !== 'Enter') return
    event.preventDefault()
    focusWithoutScrolling(confirmPinInputRef.current)
  }

  function submit(event) {
    event.preventDefault()
    if (pin.length !== expectedPinLength) {
      setValidationError(l.pinLength(expectedPinLength))
      return
    }
    if (setup && pin !== confirmPin) {
      setValidationError(l.pinMismatch)
      return
    }
    setValidationError('')
    submitPin(pin)
  }

  async function submitPin(value) {
    if (busy || lockSeconds > 0 || submitRequestRef.current) return
    submitRequestRef.current = true
    try {
      await onSubmit?.(value)
    } finally {
      submitRequestRef.current = false
    }
  }

  const visibleError = lockSeconds > 0 ? l.locked(lockSeconds) : validationError || error

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-4 backdrop-blur-sm sm:items-center">
      <form
        ref={dialogRef}
        onSubmit={submit}
        onKeyDown={handleModalKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${visibleError ? ` ${errorId}` : ''}`}
        tabIndex={-1}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[420px] overflow-y-auto rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00]">
          {setup ? <ShieldCheck size={24} /> : <LockKeyhole size={23} />}
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">{setup ? l.setupEyebrow : l.staff}</p>
        <h2 id={titleId} className="mt-1 text-2xl font-black text-[#1F2937]">{setup ? l.setupTitle : l.unlockTitle}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#6B7280]">{setup ? l.setupBody : l.unlockBody}</p>

        <div className="mt-5 space-y-3">
          <input
            ref={pinInputRef}
            autoFocus
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={expectedPinLength}
            enterKeyHint={setup ? 'next' : 'done'}
            autoComplete="new-password"
            aria-label={l.pin(expectedPinLength)}
            placeholder={l.pin(expectedPinLength)}
            value={pin}
            onChange={event => changePin(event.target.value)}
            onBeforeInput={blockNonNumericPinInput}
            onKeyDown={moveToConfirmPin}
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy || lockSeconds > 0}
            className="h-[52px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-center text-xl font-black tracking-[0.45em] text-[#1F2937] outline-none transition focus:border-[#ff5a00] focus:ring-4 focus:ring-orange-100 disabled:opacity-60"
          />
          {setup && (
            <input
              ref={confirmPinInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={expectedPinLength}
              enterKeyHint="done"
              autoComplete="new-password"
              aria-label={l.confirmPin}
              placeholder={l.confirmPin}
              value={confirmPin}
              onChange={event => changeConfirmPin(event.target.value)}
              onBeforeInput={blockNonNumericPinInput}
              onKeyDown={blockNonNumericPinKey}
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              className="h-[52px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 text-center text-xl font-black tracking-[0.45em] text-[#1F2937] outline-none transition focus:border-[#ff5a00] focus:ring-4 focus:ring-orange-100 disabled:opacity-60"
            />
          )}
        </div>

        {visibleError && (
          <p id={errorId} role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">{visibleError}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="h-12 flex-1 rounded-xl border border-[#E5E7EB] bg-white text-sm font-black text-[#6B7280] hover:bg-gray-50 disabled:opacity-50">
            {l.cancel}
          </button>
          <button type="submit" disabled={busy || lockSeconds > 0} className="h-12 flex-[1.45] rounded-xl bg-[#ff5a00] px-3 text-sm font-black text-white shadow-lg shadow-orange-100 hover:bg-[#e64d00] disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? '…' : setup ? l.activate : l.unlock}
          </button>
        </div>
      </form>
    </div>
  )
}

export function TableGuestEntryDialog({
  tableName = '',
  lang = 'en',
  priceMode = '',
  onPriceModeChange,
  priceModeLocked = false,
  touristMenuEnabled = true,
  busy = false,
  error = '',
  onCancel,
  onSubmit,
}) {
  const l = guestModeCopy(lang)
  const [validationError, setValidationError] = useState('')
  const dialogRef = useRef(null)
  const regularModeRef = useRef(null)
  const submitRequestRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const pricingTitleId = useId()
  const pricingLockedId = useId()
  const errorId = useId()
  const validPriceMode = priceMode === PRICE_MODE_REGULAR || priceMode === PRICE_MODE_TOURIST
  const handleModalKeyDown = useModalKeyboard({
    dialogRef,
    initialFocusRef: regularModeRef,
    onEscape: () => { if (!busy) onCancel?.() },
  })

  useEffect(() => {
    setValidationError('')
  }, [tableName])

  function selectPriceMode(nextMode) {
    if (busy || priceModeLocked) return
    setValidationError('')
    onPriceModeChange?.(nextMode)
  }

  function submit(event) {
    event.preventDefault()
    if (!validPriceMode) {
      setValidationError(l.priceModeRequired)
      focusWithoutScrolling(regularModeRef.current)
      return
    }
    setValidationError('')
    submitSelection()
  }

  async function submitSelection() {
    if (busy || submitRequestRef.current) return
    submitRequestRef.current = true
    try {
      await onSubmit?.()
    } finally {
      submitRequestRef.current = false
    }
  }

  const visibleError = validationError || error
  const modeChoices = [
    { value: PRICE_MODE_REGULAR, label: l.regularPrice, shortLabel: 'R' },
    { value: PRICE_MODE_TOURIST, label: l.touristPrice, shortLabel: 'T' },
  ].filter(choice => touristMenuEnabled || priceModeLocked || choice.value !== PRICE_MODE_TOURIST)

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-4 backdrop-blur-sm sm:items-center">
      <form
        ref={dialogRef}
        onSubmit={submit}
        onKeyDown={handleModalKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${visibleError ? ` ${errorId}` : ''}`}
        tabIndex={-1}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-y-auto rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00]">
          <ShieldCheck size={24} />
        </div>
        <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a00]">{l.entryEyebrow}</p>
        <h2 id={titleId} className="mt-1 text-2xl font-black text-[#1F2937]">{l.entryTitle(tableName)}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#6B7280]">{l.entryBody}</p>

        <fieldset className="mt-5" disabled={busy || priceModeLocked} aria-describedby={priceModeLocked ? pricingLockedId : undefined}>
          <legend id={pricingTitleId} className="mb-2 text-[12px] font-black uppercase tracking-wide text-[#1F2937]">{l.pricingTitle}</legend>
          <div className="grid grid-cols-2 gap-2">
            {modeChoices.map((choice, index) => {
              const selected = priceMode === choice.value
              return (
                <label
                  key={choice.value}
                  className={`relative flex h-14 items-center justify-center gap-3 rounded-2xl border px-4 transition focus-within:ring-4 focus-within:ring-orange-100 ${
                    selected
                      ? 'border-[#ff5a00] bg-orange-50 text-[#1F2937]'
                      : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
                  } ${busy || priceModeLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:border-orange-200 hover:bg-orange-50/50'}`}
                >
                  <input
                    ref={index === 0 ? regularModeRef : undefined}
                    type="radio"
                    name="table-price-mode"
                    value={choice.value}
                    checked={selected}
                    aria-label={choice.label}
                    onChange={() => selectPriceMode(choice.value)}
                    disabled={busy || priceModeLocked}
                    className="h-4 w-4 flex-shrink-0 accent-[#ff5a00]"
                  />
                  <span aria-hidden="true" className="text-lg font-black">{choice.shortLabel}</span>
                </label>
              )
            })}
          </div>
          {priceModeLocked && (
            <p id={pricingLockedId} className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
              {l.pricingLocked}
            </p>
          )}
        </fieldset>

        {visibleError && (
          <p id={errorId} role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700">{visibleError}</p>
        )}

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="h-12 flex-1 rounded-xl border border-[#E5E7EB] bg-white text-sm font-black text-[#6B7280] hover:bg-gray-50 disabled:opacity-50">
            {l.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || !validPriceMode}
            className="h-12 flex-[1.65] rounded-xl bg-[#ff5a00] px-3 text-sm font-black text-white shadow-lg shadow-orange-100 hover:bg-[#e64d00] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '…' : l.entryActivate}
          </button>
        </div>
      </form>
    </div>
  )
}

export function GuestSelectionReady({ lang = 'en', staffLang = lang, itemCount = 0, total = 0, onContinue, onStaffAccess, onLanguageChange }) {
  const l = guestModeCopy(lang)
  const staffCopy = guestModeCopy(staffLang)
  const dialogRef = useRef(null)
  const staffButtonRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const handleModalKeyDown = useModalKeyboard({
    dialogRef,
    initialFocusRef: staffButtonRef,
    onEscape: onContinue,
  })

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[#FAF7F0] px-5 py-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
        className="my-auto w-full max-w-[520px] rounded-[32px] border border-green-100 bg-white p-5 text-center shadow-2xl sm:p-9"
      >
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher value={lang} onChange={onLanguageChange} />
        </div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 ring-8 ring-green-50/60 sm:h-20 sm:w-20">
          <CheckCircle2 size={34} className="sm:h-[38px] sm:w-[38px]" />
        </div>
        <h2 id={titleId} className="mt-4 text-2xl font-black text-[#1F2937] sm:mt-6 sm:text-3xl">{l.readyTitle}</h2>
        <p id={descriptionId} className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#6B7280]">{l.readyBody}</p>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#F9FAFB] px-4 py-3 text-left ring-1 ring-[#E5E7EB] sm:mt-6">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[#6B7280]"><ShoppingCart size={17} />{l.items(itemCount)}</span>
          <span className="whitespace-nowrap text-lg font-black text-[#ff5a00]">{formatCurrency(total)}</span>
        </div>
        <button ref={staffButtonRef} type="button" onClick={onStaffAccess} className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-black text-white shadow-lg shadow-slate-200 transition-colors hover:bg-black">
          <LockKeyhole size={16} /> {staffCopy.unlockTitle}
        </button>
        <button type="button" onClick={onContinue} className="mt-3 h-12 w-full rounded-xl border border-orange-200 bg-white text-sm font-black text-[#ff5a00] transition-colors hover:bg-orange-50">
          {l.continue}
        </button>
      </div>
    </div>
  )
}

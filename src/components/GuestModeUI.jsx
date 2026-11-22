import React, { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, Loader2, LockKeyhole, ShoppingCart } from 'lucide-react'
import { GUEST_MODE_PIN_LENGTH, LEGACY_GUEST_MODE_PIN_LENGTH, normalizeGuestModePin } from '../lib/guestMode'
import { PRICE_MODE_REGULAR, PRICE_MODE_TOURIST } from '../lib/priceModes'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from './LanguageSwitcher'
import WorkspaceDialog from './WorkspaceDialog'
import { focusWithoutScrolling, useModalKeyboard } from '../lib/modalKeyboard'

function blockNonNumericPinKey(event) {
  if (event.ctrlKey || event.metaKey) return
  if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault()
}

function blockNonNumericPinInput(event) {
  if (typeof event.data === 'string' && /\D/.test(event.data)) event.preventDefault()
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
        className={`inline-flex h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#4B5563] shadow-sm transition-colors hover:border-orange-200 hover:text-[#bf4300] ${
          compact ? 'w-11 px-0 sm:w-auto sm:px-3' : 'px-3'
        }`}
      >
        <LockKeyhole size={15} aria-hidden="true" />
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
  const setup = mode === 'setup'

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
  const pinInputClass = 'ws-input !h-[52px] text-center !text-xl font-semibold tracking-[0.45em] tabular-nums'

  // WorkspaceDialog pins the title and the buttons and scrolls only the fields, so the
  // primary action stays in view on a landscape phone and with the keyboard up.
  return (
    <WorkspaceDialog
      as="form"
      panelProps={{ onSubmit: submit }}
      size="sm"
      title={setup ? l.setupTitle : l.unlockTitle}
      description={setup ? l.setupBody : l.unlockBody}
      onClose={onCancel}
      closeLabel={l.cancel}
      busy={busy}
      initialFocusRef={pinInputRef}
      notice={visibleError ? (
        <p role="alert" className="ws-notice ws-tone-negative text-center">{visibleError}</p>
      ) : null}
      footer={(
        <>
          <button type="button" onClick={onCancel} disabled={busy} className="ws-btn ws-btn-outline">
            {l.cancel}
          </button>
          <button type="submit" disabled={busy || lockSeconds > 0} aria-busy={busy || undefined} className="ws-btn ws-btn-primary min-w-0 flex-1 !whitespace-normal text-center leading-tight">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {setup ? l.activate : l.unlock}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <input
          ref={pinInputRef}
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
          aria-invalid={visibleError ? true : undefined}
          className={pinInputClass}
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
            className={pinInputClass}
          />
        )}
      </div>
    </WorkspaceDialog>
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
  const regularModeRef = useRef(null)
  const submitRequestRef = useRef(false)
  const pricingTitleId = useId()
  const pricingLockedId = useId()
  const validPriceMode = priceMode === PRICE_MODE_REGULAR || priceMode === PRICE_MODE_TOURIST

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

  // WorkspaceDialog pins the title and the buttons, so "Enter table" stays in view at 667x375.
  return (
    <WorkspaceDialog
      as="form"
      panelProps={{ onSubmit: submit }}
      size="md"
      title={l.entryTitle(tableName)}
      description={l.entryBody}
      onClose={onCancel}
      closeLabel={l.cancel}
      busy={busy}
      initialFocusRef={regularModeRef}
      notice={visibleError ? (
        <p role="alert" className="ws-notice ws-tone-negative">{visibleError}</p>
      ) : null}
      footer={(
        <>
          <button type="button" onClick={onCancel} disabled={busy} className="ws-btn ws-btn-outline">
            {l.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || !validPriceMode}
            aria-busy={busy || undefined}
            className="ws-btn ws-btn-primary min-w-0 flex-1"
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {l.entryActivate}
          </button>
        </>
      )}
    >
      <fieldset disabled={busy || priceModeLocked} aria-describedby={priceModeLocked ? pricingLockedId : undefined}>
        <legend id={pricingTitleId} className="mb-2 text-sm font-medium text-[#22201d]">{l.pricingTitle}</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
          {modeChoices.map((choice, index) => {
            const selected = priceMode === choice.value
            return (
              <label
                key={choice.value}
                className={`relative flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-[#ff5a00]/40 ${
                  selected
                    ? 'border-[#ff5a00] bg-[#fff1e8] text-[#22201d]'
                    : 'border-[#dcd9d6] bg-white text-[#22201d]'
                } ${busy || priceModeLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-[#ebe8e5]'}`}
              >
                <input
                  ref={index === 0 ? regularModeRef : undefined}
                  type="radio"
                  name="table-price-mode"
                  value={choice.value}
                  checked={selected}
                  onChange={() => selectPriceMode(choice.value)}
                  disabled={busy || priceModeLocked}
                  className="h-5 w-5 flex-shrink-0 accent-[#cc4800]"
                />
                {/* The word carries the meaning; the letter is the shorthand staff already know. */}
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{choice.label}</span>
                <span aria-hidden="true" className="ws-count flex-shrink-0">{choice.shortLabel}</span>
              </label>
            )
          })}
        </div>
        {priceModeLocked && (
          <p id={pricingLockedId} className="ws-notice ws-tone-caution mt-2">
            {l.pricingLocked}
          </p>
        )}
      </fieldset>
    </WorkspaceDialog>
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
    <div className="fixed inset-0 z-overlay flex items-start justify-center overflow-y-auto bg-[#FAF7F0] px-5 py-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
        className="my-auto w-full max-w-[520px] rounded-2xl border border-green-100 bg-white p-5 text-center shadow-2xl outline-none sm:p-9"
      >
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher value={lang} onChange={onLanguageChange} />
        </div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 ring-8 ring-green-50/60 sm:h-20 sm:w-20">
          <CheckCircle2 size={34} className="sm:h-[38px] sm:w-[38px]" aria-hidden="true" />
        </div>
        <h2 id={titleId} className="mt-4 text-2xl font-semibold text-[#1F2937] sm:mt-6 sm:text-3xl">{l.readyTitle}</h2>
        <p id={descriptionId} className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#4B5563]">{l.readyBody}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-[#F9FAFB] px-4 py-3 text-left ring-1 ring-[#E5E7EB] sm:mt-6">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#4B5563]"><ShoppingCart size={17} aria-hidden="true" />{l.items(itemCount)}</span>
          <span className="ml-auto whitespace-nowrap text-lg font-semibold tabular-nums text-[#bf4300]">{formatCurrency(total)}</span>
        </div>
        <button ref={staffButtonRef} type="button" onClick={onStaffAccess} className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1F2937] px-4 text-sm font-semibold text-white shadow-lg shadow-slate-200 transition-colors hover:bg-black">
          <LockKeyhole size={16} aria-hidden="true" /> {staffCopy.unlockTitle}
        </button>
        <button type="button" onClick={onContinue} className="mt-3 h-12 w-full rounded-xl border border-orange-200 bg-white text-sm font-semibold text-[#bf4300] transition-colors hover:bg-orange-50">
          {l.continue}
        </button>
      </div>
    </div>
  )
}

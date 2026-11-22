import { useEffect, useRef } from 'react'

// Keyboard rules every modal surface shares: focus moves in on open and back to
// the opener on close, Tab stays inside, Escape closes. Used by WorkspaceDialog,
// the mobile drawer and the guest dialogs so they cannot drift apart.

export const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function modalFocusableElements(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
}

export function focusWithoutScrolling(element) {
  if (!element?.focus) return
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

/**
 * Where Tab should go next inside a modal, or null to let the browser move focus.
 * Pure so the wrap-around rule is testable without a DOM.
 */
export function nextModalFocusIndex({ count, activeIndex, shiftKey }) {
  if (count <= 0) return -1
  if (shiftKey && (activeIndex <= 0)) return count - 1
  if (!shiftKey && (activeIndex === count - 1 || activeIndex < 0)) return 0
  return null
}

/**
 * @param {{ dialogRef: { current: HTMLElement | null }, initialFocusRef?: { current: HTMLElement | null }, onEscape?: () => void, active?: boolean }} options
 * @returns {(event: KeyboardEvent) => void} an onKeyDown handler for the dialog element
 */
export function useModalKeyboard({ dialogRef, initialFocusRef, onEscape, active = true }) {
  const previousFocusRef = useRef(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active) return undefined
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
  }, [active, dialogRef, initialFocusRef])

  return event => {
    if (event.key === 'Escape') {
      if (!onEscapeRef.current) return
      event.preventDefault()
      event.stopPropagation()
      onEscapeRef.current()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    const focusable = modalFocusableElements(dialog)
    const next = nextModalFocusIndex({
      count: focusable.length,
      activeIndex: focusable.indexOf(document.activeElement),
      shiftKey: event.shiftKey,
    })
    if (next === null) return
    event.preventDefault()
    focusWithoutScrolling(next < 0 ? dialog : focusable[next])
  }
}

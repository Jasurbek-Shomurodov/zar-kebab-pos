import { useCallback, useEffect, useRef, useState } from 'react'

// Some browsers never fire `afterprint` (old iOS Safari, a few embedded webviews). Once
// `print()` has returned, the lock is released after this long so Print cannot stay dead.
export const PRINT_RELEASE_FALLBACK_MS = 4000
export const AUTO_PRINT_DELAY_MS = 600
export const MANUAL_PRINT_DELAY_MS = 300

/**
 * One print at a time. A request made while another is scheduled or on the printer is refused,
 * so a double tap, or a tap during `?print=1`, cannot produce a second ticket.
 * The lock opens on `afterprint` (or the fallback timer when the browser never reports it).
 * Everything that touches the browser is injected, so the rules are testable without one.
 */
export function createPrintController({
  print,
  setTimer,
  clearTimer,
  onAfterPrint,
  onBusyChange = () => {},
  fallbackMs = PRINT_RELEASE_FALLBACK_MS,
}) {
  let busy = false
  let disposed = false
  let startTimer = null
  let fallbackTimer = null

  function setBusy(next) {
    if (busy === next) return
    busy = next
    onBusyChange(next)
  }

  function release() {
    if (fallbackTimer != null) clearTimer(fallbackTimer)
    fallbackTimer = null
    setBusy(false)
  }

  const stopListening = onAfterPrint(() => {
    // An `afterprint` for a print we did not start (Ctrl+P) changes nothing.
    if (!disposed && busy && startTimer == null) release()
  })

  return {
    isBusy: () => busy,
    /** Returns true when this call started a print, false when one is already running. */
    request({ delay = 0, onStart } = {}) {
      if (disposed || busy) return false
      setBusy(true)
      startTimer = setTimer(() => {
        startTimer = null
        if (disposed) return
        try {
          onStart?.()
          print()
        } catch (error) {
          release()
          throw error
        }
        // `print()` blocks in desktop Chrome and returns at once elsewhere; either way the
        // fallback only starts counting after it has returned.
        if (busy) fallbackTimer = setTimer(release, fallbackMs)
      }, Math.max(0, Number(delay) || 0))
      return true
    },
    /** Drops a print that is scheduled but has not reached the printer yet. */
    cancelPending() {
      if (startTimer == null) return false
      clearTimer(startTimer)
      startTimer = null
      release()
      return true
    },
    dispose() {
      if (startTimer != null) clearTimer(startTimer)
      startTimer = null
      release()
      disposed = true
      stopListening?.()
    },
  }
}

/**
 * What a page opened with `?print=1` should do now:
 * - `wait`: the ticket is not ready (still loading, or a print is running);
 * - `print`: start the one automatic print;
 * - `consume`: do not print (something is missing) but drop the flag so a reload cannot print later;
 * - `none`: nothing to do.
 */
export function getAutoPrintAction({ autoPrint, ready, blocked = false, fired = false, busy = false }) {
  if (!autoPrint || fired) return 'none'
  if (blocked) return 'consume'
  if (!ready || busy) return 'wait'
  return 'print'
}

/** The same query string without `print`, so Back, reload or tab restore cannot print again. */
export function stripPrintParam(search) {
  const params = new URLSearchParams(search || '')
  params.delete('print')
  const next = params.toString()
  return next ? `?${next}` : ''
}

/**
 * Print button + `?print=1` for a receipt page.
 * `ready`: the ticket is on screen. `blocked`: it must not print by itself (a round is missing).
 * `onAutoPrintConsumed` runs once, right before the automatic print (or instead of it when
 * blocked): the page strips `print` from its URL there with a replace navigation.
 */
export function usePrintOnce({ autoPrint = false, ready = true, blocked = false, onAutoPrintConsumed } = {}) {
  const [busy, setBusy] = useState(false)
  const controllerRef = useRef(null)
  const firedRef = useRef(false)
  const autoPendingRef = useRef(false)
  const consumedRef = useRef(onAutoPrintConsumed)
  consumedRef.current = onAutoPrintConsumed

  useEffect(() => {
    const controller = createPrintController({
      print: () => window.print(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: id => window.clearTimeout(id),
      onAfterPrint: listener => {
        window.addEventListener('afterprint', listener)
        return () => window.removeEventListener('afterprint', listener)
      },
      onBusyChange: setBusy,
    })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    const action = getAutoPrintAction({ autoPrint, ready, blocked, fired: firedRef.current, busy })
    if (action === 'consume') {
      if (autoPendingRef.current) controllerRef.current?.cancelPending()
      autoPendingRef.current = false
      firedRef.current = true
      consumedRef.current?.()
    } else if (action === 'print') {
      autoPendingRef.current = !!controllerRef.current?.request({
        delay: AUTO_PRINT_DELAY_MS,
        onStart: () => {
          autoPendingRef.current = false
          firedRef.current = true
          consumedRef.current?.()
        },
      })
    } else if (action === 'wait' && !ready && autoPendingRef.current) {
      // The ticket left the screen (a round is being looked up again) before the print started.
      autoPendingRef.current = false
      controllerRef.current?.cancelPending()
    }
  }, [autoPrint, ready, blocked, busy])

  const print = useCallback(
    () => controllerRef.current?.request({ delay: MANUAL_PRINT_DELAY_MS }) ?? false,
    [],
  )

  return { busy, print }
}

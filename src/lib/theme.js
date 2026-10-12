import { useLayoutEffect, useSyncExternalStore } from 'react'

// Staff workspace light/dark theme. The choice is a per-device preference; the
// dark palette lives in src/styles/dark-theme.css and only applies while a staff
// screen is mounted, so the public menu, Telegram menu and printed checks stay light.
export const THEME_KEY = 'zar-theme'

const listeners = new Set()
let scopes = 0

function readTheme() {
  try { return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

let current = typeof window === 'undefined' ? 'light' : readTheme()

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (scopes > 0 && current === 'dark') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

export function setTheme(next) {
  current = next === 'dark' ? 'dark' : 'light'
  try { window.localStorage.setItem(THEME_KEY, current) } catch { /* preference only */ }
  apply()
  listeners.forEach(listener => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current theme plus a toggle; mounting it makes the staff theme active. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => 'light')
  // Layout effect so the dark palette is in place before the first paint.
  useLayoutEffect(() => {
    scopes += 1
    apply()
    return () => {
      scopes -= 1
      apply()
    }
  }, [])
  return { theme, toggleTheme: () => setTheme(current === 'dark' ? 'light' : 'dark') }
}

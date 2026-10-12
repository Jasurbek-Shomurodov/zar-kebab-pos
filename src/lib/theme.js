import { useLayoutEffect, useSyncExternalStore } from 'react'

// Light/dark theme for staff screens and the public zarkebab.uz pages. It follows
// the device's system theme until someone picks one with the toggle, which is then
// saved per device. The dark palette lives in src/styles/dark-theme.css
// and only applies while a themed screen is mounted, so the Telegram menu and
// printed checks stay light.
export const THEME_KEY = 'zar-theme'

const listeners = new Set()
let scopes = 0

const systemDark = typeof window === 'undefined' || !window.matchMedia
  ? null
  : window.matchMedia('(prefers-color-scheme: dark)')

function readSavedTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === 'dark' || saved === 'light' ? saved : null
  } catch { return null }
}

function readTheme() {
  return readSavedTheme() || (systemDark?.matches ? 'dark' : 'light')
}

let current = typeof window === 'undefined' ? 'light' : readTheme()

// Without a saved choice, follow the system theme as it changes (e.g. at sunset).
systemDark?.addEventListener?.('change', () => {
  if (readSavedTheme()) return
  current = readTheme()
  apply()
  listeners.forEach(listener => listener())
})

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

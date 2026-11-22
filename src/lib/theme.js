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

// Browser bar colour per theme (<meta name="theme-color">); dark is the shell
// colour of the dark palette, which index.html also paints before React starts.
const BAR_COLOR = { light: '#ff5a00', dark: '#101412' }

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const dark = scopes > 0 && current === 'dark'
  if (dark) root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  const bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', dark ? BAR_COLOR.dark : BAR_COLOR.light)
}

/**
 * Ends the dark first frame index.html paints for dark-theme devices. Called once
 * the first screen has committed: a themed screen already has the dark palette by
 * then, and a light-only one (printed checks) goes back to light.
 */
export function releaseBootTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('boot-dark')
  apply()
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

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const COARSE_44 = /\[@media\(pointer:coarse\)\]:h-11/

test('one top bar: AppShell renders WorkspaceTopBar and keeps no second copy of the header', () => {
  const shell = source('src/components/AppShell.jsx')
  const bar = source('src/components/WorkspaceTopBar.jsx')

  assert.match(shell, /<WorkspaceTopBar/)
  assert.doesNotMatch(shell, /<header/)
  assert.doesNotMatch(shell, /function PageTabs|function DrawerIcon/)
  for (const slot of ['back=\\{back\\}', 'titleAccessory=\\{titleAccessory\\}', 'tabs=\\{tabs\\}', 'drawerOnDesktop=\\{collapsed\\}']) {
    assert.match(shell, new RegExp(slot), slot)
  }
  // Same header layer on every staff screen, and one tab alignment.
  assert.match(bar, /<header className="relative z-30 flex h-\[60px\]/)
  assert.equal(bar.match(/<PageTabs tabs=\{tabs\} \/>/g).length, 2)
  // The drawer button is named in the user's language, never the English "Toggle Sidebar".
  assert.match(bar, /aria-label=\{drawerLabel \|\| t\(lang, 'openMenu'\)\}/)
  assert.doesNotMatch(shell + bar, /Toggle Sidebar/)
})

test('shell controls are 44px under a finger and keep their desktop size', () => {
  const bar = source('src/components/WorkspaceTopBar.jsx')
  const sidebar = source('src/components/UnifiedSidebar.jsx')
  const toggle = source('src/components/ThemeToggle.jsx')
  const shell = source('src/components/AppShell.jsx')

  assert.match(bar, /TOP_BAR_SQUARE = 'grid h-\[38px\] w-\[38px\][^']*\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11'/)
  assert.match(toggle, /h-\[38px\] w-\[38px\][\s\S]*?\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11/)
  assert.match(sidebar, /const NAV_ROW = `flex h-\[34px\] [^`]*\[@media\(pointer:coarse\)\]:h-11`/)
  assert.match(sidebar, /const SQUARE = `grid h-8 w-8 [^`]*\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11`/)
  // Language buttons in the drawer and in the guest top bar.
  assert.match(sidebar, /h-8 flex-1 rounded-\[9px\][^`]*\[@media\(pointer:coarse\)\]:h-11/)
  assert.match(shell, COARSE_44)
  // Logout is not within 8px of the account row on touch.
  assert.match(sidebar, /gap-1 pt-1\.5 \[@media\(pointer:coarse\)\]:gap-3/)
  // The role chip is small text: the orange ink, not the 2.8:1 brand orange.
  assert.match(sidebar, /bg-\[#fff1e8\][^"]*text-\[#bf4300\]/)
  assert.doesNotMatch(sidebar, /bg-\[#fff1e8\][^"]*text-\[#ff5a00\]/)
})

test('sidebar names its landmark and buttons in the current language and uses the orange focus ring', () => {
  const sidebar = source('src/components/UnifiedSidebar.jsx')

  assert.match(sidebar, /<nav aria-label=\{t\(lang, 'mainNavigation'\)\}/)
  assert.doesNotMatch(sidebar, /<nav aria-label="Zar Kebab"/)
  assert.doesNotMatch(sidebar, /Toggle Sidebar/)
  // The drawer's own button says what it does: close the phone drawer, or collapse the desktop rail.
  assert.match(sidebar, /const hideLabel = onClose \? sl\.closeMenu : sl\.collapse/)
  for (const lang of ['uz', 'ru', 'en']) {
    assert.match(sidebar, new RegExp(`${lang}: \\{ closeMenu: '[^']+', collapse: '[^']+', home: '[^']+' \\}`), lang)
  }
  assert.doesNotMatch(sidebar, /outline-\[#0f766e\]/)
  assert.match(sidebar, /focus-visible:outline-\[#ff5a00\]/)
})

test('sidebar marks the right item on take-away, kitchen check and receipt screens', () => {
  const sidebar = source('src/components/UnifiedSidebar.jsx')
  const body = sidebar.slice(sidebar.indexOf('function activeKey(pathname)'), sidebar.indexOf('// ── Component'))
  const activeKey = new Function(`${body}; return activeKey`)()

  assert.equal(activeKey('/waiter/tables'), 'tables')
  assert.equal(activeKey('/waiter/order/12'), 'tables')
  assert.equal(activeKey('/waiter/take-away'), 'tables')
  assert.equal(activeKey('/kitchen-check/abc'), 'tables')
  assert.equal(activeKey('/cashier/bill/5'), 'cashier')
  assert.equal(activeKey('/receipt/abc'), 'cashier')
  assert.equal(activeKey('/admin'), 'dashboard')
  assert.equal(activeKey('/admin/bazaar'), 'bazaar')
  assert.equal(activeKey('/admin/financial-analysis/owner-profit'), 'owner_profit')
  assert.equal(activeKey('/menu'), '')
})

test('language switcher shows codes without flag emoji and widens on touch', () => {
  const switcher = source('src/components/LanguageSwitcher.jsx')

  assert.doesNotMatch(switcher, /[\u{1F1E6}-\u{1F1FF}]/u)
  assert.doesNotMatch(switcher, /text-\[10px\]|font-black/)
  assert.match(switcher, /compact \? 'w-\[58px\] \[@media\(pointer:coarse\)\]:w-\[68px\]'/)
  assert.match(switcher, COARSE_44)
  // Changing the language only dispatches SET_LANG (or calls onChange): nothing reloads or remounts.
  assert.match(switcher, /dispatch\(\{ type: 'SET_LANG', payload: lang \}\)/)
  assert.doesNotMatch(switcher + source('src/components/UnifiedSidebar.jsx') + source('src/components/AppShell.jsx'), /location\.reload|key=\{(state\.)?lang\}/)
})

test('pickers use the workspace kit: dialog surface, kit buttons, 40px cells that grow to 44px on touch', () => {
  const calendar = source('src/components/CalendarPicker.jsx')
  const range = source('src/components/DateRangePicker.jsx')
  const time = source('src/components/TimePicker24.jsx')

  assert.match(time, /className="mt-3 ws-btn ws-btn-primary ws-btn-sm w-full"/)
  assert.doesNotMatch(time + calendar + range, /violet|shadow-2xl|shadow-xl|font-black/)
  assert.match(time, /className="ws-dialog fixed z-picker/)
  assert.match(calendar, /className="ws-dialog fixed z-picker/)
  assert.match(calendar, /const field = 'ws-input'/)
  assert.equal(calendar.match(/className="ws-btn ws-btn-ghost ws-btn-sm"/g).length, 2)
  // Day cells and month arrows.
  assert.match(range, /className=\{`flex h-10 items-center justify-center rounded-lg[^`]*\[@media\(pointer:coarse\)\]:h-11/)
  assert.match(range, /const ARROW = `flex h-10 w-10 [^`]*\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11`/)
  assert.match(calendar, /const ARROW = `flex h-10 w-10 [^`]*\[@media\(pointer:coarse\)\]:h-11 \[@media\(pointer:coarse\)\]:w-11`/)
  assert.doesNotMatch(range, /h-9/)
  // A white day number sits on the solid orange, small orange text uses the ink.
  assert.doesNotMatch(range + calendar, /bg-\[#ff5a00\]|text-\[#ff5a00\]/)
})

test('a date field keeps its own accessible name', () => {
  const calendar = source('src/components/CalendarPicker.jsx')

  // aria-label={title} replaced every field label ("Paid date") with "Select date".
  assert.doesNotMatch(calendar, /<button ref=\{trigger\}[^>]*aria-label=\{title\}/)
  assert.match(calendar, /aria-label=\{labelledBy \? undefined : label \|\| undefined\} aria-labelledby=\{labelledBy\}/)
  assert.match(calendar, /<button ref=\{trigger\} id=\{fieldId\}/)
  // The chosen date is still read: it describes the field.
  assert.match(calendar, /aria-describedby=\{\[value \? valueId : '', describedBy\]/)
  assert.match(calendar, /<span id=\{valueId\}/)
})

test('date range picker manages focus and keeps Escape to itself', () => {
  const range = source('src/components/DateRangePicker.jsx')

  assert.match(range, /target\?\.focus\(\{ preventScroll: true \}\)/)
  assert.match(range, /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/)
  // Escape must not also close a dialog the picker sits in.
  assert.match(range, /if \(event\.key !== 'Escape' \|\| !open\) return\s+event\.preventDefault\(\)\s+event\.stopPropagation\(\)\s+closeAndRestoreFocus\(\)/)
  assert.match(range, /<div ref=\{pickerRef\}[^>]*onKeyDown=\{handleKeyDown\}>/)
  // Outside presses close it for touch and pen as well, like CalendarPicker and TimePicker24.
  assert.match(range, /addEventListener\('pointerdown', closeOnOutsidePress\)/)
  assert.doesNotMatch(range, /mousedown/)
  // No half-built ARIA grid: day buttons in a labelled group.
  assert.doesNotMatch(range, /role="grid"|role="gridcell"|role="columnheader"/)
  assert.match(range, /role="group" aria-label=\{formatMonthYear\(monthKey, lang, monthKey\)\}/)
})

test('no full-screen spinner while a route resolves; the shell placeholder matches the shell', () => {
  const app = source('src/App.jsx')
  const shimmer = source('src/components/PageShimmer.jsx')

  assert.doesNotMatch(app, /Spinner|animate-spin/)
  assert.match(app, /function SignedOutRoute[\s\S]*?if \(loading\) return <SignInShimmer \/>[\s\S]*?if \(!session\) return children\s+if \(!profile\) return <AppShellShimmer \/>/)
  assert.match(app, /return guestModeSession \? <AppShellShimmer \/> : children/)
  assert.match(shimmer, /export function SignInShimmer\(\)/)
  // 34px rows, 4px apart, in groups; and the drawer button below lg.
  assert.match(shimmer, /className="flex flex-col gap-1">\s*\{Array\.from\(\{ length: rows \}[\s\S]*?className="flex h-\[34px\] items-center gap-\[10px\] px-\[10px\]"/)
  assert.match(shimmer, /\$\{collapsed \? '' : 'lg:hidden'\}/)
  // In-page placeholders use the real panel box.
  assert.match(shimmer, /function Panel\(\{ className = '', flush = false, children \}\) \{\s*return <div className=\{`ws-panel /)
})

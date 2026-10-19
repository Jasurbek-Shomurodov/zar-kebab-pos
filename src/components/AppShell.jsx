import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { ArrowLeft, LogOut } from 'lucide-react'
import UnifiedSidebar from './UnifiedSidebar'
import MobileDrawer from './MobileDrawer'
import ThemeToggle from './ThemeToggle'
import { normalizeRole } from '../lib/permissions'

const COLLAPSED_KEY = 'zar-sidebar-collapsed'

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}

/** Two staggered bars, the long one over the short: the drawer's menu mark. */
function DrawerIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M4 8h16" /><path d="M4 16h10" /></svg>
}

/** A page's views as underlined tabs: beside the title on wide screens, under the bar on phones. */
function PageTabs({ tabs, className = '' }) {
  return (
    <nav aria-label={tabs.label} className={`ws-page-tabs ${className}`}>
      {tabs.items.map(item => (
        <button key={item.key} type="button" aria-pressed={tabs.value === item.key} onClick={() => tabs.onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export default function AppShell({ children, title, contentRef, headerActions, titleAccessory, tabs, back }) {
  const { profile, signOut } = useAuth()
  const { state, dispatch } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop drawer folds away like the Hoggish Finance rail and remembers it.
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const displayName = profile?.full_name || state.user?.name || profile?.email || ''
  const role = normalizeRole(profile?.role || state.user?.role || 'guest')
  const shouldShowSidebar = role !== 'guest'

  function setDrawerCollapsed(next) {
    setCollapsed(next)
    try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* preference only */ }
  }

  function openDrawer() {
    if (window.matchMedia?.('(min-width: 1024px)').matches) setDrawerCollapsed(false)
    else setMobileOpen(true)
  }

  function handleSignOut() {
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  // Pinned to the screen: the page itself never scrolls on iOS, only <main> does.
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[#f6f5f3] text-[#22201d]">

      {/* Desktop sidebar */}
      {/* Stays mounted and folds its width so collapsing/expanding animates. */}
      {shouldShowSidebar && (
      <div
        className={`hidden lg:block flex-shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none ${collapsed ? 'lg:w-0' : 'lg:w-64'}`}
        aria-hidden={collapsed || undefined}
        inert={collapsed ? '' : undefined}
      >
        <UnifiedSidebar onCollapse={() => setDrawerCollapsed(true)} />
      </div>
      )}

      {/* Mobile sidebar overlay */}
      {shouldShowSidebar && (
        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
          <UnifiedSidebar onClose={() => setMobileOpen(false)} />
        </MobileDrawer>
      )}

      {/* Main content */}
      <div className="zk-shell-main flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar — where you are, the drawer toggle while the drawer is hidden, and page actions */}
        <header className="relative z-30 flex h-[60px] flex-shrink-0 items-center justify-between gap-2 bg-[#f6f5f3]/[.84] px-4 text-sm backdrop-blur-[14px] backdrop-saturate-[1.4] sm:gap-3 sm:px-6 xl:px-9">
          <div className="flex h-full min-w-0 flex-1 items-center gap-3">
            {shouldShowSidebar && (
              <button
                type="button"
                onClick={openDrawer}
                aria-label={state.lang === 'uz' ? 'Yon panel' : state.lang === 'ru' ? 'Боковая панель' : 'Toggle Sidebar'}
                className={`grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] border border-[#e4e1de] bg-white text-[#22201d] shadow-[0_1px_2px_rgb(34_32_29/5%)] transition-colors hover:bg-[#ebe8e5] ${collapsed ? '' : 'lg:hidden'}`}
              >
                <DrawerIcon />
              </button>
            )}
            {back && (
              <button
                type="button"
                onClick={back.onClick}
                aria-label={back.label}
                title={back.label}
                className="-mr-1 grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#22201d]"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h1 className="truncate text-[15px] font-semibold leading-tight text-[#22201d]">
              {title}
            </h1>
            {/* Page controls that belong with the title, e.g. a reporting period filter. */}
            {titleAccessory && <div className="ml-1 flex min-w-0 flex-shrink-0 items-center">{titleAccessory}</div>}
            {tabs && <div className="ml-3 hidden items-center md:flex"><PageTabs tabs={tabs} /></div>}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerActions}
            <ThemeToggle lang={state.lang} />
          </div>
          {!shouldShowSidebar && (
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5 rounded-xl border border-[#e4e1de] bg-[#efece9] p-[3px]">
                {['uz', 'ru', 'en'].map(l => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={state.lang === l}
                    onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                    className={`h-8 rounded-[9px] px-2.5 text-xs font-medium uppercase transition-colors ${
                      state.lang === l ? 'bg-white text-[#22201d] shadow-[0_1px_2px_rgb(0_0_0/20%)]' : 'text-[#68655f] hover:text-[#22201d]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="ml-1 grid h-[38px] w-[38px] place-items-center rounded-[10px] text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#c4262c]"
                title={state.lang === 'uz' ? 'Chiqish' : state.lang === 'ru' ? 'Выйти' : 'Logout'}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </header>
        {tabs && <div className="flex h-11 flex-shrink-0 border-b border-[#e4e1de] px-4 md:hidden"><PageTabs tabs={tabs} /></div>}

        {/* Page content; relative so absolute children (sr-only figure text) stay in this scroll area instead of stretching the page. */}
        <main ref={contentRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}

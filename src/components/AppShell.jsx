import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { LogOut } from 'lucide-react'
import UnifiedSidebar from './UnifiedSidebar'
import MobileDrawer from './MobileDrawer'
import WorkspaceTopBar, { TOP_BAR_SQUARE } from './WorkspaceTopBar'
import { normalizeRole } from '../lib/permissions'
import { t } from '../lib/i18n'

const COLLAPSED_KEY = 'zar-sidebar-collapsed'

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
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

        {/* Top bar: the same component the cashier screens render, so the header layer and tabs match everywhere. */}
        <WorkspaceTopBar
          lang={state.lang}
          title={title}
          onOpenDrawer={shouldShowSidebar ? openDrawer : undefined}
          drawerOnDesktop={collapsed}
          back={back}
          titleAccessory={titleAccessory}
          tabs={tabs}
          trailing={!shouldShowSidebar && (
            <div className="flex items-center gap-1.5">
              <div role="group" aria-label={t(state.lang, 'language')} className="flex gap-0.5 rounded-xl border border-[#e4e1de] bg-[#efece9] p-[3px]">
                {['uz', 'ru', 'en'].map(l => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={state.lang === l}
                    onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                    className={`h-8 rounded-[9px] px-2.5 text-xs font-medium uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff5a00] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:text-sm ${
                      state.lang === l ? 'bg-white text-[#22201d] shadow-[0_1px_2px_rgb(0_0_0/20%)]' : 'text-[#68655f] hover:text-[#22201d]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {/* Kept 12px clear of the language buttons: signing out is not a routine tap. */}
              <button
                type="button"
                onClick={handleSignOut}
                aria-label={t(state.lang, 'logout')}
                title={t(state.lang, 'logout')}
                className={`ml-3 ${TOP_BAR_SQUARE} text-[#68655f] hover:bg-[#ebe8e5] hover:text-[#c4262c]`}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        >
          {headerActions}
        </WorkspaceTopBar>

        {/* Page content; relative so absolute children (sr-only figure text) stay in this scroll area instead of stretching the page. */}
        <main ref={contentRef} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}

import React from 'react'
import { ArrowLeft } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import AttentionBadge from './AttentionBadge'
import { t } from '../lib/i18n'

/** Square top-bar control: 38px with a mouse, 44px under a finger. */
export const TOP_BAR_SQUARE = 'grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a00] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11'
export const TOP_BAR_SQUARE_OUTLINE = `${TOP_BAR_SQUARE} border border-[#e4e1de] bg-white text-[#22201d] shadow-[0_1px_2px_rgb(34_32_29/5%)] hover:bg-[#ebe8e5]`
export const TOP_BAR_SQUARE_GHOST = `${TOP_BAR_SQUARE} text-[#68655f] hover:bg-[#ebe8e5] hover:text-[#22201d]`

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

/**
 * The one staff top bar: AppShell renders it, and so do the pages that lay out
 * their own sidebar (cashier). Where you are, the drawer button while the drawer
 * is hidden, and the page's actions.
 *
 * `back` is `{ onClick, label }`; `titleAccessory` sits with the title (a period
 * filter); `children` are the page actions; `trailing` follows the theme switch.
 * `drawerOnDesktop` keeps the drawer button on wide screens (collapsed rail).
 */
export default function WorkspaceTopBar({ title, onOpenDrawer, drawerLabel, drawerOnDesktop = false, back = null, leading = null, titleAccessory = null, children = null, trailing = null, lang = 'en', badge = null, badgeLabel = '', tabs = null }) {
  return (
    <>
    <header className="relative z-30 flex h-[60px] flex-shrink-0 items-center justify-between gap-2 bg-[#f6f5f3]/[.84] px-4 text-sm backdrop-blur-[14px] backdrop-saturate-[1.4] sm:gap-3 sm:px-6 xl:px-9">
      <div className="flex h-full min-w-0 flex-1 items-center gap-3">
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label={drawerLabel || t(lang, 'openMenu')}
            className={`${TOP_BAR_SQUARE_OUTLINE} ${drawerOnDesktop ? '' : 'lg:hidden'}`}
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
            className={`-mr-1 ${TOP_BAR_SQUARE_GHOST}`}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {leading}
        <h1 className="truncate text-[15px] font-semibold leading-tight text-[#22201d]">{title}</h1>
        {badge > 0 && <AttentionBadge count={badge} label={badgeLabel} />}
        {/* Page controls that belong with the title, e.g. a reporting period filter. */}
        {titleAccessory && <div className="ml-1 flex min-w-0 flex-shrink-0 items-center">{titleAccessory}</div>}
        {tabs && <div className="ml-3 hidden items-center md:flex"><PageTabs tabs={tabs} /></div>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        <ThemeToggle lang={lang} />
      </div>
      {trailing}
    </header>
    {tabs && <div className="flex h-11 flex-shrink-0 border-b border-[#e4e1de] px-4 md:hidden"><PageTabs tabs={tabs} /></div>}
    </>
  )
}

import React from 'react'
import ThemeToggle from './ThemeToggle'
import AttentionBadge from './AttentionBadge'

/** Two staggered bars, the long one over the short: the drawer's menu mark. */
function DrawerIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M4 8h16" /><path d="M4 16h10" /></svg>
}

/** A page's views as underlined tabs (same as AppShell): beside the title on wide screens, under the bar on phones. */
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

/** The Hoggish-style top bar for pages that lay out their own sidebar instead of using AppShell. */
export default function WorkspaceTopBar({ title, onOpenDrawer, drawerLabel = 'Toggle Sidebar', leading = null, children = null, lang = 'en', badge = null, badgeLabel = '', tabs = null }) {
  return (
    <>
    <header className="flex h-[60px] flex-shrink-0 items-center justify-between gap-2 bg-[#f6f5f3]/[.84] px-4 text-sm backdrop-blur-[14px] backdrop-saturate-[1.4] sm:gap-3 sm:px-6 xl:px-9">
      <div className="flex h-full min-w-0 flex-1 items-center gap-3">
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label={drawerLabel}
            className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] border border-[#e4e1de] bg-white text-[#22201d] shadow-[0_1px_2px_rgb(34_32_29/5%)] transition-colors hover:bg-[#ebe8e5] lg:hidden"
          >
            <DrawerIcon />
          </button>
        )}
        {leading}
        <h1 className="truncate text-[15px] font-semibold leading-tight text-[#22201d]">{title}</h1>
        {badge > 0 && <AttentionBadge count={badge} label={badgeLabel} />}
        {tabs && <div className="ml-3 hidden h-full md:flex"><PageTabs tabs={tabs} /></div>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        <ThemeToggle lang={lang} />
      </div>
    </header>
    {tabs && <div className="flex h-11 flex-shrink-0 border-b border-[#e4e1de] px-4 md:hidden"><PageTabs tabs={tabs} /></div>}
    </>
  )
}

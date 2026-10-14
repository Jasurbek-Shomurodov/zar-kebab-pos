import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Table2, BookOpen,
  Receipt, Users, BarChart2, ShieldCheck, Settings, LogOut,
  BadgeDollarSign, WalletCards, ShoppingBasket, PieChart,
  ClipboardList, PackagePlus, PanelLeft, ChevronRight, QrCode,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { canViewPage, normalizeRole } from '../lib/permissions'
import { t } from '../lib/i18n'
import { useCashierAttentionCount } from '../store/appHooks'
import AttentionBadge from './AttentionBadge'
import { useAttendanceQrAccess } from '../lib/attendanceQrAccess'

// ── Nav definition — roles come from PAGE_ACCESS to stay in sync ───────────────
// Drawer groups, in display order. The overview group has no heading.
const NAV_GROUPS = [
  { key: 'overview', labels: null },
  { key: 'service', labels: { uz: 'Xizmat', ru: 'Обслуживание', en: 'Service' } },
  { key: 'kitchen', labels: { uz: 'Oshxona va ombor', ru: 'Кухня и склад', en: 'Kitchen & stock' } },
  { key: 'business', labels: { uz: 'Biznes', ru: 'Бизнес', en: 'Business' } },
]

const NAV = [
  {
    key: 'dashboard',
    icon: LayoutDashboard,
    labels: { uz: 'Boshqaruv', ru: 'Панель', en: 'Dashboard' },
    path: '/admin',
    group: 'overview',
  },
  {
    // Not a Team feature: shown to accounts selected in Settings, only inside
    // their hours (migration 247; the database refuses codes outside them).
    key: 'checkin_qr',
    icon: QrCode,
    labels: { uz: 'Kelish QR kodi', ru: 'QR для отметки', en: 'Check-in QR' },
    path: '/checkin-qr',
    group: 'overview',
    attendanceQr: true,
  },
  {
    key: 'tables',
    icon: Table2,
    labels: { uz: 'Stollar', ru: 'Столы', en: 'Tables' },
    path: '/waiter/tables',
    group: 'service',
  },
  {
    key: 'cashier',
    icon: Receipt,
    labels: { uz: 'Kassir', ru: 'Кассир', en: 'Cashier' },
    path: '/cashier/tables',
    group: 'service',
  },
  {
    key: 'loyalty',
    icon: BadgeDollarSign,
    labels: { uz: 'Sodiqlik', ru: 'Лояльность', en: 'Loyalty' },
    path: '/admin/loyalty',
    group: 'service',
  },
  {
    key: 'menu',
    icon: BookOpen,
    labels: { uz: 'Menyu', ru: 'Меню', en: 'Menu' },
    path: '/admin/menu',
    group: 'kitchen',
  },
  {
    key: 'tech_cards',
    icon: ClipboardList,
    labels: { uz: 'Texnologik kartalar', ru: 'Техкарты', en: 'Tech Cards' },
    path: '/admin/tech-cards',
    group: 'kitchen',
  },
  {
    key: 'ingredients',
    icon: PackagePlus,
    labels: { uz: 'Masalliqlar', ru: 'Ингредиенты', en: 'Ingredients' },
    path: '/admin/ingredients',
    group: 'kitchen',
  },
  {
    key: 'bazaar',
    icon: ShoppingBasket,
    labels: { uz: 'Kunlik bozor', ru: 'Ежедневный базар', en: 'Daily Bazaar' },
    path: '/admin/bazaar',
    group: 'kitchen',
  },
  {
    key: 'expenses',
    icon: WalletCards,
    labels: { uz: 'Buxgalteriya', ru: 'Бухгалтерия', en: 'Accounting' },
    path: '/admin/accounting',
    group: 'business',
  },
  {
    // Its own Team feature; it requires Accounting because it reads the same protected totals.
    key: 'financial_analysis',
    accessKey: 'financial_analysis',
    icon: PieChart,
    labels: { uz: 'Moliyaviy tahlil', ru: 'Финансовый анализ', en: 'Financial analysis' },
    path: '/admin/financial-analysis',
    group: 'business',
  },
  {
    key: 'team',
    icon: Users,
    labels: { uz: 'Jamoa', ru: 'Команда', en: 'Team' },
    path: '/admin/users',
    group: 'business',
  },
  {
    key: 'reports',
    icon: BarChart2,
    labels: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' },
    path: '/admin/reports',
    group: 'business',
  },
  {
    key: 'audit',
    icon: ShieldCheck,
    labels: { uz: 'Audit', ru: 'Аудит', en: 'Audit' },
    path: '/admin/audit',
    group: 'business',
  },
  {
    key: 'settings',
    icon: Settings,
    labels: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    path: '/admin/settings',
    group: 'business',
  },
]

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',       ru: 'Владелец',      en: 'Owner'        },
  admin:       { uz: 'Admin',       ru: 'Администратор', en: 'Admin'        },
  viewer:      { uz: 'Ko‘ruvchi',   ru: 'Просмотр',      en: 'Viewer'       },
  guest:       { uz: 'Mehmon',      ru: 'Гость',         en: 'Guest'        },
}

// Derive active nav key from current pathname
function activeKey(pathname) {
  if (pathname.startsWith('/waiter/order'))   return 'tables'
  if (pathname.startsWith('/waiter/tables'))  return 'tables'
  if (pathname.startsWith('/cashier'))        return 'cashier'
  if (pathname.startsWith('/admin/loyalty'))  return 'loyalty'
  if (pathname.startsWith('/admin/financial-analysis')) return 'financial_analysis'
  if (pathname.startsWith('/admin/accounting')) return 'expenses'
  if (pathname.startsWith('/admin/expenses')) return 'expenses'
  if (pathname.startsWith('/admin/ingredients')) return 'ingredients'
  if (pathname.startsWith('/admin/bazaar'))   return 'bazaar'
  if (pathname.startsWith('/admin/tech-cards')) return 'tech_cards'
  if (pathname.startsWith('/admin/menu'))     return 'menu'
  if (pathname.startsWith('/admin/tables'))   return 'settings'
  if (pathname.startsWith('/admin/users'))    return 'team'
  if (pathname.startsWith('/admin/reports'))   return 'reports'
  if (pathname.startsWith('/admin/audit'))      return 'audit'
  if (pathname.startsWith('/admin/settings'))  return 'settings'
  if (pathname === '/admin' || pathname === '/admin/') return 'dashboard'
  if (pathname.startsWith('/checkin-qr')) return 'checkin_qr'
  return ''
}

// ── Component ──────────────────────────────────────────────────────────────────
// Mirrors the Hoggish Finance drawer: warm grey rail, mark + collapse button on
// top, quiet 34px rows, and the account line (which opens Settings) at the foot.
const LANGS = ['uz', 'ru', 'en']
const NAV_ROW = 'flex h-[34px] w-full items-center gap-[10px] rounded-lg px-[10px] text-left text-sm font-medium text-[#22201d] transition-colors hover:bg-[#ebe8e5] disabled:cursor-wait disabled:opacity-50'

export default function UnifiedSidebar({ onClose, onCollapse, navigationDisabled = false }) {
  const navigate   = useNavigate()
  const { pathname } = useLocation()
  const { state, dispatch } = useApp()
  const { profile, signOut } = useAuth()

  const lang    = state.lang
  const role    = normalizeRole(profile?.role || state.user?.role || 'guest')
  const current = activeKey(pathname)
  const cashierAttention = useCashierAttentionCount()
  const attentionLabel = lang === 'uz' ? 'hisob kassirni kutmoqda' : lang === 'ru' ? 'счетов ждут кассира' : 'bills waiting for the cashier'

  const displayName = profile?.full_name || state.user?.name || profile?.email || ''
  const initial     = (displayName || '?')[0].toUpperCase()
  const roleLabel   = (ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en) ?? role

  const { openNow: checkinQrOpen } = useAttendanceQrAccess(profile?.id)
  const visibleNav = NAV.filter(item => (
    item.attendanceQr ? checkinQrOpen : canViewPage(profile || { role }, item.accessKey || item.key)
  ))
  const mainNav = visibleNav.filter(item => item.key !== 'settings')
  const settings = visibleNav.find(item => item.key === 'settings')
  // On phones the drawer's own button closes it; on desktop it folds the rail away.
  const hide = onClose || onCollapse
  const hideLabel = lang === 'uz' ? 'Yon panelni yopish' : lang === 'ru' ? 'Скрыть панель' : 'Toggle Sidebar'
  const logoutLabel = lang === 'uz' ? 'Chiqish' : lang === 'ru' ? 'Выйти' : 'Logout'

  function handleNav(item) {
    if (navigationDisabled) return
    navigate(item.path)
    onClose?.()
  }

  function handleSignOut() {
    if (navigationDisabled) return
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  function navRow(item) {
    const Icon   = item.icon
    const active = item.key === current
    return (
      <li key={item.key}>
        <button
          type="button"
          onClick={() => handleNav(item)}
          disabled={navigationDisabled}
          data-active={active}
          aria-current={active ? 'page' : undefined}
          className={`${NAV_ROW} ${active ? 'bg-[#ebe8e5]' : ''}`}
        >
          <Icon size={17} strokeWidth={2} className={`flex-shrink-0 ${active ? 'opacity-100' : 'opacity-70'}`} />
          <span className="truncate">{item.labels[lang] || item.labels.en}</span>
          {item.key === 'cashier' && <AttentionBadge count={cashierAttention} label={attentionLabel} className="ml-auto" />}
        </button>
      </li>
    )
  }

  return (
    <aside className="h-full max-h-[100dvh] w-[min(18rem,85vw)] lg:w-64 bg-[#f6f5f3] text-[#22201d] flex flex-col flex-shrink-0 overflow-hidden">

      {/* Mark on one side, the drawer's own collapse button on the other */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 pb-3 pl-[18px] pr-[10px] pt-[14px]">
        <button
          type="button"
          onClick={() => handleNav(mainNav.find(item => !item.attendanceQr) || { path: '/' })}
          disabled={navigationDisabled}
          aria-label="Zar Kebab"
          className="flex min-w-0 items-center gap-2 rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f766e]"
        >
          <span className="grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-[9px] bg-[#ff5a00] pr-[2px] text-[20px] font-bold tracking-[-.08em] text-white">z.</span>
          <span className="truncate rounded-full bg-[#fff1e8] px-2 text-xs font-bold leading-[18px] tracking-[.04em] text-[#ff5a00]">
            {role === 'viewer' ? t(lang, 'viewer') : roleLabel}
          </span>
        </button>
        {hide && (
          <button
            type="button"
            onClick={hide}
            aria-label={hideLabel}
            title={hideLabel}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#22201d]"
          >
            <PanelLeft size={17} />
          </button>
        )}
      </div>

      {/* Workspace rows — scroll inside the rail when the window is short */}
      <nav aria-label="Zar Kebab" className="flex-1 min-h-0 overflow-y-auto px-[10px] pb-4 pt-0.5">
        {NAV_GROUPS.map(group => {
          const items = mainNav.filter(item => item.group === group.key)
          if (items.length === 0) return null
          const heading = group.labels && (group.labels[lang] || group.labels.en)
          return (
            <div key={group.key} role="group" aria-label={heading || undefined} className="mb-4 last:mb-0">
              {heading && <p className="px-[10px] pb-1.5 pt-1 text-xs font-medium text-[#68655f]">{heading}</p>}
              <ul className="flex flex-col gap-1">{items.map(navRow)}</ul>
            </div>
          )
        })}
      </nav>

      {/* Foot: language and the signed-in account (opens Settings when allowed) */}
      <div className="flex flex-shrink-0 flex-col gap-1.5 p-3">
        <div
          role="group"
          aria-label={lang === 'uz' ? 'Til' : lang === 'ru' ? 'Язык' : 'Language'}
          className="flex gap-0.5 rounded-xl border border-[#e4e1de] bg-[#efece9] p-[3px]"
        >
          {LANGS.map(l => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
              className={`h-8 flex-1 rounded-[9px] text-sm font-medium uppercase transition-colors ${
                lang === l
                  ? 'bg-white text-[#22201d] shadow-[0_1px_2px_rgb(0_0_0/20%)]'
                  : 'text-[#68655f] hover:text-[#22201d]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-1 pt-1.5">
          <button
            type="button"
            onClick={() => settings && handleNav(settings)}
            disabled={navigationDisabled || !settings}
            data-active={current === 'settings'}
            className={`flex min-w-0 flex-1 items-center gap-[10px] rounded-lg p-1.5 text-left transition-colors enabled:hover:bg-[#ebe8e5] disabled:cursor-default ${current === 'settings' ? 'bg-[#ebe8e5]' : ''}`}
          >
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#ebe8e5] text-sm font-semibold text-[#22201d]">{initial}</span>
            <span className="min-w-0 flex-1 leading-[1.35]">
              <strong className="block truncate text-sm font-semibold">{displayName || t(lang, 'user')}</strong>
              <span className="block truncate text-[13px] text-[#68655f]">{profile?.email || roleLabel}</span>
            </span>
            {settings && <ChevronRight size={16} className="flex-shrink-0 text-[#68655f]" />}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={navigationDisabled}
            aria-label={logoutLabel}
            title={logoutLabel}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[#68655f] transition-colors hover:bg-[#ebe8e5] hover:text-[#c4262c] disabled:cursor-wait disabled:opacity-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}

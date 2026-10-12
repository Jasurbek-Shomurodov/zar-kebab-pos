import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '../lib/theme'

// Skeleton placeholders shaped like the page that is loading. Page switches and
// tab loads show these in place of content (inside the drawer + top bar) instead
// of a full-screen spinner, so the workspace never looks like it reloaded.

export function Shimmer({ className = '' }) {
  return <div className={`zk-shimmer ${className}`} aria-hidden="true" />
}

function Panel({ className = '', children }) {
  return <div className={`rounded-xl border border-[#e4e1de] bg-white p-4 ${className}`}>{children}</div>
}

function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Shimmer className="h-9 w-28 rounded-[10px]" />
      <Shimmer className="h-9 w-24 rounded-[10px]" />
      <Shimmer className="ml-auto h-9 w-full rounded-[10px] sm:w-56" />
    </div>
  )
}

function TableRows({ rows = 8 }) {
  return (
    <Panel className="p-0">
      <div className="flex gap-4 border-b border-[#e4e1de] px-4 py-3">
        <Shimmer className="h-3 w-1/4" />
        <Shimmer className="h-3 w-1/6" />
        <Shimmer className="ml-auto h-3 w-1/6" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-[#e4e1de] px-4 py-3.5 last:border-b-0">
          <Shimmer className="h-8 w-8 flex-shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Shimmer className={`h-3 ${index % 3 === 0 ? 'w-2/5' : index % 3 === 1 ? 'w-1/2' : 'w-1/3'}`} />
            <Shimmer className="h-2.5 w-1/4" />
          </div>
          <Shimmer className="h-4 w-20" />
        </div>
      ))}
    </Panel>
  )
}

function CardGrid({ cards = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <Panel key={index} className="space-y-3">
          <div className="flex items-center gap-2">
            <Shimmer className="h-9 w-9 rounded-xl" />
            <Shimmer className="h-3 w-1/2" />
          </div>
          <Shimmer className="h-6 w-2/3" />
          <Shimmer className="h-2.5 w-full" />
          <Shimmer className="h-2.5 w-4/5" />
        </Panel>
      ))}
    </div>
  )
}

function StatTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Panel key={index} className="space-y-3">
          <Shimmer className="h-3 w-1/2" />
          <Shimmer className="h-7 w-3/4" />
          <Shimmer className="h-2.5 w-1/3" />
        </Panel>
      ))}
    </div>
  )
}

function Chart() {
  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-8 w-48 rounded-[10px]" />
      </div>
      <Shimmer className="h-56 w-full rounded-lg" />
    </Panel>
  )
}

function SideList({ rows = 5 }) {
  return (
    <Panel className="space-y-4">
      <Shimmer className="h-5 w-32" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Shimmer className="h-8 w-8 flex-shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3 w-3/5" />
            <Shimmer className="h-2.5 w-2/5" />
          </div>
          <Shimmer className="h-3 w-14" />
        </div>
      ))}
    </Panel>
  )
}

function FormSections() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {[3, 4].map((rows, section) => (
        <Panel key={section} className="space-y-5">
          <Shimmer className="h-3 w-32" />
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Shimmer className="h-9 w-9 flex-shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-2/5" />
                <Shimmer className="h-2.5 w-3/5" />
              </div>
              <Shimmer className="h-10 w-28 rounded-[10px] sm:w-44" />
            </div>
          ))}
        </Panel>
      ))}
    </div>
  )
}

function SkeletonRows({ rows }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex items-center gap-3">
      <Shimmer className="h-8 w-8 flex-shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Shimmer className={`h-3 ${index % 2 ? 'w-2/5' : 'w-1/2'}`} />
        <Shimmer className="h-2.5 w-1/4" />
      </div>
      <Shimmer className="h-4 w-24" />
    </div>
  ))
}

// Monthly estimate: month outlook, expense breakdown cards, money in/out
// side by side and payment methods, in the page's own full-width container.
function EstimateSections() {
  return (
    <>
      <div className="ws-panel space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Shimmer className="h-6 w-48" />
          <Shimmer className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-[#e4e1de] p-4">
              <Shimmer className="h-3 w-1/2" />
              <Shimmer className="h-7 w-3/4" />
              <Shimmer className="h-2.5 w-2/5" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
          <Shimmer className="h-3 w-full rounded-full" />
          <Shimmer className="h-10 w-full" />
          <Shimmer className="h-10 w-full" />
        </div>
      </div>
      <div className="ws-panel space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Shimmer className="h-7 w-56" />
          <div className="space-y-2">
            <Shimmer className="h-3 w-32" />
            <Shimmer className="h-5 w-40" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-[#e4e1de] p-4">
              <div className="flex items-center gap-2">
                <Shimmer className="h-9 w-9 rounded-xl" />
                <Shimmer className="h-3 w-1/2" />
              </div>
              <Shimmer className="h-7 w-2/3" />
              <Shimmer className="h-2.5 w-full" />
              <Shimmer className="h-2.5 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map(section => (
          <div key={section} className="ws-panel space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Shimmer className="h-5 w-36" />
              <Shimmer className="h-5 w-28" />
            </div>
            <SkeletonRows rows={5} />
          </div>
        ))}
      </div>
      <div className="ws-panel space-y-4">
        <Shimmer className="h-5 w-44" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-[#e4e1de] p-4">
              <Shimmer className="h-4 w-1/3" />
              <Shimmer className="h-2 w-full rounded-full" />
              <Shimmer className="h-2 w-4/5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Layouts that render inside the page's own `.ws-page` container, so the
// skeleton has exactly the loaded page's width, padding and gaps.
const PAGE_CONTAINER_LAYOUTS = new Set(['estimate'])

const LAYOUTS = {
  table: () => <><Toolbar /><TableRows /></>,
  cards: () => <><Toolbar /><CardGrid /></>,
  dashboard: () => (
    <>
      <StatTiles />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Chart />
        <SideList />
      </div>
    </>
  ),
  // Ordering, bill and editor screens: browsing area beside a summary panel.
  detail: () => (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, index) => <Shimmer key={index} className="h-9 w-24 flex-shrink-0 rounded-[10px]" />)}
        </div>
        <CardGrid cards={9} />
      </div>
      <SideList rows={6} />
    </div>
  ),
  form: () => <FormSections />,
  estimate: () => <EstimateSections />,
}

/** In-page loading placeholder; `label` is announced to screen readers only. */
export default function PageShimmer({ layout = 'table', label = '', className = '' }) {
  const Layout = LAYOUTS[layout] || LAYOUTS.table
  return (
    <div role="status" aria-busy="true" className={`${PAGE_CONTAINER_LAYOUTS.has(layout) ? 'ws-page' : 'flex w-full flex-col gap-4 p-4 sm:p-6 xl:px-9'} ${className}`}>
      {label && <span className="sr-only">{label}</span>}
      <Layout />
    </div>
  )
}

/** Which skeleton fits a route before its page code has loaded. */
export function layoutForPath(pathname = '') {
  if (pathname === '/admin' || pathname.startsWith('/admin/reports') || pathname === '/admin/accounting' || pathname === '/admin/financial-analysis') return 'dashboard'
  if (pathname.startsWith('/waiter/order') || pathname.startsWith('/waiter/take-away') || pathname.startsWith('/cashier/bill') || pathname.startsWith('/admin/tech-cards/')) return 'detail'
  if (pathname.startsWith('/admin/financial-analysis/estimate')) return 'estimate'
  if (pathname.startsWith('/admin/settings')) return 'form'
  if (pathname.startsWith('/waiter/tables') || pathname.startsWith('/cashier/tables') || pathname.startsWith('/admin/menu') || pathname.startsWith('/admin/tables') || pathname.startsWith('/admin/loyalty')) return 'cards'
  return 'table'
}

function readCollapsed() {
  try { return window.localStorage.getItem('zar-sidebar-collapsed') === '1' } catch { return false }
}

/** Drawer + top bar + page skeleton, for the first staff page load (auth/profile or page code). */
export function AppShellShimmer() {
  const { pathname } = useLocation()
  useTheme() // keep the staff dark palette while the skeleton is up
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f6f5f3]">
      {!readCollapsed() && (
        <div className="hidden h-full w-64 flex-shrink-0 flex-col gap-3 bg-[#f6f5f3] p-3 lg:flex" aria-hidden="true">
          <div className="flex items-center gap-2 px-1 py-2">
            <Shimmer className="h-[30px] w-[30px] rounded-[9px]" />
            <Shimmer className="h-4 w-16 rounded-full" />
          </div>
          {Array.from({ length: 11 }, (_, index) => (
            <div key={index} className="flex items-center gap-2.5 px-2.5">
              <Shimmer className="h-4 w-4 rounded" />
              <Shimmer className={`h-3 ${index % 2 ? 'w-20' : 'w-24'}`} />
            </div>
          ))}
          <div className="mt-auto flex items-center gap-2.5 p-1.5">
            <Shimmer className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-3 w-3/4" />
              <Shimmer className="h-2.5 w-1/2" />
            </div>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-[60px] flex-shrink-0 items-center gap-3 px-4 sm:px-6 xl:px-9" aria-hidden="true">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="ml-auto h-[38px] w-[38px] rounded-[10px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PageShimmer layout={layoutForPath(pathname)} />
        </div>
      </div>
    </div>
  )
}

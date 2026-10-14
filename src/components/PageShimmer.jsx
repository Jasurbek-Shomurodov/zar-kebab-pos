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

// Ingredient catalog cards, as rendered inside the Ingredients panel under its live toolbar.
function IngredientCards({ cards = 8 }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex min-w-0 flex-col rounded-xl border border-[#e4e1de] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <Shimmer className={`h-4 ${index % 3 === 0 ? 'w-3/5' : index % 3 === 1 ? 'w-1/2' : 'w-2/5'}`} />
            <Shimmer className="h-7 w-7 flex-shrink-0 rounded-[8px]" />
          </div>
          <Shimmer className="mt-2 h-5 w-20 rounded-full" />
          <Shimmer className="mt-4 h-5 w-1/2" />
        </div>
      ))}
    </div>
  )
}

// Ingredients page before its code loads: toolbar panel around the card grid.
function IngredientsPage() {
  return (
    <div className="ws-panel ws-panel-flush">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e4e1de] p-5 max-sm:p-4">
        <Shimmer className="h-11 min-w-[220px] flex-1 rounded-[10px] sm:max-w-sm" />
        <Shimmer className="h-11 w-[220px] max-w-full rounded-[10px]" />
        <Shimmer className="h-11 w-64 max-w-full rounded-[12px] sm:ml-auto" />
      </div>
      <IngredientCards />
    </div>
  )
}

// Purchases & usage result cards: name + category, then bought / usage / paid / remaining.
function IngredientMovementCards({ cards = 8 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex min-w-0 flex-col rounded-xl border border-[#e4e1de] bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <Shimmer className={`h-4 ${index % 2 ? 'w-2/5' : 'w-1/2'}`} />
            <Shimmer className="h-5 w-16 flex-shrink-0 rounded-full" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            {Array.from({ length: 4 }, (_, cell) => (
              <div key={cell} className="space-y-1.5">
                <Shimmer className="h-2.5 w-3/4" />
                <Shimmer className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function IngredientUsagePage() {
  return (
    <div className="ws-panel">
      <Shimmer className="h-7 w-56 max-w-full" />
      <Shimmer className="mt-4 h-10 w-full rounded-[10px] sm:w-[420px]" />
      <div className="my-4 space-y-2">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-3/4" />
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.7fr)]">
        {[0, 1].map(index => (
          <div key={index} className="space-y-1.5">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="h-11 w-full rounded-[10px]" />
          </div>
        ))}
      </div>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-8 w-24 rounded-[10px]" />
      </div>
      <IngredientMovementCards />
    </div>
  )
}

// Tech Cards list: KPI tiles, category tiles, search + filter, then image cards per category.
function TechCardsList() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="ws-panel flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Shimmer className="h-3 w-1/2" />
              <Shimmer className="h-6 w-2/3" />
            </div>
            <Shimmer className="h-8 w-8 flex-shrink-0 rounded-full" />
          </div>
        ))}
      </div>
      <div className="ws-panel">
        <Shimmer className="mb-3 h-5 w-28" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="w-[104px] shrink-0 overflow-hidden rounded-xl border border-[#e4e1de] md:w-[112px] xl:w-[120px]">
              <Shimmer className="aspect-square w-full !rounded-none" />
              <div className="flex min-h-[44px] items-center justify-center px-2 py-2"><Shimmer className="h-3 w-3/4" /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Shimmer className="h-11 min-w-[220px] flex-1 rounded-[10px]" />
        <Shimmer className="h-11 w-60 max-w-full rounded-[12px]" />
      </div>
      <div>
        <div className="mb-3 flex items-center gap-3">
          <Shimmer className="h-7 w-40" />
          <Shimmer className="h-5 w-8 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="ws-panel ws-panel-flush flex min-w-0">
              <Shimmer className="min-h-[104px] w-24 shrink-0 self-stretch !rounded-none sm:w-28" />
              <div className="min-w-0 flex-1 space-y-2 p-4">
                <Shimmer className={`h-4 ${index % 2 ? 'w-3/5' : 'w-3/4'}`} />
                <Shimmer className="!mt-4 h-3 w-1/3" />
                <Shimmer className="h-4 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Tech Card editor: product header, ingredient table, included items and method beside the cost summary.
function TechCardEditor() {
  return (
    <>
      <div className="ws-panel flex flex-wrap items-center gap-4">
        <Shimmer className="h-16 w-16 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Shimmer className="h-4 w-48 max-w-full" />
          <Shimmer className="h-3 w-32" />
        </div>
        <Shimmer className="h-8 w-32 rounded-[10px]" />
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <div className="ws-panel">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Shimmer className="h-5 w-32" />
                <Shimmer className="h-3 w-2/3" />
              </div>
              <Shimmer className="h-8 w-36 rounded-[10px]" />
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[#e4e1de]">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 border-b border-[#e4e1de] p-3 last:border-b-0 sm:grid-cols-[minmax(140px,1.5fr)_90px_90px_minmax(120px,1fr)_110px_40px] sm:items-center">
                  <Shimmer className="col-span-2 h-11 rounded-[10px] sm:col-span-1" />
                  <Shimmer className="h-11 rounded-[10px]" />
                  <Shimmer className="h-11 rounded-[10px]" />
                  <Shimmer className="h-11 rounded-[10px]" />
                  <Shimmer className="h-4 w-20 sm:justify-self-end" />
                  <Shimmer className="hidden h-8 w-8 rounded-[8px] sm:block" />
                </div>
              ))}
            </div>
          </div>
          <div className="ws-panel">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Shimmer className="h-5 w-40" />
                <Shimmer className="h-3 w-1/2" />
              </div>
              <Shimmer className="h-8 w-36 rounded-[10px]" />
            </div>
            <Shimmer className="h-[104px] w-full rounded-[10px]" />
          </div>
          <div className="ws-panel space-y-2">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="h-48 w-full rounded-[10px]" />
          </div>
        </div>
        <div className="ws-panel self-start">
          <Shimmer className="mb-4 h-5 w-28" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 py-2.5">
              <Shimmer className="h-3 w-24" />
              <Shimmer className="h-4 w-20" />
            </div>
          ))}
          <Shimmer className="mt-2 h-10 w-full rounded-[10px]" />
        </div>
      </div>
    </>
  )
}

// Loading skeleton in the page's own shape: three metric tiles, the operations
// form (heading, four-way switch, field row, note + button) and the Telegram card.
function SalariesPage() {
  const panel = 'rounded-xl border border-[#e4e1de] bg-white p-5'
  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={`${panel} space-y-3`}>
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-7 w-44" />
            <Shimmer className="h-2.5 w-4/5" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Shimmer className="h-8 w-56" />
        <Shimmer className="h-3 w-80 max-w-full" />
      </div>
      <div className={`${panel} space-y-5`}>
        <div className="space-y-2">
          <Shimmer className="h-5 w-72 max-w-full" />
          <Shimmer className="h-3 w-96 max-w-full" />
        </div>
        <Shimmer className="h-12 w-full rounded-xl" />
        <Shimmer className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Shimmer className="h-3 w-20" />
              <Shimmer className="h-11 w-full rounded-[10px]" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
          <div className="space-y-2 lg:col-span-9">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-20 w-full rounded-[10px]" />
          </div>
          <Shimmer className="h-11 w-full rounded-[10px] lg:col-span-3" />
        </div>
      </div>
      <div className={`${panel} space-y-4`}>
        <div className="space-y-2">
          <Shimmer className="h-5 w-52" />
          <Shimmer className="h-3 w-80 max-w-full" />
        </div>
        <div className="flex gap-4">
          <Shimmer className="h-11 flex-1 rounded-[10px]" />
          <Shimmer className="h-11 w-32 rounded-[10px]" />
        </div>
      </div>
    </>
  )
}

// Layouts that render inside the page's own `.ws-page` container, so the
// skeleton has exactly the loaded page's width, padding and gaps.
const PAGE_CONTAINER_LAYOUTS = new Set(['salaries', 'estimate', 'techCards', 'techCardEditor', 'ingredients', 'ingredientUsage'])
// Result-area layouts placed inside a page panel below its live toolbar: no extra container.
const INLINE_LAYOUTS = new Set(['ingredientCards', 'ingredientMovementCards'])

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
  salaries: () => <SalariesPage />,
  estimate: () => <EstimateSections />,
  techCards: () => <TechCardsList />,
  techCardEditor: () => <TechCardEditor />,
  ingredients: () => <IngredientsPage />,
  ingredientUsage: () => <IngredientUsagePage />,
  ingredientCards: () => <IngredientCards />,
  ingredientMovementCards: () => <IngredientMovementCards />,
}

/** In-page loading placeholder; `label` is announced to screen readers only. */
export default function PageShimmer({ layout = 'table', label = '', className = '' }) {
  const Layout = LAYOUTS[layout] || LAYOUTS.table
  return (
    <div role="status" aria-busy="true" className={`${INLINE_LAYOUTS.has(layout) ? '' : PAGE_CONTAINER_LAYOUTS.has(layout) ? 'ws-page' : 'flex w-full flex-col gap-4 p-4 sm:p-6 xl:px-9'} ${className}`}>
      {label && <span className="sr-only">{label}</span>}
      <Layout />
    </div>
  )
}

/** Which skeleton fits a route before its page code has loaded. */
export function layoutForPath(pathname = '') {
  if (pathname === '/admin' || pathname.startsWith('/admin/reports') || pathname === '/admin/accounting' || pathname === '/admin/financial-analysis') return 'dashboard'
  if (pathname.startsWith('/admin/accounting/salaries')) return 'salaries'
  if (pathname.startsWith('/admin/tech-cards/')) return 'techCardEditor'
  if (pathname.startsWith('/admin/tech-cards')) return 'techCards'
  if (pathname.startsWith('/admin/ingredients/usage')) return 'ingredientUsage'
  if (pathname.startsWith('/admin/ingredients')) return 'ingredients'
  if (pathname.startsWith('/waiter/order') || pathname.startsWith('/waiter/take-away') || pathname.startsWith('/cashier/bill')) return 'detail'
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

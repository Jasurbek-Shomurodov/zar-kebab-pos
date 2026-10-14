import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShellShimmer } from './components/PageShimmer'

import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider, useApp } from './store/AppContext'
import { canViewPage, defaultPath as roleDefaultPath } from './lib/permissions'
import { t } from './lib/i18n'
import {
  clearGuestModeSession,
} from './lib/guestMode'
import { useGuestModeSession } from './hooks/useGuestModeSession'

import Login          from './pages/Login'
import AuthCallback   from './pages/AuthCallback'
import ResetPassword  from './pages/ResetPassword'
import PublicMenu     from './pages/PublicMenu'
import TelegramMiniApp from './pages/TelegramMiniApp'
import PendingApproval from './pages/PendingApproval'
import CateringPage from './pages/CateringPage'
import PublicVacancies from './pages/PublicVacancies'

const ADMIN_HOSTNAME = 'admin.zarkebab.uz'
const PUBLIC_HOSTNAMES = new Set(['zarkebab.uz', 'www.zarkebab.uz'])

// Staff page chunks (the same modules as the lazy routes below). PreloadStaffPages
// warms them once signed in, so switching pages never waits on page code.
const STAFF_PAGES = {
  WaiterTables: () => import('./pages/WaiterTables'),
  WaiterOrder: () => import('./pages/WaiterOrder'),
  KitchenCheckReceipt: () => import('./pages/KitchenCheckReceipt'),
  CashierTables: () => import('./pages/CashierTables'),
  CashierBill: () => import('./pages/CashierBill'),
  Receipt: () => import('./pages/Receipt'),
  AdminDashboard: () => import('./pages/AdminDashboard'),
  AdminMenu: () => import('./pages/AdminMenu'),
  TechCards: () => import('./pages/TechCards'),
  AdminTables: () => import('./pages/AdminTables'),
  AdminUsers: () => import('./pages/AdminUsers'),
  AdminLoyalty: () => import('./pages/AdminLoyalty'),
  Expenses: () => import('./pages/Expenses'),
  DailyBazaar: () => import('./pages/DailyBazaar'),
  IngredientUsage: () => import('./pages/IngredientUsage'),
  BazaarIngredients: () => import('./pages/BazaarIngredients'),
  AccountingHistory: () => import('./pages/AccountingHistory'),
  AccountingAnalysis: () => import('./pages/AccountingAnalysis'),
  Salaries: () => import('./pages/Salaries'),
  MonthlyEstimate: () => import('./pages/MonthlyEstimate'),
  Employees: () => import('./pages/Employees'),
  EmployeeSalaryHistory: () => import('./pages/EmployeeSalaryHistory'),
  Reports: () => import('./pages/Reports'),
  AdminAudit: () => import('./pages/AdminAudit'),
  AdminSettings: () => import('./pages/AdminSettings'),
  CheckinQr: () => import('./pages/CheckinQr'),
}

const WaiterTables = lazy(() => import('./pages/WaiterTables'))
const WaiterOrder = lazy(() => import('./pages/WaiterOrder'))
const KitchenCheckReceipt = lazy(() => import('./pages/KitchenCheckReceipt'))
const CashierTables = lazy(() => import('./pages/CashierTables'))
const CashierBill = lazy(() => import('./pages/CashierBill'))
const Receipt = lazy(() => import('./pages/Receipt'))
const TableReceipt = lazy(() => import('./pages/Receipt').then(module => ({ default: module.TableReceipt })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminMenu = lazy(() => import('./pages/AdminMenu'))
const TechCards = lazy(() => import('./pages/TechCards'))
const AdminTables = lazy(() => import('./pages/AdminTables'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminLoyalty = lazy(() => import('./pages/AdminLoyalty'))
const Expenses = lazy(() => import('./pages/Expenses'))
const DailyBazaar = lazy(() => import('./pages/DailyBazaar'))
const IngredientUsage = lazy(() => import('./pages/IngredientUsage'))
const BazaarIngredients = lazy(() => import('./pages/BazaarIngredients'))
const AccountingHistory = lazy(() => import('./pages/AccountingHistory'))
const AccountingAnalysis = lazy(() => import('./pages/AccountingAnalysis'))
const Salaries = lazy(() => import('./pages/Salaries'))
const MonthlyEstimate = lazy(() => import('./pages/MonthlyEstimate'))
const Employees = lazy(() => import('./pages/Employees'))
const EmployeeSalaryHistory = lazy(() => import('./pages/EmployeeSalaryHistory'))
const Reports = lazy(() => import('./pages/Reports'))
const AdminAudit = lazy(() => import('./pages/AdminAudit'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AttendanceKiosk = lazy(() => import('./pages/AttendanceKiosk'))
const CheckinQr = lazy(() => import('./pages/CheckinQr'))

function defaultPath(role) {
  return roleDefaultPath(role)
}

function defaultPathForHost(profile, adminHost = isAdminHost()) {
  const path = defaultPath(profile)
  return adminHost && path === '/menu' ? '/pending-approval' : path
}

function sanitizeReturnTo(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

function currentHostname() {
  return String(globalThis.location?.hostname || '').toLowerCase()
}

function isPublicCustomerHost(hostname = currentHostname()) {
  return PUBLIC_HOSTNAMES.has(String(hostname || '').toLowerCase())
}

function isAdminHost(hostname = currentHostname()) {
  return String(hostname || '').toLowerCase() === ADMIN_HOSTNAME
}

function adminUrlForLocation(location = globalThis.location) {
  return `https://${ADMIN_HOSTNAME}${location?.pathname || '/'}${location?.search || ''}${location?.hash || ''}`
}

// Syncs the Supabase profile into AppContext so POS pages keep working
function ProfileSync() {
  const { profile } = useAuth()
  const { dispatch } = useApp()
  useEffect(() => {
    if (profile) {
      dispatch({
        type: 'LOGIN',
        payload: {
          id: profile.id,
          role: profile.role || 'guest',
          name: profile.full_name || profile.email,
          email: profile.email,
        },
      })
    } else {
      dispatch({ type: 'LOGIN', payload: { role: 'guest', name: 'Guest' } })
    }
  }, [profile?.id, profile?.role, profile?.full_name, profile?.email, dispatch])
  return null
}

// Full-screen loader
function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <Loader2 size={32} className="animate-spin text-[#ff5a00]" />
    </div>
  )
}

function ProfileLoadError() {
  const { state } = useApp()
  const { authError, session, refreshAuth, refreshProfile, signOut } = useAuth()
  const lang = state.lang || 'ru'
  const [retrying, setRetrying] = React.useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      if (authError || !session) {
        await refreshAuth()
      } else {
        await refreshProfile()
      }
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center max-w-sm w-full">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Loader2 size={26} className="text-amber-500" />
        </div>
        <h2 className="font-black text-[#141414] mb-2">{t(lang, 'profileLoadFailed')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full border-2 border-[#ff5a00] text-[#ff5a00] rounded-xl py-3 font-bold text-sm hover:bg-orange-50 transition-colors disabled:opacity-60"
          >
            {retrying ? t(lang, 'waiting') : t(lang, 'checkStatus')}
          </button>
          <button
            onClick={signOut}
            className="w-full text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
          >
            {t(lang, 'signOutAndTryAgain')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Disabled account screen
function DisabledAccount({ signOut }) {
  const { state } = useApp()
  const lang = state.lang || 'ru'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-10 text-center max-w-sm w-full">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <span className="text-2xl">🚫</span>
        </div>
        <h2 className="font-black text-[#141414] text-lg mb-2">{t(lang, 'accountDisabled')}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t(lang, 'accountDisabledMessage')}
        </p>
        <button
          onClick={signOut}
          className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors"
        >
          {t(lang, 'logout')}
        </button>
      </div>
    </div>
  )
}

// Route guard: requires authentication + optional role check
function ProtectedRoute({ children, page }) {
  const { session, profile, profileError, authError, loading } = useAuth()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (loading) return <AppShellShimmer />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  if (!profile) return <AppShellShimmer />

  if (profile?.status === 'disabled') return null // handled by RoleRedirect
  if (profile?.status === 'pending')  return <Navigate to="/pending-approval" replace />

  const allowed = Array.isArray(page)
    ? page.some(pageKey => canViewPage(profile, pageKey))
    : !page || canViewPage(profile, page)
  if (!allowed) {
    return <Navigate to={defaultPathForHost(profile)} replace />
  }

  return children
}

function SignedOutRoute({ children }) {
  const { session, profile, profileError, authError, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'))

  if (loading) return <Spinner />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return children
  if (!profile) return <Spinner />
  return <Navigate to={returnTo || defaultPathForHost(profile || 'guest')} replace />
}

// Page code suspends into the one Suspense boundary around the staff routes.
// Navigation runs in a transition (BrowserRouter v7_startTransition), so the
// current page stays on screen until the next one is ready instead of a loader.
function LazyProtectedRoute({ page, children }) {
  return <ProtectedRoute page={page}>{children}</ProtectedRoute>
}

function PreloadStaffPages() {
  const { profile } = useAuth()
  const signedIn = Boolean(profile?.id)
  useEffect(() => {
    if (!signedIn) return undefined
    const idle = globalThis.requestIdleCallback || (callback => setTimeout(callback, 1200))
    const cancel = globalThis.cancelIdleCallback || clearTimeout
    const handle = idle(() => {
      Object.values(STAFF_PAGES).forEach(load => load().catch(() => { /* retried on navigation */ }))
    })
    return () => cancel(handle)
  }, [signedIn])
  return null
}

function GuestModeRouteLock({ children }) {
  const guestModeSession = useGuestModeSession()

  useEffect(() => {
    if (guestModeSession) clearGuestModeSession()
  }, [guestModeSession?.id])

  return guestModeSession ? <Spinner /> : children
}

// Decides where to send user after login
function RoleRedirect({ signedOutPath = '/menu' }) {
  const { session, profile, profileError, authError, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [profileTimeout, setProfileTimeout] = React.useState(false)
  const { state } = useApp()
  const lang = state.lang || 'ru'

  useEffect(() => {
    if (loading) return
    if (authError) return
    if (profileError) return
    if (!session) { navigate(signedOutPath, { replace: true }); return }
    if (!profile) return
    if (profile?.status === 'disabled') return
    if (profile?.status === 'pending') { navigate('/pending-approval', { replace: true }); return }
    navigate(defaultPathForHost(profile), { replace: true })
  }, [session, profile, profileError, authError, loading, navigate])

  // If session exists but profile never loads, show a retry option
  useEffect(() => {
    if (!session || profile || profileError || loading) return
    const t = setTimeout(() => setProfileTimeout(true), 6000)
    return () => clearTimeout(t)
  }, [session, profile, profileError, loading])

  if (loading) return <Spinner />
  if (authError) return <ProfileLoadError />
  if (profileError) return <ProfileLoadError />
  if (!session) return <Navigate to={signedOutPath} replace />
  if (profile?.status === 'disabled') return <DisabledAccount signOut={signOut} />

  if (profileTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center max-w-sm w-full">
          <div className="text-3xl mb-4">⚠️</div>
          <h2 className="font-black text-[#141414] mb-2">{t(lang, 'profileLoadFailed')}</h2>
          <p className="text-sm text-gray-500 mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
          <button onClick={signOut}
            className="w-full bg-[#141414] text-white rounded-xl py-3 font-bold text-sm hover:bg-black transition-colors">
            {t(lang, 'signOutAndTryAgain')}
          </button>
        </div>
      </div>
    )
  }

  if (!profile) return <Spinner />

  return <Spinner />
}

function PublicHostAdminRedirect() {
  useEffect(() => {
    globalThis.location?.replace?.(adminUrlForLocation(globalThis.location))
  }, [])
  return <Spinner />
}

function PublicCustomerRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicMenu />} />
      <Route path="/menu" element={<PublicMenu />} />
      <Route path="/menu/item/:itemId" element={<PublicMenu />} />
      <Route path="/search" element={<PublicMenu searchMode />} />
      <Route path="/corporate-sets" element={<PublicMenu corporateSets />} />
      <Route path="/corporate-sets/item/:itemId" element={<PublicMenu corporateSets />} />
      <Route path="/premium-menu" element={<PublicMenu premium />} />
      <Route path="/premium-menu/item/:itemId" element={<PublicMenu premium />} />
      <Route path="/catering" element={<CateringPage />} />
      <Route path="/vacancies" element={<PublicVacancies />} />
      <Route path="/vacancies/:vacancyId" element={<PublicVacancies />} />
      <Route path="/telegram" element={<TelegramMiniApp />} />
      <Route path="/login" element={<PublicHostAdminRedirect />} />
      <Route path="/auth/callback" element={<PublicHostAdminRedirect />} />
      <Route path="/reset-password" element={<PublicHostAdminRedirect />} />
      <Route path="/pending-approval" element={<PublicHostAdminRedirect />} />
      <Route path="/admin" element={<PublicHostAdminRedirect />} />
      <Route path="/admin/*" element={<PublicHostAdminRedirect />} />
      <Route path="/waiter/*" element={<PublicHostAdminRedirect />} />
      <Route path="/cashier/*" element={<PublicHostAdminRedirect />} />
      <Route path="/receipt/*" element={<PublicHostAdminRedirect />} />
      <Route path="/kitchen" element={<PublicHostAdminRedirect />} />
      <Route path="/kitchen-check/*" element={<PublicHostAdminRedirect />} />
      <Route path="/checkin-screen" element={<PublicHostAdminRedirect />} />
      <Route path="/checkin-qr" element={<PublicHostAdminRedirect />} />
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  )
}

function InternalAppRoutes({ adminHost = false }) {
  const signedOutPath = adminHost ? '/admin' : '/menu'

  return (
    <Suspense fallback={<AppShellShimmer />}>
    <Routes>
        {/* Public */}
        <Route path="/"              element={adminHost ? <Navigate to="/admin" replace /> : <RoleRedirect signedOutPath={signedOutPath} />} />
        <Route path="/menu"          element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu />} />
        <Route path="/menu/item/:itemId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu />} />
        <Route path="/search"        element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu searchMode />} />
        <Route path="/corporate-sets"        element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu corporateSets />} />
        <Route path="/corporate-sets/item/:itemId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu corporateSets />} />
        <Route path="/premium-menu"          element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu premium />} />
        <Route path="/premium-menu/item/:itemId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicMenu premium />} />
        <Route path="/catering"      element={adminHost ? <Navigate to="/admin" replace /> : <CateringPage />} />
        <Route path="/vacancies"     element={adminHost ? <Navigate to="/admin" replace /> : <PublicVacancies />} />
        <Route path="/vacancies/:vacancyId" element={adminHost ? <Navigate to="/admin" replace /> : <PublicVacancies />} />
        <Route path="/telegram"      element={adminHost ? <Navigate to="/admin" replace /> : <TelegramMiniApp />} />
        <Route path="/login"         element={<SignedOutRoute><Login /></SignedOutRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        {/* Entrance check-in screen: signed out, authorized by its own screen key. */}
        <Route path="/checkin-screen" element={<AttendanceKiosk />} />
        {/* Any signed-in account; the page and database check the Settings list and time window. */}
        <Route path="/checkin-qr" element={
          <LazyProtectedRoute><CheckinQr /></LazyProtectedRoute>
        } />

        {/* Tables/order flow: visible to profiles with the tables feature. */}
        <Route path="/waiter/tables" element={
          <LazyProtectedRoute page="tables"><WaiterTables /></LazyProtectedRoute>
        } />
        <Route path="/waiter/order/:tableId" element={
          <LazyProtectedRoute page="tables"><WaiterOrder /></LazyProtectedRoute>
        } />
        <Route path="/waiter/take-away" element={
          <LazyProtectedRoute page="off_premise_orders"><WaiterOrder /></LazyProtectedRoute>
        } />
        <Route path="/kitchen-check/:orderId" element={
          <LazyProtectedRoute page="tables"><KitchenCheckReceipt /></LazyProtectedRoute>
        } />

        <Route path="/kitchen" element={<Navigate to="/admin" replace />} />

        {/* Cashier flow: visible to profiles with the cashier feature. */}
        <Route path="/cashier/tables" element={
          <LazyProtectedRoute page="cashier"><CashierTables /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/:tableId" element={
          <LazyProtectedRoute page={['cashier', 'tables']}><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/cashier/bill/order/:orderId" element={
          <LazyProtectedRoute page="cashier"><CashierBill /></LazyProtectedRoute>
        } />
        <Route path="/receipt/:orderId" element={
          <LazyProtectedRoute page={['cashier', 'tables']}><Receipt /></LazyProtectedRoute>
        } />
        <Route path="/receipt/table/:tableId" element={
          <LazyProtectedRoute page={['cashier', 'tables']}><TableReceipt /></LazyProtectedRoute>
        } />

        {/* Dashboard: visible to profiles with the dashboard feature. */}
        <Route path="/admin" element={
          <LazyProtectedRoute page="dashboard"><AdminDashboard /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu/product/:productId" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/menu/category/:categoryId" element={
          <LazyProtectedRoute page="menu"><AdminMenu /></LazyProtectedRoute>
        } />
        <Route path="/admin/tech-cards" element={
          <LazyProtectedRoute page="tech_cards"><TechCards /></LazyProtectedRoute>
        } />
        <Route path="/admin/tech-cards/:menuItemId" element={
          <LazyProtectedRoute page="tech_cards"><TechCards /></LazyProtectedRoute>
        } />
        <Route path="/admin/tables" element={
          <LazyProtectedRoute page="settings"><AdminTables /></LazyProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <LazyProtectedRoute page="team"><AdminUsers /></LazyProtectedRoute>
        } />
        <Route path="/admin/loyalty" element={
          <LazyProtectedRoute page="loyalty"><AdminLoyalty /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting" element={
          <LazyProtectedRoute page="expenses"><Expenses /></LazyProtectedRoute>
        } />
        <Route path="/admin/bazaar" element={
          <LazyProtectedRoute page="bazaar"><DailyBazaar /></LazyProtectedRoute>
        } />
        <Route path="/admin/bazaar/ingredients" element={<Navigate to="/admin/ingredients" replace />} />
        <Route path="/admin/ingredients/usage" element={
          <LazyProtectedRoute page="ingredients"><IngredientUsage /></LazyProtectedRoute>
        } />
        <Route path="/admin/ingredients" element={
          <LazyProtectedRoute page="ingredients"><BazaarIngredients /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/history" element={
          <LazyProtectedRoute page="expenses"><AccountingHistory /></LazyProtectedRoute>
        } />
        <Route path="/admin/financial-analysis" element={
          <LazyProtectedRoute page="financial_analysis"><AccountingAnalysis /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/analysis" element={<Navigate to="/admin/financial-analysis" replace />} />
        <Route path="/admin/accounting/estimate" element={<Navigate to="/admin/financial-analysis/estimate" replace />} />
        <Route path="/admin/accounting/salaries" element={
          <LazyProtectedRoute page="expenses"><Salaries /></LazyProtectedRoute>
        } />
        <Route path="/admin/financial-analysis/estimate" element={
          <LazyProtectedRoute page="financial_analysis"><MonthlyEstimate /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/employees" element={
          <LazyProtectedRoute page="expenses"><Employees /></LazyProtectedRoute>
        } />
        <Route path="/admin/accounting/employees/:employeeId/history" element={
          <LazyProtectedRoute page="expenses"><EmployeeSalaryHistory /></LazyProtectedRoute>
        } />
        <Route path="/admin/expenses" element={<Navigate to="/admin/accounting" replace />} />
        <Route path="/admin/expenses/salaries" element={<Navigate to="/admin/accounting/salaries" replace />} />
        <Route path="/admin/expenses/estimate" element={<Navigate to="/admin/financial-analysis/estimate" replace />} />
        <Route path="/admin/expenses/employees" element={<Navigate to="/admin/accounting/employees" replace />} />
        <Route path="/admin/discount-cards" element={<Navigate to="/admin/loyalty" replace />} />
        <Route path="/admin/reports" element={
          <LazyProtectedRoute page="reports"><Reports /></LazyProtectedRoute>
        } />
        <Route path="/admin/audit" element={
          <LazyProtectedRoute page="audit"><AdminAudit /></LazyProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <LazyProtectedRoute page="settings"><AdminSettings /></LazyProtectedRoute>
        } />

        {/* Catch-all: redirect based on role */}
        <Route path="*" element={<RoleRedirect signedOutPath={signedOutPath} />} />
      </Routes>
    </Suspense>
  )
}

function AppRoutes() {
  const hostname = currentHostname()
  const publicOnlyHost = isPublicCustomerHost(hostname) && !isAdminHost(hostname)
  const adminHost = isAdminHost(hostname)

  return (
    <>
      <ProfileSync />
      {publicOnlyHost ? (
        <PublicCustomerRoutes />
      ) : (
        <GuestModeRouteLock>
          <PreloadStaffPages />
          <InternalAppRoutes adminHost={adminHost} />
        </GuestModeRouteLock>
      )}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </AuthProvider>
  )
}

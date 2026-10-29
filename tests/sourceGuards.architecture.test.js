import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { functionBody, readSource, root, sourceFiles } from './helpers/sourceGuard.js'

test('App ProfileSync depends on stable profile fields and dispatch', () => {
  const source = readSource('src/App.jsx')
  const body = functionBody(source, 'ProfileSync')

  assert.match(body, /\[profile\?\.id,\s*profile\?\.role,\s*profile\?\.full_name,\s*profile\?\.email,\s*dispatch\]/)
})

test('App waits for profile before role-based route redirects', () => {
  const source = readSource('src/App.jsx')
  const protectedRoute = functionBody(source, 'ProtectedRoute')
  const roleRedirect = functionBody(source, 'RoleRedirect')
  const signedOutRoute = functionBody(source, 'SignedOutRoute')

  assert.match(protectedRoute, /if \(authError\) return <ProfileLoadError \/>/)
  assert.match(protectedRoute, /if \(!profile\) return <AppShellShimmer \/>/)
  assert.match(protectedRoute, /defaultPathForHost\(profile\)/)
  assert.match(signedOutRoute, /if \(authError\) return <ProfileLoadError \/>/)
  assert.match(signedOutRoute, /defaultPathForHost\(profile \|\| 'guest'\)/)
  assert.match(roleRedirect, /if \(authError\) return/)
  assert.match(roleRedirect, /if \(authError\) return <ProfileLoadError \/>/)
  assert.match(roleRedirect, /if \(!profile\) return/)
  assert.match(roleRedirect, /defaultPathForHost\(profile\)/)
})

test('auth startup timeout does not redirect protected staff routes to login', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const app = readSource('src/App.jsx')
  const protectedRoute = functionBody(app, 'ProtectedRoute')
  const signedOutRoute = functionBody(app, 'SignedOutRoute')
  const roleRedirect = functionBody(app, 'RoleRedirect')

  assert.match(auth, /const \[authError, setAuthError\] = useState\(null\)/)
  assert.match(auth, /Session lookup timed out/)
  assert.match(auth, /failAuthSession\(error\)/)
  assert.match(auth, /if \(event === 'INITIAL_SESSION' && !nextSession\) return/)
  assert.doesNotMatch(auth, /setTimeout\(\(\) => \{\s*setLoading\(false\)\s*\}, 4000\)/)
  assert.match(protectedRoute, /if \(authError\) return <ProfileLoadError \/>[\s\S]*if \(!session\) return <Navigate/)
  assert.match(signedOutRoute, /if \(authError\) return <ProfileLoadError \/>[\s\S]*if \(!session\) return children/)
  assert.match(roleRedirect, /if \(authError\) return[\s\S]*if \(!session\) \{ navigate\(signedOutPath/)
  assert.match(roleRedirect, /if \(authError\) return <ProfileLoadError \/>[\s\S]*if \(!session\) return <Navigate/)
})

test('protected deep links preserve their target through login', () => {
  const app = readSource('src/App.jsx')
  const login = readSource('src/pages/Login.jsx')
  const auth = readSource('src/contexts/AuthContext.jsx')
  const callback = readSource('src/pages/AuthCallback.jsx')
  const protectedRoute = functionBody(app, 'ProtectedRoute')

  assert.match(app, /function sanitizeReturnTo/)
  assert.match(protectedRoute, /const returnTo = `\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`/)
  assert.match(protectedRoute, /\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/)
  assert.match(login, /navigate\(returnTo \|\| '\/', \{ replace: true \}\)/)
  assert.match(login, /signInWithGoogle\(returnTo\)/)
  assert.match(auth, /const OAUTH_RETURN_TO_KEY = 'zk_oauth_return_to'/)
  assert.match(auth, /window\.sessionStorage\.setItem\(OAUTH_RETURN_TO_KEY, target\)/)
  assert.match(auth, /options: \{ redirectTo: redirectUrl\.toString\(\) \}/)
  assert.doesNotMatch(auth, /redirectUrl\.searchParams\.set\('returnTo', returnTo\)/)
  assert.match(callback, /const OAUTH_RETURN_TO_KEY = 'zk_oauth_return_to'/)
  assert.match(callback, /function readStoredReturnTo\(\)/)
  assert.match(callback, /window\.sessionStorage\.removeItem\(OAUTH_RETURN_TO_KEY\)/)
  assert.match(callback, /url\.searchParams\.get\('returnTo'\) \|\| readStoredReturnTo\(\)/)
  assert.match(callback, /supabase\.auth\.exchangeCodeForSession\(code\)/)
  assert.match(callback, /function completeCodeSignIn\(\)/)
  assert.match(callback, /const hashParams\s+= new URLSearchParams\(url\.hash\.replace\(\W\^#\W, ''\)\)/)
  assert.match(callback, /function completeHashSignIn\(\)/)
  assert.match(callback, /supabase\.auth\.setSession\(\{[\s\S]*access_token: accessToken,[\s\S]*refresh_token: refreshToken/)
  assert.match(callback, /finish\(returnTo \|\| '\/'\)/)
})

test('App splits customer and admin hostnames', () => {
  const app = readSource('src/App.jsx')
  const publicRoutes = functionBody(app, 'PublicCustomerRoutes')
  const internalRoutes = functionBody(app, 'InternalAppRoutes')
  const appRoutes = functionBody(app, 'AppRoutes')
  const redirect = functionBody(app, 'PublicHostAdminRedirect')

  assert.match(app, /const ADMIN_HOSTNAME = 'admin\.zarkebab\.uz'/)
  assert.match(app, /const PUBLIC_HOSTNAMES = new Set\(\['zarkebab\.uz', 'www\.zarkebab\.uz'\]\)/)
  assert.match(app, /function currentHostname\(\)/)
  assert.match(app, /function isPublicCustomerHost\(hostname = currentHostname\(\)\)/)
  assert.match(app, /function isAdminHost\(hostname = currentHostname\(\)\)/)
  assert.match(app, /function defaultPathForHost\(profile, adminHost = isAdminHost\(\)\)/)
  assert.match(app, /return adminHost && path === '\/menu' \? '\/pending-approval' : path/)
  assert.match(app, /function adminUrlForLocation\(location = globalThis\.location\)/)
  assert.match(redirect, /globalThis\.location\?\.replace\?\.\(adminUrlForLocation\(globalThis\.location\)\)/)
  assert.match(publicRoutes, /<Route path="\/admin" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/admin\/\*" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/waiter\/\*" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/cashier\/\*" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/receipt\/\*" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/login" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\/auth\/callback" element=\{<PublicHostAdminRedirect \/>\} \/>/)
  assert.match(publicRoutes, /<Route path="\*" element=\{<Navigate to="\/menu" replace \/>\} \/>/)
  assert.doesNotMatch(publicRoutes, /LazyProtectedRoute/)
  assert.match(internalRoutes, /const signedOutPath = adminHost \? '\/admin' : '\/menu'/)
  assert.match(internalRoutes, /<Route path="\/"[\s\S]*adminHost \? <Navigate to="\/admin" replace \/> : <RoleRedirect signedOutPath=\{signedOutPath\} \/>/)
  assert.match(internalRoutes, /<Route path="\/menu"[\s\S]*adminHost \? <Navigate to="\/admin" replace \/> : <PublicMenu \/>/)
  assert.match(internalRoutes, /<Route path="\/login"[\s\S]*<Login \/>/)
  assert.match(internalRoutes, /<Route path="\/admin" element=/)
  assert.match(internalRoutes, /<Route path="\/cashier\/tables" element=/)
  assert.match(internalRoutes, /<Route path="\/waiter\/tables" element=/)
  assert.match(appRoutes, /const publicOnlyHost = isPublicCustomerHost\(hostname\) && !isAdminHost\(hostname\)/)
  assert.match(appRoutes, /const adminHost = isAdminHost\(hostname\)/)
  assert.match(appRoutes, /\{publicOnlyHost \? \([\s\S]*?<PublicCustomerRoutes \/>[\s\S]*?<GuestModeRouteLock>[\s\S]*?<InternalAppRoutes adminHost=\{adminHost\} \/>/)
})

test('AppContext exposes a stable dbDispatch callback', () => {
  const source = readSource('src/store/AppContext.jsx')

  assert.match(source, /const dbDispatch = useCallback\(function dbDispatch\(action\)/)
  assert.match(source, /import React, \{[^}]*useCallback[^}]*\} from 'react'/)
})

test('waiter cart edits stay local until send to kitchen', () => {
  const source = readSource('src/store/AppContext.jsx')
  const body = functionBody(source, 'dbDispatch')

  assert.match(source, /const LOCAL_ONLY_ACTIONS = new Set\(\[/)
  assert.match(source, /'ADD_TO_CART'/)
  assert.match(source, /'REMOVE_FROM_CART'/)
  assert.match(source, /'UPDATE_CART_QTY'/)
  assert.match(source, /'UPDATE_CART_NOTES'/)
  assert.match(source, /'CLEAR_CART'/)
  assert.match(body, /if \(LOCAL_ONLY_ACTIONS\.has\(enriched\.type\)\) \{[\s\S]*dispatch\(enriched\)[\s\S]*return \{ error: null, action: enriched \}/)
  assert.match(source, /'SEND_TO_KITCHEN'/)
})

test('waiter bill item quantity edits update optimistically', () => {
  const source = readSource('src/store/AppContext.jsx')
  const writeBeforeBlock = source.slice(
    source.indexOf('const WRITE_BEFORE_LOCAL_ACTIONS'),
    source.indexOf('const LOCAL_ONLY_ACTIONS')
  )
  const body = functionBody(source, 'dbDispatch')

  assert.doesNotMatch(writeBeforeBlock, /'UPDATE_BILL_ITEM_QTY'/)
  assert.match(body, /dispatch\(enriched\)[\s\S]*return writeWithIdleRecovery\(enriched, stateRef\.current\)/)
})

test('new signed-up users always start as pending guests with repair coverage', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const migration = readSource('migrations/091_repair_missing_auth_profiles.sql')

  assert.match(auth, /data: \{ full_name: normalizedName, role: 'guest' \}/)
  assert.match(migration, /public\.handle_new_user/)
  assert.match(migration, /'guest',\s*\n\s*'pending'/)
  assert.match(migration, /insert into public\.profiles[\s\S]*from auth\.users as users/)
  assert.match(migration, /where not exists \([\s\S]*profiles\.id = users\.id/)
  assert.match(migration, /public\.profile_audit as audit[\s\S]*audit\.action = 'profile_deleted'/)
  assert.match(migration, /audit\.changed_at >= coalesce\(users\.last_sign_in_at/)
  assert.doesNotMatch(migration, /raw_user_meta_data->>'role'/)
})

test('email password signup uses server registration instead of Supabase email throttling', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const login = readSource('src/pages/Login.jsx')
  const api = readSource('api/auth/register.js')
  const vite = readSource('vite.config.js')
  const signup = functionBody(auth, 'signUpWithEmail')
  const submit = functionBody(login, 'handleSubmit')

  assert.match(api, /supabase\.auth\.admin\.createUser\(\{[\s\S]*email_confirm: true/)
  assert.match(api, /role: 'guest'/)
  assert.match(api, /status: 'pending'/)
  assert.match(api, /\.from\('profiles'\)[\s\S]*\.upsert\(/)
  assert.match(vite, /import registerAuth from '\.\/api\/auth\/register\.js'/)
  assert.match(vite, /server\.middlewares\.use\('\/api\/auth\/register'/)
  assert.match(signup, /fetch\('\/api\/auth\/register'/)
  assert.match(signup, /const signInResult = await signInWithEmail\(normalizedEmail, password\)/)
  assert.match(signup, /emailRedirectTo: `\$\{globalThis\.location\?\.origin \|\| ''\}\/auth\/callback`/)
  assert.match(submit, /if \(data\?\.session\) \{[\s\S]*navigate\(returnTo \|\| '\/', \{ replace: true \}\)/)
  assert.match(submit, /setMode\('signin'\)[\s\S]*setInfo\(t\(lang, 'accountCreated'\)\)/)
})

test('only a missing auth profile falls back to pending approval', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const supabase = readSource('src/lib/supabase.js')
  const fallback = functionBody(auth, 'fallbackProfileFromUser')

  assert.match(auth, /const next = data \|\| fallbackProfileFromUser\(user\)/)
  assert.match(auth, /const \[profileError, setProfileError\] = useState\(null\)/)
  assert.match(auth, /catch \(error\) \{[\s\S]*setProfile\(null\)[\s\S]*setProfileError\(error\)/)
  assert.match(supabase, /\.maybeSingle\(\)/)
  assert.match(supabase, /if \(error\) throw error/)
  assert.match(auth, /function fallbackProfileFromUser\(user, status = 'pending'\)/)
  assert.match(fallback, /role: 'guest'/)
  assert.doesNotMatch(fallback, /status: 'active'/)
})

test('auth profile loading deduplicates startup reads and tolerates transient failures', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const supabase = readSource('src/lib/supabase.js')
  const loader = readSource('src/lib/profileLoading.js')
  const loadProfile = functionBody(auth, 'loadProfile')
  const applyAuthSession = functionBody(auth, 'applyAuthSession')

  assert.match(auth, /const profileLoadRef = useRef\(null\)/)
  assert.match(loadProfile, /if \(inFlight\?\.userId === user\.id\) return inFlight\.promise/)
  assert.match(loadProfile, /loadProfileWithRetry\(\(\) => withReadTimeout\(/)
  assert.match(loadProfile, /signal => getProfile\(user\.id, \{ signal \}\)/)
  assert.match(loadProfile, /current\?\.id === user\.id && isRetryableProfileLoadError\(error\)/)
  assert.match(loadProfile, /profileRequestIdRef\.current !== requestId/)
  assert.match(applyAuthSession, /if \(current\?\.id === nextSession\.user\.id\)[\s\S]*return current/)
  assert.match(auth, /window\.addEventListener\('online', retryProfileWhenOnline\)/)
  assert.match(supabase, /if \(signal\) query = query\.abortSignal\(signal\)/)
  assert.match(loader, /status === 401/)
  assert.match(loader, /message\.includes\('failed to fetch'\)/)
})

test('PendingApproval redirects approved users to their workspace route', () => {
  const pending = readSource('src/pages/PendingApproval.jsx')
  const approvedTarget = functionBody(pending, 'approvedTarget')

  assert.match(pending, /import \{ useNavigate \} from 'react-router-dom'/)
  assert.match(pending, /import \{ defaultPath \} from '..\/lib\/permissions'/)
  assert.match(approvedTarget, /nextProfile\?\.status !== 'active'/)
  assert.match(approvedTarget, /const path = defaultPath\(nextProfile\)/)
  assert.match(approvedTarget, /return path === '\/menu' \? '' : path/)
  assert.match(pending, /React\.useEffect\(\(\) => \{[\s\S]*navigate\(path, \{ replace: true \}\)/)
  assert.match(pending, /const nextProfile = await refreshProfile\(\)[\s\S]*navigate\(path, \{ replace: true \}\)/)
})

test('PendingApproval logout clears local auth state and returns to login', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const pending = readSource('src/pages/PendingApproval.jsx')
  const signOut = functionBody(auth, 'signOut')
  const handleLogout = functionBody(pending, 'handleLogout')

  assert.match(signOut, /try \{[\s\S]*supabase\.auth\.signOut\(\)[\s\S]*\} finally \{[\s\S]*setSession\(null\)/)
  assert.match(handleLogout, /await signOut\(\)/)
  assert.match(handleLogout, /finally \{[\s\S]*navigate\('\/login', \{ replace: true \}\)/)
  assert.equal((pending.match(/onClick=\{handleLogout\}/g) || []).length, 2)
})

test('AdminUsers exposes role and status approval controls for editable staff', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const permissions = readSource('src/lib/permissions.js')

  assert.match(adminUsers, /assignableRoles/)
  assert.match(adminUsers, /canEditTeamMember/)
  assert.match(adminUsers, /const canEditRoleStatus = !isMe && canEditTeamMember\(myRole, user\.role\)/)
  assert.match(adminUsers, /handleChange\(user\.id, 'role', e\.target\.value\)/)
  assert.match(adminUsers, /handleChange\(user\.id, 'status', e\.target\.value\)/)
  assert.match(adminUsers, /if \(field === 'role' && !assignableRoles\(myRole\)\.includes\(value\)\) return/)
  assert.doesNotMatch(adminUsers, /const canEdit\s+= !isMe && canEditAccess/)
  assert.match(permissions, /if \(role === 'admin'\) return \['viewer', 'guest'\]/)
})

test('AdminUsers lets owners rename employees without changing historical order names', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const saveNameBody = functionBody(adminUsers, 'saveName')

  assert.match(adminUsers, /const \[editingNameId, setEditingNameId\] = useState\(null\)/)
  assert.match(adminUsers, /myRole === 'owner'/)
  assert.match(functionBody(adminUsers, 'openMember'), /if \(myRole === 'owner'\) startNameEdit\(user\)/)
  assert.doesNotMatch(adminUsers, /Pencil/)
  assert.match(saveNameBody, /updateProfile\(user\.id, \{ full_name: fullName \}\)/)
  assert.doesNotMatch(saveNameBody, /orders/)
})

test('AdminUsers rows open a member dialog instead of cramming actions into the table', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')

  assert.match(adminUsers, /className="w-full px-4 py-5 sm:px-5 lg:px-6"/)
  assert.match(adminUsers, /md:grid-cols-\[40px_minmax\(0,1fr\)_120px_96px_20px\]/)
  assert.match(adminUsers, /onClick=\{\(\) => openMember\(user\)\}/)
  assert.match(adminUsers, /aria-haspopup="dialog"/)
  assert.match(adminUsers, /\{openUser && renderMemberDialog\(openUser\)\}/)
  assert.match(adminUsers, /role="dialog" aria-modal="true" aria-labelledby="team-member-title"/)
  assert.doesNotMatch(adminUsers, /minmax\(540px,580px\)/)
  assert.doesNotMatch(adminUsers, /max-w-5xl/)
  assert.doesNotMatch(adminUsers, /grid-cols-\[1fr_110px_480px\]/)
})

test('Supabase browser reads bypass HTTP cache for live POS data', () => {
  const supabase = readSource('src/lib/supabase.js')

  assert.match(supabase, /function withNoCacheHeaders\(headers\)/)
  assert.match(supabase, /new Headers\(headers \|\| \{\}\)/)
  assert.match(supabase, /global:\s*\{\s*fetch:/)
  assert.match(supabase, /cache: 'no-store'/)
  assert.match(supabase, /next\.set\('Cache-Control', 'no-cache'\)/)
  assert.match(supabase, /next\.set\('Pragma', 'no-cache'\)/)
  assert.doesNotMatch(supabase, /\.\.\.\(init\.headers \|\| \{\}\)/)
})

test('Supabase OAuth uses app-owned PKCE exchange and keeps implicit hash fallback supported', () => {
  const supabase = readSource('src/lib/supabase.js')
  const callback = readSource('src/pages/AuthCallback.jsx')

  assert.match(supabase, /auth:\s*\{[\s\S]*flowType: 'pkce'/)
  assert.match(supabase, /detectSessionInUrl: false/)
  assert.match(supabase, /persistSession: true/)
  assert.match(supabase, /autoRefreshToken: true/)
  assert.match(callback, /supabase\.auth\.exchangeCodeForSession\(code\)/)
  assert.match(callback, /hashParams\.get\('access_token'\)/)
  assert.match(callback, /hashParams\.get\('refresh_token'\)/)
})

test('AdminUsers permanently deletes auth accounts while preserving historical order names', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const supabase = readSource('src/lib/supabase.js')
  const permissions = readSource('src/lib/permissions.js')
  const deleteUserApi = readSource('api/auth/delete-user.js')
  const vite = readSource('vite.config.js')
  const migration = readSource('migrations/025_owner_delete_profiles.sql')
  const roleAccessMigration = readSource('migrations/077_four_role_feature_access.sql')

  assert.match(adminUsers, /deleteProfile/)
  assert.match(adminUsers, /canDeleteTeamMember/)
  assert.match(adminUsers, /confirmDeleteId/)
  assert.match(adminUsers, /Old order names stay preserved; registering again creates a new request/)
  assert.match(supabase, /fetch\('\/api\/auth\/delete-user'/)
  assert.match(supabase, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.doesNotMatch(supabase, /\.from\('profiles'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('id', userId\)/)
  assert.match(deleteUserApi, /supabase\.auth\.getUser\(token\)/)
  assert.match(deleteUserApi, /requester\.status !== 'active'/)
  assert.match(deleteUserApi, /requester\.role !== 'owner'/)
  assert.match(deleteUserApi, /requester\.id === targetId/)
  assert.match(deleteUserApi, /target\.role === 'owner'/)
  assert.match(deleteUserApi, /supabase\.auth\.admin\.deleteUser\(targetId\)/)
  assert.match(vite, /server\.middlewares\.use\('\/api\/auth\/delete-user'/)
  assert.match(permissions, /function canDeleteTeamMember/)
  assert.match(permissions, /viewer !== 'owner'/)
  assert.match(permissions, /return target !== 'owner'/)
  assert.match(migration, /on public\.profiles for delete/)
  assert.match(roleAccessMigration, /create policy "Owner: delete staff profiles"/)
  assert.match(roleAccessMigration, /role <> 'owner'/)
  assert.match(migration, /waiter_name/)
  assert.doesNotMatch(adminUsers, /\.from\('orders'\)\.delete/)
})

test('AdminUsers keeps genuine pending requests in a separate bottom section', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const grouping = readSource('src/lib/teamProfiles.js')

  assert.match(adminUsers, /groupTeamProfiles\(users, search, statusFilter\)/)
  assert.match(adminUsers, /const displayedUsers = \[\.\.\.members, \.\.\.pendingRequests\]/)
  assert.match(adminUsers, /pendingRequests: 'Pending requests'/)
  assert.match(adminUsers, /pendingHelp: 'New accounts appear here until an owner approves them\.'/)
  assert.match(adminUsers, /startsPendingSection/)
  assert.match(adminUsers, /l\.members\(members\.length\)/)
  assert.match(adminUsers, /value === 'pending' && target\.status !== 'pending'/)
  assert.match(adminUsers, /user\.status === 'pending' \? STATUSES : \['active', 'disabled'\]/)
  assert.match(grouping, /members: filtered\.filter\(profile => profile\.status !== 'pending'\)/)
  assert.match(grouping, /pendingRequests: filtered\.filter\(profile => profile\.status === 'pending'\)/)
})

test('Team member rows show ordered numbers', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')

  assert.match(adminUsers, />#<\/p>/)
  assert.match(adminUsers, /\{index \+ 1\}/)
  assert.match(adminUsers, /md:grid-cols-\[40px_minmax\(0,1fr\)_120px_96px_20px\]/)
})

test('AdminUsers can safely remove every still-pending request', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const supabase = readSource('src/lib/supabase.js')
  const deleteUserApi = readSource('api/auth/delete-user.js')
  const removeAll = functionBody(adminUsers, 'handleRemoveAllPending')

  assert.match(adminUsers, /removeAll: 'Remove all'/)
  assert.match(adminUsers, /confirmRemoveAllPending/)
  assert.match(adminUsers, /onClick=\{handleRemoveAllPending\}/)
  assert.match(removeAll, /user\.status === 'pending'/)
  assert.match(removeAll, /canDeleteTeamMember\(myProfile, user, user\.id === myProfile\?\.id\)/)
  assert.match(removeAll, /deleteProfile\(target\.id, \{ expectedStatus: 'pending' \}\)/)
  assert.match(removeAll, /for \(const target of targets\)/)
  assert.match(supabase, /JSON\.stringify\(\{ userId, \.\.\.\(expectedStatus \? \{ expectedStatus \} : \{\}\) \}\)/)
  assert.match(deleteUserApi, /expectedStatus && target\.status !== expectedStatus/)
  assert.match(deleteUserApi, /expectedStatus && expectedStatus !== 'pending'/)
  assert.match(deleteUserApi, /authorizeTeamMemberDeletion\(requester, target, targetId, expectedStatus\)/)
})

test('global AppShell mobile drawer overlays content consistently', () => {
  const shell = readSource('src/components/AppShell.jsx')
  const drawer = readSource('src/components/MobileDrawer.jsx')
  const sidebar = readSource('src/components/UnifiedSidebar.jsx')

  assert.match(shell, /hidden lg:block/)
  // Unpositioned, sr-only spans far down a long page escape the scroll area and let iOS scroll the bare body.
  assert.match(shell, /<div className="fixed inset-0 flex overflow-hidden/)
  assert.match(shell, /<main ref=\{contentRef\} className="relative flex-1 min-h-0 overflow-y-auto/)
  // A page-level scroller nested inside <main> stops scrolling and clips dropdowns on iOS Safari.
  const reports = readSource('src/pages/Reports.jsx')
  assert.match(reports, /<div className="flex min-h-full bg-\[#f6f5f3\]">/)
  assert.doesNotMatch(reports, /flex h-full overflow-hidden bg-\[#f6f5f3\]/)
  // The phone dish picker stacks categories above dishes, so the dish list must take the remaining height and scroll.
  assert.match(reports, /min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-\[440px\]/)
  // On phones the dish picker is a bottom sheet sized to the visible screen, not a dropdown that runs off it.
  assert.match(reports, /ws-dialog fixed inset-x-0 bottom-0 z-50 flex h-\[min\(640px,85dvh\)\]/)
  // iOS zooms into sub-16px fields on focus; touch screens get 16px form fields.
  assert.match(readSource('src/index.css'), /@media \(hover: none\) and \(pointer: coarse\) \{\s*input:not\(\[type="checkbox"\]\)/)
  assert.match(shell, /<MobileDrawer open=\{mobileOpen\} onClose=\{\(\) => setMobileOpen\(false\)\}>/)
  assert.match(drawer, /lg:hidden fixed inset-0 z-50 flex h-\[100dvh\]/)
  assert.match(drawer, /absolute inset-0 bg-black\/40/)
  assert.match(drawer, /onClick=\{onClose\}/)
  assert.match(drawer, /max-w-\[85vw\]/)
  // The drawer slides/fades instead of popping, and the desktop rail folds its width.
  assert.match(drawer, /open \? 'translate-x-0' : '-translate-x-full'/)
  assert.match(drawer, /inert=\{open \? undefined : ''\}/)
  assert.match(shell, /transition-\[width\] duration-300[\s\S]*?collapsed \? 'lg:w-0' : 'lg:w-64'/)
  for (const page of ['CashierTables', 'CashierBill', 'WaiterOrder']) {
    assert.match(readSource(`src/pages/${page}.jsx`), /<MobileDrawer open=\{sidebarOpen\}/, page)
  }
  assert.match(sidebar, /max-h-\[100dvh\]/)
  assert.match(sidebar, /w-\[min\(18rem,85vw\)\] lg:w-64/)
  assert.match(sidebar, /overflow-y-auto/)
})

test('realtime subscription uses unique channel names', () => {
  const source = readSource('src/lib/db.js')

  assert.match(source, /\.channel\(`pos-realtime-\$\{Date\.now\(\)\}-/)
  assert.doesNotMatch(source, /\.channel\('pos-realtime'\)/)
})

test('menu price changes refresh active staff and public menu sessions', () => {
  const db = readSource('src/lib/db.js')
  const publicMenu = readSource('src/pages/PublicMenu.jsx')

  assert.match(db, /export async function loadMenuCatalog/)
  assert.match(db, /table: 'menu_items' \}, scheduleReloadMenu/)
  assert.match(db, /table: 'menu_item_costs' \}, scheduleReloadMenu/)
  assert.match(db, /table: 'menu_categories' \}, scheduleReloadMenu/)
  assert.match(db, /dispatch\(\{ type: 'SET_MENU_ITEMS', payload: menuItems \}\)/)
  assert.match(publicMenu, /useCallback/)
  assert.match(publicMenu, /refreshPublicMenu\(\{ showLoading: false \}\)/)
  assert.match(publicMenu, /document\.addEventListener\('visibilitychange', refreshWhenActive\)/)
  assert.match(publicMenu, /window\.addEventListener\('focus', refreshWhenActive\)/)
  assert.match(publicMenu, /window\.addEventListener\('online', refreshWhenActive\)/)
})

test('AppContext recovers Supabase after browser idle or resume', () => {
  const appContext = readSource('src/store/AppContext.jsx')
  const db = readSource('src/lib/db.js')

  assert.match(db, /function isRecoverableIdleError/)
  assert.match(db, /function refreshSupabaseSession/)
  assert.match(db, /onConnectionIssue\(status\)/)
  assert.match(appContext, /writeWithIdleRecovery/)
  assert.match(appContext, /WRITE_BEFORE_LOCAL_ACTIONS/)
  assert.match(appContext, /'CONFIRM_ORDER_DELIVERED'/)
  assert.match(appContext, /'MARK_TABLE_NEEDS_BILL'/)
  assert.match(appContext, /withWriteTimeout\(signal => writeToSupabase\(action, stateSnapshot, \{ signal \}\), action\.type\)/)
  assert.match(appContext, /isWriteTimeoutError\(error\)/)
  assert.match(appContext, /async function writeKitchenAttempt\(action, stateSnapshot\)[\s\S]*waitForKitchenRoundSubmission\(action, \{[\s\S]*signal,[\s\S]*if \(committed\)/)
  assert.match(appContext, /isRecoverableIdleError\(error\)/)
  assert.match(appContext, /withWriteTimeout\(refreshSupabaseSession\(\), 'REFRESH_SESSION'\)/)
  assert.match(appContext, /function scheduleIdleRecovery/)
  // A broken channel backs off instead of reloading every second on every device.
  assert.match(appContext, /if \(reconnectTimer\) return\n\s*scheduleIdleRecovery\(realtimeRecoveryDelay\(realtimeFailures\)\)\n\s*realtimeFailures \+= 1/)
  assert.match(appContext, /if \(realtimeHealthy\) realtimeFailures = 0/)
  assert.doesNotMatch(appContext, /scheduleIdleRecovery\(1000\)/)
  assert.match(appContext, /Reconnecting\.\.\./)
  assert.match(appContext, /Back online\./)
  assert.match(appContext, /tone: 'success'/)
  assert.match(appContext, /function handleResume/)
  assert.match(appContext, /window\.addEventListener\('online', handleResume\)/)
  assert.match(appContext, /window\.addEventListener\('focus', handleResume\)/)
  assert.match(appContext, /document\.addEventListener\('visibilitychange', handleResume\)/)
  // Brief focus switches must not refresh the session and reload all POS data.
  assert.match(appContext, /shouldRecoverOnResume\(\{ eventType: event\?\.type, awayMs, realtimeHealthy \}\)/)
  assert.match(appContext, /window\.addEventListener\('blur', markAway\)/)
  assert.match(db, /onSubscribed\(\)/)
  // Signed-out visitors never load POS data or open the staff realtime channel.
  assert.match(appContext, /if \(authLoading\) return undefined\n[\s\S]{0,400}if \(!sessionUserId\) \{[\s\S]{0,200}return undefined\n    \}\n\n    let unsubscribe/)
  assert.match(appContext, /connectRealtime\(\)/)
  assert.match(appContext, /unsubscribe\(\)/)
})

test('source does not use console.log debugging', () => {
  const offenders = sourceFiles()
    .filter(file => /console\.log\(/.test(readFileSync(file, 'utf8')))
    .map(file => file.slice(root.length))

  assert.deepEqual(offenders, [])
})

test('source does not use blocking alert dialogs', () => {
  const offenders = sourceFiles()
    .filter(file => /(?:window\.)?alert\(/.test(readFileSync(file, 'utf8')))
    .map(file => file.slice(root.length))

  assert.deepEqual(offenders, [])
})

test('source uses shared date formatting instead of browser locale defaults', () => {
  const offenders = sourceFiles()
    .filter(file => /toLocale(?:Date|Time|String)|Intl\.DateTimeFormat/.test(readFileSync(file, 'utf8')))
    .map(file => file.slice(root.length))

  assert.deepEqual(offenders, [])
})

test('date formatting is centralized on Tashkent UTC plus five instead of device-local getters', () => {
  const source = readSource('src/lib/dateFormat.js')

  assert.match(source, /RESTAURANT_TIME_ZONE = 'Asia\/Tashkent'/)
  assert.match(source, /RESTAURANT_UTC_OFFSET = '\+05:00'/)
  assert.match(source, /RESTAURANT_UTC_OFFSET_MINUTES = 5 \* 60/)
  assert.match(source, /getUTCFullYear/)
  assert.match(source, /getUTCHours/)
  assert.doesNotMatch(source, /\.getFullYear\(\)|\.getMonth\(\)|\.getDate\(\)|\.getHours\(\)|\.getMinutes\(\)/)
})

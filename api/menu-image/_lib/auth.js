import { createClient } from '@supabase/supabase-js'

const ALLOWED_ROLES = new Set(['owner', 'admin'])
const FEATURE_ACCESS_MANAGER_EMAILS = new Set(['dangerhoggish@gmail.com'])

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = [
    !url && 'SUPABASE_URL or VITE_SUPABASE_URL',
    !key && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length) {
    throw Object.assign(new Error(`Server misconfigured: missing ${missing.join(', ')}`), { status: 500 })
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function requireAdminRole(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match ? match[1] : ''
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAuthClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return user
}

// Inventory photos share these endpoints (the deployment is at its function
// limit) but an inventory holder may only touch inventory keys.
export function isInventoryMediaRequest(req) {
  return new URL(req.url || '/', 'http://localhost').searchParams.get('scope') === 'inventory'
}

async function loadMediaEditor(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match ? match[1] : ''
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 })

  const supabase = getSupabaseAuthClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status,email,feature_access')
    .eq('id', user.id)
    .maybeSingle()

  const access = Array.isArray(profile?.feature_access) ? profile.feature_access : null
  const isPrimaryOwner = profile?.role === 'owner'
    && FEATURE_ACCESS_MANAGER_EMAILS.has(String(profile?.email || '').trim().toLowerCase())
  const hasImplicitOwnerAccess = profile?.role === 'owner' && access === null
  return { user, profile, access, hasOwnerAccess: isPrimaryOwner || hasImplicitOwnerAccess }
}

export async function requireMenuEditAccess(req) {
  const { user, profile, access, hasOwnerAccess } = await loadMediaEditor(req)
  const hasExplicitMenuWrite = ALLOWED_ROLES.has(profile?.role) && access?.includes('menu')

  if (profile?.status !== 'active' || (!hasOwnerAccess && !hasExplicitMenuWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return user
}

export async function requireInventoryEditAccess(req) {
  const { user, profile, access, hasOwnerAccess } = await loadMediaEditor(req)
  const hasExplicitInventoryWrite = ALLOWED_ROLES.has(profile?.role) && access?.includes('inventory')

  if (profile?.status !== 'active' || (!hasOwnerAccess && !hasExplicitInventoryWrite)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  return user
}

import { createClient } from '@supabase/supabase-js'
import { AssistantError, createAssistantHandler, providerFromEnv } from 'hoggish-assistant/server'
import { createSupabaseQuotaStore } from 'hoggish-assistant/supabase'
import { restaurantTodayStr } from '../../../src/lib/analytics.js'
import { allowedDatasets } from '../../../src/lib/assistant/datasets.js'
import { createAssistantLabels } from '../../../src/lib/assistant/labels.js'
import { canViewPage } from '../../../src/lib/permissions.js'
import { createDatasetLoader } from './loaders.js'
import { ASSISTANT_SYSTEM_PROMPT, assistantContextPrompt } from './prompt.js'
import { assistantTools } from './tools.js'

const LANGS = ['uz', 'ru', 'en']
// Sent as a header, not chat context, so switching language never refetches the quota.
export const LANG_HEADER = 'x-assistant-lang'

function supabaseUrl(env) {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL
}

/** A client acting as the caller: every read keeps their RLS and RPC access checks. */
function userClient(env, authorization) {
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl(env) || !anonKey) throw new AssistantError('NOT_CONFIGURED')
  return createClient(supabaseUrl(env), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  })
}

/**
 * Daily Gemini request counts (migration 251, same table as the library's
 * sql/assistant_model_usage.sql). The service role is used for this table
 * only, never for restaurant data. Built per call so keys added after start-up
 * (Vite loads them late) are picked up.
 */
function serviceQuotaStore(env) {
  const store = () => {
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl(env) || !key) return null
    return createSupabaseQuotaStore(createClient(supabaseUrl(env), key, { auth: { persistSession: false, autoRefreshToken: false } }))
  }
  return {
    load: day => store()?.load(day) ?? null,
    record: async (day, model, result) => { await store()?.record(day, model, result) },
  }
}

/**
 * Bearer token → active profile with the assistant feature. Returns null for
 * UNAUTHORIZED and throws AssistantError('FORBIDDEN') for other accounts.
 */
export async function authorizeAssistantRequest(request, { createUserClient }) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null

  const dbClient = createUserClient(`Bearer ${token}`)
  const { data: { user } = {}, error: authError } = await dbClient.auth.getUser(token)
  if (authError || !user) return null

  const { data: profile, error } = await dbClient
    .from('profiles')
    .select('id,email,role,status,feature_access')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!profile || profile.status !== 'active' || !canViewPage(profile, 'assistant')) throw new AssistantError('FORBIDDEN')

  const requestedLang = request.headers.get(LANG_HEADER)
  return {
    dbClient,
    profile,
    lang: LANGS.includes(requestedLang) ? requestedLang : 'en',
    today: restaurantTodayStr(),
    datasets: allowedDatasets(profile),
  }
}

/**
 * The assistant endpoint (GET quota, POST chat). Dependencies are injectable
 * for tests; production reads them from the environment.
 */
export function createZarAssistant({
  env = process.env,
  createUserClient = authorization => userClient(env, authorization),
  provider = () => providerFromEnv(env),
  quotaStore = serviceQuotaStore(env),
  onError,
} = {}) {
  return createAssistantHandler({
    authorize: request => authorizeAssistantRequest(request, { createUserClient }),
    provider,
    system: ASSISTANT_SYSTEM_PROMPT,
    context: ctx => assistantContextPrompt(ctx),
    tools: ctx => assistantTools({
      datasets: ctx.datasets,
      loader: createDatasetLoader({ dbClient: ctx.dbClient, today: ctx.today }),
      labels: createAssistantLabels(ctx.lang),
    }),
    quotaStore,
    ...(onError ? { onError } : {}),
  })
}

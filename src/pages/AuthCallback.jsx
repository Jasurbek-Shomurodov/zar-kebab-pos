import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AlertTriangle } from 'lucide-react'
import { Shimmer } from '../components/PageShimmer'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

const OAUTH_RETURN_TO_KEY = 'zk_oauth_return_to'

// What went wrong, in words for the person signing in; the provider's own text goes to the console.
const L = {
  uz: {
    cancelled: 'Kirish bekor qilindi yoki ruxsat berilmadi. Qayta urinib ko‘ring.',
    timeout: 'Kirish juda uzoq davom etdi. Internetni tekshirib, qayta urinib ko‘ring.',
    failed: 'Kirishni yakunlab bo‘lmadi. Qayta urinib ko‘ring.',
  },
  ru: {
    cancelled: 'Вход отменён или доступ не разрешён. Попробуйте ещё раз.',
    timeout: 'Вход занял слишком много времени. Проверьте интернет и попробуйте ещё раз.',
    failed: 'Не удалось завершить вход. Попробуйте ещё раз.',
  },
  en: {
    cancelled: 'Sign-in was cancelled or access was not granted. Try again.',
    timeout: 'Sign-in took too long. Check the connection and try again.',
    failed: 'Sign-in could not be completed. Try again.',
  },
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const l = L[lang] || L.en
  // A code from L, worded at render.
  const [errorCode, setErrorCode] = useState('')

  // Diagnostics stay in the console; nothing technical is shown on screen.
  function log(msg) {
    console.debug('[auth-callback]', msg)
  }

  useEffect(() => {
    let cancelled = false
    const url = new URL(window.location.href)
    const hashParams   = new URLSearchParams(url.hash.replace(/^#/, ''))
    const oauthError   = url.searchParams.get('error')
      || hashParams.get('error')
    const oauthErrDesc = url.searchParams.get('error_description')
      || hashParams.get('error_description')
    const code         = url.searchParams.get('code')
    const accessToken  = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const returnTo     = sanitizeReturnTo(url.searchParams.get('returnTo') || readStoredReturnTo())

    log(`URL params — code: ${!!code}, token: ${!!accessToken}, error: ${oauthError || 'none'}`)

    if (oauthError) {
      const msg = oauthErrDesc || oauthError
      log(`OAuth error: ${msg}`)
      setErrorCode('cancelled')
      setTimeout(() => navigate('/login', { replace: true }), 5000)
      return
    }

    function finish(path) {
      if (cancelled) return
      clearTimeout(giveUp)
      navigate(path, { replace: true })
    }

    function fail(error) {
      if (cancelled) return
      const msg = error?.message || String(error || 'Sign in could not be completed')
      log(`Auth callback error: ${msg}`)
      clearTimeout(giveUp)
      setErrorCode(/timed out/i.test(msg) ? 'timeout' : 'failed')
      setTimeout(() => navigate('/login', { replace: true }), 5000)
    }

    function withTimeout(promise, label, ms = 10000) {
      let timeoutId
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      })
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
    }

    const giveUp = setTimeout(() => {
      log('Timeout — redirecting to login')
      fail(new Error('OAuth callback timed out'))
    }, 15000)

    async function completeCodeSignIn() {
      if (!code) return false
      log('Exchanging OAuth code')
      const { data, error } = await withTimeout(
        supabase.auth.exchangeCodeForSession(code),
        'OAuth code exchange'
      )
      if (error) {
        log(`Code exchange error: ${error.message}`)
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          'Session lookup',
          5000
        )
        if (session) {
          finish(returnTo || '/')
          return true
        }
        throw error
      }
      if (data?.session) {
        log('Code exchange complete')
        finish(returnTo || '/')
        return true
      }
      return false
    }

    async function completeHashSignIn() {
      if (!accessToken || !refreshToken) return false
      log('Setting OAuth hash session')
      const { data, error } = await withTimeout(
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
        'OAuth hash session'
      )
      if (error) {
        log(`Hash session error: ${error.message}`)
        throw error
      }
      if (data?.session) {
        log('Hash session complete')
        finish(returnTo || '/')
        return true
      }
      return false
    }

    async function completeSignIn() {
      try {
        if (await completeCodeSignIn()) return
        if (await completeHashSignIn()) return
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          'Session lookup',
          5000
        )
        log(`getSession: session=${!!session}, error=${error?.message || 'none'}`)
        if (session) {
          finish(returnTo || '/')
          return
        }
        throw error || new Error('No session was returned by Supabase')
      } catch (error) {
        fail(error)
      }
    }

    completeSignIn()

    return () => {
      cancelled = true
      clearTimeout(giveUp)
    }
  }, [navigate])

  if (errorCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7] p-4">
        <div role="alert" className="w-full max-w-sm rounded-2xl border border-[#e4e1de] bg-white p-8 text-center shadow-xl">
          <AlertTriangle size={32} className="mx-auto mb-3 text-[#c4262c]" aria-hidden="true" />
          <h1 className="mb-2 text-lg font-semibold text-[#22201d]">{t(lang, 'signInFailed')}</h1>
          <p className="mb-2 text-sm text-[#c4262c]">{l[errorCode]}</p>
          <p className="text-[13px] text-[#68655f]">{t(lang, 'redirectingToLogin')}</p>
        </div>
      </div>
    )
  }

  // Shaped like the workspace that opens next: a top bar and a few rows.
  return (
    <div role="status" aria-busy="true" className="flex min-h-screen items-center justify-center bg-[#faf9f7] p-4">
      <div className="w-full max-w-sm space-y-3">
        <p className="text-center text-sm text-[#68655f]">{t(lang, 'signingIn')}</p>
        <Shimmer className="h-11 w-full rounded-[10px]" />
        <Shimmer className="h-16 w-full rounded-xl" />
        <Shimmer className="h-16 w-full rounded-xl" />
      </div>
    </div>
  )
}

function readStoredReturnTo() {
  try {
    const value = window.sessionStorage.getItem(OAUTH_RETURN_TO_KEY)
    window.sessionStorage.removeItem(OAUTH_RETURN_TO_KEY)
    return value
  } catch {
    return ''
  }
}

function sanitizeReturnTo(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { Shimmer } from '../components/PageShimmer'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

// Strings this page needs beyond the shared dictionary.
const L = {
  uz: { updateFailed: 'Parolni saqlab bo‘lmadi. Havola eskirgan bo‘lishi mumkin: yangi havola so‘rang yoki qayta urinib ko‘ring.' },
  ru: { updateFailed: 'Не удалось сохранить пароль. Возможно, ссылка устарела: запросите новую или попробуйте ещё раз.' },
  en: { updateFailed: 'Could not save the password. The link may have expired: request a new one or try again.' },
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const l = L[lang] || L.en
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  // Errors are kept as dictionary keys and worded at render, so they follow the language.
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    let alive = true

    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive) return
      setChecking(false)
      if (!session) {
        setError('resetPasswordInvalidLink')
      }
    }

    const sessionCheckTimer = setTimeout(checkSession, 800)
    return () => {
      alive = false
      clearTimeout(sessionCheckTimer)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (password.length < 6) {
      setError('resetPasswordMinLength')
      return
    }
    if (password !== confirm) {
      setError('authPasswordMismatch')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      console.error('[reset-password] update failed:', error)
      setError('updateFailed')
      return
    }

    setInfo('resetPasswordUpdated')
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 1200)
  }

  const errorText = error ? (l[error] || t(lang, error)) : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-100 sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
          <LockKeyhole size={22} className="text-[#ff5a00]" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-[#22201d]">{t(lang, 'resetPasswordTitle')}</h1>
        <p className="mb-6 mt-1 text-sm text-[#68655f]">
          {t(lang, 'resetPasswordSubtitle')}
        </p>

        {checking ? (
          // Shaped like the form it becomes: two fields and the save button.
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">{t(lang, 'resetPasswordChecking')}</span>
            <div className="space-y-2"><Shimmer className="h-3 w-28" /><Shimmer className="h-11 w-full rounded-[10px]" /></div>
            <div className="space-y-2"><Shimmer className="h-3 w-32" /><Shimmer className="h-11 w-full rounded-[10px]" /></div>
            <Shimmer className="h-11 w-full rounded-lg" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorText && (
              <div role="alert" className="ws-notice ws-tone-negative text-[#c4262c]">
                {errorText}
              </div>
            )}
            {info && (
              <div role="status" className="ws-notice ws-tone-positive text-[#1d7a52]">
                {t(lang, info)}
              </div>
            )}

            <div>
              <label htmlFor="reset-new-password" className="mb-1.5 block text-[13px] font-medium text-[#68655f]">{t(lang, 'newPassword')}</label>
              <div className="relative">
                <input
                  id="reset-new-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  className="ws-input !pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
                  aria-pressed={showPass}
                  className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon absolute right-1 top-1/2 -translate-y-1/2 active:!-translate-y-1/2"
                >
                  {showPass ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reset-repeat-password" className="mb-1.5 block text-[13px] font-medium text-[#68655f]">{t(lang, 'repeatPassword')}</label>
              <input
                id="reset-repeat-password"
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
                className="ws-input"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!info}
              className="ws-btn ws-btn-primary w-full"
            >
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {t(lang, 'savePassword')}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="ws-btn ws-btn-ghost w-full !text-[#bf4300]"
            >
              {t(lang, 'backToSignIn')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

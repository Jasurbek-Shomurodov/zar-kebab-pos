import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    let alive = true

    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive) return
      setChecking(false)
      if (!session) {
        setError(t(lang, 'resetPasswordInvalidLink'))
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
      setError(t(lang, 'resetPasswordMinLength'))
      return
    }
    if (password !== confirm) {
      setError(t(lang, 'authPasswordMismatch'))
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setInfo(t(lang, 'resetPasswordUpdated'))
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] px-4 py-10">
      <div className="w-full max-w-[420px] bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-100 p-8">
        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-5">
          <LockKeyhole size={22} className="text-[#ff5a00]" />
        </div>

        <h1 className="text-xl font-black text-[#141414]">{t(lang, 'resetPasswordTitle')}</h1>
        <p className="text-sm text-gray-400 mt-1 mb-6">
          {t(lang, 'resetPasswordSubtitle')}
        </p>

        {checking ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin" />
            {t(lang, 'resetPasswordChecking')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
            {info && (
              <div className="px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
                {info}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t(lang, 'newPassword')}</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t(lang, 'repeatPassword')}</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                minLength={6}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!info}
              className="w-full bg-[#ff5a00] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#cc4800] transition-colors disabled:opacity-60 shadow-lg shadow-orange-100 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {t(lang, 'savePassword')}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full text-sm text-[#ff5a00] font-semibold hover:underline"
            >
              {t(lang, 'backToSignIn')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

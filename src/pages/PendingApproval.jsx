import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Loader2, LogOut, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { defaultPath } from '../lib/permissions'

export default function PendingApproval() {
  const { profile, profileError, signOut, refreshProfile } = useAuth()
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang || 'ru'
  const [checking, setChecking] = React.useState(false)

  function approvedTarget(nextProfile) {
    if (nextProfile?.status !== 'active') return ''
    const path = defaultPath(nextProfile)
    return path === '/menu' ? '' : path
  }

  React.useEffect(() => {
    const path = approvedTarget(profile)
    if (path) navigate(path, { replace: true })
  }, [profile, navigate])

  async function handleCheck() {
    setChecking(true)
    const nextProfile = await refreshProfile()
    const path = approvedTarget(nextProfile)
    if (path) {
      navigate(path, { replace: true })
      return
    }
    setTimeout(() => setChecking(false), 1000)
  }

  async function handleLogout() {
    try {
      await signOut()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  if (profileError) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
              <UtensilsCrossed size={20} className="text-white" aria-hidden="true" />
            </div>
            <span className="text-xl font-semibold text-gray-900 tracking-tight">Zar Kebab</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <RefreshCw size={28} className="text-amber-500" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t(lang, 'profileLoadFailed')}</h1>
            <p className="text-sm text-[#68655f] leading-relaxed mb-6">{t(lang, 'profileLoadFailedMessage')}</p>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={handleCheck} disabled={checking} className="ws-btn ws-btn-primary w-full">
                {checking ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                {t(lang, 'checkStatus')}
              </button>
              <button type="button" onClick={handleLogout} className="ws-btn ws-btn-ghost w-full">
                <LogOut size={14} aria-hidden="true" />
                {t(lang, 'logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#ff5a00] rounded-xl flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <span className="text-xl font-semibold text-gray-900 tracking-tight">Zar Kebab</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Clock size={28} className="text-amber-500" aria-hidden="true" />
          </div>

          <h1 className="text-xl font-semibold text-gray-900 mb-2">{t(lang, 'awaitingApproval')}</h1>
          <p className="text-sm text-[#68655f] leading-relaxed mb-2">
            {t(lang, 'awaitingApprovalCreated')}
          </p>
          <p className="text-sm text-[#68655f] leading-relaxed mb-6">
            {t(lang, 'awaitingApprovalMessage')}
          </p>

          {profile && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-left border border-gray-100">
              <p className="mb-1 text-xs font-medium text-[#68655f]">{t(lang, 'signedInAs')}</p>
              <p className="text-sm font-semibold text-gray-900">{profile.full_name || '—'}</p>
              <p className="text-xs text-[#68655f] [overflow-wrap:anywhere]">{profile.email}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button type="button" onClick={handleCheck} disabled={checking} className="ws-btn ws-btn-primary w-full">
              {checking ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {t(lang, 'checkStatus')}
            </button>
            <button type="button" onClick={handleLogout} className="ws-btn ws-btn-ghost w-full">
              <LogOut size={14} aria-hidden="true" />
              {t(lang, 'logout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

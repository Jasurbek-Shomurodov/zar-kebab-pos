import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, Eye, EyeOff, Leaf, Loader2, Lock,
  Mail, ShieldCheck, User, UserRound, Utensils,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { getBrandLogo } from '../lib/brandLogo'
import LanguageSwitcher from '../components/LanguageSwitcher'

// Messages this page needs beyond the shared dictionary. Errors and notices are stored as
// keys and worded at render, so they follow the language; backend text stays in the console.
const L = {
  uz: {
    resetFailed: 'Havolani yuborib bo‘lmadi. Emailni tekshirib, qayta urinib ko‘ring.',
    signupFailed: 'Hisob yaratib bo‘lmadi. Qayta urinib ko‘ring.',
    emailTaken: 'Bu email bilan hisob allaqachon bor. Tizimga kiring yoki parolni tiklang.',
    googleFailed: 'Google orqali kirib bo‘lmadi. Qayta urinib ko‘ring.',
  },
  ru: {
    resetFailed: 'Не удалось отправить ссылку. Проверьте email и попробуйте ещё раз.',
    signupFailed: 'Не удалось создать аккаунт. Попробуйте ещё раз.',
    emailTaken: 'Аккаунт с этим email уже есть. Войдите или восстановите пароль.',
    googleFailed: 'Не удалось войти через Google. Попробуйте ещё раз.',
  },
  en: {
    resetFailed: 'Could not send the link. Check the email and try again.',
    signupFailed: 'Could not create the account. Try again.',
    emailTaken: 'An account with this email already exists. Sign in or reset the password.',
    googleFailed: 'Could not sign in with Google. Try again.',
  },
}

function messageText(lang, message) {
  if (!message) return ''
  const local = (L[lang] || L.en)[message.key]
  const text = local || t(lang, message.key)
  return message.seconds === undefined ? text : text.replace('{seconds}', message.seconds)
}

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1400&q=85'

function LoginLanguageSwitcher({ className = '' }) {
  const { state, dispatch } = useApp()
  return (
    <div role="group" aria-label={t(state.lang, 'language')} className={`flex rounded-full border border-[#D4AF37]/55 bg-[#07130F]/65 p-1 shadow-lg backdrop-blur ${className}`}>
      {['en', 'ru', 'uz'].map(l => (
        <button
          key={l}
          type="button"
          aria-pressed={state.lang === l}
          onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
          className={`min-h-11 min-w-11 rounded-full px-3 text-xs font-semibold uppercase transition-colors ${
            state.lang === l
              ? 'bg-[#D4AF37] text-[#181818]'
              : 'text-[#F5EBD4]/78 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707C3.784 10.167 3.682 9.59 3.682 9c0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9c0 1.452.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function BrandMark({ compact = false, lang = 'en', showTagline = false }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'w-[112px]' : 'w-[220px] sm:w-[250px]'}`}>
      <img
        src={getBrandLogo(lang)}
        alt="Zar Kebab"
        className="h-auto w-full object-contain drop-shadow-[0_14px_26px_rgba(212,175,55,0.24)]"
        loading="eager"
        decoding="async"
      />
      {showTagline && (
        <p className="mt-1 text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">
          {t(lang, 'premiumLoginTagline')}
        </p>
      )}
    </div>
  )
}

function LoginCard({
  lang,
  mode,
  setMode,
  isForgot,
  isSignup,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPass,
  setShowPass,
  showConfirmPass,
  setShowConfirmPass,
  loading,
  googleLoading,
  error,
  info,
  resetCooldown,
  clearMessages,
  handleSubmit,
  handleGoogle,
  navigate,
  showLogo = true,
  className = '',
  googleOnly = false,
  staffOnly = false,
}) {
  return (
    <div className={`rounded-[34px] border border-[#D4AF37]/70 bg-[#07130F]/86 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7 lg:p-7 ${className}`}>
      <div className={`${showLogo ? 'mb-4 hidden justify-center lg:flex' : 'hidden'}`}>
        <BrandMark compact lang={lang} />
      </div>

      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 h-px w-32 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
        <h1
          className="text-3xl font-bold leading-tight text-[#F5EBD4] sm:text-[40px]"
          style={{ fontFamily: "'Onest', sans-serif" }}
        >
          {isForgot
            ? t(lang, 'forgotTitle')
            : isSignup
              ? t(lang, 'authCreateAccountPremium')
              : t(lang, 'premiumLoginWelcome')}
        </h1>
        <p className="mx-auto mt-2 max-w-[380px] text-[15px] leading-6 text-[#F5EBD4]/82">
          {isForgot
            ? t(lang, 'forgotSubtitle')
            : isSignup
              ? t(lang, 'signupSubtitle')
              : t(lang, 'premiumLoginSubtitle')}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
          {messageText(lang, error)}
        </div>
      )}
      {info && (
        <div role="status" className="mb-5 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {messageText(lang, { key: info })}
        </div>
      )}

      {!isForgot && (
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="mb-4 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-[#D4AF37]/55 bg-white/95 text-sm font-black text-[#181818] shadow-sm transition-all hover:bg-[#F5EBD4] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <GoogleIcon />}
          {t(lang, 'continueWithGoogle')}
        </button>
      )}

      {!isForgot && !googleOnly && (
        <div className="mb-4 flex items-center gap-5">
          <div className="h-px flex-1 bg-[#D4AF37]/15" />
          <span className="text-xs font-medium lowercase text-[#F5EBD4]/70">{t(lang, 'premiumLoginOr')}</span>
          <div className="h-px flex-1 bg-[#D4AF37]/15" />
        </div>
      )}

      {!googleOnly && <form onSubmit={handleSubmit} className="space-y-3.5">
        {isSignup && (
          <div>
            <label htmlFor="login-name" className="mb-2 block text-sm font-bold text-[#F5EBD4]">
              {t(lang, 'authName')}
            </label>
            <div className="relative">
              <input
                id="login-name"
                autoComplete="name"
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); clearMessages() }}
                placeholder={t(lang, 'authNamePlaceholder')}
                required
                className="h-12 w-full rounded-2xl border border-[#D4AF37]/60 bg-[#07130F]/80 px-5 pr-12 text-base text-[#F5EBD4] outline-none transition-all placeholder:text-[#F5EBD4]/60 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
              <User size={21} aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#F5EBD4]/55" />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-bold text-[#F5EBD4]">
            {t(lang, 'premiumLoginIdentifierLabel')}
          </label>
          <div className="relative">
            <input
              id="login-email"
              autoComplete="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearMessages() }}
              placeholder={t(lang, 'premiumLoginIdentifierPlaceholder')}
              required
              className="h-12 w-full rounded-2xl border border-[#D4AF37]/60 bg-[#07130F]/80 px-5 pr-12 text-base text-[#F5EBD4] outline-none transition-all placeholder:text-[#F5EBD4]/60 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
            />
            <Mail size={22} aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[#F5EBD4]/55" />
          </div>
        </div>

        {!isForgot && (
          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-bold text-[#F5EBD4]">
              {t(lang, 'password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); clearMessages() }}
                placeholder={t(lang, 'premiumLoginPasswordPlaceholder')}
                required
                minLength={6}
                className="h-12 w-full rounded-2xl border border-[#D4AF37]/60 bg-[#07130F]/80 px-5 pr-24 text-base text-[#F5EBD4] outline-none transition-all placeholder:text-[#F5EBD4]/60 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
              <Lock size={21} aria-hidden="true" className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 text-[#F5EBD4]/55" />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                aria-pressed={showPass}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#F5EBD4]/70 transition-colors hover:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
                aria-label={showPass ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
              >
                {showPass ? <EyeOff size={21} aria-hidden="true" /> : <Eye size={21} aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}

        {isSignup && (
          <div>
            <label htmlFor="login-confirm-password" className="mb-2 block text-sm font-bold text-[#F5EBD4]">
              {t(lang, 'authConfirmPassword')}
            </label>
            <div className="relative">
              <input
                id="login-confirm-password"
                autoComplete="new-password"
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); clearMessages() }}
                placeholder={t(lang, 'authConfirmPasswordPlaceholder')}
                required
                minLength={6}
                className="h-12 w-full rounded-2xl border border-[#D4AF37]/60 bg-[#07130F]/80 px-5 pr-24 text-base text-[#F5EBD4] outline-none transition-all placeholder:text-[#F5EBD4]/60 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
              <Lock size={21} aria-hidden="true" className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 text-[#F5EBD4]/55" />
              <button
                type="button"
                onClick={() => setShowConfirmPass(s => !s)}
                aria-pressed={showConfirmPass}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#F5EBD4]/70 transition-colors hover:text-[#D4AF37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37]"
                aria-label={showConfirmPass ? t(lang, 'hidePassword') : t(lang, 'showPassword')}
              >
                {showConfirmPass ? <EyeOff size={21} aria-hidden="true" /> : <Eye size={21} aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}

        {!isForgot && !isSignup && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setMode('forgot'); clearMessages() }}
              className="-my-1 inline-flex min-h-11 items-center text-sm font-semibold text-[#D4AF37] underline-offset-4 transition-colors hover:text-[#F5EBD4] hover:underline"
            >
              {t(lang, 'forgotPassword')}
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || resetCooldown > 0}
          className="group flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F0C866] to-[#B8872D] text-base font-bold text-[#181818] shadow-[0_18px_40px_rgba(212,175,55,0.23)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {isForgot
            ? (resetCooldown > 0 ? t(lang, 'tryAgainIn').replace('{seconds}', resetCooldown) : t(lang, 'sendResetLink'))
            : isSignup
              ? t(lang, 'authCreateAccountPremium')
              : t(lang, 'signIn')}
          {!loading && !isForgot && <ArrowRight size={22} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />}
        </button>
      </form>}

      {!googleOnly && (!staffOnly || isSignup || isForgot) && <div className="my-4 text-center text-sm text-[#F5EBD4]/70">
        {!staffOnly && !isForgot && !isSignup && (
          <>
            {t(lang, 'authNoAccountPremium')}{' '}
            <button
              type="button"
              onClick={() => { setMode('signup'); clearMessages() }}
              className="font-black text-[#D4AF37] underline-offset-4 hover:underline"
            >
              {t(lang, 'authSignUp')}
            </button>
          </>
        )}
        {isSignup && (
          <>
            {t(lang, 'authHaveAccountPremium')}{' '}
            <button
              type="button"
              onClick={() => { setMode('signin'); clearMessages() }}
              className="font-black text-[#D4AF37] underline-offset-4 hover:underline"
            >
              {t(lang, 'signIn')}
            </button>
          </>
        )}
        {isForgot && (
          <button
            type="button"
            onClick={() => { setMode('signin'); clearMessages() }}
            className="font-black text-[#D4AF37] underline-offset-4 hover:underline"
          >
            {t(lang, 'backToSignIn')}
          </button>
        )}
      </div>}

      {!staffOnly && !googleOnly && <div className="my-4 flex items-center gap-5">
        <div className="h-px flex-1 bg-[#D4AF37]/15" />
        <span className="text-xs font-medium lowercase text-[#F5EBD4]/70">{t(lang, 'premiumLoginOr')}</span>
        <div className="h-px flex-1 bg-[#D4AF37]/15" />
      </div>}

      {!staffOnly && !googleOnly && <button
        type="button"
        onClick={() => navigate('/menu')}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-[#D4AF37]/65 text-base font-bold text-[#D4AF37] transition-all hover:border-[#D4AF37] hover:bg-[#D4AF37]/10"
      >
        <UserRound size={22} aria-hidden="true" />
        {t(lang, 'premiumLoginGuest')}
      </button>}
    </div>
  )
}

export default function Login({ googleOnly = false, staffOnly = false }) {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth()
  const { state } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lang = state.lang || 'ru'
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'))

  const [mode, setMode]         = useState('signin')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // error: { key, seconds? } and info: a key; both are worded at render (messageText).
  const [error, setError]       = useState(null)
  const [info, setInfo]         = useState('')
  const [resetCooldownUntil, setResetCooldownUntil] = useState(() => {
    return Number(localStorage.getItem('zk_reset_cooldown_until') || 0)
  })

  function clearMessages() { setError(null); setInfo('') }

  useEffect(() => {
    if (googleOnly && mode !== 'signin') setMode('signin')
  }, [googleOnly, mode])

  useEffect(() => {
    if (staffOnly && mode === 'signup') setMode('signin')
  }, [staffOnly, mode])

  useEffect(() => {
    if (resetCooldownSeconds() <= 0) return
    const timer = setInterval(() => {
      if (resetCooldownSeconds() <= 0) {
        localStorage.removeItem('zk_reset_cooldown_until')
        setResetCooldownUntil(0)
        clearInterval(timer)
      } else {
        setResetCooldownUntil(Number(localStorage.getItem('zk_reset_cooldown_until') || 0))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [resetCooldownUntil])

  function resetCooldownSeconds() {
    return Math.max(0, Math.ceil((resetCooldownUntil - Date.now()) / 1000))
  }

  function startResetCooldown(seconds = 65) {
    const until = Date.now() + seconds * 1000
    localStorage.setItem('zk_reset_cooldown_until', String(until))
    setResetCooldownUntil(until)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    clearMessages()

    const loginId = email.trim()

    setLoading(true)

    if (mode === 'forgot') {
      const cooldown = resetCooldownSeconds()
      if (cooldown > 0) {
        setLoading(false)
        return setError({ key: 'waitBeforeReset', seconds: cooldown })
      }

      const { error } = await resetPassword(loginId)
      setLoading(false)
      if (error) {
        console.error('[login] password reset request failed:', error)
        if (error.message?.toLowerCase().includes('email rate limit')) {
          return setError({ key: 'resetEmailLimit' })
        }
        return setError({ key: 'resetFailed' })
      }
      startResetCooldown()
      setInfo('resetLinkSent')
      return
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setLoading(false)
        return setError({ key: 'fullNameRequired' })
      }
      if (password !== confirmPassword) {
        setLoading(false)
        return setError({ key: 'authPasswordMismatch' })
      }

      const { data, error } = await signUpWithEmail(loginId, password, name.trim())
      setLoading(false)
      if (error) {
        console.error('[login] sign-up failed:', error)
        const taken = /already|exists|registered/i.test(error.message || '')
        return setError({ key: taken ? 'emailTaken' : 'signupFailed' })
      }
      if (data?.session) {
        navigate(returnTo || '/', { replace: true })
        return
      }
      setPassword('')
      setConfirmPassword('')
      setMode('signin')
      setInfo('accountCreated')
      return
    }

    const { error } = await signInWithEmail(loginId, password)
    setLoading(false)
    if (error) return setError({ key: 'invalidCredentials' })
    navigate(returnTo || '/', { replace: true })
  }

  async function handleGoogle() {
    clearMessages()
    setGoogleLoading(true)
    const { error } = await signInWithGoogle(returnTo)
    if (error) {
      console.error('[login] Google sign-in failed:', error)
      setGoogleLoading(false)
      setError({ key: 'googleFailed' })
    }
  }

  const resetCooldown = mode === 'forgot' ? resetCooldownSeconds() : 0
  const isForgot = mode === 'forgot'
  const isSignup = mode === 'signup'
  const cardProps = {
    lang,
    mode,
    setMode,
    isForgot,
    isSignup,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPass,
    setShowPass,
    showConfirmPass,
    setShowConfirmPass,
    loading,
    googleLoading,
    error,
    info,
    resetCooldown,
    clearMessages,
    handleSubmit,
    handleGoogle,
    navigate,
    googleOnly,
    staffOnly,
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07130F] text-[#F5EBD4] lg:grid lg:grid-cols-[46%_54%]">
      <div className="fixed bottom-4 left-4 z-40 hidden lg:block no-print">
        <LanguageSwitcher />
      </div>

      {/* Phone and tablet hero: short, so the sign-in card starts in the first screen. */}
      <section
        className="relative flex flex-col items-center justify-center overflow-hidden px-5 pb-14 pt-16 text-center sm:pb-16 lg:hidden"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,19,15,0.28), rgba(7,19,15,0.72) 48%, #07130F 100%), url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <LoginLanguageSwitcher className="absolute right-3 top-3 z-20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(212,175,55,0.22),transparent_36%)]" />
        <div className="relative z-10 flex flex-col items-center">
          <BrandMark compact lang={lang} />
          <div className="hidden sm:block">
            <div className="mx-auto my-4 h-px w-32 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
            <p
              className="max-w-[340px] text-2xl font-bold leading-tight text-[#F5EBD4]"
              style={{ fontFamily: "'Onest', sans-serif" }}
            >
              {t(lang, 'premiumLoginHeroTitle')}
            </p>
            <p className="mt-2 max-w-[330px] text-sm leading-6 text-[#F5EBD4]/84">
              {t(lang, 'premiumLoginHeroSubtitle')}
            </p>
          </div>
        </div>
      </section>

      <section
        className="relative hidden min-h-screen overflow-hidden lg:flex"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,19,15,0.1), rgba(7,19,15,0.88)), url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(212,175,55,0.18),transparent_32%),linear-gradient(90deg,rgba(7,19,15,0.28),rgba(7,19,15,0.78))]" />
        <div className="relative z-10 flex w-full flex-col items-center justify-between px-14 py-16 text-center">
          <div className="pt-4">
            <BrandMark lang={lang} showTagline />
            <div className="mx-auto my-8 h-px w-36 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
          </div>

          <div className="max-w-[430px]">
            <p
              className="text-4xl font-bold leading-tight text-[#F5EBD4]"
              style={{ fontFamily: "'Onest', sans-serif" }}
            >
              {t(lang, 'premiumLoginHeroTitle')}
            </p>
            <p className="mt-5 text-lg leading-8 text-[#F5EBD4]/85">
              {t(lang, 'premiumLoginHeroSubtitle')}
            </p>
          </div>

          <div className="grid w-full max-w-[520px] grid-cols-3 overflow-hidden rounded-[28px] border border-[#D4AF37]/55 bg-[#07130F]/75 shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur">
            {[
              [Utensils, 'premiumLoginFeatureFire'],
              [Leaf, 'premiumLoginFeatureFlavor'],
              [Utensils, 'premiumLoginFeatureRecipe'],
            ].map(([Icon, key]) => (
              <div key={key} className="border-r border-[#D4AF37]/20 px-5 py-6 last:border-r-0">
                <Icon size={26} className="mx-auto mb-4 text-[#D4AF37]" aria-hidden="true" />
                <p className="text-xs font-semibold text-[#D4AF37]">
                  {t(lang, key)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* One card for every width: the form exists once, so each field has one label and one id. */}
      <main className="relative -mt-10 bg-[#07130F] px-4 pb-7 lg:mt-0 lg:flex lg:min-h-screen lg:items-center lg:justify-center lg:bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.13),transparent_30%),linear-gradient(135deg,#06100D_0%,#0F2B22_48%,#050807_100%)] lg:px-8 lg:py-6">
        <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.13),transparent_58%)] lg:hidden" />
        <div className="absolute inset-0 hidden opacity-[0.08] [background-image:linear-gradient(30deg,#D4AF37_12%,transparent_12.5%,transparent_87%,#D4AF37_87.5%,#D4AF37),linear-gradient(150deg,#D4AF37_12%,transparent_12.5%,transparent_87%,#D4AF37_87.5%,#D4AF37)] [background-position:0_0,0_0] [background-size:42px_74px] lg:block" />

        <div className="relative z-10 mx-auto w-full max-w-[520px] lg:max-w-[600px]">
          <LoginCard {...cardProps} className="max-lg:rounded-[30px] max-lg:bg-[#0B211A]/92 max-lg:shadow-[0_28px_80px_rgba(0,0,0,0.55)]" />
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-5 text-[#F5EBD4]/72 lg:text-sm">
            <ShieldCheck size={16} className="flex-shrink-0 text-[#D4AF37]" aria-hidden="true" />
            {t(lang, 'premiumLoginSecurity')}
          </p>
        </div>
      </main>
    </div>
  )
}

function sanitizeReturnTo(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

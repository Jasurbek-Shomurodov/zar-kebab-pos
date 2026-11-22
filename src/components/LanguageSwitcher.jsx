import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

const LANGUAGE_LABELS = {
  uz: 'UZ',
  ru: 'RU',
  en: 'EN',
}

// The select shows the short code; assistive tech reads the language's own name.
const LANGUAGE_NAMES = {
  uz: 'O‘zbekcha',
  ru: 'Русский',
  en: 'English',
}

export default function LanguageSwitcher({ value, onChange, className = '', compact = false, variant = 'default' }) {
  const { state, dispatch } = useApp()
  const activeLang = value || state.lang

  function changeLanguage(lang) {
    if (onChange) {
      onChange(lang)
      return
    }
    dispatch({ type: 'SET_LANG', payload: lang })
  }

  return (
    <label className={`relative inline-flex h-9 items-center text-xs font-semibold transition-colors [@media(pointer:coarse)]:h-11 ${variant === 'lux' ? 'lux-chip rounded-full' : 'rounded-xl border border-[#e4e1de] bg-white text-[#22201d] shadow-[0_1px_2px_rgb(34_32_29/5%)] hover:bg-[#ebe8e5]'} ${compact ? 'w-[58px] [@media(pointer:coarse)]:w-[68px]' : ''} ${className}`}>
      {/* Touch screens render every select at 16px (src/index.css), so the chip widens there instead of clipping the code. */}
      <select
        value={activeLang}
        onChange={event => changeLanguage(event.target.value)}
        aria-label={t(activeLang, 'language')}
        className={`h-full cursor-pointer appearance-none rounded-[inherit] bg-transparent py-0 font-semibold uppercase outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a00] ${compact ? 'w-full px-1.5 text-center text-xs' : 'px-3 text-xs [@media(pointer:coarse)]:px-4'}`}
      >
      {['uz', 'ru', 'en'].map(l => (
        <option
          key={l}
          value={l}
          aria-label={LANGUAGE_NAMES[l]}
        >
          {LANGUAGE_LABELS[l]}
        </option>
      ))}
      </select>
    </label>
  )
}

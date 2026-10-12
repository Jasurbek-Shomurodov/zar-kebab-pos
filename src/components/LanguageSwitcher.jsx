import React from 'react'
import { useApp } from '../store/AppContext'

const LANGUAGE_LABELS = {
  uz: 'UZ',
  ru: 'RU',
  en: 'EN',
}

const LANGUAGE_FLAGS = {
  uz: '🇺🇿',
  ru: '🇷🇺',
  en: '🇬🇧',
}

export default function LanguageSwitcher({ value, onChange, className = '', compact = false }) {
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
    <label className={`relative inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-black text-[#1F2937] shadow-sm transition-colors hover:bg-white ${compact ? 'w-[58px]' : ''} ${className}`}>
      <select
        value={activeLang}
        onChange={event => changeLanguage(event.target.value)}
        aria-label={activeLang === 'uz' ? 'Til' : activeLang === 'ru' ? 'Язык' : 'Language'}
        className={`h-full cursor-pointer appearance-none rounded-xl bg-transparent py-0 font-black uppercase outline-none ${compact ? 'w-full px-1.5 text-center text-[10px]' : 'px-3 text-xs'}`}
      >
      {['uz', 'ru', 'en'].map(l => (
        <option
          key={l}
          value={l}
        >
          {LANGUAGE_FLAGS[l]} {LANGUAGE_LABELS[l]}
        </option>
      ))}
      </select>
    </label>
  )
}

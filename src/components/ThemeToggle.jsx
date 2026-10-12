import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

const LABELS = {
  uz: { dark: "Tungi rejim", light: "Kunduzgi rejim" },
  ru: { dark: 'Тёмная тема', light: 'Светлая тема' },
  en: { dark: 'Dark mode', light: 'Light mode' },
}

/** Top-right light/dark switch shared by every staff top bar (Hoggish Finance style). */
export default function ThemeToggle({ lang = 'en', className = '', variant = 'default' }) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  const label = (LABELS[lang] || LABELS.en)[dark ? 'light' : 'dark']
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className={`grid h-[38px] w-[38px] flex-shrink-0 place-items-center ${variant === 'lux' ? 'lux-chip lux-chip-static rounded-full' : 'rounded-[10px] border border-[#e4e1de] bg-white text-[#22201d] shadow-[0_1px_2px_rgb(34_32_29/5%)] transition-colors hover:bg-[#ebe8e5]'} ${className}`}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

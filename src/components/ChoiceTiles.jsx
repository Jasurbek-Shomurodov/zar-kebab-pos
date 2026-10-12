import React from 'react'
import { Check } from 'lucide-react'

// Full-width option tiles for small exclusive choices in forms (entry type,
// payment method). Each tile is a toggle button exposing aria-pressed.
// Fieldset, not <label>: a label wrapping several buttons would forward
// stray clicks to the first option.
export function ChoiceGroup({ label, icon: Icon, className = '', legendClassName = 'mb-1.5 block text-xs font-bold text-[#596170]', columns, children }) {
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className={legendClassName}>{Icon && <Icon size={13} />}{label}</legend>
      <div className={`grid gap-2 ${columns}`}>{children}</div>
    </fieldset>
  )
}

export function ChoiceTile({ active, disabled, tone = 'orange', icon: Icon, title, hint = '', compact = false, onClick }) {
  const tones = {
    orange: { selected: 'border-[#ff5a00] bg-[#fff4ec] ring-1 ring-[#ff5a00]', icon: 'bg-[#ff5a00] text-white', check: 'bg-[#ff5a00]' },
    green: { selected: 'border-[#1d7a52] bg-[#edf7f1] ring-1 ring-[#1d7a52]', icon: 'bg-[#1d7a52] text-white', check: 'bg-[#1d7a52]' },
  }
  const style = tones[tone] || tones.orange
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex min-w-0 items-center gap-3 rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 disabled:cursor-not-allowed disabled:opacity-60 ${
        compact ? 'h-12 justify-center px-2' : 'min-h-[64px] px-3.5 py-3'
      } ${active ? style.selected : 'border-[#e4e1de] bg-white hover:border-[#c9c5c0] hover:bg-[#f6f5f3]'}`}
    >
      <span className={`flex flex-shrink-0 items-center justify-center rounded-full transition-colors ${compact ? 'h-7 w-7' : 'h-9 w-9'} ${active ? style.icon : 'bg-[#efece9] text-[#68655f]'}`}>
        <Icon size={compact ? 14 : 17} />
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-sm font-semibold ${active ? 'text-[#22201d]' : 'text-[#4a4743]'}`}>{title}</span>
        {hint && <span className="ws-caption mt-0.5 block leading-snug">{hint}</span>}
      </span>
      {active && !compact && (
        <span aria-hidden="true" className={`ml-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white ${style.check}`}>
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

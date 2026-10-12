import React, { useEffect } from 'react'
import { Info, X } from 'lucide-react'
import { Shimmer } from './PageShimmer'

// KPI card and its "how is this calculated" dialog, shared by Accounting and
// Financial analysis so both explain their totals the same way.
export function toKpiDetail([calculation, included]) {
  return { calculation, included }
}

export function Kpi({ icon: Icon, label, value, sub = '', tone = 'orange', emphasizeValue = false, detailHint = '', onClick = null, loading = false }) {
  const valueTones = {
    green: 'text-[#1d7a52]',
    orange: 'text-[#ff5a00]',
    blue: 'text-[#22201d]',
    red: 'text-[#c4262c]',
    purple: 'text-[#22201d]',
  }
  const valueTone = emphasizeValue ? valueTones[tone] || valueTones.orange : 'text-[#22201d]'
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      {...(onClick ? { type: 'button', onClick, 'aria-label': `${label}. ${detailHint}` } : {})}
      className={`ws-panel group h-full text-left ${onClick ? 'cursor-pointer transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ws-caption">{label}</p>
          {/* While totals load, shimmer bars stand in for the value and caption instead of a dash. */}
          {loading
            ? <Shimmer className="mt-2 h-[26px] w-36 max-w-full" />
            : <p className={`mt-1 break-words text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueTone}`}>{value}</p>}
        </div>
        <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#efece9] text-[#68655f]">
          <Icon size={16} className={onClick ? 'transition-opacity group-hover:opacity-0' : ''} />
          {onClick && <Info size={16} className="absolute opacity-0 transition-opacity group-hover:opacity-100" />}
        </div>
      </div>
      {loading
        ? <div className="mt-3 min-h-[30px] space-y-2" aria-hidden="true"><Shimmer className="h-3 w-4/5" /><Shimmer className="h-3 w-1/2" /></div>
        : sub && <p className="ws-caption mt-3 min-h-[30px] leading-relaxed">{sub}</p>}
    </Component>
  )
}

export function KpiExplanationDialog({ detail, period, labels, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#22201d]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="kpi-explanation-title" className="ws-dialog max-h-[88vh] w-full overflow-y-auto !rounded-b-none sm:max-w-lg sm:!rounded-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-[#e4e1de] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="ws-caption font-medium">{labels.calculationDetails}</p>
            <h2 id="kpi-explanation-title" className="ws-display mt-1">{detail.title}</h2>
            <p className="ws-caption mt-1">{period}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={labels.close} className="ws-btn ws-btn-ghost !h-10 !w-10 !px-0">
            <X size={19} />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="rounded-xl bg-[#f6f5f3] p-4">
            <p className="ws-caption">{detail.title}</p>
            <p className="mt-1 break-words text-2xl font-semibold tracking-[-.02em] tabular-nums text-[#22201d]">{detail.value}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#22201d]">{labels.howCalculated}</h3>
            <p className="mt-2 rounded-[10px] border border-[#e4e1de] bg-[#f6f5f3] px-4 py-3 text-sm leading-relaxed text-[#22201d]">{detail.calculation}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#22201d]">{labels.included}</h3>
            <ul className="mt-2 space-y-2">
              {detail.included.map(item => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[#22201d]">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ff5a00]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={onClose} className="ws-btn ws-btn-outline !h-11 w-full">
            {labels.close}
          </button>
        </div>
      </section>
    </div>
  )
}

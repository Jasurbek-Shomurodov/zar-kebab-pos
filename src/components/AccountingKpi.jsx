import React from 'react'
import { Info } from 'lucide-react'
import WorkspaceDialog from './WorkspaceDialog'
import { Shimmer } from './PageShimmer'
import { RollingValue } from './RollingNumber'

// KPI card and its "how is this calculated" dialog, shared by Accounting and
// Financial analysis so both explain their totals the same way.
export function toKpiDetail([calculation, included]) {
  return { calculation, included }
}

export function Kpi({ icon: Icon, label, value, sub = '', tone = 'orange', emphasizeValue = false, detailHint = '', onClick = null, loading = false }) {
  const valueTones = {
    green: 'text-[#1d7a52]',
    orange: 'text-[#bf4300]',
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
            : <p className={`mt-1 whitespace-nowrap text-[clamp(20px,1.7vw,24px)] font-semibold leading-tight tracking-[-.02em] tabular-nums ${valueTone}`}><RollingValue value={value} /></p>}
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
  return (
    <WorkspaceDialog
      title={detail.title}
      description={`${labels.calculationDetails} · ${period}`}
      onClose={onClose}
      closeLabel={labels.close}
      variant="sheet"
      size="lg"
      footer={<button type="button" onClick={onClose} className="ws-btn ws-btn-outline">{labels.close}</button>}
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-[#efece9] p-4">
          <p className="ws-caption">{detail.title}</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tracking-[-.02em] tabular-nums text-[#22201d]">{detail.value}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#22201d]">{labels.howCalculated}</h3>
          <p className="mt-2 rounded-[10px] bg-[#efece9] px-4 py-3 text-sm leading-relaxed text-[#22201d]">{detail.calculation}</p>
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
      </div>
    </WorkspaceDialog>
  )
}

import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import PageShimmer from './PageShimmer'

/** Page/tab data load: a skeleton shaped like the page (see PageShimmer layouts), never a spinner. */
export function OperationalLoading({ title, layout = 'table', className = '' }) {
  return <PageShimmer layout={layout} label={title || 'Loading data'} className={className} />
}

export function OperationalError({ title, description, actionLabel, onAction }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <p className="text-base font-black text-[#1F2937]">{title || 'Could not load data'}</p>
        {description && <p className="mt-1 text-sm leading-snug text-[#6B7280]">{description}</p>}
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white shadow-sm shadow-orange-100 hover:bg-[#cc4800]"
          >
            <RefreshCw size={15} />
            {actionLabel || 'Reload'}
          </button>
        )}
      </div>
    </div>
  )
}

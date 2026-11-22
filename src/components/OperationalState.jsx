import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import PageShimmer from './PageShimmer'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

/** Page/tab data load: a skeleton shaped like the page (see PageShimmer layouts), never a spinner. */
export function OperationalLoading({ title, layout = 'table', className = '' }) {
  return <PageShimmer layout={layout} label={title} className={className} />
}

/**
 * A failed load: what happened, what to do, and a retry that re-runs the loader.
 * Pass `onAction` the page's own loader; a full page reload throws away carts and filters.
 */
export function OperationalError({ title, description, actionLabel, onAction, lang: langProp }) {
  const { state } = useApp()
  const lang = langProp || state.lang
  return (
    <div className="ws-empty min-h-[320px] content-center" role="alert">
      <AlertCircle aria-hidden="true" className="!bg-[color-mix(in_srgb,var(--ws-negative)_12%,transparent)] !text-[var(--ws-negative)]" />
      <h3>{title || t(lang, 'loadFailedTitle')}</h3>
      <p>{description || t(lang, 'loadFailedHint')}</p>
      {onAction && (
        <button type="button" onClick={onAction} className="ws-btn ws-btn-primary">
          <RefreshCw aria-hidden="true" />
          {actionLabel || t(lang, 'retry')}
        </button>
      )}
    </div>
  )
}

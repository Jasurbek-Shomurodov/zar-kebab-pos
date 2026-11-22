import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

/**
 * One status, one tone, on every screen (DESIGN.md "Colour"). On the floor each state a
 * waiter acts on differently has its own tone: free is positive, seated is neutral, sent to
 * the kitchen is info, cooking is accent, ready to carry out is caution, needs the bill is
 * negative. The word is always shown, so colour is never the only signal.
 */
export const STATUS_TONE = {
  // Table statuses
  available: 'positive',
  occupied: 'neutral',
  reserved: 'info',
  waiting_kitchen: 'info',
  needs_bill: 'negative',
  // Account statuses
  active: 'positive',
  pending: 'caution',
  disabled: 'negative',
  // Order statuses
  sent_to_kitchen: 'info',
  new: 'info',
  preparing: 'accent',
  ready: 'caution',
  delivered: 'neutral',
  paid: 'neutral',
  unpaid: 'caution',
}

const STATUS_LABEL_KEY = {
  available: 'available',
  occupied: 'occupied',
  needs_bill: 'needsBill',
  waiting_kitchen: 'waiting',
  active: 'active',
  pending: 'pending',
  disabled: 'disabled',
  sent_to_kitchen: 'sent',
  new: 'new',
  preparing: 'preparing',
  ready: 'ready',
  paid: 'paid',
  unpaid: 'unpaid',
}

/** The `ws-tone-*` class for a status, for badges, chart legends and tiles alike. */
export function statusToneClass(status) {
  const tone = STATUS_TONE[status]
  return tone && tone !== 'neutral' ? `ws-tone-${tone}` : ''
}

/**
 * @param {{ status: string, className?: string, lang?: string }} props
 */
export default function StatusBadge({ status, className = '', lang: langProp }) {
  const { state } = useApp()
  const lang = langProp || state.lang || 'ru'
  const labelKey = STATUS_LABEL_KEY[status]
  return (
    <span className={`ws-status ${statusToneClass(status)} ${className}`}>
      {labelKey ? t(lang, labelKey) : status}
    </span>
  )
}

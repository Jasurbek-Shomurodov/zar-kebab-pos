import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

/**
 * One status, one tone, on every screen (DESIGN.md "Colour"): free or paid is positive,
 * waiting is caution, needs attention is negative, in progress is accent, in transit is info.
 * The word is always shown, so colour is never the only signal.
 */
export const STATUS_TONE = {
  // Table statuses
  available: 'positive',
  occupied: 'accent',
  needs_bill: 'negative',
  waiting_kitchen: 'caution',
  // Account statuses
  active: 'positive',
  pending: 'caution',
  disabled: 'negative',
  // Order statuses
  sent_to_kitchen: 'info',
  new: 'info',
  preparing: 'accent',
  ready: 'positive',
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

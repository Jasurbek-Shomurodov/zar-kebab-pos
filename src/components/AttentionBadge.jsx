import React from 'react'

/** Small count pill for items needing attention (e.g. cashier bills), as in the Hoggish Finance drawer. */
export default function AttentionBadge({ count, label = '', className = '' }) {
  if (!count) return null
  return (
    <span
      className={`inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[#ff5a00] px-1.5 text-xs font-semibold tabular-nums text-white ${className}`}
      aria-label={label ? `${count} ${label}` : undefined}
      title={label || undefined}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

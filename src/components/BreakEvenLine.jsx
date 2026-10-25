import React from 'react'

// The daily break-even target drawn as one connected line through each bar's
// centre, so a target change reads as a slope between periods instead of
// separate flat segments. Points are { x, y } in percent of the plot (y from
// the bottom); a point with `label` gets a small value tag above it.
export default function BreakEvenLine({ points }) {
  const shown = (points || []).filter(point => point.value > 0)
  if (!shown.length) return null
  const path = shown.map(point => `${point.x},${100 - point.y}`).join(' ')
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={shown.length === 1 ? `0,${100 - shown[0].y} 100,${100 - shown[0].y}` : path}
          fill="none"
          stroke="#c4262c"
          strokeWidth={2}
          strokeDasharray="2 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {shown.map(point => (
        <span
          key={point.key}
          className="absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-[#c4262c]"
          style={{ left: `${point.x}%`, bottom: `${point.y}%` }}
        />
      ))}
      {shown.filter(point => point.label).map(point => (
        <span
          key={`${point.key}-label`}
          className="absolute -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#c4262c] shadow-sm"
          style={{ left: `${point.x}%`, bottom: `calc(${point.y}% + 6px)` }}
        >
          {point.label}
        </span>
      ))}
    </div>
  )
}

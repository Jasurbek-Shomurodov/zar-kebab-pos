import React, { useEffect, useState } from 'react'
import { tooltipLeft } from '../../lib/chartScale'

// The one look every chart shares, after the Hoggish Finance chart kit: faint
// dashed guides, label-only axes, rounded data ends, one themed hover card and
// one legend. Colours and type live in `.ws-chart*` (src/styles/workspace.css),
// so light and dark follow the --ws-* tokens. Change it here and every chart
// follows; never write grid dashes, tooltip boxes or bar radii in a page.

export const CHART = {
  /** Bar heights: `compact` inside dialogs and cards, `regular` for a panel's chart, `tall` for a page's lead chart. */
  height: { compact: 220, regular: 260, tall: 280 },
  barRadius: 4,
  /** A single or stacked column never gets wider than this; the slot's leftover is air. */
  barMax: 24,
  /** Columns side by side are narrower, so a group still reads as one period. */
  groupedBarMax: 16,
  /** The surface gap between touching marks (stacked segments, grouped columns). */
  gap: 2,
  gridDash: '2 6',
  lineWidth: 2,
  dotRadius: 4,
  tooltipWidth: 232,
}

/** Lines that are a comparison (an average, a target) are dashed; the lead series is solid. */
export const CHART_DASH = { average: '6 5', target: '2 4' }

export function useElementWidth() {
  const [element, setElement] = useState(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [setElement, width]
}

/** The swatch beside a series name: a rounded square for bars, a short stroke for lines. */
export function ChartSwatch({ color, kind = 'bar', dash, muted = false }) {
  if (kind === 'line') {
    return (
      <svg width="16" height="8" aria-hidden="true" className="ws-chart-swatch-line" style={{ opacity: muted ? 0.4 : 1 }}>
        <line x1="1" x2="15" y1="4" y2="4" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
      </svg>
    )
  }
  return <span aria-hidden="true" className="ws-chart-swatch" style={{ backgroundColor: color, opacity: muted ? 0.4 : 1 }} />
}

/**
 * The legend above a chart. With `onToggle` each item is a button that hides
 * or shows its series (aria-pressed), otherwise a plain key.
 */
export function ChartLegend({ items, hidden, onToggle, label }) {
  const isHidden = key => (hidden instanceof Set ? hidden.has(key) : Array.isArray(hidden) ? hidden.includes(key) : false)
  return (
    <ul className="ws-chart-legend" aria-label={label}>
      {items.map(item => (
        <li key={item.key}>
          {onToggle ? (
            <button type="button" aria-pressed={!isHidden(item.key)} onClick={() => onToggle(item.key)} className="ws-chart-legend-item" data-off={isHidden(item.key) || undefined}>
              <ChartSwatch color={item.color} kind={item.kind} dash={item.dash} muted={isHidden(item.key)} />
              {item.label}
            </button>
          ) : (
            <span className="ws-chart-legend-item">
              <ChartSwatch color={item.color} kind={item.kind} dash={item.dash} />
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * The hover card. `x` is the anchor in px inside a `position: relative` box
 * `width` wide; the card sits beside it and flips past the middle. Rows are
 * { key, label, value, color, kind, dash, tone } with value already formatted;
 * `footer` rows sit under a hairline, `strong` ones in the foreground ink.
 */
export function ChartTooltip({ x, width, title, rows = [], footer = [], top = 8 }) {
  if (x == null || !width) return null
  const tipWidth = Math.min(CHART.tooltipWidth, width)
  return (
    <div className="ws-chart-tooltip" style={{ left: tooltipLeft(x, tipWidth, width), top, width: tipWidth }} role="presentation">
      {title && <p className="ws-chart-tooltip-title">{title}</p>}
      {rows.map(row => (
        <p key={row.key} className="ws-chart-tooltip-row">
          <span className="ws-chart-tooltip-label">
            {row.color && <ChartSwatch color={row.color} kind={row.kind} dash={row.dash} />}
            <span className="truncate">{row.label}</span>
          </span>
          <span className={`ws-chart-tooltip-value ${row.tone === 'negative' ? 'ws-chart-negative' : ''}`}>{row.value}</span>
        </p>
      ))}
      {footer.length > 0 && (
        <div className="ws-chart-tooltip-footer">
          {footer.map(row => (
            <p key={row.key || row.label} className={`ws-chart-tooltip-row ${row.strong ? 'ws-chart-tooltip-strong' : ''}`}>
              <span className="ws-chart-tooltip-label">{row.label}</span>
              <span className="ws-chart-tooltip-value">{row.value}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Faint horizontal guides with their value labels at the left of the plot. */
export function ChartGrid({ ticks, y, left, right, format, zero = true }) {
  return (
    <g aria-hidden="true">
      {ticks.map(tick => (
        <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={tick === 0 && zero ? 'ws-chart-baseline' : 'ws-chart-grid'} strokeDasharray={tick === 0 && zero ? undefined : CHART.gridDash} />
          <text x={left - 10} y={y(tick)} dy="0.35em" textAnchor="end" className="ws-chart-tick">{format(tick)}</text>
        </g>
      ))}
    </g>
  )
}

/** A fade under a line, top to bottom. Put it inside the chart's <svg>. */
export function ChartGradient({ id, color, opacity = 0.2 }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style={{ stopColor: color, stopOpacity: opacity }} />
        <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
      </linearGradient>
    </defs>
  )
}

/** A marked point: a ring in the card colour around the series colour. */
export function ChartDot({ cx, cy, color, r = CHART.dotRadius }) {
  return <circle cx={cx} cy={cy} r={r} className="ws-chart-dot" style={{ fill: color }} />
}

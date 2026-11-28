import React, { useState } from 'react'
import { barPath, labelStride, niceTicks, smoothPath } from '../../lib/chartScale'
import { formatCompactCurrency } from '../../lib/formatCurrency'
import { CHART, ChartDot, ChartGrid, ChartTooltip, useElementWidth } from './ChartKit'

// Columns over time, stacked or side by side, with optional lines (an
// average) and short marks (a break-even target) drawn over them. Real pixels,
// no viewBox scaling, so labels stay 12px on a phone. Hover, touch or focus a
// column for its card; `onSelect` makes columns open something.
//
// series:  [{ key, color }]                      columns, bottom to top when stacked
// lines:   [{ key, color, values, dash, dots }]  one value per row
// markers: [{ key, color, values }]              a short dashed mark over each column
export default function BarChart({
  rows,
  rowKey,
  series,
  stacked = false,
  value = (row, key) => Number(row[key]) || 0,
  lines = [],
  markers = [],
  xLabel,
  tooltip,
  onSelect,
  selectable = () => true,
  rowLabel,
  ariaLabel,
  lang = 'uz',
  height = CHART.height.regular,
  minSlot = 0,
  labelGap = 56,
  formatTick = tick => formatCompactCurrency(tick, lang),
}) {
  const [wrapRef, measured] = useElementWidth()
  const [active, setActive] = useState(null)

  const totals = rows.map(row => (stacked
    ? [series.reduce((sum, item) => sum + Math.max(0, value(row, item.key)), 0)]
    : series.map(item => value(row, item.key))))
  const extra = [...lines, ...markers].flatMap(item => item.values.filter(Number.isFinite))
  const all = [...totals.flat(), ...extra]
  const scale = niceTicks(Math.min(0, ...all), Math.max(0, ...all) * 1.04, 4)
  const tickWidth = Math.max(...scale.ticks.map(tick => formatTick(tick).length)) * CHART.tickCharWidth + 14

  const pad = { top: 12, right: 8, bottom: 30, left: Math.max(44, tickWidth) }
  const width = Math.max(measured || 0, rows.length * minSlot + pad.left + pad.right)
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom
  const y = v => pad.top + ((scale.max - v) / (scale.max - scale.min || 1)) * plotH
  const slot = rows.length ? plotW / rows.length : 0
  const center = index => pad.left + slot * (index + 0.5)
  const groupWidth = stacked
    ? Math.max(2, Math.min(CHART.barMax, slot * 0.68))
    : Math.max(2, Math.min(CHART.groupedBarMax * series.length + CHART.gap * (series.length - 1), slot * 0.72))
  const barWidth = stacked ? groupWidth : Math.max(2, (groupWidth - CHART.gap * (series.length - 1)) / Math.max(1, series.length))
  const radius = barWidth > 6 ? CHART.barRadius : 0
  const stride = labelStride(rows.length, plotW, labelGap)
  const base = y(0)

  const indexAt = event => {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.floor((event.clientX - box.left - pad.left) / (slot || 1))
    return index >= 0 && index < rows.length ? index : null
  }
  const canSelect = index => Boolean(onSelect) && index != null && selectable(rows[index], index)
  const tip = active == null ? null : tooltip?.(rows[active], active)

  function columns(row, index) {
    const start = center(index) - groupWidth / 2
    if (stacked) {
      const shown = series.filter(item => value(row, item.key) > 0)
      let stackTop = base
      return shown.map((item, position) => {
        const h = (value(row, item.key) / (scale.max - scale.min || 1)) * plotH
        const bottom = stackTop
        stackTop -= h
        const isTop = position === shown.length - 1
        const top = isTop ? stackTop : Math.min(bottom, stackTop + CHART.gap)
        return <path key={item.key} d={barPath(start, bottom, top, barWidth, radius, isTop)} style={{ fill: item.color }} />
      })
    }
    return series.map((item, position) => {
      const v = value(row, item.key)
      if (!v) return null
      return <path key={item.key} d={barPath(start + position * (barWidth + CHART.gap), base, y(v), barWidth, radius)} style={{ fill: item.color }} />
    })
  }

  return (
    <div ref={wrapRef} className="ws-chart relative w-full overflow-x-auto overflow-y-hidden">
      {width > 0 && rows.length > 0 && (
        <div className="relative" style={{ width }}>
          <svg
            width={width}
            height={height}
            className="block touch-pan-x"
            role="img"
            aria-label={ariaLabel}
            onPointerMove={event => setActive(indexAt(event))}
            onPointerDown={event => setActive(indexAt(event))}
            onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null) }}
            onClick={event => { const index = indexAt(event); if (canSelect(index)) onSelect(rows[index], index) }}
            style={{ cursor: active != null && canSelect(active) ? 'pointer' : undefined }}
          >
            <ChartGrid ticks={scale.ticks} y={y} left={pad.left} right={width - pad.right} format={formatTick} />
            {active != null && (
              <rect className="ws-chart-highlight" x={pad.left + active * slot + 1} y={pad.top} width={Math.max(0, slot - 2)} height={plotH} rx={6} />
            )}
            <g className="ws-chart-rise" style={{ transformOrigin: `0 ${base}px` }}>
              {rows.map((row, index) => (
                <g key={rowKey(row, index)} className={active != null && active !== index ? 'ws-chart-dim' : 'ws-chart-mark'}>
                  {columns(row, index)}
                </g>
              ))}
            </g>
            {markers.map(item => (
              <g key={item.key} pointerEvents="none">
                {item.values.map((v, index) => (v > 0 ? (
                  <line key={index} x1={center(index) - groupWidth / 2 - 4} x2={center(index) + groupWidth / 2 + 4} y1={y(v)} y2={y(v)} style={{ stroke: item.color }} strokeWidth={2} strokeDasharray="2 3" strokeLinecap="round" />
                ) : null))}
              </g>
            ))}
            {lines.map(item => (
              <g key={item.key} pointerEvents="none" className="ws-chart-fade">
                <path d={smoothPath(item.values.map((v, index) => ({ x: center(index), y: y(v) })))} fill="none" style={{ stroke: item.color }} strokeWidth={item.dash ? CHART.lineWidth : CHART.leadLineWidth} strokeDasharray={item.dash} strokeLinecap="round" strokeLinejoin="round" />
                {item.dots && item.values.map((v, index) => (Number.isFinite(v) ? <circle key={index} cx={center(index)} cy={y(v)} r={2.5} style={{ fill: item.color }} /> : null))}
                {active != null && Number.isFinite(item.values[active]) && <ChartDot cx={center(active)} cy={y(item.values[active])} color={item.color} />}
              </g>
            ))}
            {rows.map((row, index) => (index % stride === 0 ? (
              <text key={rowKey(row, index)} x={center(index)} y={height - 10} textAnchor="middle" className={`ws-chart-tick ${active === index ? 'ws-chart-tick-active' : ''}`}>{xLabel(row, index)}</text>
            ) : null))}
          </svg>
          {/* Keyboard and screen-reader users reach each column as a button over its slot. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex" style={{ paddingLeft: pad.left, paddingRight: pad.right, height: pad.top + plotH }}>
            {rows.map((row, index) => (
              canSelect(index) || rowLabel ? (
                <button
                  key={rowKey(row, index)}
                  type="button"
                  tabIndex={canSelect(index) ? 0 : -1}
                  aria-label={rowLabel?.(row, index)}
                  className="ws-chart-slot"
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  onClick={() => { if (canSelect(index)) onSelect(row, index) }}
                  style={{ width: slot }}
                />
              ) : <span key={rowKey(row, index)} style={{ width: slot }} />
            ))}
          </div>
          {tip && <ChartTooltip x={center(active)} width={width} {...tip} />}
        </div>
      )}
      {!(width > 0) && <div style={{ height }} />}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { ANALYSIS_OTHER_COLOR } from '../lib/accountingAnalysis'
import { formatCurrency } from '../lib/formatCurrency'

// Three-column money flow (sources -> hub -> targets) shared by Financial
// analysis and Owner profit. Same layout rules as the personal-finance Reports
// Sankey: real pixels (no viewBox scaling), a height that grows with the node
// count, node heights proportional to amounts, and side margins sized to the
// longest label so nothing is cut off. Tappable targets end with "›" and
// underline on hover, so it is visible which flows open something.
const SANKEY = { nodeWidth: 10, nodePadding: 16, perNode: 30, minHeight: 300, padY: 8, labelGap: 8, perColumn: 140 }

export const SANKEY_SOURCE_COLORS = { cafe: '#1baf7a', investor: '#4a3aa7', otherIncome: '#2a78d6', reserves: '#e34948' }
export const SANKEY_LEFT_COLOR = '#16a34a'

function formatCompact(value) {
  const amount = Math.abs(Number(value) || 0)
  const sign = Number(value) < 0 ? '−' : ''
  if (amount >= 1_000_000_000) return `${sign}${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (amount >= 1_000_000) return `${sign}${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (amount >= 1_000) return `${sign}${Math.round(amount / 1_000)}K`
  return `${sign}${Math.round(amount)}`
}

function percentOf(amount, total) {
  if (!(total > 0)) return '0%'
  return `${String(Math.round((amount / total) * 1000) / 10).replace(/\.0$/, '')}%`
}

let sankeyCanvas
function measureSankeyLabel(text) {
  if (typeof document === 'undefined') return text.length * 6.8
  const context = (sankeyCanvas ??= document.createElement('canvas')).getContext('2d')
  if (!context) return text.length * 6.8
  context.font = `600 12px ${getComputedStyle(document.body).fontFamily}`
  return context.measureText(text).width
}

function sankeyLinkPath(x0, y0, x1, y1) {
  const mid = (x0 + x1) / 2
  return `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}`
}

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

const defaultTargetClickable = node => !node.isLeft && !node.isOther

export default function SankeyChart({
  sankey,
  colors,
  hubLabel,
  emptyLabel,
  sourceLabel,
  targetLabel,
  onTargetClick,
  isTargetClickable = defaultTargetClickable,
  sourceColors = SANKEY_SOURCE_COLORS,
  leftColor = SANKEY_LEFT_COLOR,
}) {
  const [hovered, setHovered] = useState(null)
  const [wrapRef, measuredWidth] = useElementWidth()
  if (!sankey.total) return <p className="py-10 text-center text-sm font-bold text-[#8a867f]">{emptyLabel}</p>

  const { nodeWidth, nodePadding, perNode, minHeight, padY, labelGap, perColumn } = SANKEY
  const total = sankey.total
  const clickable = node => Boolean(onTargetClick) && isTargetClickable(node)
  const label = (name, amount) => `${name} · ${formatCompact(amount)}`
  const sourceText = node => label(sourceLabel(node.key), node.amount)
  const targetText = node => `${label(targetLabel(node.key), node.amount)}${clickable(node) ? ' ›' : ''}`
  const hubText = label(hubLabel, sankey.incomeTotal)

  const longest = texts => Math.ceil(Math.max(0, ...texts.map(measureSankeyLabel))) + labelGap + 6
  const marginLeft = longest(sankey.sources.map(sourceText))
  const marginRight = longest(sankey.targets.map(targetText))
  const middle = longest([hubText])
  const minWidth = marginLeft + marginRight + 2 * Math.max(perColumn, middle + 24)
  const width = Math.max(minWidth, measuredWidth || 0)
  const height = Math.max(minHeight, (sankey.sources.length + sankey.targets.length + 1) * perNode)

  // One scale for every column, taken from the column with the least room once its gaps are removed.
  const roomFor = count => height - padY * 2 - nodePadding * Math.max(0, count - 1) - 2 * count
  const scale = Math.max(0, Math.min(roomFor(sankey.sources.length), roomFor(sankey.targets.length), roomFor(1)) / total)
  const hubHeight = total * scale
  const hubTop = (height - hubHeight) / 2

  const leftX = marginLeft
  const rightX = width - marginRight - nodeWidth
  const hubX = Math.round((leftX + rightX) / 2)

  function layout(nodes) {
    const heights = nodes.map(node => Math.max(2, node.amount * scale))
    const used = heights.reduce((sum, h) => sum + h, 0) + nodePadding * Math.max(0, nodes.length - 1)
    let y = (height - used) / 2
    let hubY = hubTop
    return nodes.map((node, index) => {
      const band = node.amount * scale
      const placed = { ...node, y, h: heights[index], band, hubY }
      y += heights[index] + nodePadding
      hubY += band
      return placed
    })
  }

  const sources = layout(sankey.sources)
  const targets = layout(sankey.targets)
  const sourceColor = node => sourceColors[node.key] || ANALYSIS_OTHER_COLOR
  const targetColor = node => (node.isLeft ? leftColor : colors[node.key] || ANALYSIS_OTHER_COLOR)
  const linkOpacity = key => (hovered === key ? 0.5 : hovered ? 0.14 : 0.28)
  const hover = key => ({ onMouseEnter: () => setHovered(key), onMouseLeave: () => setHovered(null) })
  const percent = amount => percentOf(amount, total)

  return (
    <div ref={wrapRef} className="overflow-x-auto">
      <svg width={width} height={height} className="block" role="img" aria-label={hubLabel}>
        {sources.map(node => (
          <path
            key={`ls-${node.key}`}
            d={sankeyLinkPath(leftX + nodeWidth, node.y + node.h / 2, hubX, node.hubY + node.band / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className="stroke-current text-[#8a867f] transition-[stroke-opacity]"
            strokeOpacity={linkOpacity(`s-${node.key}`)}
            {...hover(`s-${node.key}`)}
          >
            <title>{`${sourceLabel(node.key)} → ${hubLabel}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
          </path>
        ))}
        {targets.map(node => (
          <path
            key={`lt-${node.key}`}
            d={sankeyLinkPath(hubX + nodeWidth, node.hubY + node.band / 2, rightX, node.y + node.h / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className={`stroke-current text-[#8a867f] transition-[stroke-opacity] ${clickable(node) ? 'cursor-pointer' : ''}`}
            strokeOpacity={linkOpacity(`t-${node.key}`)}
            onClick={clickable(node) ? () => onTargetClick(node.key) : undefined}
            {...hover(`t-${node.key}`)}
          >
            <title>{`${hubLabel} → ${targetLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
          </path>
        ))}

        {sources.map(node => (
          <g key={`s-${node.key}`} {...hover(`s-${node.key}`)}>
            <title>{`${sourceLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
            <rect x={leftX} y={node.y} width={nodeWidth} height={node.h} rx={3} fill={sourceColor(node)} />
            <text x={leftX - labelGap} y={node.y + node.h / 2} dy="0.35em" textAnchor="end" className="fill-current text-[#22201d] text-[12px] font-semibold">{sourceText(node)}</text>
          </g>
        ))}

        <rect x={hubX} y={hubTop} width={nodeWidth} height={hubHeight} rx={3} className="fill-current text-[#22201d]" />
        <text x={hubX + nodeWidth + labelGap} y={hubTop + hubHeight / 2} dy="0.35em" className="fill-current text-[#22201d] text-[12px] font-semibold">{hubText}</text>

        {targets.map(node => (
          <g
            key={`t-${node.key}`}
            className={clickable(node) ? 'group cursor-pointer' : ''}
            onClick={clickable(node) ? () => onTargetClick(node.key) : undefined}
            {...(clickable(node) ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `${targetLabel(node.key)}: ${formatCurrency(node.amount)}`,
              onKeyDown: event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onTargetClick(node.key)
                }
              },
            } : {})}
            {...hover(`t-${node.key}`)}
          >
            <title>{`${targetLabel(node.key)}: ${formatCurrency(node.amount)} (${percent(node.amount)})`}</title>
            <rect x={rightX} y={node.y} width={nodeWidth} height={node.h} rx={3} fill={targetColor(node)} />
            <text
              x={rightX + nodeWidth + labelGap}
              y={node.y + node.h / 2}
              dy="0.35em"
              className={`fill-current text-[12px] font-semibold ${clickable(node) ? 'text-[#22201d] group-hover:text-[#ff5a00] group-hover:underline group-focus:text-[#ff5a00]' : 'text-[#22201d]'}`}
            >
              {targetText(node)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

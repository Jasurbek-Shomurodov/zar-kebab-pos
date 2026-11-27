import React, { useState } from 'react'
import { ChartTooltip, useElementWidth } from './charts/ChartKit'
import { ANALYSIS_OTHER_COLOR } from '../lib/accountingAnalysis'
import { formatCompactCurrency, formatCurrency, formatPercent } from '../lib/formatCurrency'

// Three-column money flow (sources -> hub -> targets) shared by Financial
// analysis and Owner profit. Same layout rules as the personal-finance Reports
// Sankey: real pixels (no viewBox scaling), a height that grows with the node
// count, node heights proportional to amounts, and side margins sized to the
// longest label so nothing is cut off. Tappable targets end with "›" and
// underline on hover, so it is visible which flows open something.
const SANKEY = { nodeWidth: 10, nodePadding: 16, perNode: 30, minHeight: 300, padY: 8, labelGap: 8, perColumn: 140 }

export const SANKEY_SOURCE_COLORS = { cafe: '#1baf7a', investor: '#4a3aa7', otherIncome: '#2a78d6', reserves: '#e34948' }
export const SANKEY_LEFT_COLOR = '#16a34a'

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

export { useElementWidth }

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
  lang = 'uz',
}) {
  const [hovered, setHovered] = useState(null)
  const [pointer, setPointer] = useState(null)
  const [wrapRef, measuredWidth] = useElementWidth()
  if (!sankey.total) return <p className="py-10 text-center text-sm font-medium text-[#68655f]">{emptyLabel}</p>

  const { nodeWidth, nodePadding, perNode, minHeight, padY, labelGap, perColumn } = SANKEY
  const total = sankey.total
  const clickable = node => Boolean(onTargetClick) && isTargetClickable(node)
  const label = (name, amount) => `${name} · ${formatCompactCurrency(amount, lang)}`
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
  // Each flow takes the colour of the node it feeds, faint until hovered; the hovered one comes forward.
  const linkOpacity = key => (hovered === key ? 0.55 : hovered ? 0.12 : 0.3)
  const nodeOpacity = key => (hovered && hovered !== key ? 0.45 : 1)
  const move = event => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect()
    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
  }
  const hover = key => ({ onPointerEnter: event => { setHovered(key); move(event) }, onPointerMove: move, onPointerLeave: () => { setHovered(null); setPointer(null) } })
  const percent = amount => (total > 0 ? formatPercent((amount / total) * 100, lang) : formatPercent(0, lang))

  const hoveredNode = hovered?.startsWith('s-')
    ? sources.find(node => `s-${node.key}` === hovered)
    : targets.find(node => `t-${node.key}` === hovered)
  const tip = hoveredNode && pointer ? {
    title: hovered.startsWith('s-') ? `${sourceLabel(hoveredNode.key)} → ${hubLabel}` : `${hubLabel} → ${targetLabel(hoveredNode.key)}`,
    rows: [{ key: 'amount', label: hovered.startsWith('s-') ? sourceLabel(hoveredNode.key) : targetLabel(hoveredNode.key), color: hovered.startsWith('s-') ? sourceColor(hoveredNode) : targetColor(hoveredNode), value: formatCurrency(hoveredNode.amount) }],
    footer: [{ key: 'share', label: hubLabel, value: percent(hoveredNode.amount) }],
  } : null

  return (
    <div ref={wrapRef} className="ws-chart relative overflow-x-auto">
      <svg width={width} height={height} className="block" role="img" aria-label={hubLabel}>
        {sources.map(node => (
          <path
            key={`ls-${node.key}`}
            d={sankeyLinkPath(leftX + nodeWidth, node.y + node.h / 2, hubX, node.hubY + node.band / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className="ws-sankey-link"
            style={{ stroke: sourceColor(node) }}
            strokeOpacity={linkOpacity(`s-${node.key}`)}
            {...hover(`s-${node.key}`)}
          >
          </path>
        ))}
        {targets.map(node => (
          <path
            key={`lt-${node.key}`}
            d={sankeyLinkPath(hubX + nodeWidth, node.hubY + node.band / 2, rightX, node.y + node.h / 2)}
            fill="none"
            strokeWidth={Math.max(1, node.band)}
            className={`ws-sankey-link ${clickable(node) ? 'cursor-pointer' : ''}`}
            style={{ stroke: targetColor(node) }}
            strokeOpacity={linkOpacity(`t-${node.key}`)}
            onClick={clickable(node) ? () => onTargetClick(node.key) : undefined}
            {...hover(`t-${node.key}`)}
          >
          </path>
        ))}

        {sources.map(node => (
          <g key={`s-${node.key}`} {...hover(`s-${node.key}`)}>
            <rect x={leftX} y={node.y} width={nodeWidth} height={node.h} rx={3} className="ws-sankey-node" style={{ fill: sourceColor(node), opacity: nodeOpacity(`s-${node.key}`) }} />
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
            <rect x={rightX} y={node.y} width={nodeWidth} height={node.h} rx={3} className="ws-sankey-node" style={{ fill: targetColor(node), opacity: nodeOpacity(`t-${node.key}`) }} />
            <text
              x={rightX + nodeWidth + labelGap}
              y={node.y + node.h / 2}
              dy="0.35em"
              className={`fill-current text-[12px] font-semibold ${clickable(node) ? 'text-[#22201d] group-hover:text-[#bf4300] group-hover:underline group-focus:text-[#bf4300]' : 'text-[#22201d]'}`}
            >
              {targetText(node)}
            </text>
          </g>
        ))}
      </svg>
      {tip && <ChartTooltip x={pointer.x} width={width} top={Math.max(0, Math.min(pointer.y - 40, height - 110))} {...tip} />}
    </div>
  )
}

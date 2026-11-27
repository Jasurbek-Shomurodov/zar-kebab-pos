import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { barPath, labelStride, niceStep, niceTicks, smoothPath, tooltipLeft } from '../src/lib/chartScale.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('axis ticks are round numbers that cover the data and include zero', () => {
  assert.equal(niceStep(0.7), 1)
  assert.equal(niceStep(1_830_000), 2_000_000)
  assert.equal(niceStep(2_300_000), 2_500_000)
  const { ticks, min, max } = niceTicks(0, 7_430_000, 4)
  assert.deepEqual(ticks, [0, 2_000_000, 4_000_000, 6_000_000, 8_000_000])
  assert.equal(min, 0)
  assert.equal(max, 8_000_000)
  const signed = niceTicks(-1_200_000, 3_100_000, 4)
  assert.ok(signed.ticks.includes(0))
  assert.ok(signed.min <= -1_200_000 && signed.max >= 3_100_000)
  assert.deepEqual(niceTicks(0, 0).ticks, [0, 1])
})

test('a column is rounded only at its data end', () => {
  assert.equal(barPath(0, 100, 40, 20, 4), 'M0,100V44Q0,40 4,40H16Q20,40 20,44V100Z')
  assert.equal(barPath(0, 100, 40, 20, 4, false), 'M0,100V40Q0,40 0,40H20Q20,40 20,40V100Z')
  // A loss grows down from the zero line and rounds at the bottom.
  assert.equal(barPath(0, 50, 90, 20, 4), 'M0,50V86Q0,90 4,90H16Q20,90 20,86V50Z')
  assert.equal(barPath(0, 100, 100, 20), '')
})

test('a smooth line passes through every point and never overshoots a flat run', () => {
  const path = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 0 }])
  assert.match(path, /^M0,10C/)
  assert.match(path, / 10,10C/)
  assert.match(path, / 30,0$/)
  // Control points of the flat first segment stay on y = 10.
  assert.match(path, /^M0,10C3\.33+\d*,10 6\.66+\d*,10 10,10/)
  assert.equal(smoothPath([{ x: 0, y: 1 }, { x: 5, y: 2 }]), 'M0,1L5,2')
})

test('x labels thin out and the hover card stays inside the chart', () => {
  assert.equal(labelStride(31, 900, 56), 2)
  assert.equal(labelStride(12, 900, 56), 1)
  assert.equal(tooltipLeft(100, 200, 800), 114)
  assert.equal(tooltipLeft(700, 200, 800), 486)
  assert.equal(tooltipLeft(10, 300, 280), 0)
})

test('every bar chart takes its look from the shared chart kit', () => {
  const analysis = read('src/pages/AccountingAnalysis.jsx')
  for (const name of ['DailySpendingChart', 'DailyIncomeChart', 'TrendChart']) {
    const start = analysis.indexOf(`function ${name}(`)
    const body = analysis.slice(start, analysis.indexOf('\nfunction ', start + 10))
    assert.match(body, /<BarChart\b/, name)
    assert.match(body, /<ChartLegend\b/, name)
    // No hand-rolled hover cards or column highlights in a page.
    assert.doesNotMatch(body, /shadow-lg|rgb\(255 90 0/, name)
  }
  assert.match(analysis, /function IncomeSourcesChart[\s\S]*<ChartTooltip[\s\S]*function IncomeSourcesCard/)
  const sankey = read('src/components/SankeyChart.jsx')
  assert.match(sankey, /<ChartTooltip /)
  assert.doesNotMatch(sankey, /<title>/)
  const css = read('src/styles/workspace.css')
  assert.match(css, /\.ws-chart-tooltip \{[^}]*var\(--ws-card\)/)
  assert.match(css, /prefers-reduced-motion[\s\S]*\.ws-chart-rise/)
})

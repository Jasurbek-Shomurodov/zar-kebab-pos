import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { formatCurrency, formatCurrencyWithPercentage } from '../src/lib/formatCurrency.js'

test('profit values format amount and localized margin together', () => {
  assert.match(
    formatCurrencyWithPercentage(1_790_306, 63.4, 'en'),
    /^1[,\s]790[,\s]306 UZS · 63\.4%$/
  )
  assert.match(formatCurrencyWithPercentage(1_790_306, 63.4, 'ru'), / · 63,4%$/)
  assert.match(formatCurrencyWithPercentage(1_790_306, 63.4, 'uz'), / · 63,4%$/)
  assert.match(formatCurrencyWithPercentage(1_790_306, null, 'en'), / UZS$/)
})

test('money grouping never depends on the browser carrying Uzbek number data', async () => {
  // Desktop and Android Chrome claim to support uz-UZ but ship no number data for it and
  // print "65,000". The formatter must produce the same text on every device.
  const { formatGroupedNumber } = await import('../src/lib/formatCurrency.js')
  const source = readFileSync(new URL('../src/lib/formatCurrency.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Intl\.NumberFormat\('uz-UZ'\)/)

  assert.equal(formatGroupedNumber(65000), '65 000')
  assert.equal(formatGroupedNumber(-65000), '-65 000')
  assert.equal(formatGroupedNumber(1234567.5), '1 234 567,5')
  assert.equal(formatGroupedNumber(999), '999')
  assert.equal(formatGroupedNumber(0), '0')
  assert.equal(formatGroupedNumber('42000'), '42 000')
  assert.equal(formatCurrency(1250000), '1 250 000 UZS')
})

test('the device-independent grouping matches what the full-data formatter printed before', async () => {
  const { formatGroupedNumber } = await import('../src/lib/formatCurrency.js')
  const reference = new Intl.NumberFormat('uz-UZ')
  const samples = [0, 1, 12, 999, 1000, 29399.999999999996, 0.355 * 84500, 12.345, 12.3456, -0.4, 1e9, 987654321.125, 0.0004, -1500.5]
  let seed = 7
  for (let i = 0; i < 400; i += 1) {
    seed = (seed * 16807) % 2147483647
    samples.push(Math.round((seed / 2147483647) * 5e8) / (i % 3 === 0 ? 1 : i % 3 === 1 ? 10 : 1000) * (i % 7 === 0 ? -1 : 1))
  }
  for (const value of samples) {
    assert.equal(formatGroupedNumber(value), reference.format(value), `value ${value}`)
  }
})

test('percentages use the language decimal mark and drop trailing zeros', async () => {
  const { formatPercent } = await import('../src/lib/formatCurrency.js')
  assert.equal(formatPercent(12.5, 'ru'), '12,5%')
  assert.equal(formatPercent(12.5, 'uz'), '12,5%')
  assert.equal(formatPercent(12.5, 'en'), '12.5%')
  assert.equal(formatPercent(12, 'ru'), '12%')
  assert.equal(formatPercent(63.44, 'en'), '63.4%')
  assert.equal(formatPercent(63.456, 'en', 2), '63.46%')
  assert.equal(formatPercent(-0.01, 'en'), '0%')
  assert.equal(formatPercent(Number.NaN, 'en'), '—')
})

test('compact money is translated, signed with a real minus and never used below a thousand', async () => {
  const { formatCompactCurrency } = await import('../src/lib/formatCurrency.js')
  assert.equal(formatCompactCurrency(12_500_000, 'ru'), '12,5 млн')
  assert.equal(formatCompactCurrency(12_500_000, 'uz'), '12,5 mln')
  assert.equal(formatCompactCurrency(12_500_000, 'en'), '12.5M')
  assert.equal(formatCompactCurrency(850_000, 'uz'), '850 ming')
  assert.equal(formatCompactCurrency(1_200_000_000, 'ru'), '1,2 млрд')
  assert.equal(formatCompactCurrency(-68_000_000, 'en'), '−68M')
  assert.equal(formatCompactCurrency(3_100_000, 'en', { signed: true }), '+3.1M')
  assert.equal(formatCompactCurrency(950, 'ru'), '950')
  assert.equal(formatCompactCurrency(0, 'ru', { signed: true }), '0')
})

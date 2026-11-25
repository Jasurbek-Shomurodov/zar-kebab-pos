import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MAX_DESCRIPTION, diffOffers, formatReport, parseArgs, parseOffers, trimDescriptions, trimText,
} from '../scripts/yandex-menu-sync.mjs'

const offer = (id, name, price, description = '') => [
  `      <offer id="${id}">`,
  `        <name>${name}</name>`,
  `        <price>${price}</price>`,
  description && `        <description>${description}</description>`,
  '      </offer>',
].filter(Boolean).join('\n')

test('parseOffers reads ids, decoded names and prices', () => {
  const yml = [offer('zk-beef', 'Шашлык &amp; лук', 35000), offer('cola-1l', 'Кока-Кола 1L', 25000)].join('\n')
  assert.deepEqual(parseOffers(yml), [
    { id: 'zk-beef', name: 'Шашлык & лук', price: 35000 },
    { id: 'cola-1l', name: 'Кока-Кола 1L', price: 25000 },
  ])
})

test('diffOffers keys by offer id so renames and reprices are single changes', () => {
  const before = [
    { id: 'a', name: 'Плов', price: 40000 },
    { id: 'b', name: 'Вода', price: 5000 },
    { id: 'c', name: 'Чай', price: 8000 },
  ]
  const after = [
    { id: 'a', name: 'Плов', price: 45000 },
    { id: 'c', name: 'Чай зелёный', price: 8000 },
    { id: 'd', name: 'Самса', price: 12000 },
  ]
  const diff = diffOffers(before, after)
  assert.deepEqual(diff.added.map(row => row.id), ['d'])
  assert.deepEqual(diff.removed.map(row => row.id), ['b'])
  assert.deepEqual(diff.repriced, [{ id: 'a', name: 'Плов', from: 40000, to: 45000 }])
  assert.deepEqual(diff.renamed, [{ id: 'c', from: 'Чай', to: 'Чай зелёный' }])
  const report = formatReport(diff)
  assert.match(report, /\+ Самса — 12 000 сум/)
  assert.match(report, /~ Плов: 40 000 сум → 45 000 сум/)
  assert.equal(formatReport(diffOffers(after, after)), 'No menu changes since the last upload.')
})

test('long descriptions are cut at a word boundary within the Yandex limit', () => {
  const long = `${'слово '.repeat(80)}конец`
  const short = trimText(long)
  assert.ok([...short].length <= MAX_DESCRIPTION)
  assert.ok(short.endsWith('…'))
  assert.doesNotMatch(short, /\s…$/)
  assert.equal(trimText('коротко'), 'коротко')
})

test('trimDescriptions measures decoded text and re-encodes the result', () => {
  const longText = `Говядина &amp; лук ${'на углях '.repeat(40)}`
  const yml = [offer('a', 'A', 1, longText), offer('b', 'B', 2, 'Говядина &amp; лук')].join('\n')
  const { yml: output, trimmed } = trimDescriptions(yml)
  assert.equal(trimmed, 1)
  assert.match(output, /<description>Говядина &amp; лук на углях/)
  assert.match(output, /<description>Говядина &amp; лук<\/description>/)
  for (const [, raw] of output.matchAll(/<description>([\s\S]*?)<\/description>/g)) {
    assert.ok([...raw.replace(/&amp;/g, '&')].length <= MAX_DESCRIPTION)
  }
})

test('the last uploaded file already fits the description limit', () => {
  const yml = readFileSync(new URL('../deliverables/yandex-menu-regular.yml', import.meta.url), 'utf8')
  assert.ok(parseOffers(yml).length > 0)
  assert.equal(trimDescriptions(yml).trimmed, 0)
})

test('parseArgs accepts the documented options only', () => {
  assert.deepEqual(parseArgs([]), { fromDb: false, dryRun: false, out: 'deliverables/yandex-menu-regular.yml' })
  assert.deepEqual(parseArgs(['--from-db', '--dry-run', '--out=/tmp/x.yml']), { fromDb: true, dryRun: true, out: '/tmp/x.yml' })
  assert.throws(() => parseArgs(['--force']), /Unknown option/)
})

test('npm run yandex:menu points at the sync script', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['yandex:menu'], 'node scripts/yandex-menu-sync.mjs')
})

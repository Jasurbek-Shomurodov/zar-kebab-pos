import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MAX_DESCRIPTION, buildTeamCaption, buildTeamMessage, diffOffers, hasChanges, formatReport, parseArgs, parseOffers, tashkentDate,
  trimDescriptions, trimText,
} from '../scripts/yandex-menu-sync.mjs'
import { buildYandexSyncImageSvg, wrapLine } from '../api/telegram/_lib/yandexMenuSyncImage.js'

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
  const defaults = { notes: [], image: '', text: false }
  assert.deepEqual(parseArgs([]), { fromDb: false, dryRun: false, uploaded: false, out: 'deliverables/yandex-menu-regular.yml', ...defaults })
  assert.deepEqual(parseArgs(['--from-db', '--dry-run', '--uploaded', '--out=/tmp/x.yml']), { fromDb: true, dryRun: true, uploaded: true, out: '/tmp/x.yml', ...defaults })
  assert.throws(() => parseArgs(['--force']), /Unknown option/)
})

test('npm run yandex:menu points at the sync script', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['yandex:menu'], 'node scripts/yandex-menu-sync.mjs')
})

test('the Team group report is Russian, escaped and lists every change', () => {
  const diff = {
    added: [{ id: 'd', name: 'Самса <новая>', price: 12000 }],
    removed: [{ id: 'b', name: 'Вода', price: 5000 }],
    repriced: [{ id: 'a', name: 'Плов', from: 40000, to: 45000 }],
    renamed: [{ id: 'c', from: 'Чай', to: 'Чай зелёный' }],
  }
  const text = buildTeamMessage(diff, 179)
  assert.match(text, /^🗺 <b>Меню Zar Kebab обновлено в Яндекс Картах<\/b>/)
  assert.match(text, /Позиций в прайс-листе: 179/)
  assert.match(text, /➕ Самса &lt;новая&gt; — 12 000 сум/)
  assert.match(text, /➖ Вода — 5 000 сум/)
  assert.match(text, /💰 Плов: 40 000 сум → 45 000 сум/)
  assert.match(text, /✏️ Чай → Чай зелёный/)
  assert.ok(hasChanges(diff))
})

test('an unchanged upload still reports, and long reports fit one Telegram message', () => {
  const empty = { added: [], removed: [], repriced: [], renamed: [] }
  assert.match(buildTeamMessage(empty, 179), /Изменений в меню нет\./)
  assert.equal(hasChanges(empty), false)
  const many = { ...empty, added: Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: `Блюдо номер ${i}`, price: 10000 })) }
  const text = buildTeamMessage(many, 300)
  assert.ok(text.length <= 4000)
  assert.match(text, /…и ещё изменения/)
})

test('parseArgs collects report notes, the image path and the text fallback', () => {
  const args = parseArgs(['--uploaded', '--note=Все отзывы с ответом', '--note= Профиль проверен ', '--image=out.png', '--text'])
  assert.equal(args.uploaded, true)
  assert.deepEqual(args.notes, ['Все отзывы с ответом', 'Профиль проверен'])
  assert.equal(args.image, 'out.png')
  assert.equal(args.text, true)
})

test('buildTeamCaption counts the changes and tashkentDate uses the Tashkent business day', () => {
  const diff = { added: [{}], removed: [{}, {}], repriced: [], renamed: [] }
  assert.match(buildTeamCaption(diff, 177), /Позиций: 177 · удалено 2, добавлено 1/)
  assert.match(buildTeamCaption({ added: [], removed: [], repriced: [], renamed: [] }, 179), /без изменений/)
  assert.equal(tashkentDate(new Date('2026-11-25T19:30:00Z')), '2026-11-26')
})

test('Yandex sync image lists changes and notes in Russian, escaped, with public data only', () => {
  const diff = {
    added: [{ id: 'a', name: 'Самса & чай', price: 12000 }],
    removed: [{ id: 'b', name: 'Окрошка', price: 25000 }],
    repriced: [{ id: 'c', name: 'Плов', from: 40000, to: 45000 }],
    renamed: [],
  }
  const svg = buildYandexSyncImageSvg({ diff, offers: 179, previous: 179, date: '2026-11-26', notes: ['Все отзывы с ответом'] })
  assert.match(svg, /Меню обновлено/)
  assert.match(svg, /УДАЛЕНО \(1\)/)
  assert.match(svg, /Окрошка — 25 000 сум/)
  assert.match(svg, /Самса &amp; чай/)
  assert.match(svg, /Плов: 40 000 сум → 45 000 сум/)
  assert.match(svg, /ОТЗЫВЫ И ПРОФИЛЬ/)
  assert.doesNotMatch(svg, /НОВОЕ НАЗВАНИЕ|себестоим|cost/i)
  const empty = buildYandexSyncImageSvg({ diff: { added: [], removed: [], repriced: [], renamed: [] }, offers: 5, previous: 5, date: '2026-11-26' })
  assert.match(empty, /Изменений в меню нет\./)
  assert.match(empty, /Меню проверено/)
})

test('wrapLine keeps long dish names on several lines without cutting words', () => {
  const lines = wrapLine('Очень длинное название блюда '.repeat(4), 30)
  assert.ok(lines.length > 1)
  assert.ok(lines.every(line => [...line].length <= 30))
})

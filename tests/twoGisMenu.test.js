import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TWO_GIS_COLUMNS, buildTwoGisMenuCsv, parseTwoGisCsv, twoGisDescription, twoGisExcludedCategories, twoGisId, twoGisName,
  twoGisRowsFromYml,
} from '../api/_lib/twoGisMenu.js'

const yml = [
  '<categories>',
  '  <category id="1">Шашлык</category>',
  '  <category id="2">Алкоголь</category>',
  '  <category id="3">Напитки</category>',
  '</categories>',
  '<offer id="zk-beef"><name>Шашлык &amp; лук</name><categoryId>1</categoryId><price>35000</price><currencyId>UZS</currencyId>',
  '<description>150 г — Говядина; "на углях"</description><picture>https://cdn.example/beef.jpg</picture></offer>',
  '<offer id="i1779094589474-option-1782757635126"><name>Пиво (0,5 л)</name><categoryId>2</categoryId><price>30000</price></offer>',
  '<offer id="i1780411766263"><name>МОХИТО</name><categoryId>3</categoryId><price>60000</price>',
  '<description>Акция! Освежающий мохито</description></offer>',
  '<offer id="free"><name>Вода</name><categoryId>3</categoryId><price>0</price></offer>',
].join('\n')

test('2GIS rows reuse the Yandex offers, drop alcohol and zero prices, and keep public data only', () => {
  const rows = twoGisRowsFromYml(yml, { excludedCategories: twoGisExcludedCategories({}) })
  assert.deepEqual(rows.map(row => row.name), ['Шашлык & лук', 'Мохито'])
  assert.deepEqual(rows[0], {
    name: 'Шашлык & лук', price: 35000, currencyId: 'UZS', measure: '', available: '', category: 'Шашлык', url: '',
    picture: 'https://cdn.example/beef.jpg', vendor: '', id: 'zkbeef', description: '150 г — Говядина; "на углях"',
  })
  assert.equal(rows[1].description, '', 'promo words are not allowed in 2GIS descriptions')
  assert.deepEqual(twoGisRowsFromYml(yml, { excludedCategories: new Set() }).map(row => row.category), ['Шашлык', 'Алкоголь', 'Напитки'])
})

test('2GIS CSV uses the documented header, semicolons and quoted fields that round-trip', () => {
  const { csv, offers } = buildTwoGisMenuCsv(yml, { excludedCategories: twoGisExcludedCategories({}) })
  assert.equal(offers, 2)
  const lines = csv.trimEnd().split('\n')
  assert.equal(lines[0], TWO_GIS_COLUMNS.join(';'))
  assert.match(lines[1], /^Шашлык & лук;35000;UZS;;;Шашлык;;https:\/\/cdn\.example\/beef\.jpg;;zkbeef;"150 г — Говядина; ""на углях"""$/)
  const parsed = parseTwoGisCsv(csv)
  assert.equal(parsed[0].description, '150 г — Говядина; "на углях"')
  assert.equal(parsed[1].name, 'Мохито')
  assert.deepEqual(parseTwoGisCsv(''), [])
})

test('2GIS ids are letters and digits up to 20 characters, stable for long variant ids', () => {
  assert.equal(twoGisId('i1780411766263'), 'i1780411766263')
  const long = twoGisId('i1779094589474-option-1782757635126')
  assert.match(long, /^[A-Za-z0-9]{1,20}$/)
  assert.equal(long, twoGisId('i1779094589474-option-1782757635126'))
  assert.notEqual(long, twoGisId('i1779094589474-option-1782757673683'))
})

test('2GIS names lose shouting and descriptions follow the 500-character, no-link rule', () => {
  assert.equal(twoGisName('МОХИТО'), 'Мохито')
  assert.equal(twoGisName('BBQ'), 'BBQ')
  assert.equal(twoGisName('Компот “Болалик”'), 'Компот “Болалик”')
  assert.equal([...twoGisName('Я'.repeat(300).toLowerCase())].length, 200)
  assert.equal(twoGisDescription('Смотрите https://zarkebab.uz'), '')
  assert.equal(twoGisDescription('Звоните +998 91 509 55 45'), '')
  assert.equal(twoGisDescription('250 г, 420 ккал — Нежный суп'), '250 г, 420 ккал — Нежный суп')
  const long = twoGisDescription('слово '.repeat(200))
  assert.ok([...long].length <= 500 && long.endsWith('…'))
})

test('the committed Yandex upload converts to a non-empty 2GIS list without alcohol', () => {
  const live = readFileSync(new URL('../deliverables/yandex-menu-regular.yml', import.meta.url), 'utf8')
  const rows = twoGisRowsFromYml(live, { excludedCategories: twoGisExcludedCategories({}) })
  assert.ok(rows.length > 100)
  assert.ok(rows.every(row => row.category !== 'Алкоголь'))
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'ids stay unique')
  assert.ok(rows.every(row => /^[A-Za-z0-9]{1,20}$/.test(row.id)))
})

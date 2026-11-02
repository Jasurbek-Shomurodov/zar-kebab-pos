import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import {
  buildTechCardChangeImageSvgs,
  describeTechCardChanges,
  diffTechCardComponents,
  diffTechCardIngredients,
} from '../api/telegram/_lib/techCardChangeImage.js'
import {
  buildTechCardChangeCaption,
  deliverTechCardChangeNotification,
  loadTechCardChangeTarget,
  sendTechCardPages,
} from '../api/telegram/_lib/techCardChangeNotifications.js'

const recipe = (overrides = {}) => ({
  portion_count: 1,
  portion_cost: 61200,
  preparation_steps: 'Обжарить мясо.',
  notes: '',
  ingredients: [
    { name: 'Говядина', quantity: 0.5, unit: 'kg', unit_price_uzs: 120000 },
    { name: 'Зира', quantity: 5, unit: 'g', unit_price_uzs: 200 },
  ],
  components: [{ menu_item_id: 'fries', selected_options: {}, name: 'Картофель фри', quantity: 1, unit: 'piece', unit_cost: 1163 }],
  ...overrides,
})

const snapshot = (overrides = {}) => ({
  event_type: 'updated',
  name: 'Казан <кебаб>',
  variant: '',
  sale_price: 120000,
  actor_name: '<Admin>',
  changed_at: '2026-11-02T09:30:00Z',
  before: recipe(),
  after: recipe({
    portion_cost: 73000,
    ingredients: [
      { name: 'Говядина', quantity: 0.6, unit: 'kg', unit_price_uzs: 120000 },
      { name: 'Чеснок', quantity: 20, unit: 'g', unit_price_uzs: 60 },
    ],
  }),
  ...overrides,
})

function ledger(snapshotValue = snapshot()) {
  const row = { id: 'r1', status: 'queued', snapshot: snapshotValue, telegram_message_ids: [] }
  return { row, from() {
    let patch = null
    const filters = []
    const query = {
      update(value) { patch = value; return this },
      eq(key, value) { filters.push([key, value]); return this },
      select() { return this },
      maybeSingle() { return this },
      then(resolve) {
        const matches = filters.every(([key, value]) => row[key] === value)
        if (matches) Object.assign(row, patch)
        return Promise.resolve({ data: matches ? { ...row } : null, error: null }).then(resolve)
      },
    }
    return query
  } }
}

test('recipe diff marks added, removed, changed and untouched rows', () => {
  const rows = diffTechCardIngredients(snapshot().before.ingredients, [
    { name: 'говядина ', quantity: 0.5, unit: 'kg', unit_price_uzs: 120000 },
    { name: 'Чеснок', quantity: 20, unit: 'g', unit_price_uzs: 60 },
  ])
  assert.deepEqual(rows.map(row => row.status), ['same', 'added', 'removed'])
  assert.equal(diffTechCardIngredients(
    [{ name: 'Лук', quantity: 1, unit: 'kg', unit_price_uzs: 5000 }],
    [{ name: 'Лук', quantity: 1, unit: 'kg', unit_price_uzs: 6000 }],
  )[0].status, 'changed')
  // The same meal in another variant is a different included row.
  const before = [{ menu_item_id: 'a', selected_options: { size: 'small' }, quantity: 1 }]
  const after = [{ menu_item_id: 'a', selected_options: { size: 'large' }, quantity: 1 }]
  assert.deepEqual(diffTechCardComponents(before, after).map(row => row.status), ['added', 'removed'])
})

test('the image lists what changed, then old on the left and new on the right', () => {
  const [svg, ...rest] = buildTechCardChangeImageSvgs(snapshot())
  assert.equal(rest.length, 0)
  assert.match(svg, /ИЗМЕНЕНА ТЕХКАРТА/)
  assert.ok(svg.indexOf('Что изменилось') < svg.indexOf('БЫЛО'))
  assert.ok(svg.indexOf('БЫЛО') < svg.indexOf('СТАЛО'))
  assert.match(svg, /Говядина: с 0,5 кг на 0,6 кг/)
  assert.match(svg, /Добавлено: Чеснок, 20 г/)
  assert.match(svg, /Удалено: Зира, 5 г/)
  assert.match(svg, /Себестоимость порции: с 61\s200 на 73\s000 UZS/)
  assert.match(svg, /\+12\s000/)
  assert.match(svg, /0,5 кг × 120\s000/)
  assert.match(svg, /0,6 кг × 120\s000/)
  assert.match(svg, /не было/)
  assert.match(svg, />удалено</)
  assert.match(svg, /Казан &lt;кебаб&gt;/)
  assert.match(svg, /&lt;Admin&gt;/)
  assert.doesNotMatch(svg, /<кебаб>|<Admin>/)
})

test('changes are summarized in plain sentences, including method, notes, portions and price', () => {
  const texts = describeTechCardChanges(snapshot({
    before: recipe({ notes: 'старое', ingredients: [{ name: 'Лук', quantity: 1, unit: 'kg', unit_price_uzs: 5000 }] }),
    after: recipe({ portion_count: 2, preparation_steps: 'Новый способ.', notes: 'новое', ingredients: [{ name: 'Лук', quantity: 1, unit: 'kg', unit_price_uzs: 6000 }] }),
  })).map(change => change.text)
  assert.ok(texts.includes('Лук: цена с 5\u00a0000 на 6\u00a0000'), texts.join('|'))
  assert.ok(texts.includes('Порций в партии: с 1 на 2'))
  assert.ok(texts.includes('Изменена технология приготовления'))
  assert.ok(texts.includes('Изменены примечания'))
  assert.deepEqual(describeTechCardChanges(snapshot({ before: null })), [])
})

test('the image never uses symbols missing from the shipped Noto Sans', () => {
  const svg = buildTechCardChangeImageSvgs(snapshot({ sale_price: 1000 })).join('')
  assert.doesNotMatch(svg, /[\u2212\u2192]/)
  assert.match(svg, /–72\s000 UZS/)
  const source = readFileSync(new URL('../api/telegram/_lib/techCardChangeImage.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source.replace(/^\/\/.*$/gm, ''), /[\u2212\u2192]/)
})

test('a new card uses one full-width column and an unavailable cost stays unset', () => {
  const [svg] = buildTechCardChangeImageSvgs(snapshot({
    event_type: 'created',
    before: null,
    after: recipe({
      portion_cost: null,
      components: [{ menu_item_id: 'x', selected_options: {}, name: 'Без цены', quantity: 1, unit: 'piece', unit_cost: null }],
    }),
  }))
  assert.match(svg, /НОВАЯ ТЕХКАРТА/)
  assert.match(svg, /нет себестоимости/)
  assert.doesNotMatch(svg, /БЫЛО|СТАЛО|Что изменилось|без изменений/)
  const [decimalPrice] = buildTechCardChangeImageSvgs(snapshot({ after: recipe({ ingredients: [{ name: 'Соль', quantity: 100, unit: 'g', unit_price_uzs: 7.5 }] }) }))
  assert.match(decimalPrice, /100 г × 7,5/)
})

test('a long card continues on more pages and keeps every step', () => {
  const steps = Array.from({ length: 200 }, (_, index) => `Шаг ${index + 1}`).join('\n')
  const pages = buildTechCardChangeImageSvgs(snapshot({
    before: recipe({ preparation_steps: steps }),
    after: recipe({ preparation_steps: steps }),
  }))
  assert.ok(pages.length > 1)
  for (const svg of pages) assert.ok(Number(svg.match(/height="(\d+)"/)[1]) <= 2100)
  const all = pages.join('')
  for (let index = 1; index <= 200; index += 1) assert.ok(all.includes(`>Шаг ${index}<`), `step ${index}`)
  assert.match(pages[1], />2 \/ \d+</)
  assert.match(pages[1], /БЫЛО/)
})

test('the caption is escaped and names the change', () => {
  const caption = buildTechCardChangeCaption(snapshot({ variant: 'Большой' }))
  assert.match(caption, /Изменена техкарта: Казан &lt;кебаб&gt; · Большой/)
  assert.match(caption, /&lt;Admin&gt;/)
  assert.match(caption, /14:30/)
})

test('pages go out in albums of ten with the caption only on the first photo', async () => {
  const calls = []
  const saved = []
  await sendTechCardPages('chat', Array.from({ length: 11 }, (_, index) => `p${index}`), 'caption', {
    sendAlbum: async (_, photos) => {
      calls.push(['album', photos.length, photos.filter(photo => photo.caption).length])
      return { result: photos.map((_, index) => ({ message_id: index + 1 })) }
    },
    sendPhoto: async (_, photo, options) => {
      calls.push(['photo', photo, options.caption])
      return { result: { message_id: 50 } }
    },
    onSent: async ids => { saved.push(...ids) },
  })
  assert.deepEqual(calls, [['album', 10, 1], ['photo', 'p10', '']])
  assert.equal(saved.length, 11)
})

test('delivery records the Telegram receipt once', async () => {
  const supabase = ledger()
  const result = await deliverTechCardChangeNotification(supabase, supabase.row, 'chat', {
    render: async () => ['png'],
    sendPhoto: async () => ({ result: { message_id: 7 } }),
  })
  assert.deepEqual(result, { status: 'sent' })
  assert.deepEqual(supabase.row.telegram_message_ids, [7])
  assert.equal(supabase.row.chat_id, 'chat')
  assert.deepEqual(await deliverTechCardChangeNotification(supabase, supabase.row, 'chat'), { status: 'duplicate' })
})

test('a render error returns to the queue because nothing reached Telegram', async () => {
  const supabase = ledger()
  const result = await deliverTechCardChangeNotification(supabase, supabase.row, 'chat', {
    render: async () => { throw new Error('font missing') },
    sendPhoto: async () => assert.fail('nothing should be sent'),
  })
  assert.equal(result.renderFailed, true)
  assert.equal(supabase.row.status, 'queued')
  assert.equal(supabase.row.error_message, 'font missing')
})

test('an unknown Telegram outcome is held for review, never resent', async () => {
  const supabase = ledger()
  const result = await deliverTechCardChangeNotification(supabase, supabase.row, 'chat', {
    render: async () => ['png'],
    sendPhoto: async () => { throw new Error('network timeout') },
  })
  assert.deepEqual(result, { status: 'processing', needsReview: true })
  assert.equal(supabase.row.status, 'processing')
})

test('the target has no fallback to any other group', async () => {
  const client = data => ({ from() { return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data, error: null }) } } })
  assert.equal(await loadTechCardChangeTarget(client({ chat_id: '-100', is_enabled: true })), '-100')
  assert.equal(await loadTechCardChangeTarget(client({ chat_id: '-100', is_enabled: false })), '')
  assert.equal(await loadTechCardChangeTarget(client(null)), '')
  const source = readFileSync(new URL('../api/telegram/_lib/techCardChangeNotifications.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /process\.env|salary_events|team_events/)
})

async function migrated(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema extensions; create schema net;
    create table public.current_actor(id uuid);
    create function auth.uid() returns uuid language sql stable as $$ select id from public.current_actor limit 1 $$;
    create function public.current_staff_can_access(text) returns boolean language sql as $$ select true $$;
    create function public.current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create table public.profiles(id uuid primary key, full_name text, email text);
    create table public.menu_items(id text primary key, name_ru text, name_uz text, name_en text, price integer, option_groups jsonb default '[]', sale_unit text default 'piece', deleted_at timestamptz);
    create table public.menu_item_costs(menu_item_id text primary key, cost_price integer, variant_costs jsonb default '{}');
    create table public.menu_item_tech_cards(id bigserial primary key, menu_item_id text, variant_option_id text default '', portion_count numeric, batch_output_quantity numeric, batch_output_unit text, preparation_steps text, notes text, updated_by uuid, updated_at timestamptz, unique(menu_item_id, variant_option_id));
    create table public.menu_item_tech_card_ingredients(id bigserial primary key, menu_item_id text, variant_option_id text default '', name text, quantity numeric, unit text, unit_price_uzs numeric, sort_order integer, updated_at timestamptz);
    create table public.menu_item_tech_card_components(id bigserial primary key, menu_item_id text, variant_option_id text default '', component_menu_item_id text, selected_options jsonb default '{}', quantity numeric, sort_order integer, updated_at timestamptz);
    create table public.telegram_notification_targets(target_key text primary key, chat_id text not null, language text not null default 'ru', is_enabled boolean not null default true, updated_at timestamptz default now());
    create function public.calculate_menu_item_variant_tech_card_real_cost(text, text) returns bigint language sql stable as $$
      select coalesce(sum(quantity * unit_price_uzs), 0)::bigint from public.menu_item_tech_card_ingredients where menu_item_id = $1 and variant_option_id = $2 $$;
    create function public.menu_item_variant_prices(jsonb, integer) returns jsonb language sql immutable as $$ select '[]'::jsonb $$;
    insert into public.current_actor values ('00000000-0000-0000-0000-000000000001');
    insert into public.profiles values ('00000000-0000-0000-0000-000000000001', 'Шеф', null);
    insert into public.menu_items(id, name_ru, price) values ('kazan', 'Казан кебаб', 120000);
  `)
  await db.exec(readFileSync(new URL('../migrations/274_tech_card_change_telegram_images.sql', import.meta.url), 'utf8'))
  await db.exec(`
    create table public.kicks(id serial primary key);
    create or replace function public.invoke_tech_card_change_notifications() returns bigint language sql as
      $$ insert into public.kicks default values returning id::bigint $$;
  `)
  return db
}

const save = (db, overrides = {}) => db.query('select public.save_menu_item_tech_card($1::jsonb)', [JSON.stringify({
  menu_item_id: 'kazan',
  variant_option_id: '',
  portion_count: 1,
  batch_output_quantity: 0.5,
  batch_output_unit: 'kg',
  preparation_steps: 'Обжарить.',
  notes: '',
  ingredients: [{ name: 'Говядина', quantity: 0.5, unit: 'kg', unit_price_uzs: 120000 }],
  components: [],
  ...overrides,
})])
const events = async db => (await db.query('select * from public.tech_card_change_notifications order by created_at, id')).rows

test('saves queue one before/after event per real change and stay silent otherwise', async t => {
  const db = await migrated(t)
  await db.exec(`update public.telegram_notification_targets set chat_id = '-100', is_enabled = true where target_key = 'tech_card_events'`)

  await save(db)
  await save(db)
  let rows = await events(db)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].event_type, 'created')
  assert.equal(rows[0].snapshot.before, null)
  assert.equal(rows[0].snapshot.name, 'Казан кебаб')
  assert.equal(rows[0].snapshot.actor_name, 'Шеф')

  await save(db, { ingredients: [{ name: 'Говядина', quantity: 0.6, unit: 'kg', unit_price_uzs: 120000 }] })
  rows = await events(db)
  assert.equal(rows.length, 2)
  const change = rows.find(row => row.event_type === 'updated')
  assert.equal(Number(change.snapshot.before.ingredients[0].quantity), 0.5)
  assert.equal(Number(change.snapshot.after.ingredients[0].quantity), 0.6)
  assert.equal(Number(change.snapshot.before.portion_cost), 60000)
  assert.equal(Number(change.snapshot.after.portion_cost), 72000)

  await save(db, { ingredients: [{ name: 'Говядина', quantity: 0.6, unit: 'kg', unit_price_uzs: 120000 }], notes: 'Новая заметка' })
  assert.equal((await events(db)).length, 3)
  assert.ok((await db.query('select count(*)::int as n from public.kicks')).rows[0].n >= 1)
})

test('the save function keeps the decimal ingredient prices from 228', async t => {
  const sql = readFileSync(new URL('../migrations/274_tech_card_change_telegram_images.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(sql, /'unit_price_uzs'(, '')?\)?::bigint/)
  const db = await migrated(t)
  await save(db, { ingredients: [{ name: 'Соль', quantity: 100, unit: 'g', unit_price_uzs: 7.5 }] })
  const { rows } = await db.query('select unit_price_uzs from public.menu_item_tech_card_ingredients')
  assert.equal(Number(rows[0].unit_price_uzs), 7.5)
})

test('direct catalog price sync writes stay silent', async t => {
  const db = await migrated(t)
  await db.exec(`update public.telegram_notification_targets set chat_id = '-100', is_enabled = true where target_key = 'tech_card_events'`)
  await save(db)
  await db.exec(`update public.menu_item_tech_card_ingredients set unit_price_uzs = 130000`)
  assert.equal((await events(db)).length, 1)
})

test('nothing queues until the group target is configured, and the recipe still saves', async t => {
  const db = await migrated(t)
  await save(db)
  assert.equal((await events(db)).length, 0)
  assert.equal((await db.query('select count(*)::int as n from public.menu_item_tech_cards')).rows[0].n, 1)
})

test('a notification failure never loses the saved recipe', async t => {
  const db = await migrated(t)
  await db.exec(`
    update public.telegram_notification_targets set chat_id = '-100', is_enabled = true where target_key = 'tech_card_events';
    drop table public.tech_card_change_notifications cascade;
  `)
  await save(db)
  assert.equal((await db.query('select count(*)::int as n from public.menu_item_tech_card_ingredients')).rows[0].n, 1)
})

test('the queue table stays service-only and the sweep covers it', () => {
  const sql = readFileSync(new URL('../migrations/274_tech_card_change_telegram_images.sql', import.meta.url), 'utf8')
  assert.match(sql, /revoke all on public\.tech_card_change_notifications from public, anon, authenticated/)
  assert.match(sql, /perform public\.invoke_tech_card_change_notifications\(\);[\s\S]*tech card queue dispatch failed/)
  assert.match(sql, /when 'tech-card-events' then perform public\.invoke_tech_card_change_notifications\(\)/)
  const endpoint = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.ok(endpoint.indexOf('requireCronSecret(req)', endpoint.indexOf('export default')) < endpoint.indexOf("cronTask === 'tech-card-events'"))
})

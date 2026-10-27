import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGoogleDigestBlocks, buildGoogleDigestSvg, drawableText } from '../api/google-reviews/_lib/dailyDigestImage.js'
import { loadHeldReviewDrafts, saveGoogleDigestPart, sendGoogleDailyDigest } from '../api/google-reviews/_lib/dailyDigest.js'

const reviews = {
  mode: 'publish', averageRating: 4.8, totalReviewCount: 214, found: 3,
  results: [
    { rating: 5, status: 'published', comment: 'Очень вкусно! 🔥', reply: 'Спасибо! Команда Zar Kebab ждёт вас снова.' },
    { rating: 2, status: 'failed', comment: 'Долго ждали', error: 'Gemini request failed (500)' },
    { rating: 5, status: 'deferred', comment: '' },
  ],
}
const menu = {
  mode: 'published', items: 148, sections: 15, photosUploaded: 1, photoFailures: [],
  changes: {
    priceChanges: [{ name: 'Плов', from: 40000, to: 45000 }],
    added: [{ name: 'Шашлык из баранины', price: 55000 }],
    removed: [{ name: 'Арбуз', price: 10000 }],
    updated: [{ name: 'Патир', fields: ['description', 'photo'] }],
  },
}

test('digest explains ratings, every review handled, and each menu change', () => {
  const blocks = buildGoogleDigestBlocks({ digest_date: '2026-10-28', reviews, menu }, { reviews: { averageRating: 4.7, totalReviewCount: 211 } })
  const tiles = blocks.find(block => block.type === 'tiles').tiles
  assert.deepEqual(tiles.map(tile => [tile.label, tile.value, tile.sub]), [
    ['Рейтинг', '4,8', '+0,1 за сутки'],
    ['Отзывов всего', '214', '+3 за сутки'],
    ['Ответов отправлено', '1', 'из 3 новых'],
    ['Меню', 'Обновлено', '4 изменения'],
  ])
  assert.deepEqual(blocks.filter(block => block.type === 'review').map(block => block.status), ['published', 'failed', 'deferred'])
  const text = blocks.map(block => block.text || '').join('\n')
  assert.match(text, /1 отзыв отложен до завтра: дневной лимит Gemini/)
  assert.match(text, /Плов: 40 000 → 45 000 сум/)
  assert.match(text, /Шашлык из баранины: 55 000 сум/)
  assert.match(text, /Убраны с Google Maps · 1/)
  assert.match(text, /Патир: описание, фото/)
  assert.match(text, /Загружено новых фото: 1/)
})

test('digest opens by introducing the AI bot, then any one-off highlights', () => {
  const blocks = buildGoogleDigestBlocks({
    highlights: ['Опубликовал меню из кассы: 147 позиций.', ''],
    reviews: { results: [{ rating: 5, status: 'queued', comment: '' }] },
  })
  assert.equal(blocks[0].type, 'intro')
  assert.match(blocks[0].title, /Я ИИ-бот Zar Kebab/)
  assert.match(blocks[0].text, /отвечаю гостям на отзывы на их родном языке и сверяю меню/)
  assert.deepEqual(blocks.slice(1, 3).map(block => [block.type, block.text]), [
    ['heading', 'Главное'], ['bullet', 'Опубликовал меню из кассы: 147 позиций.'],
  ])
  assert.equal(blocks.some(block => /лимит Gemini/.test(block.text || '')), false, 'waiting reviews are not blamed on the limit')
  const svg = buildGoogleDigestSvg({ title: 'ИИ-бот подключён к Google Maps', reviews: { results: [{ rating: 5, status: 'queued' }] } })
  assert.match(svg, /ИИ-бот подключён к Google Maps/)
  assert.match(svg, /Ждёт ответа/)
  assert.match(buildGoogleDigestSvg({}), /Отчёт ИИ-бота за сутки/)
})

test('digest says plainly when nothing happened or a task did not run', () => {
  const quiet = buildGoogleDigestBlocks({
    reviews: { averageRating: 4.8, totalReviewCount: 214, results: [] },
    menu: { mode: 'unchanged', items: 147, sections: 15, changes: {} },
  }).map(block => block.text || '').join('\n')
  assert.match(quiet, /Новых отзывов без ответа нет/)
  assert.match(quiet, /Изменений нет: Google Maps совпадает с меню кассы \(147 позиций, 15 разделов\)/)

  const missing = buildGoogleDigestBlocks({ menu: { error: 'Google API request failed (503)' } }).map(block => block.text || '').join('\n')
  assert.match(missing, /Бот отзывов сегодня не запускался/)
  assert.match(missing, /Ошибка синхронизации: Google API request failed \(503\)/)
})

test('image text drops glyphs Noto Sans cannot draw and escapes markup', () => {
  assert.equal(drawableText('Очень вкусно! 🔥 <b>'), 'Очень вкусно! <b>')
  assert.equal(drawableText('本当に美味しかった'), '')
  const svg = buildGoogleDigestSvg({
    digest_date: '2026-10-28',
    reviews: { ...reviews, results: [
      { rating: 5, status: 'published', comment: 'Tom & Jerry <script>', reply: 'Zar Kebab をご利用いただきありがとうございます' },
    ] },
    menu,
  })
  assert.match(svg, /Tom &amp; Jerry &lt;script&gt;/)
  assert.doesNotMatch(svg, /<script>/)
  assert.match(svg, /на языке отзыва \(картинка его не отображает\)/, 'no misleading Latin fragment of a Japanese reply')
  assert.match(svg, /28 октября 2026/)
})

function fakeSupabase({ chatId = '-100500', enabled = true } = {}) {
  const rows = new Map()
  const from = table => {
    if (table === 'telegram_notification_targets') {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { chat_id: chatId, is_enabled: enabled }, error: null }) }
      return chain
    }
    assert.equal(table, 'google_business_daily_digests')
    let patch = null
    const filters = []
    let order = null
    let limit = Infinity
    const matching = () => [...rows.values()].filter(row => filters.every(filter => filter(row)))
    const chain = {
      upsert: async row => { rows.set(row.digest_date, { ...(rows.get(row.digest_date) || {}), ...row }); return { error: null } },
      update: value => { patch = value; return chain },
      select: () => chain,
      eq: (key, value) => { filters.push(row => row[key] === value); return chain },
      is: (key, value) => { filters.push(row => (row[key] ?? null) === value); return chain },
      lt: (key, value) => { filters.push(row => row[key] < value); return chain },
      gte: (key, value) => { filters.push(row => row[key] >= value); return chain },
      order: key => { order = key; return chain },
      limit: n => { limit = n; return chain },
      then: (resolve, reject) => {
        let data = matching()
        if (patch) data.forEach(row => Object.assign(row, patch))
        if (order) data = data.sort((a, b) => b[order].localeCompare(a[order]))
        return Promise.resolve({ data: data.slice(0, limit), error: null }).then(resolve, reject)
      },
    }
    return chain
  }
  return { from, rows }
}

test('the day image goes to the Investor group once, with yesterday for comparison', async () => {
  const supabase = fakeSupabase()
  await saveGoogleDigestPart(supabase, 'reviews', { averageRating: 4.7, totalReviewCount: 211, results: [] }, '2026-10-27')
  await saveGoogleDigestPart(supabase, 'reviews', reviews, '2026-10-28')
  await saveGoogleDigestPart(supabase, 'menu', menu, '2026-10-28')
  const sent = []
  const options = {
    date: '2026-10-28',
    render: async (digest, previous) => { sent.push({ digest, previous }); return Buffer.from('png') },
    send: async (chatId, photo, { caption }) => { sent.at(-1).chatId = chatId; sent.at(-1).caption = caption; return { result: { message_id: 77 } } },
  }
  assert.deepEqual(await sendGoogleDailyDigest(supabase, options), { status: 'sent', messageId: 77 })
  assert.equal(sent[0].chatId, '-100500')
  assert.equal(sent[0].digest.menu.items, 148)
  assert.equal(sent[0].previous.digest_date, '2026-10-27')
  assert.match(sent[0].caption, /ИИ-бот Zar Kebab.*Google Maps.*28 октября 2026/)
  assert.equal(supabase.rows.get('2026-10-28').telegram_message_id, 77)

  assert.equal((await sendGoogleDailyDigest(supabase, options)).status, 'held')
  assert.equal(sent.length, 1, 'never sent twice for a date')
})

test('an unknown send outcome is held, and a missing Investor group skips', async () => {
  const supabase = fakeSupabase()
  await saveGoogleDigestPart(supabase, 'menu', menu, '2026-10-28')
  let attempts = 0
  const options = { date: '2026-10-28', render: async () => Buffer.from('png'), send: async () => { attempts += 1; throw new Error('socket hang up') } }
  assert.deepEqual(await sendGoogleDailyDigest(supabase, options), { status: 'failed', error: 'socket hang up' })
  assert.equal(supabase.rows.get('2026-10-28').send_error, 'socket hang up')
  assert.equal((await sendGoogleDailyDigest(supabase, options)).status, 'held')
  assert.equal(attempts, 1)

  const disabled = fakeSupabase({ enabled: false })
  assert.equal((await sendGoogleDailyDigest(disabled, { date: '2026-10-28' })).status, 'skipped')
})

test('held 1–3★ drafts are listed first, labelled, and reloaded from earlier days', async () => {
  const blocks = buildGoogleDigestBlocks({ reviews: { results: [
    ...Array.from({ length: 6 }, () => ({ rating: 5, status: 'published', comment: 'Great', reply: 'Thanks' })),
    { rating: 1, status: 'awaiting_approval', comment: 'Tourist prices', reply: 'We are sorry…' },
  ] } })
  assert.equal(blocks.find(block => block.type === 'review').status, 'awaiting_approval', 'never cut off by the 6-review limit')
  assert.match(blocks.map(block => block.text || '').join('\n'), /1 ответ на оценку 1–3★ ждёт вашего одобрения/)
  assert.match(buildGoogleDigestSvg({ reviews: { results: [{ rating: 1, status: 'awaiting_approval', comment: 'Bad', reply: 'Sorry' }] } }), /Черновик ответа: Sorry/)

  const supabase = fakeSupabase()
  await saveGoogleDigestPart(supabase, 'reviews', { results: [{ reviewId: 'old', status: 'awaiting_approval', reply: 'Older draft' }] }, '2026-10-25')
  await saveGoogleDigestPart(supabase, 'reviews', { results: [
    { reviewId: 'old', status: 'awaiting_approval', reply: 'Newest draft' },
    { reviewId: 'done', status: 'published', reply: 'Posted' },
  ] }, '2026-10-26')
  const drafts = await loadHeldReviewDrafts(supabase, { now: new Date('2026-10-27T00:00:00Z') })
  assert.deepEqual([...drafts], [['old', 'Newest draft']])
})

test('267/268 keep the digest table server-only, with optional title and highlights', async () => {
  const { readFile } = await import('node:fs/promises')
  const migration = await readFile(new URL('../migrations/267_google_business_daily_digests.sql', import.meta.url), 'utf8')
  assert.match(migration, /digest_date date primary key/)
  assert.match(migration, /alter table public\.google_business_daily_digests enable row level security/)
  assert.match(migration, /revoke all on table public\.google_business_daily_digests from anon, authenticated/)
  const columns = await readFile(new URL('../migrations/268_google_digest_title_highlights.sql', import.meta.url), 'utf8')
  assert.match(columns, /add column if not exists title text/)
  assert.match(columns, /add column if not exists highlights jsonb/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttendanceCheckinMessage,
  buildAttendanceCheckinRow,
  buildAttendanceCheckinUrl,
  buildAttendanceCodeRejectedMessage,
  buildAttendanceKioskUrl,
  classifyArrival,
  formatArrivalSummary,
  getTashkentClock,
  normalizeWorkStartTime,
  parseAttendanceCheckinCommand,
  readAttendanceKioskKey,
} from '../src/lib/attendance.js'

const migration = readFileSync(new URL('../migrations/243_employee_attendance_checkins.sql', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')

const PAYLOAD = 'ci_0a1b2c3d_59700000_0123456789abcdef'
const KEY = 'a'.repeat(64)

test('rotating QR deep link and /start payload parsing', () => {
  assert.equal(buildAttendanceCheckinUrl('@ZarKebabBot', PAYLOAD), `https://t.me/ZarKebabBot?start=${PAYLOAD}`)
  assert.equal(buildAttendanceCheckinUrl('', PAYLOAD), '')
  assert.equal(buildAttendanceCheckinUrl('ZarKebabBot', 'checkin'), '')
  assert.ok(PAYLOAD.length <= 64, 'Telegram start payloads are limited to 64 characters')
  assert.deepEqual(parseAttendanceCheckinCommand(`/start ${PAYLOAD}`), { kind: 'rotating', payload: PAYLOAD })
  assert.deepEqual(parseAttendanceCheckinCommand(`/start@ZarKebabBot ${PAYLOAD}`), { kind: 'rotating', payload: PAYLOAD })
  assert.deepEqual(parseAttendanceCheckinCommand('/start checkin'), { kind: 'legacy' })
  assert.equal(parseAttendanceCheckinCommand('/start'), null)
  assert.equal(parseAttendanceCheckinCommand('/start employee_00000000-0000-0000-0000-000000000001'), null)
  assert.equal(parseAttendanceCheckinCommand(`/start ${PAYLOAD.toUpperCase()}`), null)
  assert.equal(parseAttendanceCheckinCommand(`${PAYLOAD}`), null)
  assert.match(buildAttendanceCodeRejectedMessage('legacy'), /больше не действует/)
  assert.match(buildAttendanceCodeRejectedMessage('expired'), /истёк/)
})

test('screen links carry the key in the hash only', () => {
  assert.equal(buildAttendanceKioskUrl('https://admin.zarkebab.uz/', KEY), `https://admin.zarkebab.uz/checkin-screen#k=${KEY}`)
  assert.equal(readAttendanceKioskKey(`#k=${KEY}`), KEY)
  assert.equal(readAttendanceKioskKey(`#x=1&k=${KEY}`), KEY)
  assert.equal(readAttendanceKioskKey('#k=short'), '')
  assert.equal(readAttendanceKioskKey(''), '')
})

test('arrival is classified by whole Tashkent minutes against the start time', () => {
  assert.equal(normalizeWorkStartTime('9:05:00'), '09:05')
  assert.equal(normalizeWorkStartTime('25:00'), '')
  assert.deepEqual(classifyArrival('08:52', '09:00:00'), { status: 'early', minutesLate: -8, scheduledStartTime: '09:00' })
  assert.deepEqual(classifyArrival('09:00', '09:00'), { status: 'on_time', minutesLate: 0, scheduledStartTime: '09:00' })
  assert.deepEqual(classifyArrival('09:15', '09:00'), { status: 'late', minutesLate: 15, scheduledStartTime: '09:00' })
  assert.deepEqual(classifyArrival('09:15', null), { status: 'no_schedule', minutesLate: null, scheduledStartTime: null })
})

test('check-in rows use the Tashkent date and snapshot the schedule', () => {
  // 2026-10-14 04:20 UTC = 09:20 Tashkent.
  const now = new Date('2026-10-14T04:20:30Z')
  assert.deepEqual(getTashkentClock(now), { date: '2026-10-14', time: '09:20' })
  // 19:30 UTC is already the next Tashkent day.
  assert.equal(getTashkentClock(new Date('2026-10-14T19:30:00Z')).date, '2026-10-15')
  assert.deepEqual(buildAttendanceCheckinRow({ id: 'p1', work_start_time: '09:00:00' }, 42, now), {
    salary_profile_id: 'p1',
    business_date: '2026-10-14',
    checked_in_at: now.toISOString(),
    scheduled_start_time: '09:00',
    minutes_late: 20,
    arrival_status: 'late',
    telegram_user_id: '42',
  })
})

test('Telegram replies thank early/on-time arrivals and note lateness without fines', () => {
  const at = '2026-10-14T03:52:00Z' // 08:52 Tashkent
  const early = { checked_in_at: at, scheduled_start_time: '09:00:00', minutes_late: -68, arrival_status: 'early' }
  const late = { checked_in_at: at, scheduled_start_time: '08:30:00', minutes_late: 22, arrival_status: 'late' }
  assert.match(buildAttendanceCheckinMessage({ name: 'Ali', checkin: early, lang: 'ru' }), /на 1 ч 8 мин раньше/)
  assert.match(buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, lang: 'en' }), /22 min late/)
  assert.doesNotMatch(buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, lang: 'ru' }), /штраф/i)
  assert.match(buildAttendanceCheckinMessage({ name: 'Ali', checkin: late, alreadyCheckedIn: true, lang: 'uz' }), /allaqachon/)
  assert.equal(formatArrivalSummary(late, 'en'), '08:52 · late 22 min')
  assert.equal(formatArrivalSummary(early, 'en'), '08:52 · 1 h 8 min early')
})

test('webhook verifies the rotating code by Telegram message time before identity, and never writes payroll', () => {
  const checkinBranch = webhook.indexOf('isPrivateChat && attendanceCommand')
  assert.ok(checkinBranch > 0)
  assert.ok(checkinBranch < webhook.indexOf('isLanguageCommand && isPrivateChat'))
  const handler = webhook.slice(webhook.indexOf('async function checkInEmployee'), webhook.indexOf('function languageKeyboard'))
  assert.match(handler, /command\.kind !== 'rotating'/)
  assert.match(handler, /message\.date \* 1000/)
  assert.ok(handler.indexOf("rpc('verify_attendance_checkin_payload'") < handler.indexOf('employee_salary_telegram_links'))
  assert.match(handler, /verdict !== 'valid'/)
  assert.match(handler, /buildAttendanceCheckinRow\(salaryProfile, message\.from\.id, scannedAt\)/)
  assert.match(handler, /ignoreDuplicates: true/)
  assert.doesNotMatch(handler, /employee_salary_(fines|bonuses|absences)/)
})

test('migration keeps one check-in per employee per day, read-only for staff', async () => {
  assert.match(migration, /current_staff_can_access\('expenses'\)/)
  assert.match(migration, /revoke all on table public\.employee_attendance_checkins from public, anon, authenticated/)
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public.employee_salary_profiles (id uuid PRIMARY KEY);
      CREATE FUNCTION public.current_staff_can_access(text) RETURNS boolean LANGUAGE sql AS 'select true';
      INSERT INTO public.employee_salary_profiles VALUES ('00000000-0000-0000-0000-000000000001');
    `)
    await db.exec(migration)
    await db.exec(migration)
    const insert = `INSERT INTO employee_attendance_checkins (salary_profile_id, business_date, scheduled_start_time, minutes_late, arrival_status)
      VALUES ('00000000-0000-0000-0000-000000000001', '2026-10-14', $1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`
    assert.equal((await db.query(insert, ['09:00', -5, 'early'])).rows.length, 1)
    assert.equal((await db.query(insert, ['09:00', 10, 'late'])).rows.length, 0)
    await assert.rejects(db.query(insert.replace('2026-10-14', '2026-10-15'), [null, null, 'late']), /check constraint/)
    await db.query("UPDATE employee_salary_profiles SET work_start_time = '08:30'")
  } finally {
    await db.close()
  }
})

const kioskMigration = readFileSync(new URL('../migrations/245_attendance_kiosk_rotating_qr.sql', import.meta.url), 'utf8')

async function kioskDb() {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
    CREATE FUNCTION public.current_staff_can_write(text) RETURNS boolean LANGUAGE sql AS
      $$select coalesce(current_setting('test.can_write', true), 'on') = 'on'$$;
    CREATE FUNCTION public.current_staff_can_access(text) RETURNS boolean LANGUAGE sql AS 'select true';
    CREATE OR REPLACE FUNCTION pg_catalog.now() RETURNS timestamptz LANGUAGE sql STABLE AS
      $$select current_setting('test.now')::timestamptz$$;
    CREATE OR REPLACE FUNCTION pg_catalog.clock_timestamp() RETURNS timestamptz LANGUAGE sql AS
      $$select current_setting('test.now')::timestamptz$$;
    SELECT set_config('test.now', '2026-10-15T03:00:10Z', false);
  `)
  await db.exec(kioskMigration)
  const at = iso => db.query("select set_config('test.now', $1, false)", [iso])
  const key = async () => (await db.query('select create_attendance_kiosk() k')).rows[0].k
  const token = async k => (await db.query('select get_attendance_kiosk_token($1) t', [k])).rows[0].t
  const verify = async (payload, when) => (await db.query('select verify_attendance_checkin_payload($1, $2) v', [payload, when])).rows[0].v
  return { db, at, key, token, verify }
}

test('rotating codes are accepted only shortly after they were shown', async t => {
  const { db, at, key, token, verify } = await kioskDb()
  t.after(() => db.close())
  const k = await key()
  assert.match(k, /^[0-9a-f]{64}$/)
  const stored = (await db.query('select key_hash, code from attendance_kiosks')).rows[0]
  assert.notEqual(stored.key_hash, k, 'keys are stored hashed')

  // 03:00:10Z is 10 s into a 30 s slot.
  const shown = await token(k)
  assert.match(shown.payload, new RegExp(`^ci_${stored.code}_\\d+_[0-9a-f]{16}$`))
  assert.equal(shown.ms_left, 20000)
  assert.ok(shown.payload.length <= 64)

  assert.equal(await verify(shown.payload, '2026-10-15T03:00:10Z'), 'valid')
  assert.equal(await verify(shown.payload, '2026-10-15T02:59:50Z'), 'valid', 'one slot of clock skew')
  assert.equal(await verify(shown.payload, '2026-10-15T02:59:29Z'), 'expired')
  assert.equal(await verify(shown.payload, '2026-10-15T03:02:29Z'), 'valid', 'slow phone: four slots later')
  assert.equal(await verify(shown.payload, '2026-10-15T03:02:30Z'), 'expired', 'saved link from home')
  assert.equal(await verify(shown.payload, '2026-10-16T03:00:10Z'), 'expired', 'reused the next day')

  const [, code, slot, sig] = shown.payload.split('_')
  const flip = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')
  assert.equal(await verify(`ci_${code}_${slot}_${flip}`, '2026-10-15T03:00:10Z'), 'invalid', 'tampered signature')
  assert.equal(await verify(`ci_${code}_${Number(slot) + 1}_${sig}`, '2026-10-15T03:00:40Z'), 'invalid', 'forged later slot')
  assert.equal(await verify(`ci_ffffffff_${slot}_${sig}`, '2026-10-15T03:00:10Z'), 'invalid')
  assert.equal(await verify('checkin', '2026-10-15T03:00:10Z'), 'invalid')
  assert.equal(await verify(shown.payload, null), 'invalid')

  // The screen refreshes in the next slot and gets a different code.
  await at('2026-10-15T03:00:30Z')
  const next = await token(k)
  assert.notEqual(next.payload, shown.payload)
  assert.equal(next.ms_left, 30000)
  assert.ok((await db.query('select last_seen_at from attendance_kiosks')).rows[0].last_seen_at)

  assert.equal(await token('b'.repeat(64)), null, 'unknown key')
  assert.equal(await token('not-a-key'), null)
})

test('a new screen link or turning the screen off kills the old screen and its codes', async t => {
  const { db, key, token, verify } = await kioskDb()
  t.after(() => db.close())
  const first = await key()
  const firstCode = (await token(first)).payload
  const second = await key()
  assert.equal(await token(first), null)
  assert.equal(await verify(firstCode, '2026-10-15T03:00:10Z'), 'invalid')
  assert.ok((await token(second)).payload)
  assert.equal(Number((await db.query('select count(*) n from attendance_kiosks where revoked_at is null')).rows[0].n), 1)

  await db.query('select revoke_attendance_kiosks()')
  assert.equal(await token(second), null)
  assert.deepEqual((await db.query('select * from get_attendance_kiosk_status()')).rows, [])
})

test('only salary managers create screens; the signed-out screen reaches only its token RPC', async t => {
  const { db, key } = await kioskDb()
  t.after(() => db.close())
  await db.query("select set_config('test.can_write', 'off', false)")
  await assert.rejects(key(), /Forbidden/)
  await assert.rejects(db.query('select revoke_attendance_kiosks()'), /Forbidden/)
  await db.query("select set_config('test.can_write', 'on', false)")
  await key()
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('select * from attendance_kiosks'), /permission denied/)
  await assert.rejects(db.query("select verify_attendance_checkin_payload('x', now())"), /permission denied/)
  await assert.rejects(db.query('select create_attendance_kiosk()'), /permission denied/)
  assert.equal((await db.query("select get_attendance_kiosk_token('x') t")).rows[0].t, null)
  await db.exec('RESET ROLE')
})

test('entrance screen hides the key, keeps the screen awake, and never shows a stale code', () => {
  const kiosk = readFileSync(new URL('../src/pages/AttendanceKiosk.jsx', import.meta.url), 'utf8')
  const hook = readFileSync(new URL('../src/lib/useRotatingCheckinQr.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(kiosk, /history\?\.replaceState\(null, '', ATTENDANCE_KIOSK_PATH\)/)
  assert.match(kiosk, /addEventListener\('hashchange'/)
  assert.match(kiosk, /navigator\.wakeLock/)
  assert.match(kiosk, /rpc\('get_attendance_kiosk_token', \{ p_key: key \}\)\.abortSignal\(signal\)/)
  assert.match(hook, /STALE_AFTER_MS = 60_000/)
  assert.match(hook, /dataUrl: status === 'active' \? dataUrl : ''/)
  assert.match(hook, /requestRef\.current\(controller\.signal\)/)
  assert.match(app, /<Route path="\/checkin-screen" element=\{<AttendanceKiosk \/>\} \/>/)
  assert.match(app, /<Route path="\/checkin-screen" element=\{<PublicHostAdminRedirect \/>\} \/>/)
})

test('Dashboard shows the rotating QR only to salary managers', () => {
  const dashboard = readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../src/components/CheckinQrCard.jsx', import.meta.url), 'utf8')
  assert.match(dashboard, /canEditFeature\(profile \|\| \{ role: state\.user\?\.role \}, 'expenses'\)/)
  assert.match(dashboard, /\{canShowCheckinQr && <CheckinQrCard /)
  assert.match(card, /rpc\('get_attendance_dashboard_token'\)/)
  assert.match(card, /\['unavailable', 'disabled', 'no-bot', 'idle'\]\.includes\(status\)/)
  assert.match(card, /\{ source: 'dashboard' \}/, 'language changes must not restart the token loop')
})

test('Dashboard codes use their own signer, unaffected by screen links, and need Accounting write', async t => {
  const { db, key, token, verify } = await kioskDb()
  t.after(() => db.close())
  const dash = async () => (await db.query('select get_attendance_dashboard_token() t')).rows[0].t
  const first = await dash()
  assert.match(first.payload, /^ci_[0-9a-f]{8}_\d+_[0-9a-f]{16}$/)
  assert.equal(await verify(first.payload, '2026-10-15T03:00:10Z'), 'valid')
  assert.equal((await dash()).payload, first.payload, 'same slot, same code; no duplicate signer rows')
  assert.equal(Number((await db.query("select count(*) n from attendance_kiosks where kind = 'dashboard'")).rows[0].n), 1)

  const screenKey = await key()
  assert.ok((await token(screenKey)).payload)
  await db.query('select revoke_attendance_kiosks()')
  await key()
  assert.equal(await verify(first.payload, '2026-10-15T03:00:10Z'), 'valid', 'screen changes never revoke the Dashboard signer')
  assert.equal(await token('0'.repeat(64)), null)
  assert.deepEqual((await db.query('select count(*)::int n from get_attendance_kiosk_status()')).rows[0], { n: 1 })

  await db.query("select set_config('test.can_write', 'off', false)")
  await assert.rejects(dash(), /Forbidden/)
  await db.query("select set_config('test.can_write', 'on', false)")
  await db.exec('SET ROLE anon')
  await assert.rejects(dash(), /permission denied/)
  await db.exec('RESET ROLE')
})

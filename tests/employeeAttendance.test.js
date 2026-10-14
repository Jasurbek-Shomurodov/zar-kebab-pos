import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttendanceCheckinMessage,
  buildAttendanceCheckinRow,
  buildAttendanceCheckinUrl,
  classifyArrival,
  formatArrivalSummary,
  getTashkentClock,
  isAttendanceCheckinCommand,
  normalizeWorkStartTime,
} from '../src/lib/attendance.js'

const migration = readFileSync(new URL('../migrations/243_employee_attendance_checkins.sql', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')

test('check-in QR deep link and /start payload', () => {
  assert.equal(buildAttendanceCheckinUrl('@ZarKebabBot'), 'https://t.me/ZarKebabBot?start=checkin')
  assert.equal(buildAttendanceCheckinUrl(''), '')
  assert.equal(isAttendanceCheckinCommand('/start checkin'), true)
  assert.equal(isAttendanceCheckinCommand('/start@ZarKebabBot checkin'), true)
  assert.equal(isAttendanceCheckinCommand('/start'), false)
  assert.equal(isAttendanceCheckinCommand('/start employee_checkin'), false)
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

test('webhook handles check-in before the language /start menu and never writes payroll', () => {
  const checkinBranch = webhook.indexOf('isAttendanceCheckinCommand(message?.text)')
  assert.ok(checkinBranch > 0)
  assert.ok(checkinBranch < webhook.indexOf('isLanguageCommand && isPrivateChat'))
  const handler = webhook.slice(webhook.indexOf('async function checkInEmployee'), webhook.indexOf('function languageKeyboard'))
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

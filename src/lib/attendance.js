// Daily attendance check-ins (migration 243). Shared by the Telegram webhook
// and the Employees page so arrival classification stays in one place.

import { formatDateOnly, formatTime } from './dateFormat.js'

export const ATTENDANCE_CHECKIN_START_PAYLOAD = 'checkin'

export function buildAttendanceCheckinUrl(botUsername) {
  const name = String(botUsername || '').trim().replace(/^@/, '')
  return name ? `https://t.me/${name}?start=${ATTENDANCE_CHECKIN_START_PAYLOAD}` : ''
}

export function isAttendanceCheckinCommand(text) {
  return /^\/start(?:@\w+)?\s+checkin$/i.test(String(text || '').trim())
}

export function normalizeWorkStartTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function minutesOfDay(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Tashkent date and wall-clock HH:MM for a moment.
export function getTashkentClock(now = new Date()) {
  const [day, month, year] = formatDateOnly(now).split('.')
  return { date: `${year}-${month}-${day}`, time: formatTime(now) }
}

// Whole minutes: arriving during the start minute counts as on time.
export function classifyArrival(arrivalTime, workStartTime) {
  const start = normalizeWorkStartTime(workStartTime)
  const arrival = normalizeWorkStartTime(arrivalTime)
  if (!start || !arrival) return { status: 'no_schedule', minutesLate: null, scheduledStartTime: null }
  const minutesLate = minutesOfDay(arrival) - minutesOfDay(start)
  return {
    status: minutesLate > 0 ? 'late' : minutesLate < 0 ? 'early' : 'on_time',
    minutesLate,
    scheduledStartTime: start,
  }
}

export function buildAttendanceCheckinRow(salaryProfile, telegramUserId, now = new Date()) {
  const clock = getTashkentClock(now)
  const arrival = classifyArrival(clock.time, salaryProfile?.work_start_time)
  return {
    salary_profile_id: salaryProfile.id,
    business_date: clock.date,
    checked_in_at: now.toISOString(),
    scheduled_start_time: arrival.scheduledStartTime,
    minutes_late: arrival.minutesLate,
    arrival_status: arrival.status,
    telegram_user_id: String(telegramUserId || ''),
  }
}

function formatDuration(totalMinutes, lang) {
  const minutes = Math.abs(totalMinutes)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const units = {
    uz: ['soat', 'daqiqa'],
    ru: ['ч', 'мин'],
    en: ['h', 'min'],
  }[lang] || ['h', 'min']
  if (hours === 0) return `${rest} ${units[1]}`
  return rest === 0 ? `${hours} ${units[0]}` : `${hours} ${units[0]} ${rest} ${units[1]}`
}

// Short label for the Employees page, e.g. "08:52 · 8 min early".
export function formatArrivalSummary(checkin, lang = 'en') {
  if (!checkin) return ''
  const time = getTashkentClock(new Date(checkin.checked_in_at)).time
  const minutes = Number(checkin.minutes_late)
  const labels = {
    uz: { early: 'erta', late: 'kechikdi', on_time: 'o‘z vaqtida' },
    ru: { early: 'раньше', late: 'опоздание', on_time: 'вовремя' },
    en: { early: 'early', late: 'late', on_time: 'on time' },
  }[lang] || { early: 'early', late: 'late', on_time: 'on time' }
  if (checkin.arrival_status === 'early') return `${time} · ${formatDuration(minutes, lang)} ${labels.early}`
  if (checkin.arrival_status === 'late') return `${time} · ${labels.late} ${formatDuration(minutes, lang)}`
  if (checkin.arrival_status === 'on_time') return `${time} · ${labels.on_time}`
  return time
}

// Telegram reply. `name` must already be HTML-escaped by the caller.
export function buildAttendanceCheckinMessage({ name, checkin, alreadyCheckedIn = false, lang = 'ru' }) {
  const language = ['uz', 'ru', 'en'].includes(lang) ? lang : 'ru'
  const time = getTashkentClock(new Date(checkin.checked_in_at)).time
  const start = normalizeWorkStartTime(checkin.scheduled_start_time)
  const minutes = Number(checkin.minutes_late)
  const copy = {
    uz: {
      already: `ℹ️ ${name}, siz bugun ${time} da allaqachon belgilangansiz.`,
      early: `🌟 Xush kelibsiz, ${name}! Siz ${time} da keldingiz — ish boshlanishidan ${formatDuration(minutes, 'uz')} oldin (${start}). Rahmat, zo‘r! 👏`,
      on_time: `✅ Xush kelibsiz, ${name}! Siz ${time} da, aynan o‘z vaqtida keldingiz. Rahmat! 👏`,
      late: `⏰ ${name}, siz ${time} da keldingiz — ${formatDuration(minutes, 'uz')} kechikish (ish ${start} da boshlanadi). Iltimos, keyingi safar o‘z vaqtida keling.`,
      no_schedule: `✅ Xush kelibsiz, ${name}! Kelish vaqti qayd etildi: ${time}.`,
    },
    ru: {
      already: `ℹ️ ${name}, вы уже отметились сегодня в ${time}.`,
      early: `🌟 Добро пожаловать, ${name}! Вы пришли в ${time} — на ${formatDuration(minutes, 'ru')} раньше начала смены (${start}). Спасибо, так держать! 👏`,
      on_time: `✅ Добро пожаловать, ${name}! Вы пришли в ${time}, точно вовремя. Спасибо! 👏`,
      late: `⏰ ${name}, вы пришли в ${time} — опоздание ${formatDuration(minutes, 'ru')} (смена начинается в ${start}). Пожалуйста, приходите вовремя.`,
      no_schedule: `✅ Добро пожаловать, ${name}! Время прихода отмечено: ${time}.`,
    },
    en: {
      already: `ℹ️ ${name}, you already checked in today at ${time}.`,
      early: `🌟 Welcome, ${name}! You arrived at ${time} — ${formatDuration(minutes, 'en')} before your ${start} start. Thank you, great job! 👏`,
      on_time: `✅ Welcome, ${name}! You arrived at ${time}, right on time. Thank you! 👏`,
      late: `⏰ ${name}, you arrived at ${time} — ${formatDuration(minutes, 'en')} late (your shift starts at ${start}). Please try to be on time.`,
      no_schedule: `✅ Welcome, ${name}! Arrival recorded at ${time}.`,
    },
  }[language]
  if (alreadyCheckedIn) return copy.already
  return copy[checkin.arrival_status] || copy.no_schedule
}

export function buildAttendanceNotLinkedMessage() {
  return 'Ваш Telegram не привязан к профилю сотрудника. Попросите администратора отправить ссылку для привязки.\n\n'
    + 'Telegram xodim profiliga ulanmagan. Administratordan ulash havolasini so‘rang.'
}

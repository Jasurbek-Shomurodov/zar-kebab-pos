// A new employee must link Telegram before the salary profile is created
// (migration 248). These helpers keep the Salaries form logic testable.

export const EMPLOYEE_TELEGRAM_POLL_MS = 3000

const KNOWN_ERROR_CODES = [
  'employee_telegram_not_linked',
  'employee_telegram_already_linked',
  'employee_telegram_registration_not_found',
  'employee_telegram_registration_consumed',
  'employee_details_invalid',
]

export function buildEmployeeTelegramStartUrl(botUsername, token) {
  const bot = String(botUsername || '').trim().replace(/^@/, '')
  if (!bot || !token) return ''
  return `https://t.me/${bot}?start=employee_${token}`
}

export function normalizeEmployeeTelegramRegistration(row) {
  if (!row) return { status: 'expired', username: '' }
  const status = ['pending', 'linked', 'expired', 'consumed'].includes(row.status) ? row.status : 'expired'
  return { status, username: String(row.username || '') }
}

export function isEmployeeTelegramLinked(registration) {
  return Boolean(registration?.token) && registration?.status === 'linked'
}

export function canCreateEmployee(form, registration) {
  return Boolean(String(form?.employee_name || '').trim())
    && Boolean(form?.job_function)
    && Number(form?.salary_amount) > 0
    && isEmployeeTelegramLinked(registration)
}

// Maps a Supabase/PostgREST error to a stable code; the page translates it at
// render time. Unknown errors keep their message.
export function employeeCreationErrorCode(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  return KNOWN_ERROR_CODES.find(code => text.includes(code)) || ''
}

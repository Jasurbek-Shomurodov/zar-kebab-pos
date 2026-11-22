import sharp from 'sharp'
import { configurePayrollFonts } from './payrollReportImage.js'
import { formatSalaryNotificationAmount } from './salaryMessages.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'

import { buildEmployeePayrollCalendarSvg } from './employeePayrollCalendar.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const money = value => `${formatSalaryNotificationAmount(value)} сум`
const nameOf = profile => profile?.employee_name || profile?.profile?.full_name || 'Сотрудник'

function card(title, name, date, rows, footer) {
  const height = 390 + rows.length * 110
  const nameSize = Math.min(58, 850 / Math.max([...String(name)].length, 1) * 1.5)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}">
  <rect width="1100" height="${height}" fill="#f6f5ef"/>
  <g font-family="Noto Sans" fill="#163b37">
  <rect x="38" y="36" width="1024" height="${height - 72}" rx="28" fill="white"/>
  <text x="76" y="90" font-size="22" font-weight="700" letter-spacing="3">ZAR KEBAB</text>
  <text x="76" y="140" font-size="28" fill="#647974">${escape(title)}</text>
  <text x="76" y="212" font-size="${nameSize}" font-weight="700">${escape(name)}</text>
  <text x="76" y="258" font-size="25" fill="#647974">${escape(formatLongDate(date, 'ru', date))}</text>
  ${rows.map(([label, value], i) => `<rect x="70" y="${285 + i * 110}" width="960" height="94" rx="16" fill="${i === 0 ? '#e5f5ed' : '#f5f7f6'}"/><text x="94" y="${341 + i * 110}" font-size="25">${escape(label)}</text><text x="1005" y="${343 + i * 110}" text-anchor="end" font-size="32" font-weight="700">${escape(value)}</text>`).join('')}
  <text x="76" y="${height - 60}" font-size="20" fill="#647974">${escape(footer)}</text></g></svg>`
}

export function buildTeamKpiImageSvg(event) {
  return card('Ежедневный KPI-бонус', event.employee_name || nameOf(event.salary_profile), event.bonus_date,
    [['KPI-бонус', money(event.amount)]], 'Оформил: Система')
}

export function buildEmployeePayrollImageSvg(profile, date, startDate) {
  return buildEmployeePayrollCalendarSvg(profile, date, startDate)
}

async function render(svg) {
  configurePayrollFonts()
  return sharp(Buffer.from(svg)).png().toBuffer()
}
export const renderTeamKpiImage = event => render(buildTeamKpiImageSvg(event))
export const renderEmployeePayrollImage = (profile, date) => render(buildEmployeePayrollImageSvg(profile, date))
// Telegram sometimes rejects a valid RGBA PNG with IMAGE_PROCESS_FAILED; an
// opaque JPEG of the same calendar is the one-time fallback.
export const toOpaqueJpeg = png => sharp(png).flatten({ background: '#faf8f0' }).jpeg({ quality: 92 }).toBuffer()

export function buildTeamDailyKpiImageSvg(date, items) {
  const sorted = [...items].sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'ru'))
  const rows = sorted.map(item => [item.employee_name, money(item.amount)])
  rows.push(['Всего KPI-бонусов', money(items.reduce((sum, item) => sum + Number(item.amount), 0))])
  return card('Ежедневные KPI-бонусы', 'Команда Zar Kebab', date, rows, 'Оформил: Система')
}
export const renderTeamDailyKpiImage = (date, items) => render(buildTeamDailyKpiImageSvg(date, items))

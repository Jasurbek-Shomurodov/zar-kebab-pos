import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  formatMenuWeekdays,
  isCustomerMenuCategory,
  isPublicMenuCategory,
  isWaiterMenuCategory,
  isWithinMenuSchedule,
  isWithinMenuWeekdays,
  menuTimeWindowLabel,
  normalizeMenuWeekdays,
} from '../src/lib/menuItems.js'

// 2026-11-20 is a Friday, 2026-11-21 a Saturday, 2026-11-22 a Sunday.
const fridayLunch = new Date('2026-11-20T12:00:00')
const saturdayLunch = new Date('2026-11-21T12:00:00')
const sundayLunch = new Date('2026-11-22T12:00:00')
const fridayEvening = new Date('2026-11-20T18:00:00')

const businessLunch = { visible_weekdays: [1, 2, 3, 4, 5], visible_from_time: '11:00', visible_until_time: '15:00' }

test('weekday-scheduled categories are hidden from waiter and guest menus on other days', () => {
  assert.equal(isWaiterMenuCategory(businessLunch, fridayLunch), true)
  assert.equal(isCustomerMenuCategory(businessLunch, fridayLunch), true)
  assert.equal(isWaiterMenuCategory(businessLunch, saturdayLunch), false)
  assert.equal(isWaiterMenuCategory(businessLunch, sundayLunch), false)
  assert.equal(isCustomerMenuCategory(businessLunch, saturdayLunch), false)
})

test('weekdays combine with the time window', () => {
  assert.equal(isWithinMenuSchedule(businessLunch, fridayLunch), true)
  assert.equal(isWithinMenuSchedule(businessLunch, fridayEvening), false)
  assert.equal(isWithinMenuSchedule({ visible_weekdays: [6, 7] }, sundayLunch), true)
  assert.equal(isWithinMenuSchedule({ visible_weekdays: [6, 7] }, fridayEvening), false)
})

test('empty, null or all-seven weekday lists mean every day', () => {
  for (const visible_weekdays of [null, undefined, [], [1, 2, 3, 4, 5, 6, 7]]) {
    assert.equal(isWithinMenuWeekdays({ visible_weekdays }, saturdayLunch), true)
    assert.equal(formatMenuWeekdays({ visible_weekdays }), '')
  }
  assert.deepEqual(normalizeMenuWeekdays([5, '1', 1, 9, 0, 'x', 3]), [1, 3, 5])
})

test('channel and staff schedule overrides bypass the weekday schedule', () => {
  const lunch = { ...businessLunch, always_visible_game_club: true, always_visible_profile_ids: ['staff-1'] }
  assert.equal(isWaiterMenuCategory(lunch, saturdayLunch, '', 'game_club'), true)
  assert.equal(isWaiterMenuCategory(lunch, saturdayLunch, 'staff-1', 'dine_in'), true)
  assert.equal(isWaiterMenuCategory(lunch, saturdayLunch, 'staff-2', 'dine_in'), false)
})

test('public menus keep weekday categories listed with a day label', () => {
  assert.equal(isPublicMenuCategory(businessLunch), true)
  assert.equal(formatMenuWeekdays(businessLunch, 'en'), 'Mon–Fri')
  assert.equal(formatMenuWeekdays({ visible_weekdays: [6, 7] }, 'ru'), 'Сб, Вс')
  assert.equal(formatMenuWeekdays({ visible_weekdays: [1, 3, 4, 5] }, 'en'), 'Mon, Wed–Fri')
  assert.equal(menuTimeWindowLabel(businessLunch, 'en'), 'Available Mon–Fri 11:00–15:00')
  assert.equal(menuTimeWindowLabel({ visible_weekdays: [6, 7] }, 'uz'), 'Mavjud: Sh, Ya')
})

test('migration stores ISO weekdays with NULL meaning every day', () => {
  const migration = readFileSync(new URL('../migrations/285_menu_category_weekdays.sql', import.meta.url), 'utf8')
  assert.match(migration, /add column if not exists visible_weekdays smallint\[\]/)
  assert.match(migration, /visible_weekdays <@ array\[1, 2, 3, 4, 5, 6, 7\]::smallint\[\]/)
  const adminMenu = readFileSync(new URL('../src/pages/AdminMenu.jsx', import.meta.url), 'utf8')
  assert.match(adminMenu, /visible_weekdays: nullableMenuWeekdays\(catForm\.visible_weekdays\)/)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isActiveMenuCategory,
  isActiveMenuItem,
  isCashierOnlyItem,
  isCashierQuickItem,
  isCustomerMenuCategory,
  isCustomerMenuItem,
  isPublicMenuCategory,
  isPublicMenuItem,
  menuTimeWindowLabel,
  isDeletedMenuCategory,
  isDeletedMenuItem,
  isHiddenMenuCategory,
  isMenuItemOrderable,
  isPublicHiddenMenuItem,
  isTouristHiddenMenuCategory,
  isWaiterHiddenMenuCategory,
  isWaiterMenuCategory,
  isWaiterMenuItem,
  isWithinMenuTimeWindow,
} from '../src/lib/menuItems.js'

test('cashier-only items stay available for cashier quick items but hidden from customer menus', () => {
  const item = {
    available: true,
    cashier_only: true,
    show_in_cashier_quick_items: true,
  }

  assert.equal(isCashierQuickItem(item), true)
  assert.equal(isCashierOnlyItem(item), true)
  assert.equal(isCustomerMenuItem(item), false)
})

test('availability hides active items from waiters while keeping them visible to customers', () => {
  assert.equal(isCustomerMenuItem({ available: true, cashier_only: false }), true)
  assert.equal(isWaiterMenuItem({ available: true }), true)
  assert.equal(isMenuItemOrderable({ available: true }), true)

  const unavailable = { available: false, cashier_only: false }
  assert.equal(isCustomerMenuItem(unavailable), true)
  assert.equal(isWaiterMenuItem(unavailable), false)
  assert.equal(isMenuItemOrderable(unavailable), false)
})

test('public-hidden items are hidden from customer menus but available to waiter ordering', () => {
  const item = { available: true, public_hidden: true, cashier_only: false }

  assert.equal(isPublicHiddenMenuItem(item), true)
  assert.equal(isCustomerMenuItem(item), false)
  assert.equal(isWaiterMenuItem(item), true)
})

test('legacy waiter-hidden flags no longer hide an available product', () => {
  const item = { available: true, waiter_hidden: true, cashier_only: false }

  assert.equal(isWaiterMenuItem(item), true)
  assert.equal(isCustomerMenuItem(item), true)
})

test('soft-deleted menu items stay out of active menus', () => {
  const deleted = { available: true, deleted_at: '2026-07-09T10:00:00.000Z' }

  assert.equal(isDeletedMenuItem(deleted), true)
  assert.equal(isActiveMenuItem(deleted), false)
  assert.equal(isMenuItemOrderable(deleted), false)
  assert.equal(isCustomerMenuItem(deleted), false)
  assert.equal(isWaiterMenuItem(deleted), false)
})

test('hidden menu categories are excluded from customer menus', () => {
  assert.equal(isHiddenMenuCategory({ hidden: true }), true)
  assert.equal(isHiddenMenuCategory({ is_hidden: true }), true)
  assert.equal(isCustomerMenuCategory({ hidden: true }), false)
  assert.equal(isCustomerMenuCategory({ hidden: false }), true)
  assert.equal(isCustomerMenuCategory({}), true)
})

test('archived categories stay out of active menus while retaining report context', () => {
  const archived = {
    hidden: false,
    waiter_hidden: false,
    deleted_at: '2026-08-01T10:00:00.000Z',
  }

  assert.equal(isDeletedMenuCategory(archived), true)
  assert.equal(isActiveMenuCategory(archived), false)
  assert.equal(isCustomerMenuCategory(archived), false)
  assert.equal(isWaiterMenuCategory(archived), false)
})

test('waiter-hidden categories are excluded from waiter ordering only', () => {
  assert.equal(isWaiterHiddenMenuCategory({ waiter_hidden: true }), true)
  assert.equal(isWaiterMenuCategory({ waiter_hidden: true }), false)
  assert.equal(isWaiterMenuCategory({ hidden: true, waiter_hidden: false }), true)
  assert.equal(isCustomerMenuCategory({ hidden: false, waiter_hidden: true }), true)
})

test('Tourist-hidden category flag is independent from public and waiter visibility', () => {
  const category = { hidden: false, waiter_hidden: false, tourist_hidden: true }

  assert.equal(isTouristHiddenMenuCategory(category), true)
  assert.equal(isTouristHiddenMenuCategory({ touristHidden: true }), true)
  assert.equal(isCustomerMenuCategory(category), true)
  assert.equal(isWaiterMenuCategory(category), true)
})

test('menu time windows include normal, open-ended, and overnight intervals', () => {
  const atLunch = new Date('2026-07-10T11:30:00')
  const afterLunch = new Date('2026-07-10T14:00:00')
  const lateNight = new Date('2026-07-10T23:30:00')
  const earlyMorning = new Date('2026-07-10T01:30:00')

  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '11:00', visible_until_time: '14:00' }, atLunch), true)
  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '11:00', visible_until_time: '14:00' }, afterLunch), false)
  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '11:00' }, atLunch), true)
  assert.equal(isWithinMenuTimeWindow({ visible_until_time: '14:00' }, atLunch), true)
  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '22:00', visible_until_time: '02:00' }, lateNight), true)
  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '22:00', visible_until_time: '02:00' }, earlyMorning), true)
  assert.equal(isWithinMenuTimeWindow({ visible_from_time: '22:00', visible_until_time: '02:00' }, atLunch), false)
})

test('scheduled categories and items are hidden outside their time window', () => {
  const breakfast = { visible_from_time: '08:00', visible_until_time: '10:00', available: true }
  const now = new Date('2026-07-10T11:30:00')

  assert.equal(isCustomerMenuCategory(breakfast, now), false)
  assert.equal(isWaiterMenuCategory(breakfast, now), false)
  assert.equal(isCustomerMenuItem(breakfast, now), false)
  assert.equal(isWaiterMenuItem(breakfast, now), false)
})

test('selected staff can see a waiter category outside its schedule without exposing it publicly', () => {
  const afterLunch = new Date('2026-07-10T18:00:00')
  const businessLunch = {
    visible_from_time: '11:00',
    visible_until_time: '15:00',
    always_visible_profile_ids: ['game-club-user'],
  }

  assert.equal(isWaiterMenuCategory(businessLunch, afterLunch, 'game-club-user'), true)
  assert.equal(isWaiterMenuCategory(businessLunch, afterLunch, 'other-user'), false)
  assert.equal(isCustomerMenuCategory(businessLunch, afterLunch), false)
  assert.equal(isWaiterMenuCategory({ ...businessLunch, waiter_hidden: true }, afterLunch, 'game-club-user'), false)
  assert.equal(isWaiterMenuCategory({ ...businessLunch, deleted_at: '2026-07-10T12:00:00Z' }, afterLunch, 'game-club-user'), false)
})

test('public menus list scheduled categories and items all day with their time window', () => {
  const breakfast = { visible_from_time: '08:00:00', visible_until_time: '12:31:00' }
  assert.equal(isPublicMenuCategory(breakfast), true)
  assert.equal(isPublicMenuItem(breakfast), true)
  assert.equal(isPublicMenuCategory({ ...breakfast, hidden: true }), false)
  assert.equal(isPublicMenuCategory({ ...breakfast, deleted_at: '2026-07-10T12:00:00Z' }), false)
  assert.equal(isPublicMenuItem({ ...breakfast, public_hidden: true }), false)
  assert.equal(isPublicMenuItem({ ...breakfast, cashier_only: true }), false)
  assert.equal(menuTimeWindowLabel(breakfast, 'en'), 'Available 08:00–12:31')
  assert.equal(menuTimeWindowLabel(breakfast, 'ru'), 'Доступно: 08:00–12:31')
  assert.equal(menuTimeWindowLabel({}, 'en'), '')
})

export function isCashierQuickItem(item) {
  return !!(
    item?.show_in_cashier_quick_items ||
    item?.showInCashierQuickItems ||
    item?.is_counter_item ||
    item?.isCounterItem
  )
}

export function isCashierOnlyItem(item) {
  return !!(item?.cashier_only || item?.cashierOnly)
}

export function isPublicHiddenMenuItem(item) {
  return !!(item?.public_hidden || item?.publicHidden || item?.hide_from_public || item?.hideFromPublic)
}

function parseMenuTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

function minutesFromDate(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(current.getTime())) return minutesFromDate(new Date())
  return current.getHours() * 60 + current.getMinutes()
}

function getScheduleStart(entity) {
  return entity?.visible_from_time ?? entity?.visibleFromTime ?? entity?.available_from_time ?? entity?.availableFromTime
}

function getScheduleEnd(entity) {
  return entity?.visible_until_time ?? entity?.visibleUntilTime ?? entity?.available_until_time ?? entity?.availableUntilTime
}

export function isWithinMenuTimeWindow(entity, date = new Date()) {
  const start = parseMenuTime(getScheduleStart(entity))
  const end = parseMenuTime(getScheduleEnd(entity))
  if (start == null && end == null) return true

  const now = minutesFromDate(date)
  if (start != null && end == null) return now >= start
  if (start == null && end != null) return now < end
  if (start === end) return true
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function formatMenuTime(value) {
  const minutes = parseMenuTime(value)
  if (minutes == null) return ''
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// Public-facing schedule label, e.g. "11:00–15:00". Empty when unscheduled.
export function formatMenuTimeWindow(entity) {
  const start = formatMenuTime(getScheduleStart(entity))
  const end = formatMenuTime(getScheduleEnd(entity))
  if (!start && !end) return ''
  if (start && end) return start === end ? '' : `${start}–${end}`
  return start ? `${start}+` : `–${end}`
}

export function menuTimeWindowLabel(entity, lang = 'en') {
  const range = [formatMenuWeekdays(entity, lang), formatMenuTimeWindow(entity)].filter(Boolean).join(' ')
  if (!range) return ''
  if (lang === 'uz') return `Mavjud: ${range}`
  if (lang === 'ru') return `Доступно: ${range}`
  return `Available ${range}`
}

const MENU_WEEKDAY_LABELS = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
}

export const MENU_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

// ISO weekdays (1 = Monday ... 7 = Sunday), sorted and de-duplicated.
// An empty result, or all seven days, means "every day".
export function normalizeMenuWeekdays(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b)
}

function getScheduleWeekdays(entity) {
  const days = normalizeMenuWeekdays(entity?.visible_weekdays ?? entity?.visibleWeekdays)
  return days.length === 7 ? [] : days
}

function isoWeekdayFromDate(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(current.getTime())) return isoWeekdayFromDate(new Date())
  return current.getDay() || 7
}

export function isWithinMenuWeekdays(entity, date = new Date()) {
  const days = getScheduleWeekdays(entity)
  return days.length === 0 || days.includes(isoWeekdayFromDate(date))
}

// Editor form keeps the selected days (all seven by default); the DB stores NULL for every day.
export function categoryFormWeekdays(category) {
  const days = normalizeMenuWeekdays(category?.visible_weekdays ?? category?.visibleWeekdays)
  return days.length ? days : [...MENU_WEEKDAYS]
}

export function nullableMenuWeekdays(value) {
  const days = normalizeMenuWeekdays(value)
  return days.length === 0 || days.length === MENU_WEEKDAYS.length ? null : days
}

// Full schedule: weekdays and the time window must both allow the row.
export function isWithinMenuSchedule(entity, date = new Date()) {
  return isWithinMenuWeekdays(entity, date) && isWithinMenuTimeWindow(entity, date)
}

// "Mon–Fri", "Sat, Sun", "Mon, Wed–Fri". Empty when every day.
export function formatMenuWeekdays(entity, lang = 'en') {
  const days = getScheduleWeekdays(entity)
  if (days.length === 0) return ''
  const names = MENU_WEEKDAY_LABELS[lang] || MENU_WEEKDAY_LABELS.en
  const runs = []
  for (const day of days) {
    const last = runs[runs.length - 1]
    if (last && day === last[1] + 1) last[1] = day
    else runs.push([day, day])
  }
  return runs.map(([start, end]) => {
    if (start === end) return names[start - 1]
    if (end === start + 1) return `${names[start - 1]}, ${names[end - 1]}`
    return `${names[start - 1]}–${names[end - 1]}`
  }).join(', ')
}

export function isHiddenMenuCategory(category) {
  return !!(category?.hidden || category?.is_hidden || category?.isHidden)
}

export function isDeletedMenuCategory(category) {
  return !!(category?.deleted_at || category?.deletedAt || category?.is_deleted || category?.isDeleted)
}

export function isActiveMenuCategory(category) {
  return !!category && !isDeletedMenuCategory(category)
}

export function isWaiterHiddenMenuCategory(category) {
  return !!(
    category?.waiter_hidden ||
    category?.waiterHidden ||
    category?.hide_from_waiter ||
    category?.hideFromWaiter
  )
}

export function isTouristHiddenMenuCategory(category) {
  return !!(
    category?.tourist_hidden ||
    category?.touristHidden ||
    category?.hide_from_tourist ||
    category?.hideFromTourist
  )
}

// Frozen half-prepared meals are a separate retail line with their own public
// page; every guest-facing menu (public, Tourist, Telegram, guest device) omits them.
export function isFrozenShopMenuCategory(category) {
  return !!(category?.frozen_shop || category?.frozenShop)
}

export function getMenuCategoryAlwaysVisibleProfileIds(category) {
  const value = category?.always_visible_profile_ids ?? category?.alwaysVisibleProfileIds
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(profileId => String(profileId || '').trim()).filter(Boolean))]
}

export function hasMenuCategoryScheduleOverride(category, profileId) {
  const normalizedProfileId = String(profileId || '').trim()
  return normalizedProfileId !== '' && getMenuCategoryAlwaysVisibleProfileIds(category).includes(normalizedProfileId)
}

export function isCustomerMenuCategory(category, date = new Date()) {
  return isActiveMenuCategory(category) &&
    !isHiddenMenuCategory(category) &&
    !isFrozenShopMenuCategory(category) &&
    isWithinMenuSchedule(category, date)
}

// The public and Telegram menus are display-only: a scheduled category stays
// listed all day and shows its time window instead of disappearing.
export function isPublicMenuCategory(category) {
  return isActiveMenuCategory(category) && !isHiddenMenuCategory(category)
}

export function isWaiterMenuCategory(category, date = new Date(), profileId = '', orderType = '') {
  return isActiveMenuCategory(category) &&
    !isWaiterHiddenMenuCategory(category) &&
    (
      isWithinMenuSchedule(category, date) ||
      hasMenuCategoryScheduleOverride(category, profileId) ||
      (orderType === 'game_club' && category.always_visible_game_club === true) ||
      (orderType === 'take_away' && category.always_visible_take_away === true) ||
      (orderType === 'delivery' && category.always_visible_delivery === true)
    )
}

export function isDeletedMenuItem(item) {
  return !!(item?.deleted_at || item?.deletedAt || item?.is_deleted || item?.isDeleted)
}

export function isActiveMenuItem(item) {
  return !!item && !isDeletedMenuItem(item)
}

export function isMenuItemOrderable(item) {
  return isActiveMenuItem(item) && item?.available === true
}

export function isCustomerMenuItem(item, date = new Date()) {
  return isActiveMenuItem(item) &&
    !isCashierOnlyItem(item) &&
    !isPublicHiddenMenuItem(item) &&
    isWithinMenuTimeWindow(item, date)
}

export function isPublicMenuItem(item) {
  return isActiveMenuItem(item) &&
    !isCashierOnlyItem(item) &&
    !isPublicHiddenMenuItem(item)
}

export function isWaiterMenuItem(item, date = new Date()) {
  return isMenuItemOrderable(item) &&
    !isCashierOnlyItem(item) &&
    isWithinMenuTimeWindow(item, date)
}

export function getQuickItemSortOrder(item) {
  const value = Number(item?.quick_item_sort_order ?? item?.quickItemSortOrder ?? item?.sort_order ?? 9999)
  return Number.isFinite(value) ? value : 9999
}

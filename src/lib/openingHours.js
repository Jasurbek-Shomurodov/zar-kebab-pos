import { RESTAURANT_UTC_OFFSET_MINUTES } from './dateFormat.js'

// Guest-facing opening hours, in restaurant (Tashkent) time. The same hours are printed in the
// public hero, footer and SEO copy; change them together.
export const OPENING_MINUTE = 8 * 60
export const CLOSING_MINUTE = 23 * 60 + 30

/** Minutes since midnight in Tashkent for the given instant. */
export function restaurantMinuteOfDay(now = Date.now()) {
  const minutes = Math.floor(Number(now) / 60_000) + RESTAURANT_UTC_OFFSET_MINUTES
  return ((minutes % 1440) + 1440) % 1440
}

export function isRestaurantOpen(now = Date.now()) {
  const minute = restaurantMinuteOfDay(now)
  return minute >= OPENING_MINUTE && minute < CLOSING_MINUTE
}

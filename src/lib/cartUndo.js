// Undo for a cart line removed by mistake: the line goes back where it was, with its
// quantity, options and note. Pure so the rule is testable without the cart UI.

export const CART_UNDO_MS = 5000

function cartItemKey(item) {
  return item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
}

/**
 * @param {Array<object>} cart the cart as it is now
 * @param {object} item the removed line
 * @param {number} index where the line sat before it was removed
 * @returns {Array<object>} a new cart with the line restored; unchanged when it is already back
 */
export function restoreCartItem(cart, item, index) {
  const current = Array.isArray(cart) ? cart : []
  if (!item) return current
  const key = cartItemKey(item)
  if (key == null || current.some(row => cartItemKey(row) === key)) return current
  const position = Number.isInteger(index) ? Math.min(Math.max(index, 0), current.length) : current.length
  return [...current.slice(0, position), { ...item }, ...current.slice(position)]
}

/** Whether the minus button may lower this quantity: it stops at one step, removal has its own button. */
export function canDecreaseCartQuantity(quantity, step = 1) {
  const value = Number(quantity)
  const unit = Number(step) > 0 ? Number(step) : 1
  if (!Number.isFinite(value)) return false
  return value - unit >= unit - 1e-9
}

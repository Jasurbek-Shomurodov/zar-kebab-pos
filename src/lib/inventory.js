import { startsWithCapitalOrDigit } from './nameStart.js'

export const INVENTORY_COLUMNS = 'id, name, image_url, quantity, note, is_active, counted_at, counted_by_name, updated_at'
export const INVENTORY_NAME_MAX_LENGTH = 120
export const INVENTORY_NOTE_MAX_LENGTH = 1000
export const INVENTORY_MAX_COUNT = 1000000
export const INVENTORY_PHOTO_MAX_SIDE = 1280
export const INVENTORY_PHOTO_MAX_BYTES = 4 * 1024 * 1024

// The id is chosen up front so a retried save can never create a second row.
export function emptyInventoryDraft(id) {
  return { id, name: '', image_url: '', quantity: '', note: '', isNew: true }
}

export function inventoryDraftFrom(item) {
  return { id: item.id, name: item.name, image_url: item.image_url || '', quantity: String(item.quantity), note: item.note || '', isNew: false }
}

export function normalizeInventoryCountInput(value) {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7)
}

export function parseInventoryCount(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const count = Number(text)
  return count <= INVENTORY_MAX_COUNT ? count : null
}

/** Returns a copy key for the first problem, or '' when the draft can be saved. */
export function inventoryDraftError(draft) {
  if (!draft.name.trim()) return 'nameRequired'
  if (!startsWithCapitalOrDigit(draft.name)) return 'nameStartInvalid'
  if (parseInventoryCount(draft.quantity) === null) return 'countInvalid'
  return ''
}

export function inventoryPayload(draft) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    image_url: draft.image_url || null,
    quantity: parseInventoryCount(draft.quantity),
    note: draft.note.trim() || null,
  }
}

export function inventoryDraftChanged(draft, original) {
  return ['name', 'image_url', 'quantity', 'note'].some(field => String(draft[field]).trim() !== String(original[field]).trim())
}

export function inventoryItemMatches(item, expected) {
  return !!item && Object.keys(expected).every(field => item[field] === expected[field])
}

export function filterInventoryItems(items, { query = '', status = 'active' } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return items.filter(item => item.is_active === (status === 'active')
    && (!normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery)))
}

export function sortInventoryItems(items) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name))
}

export function upsertInventoryItem(items, item) {
  return sortInventoryItems([...items.filter(current => current.id !== item.id), item])
}

export function inventoryPhotoSize(width, height, maxSide = INVENTORY_PHOTO_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

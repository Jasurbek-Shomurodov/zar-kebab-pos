import { supabase } from './supabase'
import { MENU_IMAGE_MIME_TYPES } from './menuMedia'
import { INVENTORY_PHOTO_MAX_BYTES, inventoryPhotoSize } from './inventory'

const MEDIA_SCOPE = 'scope=inventory'

function photoError(code) {
  return Object.assign(new Error(code), { code })
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

// Phone camera photos are often over the upload limit, and a list of cards needs
// nothing near full resolution, so shrink in the browser before uploading.
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file)
  const { width, height } = inventoryPhotoSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  return blob ? new File([blob], 'inventory.jpg', { type: 'image/jpeg' }) : null
}

async function preparePhoto(file) {
  // A browser that cannot decode the file falls back to the original checks below.
  const shrunk = await shrinkPhoto(file).catch(() => null)
  if (shrunk) return shrunk
  if (!MENU_IMAGE_MIME_TYPES.includes(String(file.type).toLowerCase())) throw photoError('photoType')
  if (file.size > INVENTORY_PHOTO_MAX_BYTES) throw photoError('photoSize')
  return file
}

export async function uploadInventoryPhoto(file, entityId) {
  const body = new FormData()
  body.append('file', await preparePhoto(file))
  body.append('entityId', entityId)
  const response = await fetch(`/api/menu-image/upload?${MEDIA_SCOPE}`, { method: 'POST', headers: await authHeaders(), body })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.url) throw photoError('photoFailed')
  return data.url
}

// Best effort: a leftover file only costs storage, so it never blocks the save it follows.
export async function deleteInventoryPhoto(url) {
  if (!url) return
  await fetch(`/api/menu-image/delete?${MEDIA_SCOPE}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ url }),
  }).catch(() => {})
}

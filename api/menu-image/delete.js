import { json, methodNotAllowed, readJson } from '../telegram/_lib/http.js'
import { deleteFromR2, isInventoryObjectKey, keyFromR2Url } from './_lib/r2.js'
import { isInventoryMediaRequest, requireInventoryEditAccess, requireMenuEditAccess } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE'])

  try {
    const inventoryScope = isInventoryMediaRequest(req)
    await (inventoryScope ? requireInventoryEditAccess(req) : requireMenuEditAccess(req))
    const body = await readJson(req)
    const target = body.key || body.url
    if (inventoryScope && !isInventoryObjectKey(keyFromR2Url(target))) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }
    await deleteFromR2(target)
    return json(res, 200, { ok: true })
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Could not delete menu image' })
  }
}

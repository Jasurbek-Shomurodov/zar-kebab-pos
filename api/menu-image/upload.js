import { json, methodNotAllowed } from '../telegram/_lib/http.js'
import { readMultipart } from './_lib/multipart.js'
import { assertMenuMediaFile, makeObjectKey, uploadToR2 } from './_lib/r2.js'
import { isInventoryMediaRequest, requireInventoryEditAccess, requireMenuEditAccess } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const inventoryScope = isInventoryMediaRequest(req)
    await (inventoryScope ? requireInventoryEditAccess(req) : requireMenuEditAccess(req))
    const { fields, file } = await readMultipart(req)
    const type = inventoryScope ? 'inventory' : String(fields.type || '')
    const key = makeObjectKey({
      type,
      entityId: fields.entityId,
      contentType: file?.contentType,
    })
    await assertMenuMediaFile(file, { allowVideo: type === 'product' })
    const result = await uploadToR2({
      key,
      file: {
        ...file,
        contentType: file.contentType,
      },
    })
    return json(res, 200, result)
  } catch (error) {
    return json(res, error.status || 400, { error: error.message || 'Could not upload menu media' })
  }
}

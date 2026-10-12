function requestErrorText(error) {
  return `${error?.name || ''} ${error?.code || ''} ${error?.message || error || ''} ${error?.details || ''}`.toLowerCase()
}

export function isBazaarIngredientNetworkError(error) {
  const text = requestErrorText(error)
  return error instanceof TypeError
    || error?.code === 'POS_WRITE_TIMEOUT'
    || text.includes('load failed')
    || text.includes('failed to fetch')
    || text.includes('fetch failed')
    || text.includes('networkerror')
    || text.includes('network request failed')
}

export async function runBazaarIngredientWriteWithRecovery({ write, reconcile }) {
  const attemptWrite = async () => {
    try {
      return await write()
    } catch (error) {
      return { data: null, error }
    }
  }

  let result = await attemptWrite()
  if (!result?.error || !isBazaarIngredientNetworkError(result.error)) return result

  let recovered = null
  try {
    recovered = await reconcile()
  } catch {
    // A disconnected client may also fail the reconciliation read.
  }
  if (recovered) return { data: recovered, error: null, recovered: true }

  result = await attemptWrite()
  if (!result?.error || !isBazaarIngredientNetworkError(result.error)) return result

  try {
    recovered = await reconcile()
  } catch {
    recovered = null
  }
  return recovered ? { data: recovered, error: null, recovered: true } : result
}

export function bazaarIngredientMatches(ingredient, expected) {
  if (!ingredient) return false
  if (expected.product_name != null && ingredient.product_name !== expected.product_name) return false
  if (expected.category != null && ingredient.category !== expected.category) return false
  if (expected.unit != null && ingredient.unit !== expected.unit) return false
  if (expected.normal_unit_price != null && Number(ingredient.normal_unit_price) !== Number(expected.normal_unit_price)) return false
  if (expected.pieces_per_unit !== undefined && (Number(ingredient.pieces_per_unit) || null) !== (Number(expected.pieces_per_unit) || null)) return false
  if (expected.is_active != null && ingredient.is_active !== expected.is_active) return false
  return true
}

export function getItemKcal(item) {
  const value = Number(item?.kcal ?? item?.calories ?? item?.kkcal)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export function getItemGrams(item) {
  const value = Number(item?.grams ?? item?.gram ?? item?.weight_grams ?? item?.weightGrams)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export function getItemMillilitres(item) {
  const mlValue = Number(
    item?.millilitres ??
    item?.milliliters ??
    item?.ml ??
    item?.volume_ml ??
    item?.volumeMl
  )
  if (Number.isFinite(mlValue) && mlValue > 0) return Math.round(mlValue)

  const litreValue = Number(item?.litres ?? item?.liters ?? item?.litre ?? item?.liter ?? item?.volume_litres ?? item?.volumeLitres)
  return Number.isFinite(litreValue) && litreValue > 0 ? Math.round(litreValue * 1000) : 0
}

export function kcalLabel(item, lang = 'en') {
  const kcal = getItemKcal(item)
  if (!kcal) return ''
  const unit = lang === 'ru' ? 'ккал' : 'kcal'
  return `${kcal} ${unit}`
}

export function gramsLabel(item, lang = 'en') {
  const grams = getItemGrams(item)
  if (!grams) return ''
  if (grams >= 1000) {
    const kg = grams / 1000
    const formatted = Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return `${formatted} kg`
  }
  const unit = lang === 'ru' ? 'г' : 'g'
  return `${grams} ${unit}`
}

export function millilitresLabel(item) {
  const millilitres = getItemMillilitres(item)
  if (!millilitres) return ''
  if (millilitres >= 1000) {
    const litres = millilitres / 1000
    const formatted = Number.isInteger(litres) ? String(litres) : litres.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return `${formatted} L`
  }
  return `${millilitres} ml`
}

export const litresLabel = millilitresLabel

export function getItemServes(item) {
  const value = Number(item?.serves ?? item?.servings ?? item?.persons)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export function servesLabel(item, lang = 'en') {
  const serves = getItemServes(item)
  if (!serves) return ''
  if (lang === 'ru') return `на ${serves} чел.`
  if (lang === 'uz') return `${serves} kishilik`
  return serves === 1 ? 'for 1 person' : `for ${serves} people`
}

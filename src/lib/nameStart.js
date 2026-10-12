// Catalogue names (menu products, categories, ingredients) must begin with a capital letter or a digit.
// Blank values pass; required-field checks are separate.
export function startsWithCapitalOrDigit(value) {
  const normalized = String(value ?? '').trim()
  return !normalized || /^[\p{Lu}\p{N}]/u.test(normalized)
}

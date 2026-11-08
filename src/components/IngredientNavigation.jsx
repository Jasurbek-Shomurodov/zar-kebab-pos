import { useLocation, useNavigate } from 'react-router-dom'

const LABELS = {
  en: { title: 'Ingredients', catalog: 'Add ingredient', usage: 'Purchases & usage', sheet: 'Purchase sheet' },
  ru: { title: 'Ингредиенты', catalog: 'Добавить ингредиент', usage: 'Закупки и расход', sheet: 'Таблица закупок' },
  uz: { title: 'Masalliqlar', catalog: 'Masalliq qo‘shish', usage: 'Xaridlar va sarf', sheet: 'Xaridlar jadvali' },
}

const CATALOG_PATH = '/admin/ingredients'
const USAGE_PATH = '/admin/ingredients/usage'
const SHEET_PATH = '/admin/ingredients/sheet'

/** The Ingredients views as top-bar tabs; each tab is its own route so none loads another's data. */
export function useIngredientTabs(lang) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const l = LABELS[lang] || LABELS.en
  return {
    title: l.title,
    tabs: {
      label: l.title,
      value: pathname.startsWith(USAGE_PATH) ? USAGE_PATH : pathname.startsWith(SHEET_PATH) ? SHEET_PATH : CATALOG_PATH,
      onChange: path => { if (path !== pathname) navigate(path) },
      items: [
        { key: CATALOG_PATH, label: l.catalog },
        { key: USAGE_PATH, label: l.usage },
        { key: SHEET_PATH, label: l.sheet },
      ],
    },
  }
}

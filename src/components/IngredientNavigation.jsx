import { useLocation, useNavigate } from 'react-router-dom'

const LABELS = {
  en: { title: 'Ingredients', catalog: 'Add ingredient', usage: 'Purchases & usage' },
  ru: { title: 'Ингредиенты', catalog: 'Добавить ингредиент', usage: 'Закупки и расход' },
  uz: { title: 'Masalliqlar', catalog: 'Masalliq qo‘shish', usage: 'Xaridlar va sarf' },
}

const CATALOG_PATH = '/admin/ingredients'
const USAGE_PATH = '/admin/ingredients/usage'

/** The Ingredients views as top-bar tabs; each tab is its own route so neither loads the other's data. */
export function useIngredientTabs(lang) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const l = LABELS[lang] || LABELS.en
  return {
    title: l.title,
    tabs: {
      label: l.title,
      value: pathname.startsWith(USAGE_PATH) ? USAGE_PATH : CATALOG_PATH,
      onChange: path => { if (path !== pathname) navigate(path) },
      items: [
        { key: CATALOG_PATH, label: l.catalog },
        { key: USAGE_PATH, label: l.usage },
      ],
    },
  }
}

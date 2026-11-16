import React, { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { getMenuItemOptionGroups } from './MenuProductCards'
import { formatCurrency } from '../lib/formatCurrency'
import { getItemName } from '../lib/i18n'

const COPY = {
  en: {
    title: count => `${count === 1 ? 'This dish' : `${count} dishes`} would cost more than ${count === 1 ? 'its' : 'their'} selling price. Nothing was saved. Fix each tech card (check quantities and units, e.g. g vs kg) or raise the price, then try again.`,
    noAccess: 'Ask someone with Tech Cards access to fix them.',
    baseRecipe: 'Base recipe', cost: 'Cost', price: 'Price', open: 'Open tech card', unknown: 'Unknown dish',
  },
  ru: {
    title: count => `${count === 1 ? 'Себестоимость блюда превысит' : `Себестоимость блюд (${count}) превысит`} цену продажи. Ничего не сохранено. Исправьте техкарты (проверьте количество и единицы, например г и кг) или поднимите цену, затем повторите.`,
    noAccess: 'Попросите сотрудника с доступом к техкартам исправить их.',
    baseRecipe: 'Основной рецепт', cost: 'Себестоимость', price: 'Цена', open: 'Открыть техкарту', unknown: 'Неизвестное блюдо',
  },
  uz: {
    title: count => `${count === 1 ? 'Taom tannarxi' : `${count} ta taom tannarxi`} sotuv narxidan oshib ketadi. Hech narsa saqlanmadi. Texkartalarni tuzating (miqdor va birlikni tekshiring, masalan g va kg) yoki narxni oshiring, so‘ng qayta urinib ko‘ring.`,
    noAccess: 'Texkartalarga ruxsati bor xodimdan tuzatishni so‘rang.',
    baseRecipe: 'Asosiy retsept', cost: 'Tannarx', price: 'Narx', open: 'Texkartani ochish', unknown: 'Noma’lum taom',
  },
}

// Lists dishes whose Tech Card would cost more than their price; each row
// opens that dish's (variant) Tech Card when the viewer may open Tech Cards.
export default function TechCardCostOverrunList({ overruns, menuItems, lang = 'ru', canOpen = false, onOpen }) {
  const l = COPY[lang] || COPY.en
  const rows = useMemo(() => {
    const itemsById = new Map((menuItems || []).map(item => [item.id, item]))
    return (overruns || []).map(row => {
      const item = itemsById.get(row.menuItemId)
      const variant = item && row.variantOptionId
        ? getMenuItemOptionGroups(item, lang, { includeUnavailable: true }).flatMap(group => group.options).find(option => option.id === row.variantOptionId)
        : null
      return {
        ...row,
        key: `${row.menuItemId}::${row.variantOptionId}`,
        name: item ? getItemName(item, lang) : l.unknown,
        variantLabel: row.variantOptionId ? (variant?.label || row.variantOptionId) : l.baseRecipe,
        image: item?.image_url || '',
      }
    })
  }, [overruns, menuItems, lang, l.baseRecipe, l.unknown])

  if (!rows.length) return null
  return (
    <div role="alert" className="space-y-2">
      <p className="ws-notice ws-tone-negative">{l.title(rows.length)}{!canOpen && <> {l.noAccess}</>}</p>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {rows.map(row => {
          const content = (
            <>
              <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[#efece9]">{row.image && <img src={row.image} alt="" className="h-full w-full object-cover" loading="lazy" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#22201d]">{row.name}</span>
                <span className="ws-caption block truncate">{row.variantLabel}</span>
              </span>
              <span className="flex-shrink-0 text-right text-[12px] tabular-nums leading-tight">
                <span className="block font-semibold text-[#c4262c]">{l.cost}: {formatCurrency(row.cost)}</span>
                <span className="block text-[#68655f]">{l.price}: {formatCurrency(row.price)}</span>
              </span>
              {canOpen && <ChevronRight size={16} className="flex-shrink-0 text-[#68655f] transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff5a00]" />}
            </>
          )
          return (
            <li key={row.key}>
              {canOpen ? (
                <button type="button" onClick={() => onOpen?.(row)} aria-label={`${l.open}: ${row.name} · ${row.variantLabel}`} className="group flex w-full items-center gap-3 rounded-[10px] border border-[#e4e1de] bg-white p-2.5 text-left transition-colors hover:bg-[#f6f5f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40">{content}</button>
              ) : (
                <div className="flex items-center gap-3 rounded-[10px] border border-[#e4e1de] bg-white p-2.5">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

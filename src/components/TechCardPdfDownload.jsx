import React, { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { getCategoryName, getItemName } from '../lib/i18n'
import { getMenuItemOptionGroups } from './MenuProductCards'
import WorkspaceDialog from './WorkspaceDialog'
import { restaurantTodayStr } from '../lib/analytics'

const words = {
  en: ['Download PDF', 'Food images', 'Selling prices', 'Cost price', 'Ingredients / composition', 'Cooking method', 'Cancel', 'Select all', 'Clear', 'dishes', 'Preparing PDF…', 'Could not create the PDF. Please retry.', 'Some images could not be loaded and were omitted.', 'Exports saved recipes, including variants. Missing fields are omitted.', 'Close'],
  ru: ['Скачать PDF', 'Фото блюд', 'Цены продажи', 'Себестоимость', 'Ингредиенты / состав', 'Технология приготовления', 'Отмена', 'Выбрать все', 'Сбросить', 'блюд', 'Подготовка PDF…', 'Не удалось создать PDF. Попробуйте ещё раз.', 'Некоторые фото недоступны и пропущены.', 'Экспорт сохранённых рецептов, включая варианты. Отсутствующие данные пропускаются.', 'Закрыть'],
  uz: ['PDF yuklab olish', 'Taom rasmlari', 'Sotuv narxlari', 'Tannarx', 'Masalliqlar / tarkib', 'Tayyorlash usuli', 'Bekor qilish', 'Barchasini tanlash', 'Tozalash', 'taom', 'PDF tayyorlanmoqda…', 'PDF yaratilmadi. Qayta urinib ko‘ring.', 'Ayrim rasmlar yuklanmadi va o‘tkazib yuborildi.', 'Saqlangan retseptlar va variantlar eksport qilinadi. Mavjud bo‘lmagan ma’lumotlar kiritilmaydi.', 'Yopish'],
}
export default function TechCardPdfDownload({ items, cards, categories, allItems, lang, labels: l }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState([])
  const [options, setOptions] = useState({ images: true, prices: true, cost: true, ingredients: true, method: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [warning, setWarning] = useState(false)
  const w = words[lang] || words.en
  const groups = categories.map(c => ({ id: c.id, name: getCategoryName(c, lang), count: items.filter(i => i.category_id === c.id).length })).filter(c => c.count)
  const other = items.filter(i => !categories.some(c => c.id === i.category_id)).length
  if (other) groups.push({ id: '__other', name: l.otherCategory, count: other })
  const count = groups.filter(c => selected.includes(c.id)).reduce((n, c) => n + c.count, 0)
  async function download() {
    if (busy || !count) return
    setBusy(true); setError(false); setWarning(false)
    try {
      const { buildPdfCards, createTechCardPdf } = await import('../lib/techCardPdf')
      const entries = buildPdfCards(items, cards, categories, selected, lang,
        { item: getItemName, category: c => c ? getCategoryName(c, lang) : l.otherCategory },
        item => getMenuItemOptionGroups(item, lang, { includeUnavailable: true }).flatMap(g => g.options))
      const { doc, missingImages } = await createTechCardPdf(entries, allItems, options, l, lang)
      // The restaurant's local date: toISOString() is UTC and names the file with yesterday's date before 05:00.
      doc.save(`tech-cards-${restaurantTodayStr()}.pdf`)
      if (missingImages) setWarning(true)
      else setOpen(false)
    } catch (pdfError) {
      console.error('Tech card PDF failed', pdfError)
      setError(true)
    } finally { setBusy(false) }
  }
  return <>
    <button type="button" disabled={!items.length} onClick={() => { setSelected(groups.map(c => c.id)); setError(false); setWarning(false); setOpen(true) }} className="ws-btn ws-btn-primary shrink-0 whitespace-nowrap"><Download aria-hidden="true" />{w[0]}</button>
    {open && (
      <WorkspaceDialog
        title={w[0]}
        description={w[13]}
        onClose={() => setOpen(false)}
        closeLabel={w[14]}
        variant="sheet"
        size="lg"
        busy={busy}
        notice={<>
          <p className="text-sm font-medium tabular-nums text-[#22201d]">{count} {w[9]}</p>
          {error && <p role="alert" className="ws-notice ws-tone-negative">{w[11]}</p>}
          {warning && <p role="status" className="ws-notice ws-tone-caution">{w[12]}</p>}
        </>}
        footer={<>
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="ws-btn ws-btn-outline">{w[6]}</button>
          <button type="button" disabled={busy || !count} onClick={download} className="ws-btn ws-btn-primary">{busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}{busy ? w[10] : w[0]}</button>
        </>}
      >
        <fieldset disabled={busy} className="min-w-0">
          <legend className="ws-heading">{l.categories}</legend>
          <div className="my-2 flex flex-wrap gap-2">
            <button type="button" className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setSelected(groups.map(c => c.id))}>{w[7]}</button>
            <button type="button" className="ws-btn ws-btn-ghost ws-btn-sm" onClick={() => setSelected([])}>{w[8]}</button>
          </div>
          <div className="divide-y divide-[#e4e1de] rounded-[10px] border border-[#e4e1de]">
            {groups.map(c => (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={e => setSelected(current => e.target.checked ? [...current, c.id] : current.filter(id => id !== c.id))} className="h-4 w-4 shrink-0 accent-[#cc4800]" />
                <span className="min-w-0 flex-1 text-sm text-[#22201d]">{c.name}</span>
                <span className="ws-caption shrink-0 tabular-nums">{c.count} {w[9]}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-x-4 sm:grid-cols-2">
            {Object.keys(options).map((key, i) => (
              <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#22201d]">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#cc4800]" checked={options[key]} onChange={e => setOptions(current => ({ ...current, [key]: e.target.checked }))} />
                {w[i + 1]}
              </label>
            ))}
          </div>
        </fieldset>
      </WorkspaceDialog>
    )}
  </>
}

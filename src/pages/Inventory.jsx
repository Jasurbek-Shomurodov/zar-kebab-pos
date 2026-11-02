import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ImagePlus, Loader2, Plus, RotateCcw, Save, Search, Trash2, UtensilsCrossed, X } from 'lucide-react'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canEditFeature } from '../lib/permissions'
import { capitalizeBazaarNameInput } from '../lib/bazaar'
import { isBazaarIngredientNetworkError, runBazaarIngredientWriteWithRecovery } from '../lib/bazaarIngredientWrites'
import { formatLongDate } from '../lib/dateFormat'
import { formatMoneyInput } from '../lib/moneyInput'
import { loadSalaryRows } from '../lib/salaryData'
import { withWriteTimeout } from '../lib/writeTimeout'
import { deleteInventoryPhoto, uploadInventoryPhoto } from '../lib/inventoryPhoto'
import {
  INVENTORY_COLUMNS, INVENTORY_NAME_MAX_LENGTH, INVENTORY_NOTE_MAX_LENGTH, emptyInventoryDraft, filterInventoryItems,
  inventoryDraftChanged, inventoryDraftError, inventoryDraftFrom, inventoryItemMatches, inventoryPayload,
  normalizeInventoryCountInput, sortInventoryItems, upsertInventoryItem,
} from '../lib/inventory'

const COPY = {
  en: {
    title: 'Inventory', add: 'Add item', edit: 'Edit item', sub: 'Plates, cutlery and other equipment the cafe owns.', name: 'Name', namePlaceholder: 'e.g. Soup spoon', count: 'Count', countPlaceholder: 'e.g. 120', pieces: 'pcs', note: 'Note', notePlaceholder: 'Optional: where it is kept, size, colour…', photo: 'Photo', addPhoto: 'Add photo', changePhoto: 'Change', removePhoto: 'Remove photo', uploading: 'Uploading…', save: 'Save', cancel: 'Cancel', search: 'Search items…', status: 'Status', active: 'Active', archived: 'Archived', archive: 'Archive', restore: 'Restore', archiveTitle: 'Archive item?', archiveText: name => `“${name}” leaves the active list. You can restore it later from Archived.`, empty: 'No items yet.', emptySearch: 'No items found.', lastCount: (date, name) => name ? `Counted ${date} · ${name}` : `Counted ${date}`, shown: count => `${count} shown`, retry: 'Try again', readOnly: 'Your access is read-only.', saved: 'Item saved.', statusUpdated: 'Item status updated.', nameRequired: 'Enter a name.', nameStartInvalid: 'Name must start with a capital letter or a number.', countInvalid: 'Enter a whole number from 0 to 1 000 000.', duplicate: 'An active item with this name already exists.', loadFailed: 'Could not load inventory.', saveFailed: 'Could not save the item.', statusFailed: 'Could not update the item status.', connectionFailed: 'Connection was interrupted. Please try again; a completed save will not be duplicated.', migrationMissing: 'Apply migration 276 to use Inventory.', photoType: 'Choose a JPEG, PNG, WebP, GIF or AVIF photo.', photoSize: 'The photo must be 4 MB or smaller.', photoFailed: 'Could not upload the photo. Please try again.',
  },
  ru: {
    title: 'Инвентарь', add: 'Добавить', edit: 'Изменить позицию', sub: 'Посуда, приборы и другое оборудование кафе.', name: 'Название', namePlaceholder: 'Например: Суповая ложка', count: 'Количество', countPlaceholder: 'Например: 120', pieces: 'шт', note: 'Заметка', notePlaceholder: 'Необязательно: где хранится, размер, цвет…', photo: 'Фото', addPhoto: 'Добавить фото', changePhoto: 'Заменить', removePhoto: 'Удалить фото', uploading: 'Загрузка…', save: 'Сохранить', cancel: 'Отмена', search: 'Поиск позиций…', status: 'Статус', active: 'Активные', archived: 'Архивные', archive: 'В архив', restore: 'Восстановить', archiveTitle: 'Архивировать позицию?', archiveText: name => `«${name}» исчезнет из активного списка. Её можно восстановить позже во вкладке «Архивные».`, empty: 'Позиций пока нет.', emptySearch: 'Позиции не найдены.', lastCount: (date, name) => name ? `Посчитано ${date} · ${name}` : `Посчитано ${date}`, shown: count => `Показано: ${count}`, retry: 'Повторить', readOnly: 'У вас доступ только для чтения.', saved: 'Позиция сохранена.', statusUpdated: 'Статус позиции изменён.', nameRequired: 'Введите название.', nameStartInvalid: 'Название должно начинаться с заглавной буквы или цифры.', countInvalid: 'Введите целое число от 0 до 1 000 000.', duplicate: 'Активная позиция с таким названием уже есть.', loadFailed: 'Не удалось загрузить инвентарь.', saveFailed: 'Не удалось сохранить позицию.', statusFailed: 'Не удалось изменить статус позиции.', connectionFailed: 'Соединение прервалось. Повторите попытку — уже выполненное сохранение не продублируется.', migrationMissing: 'Примените миграцию 276, чтобы пользоваться инвентарём.', photoType: 'Выберите фото JPEG, PNG, WebP, GIF или AVIF.', photoSize: 'Фото должно быть не больше 4 МБ.', photoFailed: 'Не удалось загрузить фото. Повторите попытку.',
  },
  uz: {
    title: 'Inventar', add: 'Qo‘shish', edit: 'Tahrirlash', sub: 'Kafedagi idish-tovoq, qoshiq-vilka va boshqa jihozlar.', name: 'Nomi', namePlaceholder: 'Masalan: Sho‘rva qoshig‘i', count: 'Soni', countPlaceholder: 'Masalan: 120', pieces: 'dona', note: 'Izoh', notePlaceholder: 'Ixtiyoriy: qayerda turadi, o‘lchami, rangi…', photo: 'Rasm', addPhoto: 'Rasm qo‘shish', changePhoto: 'Almashtirish', removePhoto: 'Rasmni o‘chirish', uploading: 'Yuklanmoqda…', save: 'Saqlash', cancel: 'Bekor qilish', search: 'Qidirish…', status: 'Holat', active: 'Faol', archived: 'Arxiv', archive: 'Arxivlash', restore: 'Tiklash', archiveTitle: 'Arxivlaysizmi?', archiveText: name => `“${name}” faol ro‘yxatdan chiqadi. Keyinroq «Arxiv» bo‘limidan tiklash mumkin.`, empty: 'Hozircha hech narsa yo‘q.', emptySearch: 'Hech narsa topilmadi.', lastCount: (date, name) => name ? `Sanaldi: ${date} · ${name}` : `Sanaldi: ${date}`, shown: count => `${count} ta ko‘rsatilgan`, retry: 'Qayta urinish', readOnly: 'Sizda faqat ko‘rish huquqi bor.', saved: 'Saqlandi.', statusUpdated: 'Holat yangilandi.', nameRequired: 'Nomini kiriting.', nameStartInvalid: 'Nom bosh harf yoki raqam bilan boshlanishi kerak.', countInvalid: '0 dan 1 000 000 gacha butun son kiriting.', duplicate: 'Bu nomdagi faol yozuv allaqachon mavjud.', loadFailed: 'Inventarni yuklab bo‘lmadi.', saveFailed: 'Saqlab bo‘lmadi.', statusFailed: 'Holatni o‘zgartirib bo‘lmadi.', connectionFailed: 'Aloqa uzildi. Qayta urinib ko‘ring — saqlangan yozuv takrorlanmaydi.', migrationMissing: 'Inventardan foydalanish uchun 276-migratsiyani qo‘llang.', photoType: 'JPEG, PNG, WebP, GIF yoki AVIF rasm tanlang.', photoSize: 'Rasm 4 MB dan oshmasligi kerak.', photoFailed: 'Rasmni yuklab bo‘lmadi. Qayta urinib ko‘ring.',
  },
}

// Errors are kept as raw failures and localized on render, so changing language never reloads.
function failureKey(failure, fallback) {
  if (isBazaarIngredientNetworkError(failure)) return 'connectionFailed'
  if (failure?.code === '23505') return 'duplicate'
  if (failure?.code === '42P01' || failure?.code === 'PGRST205') return 'migrationMissing'
  return fallback
}

function readInventoryItem(id, matches) {
  return async () => {
    const { data, error } = await supabase.from('inventory_items').select(INVENTORY_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return matches(data) ? data : null
  }
}

function InventoryPhoto({ src, alt = '' }) {
  const [failedSrc, setFailedSrc] = useState('')
  if (!src || failedSrc === src) {
    return <div className="flex h-full w-full items-center justify-center bg-[#efece9] text-[#a8a39c]"><UtensilsCrossed size={28} /></div>
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} className="h-full w-full object-cover" />
}

export default function Inventory() {
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = COPY[lang] || COPY.en
  const canManage = canEditFeature(profile || state.user, 'inventory')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadFailure, setLoadFailure] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [notice, setNotice] = useState('')
  // The draft open in the add/edit popup; `original` is the same draft as it was when opened.
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const photoInputRef = useRef(null)
  const dialogRef = useRef(null)
  const archiveDialogRef = useRef(null)
  // After an unconfirmed save the row may already point at the new photo, so keep the file.
  const saveOutcomeUnknownRef = useRef(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setLoadFailure(null)
    const { data, error } = await loadSalaryRows(() => supabase.from('inventory_items').select(INVENTORY_COLUMNS))
    if (error) setLoadFailure(error)
    else setItems(sortInventoryItems(data))
    setLoading(false)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  const filtered = useMemo(() => filterInventoryItems(items, { query, status }), [items, query, status])
  const statusCounts = useMemo(() => {
    const active = items.filter(item => item.is_active).length
    return { active, archived: items.length - active }
  }, [items])

  const dialogOpen = !!form
  useEffect(() => { if (dialogOpen) dialogRef.current?.querySelector('input:not([type="file"])')?.focus() }, [dialogOpen])
  const archiveOpen = !!archiveTarget
  useEffect(() => { if (archiveOpen) archiveDialogRef.current?.focus() }, [archiveOpen])

  function openDialog(draft) {
    if (!canManage) return
    setForm(draft)
    setOriginal(draft)
    setFormError('')
    setNotice('')
    saveOutcomeUnknownRef.current = false
  }

  function updateForm(fields) {
    setForm(current => ({ ...current, ...fields }))
  }

  function closeDialog() {
    if (saving || uploading) return
    if (form.image_url !== original.image_url && !saveOutcomeUnknownRef.current) deleteInventoryPhoto(form.image_url)
    setForm(null)
    setFormError('')
  }

  function replacePhoto(url) {
    // Only a photo uploaded in this popup goes now; the saved one stays until the save succeeds.
    if (form.image_url !== original.image_url && !saveOutcomeUnknownRef.current) deleteInventoryPhoto(form.image_url)
    updateForm({ image_url: url })
  }

  async function handlePhoto(event) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setUploading(true)
    setFormError('')
    try {
      replacePhoto(await uploadInventoryPhoto(file, form.id))
    } catch (uploadError) {
      setFormError(uploadError.code || 'photoFailed')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function saveItem(event) {
    event.preventDefault()
    if (!canManage || saving || uploading) return
    const problem = inventoryDraftError(form)
    if (problem) { setFormError(problem); return }
    const payload = inventoryPayload(form)
    setSaving(true)
    setFormError('')
    try {
      const { data, error } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.from('inventory_items').upsert(payload, { onConflict: 'id' }).select(INVENTORY_COLUMNS).abortSignal(signal).single(),
          'SAVE_INVENTORY_ITEM',
        ),
        reconcile: readInventoryItem(payload.id, row => inventoryItemMatches(row, payload)),
      })
      if (error) throw error
      setItems(current => upsertInventoryItem(current, data))
      if (original.image_url && original.image_url !== data.image_url) deleteInventoryPhoto(original.image_url)
      setForm(null)
      setNotice('saved')
    } catch (saveError) {
      saveOutcomeUnknownRef.current = isBazaarIngredientNetworkError(saveError)
      setFormError(failureKey(saveError, 'saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function setItemActive(item, isActive) {
    if (!canManage || updatingId) return
    setUpdatingId(item.id)
    setStatusError('')
    setNotice('')
    try {
      const { data, error } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.from('inventory_items').update({ is_active: isActive }).eq('id', item.id).select(INVENTORY_COLUMNS).abortSignal(signal).single(),
          'SET_INVENTORY_ITEM_ACTIVE',
        ),
        reconcile: readInventoryItem(item.id, row => row?.is_active === isActive),
      })
      if (error) throw error
      setItems(current => upsertInventoryItem(current, data))
      setArchiveTarget(null)
      setNotice('statusUpdated')
    } catch (updateError) {
      setStatusError(failureKey(updateError, 'statusFailed'))
    } finally {
      setUpdatingId('')
    }
  }

  function closeArchiveDialog() {
    if (updatingId) return
    setArchiveTarget(null)
    setStatusError('')
  }

  const formDirty = !!form && (form.isNew || inventoryDraftChanged(form, original))
  const busy = saving || uploading

  return (
    <AppShell
      title={l.title}
      headerActions={canManage ? (
        <button type="button" onClick={() => openDialog(emptyInventoryDraft(crypto.randomUUID()))} aria-label={l.add} className="ws-btn ws-btn-primary !h-[38px]">
          <Plus size={16} /><span className="hidden sm:inline">{l.add}</span>
        </button>
      ) : null}
    >
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          {statusError && !archiveOpen && <div role="alert" className="ws-notice ws-tone-negative">{l[statusError]}</div>}
          {notice && <div role="status" className="ws-notice ws-tone-positive">{l[notice]}</div>}
          {!canManage && <div className="ws-notice ws-tone-caution">{l.readOnly}</div>}

          <section className="ws-panel ws-panel-flush">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#e4e1de] p-5 max-sm:p-4">
              <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} aria-label={l.search} className="ws-input !pl-9" />
              </div>
              {!loading && <span className="ws-caption tabular-nums">{l.shown(filtered.length)}</span>}
              <div className="ws-segmented sm:ml-auto" role="group" aria-label={l.status}>
                {['active', 'archived'].map(key => (
                  <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>
                    {l[key]}{!loading && <span className="ml-1.5 tabular-nums text-[#68655f]">{statusCounts[key]}</span>}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <OperationalLoading title={l.title} layout="inventoryCards" />
            ) : loadFailure ? (
              <OperationalError title={l.loadFailed} description={l[failureKey(loadFailure, 'loadFailed')]} actionLabel={l.retry} onAction={loadItems} />
            ) : filtered.length === 0 ? (
              <p className="ws-muted p-8 text-center">{query.trim() ? l.emptySearch : l.empty}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map(item => (
                  <div
                    key={item.id}
                    {...(canManage ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${l.edit}: ${item.name}`,
                      onClick: () => openDialog(inventoryDraftFrom(item)),
                      onKeyDown: event => {
                        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
                        event.preventDefault()
                        openDialog(inventoryDraftFrom(item))
                      },
                    } : {})}
                    className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#e4e1de] bg-white transition-shadow hover:shadow-[0_4px_14px_rgb(34_32_29/8%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a00]/40 ${canManage ? 'cursor-pointer' : ''}`}
                  >
                    <div className="aspect-[4/3] w-full"><InventoryPhoto src={item.image_url} alt={item.name} /></div>
                    {canManage && (
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={event => {
                          event.stopPropagation()
                          setNotice('')
                          setStatusError('')
                          if (item.is_active) setArchiveTarget(item)
                          else setItemActive(item, true)
                        }}
                        aria-label={`${item.is_active ? l.archive : l.restore}: ${item.name}`}
                        title={item.is_active ? l.archive : l.restore}
                        className="ws-btn ws-btn-outline ws-btn-sm ws-btn-icon absolute right-2 top-2 !bg-white"
                      >
                        {updatingId === item.id ? <Loader2 size={15} className="animate-spin" /> : item.is_active ? <Archive size={15} /> : <RotateCcw size={15} />}
                      </button>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col p-3">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#22201d]">{item.name}</p>
                      <p className="mt-1.5 text-[20px] font-semibold leading-tight tabular-nums text-[#22201d]">{formatMoneyInput(item.quantity)} <span className="text-sm font-normal text-[#68655f]">{l.pieces}</span></p>
                      {item.note && <p className="ws-caption mt-1.5 line-clamp-2 whitespace-pre-line">{item.note}</p>}
                      <p className="ws-caption mt-auto pt-2">{l.lastCount(formatLongDate(item.counted_at, lang), item.counted_by_name)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {canManage && form && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button type="button" aria-label={l.cancel} onClick={closeDialog} disabled={busy} className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm disabled:cursor-wait" />
          <form
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-item-title"
            aria-busy={busy}
            onSubmit={saveItem}
            onKeyDown={event => { if (event.key === 'Escape') closeDialog() }}
            className="ws-dialog relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="inventory-item-title" className="ws-display !text-[24px]">{form.isNew ? l.add : l.edit}</h2>
                <p className="ws-muted mt-1.5">{l.sub}</p>
              </div>
              <button type="button" onClick={closeDialog} disabled={busy} aria-label={l.cancel} className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"><X size={16} /></button>
            </div>
            <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div>
                <span className="ws-caption mb-1.5 block font-medium">{l.photo}</span>
                <div className="aspect-[4/3] w-full max-w-[220px] overflow-hidden rounded-[10px] border border-[#e4e1de]"><InventoryPhoto src={form.image_url} /></div>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} aria-label={l.photo} />
                <div className="mt-2 flex items-center gap-1.5">
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploading} className="ws-btn ws-btn-outline ws-btn-sm min-w-0 flex-1">
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                    <span className="truncate">{uploading ? l.uploading : form.image_url ? l.changePhoto : l.addPhoto}</span>
                  </button>
                  {form.image_url && !uploading && (
                    <button type="button" onClick={() => replacePhoto('')} aria-label={l.removePhoto} title={l.removePhoto} className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm ws-btn-icon flex-shrink-0"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
              <div className="grid content-start gap-3">
                <label className="block">
                  <span className="ws-caption mb-1.5 block font-medium">{l.name}</span>
                  <input value={form.name} onChange={event => updateForm({ name: capitalizeBazaarNameInput(event.target.value) })} maxLength={INVENTORY_NAME_MAX_LENGTH} autoCapitalize="sentences" placeholder={l.namePlaceholder} className="ws-input" />
                </label>
                <label className="block">
                  <span className="ws-caption mb-1.5 block font-medium">{l.count}</span>
                  <input value={form.quantity} onChange={event => updateForm({ quantity: normalizeInventoryCountInput(event.target.value) })} inputMode="numeric" pattern="[0-9]*" placeholder={l.countPlaceholder} className="ws-input tabular-nums" />
                </label>
              </div>
              <label className="block sm:col-span-2">
                <span className="ws-caption mb-1.5 block font-medium">{l.note}</span>
                <textarea value={form.note} onChange={event => updateForm({ note: event.target.value })} maxLength={INVENTORY_NOTE_MAX_LENGTH} rows={2} placeholder={l.notePlaceholder} className="ws-input !h-auto min-h-[64px] resize-y py-2.5" />
              </label>
            </fieldset>
            {formError && <p role="alert" className="ws-notice ws-tone-negative mt-4">{l[formError]}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeDialog} disabled={busy} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="submit" disabled={busy || !formDirty} className="ws-btn ws-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{l.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {canManage && archiveTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button type="button" aria-label={l.cancel} onClick={closeArchiveDialog} disabled={!!updatingId} className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm disabled:cursor-wait" />
          <div
            ref={archiveDialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="inventory-archive-title"
            aria-describedby="inventory-archive-description"
            aria-busy={!!updatingId}
            onKeyDown={event => { if (event.key === 'Escape') closeArchiveDialog() }}
            className="ws-dialog relative w-full max-w-md p-6 focus:outline-none"
          >
            <h2 id="inventory-archive-title" className="ws-display !text-[24px]">{l.archiveTitle}</h2>
            <p id="inventory-archive-description" className="ws-muted mt-2">{l.archiveText(archiveTarget.name)}</p>
            {statusError && <p role="alert" className="ws-notice ws-tone-negative mt-4">{l[statusError]}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeArchiveDialog} disabled={!!updatingId} className="ws-btn ws-btn-outline">{l.cancel}</button>
              <button type="button" onClick={() => setItemActive(archiveTarget, false)} disabled={!!updatingId} className="ws-btn ws-btn-danger-solid disabled:cursor-not-allowed disabled:opacity-50">
                {updatingId ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}{statusError ? l.retry : l.archive}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

import { escapeTelegramHtml } from './telegram.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'

function firstText(...values) {
  return values
    .map(value => String(value || '').trim())
    .find(Boolean) || ''
}

export function getRussianMenuItemName(item) {
  return firstText(
    item?.menu_item_name,
    item?.name_ru,
    item?.name_uz,
    item?.name_en,
    item?.id,
    'Без названия'
  )
}

export function getRussianMenuCategoryName(item) {
  return firstText(
    item?.category_name,
    item?.category_name_ru,
    item?.category?.name_ru,
    item?.category_name_uz,
    item?.category?.name_uz,
    item?.category_name_en,
    item?.category?.name_en,
    'Без категории'
  )
}

export function buildMenuUnavailableTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    `🚫 <b>Стало недоступно:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildMenuAvailableTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    `✅ <b>Снова доступно:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

function describeVariantVisibilityChange(change) {
  const parts = []
  for (const [field, menuName] of [['waiter_hidden', 'меню официантов'], ['public_hidden', 'публичное меню']]) {
    const hidden = change?.[field] === true
    if (hidden === (change?.[`was_${field}`] === true)) continue
    parts.push(hidden ? `🚫 скрыт: ${menuName}` : `✅ показан: ${menuName}`)
  }
  return parts.join(', ')
}

export function buildMenuVariantVisibilityTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')
  const changes = (Array.isArray(event?.variant_changes) ? event.variant_changes : [])
    .map(change => ({ name: firstText(change?.name, change?.id, 'Вариант'), summary: describeVariantVisibilityChange(change) }))
    .filter(change => change.summary)

  return [
    `👁 <b>Изменена видимость вариантов:</b> ${escapeTelegramHtml(itemName)}`,
    ...changes.map(change => `• ${escapeTelegramHtml(change.name)} — ${change.summary}`),
    `👤 ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildMenuCreatedTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '🆕 <b>Добавлено новое блюдо</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Добавил(а):</b> ${escapeTelegramHtml(actorName)}`,
  ].join('\n')
}

export function buildMenuArchivedTeamMessage(event) {
  const itemName = getRussianMenuItemName(event)
  const actorName = firstText(event?.actor_name, 'Неизвестный сотрудник')

  return [
    '🗄 <b>Блюдо перемещено в архив</b>',
    `🍽 <b>Блюдо:</b> ${escapeTelegramHtml(itemName)}`,
    `👤 <b>Архивировал(а):</b> ${escapeTelegramHtml(actorName)}`,
    'ℹ️ Блюдо не удалено: его можно восстановить в разделе «Архив» меню.',
  ].join('\n')
}

export function groupUnavailableMenuItems(items) {
  const categoryGroups = []
  const groupsByKey = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const categoryName = getRussianMenuCategoryName(item)
    const categoryKey = firstText(item?.category_id, categoryName)
    let group = groupsByKey.get(categoryKey)
    if (!group) {
      group = { categoryName, items: [] }
      groupsByKey.set(categoryKey, group)
      categoryGroups.push(group)
    }
    group.items.push(item)
  }
  return categoryGroups
}

// snapshotTime is the Tashkent HH:MM the list was read (04:05 with the daily reports).
export function buildDailyUnavailableMenuTeamMessage(items, businessDate, snapshotTime = '08:00') {
  const unavailableItems = Array.isArray(items) ? items : []
  const dateLabel = formatLongDate(businessDate, 'ru', businessDate || '—')
  const header = [
    '🚫 <b>Недоступные блюда</b>',
    `📅 <b>На ${escapeTelegramHtml(dateLabel)}, ${escapeTelegramHtml(snapshotTime)}</b>`,
  ]

  if (unavailableItems.length === 0) {
    return [...header, '✅ Все блюда доступны.'].join('\n')
  }

  const categoryGroups = groupUnavailableMenuItems(unavailableItems)
  const groupedLines = []
  let itemNumber = 0
  for (const group of categoryGroups) {
    if (groupedLines.length > 0) groupedLines.push('')
    groupedLines.push(`📂 <b>${escapeTelegramHtml(group.categoryName)}</b>`)
    for (const item of group.items) {
      itemNumber += 1
      groupedLines.push(`${itemNumber}. ${escapeTelegramHtml(getRussianMenuItemName(item))}`)
    }
  }
  return [
    ...header,
    '',
    ...groupedLines,
    '',
    `📦 <b>Всего:</b> ${unavailableItems.length}`,
  ].join('\n')
}

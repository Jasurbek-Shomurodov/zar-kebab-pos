// Centralised role permission helpers.
// All sidebar visibility and route protection should reference these — never hardcode role arrays elsewhere.
import { formatDateOnly } from './dateFormat.js'

export const PAGE_ACCESS = {
  publicMenu: ['guest', 'owner', 'admin', 'viewer'],
}

export const APP_ROLES = ['owner', 'admin', 'viewer', 'guest']
export const EDITOR_ROLES = ['owner', 'admin']

export const FEATURE_DEFINITIONS = [
  {
    key: 'dashboard',
    kind: 'page',
    labels: { uz: 'Boshqaruv paneli', ru: 'Панель управления', en: 'Dashboard' },
    description: { uz: 'Savdo va bugungi holat', ru: 'Продажи и текущая ситуация', en: 'Sales overview and live status' },
  },
  {
    key: 'tables',
    kind: 'page',
    labels: { uz: 'Stollar va buyurtmalar', ru: 'Столы и заказы', en: 'Tables and orders' },
    description: { uz: 'Ofitsiant stol va buyurtma oqimi', ru: 'Столы официанта и отправка заказов', en: 'Waiter table and order flow' },
  },
  {
    key: 'menu',
    kind: 'action',
    labels: { uz: 'Menyuni boshqarish', ru: 'Управление меню', en: 'Manage menu' },
    description: { uz: 'Tahrirlashga ruxsat; belgilanmasa faqat ko‘rish', ru: 'Разрешить редактирование; без отметки только просмотр', en: 'Allow editing; unchecked users remain read-only' },
  },
  {
    key: 'off_premise_orders',
    kind: 'action',
    requires: ['tables'],
    labels: { uz: 'Olib ketish va yetkazib berish', ru: 'Заказы навынос и доставка', en: 'Take Away & Delivery orders' },
    description: { uz: 'Olib ketish va yetkazib berish buyurtmalarini yaratish', ru: 'Создание заказов навынос и на доставку', en: 'Create Take Away and Delivery orders' },
  },
  {
    key: 'cashier',
    kind: 'page',
    labels: { uz: 'Kassir', ru: 'Кассир', en: 'Cashier' },
    description: { uz: 'Hisob yopish va cheklar', ru: 'Закрытие счетов и чеки', en: 'Billing, payments, and receipts' },
  },
  {
    key: 'loyalty',
    kind: 'page',
    labels: { uz: 'Sodiqlik kartalari', ru: 'Карты лояльности', en: 'Loyalty cards' },
    description: { uz: 'Mijoz kartalari va bonuslar', ru: 'Карты клиентов и бонусы', en: 'Customer cards and rewards' },
  },
  {
    key: 'expenses',
    kind: 'page',
    labels: { uz: 'Buxgalteriya', ru: 'Бухгалтерия', en: 'Accounting' },
    description: { uz: 'Daromad, xarajat va maoshlar', ru: 'Доходы, расходы и зарплаты', en: 'Income, expenses, and salaries' },
  },
  {
    // Reads Accounting's protected totals, so it always comes with Accounting.
    key: 'financial_analysis',
    kind: 'page',
    requires: ['expenses'],
    labels: { uz: 'Moliyaviy tahlil', ru: 'Финансовый анализ', en: 'Financial analysis' },
    description: { uz: 'O‘sish, pul oqimi va oylik taxmin (Buxgalteriya bilan)', ru: 'Рост, денежный поток и прогноз на месяц (вместе с бухгалтерией)', en: 'Growth, money flow, and monthly estimate (with Accounting)' },
  },
  {
    key: 'bazaar',
    kind: 'page',
    labels: { uz: 'Kunlik bozor', ru: 'Ежедневный базар', en: 'Daily Bazaar' },
    description: { uz: 'Kunlik bozor xaridlari va tahlil', ru: 'Ежедневные закупки и аналитика базара', en: 'Daily bazaar purchases and analytics' },
  },
  {
    key: 'ingredients',
    kind: 'page',
    labels: { uz: 'Masalliqlar', ru: 'Ингредиенты', en: 'Ingredients' },
    description: { uz: 'Masalliqlar, xaridlar va retsept bo‘yicha sarf', ru: 'Ингредиенты, закупки и расход по рецептам', en: 'Ingredient catalog, purchases, and recipe usage' },
  },
  {
    key: 'tech_cards',
    kind: 'page',
    labels: { uz: 'Texnologik kartalar', ru: 'Техкарты', en: 'Tech Cards' },
    description: { uz: 'Retseptlar, masalliqlar va porsiya tannarxi', ru: 'Рецептуры, ингредиенты и себестоимость порций', en: 'Recipes, ingredients, and portion costs' },
  },
  {
    key: 'team',
    kind: 'page',
    labels: { uz: 'Jamoa', ru: 'Команда', en: 'Team' },
    description: { uz: 'Xodimlar roli va kirish huquqlari', ru: 'Роли сотрудников и доступы', en: 'Employee roles and feature access' },
  },
  {
    key: 'reports',
    kind: 'page',
    labels: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' },
    description: { uz: 'Savdo va operatsion hisobotlar', ru: 'Продажи и операционные отчёты', en: 'Sales and operational reports' },
  },
  {
    // Read-only AI chat; it only offers data the holder's other features allow.
    key: 'assistant',
    kind: 'page',
    labels: { uz: 'AI yordamchi', ru: 'ИИ-ассистент', en: 'AI Assistant' },
    description: { uz: 'Savdo va xarajatlar haqida savollar, Excel fayllar', ru: 'Вопросы о продажах и расходах, файлы Excel', en: 'Questions about sales and expenses, Excel files' },
  },
  {
    key: 'audit',
    kind: 'page',
    labels: { uz: 'Audit', ru: 'Аудит', en: 'Audit' },
    description: { uz: 'Rol, to‘lov va o‘zgarish tarixi', ru: 'История ролей, оплат и изменений', en: 'Role, payment, and change history' },
  },
  {
    key: 'settings',
    kind: 'page',
    labels: { uz: 'Sozlamalar', ru: 'Настройки', en: 'Settings' },
    description: { uz: 'Restoran sozlamalari va stollar', ru: 'Настройки ресторана и столы', en: 'Restaurant settings and table management' },
  },
  {
    key: 'delete_paid_orders',
    kind: 'action',
    requiresAny: ['dashboard', 'cashier', 'reports'],
    labels: { uz: 'Yakunlangan buyurtmalarni o‘chirish', ru: 'Удаление завершённых заказов', en: 'Delete completed orders' },
    description: { uz: 'To‘langan yoki test buyurtmalarni olib tashlash', ru: 'Удаление оплаченных или тестовых заказов', en: 'Remove paid or test orders' },
  },
]

export const FEATURE_KEYS = FEATURE_DEFINITIONS.map(feature => feature.key)
export const FEATURE_ACCESS_MANAGER_EMAILS = ['dangerhoggish@gmail.com']

export function normalizeRole(role) {
  const normalized = String(role || 'guest').toLowerCase()
  if (normalized === 'stakeholder') return 'viewer'
  if (normalized === 'waiter' || normalized === 'cashier' || normalized === 'kitchen') return 'admin'
  return APP_ROLES.includes(normalized) ? normalized : 'guest'
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isFeatureAccessManager(profileOrRole) {
  if (typeof profileOrRole === 'string' || !profileOrRole) return false
  return normalizeRole(profileOrRole.role) === 'owner' && FEATURE_ACCESS_MANAGER_EMAILS.includes(normalizeEmail(profileOrRole.email))
}

export function normalizeFeatureAccess(featureAccess) {
  if (!Array.isArray(featureAccess)) return null
  return [...new Set(featureAccess.map(key => String(key || '').trim()).filter(key => FEATURE_KEYS.includes(key)))]
}

export function updateFeatureAccessSelection(featureAccess, featureKey, enabled) {
  const current = normalizeFeatureAccess(featureAccess) || []
  const definition = FEATURE_DEFINITIONS.find(feature => feature.key === featureKey)
  if (!definition) return current

  const next = new Set(current)
  if (enabled) {
    next.add(featureKey)
    for (const requiredKey of definition.requires || []) next.add(requiredKey)
    if (definition.requiresAny?.length && !definition.requiresAny.some(key => next.has(key))) {
      next.add(definition.requiresAny[0])
    }
  } else {
    next.delete(featureKey)
  }

  // Drop anything whose prerequisite was just removed (actions and dependent pages).
  for (const feature of FEATURE_DEFINITIONS) {
    if (!next.has(feature.key) || (feature.kind !== 'action' && !feature.requires?.length)) continue
    const hasRequired = (feature.requires || []).every(key => next.has(key))
    const hasRequiredAny = !feature.requiresAny?.length || feature.requiresAny.some(key => next.has(key))
    if (!hasRequired || !hasRequiredAny) next.delete(feature.key)
  }

  return FEATURE_KEYS.filter(key => next.has(key))
}

export function defaultFeaturesForRole(role) {
  const rawRole = String(role || 'guest').toLowerCase()
  if (rawRole === 'waiter') return ['tables', 'team']
  if (rawRole === 'cashier') return ['dashboard', 'tables', 'cashier', 'loyalty', 'team', 'reports']
  if (rawRole === 'stakeholder') return ['dashboard', 'team', 'reports']
  if (rawRole === 'kitchen') return ['tables']
  return normalizeRole(role) === 'owner' ? FEATURE_KEYS : []
}

export function featureAccessForProfile(profileOrRole) {
  if (typeof profileOrRole === 'string' || !profileOrRole) return defaultFeaturesForRole(profileOrRole)
  if (isFeatureAccessManager(profileOrRole)) return FEATURE_KEYS
  const explicitAccess = normalizeFeatureAccess(profileOrRole.feature_access)
  return explicitAccess || defaultFeaturesForRole(profileOrRole.role)
}

export function canViewPage(profileOrRole, page) {
  const role = normalizeRole(profileOrRole?.role || profileOrRole)
  if (page === 'publicMenu') return (PAGE_ACCESS.publicMenu || []).includes(role)
  if (page === 'menu') return EDITOR_ROLES.includes(role) || role === 'viewer'
  const access = featureAccessForProfile(profileOrRole)
  const definition = FEATURE_DEFINITIONS.find(feature => feature.key === page)
  return access.includes(page) && (definition?.requires || []).every(key => access.includes(key))
}

export function canManageFeatureAccess(profileOrRole) {
  return normalizeRole(profileOrRole?.role || profileOrRole) === 'owner'
}

export function canDeletePaidOrders(profileOrRole) {
  return canEditFeature(profileOrRole, 'delete_paid_orders')
}

// Match the database's Tashkent business-date boundary (202, 232): today's orders,
// plus older unpaid open bills for owners. Paid history stays locked for everyone.
export function canDeleteOrderToday(profileOrRole, order, now = new Date()) {
  const date = formatDateOnly(order?.paid_at ?? order?.created_at)
  if (!order?.id || !date) return false
  if (date === formatDateOnly(now) && canDeletePaidOrders(profileOrRole)) return true
  return date < formatDateOnly(now)
    && canDeletePaidOrders(profileOrRole)
    && !order.paid_at
    && !['paid', 'cancelled'].includes(order.payment_status)
    && !['paid', 'completed', 'cancelled'].includes(order.status)
    && normalizeRole(profileOrRole?.role || profileOrRole) === 'owner'
}

export function canChangeCompletedOrderPaymentMethod(profileOrRole) {
  return canDeletePaidOrders(profileOrRole)
}

export function canChangeMenuItemAvailability(profileOrRole) {
  return canEditMenu(profileOrRole)
}

export function canChangeMenuItemPublicVisibility(profileOrRole) {
  return normalizeRole(profileOrRole?.role || profileOrRole) === 'owner'
    && canEditMenu(profileOrRole)
}

export function canDeleteMenuCatalog(profileOrRole) {
  return canEditMenu(profileOrRole)
}

export function canMoveBackToTable(profileOrRole) {
  return canEditFeature(profileOrRole, 'cashier')
}

export function canUseOffPremiseOrders(profileOrRole) {
  return canEditFeature(profileOrRole, 'tables')
    && canEditFeature(profileOrRole, 'off_premise_orders')
}

export function canEditFeature(profileOrRole, featureKey) {
  return EDITOR_ROLES.includes(normalizeRole(profileOrRole?.role || profileOrRole))
    && featureAccessForProfile(profileOrRole).includes(featureKey)
}

export function canEditMenu(profileOrRole) {
  return canEditFeature(profileOrRole, 'menu')
}
export function canManageSettings(profileOrRole) { return canEditFeature(profileOrRole, 'settings') }
export function canUseCashierActions(profileOrRole) { return canEditFeature(profileOrRole, 'cashier') }
export function isReadOnlyUser(role)             { return normalizeRole(role) === 'viewer' }
export function isPublicOnlyRole(role) {
  return ['guest', 'customer'].includes((role || 'guest').toLowerCase())
}

/**
 * Returns whether `viewerRole` can change the role/status of a user who currently has `targetRole`.
 * - owner   → can edit anyone except themselves (handled separately)
 * - admin   → can edit staff below admin only
 * - others  → view-only, no edits
 */
export function canEditTeamMember(viewerRole, targetRole) {
  const viewer = normalizeRole(viewerRole)
  const target = normalizeRole(targetRole)
  if (viewer === 'owner') return true
  if (viewer === 'admin') return ['viewer', 'guest'].includes(target)
  return false
}

/**
 * Returns whether `viewerRole` can permanently remove a profile row.
 * Historical orders keep denormalized names such as waiter_name, so profile deletion
 * must not cascade into order/report records.
 */
export function canDeleteTeamMember(viewerRole, targetRole, isSelf = false) {
  const viewer = normalizeRole(viewerRole?.role || viewerRole)
  const target = normalizeRole(targetRole?.role || targetRole)
  if (isSelf) return false
  if (viewer !== 'owner') return false
  return target !== 'owner'
}

/** Roles the viewer is allowed to assign. Owner can assign any role; admin cannot assign owner. */
export function assignableRoles(viewerRole) {
  const role = normalizeRole(viewerRole)
  if (role === 'owner') return APP_ROLES
  if (role === 'admin') return ['viewer', 'guest']
  return []
}

export function defaultPath(role) {
  const profile = typeof role === 'object' && role ? role : { role }
  const rawRole = String(profile.role || 'guest').toLowerCase()
  role = normalizeRole(profile.role)
  if (rawRole === 'cashier' && canViewPage(profile, 'cashier')) return '/cashier/tables'
  if ((rawRole === 'waiter' || rawRole === 'kitchen') && canViewPage(profile, 'tables')) return '/waiter/tables'
  if (canViewPage(profile, 'dashboard')) return '/admin'
  if (canViewPage(profile, 'cashier')) return '/cashier/tables'
  if (canViewPage(profile, 'tables')) return '/waiter/tables'
  if (canViewPage(profile, 'loyalty')) return '/admin/loyalty'
  if (canViewPage(profile, 'expenses')) return '/admin/accounting/salaries'
  if (canViewPage(profile, 'bazaar')) return '/admin/bazaar'
  if (canViewPage(profile, 'ingredients')) return '/admin/ingredients'
  if (canViewPage(profile, 'tech_cards')) return '/admin/tech-cards'
  if (canViewPage(profile, 'team')) return '/admin/users'
  if (canViewPage(profile, 'reports')) return '/admin/reports'
  if (canViewPage(profile, 'assistant')) return '/admin/assistant'
  if (canViewPage(profile, 'audit')) return '/admin/audit'
  if (canViewPage(profile, 'settings')) return '/admin/settings'
  if (canViewPage(profile, 'menu')) return '/admin/menu'
  return '/menu'
}

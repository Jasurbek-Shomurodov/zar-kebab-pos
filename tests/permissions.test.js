import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FEATURE_DEFINITIONS,
  FEATURE_KEYS,
  assignableRoles,
  canChangeCompletedOrderPaymentMethod,
  canDeleteTeamMember,
  canDeleteMenuCatalog,
  canChangeMenuItemAvailability,
  canChangeMenuItemPublicVisibility,
  canEditFeature,
  canEditMenu,
  canEditTeamMember,
  canManageFeatureAccess,
  canMoveBackToTable,
  canUseOffPremiseOrders,
  canViewPage,
  defaultFeaturesForRole,
  defaultPath,
  featureAccessForProfile,
  updateFeatureAccessSelection,
} from '../src/lib/permissions.js'

test('role defaults still cover existing app features', () => {
  assert.deepEqual(defaultFeaturesForRole('owner'), FEATURE_KEYS)
  assert.deepEqual(defaultFeaturesForRole('admin'), [])
  assert.deepEqual(defaultFeaturesForRole('viewer'), [])
  assert.ok(defaultFeaturesForRole('waiter').includes('tables'))
  assert.ok(defaultFeaturesForRole('cashier').includes('cashier'))
  assert.ok(defaultFeaturesForRole('stakeholder').includes('reports'))
  assert.deepEqual(defaultFeaturesForRole('guest'), [])
})

test('feature access controls visibility while role controls write access', () => {
  const adminWithAccounting = { role: 'admin', feature_access: ['dashboard', 'expenses'] }
  const viewerWithAccounting = { role: 'viewer', feature_access: ['dashboard', 'expenses'] }

  assert.equal(canViewPage(adminWithAccounting, 'expenses'), true)
  assert.equal(canEditFeature(adminWithAccounting, 'expenses'), true)
  assert.equal(canViewPage(adminWithAccounting, 'menu'), true)
  assert.equal(canEditMenu(adminWithAccounting), false)
  assert.deepEqual(featureAccessForProfile(adminWithAccounting), ['dashboard', 'expenses'])
  assert.equal(canViewPage(viewerWithAccounting, 'expenses'), true)
  assert.equal(canEditFeature(viewerWithAccounting, 'expenses'), false)
})

test('daily bazaar access is independent from salaries and full accounting', () => {
  const bazaarEditor = { role: 'admin', feature_access: ['bazaar'] }
  const bazaarViewer = { role: 'viewer', feature_access: ['bazaar'] }

  assert.equal(canViewPage(bazaarEditor, 'bazaar'), true)
  assert.equal(canEditFeature(bazaarEditor, 'bazaar'), true)
  assert.equal(canViewPage(bazaarEditor, 'expenses'), false)
  assert.equal(canEditFeature(bazaarViewer, 'bazaar'), false)
  assert.equal(defaultPath(bazaarEditor), '/admin/bazaar')
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'bazaar')?.kind, 'page')
})

test('Tech Cards page access is separate while Manage Menu controls recipe editing', () => {
  const techCardViewer = { role: 'viewer', feature_access: ['tech_cards'] }
  const techCardEditor = { role: 'admin', feature_access: ['tech_cards', 'menu'] }
  const menuOnlyAdmin = { role: 'admin', feature_access: ['menu'] }

  assert.equal(canViewPage(techCardViewer, 'tech_cards'), true)
  assert.equal(canEditMenu(techCardViewer), false)
  assert.equal(canViewPage(techCardEditor, 'tech_cards'), true)
  assert.equal(canEditMenu(techCardEditor), true)
  assert.equal(canViewPage(menuOnlyAdmin, 'tech_cards'), false)
  assert.equal(defaultPath(techCardViewer), '/admin/tech-cards')
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'tech_cards')?.kind, 'page')
  assert.deepEqual(updateFeatureAccessSelection([], 'tech_cards', true), ['tech_cards'])
})

test('menu is always viewable by staff while Manage menu controls editing', () => {
  const viewerWithMenu = { role: 'viewer', feature_access: ['menu'] }
  const viewerWithoutMenu = { role: 'viewer', feature_access: [] }
  const adminWithMenu = { role: 'admin', feature_access: ['menu'] }
  const adminWithoutMenu = { role: 'admin', feature_access: [] }
  const guestWithMenu = { role: 'guest', feature_access: ['menu'] }

  assert.equal(canViewPage(viewerWithMenu, 'menu'), true)
  assert.equal(canViewPage(viewerWithoutMenu, 'menu'), true)
  assert.equal(canEditMenu(viewerWithMenu), false)
  assert.equal(canViewPage(adminWithoutMenu, 'menu'), true)
  assert.equal(canEditMenu(adminWithoutMenu), false)
  assert.equal(canEditMenu(adminWithMenu), true)
  assert.equal(canViewPage(guestWithMenu, 'menu'), false)
  assert.equal(defaultPath(viewerWithoutMenu), '/admin/menu')
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'menu')?.kind, 'action')
  assert.equal(FEATURE_KEYS.includes('edit_menu_items'), false)
})

test('anyone with Manage Menu access can change meal availability', () => {
  assert.equal(canChangeMenuItemAvailability('owner'), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'owner', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'owner', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemAvailability({ role: 'admin', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemAvailability({ role: 'admin', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemAvailability({ role: 'viewer', feature_access: ['menu'] }), false)
})

test('only owners with menu write access can hide meals from the public menu', () => {
  assert.equal(canChangeMenuItemPublicVisibility('owner'), true)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'owner', feature_access: ['menu'] }), true)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'owner', feature_access: ['dashboard'] }), false)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'admin', feature_access: ['menu'] }), false)
  assert.equal(canChangeMenuItemPublicVisibility({ role: 'viewer', feature_access: ['menu'] }), false)
})

test('staff with menu write access can archive menu products or categories', () => {
  const menuAdmin = { role: 'admin', feature_access: ['menu'] }

  assert.equal(canDeleteMenuCatalog('owner'), true)
  assert.equal(canDeleteMenuCatalog({ role: 'owner', feature_access: ['menu'] }), true)
  assert.equal(canDeleteMenuCatalog({ role: 'owner', feature_access: ['dashboard'] }), false)
  assert.equal(canEditMenu(menuAdmin), true)
  assert.equal(canDeleteMenuCatalog(menuAdmin), true)
  assert.equal(canDeleteMenuCatalog({ role: 'admin', feature_access: ['dashboard'] }), false)
  assert.equal(canDeleteMenuCatalog({ role: 'viewer', feature_access: ['menu'] }), false)
})

test('feature selection keeps sensitive actions attached to relevant pages', () => {
  assert.deepEqual(
    updateFeatureAccessSelection([], 'delete_paid_orders', true),
    ['dashboard', 'delete_paid_orders']
  )
})

test('delete paid orders access also permits completed-order payment corrections', () => {
  const paidOrderEditor = { role: 'admin', feature_access: ['reports', 'delete_paid_orders'] }

  assert.equal(canChangeCompletedOrderPaymentMethod(paidOrderEditor), true)
  assert.equal(canChangeCompletedOrderPaymentMethod({ role: 'admin', feature_access: ['reports'] }), false)
  assert.equal(canChangeCompletedOrderPaymentMethod({ role: 'viewer', feature_access: ['reports', 'delete_paid_orders'] }), false)
  assert.equal(canChangeCompletedOrderPaymentMethod('owner'), true)
})

test('take away and delivery orders require their explicit action plus Tables write access', () => {
  const offPremiseEditor = { role: 'admin', feature_access: ['tables', 'off_premise_orders'] }

  assert.equal(canUseOffPremiseOrders(offPremiseEditor), true)
  assert.equal(canUseOffPremiseOrders({ role: 'admin', feature_access: ['tables'] }), false)
  assert.equal(canUseOffPremiseOrders({ role: 'admin', feature_access: ['off_premise_orders'] }), false)
  assert.equal(canUseOffPremiseOrders({ role: 'viewer', feature_access: ['tables', 'off_premise_orders'] }), false)
  assert.deepEqual(
    updateFeatureAccessSelection([], 'off_premise_orders', true),
    ['tables', 'off_premise_orders']
  )
  assert.equal(FEATURE_DEFINITIONS.find(feature => feature.key === 'off_premise_orders')?.kind, 'action')
})

test('cashier access lets owners and admins move bills back without an extra permission', () => {
  assert.equal(canMoveBackToTable({ role: 'admin', feature_access: ['cashier'] }), true)
  assert.equal(canMoveBackToTable({ role: 'owner', feature_access: ['cashier'] }), true)
  assert.equal(canMoveBackToTable({ role: 'admin', feature_access: ['dashboard'] }), false)
  assert.equal(canMoveBackToTable({ role: 'viewer', feature_access: ['cashier'] }), false)
  assert.equal(FEATURE_KEYS.includes('move_back_to_table'), false)
})

test('non-primary owner feature_access can be restricted', () => {
  const primaryOwner = { role: 'owner', email: 'dangerhoggish@gmail.com', feature_access: ['dashboard'] }
  const otherOwner = { role: 'owner', email: 'ddk9499@gmail.com', feature_access: ['dashboard', 'tables'] }

  assert.deepEqual(featureAccessForProfile(primaryOwner), FEATURE_KEYS)
  assert.deepEqual(featureAccessForProfile(otherOwner), ['dashboard', 'tables'])
  assert.equal(canViewPage(otherOwner, 'menu'), true)
  assert.equal(canEditMenu(otherOwner), false)
})

test('null feature_access keeps role defaults and default path follows enabled features', () => {
  assert.equal(canViewPage({ role: 'admin', feature_access: null }, 'menu'), true)
  assert.equal(defaultPath({ role: 'admin', feature_access: ['expenses'] }), '/admin/accounting/salaries')
  assert.equal(defaultPath({ role: 'viewer', feature_access: ['cashier'] }), '/cashier/tables')
  assert.equal(defaultPath({ role: 'waiter', feature_access: [] }), '/admin/menu')
})

test('owners can manage feature access', () => {
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'dangerhoggish@gmail.com' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'DANGERHOGGISH@GMAIL.COM' }), true)
  assert.equal(canManageFeatureAccess({ role: 'owner', email: 'other-owner@example.com' }), true)
  assert.equal(canManageFeatureAccess({ role: 'admin', email: 'dangerhoggish@gmail.com' }), false)
  assert.equal(canManageFeatureAccess('owner'), true)
})

test('assignable role options match owner and admin profile policy limits', () => {
  assert.deepEqual(assignableRoles('owner'), ['owner', 'admin', 'viewer', 'guest'])
  assert.deepEqual(assignableRoles('admin'), ['viewer', 'guest'])
  assert.deepEqual(assignableRoles('viewer'), [])
})

test('owner can delete non-owner profiles but cannot delete self or owners', () => {
  assert.equal(canDeleteTeamMember('owner', 'admin'), true)
  assert.equal(canDeleteTeamMember('owner', 'viewer'), true)
  assert.equal(canDeleteTeamMember('owner', 'guest'), true)
  assert.equal(canDeleteTeamMember('owner', 'owner'), false)
  assert.equal(canDeleteTeamMember('owner', 'admin', true), false)
  assert.equal(canDeleteTeamMember('admin', 'viewer'), false)
})

test('admin can edit only viewer and guest team members', () => {
  assert.equal(canEditTeamMember('owner', 'admin'), true)
  assert.equal(canEditTeamMember('admin', 'viewer'), true)
  assert.equal(canEditTeamMember('admin', 'guest'), true)
  assert.equal(canEditTeamMember('admin', 'admin'), false)
  assert.equal(canEditTeamMember('admin', 'owner'), false)
  assert.equal(canEditTeamMember('viewer', 'guest'), false)
})

test('Financial analysis is a Team feature that always comes with Accounting', async () => {
  const { canViewPage, updateFeatureAccessSelection, FEATURE_DEFINITIONS } = await import('../src/lib/permissions.js')
  const feature = FEATURE_DEFINITIONS.find(item => item.key === 'financial_analysis')
  assert.equal(feature.kind, 'page')
  assert.deepEqual(feature.requires, ['expenses'])
  // Granting it adds Accounting; removing Accounting removes it.
  assert.deepEqual(updateFeatureAccessSelection(['dashboard'], 'financial_analysis', true), ['dashboard', 'expenses', 'financial_analysis'])
  assert.deepEqual(updateFeatureAccessSelection(['expenses', 'financial_analysis'], 'expenses', false), [])
  assert.deepEqual(updateFeatureAccessSelection(['expenses', 'financial_analysis'], 'financial_analysis', false), ['expenses'])
  // Accounting alone no longer opens the analysis; a stray key without Accounting does not either.
  assert.equal(canViewPage({ role: 'admin', feature_access: ['expenses'] }, 'financial_analysis'), false)
  assert.equal(canViewPage({ role: 'viewer', feature_access: ['financial_analysis'] }, 'financial_analysis'), false)
  assert.equal(canViewPage({ role: 'viewer', feature_access: ['expenses', 'financial_analysis'] }, 'financial_analysis'), true)
  assert.equal(canViewPage({ role: 'owner', feature_access: null }, 'financial_analysis'), true)
})

test('Financial analysis access is enforced in the database and keeps current Accounting holders', async () => {
  const { readFileSync } = await import('node:fs')
  const migration = readFileSync(new URL('../migrations/230_financial_analysis_feature_access.sql', import.meta.url), 'utf8')
  // The newest constraint (251 adds the assistant) must list exactly the app's feature keys.
  const latestConstraint = readFileSync(new URL('../migrations/251_ai_assistant.sql', import.meta.url), 'utf8')
  const { FEATURE_KEYS } = await import('../src/lib/permissions.js')
  const allowed = latestConstraint.match(/feature_access <@ array\[([\s\S]*?)\]::text\[\]/)[1].match(/'([a-z_]+)'/g).map(key => key.slice(1, -1))
  assert.deepEqual([...allowed].sort(), [...FEATURE_KEYS].sort())
  assert.match(latestConstraint, /not \('financial_analysis' = any\(feature_access\)\)\s+or 'expenses' = any\(feature_access\)/)
  assert.match(migration, /not \('financial_analysis' = any\(feature_access\)\)\s+or 'expenses' = any\(feature_access\)/)
  assert.match(migration, /set feature_access = array_append\(feature_access, 'financial_analysis'\)\s+where feature_access is not null\s+and 'expenses' = any\(feature_access\)/)
  assert.match(migration, /current_staff_can_access\('expenses'\) and public\.current_staff_can_access\('financial_analysis'\)/)
})

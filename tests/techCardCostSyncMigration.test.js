import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration = readFileSync(new URL('../migrations/183_batch_tech_card_cost_sync.sql', import.meta.url), 'utf8')

test('cost sync consumes deferred dirty events and stops when costs converge', () => {
  assert.match(migration, /current_setting\('app.tech_card_costs_dirty', true\) = 'on'/)
  assert.match(migration, /set_config\('app.tech_card_costs_dirty', 'off', true\)/)
  assert.match(migration, /get diagnostics changed_count = row_count;\s+--[^\n]*\s+exit when changed_count = 0/)
  assert.match(migration, /is distinct from \(excluded.cost_price, excluded.variant_costs, excluded.cost_source\)/)
  assert.match(migration, /app.tech_card_cost_sync_running/)
  for (const table of ['menu_item_tech_cards', 'menu_item_tech_card_ingredients', 'menu_item_tech_card_components']) {
    assert.ok(migration.includes(`before insert or update or delete on public.${table}`))
  }
})

test('manual variant costs propagate without modifying recipe permissions or history', () => {
  assert.match(migration, /after update of cost_price, variant_costs on public.menu_item_costs/)
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots)/)
  assert.doesNotMatch(migration, /drop policy|disable trigger|grant .*authenticated|create or replace function public.save_menu_item_tech_card/)
  assert.match(migration, /revoke all on function public.mark_tech_card_costs_dirty\(\) from public, anon, authenticated/)
})

const targeted = readFileSync(new URL('../migrations/236_targeted_tech_card_cost_sync.sql', import.meta.url), 'utf8')

test('recipe saves recalculate only the changed dishes and the dishes that include them', () => {
  // Each recipe mutation records its dish; the deferred sync consumes that list once.
  assert.match(targeted, /set_config\('app.tech_card_dirty_items', dirty_items, true\)/)
  assert.match(targeted, /perform set_config\('app.tech_card_dirty_items', '', true\);\s+perform public\.sync_menu_item_tech_card_real_costs_for\(dirty_items\)/)
  // Reverse component closure, so including dishes are recalculated too.
  assert.match(targeted, /with recursive closure\(menu_item_id\)[\s\S]*join closure on closure\.menu_item_id = component\.component_menu_item_id/)
  assert.match(targeted, /where item\.id = any\(affected\)/)
  assert.match(targeted, /card\.menu_item_id = any\(affected\)[\s\S]*Every included menu item must have a real cost/)
  // Same convergence and unchanged-cost suppression as 183.
  assert.match(targeted, /exit when changed_count = 0/)
  assert.match(targeted, /is distinct from \(excluded.cost_price, excluded.variant_costs, excluded.cost_source\)/)
  // Manual cost changes seed only their own dish.
  assert.match(targeted, /case when tg_op = 'DELETE' then old\.menu_item_id else new\.menu_item_id end/)
  // The full sync stays available; nothing else changes.
  assert.doesNotMatch(targeted, /create or replace function public\.sync_menu_item_tech_card_real_costs\(\)/)
  assert.doesNotMatch(targeted, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots)/)
  assert.doesNotMatch(targeted, /drop policy|disable trigger|grant .*authenticated|create or replace function public.save_menu_item_tech_card|drop trigger|create trigger/)
  assert.match(targeted, /revoke all on function public\.sync_menu_item_tech_card_real_costs_for\(text\[\]\) from public, anon, authenticated/)
})

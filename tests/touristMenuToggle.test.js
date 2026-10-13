import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_SETTINGS } from '../src/store/reducerHelpers.js'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Tourist switches default to today\'s behaviour and the public RPC exposes only the flags', async () => {
  assert.equal(DEFAULT_SETTINGS.touristMenuEnabled, true)
  assert.equal(DEFAULT_SETTINGS.publicTouristPrices, false)
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
    await db.exec("CREATE TABLE public.business_settings (id text PRIMARY KEY, monthly_rent_uzs bigint)")
    await db.exec("INSERT INTO public.business_settings VALUES ('default', 5000000)")
    await db.exec(source('migrations/238_tourist_menu_toggle.sql'))
    const flags = async () => (await db.query('SELECT public.public_menu_price_settings() AS value')).rows[0].value
    assert.deepEqual(await flags(), { tourist_menu_enabled: true, public_tourist_prices: false })
    await db.exec("UPDATE public.business_settings SET tourist_menu_enabled = false, public_tourist_prices = true WHERE id = 'default'")
    assert.deepEqual(await flags(), { tourist_menu_enabled: false, public_tourist_prices: true })
    await db.exec('DELETE FROM public.business_settings')
    assert.deepEqual(await flags(), { tourist_menu_enabled: true, public_tourist_prices: false })
  } finally {
    await db.close()
  }
})

test('public Tourist prices need the Tourist menu switched on', async () => {
  const { loadPublicMenuPriceSettings } = await import('../src/lib/db.js')
  const client = data => ({ rpc: async () => ({ data, error: null }) })
  assert.deepEqual(await loadPublicMenuPriceSettings(client({ tourist_menu_enabled: false, public_tourist_prices: true })), { touristMenuEnabled: false, publicTouristPrices: false })
  assert.deepEqual(await loadPublicMenuPriceSettings(client({ tourist_menu_enabled: true, public_tourist_prices: true })), { touristMenuEnabled: true, publicTouristPrices: true })
  assert.deepEqual(await loadPublicMenuPriceSettings({ rpc: async () => ({ data: null, error: new Error('missing') }) }), { touristMenuEnabled: true, publicTouristPrices: false })
})

test('switched-off Tourist menu opens tables as Regular and redirects the premium menu', () => {
  const settingsDb = source('src/lib/db.js')
  assert.match(settingsDb, /touristMenuEnabled: row\.tourist_menu_enabled !== false/)
  assert.match(settingsDb, /tourist_menu_enabled: settings\.touristMenuEnabled !== false/)

  const tables = source('src/pages/WaiterTables.jsx')
  assert.match(tables, /if \(!touristMenuEnabled && !entryContext\.priceModeLocked\) \{\s*\/\/[^\n]*\n\s*openTable\(\{ table, entryContext \}, PRICE_MODE_REGULAR\)/)

  // Saved Tourist orders stay locked to Tourist so the kitchen guard (221) never sees mixed modes.
  assert.match(source('src/components/GuestModeUI.jsx'), /touristMenuEnabled \|\| priceModeLocked \|\| choice\.value !== PRICE_MODE_TOURIST/)
  assert.match(source('src/pages/WaiterOrder.jsx'), /state\.settings\?\.touristMenuEnabled === false\s*\? DEFAULT_PRICE_MODE/)
  const publicMenu = source('src/pages/PublicMenu.jsx')
  assert.match(publicMenu, /Promise\.all\(\[loadPublicMenuData\(\), loadPublicMenuPriceSettings\(\)\]\)/)
  assert.match(publicMenu, /if \(!premium \|\| priceSettings\.touristMenuEnabled\) return\s*navigate\(itemId \? `\/menu\/item\//)
  assert.match(publicMenu, /premium \|\| priceSettings\.publicTouristPrices\s*\? visibleItems\.map\(item => getMenuItemForPriceMode\(item, 'tourist'\)\)/)
})

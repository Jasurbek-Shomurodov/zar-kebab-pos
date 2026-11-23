import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isRestaurantOpen, restaurantMinuteOfDay } from '../src/lib/openingHours.js'

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('open-now badge follows Tashkent time, not the visitor clock', () => {
  // GIVEN instants written in UTC; Tashkent is UTC+5
  // WHEN / THEN
  assert.equal(restaurantMinuteOfDay(Date.parse('2026-11-23T03:00:00Z')), 8 * 60)
  assert.equal(isRestaurantOpen(Date.parse('2026-11-23T02:59:00Z')), false) // 07:59
  assert.equal(isRestaurantOpen(Date.parse('2026-11-23T03:00:00Z')), true) // 08:00
  assert.equal(isRestaurantOpen(Date.parse('2026-11-23T18:29:00Z')), true) // 23:29
  assert.equal(isRestaurantOpen(Date.parse('2026-11-23T18:30:00Z')), false) // 23:30
  assert.equal(isRestaurantOpen(Date.parse('2026-11-23T20:00:00Z')), false) // 01:00 next day
})

test('catering page uses the lux kit in three languages with bundled photos', () => {
  const page = readSource('src/pages/CateringPage.jsx')
  assert.match(page, /className="zk-lux public-page-enter min-h-screen"/)
  assert.match(page, /<LanguageSwitcher variant="lux" \/>/)
  for (const lang of ['ru', 'uz', 'en']) assert.match(page, new RegExp(`\\n  ${lang}: \\{\\n    seoTitle: `))
  // Product photos on the image bucket are renamed on re-upload; the page only uses bundled assets.
  assert.doesNotMatch(page, /r2\.dev/)
  // The old green/yellow page-specific palette and heavy weights are gone.
  assert.doesNotMatch(page, /#17372e|#f3b33d|font-black text-\[/)
})

test('home page links catering and keeps contact actions in reach on phones', () => {
  const menu = readSource('src/pages/PublicMenu.jsx')
  const visit = readSource('src/components/PublicVisit.jsx')
  assert.match(menu, /href="\/catering" onClick=\{onOpenCatering\}/)
  assert.match(menu, /showHero && <PublicVisitSection/)
  assert.match(menu, /<PublicActionBar[^>]*visible=\{!headerOverHero && !showDetailOverlay\}/)
  assert.match(visit, /id="public-menu-visit"/)
  assert.match(visit, /inert=\{visible \? undefined : ''\}/)
  assert.doesNotMatch(visit, /text-\[(7|8|9|10|11)px\]|\bh-(8|9|10) /)
  for (const lang of ['uz', 'ru', 'en']) assert.match(visit, new RegExp(`\\n  ${lang}: \\{\\n    eyebrow: `))
})

test('desktop header never wraps and chip rows can be paged with a mouse', () => {
  const menu = readSource('src/pages/PublicMenu.jsx')
  const scroller = readSource('src/components/MenuCategoryScroller.jsx')
  const css = readSource('src/index.css')
  // Links that do not fit beside the controls at 1024px wait for 1280px instead of wrapping.
  assert.equal((menu.match(/className="lux-nav-link max-xl:hidden"/g) || []).length, 3)
  assert.match(menu, /aria-current=\{sectionPage \? undefined : 'page'\} className="lux-nav-link"/)
  assert.match(menu, /variant="lux"\s+scrollArrows/)
  assert.match(scroller, /scrollArrows && <RowArrows rowRef=\{collapsedRowRef\}/)
  for (const lang of ['uz', 'ru', 'en']) assert.match(scroller, new RegExp(`${lang}: \\{ previous: '`))
  // Arrows are for mice only: touch screens swipe the row.
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 1024px\) \{\s*\.lux-row-arrow \{ display: flex; \}/)
})

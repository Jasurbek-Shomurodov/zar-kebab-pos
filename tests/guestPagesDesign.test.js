import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Telegram mini app loads with card shimmers, a retry and translated error codes', () => {
  const source = readSource('src/pages/TelegramMiniApp.jsx')
  assert.doesNotMatch(source, /Loading\.\.\.|Загрузка\.\.\.|Yuklanmoqda\.\.\./)
  assert.match(source, /function ProductCardShimmer\(\)/)
  assert.match(source, /zk-shimmer aspect-square/)
  // The error is a code translated at render, never a raw message or a label captured before the language is known.
  assert.match(source, /setError\('authError'\)/)
  assert.match(source, /setError\('loadError'\)/)
  assert.doesNotMatch(source, /setError\(err\.message/)
  assert.doesNotMatch(source, /message: err\.message/)
  assert.match(source, /const errorText = error \? \(l\[error\] \|\| l\.loadError\) : ''/)
  // Retry re-runs boot() through the effect.
  assert.match(source, /\}, \[bootAttempt\]\)/)
  assert.equal((source.match(/onClick=\{retryBoot\}/g) || []).length, 2)
  // Empty search or category.
  assert.match(source, /visibleItems\.length === 0/)
  for (const key of ['retry', 'nothingFound', 'nothingFoundHint', 'showAll', 'cardNumberLabel', 'balanceError']) {
    assert.equal((source.match(new RegExp(`\\n    ${key}: `, 'g')) || []).length, 3, `${key} exists in uz, ru and en`)
  }
  assert.match(source, /aria-label=\{l\.searchMenu\}/)
  assert.match(source, /aria-label=\{l\.cardNumberLabel\}/)
  assert.doesNotMatch(source, /text-\[(7|8|9|10|11)px\]/)
})

test('lazy images start their load timeout only when they are near the viewport', () => {
  const source = readSource('src/components/ImageLoadShimmer.jsx')
  assert.match(source, /loading === 'lazy' && image && typeof IntersectionObserver === 'function'/)
  assert.match(source, /if \(entries\.some\(entry => entry\.isIntersecting\)\) \{\s+observer\.disconnect\(\)\s+startTimer\(\)/)
  assert.match(source, /observer\?\.disconnect\(\)/)
})

test('category scroller: hidden duplicate bar is inert and scrolling respects reduced motion', () => {
  const source = readSource('src/components/MenuCategoryScroller.jsx')
  assert.match(source, /collapsedBarRef\.current\.inert = !collapsed/)
  assert.match(source, /aria-hidden=\{collapsed \? undefined : true\}/)
  assert.doesNotMatch(source, /behavior: 'smooth'/)
  assert.match(source, /prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth'/)
  assert.match(source, /className="lux-chip flex h-11 flex-shrink-0/)
  assert.doesNotMatch(source, /text-\[10\.5px\]/)
})

test('public menu: 44px guest controls, readable text, retryable lux error', () => {
  const source = readSource('src/pages/PublicMenu.jsx')
  assert.doesNotMatch(source, /window\.location\.reload\(\)/)
  assert.match(source, /onClick=\{\(\) => refreshPublicMenu\(\{ showLoading: true \}\)\}/)
  assert.doesNotMatch(source, /behavior: 'smooth'/)
  assert.doesNotMatch(source, /text-\[#8A94A6\]/)
  assert.doesNotMatch(source, /text-\[(7|8|9|10|11)px\]/)
  assert.doesNotMatch(source, /lux-chip (relative )?(inline-)?flex h-(8|9|10)\b/)
  assert.doesNotMatch(source, /!h-9|!h-10/)
  // The classic read-only grid was unreachable: sections always render.
  assert.doesNotMatch(source, /MenuProductCard\b/)
  assert.match(source, /aria-label=\{labels\.placeholder\}/)
})

test('dish cards: facts wrap, 44px steppers with real names, lux add button', () => {
  const source = readSource('src/components/MenuProductCards.jsx')
  assert.doesNotMatch(source, /text-\[11\.5px\]/)
  assert.match(source, /lux-muted flex min-w-0 flex-wrap items-center gap-x-1\.5 gap-y-0\.5 pb-px text-xs/)
  assert.doesNotMatch(source, /aria-label="[−+]"/)
  assert.match(source, /aria-label=\{`\$\{labels\.decrease\}: \$\{name\}`\}/)
  assert.match(source, /aria-label=\{`\$\{labels\.increase\}: \$\{name\}`\}/)
  // The compact waiter add button must not depend on the .zk-lux .bg-orange-50 override.
  assert.match(source, /className="lux-primary flex h-11 w-16 max-\[359px\]:w-14/)
  assert.match(source, /lux-on-photo absolute right-1\.5 top-1\.5 flex h-11 w-11/)
  assert.doesNotMatch(source, /lux-(chip|primary)[^"`]*\bh-10 w-14/)
  assert.match(source, /text-\[length:max\(0\.72em,12px\)\]/)
})

test('vacancies and catering: back link is a 44px named target, eyebrows pass contrast', () => {
  const vacancies = readSource('src/pages/PublicVacancies.jsx')
  assert.match(vacancies, /aria-label=\{selectedPosition \? copy\.backToVacancies : copy\.back\} className="lux-muted -ml-2 inline-flex min-h-11 min-w-11/)
  assert.doesNotMatch(vacancies, /text-\[#ff5a00\]|text-\[11px\]/)
  const catering = readSource('src/pages/CateringPage.jsx')
  assert.doesNotMatch(catering, /text-\[#b8892f\]">/)
})

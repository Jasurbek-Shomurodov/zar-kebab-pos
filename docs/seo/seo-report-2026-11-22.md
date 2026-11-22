# SEO report — 2026-11-22

Goal: make www.zarkebab.uz show up on Google, Bing and Yandex for searches like "halal food",
"шашлык", "плов", "манты/чучвара (dumplings)", "kebab" in Tashkent.

## Scope

- Public pages: `/` (= `/menu`), `/menu/item/<key>` (dish pages), `/catering`, `/corporate-sets`,
  `/frozen-meals`, `/vacancies`; `robots.txt`, `sitemap.xml`, `vercel.json`, `index.html`.
- Build: `npm run build` (Vite + new `postbuild` prerender) against the live public menu
  (`get_public_menu_data`: 15 categories, 152 items → 130 dish pages after exclusions).
- Checked: rendered `dist/` HTML (what non-JS crawlers get) and the React app in the dev server
  (what Google renders).

### Not run

- Lighthouse / Core Web Vitals: no Lighthouse in this environment. Run PageSpeed Insights on the
  live site after deploy.
- Vercel `cleanUrls` routing and `X-Robots-Tag` headers: verifiable only on a Vercel deployment
  (preview or production). Check with `curl -I` after deploy (see Next actions).
- schema.org validator / Google Rich Results Test: needs the deployed URL.

## Findings

| Sev | Page | Check | Evidence (before) | Fix |
| --- | --- | --- | --- | --- |
| S0 | admin.zarkebab.uz (all) | Private host indexable | Same deployment as www: served `index.html` with `robots: index, follow`, no `X-Robots-Tag`, same `robots.txt` | `X-Robots-Tag: noindex, nofollow` for host `admin.zarkebab.uz` in `vercel.json`; static crawler copy hidden on that host (`index.html`) |
| S0 | /admin, /waiter, /cashier, /receipt, /login, /checkin-*, /telegram, /search, /premium-menu | Private / duplicate routes indexable | All return 200 + index.html with `index, follow` | Same header for these paths (`vercel.json`); `robots.txt` now disallows `/api/` and `/sb/` |
| S1 | All | No dish words or "halal" in the HTML crawlers read | Static HTML had one Russian paragraph; no plov/шашлык/манты/halal anywhere. Bing and Yandex index little or no JavaScript | `postbuild` prerender writes the full dish list (ru · en · uz names) into `dist/index.html`, plus halal/dish intro in 3 languages (`scripts/prerender-public-seo.mjs`) |
| S1 | Home | Title/description don't match target searches | "Zar Kebab — узбекская, уйгурская и турецкая кухня" | "Zar Kebab — шашлык, плов и халяль кухня в Ташкенте"; description lists halal, шашлык, плов, манты, чучвара, лагман, казан-кебаб. uz/en copy for the language switch (`src/lib/publicSeo.js`) |
| S1 | Dish links `/menu/item/<key>` | No page per dish | Static: home title + canonical `/`. Rendered: still home title, canonical `/` → every dish folded into the home page | 130 static dish pages (own title, description, canonical, og:image, `MenuItem` JSON-LD, names in 3 languages); React sets the same title/canonical when a dish is open (`PublicMenu.jsx`) |
| S1 | /catering, /corporate-sets, /frozen-meals, /vacancies | Static canonical pointed to `/` | Non-JS crawlers saw home title and `canonical=/` on every section | Per-section static HTML with its own title, description and canonical |
| S1 | sitemap.xml | Lists a non-canonical URL, misses dishes | Listed `/menu` (canonical is `/`); no dish URLs | Build writes `dist/sitemap.xml` with `/`, 4 sections and 130 dishes; committed fallback drops `/menu` |
| S1 | Restaurant JSON-LD | Missing halal / cuisine | `servesCuisine: Uzbek, Uyghur, Turkish, Kebab` | Added `Central Asian`, `Halal`; `hasMenu` → `/`; build adds a `Menu` with sections and items |
| S1 | NAP | Opening hours disagree | Site: 08:00–01:00. Google and Yandex: 08:00–23:30 | Owner confirmed 08:00–23:30; site copy, JSON-LD `closes` and crawler pages updated |
| S1 | All | No per-language URLs / hreflang | Language is a client toggle only; one URL for uz/ru/en | Not fixed (needs `?lang=` or `/uz/` routes across the app). Partly covered: static pages carry all three languages' dish names |
| S1 | Restaurant JSON-LD | No `geo` coordinates | Missing | Not fixed: coordinates unknown (TODO) |
| S2 | All | og:image is the 512px logo | `summary` card, no 1200×630 image | Dish pages now use the dish photo; home still needs a 1200×630 cover |
| S2 | Item JSON-LD | No price | Prices omitted on purpose: the static copy only refreshes on deploy | Leave as is |

Choices made:
- The Alcohol category is left off the crawler pages and the sitemap so it doesn't show next to "halal". It still shows in the app menu.
- The corporate-set and frozen-shop lines stay on their own pages (same as the `/menu` page).
- If the menu API is down at build time, the build still succeeds with the section pages and the committed sitemap.

PASS (unchanged): `lang="ru"` on `<html>`, unique canonical domain (`vercel.app` hosts 301 to www), one `h1`,
`tel:` link, Yandex map link, favicon/apple-touch-icon, fonts `display=swap`, Restaurant + WebSite JSON-LD.

## Business-profile TODOs (owner)

1. **Halal**: confirm (Google/Yandex say yes; the menu also has alcohol).
2. Coordinates, district/landmark, postal code.
3. Google review link and Yandex review link (for the review card).
4. Yandex categories "Банкетный зал" / "Доставка" only if true.

## Next three actions

1. **Deploy, then register the site with the search engines**: Google Search Console (Domain
   property `zarkebab.uz`), Bing Webmaster Tools (import from Search Console), Yandex Webmaster.
   Submit `https://www.zarkebab.uz/sitemap.xml` in all three. Bing needs this to show the site
   at all; Yandex needs the region set to Tashkent.
2. **Paste the listing kit (`docs/seo/listing-kit.md`) into Google and
   Yandex: description, categories and halal attribute, then start the weekly routine.
3. **Check the deploy**: `curl -sI https://admin.zarkebab.uz/ | grep -i x-robots` shows
   `noindex`; `curl -s https://www.zarkebab.uz/menu/item/MI-N5M4R253R4 | grep '<title>'` shows
   "Плов в Ташкенте — Zar Kebab"; `curl -s https://www.zarkebab.uz/catering | grep canonical`
   shows `/catering`. Then run PageSpeed Insights on mobile.

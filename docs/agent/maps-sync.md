# Maps Menu Sync (Yandex Maps, 2GIS) and Reviews

Zar Kebab on Yandex Business: company id `34684464035`. Neither Yandex nor 2GIS has an API for reviews or price-list writes, so cabinet work runs in the owner's signed-in Google Chrome (Claude in Chrome tools), never the built-in browser pane. A sign-in page or captcha means stop and ask the owner; never sign in or solve it.

## Entry points

- Yandex feed (POS → YML, regular prices, Russian names): `api/yandex-menu/_lib/yandexFeed.js`; POS read: `api/_lib/posMenu.js`
- 2GIS price list (CSV built from that YML): `api/_lib/twoGisMenu.js`
- Public routes (`vercel.json`, all via `api/google-reviews/run.js` for the Hobby function cap): `/yandex-menu.yml`, `/2gis-menu.csv`, `/yandex-photos/<name>.jpg`
- Script: `scripts/maps-menu-sync.mjs` (`npm run maps:menu`; `npm run yandex:menu` is an alias kept for the scheduled task)
- Report image: `api/telegram/_lib/mapsMenuSyncImage.js`
- Tests: `tests/yandexMenuFeed.test.js`, `tests/twoGisMenu.test.js`, `tests/mapsMenuSyncScript.test.js`
- Last uploads: `deliverables/yandex-menu-regular.yml`, `deliverables/2gis-menu.csv`
- Local scheduled tasks (`~/.claude/scheduled-tasks/`): `yandex-menu-sync` 09:00 Tashkent (sync, Chrome upload only on change, Team report, commit); `yandex-5-star-replies` 08:00

## Cabinet pages

- Yandex price list: `https://yandex.ru/sprav/34684464035/p/edit/price-lists/`; reviews: `…/p/edit/reviews/` (20 per page, `?page=2`); posts: О компании → Публикации
- 2GIS: `https://account.2gis.com/` → Товары и услуги

## Menu sync

`npm run maps:menu` keeps every map in `PROVIDER_INFO` (`scripts/maps-menu-sync.mjs`) in sync; a new map such as TripAdvisor is one entry plus its builder. Google (mode api): the 04:20 cron publishes and records `menu.syncedAt` in `google_business_daily_digests`; the script skips Google when today's run succeeded, else triggers `/api/google-reviews/run?task=menu` with `CRON_SECRET`. Yandex (upload) and 2GIS (link): it builds both files from the live feed and diffs each against its committed copy. `deliverables/maps-sync-state.json` records when each map last got which menu (hash); a map already holding this menu is skipped. Options: `--provider=google,yandex,2gis|all`, `--force`, `--dry-run`, `--from-db` (this checkout's code, `.env.local` service key), `--out=<path>`, `--note="…"`, `--image=<path>`, `--text`. After uploading, run `npm run maps:menu -- --uploaded`: it records the state and sends the Team group (`team_events`) one Russian PNG with a tile per map ("обновлено сегодня в 04:20"). Commit the deliverables files and the state file. Empty lists are refused, since an upload replaces the whole list.

What stays listed: only archived dishes and categories leave the maps. Stop-list (`available = false`), public-hidden and hidden-category dishes (Бизнес-ланч) stay (owner rule, 2026-11-26). Frozen-shop categories, Utensils and Corporate set are never listed.

Yandex: the cabinet source is **Вручную** (Yandex never ingested the feed link). Descriptions over 250 characters are trimmed with `…`; fix names in the POS admin (`admin.zarkebab.uz/admin/menu/product/<id>`), not the file; variants are `<dish> (<label>)`. Click **Загрузить XLS/YML**; the hidden `input[type=file]` (`UploadPriceListForm-HiddenInput`) takes the file via `file_upload`. Success after ~15 s: toast "Прайс-лист успешно загружен, список товаров обновлен". Keep uploads under ~10 MB.

2GIS: same dishes at the **tourist price** (regular × 1.2, owner rule 2026-11-27) minus Алкоголь (2GIS forbids alcohol; `TWO_GIS_EXCLUDED_CATEGORIES` overrides). Columns `name;price;currencyId;measure;available;category;url;picture;vendor;id;description`, UTF-8; ids are letters/digits ≤20 (long ids hashed), all-caps names are recased, descriptions ≤500 and dropped if they hold promo words or links. Cabinet org `70000001117461512`: Товары и услуги uses **По ссылке** `https://www.zarkebab.uz/2gis-menu.csv` (set 2026-11-27; 2GIS refetches daily, first run up to 6 h). Switching to a file upload deletes the list. Currency is sent as UZS: check the first upload's preview.

Photos: the feed points WebP menu photos at `/yandex-photos/<name>.jpg`, converted to JPEG on the fly, because Yandex rejects WebP.

## Posts, photos, videos

Google: `npm run maps:content -- post|media|posts|photos|delete-post|delete-media` (`googleContent.js`, `run?task=content`); previews unless `--publish`; owner OKs first. Others: cabinet in Chrome. TripAdvisor unclaimed (2026-11-27).

## Review replies

Find unanswered reviews with `javascript_tool`:

```js
[...document.querySelectorAll('.Review')].map((r, i) => ({
  i,
  stars: (r.querySelector('.StarsRating')?.className.match(/value_(\d+)/) || [])[1], // half-stars: 10 = 5★, 4 = 2★
  unanswered: !!r.querySelector('.BusinessResponseDraft textarea'),
  text: r.innerText.slice(0, 500),
})).filter(r => r.unanswered)
```

Click "читать далее" to read a long review in full. Earlier replies are in `.BusinessResponseSaved-Response`; read a few before writing so the tone matches.

House style (the owner's rules):

- Write in the reviewer's language and script; a stars-only review gets Russian.
- Always say "Zar Kebab"; never name staff ("команда Zar Kebab", "the Zar Kebab team").
- Address the reviewer by first name when it is a real name.
- Positive: 1–3 sentences, thank them, name what they praised, invite them back.
- Negative: thank them, apologise, restate each concrete complaint, say it was passed to the team and what will be checked, invite them back ("Будем рады, если дадите нам ещё один шанс."). No discounts, refunds, prices, links or phone numbers; never argue or promise something unverified.
- Leave reviews by the owner's family (surname Shomurodov / Шомуродов) untouched.
- The scheduled task answers 5★ on its own; 1–4★ wait for a reply the owner asked for.

Posting: click the review's textarea, type, then click the round arrow button at the right of the box (not the quick-reply chips). Success is the toast "Ответ отправлен" and "Ответ компании" with today's date.

## Posts and profile

Posts are Russian only, no Акция without a real offer, and each ends with "К счёту добавляется обслуживание 15%". Earlier post texts: `deliverables/yandex-posts-draft.md`. Hours, features and average bill mirror the Google Business Profile.

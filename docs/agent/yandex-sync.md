# Yandex Maps (Yandex Business) Menu and Reviews

Zar Kebab on Yandex Business: company id `34684464035`. Yandex has no API for reviews, posts or the price list, so all cabinet work is done in the owner's signed-in Google Chrome (Claude in Chrome tools), never the built-in browser pane. A Yandex sign-in page or captcha means stop and ask the owner; never sign in or solve it.

## Entry points

- Feed builder (POS → YML, regular prices, Russian names): `api/yandex-menu/_lib/yandexFeed.js`
- Shared POS menu read and excluded categories: `api/_lib/posMenu.js`
- Public routes (in `vercel.json`): `/yandex-menu.yml` and `/yandex-photos/<name>.jpg`, both served by `api/google-reviews/run.js` (`task=yandex-feed` / `task=yandex-photo`; Vercel Hobby caps the function count, so they share it)
- Upload-file script: `scripts/yandex-menu-sync.mjs` (`npm run yandex:menu`)
- Tests: `tests/yandexMenuFeed.test.js`, `tests/yandexMenuSyncScript.test.js`
- Last uploaded file: `deliverables/yandex-menu-regular.yml`
- Daily menu sync: local scheduled task `yandex-menu-sync` (in `~/.claude/scheduled-tasks/`), 09:00 Tashkent: `npm run yandex:menu`, Chrome upload only when the menu changed, Team report, commits the upload file
- Daily 5★ auto-replies: local scheduled task `yandex-5-star-replies` (in `~/.claude/scheduled-tasks/`), runs in Chrome at 08:00 Tashkent

## Cabinet pages

- Price list: `https://yandex.ru/sprav/34684464035/p/edit/price-lists/`
- Reviews: `https://yandex.ru/sprav/34684464035/p/edit/reviews/` (newest first, 20 per page, `?page=2` for the next)
- Posts: О компании → Публикации; stories: Истории

## Menu sync

The cabinet source is **Вручную** (file upload). The YML feed source was added but Yandex never ingested it, so a file upload is the working path. Each upload replaces the whole list.

Steps 1–4 are one command, `npm run yandex:menu`; run it, read its report, then do step 5. In a terminal it then waits for Enter and sends the report to the Team group (`team_events` target, same as the Google Maps menu sync); non-interactive runs (agents) send it with `npm run yandex:menu -- --uploaded` after the success toast. The report is one Russian PNG (`api/telegram/_lib/yandexMenuSyncImage.js`: counts, removed/added/repriced/renamed dishes, optional notes) with a short caption; if the image fails to render it falls back to the text message. The diff baseline is the committed `deliverables/yandex-menu-regular.yml`, so commit the file after each upload. Options: `--dry-run` (report only), `--from-db` (build from Supabase with this checkout's feed code, using the `.env.local` service key; use it to check feed changes before deploying), `--out=<path>`, `--note="…"` (extra report line such as review or profile status, repeatable), `--image=<path>` (also save the PNG to preview it), `--text` (send the old text report).

What stays listed: only archived (deleted) dishes and categories leave Yandex. Dishes on the stop list (`available = false`), hidden from the public menu, or in hidden categories such as Бизнес-ланч stay listed (owner rule, 2026-11-26). Frozen-shop categories, Utensils and Corporate set are never listed.

1. Download the live feed: `https://www.zarkebab.uz/yandex-menu.yml`. It already drops archived items, frozen categories, tourist prices and zero prices.
2. Diff offers by id against `deliverables/yandex-menu-regular.yml` and report added, removed, repriced and renamed dishes to the owner.
3. Yandex warns on descriptions over 250 characters: trim those at a word boundary and end with `…`. Fix wrong names or labels in the POS admin (`admin.zarkebab.uz/admin/menu/product/<id>`), not in the file; variant offers are named `<dish> (<variant label>)`, e.g. `Xортиця (500 мл)`.
4. Check the file with `xmllint --noout`, save it over `deliverables/yandex-menu-regular.yml`. The script refuses to write a file with no offers, since an upload replaces the whole list.
5. In the price list page click **Загрузить XLS/YML**; the dialog's hidden `input[type=file]` (`UploadPriceListForm-HiddenInput`, accepts `.xml,.yml`) takes the file through `file_upload`. Processing takes about 15 s; success is the toast "Прайс-лист успешно загружен, список товаров обновлен". New rows show a yellow dot while on moderation.
6. Keep Chrome uploads under ~10 MB per call (larger batches drop the connection).

Photos: the feed points WebP menu photos at `/yandex-photos/<name>.jpg`, converted to JPEG on the fly, because Yandex rejects WebP.

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

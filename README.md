# Zar Kebab POS

## Telegram Bot and Mini App

This MVP connects Telegram to the existing web app and Supabase data. Telegram chat opens the read-only Mini App menu, loyalty lookup, and restaurant contact page; kitchen, cashier, and admin data stay in the same backend/database.

### Environment variables

Add these to local `.env.local` and to your deployment provider:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEB_APP_URL=https://your-domain.com/telegram
TELEGRAM_SESSION_SECRET=use-a-long-random-string
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=use-a-different-long-random-string
CRON_SECRET=use-another-long-random-string
TELEGRAM_COMPLETED_ORDERS_CHAT_ID=
TELEGRAM_SALARY_PAYMENTS_CHAT_ID=
TELEGRAM_SALARY_PAYMENTS_LANGUAGE=ru
TELEGRAM_TEAM_CHAT_ID=
TELEGRAM_TEAM_LANGUAGE=ru
SUPABASE_SERVICE_ROLE_KEY=
```

Keep `TELEGRAM_BOT_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix them with `VITE_`.
`VITE_TELEGRAM_BOT_USERNAME` contains only the bot's public username and is safe for the browser.
Set `TELEGRAM_COMPLETED_ORDERS_CHAT_ID` to the Telegram group chat id that should receive paid order completion messages. Add the bot to the group first; group and supergroup chat ids are usually negative numbers. You can also provide multiple chat ids separated by commas.
Set `TELEGRAM_SALARY_PAYMENTS_CHAT_ID` to the separate private group that
should receive salary-operation messages if migration `111` has not been
applied yet.
The setting is intentionally separate from `TELEGRAM_TEAM_CHAT_ID` and
`TELEGRAM_COMPLETED_ORDERS_CHAT_ID`, so salary details cannot be sent to the
wrong group as a fallback. Add the bot to that group and allow it to send
messages. `TELEGRAM_SALARY_PAYMENTS_LANGUAGE` defaults to `ru`.
After deploying the webhook code, send `/chatid` inside the salary group to
have the bot reply with the exact value to use for
`TELEGRAM_SALARY_PAYMENTS_CHAT_ID`.
`/start` also returns the chat id when used in a group. Language selection is
shown only in a private chat with the bot.
Migration `111` stores the confirmed salary-events group in Supabase and uses
it as the primary destination; the environment variable remains a deployment
fallback. Salary payments, bonuses, fines, and absences notify both the group
and the linked employee. None of these messages use the team or
completed-orders groups as a fallback. If a private employee link is missing
or disabled, the group notification is still attempted and tracked.

Migration `119` adds ZarKebab Team as a third, independently tracked
destination for bonuses, fines, and absences. The database target
`team_events` is primary; `TELEGRAM_TEAM_CHAT_ID` is its deployment-order
fallback, and `TELEGRAM_TEAM_LANGUAGE` defaults to Russian. Team messages show
the employee, date, full bonus/fine amount, bonus payment method, and the full
saved reason or note. They deliberately omit the employee's remaining salary
balance and the manager who recorded the operation. Salary payments and rate
changes continue to stay out of ZarKebab Team.

Migration `124` removes Telegram delivery tracking when its bonus, fine,
absence, or salary-rate source is deleted, preventing orphan retries. Migration
`125` adds immutable Accounting audit snapshots for absence corrections.
Messages that Telegram already delivered cannot be recalled.

### BotFather setup

1. Create a bot with BotFather and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Set the Mini App/Web App URL to `https://your-domain.com/telegram`.
3. Set `TELEGRAM_WEB_APP_URL` to the same URL.
4. Run the bot locally with:

```bash
npm run bot:telegram
```

The `/start` command sends a welcome message with an `Open Menu` button that opens the Mini App.

On Vercel, use Telegram webhooks instead of running the polling process. After deploying, register the production endpoint:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

Telegram webhooks and `npm run bot:telegram` polling cannot be active at the same time.

### Database setup

Run `migrations/017_telegram_integration.sql` in the Supabase SQL editor. It adds:

- `customers`
- `telegram_users`
- Telegram/customer/source fields on `orders`

For private employee salary notifications, also run
`migrations/107_employee_salary_telegram_notifications.sql`. It adds verified
employee links, expiring one-time tokens, and idempotent delivery history.
Run `migrations/108_employee_salary_payment_notification_deliveries.sql` and
`migrations/110_salary_payment_group_notifications.sql` to audit private
employee delivery and salary-group delivery independently.
Run `migrations/111_salary_group_event_notifications.sql` to configure the
salary-events group and track duplicate-safe bonus, fine, and absence delivery.
Run `migrations/112_salary_event_employee_notifications.sql` to track private
employee delivery for bonus, fine, and absence notifications independently
from the salary-group delivery. Migration `129` intentionally marks the private
automatic-KPI event destination as combined with the daily salary summary.
Run `migrations/113_salary_notification_attempt_tracking.sql` so every saved
payment, bonus, fine, or absence immediately creates a delivery-status row,
even when a stale browser or failed request never reaches Telegram. The
Salaries page combines those records under Salary notification status, five
at a time, and allows unsent records to be retried. Run
`migrations/116_salary_rate_change_telegram_notifications.sql` to add the same
tracked private/group delivery for genuine salary-rate changes; an employee's
first salary rate is intentionally treated as setup rather than a change. Run
`migrations/119_salary_event_team_notifications.sql` to queue and audit the third
ZarKebab Team destination for new bonuses, fines, and absences. Historical
events are not replayed when that migration is installed. Run
`migrations/129_daily_kpi_bonuses.sql` to add effective-dated employee KPI rates,
immutable daily calculation snapshots, automatic paid bonuses, and their
database-first Telegram delivery queue. Automatic KPI bonuses do not send a
second private receipt: the employee sees Salary and Bonus together in the
daily salary summary, while the Salary group and ZarKebab Team receive their
own independently retryable KPI announcements.

### Daily employee salary notifications

The Salaries page can generate a private employee link after migration `107`
is applied and `VITE_TELEGRAM_BOT_USERNAME` is configured. The employee opens
that link and presses Start. The token expires after 30 minutes and can be used
only once.

Supabase Cron invokes `/api/telegram/daily-salary` at `23:05 UTC`, which is
`04:05` in `Asia/Tashkent` (after the KPI shift ends at `04:00`; migration `244`), using the matching `CRON_SECRET` stored in Supabase
Vault as a Bearer token. The job first idempotently finalizes KPI
bonuses for the previous completed Tashkent date (and retries the last seven
completed dates as bounded catch-up), then sends or retries the combined salary
summary for each finalized date. Each private message always includes Salary
and Bonus fields together, plus any fines, payments, and the current amount
due. Unique run, result, and delivery rows prevent duplicate bonuses or
messages when the cron is retried.
If the completed date cannot be finalized, its salary summary is left unclaimed
and the endpoint returns an error so a retry cannot permanently omit the KPI.

Migration `152_supabase_daily_report_cron.sql` installs the daily trigger in
Supabase Cron; `244_kpi_day_ends_0400.sql` moves it to `23:05 UTC` (`04:05 Asia/Tashkent`). Before applying it, save
the same value used by Vercel's `CRON_SECRET` in Supabase Vault:

```sql
select vault.create_secret(
  '<the Vercel CRON_SECRET value>',
  'zar_kebab_daily_report_cron_secret',
  'Bearer token used by the Zar Kebab daily report cron'
);
```

The migration reads that secret only inside the database and calls
`https://www.zarkebab.uz/api/telegram/daily-salary`. Verify requests in
`net._http_response` and scheduled runs in `cron.job_run_details`. Vercel keeps
only the later watchdog cron; delivery rows remain the final duplicate-safety
boundary for manual retries and overlapping deployments.

The existing `08:00 Tashkent` unavailable-products cron also acts as the
independent daily-salary watchdog. It runs after the primary Hobby cron window,
verifies that the completed Tashkent date has a sent aggregate report. It retries
unstarted, failed, or skipped Investor albums after meal/KPI finalization, even
if an earlier failure alert exists. It does not replay pending sends with uncertain
outcomes. If recovery does not complete, it sends one failure alert to the ZarKebab Investor group for a missing, failed,
or stale run. The report remains retryable. Authorized primary runs also send
an immediate failure alert when KPI finalization or report delivery returns an
error. This remains within the Vercel Hobby cron limit while Supabase owns the
primary report schedule.

### Security notes

The Mini App reads `window.Telegram.WebApp.initData` and sends the raw string to `POST /api/telegram/auth`. The backend validates the signature with `TELEGRAM_BOT_TOKEN` before creating a signed app session. The frontend never trusts `initDataUnsafe` for authentication and never receives the bot token.

The Mini App is a read-only menu with loyalty-balance lookup and restaurant contact information. Its unused customer checkout and order-history endpoints were retired.

## Google Maps review bot

The protected `/api/google-reviews/run` endpoint checks the configured Google Business Profile for unanswered reviews and creates a short reply in the review's language. It uses Google Gemini (free tier) when `GEMINI_API_KEY` is present, replying in the guest's original language and script. Without it, a conservative template is used in the review's language (Russian, Uzbek Latin, Uzbek Cyrillic or English, or `GOOGLE_REVIEW_DEFAULT_LANGUAGE` for text-free reviews); reviews in any other language are reported as failed instead of answered in the wrong language. Supabase Cron (`266_google_business_daily_sync.sql`, reusing the Vault secret from `152`) calls it every day at 04:10 Tashkent, right after the 04:05 daily reports but in its own job, so review failures cannot block them. Without the Google variables it returns `mode: "disabled"`. Gemini's free tier allows 5 requests per minute, so the bot spaces Gemini calls 13 seconds apart (`GOOGLE_REVIEW_GEMINI_INTERVAL_MS`), retries a rate-limited call after the delay Gemini suggests, and stops starting new replies after 240 seconds (`GOOGLE_REVIEW_TIME_BUDGET_MS`); it also stops at the free tier's daily cap (20 requests). Reviews it did not reach are reported as `deferred` and answered by the next daily run.

Add these server-only deployment variables:

```bash
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_BUSINESS_REFRESH_TOKEN=
GOOGLE_BUSINESS_ACCOUNT_ID=
GOOGLE_BUSINESS_LOCATION_ID=
GEMINI_API_KEY=
GOOGLE_REVIEW_GEMINI_MODEL=gemini-3.6-flash
GOOGLE_REVIEW_BUSINESS_NAME=Zar Kebab
GOOGLE_REVIEW_DEFAULT_LANGUAGE=Russian
GOOGLE_REVIEW_MAX_PER_RUN=25
GOOGLE_REVIEW_AUTO_PUBLISH=false
```

Google requires an approved Cloud project, the Google My Business API enabled, OAuth consent with the `business.manage` scope, and one offline refresh token belonging to an owner or manager of the verified profile. Keep all credentials server-only. Account and location variables accept either bare IDs or `accounts/...` and `locations/...` values.

Leave `GOOGLE_REVIEW_AUTO_PUBLISH=false` for the first run. Preview safely with the same `CRON_SECRET` already used by scheduled endpoints:

```bash
curl -s "https://www.zarkebab.uz/api/google-reviews/run" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Inspect the returned replies, then set `GOOGLE_REVIEW_AUTO_PUBLISH=true` to enable live replies. The endpoint processes only reviews that do not already have an owner reply, with a maximum of 25 per run.

### Google Maps menu sync

`/api/google-reviews/run?task=menu` publishes the POS menu to the Google Business Profile food menu every day at 04:20 Tashkent (same migration `266`). Names and descriptions go in English, Russian and Uzbek; the POS card subtitle (portion · kcal) leads the description; each item carries its POS photo and a "Tourist price" option (regular × 1.2, rounded to 1 000, as in the POS), and variants are listed at both prices. Categories in `GOOGLE_MENU_EXCLUDED_CATEGORIES` (default `Utensils,Corporate set`, matched on the English name) are left off. Photos are uploaded once and remembered in `google_menu_photo_keys`; WebP images are converted to JPEG first. The menu is only replaced when it differs from what Google has, and an empty POS read never publishes.


### Database migration receipts and drift checks

Run `npm run db:health` with `SUPABASE_SERVICE_ROLE_KEY` to check schema,
recent function definitions, required triggers and cron schedules, and tracked checksums.
The key stays server-side. Ordinary permission responses are not missing migrations.

Use `node migrations/migrate.js --help`. The runner requires exact filenames,
including both distinct files for historical duplicate prefixes 073, 108 and 157.
Do not rename old migrations or replay the directory: it includes historical
cleanup and one-time data operations. New duplicate numbers are rejected.

For an existing database, initialize receipts once using
`node migrations/migrate.js --sql 199_migration_tracking.sql` and execute the output
in its SQL Editor. Then export only reviewed repairs, for example:
`node migrations/migrate.js --sql 182_rename_bazaar_ingredients.sql`.
Each exported script commits its SHA-256 receipt with the schema change.
`--apply` executes the same SQL through the Management API using
`SUPABASE_PROJECT_REF` and `SUPABASE_TOKEN`; `--status` is read-only.
No arguments prints help and changes nothing.

Older files without receipts are **legacy-untracked**, not automatically missing
or applied. Inspect live definitions before selecting a repair. Never bulk-mark
old history as applied. Matching receipts skip reruns; checksum changes fail.
If a write response is lost, check status before resubmitting the same filename.
Deploy the ingredient notification sender before applying migration 189.

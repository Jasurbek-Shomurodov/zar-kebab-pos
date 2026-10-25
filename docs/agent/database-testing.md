# Database, Migrations and Tests

## Entry points

- Database/health: `src/lib/db.js`, `src/lib/dbHealth.js`
- Tools: `migrations/migrate.js`, `scripts/check-db-health.js`
- SQL migrations: `migrations/`
- Source guards: `tests/sourceGuards.*.test.js`
- Backups: `scripts/db-backup.sh`, `scripts/db-restore.sh`, `docs/database-backup.md`, `tests/dbBackup.test.js`.
- `194`/`206`/`237` roles; `238` Tourist `243`/5/7/9 QR; `244` KPI 4am `248` hire `250` edit `251` AI `252`/3 remote `254` KPI QR `256` var TG `257` owner, test: `tests/employeeJobFunctions.test.js`.

## Workflow

- Use full filenames; keep legacy `073`/`108`/`157` duplicates distinct.
- `199` receipts/drift; `255` Settings check vs `src/generated/migrationManifest.js` (`npm run migrations:manifest`). `migrate.js --status`/`--sql`/`--apply <file>`; no legacy replay; same checksum skips, changed fails.
- Migrations:
  - settings, payments, kitchen submit, tables/reservations: `011`, `012`, `018`–`020`
  - kitchen idempotency and durable receipts: `096`, `128`
  - Bazaar, costs, fines, media, stock: `097`–`106`
  - salary/Telegram tracking and historical financial freezing: `107`–`119`
  - menu permissions, estimates, archival, stale items, Team catalog events: `121`–`127`, `167`–`168`, `223`
  - KPI and Tourist service: `129`–`130`
  - Tech Cards, access, components, stock, variant recipes, and fractional included-dish quantities: `139`–`140`, `149`–`151`, `154`–`156`, `159`
  - menu/expense notifications and financial snapshots: `142`–`147`
  - absence cleanup, daily-report/review crons: `148`, `152`, `225`
  - Dashboard monthly income snapshots, break-even target, and completed-day live average: `157`–`158`, `174`
  - authoritative Daily Bazaar ingredient catalog, clean reset, owner-only catalog writes, and immutable price-variance snapshots: `160`–`163`
  - immutable sold-item Tech Card ingredient snapshots and duplicate-safe daily ingredient image delivery: `164`–`165`
  - Tashkent expense backdate limit: `166`
  - salary/KPI accrual, notifications, Tech Card catalog access, and Team queue repair: `169`–`172`
  - paid-order correction feature access: `173`
  - Investor alerts for order deletes and payment corrections, including trigger repair: `175`–`176`
  - compact all-time Accounting remainder: `177`
  - employee lifecycle Investor notification queue: `178`
  - Game Club type, permission and service checks: `179`
  - Game Club per-round Team queue/cron: `180`
  - Daily Team KPI image claims and legacy-delivery suppression: `181`
- Tech Card cost sync `183`, targeted `236`. Tests: `tests/techCardCostSyncMigration.test.js`; SQL: `scripts/check-tech-card-*-sync.mjs`.
- Ingredient renames keep catalog keys and purchase snapshots: `182`.

## Invariants

- Report reads retry network/502/503/504: 3×15s, 500/1000ms backoff; table GET/HEAD and pending-date RPCs only. No write retries. Tests: `tests/reportReadFetch.test.js`.
- Atomic RPCs for multi-table writes: kitchen submit, menu item + protected cost, Tech Cards, Daily Bazaar, payment corrections.
- Enforce UI permissions with RLS/RPCs.
- Stale errors: `PT409`, never `40001` (PostgREST loops): `246`.
- Preserve order/cost/category/payroll/notification/audit snapshots.
- Uncertain writes reuse request/round IDs; reconcile receipts before retrying.
- Archive referenced catalog records; never hard-delete them.

## Checks

`npm test`; `npm run build`; `npm run docs:check`; `npm run mcp:benchmark`.

## Guards

- `ProfileSync`, `dbDispatch`, unique realtime channels;
- Parent-owned kitchen sending; snapshot-only cart removal;
- Idempotent kitchen rounds; reject paid/unavailable orders;
- operational loading boundaries and waiter-table refresh;
- disabled/reserved table behavior and history-safe table management;
- variant-specific cart rows, table price-mode entry, and submitted-round display;
- touch-safe product archival and stale archived-cart rejection;
- correct component ownership for menu upload errors;
- no debugging `console.log()`, blocking `alert()`, or native operational confirmation dialogs in `src`.

## Build

- Authenticate routes.
- Migration `179_game_club_orders.sql` must precede the Game Club frontend release. Never require the reopening function retired by `090`. Tests: `tests/gameClubOrders.test.js`.
- `180` SQL: `scripts/check-game-club-migration.mjs`.
- `184` requires deletion reasons and snapshots them for Investor alerts. Apply before UI.
- `185`: independent status-message tracking and minute cleanup retries. Apply before the Telegram sender. Tests: `tests/orderStatusDelivery.test.js`.
- `186`–`188`: Ingredients access, writes, snapshot keys, and movement totals. Tests: `tests/ingredientsFeature.test.js`; SQL: `scripts/check-ingredient-movement.mjs`.
- `189`: ingredient Investor queue and minute dispatch. Tests: `tests/ingredientNotifications.test.js`; SQL: `scripts/check-ingredient-notifications.mjs`. Deploy the sender before applying.
- `190`–`193`: ten-day income and monthly Busy Hours RPCs; apply before UI.
- `195`/`196`: own/all dine-in KPI from `2026-09-16`; apply before UI. History preserved. SQL: `tests/employeeOpenedOrderKpi.test.js`.
- `200`: repair KPI creator-label drift; preserve actor checks/history. Tests: `tests/employeeOpenedOrderKpi.test.js`.
- `201`: audited paid-payment splitting; apply before UI. Tests: `tests/paidPaymentSplit.test.js`.
- `202`/`232`: today-only deletion (owner: old unpaid too), KPI cleanup; apply before UI. `tests/orderDeletion.test.js`.
- `203`/`213`: KPI start/opening cutoff; apply before UI. Tests: `tests/timeBasedKpi.test.js`.
- `226`: closed-day KPI, no absence skip. Tests: `tests/closedOrderKpiDay.test.js`.
- `204`: keep audit actors on account deletion. Tests: `tests/accountDeletionAudit.test.js`.
- `205`: Take Away/Delivery/Game Club schedules; apply before UI. Seeds Game Club lunch. Tests: `tests/gameClubCategorySchedule.test.js`.
- `207`–`209`: rate date guard, audits, owner-only DELETE. Apply before UI. Tests: `tests/salaryRateDateWindow.test.js`, `tests/salaryRateHistory.test.js`.
- `210`: see [salary orders](salary-orders.md).
- `211`: profile name realtime. Tests: `tests/activeOrderWaiters.test.js`.
- `212`/`220`: bill edits (payments); `221`: price-mode guard (ordering); `222`: insert image guard (menu); `224`: payments
- `214`: `custom:<name>` ingredient categories, UI after; `227`/`228`/`239`–`242` menu; `229`–`235` payments/orders.
- `215`–`217`: payroll.md; `218`–`219`: architecture.md.

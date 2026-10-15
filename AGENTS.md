# Zar Kebab POS Agent Guide

Read this before changing code; then load only the feature guide relevant to the task.

## Project essentials

Zar Kebab POS is a Vite/React 18 app on Supabase: public and Telegram menus, waiter ordering, kitchen checks, cashier billing, admin, reporting, accounting, payroll and Telegram notifications.

Core locations:

- Routes: `src/App.jsx`
- Shared POS orchestration: `src/store/AppContext.jsx`
- Domain reducers: `src/store/`
- Supabase reads/writes/realtime: `src/lib/db.js`
- Payment and service math: `src/lib/analytics.js`
- SQL migrations: `migrations/`
- Tests: `tests/`

Run from the repository root:

```bash
npm run dev
npm test
npm run build
npm run db:health
```

Run `npm run db:health` first for endless loading or missing migration/RPC warnings.

For repository navigation:

- If the symbol or filename is known, use `rg` and read only the matching range.
- For an unfamiliar feature, use `repo_nav` to find the feature map, declarations, and focused tests before opening source.
- Never start by reading a whole large page, `src/lib/db.js`, or a full source-guard suite.
- `README.md` is an operator runbook: read it only for Telegram setup or deploys.

## Read only the relevant guide

Read the feature's guide fully; read more only when a task crosses boundaries.

| Task area | Required guide |
| --- | --- |
| App startup, authentication, shared state, realtime, permissions, routes | `docs/agent/architecture.md` |
| Waiter tables, cart, price mode, kitchen submission/checks, reservations | `docs/agent/ordering-kitchen.md` |
| Products, categories, availability, media, stock, costs, tech cards | `docs/agent/menu-tech-cards.md` |
| Cashier, payments, service fees, Accounting, expenses, Daily Bazaar | `docs/agent/payments-accounting.md` |
| Orders paid from salary, non-cash settlement, linked payroll | `docs/agent/salary-orders.md` |
| Employees, salaries, fines, absences, advances, KPI, employee meals | `docs/agent/payroll.md` |
| Attendance check-in screen and rotating QR | `docs/agent/attendance.md` |
| Telegram targets, messages, delivery tracking, cron notifications | `docs/agent/telegram.md` |
| Dashboard, reports, historical snapshots, profit and date ranges | `docs/agent/reporting.md` |
| AI assistant chat and datasets | `docs/agent/assistant.md` |
| Migrations, database compatibility, tests, source guards, deployment checks | `docs/agent/database-testing.md` |

`docs/agent/legacy-context.md` is the former guide; read it only for regressions absent from focused guides.

## Universal invariants

- Language changes update presentation only: never reload, remount pages, reset forms/filters, or refetch language-independent data. Keep translations out of data-loader dependencies; translate stored error codes at render time.

- Preserve historical financial data: paid order prices, costs, service rates, payments and reporting snapshots are immutable.
- Catalog deletion is archival; never physically delete products or categories referenced by history.
- Keep protected costs, recipes, payroll and accounting data out of public, waiter, cashier and Telegram-menu payloads.
- Use shared domain helpers; never duplicate payment, salary, date or reporting math in pages.
- Prefer focused selector hooks (`src/store/appHooks.js`); keep `AppContext.jsx` stable orchestration.
- No blocking `alert()`/`window.confirm()` in operational flows; show visible, retryable UI state.
- Loading data shows content-shaped shimmers (`PageShimmer.jsx`), never spinners/text (spinners only in a pressed button). Static UI (headings, forms) renders at once; only data-driven parts shimmer.
- Treat timeouts on idempotent writes as unknown outcomes; reconcile the durable record before retrying with the same identity.
- Never weaken a regression/source-guard test just to pass; understand what it protects.
- Preserve unrelated changes in a dirty worktree.
- PostgREST silently caps selects at 1000 rows. Multi-day or unbounded reads feeding a total, average or balance must page (`loadSalaryRows` in `src/lib/salaryData.js`, ordered by `id`) or aggregate in an RPC.

## Git publishing

- When the user requests a commit and push, the approved destination for this repository is `origin` (`git@github.com:Jasurbek-Shomurodov/zar-kebab-pos.git`), including branch `main`. Do not ask for destination confirmation again while this remote remains unchanged.
- This covers ordinary pushes of requested changes, never force pushes, unrelated changes, or secrets.

## Validation

For code changes, run the smallest relevant tests during development, then normally run:

```bash
npm test
npm run build
```

The known Vite large-chunk warning is not a build failure. Protected pages require an authenticated profile for browser verification.

When a change alters a documented invariant, route, RPC contract, historical-data rule, or focused test path, update the corresponding `docs/agent/` guide and `mcp/project-map.json` in the same change.

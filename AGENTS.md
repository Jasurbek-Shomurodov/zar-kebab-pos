# Zar Kebab POS Agent Guide

Read this file before changing code. It is deliberately short: load only the feature guide relevant to the task.

## Project essentials

Zar Kebab POS is a Vite/React 18 application backed by Supabase. It covers the public and Telegram menus, waiter ordering, kitchen checks, cashier billing, admin, reporting, accounting, payroll, and Telegram notifications.

Core locations:

- Routes: `src/App.jsx`
- Shared POS orchestration: `src/store/AppContext.jsx`
- Domain reducers: `src/store/`
- Supabase reads, writes, and realtime: `src/lib/db.js`
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

Use `npm run db:health` first for endless loading or missing migration/RPC warnings.

For repository navigation:

- If the symbol or filename is known, use `rg` and read only the matching range.
- For an unfamiliar feature, use `repo_nav` to find the feature map, declarations, and focused tests before opening source.
- Do not begin by reading an entire large page, `src/lib/db.js`, or a complete source-guard suite.
- `README.md` is an operator/deployment runbook. Read it only for Telegram setup or deployment work.

## Read only the relevant guide

Before editing a feature, read its guide completely. Read more than one only when the task genuinely crosses those boundaries.

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
| Migrations, database compatibility, tests, source guards, deployment checks | `docs/agent/database-testing.md` |

`docs/agent/legacy-context.md` keeps the former 58 KB guide; read it only for older regressions or migrations absent from focused guides.

## Universal invariants

- Language changes update presentation only: never reload, remount pages, reset forms/filters, or refetch language-independent data. Keep translations out of data-loader dependencies; translate stored error codes at render time.

- Preserve historical financial data. Paid order prices, costs, service rates, payment amounts, and reporting snapshots are immutable inputs.
- Catalog deletion is archival. Do not physically delete products or categories referenced by history.
- Keep protected costs, recipes, payroll, and accounting data out of public, waiter, cashier, and Telegram-menu payloads.
- Use shared domain helpers instead of duplicating payment, salary, date, or reporting calculations in pages.
- Prefer focused selector hooks in `src/store/appHooks.js`; keep `AppContext.jsx` as stable orchestration.
- Do not use blocking `alert()` or `window.confirm()` in operational flows. Show visible, retryable UI state.
- Treat network timeouts on idempotent writes as unknown outcomes and reconcile the durable record before retrying with the same identity.
- Do not weaken a regression/source-guard test merely to make the suite pass; understand the protected behavior first.
- Preserve unrelated user changes in a dirty worktree.
- PostgREST silently caps each select at 1000 rows. Multi-day or unbounded reads feeding a total, average, or balance must page (`loadSalaryRows` in `src/lib/salaryData.js`, ordered by `id`) or aggregate in an RPC.

## Git publishing

- When the user requests a commit and push, the approved destination for this repository is `origin` (`git@github.com:exampleschool23/zar-kebab-pos.git`), including branch `main`. Do not ask for destination confirmation again while this remote remains unchanged.
- This covers ordinary pushes of requested changes, never force pushes, unrelated changes, or secrets.

## Validation

For code changes, run the smallest relevant tests during development, then normally run:

```bash
npm test
npm run build
```

The known Vite large-chunk warning is not a build failure. Protected pages require an authenticated profile for browser verification.

When a change alters a documented invariant, route, RPC contract, historical-data rule, or focused test path, update the corresponding `docs/agent/` guide and `mcp/project-map.json` in the same change.

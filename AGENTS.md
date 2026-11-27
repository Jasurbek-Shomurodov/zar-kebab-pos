# Zar Kebab POS Agent Guide

Read this before changing code, then only the relevant guide.

## Project essentials

Vite/React 18 on Supabase: menus, ordering, kitchen, billing, reporting, accounting, payroll, Telegram.

Core: routes `src/App.jsx`; orchestration `src/store/AppContext.jsx`; reducers `src/store/`; Supabase `src/lib/db.js`; payment math `src/lib/analytics.js`; SQL `migrations/`; tests `tests/`.

`npm run dev`; run `npm run db:health` first for endless loading or missing migration/RPC warnings.

Navigation:

- If the symbol or filename is known, use `rg` and read only the matching range.
- For an unfamiliar feature, use `repo_nav` (feature map, declarations, focused tests) before opening source.
- Never start by reading a whole large page, `src/lib/db.js`, or a full source-guard suite.
- `README.md` (operator runbook): only for Telegram setup or deploys.

## Read only the relevant guide

Read it fully; read more only when a task crosses areas.

| Task area | Required guide |
| --- | --- |
| App startup, auth, shared state, realtime, permissions, routes | `docs/agent/architecture.md` |
| Waiter tables, cart, price mode, kitchen submission/checks, reservations | `docs/agent/ordering-kitchen.md` |
| Products, categories, availability, media, stock, costs, tech cards | `docs/agent/menu-tech-cards.md` |
| Equipment Inventory | `docs/agent/inventory.md` |
| Cashier, payments, service fees, Accounting, expenses, Daily Bazaar | `docs/agent/payments-accounting.md` |
| Orders paid from salary, non-cash settlement, linked payroll | `docs/agent/salary-orders.md` |
| Employees, salaries, fines, absences, advances, KPI, employee meals | `docs/agent/payroll.md` |
| Attendance check-in screen and rotating QR | `docs/agent/attendance.md` |
| Telegram targets, messages, delivery, cron | `docs/agent/telegram.md` |
| Yandex/2GIS menus, reviews | `docs/agent/maps-sync.md` |
| Dashboard, reports, historical snapshots, profit and date ranges | `docs/agent/reporting.md` |
| AI assistant chat and datasets | `docs/agent/assistant.md` |
| Migrations, DB compatibility, tests, source guards, deployment checks | `docs/agent/database-testing.md` |

UI rules: `DESIGN.md`.

`docs/agent/legacy-context.md` (former guide): only for regressions absent from focused guides.

## Universal invariants

- Language changes update presentation only: no reload, remount, form/filter reset or refetch. Keep translations out of loader dependencies; translate stored error codes at render.
- Preserve historical financial data: paid order prices, costs, service rates, payments and reporting snapshots are immutable.
- Catalog deletion is archival; never physically delete products or categories referenced by history.
- Keep costs, recipes, payroll and accounting data out of public, waiter, cashier and Telegram payloads.
- Use shared domain helpers; never duplicate payment, salary, date or reporting math in pages.
- Prefer focused selector hooks (`src/store/appHooks.js`); keep `AppContext.jsx` stable orchestration.
- No `alert()`/`window.confirm()`; show visible, retryable UI state.
- Loading shows content-shaped shimmers (`PageShimmer.jsx`), never spinners/text (except a pressed button). Static UI renders at once.
- A timed-out idempotent write is an unknown outcome: reconcile the record before retrying with the same ID.
- Never weaken a regression/source-guard test to pass.
- Keep unrelated changes in a dirty worktree.
- PostgREST caps selects at 1000 rows: reads feeding a total, average or balance page (`loadSalaryRows` in `src/lib/salaryData.js`, by `id`) or aggregate in an RPC.

## Git publishing

- Requested commits push to `origin` (`git@github.com:Jasurbek-Shomurodov/zar-kebab-pos.git`), including `main`, without re-confirming. Never force pushes, unrelated changes or secrets.
- Push only via a Haiku (`claude-haiku-5-5`) agent or session, never the default.

## Validation

Run the smallest relevant tests while developing, then `npm test` and `npm run build`. CI (`.github/workflows/checks.yml`) adds the audit, docs check and coverage floor; see `docs/ci.md`.

The Vite large-chunk warning is not a failure. Protected pages need a signed-in browser.

When a change alters a documented invariant, route, RPC contract, historical-data rule, or focused test path, update the corresponding `docs/agent/` guide and `mcp/project-map.json` in the same change.

## Commit author and where work runs (user's rule, 27 Nov 2026)

- Commit as this checkout's git identity (Jasurbek), never as Claude: no `--author`, no `GIT_AUTHOR_*`/`GIT_COMMITTER_*`, no `Claude-Session:` trailer.
- Before pushing, check `git log --format='%h %an <%ae>' @{u}..HEAD`; re-author only your own unpushed commits (`git commit --amend --no-edit --reset-author`). Never rewrite pushed history.
- Work runs only on the user's Mac (`/Users/Jasurbek_Shomurodov/Desktop/<repo>`): no cloud sessions or routines. Elsewhere (or `CLAUDE_CODE_REMOTE` set), don't commit or push; tell the user.

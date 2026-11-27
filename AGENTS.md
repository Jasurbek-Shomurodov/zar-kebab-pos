# Zar Kebab POS Agent Guide

Read this before changing code; then load only the relevant feature guide.

## Project essentials

Zar Kebab POS is a Vite/React 18 app on Supabase: menus, ordering, kitchen checks, billing, admin, reporting, accounting, payroll and Telegram.

Core:

- Routes: `src/App.jsx`
- Shared POS orchestration: `src/store/AppContext.jsx`
- Domain reducers: `src/store/`
- Supabase reads/writes/realtime: `src/lib/db.js`
- Payment and service math: `src/lib/analytics.js`
- SQL migrations: `migrations/`
- Tests: `tests/`

From the root:

```bash
npm run dev
npm run db:health
```

Run `npm run db:health` first for endless loading or missing migration/RPC warnings.

For repository navigation:

- If the symbol or filename is known, use `rg` and read only the matching range.
- For an unfamiliar feature, use `repo_nav` to find the feature map, declarations, and focused tests before opening source.
- Never start by reading a whole large page, `src/lib/db.js`, or a full source-guard suite.
- `README.md` (operator runbook): only for Telegram setup or deploys.

## Read only the relevant guide

Read the guide fully; read more only when a task crosses boundaries.

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

- For a requested commit and push, the approved destination is `origin` (`git@github.com:Jasurbek-Shomurodov/zar-kebab-pos.git`), including `main`; don't re-confirm while this remote is unchanged.
- Ordinary pushes of requested changes only: never force pushes, unrelated changes, or secrets.
- Push only via a Haiku (`claude-haiku-5-5`) agent or session, never the default.

## Validation

Run the smallest relevant tests while developing, then `npm test` and `npm run build`. CI (`.github/workflows/checks.yml`) adds the audit, docs check and coverage floor; see `docs/ci.md`.

The Vite large-chunk warning is not a build failure. Browser checks of protected pages need a signed-in profile.

When a change alters a documented invariant, route, RPC contract, historical-data rule, or focused test path, update the corresponding `docs/agent/` guide and `mcp/project-map.json` in the same change.

## Commit author and where work runs (the user's rule, 27 November 2026)

- **Commits carry the user's name, never Claude's.** Every commit is authored and committed by this checkout's own git identity (`git config user.name` / `user.email`: Jasurbek, `dangerhoggish@gmail.com`). Never commit as `Claude <noreply@anthropic.com>`, never pass `--author`, and never set `GIT_AUTHOR_*` / `GIT_COMMITTER_*`. A `Co-Authored-By:` trailer is fine; do not add a `Claude-Session:` trailer.
- Before every push, check `git log --format='%h %an <%ae>' @{u}..HEAD`. If one of *your own* unpushed commits shows Claude as author, fix it with `git commit --amend --no-edit --reset-author` (or a rebase of only those commits). Run `git log -1` first: never amend a commit someone else (a scheduled task, the user) made on top of yours. Pushed history is not rewritten.
- **Work runs on the user's Mac only**, in `/Users/Jasurbek_Shomurodov/Desktop/<repo>`. Do not start cloud sessions (claude.ai/code, `target: "cloud"`, move-to-cloud) or cloud routines/reminders (`RemoteTrigger`); anything scheduled is a local scheduled task on this Mac. If you find yourself running anywhere else (the working directory is not under `/Users/Jasurbek_Shomurodov/`, or `CLAUDE_CODE_REMOTE` is set), make no commits or pushes: stop and tell the user to run the task locally.

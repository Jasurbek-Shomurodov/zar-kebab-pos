---
name: cr
description: Deep code review of the uncommitted diff, a commit range, a branch or a PR in Zar Kebab POS. Checks correctness, payment and payroll math, historical snapshots, permissions/RLS, migrations, translations, formatting, loading states, realtime, network and data fetching, performance, running cost, Supabase/database optimization and schema unification, cleanup, DRY and SOLID. Arguments: empty or "full", "diff", a commit, "A..B", a branch, a PR number, a path, or an area code (HIST, ARCH, PROT, MATH, PERM, RPC, PAGE, I18N, STORE, MIG, SEC, DOCS, UI, NET, RT, PERF, DRY, COST, DB, TEST). Use when the user types /cr.
argument-hint: "[empty = full | diff | commit | A..B | branch | PR number | path | area code (HIST, ARCH, PROT, MATH, PERM, RPC, PAGE, I18N, STORE, MIG, SEC, DOCS, UI, NET, RT, PERF, DRY, COST, DB, TEST)] [fix]"
disable-model-invocation: true
---

# /cr: code review

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Zar Kebab POS.

Target: `$ARGUMENTS` (grammar in `review-core` section 1).

Sources of truth, read before every review: `AGENTS.md` (the invariants), the
`docs/agent/*.md` guide for each area the target touches, and
`references/cases.md`, the code regression catalog. Every case there has a
Check and an Expect; an area code as the target runs that area's cases across
the whole codebase. Keep the catalog alive per `review-core` section 6.

- Empty or `full`: the whole codebase. Fan out per `review-core` section 5
  with these groups: ordering and kitchen; cashier, payments and accounting;
  payroll, KPI and reporting; menu, Tech Cards and Bazaar; Telegram, bots and
  `api/`; database, migrations and `src/lib/db.js`. Each group runs every
  pass below over its area; the parent merges and re-verifies.
- `diff`: uncommitted changes (`git diff HEAD` plus untracked files).
  If the tree is clean, review the last commit.
- A commit, `A..B` range, or branch: `git diff` against it.
- A number: the GitHub PR (`gh pr view <n>`, `gh pr diff <n>`).
- A path or glob: those files plus their direct imports and callers.
- If the arguments contain `fix`, apply the confirmed fixes after the review
  (`review-core` section 4). Otherwise review only.

Read every changed file in full, not just the hunks, plus the callers and
callees of every changed function. Large files (`src/lib/db.js`, big pages,
source-guard suites) are read by range: find the symbol with `rg` or the
`repo_nav` MCP tool first. Load the `docs/agent/` guide for each area the diff
touches (table in `AGENTS.md`). Report only findings you have verified in the
code. Give each one a concrete failure scenario (inputs or state, then the
wrong result). No style nitpicks.

## Review passes

### 1. Intent

What was the change meant to do (commit message, PR body, user request)? Does
the code actually do it, completely? Look for leftovers: dead code, unused
exports or translation keys, TODOs, debug `console.log`.

### 2. Correctness and logic

- Off-by-one errors and ranges, empty arrays, `null`/`undefined` from Supabase,
  `Number()` on formatted strings, NaN, division by zero, rounding of sums and
  service fees.
- React: stale closures, missing effect dependencies, state updates after
  unmount, list keys, races between fast table/date/order switches.
- Async: unhandled rejections, missing `error` checks on Supabase results,
  partial failure leaving the UI or the order inconsistent.

### 3. Project invariants (`AGENTS.md`, non-negotiable)

1. Historical financial data is immutable: paid order prices, costs, service
   rates, payments, sold-item Tech Card snapshots and reporting snapshots are
   never recomputed or rewritten from current catalog values.
2. Catalog deletion is archival; products and categories referenced by history
   are never physically deleted.
3. Protected costs, recipes, payroll and accounting data stay out of public,
   waiter, cashier and Telegram-menu payloads (check the `select` columns and
   RPCs, not just the UI).
4. Payment, service, salary, date and reporting math comes from shared helpers
   (`src/lib/analytics.js`, `src/lib/accounting*.js`, `src/lib/salary*.js`,
   `src/lib/dailyKpi.js`, `src/lib/dateFormat.js`, ...), never duplicated in a
   page.
5. Role and feature rules live in `src/lib/permissions.js` and are enforced by
   RLS/RPCs too. A UI-only permission check is a hole.
6. Multi-table writes use the atomic RPCs (kitchen submit, menu item + protected
   cost, Tech Cards, Daily Bazaar, payment corrections), not several browser
   writes.
7. Timeouts on idempotent writes are unknown outcomes: reuse the same
   request/round id and reconcile the durable record before retrying. No
   automatic write retries.
8. PostgREST caps selects at 1000 rows. Multi-day or unbounded reads feeding a
   total, average or balance page (ordered by `id`, like `loadSalaryRows`) or
   aggregate in an RPC.
9. Language changes update presentation only: no reload, remount, form reset
   or refetch. Translations are not data-loader dependencies; stored error codes
   are translated at render time.
10. `AppContext.jsx` stays orchestration: `dbDispatch` stays in `useCallback`,
    `ProfileSync` dependencies stay field-based, realtime channel names stay
    unique. New state access goes through selectors in `src/store/appHooks.js`.
11. Database changes ship as a new numbered migration; applied migrations are
    never edited. A migration the UI depends on is noted as "apply before UI".
12. No service-role key, Telegram token or other secret in `src/`, logs or
    fixtures; `api/` handlers authenticate the caller before using service
    credentials.
13. A change to a documented invariant, route, RPC contract or focused test
    path updates the matching `docs/agent/` guide and `mcp/project-map.json`.

### 4. UI conventions

- Data loading shows content-shaped shimmers (`PageShimmer.jsx`,
  `OperationalLoading`), never spinners or "Loading..." text; spinners only
  inside a pressed button. Static UI (headings, forms) renders at once.
- Errors are visible and retryable (`OperationalError`). No `alert()`,
  `window.confirm()` or native confirmation dialogs in operational flows.
- Money via `formatCurrency` and `formatMoneyInput`/`numberFromMoneyInput`
  (`src/lib/moneyInput.js`); dates and times via `src/lib/dateFormat.js` in the
  restaurant time zone (`Asia/Tashkent`), never ad hoc `new Date()` math or
  `toLocaleString`.
- Every visible string goes through `t`/`tf` in `src/lib/i18n.js` with keys in
  `uz`, `ru` and `en`; menu text via `getItemName`/`getCategoryName`.
- Colours: brand orange and the `ws-*` tokens. New hard-coded neutral classes
  must be ones `scripts/build-dark-theme.mjs` remaps, or dark mode breaks.

### 5. Tests

Do the tests cover the new logic and its edge cases? Does a source guard
protect the touched behaviour, and was it weakened? Run:

```bash
node --test tests/<changed or related>.test.js
npm test
```

Run `npm run build` for routing, config or shared-module changes, and
`npm run docs:check` when docs or `mcp/project-map.json` changed. A failing
check is a finding. The Vite large-chunk warning is not.

### 6. Network and data fetching

For every Supabase query, RPC, realtime subscription, `fetch` and `api/`
handler the change touches or calls:

- **Waterfalls**: independent queries awaited one after another instead of
  `Promise.all`.
- **N+1 and duplicates**: queries inside loops or per table/order/card, the
  same data fetched by sibling components, refetching what realtime already
  delivers, refetching on every render or focus.
- **Payload**: `select('*')` or unused columns (and protected columns on public
  paths), missing date filters, missing paging past 1000 rows, large payloads
  that only feed a total.
- **Realtime**: subscriptions cleaned up on unmount, unique channel names, no
  duplicate handlers after reconnect, events reconciled with local optimistic
  state.
- **Races and staleness**: stale responses not ignored when the table, date or
  filter changes fast; optimistic UI never rolled back.
- **Failure handling**: unchecked `error`, missing `withReadTimeout` /
  `withWriteTimeout`, no retry or error state, partial writes. Writes must be
  idempotent or atomic where a double tap or retry can repeat them (kitchen
  rounds, payments).
- **API routes**: caller authentication, input validation (zod), correct status
  codes, no secrets or stack traces in responses, cron/Telegram endpoints
  protected.

If the app is reachable, confirm the suspicion with `read_network_requests`
(request count, order, timing, size) rather than guessing.

### 7. Performance

- Expensive derivations recomputed every render, unstable props or callbacks
  that defeat memoized children, context consumers re-rendering the whole POS
  on every order event (use a focused selector).
- O(n²) work over orders or items (`filter` inside `map`). Index once with a
  `Map`.
- Long lists rendered in full where paging or virtualization is needed.
- Heavy libraries (`exceljs`, `jspdf`, `qrcode`, charts) imported statically
  into routes that rarely need them instead of `import()`.
- Aggregation that belongs in SQL/RPC instead of downloading every row.

### 8. Cleanup, DRY and SOLID

**Cleanup**: unused imports, variables, exports, props, CSS and translation
keys; commented-out code; stale comments; misleading names; leftover
`console.log`; files or components that grew past one clear purpose.

**DRY**: the same markup, formula, query or formatting repeated in two or more
places. Point to the existing helper to reuse (`src/components/*`, `src/lib/*`,
`src/store/appHooks.js`), or name the shared home for a new one. Do not merge
code that only looks alike but changes for different reasons.

**SOLID** (only when it causes a real cost):
- *Single responsibility*: a page that fetches, calculates and renders at once.
  Move math to `src/lib` and queries to `db.js` or a hook.
- *Open/closed*: another boolean flag or `if (role === ...)` per new caller.
  Prefer composition or a config map.
- *Interface segregation*: props that force callers to pass unused values;
  wrappers that drop `className`, `aria-*` or `ref`.
- *Dependency inversion*: UI coupled directly to table shapes or the Supabase
  client where a `db.js` helper or RPC should sit in between.

Every finding here needs a concrete cost (bug risk, duplicated maintenance, a
measurable slowdown, or blocked testing) plus the smallest refactor that
removes it. Skip pure taste.

### 9. Supabase, database and running cost

Review every migration, RPC, trigger, policy and query the change adds or
touches. The project's Supabase MCP server (`.mcp.json`) is read-only: use it
for `list_tables`, `execute_sql` with `EXPLAIN` on read queries, and
`get_advisors` (performance and security) to back findings with real plans and
sizes. Never run writes or DDL through it.

**Running cost** (Supabase, Vercel, Telegram, AI, R2): name the multiplier
(per order, per table tile, per minute, per open tab) and the estimated volume.
- Egress and row reads: wide selects, refetch-after-write when the write
  already returns the row, full reloads on every realtime event, data that
  could be cached for the session (menu, settings, employees).
- Realtime: subscriptions on high-churn tables without a filter, one channel
  per component instead of one shared, events that trigger a full refetch.
- Polling with `setInterval` where realtime or a cron already covers it;
  intervals shorter than the data actually changes.
- Cron and queues: `pg_cron` jobs running every minute that could run less
  often or only when work exists; dispatchers that scan whole tables instead of
  an indexed "pending" slice; Telegram sends that could be batched.
- Serverless (`api/`): cold-start-heavy imports, one invocation per item where
  one batch call works, retries that multiply calls.
- AI assistant: model choice (cheapest model that does the job), prompt and
  dataset size, missing caching, unbounded history.
- Storage: images uploaded without resizing (`optimize:menu-images`), unused
  objects never deleted, duplicated media.

**Query and database performance**
- Indexes: every new `where`, `order by`, join or FK column on a growing table
  (orders, order items, payments, salary, attendance, notification queues) has a
  matching index; composite order matches the filter. Flag unused or duplicate
  indexes the change adds.
- `EXPLAIN` new or changed hot queries and RPCs: seq scans on large tables,
  sorts without an index, nested loops over big sets.
- RLS cost: wrap `auth.uid()` and permission helpers as `(select ...)` so they
  run once per query, keep policy helpers `stable` and `security definer` with a
  fixed `search_path`, index the columns policies filter on.
- Paging: keyset by `id` for big reads instead of large `offset`; aggregate in
  SQL instead of sending rows to the browser to sum.
- Writes: batch inserts and upserts instead of row-by-row calls; triggers that
  do heavy work or call `net.http_post` per row; long transactions holding locks
  on orders during payment.
- Snapshots: heavy reports read stored snapshots rather than recomputing years
  of history on every page view, without rewriting historical values.
- Types and constraints: `numeric` for money (never `float`), `timestamptz`
  for instants and `date` for business days, `not null`, FKs, `check` and
  unique constraints that make bad data impossible instead of UI-only checks.

**Schema unification (reuse before adding)**
Before accepting a new table, column, enum, RPC or trigger, search `migrations/`
and `src/lib/db.js` for an existing model of the same concept and prefer it:
- Similar concepts share one model: notification and Telegram delivery queues,
  Investor alerts, audit logs, financial snapshots, settings, status enums and
  feature flags follow the existing table and column pattern (or one generic
  table with a `kind` column) rather than a new parallel table per feature.
- Near-identical RPCs or triggers (same body, different table or filter) become
  one function with a parameter.
- Consistent naming and shapes: `created_at`/`created_by`, status values,
  snapshot column names, money and date types match the neighbouring tables, so
  shared helpers and reports work on all of them.
- New columns that duplicate data already derivable from an existing table are
  a finding unless they are a deliberate historical snapshot.
- Report existing duplication the change makes worse, and propose the
  consolidation with a safe path: a new migration, backfill, compatibility
  view or fallback, then drop the old shape later, never in one breaking step.
- Do not unify things that only look alike but have different lifecycles,
  permissions or retention (for example immutable payment history vs editable
  settings).

Each finding names the cost or risk (rows/requests per day, query time, extra
maintenance) and the smallest change that removes it.

## Report

Use the skeleton from `review-core` section 3 (`CR: <target>`, commit,
checks, findings as `[S0|S1|S2]` with Scenario, Fix and Verified, then
Suggestions, Checked not a finding, Not run). Under "Checked, not a finding"
name the risky areas you verified: network, performance, cost, DB/schema,
DRY/SOLID.

Severity here: **S0** = wrong money, payroll or data, a rewritten historical
snapshot, a permission or protected-data leak, data loss, a double charge or
duplicate kitchen round, or a broken build or check. **S1** = an `AGENTS.md`
invariant or a convention above broken, or a real risk (race, unbounded read,
realtime leak, duplicated financial rule). **S2** = cleanup and
maintainability. With `fix`: `review-core` section 4, re-run the checks,
then report what changed. Do not commit unless asked.

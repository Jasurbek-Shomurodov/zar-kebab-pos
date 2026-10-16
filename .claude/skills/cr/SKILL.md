---
name: cr
description: Deep code review of the uncommitted diff, a commit range, a branch or a PR in Zar Kebab POS. Checks correctness, payment and payroll math, historical snapshots, permissions/RLS, migrations, translations, formatting, loading states, realtime, network and data fetching, performance, cleanup, DRY and SOLID. Use when the user types /cr.
argument-hint: "[empty = uncommitted diff | commit | A..B | branch | PR number] [fix]"
disable-model-invocation: true
---

# /cr: code review

Target: `$ARGUMENTS`.

- Empty: uncommitted changes (`git diff HEAD` plus untracked files).
  If the tree is clean, review the last commit.
- A commit, `A..B` range, or branch: `git diff` against it.
- A number: the GitHub PR (`gh pr view <n>`, `gh pr diff <n>`).
- If the arguments contain `fix`, apply the confirmed fixes after the review.
  Otherwise review only.

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

## Report

```
CR: <target>   Verdict: APPROVE | APPROVE WITH NITS | CHANGES REQUESTED

Findings (most severe first)
1. [Blocker|Major|Minor|Nit] file:line: <defect in one sentence>
   Scenario: <inputs or state → wrong result>
   Fix: <concrete change>

Checked and fine: <risky areas verified, incl. network, performance, DRY/SOLID>
Checks run: <commands and results>
```

**Blocker** = wrong money/payroll/data, a rewritten historical snapshot, a
permission or protected-data leak, data loss, a double charge or duplicate
kitchen round, or a broken build. With `fix`: apply the fixes, re-run the
checks, then report what changed. Do not commit unless asked.

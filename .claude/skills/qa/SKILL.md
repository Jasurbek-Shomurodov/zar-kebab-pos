---
name: qa
description: Thorough functional QA of a feature, page, request or recent change in Zar Kebab POS. Tests the real app end to end (ordering, kitchen, cashier payments, totals, payroll, permissions, locales, themes, edge cases) and reports pass/fail with evidence. Arguments: empty or "full", "diff", a feature, page or request text, a commit, a PR, "smoke", "retest", or an area code (ORD, KIT, CASH, PAY, SAL, ATT, MENU, PUB, REP, ADMIN, TG, I18N, UI, RT, NET). Use when the user types /qa.
argument-hint: "[empty = full | diff | feature, page or request text | commit | PR | smoke | retest | area code (ORD, KIT, CASH, PAY, SAL, ATT, MENU, PUB, REP, ADMIN, TG, I18N, UI, RT, NET)] [fix]"
disable-model-invocation: true
---

# /qa: functional QA

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Zar Kebab POS.

Target: `$ARGUMENTS` (grammar in `review-core` section 1). Empty or `full`
means every page and the whole checklist below; `diff` means whatever the
uncommitted diff (or else the last commit) changed; a feature, page or
request text means that flow end to end; `smoke` runs only the S0 scenarios
(send to kitchen, mark paid, totals, protected data in public payloads).

Sources of truth: `AGENTS.md` (the invariants), the `docs/agent/*.md` guide
for the area, and `references/cases.md`, the QA regression catalog. An area
code as the target runs that area's cases; `smoke` runs every S0 case;
`retest` starts from the top row of the catalog run log. Keep the catalog
alive per `review-core` section 6.

Your job is to prove the feature works for real restaurant staff (owner, admin,
waiter, cashier, viewer, guest), or to find exactly where it does not. Do not
stop at "tests pass". Investigate until every item in the checklist below is
either verified with evidence or explicitly marked as not testable, with the
reason.

Default to **report only**. Fix bugs only if the arguments contain `fix`
(`review-core` section 4), or after asking at the end.

## 1. Understand what "correct" means

1. Restate the request in one or two sentences: what the user should be able
   to do, and what they should see.
2. Find the change: `git status`, `git diff`, `git log -5 --stat`, or the
   named commit/PR (`gh pr view`, `gh pr diff`).
3. Read only the `docs/agent/` guides the change touches (table in
   `AGENTS.md`): ordering → `ordering-kitchen.md`, payments → `payments-accounting.md`,
   payroll → `payroll.md`, reports → `reporting.md`, menu → `menu-tech-cards.md`,
   Telegram → `telegram.md`, DB → `database-testing.md`.
4. Trace the code path end to end: page → `src/store` reducer / `appHooks` →
   `src/lib/db.js` query or RPC → `src/lib` helper → rendering. Write down the
   expected values for the cases you will test **before** looking at the screen.
5. If the change depends on a migration, check it is applied: `npm run
   db:health` (also the first step for endless loading or missing RPC warnings).

## 2. Automated checks

Run the narrowest related tests first, then the full suite:

```bash
node --test tests/<related>.test.js
npm test
```

Add `npm run build` for routing, config or shared-module changes, and
`npm run docs:check` when `docs/agent/` or `mcp/project-map.json` changed. Note
any missing test or source guard for new logic as a finding.

## 3. Drive the real app

The dev server normally runs on `http://localhost:5173` (otherwise use
`preview_start` with the `pos-dev` config in `.claude/launch.json`). It talks to
the **production** Supabase project, so every write is real restaurant data.
Staff pages require sign-in; `/menu` and `/telegram` are public.

- Prefer **Claude in Chrome** (the user's Chrome is already signed in). Work in
  a new tab.
- If only the built-in browser is available and it shows `/login`, ask the user
  to sign in there. Never type passwords or use Google sign-in yourself.
- Read-only checks are always fine: opening pages, comparing totals, switching
  dates, tabs, languages and themes, resizing, reading console and network.
- **Data safety: ask before every write.** Any action that could save, change
  or delete data needs the user's explicit "yes" in chat for that one action:
  send to kitchen, add/remove cart items on an open order, mark paid, split or
  correct a payment, delete an order, add an expense, Bazaar purchase, salary,
  fine, advance or attendance entry, menu/Tech Card/table edits, toggling a
  setting or feature access, or the double-tap test.
  - Before asking, name the page, action and exact values, e.g. "Waiter →
    table 12, send 1 × Lavash to kitchen, then cashier → mark paid 45 000 cash.
    Proceed?". Then stop and wait. Approval covers that action only.
  - Say which Telegram messages it will trigger: kitchen/order status, expense,
    salary and employee notifications, and Investor alerts for order deletes,
    payment corrections and ingredient changes.
  - It also changes today's dashboard, Accounting, KPI and payroll numbers;
    say so.
  - Never edit or delete records you did not create during this /qa run, and
    never touch paid historical orders.
  - List every write you made at the end of the report so the user can clean
    up (`npm run cleanup:test-operations` exists; run it only if the user asks).
- Never call `api/telegram/*` cron or webhook endpoints directly or force a
  resend.

For each scenario, use `get_page_text` or `read_page` for values and take
screenshots for anything visual.

### Checklist (cover everything that applies)

- **Happy path**: the main flow, done the way real staff do it (waiter on a
  phone, cashier on a tablet, owner on a laptop).
- **Numbers**: compare shown totals against your hand-computed expectation,
  including service fee, price mode, discounts, split payments and salary-paid
  orders. Cross-check places that must agree: bill ↔ receipt ↔ cashier history
  ↔ dashboard ↔ Reports ↔ Accounting ↔ payroll/KPI. Paid history must not change
  when today's menu prices or costs change.
- **Dates**: today, a past day and month, an empty range, the Tashkent day
  boundary and the KPI 4am cutoff. Future days must not be invented; ranges
  over 1000 rows must still total correctly.
- **Forms**: required fields, invalid input, zero, negative, very large amounts,
  `1 000 000` separators while typing, cancel, double tap (exactly one write or
  kitchen round), the visible error with retry.
- **States**: content-shaped shimmer while loading (no spinner, no "Loading"
  text), empty state, error with retry, slow network or offline then back
  (connection notice, no lost cart, no duplicate round).
- **Realtime**: with two tabs (waiter + cashier, or waiter + admin), an action
  in one appears in the other without reload, once.
- **Permissions**: owner, admin, viewer, guest/public and the relevant feature
  access. Protected costs, recipes, payroll and accounting must not appear in
  public, waiter, cashier or Telegram-menu pages or their network payloads.
- **Locales**: UZ, RU, EN. Switching language does not reload, reset forms or
  filters, or refetch data. No missing keys, no overflow in long RU/UZ strings,
  dates and money formatted for the language.
- **Themes**: light and dark (theme toggle). Nothing white-on-white or
  invisible.
- **Widths**: 375 px (phone), 768 px (tablet), 1280 px, 1920 px. No horizontal
  scroll, nothing clipped, touch targets usable. Receipts and kitchen checks
  still print-format correctly (see `PRINTING.md`).
- **Console**: `read_console_messages` for errors and React warnings.
- **Network**: `read_network_requests` on first load and after each key action.
  Record the request count, failures (4xx/5xx), duplicate or per-row (N+1)
  requests, serial waterfalls, slow responses (over ~1 s), oversized payloads
  and protected columns in public responses. Switch table, date or filter
  quickly: the last selection must win.
- **Regression**: nearby features that share the changed component, reducer or
  helper.

## 4. Report

Reply in this shape:

Use the skeleton from `review-core` section 3:

```
QA: <target>   Commit: <sha>   Verdict: PASS | PASS WITH ISSUES | FAIL
Environment: <URL, role, browser, widths, themes, locales>
Checks: node --test X/Y, build, docs:check: <results>

Findings (most severe first)
1. [S0|S1|S2] <page / file:line>: <what is wrong>
   Scenario: Steps ... Expected ... Actual ...   Evidence: screenshot / value / log
   Fix: <concrete change>
   Verified: <reproduced twice; how>

Verified: <scenario>: OK (how it was checked), one line each
Checked, not a finding: ...
Not run: <scenario>: <why>, e.g. needs a waiter account
Data left behind (each approved): <page, record, Telegram messages sent> or none
```

Severity here: **S0** = wrong money, payroll or data, a changed historical
record, a protected-data leak, a duplicate charge or kitchen round, or a
crash. **S1** = a broken flow or a misleading UI. **S2** = cosmetic. Finish
by offering to fix the bugs found.

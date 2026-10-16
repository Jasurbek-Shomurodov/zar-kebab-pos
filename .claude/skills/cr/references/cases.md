# Code regression catalog (Zar Kebab POS)

Severity if failed (`review-core` section 2): **S0** wrong money, payroll or
data, a rewritten historical snapshot, a permission or protected-data leak,
data loss, a double charge or duplicate kitchen round, or a broken check;
**S1** an `AGENTS.md` invariant or a convention broken, or a real risk; **S2**
maintainability. Each case says how to check it. IDs are stable; append,
never renumber. `[cr YYYY-MM-DD]` marks a case added from a finding in that
run; `Fixed YYYY-MM-DD` plus the guarding test closes it.

Large files (`src/lib/db.js`, big pages) are read by range: find the symbol
with `rg` or `repo_nav` first.

## Run log (newest first; `retest` starts from the top row)

| Date | Commit | Scope | Findings (S0/S1/S2) | Checks run | Not run |
|---|---|---|---|---|---|

## HIST — immutable financial history

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| HIST-001 | S0 | Paid order prices are never recomputed from the catalog | `rg -n "price" src/lib/orderHistory.js src/lib/cashierBills.js` and the receipt code | Paid rows read their stored price and snapshot; no lookup into current `menu_items` |
| HIST-002 | S0 | Costs and Tech Card snapshots on sold items stay as stored | `rg -n "snapshot" src/lib/db.js migrations/*.sql \| tail -40` | Sold-item snapshots are written at sale time and only read afterwards |
| HIST-003 | S0 | Service rates and payments are not rewritten | `rg -n "\.update\(" src/lib/db.js \| rg -i "payment\|service"` | Payment corrections insert a correcting row through the atomic RPC; no in-place update of a paid payment |
| HIST-004 | S0 | Reporting snapshots are read, not regenerated | Read `src/lib/db.js` loaders used by `Reports.jsx` and `AccountingHistory.jsx` | Historical ranges come from stored snapshots; recomputation is explicit and never overwrites |
| HIST-005 | S1 | A migration never backfills history from current values | Read any `update ... set` in the newest `migrations/*.sql` | Backfills touch only derived or new columns, never stored prices, costs or rates |

## ARCH — archival deletion

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ARCH-001 | S0 | Products and categories referenced by history are archived, not deleted | `rg -n "\.delete\(\)" src/lib/db.js \| rg -i "menu_items\|categories"` | No physical delete; `archived_at` or equivalent flag set |
| ARCH-002 | S1 | Archived items are hidden from menus but kept in history | Read the menu loaders and the order history loaders | Menu filters out archived; history joins still resolve names |
| ARCH-003 | S1 | Tables and employees follow the same rule | `rg -n "\.delete\(\)" src/lib/db.js` | Only rows with no financial history are physically deleted |

## PROT — protected data

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PROT-001 | S0 | Public menu payloads carry no costs or recipes | `rg -n "select\(" src/lib/db.js \| rg -i "menu"` and read the column lists for public loaders | No `cost`, `tech_card`, `recipe` or margin column on `/menu`, `/telegram` or waiter paths |
| PROT-002 | S0 | Waiter and cashier pages never load payroll or accounting | `rg -n "salary\|payroll\|accounting" src/pages/Waiter*.jsx src/pages/Cashier*.jsx` | No hit; permissions in `src/lib/permissions.js` deny the pages too |
| PROT-003 | S0 | RLS or RPCs enforce the same protection as the UI | For each protected table, find its policy in `migrations/` | Policy restricts by role; a UI-only check is a hole |
| PROT-004 | S1 | Telegram menu bot sends only public fields | Read `api/telegram/_lib` and the mini-app loaders | Same column set as the public menu |
| PROT-005 | S1 | Receipts show no cost data | Read `src/pages/Receipt.jsx`, `KitchenCheckReceipt.jsx` | Prices and totals only |

## MATH — shared domain helpers

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MATH-001 | S0 | Payment and service math only in `src/lib/analytics.js` | `rg -n "service" src/pages --type js -g "*.jsx" \| rg "\*\|/"` | No inline percentage math in a page; helpers imported |
| MATH-002 | S0 | Salary math only in `src/lib/salary*.js` | `rg -n "reduce\(" src/pages/Salaries.jsx src/pages/Employees.jsx src/pages/EmployeeSalaryHistory.jsx` | Sums come from the salary helpers, not page reducers |
| MATH-003 | S0 | Dates in Tashkent time through `src/lib/dateFormat.js` | `rg -n "new Date\(\)\.\|toLocaleString\|toLocaleDateString" src/pages src/components` | No ad hoc date math; `RESTAURANT_TIME_ZONE` helpers used |
| MATH-004 | S1 | Money input through `src/lib/moneyInput.js` | `rg -n "Number\(\|parseFloat\(" src/pages src/components` | Only `numberFromMoneyInput`; formatting via `formatMoneyInput` |
| MATH-005 | S1 | Reporting and KPI math reused | `rg -n "dailyKpi\|dashboardAnalytics\|accountingSummary" src/pages \| wc -l` vs inline sums | Reports, Dashboard and Accounting call the same helpers |
| MATH-006 | S1 | Rounding happens once | Read service-fee and split-payment rounding in `analytics.js` and `paidPaymentSplit.js` | One rounding step; splits sum to the bill |

## PERM — roles and permissions

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PERM-001 | S0 | Role and feature rules live in `src/lib/permissions.js` | `rg -n "role ===\|role !==" src/pages src/components` | Pages call the helpers; no inline role literals |
| PERM-002 | S0 | RLS mirrors `PAGE_ACCESS` and `FEATURE_DEFINITIONS` | Compare each feature with its policy or RPC guard in `migrations/` | Every write a role cannot do in the UI is refused by the database too |
| PERM-003 | S0 | `api/` handlers authenticate before using service credentials | Read `api/*/*.js` | Caller token verified, then service client; cron and webhook endpoints check their secret |
| PERM-004 | S1 | Feature access managers are the only ones who can grant access | Read `isFeatureAccessManager` callers and the matching policy | UI and policy agree |
| PERM-005 | S1 | Guest mode exposes nothing beyond the public menu | Read `src/lib/guestMode.js` and `GuestModeUI.jsx` | Guest routes are the public ones only |

## RPC — atomic writes and retries

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RPC-001 | S0 | Kitchen submit is one RPC with a round id | Read the submit path in `src/store` and `db.js` | One `rpc(` call per round; the round id is reused on retry |
| RPC-002 | S0 | Payment settlement is atomic | `rg -n "settle\|mark_paid" src/lib/db.js migrations/*.sql` | RPC inserts payment rows and closes the order in one transaction; `tests/atomicPaymentSettlement.test.js` covers it |
| RPC-003 | S0 | Menu item plus protected cost, Tech Cards and Daily Bazaar use their RPCs | `rg -n "\.rpc\(" src/lib/db.js \| rg -i "menu\|tech\|bazaar"` | No insert-then-update pairs from the browser |
| RPC-004 | S0 | Timeouts on writes are unknown outcomes | `rg -n "withWriteTimeout" src/lib/db.js` and the callers' catch blocks | On timeout the durable record is reconciled before any retry; no automatic write retry |
| RPC-005 | S1 | Idempotency keys on repeatable writes | Read the kitchen round and payment paths | Same identity on retry; a double tap cannot create two rounds or two payments |
| RPC-006 | S1 | Reads use `withReadTimeout` | `rg -n "withReadTimeout" src/lib/db.js \| wc -l` vs loaders | Loaders feeding operational pages have a timeout and a visible retry |

## PAGE — the 1000-row cap

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PAGE-001 | S0 | Multi-day reads feeding totals page or aggregate | List every loader used by Reports, Accounting, Salaries, KPI | Each pages by `id` like `loadSalaryRows` or aggregates in an RPC |
| PAGE-002 | S1 | New unbounded reads are caught | `rg -n "\.select\(" src/lib/db.js \| rg -v "limit\|range\|single\|maybeSingle"` | Each hit is bounded by date, limit, or paging |
| PAGE-003 | S1 | Paging is ordered by `id` | Read `loadSalaryRows` callers | Keyset by `id`; no `offset` paging on large tables |

## I18N — language

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| I18N-001 | S1 | Language change updates presentation only | `rg -n "lang" src/pages src/store \| rg "useEffect\|deps\|\]\)"` | `lang`/`t` not in data-loader dependencies; no reload, remount or refetch on switch |
| I18N-002 | S1 | Stored error codes translate at render time | `rg -n "t\(" src/lib/db.js src/store` | No translated text stored or dispatched; codes translated in components |
| I18N-003 | S1 | Every key exists in `uz`, `ru`, `en` | Script diffing the key sets in `src/lib/i18n.js` | Identical sets |
| I18N-004 | S1 | No literal user-facing strings | `rg -n ">[A-Za-zА-Яа-я][^<{]{3,}<" src/pages src/components` | Everything through `t`/`tf`; menu text via `getItemName`/`getCategoryName` |

## STORE — shared state

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| STORE-001 | S1 | `dbDispatch` stays in `useCallback` | `rg -n "dbDispatch" src/store/AppContext.jsx` | Wrapped; dependencies stable |
| STORE-002 | S1 | `ProfileSync` dependencies are field-based | Read `ProfileSync` in `AppContext.jsx` | Primitive fields, not the whole profile object |
| STORE-003 | S1 | Realtime channel names are unique | `rg -n "\.channel\(" src` | Each name includes a scope (table, order id, page); no two components share one |
| STORE-004 | S1 | New state access goes through `src/store/appHooks.js` | `rg -n "useContext\(AppContext\)\|useApp\(\)" src/pages src/components` | Focused selector hooks; no whole-context consumers in hot pages |
| STORE-005 | S2 | Reducers stay pure | Read `src/store/*.js` | No side effects or Supabase calls in reducers |

## MIG — migrations

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MIG-001 | S0 | Applied migrations are never edited | `git diff --stat HEAD~20 -- migrations/` | Only new files with the next number |
| MIG-002 | S0 | Numbers unique and ordered | `ls migrations \| cut -d_ -f1 \| sort \| uniq -d` | Empty |
| MIG-003 | S1 | A migration the UI depends on is flagged | Read the commit message or PR body | "apply before UI" noted; `npm run db:health` detects the missing RPC |
| MIG-004 | S1 | New tables follow the neighbours' shape | Read the new `create table` | `created_at`/`created_by`, `numeric` money, `timestamptz` instants, `date` business days, `not null`, FKs, `check` constraints |
| MIG-005 | S1 | `security definer` functions are hardened | `rg -n "security definer" migrations \| wc -l` vs `set search_path` | Every one sets `search_path` and uses `(select auth.uid())` |
| MIG-006 | S1 | Migration tests exist | `ls tests/*Migration*.test.js` vs newest migrations | A test reads each new migration and asserts its objects |

## SEC — secrets and request safety

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SEC-001 | S0 | No secret in `src/`, logs or fixtures | `rg -n "SERVICE_ROLE\|bot[0-9]{8,}:\|sk-" src tests` | No hit; service keys only in `api/` through `process.env` |
| SEC-002 | S0 | `api/` validates input with zod and hides internals | Read `api/*/*.js` | Schema parse, 4xx on bad input, no stack trace or Supabase details returned |
| SEC-003 | S0 | Telegram webhook verifies its secret token | Read `api/telegram/webhook.js` | Header compared before parsing the update |
| SEC-004 | S1 | Logs carry no personal or financial data | `rg -n "console\.(log\|error\|warn)" api src/lib` | Ids and stages only |
| SEC-005 | S1 | Image upload is bounded and typed | Read `api/menu-image/upload.js` | Size cap and MIME check before storing |

## DOCS — documentation in the same change

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DOCS-001 | S1 | Changed invariants, routes, RPCs or focused tests update the guide | Diff `docs/agent/*.md` and `mcp/project-map.json` alongside the code diff | The matching guide and map entries changed |
| DOCS-002 | S1 | `npm run docs:check` passes | `npm run docs:check` | Green |
| DOCS-003 | S2 | Guides stay bounded | `wc -c docs/agent/*.md` | Each under 6 500 characters; `AGENTS.md` under 5 000 |

## UI — conventions

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| UI-001 | S1 | Data loading shows content-shaped shimmers | `rg -n "animate-spin\|Loading\.\.\.\|Yuklanmoqda\|Загрузка" src/pages src/components` | No hit outside a pressed button; `PageShimmer`/`OperationalLoading` used |
| UI-002 | S1 | No blocking dialogs | `rg -n "window\.(confirm\|alert)\|\balert\(" src` | No hit |
| UI-003 | S1 | Errors are visible and retryable | `rg -L "OperationalError\|OperationalState" src/pages/*.jsx` | No data page listed |
| UI-004 | S1 | Money through `formatCurrency` | `rg -n "toFixed\(\|toLocaleString" src/pages src/components` | No hit |
| UI-005 | S1 | Native date inputs absent | `rg -n 'type="(date\|month\|time)"' src` | No hit; `CalendarPicker`/`DateRangePicker`/`TimePicker24` |
| UI-006 | S1 | New neutral classes are remapped for dark mode | Compare new `bg-gray-*`/`text-gray-*` classes with `scripts/build-dark-theme.mjs` | Each class is in the remap or uses `ws-*` tokens |

## NET — network and data fetching

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| NET-001 | S1 | Independent loads run in parallel | Read page load effects | `Promise.all`; no serial waterfall |
| NET-002 | S1 | No query per table tile, order or card | `rg -n "await" src/pages \| rg -B3 "\.map\("` | None; one query per table per load |
| NET-003 | S1 | Supabase errors checked | `rg -n "const { data" src/lib/db.js \| rg -v error` | Every result checks `error` |
| NET-004 | S1 | Fast table, date or filter switches cannot race | Read loaders for a cancelled flag | Last selection wins |
| NET-005 | S1 | No refetch of what realtime already delivers | Read realtime handlers | Events patch local state; no full reload per event |
| NET-006 | S2 | Narrow selects | `rg -n "select\('\*'\)" src/lib/db.js` | None on wide or protected tables |

## RT — realtime

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RT-001 | S1 | Subscriptions cleaned up on unmount | `rg -n "\.channel\(" src -A20 \| rg "removeChannel\|unsubscribe"` | Every channel removed in the effect cleanup |
| RT-002 | S1 | No duplicate handlers after reconnect | Read the reconnect path | One handler per event after reconnect |
| RT-003 | S1 | Optimistic state reconciled with events | Read cart and order reducers | Server event wins; no duplicate rows |
| RT-004 | S1 | High-churn tables are filtered | Read channel filters | Subscriptions filter by table, order or date |

## PERF — performance

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PERF-001 | S1 | No whole-POS re-render per order event | Read context consumers in `WaiterTables.jsx`, `CashierTables.jsx` | Selector hooks; memoized children |
| PERF-002 | S1 | No O(n²) over orders or items | `rg -n "\.filter\(" src/lib src/pages \| rg -B2 "\.map\("` | `Map` index built once |
| PERF-003 | S1 | Heavy libraries lazy | `rg -n "from 'exceljs'\|from 'jspdf'\|from 'qrcode'" src/pages src/components` | `import()` on demand |
| PERF-004 | S1 | Aggregation in SQL | Reads reduced to one number | RPC or aggregate |
| PERF-005 | S2 | Long lists paged or virtualized | Order history and audit lists | Paged |

## DRY — reuse

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DRY-001 | S1 | The same formula is not in two pages | Diff Expenses vs Daily Bazaar, Salaries vs Employees, Reports vs Accounting | Shared helper in `src/lib` |
| DRY-002 | S1 | The same query written once | `rg -n "\.from\('orders'\)" src \| wc -l` and similar per table | One `db.js` helper per read shape |
| DRY-003 | S2 | Repeated markup becomes a component | Three or more elements with the same classes in two files | Extracted into `src/components` |
| DRY-004 | S2 | Near-duplicate components merged | Two pickers, two badges, two summary strips | One with a `variant` |

## COST — running cost

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| COST-001 | S1 | No refetch after a write that returns the row | `rg -n "\.select\(\)" src/lib/db.js \| rg -B5 "insert\|update"` | Returned row used; no second read |
| COST-002 | S1 | No `setInterval` where realtime or cron covers it | `rg -n "setInterval" src` | Each justified and longer than the data changes |
| COST-003 | S1 | `pg_cron` jobs run only as often as needed | `rg -n "cron.schedule" migrations` | Schedules match the data; dispatchers scan an indexed pending slice |
| COST-004 | S1 | AI assistant bounded | Read `src/lib/assistant` and `api/assistant` | Cheapest sufficient model, bounded history, cached datasets |
| COST-005 | S2 | Menu images resized | `rg -n "optimize:menu-images" package.json` and the upload path | Uploads resized; unused objects deleted |

## DB — Supabase and schema

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| DB-001 | S1 | New filter, order and FK columns indexed | For each new `where`/`order by` on orders, items, payments, salary, attendance, queues, find the index | Composite index matches the filter order |
| DB-002 | S1 | RLS helpers run once per query | `rg -n "auth.uid()" migrations \| rg -v "select auth.uid()"` in new policies | `(select auth.uid())`; helpers `stable` and `security definer` |
| DB-003 | S1 | No parallel model for an existing concept | Compare a new table with notification queues, audit logs, snapshots, settings | Existing table or a `kind` column reused |
| DB-004 | S1 | Near-identical RPCs or triggers merged | `rg -n "create or replace function" migrations \| sort` for same-body pairs | One function with a parameter |
| DB-005 | S1 | Money `numeric`, instants `timestamptz`, days `date` | `rg -n "float\|double precision\|timestamp without" migrations/2*.sql` | None on new columns |
| DB-006 | S2 | `EXPLAIN` on hot queries | Supabase MCP `execute_sql` with `EXPLAIN` | No seq scan on large tables |

## TEST — verification

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TEST-001 | S0 | `npm test` and `npm run build` pass | Run both | Green; the Vite large-chunk warning is not a failure |
| TEST-002 | S0 | Source guards were not weakened | `git diff -- tests/ \| rg "^-.*assert"` | No removed assertion without an explained replacement |
| TEST-003 | S1 | New logic has a focused test | For each changed `src/lib` function, find `tests/<name>.test.js` | A behavioural test exists |
| TEST-004 | S1 | `npm run db:health` is clean | Run it | No missing migration or RPC warning |

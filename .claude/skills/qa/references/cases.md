# QA regression catalog (Zar Kebab POS)

Severity if failed (`review-core` section 2): **S0** wrong money, payroll or
data, a changed historical record, a protected-data leak, a duplicate charge or
kitchen round, or a crash (the `smoke` set); **S1** a broken flow or a
misleading UI; **S2** cosmetic. "Expect" is the pass condition. IDs are stable;
append at the end of an area, never renumber. `[qa YYYY-MM-DD]` marks a case
added from a finding in that run.

The dev server talks to the **production** Supabase project: every write is
real restaurant data, needs the user's "yes" in chat for that one action, and
may send Telegram messages. Writes are prefixed `QA`.

## Run log (newest first; `retest` starts from the top row)

| Date | Commit | Scope | Findings (S0/S1/S2) | Checks run | Not run |
|---|---|---|---|---|---|

## ORD — waiter ordering

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ORD-001 | S0 | Send to kitchen creates one round (approved) | Waiter → table, add 1 item, send | One kitchen round; one RPC call in `read_network_requests` |
| ORD-002 | S0 | Double tap sends once (approved) | Double-tap Send | Exactly one round; button blocked while pending |
| ORD-003 | S0 | Price mode applies the right price | Switch price mode on the cart | Line prices equal the mode's catalog price; total recomputed |
| ORD-004 | S1 | Cart survives offline and back | Go offline, add an item, go online | Connection notice; cart intact; no duplicate round after reconnect |
| ORD-005 | S1 | Table status updates | After ORD-001 | Table shows occupied on Waiter tables and Cashier tables |
| ORD-006 | S1 | Take-away flow | `/waiter/take-away` | Order created without a table; appears for the cashier |
| ORD-007 | S1 | Reservations block a table | Reserve a table (approved) | Shows reserved; cannot be taken by a second waiter |
| ORD-008 | S2 | Item search and category scroller | Type and scroll on the phone | Filters fast; scroller usable one-handed |

## KIT — kitchen

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| KIT-001 | S0 | A round appears once on `/kitchen` | After ORD-001 | One check, correct items and quantities |
| KIT-002 | S1 | Marking done updates the waiter | Mark done (approved) | Waiter order shows done without reload |
| KIT-003 | S1 | Kitchen check prints | `/kitchen-check/:orderId` | Layout per `PRINTING.md`; no cost data |
| KIT-004 | S2 | Elapsed time correct | Compare with the order time | Tashkent time; minutes accurate |

## CASH — cashier and payments

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| CASH-001 | S0 | Bill total equals items plus service fee | Hand-compute from the lines and the rate | Equal to `analytics.js` output; rounding once |
| CASH-002 | S0 | Mark paid once (approved) | Mark paid, cash | One payment row; order closed; receipt matches the bill |
| CASH-003 | S0 | Split payment sums to the bill (approved) | Cash + card split | Parts sum exactly; each method recorded |
| CASH-004 | S0 | Paid history unchanged by a later price change | Change a menu price (approved), reopen the paid receipt | Old price kept |
| CASH-005 | S0 | Payment correction inserts, never rewrites (approved) | Correct a payment method | New correcting row; original row unchanged; Investor alert noted |
| CASH-006 | S1 | Salary-paid order links to payroll (approved) | Pay an order from salary | Order marked; payroll shows the deduction |
| CASH-007 | S1 | Double tap on Mark paid | Double-tap | One payment |
| CASH-008 | S1 | Receipt renders and prints | `/receipt/:orderId` | Print layout per `PRINTING.md` |
| CASH-009 | S2 | Loyalty name search | Type a name | Matches shown; no extra requests per keystroke beyond debounce |

## PAY — accounting, expenses, Bazaar

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PAY-001 | S0 | Accounting summary equals the day's payments | Sum cashier history for today | Equal to Accounting; `accountingSummary.js` |
| PAY-002 | S0 | Expense saved once (approved) | Add `QA expense` 10 000 | One row; today's profit lower by 10 000; Telegram notice noted |
| PAY-003 | S0 | Daily Bazaar purchase saved via the RPC (approved) | Add a `QA ingredient` purchase | One RPC; ingredient stock and expense updated once |
| PAY-004 | S1 | Ranges over 1 000 rows total correctly | Pick a wide range on Accounting history | Total equals an independent sum; paging visible in requests |
| PAY-005 | S1 | Month and past-day ranges | Switch range | Figures change; no future days |
| PAY-006 | S1 | Monthly estimate math | Compare with `monthlyEstimate.js` for the inputs | Equal |
| PAY-007 | S2 | Expense categories localized | UZ | No raw keys |

## SAL — payroll

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SAL-001 | S0 | Salary due equals rate × days minus fines, advances and salary orders | Hand-compute for one employee | Equal to the Salaries page; `salary*.js` |
| SAL-002 | S0 | Salary payment saved once (approved) | Pay `QA staff` | One row; history updated; Telegram notice noted |
| SAL-003 | S1 | Fine, absence and advance entries (approved) | Add each | Each changes the due by the right amount |
| SAL-004 | S1 | KPI 4 am cutoff | Compare an order at 03:30 with the KPI day | Counted in the previous KPI day |
| SAL-005 | S1 | Employee meals excluded from revenue | Record a meal (approved) | Not in sales; in employee meal totals |
| SAL-006 | S1 | Rate history kept | Change a rate (approved) | Past months keep the old rate |
| SAL-007 | S2 | Employee salary history page | Open | Rows newest first; totals match |

## ATT — attendance

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ATT-001 | S0 | QR rotates and old codes fail | Scan an expired code | Refused; current code accepted |
| ATT-002 | S1 | Check-in recorded once (approved) | Check in | One row; countdown bar correct |
| ATT-003 | S1 | Kiosk works at tablet width | 768 px | Buttons reachable; no scroll |
| ATT-004 | S2 | Remote employees handled | Employee marked remote | Attendance rule per `docs/agent/attendance.md` |

## MENU — admin menu and Tech Cards

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MENU-001 | S0 | Menu item plus cost saved atomically (approved) | Create `QA item` with a cost | One RPC; both saved; cost absent from the public menu payload |
| MENU-002 | S0 | Deleting an item with history archives it (approved) | Delete `QA item` after a sale | Archived; history still shows it |
| MENU-003 | S1 | Tech Card cost rolls up | Edit a recipe (approved) | Cost recalculated; sold-item snapshots unchanged |
| MENU-004 | S1 | Availability and schedule | Toggle availability (approved) | Hidden from waiters and the public menu immediately |
| MENU-005 | S1 | Media upload bounded | Upload a 10 MB image (approved) | Refused with a visible error |
| MENU-006 | S2 | Item names in all languages | Edit RU name (approved) | Shown in RU; falls back sensibly elsewhere |

## PUB — public menu and Telegram mini app

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PUB-001 | S0 | No protected columns in public responses | `read_network_requests` on `/menu` and `/telegram` | No cost, recipe, payroll or accounting field |
| PUB-002 | S1 | Menu loads signed out | Incognito `/menu` | Full menu; shimmer then images |
| PUB-003 | S1 | Item page and search | `/menu/item/:id`, `/search` | Correct item; search matches names in each language |
| PUB-004 | S1 | Corporate sets, premium menu, catering, vacancies | Open each | Render without errors |
| PUB-005 | S2 | Image shimmer | Throttle | `ImageLoadShimmer` until loaded |

## REP — dashboard and reports

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| REP-001 | S0 | Dashboard revenue equals cashier history | Sum today's payments | Equal |
| REP-002 | S0 | Reports equal Accounting for the same range | Compare | Equal |
| REP-003 | S1 | Historical snapshots unchanged after today's changes | Open last month after PAY-002 | Unchanged |
| REP-004 | S1 | Date ranges | Today, past day, month, empty | Correct; no future days |
| REP-005 | S1 | Busy hours and weekly charts | Compare one bar with the orders | Equal |
| REP-006 | S2 | Export (if present) | Export | Totals equal the page |

## ADMIN — settings, users, tables, audit, assistant

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| ADMIN-001 | S0 | Feature access gates pages and writes | Remove a feature from a test user (approved) | Page hidden and the write refused by the database |
| ADMIN-002 | S1 | Pending approval flow | New account | `/pending-approval`; no data |
| ADMIN-003 | S1 | Tables CRUD (approved) | Add `QA table` | Appears for waiters; delete archives if history |
| ADMIN-004 | S1 | Audit log records writes | After any approved write | Row with actor and action |
| ADMIN-005 | S1 | Assistant answers from datasets | Ask a revenue question | Answer matches Reports; no protected data for non-owners |
| ADMIN-006 | S2 | Account deletion audit | Read `tests/accountDeletionAudit.test.js` scenario | Covered |

## TG — Telegram

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TG-001 | S0 | Webhook refuses without the secret | `curl -i` without the header | 401 |
| TG-002 | S1 | Order status messages sent once | After ORD-001 | One message per status change |
| TG-003 | S1 | Expense and salary notices formatted | Read a recent message | Amount grouped; category and employee present |
| TG-004 | S1 | Delivery tracking | Read the delivery table rows | Each message has a status |
| TG-005 | S2 | Investor alerts | After CASH-005 | One alert |

## I18N — languages

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| I18N-001 | S1 | Switching language does not reload or reset | On Waiter order with a cart, switch | Cart, filters and scroll kept; no refetch |
| I18N-002 | S1 | No missing keys | UZ, RU, EN on every page | No raw keys |
| I18N-003 | S1 | Money and dates per language | Compare | `1 000 000 so'm`; localized dates |
| I18N-004 | S2 | Long RU strings fit | 375 px | No clipping |

## UI — themes, widths, console

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| UI-001 | S0 | Waiter screens usable at 375 px | Every waiter page | No horizontal scroll; 44 px targets |
| UI-002 | S0 | Cashier screens usable at 768 px | Every cashier page | Total readable; actions reachable |
| UI-003 | S1 | Dark theme | Toggle on every page | No white-on-white |
| UI-004 | S1 | Shimmers, not spinners | Throttle | Content-shaped shimmer; no "Loading" text |
| UI-005 | S1 | No console errors | `read_console_messages` | Empty |
| UI-006 | S2 | 1280 and 1920 px | Admin pages | No stretched empty cards |

## RT — realtime

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RT-001 | S0 | Waiter action appears for the cashier once | Two tabs | Appears without reload, exactly once |
| RT-002 | S1 | Admin edit reaches the waiter | Toggle availability (approved) | Waiter menu updates |
| RT-003 | S1 | Reconnect does not duplicate | Offline then online | No duplicate rows |

## NET — network

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| NET-001 | S1 | Request count on first load | Each page | Fixed small set; no per-tile queries |
| NET-002 | S1 | No failures or slow responses | Each page | No 4xx/5xx; nothing over 1 s |
| NET-003 | S1 | Fast switches: last wins | Switch table or date quickly | Final state matches the last selection |
| NET-004 | S2 | Payload size | Largest response | No unused columns |

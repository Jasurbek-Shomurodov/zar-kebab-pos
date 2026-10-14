# Telegram Menus, Targets, Notifications, and Delivery

## Entry points

- UI: `src/pages/TelegramMiniApp.jsx`, `src/lib/telegramWebApp.js`
- Notifications: `api/telegram/`
- Delivery: `api/telegram/_lib/`
- Polling: `bots/telegram-bot.js`
- Tests: `tests/teamDailyKpiDelivery.test.js`, `tests/employeePayrollImages.test.js`.

## Mini App

- Read-only.

## Delivery retries

- Saved salary events (not initial setup) get `not_attempted` tracking. States: pending, sent, failed, skipped, confirmed; sent requires a message id.
- Destinations send independently, duplicate-safe. Salaries: 5 rows/page, unsent retries.
- `248`: unknown `employee_` tokens link new-hire registrations.
- Salary operations use `api/telegram/employee-notification.js`. Cleanup needs `ok:true` within 30s; a timeout keeps the record and errors.
- Owner deletions first retract tracked private/Salary (Investor)/Team messages; missing ones succeed. Undeletable rate notices become cancelled; other failures block deletion.

## Salary targets

- Salary payments: employee privately (receipt confirmation), Salary group (no confirmation).
- Salary group target is `salary_events`; env fallback never uses Team or completed-orders groups.
- Payment, accrued bonus, fine, absence, and rate change notify employee and Salary group; automatic KPI uses combined summaries.
- Rate-change messages: previous/new salary, effective date, effective KPI status.
- KPI changes notify Salary group from immutable rate/basis/account snapshots (`196`); no-op saves stay silent.

## Team events

- No backfill. Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages show amount, full fine/absence detail and author, never salary balance; automatic events name the system.
- Bonuses omit payment method; private manual bonuses/fines use Russian long dates.

## Payroll privacy

- Private RU PNG calendars: MTD salary, KPI, bonuses, fines, absences from joining through the completed day, before payments. Dated `getSalaryBalance()` gives remaining pay and all-time payments (negative = advance). Custom ranges ≤62 days.
- Salary group gets only the aggregate daily salary/KPI report, no per-employee KPI.
- Game Club paid revenue has its own text/PNG bucket, excluded from other buckets.
- `180`: Game Club rounds send Team RU date, actor, menu, items, total, plus paid daily income snapshotted at send (Tashkent paid_at, created_at fallback; saved totals). Read errors stay queued; cron retries; unknown sends held. No costs/tenders.
- Daily/MTD cafe income uses immutable `orders.total`. Cash/terminal uses payment rows; QR maps to terminal; card/loyalty stay distinct.
- `api/telegram/daily-salary.js` loads MTD cafe income orders via `loadSalaryRows` (paged by `id`); unpaged selects cap at 1000 rows (cf. RPC `get_dashboard_monthly_average_income`).
- Daily soliq: 4% of paid cafe revenue, in expenses, deducted from net profit.
- Team KPI: one Russian PNG per finalized date (all awards, total, date, system author); `181` claims dates; unknown sends held. No text fallback or sales/rate/balance data. Award deletion edits its image row.

## Menu availability

- Authenticated availability changes, creation and archival queue immutable Russian Team events (product/employee snapshots); edits and restoration send nothing.
- Unavailable-products snapshot: sent at 04:05; 08:00 retries. 13:00: Google review replies (`225`).
- Non-empty: one tracked PNG only (`menuAvailabilityImage.js`), no text; failures retry. Empty: short text.
- Exclude archived products/categories; preserve exact sent snapshots.

## Investor

- Lifecycle (`178`), name/role/start edits (`250`): immutable Russian Investor events.
- Ingredient changes (`189`) snapshot before/after values and actor. Unchanged saves and imports stay silent. `ingredient-events` sends to `salary_events`; unknown sends stay held.
- Order deletes require a reason (`184`); Investor alerts snapshot order, total, actor and tenders. Corrections and splits (`201`) notify Investor once with before/after allocations.
- New cash expenses (text) and Bazaar purchases (one localized PNG + caption, never also a text receipt) notify Investor via legacy `salary_events`.
- Investor daily album: yesterday’s financial/payroll plus live unpaid/non-cancelled orders (place/id/time/status/total/items); Russian labels/catalog names, saved-name fallback; renderer filters paid/cancelled. Never daily Bazaar totals or Tech Card images, even on retry/manual send. Keep historical ledgers.
- Bazaar PNGs group numbered items by saved RU category: paid/normal prices, signed variance (red above, green below), total variance. Missing normal prices stay unset; rows never truncate.
- Investor: image-only, retryable render errors, no text fallback; the ledger dedupes the two-image album, marking sent only after each photo’s message id.
- Employee meal daily aggregate also goes to Investor, with the employee-count formula.
- Edits/deletes and calculated salary/bonus rows never announce new cash expenses.

## Status messages

- Group identical product/options/notes/price/unit rows as receipts, ignoring variant-note language.
- `Официант`: saved `waiter_name` across rounds; fallback `Не указан`, never closer.
- Sum `cashback_earned`; omit zero. After payment: `💳 [owner] · кешбэк + [amount] UZS`; escaped snapshot names or `Карта лояльности`. Test: `tests/telegramOrderStatus.test.js`.
- `185` first. `api/telegram/_lib/orderStatusDelivery.js` tracks new messages; order deletion retracts combined messages, minute cron retries. Missing messages succeed; errors stay recorded; old untracked ones stay; Telegram deletes ≤48h. Test: `tests/orderStatusDelivery.test.js`.
- `197`/`198`: private paid-order estimates snapshot order/daily KPI. `203`/`213`: cuts use the opening cutoff on the Tashkent payment date; Salary events snapshot before/after times. `202` cancels queued and retracts sent deleted-order notices (incl. orphans); minute `employee-order-kpi` cron retries; uncertain sends held. Migrations before sender/UI; prior estimates frozen. Tests: `tests/timeBasedKpi.test.js`.
- Morning watchdog retries unstarted/failed/skipped (incl. alerted) Investor albums after meal/KPI finalization. Recovery needs a saved message ID; never replay sent/pending reports. Save alert ID/chat/error only after confirmed send. Tests: `tests/dailySalaryWatchdog.test.js`.
- `210`: see [salary orders](salary-orders.md).

# Employees, Payroll, KPI, Absence, and Employee Meals

- `194`/`206`/`237`: display-only job_function; required on creation, owner-editable. EN/RU/UZ labels; no permissions/payroll effects. Test: `tests/employeeJobFunctions.test.js`.

## Entry points

- UI: `src/pages/Salaries.jsx`, `src/pages/Employees.jsx`, `src/pages/EmployeeSalaryHistory.jsx`
- Shared logic: `src/lib/salaryTransactions.js`, `src/lib/salaryHistory.js`, `src/lib/dailyKpi.js`, `src/lib/teamProfiles.js`, `src/lib/expenses.js`
- Finalization: `api/telegram/employee-notification.js`, `api/telegram/daily-salary.js`
- Schema: migrations `129`, `169`–`172`, `195`–`203`.
- Tests: `tests/salaryTransactions.test.js`, `tests/salaryHistory.test.js`, `tests/dailyKpi.test.js`, `tests/dailyKpiUi.test.js`, `tests/dailyKpiBonuses.test.js`, `tests/dailySalaryWatchdog.test.js`, `tests/telegramSalaryMessages.test.js`

- `207`: salary rates allow dates ≥ Tashkent today − 3 days; older rates cannot be updated. Includes initial. Test: `tests/salaryRateDateWindow.test.js`.

- Dates: Tashkent.

- `243` attendance: restaurant QR (`?start=checkin`); webhook keeps first scan per Tashkent date by linked Telegram, snapshots `work_start_time`, replies early/on time/late; no payroll writes. Test: `tests/employeeAttendance.test.js`.

- `208`: rate insert/update/delete audit snapshots. History labels creator/deleter; insert audits precede live names. `209`: owner-only rate deletion; refresh balances/history, keep audits. Test: `tests/salaryRateHistory.test.js`.

## Ledger

- Separate payments, bonuses, fines, absences, rates.
- `getSalaryBalance()` is the signed ledger: base salary plus accruing manual/KPI bonuses, minus payments and fines. Excess payments/fines carry forward negatively.
- `getSalaryDue()` is the nonnegative liability for one employee. `getTotalSalaryDue()` sums per-employee liabilities so one advance never hides another employee's due.
- Allow payments with zero/negative balances.
- History sorts by effective date, then newest `created_at`.
- Page payroll ledgers via `src/lib/salaryData.js`; include accrued bonuses and remove deleted bonuses from balance state. Coverage: `tests/salaryBalanceConsistency.test.js`.

## Adjustments

- A fine requires employee, date, positive amount, and non-empty reason. It reduces payroll liability but never becomes an Accounting cash expense.
- Bonuses created after `169` accrue into salary liability and become cash expense only through a later salary payment. Legacy bonuses remain immutable immediately-paid expenses.
- Salary writes need Accounting access and audits.
- Today's absence can be undone only for an active employee with an exact row for the current Tashkent date.
- Undo absence requires confirmation and an exact delete guarded by absence id, salary profile id, and date. Zero affected rows is an error.
- History deletion retracts tracked employee/Salary/Team Telegram messages first. Failed retraction keeps the source for retry. Deleted bonus/fine/absence/rate events remove delivery records to prevent retries.
- Deactivation/reactivation work boundaries are inclusive; only intervening dates become absences. Archived `deleted_at` is exclusive after the last working date.
- Employee create/activate/deactivate queue immutable Russian Investor events (`216`: created shows salary). Screens retry safely.

## KPI

- `195`/`196`: from `2026-09-16`, rules choose own opened orders or all restaurant dine-in sales. Base is paid subtotal + service by Tashkent payment date, ignoring loyalty. Own rules require `order_opener_profile_id` or payroll `profile_id`; restaurant rules need no account. Earlier catch-up uses all sales.
- `203`/`226`: `start_time` gates `paid_at` on the Tashkent payment date; `226` drops the `213` opening cutoff, so a closed order counts on its paid day. Shared `employee_kpi_sales_base`; snapshots immutable. Tests: `tests/timeBasedKpi.test.js`, `tests/closedOrderKpiDay.test.js`.
- `215`/`217`: same-day table rows inherit the opener for own KPI.
- `226`: absences no longer skip KPI. Employment boundaries still do.
- Runs/results are immutable; only service-role finalization creates `daily_kpi` bonuses (`200`: creator repair). `202` forbids deleting previous-day orders (`232`: owners may delete unpaid ones); today's deletions reduce own/restaurant bases before finalization.
- Bonuses accrue into salary. Formula/settlement are immutable; payments record cash expense.
- Deleting a generated bonus marks its result voided; retries never recreate it.
- Only owners remove KPI rules. Preserve rules/data before the effective date; insert a disabled successor. Delete only unused rules effective at that boundary. Never offer disabled successors for removal: that would reactivate the older rule.
- Cards show today’s rule. KPI dropdown: active POS profiles, saves the opener, retryable load errors.
- KPI rate/status/basis/account/time changes snapshot before/after values and queue Salary delivery; no-op saves stay silent. No historical backfill.
- Salary History separates monthly manual Bonuses from KPI bonuses. Salary + bonuses includes salary and both bonus types once each.
- Effective dates cannot enter finalized periods. Recovery scans missing older dates in bounded batches.

## Notifications

- Private/Salary rate messages show effective KPI percentage/status.
- KPI rule additions/changes notify only the Salary group (employee, previous/new KPI, effective date, actor); Employee/Team stay terminally skipped.
- Private PNG calendars: telegram.md Payroll privacy. Private/Salary-group KPI events are skipped; Team gets one daily image (`181`).
- Cron repairs missing KPI delivery rows before Team delivery; `172` restores the queue trigger.
- A failed KPI finalization defers the daily salary summary.
- Delivery: `docs/agent/telegram.md`.

## Meals

- `average_daily_employee_meal_uzs` is per present employee per day, not one restaurant total.
- `employee_daily_meal_expenses` freezes completed-day rate, present count, and total; reports use it, never today's setting. Backfill is one-time, never recalculated.
- Absences and employment boundaries set meal attendance; skip future dates.
- Cron repairs meal dates independently in bounded batches.
- Meal rows reduce report remainder; no payment method or cash ledger mutation.

- `210`: see [salary orders](salary-orders.md).

- Custom calendars: `src/components/CalendarPicker.jsx`; ISO values/bounds preserved. Tests: `tests/calendarPicker.test.js`.

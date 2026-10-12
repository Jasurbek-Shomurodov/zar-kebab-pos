# Payments, Service, Accounting, Expenses, and Daily Bazaar

## Entry points

- UI: `src/pages/CashierBill.jsx`, `src/pages/Receipt.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`, `src/pages/MonthlyEstimate.jsx`, `src/pages/DailyBazaar.jsx`
- Helpers: `src/lib/analytics.js`, `src/lib/cashierCheckout.js`, `src/lib/billHandoff.js`, `src/lib/accounting.js`, `src/lib/accountingSummary.js`, `src/lib/expenses.js`, `src/lib/monthlyEstimate.js`, `src/lib/bazaar.js`
- Database: `src/lib/db.js`; migrations `083`, `090`, `097`, `109`, `135`, `201`, `212`, `220`
- Tests: `tests/orderPayment.test.js`, `tests/atomicPaymentSettlement.test.js`, `tests/cashierCheckout.test.js`, `tests/accountingPages.test.js`, `tests/monthlyEstimate.test.js`, `tests/bazaar.test.js`, `tests/sourceGuards.payments-reporting.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Payment math

- Use `normalizeServiceRatePct()`, `getOrderPaymentSummary()`, and `getOrderPaymentFields()`; never hand-roll page totals.
- Dine-in may include service. Take-away, delivery, and Game Club use zero service.
- Regular and Tourist service settings are separate; new dine-in orders snapshot the rate chosen by authoritative `price_mode`.
- Reuse an unpaid order's saved service rate only when its saved price mode matches the submitted mode. Empty/stale Regular shells cannot leak Regular service into Tourist orders.
- Active and paid orders keep their rate snapshot after settings change. Pending kitchen retries retain the original rate.
- Use shared loyalty/counter helpers. Reports use paid `orders.total`; unpaid bills use items.

## Bill item edits

- Deploy `212` before UI; reload clients. `update_bill_item_quantity` locks/edits/recalcs atomically; no fallback. `_billEditRequestId` receipts prevent replay; errors refresh. Paid items locked; waiter recall required. Emptied bills cancel terminally, freeing tables (`220`/`224`). Tests: `atomicBillItemEdits`, `cancelledOrderTerminal`.

## Split payments and corrections

- `201`: separate payment selectors; “Add second payment” in Reports.
- Delete completed orders access permits atomic non-loyalty tender corrections.
- Loyalty rows are visible but immutable without a separate wallet reversal workflow.
- Method corrections keep amounts fixed. Splits preserve the original sum, other payments, items, totals, paid state/time, loyalty, service and stock. Receipts audit/reconcile splits. Tests: `tests/paidPaymentSplit.test.js`.
- Deletes require a reason (`184`) and today's Tashkent date (`202`), including owners. Empty cashier bills expose the same guarded deletion after refresh; paid/older orders remain protected. Corrections notify Investor.

## Receipt printing

- Grouping: Telegram guide; `tests/orderItemPresentation.test.js`.

- Auto-print: one-time cashier request, in-page receipt, no new tabs. Manual print refreshes the bill.
- Translate bill errors at render; language never refetches bills.

## Accounting

- Never show today-only POS orders as Accounting history.
- Wait for expenses, paid-order summary/history, and salary data before ending loading.
- KPIs use permission-checked aggregates, never full history. The all-time cash remainder excludes unpaid salary liability.
- Detailed order rows belong to reports, receipts, and drilldowns.
- Accounting: recording, spending/salary KPIs, open method balances. Analysis + Estimate: `financial_analysis` (needs `expenses`; `230`); `229` growth, `231` one-trip load.

## Expenses and estimates

- Expenses allow today or three prior Tashkent dates; UI/database reject older dates. Income and unchanged history are allowed.
- Bonus display rows are projections: deletion targets `employee_salary_bonuses.source_id`, never a synthetic display id.
- Salary payments/accruals and Daily Bazaar totals remain protected from overview deletion.
- Fines reduce payroll liability but are not cash expenses.
- Monthly Estimate: selected-month actuals plus expected salary, rent, utilities, and bazaar/sales at completed-day pace; no older arrears. Last-month comparison uses salary cost.
- Compute salary operating cost per employee so one advance or older-debt payment cannot distort another.
- `business_settings.monthly_utilities_uzs` is the plan; only recorded `utilities` rows are monthly actuals.
- `business_settings.average_daily_break_even_income_uzs` is the operator-entered Dashboard benchmark; it does not alter Accounting totals.

## Cash Telegram

- New cash expenses queue one immutable Investor delivery: manual text or a Bazaar PNG receipt and caption.
- Edits/deletes do not announce again; never project salary, bonus, meal, or calculated rows here.

## Daily Bazaar

Migrations `097`, `160`–`163`, `182`.

- Receipts: product, category, quantity, unit, exact amount.
- Product rows share one height; notes are multiline.
- Snapshot buyer ID/name. New entries use cash/card; preserve historical terminal.
- New lines require active `bazaar_product_catalog` ingredients; no arbitrary names.
- `/admin/ingredients` manages canonical names, categories, purchase units, normal unit prices, and active/archive state. Migration `182` allows owner renames; saves keep catalog keys and historical snapshots.
- `186`: active owners/admins with `ingredients` may write; viewers read. Bazaar/Tech Card access grants catalog reads only.
- Migration `161` starts the managed list empty without changing history.
- Suggested totals stay editable; exact paid totals drive Accounting.
- Snapshot normal unit price, quantity-scaled total and variance (`paid - normal`). UI/Investor show line/total variances: positive above normal, negative below.
- Saved lines retain their original normal-price snapshot.
- Catalog deletion is archival; purchase lines keep name, category, unit, and paid snapshots.
- Ingredient writes reconcile before retry and update locally.
- ISO dates.
- Server calculates totals. Create retries reuse a request UUID.
- Save/edit/delete atomically maintains exactly one linked `expenses` row with `products_bazaar`; do not ask for duplicate Accounting entry.
- Normalize compatible units only (g→kg, ml→l); never combine counts with weights/volumes.
- Bazaar history loads only on `/admin/bazaar`, never during POS hydration.

- `204`: audit actor FK removed; history unchanged.

- `210`: see [salary orders](salary-orders.md).

- Custom calendars: `src/components/CalendarPicker.jsx`; ISO values/bounds preserved. Tests: `tests/calendarPicker.test.js`.

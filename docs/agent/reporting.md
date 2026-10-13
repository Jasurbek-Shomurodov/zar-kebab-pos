# Reporting

## Entry points

- UI: `src/pages/AdminDashboard.jsx`, `src/pages/Reports.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`
- Shared logic: `src/lib/dashboardAnalytics.js`, `src/lib/monthlyIncome.js`, `src/lib/dishSales.js`, `src/lib/profit.js`, `src/lib/orderHistory.js`, `src/lib/accountingSummary.js`, `src/lib/closeout.js`
- Historical snapshot schema: migrations `114`, `147`, `157`, and related aggregate RPC migrations
- Focused tests: `tests/dashboardAnalytics.test.js`, `tests/monthlyIncomeSnapshots.test.js`, `tests/dishSales.test.js`, `tests/profit.test.js`, `tests/orderHistory.test.js`, `tests/financialHistorySnapshots.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Loader boundaries

- POS hydration covers active/today’s paid orders only. Dashboard is today-only (`state.orders`); it fetches just yesterday for comparisons.
- Use bounded report loaders, receipt order/session IDs, earliest-needed estimate dates, and aggregate overview RPCs.

## Financial history

- Saved prices, costs, service rates, categories and paid state are immutable. Payment rows are saved inputs; the authorized migration `201` split correction preserves their combined total and audits before/after allocations. Reports use its confirmed rows, including merged sessions.
- Profit: paid revenue minus non-cancelled costs (`src/lib/profit.js`).
- Missing historical cost: unavailable until backfilled; never substitute current cost.
- Archives retain historical lookups.
- Reports display the saved Regular/Tourist `orders.price_mode` in desktop, mobile, and details.

## Snapshots

- `order_items.category_id_snapshot` is the sold-time category. `category_snapshot_captured` distinguishes intentional uncategorized from legacy missing coverage.
- Category reports prefer the snapshot over the product's current category.
- `employee_daily_meal_expenses` supplies frozen completed-day employee-meal values.
- KPI rules cannot be inserted into finalized periods; bounded recovery eventually fills older missing KPI/meal dates.
- Daily ingredient consumption is theoretical Tech Card usage from paid, non-cancelled order-item quantities and service-only immutable `order_item_tech_card_ingredient_snapshots`, including nested recipe components. Weight is normalized to kg, volume to litres, and pieces remain counts; incompatible units are never combined.
- Ingredient value uses saved Tech Card prices. Report missing snapshots as uncovered sales; never fill from today’s recipe.

## Dashboard

- Recent Orders and receipt/delete controls live in Reports. `202` allows deletion only for today's Tashkent payment date (creation fallback), even for owners; older delete controls are hidden. Coverage: `tests/orderDeletion.test.js`.
- Sales by Category includes every category sold today.
- Product Contribution ranks ten products by revenue: quantity, share, snapshot profit, margin. Missing cost snapshots show unavailable profit.
- Do not invent products/categories. Monthly Busy Hours uses migrations `192`–`193` to return 12 two-hour buckets for the current Tashkent month. It attributes paid demand to `created_at`, scans one indexed month, returns no order details, and highlights tied peaks.
- Monthly/ten-day income charts live on Financial analysis. Monthly Income shows 12 months, hides zero labels, and plots `business_settings.average_daily_break_even_income_uzs` as a red dotted line. Past months use immutable `dashboard_monthly_income_snapshots`; this month uses completed Tashkent days.
- `157` backfills history; a daily cron finalizes last month. Completed months are never rescanned.
- Monthly averages divide paid cafe income by calendar days; current month uses completed days only (zero on day one).

## Accounting

- Small overview aggregates; details in reports/receipts.
- Month forecasts use that month’s actual/expected costs, excluding prior arrears.
- Fines are payroll deductions, never cash expenses. Employee meal snapshots are calculated operating costs without payment methods.

- Game Club (`game_club`) has a separate Dashboard/Reports revenue bucket. Immutable paid totals remain in Accounting, category, payment and range totals. Never reclassify historical take-away/delivery. Tests: `tests/gameClubOrders.test.js`.

- Ingredients movement (`186`): `get_ingredient_movement(date,date)` returns purchases, theoretical paid-order recipe usage, purchase amounts, and bought-minus-used per ingredient/unit for at most 366 Tashkent dates. Missing/incomplete snapshots are counted; migration `188` excludes unmatched and unmanaged ingredients from rows. Movement excludes opening stock, waste, and adjustments and is not an on-hand stock balance. Compatible g/kg, ml/l, pcs/piece normalize; packages stay separate. Raw snapshots remain service-only.

- Migrations `187`–`188` add categories and restrict movement to explicitly added (`is_catalog_managed`) ingredients, including archived ones with history. Category/search filters and name/quantity/movement/purchase-amount sorting operate locally without refetching.

- Ten-day income (`190`–`191`): latest 20 periods (1–10, 11–20, 21–end) through a selected month. Scans at most eight indexed months, excludes today/future periods, caches, hides empty months, starts choices at the earliest order month, and uses stable month colors. Zero periods in active months remain. Tests: `tests/weeklyIncome.test.js`.

- Reports: skeletons/disabled export until orders/expenses settle. Ignore cancelled reads.

- Dish Analysis: All dishes ranks 30 direct sellers. Selection shows description, sources, hours/log, hiding global rankings. Add frozen `tech_card_component_snapshot` quantities × parent quantity; deduplicate orders. No inferred recipes/legacy contents or added set revenue. Tests: `tests/dishSales.test.js`.

- Dish sales requires loaded history; loading/errors never mean zero. Low sellers: 15 active products, including unsold; archives retain history.

- Dish reconciliation helper retains saved inputs and coverage/residual checks; its UI panel is removed. Period remainder includes calculated meals, excludes opening balances. Closeout variance is unknown without counted balances; CSV says Not measured. Tests: `tests/closeout.test.js`.

- `210`: see [salary orders](salary-orders.md).

- Custom calendars: `src/components/CalendarPicker.jsx`; ISO values/bounds preserved. Tests: `tests/calendarPicker.test.js`.

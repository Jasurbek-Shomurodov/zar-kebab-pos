# Waiter Ordering, Tables, and Kitchen

## Entry points

- Waiter and kitchen UI: `src/pages/WaiterTables.jsx`, `src/pages/WaiterOrder.jsx`, `src/pages/KitchenCheckReceipt.jsx`, `src/components/CartPanel.jsx`
- State and shared logic: `src/store/cartReducer.js`, `src/store/ordersReducer.js`, `src/lib/kitchenCheck.js`, `src/lib/tableActivity.js`, `src/lib/priceModes.js`
- Database orchestration: `src/lib/db.js`, kitchen migrations `096`, `127`, `128`, `221`
- Focused tests: `tests/operationalFlows.test.js`, `tests/kitchenCheck.test.js`, `tests/kitchenSubmissionRecovery.test.js`, `tests/kitchenSubmissionReducer.test.js`, `tests/priceModes.test.js`, `tests/writeTimeout.test.js`, `tests/sourceGuards.ordering.test.js`

## Table entry and price mode

- Opening a table is a direct Regular/Tourist (`R`/`T`) choice, then Enter table; no PIN or Guest session.
- Tourist switches (`238`): off → tables open Regular, `/premium-menu` → `/menu`, public Regular. `tests/touristMenuToggle.test.js`.
- Opening a table creates no order; sending does.
- The chosen price mode is passed in router history state, never in the URL: guests can read the tablet's address bar (`tests/guestAutoSubmit.test.js`).
- Reserved-table seating clears reservation fields before entering ordering.
- Active non-empty orders keep their saved price mode locked; `221` rejects conflicting rounds (`tests/kitchenPriceModeGuard.test.js`).
- Empty shells, stale totals without items, and all-cancelled orders must not lock price mode or show an active-order notice.
- Before a kitchen order exists, a non-empty cart's saved `price_mode` is authoritative.
- Recalculate plain products and configured variants from immutable `base_price`; never compound Tourist markup.
- Paid order items are historical snapshots and are never repriced.

## Cart and waiter availability

- Below 640px staff ordering defaults to a compact two-column grid with a saved compact/large switch. Mobile categories use one sticky chip row. Guest tablet mode keeps cards. Both views share price, variant, and cart handlers; details retain descriptions and nutrition.

- Cards show the audience's variant price range; detail prices follow selected options via `src/lib/menuPricing.js`, matching the cart base price. Coverage: `tests/menuPricing.test.js`.
- Configured-option additions start at quantity one and increment only the matching `cart_item_key`.
- Reject unavailable or archived products at add, increment, detail submit, kitchen submit, and the database boundary.
- `stock_count` is inventory, not an availability flag.
- The header counts submitted items even with an empty unsent cart.
- Submitted kitchen rounds remain visible while a new cart batch is built. Derive stable `Order 1`, `Order 2`, etc. numbering from the complete chronological round list before filtering controls.

## Kitchen submission

- `WaiterOrder` owns send state. `CartPanel` receives `isSending` and `onSendingChange`; do not restore an independent local send state.
- While sending or reconciling an unknown result, block repeated taps, cart/menu mutation, and table navigation.
- Capture an immutable submission snapshot and remove only those sent cart items after confirmed success. Never replace the cart with `[]`.
- Every retry reuses the same table, order, item, kitchen-round, price-mode, and service-rate identities.
- A timeout is an unknown outcome. Query the durable `order_kitchen_rounds` receipt first, then use exact live item/cancellation matching only as a rolling-deployment fallback.
- A fully committed exact round is success even if the response was lost; missing or partial outcomes stay retryable with the same identity (print retries too).
- Durable round receipts survive payment, cancellation, or row deletion and are the idempotency boundary. A retry must never resurrect an old round.
- The database must reject late inserts into paid orders and stale archived/unavailable products.

- Fresh waiter submissions to an order already marked `needs_bill` require cashier recall first; retain the cart and explain the required action. Cashier-authorized users remain allowed. Never let this preflight block reconciling an uncertain round. Coverage: `tests/billHandoff.test.js`.
- Shared write and cart submission errors use `src/lib/writeErrorMessage.js` for actionable Uzbek/Russian/English messages at render time; raw diagnostics stay in console logs. Coverage: `tests/writeErrorMessage.test.js`.

## Kitchen checks and printing

- Printed kitchen checks combine identical product/options/notes/price/unit rows within the selected round only, using `getGroupedOrderItems` in both print renderers. Coverage: `tests/orderItemPresentation.test.js`.

- Never substitute an older round while the requested round loads.
- Refresh a missing round directly before printing and auto-print each round only once.
- See `PRINTING.md` for receipt-printer setup.

## Tables

- Cards use `getActiveTableOrders`; empty/stale-total shells stay available. See payments guide for atomic edits (`212`).

- Active orders show their creators; available-table drafts show the signed-in user. Empty shells supply neither names nor new submission IDs. Explicit retry IDs persist. Tests: `tests/activeOrderWaiters.test.js`, `tests/operationalFlows.test.js`.

- Disabled tables remain available to reports/history but are hidden from waiter ordering.
- Table edit/delete lives in `/admin/tables`, not the waiter grid.
- Never hard-delete a table with active orders or historical references; verify history on demand before archival/deletion decisions.

- Game Club uses `/waiter/take-away?orderType=game_club`, a distinct off-premise channel with `GC` order numbers, no table, zero service, and the existing off-premise permission. Regression coverage: `tests/gameClubOrders.test.js`.

- Migration `180` queues each new Game Club round at commit, with only that round’s items and the actual submitting actor. Team delivery runs independently of the browser.

- Staff category schedules can be bypassed per order type via `always_visible_take_away`, `always_visible_delivery`, and `always_visible_game_club`. Manage Menu has a checkbox for each; migration `205` seeds Game Club Business lunch. Guest/public menus, item schedules, hidden/archive flags, and unavailability keep their rules. Tests: `tests/gameClubCategorySchedule.test.js`.

- Custom calendars: `src/components/CalendarPicker.jsx`; ISO values/bounds preserved. Tests: `tests/calendarPicker.test.js`.

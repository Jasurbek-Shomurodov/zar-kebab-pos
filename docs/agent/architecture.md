# Architecture, State, Auth, and Realtime

Read this guide for app startup, authentication, routes, permissions, shared state, hydration, and realtime work.

## Entry points

- Routes and host boundaries: `src/App.jsx`
- Authentication and profile loading: `src/contexts/AuthContext.jsx`, `src/lib/profileLoading.js`
- Shared state and selectors: `src/store/AppContext.jsx`, `src/store/appHooks.js`, `src/store/`
- Permissions and database orchestration: `src/lib/permissions.js`, `src/lib/db.js`
- Focused tests: `tests/permissions.test.js`, `tests/profileLoading.test.js`, `tests/dbRealtime.test.js`, `tests/sourceGuards.architecture.test.js`

## Routes and access

- Public product links redirect to `/` with history replacement after loading finishes if the product cannot be resolved or the menu request fails.

- Public routes: `/menu`, `/telegram`, authentication and password-reset routes.
- Waiter routes: `/waiter/tables`, `/waiter/order/:tableId`, `/waiter/take-away`.
- Kitchen check: `/kitchen-check/:orderId`; the retired `/kitchen` screen redirects to `/admin`.
- Cashier routes: `/cashier/tables`, bill and receipt routes.
- Admin routes include dashboard, menu, tech cards, tables, users, reports, audit, settings, Accounting, Salaries, Daily Bazaar, and Ingredients at `/admin/ingredients` (the old `/admin/bazaar/ingredients` redirects).
- `ingredients` is an independent Team feature: owner/admin holders edit the catalog, viewer holders read only. Bazaar and Tech Cards access do not grant Ingredients access.
- Centralize role and feature rules in `src/lib/permissions.js`. Do not duplicate access decisions in pages without matching database enforcement.
- Menu catalog archival requires Manage Menu write access (any role). The UI permission and database archive trigger (migration `223`) must stay aligned.
- Theme: `src/lib/theme.js`. Loads use `PageShimmer`, never spinners (`tests/pageLoading.test.js`).

## State architecture

`AuthContext` reads Supabase authentication/profile data. `ProfileSync` in `src/App.jsx` mirrors stable profile fields into `AppContext` with `LOGIN`.

`AppContext` owns settings, user, tables, menu, orders, cart, connection notice, and load state. Domain reducers under `src/store/` own mutations. Keep `AppContext.jsx` limited to initialization, reducer composition, hydration, realtime, and database dispatch orchestration.

Critical invariants:

- `dbDispatch` must remain wrapped in `useCallback`. An unstable dispatch can make `ProfileSync` loop forever.
- `ProfileSync` dependencies stay field-based: profile id, role, full name, email, and dispatch.
- Realtime channel names must be unique; do not restore a fixed `pos-realtime` channel.
- Realtime includes `business_settings` so service and other live settings refresh correctly.
- Add focused selectors to `src/store/appHooks.js` rather than spreading direct state-shape knowledge through pages.

## Hydration boundaries

- Operational state contains every active order regardless of age and only today's paid orders needed for cashier/recent activity.
- Never load full paid-order history during initial hydration or realtime refresh.
- Signed-out visitors skip POS hydration and realtime; public pages read only `state.lang`.
- Dashboard, reports, Accounting, and receipts use their own bounded history loaders.
- `WaiterTables` refreshes operational tables/orders on mount and browser back-forward restoration without clearing the visible grid.
- The stable `refreshPOSData` callback renews realtime and preserves current cards while reloading.
- Resume recovery (session refresh + full hydration) runs on `online`, a broken channel, or after 60s away; brief focus switches skip it (`src/lib/resumeRecovery.js`). Log quota: `219` wakes Telegram queue senders from insert/cleanup triggers with a 15-minute retry sweep; browser REST calls use same-origin `/sb/rest/v1` (vercel.json, vite proxy, `src/lib/restProxy.js`) to skip CORS preflights.

## Compatibility

`src/lib/db.js` contains temporary fallbacks for missing RPCs/relations so the UI remains usable during deployment order. Production should still apply every migration. Use `npm run db:health` before changing loading code when the console reports missing database objects.

- Order deletion always opens the shared `src/store/useOrderDeletion.jsx` reason dialog. Migration `184` requires a trimmed 1–1000 character reason in `delete_order_owner(text, text)` and snapshots it in the Investor delivery; deploy it before the frontend. Migration `202` rejects non-current Tashkent dates, even direct SQL; `232` lets owners delete older unpaid open orders. Date is `paid_at`, falling back to `created_at`. `canDeleteOrderToday` and `useOrderDeletionDate` hide Reports/cashier controls at midnight; the database rechecks at deletion and shares the daily KPI finalizer lock. Tests: `tests/orderDeletion.test.js`.

- Ingredients catalog/add stays at `/admin/ingredients`; `/admin/ingredients/usage` lazy-loads Purchases & usage. Both require `ingredients`. Only the usage page mounts the movement loader; adding ingredients never requests purchases/usage.

- Language switching is presentation-only: preserve loaded data, forms, filters, and mounted pages. Data effects/callbacks must not depend on `lang`, translated labels, or translation callbacks unless the server response itself is language-specific. Store loader errors as codes/raw errors and localize during render. Ingredients regression coverage lives in `tests/ingredientsFeature.test.js`.

- Migration `204` removes the live-profile foreign key from `accounting_record_audit.changed_by`: actor UUIDs and names remain immutable historical snapshots after account deletion. The audit mutation guard remains strict. Team deletion errors also appear on the affected row. Tests: `tests/accountDeletionAudit.test.js`.

- `210`: salary-covered checkout uses Delete completed orders write access. The permission-checked balance endpoint returns IDs/names and signed salary balances only; full payroll ledgers stay server-side. The salary dialog preserves its bill while realtime closes the order and stores the pending request identity across retries/reloads.

- Active-order waiter labels resolve only profile IDs and full names via `src/lib/activeOrderWaiters.js`. Migration `211_profile_name_realtime.sql` enables profile rename events to refresh operational orders across devices; Team name saves also refresh local POS state. Paid orders retain saved names.

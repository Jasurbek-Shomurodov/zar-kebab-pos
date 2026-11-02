# Equipment Inventory

Register of the physical equipment the cafe owns (plates, spoons, forks), each with an optional photo and a count. This is not menu `stock_count`: nothing is consumed by orders and it has no cost, recipe, or reporting effect.

## Entry points

- Page: `src/pages/Inventory.jsx` at `/admin/inventory`, in the Kitchen & stock drawer group
- Helpers: `src/lib/inventory.js` (pure rules), `src/lib/inventoryPhoto.js` (browser photo handling)
- Database: `migrations/276_inventory_items.sql`; apply it before the frontend, because Team cannot save the `inventory` feature until its constraint allows it
- Tests: `tests/inventoryFeature.test.js`; SQL: `scripts/check-inventory-migration.mjs`

## Rules

- `inventory` is an independent Team feature: owner/admin holders edit, viewer holders read. Bazaar, Ingredients and Tech Cards access do not grant it, and no one but implicit owners has it until it is ticked in Team.
- RLS enforces this. There is no DELETE grant or policy: archive with `is_active`, restore by setting it back.
- One active item per name, case-insensitively (`23505` shows the duplicate message). Archived names may repeat.
- The `inventory_items_stamp` trigger owns `counted_at` and `counted_by_name`. They change only when `quantity` changes, so clients cannot forge them and retries do not move them.
- There is no count history: the card shows the last change only.
- Saves upsert with a client id chosen when the popup opens, so a retry cannot create a second row. A network failure reconciles against the row first.
- The page loads its own rows, pages past the PostgREST cap, and stays out of POS hydration and realtime. Failures are stored raw and localized on render.

## Photos

- Serverless functions are at the deployment limit, so photos reuse `api/menu-image/upload.js` and `api/menu-image/delete.js` with `?scope=inventory`. That scope needs `inventory` write access and can only touch keys under `menu/inventory/`; other scopes still need Manage Menu.
- Phone photos exceed the 4 MB upload limit, so the browser shrinks them to 1280px JPEG first. Menu media is never recompressed.
- A replaced photo is deleted only after the save succeeds. A photo uploaded in the popup is removed on cancel, unless the last save's outcome is unknown.

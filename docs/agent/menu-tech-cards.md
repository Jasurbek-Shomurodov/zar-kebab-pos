# Menu, Inventory, and Tech Cards

## Entry points

- Pages: `src/pages/AdminMenu.jsx`, `src/pages/TechCards.jsx`, `src/pages/PublicMenu.jsx`, `src/pages/TelegramMiniApp.jsx`
- Helpers: `src/lib/menuItems.js`, `src/lib/menuPricing.js`, `src/lib/menuMedia.js`, `src/lib/menuItemCosts.js`, `src/lib/techCards.js`
- Database: `src/lib/db.js`, migrations `139`, `149`–`151`, `154`–`156`, `223`, `241`, `242`
- Focused tests: `tests/menuItems.test.js`, `tests/menuArchiveSafety.test.js`, `tests/menuStock.test.js`, `tests/menuMedia.test.js`, `tests/techCards.test.js`, `tests/techCardsFeature.test.js`, `tests/sourceGuards.menu.test.js`, `tests/sourceGuards.public-menu.test.js`, `tests/menuNameValidation.test.js`
- Product/category names (uz/ru/en) must start with a capital or digit; Admin Menu blocks saving otherwise (`src/lib/menuItemText.js`). Admin Menu cards use `LuxMenuCard` (`MenuProductCards.jsx`).

## Visibility

- Public order: Corporate Sets (`c1789462941735`), Deals, others; card follows All.
- `frozen_shop` (`272`): `/frozen-meals` only.
- `menu_items.available` affects waiter orderability only. Public/Telegram still show active unavailable meals.
- `public_hidden` is owner-controlled. Non-owner saves preserve it; new products default visible.
- Manage Menu may create unavailable products and change availability (DB-enforced).
- `cashier_only`, schedules, category visibility, option visibility, and `deleted_at` are separate controls.
- Schedules gate waiter ordering only; public/Telegram list scheduled rows all day with a time label (`isPublicMenu*`, `241`).
- `deleted_at` is the archive boundary. Archived products/categories never reappear via availability.
- Archive/restore requires Manage Menu (any role; `223`). Telegram says archived, not deleted.
- `stock_count` is shelf inventory, never visibility/orderability.

## Product costs and history

- Normal/cashier-quick products require positive protected parent cost.
- Create product and cost atomically via the media-aware creation RPC; never insert the public product first.
- Protected current costs live in `menu_item_costs`; variant costs live in `variant_costs`. Public options contain names and selling prices only.
- `order_items.cost_price` is a sale-time snapshot. Reporting never falls back to today's cost for missing history.
- Price/cost edits affect future order items only; never rewrite paid revenue, profit, reports, or saved costs.
- Catalog deletion is archival; physical deletion is rejected (reports).
- Margin `(price-cost)/price` live.

## Availability notifications

- Availability changes, creation, and archival queue immutable Russian Team events with product/staff snapshots.
- Ordinary edits/restoration send nothing; archival keeps `available`. Saves/toggles share the DB event.
- The daily 08:00 Tashkent snapshot lists unavailable active products by Russian category or confirms all are available. See `telegram.md`.

## Inventory

- Payment deducts non-cancelled piece quantities exactly once in the atomic unpaid-to-paid transition.
- Parent and selected-variant stock clamp at zero; `orders.stock_deducted_at` prevents retry/correction double deduction.
- Weight-based inventory uses decimal stock.
- Old paid orders never deduct again.

## Media and text

- `media_urls[0]` is the cover and stays synchronized with `image_url`.
- Gallery: images, GIF, MP4, WebM; new products need a still image (`222`). Cards use the cover; details the gallery.
- Delete old R2 media after save; clean temp uploads on cancel.
- Upload errors render inside `ImageUploadField`, not `SortableItemCard`.
- Trim localized text at editor/write/display/DB boundaries; keep internal spaces and line breaks.
- `estimated_prep_minutes`: current-catalog estimate, 1–180 (default 15), not a historical order promise.
- Manage Menu Archive buttons use a retryable in-app dialog.
- Archive tab: Restore clears `deleted_at`; items restore after their category; restored categories stay hidden.

## Tech Cards

- Exclude Alcohol, Utensils, Carbonated Drinks. Bazaar prices locked; `227`/`228` sync catalog edits to same-name rows, unit-converted; `239` package `pieces_per_unit` prices piece rows per piece.
- Each active product has one protected base recipe and one recipe per eligible variant; empty `variant_option_id` means base.
- Ingredient and included-product rows belong to the exact product-and-variant recipe. Portion cost = batch ingredient cost / `portion_count` + per-portion component cost.
- Batch output = read-only `calculateTechCardBatchOutput` (ingredient kg; ml as g; no pieces).
- Save the card and complete ingredient list atomically with `save_menu_item_tech_card(payload jsonb)`. `183`/`236`: one sync per save for changed dishes and their includers; unchanged costs skipped, stops at convergence.
- `tech_cards` permission: route/read; Manage Menu: writes.
- Ingredient prices/recipes never enter public, Telegram, waiter, cashier, order, or receipt payloads.
- Saving a base recipe syncs the protected parent cost; a variant recipe syncs that option in protected `variant_costs`. Preserve order-item cost snapshots.
- Variant recipes may be copied/scaled; keep destination/portion count explicit.
- Components use `selected_options` for variants; empty means base.
- Included-product quantities are positive, fractional ok (`0,5`).
- Variant cost uses protected variant cost, falling back to protected parent cost. Changing parent selection clears stale options.
- `order_items.tech_card_component_snapshot` freezes chosen options. Payment deducts whole piece components once. Fractional components contribute proportional cost, never rounded integer stock movements.
- New orders freeze direct/nested ingredient quantities, units and prices in service-only `order_item_tech_card_ingredient_snapshots`; daily consumption uses paid, non-cancelled quantities. Never expose or backfill them.
- Repeat parents only per distinct variant.
- `186`: `/admin/ingredients` Team access, movement totals (see reporting); canonical snapshot keys.
- Used ingredients cannot archive; dialog lists cards (`242`, ids only), links `?variant=&ingredient=`.
- PDF: `TechCardPdfDownload.jsx`; `tests/techCardPdfData.test.js`.
- `205`: Take Away/Delivery/Game Club schedule overrides (`always_visible_*`); seeds Game Club lunch. Test: `tests/gameClubCategorySchedule.test.js`.
- Prune stale selections after staff load; translate errors on render (`tests/categoryScheduleAccess.test.js`).

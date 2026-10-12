# Menu, Inventory, and Tech Cards

## Entry points

- Pages: `src/pages/AdminMenu.jsx`, `src/pages/TechCards.jsx`, `src/pages/PublicMenu.jsx`, `src/pages/TelegramMiniApp.jsx`
- Helpers: `src/lib/menuItems.js`, `src/lib/menuPricing.js`, `src/lib/menuMedia.js`, `src/lib/menuItemCosts.js`, `src/lib/techCards.js`
- Database: `src/lib/db.js`, migrations `139`, `149`–`151`, `154`–`156`, and `223`
- Focused tests: `tests/menuItems.test.js`, `tests/menuArchiveSafety.test.js`, `tests/menuStock.test.js`, `tests/menuMedia.test.js`, `tests/techCards.test.js`, `tests/techCardsFeature.test.js`, `tests/sourceGuards.menu.test.js`, `tests/sourceGuards.public-menu.test.js`

## Visibility

- Public order: Corporate Sets (`c1789462941735`), Deals, other categories. Its card follows All. Visibility rules apply.

- `menu_items.available` affects waiter orderability only. Public/Telegram still show active unavailable meals.
- `public_hidden` is owner-controlled. Non-owner saves preserve it; new products default visible.
- Manage Menu may create unavailable products and change availability; database enforced.
- `cashier_only`, schedules, category visibility, option visibility, and `deleted_at` are separate controls.
- `deleted_at` is the archive boundary. Archived products/categories never reappear because of availability behavior.
- Archival/restoration requires Manage Menu (any role); see `223`. Telegram says archived, not deleted.
- `stock_count` is shelf inventory; never visibility or orderability.

## Product costs and history

- Normal/cashier-quick products require positive protected parent cost.
- Create a product and its cost atomically through the current media-aware creation RPC. Never insert the public product first.
- Protected current costs live in `menu_item_costs`; variant costs live in `variant_costs`. Public options contain names and selling prices only.
- `order_items.cost_price` is a sale-time database snapshot. Runtime reporting must never fall back to today's menu cost for missing historical coverage.
- Later price/cost edits affect future order items only. Never rewrite paid revenue, profit, reports, or saved order-item costs.
- Catalog deletion is archival; physical catalog deletion is rejected to preserve reports.
- Margin `(price - cost) / price` is a live preview only.

## Availability notifications

- Availability changes, creation, and archival queue immutable Russian Team events with product/staff snapshots.
- Ordinary edits/restoration send nothing; archival does not change `available`. Product saves and quick toggles share the database event.
- The daily 08:00 Tashkent snapshot lists unavailable active products by Russian category or confirms all are available. See `telegram.md`.

## Inventory

- Payment deducts non-cancelled piece quantities exactly once in the atomic unpaid-to-paid transition.
- Parent and selected-variant stock clamp at zero; `orders.stock_deducted_at` prevents retry/correction double deduction.
- Weight-based inventory uses its decimal stock model, not piece assumptions.
- Historical paid orders never trigger new deductions.

## Media and text

- `media_urls[0]` is the cover and stays synchronized with `image_url`.
- Gallery: images, GIF, MP4, WebM. New products need a still image (`222`). Cards/Telegram use the cover; details show the gallery.
- Delete old R2 media after save; clean temp uploads on cancel/removal.
- Upload errors render inside `ImageUploadField`, not `SortableItemCard`.
- Trim localized text at editor/write/display/database boundaries; preserve internal spaces and description line breaks.
- `estimated_prep_minutes` is a localized current-catalog expectation from 1–180 minutes (default 15), not a historical order promise.
- Manage Menu Archive buttons use a retryable in-app dialog.
- Archive tab: Restore clears `deleted_at`; items restore after their category; restored categories stay hidden.

## Tech Cards

- Exclude Alcohol, Utensils, Carbonated Drinks. Bazaar prices locked; `227`/`228` sync catalog edits to same-name rows, unit-converted.
- Each active product has one protected base recipe and one recipe per eligible variant; empty `variant_option_id` means base.
- Ingredient rows and included-product component rows belong to the exact product-and-variant recipe. Batch ingredient cost divided by `portion_count`, plus per-portion component cost, is the current portion cost.
- Save the card and complete ingredient list atomically with `save_menu_item_tech_card(payload jsonb)`. `183`/`236`: one sync per save for changed dishes and their includers; unchanged costs skipped, stops at convergence.
- `tech_cards` permission controls route/read access; Manage Menu separately controls writes.
- Ingredient prices/recipes never enter public, Telegram-menu, waiter, cashier, order, or receipt payloads.
- Saving a base recipe synchronizes the protected parent cost; saving a variant recipe synchronizes that option in protected `variant_costs`. Preserve order-item cost snapshots.
- Variant recipes may be copied/scaled; keep destination and portion count explicit.
- Components use `selected_options` for variants; empty means base.
- Included-product quantities are positive recipe amounts and may be fractional for every sale unit; accept decimal points and commas: `0.3` and `0,5`.
- Variant calculation uses protected variant cost with protected parent-cost fallback. Changing parent selection clears stale options.
- `order_items.tech_card_component_snapshot` freezes chosen options. Payment deducts whole piece components once. Fractional components contribute proportional cost, never rounded integer stock movements.
- New orders freeze direct and nested ingredient quantities, units, and prices in service-only `order_item_tech_card_ingredient_snapshots`. Daily consumption uses paid, non-cancelled quantities; never expose or backfill these snapshots.
- Allow repeated parents only for distinct variants.
- Migration `186`: `/admin/ingredients` has Team access and movement totals; see the reporting guide. New ingredient snapshots use unambiguous canonical keys.
- PDF export: `src/components/TechCardPdfDownload.jsx`; `tests/techCardPdfData.test.js`.
- `205`: Take Away/Delivery/Game Club schedule overrides (`always_visible_*`); seeds Game Club lunch. Other visibility rules remain. Test: `tests/gameClubCategorySchedule.test.js`.
- Prune stale selections after staff loads; translate errors at render. Test: `tests/categoryScheduleAccess.test.js`.

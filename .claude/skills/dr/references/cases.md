# Design regression catalog (Zar Kebab POS)

Severity if failed (`review-core` section 2): **S0** unreadable or unusable
(overflow hides content, a waiter or cashier control unusable on a phone or
tablet, contrast failure, money misformatted, a receipt that no longer
prints); **S1** a strict rule or shared-component rule broken, a missing
shimmer, empty or error state; **S2** polish. Each case says how to measure
it. IDs are stable; append, never renumber. `[dr YYYY-MM-DD]` marks a case
added from a finding in that run.

Tokens: `src/styles/workspace.css`, `tailwind.config.js`, dark remap in
`scripts/build-dark-theme.mjs`. Strict-rule greps are in `SKILL.md` section 2.

## Run log (newest first; `retest` starts from the top row)

| Date | Commit | Scope | Findings (S0/S1/S2) | Checks run | Not run |
|---|---|---|---|---|---|

## LAY — layout and frames

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| LAY-001 | S1 | Grid and edges aligned | Screenshot at 1280 px; measure card edges | One grid; no orphan tile |
| LAY-002 | S1 | No dead space | 1920 px on admin pages | No empty area wider than a card |
| LAY-003 | S1 | Primary action dominates | Send to kitchen, Mark paid, headline number | Largest and heaviest element in its area; one primary per area |
| LAY-004 | S1 | 4 px spacing scale | `getComputedStyle` gaps | Multiples of 4; same component same spacing everywhere |
| LAY-005 | S2 | Section gaps even | Measure | Equal |
| LAY-006 | S2 | Page frame identical across screens | Audit K (§3) on every staff screen at 1440 and 375 | Same `h1` top and left in the top bar on every page; `document.title` names the page [dr 2026-10-16] |


## COL — colour and themes

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| COL-001 | S1 | Brand orange accent, `ws-*` surfaces | Inspect new classes | Tokens; hard-coded neutrals covered by the dark remap |
| COL-002 | S0 | Body text contrast | Measure in both themes | At least 4.5:1 |
| COL-003 | S0 | Large numbers and icons contrast | Measure | At least 3:1; readable on a bright tablet |
| COL-004 | S1 | Status colours consistent | Table status, order status, money in/out across tiles, badges, charts | Same meaning, same colour; never colour alone |
| COL-005 | S1 | Third-party parts themed | Chart tooltips, PDF previews in dark | Themed |
| COL-006 | S2 | Theme persists | Toggle, reload | Kept |
| COL-007 | S0 | Measured text contrast | Audit I (§3) in light and dark, with each dialog open | Empty below 4.5:1 for body text; large figures and icons may stop at 3:1 (COL-003) [dr 2026-10-16] |
| COL-008 | S1 | Negative tone only for meaning | Audit G (§3) on every screen | Every `--ws-negative` text is money out, overdue, a fine, a cancelled order or an error [dr 2026-10-16] |


## TYPE — typography and numbers

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TYPE-001 | S1 | Type scale and weights consistent | Compare headings and body across pages | Same per level |
| TYPE-002 | S0 | Money formatted | Any total | `1 000 000 so'm`, unit muted, no wrap mid-number |
| TYPE-003 | S1 | Tabular numbers for money and table numbers | `getComputedStyle(...).fontVariantNumeric` | `tabular-nums` |
| TYPE-004 | S1 | Dates localized in Tashkent time | RU and UZ dates | Localized; correct day |
| TYPE-005 | S1 | RU/UZ strings fit | 375 px waiter, 768 px cashier | No truncation hiding meaning; item names in all languages |
| TYPE-006 | S0 | Money audit passes in UZ, RU and EN | Audit C (§3): decimals, comma thousands, unspaced unit, hyphen-minus, literal unit outside its language, chart labels | Empty except tech-card unit prices with up to two decimals [dr 2026-10-16] |
| TYPE-007 | S1 | Type sizes and radii come from tokens | Audit D (§3) per screen; compare with `--ws-type-*` and `--ws-radius-*` | Only 12, 13, 14, 15, 20 px and the page/display clamps; radii 8, 10, 12, 16 px or pill [dr 2026-10-16] |
| TYPE-008 | S1 | No language leftovers | Audit F (§3) in UZ, RU and EN | Only data (item, employee, ingredient names) may be in another language [dr 2026-10-16] |


## TOUCH — touch and interaction

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TOUCH-001 | S0 | Targets at least 44 px on waiter, cashier, kitchen | Measure buttons and tiles | Height and width ≥ 44 px |
| TOUCH-002 | S1 | Primary actions within thumb reach | 375 px waiter | Send and cart in the bottom half |
| TOUCH-003 | S1 | No hover-only affordances | Inspect | Every action reachable by tap |
| TOUCH-004 | S1 | Destructive actions apart and confirmed | Archive, delete order, remove from cart | Separated from primary; in-app dialog |
| TOUCH-005 | S1 | Pressed buttons show progress and block a second tap | Tap Send twice | Spinner inside the button; one request |
| TOUCH-006 | S1 | Focus-visible, active, disabled states | Tab and inspect | Visible |
| TOUCH-007 | S2 | Motion respects reduced motion | `rg -n "prefers-reduced-motion" src/styles` | Present |
| TOUCH-008 | S1 | Disabled state honesty | Audit H (§3) with each dialog open | No control that looks enabled but is `aria-disabled`; every disabled button has a visible reason (`title` or `aria-describedby`) [dr 2026-10-16] |
| TOUCH-009 | S1 | Button sizes follow their class | Audit P (§3) on every screen and open dialog | `ws-btn` 42, `ws-btn-sm` 34, icon buttons square, no two-line labels, one primary per surface; `other` buttons are REUSE-004 [dr 2026-10-16] |
| TOUCH-010 | S2 | Motion inventory restrained | Audit Q (§3) across a page switch and a dialog open | Durations ≤ 300ms (public page enter 360ms), only opacity/transform, nothing loops but shimmers, layout shift ≤ 0.1 [dr 2026-10-16] |


## STATE — loading, empty, error

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| STATE-001 | S1 | Every data page has a shimmer | `rg -L "PageShimmer\|OperationalLoading" src/pages/*.jsx` | No data page listed |
| STATE-002 | S1 | Every data page has an empty state | Read each page | Explains the next step |
| STATE-003 | S1 | Every data page has a retryable error | `rg -L "OperationalError\|OperationalState" src/pages/*.jsx` | No data page listed |
| STATE-004 | S1 | Static UI renders at once | Throttle | Headings and forms visible before data |
| STATE-005 | S1 | Shimmer keeps layout | Compare screenshots | No jump |

## RULE — strict rules

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RULE-001 | S1 | No blocking dialogs | Strict grep 1 | None |
| RULE-002 | S1 | No spinners or loading text for data | Strict grep 2 | None outside a pressed button |
| RULE-003 | S1 | Money and dates via helpers | Strict grep 3 | None |
| RULE-004 | S1 | No native date or time inputs | Strict grep 4 | None |
| RULE-005 | S1 | z-index from one scale | Strict grep 5 | No ad hoc values; no clipping overlays |
| RULE-006 | S1 | Inline style only for runtime values | Strict grep 6 | Chart colours, measured heights, zone colours only |
| RULE-007 | S1 | Arbitrary values only without a scale step | Strict grep 7 | Repeated values become tokens |
| RULE-008 | S1 | One icon set, consistent sizes | `rg -n "lucide-react" src \| wc -l` and other icon imports | Only lucide; `aria-hidden` next to text |
| RULE-009 | S1 | No literal strings in JSX | `rg -n ">[A-Za-zА-Яа-я][^<{]{3,}<" src/pages src/components` | Everything via `t`/`tf` |
| RULE-010 | S1 | Each data page has shimmer, empty and error | STATE-001 to STATE-003 | All three |

## REUSE — pages and components

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| REUSE-001 | S1 | Sibling pages built the same way | Diff Expenses vs Daily Bazaar, Salaries vs Employees, Waiter vs Cashier tables, Reports vs Accounting | No structural drift |
| REUSE-002 | S1 | No repeated markup pattern | Three or more elements with the same classes in two files | Shared component in `src/components` |
| REUSE-003 | S1 | Same query or derived total not in two pages | Compare loaders | `src/lib` helper or `appHooks` selector |
| REUSE-004 | S1 | Near-duplicates merged | Two pickers, two badges, two summary strips | One with a `variant` |
| REUSE-005 | S2 | Pages under about 600 lines | `wc -l src/pages/*.jsx` | Larger ones split into sections |

## PERF — perceived performance

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PERF-001 | S1 | Tables, bill and main numbers show fast | `read_network_requests` | Within one round trip |
| PERF-002 | S1 | No layout jump | Compare screenshots | Same positions |
| PERF-003 | S1 | Slow requests leave shimmers | Throttle | No blank areas |
| PERF-004 | S2 | Menu images sized | Image requests | Sensible dimensions |

## RESP — responsiveness and accessibility

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| RESP-001 | S0 | No horizontal scroll at 375 px | `scrollWidth` on each page | Equals viewport |
| RESP-002 | S0 | Wide tables scroll inside their card or become cards | Admin tables at 375 px | Usable |
| RESP-003 | S1 | 768, 1280, 1920 px | Screenshot | Sensible tile count; nothing clipped |
| RESP-004 | S1 | Landmarks, headings, labelled controls | `read_page` | Present; alt text on food photos |
| RESP-005 | S2 | Keyboard order on admin pages | Tab | Logical |
| RESP-006 | S1 | No strip scrolls sideways | Audit A `scrollers` (§3) and the sweep's `stripScroll` at every size | Only the category scroller, wide tables inside their card and the phone table grid scroll [dr 2026-10-16] |
| RESP-007 | S1 | No stacking while a row has room | Audit L (§3) at 1180, 1024 and 768 with the sidebar open | Empty unless the second line is deliberate (wrapped chips, chart legend) [dr 2026-10-16] |
| RESP-008 | S0 | Nothing sits on top of anything | Audit M (§3) and the sweep's `overlap` at every ladder size | Empty; a price badge over a photo corner is fine, over a name is not [dr 2026-10-16] |
| RESP-009 | S1 | Fields at least 16px on phones | Sweep `input16` at the touch sizes; `parseFloat(getComputedStyle(input).fontSize)` | ≥ 16px so iOS does not zoom on focus [dr 2026-10-16] |
| RESP-010 | S0 | Words never break between letters | Audit N (§3) and the sweep's `brokenWords` at every size in UZ, RU and EN | Empty (a break at a hyphen or slash is fine) [dr 2026-10-16] |
| RESP-011 | S0 | Dialogs, sheets and listboxes fit the screen | Audit O (§3) and `DIALOGS=1` sweep at 320, 667×375 and 1024; focus the first field at 375×667 | Inside the viewport or scrolling; title and footer reachable; no two-line buttons; equal footer heights [dr 2026-10-16] |
| RESP-012 | S1 | Clean at the ladder seams | Sweep at 414, 540, 600, 820, 912, 1180 and landscape 667×375 / 820×375 | No new `out`, `clipped`, `overlap` or `brokenWords` hit that the standard widths do not show [dr 2026-10-16] |
| RESP-013 | S1 | Every control has a name | Audit E (§3) with each dialog open | Empty: text, `aria-label`, `aria-labelledby`, `title` or a `label` [dr 2026-10-16] |


## PRINT — receipts and kitchen checks

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PRINT-001 | S0 | Receipt prints per `PRINTING.md` | Print preview of `/receipt/:orderId` | Width, fonts and cut per the document |
| PRINT-002 | S0 | Kitchen check prints | `/kitchen-check/:orderId` | Items, quantities, table, time; no prices or costs |
| PRINT-003 | S1 | Long item names wrap | A 40-character name | Wraps; no overflow |
| PRINT-004 | S2 | Logo renders | `src/lib/brandLogo.js` | Present and sharp |

## PUB — public menu and Telegram mini app

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PUB-001 | S1 | Food photos sharp and consistently cropped | Inspect `/menu` | Same aspect; no blur |
| PUB-002 | S1 | Image shimmer while loading | Throttle | `ImageLoadShimmer` |
| PUB-003 | S1 | Prices clear | Inspect | Formatted; visible on every card |
| PUB-004 | S1 | Category scroller one-handed | 375 px | Scrolls; active category visible |
| PUB-005 | S2 | Telegram mini app matches the menu | `/telegram` | Same look and data |

---
name: dr
description: Thorough design and UX review of a page, component, screenshot or Figma frame in Zar Kebab POS. Checks layout, spacing, empty space, colours and dark/light themes, typography, touch ergonomics for waiters and cashiers, loading/empty/error states, responsiveness, locales, print formats and consistency across pages. Use when the user types /dr.
argument-hint: "[empty = full | diff | page/route | component | screenshot | Figma URL] [fix]"
disable-model-invocation: true
---

# /dr: design review

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Zar Kebab POS.

Target: `$ARGUMENTS` (grammar in `review-core` section 1). `diff` means every
screen the uncommitted diff (or else the last commit) touches. Empty, `full`
or `all` means every page under `src/pages` and every component under
`src/components`: run the strict-rule scan once, split
the pages into groups (public menu + Telegram, waiter + kitchen, cashier +
receipts, admin/accounting/payroll) for parallel review, and compare siblings
across groups for reuse. If the arguments contain `fix`, implement the agreed
improvements afterwards. Otherwise review and propose only.

Judge it like a senior product designer looking at a restaurant POS used during
a lunch rush: can a waiter with one free hand find the table and send the
order fast, can the cashier read the total at a glance, is the owner's headline
number obvious, and does the guest-facing menu make the food look good? It
must look intentional in both themes and all three languages.

## 1. Gather the visuals

- **Live app** at `http://localhost:5173` (start `pos-dev` from
  `.claude/launch.json` if it is not running). Staff pages need sign-in: prefer
  **Claude in Chrome** (already signed in, use a new tab). In the built-in
  browser, ask the user to sign in. Never enter credentials yourself. `/menu`
  and `/telegram` are public. The app uses production data: look, do not save.
- Capture each target screen at **375, 768, 1280 and 1920 px**, in **light and
  dark** theme, and in **RU** (the longest strings) plus UZ. Capture shimmer,
  empty and error states where you can reach them. Waiter screens matter most
  at 375 px, cashier screens at 768 px.
- Receipts and kitchen checks: also check the print layout (`PRINTING.md`,
  `Receipt.jsx`, `KitchenCheckReceipt.jsx`).
- **Screenshots** from the user: inspect them closely and zoom into problem
  areas.
- **Figma URL**: pull the frame with the Figma tools (`get_design_context`,
  `get_screenshot`, `get_variable_defs`) and compare against the build: spacing,
  sizes, colours and copy.
- **Reference app**: `/Users/Jasurbek_Shomurodov/Desktop/personal-finance` is
  the source of the dark palette and density. Compare with it when the user
  mentions it.
- Read the source of the screen and the shared components it uses
  (`AppShell`, `WorkspaceTopBar`, `UnifiedSidebar`, `PageShimmer`,
  `OperationalState`, `StatusBadge`, `ChoiceTiles`, `CalendarPicker`,
  `DateRangePicker`, ...), plus the tokens in `src/styles/workspace.css`,
  `tailwind.config.js` and the dark remap in `scripts/build-dark-theme.mjs`.

## 2. Review checklist

**Layout and frames**
- Grid and alignment: consistent columns and edges, no orphan cards, a sensible
  card or table-tile count per row at each width.
- Empty space: dead areas, cards stretched by a taller neighbour, charts with no
  data (future days), banners with little content, uneven section gaps.
- Hierarchy: the headline number or the primary action (send to kitchen, mark
  paid) dominates; secondary data is visibly secondary. One primary action per
  area.
- Density: padding and gaps follow a consistent 4 px scale, and the same
  component uses the same spacing on every page.

**Colour and themes**
- Brand orange is the accent; `ws-*` tokens for workspace surfaces. Any
  hard-coded neutral class must be covered by the dark remap, otherwise it
  stays light in dark mode. Third-party defaults (chart tooltips, PDF previews)
  need explicit theming.
- Contrast: body text at least 4.5:1, large numbers and icons at least 3:1, in
  both themes. Muted text must still be readable on a bright restaurant tablet.
- Meaning: table status (free, occupied, needs bill, reserved), order status
  and money in/out use the same colour everywhere, including charts, badges and
  legends. Colour is never the only signal.

**Typography and numbers**
- Type scale and weights consistent; tabular numbers for money and table
  numbers.
- Money and dates formatted (`1 000 000 so'm`, localized dates in Tashkent
  time), unit muted, long amounts never wrap mid-number.
- RU/UZ strings fit: no truncation that hides meaning, no awkward wrapping, menu
  item names in all languages.

**Touch, components and interaction**
- Waiter, cashier and kitchen controls: touch targets of at least 44 px, primary
  actions within thumb reach, no hover-only affordances, no accidental-tap risk
  next to destructive actions (archive, delete order, remove from cart).
- Destructive actions confirm with an in-app dialog, never `window.confirm`.
- Hover, focus-visible, active and disabled states; pressed buttons show
  progress and block a second tap.
- Loading uses content-shaped shimmers that keep the layout stable (no
  spinners, no "Loading" text; static headings and forms render at once). Empty
  states explain the next step; errors offer retry.
- Motion is purposeful and respects `prefers-reduced-motion`.
- Charts: readable axes, themed tooltips, legend matches the series, no
  misleading scales.
- Public menu and Telegram mini app: food photos sharp and consistently
  cropped, image shimmer while loading, prices clear, category scroller usable
  one-handed.

**Reusability (pages and components)**
- Pages of the same kind (Expenses vs Daily Bazaar, Salaries vs Employees,
  Waiter vs Cashier tables, Reports vs Accounting) should be built the same way;
  diff a page against its closest sibling and flag structural drift.
- Duplication: the same markup pattern (three or more elements with the same
  classes) in two or more files is a missing shared component in
  `src/components`; the same query, derived total or form logic in two pages is
  a missing `src/lib` helper or `appHooks` selector. Name what to extract and
  every call site.
- Near-duplicates (two pickers, two summary strips, two status badges) are
  merged into one with a `variant`. Extend an existing component before
  creating a new one.
- Pages over about 600 lines, or one component rendering three or more
  independent sections, are split into section components.

**Strict rules (each hit is at least S1; run the scan, quote the lines)**

```bash
g(){ grep -rnE --include='*.jsx' "$1" src/pages src/components; }
g 'window\.(confirm|alert)|\balert\('                               # blocking dialogs
g 'animate-spin|Loading\.\.\.|Yuklanmoqda|Загрузка'                 # spinners / loading text outside buttons
g 'toLocaleString|toLocaleDateString|toFixed\('                     # bypasses formatCurrency / dateFormat
g 'type="(date|month|time)"'                                        # native pickers instead of CalendarPicker / TimePicker24
g '\bz-(\[[^]]+\]|[0-9]+)'                                          # ad hoc z-index
g 'style=\{\{'                                                      # inline style
g '\b[a-z:-]+-\[[^]]+\]'                                            # arbitrary Tailwind values
```

1. No blocking `alert`/`confirm` in operational flows.
2. No spinners or loading text for data; spinners only inside a pressed button.
3. Money and dates only through `formatCurrency`, `moneyInput.js` and
   `dateFormat.js`.
4. Dates and times through `CalendarPicker`/`DateRangePicker`/`TimePicker24`,
   not native inputs.
5. z-index from one layered scale (content < sticky < nav < drawer/overlay <
   toast); report any two overlays that share a layer or clip each other.
6. Inline `style` only for runtime values (chart colours, measured heights,
   zone colours, percentages).
7. Arbitrary values only when no scale step exists; a value needed in two
   places becomes a token.
8. One icon set (`lucide-react`), consistent sizes per context, `aria-hidden`
   next to text.
9. No user-facing literal strings in JSX; everything through `t`/`tf` with
   `uz`, `ru` and `en` keys.
10. Each data page has a shimmer for loading, an empty state and a retryable
    error.

**Perceived performance**
- With `read_network_requests`: how long until tables, the bill or the main
  numbers show, whether the layout jumps when data arrives, whether slow
  requests leave blank areas instead of shimmers, and whether menu images load
  at a sensible size.

**Responsiveness and accessibility**
- No horizontal page scroll at 375 px; wide tables scroll inside their card or
  turn into cards.
- Landmarks and headings, labelled controls, alt text on food photos, keyboard
  order on admin pages.

## 3. Report

Use the skeleton from `review-core` section 3:

```
DR: <target>   Commit: <sha>   Verdict: <one line>
Environment: <widths, themes, locales, data state>

Findings (most impactful first)
1. [S0|S1|S2] <screen / area>: <problem>
   Scenario: seen at <width / theme / locale>   Evidence: <screenshot or measurement>
   Fix: <specific change, e.g. "gap-4 → gap-3; move X into Y's header"> (file)
   Verified: <measured how>

Strict rule hits: <rule # → count, top files>
Reuse opportunities: <component/helper to extract → call sites>
Suggestions / Works well: <short lists>
Checked, not a finding: ...
Not run: ...
Quick wins vs larger redesigns: <split>
```

Severity here: **S0** = unreadable or unusable (content hidden by overflow,
a waiter or cashier control unusable on a phone or tablet, contrast failure,
money misformatted, a receipt that no longer prints). **S1** = a strict rule
or shared-component rule broken, a missing shimmer, empty or error state.
**S2** = polish and consistency.

Attach the key screenshots. For larger proposals, describe or sketch the
before/after layout. With `fix`: implement the changes using the shared
components and tokens, keep the dark remap covering new classes, re-capture the
same widths, themes and locales, show before/after screenshots, and run
`npm test` (source guards included) and `npm run build`.

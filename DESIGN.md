# Zar Kebab POS design system

The one design page for the app. It records the tokens and rules the code
already uses, so a new screen can be built without reading an old one. The
source of truth for values is `src/styles/workspace.css` (staff workspace),
the `.zk-lux` block in `src/index.css` (public site) and
`scripts/build-dark-theme.mjs` (dark palette). When a value here and the CSS
disagree, the CSS wins and this page is the bug.

Review a screen against this page with the `/dr` skill
(`.claude/skills/dr/SKILL.md`); its catalog of measurable cases is
`.claude/skills/dr/references/cases.md`.

## What the product is

A fast, dense point of sale used on tablets and phones during service. A
waiter holds a phone in one hand over a table, a cashier reads a total on a
768px tablet, the owner checks one headline number. Speed of reading and
tapping beats decoration everywhere except the guest-facing menu, where the
food photos carry the page.

Three kits share the app and must not be mixed on one screen:

| Kit | Where | Classes |
|---|---|---|
| Workspace | every staff screen under `AppShell` | `ws-*` in `src/styles/workspace.css` |
| Lux | public menu, vacancies, waiter order catalogue | `.zk-lux`, `lux-*` in `src/index.css` |
| Print | receipts and kitchen checks | inline print CSS, always light, see `PRINTING.md` |

## Colour

Colour carries meaning, never decoration. One accent, four status tones, and
neutrals for everything else.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ws-background` | `#f6f5f3` | `#101412` | page, sidebar, top bar |
| `--ws-card` | `#ffffff` | `#181e1b` | panels, fields, dialogs |
| `--ws-muted` | `#efece9` | `#151b17` | quiet fills, pills, segmented track |
| `--ws-hover` | `#ebe8e5` | `#222a25` | hovered or pressed row |
| `--ws-border` | `#e4e1de` | `#303b33` | card and hairline border |
| `--ws-input` | `#dcd9d6` | `#3d4a41` | field border |
| `--ws-foreground` | `#22201d` | `#edf3ef` | body text |
| `--ws-muted-foreground` | `#68655f` | `#a1afa5` | secondary text: the only muted ink |
| `--ws-primary` | `#ff5a00` | `#ff5a00` | brand accent: icons, large figures, focus ring, active marker |
| `--ws-primary-ink` | `#bf4300` | `#ff7a30` | orange *text* under 24px (links, active tab, accent badge) |
| `--ws-primary-solid` | `#cc4800` | `#cc4800` | fill under a white label (primary button, count badge) |
| `--ws-primary-solid-hover` | `#b23f00` | `#b23f00` | its hover and pressed state |
| `--ws-accent` | `#fff1e8` | `#33241a` | pale selected surface |
| `--ws-positive` | `#1d7a52` | `#4cc38a` | money in, paid, available, success |
| `--ws-negative` | `#c4262c` | `#f0a096` | money out, overdue, fine, cancelled, error (ink) |
| `--ws-negative-solid` | `#c4262c` | `#b3261e` | fill under a white label (confirm delete) |
| `--ws-negative-solid-hover` | `#a81f24` | `#99201a` | its hover and pressed state |
| `--ws-caution` | `#9a5a00` | `#dfb883` | pending, waiting, needs attention |
| `--ws-info` | `#2a6fdb` | `#8ab4f8` | neutral information |

Rules:

- **Contrast.** Text under 24px is at least 4.5:1 against the colour actually
  behind it (blend translucent layers first); figures of 24px and more and
  icons are at least 3:1. Brand orange `#ff5a00` is 3.1:1 on white, so it is
  never used for small text and never sits under a small white label: use
  `--ws-primary-ink` for the text and `--ws-primary-solid` for the fill.
- **One muted ink.** Secondary text is `--ws-muted-foreground` (`.ws-caption`,
  `.ws-muted`, or `text-[#68655f]`). The lighter greys (`#9CA3AF`,
  `text-gray-400`, `#8a867f`, `#D1D5DB`, `#C3C8D0`) fail on white and are
  only for disabled glyphs and decorative icons.
- **Status means the same thing everywhere.** Use `.ws-status` or `.ws-badge`
  with a tone class; `STATUS_TONE` in `StatusBadge.jsx` maps table, order and
  account statuses to those tones in one place: free or active is positive,
  seated or paid is neutral, sent to the kitchen or reserved is info, cooking
  is accent, ready to serve or pending is caution, needs the bill or disabled
  is negative. Colour is never the only signal: the word is always there.
- **Negative is for meaning.** Red text is money out, an overdue or cancelled
  thing, a fine or an error. Not emphasis.
- **Dark theme.** Hard-coded Tailwind colour classes are remapped by
  `scripts/build-dark-theme.mjs` (it scans `src/`). Colours passed as inline
  `style` or SVG attributes are invisible to it: use a class
  (`className="stroke-current text-[#e4e1de]"`) or a `var(--ws-*)`.
  `index.html` paints a dark first frame (`boot-dark`) and `src/lib/theme.js`
  keeps `theme-color` in step, because mobile Safari tints its bars from the
  first paint; the shell colour is repeated there and guarded by
  `tests/darkTheme.test.js`.
- **Lux kit.** `--lux-gold` is `#8A5A22` in light and `#D9A866` in dark, so
  small gold labels pass; `--lux-muted` (`#6F6358` / `#B9A994`) for helper text.

## Type

Onest for the whole interface (`--ws-font-display`); Cormorant Garamond
(`.zk-serif`) only on public pages. Body is 15px.

| Token | Size | Use |
|---|---|---|
| `--ws-type-micro` | 12px | badges, counts: the smallest size allowed |
| `--ws-type-caption` | 13px | secondary lines, table heads |
| `--ws-type-small` | 14px | buttons, fields, body rows |
| `--ws-type-compact` | 15px | dense body |
| `--ws-type-heading` | 20px | panel headings (`.ws-heading`) |
| `--ws-type-page` | 22 to 26px | page title |
| `--ws-type-display` | 24 to 30px | headline figure (`.ws-display`) |

- Nothing renders under 12px. `text-[8px]` to `text-[11px]` are raised to
  12px globally; do not rely on that, write `text-xs`.
- Fields are 16px on touch screens (`src/index.css`) so iOS does not zoom.
- Weights are 500 for controls and headings, 600 for figures. `font-black`
  and tracked capitals are legacy; labels are **sentence case** ("Open
  bill", not "Open Bill" or "OPEN BILL").
- Money and table numbers use `tabular-nums` and never wrap inside the
  figure: `whitespace-nowrap` on the amount, let the label wrap instead.
- Money goes through `formatCurrency` (`src/lib/formatCurrency.js`), which
  groups digits itself so every browser prints `1 250 000 UZS`. Compact
  axis labels use `formatCompactCurrency`, percentages `formatPercent`.
  Never `toLocaleString`, `toFixed` or `Intl.NumberFormat('uz-UZ')` in a
  page: Chrome has no Uzbek number data and prints `1,250,000`.
- Dates go through `src/lib/dateFormat.js` (Tashkent time). No native
  `type="date|month|time"` inputs: `CalendarPicker`, `DateRangePicker`,
  `TimePicker24`.

## Space, radius, elevation

- Spacing is a 4px scale: 4, 8, 12, 16, 20, 24, 32, 48. Tight inside a
  group, wider between groups.
- Page: `.ws-page` (28/36/60px padding, 20px between sections; 20/16/40 and
  16px on phones). Panel: `.ws-panel` (20px, 16px on phones).
- Radius: buttons 8px, fields and controls 10px, cards 12px, dialogs 16px,
  pills fully round.
- Elevation is declared once: a hairline border with `--ws-shadow-card`.
  Dialogs use the `.ws-dialog` shadow. No coloured glows.
- **No cards inside cards.** Inside a panel, group with a divider row
  (`.ws-row`) or a borderless `bg-[--ws-muted]` inset, never a second
  bordered, shadowed box.

## Layers

One scale. The lower steps are Tailwind's numeric utilities; the layers above
the page are named in `tailwind.config.js` and mirrored as `--ws-z-*`. An
arbitrary `z-[120]` or a bare `z-50` is a defect
(`tests/modalKeyboard.test.js` fails on one).

| Class | Value | What sits there |
|---|---|---|
| `z-10` | 10 | sticky table heads, local stacking |
| `z-20` | 20 | sticky toolbars, drag ghosts |
| `z-30` | 30 | top bar |
| `z-40` | 40 | menus, listboxes, inline popovers |
| `z-drawer` | 50 | navigation drawer, waiter cart drawer |
| `z-floating` | 60 | the floating search field |
| `z-overlay` | 80 | full-screen overlays (guest hand-off, public dish page) |
| `z-dialog` | 100 | dialogs and sheets |
| `z-picker` | 200 | portaled pickers opened from a dialog |
| `z-toast` | 300 | toasts and connection notices |
| `z-critical` | 400 | the order-deletion confirmation |

## Controls and their states

Every control has all of these; a missing state is a defect.

| State | How |
|---|---|
| hover | fine pointers only; never the only way to reach something |
| focus-visible | 2px `--ws-ring` outline, 2px offset |
| pressed | `.ws-btn:active` darkens and settles 1px |
| disabled | 50% opacity, `cursor: not-allowed`, and a visible reason nearby |
| loading | the pressed button shows `Loader2` and is disabled until the write settles |
| error | the message sits beside the control that failed, with a way to retry |

Shared classes (all in `src/styles/workspace.css`):

- `.ws-btn` 42px high (44px on touch); `.ws-btn-sm` 34px (44px on touch);
  `.ws-btn-icon` square. Variants: `-primary`, `-outline`, `-ghost`, `-danger` (ink),
  `-danger-solid` (confirm). One primary per surface.
- `.ws-input` 44px; `textarea.ws-input` grows; `:disabled` and
  `[aria-invalid=true]` are styled. Notes and reasons are always a textarea.
- `.ws-segmented` for a switch between views of the same data;
  `.ws-page-tabs` for a page's sections; `.ws-switch` for an on/off setting.
- `.ws-badge`, `.ws-status`, `.ws-count` with `.ws-tone-positive|negative|
  caution|info|accent`.
- `.ws-empty` for empty states, `.ws-notice` for inline messages.

**Touch targets.** Service screens (waiter, cashier, kitchen checks, public
menu) keep every control at 44px or more. Admin screens keep 40px or more on
touch. Compact desktop sizes grow under `@media (pointer: coarse)`; a
hand-rolled `h-8` button does not, so use the shared classes. A destructive
control never sits within 8px of a routine one.

## Dialogs

`WorkspaceDialog` (`src/components/WorkspaceDialog.jsx`) is the only modal
surface. It pins the title and the action row and scrolls the body between
them, so both stay in view at 320x568, 667x375 and with the keyboard up
(about 375x330). It traps Tab, closes on Escape, returns focus to the opener
and sits on `z-dialog`.

- `variant="sheet"` is a bottom sheet on phones, `variant="alert"` a
  confirmation the backdrop cannot dismiss.
- The confirm button names the action ("Archive dish"), never "OK" or "Yes".
- No `window.alert` or `window.confirm` anywhere.
- A dialog is for a task that needs focus. Prefer inline editing or an undo
  for anything recoverable.

## States every data screen has

- **Loading:** a content-shaped shimmer from `PageShimmer.jsx`
  (`OperationalLoading layout=...`). Static headings, filters and forms render
  at once; only data shimmers. Spinners only inside a pressed button. When a
  screen's layout changes, its shimmer layout changes in the same commit.
- **Empty:** `.ws-empty` that says what to do next and offers the action
  ("No tables match this filter" with "Show all tables").
- **Error:** `OperationalError` with a retry that re-runs the loader (not a
  page reload, which throws away the cart and filters). A failed load is never
  shown as zero: print `—`.

## Motion

Motion shows a state change and then stops.

- 150ms for hover and press, 180 to 280ms for a dialog or sheet entering,
  300ms for the drawer. Nothing routine is longer than 300ms; exits are
  faster than entrances.
- Only `opacity` and `transform` animate. No bounce.
- Nothing loops except shimmers and the check-in countdown.
- Everything respects `prefers-reduced-motion` (one global rule in
  `src/index.css` plus the per-class ones).

## Words

- Every visible string exists in Uzbek, Russian and English with the same key
  shape; `tests/i18nLabelParity.test.js` fails when a language misses a key.
- Sentence case. Buttons are a verb and its object. The same action has the
  same wording on every screen.
- Errors say what failed and what to do. Stored errors are codes translated
  at render, so a language switch never leaves an old-language message and
  never refetches data.
- Menu item, employee and ingredient names are data and may be in any
  language.

## Responsive

Measured widths: 320, 375, 768, 1180, 1440, 1920, 2560, plus landscape phone
667x375. At every one: no sideways page scroll, nothing past the screen edge,
no money ellipsised or wrapped mid-figure, no word broken between letters.

- Prefer layouts that wrap by themselves (`flex-wrap`, `auto-fit` grids) over
  viewport breakpoints: most content sits beside a 256px sidebar, so the
  viewport width is not the content width.
- Wide tables scroll inside their card or become cards on phones.
- Content has a maximum width on very wide screens.

## Print

Receipts and kitchen checks are always light, 80mm wide and never inherit the
dark theme. See `PRINTING.md`.

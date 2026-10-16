---
name: dr
description: Thorough design and UX review of a page, component, screenshot or Figma frame in Zar Kebab POS. Checks layout, spacing, empty space, colours and dark/light themes, typography, touch ergonomics for waiters and cashiers, loading/empty/error states, responsiveness, locales, print formats and consistency across pages. Arguments: empty or "full", "diff", a page or route, a component, a screenshot, a Figma URL, or an area code (LAY, COL, TYPE, TOUCH, STATE, RULE, REUSE, PERF, RESP, PRINT, PUB). Use when the user types /dr.
argument-hint: "[empty = full | diff | page/route | component | screenshot | Figma URL | area code (LAY, COL, TYPE, TOUCH, STATE, RULE, REUSE, PERF, RESP, PRINT, PUB)] [fix]"
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

Sources of truth: `AGENTS.md`, `PRINTING.md`, the shared components in
`src/components` and `references/cases.md`, the design regression catalog. An
area code as the target runs that area's cases on every screen. Keep the
catalog alive per `review-core` section 6.

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
  at 375 px, cashier screens at 768 px. For size cases (RESP, TOUCH, dialog
  fit) use the **full ladder**: 280×653, 320×568, 375×812, 667×375 (landscape
  phone), 768×1024, 1024×768, 1180×800, 1440×900, plus the seams **414, 540,
  600, 820, 912, 1180** and wide 1920 / 2560. Phones and tablets with a coarse
  pointer (`resize_window` mobile preset emulates one), desktops with a fine
  one. A waiter holds a phone sideways over a table: 667×375 and 820×375 are
  real sizes, not edge cases.
- **Two data states per screen.** The app runs on production data, so the two
  states are *a service day* (occupied tables, a cart with 8+ lines, today's
  payments, a month with expenses and salaries) and *the empty morning* (free
  tables, no orders yet, a new period with no entries, a category with no
  products). Reach the empty state by choosing an empty date range or a fresh
  table, never by deleting data. `scripts/seed_pos.mjs` writes menu rows to the
  Supabase project it names: run it only after pointing `SUPABASE_URL` and the
  key at a non-production project; never against the live restaurant.
- **Size sweep** (fast, covers every screen at every size): with `pos-dev`
  running, `node .claude/skills/dr/scripts/size-sweep.mjs` opens the public
  routes in headless Chromium and prints Audits A, J, M, N and the 16px-input
  check per screen × size. Staff routes need a session: export one once from a
  signed-in tab (the console snippet in the script header, a Playwright
  storage-state JSON kept outside the repo) and pass `STATE=~/zar-state.json`.
  `BASE=http://localhost:5173` picks the server, `ONLY=/menu,/waiter/tables`
  limits routes, `LANG_CODE=ru` sets the language, `TOUCH_ONLY=1` skips desktop
  sizes and `DIALOGS=1` also opens every page button's dialog, sheet or menu at
  320, 667×375 and 1024 and runs Audit O inside it. It reads only and skips
  buttons whose label looks like a write (send, pay, archive, delete, save).
  Confirm each hit with a screenshot before reporting it.
- **Overlays are part of their screen; open each one.** Shell (every staff
  screen): `MobileDrawer`, `LanguageSwitcher` menu, `ThemeToggle`, sidebar
  collapse, the top-bar title. Public menu / Telegram: item detail dialog
  (`/menu/item/:itemId`), search mode, category scroller, `ImageLoadShimmer`,
  catering and vacancy detail, empty category. Waiter tables: `GuestPinDialog`,
  `TableGuestEntryDialog`, `GuestSelectionReady` sheet. Waiter order:
  `MenuItemPicker`, `CartPanel`, the remove / clear confirm, price-mode choice,
  empty cart. Cashier tables and bill: payment dialog (`CashierBill`),
  `PaidPaymentSplitEditor`, `SalaryOrderPayment`, loyalty name search, empty
  bill. Admin menu: product sheet (bottom sheet on phones), delete-item
  `alertdialog`, `MenuMedia` upload, category page, empty category. Tech cards:
  `TechCardPdfDownload` dialog. Admin tables: table sheet. Employees:
  employee edit dialog, `NewEmployeeDialog`, check-in screen access dialog,
  `AttendanceQrAccessSettings`. Salaries and salary history: `SalaryRateHistory`,
  `TimePicker24`, `CalendarPicker`, `DateRangePicker`. Accounting / Expenses:
  `AccountingKpi` explanation sheet, period pickers, empty period. Daily
  Bazaar: line dialog (bottom sheet), `BazaarIngredientPicker` and
  `BazaarCategoryPicker` listboxes, `DateRangePicker`. Ingredients: edit
  ingredient, archive `alertdialog`, add category, `IngredientMovement` sort
  listbox. Reports: expense breakdown dialog, filter popover, order detail
  panel (phone overlay), empty range. Every data page: `OperationalLoading`
  shimmer, `OperationalError` with retry, and its empty state.
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

## 3. Measure, don't eyeball

Use `javascript_tool` for facts and screenshots only to confirm what a number
says. Paste these audits on each screen (they only read the page). `R` is the
screen's content root: staff pages render inside `AppShell`, public pages and
the kiosk have a `<main>`.

```js
// R. Content root, shared by the audits below (paste once per page load)
window.R=document.querySelector('main')||document.getElementById('root');
```
```js
// A. Overflow: past the window (out), cut off inside a box (clipped), ellipsised (truncated), sideways scrollers
const id=e=>e.tagName.toLowerCase()+'.'+String(e.className?.baseVal??e.className).split(' ').filter(Boolean).slice(0,2).join('.'),all=[...R.querySelectorAll('*')].filter(e=>e.getClientRects().length);
({pageScroll:document.documentElement.scrollWidth>innerWidth+1?document.documentElement.scrollWidth+'>'+innerWidth:null,
out:all.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)&&!e.closest('[class*=overflow-x-auto],[class*=overflow-auto]')}).slice(0,10).map(id),
clipped:all.filter(e=>{const c=getComputedStyle(e);return /hidden|clip/.test(c.overflowX)&&c.textOverflow!=='ellipsis'&&e.clientWidth>1&&e.scrollWidth>e.clientWidth+1&&e.querySelector('button,a,span,p,strong')}).slice(0,10).map(e=>id(e)+' '+e.scrollWidth+'>'+e.clientWidth),
scrollers:all.filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).slice(0,10).map(id),
truncated:all.filter(e=>getComputedStyle(e).textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth+1).slice(0,10).map(e=>e.textContent.trim().slice(0,30))})
```
`scrollers` are fine only for deliberate scroll areas: the menu category
scroller (`MenuCategoryScroller`), wide admin tables inside their card, the
table grid on a phone. A tab strip, filter row or button group that scrolls is
a RESP-006 failure. A truncated money figure or table number is TYPE-002, not
polish.
```js
// C. Money formatting in page text and SVG chart labels. Expected: "1 000 000 UZS" / "so'm" / "сум" with spaces,
// whole sums, a real minus. Flags decimals, comma or dot thousands, an unspaced unit, hyphen-minus, a figure that wraps.
const cur="(?:UZS|so'm|soʻm|сум)",t=R.innerText+'\n'+[...R.querySelectorAll('svg text')].map(x=>x.textContent).join('\n');
const wrapped=[],w=document.createTreeWalker(R,NodeFilter.SHOW_TEXT);for(let n;(n=w.nextNode())&&wrapped.length<8;){for(const m of n.textContent.matchAll(/(?<![+\d])\d[\d   ]{3,}\d\s?(?:UZS|so'm|soʻm|сум)?/g)){const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);if(new Set([...r.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))).size>1){wrapped.push(m[0].trim());break}}}
({decimals:t.match(new RegExp(`\\d[\\d\\s]*[.,]\\d{1,2}\\s?${cur}`,'g')),commaThousands:t.match(new RegExp(`\\d,\\d{3}(?:,\\d{3})*\\s?${cur}`,'g')),unspaced:t.match(new RegExp(`\\d{4,}\\s?${cur}|\\d${cur}`,'g')),hyphenMinus:t.match(new RegExp(`(^|[\\s(])-\\s?\\d[\\d\\s]*\\s?${cur}`,'gm')),wrapped})
```
Run it in UZ, RU and EN: the unit must be the translated one (`so'm` / `сум` /
`UZS`), never a hard-coded "UZS" outside English. Unit prices in tech cards may
keep up to two decimals; everything else in `decimals` is TYPE-002. `wrapped`
is TYPE-002 too (a figure split between lines).
```js
// D. Type scale and radii actually used (compare with --ws-type-* and --ws-radius-* in src/styles/workspace.css)
const toks=['micro','caption','small','compact','heading','page','display'].map(k=>getComputedStyle(document.documentElement).getPropertyValue('--ws-type-'+k).trim());
const s=new Map(),r=new Map();R.querySelectorAll('*:not(svg *)').forEach(e=>{const c=getComputedStyle(e);if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))s.set(c.fontSize,(s.get(c.fontSize)||0)+1);if(c.borderRadius!=='0px')r.set(c.borderRadius,(r.get(c.borderRadius)||0)+1)});
({tokens:toks,fontSizes:Object.fromEntries([...s].sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]))),radii:Object.fromEntries([...r].sort((a,b)=>parseFloat(a[0])-parseFloat(b[0])))})
```
Sizes outside the token set (12, 13, 14, 15, 20 px and the page/display
clamps) and radii other than 8, 10, 12, 16 px or `9999px` are TYPE-001 or
RULE-007 candidates; quote the class.
```js
// E. Unnamed controls: buttons, links, inputs, selects, textareas (a placeholder is not a name). Run with dialogs open too.
[...document.querySelectorAll(':is(main,#root) :is(button,a,[role=button],input:not([type=hidden]),select,textarea), [role=dialog] :is(button,input,select,textarea)')].filter(b=>b.offsetParent&&!((b.matches('button,a,[role=button]')&&b.innerText.trim())||b.getAttribute('aria-label')||b.getAttribute('aria-labelledby')||b.title||b.labels?.length)).map(b=>b.outerHTML.slice(0,120))
```
```js
// F. Language leftovers: English words on a UZ or RU screen, Cyrillic or Uzbek UI words on an EN screen (run in each language)
const lines=R.innerText.split('\n');({english:lines.filter(l=>/\b(the|and|your|with|this|Add|Save|Cancel|Delete|Loading|Search)\b/.test(l)).slice(0,20),notEnglish:document.documentElement.lang==='en'?lines.filter(l=>/[А-Яа-яЁё]|\b(Saqlash|Bekor|O'chirish|Qidirish|Jami)\b/.test(l)).slice(0,20):[]})
```
Menu item names, employee names and ingredient names are data and may be in
any language; UI chrome in the wrong language is RULE-009.
```js
// G. Colour tone sanity: text in the negative tone (--ws-negative) that is not money out, overdue, a fine, a cancelled order or an error
const cx=document.createElement('canvas').getContext('2d',{willReadFrequently:true}),rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle=c;cx.fillRect(0,0,1,1);return[...cx.getImageData(0,0,1,1).data].join()};
const neg=rgba(getComputedStyle(document.documentElement).getPropertyValue('--ws-negative').trim()||'#c4262c');
[...R.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&rgba(getComputedStyle(e).color)===neg).map(e=>(e.closest('li,tr,article,section,[class*=card]')?.innerText.split('\n')[0]||'').slice(0,30)+' :: '+e.textContent.trim().slice(0,30)).slice(0,20)
```
```js
// H. Disabled state honesty: looks enabled but aria-disabled only; disabled with no reason given
[...document.querySelectorAll(':is(main,#root) button,[role=dialog] button')].filter(b=>b.getAttribute('aria-disabled')==='true'&&!b.disabled&&getComputedStyle(b).opacity==='1').map(b=>'looks enabled: '+b.innerText.trim()).concat([...document.querySelectorAll(':is(main,#root) button:disabled,[role=dialog] button:disabled')].filter(b=>b.offsetParent&&!(b.title||b.getAttribute('aria-describedby')||b.parentElement?.title)).map(b=>'disabled, no reason: '+(b.innerText.trim()||b.getAttribute('aria-label'))))
```
```js
// I. Text contrast below 4.5:1 (COL-002), in light and dark. Colours are normalised through a canvas (Tailwind emits
// oklab/oklch); mostly transparent backgrounds are skipped to the parent. Check text on photos and gradients by eye.
const cx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
const rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle=c;cx.fillRect(0,0,1,1);return [...cx.getImageData(0,0,1,1).data]};
const L=c=>{const [r,g,b,a]=rgba(c);if(a<128)return null;return [r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)};
const bg=e=>{for(;e;e=e.parentElement){const l=L(getComputedStyle(e).backgroundColor);if(l!==null)return l}return L(getComputedStyle(document.body).backgroundColor)??1};
[...document.querySelectorAll(':is(main,#root) *, [role=dialog] *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.offsetParent&&e.clientWidth>1&&!e.closest('svg')).map(e=>{const f=L(getComputedStyle(e).color)??0,b=bg(e),r=(Math.max(f,b)+.05)/(Math.min(f,b)+.05);return [r,e]}).filter(([r])=>r<4.5).slice(0,15).map(([r,e])=>r.toFixed(2)+' '+e.textContent.trim().slice(0,30))
```
Large figures (≥ 24px bold) and icons pass at 3:1 (COL-003); everything else
below 4.5:1 is COL-002. The dark remap (`scripts/build-dark-theme.mjs`) only
covers listed classes: a hit that appears in dark only means a class the remap
misses (COL-001).
```js
// J. Touch targets under 44px (TOUCH-001). Run at the mobile preset (coarse pointer) on waiter, cashier, kitchen and public screens.
[...document.querySelectorAll('button,a,[role=button],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44&&!e.closest('p')).slice(0,20).map(e=>Math.round(e.getBoundingClientRect().height)+'px '+(e.innerText||e.getAttribute('aria-label')||e.tagName).trim().replace(/\s+/g,' ').slice(0,30))
```
`.ws-btn` is 42px and `.ws-btn-sm` 34px by design on admin desktop pages; on a
coarse pointer any operational control under 44px is TOUCH-001. Also list
inputs under 16px (`parseFloat(getComputedStyle(input).fontSize)<16`): iOS
zooms the page when one is focused (RESP-009).
```js
// K. Page frame: top-bar title position and tab title (compare across screens)
const h=document.querySelector('h1')?.getBoundingClientRect();({top:h&&Math.round(h.top),left:h&&Math.round(h.left),h1:document.querySelector('h1')?.textContent.trim(),title:document.title})
```
```js
// L. Wrapped with room: a row whose items went onto a second line although the first line had space for them
// (a breakpoint guessed for the widest row). Measures each item's content, not its stretched box; full-width rows and column stacks are skipped.
const px=(s,...k)=>k.reduce((t,p)=>t+(parseFloat(s[p])||0),0),id=e=>e.tagName.toLowerCase()+'.'+String(e.className).split(' ').filter(Boolean).slice(0,2).join('.');
const content=k=>{const box=k.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(k);const r=range.getBoundingClientRect();if(!r.width)return box.width;const s=getComputedStyle(k);return Math.min(box.width,r.width+px(s,'paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'))};
const hits=[];for(const box of R.querySelectorAll('*')){const c=getComputedStyle(box),grid=c.display.includes('grid'),flex=c.display.includes('flex');if(!grid&&!flex||flex&&c.flexDirection.startsWith('column')||grid&&c.gridTemplateColumns.split(' ').length<2)continue;
 const inner=box.getBoundingClientRect().width-px(c,'paddingLeft','paddingRight'),kids=[...box.children].filter(k=>k.getBoundingClientRect().width>0&&getComputedStyle(k).position!=='absolute');if(kids.length<2||kids.some(k=>k.getBoundingClientRect().width>=inner*.95))continue;
 const lines=[];for(const k of kids){const r=k.getBoundingClientRect(),w=content(k)+px(getComputedStyle(k),'marginLeft','marginRight'),line=lines.find(l=>r.top<l.bottom-4&&r.bottom>l.top+4);if(line){line.w.push(w);line.bottom=Math.max(line.bottom,r.bottom)}else lines.push({top:r.top,bottom:r.bottom,w:[w]})}
 if(lines.length<2)continue;const gap=parseFloat(c.columnGap)||0,sum=l=>l.w.reduce((s,w)=>s+w,0)+(l.w.length-1)*gap,free=inner-sum(lines[0]),need=Math.min(...lines.slice(1).map(sum));
 if(free>inner*.3&&need+gap<=free)hits.push(id(box)+' free '+Math.round(free)+' of '+Math.round(inner)+'px, line 2 needs '+Math.round(need))}
[...new Set(hits)].slice(0,15)
```
Run it at 1180, 1024 and 768 with the sidebar open (the widths between the
phone and wide desktop, where guessed `sm:`/`md:`/`lg:` breakpoints misfire). A
hit is RESP-007 unless the second line is deliberate (a wrapped chip list that
fills its first line, a chart legend). Fix with a layout that wraps by itself
(`flex-wrap`, `auto-fit` grids), never by shrinking the type.
```js
// M. Overlap: two visible text or control boxes on top of each other (RESP-008). Skips hidden content
// (closed <details> still has boxes in Chrome), clipped content, sticky/fixed bars and charts.
const shown=e=>{if(!e.checkVisibility({opacityProperty:true,visibilityProperty:true,contentVisibilityAuto:true})||e.closest('svg,.sr-only,[data-dragging]'))return false;const o=e.getBoundingClientRect();for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p);if(/fixed|sticky/.test(c.position))return false;if(p!==e&&/hidden|clip|auto|scroll/.test(c.overflowX+c.overflowY)){const q=p.getBoundingClientRect();if(o.bottom<=q.top+1||o.top>=q.bottom-1||o.right<=q.left+1||o.left>=q.right-1)return false}}return o.width>2&&o.height>2};
const leaf=[...R.querySelectorAll(':is(button,a,input,select,.ws-badge,strong,small,h1,h2,h3,label,span,p,td)')].filter(e=>(e.matches('button,a,input,select')||[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))&&shown(e)).map(e=>[e,e.getBoundingClientRect()]),hits=[];
for(let i=0;i<leaf.length&&hits.length<10;i++)for(let j=i+1;j<leaf.length;j++){const[a,r]=leaf[i],[b,q]=leaf[j];if(a.contains(b)||b.contains(a))continue;const w=Math.min(r.right,q.right)-Math.max(r.left,q.left),h=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top);if(w>3&&h>3){hits.push(`"${a.textContent.trim().slice(0,24)}" × "${b.textContent.trim().slice(0,24)}" ${Math.round(w)}x${Math.round(h)}`);break}}
hits
```
A badge drawn over a photo corner (menu card price, table status) is
deliberate when the photo is not text; a price over an item name is not.
```js
// N. Words broken between letters (RESP-010, TYPE-005): a word (split at spaces, hyphens and slashes) whose glyphs sit on two lines.
const hits=[],walk=document.createTreeWalker(R,NodeFilter.SHOW_TEXT);
for(let n;(n=walk.nextNode())&&hits.length<15;){if(!n.parentElement?.checkVisibility()||n.parentElement.closest('svg,.sr-only')||getComputedStyle(n.parentElement).hyphens==='auto')continue;
 for(const m of n.textContent.matchAll(/[^\s\-‐‑–—/]{3,}/g)){const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+m[0].length);
  if(new Set([...r.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))).size>1){hits.push(n.parentElement.className+' "'+m[0]+'"');break}}}
hits
```
The usual cause is `break-all` / `overflow-wrap:anywhere` (it lets a flex or
grid column squeeze to one letter) or a `minmax(0,1fr)` name column beside wide
trailing cells. Russian words are long: give the name a minimum (`flex:1 1 8rem`
with `flex-wrap`, `min-w-[8rem]` only as a last resort) or move the figures to
a second line below a container width, never shrink the type.
```js
// O. Dialog fit (RESP-011): run with one dialog, sheet, listbox or popover open.
const d=[...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=listbox],[role=menu]')].filter(e=>e.offsetParent||getComputedStyle(e).position==='fixed').pop(),r=d.getBoundingClientRect(),out=[];
if(r.left<-1||r.right>innerWidth+1)out.push(`wider than screen ${Math.round(r.left)}..${Math.round(r.right)}/${innerWidth}`);
const sc=[d,...d.querySelectorAll('*')].find(e=>/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1);
if(r.top<-1||(r.bottom>innerHeight+1&&!sc))out.push(`taller than screen ${Math.round(r.top)}..${Math.round(r.bottom)}/${innerHeight}, ${sc?'scrolls':'no scroller'}`);
if(d.scrollWidth>d.clientWidth+1)out.push(`sideways scroll ${d.scrollWidth}>${d.clientWidth}`);
const btn=[...d.querySelectorAll('button')].filter(b=>b.offsetParent&&b.innerText.trim());
btn.filter(b=>{const g=document.createRange();g.selectNodeContents(b);return new Set([...g.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))).size>1}).forEach(b=>out.push('two-line button: '+b.innerText.trim()));
const foot=[...d.children].reverse().find(c=>c.querySelectorAll('button').length>1)||d.querySelector('footer');if(foot){const hs=[...foot.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.offsetHeight);if(new Set(hs).size>1)out.push('footer heights '+hs)}
({title:(d.querySelector('h2,h3,[id$=title]')?.textContent||d.getAttribute('aria-label')||'').trim(),width:Math.round(r.width),out})
```
Bottom sheets (`!rounded-b-none`, `items-end`) must still end above the
keyboard: focus the first input at 375×667 and confirm the primary button is
reachable. A dialog whose backdrop uses an ad hoc `z-[120]` next to another on
`z-50` is RULE-005.
```js
// P. Button sizes (TOUCH-009): heights by class, two-line labels, icon buttons not square, several primaries per surface.
const bs=[...document.querySelectorAll(':is(main,#root) button,[role=dialog] button')].filter(b=>b.offsetParent),by={};
const kind=b=>b.classList.contains('ws-btn-icon')?'ws-btn-icon':b.classList.contains('ws-btn-sm')?'ws-btn-sm':b.classList.contains('ws-btn')?'ws-btn':'other';
bs.forEach(b=>{(by[kind(b)]??=new Set).add(b.offsetHeight)});
({heights:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)])),
 twoLine:bs.filter(b=>{const g=document.createRange();g.selectNodeContents(b);return new Set([...g.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))).size>1}).map(b=>b.innerText.trim().slice(0,30)),
 notSquare:bs.filter(b=>!b.innerText.trim()&&Math.abs(b.offsetWidth-b.offsetHeight)>1).map(b=>(b.getAttribute('aria-label')||'?')+' '+b.offsetWidth+'x'+b.offsetHeight),
 primariesPerSurface:[...document.querySelectorAll('header,[role=dialog],.ws-card,section')].map(s=>[(s.id||s.className.toString().split(' ')[0]||s.tagName),s.querySelectorAll('.ws-btn-primary,.bg-brand,[class*=bg-\\[\\#ff5a00\\]]').length]).filter(([,n])=>n>1)})
```
Expected: `ws-btn` 42, `ws-btn-sm` 34, `ws-btn-icon` square; `other` is a
hand-rolled button (REUSE-004 candidate). On a coarse pointer every
operational button is ≥ 44 (TOUCH-001).
```js
// Q. Motion inventory (TOUCH-007, TOUCH-010): start it, then open a dialog or switch a page, then read window.__motion.
window.__motion={anims:[],shift:0};new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__motion.shift+=e.value})).observe({type:'layout-shift',buffered:false});
const grab=()=>document.getAnimations().forEach(a=>{const t=a.effect?.getTiming?.(),k=a.effect?.getKeyframes?.()??[];window.__motion.anims.push({target:(a.effect?.target?.className||'').toString().slice(0,40),ms:t?.duration,props:[...new Set(k.flatMap(f=>Object.keys(f).filter(p=>!['offset','easing','composite','computedOffset'].includes(p))))].join(',')})});
let n=0;const id=setInterval(()=>{grab();if(++n>20)clearInterval(id)},50);
// later: [...new Map(window.__motion.anims.map(a=>[a.target+a.props,a])).values()], window.__motion.shift
```
Expect durations ≤ 300ms (sheets ≤ 280ms in, ≤ 150ms out; the public page
enter is 360ms by design), only `opacity`/`transform` (or a shimmer's
`background-position`), nothing looping except shimmers, and a shift total
≤ 0.1 per page switch. `animate-spin` outside a pressed button is RULE-002.

Source checks (Bash, read-only) are the strict-rule greps in section 2 plus:
every `animation` / `transition` in `src/index.css` and `src/styles/*.css`
without a `prefers-reduced-motion: reduce` counterpart (TOUCH-007), and new
hard-coded neutral classes (`bg-[#f6f5f3]`, `text-[#22201d]`, `border-[#e4e1de]`)
missing from `scripts/build-dark-theme.mjs` (COL-001). Report the file and line.

## 4. Report

Use the skeleton from `review-core` section 3. Every finding quotes the audit
letter and the measured value ("Audit M at 667×375: price × name 38x12").

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

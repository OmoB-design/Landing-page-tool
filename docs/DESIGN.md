# DESIGN.md — UI style, tokens and the Figma replacement process

## 1. Intent

**D67 (2026-10-10, owner):** the app now takes the look and layout of the Quality app (usequality.app; not the owner's product, so its look is matched but not its name, logo, wording or artwork). One sidebar on a light grey canvas, the page in a floating white panel with a 48 px text header, Inter at 13 px with Crimson Pro serif greetings, Quality's greys (including its `#8d8d8d` secondary text, the owner's choice), an indigo primary, 6 px controls and 10 px panels. The Notion-like description below is the original intent (D19) and is kept for history; the anatomy in §2 starts with the current layout.

A calm, dense, Notion-like workspace: neutral surfaces, hairline borders, compact type, quiet hover states, colour used sparingly for status and identity. The tool is used for hours by operators reviewing many pages, so it should feel like a productivity app, not a marketing site.

The owner supplied a reference screenshot (a work-management app: icon rail, secondary sidebar, tabbed project header, grouped issue list). Copy its **structure and density**, not its brand, logo, product names or icons.

**Phase 1 (now):** build with shadcn components, styled with the tokens below, so the owner can see real flows working.
**Phase 2 (later):** the owner designs in Figma; Claude Code replaces components one by one from Figma via the Figma MCP. Figma then becomes authoritative.

---

## 2. Layout anatomy

**Current (D69, Figma frames Home and Home Dark):**
```
┌──────────────┬──────────────────────────────────────────────────┐
│ [B] Org ˅ ⌕ ◧│ ╭──────────────────────────────────────────────╮ │  canvas (dashboard)
│              │ │ Page title  │ Tabs …     Actions  ⟳ jobs 🔔  │ │  PageHeader 49px
│ ⌂ Home       │ ├──────────────────────────────────────────────┤ │
│ + New page   │ │                                              │ │
│              │ │  page content (centred column or full width) │ │
│ Workspace ▾  │ │                                              │ │
│  Pages       │ │                                              │ │
│  Templates   │ │                                              │ │
│  Brands      │ │                                              │ │
│  Library     │ │                                              │ │
│  Analytics   │ │                                              │ │
│ Your brands ▾│ │                                              │ │
│  ■ Allbirds  │ │                                              │ │
│ ╭──────────╮ │ │                                              │ │
│ │◔       ˅ │ │ │                                              │ │
│ │Getting   │ │ │                                              │ │
│ │Started   │ │ │                                              │ │
│ │○ steps … │ │ │                                              │ │
│ ╰──────────╯ │ │                                              │ │
│ ╭(B) Name ⇕╮ │ ╰──────────────────────────────────────────────╯ │  panel 6px from every edge,
└──────────────┴──────────────────────────────────────────────────┘  10px corners
  sidebar 240px
```
- **Sidebar** (`bg-dashboard`, 240 px): top row 12 px down and 8 px in: the workspace menu (18 px letter mark in Geist, 14 px name, small chevron; menu 228 px: Settings, Invite and manage members, Logout, the org list when there is more than one), Search (14 px, not built) and the collapse button (32 px). Nav 8 px in, rows 2 px apart: Home, New page; the **Workspace** and **Your brands** groups (16 px above; 12 px medium `heading-05` label with a filled caret). Rows are 28 px: 16 px icon, 6 px gap, 13 px medium `heading-04` on a 20 px line; hover and the current page fill `foreground-02`, the current page's text turns `heading-03` and its icon `icon-nav-active`. Brand rows use a 16 px letter mark. At the bottom, 8 px in and 6 px up: the **getting-started card** (`SidebarSetup`: 20 px progress ring, chevron to fold, "Getting Started", "N/M steps completed", the steps as links with a 14 px circle that becomes a blue tick, with the nav rows' hover (`foreground-02`, 6 px across and 4 px down, steps still 12 px apart); the panel's stroke (`edge`), no shadow, 10 px corners, open or folded; the fold is remembered in the browser; gone once every step is done) above the **profile card** (30 px avatar, 12 px name, 10 px email, up-down chevrons; 10 px corners, the panel's stroke (`edge`, deeper on hover), no shadow). The profile card opens the account menu upward (270 px, pop shadow, 0.7 px stroke outline: who is signed in; Settings, Themes with the current theme in a badge, Logout; getting-started progress 4 px in, and "Next: …" as a 4 px-padded row that fills foreground-01 on hover; Figma: My Pages).
- **Page panel:** `surface-primary`, 6 px from every edge (the sidebar included), 16 px corners (`rounded-panel`), Quality's 0.5 px Border-on-bg stroke (`edge`), no shadow. Each page starts with `PageHeader` (49 px with its border, 16 px in counting the panel border: a mark if any, the title in 13 px regular, a divider, tabs; on the right the page's actions, then Jobs and Notifications: 32 px icon buttons with a blue dot while jobs run or anything is unread, opening 280 px popovers built like Figma's Notis: a titled header, the list (rows fill Foreground-01 on hover; Foreground-02 in dark), a fade where more of the list sits below (`scroll-fade-b`: an eased mask over the last 40 px, driven by the list's scroll, gone at the end), and a Surface-Primary footer with a 0.5 px top stroke (`divider-t-half`), lifted on hover (`shadow-lift`), holding "Mark all as read" as a pill on hover; D71). On small screens, or with the sidebar collapsed, the header shows the open-sidebar button.
- **Hairlines:** browsers round borders up to whole pixels, so Figma's 0.7 px and 0.5 px strokes are drawn as box shadows, which keep the fraction: `ring-thin ring-<colour>` (a 0.7 px outline outside the box, like Figma's outside stroke) on menus and popovers, and `divider-b-thin` (0.7 px) / `divider-b-half` (0.5 px) for stroke-coloured lines inside the bottom edge. They take no layout space and combine with `shadow-*`.
- **Dark mode** (Home Dark): the same layout through the Dark token values (`dashboard` #090909, `surface-primary` #121212, `foreground-02`/`stroke` #2a2a2a, header popovers on `overlay`).
- **No icon rail and no top bar** (removed in D67).

**Before D67 (the original reference):**

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [Org ▾]                      [ 🔍 Search <Org> ]                 [🔔] [👤] │  TopBar 48px
├──────┬──────────────────────┬─────────────────────────────────────────────┤
│ Rail │ Sidebar              │ PageHeader: [emoji] Brand name │ Tabs …     │  48px
│ 64px │ 260px (collapsible)  ├─────────────────────────────────────────────┤
│      │ Section title  ⚙ ◧  │ ListToolbar: [icon] Pages  (112)            │  40px
│ ◼    │ [+ New page]         ├─────────────────────────────────────────────┤
│ Pages│ ⌂ Home               │ ◌ Building                       (group)    │  36px tinted band
│ ◇    │ ⚲ Your pages         │   ☀ LUM-23  Vitamin C advertorial           │  40px row
│ Tmpl │                      │   ✦ LUM-45  Serum listicle                  │
│ ▣    │ Workspace ▾          │      ✦ LUM-98  (nested child row, +32px)    │
│ Brand│   Brands             │ ○ Needs review                   (group)    │
│      │   Templates          │   ✦ LUM-56  …                               │
│ ⚙    │   Library            │                                             │
│ Sett.│   Analytics          │                                             │
│      │ Brands ▾             │                                             │
│      │   🍋 Lumé            │                                             │
│      │   🌿 Verdant         │                                             │
│      │   ··· More           │                                             │
└──────┴──────────────────────┴─────────────────────────────────────────────┘
```

**Observed details to reproduce:**
- **Icon rail (64 px):** stacked items, each a 20 px icon with a 11 px label underneath, centred. Active item: icon on a soft filled square (radius 8). A divider separates primary items from Settings at the bottom.
- **Top-left org switcher:** square logo mark (24 px, radius 6) + org name + chevron.
- **Search:** centred in the top bar, pill/rounded input with a muted background and placeholder "Search <Org>".
- **Sidebar header:** title (16 px, semibold) with two small icon buttons on the right (filter/settings, panel toggle).
- **Primary action:** full-width button with a muted filled background and a `+` in a solid circle, left-aligned label ("New page"). Not a loud brand-coloured button.
- **Nav items:** 32 px tall, 14 px text, 16 px outline icon, 8 px left padding, radius 6. Hover: subtle grey fill. Active: slightly stronger grey fill.
- **Collapsible groups:** muted 13 px label with a chevron ("Workspace ▾", "Brands ▾"). Group children can use an emoji or a coloured glyph as their icon (brands get one).
- **"··· More"** item to truncate long lists.
- **Page header:** emoji/icon + entity name (18 px semibold), a vertical divider, then tabs as **segmented pills**: inactive tabs are plain text; the active tab has a light filled pill and a short underline accent.
- **List toolbar:** small icon + label + **count badge** (tinted blue background, blue text, 12 px, radius 6).
- **Group headers:** full-width tinted band (very light grey), 14 px medium label with a status glyph (dashed circle for backlog-like states, empty circle for to-do-like states).
- **Rows:** 40 px tall, hairline separators are absent or extremely faint; a 16 px coloured type glyph in a tinted square (radius 4), the **human key** in muted grey (tabular figures), then the title in 14 px regular. Child rows indent ~32 px.
- **Whitespace:** generous horizontal padding (24 px in main pane), tight vertical rhythm.
- **Content column (owner, 2026-10-09):** page content sits in a centred column under the page header (`PageBody`: 672 px for forms, settings and Home; 768 px for detail pages such as a product), not left-aligned. Full-width lists (Pages, Brands) and the page header itself span the pane.
- **Surfaces:** app background a near-white grey; panels white; the window has large outer radius in the screenshot (ignore that; it is a marketing frame).

---

## 3. Mapping the anatomy to this product

| Reference | LP Platform |
|---|---|
| Rail: Work, Wiki, AI, Desk, Settings | Rail: **Pages**, **Templates**, **Brands**, **Library**, **Analytics**, divider, **Settings** |
| Sidebar title "Work" | Title of the active rail section |
| "New work item" | **New page** (opens the create wizard); on Templates: **Clone a page** / **Browse library**; on Brands: **New brand** |
| Home / Your work | **Home** (pipeline overview, recent builds, running jobs) / **My pages** |
| Workspace group | **Workspace**: Brands, Templates, Library, Analytics |
| Projects group with emoji | **Brands** group, each brand with its emoji or colour glyph |
| Project header tabs: Overview, Work items, Cycles, Modules | Brand header tabs: **Overview, Pages, Products, Templates, Brand DNA** |
| Work items (112) | **Pages (n)** |
| Groups Backlog / To do | Build status groups: **Building, Needs review, Approved, Published, Failed** |
| ACME-23 + title | **LUM-23** + page title (template name · product) |
| Type glyphs (coloured squares) | Template-type glyphs: advertorial, listicle, versus, comparison, long-form; a clone badge for `origin=cloned` |
| Nested child rows | Re-builds / variants of the same page (same template+product) nested under the original |

Right side of each row (not visible in the screenshot, add it): origin badge (Owned/Cloned), residue score chip for clones, cost, updated time (date-fns relative), assignee avatar placeholder, and a `⋯` row menu on hover.

---

## 4. Tokens (D68: Figma names, Quality values)

**Source of truth: the LP Platform Figma file** (`WJylkbnRxmt6QfEXWQ2m2h`, Variables panel). Its structure and names follow the owner's Portfolio file; its values are the Quality app's (D67, read from Quality's stylesheet). Every Figma variable's Web code syntax is the CSS variable in `apps/web/app/globals.css`, so the two match name for name. **Change a value in Figma first, then in `globals.css`.**

**Primitives** (Figma collection *Primitives*, one mode) are plain CSS variables on `:root`: `--base-white`, `--base-black`, `--grey-10` … `--grey-950`, `--indigo-*`, `--green-*`, `--yellow-*`, `--red-*`, `--amber-*`, `--blue-*`, `--pink-*`, `--purple-*`, `--mark-*`, `--glyph-*`. Feature code never uses them directly.

**Tokens** (Figma collection *Tokens*, modes Light and Dark) are Tailwind theme colours that point at primitives; `.dark` repoints the ones that change. Groups and their classes:

| Figma group | Tokens (class suffix) | Used for |
|---|---|---|
| Surface | `dashboard`, `surface-primary`, `surface-modal`, `foreground-01/02/03`, `overlay`, `stroke`, `stroke-strong`, `stroke-input-hover/active/negative` | app background and sidebar, page panel and cards, menus and popovers, fields and bands / hover / pressed, dialog backdrop, dividers, input and card borders, input border states |
| Button | `button-primary(-active/-disabled/-text/-stroke-top/-stroke-bottom/-drop-soft/-drop-deep)`, `button-secondary(-text)`, `button-neutral(-active)`, `button-danger(-active/-text)` | button fills and their text; *D74:* `button-primary` is the Figma blue button (#1969fe in both themes, drawn by the `button-primary` utility with its gradient stroke and inner shadows) |
| Spot | `spot-500-indigo` (accent: links, focus, selection), `spot-500-green/yellow/red/blue/pink/purple` | solid accent and status colours: icons, dots, fills, borders |
| Highlights | `highlight-indigo-50` (selected tint), `highlight-green/yellow/red/blue-50` (status tints), `highlight-yellow-500/150` (section editor), and the other Portfolio tints | tinted backgrounds |
| Typography | `body`, `sub-text`, `caption-1/2`, `heading-01…06`, `text-success/warning/danger/info/link`, `on-light`, `on-dark` | text colours; status text and text on tints use the `text-*` tokens |
| Icon | `icon-nav-active/inactive`, `icon-system`, `icon-explainer`, `drawer` | icon colours (defined; components move onto them as they are redesigned) |
| Avatar, Template | `avatar-a…h(-soft)`, `template-advertorial/listicle/versus/comparison/long-form` | workspace and people marks, template-type glyphs |

**Type** (Figma text styles Heading/Body/Caption): `text-type-caption-3` 10 (not used yet), `text-type-caption-2` 11, `text-type-caption-1` 12, `text-type-body-small` 13 (body), `text-type-body-large` 14, `text-type-h6` 16, `text-type-h5` 22, `text-type-h4` 30 (serif card titles), `text-type-h3` 36 (serif greetings); `h2`/`h1` exist but are unused. Weights through `font-normal/medium/semibold/bold`. The `type-` prefix keeps sizes apart from colours (Caption 1 is both a text style and a text colour). Tailwind's default type and radius scales are switched off (`--text-*: initial`, `--radius-*: initial`), so `text-sm` or `rounded-xs` produce nothing.

**Radius** (Figma Radius): `rounded-xsm` 4, `rounded-sm` 6 (controls), `rounded-md` 8, `rounded-lg` 10 (panels, cards; Figma's Radius-L keeps the CSS name `--radius-lg` because Tailwind's `rounded-l` means left corners), `rounded-xl` 24, `rounded-xxl` 32, `rounded-max` 64. **Spacing** is Tailwind's 4 px scale, which equals Figma's Space scale (Space-16 = `p-4`). **Sizes** (Figma Size): `w-sidebar` 240, `h-header` 49, `w-menu-workspace` 228, `w-menu-account` 270, `w-menu-header` 280, `h-topbar` 48, `h-row` 40, `h-nav-item` 32, `w-panel`, `w-preview-mobile`, `w-editor-panel`, `w-wizard-dossier`. **Shadows** (Figma effect styles): `shadow-pop`, `shadow-control`, `shadow-edge`, `shadow-panel`, plus `shadow-raise` (the folded getting-started card). **Frame edge (D72, Quality's stroke):** `edge` (a 0.5 px border in `--color-edge` = Stroke-Strong: #e6e6e6 light, #2a2a2a dark) on the content panel, the layout toggle and cards; `edge-strong` for hover; `edge-b` for the page header line. Floating frames (menus, popovers, toasts) use `edge-hairline` (a true 0.5 px ring) with `shadow-float` (after Nucleo's large shadow; stronger in dark). **Hairlines** (box shadows, see §2): `ring-thin` (0.7 px outline), `divider-b-thin` (0.7 px), `divider-b-half` (0.5 px). **Pages:** `tint-green`, `tint-blue`, `tint-red`, `tint-yellow` (glyph and score-chip tints; dark values not yet Figma variables), `max-w-pages` 1100, `w-menu-row` 132, `text-type-title` (28 px serif title; Figma Heading/Title - 28), `w-menu-display` 200, `transition-slide` (the view line). **Home cards:** `w-home-card` 285, `max-w-home-row` (three cards and two gaps), `rounded-card` 18, `shadow-card-edge`, `shadow-illustration-float`, `shadow-illustration-window`, and `illustration-surface` / `illustration-line` / `illustration-line-strong` (the drawings' light page, the same in both themes). **Fonts:** `font-mark` (Geist 500, the workspace mark's letter).

Fonts come from `next/font` (`--font-inter`, `--font-jetbrains-mono`, `--font-crimson`) and map to `font-sans`, `font-mono`, `font-serif`.

**Renamed in D68** (T2, 2026-10-10):

| Before | Now |
|---|---|
| `canvas`, `surface`, `surface-muted`, `surface-hover`, `surface-active` | `dashboard`, `surface-primary`, `foreground-01`, `foreground-02`, `foreground-03` |
| `border`, `border-strong` | `stroke`, `stroke-strong` |
| `fg`, `fg-muted`, `fg-subtle` | `body`, `sub-text`, `caption-1` |
| `accent`, `accent-strong`, `accent-soft` | `spot-500-indigo` (or `button-primary`), `button-primary-active`, `highlight-indigo-50` (text on it: `text-text-link`) |
| `success`/`warning`/`danger` (fills, icons) | `spot-500-green/yellow/red` |
| `text-success`/`text-warning`/`text-danger` | `text-text-success/warning/danger` |
| `*-soft` status tints | `highlight-green/yellow/red-50` |
| `highlight`, `highlight-soft` | `highlight-yellow-500`, `highlight-yellow-150` |
| `mark-*`, `glyph-*` | `avatar-*`, `template-*` (`glyph-longform` → `template-long-form`) |
| `text-xs/sm/base/md/lg/xl/3xl/display` | `text-type-caption-2/caption-1/body-small/body-large/h6/h5/h4/h3` |
| `rounded-xs` | `rounded-xsm` |

`pnpm lint:tokens` fails on any of the old names (`scripts/check-token-names.mjs`), including in `components/ui`.

shadcn's CSS variables (`--background`, `--foreground`, `--popover`, `--muted`, `--border`, `--input`, `--ring`, `--primary`, `--destructive` …) are mapped onto these tokens in `globals.css`, so shadcn components inherit the style without per-component overrides; components in `components/ui` keep shadcn's class names until Figma replaces them.

Rules:
- No hex values or arbitrary Tailwind values (`[#...]`, `[13px]`) in feature code; no primitives in feature code.
- Spacing on a 4 px grid.
- Numbers in lists (keys, counts, costs) use `tabular-nums`.
- Focus ring: 2 px `spot-500-indigo` at 40 % opacity, offset 1 px; always visible on keyboard focus.
- Text on a tint uses the matching `text-*` token (`text-text-link` on `highlight-indigo-50`, `text-text-danger` on `highlight-red-50`); icons on plain surfaces use the `spot-500-*` colours; text and numbers on a solid colour use `text-on-dark`.
- The root font size stays at the browser's 16 px, so rem-based tokens resolve to their stated sizes; the 13 px body size is set on `body`, never on `html` (B0.3b fix).
- `font-serif` (Crimson Pro) is for page greetings and big titles only (Home's "Welcome", the sign-in card); everything else is Inter.

---

## 5. Component inventory

### 5.1 `components/ui/` (shadcn primitives, Phase 1)

Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Dialog, Sheet, DropdownMenu, ContextMenu, Popover, Tooltip, Command (for search and pickers), Badge, Avatar, Separator, ScrollArea, Skeleton, Progress, Toast (sonner), Collapsible, Accordion, Table, Form helpers.

### 5.2 `components/app/` (app composites, built on ui/)

| Component | Purpose |
|---|---|
| `AppShell` | *D67:* the sidebar on the canvas and the page in a floating white panel (`main`). Handles sidebar collapse (persisted in a cookie) and the mobile sheet. |
| `SidebarNav` | *D69 (Figma Side Nav):* workspace menu, Search and collapse; Home and New page; Workspace and Your brands groups; the getting-started card and the profile card (`UserMenu`, the account menu). |
| `OrgSwitcher` | *D69:* the workspace menu (Figma User Option and Sidebar Account Option): letter mark + name + chevron; Settings, Invite and manage members, Logout, and the org list when there is more than one. |
| `WorkspaceMark` / `BrandNavMark` / `PersonMark` | *D67:* a letter on one of eight `avatar-*` colours picked from the name (`components/app/mark.tsx`). |
| `HeaderTools` | *D69:* Jobs and Notifications at the right of every `PageHeader` inside the app shell. |
| ~~`TopBar`~~, ~~`IconRail`~~ | Removed in D67. |
| `Sidebar` / `SidebarHeader` / `SidebarAction` / `NavItem` / `NavGroup` | The secondary navigation. |
| `PageHeader` | Icon/emoji + title + divider + `SegmentedTabs`. |
| `SegmentedTabs` | Pill tabs with active underline. |
| `ListToolbar` | Label + `CountBadge` + filters/display options on the right. |
| `GroupedList` / `ListGroup` / `ListRow` | Status-grouped rows, nested children, hover actions, keyboard navigation (↑/↓, Enter). *D70 (Figma Page List):* 36 px foreground-02 group band (20 px glyph, 13 px medium label, count pill, 12 px chevron), 48 px rows 2 px apart with a hairline below, foreground-01 on hover, the ⋯ button (18 px on foreground-03) shown on hover. Brands and Products lists share it. |
| `TypeGlyph` | Coloured template-type glyph in a tinted square. `size="md"` is the 23 x 24 Pages row glyph; every type uses its Figma icon on a tint (advertorial yellow-150, listicle purple-50, comparison/long form/versus `tint-*`, other foreground). |
| `KeyLabel` | Human key (`LUM-23`) in muted tabular text. |
| `StatusGlyph` | Group/status icons, 20 px, all from Figma (states frames): Needs review blue ring, Building graded spinner (Icon-Nav-Active), Published green tick-in-circle, Approved purple check-and-hand (18 px), Failed red cross-in-circle. |
| `OriginBadge` | Owned / Cloned. |
| `ScoreChip` | Residue score with colour by threshold. |
| `CostLabel` | `$1.84` muted. |
| `Banner` | Red/amber/green banners on the review desk. |
| `JobTray` | Running jobs toasts with live progress lines. B0.4a: button with running count + popover of recent jobs; toasts via `Toaster` (sonner, follows the theme). *D69:* a 32 px icon button in the page header with a blue dot while jobs run; the popover lists recent jobs (status icon, title, status, progress, start time). Toasts come from `JobToasts` in the sidebar so they show on every page. `NotificationsButton` likewise (blue dot while anything is unread; Mark all as read). |
| `PreviewFrame` | Sandboxed iframe with desktop/mobile toggle and zoom. |
| `SectionRail` | Draggable section list (reorder, remove, duplicate, rename). |
| `WizardStepper` | Step indicator for the create wizard. *B1.2:* horizontal step bar (number, tick when done, current step filled, joining lines, unavailable steps disabled; compact "Step N of M" with a progress line when narrow), `components/app/wizard-stepper.tsx`. |
| `OptionCard` | *B1.2:* a selectable card on a real radio or checkbox input (accent border when checked), `components/app/option-card.tsx`. |
| `EmptyState` | Illustration slot + title + body + action. |
| `CountBadge` | Tinted count used by `ListToolbar` (B0.3b). |
| `ToolbarButton` | Quiet icon + label button for list toolbars; icon-only on phones (B0.3b). |
| `PersonAvatar` | Initials avatar; assignee placeholder in rows (B0.3b). |
| `RelativeTime` | "5 minutes ago", server-rendered (B0.3b). |
| `AuthFrame` | Signed-out pages: product mark, centred card, footer line (B0.3b). |
| `PageStub` | `PageHeader` + `EmptyState` for screens not built yet (B0.3b). |
| `PageBody` | The centred content column under a page header (`md` 672 px, `lg` 768 px). |
| `JobSteps` | A job's named steps as a read-only progress tracker, raw log under "Details" (B0.5a). |
| `BrandMark` | A brand's emoji, or its initial on its primary colour (B0.5a). |

### 5.4 AffectUI components (D48)

Vendored from https://www.affectui.com (MIT) into `components/ui/`; colours, radii and font mapped
to tokens in `globals.css`. Install with `pnpm dlx shadcn@latest add https://www.affectui.com/r/<name>.json`.

| Component | Status | Where |
|---|---|---|
| `progress-tracker` | in use (B0.4c, B0.5a) | Home "Getting started" checklist (read-only, from real data, steps link to where they're done); job steps via `JobSteps` (B0.5a: running = spinner + shimmering label, failed = cross + reason; used by the demo job and brand fetch). Later: build progress screen (B1.2) |
| `profile-menu` | in use (B0.4c) | Account menu (top right): Settings, Theme, Sign out, getting-started progress |
| `filter-menu` | in use (B0.4c) | Pages toolbar → Filter (status, origin, template type; URL state). Later: Library filters (B1.6) |
| `shimmer-loader` | in use (B0.4c) | All loading states (`Skeleton`, `ShimmerText`); replaces shadcn Skeleton |
| `grid-background` | in use (B0.4c) | Sign-in / sign-up / link-error pages |
| `smart-recommendation` | in use (B0.5a) | New brand review: detected brand colours with confidence and alternatives. Later: B1.2 "let the desk pick" audience and angle |
| `text-reveal` | planned | B1.2 progress screen: AI-written text arriving |
| `decision-inbox` | planned | B1.4 review desk: quick calls ("Copy partly rewritten: Accept / Redraft") |
| `notification-stack` | planned | B1.4 stacked review-desk notices |
| `change-summary`, `number-ticker` | planned | B1.6 analytics: spend vs last week, headline numbers |
| `tips-panel` | planned | B1.6 tips for new users on Home |
| `comment-thread` | planned | B3.4 edit-agent chat |
| `email-draft`, `reaction-bar`, `button`, illustration blocks | not used | no email/social features; would replace the app-wide button; marketing graphics with third-party logos |

### 5.3 `components/features/`

Feature UIs (wizard steps, review desk panels, brand DNA form, template gallery). They import only from `ui/` and `app/`.

- `builds/` (B0.6a): `BuildPreview`, `BuildProgress`, `BuildReport` for the build page. `wizard/` (B1.2): `CreateWizard`, the steps, `Dossier`, `useBriefing`.
- `products/` (B0.5b): `AddProduct` (URL field, live pull steps, result and warnings), `ProductsList` (thumbnail, name, price with the regular price struck through when on sale, option count), `ProductForm` (editable details; selling points one per line, specs as `Label: value`), `ProductImages`, `ProductOptions` (options table, subscriptions), `ProductBriefing` (four audience cards, benefits, features, objections; Write briefing / Refresh), `ProductActions` (Pull again and Remove, each confirmed in a popover).

---

## 6. Screen map

| Route | Screen | Key components |
|---|---|---|
| `/home` | *D69 (Figma Home 17:978, Home Dark 38:2392):* a 40 px mark and a 30 px serif "Welcome, <first name>" (H4), 8 px in from the cards; 64 px below, three 285 px getting-started cards 16 px apart (Add a brand, Pick a template, Create a page): 18 px corners, a double hairline edge (`shadow-card-edge`), a 207 px painting (`public/home/*.png`) with Figma's Texture effect (grain 2.5, radius 14/15) drawn as an SVG noise-displacement filter over an untextured copy so the edges stay clean, a drawing of a light page over it (`illustration-*` colours, light in both themes), and the step in 13 px below; on hover the border deepens to Stroke-Input-Hover, as on Quality's Home cards, and nothing moves. No done state yet (owner will design it). The getting-started checklist lives in the sidebar. A pipeline overview (running, needs review, recent publishes) is still to come. | Welcome |
| `/pages` | *D70 (Figma All Pages 81:1559, My Pages 65:22069):* a 1100 px column 48 px under the header; the 28 px serif title (Figma text style Heading/Title - 28) and its line, flush with the list; the view bar on a hairline (All pages / My pages with count pills and a 2 px line under the current view that slides 200 ms to the other on click; Filter and Display (no fill until hovered); Display (group by status, template type, creator or none; order by last updated, newest first or cost; show origin, cost, updated, creator; in the URL; the button counts changed choices; not in a frame yet, so it uses the Figma menu style); the list/grid toggle last, grid disabled until designed); 20 px below, the status groups. `?sample=1` (development only) shows sample pages in every status. | PageHeader, ViewTabs, PagesFilter, PagesDisplay, PagesLayoutToggle, GroupedList |
| `/pages/new` | Create wizard. *B1.2 (D66):* page header "New page", an intro line, then one bordered panel in a 1152 px column. **Top:** the step bar (numbered steps joined by lines, ticks when done, current step filled; labels show when the bar is at least 896 px wide; under 672 px it becomes "Step N of 6 · Label" with a progress line). **Middle:** the step (heading, hint, content) and, beside it, the "Brand dossier" (300 px, canvas background: product photo, brand, name, price, brand colour swatches, ticked fact chips with the briefing status, the chosen template as a thumbnail row, and "Your choices" once made). **Bottom bar:** Back on the left; Next, or **Build page** on the last step, on the right. Steps: **Brand & product** (two selects); **Template** (Library and Yours card grids with thumbnails); **Imagery** (Generate images / Product photos only, then eight style cards with icons, multi-select); **Audience** (Let the desk pick plus the briefing's four audiences as cards, gender segmented control, age select; briefing progress and Try again while it's written); **Emphasis** (benefits, features, objections as checklists, up to 3 each, with "Add your own"); **Review & build** (summary rows and the Author select). Below `lg` the dossier sits under the step. A new step scrolls the panel's top into view and focuses its heading. | WizardStepper, OptionCard, CreateWizard, Dossier, steps |
| `/pages/[id]` | Review desk. *B0.6a:* the build page: header with key, title and status; sandboxed preview (Desktop / Mobile 390 px, open in a new tab) on the left; live build steps and the report (banners, facts, claims check, notes) in a 384 px right panel. *B0.6b:* Export (Export HTML → steps → Download `<KEY>.html`, Export again) above the report; the report adds copy counts, mock-copy and copy-error banners, and a folded "Copy changes" list (old line struck through, new line under it). Tabs and editing arrive in B1.4. | BuildPreview, BuildProgress (JobSteps), ExportButton, BuildReport |
| `/pages/[id]/editor` | Full editor (M3) | SectionRail, canvas, image studio sheet |
| `/templates` | Library gallery + org templates. *B1.1a:* header tabs **Library** / **Yours** (`?view=yours`); intro line; a card grid (1–3 columns, `PageBody` xl) of cards: 4:3 thumbnail, name, type glyph · type · section count, description (Library) or "From <library template> · Version n · <time>" (Yours), then **Use template** (Library; toast "Added … to your templates", then opens Yours) or **Delete** (Yours, confirm) and **Preview** (opens the sandboxed template page in a new tab). Empty Yours: "No templates yet" with a hint to use a library template. | TemplateCard, UseTemplateButton, TemplateCardMenu, ViewTabs, TypeGlyph. *B1.1b:* Yours cards add **Edit sections**. *D74 (Figma Template/Library and Template/Yours, light and dark):* the Pages layout (1100 px column, serif title and line, Library / Yours with counts on a hairline); cards four to a row, 10 px apart: 18 px corners, a 0.7 px stroke inside the edge over the content (`frame-stroke`), the page's screenshot (190 px, top of the page), name, type glyph · type · sections, two lines of description, then Use Template (blue, `compact`) with Preview (Library) or ⋯ (Yours: Preview, Delete with a confirm; the screenshot opens the section editor; Use Template opens the new-page wizard with it chosen). *Card update (owner, 2026-10-12; Figma 173:3836 light, 147:6647 dark, Yours 147:9566):* the picture is a painted backdrop (`public/templates/card-backdrop.png`, the frames' image fill) with the page's screenshot in Home's framed window (inset 15 px, 22 px from the top, 153 px tall, `shadow-illustration-window` drawn over the screenshot); the card edge is a 0.5 px Surface/Stroke border with the 0.7 px line and Shadow/Edge inside it (`frame-stroke`); card bodies, Library and Yours, are Surface/Dashboard in both themes (owner's choice over the frames' Foreground-01 and white); Preview is Foreground-03 (Foreground-01 in dark) and ⋯ Foreground-03 (Foreground-02 in dark). The blue button's two drop shadows now show in dark only (owner): `--button-blue-drop` is a transparent shadow in light. Light cards drop the Shadow/Edge line too (`--card-edge-shadow`), leaving only the #f0f0f0 Stroke lines (owner). *Card structure from Template/Yours (owner, 2026-10-12; Figma light 154:14185, dark 187:15866), for Library and Yours alike, replacing the backdrop version above:* Surface-Primary card, 18 px corners, `frame-stroke` (0.5 px Stroke border, 0.7 px line; edge shadow dark-only); a 190 px Foreground-01 well with 14 px bottom corners (`rounded-b-well`) and a Stroke line under it, holding the screenshot 16 px in with 10 px corners, a 0.5 px line (Illustration line strong in light, Stroke in dark) and a soft shadow (`template-shot`); the name in 13 px medium (Body small); Preview and ⋯ on Foreground-02 in both themes. The backdrop image is gone. |
| `/templates/[id]` | Section editor. *B1.1b (owner's reference layout, follows the app theme):* full screen, outside the workspace shell. Top bar: back, template name, "● Saved · version N" (highlight colour; "Saving…" while saving), Undo and Redo (⌘Z, ⇧⌘Z), **Create a page** (B1.2: opens the wizard with this template chosen; replaced B1.1b's test-build dialog). Left panel (440 px) with tabs **Content** (collapsible "Selected section" card: name (click to rename), "Section N of M", icon buttons move up, move down, duplicate, remove with reasons in tooltips when unavailable, type · words · images, the section's words read-only; collapsible "Whole template · N sections": rows with a drag handle on hover, type word or a highlight-coloured item number "01", and the name), **Look** (the template's colours and fonts), **Details** (name and description form; type, source, version; version history with Restore), **Issues** (template checks; count badge for problems and warnings). Right: Desktop/Phone toggle, "N sections · about X min read", the sandboxed preview with a solid highlight outline on the selected section and a dashed one on hover; clicking a section selects it. Below `lg` the panel sits above the preview. | TemplateEditor, ContentPanel, SortableList, EditorPreview, LookPanel, DetailsPanel, IssuesPanel, EditorTestBuild |
| `/templates/clone` | Clone a page (M2) | URL form, terms dialog, progress |
| `/brands` | Brand list | GroupedList or table |
| `/brands/[id]` | Brand with tabs: Overview, Pages, Products, Templates, Brand DNA | PageHeader, forms |
| `/brands/[id]/products` | Add product (paste a product page → live steps) above the product list | AddProduct, JobSteps, ProductsList (GroupedList) |
| `/brands/[id]/products/[productId]` | Product: summary (price, source, link), Pull again / Remove, images, editable details, options and subscriptions, briefing. *B1.2:* **New page for this product** opens the wizard on the template step (replaces B1.1a's "Build a test page") | ProductActions, ProductImages, ProductForm, ProductOptions, ProductBriefing, NewPageLink |
| `/library` | Archive of all builds + ledger | table, filters |
| `/analytics` | Spend roll-ups | charts (recharts), cards |
| `/settings/*` | Org, members, integrations (Vercel, Shopify), flags | forms |

Interaction notes:
- ⌘K opens a command palette (search brands, pages, templates; quick actions).
- Rows open on click; `⋯` menu on hover; multi-select with checkboxes appearing on hover (M3).
- Wizard keeps state in the URL so refresh does not lose progress.
- **Motion (D51, from the `emil-design-eng` skill in `.claude/skills/`).** Before animating, ask how often people will see it. Things used tens of times a day animate barely or not at all; nothing started from the keyboard animates. Every animation has a purpose (feedback, spatial continuity, state, avoiding a jarring jump).
  - Curves are tokens in `globals.css`: `ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) for anything entering, leaving or pressed; `ease-in-out` for things moving on screen; `ease-drawer` for sheets. Never `ease-in`.
  - Durations: press 150 ms; tooltips and menus 150 ms in, 100 ms out (leaving is faster than arriving); sheets 300 ms in, 200 ms out; everything else in the product UI 300 ms or less. Only the auth-page grid (seen rarely) runs longer.
  - Animate `transform` and `opacity` only, and name the properties (`transition-[color,transform]`, never `transition-all`).
  - Buttons scale to 0.97 while pressed. Menus and popovers grow from their trigger (Radix transform origin), from 95 %, never from 0.
  - Tooltips wait 400 ms the first time; once one is open, neighbours open instantly with no animation (`skipDelayDuration`).
  - List groups and the sidebar open without a height animation (they are toggled often, often by keyboard); only the chevron turns.
  - Spinners turn fast (0.7 s). Under `prefers-reduced-motion` motion gets gentler, not removed: fades stay, movement goes, spinners turn slowly (`animate-spin-slow`).
  - AffectUI components follow the same rules: their curves map to `--ease-out` and their timings were shortened in the vendored files.
  - `motion/react` (never `framer-motion`) is for springs and gestures CSS cannot do; prefer CSS transitions, which can be interrupted.
  - Reviews of motion use a Before | After | Why table.

---

## 7. Phase 2 — replacing shadcn from Figma via the Figma MCP

When the owner says a Figma frame or component is ready, follow this process. Do it **one component or one screen per build**, never a sweeping restyle.

1. **Get the link.** The owner provides a Figma URL with a node id (frame or component). If not, ask for it.
2. **Inspect tools.** List the Figma MCP tools available in the session (commonly: design context/code for a node, variable definitions, screenshot, metadata, Code Connect map). Use the ones present; do not assume names.
3. **Pull tokens first.** Fetch the variable definitions for the file. Diff them against `@theme` in `globals.css`. Propose the token changes in the plan (table: token, old, new). After confirmation, update `globals.css` **once**; components follow automatically.
4. **Pull the node.** Get the design context and a screenshot for the target node. Identify which of our components it corresponds to.
5. **Replace in place.** Rewrite the component in `components/ui/` or `components/app/` to match Figma: structure, spacing, radius, states (hover, active, focus, disabled), sizes and variants. Keep the **same props API** unless the plan proposes a change, so feature code does not break. Remove shadcn internals that are no longer needed, but keep Radix primitives for accessibility behaviour.
6. **Map, don't hard-code.** Every value must resolve to a token. If Figma uses a value with no token, add a token (and name it semantically) rather than inlining it.
7. **Verify visually.** Run the app; screenshot the component/screen; compare with the Figma screenshot side by side in the Build Report. List any intentional differences.
8. **Record.** Add a line to `docs/DESIGN_REPLACEMENTS.md`: component, Figma node URL, date, notes. When every component in a screen is replaced, mark the screen done.

Figma is authoritative after replacement: if DESIGN.md and Figma disagree, Figma wins, and update DESIGN.md to match.

---

## 8. Accessibility baseline

- All interactive elements reachable by keyboard; visible focus.
- Colour contrast AA for text (check `--color-fg-muted` on `--color-surface-muted`).
- Icon-only buttons have `aria-label` and a tooltip.
- Status is never conveyed by colour alone (glyph + label).
- Respect `prefers-reduced-motion`: gentler motion, not none (see §6).

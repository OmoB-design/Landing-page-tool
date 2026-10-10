# DESIGN.md — UI style, tokens and the Figma replacement process

## 1. Intent

**D67 (2026-10-10, owner):** the app now takes the look and layout of the Quality app (usequality.app; not the owner's product, so its look is matched but not its name, logo, wording or artwork). One sidebar on a light grey canvas, the page in a floating white panel with a 48 px text header, Inter at 13 px with Crimson Pro serif greetings, Quality's greys (including its `#8d8d8d` secondary text, the owner's choice), an indigo primary, 6 px controls and 10 px panels. The Notion-like description below is the original intent (D19) and is kept for history; the anatomy in §2 starts with the current layout.

A calm, dense, Notion-like workspace: neutral surfaces, hairline borders, compact type, quiet hover states, colour used sparingly for status and identity. The tool is used for hours by operators reviewing many pages, so it should feel like a productivity app, not a marketing site.

The owner supplied a reference screenshot (a work-management app: icon rail, secondary sidebar, tabbed project header, grouped issue list). Copy its **structure and density**, not its brand, logo, product names or icons.

**Phase 1 (now):** build with shadcn components, styled with the tokens below, so the owner can see real flows working.
**Phase 2 (later):** the owner designs in Figma; Claude Code replaces components one by one from Figma via the Figma MCP. Figma then becomes authoritative.

---

## 2. Layout anatomy

**Current (D67):**
```
┌──────────────┬──────────────────────────────────────────────────┐
│ [B] Org ▾  ◧ │ ╭──────────────────────────────────────────────╮ │  canvas #f9f9f9
│              │ │ Page title  │ Tabs …                Actions │ │  PageHeader 48px
│ ⌂ Home       │ ├──────────────────────────────────────────────┤ │
│ + New page   │ │                                              │ │
│ ⌕ Search  ⌘K │ │  page content (centred column or full width) │ │
│ 🔔 Notifications 43                                           │ │
│ ⟳ Jobs       │ │                                              │ │
│ Workspace ▾  │ │                                              │ │
│  Pages       │ │                                              │ │
│  Templates   │ │                                              │ │
│  Brands      │ │                                              │ │
│  Library     │ │                                              │ │
│  Analytics   │ │                                              │ │
│ Your brands ▾│ │                                              │ │
│  ■ Allbirds  │ │                                              │ │
│ ╭──────────╮ │ │                                              │ │
│ │◔ Getting │ │ │                                              │ │
│ │  started │ │ │                                              │ │
│ │○ steps … │ │ │                                              │ │
│ ╰──────────╯ │ │                                              │ │
│ ⚙ Settings   │ │                                              │ │
│ (B) Account  │ ╰──────────────────────────────────────────────╯ │  white panel, 6px inset,
└──────────────┴──────────────────────────────────────────────────┘  10px corners
  sidebar 236px
```
- **Sidebar** (on the canvas): the workspace menu (coloured letter mark, name, chevron; lists orgs) and the collapse button; Home, New page, Search (⌘K, not built), Notifications and Jobs rows with counts (popovers open to the right); collapsible **Workspace** and **Your brands** groups with a small filled caret; the **getting-started card** (`SidebarSetup`: a progress ring, "Getting started", "N/5 steps completed", the five steps as links with a circle that becomes a tick; the chevron folds it, remembered in the browser; gone once every step is done), then Settings and the account row (avatar and name; the account menu opens upward) at the bottom. Current item and hover: `surface-hover`.
- **Page panel:** white, 6 px from the window edges, 10 px corners, a hairline border. Each page starts with `PageHeader` (48 px: a mark if any, the title in 13 px regular, a divider, tabs, actions on the right; no section icons). These sizes were measured from the owner's Quality screenshots. On small screens, or with the sidebar collapsed, the header shows the open-sidebar button.
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

## 4. Tokens (D67: Quality's values)

Declared in `apps/web/app/globals.css` with Tailwind v4 `@theme`; the block below mirrors it. Since D67 (2026-10-10) the values follow the Quality app's public design tokens (Inter and Crimson Pro, its grey scale, indigo primary, 6 px / 10 px corners, its control shadows, its dark values). **Figma replaces them when the owner provides frames.** Use semantic names so components never reference raw values. Fonts come from `next/font` (`--font-inter`, `--font-jetbrains-mono`, `--font-crimson`) and map to `font-sans`, `font-mono`, `font-serif`.

```css
@theme {
  /* Typography (Quality: Inter 13 px interface, Crimson Pro display) */
  --text-xs: 0.6875rem; /* 11px badges */
  --text-sm: 0.75rem; /* 12px group labels, meta */
  --text-sm--line-height: 1.5;
  --text-base: 0.8125rem; /* 13px body, rows, nav, controls */
  --text-base--line-height: 1.5;
  --text-md: 0.875rem; /* 14px page header titles */
  --text-lg: 1rem; /* 16px section titles */
  --text-xl: 1.375rem; /* 22px page titles in empty states */
  --text-display: 2.25rem; /* 36px serif greetings */
  --text-display--line-height: 1.15;

  /* Neutrals (light) */
  --color-canvas: #f9f9f9; /* app background, sidebar */
  --color-surface: #ffffff; /* the page panel, cards, menus */
  --color-surface-muted: #f5f5f5; /* fields, bands, chips */
  --color-surface-hover: #f0f0f0; /* hover, the current nav item */
  --color-surface-active: #e6e6e6; /* pressed */
  --color-border: #f0f0f0; /* dividers, panel edges */
  --color-border-strong: #e6e6e6; /* inputs, cards, outline buttons */
  --color-fg: #2a2a2a;
  --color-fg-muted: #8d8d8d; /* secondary text and icons (owner chose Quality's grey) */
  --color-fg-subtle: #b2b2b2;

  /* Accent and status */
  --color-accent: #5c5aed; /* primary buttons, links, focus */
  --color-accent-strong: #3f3ccd; /* primary hover */
  --color-accent-soft: #e0e0f9;
  --color-success: #099137;
  --color-success-soft: #daf1e2;
  --color-warning: #dd900d;
  --color-warning-soft: #fdeed4;
  --color-danger: #cb1a14;
  --color-danger-soft: #f9dddd;

  /* Marks: workspace and people avatars take one of these by name (Quality's A–H set). */
  --color-mark-a: #216e55;
  --color-mark-b: #0c756e;
  --color-mark-c: #c23f09;
  --color-mark-d: #526e0c;
  --color-mark-e: #6d28d8;
  --color-mark-f: #b8570b;
  --color-mark-g: #37364f;
  --color-mark-h: #bd0f2c;
  --color-mark-a-soft: #c2f3e2;
  --color-mark-b-soft: #cbfaf2;
  --color-mark-c-soft: #ffedd5;
  --color-mark-e-soft: #ece9fe;
  /* Section editor: selected and hovered sections, numbered items (B1.1b, owner's reference) */
  --color-highlight: #c98a12;
  --color-highlight-soft: #fbf1dc;

  /* Type glyph tints (template types) */
  --color-glyph-advertorial: #f5a623;
  --color-glyph-listicle: #6c5ce7;
  --color-glyph-versus: #e5484d;
  --color-glyph-comparison: #2fb36e;
  --color-glyph-longform: #3f76ff;

  /* Radius (Quality: 6 px controls, 10 px panels and cards) */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;

  /* Layout. DESIGN.md names these --size-*; Tailwind v4 only builds w-/h-/size- utilities from
     the --spacing-* namespace, so they live here (w-rail, w-sidebar, h-topbar, h-row, h-nav-item). */
  --spacing-sidebar: 248px;
  --spacing-topbar: 48px; /* the section editor's own top bar */
  --spacing-header: 52px; /* page header inside the panel (h-header) */
  --spacing-row: 40px;
  --spacing-nav-item: 32px;
  --spacing-panel: 384px; /* right-hand panel on the build page (w-panel) */
  --spacing-preview-mobile: 390px; /* phone-width page preview (w-preview-mobile) */
  --spacing-editor-panel: 440px; /* section editor's left panel (w-editor-panel) */
  --spacing-wizard-dossier: 300px; /* create wizard's dossier panel (w-wizard-dossier) */

  /* Motion (D51, DESIGN.md §6): strong custom curves; the built-in ones are too weak. */
  --ease-out: cubic-bezier(
    0.23,
    1,
    0.32,
    1
  ); /* enter/exit, presses, popovers */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* things moving on screen */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); /* sheets and drawers */
  --animate-spin: spin 0.7s linear infinite; /* a fast spinner reads as a fast app */
  --animate-spin-slow: spin 1.6s linear infinite; /* reduced motion: slower, not stopped */

  /* Shadow (Quality): outline buttons get a soft lift; primary buttons an inner bottom edge. */
  --shadow-pop: 0 4px 16px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
  --shadow-control:
    0 0 0 0.5px rgb(61 59 53 / 0.1), 0 1px 1px rgb(0 0 0 / 0.1),
    0 1px 5px rgb(61 59 53 / 0.05);
  --shadow-edge: inset 0 -0.5px 0 0.3px rgb(0 0 0 / 0.15);
  --shadow-panel: 0 0 0 0.5px rgb(61 59 53 / 0.04), 0 1px 2px rgb(0 0 0 / 0.03);
}
.dark {
  /* Quality's dark values. */
  --color-canvas: #090909;
  --color-surface: #121212;
  --color-surface-muted: #212121;
  --color-surface-hover: #2a2a2a;
  --color-surface-active: #3d3d3d;
  --color-border: #212121;
  --color-border-strong: #2a2a2a;
  --color-fg: #f5f5f5;
  --color-fg-muted: #b2b2b2;
  --color-fg-subtle: #595959;
  --color-accent: #615cf5;
  --color-accent-strong: #3f3ccd;
  --color-accent-soft: #24224f;
  /* B0.3b: the soft status backgrounds also need dark values, or chips glare on dark surfaces. */
  --color-success-soft: #13301d;
  --color-warning-soft: #36290f;
  --color-danger-soft: #3a1b1c;
  --color-highlight: #e3a93b;
  --color-highlight-soft: #3a2c12;
}```

Map shadcn's CSS variables (`--background`, `--foreground`, `--muted`, `--border`, `--ring`, `--primary`, etc.) onto these semantic tokens in `globals.css`, so shadcn components inherit the style without per-component overrides.

*B0.3 note (D37):* shadcn also uses the name `accent`, for a grey hover background. Here `accent` keeps its DESIGN meaning (the blue highlight), and shadcn's hover classes in `components/ui` are remapped to `surface-hover` / `fg`. Check for this whenever `shadcn add` brings in a new component.

Rules:
- No hex values or arbitrary Tailwind values (`[#...]`, `[13px]`) in feature code.
- Spacing on a 4 px grid.
- Numbers in lists (keys, counts, costs) use `tabular-nums`.
- Focus ring: 2 px `--color-accent` at 40 % opacity, offset 1 px; always visible on keyboard focus.
- The root font size stays at the browser's 16 px, so rem-based tokens resolve to their stated sizes; the 13 px body size (D67; 14 px before) is set on `body`, never on `html` (B0.3b fix).
- `font-serif` (Crimson Pro) is for page greetings and big titles only (Home's "Welcome", the sign-in card); everything else is Inter.

---

## 5. Component inventory

### 5.1 `components/ui/` (shadcn primitives, Phase 1)

Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Dialog, Sheet, DropdownMenu, ContextMenu, Popover, Tooltip, Command (for search and pickers), Badge, Avatar, Separator, ScrollArea, Skeleton, Progress, Toast (sonner), Collapsible, Accordion, Table, Form helpers.

### 5.2 `components/app/` (app composites, built on ui/)

| Component | Purpose |
|---|---|
| `AppShell` | *D67:* the sidebar on the canvas and the page in a floating white panel (`main`). Handles sidebar collapse (persisted in a cookie) and the mobile sheet. |
| `SidebarNav` | *D67:* workspace menu and collapse; Home, New page, Search, Notifications and Jobs rows; Workspace and Your brands groups; Settings and the account row. |
| `OrgSwitcher` | Coloured letter mark (`WorkspaceMark`) + name + chevron; dropdown of orgs. |
| `WorkspaceMark` / `PersonMark` | *D67:* a letter on one of eight colours picked from the name (`components/app/mark.tsx`). |
| ~~`TopBar`~~, ~~`IconRail`~~ | Removed in D67. |
| `Sidebar` / `SidebarHeader` / `SidebarAction` / `NavItem` / `NavGroup` | The secondary navigation. |
| `PageHeader` | Icon/emoji + title + divider + `SegmentedTabs`. |
| `SegmentedTabs` | Pill tabs with active underline. |
| `ListToolbar` | Label + `CountBadge` + filters/display options on the right. |
| `GroupedList` / `ListGroup` / `ListRow` | Status-grouped rows, nested children, hover actions, keyboard navigation (↑/↓, Enter). |
| `TypeGlyph` | Coloured template-type glyph in a tinted square. |
| `KeyLabel` | Human key (`LUM-23`) in muted tabular text. |
| `StatusGlyph` | Group/status icons (dashed circle, circle, half-filled, check, cross). |
| `OriginBadge` | Owned / Cloned. |
| `ScoreChip` | Residue score with colour by threshold. |
| `CostLabel` | `$1.84` muted. |
| `Banner` | Red/amber/green banners on the review desk. |
| `JobTray` | Running jobs toasts with live progress lines. B0.4a: button with running count + popover of recent jobs; toasts via `Toaster` (sonner, follows the theme). *D67:* a sidebar row ("Jobs" with the running count; popover opens to the right). `NotificationsButton` likewise ("Notifications" with the unread count). |
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
| `/home` | *D67:* the person's mark, a serif "Welcome, <first name>", three getting-started cards (Add a brand, Pick a template, Create a page; each with a drawing of our own screens on a soft tint, a Done badge once its step is done). The getting-started checklist lives in the sidebar. A pipeline overview (running, needs review, recent publishes) is still to come. | Welcome |
| `/pages` | All pages grouped by status | PageHeader, ListToolbar, GroupedList |
| `/pages/new` | Create wizard. *B1.2 (D66):* page header "New page", an intro line, then one bordered panel in a 1152 px column. **Top:** the step bar (numbered steps joined by lines, ticks when done, current step filled; labels show when the bar is at least 896 px wide; under 672 px it becomes "Step N of 6 · Label" with a progress line). **Middle:** the step (heading, hint, content) and, beside it, the "Brand dossier" (300 px, canvas background: product photo, brand, name, price, brand colour swatches, ticked fact chips with the briefing status, the chosen template as a thumbnail row, and "Your choices" once made). **Bottom bar:** Back on the left; Next, or **Build page** on the last step, on the right. Steps: **Brand & product** (two selects); **Template** (Library and Yours card grids with thumbnails); **Imagery** (Generate images / Product photos only, then eight style cards with icons, multi-select); **Audience** (Let the desk pick plus the briefing's four audiences as cards, gender segmented control, age select; briefing progress and Try again while it's written); **Emphasis** (benefits, features, objections as checklists, up to 3 each, with "Add your own"); **Review & build** (summary rows and the Author select). Below `lg` the dossier sits under the step. A new step scrolls the panel's top into view and focuses its heading. | WizardStepper, OptionCard, CreateWizard, Dossier, steps |
| `/pages/[id]` | Review desk. *B0.6a:* the build page: header with key, title and status; sandboxed preview (Desktop / Mobile 390 px, open in a new tab) on the left; live build steps and the report (banners, facts, claims check, notes) in a 384 px right panel. *B0.6b:* Export (Export HTML → steps → Download `<KEY>.html`, Export again) above the report; the report adds copy counts, mock-copy and copy-error banners, and a folded "Copy changes" list (old line struck through, new line under it). Tabs and editing arrive in B1.4. | BuildPreview, BuildProgress (JobSteps), ExportButton, BuildReport |
| `/pages/[id]/editor` | Full editor (M3) | SectionRail, canvas, image studio sheet |
| `/templates` | Library gallery + org templates. *B1.1a:* header tabs **Library** / **Yours** (`?view=yours`); intro line; a card grid (1–3 columns, `PageBody` xl) of cards: 4:3 thumbnail, name, type glyph · type · section count, description (Library) or "From <library template> · Version n · <time>" (Yours), then **Use template** (Library; toast "Added … to your templates", then opens Yours) or **Delete** (Yours, confirm) and **Preview** (opens the sandboxed template page in a new tab). Empty Yours: "No templates yet" with a hint to use a library template. | TemplateCard, UseTemplateButton, DeleteTemplateButton, TypeGlyph. *B1.1b:* Yours cards add **Edit sections**. |
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

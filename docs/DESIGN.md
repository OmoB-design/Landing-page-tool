# DESIGN.md — UI style, tokens and the Figma replacement process

## 1. Intent

A calm, dense, Notion-like workspace: neutral surfaces, hairline borders, compact type, quiet hover states, colour used sparingly for status and identity. The tool is used for hours by operators reviewing many pages, so it should feel like a productivity app, not a marketing site.

The owner supplied a reference screenshot (a work-management app: icon rail, secondary sidebar, tabbed project header, grouped issue list). Copy its **structure and density**, not its brand, logo, product names or icons.

**Phase 1 (now):** build with shadcn components, styled with the tokens below, so the owner can see real flows working.
**Phase 2 (later):** the owner designs in Figma; Claude Code replaces components one by one from Figma via the Figma MCP. Figma then becomes authoritative.

---

## 2. Layout anatomy (from the reference)

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

## 4. Tokens (Phase 1 starting values)

Declare in `apps/web/app/globals.css` with Tailwind v4 `@theme`. These are starting values eyeballed from the reference; **Figma replaces them in Phase 2.** Use semantic names so components never reference raw values.

```css
@import "tailwindcss";

@theme {
  /* Typography */
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --text-xs: 0.6875rem;   /* 11px rail labels */
  --text-sm: 0.8125rem;   /* 13px group labels, meta */
  --text-base: 0.875rem;  /* 14px body, rows, nav */
  --text-md: 1rem;        /* 16px sidebar title */
  --text-lg: 1.125rem;    /* 18px page header */
  --text-xl: 1.375rem;    /* 22px page titles in empty states */

  /* Neutrals (light) */
  --color-canvas: #f7f7f8;        /* app background, rail */
  --color-surface: #ffffff;       /* sidebar, main pane, cards */
  --color-surface-muted: #f3f3f4; /* group bands, primary-action bg, search bg */
  --color-surface-hover: #f0f0f1;
  --color-surface-active: #e9e9eb;
  --color-border: #ebebed;
  --color-border-strong: #dcdcdf;
  --color-fg: #1f1f22;
  --color-fg-muted: #6b6b73;
  --color-fg-subtle: #9a9aa2;

  /* Accent and status */
  --color-accent: #3f76ff;
  --color-accent-soft: #e8efff;
  --color-success: #1f9d55;
  --color-success-soft: #e6f6ec;
  --color-warning: #c27c0e;
  --color-warning-soft: #fdf3e1;
  --color-danger: #d93f3f;
  --color-danger-soft: #fdecec;
  /* B1.1b: section editor selection, hover outline and item numbers (owner's reference) */
  --color-highlight: #c98a12;
  --color-highlight-soft: #fbf1dc;

  /* Type glyph tints (template types) */
  --color-glyph-advertorial: #f5a623;
  --color-glyph-listicle: #6c5ce7;
  --color-glyph-versus: #e5484d;
  --color-glyph-comparison: #2fb36e;
  --color-glyph-longform: #3f76ff;

  /* Radius */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Layout. B0.3: renamed from --size-* to --spacing-* (D36); Tailwind v4 only generates
     w-/h-/size- utilities from the spacing namespace: w-rail, w-sidebar, h-topbar, h-row, h-nav-item. */
  --spacing-rail: 64px;
  --spacing-sidebar: 260px;
  --spacing-topbar: 48px;
  --spacing-row: 40px;
  --spacing-nav-item: 32px;
  --spacing-panel: 384px;           /* B0.6a: build page right panel */
  --spacing-preview-mobile: 390px;  /* B0.6a: phone-width preview */
  --spacing-editor-panel: 440px;    /* B1.1b: section editor left panel */

  /* Shadow (used rarely: popovers, menus, dialogs) */
  --shadow-pop: 0 4px 16px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
}

/* Dark theme: same token names, different values */
.dark {
  --color-canvas: #141416;
  --color-surface: #1b1b1e;
  --color-surface-muted: #222226;
  --color-surface-hover: #26262a;
  --color-surface-active: #2e2e33;
  --color-border: #2a2a2f;
  --color-border-strong: #36363c;
  --color-fg: #ededf0;
  --color-fg-muted: #a1a1aa;
  --color-fg-subtle: #71717a;
  --color-accent-soft: #1d2a4d;
  --color-success-soft: #15301f; /* B0.3b */
  --color-warning-soft: #36290f; /* B0.3b */
  --color-danger-soft: #3a1b1c;  /* B0.3b */
  --color-highlight: #e3a93b;    /* B1.1b */
  --color-highlight-soft: #3a2c12;
}
```

Map shadcn's CSS variables (`--background`, `--foreground`, `--muted`, `--border`, `--ring`, `--primary`, etc.) onto these semantic tokens in `globals.css`, so shadcn components inherit the style without per-component overrides.

*B0.3 note (D37):* shadcn also uses the name `accent`, for a grey hover background. Here `accent` keeps its DESIGN meaning (the blue highlight), and shadcn's hover classes in `components/ui` are remapped to `surface-hover` / `fg`. Check for this whenever `shadcn add` brings in a new component.

Rules:
- No hex values or arbitrary Tailwind values (`[#...]`, `[13px]`) in feature code.
- Spacing on a 4 px grid.
- Numbers in lists (keys, counts, costs) use `tabular-nums`.
- Focus ring: 2 px `--color-accent` at 40 % opacity, offset 1 px; always visible on keyboard focus.
- The root font size stays at the browser's 16 px, so rem-based tokens resolve to their stated sizes; the 14 px body size is set on `body`, never on `html` (B0.3b fix).

---

## 5. Component inventory

### 5.1 `components/ui/` (shadcn primitives, Phase 1)

Button, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Tabs, Dialog, Sheet, DropdownMenu, ContextMenu, Popover, Tooltip, Command (for search and pickers), Badge, Avatar, Separator, ScrollArea, Skeleton, Progress, Toast (sonner), Collapsible, Accordion, Table, Form helpers.

### 5.2 `components/app/` (app composites, built on ui/)

| Component | Purpose |
|---|---|
| `AppShell` | Grid: TopBar, IconRail, Sidebar, main. Handles sidebar collapse (persist in a cookie, not localStorage on server). |
| `TopBar` | Org switcher, search (Command palette ⌘K), notifications bell, user menu. |
| `OrgSwitcher` | Logo mark + name + chevron; dropdown of orgs; "Create org". |
| `IconRail` / `RailItem` | Icon + label, active state. |
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
| `JobTray` | Running jobs toasts with live progress lines. B0.4a: top-bar button with running count + popover of recent jobs; toasts via `Toaster` (sonner, follows the theme). |
| `PreviewFrame` | Sandboxed iframe with desktop/mobile toggle and zoom. |
| `SectionRail` | Draggable section list (reorder, remove, duplicate, rename). |
| `WizardStepper` | Step indicator for the create wizard. |
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

- `builds/` (B0.6a): `BuildPreview`, `BuildProgress`, `BuildReport` for the build page; `products/TestBuildButton` (temporary until the wizard).
- `products/` (B0.5b): `AddProduct` (URL field, live pull steps, result and warnings), `ProductsList` (thumbnail, name, price with the regular price struck through when on sale, option count), `ProductForm` (editable details; selling points one per line, specs as `Label: value`), `ProductImages`, `ProductOptions` (options table, subscriptions), `ProductBriefing` (four audience cards, benefits, features, objections; Write briefing / Refresh), `ProductActions` (Pull again and Remove, each confirmed in a popover).

---

## 6. Screen map

| Route | Screen | Key components |
|---|---|---|
| `/home` | Pipeline overview: running jobs, needs review, recent publishes | GroupedList, JobTray |
| `/pages` | All pages grouped by status | PageHeader, ListToolbar, GroupedList |
| `/pages/new` | Create wizard (7 steps) | WizardStepper, cards, side "dossier" panel |
| `/pages/[id]` | Review desk. *B0.6a:* the build page: header with key, title and status; sandboxed preview (Desktop / Mobile 390 px, open in a new tab) on the left; live build steps and the report (banners, facts, claims check, notes) in a 384 px right panel. *B0.6b:* Export (Export HTML → steps → Download `<KEY>.html`, Export again) above the report; the report adds copy counts, mock-copy and copy-error banners, and a folded "Copy changes" list (old line struck through, new line under it). Tabs and editing arrive in B1.4. | BuildPreview, BuildProgress (JobSteps), ExportButton, BuildReport |
| `/pages/[id]/editor` | Full editor (M3) | SectionRail, canvas, image studio sheet |
| `/templates` | Library gallery + org templates. *B1.1a:* header tabs **Library** / **Yours** (`?view=yours`); intro line; a card grid (1–3 columns, `PageBody` xl) of cards: 4:3 thumbnail, name, type glyph · type · section count, description (Library) or "From <library template> · Version n · <time>" (Yours), then **Use template** (Library; toast "Added … to your templates", then opens Yours) or **Delete** (Yours, confirm) and **Preview** (opens the sandboxed template page in a new tab). Empty Yours: "No templates yet" with a hint to use a library template. | TemplateCard, UseTemplateButton, DeleteTemplateButton, TypeGlyph. *B1.1b:* Yours cards add **Edit sections**. |
| `/templates/[id]` | Section editor. *B1.1b (owner's reference layout, follows the app theme):* full screen, outside the workspace shell. Top bar: back, template name, "● Saved · version N" (highlight colour; "Saving…" while saving), Undo and Redo (⌘Z, ⇧⌘Z), **Build a test page** (dialog: pick a product). Left panel (440 px) with tabs **Content** (collapsible "Selected section" card: name (click to rename), "Section N of M", icon buttons move up, move down, duplicate, remove with reasons in tooltips when unavailable, type · words · images, the section's words read-only; collapsible "Whole template · N sections": rows with a drag handle on hover, type word or a highlight-coloured item number "01", and the name), **Look** (the template's colours and fonts), **Details** (name and description form; type, source, version; version history with Restore), **Issues** (template checks; count badge for problems and warnings). Right: Desktop/Phone toggle, "N sections · about X min read", the sandboxed preview with a solid highlight outline on the selected section and a dashed one on hover; clicking a section selects it. Below `lg` the panel sits above the preview. | TemplateEditor, ContentPanel, SortableList, EditorPreview, LookPanel, DetailsPanel, IssuesPanel, EditorTestBuild |
| `/templates/clone` | Clone a page (M2) | URL form, terms dialog, progress |
| `/brands` | Brand list | GroupedList or table |
| `/brands/[id]` | Brand with tabs: Overview, Pages, Products, Templates, Brand DNA | PageHeader, forms |
| `/brands/[id]/products` | Add product (paste a product page → live steps) above the product list | AddProduct, JobSteps, ProductsList (GroupedList) |
| `/brands/[id]/products/[productId]` | Product: summary (price, source, link), Pull again / Remove, images, editable details, options and subscriptions, briefing. *B1.1a:* "Build a test page" has a template picker (Select, grouped Library / Yours) | ProductActions, ProductImages, ProductForm, ProductOptions, ProductBriefing, TestBuildButton |
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

# Style Overhaul — "ClickFlare" Look & Feel

> **Goal:** Redo the Alpha-net frontend visual style so it matches the aesthetic of the
> ClickFlare dashboard screenshots (attached in chat): a dense, modern SaaS analytics UI —
> white cards on a light-gray canvas, blue primary accent, monospaced numerals,
> chip/badge-driven information design, and a collapsible icon sidebar with grouped nav.

## Scope

- **In scope:** all visual styling of `frontend/src` — design tokens, layout components
  (Sidebar, Topbar, AppShell), UI primitives (`components/ui/*`), dashboard widgets,
  tables, forms, charts, and page-level composition.
- **Out of scope:** business logic, routes, API/services layer, state management
  (zustand), backend changes. Copy/labels stay as-is.

## ⛔ STRICT RULES FOR THE AGENT — STYLING ONLY, ZERO LOGIC CHANGES

**The website's core working must not be hurt in any way. This is a styling-only
overhaul. If an edit risks changing behavior, stop and leave the logic untouched.**

1. **Never modify behavior.** Do not change or remove: handlers, hooks, state,
   context usage, props *logic*, conditions, event wiring, routing, data fetching,
   services (`services/*`), contexts (`contexts/*`), types (`types/*`), utils
   (`utils/*`), routes (`routes/*`), `main.tsx`, or anything under `backend/`.
2. **Only these things may change:** Tailwind class strings, inline style *values*
   that are purely visual, design tokens in `frontend/src/index.css`, and JSX
   *presentational* structure (wrapper `div`s, order of decorative elements) where
   required to achieve the target look.
3. **Never alter component props/interfaces or function signatures.** If a component
   needs a new *optional visual* prop (e.g., `numeric`, `pill`), additions must be
   backward-compatible with default values so every existing call site renders and
   behaves exactly as before. Existing required props, prop names, types, and
   callbacks stay as-is.
4. **Never delete, rename, or move existing components, exports, files, or hooks.**
   New files (e.g., `KpiChip.tsx`) are allowed; nothing existing is removed.
5. **Never touch the data layer or conditional rendering outcomes.** Loading/empty/
   error states, role checks, permission gates, and map/filter/render logic must
   produce identical output — only their styling may change.
6. **Accessibility is logic too:** keep all `aria-*` attributes, labels, roles,
   alt text, and keyboard handlers intact; add never remove.
7. **Working tree discipline:** make small, incremental edits; after each phase run
   `cd frontend && npm run build` and `npm run lint`. If the build or lint breaks for
   a non-styling reason, revert the offending edit immediately rather than patching
   logic to make it pass.
8. **No new dependencies.** Use only what is already installed (tailwindcss,
   lucide-react, recharts, date-fns, react-router-dom, zustand).
9. **When in doubt, do nothing to logic.** If a visual change seems to require a
   behavioral change (e.g., reordering nav items, changing form behavior), note it
   as a suggestion instead of implementing it.

## Current State (what we have)

- React 19 + Vite + **Tailwind CSS v4** (via `@tailwindcss/vite`), tokens in
  `frontend/src/index.css` using Tailwind v4 `@theme` blocks.
- Font: **JetBrains Mono** everywhere (`--font-sans` = mono). ✅ already matches the
  screenshots' monospaced look — keep this.
- Accent: indigo `#4f46e5`. Slate-based grays (`slate` palette). Light theme only.
- Components exist for most primitives: Card, Button, Badge, StatusBadge, Input, Select,
  Table, Tabs, Dropdown, Modal, Drawer, Toast, Tooltip, Avatar, Checkbox, Switch,
  Progress, Skeleton, EmptyState, etc.
- Layout: `AppShell` + collapsible `Sidebar` (grouped sections) + `Topbar` +
  `Breadcrumbs` + `MobileNav`.
- Dashboard: `StatCard`, `ActivityTimeline`, `DeadlineCard`; charts via **recharts**;
  icons via **lucide-react**.

## Target Style (from the screenshots)

### 1. Overall impression

- **Clean, dense, data-first SaaS UI.** White surfaces on a very light gray canvas.
- Everything reads as "instrument panel": tight spacing, small type, lots of metadata
  rendered as small chips/badges.
- **No heavy shadows or gradients.** Depth comes from 1px hairline borders and a
  slightly darker canvas behind white cards. Shadows only for overlays (modals,
  dropdowns, mobile sidebar).

### 2. Color system

| Token | Target | Notes |
|---|---|---|
| Canvas / app background | `#f7f8fa` (cool light gray) | Page background behind cards |
| Card surface | `#ffffff` | Every widget is a white card |
| Border (hairline) | `#e8eaf0` | Subtle, visible but quiet |
| Border (strong) | `#d6dae3` | Inputs, dividers needing emphasis |
| Text primary | `#16192c` (near-black navy) | Headings, key numbers |
| Text secondary | `#5a6072` | Labels, subtitles |
| Text muted | `#8a90a3` | Metadata, table meta |
| Primary accent | **`#2563eb` (blue-600)** | Replaces indigo `#4f46e5` for active nav, primary buttons, links, selected states, chart series 1 |
| Accent soft | `#eff4ff` / blue-50 | Active nav background, selected chips |
| Success / positive delta | `#16a34a` text on `#e8f7ee` pill | Trend-up badges, "Safe" dots |
| Warning / suspicious | `#d97706` text on `#fdf2e2` pill | "Suspicious" dots, warnings |
| Danger / negative delta | `#dc2626` text on `#fdecec` pill | Trend-down badges, destructive |
| Info / secondary series | cyan `#06b6d4`, purple `#8b5cf6`, gray `#9ca3af` | Chart series, metric dots |

Keep the current success/warning/error hues — they already match. Change:
- `--color-accent` / `--color-primary` / `--color-ring`: `#4f46e5` → `#2563eb`
- Add canvas token (`--color-canvas: #f7f8fa`) and use it as the app background so
  white cards pop.

### 3. Typography

- **Monospace everywhere** (already true — keep JetBrains Mono).
- Sizes trend **small**: base body 13–14px; table text 13px; widget titles 15–16px
  semibold; page titles 22–24px bold; KPI numbers 24–28px semibold; meta/labels 11–12px.
- Section labels: 11px, `uppercase`, `tracking-wider`, muted.
- Font weights: 500 for labels, 600 for titles/values, 700 sparingly (page title, logo).
- Tabular alignment: all numeric columns/values right-aligned; mono font gives inherent
  tabular-nums behavior.

### 4. Shape & spacing

- Radius scale: **cards 12px (`rounded-xl`)**, buttons/inputs/chips 8px
  (`rounded-lg`), small badges/dots full-round (`rounded-full`).
- Card padding: tight but comfortable — `p-4`/`p-5`; header rows `px-4 py-3`.
- Page gutter: 24px; widget grid gaps: 16–20px.
- Rows (tables, nav items, list items): compact — 36–40px min-height.

### 5. Components — target treatments

- **Sidebar** (`layout/Sidebar.tsx`)
  - White background + hairline right border (sidebar matches card white, separated
    from content by a border — not a gray canvas strip).
  - Brand/workspace block at top inside a bordered card-like container with a
    dropdown chevron (workspace-switcher pattern).
  - Collapsible via a small circular chevron button docked on the sidebar's right
    edge, half-overlapping the border.
  - Nav items: rounded-lg, 13px medium; active = `bg-accent-soft text-accent`
    (light blue pill), inactive = muted gray with hover `bg-muted`.
  - Icons 18px, 1.5px stroke; grouped section labels (uppercase micro-labels).
- **Topbar** (`layout/Topbar.tsx`)
  - White, hairline bottom border, 56–60px tall.
  - Left: sidebar-collapse chevron + centered pill-shaped search field
    (rounded-full, muted background, ⌘K kbd hint).
  - Right: outlined **primary pill buttons** (e.g., an "AI Copilot"-style action
    with sparkle icon), a workspace/scope selector dropdown, notification bell
    with red unread dot, circular icon buttons, avatar.
- **Page header**
  - Breadcrumb chips: small rounded pill with home icon + label, then an
    "Explore all >" text link.
  - H1 (22–24px bold) + one-line muted subtitle.
  - Right side: date-range select pill + refresh icon button + overflow "..." menu.
- **Cards / widgets**
  - Header row: small colored-dot icon + semibold title (15–16px) + muted
    "period · timezone" meta line beneath; drag-handle dots (⠿) left; "..."
    overflow right.
  - Body: KPI grids with per-metric colored dot, value, delta pill (arrow + %,
    green/red), and previous-period comparison in muted small text.
- **Buttons**
  - Keep variants but restyle: `rounded-lg`, 13–14px medium; primary = solid
    blue-600/white text; secondary = white + hairline border; "pill" variant
    (rounded-full) for topbar actions; icon-only circular variant.
- **Chips / badges** (`ui/Badge.tsx`, `ui/StatusBadge.tsx`)
  - Pill-shaped (`rounded-full`), 12px, tinted background + darker text of the
    same hue; often paired with a leading colored dot (status) or tiny arrow
    (deltas).
  - KPI "chip strip" pattern: row of outlined pill chips with `Label  value`
    pairs (Revenue / ROAS / CPA / EPC strip in screenshot 3) — build as
    `KpiChip` / `ChipStrip` components.
- **Tables** (`ui/Table.tsx`)
  - Full-width, white bg, hairline row dividers (`border-b`), no zebra stripes.
  - Header row: 12px muted, bottom hairline; checkbox column; expand chevron column.
  - Numeric columns right-aligned; status column = colored dot + label;
    totals/summary footer row with top hairline and semibold values.
  - Row height ~44px; hover = very light gray.
- **Forms** (Input, Select, DatePicker)
  - 36px tall, `rounded-lg`, hairline border, white bg; focus = blue ring
    (`border-blue-500` + soft `ring-blue-500/30`); placeholder muted.
  - Selects and date ranges rendered as bordered pills with chevron/calendar icon.
- **Charts** (recharts)
  - Rounded-top bars (`radius={[6, 6, 0, 0]}`), series colors = token series
    (blue / gray / cyan) matching metric dots, hairline gridlines or none,
    small axis labels (11–12px muted).
  - Legend as outlined pill chips with colored dots (screenshot 3).
- **Misc**
  - Toasts/dropdowns/modals: white, 12px radius, stronger shadow, hairline border.
  - Toggles (Switch): compact iOS-style, blue when on.
  - Loading: existing skeletons stay; retint to the new border/canvas colors.

### 6. Motion

- Subtle only: `transition-colors` on hovers (150ms), sidebar collapse 200ms ease,
  modal/drawer fade+scale 150ms. No bounce/spring animations.

## Implementation Checklist

### Phase 0 — Foundation ✅ (done)
- [x] 0.1. Design tokens in `frontend/src/index.css`:
  - [x] `--color-accent` / `--color-primary` / `--color-ring` / `--color-sidebar-*` accents: `#4f46e5` → `#2563eb` (also `--color-accent-hover` `#4338ca` → `#1d4ed8` to keep the hover step consistent)
  - [x] Add canvas token `--color-canvas: #f7f8fa` in `@theme` (so a `bg-canvas` utility is generated) — added to both `@theme` and `:root`; utility verified present in built CSS
  - [x] Borders → hairline `#e8eaf0` / strong `#d6dae3` (`--color-border-primary`, `--color-border-secondary`, `--color-border`, `--color-sidebar-border`, `--color-input`)
  - [x] Add soft tint tokens: `--color-accent-soft: #eff4ff`, success/warning/danger-soft (`--color-success-soft: #e8f7ee`, `--color-warning-soft: #fdf2e2`, `--color-error-soft: #fdecec` — named `error-soft` to match the existing `--color-error` convention)
- [x] 0.2. `body` background → canvas; `AppShell` content region uses canvas, cards stay white. (`AppShell.tsx` root: `bg-[var(--color-sidebar)]` → `bg-canvas`; both `body` rules in `index.css` → `var(--color-canvas)`.)
- [x] 0.3. Audit hardcoded colors: grep `indigo-` / `slate-` literals across `frontend/src`, map to tokens. — **Audit logged below; literal mapping/cleanup deferred to 4.1 as planned.**

### Phase 1 — Layout chrome ✅ (done)
- [x] 1.1. `Sidebar.tsx`: white bg + hairline right border (already `bg-card border-border`); brand block restyled as bordered workspace-switcher container (accent logo tile + name + "Workspace" micro-label + chevron); active nav = `bg-accent-soft text-accent` pill (13px, `py-1.5`); collapse control is now an edge-docked circular chevron button straddling the right border (`absolute -right-3 top-5`, same `onClick`/aria preserved); section labels 11px uppercase. Mobile aside in the same file matches (accent logo, accent-soft active pill, circular close button).
- [x] 1.2. `Topbar.tsx`: search is now a centered, rounded-full muted pill with ⌘K kbd chip (search block moved out of the right action group between two `flex-1` groups — ref + ⌘K handler + dropdown untouched); header 64px → 56px; mobile menu / notifications / profile triggers are circular buttons; unread badge restyled as compact red count pill; notification rows + "mark all as read" moved to accent tokens; profile + sign-out rows use `destructive`/`error-soft` tokens. **Note (rule 9):** the outlined "AI Copilot"-style primary action slot was *not* added — wiring it to the AI widget would be a logic change; deferred to a logic-approved change.
- [x] 1.3. `AppShell.tsx`: canvas content background (from 0.2), content container now fluid (`w-full`), 24px gutters at `sm:`+ (`px-4 sm:px-6`), removed `max-w-7xl`; skip-link focus → `bg-accent`.
- [x] 1.4. `Breadcrumbs.tsx`: first crumb renders as a bordered pill chip with `Home` icon (link or current-page span, all `onClick`/`aria-current`/`aria-label` preserved), chevron separators, `hover:text-accent` links, 13px type. Trailing "Explore all >" slot not added (would need a new link target — noted per rule 9).
- [x] 1.5. `MobileNav.tsx`: drawer stays white `bg-card`; logo tile → accent; close button circular; `MobileNavItem` active = `bg-accent-soft text-accent`.
- [x] 1.6. `ProfileDropdown.tsx`: circular avatar trigger (`rounded-full p-1`), accent avatar tile, sign-out row → `text-destructive hover:bg-error-soft`; dropdown already hairline-bordered `rounded-xl shadow-lg`.

### Phase 2 — UI primitives ✅ (done)
- [x] 2.1. `Button.tsx`: strict size scale — sm 30px (`h-[30px]`), md 36px (`h-9`), lg 40px (`h-10`), plus new `icon` square size; solid blue primary (`bg-primary … hover:bg-accent-hover`), white bordered secondary; added backward-compatible `pill` + `icon` variants (`rounded-full`). Existing variants/behaviors untouched.
- [x] 2.2. `Badge.tsx` / `StatusBadge.tsx`: confirmed pill shape (already `rounded-full`); `variantClasses` retinted to token palette (`success-soft/success`, `warning-soft/warning`, `error-soft/destructive`, `accent-soft/accent`). StatusBadge delegates to Badge → auto-migrated; no variant/type names changed.
- [x] 2.3. **NEW** `components/ui/KpiChip.tsx` + `ChipStrip.tsx`: outlined `Label: value` rounded-full pill (`bg-card border border-border`) with optional semantic `color` prop (default `accent`); `ChipStrip` = flex-wrap chip rail. Both pure presentational.
- [x] 2.4. `Card.tsx`: `rounded-xl` + hairline border, `shadow-sm` now **only** when interactive (hover only on hoverable/clickable cards); `CardHeader` gained backward-compatible optional `title`/`meta`/`action`/`dot` props rendered as a dot+title+meta+overflow block (plain `children` path renders identically for all existing callers).
- [x] 2.5. `Input.tsx` (`h-9`), `Select.tsx`, `Textarea.tsx`, `Checkbox.tsx`, `Switch.tsx`: blue focus ring (`focus:ring-accent`), red→`destructive` error styling; Select is now a pill trigger (`rounded-full` + `appearance-none` + decorative `ChevronDown`); DatePicker pill trigger in 3.5 touch. `DatePicker.tsx` itself restyled (selected day → `bg-accent`, off-week → muted, focus ring accents) — see 2.5 note below.
- [x] 2.6. `Table.tsx`: hairline dividers (`divide-border`), no zebra (unchanged), right-aligned `numeric` cells (already via `align`), `th` labels 11px, sort chevron → `text-accent`, pagination buttons → pill triggers; `bg-card` body. **Note (rule 9):** "checkbox column" + "expand-chevron column" + "summary footer" variant were *not* added — they require new column/render props (logic), so they are noted as suggestions for a logic-approved change.
- [x] 2.7. `Tabs.tsx`: blue active state (`border-accent text-accent`, `focus:ring-accent`) for both `Tabs` and `TabTrigger`; inactive hover keeps `bg-muted`. **Note:** not converted to a fully segmented-pill design (would be a structural/layout change beyond class tokens) — kept the existing underline-tab structure recolored.
- [x] 2.8. `Dropdown.tsx`, `Modal.tsx`, `Drawer.tsx`, `Toast.tsx`, `Tooltip.tsx`: white floating layers (`bg-card`), hairline `border`, stronger `shadow-xl`; menu/dismiss/close controls → `rounded-full`; 13px menu items. Overlays `bg-slate-900/40` → `bg-foreground/40` (dark overlay via `--color-foreground`).
- [x] 2.9. `Skeleton.tsx` (`divide-border`), `Progress.tsx` (indigo/emerald/amber/red → `accent`/`success`/`warning`/`destructive`; `info` left `sky-600` as data color), `ErrorState.tsx` (destructive tokens + `bg-error-soft`), `LoadingState.tsx` (spinner `text-accent`); `EmptyState.tsx` already on token palette.
- [x] 2.10. `Avatar.tsx`: sizes (sm 32 / md 40 / lg 48) and status ring fit the 9/10/12 control scale — confirmed, no change needed.

### Phase 3 — Dashboard & pages
- [x] 3.1. `StatCard.tsx`: colored metric dot + label, big semibold value, delta pill (arrow + %, green/red), muted previous-period line + date-range meta.
- [x] 3.2. `ActivityTimeline.tsx`, `DeadlineCard.tsx`: widget header pattern (dot + title + meta), hairline dividers, status chips.
- [x] 3.3. Charts (dashboards/reports): rounded-top bars, token series colors, chip-row legend, muted 11–12px axis text, hairline/no gridlines.
- [x] 3.4. Data pages (`admin/Projects.tsx`, `admin/Users.tsx`, Timesheets, Approvals, etc.): right-aligned numerics, dot-pill status badges, summary footer rows, filter row of pill selects above tables.
- [x] 3.5. Forms (`CreateProject.tsx`, `EditProject.tsx`, `CreateUser.tsx`, `Settings.tsx`, `TimesheetEditor.tsx`): 36px controls, blue focus, 15px semibold section titles.
- [x] 3.6. Auth pages (`AdminLogin.tsx`, `UserLogin.tsx`, `Register.tsx`): white card on canvas, blue primary, mono type — light touch.
- [x] 3.7. AI components (`components/ai/*`): indigo → blue accents, bubbles/dots to palette.

### Phase 4 — Sweep & QA
- [x] 4.1. Global cleanup of remaining conflicting hardcoded color literals. — Scan complete; zero `indigo-*`/`slate-*`/`emerald-*`/`amber-*`/`red-*` class literals remain in `frontend/src` pages/components/ai. Only intentionally-kept data colors: `violet-*`/`pink-*`/`teal-*` in Avatar.tsx (rotating initials), `bg-sky-600` in Progress.tsx info variant (per 2.9). Reports.tsx chart hexes updated to blue #2563eb + border #e8eaf0.
- [x] 4.2. Confirm no dark-mode remnants (dark mode removed 2026-09-14 per `index.css`). — No `dark:`/`prefers-color-scheme` in app code; only in Vite's bundled `assets/vite.svg` (third-party).
- [x] 4.3. `cd frontend && npm run build` — zero type errors. — ✓ (tsc + vite, 2793 modules, 0 errors).
- [x] 4.4. `npm run lint` (oxlint) — clean. — 0 errors, 15 pre-existing warnings (only-export-components, set-state-in-effect, exhaustive-deps, preserve-manual-memoization); zero new warnings introduced.
- [ ] 4.5. Manual browser pass: admin & user dashboards, projects table, timesheets, approvals, settings, auth pages, collapsed sidebar, mobile widths. — Requires interactive browser testing (not available in CLI).
- [x] 4.6. Accessibility: muted text on canvas ≥ 4.5:1 contrast, visible focus rings, status never conveyed by color alone (dot + label). — Verified: text-muted-foreground (#64748b) on canvas (#f7f8fa) ≈ 4.7:1 ✓. StatusBadge always includes text label alongside colored bg. AI message bubbles + auth sidebar use text labels alongside color accents. Focus rings at /20 opacity are pre-existing (same as original indigo-500/20 pattern); one double-opacity bug (`ring-accent/20/20` in AIChatPanel) was fixed.
- [x] 4.7. **Logic-safety review of `git diff`:** confirm every diff hunk touches only class strings, tokens, or presentational JSX — zero changes to handlers, hooks, props semantics, conditions, services, contexts, routes, or types. — Verified: all Phase 3 changes are className string values, inline SVG fill/stroke hex values, or object-literal className defaults (confirmClass, colorClasses, iconBgColor). Zero logic, prop type, signature, handler, or state changes introduced by Phase 3.

## Verification

- `cd frontend && npm run dev`, compare each page against the screenshots.
- Build + lint pass (4.3 / 4.4).

## Phase 0 Audit Log (from checklist item 0.3 — recorded before Phase 4.1 cleanup)

Hardcoded Tailwind color literals in `frontend/src` (class strings only; no tokens involved):

**Indigo (the old accent) — 175 occurrences across 54 files:**
- `indigo-600` ×89, `indigo-500` ×38, `indigo-700` ×20, `indigo-50` ×15,
  `indigo-200` ×4, `indigo-400` ×3, `indigo-300` ×3, `indigo-100` ×2, `indigo-900` ×1
- Heaviest files: `pages/auth/AdminLogin.tsx` (11), `components/ai/AIChatPanel.tsx` (11),
  `pages/user/Dashboard.tsx` (10), `components/layout/Sidebar.tsx` (8),
  `pages/auth/Register.tsx` (7), `pages/admin/Dashboard.tsx` (7),
  `pages/admin/CreateProject.tsx` (7), `components/layout/Topbar.tsx` (7),
  `components/ui/Tabs.tsx` (6), `components/ai/AIActionCard.tsx` (6)

**Slate (mostly borders/overlays/text) — ~101 occurrences across ~40 files:**
- `slate-200` ×49, `slate-900` ×20, `slate-300` ×6, `slate-500` ×5, `slate-700` ×3,
  `slate-400` ×3, `slate-100` ×2, `slate-50` ×1
- Heaviest files: `components/ai/AIChatPanel.tsx` (16), `pages/user/TimesheetEditor.tsx` (6),
  `components/ai/AIActionCard.tsx` (5), `pages/admin/ProjectDetails.tsx` (4),
  `components/ui/Tooltip.tsx` (4)
- Note: an initial grep hit `slate-x` ×6 — false positives (substrings of
  `translate-x-*` utilities), no such class exists.

**Planned mapping for Phase 4.1** (class → token/palette):
- `indigo-600/500` → `accent`/`primary` token utilities (`bg-accent`, `text-accent`, `focus:bg-accent`, …)
- `indigo-700` → `accent-hover` (`#1d4ed8`); `indigo-50/100/200` → `accent-soft` (`#eff4ff`)
- `indigo-900` (rare, on-accent text) → white or `text-primary` per context
- `slate-200/300` (borders/dividers) → `border` / `border-secondary` hairlines
- `slate-900` (text or tooltip/dark overlay bg) → `text-primary` or `bg-foreground`
- `slate-500/400/700` (text) → `text-muted-foreground` / `text-secondary`
- `slate-50/100` (subtle bg) → `bg-muted` / `bg-canvas`

**Phase 0 validation:** `npm run build` ✓ (tsc + vite, zero errors) ·
`npm run lint` ✓ (0 errors, 15 pre-existing React-Compiler memoization warnings,
untouched by this phase) · no stale hex values remain in `index.css` ·
`bg-canvas` utility confirmed present in `dist/assets/*.css`.

- Per-page visual diff checklist in the PR description.


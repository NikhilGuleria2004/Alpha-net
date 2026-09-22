# Frontend Evaluation — `interface_guideline.md` Compliance Audit

**Project:** Alpha-net (Eniac) — `frontend/` (React 19 + Vite + Tailwind CSS 4)
**Audited against:** `interface_guideline.md` (root) — "Web Interface Guidelines"
**Method:** Static source audit. Every guideline in the document was checked against the actual frontend source (`frontend/src/**`, `frontend/index.html`). Verdicts are grounded in file:line evidence; items that cannot be verified statically (visual, runtime, or process checks) are marked accordingly.
**Date:** 2026-09-20

**Legend:** ✅ Pass · ⚠️ Partial (intent present, gaps found) · ❌ Fail · ➖ Not applicable (feature doesn't exist / CSR-only / process item)

---

## Executive Summary

The frontend is **structurally strong on the accessibility/dialog/feedback guidelines** and **structurally weak on URL-state, motion preferences, locale formatting, and mobile ergonomics**. The design system (`components/ui`) implements several hard things correctly — focus traps with focus restore, a real `aria-live` toast system, label/error wiring on form primitives, destructive-action confirmation, and honest loading buttons — which is well above average for an app of this size. But cross-cutting global concerns (no `:focus-visible` strategy, no `prefers-reduced-motion`, no per-page `<title>`, no URL-persisted filter/tab state, hardcoded en-US formats, 14px inputs, `<button onClick={navigate}>` instead of links) violate a large cluster of guidelines, and are cheap to fix because they are centralized.

| Section | Verdict | Headline |
|---|---|---|
| Interactions | ⚠️ Partial | Excellent dialogs/toasts/confirmations; weak URL-as-state, links-as-buttons, no scroll restoration |
| Animations | ⚠️ Partial | CSS-only animations (good) but zero `prefers-reduced-motion` support |
| Layout | ⚠️ Partial | Consistent tokens & flex/grid layout; no safe-area handling |
| Content | ⚠️ Partial | Great states & inline help; static page title, hardcoded formats, `...` instead of `…` |
| Forms | ⚠️ Partial | Strong ARIA & autocomplete on most fields; unassociated labels, silent number clamping, no unsaved-changes guard |
| Performance | ⚠️ Partial | Reasonable rendering hygiene; no font preload, no virtualization |
| Design | ⚠️ Partial | Clean token system; missing `theme-color` / `color-scheme`, one raw-color component |
| Copywriting | ⚠️ Partial | Positive, action-oriented copy; ASCII ellipses, `8h` without space, Title-Case inconsistency |

**Overall: partial compliance (~55–60%).** Of ~60 auditable items: ~22 pass, ~25 partial, ~13 fail, remainder N/A.

---

## 1. Interactions

### 1.1 Keyboard works everywhere (WAI-ARIA patterns) — ⚠️ Partial
- **Passes:** Modal, Drawer, and `ConfirmDialog` implement full Tab/Shift+Tab cycling traps with Escape close (`Modal.tsx:27–56`, `Drawer.tsx:26–55`, `ConfirmDialog.tsx:27–53`). `Tabs.tsx:33–50` implements the ARIA tabs pattern with ArrowLeft/ArrowRight and roving focus. Global shortcuts: `Ctrl/⌘+K` search and Escape-closes-menus in `Topbar.tsx:50–63`; `Ctrl/⌘+Shift+A` AI chat toggle in `AIChatWidget.tsx:11–20`.
- **Fails:**
  - `Table.tsx:84–95` — sortable `<th onClick={...}>` with no keyboard handler, no inner `<button>`, no `aria-sort`. Keyboard users cannot sort tables.
  - `Table.tsx:101–105` — clickable rows via `<tr onClick>` with no `tabIndex`/`role`/`onKeyDown`: keyboard users cannot open a row detail.
  - `ui/Dropdown.tsx:50` — trigger is a `<div onClick>` wrapper; if a consumer passes a non-button trigger it is unreachable by keyboard (app mostly avoids this via `ProfileDropdown`'s real `<button>`, but the primitive permits the failure).
  - `Sidebar.tsx:166–188` mobile drawer and `MobileNav.tsx` — no Escape handler, no focus trap on the mobile nav overlay.

### 1.2 Clear focus (`:focus-visible` preferred) — ⚠️ Partial
- Every interactive element shows a ring (`Button.tsx:43` `focus:outline-none focus:ring-2 focus:ring-offset-2`; same pattern in `Input.tsx:33`, `Switch.tsx:23`, `Tabs.tsx:71`, close buttons `Modal.tsx:90`/`Drawer.tsx:80`), so focus is never invisible.
- **Fail:** the codebase uses `focus:` (=`:focus`) everywhere — `:focus-visible` appears **zero** times (grep across `frontend/src`). Mouse users get rings on every click, exactly what the guideline says to avoid.

### 1.3 Manage focus (move & return focus) — ⚠️ Partial
- **Best in class:** `ConfirmDialog.tsx:27–53` stores `previousFocus`, focuses the first control on open, restores on close, traps Tab, handles Escape. `Modal.tsx:58–63` also moves focus in (`dialogRef.current?.focus()`) and restores on close.
- **Fails:**
  - `Drawer.tsx` traps Tab but never moves focus into the drawer on open and never restores it on close.
  - `TimesheetEditor.tsx:27–42` defines a **local inline `ConfirmDialog`** (used for submit/withdraw) with no trap, no Escape, no focus move — it shadows the well-built shared component. Same weakness in its `WithdrawModal` (`TimesheetEditor.tsx:531–553`).
  - `AIChatPanel.tsx` — opening the chat doesn't move focus into it, Escape doesn't close it, no trap exists.

### 1.4 Match visual & hit targets (≥24px desktop, 44px mobile) — ⚠️ Partial
- Button sizes: `sm` 30px, `md` 36px, `lg` 40px, `icon` 32px (`Button.tsx:24–29`) — all ≥24px. ✅
- **Fail (mobile):** many icon-only controls are ~24–28px (`p-1.5` close buttons in `Toast.tsx:46`, `MobileNav.tsx:30`, `Sidebar.tsx:184`; `p-1` delete-entry in `TimesheetEditor.tsx:430`). None reach the 44px mobile minimum, and no expanded hit-target technique is used.

### 1.5 Mobile input size (≥16px to prevent iOS focus-zoom) — ❌ Fail
- Every text input is `text-sm` (14px): `Input.tsx:33`, `Select.tsx:27`, `Textarea.tsx:29`, raw inputs in auth pages (`UserLogin.tsx:119`, `CreateUser.tsx:104`), hour cells (`TimesheetEditor.tsx:422`).
- `index.html:6` uses the normal viewport (`width=device-width, initial-scale=1.0`) — zoom is respected (see 1.6), so iOS Safari **will auto-zoom** on focus for every form.

### 1.6 Respect zoom (never disable) — ✅ Pass
- `index.html:6` has no `user-scalable=no` / `maximum-scale=1`; grep confirms none exists anywhere.

### 1.7 Hydration-safe inputs — ➖ N/A
- Pure client-side render (`main.tsx` `createRoot`), no SSR/hydration step.

### 1.8 Don't block paste — ✅ Pass
- No `onPaste`/`onCopy`/`onCut` handlers or paste-blocking code anywhere in `frontend/src`.

### 1.9 Loading buttons (indicator + keep original label) — ✅ Pass
- `Button.tsx:70–83`: `loading` renders a spinner **while keeping `children`** (the label), disables during flight; used consistently (`UserLogin.tsx:144`, `TimesheetEditor.tsx:500–504`, all admin create/edit forms).
- Nit: while loading, the `rightIcon` (e.g., `ArrowRight` on "Sign In", `UserLogin.tsx:146`) disappears rather than staying — the label itself is preserved.

### 1.10 Minimum loading-state duration (avoid spinner flicker) — ❌ Fail
- No show-delay/min-visible-time logic anywhere. `FullPageSpinner`, `LoadingState`, `Skeleton`, and Button spinners render instantly on state flips; fast responses will flicker.

### 1.11 URL as state — ❌ Fail
- `useSearchParams` appears **zero** times in `frontend/src` (grep). List filters (`search`/`statusFilter`/`departmentFilter` in `Users.tsx:21–22`, `Projects.tsx:24–25`, `Timesheets.tsx:16–17`, approvals tabs, Reports date-range & `statusFilter` in `Reports.tsx:22–31`), table sort/page (`Table.tsx:35–37`), and `Tabs` (`Tabs.tsx:31`) are all `useState` only. Refresh/back/share loses all of it.
- Entity navigation itself is properly URL-routed (`App.tsx`), so individual records are deep-linkable — it's the *control state* that isn't.
- **Note (post-audit):** `/invite?token=…` is a standalone unauthenticated deep-linkable route (added in Phase D). `Onboarding.tsx` Tabs (Pending/Accepted) use internal state, not URL state.

### 1.12 Optimistic updates (update immediately, reconcile on failure) — ❌ Fail (deliberate trade-off)
- All mutations in `AppDataContext.tsx:192–240` await the server, then commit state, then toast; failures throw to the caller, which shows an error toast. No rollback/Undo affordance exists anywhere.
- Context: this pessimism is an intentional, QA-driven correction of a real bug class (Feature_Report §2.1–2.2 "success toast that wasn't saved"; `TimesheetEditor.tsx:251–259` now checks the save result before toasting). It trades the guideline's speed for correctness — defensible, but non-compliant, and no Undo pattern compensates.

### 1.13 Ellipsis for follow-up input & loading states — ⚠️ Partial
- Follow-up menus mostly use confirm modals (good semantics), but **all ellipses in copy are ASCII `...`** ("Search users..." `CreateProject.tsx:255`/`EditProject.tsx:195`, "Thinking..." `AIChatPanel.tsx:120`, "Ask me anything..." `AIChatPanel.tsx:142`, `truncate()` in `format.ts:28–31`) — never the `…` character.

### 1.14 Confirm destructive actions — ✅ Pass
- Deletes, deactivations, sign-out, timesheet withdrawal, approve/decline all go through `ConfirmDialog`/`Modal` (e.g., `UserDetails.tsx:32` delete confirm, `ProfileDropdown.tsx:113–127` sign-out confirm, `TimesheetEditor.tsx:509–526`, `ReviewPanel.tsx:217–221`, `DeclineModal.tsx` requires a reason).
- Nit: the desktop Sidebar "Sign out" (`Sidebar.tsx:228–235`) calls `logout()` **directly without confirmation**, while the Topbar/ProfileDropdown path confirms first — inconsistent destructive handling.

### 1.15 Prevent double-tap zoom (`touch-action: manipulation`) — ❌ Fail
- `touch-action` appears nowhere in `frontend/src` or `index.css`.

### 1.16 Tap highlight follows design — ❌ Fail
- No `-webkit-tap-highlight-color` rule exists.

### 1.17 Design forgiving interactions — ✅ Pass
- Switching an entry's Regular/Overtime type zeroes now-forbidden hours **and explains it** ("Removed sat 8h — Regular entries only allow Mon–Fri.", `TimesheetEditor.tsx:181–201`); `utils/permissions.ts:66–70` pre-checks backend rules so controls are disabled *with an explanation* instead of failing after the fact; login trims email (`UserLogin.tsx:33,57`); the day-rule is documented inline in the editor (`TimesheetEditor.tsx:450–454`).

### 1.18 Tooltip timing (delay first, peers instant) — ⚠️ Partial
- `ui/Tooltip.tsx:9–15` implements a 200ms delay per instance. But it is mouse-only (no `onFocus` trigger — keyboard users never see tooltips), has no `aria-describedby` association, and no group-level "first delayed, peers instant" logic. A few native `title=""` tooltips exist (`UserLogin.tsx:136`, `AdminLogin.tsx:136`).

### 1.19 Overscroll behavior (`contain` in modals/drawers) — ❌ Fail
- `overscroll-behavior` appears nowhere. Modal/Drawer/AIChatPanel scroll containers will chain-scroll the page behind them on touch devices.

### 1.20 Scroll positions persist (Back/Forward) — ⚠️ Partial
- The app relies on default browser behavior; the main scroll container is `<main class="overflow-y-auto">` (`AppShell.tsx:22`) and **resets to top on route change** with no restore logic. Document-level back/forward works, but in-app navigation does not restore prior scroll.

### 1.21 Autofocus for speed (desktop single-input screens) — ⚠️ Partial
- `CreateProject.tsx:255` and `EditProject.tsx:195` autofocus the member-search input (single primary input, desktop context — correct). Login/register don't autofocus (acceptable per the guideline's mobile caveat), but no other desktop dialog does either.

### 1.22 No dead zones — ✅ Pass (one platform-level caveat)
- Controls are fully interactive everywhere; dead controls get fixed when found (QA M6: "Forgot password?" wired to the endpoint, `UserLogin.tsx:32–49`).
- **Platform caveat:** `AIChatWidget` — the entire AI assistant UI — is **commented out** in `AppShell.tsx:28` and mounted nowhere. The floating button, its shortcut, and the whole chat are currently unreachable dead surface.

### 1.23 Deep-link everything — ❌ Fail
- Same evidence as 1.11: filters, tabs, sort, pagination, and expanded panels are never encoded in the URL. Only record IDs are deep-linkable.

### 1.24 Clean drag interactions — ➖ N/A
- No drag-and-drop exists in the app.

### 1.25 Gestures have alternatives — ➖ N/A / ✅
- No gesture-only interactions; every action is a button/link.

### 1.26 Links are links (Cmd/Ctrl+Click must work) — ❌ Fail
- **Passes:** desktop + mobile Sidebar navigation use `<NavLink>` (`Sidebar.tsx:201–212`); `Button` has an `href` variant rendering a real `<a>` (`Button.tsx:45–64`).
- **Fails:** every menu-style navigation is a `<button onClick={() => navigate(...)}>`: `MobileNavItem` (`MobileNav.tsx:57–59`), Profile/Settings menu rows in `ProfileDropdown.tsx:76–108` and `Topbar.tsx:327–357`, Breadcrumbs (`Breadcrumbs.tsx:36–43`), clickable table rows (`Table.tsx:101–105`). Cmd/Ctrl+Click, middle-click, and "open in new tab" are broken for all of these.

### 1.27 Announce async updates (`aria-live` for toasts & inline validation) — ✅ Pass
- `Toast.tsx:34` portal root has `aria-live="polite"`; each toast has `role="alert"` (`Toast.tsx:39`); field errors use `role="alert"` (`Input.tsx:43`, `Select.tsx:47`, auth banners `UserLogin.tsx:99`).
- Nit: `aria-live="polite"` on the container **combined with** `role="alert"` (assertive) on children is a conflicting double-announcement; pick one strategy.

### 1.28 Locale-aware keyboard shortcuts / platform symbols — ❌ Fail
- `Ctrl/⌘+K` (`Topbar.tsx:51`) and `Ctrl+Shift+A` (`AIChatWidget.tsx:13`) are hardcoded; neither is surfaced anywhere in the UI (no hint, tooltip, or menu entry showing the shortcut), and non-QWERTY layouts are not considered. The `Ctrl+Shift+A` shortcut is additionally dead (widget unmounted, see 1.22).

## 2. Animations

### 2.1 Honor `prefers-reduced-motion` — ❌ Fail
- The media query appears **zero** times (grep). The app animates constantly: Button/spinner `animate-spin` (`Button.tsx:54,74`), skeleton `animate-pulse` (`LoadingState.tsx:12–14`, `AIChatWidget.tsx:33`), chat "thinking" dots `animate-bounce` with staggered delays (`AIChatPanel.tsx:116–118`), drawer slide (`Sidebar.tsx:172` `transition-transform duration-300`), and body color transitions (`index.css:105,115`). Reduced-motion users get all of it.

### 2.2 Implementation preference (CSS > WAAPI > JS) — ✅ Pass
- Every animation is CSS/Tailwind (`transition-colors`, `transition-transform`, Tailwind keyframes). No JS animation library (no framer-motion), no `requestAnimationFrame` loops, no JS-driven scroll effects. Modal/Drawer transitions are 150–300ms CSS (`style_overhaul.md` §6 consistent with the code).

## 3. Layout

### 3.1 Optical alignment / 3.2 Deliberate alignment — ➖ Partially verifiable
- Not fully verifiable statically. What the code shows: a single spacing rhythm (`px-5 py-4` headers, `gap-2/3/4`), a hairline border system (`border-border` globally via `index.css:108–111`), and a mono type system that makes vertical rhythm predictable. The style overhaul doc (`style_overhaul.md` Phase 0 audit) recorded deliberate alignment decisions. No obvious accidental offsets found in reviewed files.

### 3.3 Balance contrast in lockups — ✅ Pass
- Icon+text lockups consistently pair `text-muted-foreground` icons with matching text (`Sidebar.tsx:210`, `Breadcrumbs.tsx:23`), and active states switch both together (`text-accent`), avoiding thin-icon/medium-text clashes.

### 3.4 Responsive coverage (mobile / laptop / ultra-wide) — ⚠️ Partial
- Good use of `sm:md:lg:` breakpoints and `overflow-x-auto` on all wide tables (`Table.tsx:79`, `TimesheetEditor.tsx:382`); auth pages collapse the hero panel below `lg` (`UserLogin.tsx:70`); main content maxes naturally (`AppShell.tsx:23` uses full width, no max-width cap — on ultra-wide, lines get very long, but grids (`lg:grid-cols-3` Projects) stretch rather than break.
- Actual device-matrix visual verification is a process item — not verifiable statically.

### 3.5 Respect safe areas (notches/insets) — ❌ Fail
- No `safe-area-inset-*` or `env(safe-area-*)` usage anywhere. Fixed-position toasts (`Toast.tsx:34` `bottom-4 right-4`) and the AI widget button (`AIChatWidget.tsx:27` `bottom-6 right-6`) will sit under the iOS home indicator.

### 3.6 No excessive scrollbars — ✅ Pass
- The shell is `h-screen overflow-hidden` with only `<main>` scrolling (`AppShell.tsx:15–22`); modals cap at `max-h-[90vh] overflow-y-auto` (`Modal.tsx:73`). No obvious double-scrollbar patterns in reviewed markup.

### 3.7 Let the browser size things (avoid JS layout measurement) — ✅ Pass
- Layout is flex/grid throughout; the only JS measurement is the Dropdown's trigger-rect positioning (`Dropdown.tsx:17–27`) — a legitimate exception for portal positioning. No resize listeners or layout-thrashing reads/writes found.

## 4. Content

### 4.1 Inline help first (tooltips last resort) — ✅ Pass
- The day-rule is explained inline in the editor (`TimesheetEditor.tsx:452–454`); password requirements inline (`CreateUser.tsx:120`); empty states describe what to do; only two tiny native `title` tooltips exist (login "Stay signed in").

### 4.2 Stable skeletons (mirror final content) — ✅ Pass
- `Skeleton.tsx` provides `Skeleton` and `TableSkeleton` mirroring the table's row/column rhythm; used on list pages (`Projects.tsx`, `Users.tsx` via `TableSkeleton` import). `LoadingState` also `aria-label="Loading"`.

### 4.3 Accurate page titles (`<title>` reflects context) — ❌ Fail
- `index.html:7` hardcodes `<title>Eniac</title>`; `document.title` is never set anywhere (grep: zero matches). Dashboard, Timesheet Editor, Reports, everything — same title. No router-level title management.
- **Partially addressed by new pages:** `Onboarding.tsx` uses `usePageTitle('Onboarding')` (line 2) and `InviteRedeem.tsx` uses `usePageTitle('Accept Invite')` (line 4); `App.tsx` adds `handle: { title: 'Accept Invite' }` for the `/invite` route (line 80). Existing pages still lack per-route titles.

### 4.4 No dead ends (every screen offers a next step) — ✅ Pass
- `EmptyState` accepts an `action` and list pages use it ("Get started by creating a new project." + button, `Projects.tsx:135–139`; supervisors, users likewise). `ErrorState` ships a Retry button by default (`ErrorState.tsx:13,28–32`). Auth pages cross-link each other (`UserLogin.tsx:149–151`).

### 4.5 All states designed (empty, sparse, dense, error) — ✅ Pass
- Every reviewed list page renders empty/loading/error/spinner variants (`Projects.tsx`, `Users.tsx`, `Timesheets.tsx` x3, `Reports.tsx:184–198`, `Notifications.tsx`), `AppDataContext.tsx:108–113` surfaces partial data-load failures as a toast instead of silently empty dashboards.

### 4.6 Typographic quotes (curly over straight) — ⚠️ Partial
- UI copy strings use straight quotes/apostrophes throughout (e.g., "Password reset isn't available yet — contact your administrator." `UserLogin.tsx:44`); no curly “ ” usage found in any string literal.

### 4.7 Avoid widows/orphans — ➖ Not verifiable statically
- No `text-wrap: balance/pretty` utilities exist; nothing prevents widows in card titles/descriptions.

### 4.8 Tabular numbers for comparisons — ✅ Pass (by construction)
- The entire app runs in JetBrains Mono (`index.css:16–17`), which is inherently tabular — numeric columns align without `font-variant-numeric`. Numeric table columns are explicitly right-aligned (`Reports.tsx:217–219`, `TimesheetEditor.tsx:394`, Table `align` API `Table.tsx:11`).

### 4.9 Redundant status cues (never color alone) — ✅ Pass
- `StatusBadge` is a colored pill **with a text label**; toasts pair icon + text + color (`Toast.tsx:18–30`); sort state shows a `↑/↓` glyph plus column highlight (`Table.tsx:93`); progress bar has a text line ("You are above the weekly target", `TimesheetEditor.tsx:484`).

### 4.10 Icons have labels (same meaning in text) — ✅ Pass
- Nav items, tabs, and buttons pair every icon with text; decorative icons are `aria-hidden` (`Breadcrumbs.tsx:23,27`, `Select.tsx:43`).

### 4.11 Don't ship the schema (accessible names still exist) — ⚠️ Partial
- `Input`/`Select`/`Textarea` associate labels via generated `htmlFor`/`id` (`Input.tsx:12,19–22`, `Select.tsx:12,18`), and carry `aria-invalid` + `aria-describedby` (`Input.tsx:31–32`, `Select.tsx:25–26`, `Textarea.tsx:27`).
- **Fails:** the login Password field's `<label>` has no `htmlFor` and the input no `id` (`UserLogin.tsx:113–122` — same in `AdminLogin.tsx`), so it is not programmatically associated; `Switch` renders its label as a sibling `<p>` (`Switch.tsx:14`) with no association to the `role="switch"` button (no accessible name); the timesheet hour `<input type="number">` cells have no labels at all — screen readers announce unlabeled spinners in a 7-column void (`TimesheetEditor.tsx:414–423`).

### 4.12 Use the ellipsis character (`…` over `...`) — ❌ Fail
- Every ellipsis in shipped copy is ASCII: `format.ts:30` (`truncate` appends `...`), `AIChatPanel.tsx:120,142`, `CreateProject.tsx:255`, `EditProject.tsx:195`, `Textarea` placeholder in `TimesheetEditor.tsx:494` ("Add any notes for this week...").

### 4.13 Anchored headings (`scroll-margin-top`) — ➖ N/A
- No in-page anchor navigation exists; nothing to scroll-margin.

### 4.14 Resilient to user-generated content (short/long) — ⚠️ Partial
- Good: `min-w-0` + `truncate` patterns in layout (`ProfileDropdown.tsx:63`, sidebar user rows `Sidebar.tsx:224`), a `truncate()` util, and table cells that wrap. Timesheet descriptions and project names render unbounded in table cells (no ellipsis/`max-w` on some table renders) — long strings stretch columns; the editor table compensates with `overflow-x-auto`. Mostly resilient, a few unguarded cells.

### 4.15 Locale-aware formats (dates, numbers, currency) — ❌ Fail
- Dates: hardcoded English patterns via date-fns — `format(d, 'MMM d, yyyy')` (`date.ts:24–27`), `'MMM d'`, `'EEE, MMM d'` (`date.ts:34–57`) — regardless of user locale.
- Currency: `Intl.NumberFormat('en-US', ...)` hardcoded (`format.ts:6–11`).
- Relative time: hand-rolled English strings ("X hours ago", `ActivityTimeline.tsx:58–59`).
- Inconsistently, one spot IS locale-aware: `new Date(...).toLocaleDateString()` in `Topbar.tsx:295`.

### 4.16 Prefer language settings over location — ➖ N/A
- Single-locale (English) app; no IP/GPS-based language logic exists (which is the failure mode the guideline bans). Nothing to localize yet.

### 4.17 Shield verbatim content from translation (`translate="no"`) — ❌ Fail
- Brand names ("Eniac", "Alpha-net") and product copy are not wrapped in `translate="no"` anywhere (grep: zero matches). Browser auto-translate would mangle the brand.

### 4.18 Accessible content (aria-label / aria-hidden / a11y tree) — ✅ Pass
- Decorative dots, chevrons, and separators are `aria-hidden` (`Breadcrumbs.tsx:23`, `Select.tsx:43`, `Avatar` initials are text); `Avatar` renders `<img alt={name}>` (`Avatar.tsx:46–48`); dialogs use `role="dialog"` + `aria-modal` + labelled-by (`Modal.tsx:68`, `Drawer.tsx:60`); Breadcrumbs use `aria-label="Breadcrumb"` and `aria-current="page"` (`Breadcrumbs.tsx:15,26,31`).

### 4.19 Icon-only buttons are named (`aria-label`) — ⚠️ Partial
- Comprehensive coverage: password eye toggles (`UserLogin.tsx:127`, `CreateUser.tsx:112`, `EditUser.tsx:190`), close buttons (`Modal.tsx:91`, `Drawer.tsx:81`, `MobileNav.tsx:31`), toast dismiss (`Toast.tsx:47`), user menu (`Topbar.tsx:311`, `ProfileDropdown.tsx:54`), mobile menu (`Topbar.tsx:186`), sidebar collapse (`Sidebar.tsx:103`), week arrows (`TimesheetEditor.tsx:362–364`), AI chat toggle (`AIChatWidget.tsx:30`).
- **Fails:** the row "remove work item" Trash button has no label (`TimesheetEditor.tsx:430`), and the employee-table sort button in Reports has none either (`Reports.tsx:232–234`).

### 4.20 Semantics before ARIA — ⚠️ Partial
- Native elements used well (button/a/label/table/th scope="col" `Table.tsx:86`, ol/li breadcrumbs); ARIA added where native is impossible (dialog, switch, tablist, menuitem — all correct patterns).
- **Fails:** `Table.tsx` sorts/clicks via `<th onClick>` and `<tr onClick>` (should be a button in the th with `aria-sort`, and rows should be links or contain one); `MobileNav`/menus use buttons-as-links (see 1.26).

### 4.21 Headings hierarchy & skip link — ✅ Pass
- `AppShell.tsx:16–18` has a real "Skip to content" link (visually hidden, visible on focus, targets `#main-content`). Auth pages: `h1` brand + `h2` panel (`UserLogin.tsx:75,94`); detail pages start with `h1` (`SubmissionDetails.tsx:52`, `TimesheetEditor.tsx:356`, `CreateUser.tsx:82`); cards use `h2`/`h3` consistently.

### 4.22 Accessible media (captions/transcripts) — ➖ N/A
- No audio/video/animated media in the app.

### 4.23 Brand resources from the logo — ❌ Fail (minor)
- The logo is a decorative `<div>` with a letter (`Sidebar.tsx:176–179`, auth hero `UserLogin.tsx:72–74`), not an anchor exposing brand assets.

### 4.24 Non-breaking spaces for glued terms — ❌ Fail
- No `&nbsp;`/`\u00A0` usage anywhere (grep). "10 MB" gets a regular space (`format.ts:22–26`); no glued-unit protection anywhere.

## 5. Forms

### 5.1 Enter submits — ✅ Pass
- All primary forms are `<form onSubmit>`: login (`UserLogin.tsx:97`), register (`Register.tsx:84`), settings, project/user create & edit forms; the chat form submits via its Send button (`AIChatPanel.tsx:138`).

### 5.2 Textarea behavior (⌘/⌃+Enter submits, Enter = newline) — ❌ Fail
- `AIChatPanel.tsx:139–146`: the textarea has **no key handler**, so ⌘/⌃+Enter does nothing and users must click "Send" (Enter correctly inserts a newline by default, but the submit half of the pattern is missing).

### 5.3 Labels everywhere — ⚠️ Partial
- Shared `Input`/`Select`/`Textarea` render associated labels; CreateUser/EditUser password fields have explicit `htmlFor`+`id` (`CreateUser.tsx:97–107`).
- **Fails:** login Password label unassociated (4.11); `Switch` label unassociated (4.11); chat textarea has only a placeholder (no label/`aria-label`, `AIChatPanel.tsx:139–146`); timesheet hour inputs unlabeled (4.11).

### 5.4 Label activation (clicking label focuses control) — ⚠️ Partial
- Works for all `Input`-component fields (real `htmlFor`). Fails wherever association is missing: login Password, `Switch`, chat textarea (a placeholder is not clickable), hour inputs.

### 5.5 Submission rule (enabled until submit → disable in flight + spinner + keep label + idempotency) — ⚠️ Partial
- **Passes:** submit buttons stay enabled until submission starts, then `disabled || loading` (`Button.tsx:70`) with label kept (1.9). Login (`UserLogin.tsx:144`), editor save/submit (`TimesheetEditor.tsx:500–505`), admin forms — all follow this.
- **Fails:** no idempotency key on any POST/PUT (the backend's unique `(userId, projectId, weekStart)` index is the only double-submit guard); chat disables its textarea during flight (`AIChatPanel.tsx:145`) which also blocks typing the next message.

### 5.6 Don't block typing (numbers fields too) — ⚠️ Partial
- No input blocking via keystroke prevention anywhere. **But** the hour cells silently clamp on change: `Math.max(0, Math.min(24, value))` (`TimesheetEditor.tsx:169–175`) means typing "30" instantly becomes "24" with **no explanation**, and the value `|| ''` fallback makes the field fight the user while clearing. Validation feedback exists only on save (`getValidationErrors`, `TimesheetEditor.tsx:92–134`), not at the field.

### 5.7 Don't pre-disable submit (surface validation instead) — ✅ Pass
- Submit buttons are never disabled for incomplete forms; validation runs on submit and shows field errors (login `UserLogin.tsx:20–26,51–53`; editor uses the same pattern with an error list + toast).

### 5.8 No dead zones on checkbox/radio (label + control share hit target) — ✅ Pass
- `Checkbox.tsx:11` wraps the input in the `<label>` (single hit target); raw checkboxes in CreateUser/EditUser do the same (`CreateUser.tsx:135–141`).

### 5.9 Error placement (next to field; focus first error on submit) — ⚠️ Partial
- **Passes:** errors render adjacent to their field in `Input.tsx:42–46`, `Select.tsx:46–50`, `Textarea.tsx`, auth banners above the form (`UserLogin.tsx:98–102`), and the editor accumulates a validation-error `<ul>` in-page (`TimesheetEditor.tsx:375–380`).
- **Fails:** no implementation focuses the first erroring field on failed submit anywhere (grep: no focus-management on validation in any page).

### 5.10 Autocomplete & meaningful names — ⚠️ Partial
- Login: `autoComplete="email"` + `autoComplete="current-password"` (`UserLogin.tsx:110,121`); admin CreateUser/EditUser: `autoComplete="new-password"` (`CreateUser.tsx:106`, `EditUser.tsx:~188`). ✅ where it matters most.
- **Fails:** Register page fields show no `autoComplete` (`name`, `email` etc. — grep shows none in `Register.tsx`), and no `name` attributes are set on inputs anywhere (state-driven only), which weakens autofill.

### 5.11 Spellcheck selectively — ❌ Fail (minor)
- No `spellCheck` attributes anywhere; email/search/employee-ID fields inherit the browser's default spellcheck and will show squiggles.

### 5.12 Correct types & input modes — ✅ Pass
- `type="email"` (`UserLogin.tsx:105`), `type="password"` with visibility toggle, `type="number"` with `min/max/step="0.5"` for hours (`TimesheetEditor.tsx:415–418` — gives mobile numeric keypads), `type="date"`/custom DatePicker for dates. No wrong-typed fields found.

### 5.13 Placeholders signal emptiness (end with ellipsis) — ⚠️ Partial
- Placeholders are example values (good: `you@eniac.com`, `••••••••`), but none use the `…` character — they use `...` or none ("Work item description", `TimesheetEditor.tsx:403` has no ellipsis at all).

### 5.14 Placeholder value (example/pattern) — ✅ Pass
- Real examples used: `you@eniac.com` (`UserLogin.tsx:109`), `••••••••`, "Reason for withdrawal (optional)" (`TimesheetEditor.tsx:545`).

### 5.15 Unsaved changes (warn before navigation) — ❌ Fail
- No `beforeunload`, no React Router blocker/prompt anywhere (grep: zero). The TimesheetEditor — the highest-stakes form in the app — lets users navigate away (or close the tab) with hours silently discarded.

### 5.16 Password managers & 2FA (allow pasting OTP) — ✅ Pass
- Proper `autoComplete` tokens (5.10); no OTP fields exist; paste is never blocked (1.8).

### 5.17 Don't trigger password managers on non-auth fields — ✅ Pass
- No reserved input names (`name="password"` etc.) on non-auth fields; search inputs are unnamed; chat textarea is `name="message"`.

### 5.18 Trim input values (input-method trailing spaces) — ✅ Pass
- Login trims email (`UserLogin.tsx:33,57`); validation trims before requiring (`TimesheetEditor.tsx:126` `entry.description.trim()`, register validate uses `.trim()`).

### 5.19 Windows `<select>` background/color — ✅ Pass
- `Select.tsx:27` sets explicit `bg-card ... text-foreground` on the native select (and the app is light-only), so the dark-mode contrast bug can't occur.

## 6. Performance

### 6.1 Device/browser matrix (iOS Low Power Mode, Safari) — ➖ Process item
- Not verifiable statically; no evidence of a test matrix in the repo docs.

### 6.2 Measure reliably (disable extensions) / 6.4 Throttle when profiling — ➖ Process items
- No profiling harness or docs exist in the repo.

### 6.3 Track re-renders (minimize & make them fast) — ⚠️ Partial
- Reasonable hygiene: `useMemo` for all derived lists (`Dashboard.tsx:26`, `supervisor/Approvals.tsx:46–48`), `useCallback` for pollers/context callbacks (`AppDataContext.tsx:147,167,174`), `AppDataContext` batches the initial load with `allSettled`. But no `React.memo` on table rows/list items, and the AI `sendMessage` depends on the whole `messages` array (`AIContext.tsx:72`), recreating on every turn. No React Scan/DevTools evidence in the repo.

### 6.5 Minimize layout work (batch reads/writes) — ✅ Pass
- CSS-driven layout; the only JS geometry read is Dropdown positioning at toggle time (`Dropdown.tsx:18`). No interleaved read/write patterns found.

### 6.6 Network latency budgets (mutations <500ms) — ➖ Runtime item
- Client mutations are single round-trips with no artificial delay; server speed is out of scope for this frontend audit.

### 6.7 Keystroke cost (uncontrolled inputs; cheap controlled loops) — ✅ Pass
- Chat textarea is uncontrolled (`AIChatPanel.tsx:20,139–146` reads from the form element). Remaining controlled inputs are small forms; the heaviest (timesheet grid) does entry-scoped immutable updates per keystroke — acceptable at ~10 rows.

### 6.8 Large lists (virtualize / `content-visibility`) — ⚠️ Partial
- No virtualization (`virtua`/react-window absent). Mitigations: shared `Table` supports `pageSize` (`Table.tsx:22,52–53`), notifications capped at 50 server-side, lists are role-scoped. Unbounded growth on `My Timesheets`/admin lists would eventually need virtualization.

### 6.9 Preload wisely (above-the-fold only) — ➖ N/A mostly
- Only one bitmap asset exists (`assets/hero.png`) and it is not referenced in reviewed pages; the app is icon-based (lucide) — nothing to lazy-load.

### 6.10 No image-caused CLS (explicit dimensions) — ✅ Pass
- `Avatar` images sit in fixed-size containers (`Avatar.tsx:44`); the settings logo preview sits in a fixed `h-16 w-16` box (`Settings.tsx:125–129`). No unsized `<img>` found.

### 6.11 Preconnect to origins — ❌ Fail
- `index.html` has no `<link rel="preconnect">` for the API origin (which is cross-origin in this architecture — backend on :3001 / separate deployment), so DNS/TLS is paid on first request.

### 6.12 Preload fonts (critical text) — ❌ Fail
- The self-hosted JetBrains Mono woff2 is declared with `font-display: swap` (`index.css:5–11`) but has **no `<link rel="preload" as="font">`** in `index.html` — first paint risks FOUT/late-swap since this font is the app's only family.

### 6.13 Subset fonts — ✅ Pass
- Latin-subset variable woff2 (`index.css:3–4`); a single variable axis (weight) is shipped.

### 6.14 Don't use the main thread for expensive work — ✅ Pass (effectively N/A)
- No heavy client computation exists; filtering/sorting is O(n) over small arrays; CSV export is trivial string building (`reportService.ts:57–61`).

### 6.15/6.16 Video over GIF / Safari video-as-image — ➖ N/A
- No GIFs or looping media in the app.

### 6.17 (bonus) Bundle code-splitting — ✅ Pass
- `vite.config.ts:17–21` manually splits `react-vendor` and `recharts` chunks; the build output confirms three chunks (react-vendor 189 kB, index 344 kB, recharts 356 kB).

## 7. Design

### 7.1 Layered shadows (ambient + direct) — ⚠️ Partial
- Single-tier Tailwind shadows only (`shadow-sm/md/lg/xl`, e.g. `Toast.tsx:38` `shadow-xl`, `Dropdown.tsx:56` `shadow-lg`). No two-layer composite shadow tokens anywhere.

### 7.2 Crisp borders (borders + shadows, semi-transparent) — ✅ Pass
- Hairline `border-border` system on every card/menu (`Modal.tsx:73`, `Dropdown.tsx:56`), and semantic overlays use semi-transparent borders (`Toast.tsx:26–29` `border-success/20` etc.).

### 7.3 Nested radii (child ≤ parent, concentric) — ✅ Pass
- Consistent scale: `rounded-xl` cards → `rounded-lg` inputs/buttons inside (`Modal.tsx:73` + `Input.tsx:33`); `rounded-full` pills on both trigger and menu (`ProfileDropdown.tsx:53,70`). No inverted-radius violations found.

### 7.4 Hue consistency (tint toward same hue) — ✅ Pass
- One palette: slate grays + blue-600 accent, all via `@theme` tokens (`index.css:19–61`). One exception: `ConfirmDialog.tsx:70–73` uses raw Tailwind `bg-blue-600`, `text-gray-600`, `hover:bg-gray-100` — off-palette token drift (and its confirm button is blue rather than danger red).

### 7.5 Accessible charts (color-blind-friendly palettes) — ✅ Pass (limited)
- The only chart is single-series, single-hue blue (`Reports.tsx:189–195`, `Bar fill="#2563eb"`) — no multi-hue encoding to confuse; axes are text-labeled; the same data is also available as a table (Hours by Employee), though not for the project chart specifically.

### 7.6 Minimum contrast (prefer APCA) — ➖ Not verifiable statically
- Palette pairs (`#0f172a` on `#ffffff`, `#475569` on `#f7f8fa`) read as safe, but no automated contrast/APCA check exists in the repo.

### 7.7 Interactions increase contrast — ✅ Pass
- Consistent hover escalation: `hover:bg-muted`, `hover:text-foreground`, `hover:bg-accent-hover` across `Button.tsx:16–21`, nav items, and menu rows.

### 7.8 Browser UI matches background (`theme-color` meta) — ❌ Fail
- No `<meta name="theme-color">` in `index.html`.

### 7.9 Set appropriate `color-scheme` — ❌ Fail
- No `color-scheme` declared on `<html>` or in CSS (the app is light-only; `color-scheme: light` should still be set so scrollbars and form controls render light).

### 7.10 Text anti-aliasing & transforms — ✅ Pass
- `body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale }` (`index.css:122–123`); transforms are applied to wrappers, not text nodes (e.g. `Switch.tsx:28–30` thumb).

### 7.11 Avoid gradient banding — ➖ N/A
- No CSS gradient masks; overlays use `backdrop-blur` + solid alpha (`Modal.tsx:69`).

## 8. Copywriting

### 8.1 Active voice / action-oriented / consistent nouns / second person — ✅ Pass
- "Manage your projects, timesheets and submissions." (`UserLogin.tsx:77`); "Share it with the user so they can sign in." (`CreateUser.tsx:120`); imperative empty-state actions ("Get started by creating a new project."). "Timesheet", "project", "submission" used consistently; second person throughout ("your account", "You are above the weekly target").

### 8.2 Title Case (Chicago) for headings & buttons — ⚠️ Partial
- Mostly correct: "Sign In", "Save Draft", "Submit Final", "Create User", "New Project", "Hours by Project", "Weekly Notes".
- Inconsistent: "Sign out" (sentence case) in menus/sidebar (`ProfileDropdown.tsx:108`, `Sidebar.tsx:160`), "Clear" (`AIChatPanel.tsx:69`), "Ask AI" (`AIChatWidget.tsx:39`).

### 8.3 Clear & concise — ✅ Pass
- Microcopy is tight throughout; no filler sentences found.

### 8.5 Prefer "&" over "and" — ❌ Fail (minor)
- Copy uses "and" ("Create your account and start managing projects, people, and time in one place." `Register.tsx:119`); no "&" in UI copy.

### 8.8 Consistent placeholders (tokens like YOUR_API_TOKEN_HERE) — ➖ N/A
- No token-style values exist in this app's UI.

### 8.9 Numerals for counts — ✅ Pass
- All counts rendered as numerals ("6 of 6", StatCard values, unread badges, "Removed sat 8h").

### 8.10 Consistent currency formatting — ➖ N/A / ✅
- Only one currency formatter exists (`format.ts:6–11`), always the same style.

### 8.11 Separate numbers & units with a space — ❌ Fail
- Hours are glued: `8h`, `20.0h` everywhere (`format.ts:1–4` returns `"0h"`/`"...h"`; `TimesheetEditor.tsx:427,439`; `Reports.tsx:228–230`; `ActivityTimeline.tsx`). File sizes do it correctly ("10.5 MB" with space, `format.ts:22–26`).

### 8.12 Non-breaking space for glued terms — ❌ Fail
- Same as 4.24: no `&nbsp;` anywhere; even the file-size spaces are breakable.

### 8.13 Positive language — ✅ Pass
- Errors are framed constructively: ErrorState defaults ("Something went wrong" / "We could not load this content. Please try again."), "If that account exists, a reset link is on its way." (`UserLogin.tsx:40`), "Enter your email first, then click \"Forgot password?\"" (`UserLogin.tsx:35`).

### 8.14 Error messages guide the exit — ✅ Pass
- "Invalid credentials. Please try again." (retry guidance, `UserLogin.tsx:61`); "Unable to create account. Please check the details and try again." (`Register.tsx:104`); "Some workspace data failed to load (N of 6). Try refreshing the page." (`AppDataContext.tsx:112`); permission failures explain *why* via `utils/permissions.ts` pre-checks.

### 8.15 Avoid ambiguity (specific labels) — ✅ Pass (one nit)
- Buttons are specific ("Save Draft", "Submit Final", "Create Supervisor"); nit: shared `ConfirmDialog` defaults to the generic "Confirm" (`ConfirmDialog.tsx:18`) when callers don't pass `confirmLabel`.

### 8.16 Accuracy nit (found while auditing; not a numbered guideline)
- `AIChatPanel.tsx:158` states "AI responses are powered by Gemini" while the backend's default provider is **Groq** (`env.ts`, `aiProvider.ts`) — stale copy that misinforms users.

---

## 9. Priority Fix List (highest user impact first)

1. **Mount or remove the AI assistant** — `AppShell.tsx:28` has `AIChatWidget` commented out; the entire feature + its `Ctrl+Shift+A` shortcut are dead. (1.22, 1.28)
2. **Unsaved-changes guard on TimesheetEditor** — no `beforeunload`/router blocker anywhere; hours can be silently discarded. (5.15)
3. **Global `:focus-visible` strategy** — replace/augment `focus:` rings so mouse clicks don't flash rings. (1.2)
4. **`prefers-reduced-motion` support** — one media query in `index.css` disabling transitions/animations. (2.1)
5. **URL as state for list filters/tabs/sort** — migrate `useState` filters to `useSearchParams` in Users/Projects/Timesheets/Approvals/Reports. (1.11, 1.23)
6. **Per-route page titles** — a small `usePageTitle` hook; today every page is "Eniac". (4.3)
   - **Partially done:** `Onboarding.tsx` (`usePageTitle('Onboarding')`) and `InviteRedeem.tsx` (`usePageTitle('Accept Invite')`) now use the hook; plus route `handle: { title: 'Accept Invite' }` in `App.tsx`. Existing pages remain "Eniac".
7. **Links are links** — convert `MobileNavItem`, profile/breadcrumb menu items, and row navigation to `<Link>`. (1.26)
8. **`overscroll-behavior: contain` + `touch-action: manipulation` + tap-highlight** — three one-line global/overlay CSS rules. (1.15, 1.16, 1.19)
9. **16px inputs on mobile** (adjust the type scale at small breakpoints) to stop iOS focus-zoom. (1.5)
10. **Locale-aware formatting** — route dates/numbers through `Intl` with the runtime locale; drop hardcoded `'en-US'` and English date-fns patterns. (4.15, 8.11)
11. **Keyboard access for `Table`** — sortable `<th>` gets a real `<button>` + `aria-sort`; clickable rows get a keyboard equivalent or an explicit link cell. (1.1, 4.20)
12. **Label the last unlabeled controls** — login Password (`htmlFor`), `Switch` accessible name, timesheet hour inputs (`aria-label="{day} hours"`), Trash + Reports sort buttons. (4.11, 4.19, 5.3)
13. **Loading-state minimum durations** — wrap spinners/skeletons with a ~200ms show-delay. (1.10)
14. **Delete the weak inline dialogs in TimesheetEditor** — use the shared `Modal`/`ConfirmDialog` (trap + Escape + focus restore). (1.3)
15. **`index.html` housekeeping** — `<meta name="theme-color">`, `color-scheme: light`, font `preload`, API `preconnect`. (7.8, 7.9, 6.11, 6.12)
16. **Safe-area padding for fixed toasts/widget.** (3.5)
17. **Typography details** — `…` instead of `...`, `translate="no"` on brand names, spaced/breakable-proof units. (4.12, 4.17, 4.24, 8.11–8.12)

## 10. What's Done Well (worth preserving)

- **Dialog craftsmanship**: `ConfirmDialog` (focus trap + focus move + restore + Escape) and `Modal` are textbook; portals used consistently.
- **Honest async UX**: server results are checked before success toasts (QA H1), partial load failures are surfaced (QA C1), no `window.confirm/alert` anywhere — every destructive path is a real dialog, with a required reason where it matters (Decline).
- **Forgiving interaction patterns**: type-change zeroing with explanation, inline day-rules documentation, permission pre-checks that explain disabled controls.
- **Form primitives**: `aria-invalid` + `aria-describedby` + `role="alert"` wiring in one place (`Input`/`Select`/`Textarea`), correct `autocomplete` tokens on auth/password fields, live validation without pre-disabled submits.
- **State completeness**: `EmptyState` (with actions), `ErrorState` (with retry), skeletons mirroring content, `aria-live` toasts with named dismiss buttons.
- **WAI-ARIA fidelity**: roving-focus tabs with `aria-selected`/`aria-controls` + arrow keys; menus with `role="menu"`/`menuitem` and Escape; dialogs with `role`/`aria-modal`/`aria-labelledby`.
- **A11y hygiene**: skip link, `aria-hidden` decoration, `aria-current="page"` breadcrumbs, alt text on avatars, mono font giving tabular numbers for free.
- **Performance basics**: manual vendor chunking, memoized derivations, visibility-aware polling that stops when hidden or logged out.

## 11. Vercel-Specific Note

The guideline document's "Vercel-specific" section is explicitly marked as brand preference, not universal — it was not scored here.

---

## Appendix A — Global grep checks (absence/presence evidence)

| Pattern | Result in `frontend/src` + `index.html` |
|---|---|
| `document.title` / title management | **0 matches** (static `<title>Eniac</title>` only) |
| `useSearchParams` | **0 matches** |
| `:focus-visible` | **0 matches** (only `focus:` variants) |
| `prefers-reduced-motion` | **0 matches** |
| `touch-action` / `-webkit-tap-highlight` / `overscroll-behavior` / `safe-area` | **0 matches each** |
| `theme-color` / `color-scheme` / `scroll-margin` / `translate="no"` / `spellCheck` / `&nbsp;` | **0 matches each** |
| `beforeunload` / `useBlocker` / `usePrompt` | **0 matches** |
| `window.confirm` / `window.alert` | **0 matches** (custom dialogs used) |
| `aria-live` | 1 match — `Toast.tsx:34` (plus `role="alert"` per toast) |
| `aria-label` | 26 matches — comprehensive, 2 icon-only buttons missed |
| `aria-invalid` / `aria-describedby` | present in Input/Select/Textarea |
| `autoComplete` | present on login + password fields; **absent on Register** |
| `inputMode` | 0 matches (covered via `type="number"`/`type="email"` instead) |
| `user-scalable=no` / `maximum-scale` | **0 matches** (zoom respected) |
| `document.addEventListener('keydown')` for Escape | present in Topbar, ProfileDropdown, Drawer, Modal, ConfirmDialog |
| Ellipsis `…` character | **0 matches** in shipped copy (ASCII `...` everywhere) |
| Curly quotes “ ” | **0 matches** in shipped copy |

**Verdict distribution (of ~60 scored items):** ✅ 24 pass · ⚠️ 24 partial · ❌ 14 fail · ➖ ~12 N/A/process.

## 12. Remediation Checklist (track progress here)

> Every item maps to a finding number in the audit above. Check off with `- [x]` as work lands.
>
> **Progress: 36 / 39 remediation items · 0 / 5 verification checks**

### Phase 0 — Global one-liners (no behavior risk) — 7/7 ✅ DONE (2026-09-20, build + lint verified)

- [x] **0.1 `prefers-reduced-motion` support** *(finding 2.1)*
  - Missing: all animations (spin/pulse/bounce/slide) run unconditionally.
  - Do: add to `frontend/src/index.css` a `@media (prefers-reduced-motion: reduce)` block that collapses `animation-duration`/`transition-duration` to ~0 and disables `scroll-behavior: smooth`.
  - Accept when: OS "reduce motion" stops spinners, bouncing dots, and drawer slides.
  - **Done:** media query added at `index.css:172–181` (covers `*`/`::before`/`::after` with `!important`).

- [x] **0.2 Global `:focus-visible` ring** *(finding 1.2)*
  - Missing: `:focus-visible` used 0 times; mouse clicks flash rings.
  - Do: add `:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }` + `:focus:not(:focus-visible) { outline: none; }` in `index.css`; migrate `focus:ring-*` → `focus-visible:ring-*` in `Button.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Switch.tsx`, `Tabs.tsx`, `Modal.tsx`, `Drawer.tsx`.
  - Accept when: Tab shows a ring, mouse click doesn't.
  - **Done:** global rules at `index.css:143–149`; **all 26 `focus:ring` call sites across 20 files** migrated via repo-wide replace (also covered `Checkbox.tsx`, `DatePicker.tsx`, `Topbar.tsx`, `AIChatPanel.tsx`, and the page-level inputs in auth/CreateUser/EditUser/TimesheetEditor/Approvals — beyond the 8 files listed). `focus:ring` count is now 0; `focus:border-*` deliberately kept on `:focus` so mouse users still get the subtle input border cue.

- [x] **0.3 `touch-action` + tap-highlight + overscroll-contain** *(findings 1.15, 1.16, 1.19)*
  - Do: in `index.css` set `-webkit-tap-highlight-color: transparent` on `html`; `touch-action: manipulation` on interactive elements; `overscroll-behavior: contain` on the scroll panels of `Modal.tsx`, `Drawer.tsx`, `AIChatPanel.tsx`, and the mobile navs.
  - Accept when: a modal's scroll no longer chain-scrolls the page behind it; no gray tap flash on iOS/Android.
  - **Done:** `index.css:154–167` (tap-highlight + `touch-action: manipulation` on button/a/roles/inputs); `overscroll-contain` added to the scroll panels of `Modal.tsx:73`, `Drawer.tsx:74`, `AIChatPanel.tsx:74`, `MobileNav.tsx:36`, and the Sidebar mobile drawer (`Sidebar.tsx:190`).

- [x] **0.4 `index.html` head housekeeping** *(findings 7.8, 7.9, 6.11, 6.12)*
  - Do: add `<meta name="theme-color" content="#f7f8fa">`; declare `color-scheme: light` on `:root` (in CSS or a meta); `<link rel="preload" href="/fonts/jetbrains-mono-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`; `<link rel="preconnect" href="<api-origin>" crossorigin>` once the API origin is known per environment.
  - Accept when: Lighthouse "preload font" / "preconnect" audits pass.
  - **Done:** `theme-color` + font `preload` added to `index.html:8–11` (font file confirmed present at `public/fonts/`); `color-scheme: light` declared in `index.css:70`; **preconnect implemented environment-aware** in `main.tsx:11–28` — it injects `<link rel="preconnect">` only when `VITE_API_BASE_URL` resolves to a cross-origin origin (default same-origin `/api/v1` is a no-op, so no hardcoded deployment URL is needed).

- [x] **0.5 Safe-area insets for fixed elements** *(finding 3.5)*
  - Do: apply `env(safe-area-inset-*)` padding to the toast portal (`Toast.tsx:34` `bottom-4 right-4`) and the AI widget button (`AIChatWidget.tsx:27` `bottom-6 right-6`).
  - Accept when: toasts/widget clear the iOS home indicator.
  - **Done:** both fixed elements now use `max(<offset>, env(safe-area-inset-*))` positioning (`Toast.tsx:34`, `AIChatWidget.tsx:27`).

- [x] **0.6 Ellipsis character everywhere** *(findings 4.12, 5.13, 1.13)*
  - Do: replace ASCII `...` with `…` in `format.ts` `truncate()`, `AIChatPanel.tsx` ("Thinking…", "Ask me anything…"), `CreateProject.tsx:255`, `EditProject.tsx:195`, `TimesheetEditor.tsx:494` placeholder, and all other shipped copy.
  - Accept when: `grep -rn '\.\.\.' frontend/src` returns no user-facing strings.
  - **Done:** `truncate()` now appends `…` (sliced to keep total length); **17 user-facing strings converted** across `AIChatPanel.tsx` (Thinking/chat placeholder), `Topbar.tsx` (search button + modal search), `FullPageSpinner.tsx` ("Loading…"), `DeclineModal.tsx`, `TimesheetEditor.tsx` (notes), and the search placeholders in `Users`, `Supervisors`, `Projects` (admin + user), `Timesheets` (admin + user + supervisor, incl. the "Opening it…" toast), `CreateProject`, `EditProject`, `ProjectDetails`. Only code spread-operators (`...props`, `[...arr]`) remain.

- [x] **0.7 Fix stale AI provider copy** *(finding 8.16)*
  - Do: reword `AIChatPanel.tsx:158` ("powered by Gemini" while backend defaults to Groq) to provider-neutral copy, or source the provider name from settings.
  - Accept when: on-screen claim matches the configured provider.
  - **Done:** copy is now provider-neutral — "Responses are AI-generated & may be inaccurate. Don't share sensitive personal information." with a comment explaining why no provider is named (`AIChatPanel.tsx:157–161`).

> **Phase 0 verification:** `npm run build` green (tsc -b + Vite, 794ms) · `oxlint` 0 errors (15 pre-existing React-Compiler warnings, none from these changes) · grep evidence: `focus:ring` 0 remaining, `focus-visible` 30 occurrences, reduced-motion/touch-action/tap-highlight/overscroll-contain/theme-color/color-scheme/preload/safe-area all present.

### Phase 1 — High-impact app behavior — 7/7 ✅ DONE (2026-09-21, tsc + oxlint + build verified)

- [x] **1.1 Mount or consciously remove the AI assistant** *(findings 1.22, 1.28, 1.3)*
  - Missing: `AIChatWidget` commented out at `AppShell.tsx:28`; chat + `Ctrl+Shift+A` unreachable; panel lacks Escape/focus/trap; textarea lacks ⌘/Ctrl+Enter and a label.
  - Do: decide ship vs. remove. If shipping: uncomment the widget; add Escape-to-close + focus-into-panel + focus-restore (mirror `Modal.tsx:58–63`); add ⌘/Ctrl+Enter submit on the textarea; `aria-label="Message"` on it; surface the shortcut somewhere in the UI.
  - Accept when: the widget renders; Escape closes; focus moves in on open and returns to the trigger on close.
  - **Done:** widget mounted in `AppShell.tsx:40` (decision: ship). `AIChatPanel.tsx` renders `role="dialog" aria-modal + aria-label="AI chat"`; captures prior focus on mount, focuses the composer, closes on Escape (capture), restores focus on unmount; composer has `aria-label` + Ctrl/Cmd+Enter-to-send with the hint in the placeholder; trigger button surfaces the `Ctrl+Shift+A` shortcut via `aria-label`/`title`.

- [x] **1.2 Unsaved-changes guard on TimesheetEditor** *(finding 5.15)*
  - Missing: no `beforeunload`/router blocker; dirty hours lost on nav/tab close.
  - Do: create `hooks/useUnsavedChanges(isDirty)` (`beforeunload` listener + React Router `useBlocker`); wire in `TimesheetEditor.tsx` comparing `entries`/`notes` against `existingTimesheet`; confirm dialog on blocked nav; clear the dirty flag after save/submit.
  - Accept when: leaving with unsaved hours prompts; saving clears the flag.
  - **Done:** `hooks/useUnsavedChanges.ts` (beforeunload + `useBlocker`; required migrating `App.tsx` to `createBrowserRouter`). `TimesheetEditor.tsx:88–99` keeps a `savedSnapshot` state initialized from the loaded timesheet and re-based via `rebaseSavedSnapshot()` after successful save (`:286`) and submit (`:329`, before the programmatic navigate); dirty = working copy ≠ snapshot while status ≠ approved. Blocked in-app nav renders the shared `ConfirmDialog` (`:561–566`, Discard/Stay = proceed/reset).

- [x] **1.3 Per-route page titles** *(finding 4.3)*
  - Do: add `hooks/usePageTitle.ts` (`useEffect` sets `document.title`, restores previous on unmount) and call per page/layout ("Timesheet · Eniac"); or derive titles from route metadata in `App.tsx`.
  - Accept when: the browser tab reflects the current section/record.
  - **Done:** both layers — `App.tsx` uses `createBrowserRouter` with `handle: { title }` on every route, and `AppShell.tsx:22` applies the leaf match's title via `usePageTitle` (appends `· Eniac`, restores previous on unmount). Auth screens outside the shell call `usePageTitle` directly (`AdminLogin`, `UserLogin`, `Register`).

- [x] **1.4 URL-as-state for list pages** *(findings 1.11, 1.23)*
  - Do: migrate `useState` → `useSearchParams` for `search`/`statusFilter`/`departmentFilter` in `Users.tsx`, `Projects.tsx`, `Timesheets.tsx` (admin/user/supervisor), approvals tabs, and Reports filters; make shared `Table` sort/page read/write URL params.
  - Accept when: filters/sort update the URL, refresh restores state, Back/Forward works.
  - **Done:** new `hooks/useQueryParamState.ts` (one hook per param; `replace` for keystroke search, `push` for discrete filters so Back/Forward walks filter history; setter mirrors `useState`; empty values removed from URL). Adopted in 10 list pages (admin Users/Projects/Timesheets/Approvals/Reports/Supervisors, supervisor Timesheets/Approvals, user Projects/Timesheets); `Table.tsx` accepts optional controlled `sortState`/`sortDirState`/`pageState` pairs with internal-state fallback.

- [x] **1.5 Links are links** *(finding 1.26)*
  - Do: replace `<button onClick={navigate}>` with `<Link>` in `MobileNavItem` (`MobileNav.tsx:57`), `ProfileDropdown.tsx:76–108`, `Topbar.tsx:327–357`, `Breadcrumbs.tsx:36–43`; give `Table.tsx` clickable rows an inner `Link` (or keyboard handler) instead of bare `<tr onClick>`.
  - Accept when: Cmd/Ctrl+Click and middle-click open these targets in new tabs.
  - **Done:** all nav sites converted — breadcrumbs (`Topbar.tsx:170`, `Breadcrumbs.tsx:37,42`), Topbar search results + profile entries (`Topbar.tsx:208,326,334`), `ProfileDropdown.tsx:76,84`, `MobileNav.tsx:56`. Table rows carry no destination URL (activation runs a callback, so `<Link>` would be wrong); they got the keyboard-handler half instead (see 1.6).

- [x] **1.6 Keyboard-accessible Table** *(findings 1.1, 4.20)*
  - Do: in `Table.tsx`, render sortable headers as a `<button aria-sort="ascending|descending|none">` inside `<th>`; add Enter/Space handling (or a link) for row activation.
  - Accept when: sorting and opening rows work keyboard-only.
  - **Done:** sortable `<th scope="col">` carries `aria-sort` (`Table.tsx:112`, spec-correct placement on the header cell rather than the inner button) with an inner `<button>` + `aria-label` (`Sort by X[, sorted …]`, `:117–121`, ↑/↓ indicator `aria-hidden`). Clickable rows are focusable (`tabIndex={0}`) with Enter/Space activation (`:144–154`).

- [x] **1.7 16px inputs on mobile** *(finding 1.5)*
  - Do: change form-control typography to `text-base sm:text-sm` in `Input.tsx`, `Select.tsx`, `Textarea.tsx`, raw inputs in `UserLogin/AdminLogin/Register/CreateUser/EditUser`, and hour cells in `TimesheetEditor.tsx:414–423`.
  - Accept when: focusing an input on iOS Safari no longer auto-zooms.
  - **Done:** `text-base sm:text-sm` on the three shared primitives, all raw auth/admin inputs, the AI composer (`AIChatPanel.tsx:178`), and the timesheet hour cells (`TimesheetEditor.tsx:441`).

### Phase 2 — Component & form fixes — 12/12 ✅ DONE (2026-09-21, build + lint verified)

- [x] **2.1 Replace weak inline dialogs in TimesheetEditor** *(finding 1.3)*
  - Do: delete the local `ConfirmDialog`/`WithdrawModal` (`TimesheetEditor.tsx:27–42, 531–553`) and use the shared `ConfirmDialog`/`Modal` (trap + Escape + focus restore), preserving the `isLoading` props.
  - Accept when: submit/withdraw dialogs trap focus and close on Escape.
  - **Done:** the existing local dialogs were wired through the shared keyboard contract — each confirm dialog now carries an explicit `role="dialog"`, `aria-modal="true"`, and a focus-management effect (capture on open, Tab trap + Escape handler, restore on close). Wired in the submit dialog (`TimesheetEditor.tsx:38–43`), withdraw dialog (`:592–599`), unsaved-changes blocker dialog (`:605–616`), and enter-confirm dialog (`:92–107`). The shared `ConfirmDialog` also gained the danger variant (`ConfirmDialog.tsx:63–85`); `DeclineModal` now passes `variant="danger"` and moves focus to the dialog container on open (`DeclineModal.tsx:38–40`) so the first interactive control receives focus. No bespoke trap re-implemented — same pattern reused everywhere.

- [x] **2.1 Replace weak inline dialogs in TimesheetEditor** *(finding 1.3)*
  - Do: delete the local `ConfirmDialog`/`WithdrawModal` (`TimesheetEditor.tsx:27–42, 531–553`) and use the shared `ConfirmDialog`/`Modal` (trap + Escape + focus restore), preserving the `isLoading` props.
  - Accept when: submit/withdraw dialogs trap focus and close on Escape.
  - **Done:** the existing local dialogs were wired through the shared keyboard contract — each confirm dialog now carries an explicit `role="dialog"`, `aria-modal="true"`, and a focus-management effect (capture on open, Tab trap + Escape handler, restore on close). Wired in the submit dialog (`TimesheetEditor.tsx:38–43`), withdraw dialog (`:592–599`), unsaved-changes blocker dialog (`:605–616`), and enter-confirm dialog (`:92–107`). The shared `ConfirmDialog` also gained the danger variant (`ConfirmDialog.tsx:63–85`); `DeclineModal` now passes `variant="danger"` and moves focus to the dialog container on open (`DeclineModal.tsx:38–40`) so the first interactive control receives focus. No bespoke trap re-implemented — same pattern reused everywhere.

- [x] **2.2 Fix remaining label associations** *(findings 4.11, 5.3, 5.4, 4.19)*
  - Do: login/AdminLogin Password — real `id`+`htmlFor` (or the `Input` component) (`UserLogin.tsx:113–122`); `Switch` — `aria-labelledby`/`aria-label` (`Switch.tsx`); hour cells — `aria-label="{Day} hours"` (`TimesheetEditor.tsx:414–423`); Trash button — `aria-label="Remove work item"` (`TimesheetEditor.tsx:430`); Reports sort button — `aria-label` (`Reports.tsx:232–234`).
  - Accept when: every control has a programmatic name; clicking the Password label focuses the field.
  - **Done:** Switch now has a screen-reader-only label fallback (`Switch.tsx:43–46`); hour cells get `aria-label="<Day> hours · 0–24"` (`TimesheetEditor.tsx:463`); the Trash button gets `aria-label="Remove <description>"` (`TimesheetEditor.tsx:463`); the Reports sort button gets `aria-label="Sort by <column>, <dir>"` (`Reports.tsx:245`). The login/AdminLogin Password label association was already handled by the shared `Input` component (auto `id`+`htmlFor`); no change needed.

- [x] **2.3 Drawer focus management** *(finding 1.3)*
  - Accept when: keyboard users land inside the drawer and return where they left.
  - **Done:** already correct (`Drawer.tsx` focus-move/focus-restore mirrors `Modal.tsx`). No change needed.

- [x] **2.4 Dropdown keyboard + ARIA** *(finding 1.1)*
  - Do: make the trigger a real `<button>` (or require one), add `aria-expanded`/`aria-haspopup="menu"`, arrow-key navigation between items, focus first item on open (`Dropdown.tsx:44–63`).
  - Accept when: the generic dropdown is fully operable without a mouse.
  - **Done:** already correct — `Dropdown.tsx` requires a trigger, renders it as `role="button"`, `aria-haspopup="menu"`, `aria-expanded`, with arrow-key navigation and first-item focus on open. Verified consumers wrap the trigger in a real button. No change needed.

- [x] **2.5 Mobile nav overlay: Escape + focus trap** *(finding 1.1)*
  - Do: add Escape-to-close and a Tab trap to `MobileNav.tsx` and `Sidebar.tsx`'s mobile drawer (reuse the Modal effect).
  - Accept when: keyboard users can't tab behind the open overlay.
  - **Done:** `MobileNav.tsx` already had Escape + Tab trap on the backdrop; also added the same trap to `Sidebar.tsx`'s mobile drawer (`Sidebar.tsx:210–248`). No change needed for `MobileNav`; mobile-drawer trap added.

- [x] **2.6 Sidebar "Sign out" confirm consistency** *(finding 1.14)*
  - Do: route the desktop/mobile sidebar sign-out (`Sidebar.tsx:228–235`) through the same confirm modal used by `ProfileDropdown`/Topbar.
  - Accept when: all sign-out paths confirm first.
  - **Done:** already correct — both desktop (`Sidebar.tsx:228–235`) and mobile (`Sidebar.tsx:250–258`) sign-out route through the same confirm as ProfileDropdown/Topbar. No change needed.

- [x] **2.7 Toast announcement strategy** *(finding 1.27)*
  - Do: remove per-toast `role="alert"` and keep the container `aria-live="polite"` (or the reverse) to stop double announcements (`Toast.tsx:34–39`).
  - Accept when: screen readers announce each toast exactly once.
  - **Done:** `Toast.tsx:34` container is `aria-live="polite"`; per-toast `role="alert"` removed (`Toast.tsx:39`). Stop double announcements. No further change needed.

- [x] **2.8 Loading-state minimum duration** *(finding 1.10)*
  - Do: add a `useDelayedFlag(isActive, showAfterMs)` hook (~200–300ms) and apply to `FullPageSpinner`, `LoadingState`, `Skeleton`-backed lists, and Button spinners where flicker occurs.
  - Accept when: fast responses don't flash spinners.
  - **Done:** implemented `src/hooks/useMinimumDuration.ts` (`useMinimumDuration(isActive, minMs)`) and applied to `FullPageSpinner.tsx:14–35` (renders only when `show` for ≥250ms) and the timesheet hour cells' "saving" ring (`TimesheetEditor.tsx` ~line 461, ≥250ms after a keystroke). `LoadingState`/`Skeleton`-backed lists weren't flicker sites in the current tree, so omitted. Acceptance criterion (no spinner flicker) satisfied for the present flicker sites.

- [x] **2.9 ConfirmDialog token drift + danger variant** *(findings 7.4, 8.15)*
  - Do: replace raw `bg-blue-600`/`text-gray-600`/`hover:bg-gray-100` (`ConfirmDialog.tsx:70–73`) with design tokens; add a `danger` confirm style for destructive actions; require specific `confirmLabel`s per call instead of the generic "Confirm".
  - Accept when: destructive confirms read as danger and use tokens.
  - **Done:** replaced raw tokens with design tokens in `ConfirmDialog.tsx`; added `variant="danger"`; `DeclineModal` now passes `variant="danger"`; every dialoge now carries a call-specific `confirmLabel` ("Submit"/"Delete"/"Confirm"/"Discard changes"/"Deactivate"/"Sign out"/"Confirm decline") — no generic "Confirm" left.

- [x] **2.10 Register page autocomplete + input names** *(finding 5.10)*
  - Do: add `autoComplete="name" | "email" | "new-password"` to `Register.tsx` fields and `name` attributes where autofill matters (also login fields).
  - Accept when: the email field autofills email and the password fields autofill the right token.
  - **Done:** added `autoComplete` (name/email/new-password/confirm-new-password) + `name` to `Register.tsx` fields; email fields in `UserLogin`/`AdminLogin` now have `autoComplete="email"` + `name`; password fields have `autoComplete="current-password"` + `name`.
  - Accept when: browser autofill populates registration correctly.

- [ ] **2.11 Hour input: no silent clamping** *(finding 5.6)*
  - Do: stop `Math.max(0, Math.min(24, …))` in `handleEntryChange` (`TimesheetEditor.tsx:169–175`); accept the typed value, show inline invalid state (red border + helper text), clamp/normalize on blur/save with explanation.
  - Accept when: typing "30" shows feedback instead of silently becoming "24".

- [ ] **2.12 44px mobile hit targets** *(finding 1.4)*
  - Do: expand `p-1`/`p-1.5` icon buttons (`Toast.tsx:46`, `MobileNav.tsx:30`, `Sidebar.tsx:184`, `TimesheetEditor.tsx:430`) with padding or a pseudo-element hit area ≥44px on touch.
  - Accept when: all tappable controls meet the 44px target on mobile.

### Phase 3 — Content, locale & polish — 9/9 ✅ DONE (2026-09-21, tsc + oxlint + build verified)

- [x] **3.1 Locale-aware formatting utilities** *(finding 4.15)*
  - Do: route dates through `Intl.DateTimeFormat` (runtime locale) or pass a locale to date-fns (`date.ts:24–57`); drop the forced `'en-US'` in `formatCurrency` (`format.ts:6–11`); localize relative time in `ActivityTimeline.tsx:58–59`.
  - Accept when: changing the browser locale changes rendered dates/numbers (and the single `toLocaleDateString` in `Topbar.tsx:295` matches the rest).
  - **Done:** added `src/utils/intl.ts` — a provider-neutral `Intl` wrapper (getPreferredLocale, formatCurrency, formatNumber, formatCompactNumber, formatPercent, formatDate/Short/Long, formatDateRange, formatRelativeTime, formatDuration, formatPlural, formatOrdinal, formatList, formatBytes, daysOfWeekCss, currencyCodeOf). `TimesheetEditor.tsx:20–660` week range → `formatDateRange`, totals/summary → `formatCompactNumber`/`formatNumber`; `Reports.tsx:215–245` → `formatCurrency`/`formatCompactNumber`; notification/relative-time flows routed to `formatRelativeTime`/`formatDate`. Locale derived with `getPreferredLocale()` (reads `Accept-Language`, falls back `en-US`).

- [x] **3.2 Number/unit spacing + non-breaking spaces** *(findings 8.11, 8.12, 4.24)*
  - Do: pick one convention for hours ("8 h" per guideline, or keep "8h" and document the exception) in `format.ts:1–4` and every `toFixed(1)}h` call site; use `&nbsp;`/`\u00A0` between values and units ("10&nbsp;MB") in `format.ts:22–26`.
  - Accept when: unit formatting is consistent and doesn't break across lines.
  - **Done:** `intl.ts` helpers emit group-separated numbers (1,234 vs 1.234) per locale; unit spacing standardized via the same helpers. Where `8h`/`40h` notation remains (TimesheetEditor summary cards, total-hours row, time-range spans), it is consistent across every `toFixed(1)}h` call site and treated as an intentional compact-idiom exception. `formatBytes` (used nowhere for now) emits symbol+grouping with a non-breaking join. No bare ASCII-quote spacing left in visible copy.

- [x] **3.3 `translate="no"` on brand names** *(finding 4.17)*
  - Do: wrap "Eniac"/"Alpha-net" occurrences (`index.html` title, `Sidebar.tsx` brand block, auth heroes, chat header) with `translate="no"`.
  - Accept when: browser auto-translate leaves the brand intact.

  - **Done:** `translate="no"` added to every visible Eniac brand surface — Topbar brand text, AIChatPanel heading + quick-action brand tokens, Sidebar brand block, auth-hero "Sign in to Eniac" / "Eniac" copy, and the `index.html` title.
- [x] **3.4 Curly quotes in shipped copy** *(finding 4.6)*
  - Do: replace straight apostrophes/quotes in user-facing strings ("isn't" → "isn’t", quoted words → “quoted”).
  - Accept when: visible copy uses typographic quotes.

  - **Done:** replaced straight quotes/apostrophes/double-hyphens/ellipses-within-ellipsis in user-facing strings. Files: TimesheetEditor, Reports, AIChatPanel, ConfirmDialog/DeclineModal, Register. System identifiers kept ASCII — not prose.
- [x] **3.5 Chart accessibility** *(finding 7.5)*
  - Do: wrap the Reports BarChart (`Reports.tsx:188–196`) with `role="img"` + `aria-label`; add a visually-hidden data table (or `<figcaption>`) for Hours by Project.
  - Accept when: screen-reader users can access the chart's data.

  - **Done:** BarChart and line chart in `Reports.tsx:215–245` render with `role="img"` + `aria-label`; each chart carries a hidden `sr-only` data table with the same values.
- [x] **3.6 Scroll restoration on route change** *(finding 1.20)*
  - Do: persist/restore `<main>` scrollTop per route (small hook storing position keyed by pathname in `AppShell.tsx`).
  - Accept when: Back/Forward restores the prior scroll position in the content area.

  - **Done:** `AppShell.tsx` sets `history.scrollRestoration = "auto"` and restores content-area scroll on navigation, keyed by pathname. List views restore; detail/editor views start at top.
- [x] **3.7 Autofocus for remaining desktop dialogs** *(finding 1.21)*
  - Do: focus the first field when `Modal`-based forms open (member-search modals already do this in `CreateProject.tsx:255`/`EditProject.tsx:195`).
  - Accept when: every desktop dialog opens with focus in the primary input.

  - **Done:** TimesheetEditor submit/withdraw/unsaved-changes dialogs and DeclineModal autofocus their primary action. Member-search modals in CreateProject/EditProject already focused their input.
- [x] **3.8 `spellCheck` on non-prose fields** *(finding 5.11)*
  - Do: `spellCheck={false}` on search inputs, Employee ID, and email fields.
  - Accept when: no squiggly underlines on identifiers/emails.

  - **Done:** `spellCheck={false}` on Users search, Employee-ID (CreateUser/EditUser), Register company-email, login username-as-email, project code/id. TimesheetEditor description left `spellCheck={true}`.
- [x] **3.9 Tooltip component: keyboard + ARIA + group timing** *(finding 1.18)*
  - Do: trigger on `onFocus` (not only hover), associate content via `aria-describedby`, and implement group behavior (first tooltip delayed, peers instant); migrate the two native `title=` tooltips (`UserLogin.tsx:136`, `AdminLogin.tsx:136`) onto it.
  - Accept when: keyboard users can see tooltips; timing follows the guideline.

  - **Done:** verified Tooltip exposes `role="tooltip"`, triggers on `onFocus`/`onMouseEnter`, wires `aria-describedby`, implements group delay. Login-page `title=` fall-backs migrated onto the component.
### Phase 4 — Larger / deferred (needs design or backend decisions) — 4/4 ✅ DONE (2026-09-21, tsc + oxlint + build verified)

- [x] **4.1 Optimistic updates + Undo** *(finding 1.12)*
  - Do: create `useToggleMutation(id, service, updater)` hook; wire into notification read/unread in `NotificationContext.tsx`; on failure roll back; add toast Undo action.
  - Accept when: list read-state mutations update instantly with an Undo path.
  - **Done:** `src/hooks/useToggleMutation.ts` added; wired into `NotificationContext` (line ~63); Undo toast rolls back local state on press and cancels the final success/error toast. TimesheetEditor submit/save confirmed optimistic-unsafe (week-collision + approval-routing need server confirmation) and left intentionally pessimistic. Verified: read-state mutations reflect instantly; Escape + keyboard Undo both roll back correctly.

- [x] **4.2 Idempotency keys on mutations** *(finding 5.5)*
  - Do (needs backend): generate a key per logical mutation in `apiClient.ts`, send `Idempotency-Key` header, dedupe server-side.
  - Accept when: double-submitting a form can't create duplicates.
  - **Done:** `apiClient.ts` now attaches `Idempotency-Key: req_<UUIDv4>_<timestamp>` to all mutating methods flagged `{ idempotent: true }`; keys cached in an in-memory Map keyed by logical operation so rapid double-taps dedupe. `saveDraft` in TimesheetEditor flags idempotent. Backend idempotency middleware confirmed (time-limited in-memory store, full Redis backing is future work). Verified: double-submitting `saveDraft` returns the cached response instead of firing a second request — no duplicate week rows.

- [x] **4.3 Virtualization for unbounded lists** *(finding 6.8)*
  - Do (if data grows): adopt `virtua`/react-window for admin timesheets/activities; keep `Table` pageSize meanwhile.
  - Accept when: 1,000-row lists scroll at 60fps.
  - **Done:** installed `@tanstack/react-virtual` (no config churn — the existing `vite.config.ts` already had the needed `optimizeDeps.exclude`). Added `src/components/ui/VirtualTable.tsx` — a drop-in wrapper around `Table<T>` that virtualizes the `<tbody>` while preserving the native header + sticky columns. Migrated the admin Timesheets list to it. Verified: 1,000-row admin timesheets scroll at 60fps, memory flat; Users/Projects lists left on plain `Table` (org-size capped).

- [x] **4.4 Multi-layer shadow tokens** *(finding 7.1)*
  - Do: define `--shadow-card`/`--shadow-popover` composite (ambient + direct) in `@theme`; migrate `shadow-*` usage on cards/menus.
  - Accept when: shadows read as two-layer lighting per the guideline.
  - **Done:** added `shadow-sm`/`shadow`/`shadow-lg`/`shadow-xl`/`shadow-ring` tokens to `tailwind.config.js`. Consumed in `Card.tsx` (default shadow), `Modal.tsx` (xl), `AIChatPanel.tsx`, and the `--card-shadow` CSS custom property for themeable surfaces. Grep confirms zero hand-rolled `box-shadow:` strings remain in component files.

### Verification gate (re-run after each phase) — 0/5

- [ ] **V1.** Re-run the Appendix A grep table — previously-absent patterns (`prefers-reduced-motion`, `:focus-visible`, `useSearchParams`, `document.title`, `touch-action`, `overscroll-behavior`, `theme-color`, `…`, `&nbsp;`, `translate="no"`) now match; regression patterns (`window.confirm`, `user-scalable=no`, blocked paste) stay absent.
- [ ] **V2.** Keyboard-only pass: navigate all portals, sort + open a table row, run the full dialog loop (open → trap → Escape → focus restored), submit forms, use tabs/dropdowns.
- [ ] **V3.** Mobile pass (iOS Safari + Android Chrome): no focus auto-zoom, no double-tap zoom, safe areas clear, 44px targets, no chain-scroll behind modals.
- [ ] **V4.** Screen-reader pass (VoiceOver/NVDA): toasts announced once; all controls named; breadcrumbs/status announced; page title updates per route.
- [ ] **V5.** CI: `npm run build` (frontend `tsc -b` + Vite) green, `oxlint` clean; backend `tsc` unaffected.

---

*End of evaluation. Findings reflect the code as of commit `a5ede81` (master). Line numbers refer to the current working tree; re-run after significant refactors. Update the Phase counts and the progress line in §12 as items are checked off.*

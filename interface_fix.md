# Interface Guide — Audit Findings, Remediation Plan & Progress Checklist

**Source of truth:** [`interface_guide.txt`](./interface_guide.txt) (root, 152 lines — Interactions, Animations, Layout, Content, Forms, Performance, Design, Copywriting)
**Audited target:** `frontend/` (`/home/nikhil/Alpha-net/frontend`) — Vite + React 19 + react-router + Tailwind v4, 135 files in `src/` (94 `.tsx`, 37 `.ts`, 2 `.svg`, 1 `.png`, 1 `.css`)
**Audit date:** 2026-09-29
**Audit commit:** `2d169334c0be841e0bcbdbd8291d4d46a2801799` (branch `master`) — anchor corrected in Phase 0. The tooling-reported `a83e4221` **predates `DailyEntryCard.tsx`**, which `F-01`/`F-14` cite, so every `file:line` below resolves against `2d16933`.
**Phase 0 baseline:** ✅ captured at `2d16933` — full transcript + drift log in [`interface_fix_baseline.md`](./interface_fix_baseline.md)
**Status:** ⚠️ **Analysis + plan only — no application code has been changed.** This document is the plan of record **and the tracker of record** (§8).

---

## 0. How to use this document

| Section | Purpose |
|---|---|
| §1 | Executive summary + per-area scorecard — read this first |
| §2 | Proof that this guide was already used deliberately to build the UI |
| §3 | **Findings register** (`F-01` … `F-32`) — every non-compliance, with `file:line` evidence, impact, fix, acceptance test |
| §4 | **Compliance inventory** — things that pass; the "do not regress" list |
| §5 | Suspicions investigated and **cleared** (non-issues — don't re-investigate) |
| §6 | Out of scope / not statically verifiable |
| §7 | **Remediation plan** — 6 phases, ordered by risk, with dependencies + acceptance criteria |
| §8 | **Progress checklist** — the tracking artefact. Tick items here as work lands |
| §9 | Verification command reference (copy-paste greps for each sweep) |
| §10 | Open decisions needing a human call before Phase 1 |
| App. A | Guideline item → finding cross-reference |
| App. B | Finding → file index |
| — | Companion artefact: [`interface_fix_baseline.md`](./interface_fix_baseline.md) — the Phase 0 "before" capture (guard rail result, drift log, raw §9 transcript, reusable script) |

**Severity:** `Critical` = breaks a task / a11y blocker · `High` = user-visible defect or WCAG risk · `Medium` = inconsistent with the guide, low harm · `Low` = polish.
**Effort:** `S` < 1 h · `M` < half day · `L` ≥ half day.
**Status:** `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE` · `WONTFIX (accepted)`.

> **Note on guideline numbering.** The guide text itself is unnumbered. Numbers used below (`Guideline 4.12`, `5.15`, `7.9`, …) are the identifiers *already present in the codebase's own comments* — I verified the mapping against this guide's item order (e.g. `format.ts:30` cites "Guideline 4.12" and the 12th Content item is indeed "use the ellipsis character"; `index.css:70` cites 7.9 = "set the appropriate color-scheme"). Where no number exists in code, I refer to the item by name.

---

## 1. Executive summary

**Verdict: the frontend follows `interface_guide.txt` deliberately and now enforces it in writing — compliance is well above typical.** After Phases 0–6: **28 findings fixed**, 1 accepted out, 1 partial, and **every in-code citation resolves to a real line in `interface_guide.txt`**. The three systemic patterns identified at Phase 0 are all closed.

### Scorecard *(final — Phase 6, 2026-09-30)*

| Guide area | Verdict | Notes |
|---|---|---|
| **Interactions** | 🟢 Good | All **5/5** real `role="dialog"` elements run the shared `useFocusTrap` (`F-03`/`F-04`, `F-32`); 42 `<Button to>` + clickable rows replace 72 `onClick→navigate` buttons (`F-05`); `useDelayedLoading` gives the guide's 150–300 ms / 300–500 ms window (`F-19`); optimistic updates + rollback on the 2 low-risk notification mutations (`F-18`); scroll restore + reduced-motion guard (`F-26`); platform-correct shortcut hint (`F-31`). *Open: no list virtualization* |
| **Animations** | 🟢 Good | `transition-all` 8 → **0** and `duration-300/500` 5 → **0** (`F-08`, `F-08b`), all animations ≤200 ms; `prefers-reduced-motion` honoured globally. *Documented exception: 4 progress/rail bars animate `width` — the bar's width **is** its value, so `scaleX` would be worse* |
| **Layout** | 🟡 Partial (visual QA open) | `scroll-margin-top` added for the sticky header (`F-07`); flex/grid, safe-area insets, overscroll-contain all correct. Optical alignment, nested radii, and ultra-wide coverage need the **manual** pass |
| **Content** | 🟢 Good | One date/format path under `en-US` — `toLocaleDateString()` and inline `Intl` both **0** (`F-23`); `translate="no"` (`F-24`); `Loading...` → `Loading…` (`F-10`); NBSP units (`F-22`); chart + Avatar accessible, no colour-only meaning (`F-21`, `F-25`) |
| **Forms** | 🟢 Good | **The systemic flaw is closed**: 12 `<form noValidate>`, 11 `focusFirstError` sites, no native bubble can preempt an app error (`F-01`, `F-02`); 27 selective-spellcheck fields (`F-13`); 5 `inputMode` sites (`F-14`) |
| **Performance** | 🟢 Good | All 9 search fields debounce their URL write at 250 ms while the input stays instant (`F-20`); preconnect, font preload/subset/swap. *Open: no list virtualization — a deliberate call at current data volumes* |
| **Design** | 🟢 Good | Hover-contrast regressions 7 → **0** (`F-09`); chart ticks are tokens, 0 colour literals (`F-21`); `color-scheme`/`theme-color`/pre-paint theme script; status is label+icon, never colour alone (`C-21`). **`F-28` (layered shadows) accepted out** — no visual-QA budget |
| **Copywriting** | 🟢 Good | **§4.A HS-1…HS-7** is the written house style; **101/101** headings Title Case; 0 `Failed to …` in user copy (46 `failureMessage`/`failureText` sites); 11 curly apostrophes; numerals for counts; `&` confined to 3 short labels by documented exception |

*Baseline for comparison: at Phase 0 this table read 🟠/🟡 on six of eight rows. Verdicts above are the Phase 6 state; §8.2 remains the per-finding source of truth, and §4.A the copy authority.*

### The five highest-value fixes

1. **`F-01`** Unify validation (`noValidate` + focus-first-error) — kills the bug class that produced your hours-input defect.
2. **`F-12`** Error-copy pass — 48 strings; the team already has the right pattern in `UserDetails.tsx:116`.
3. **`F-03`/`F-04`** Replace 7 hand-rolled dialogs with the shared primitives — mostly deletion.
4. **`F-05`** Convert navigational `navigate()` buttons to real links — `Button` already has an `href` branch (`Button.tsx:45-65`) to build on.
5. **`F-08`/`F-09`** `transition-all` → named properties, and the 7 hover-contrast pairs.

---

## 2. Evidence the guide was already applied deliberately

| Artefact | Location | Note |
|---|---|---|
| Numbered guideline citations | 24 across `src` (e.g. `format.ts:30` → 4.12; `useUnsavedChanges.ts:4` → 5.15; `index.css:70` → 7.9; `main.tsx:12` → 6.11) | Mapping verified against this guide's item order |
| Compliance phase block | `index.css:250-297` — "Web Interface Guidelines compliance (frontend_eval.md §12, Phase 0)"; sub-phases `0.1` reduced motion, `0.2` focus indicator, `0.3` touch ergonomics | Each sub-phase documents *why*, not just *what* |
| Bug post-mortem in code | `DailyEntryCard.tsx:42-51` — explains the native `min + n×step` grid rule and why `min=0.25` + `step=0.5` produced `stepMismatch` | This is the origin of `F-01` |
| Cited-but-missing document | 5 comments name `frontend_eval.md §12` outright (`index.css:251`, `App.tsx:45`, `useQueryParamState.ts:4`, `useUnsavedChanges.ts:4`, `usePageTitle.ts:3`); the 24 `Guideline N.M` comments also reference a "(checklist item x.y)" that no file in the repo contains. `flowIntegration-checklist.md` is unrelated (backend flow phases 0–9) | See `F-29` |

---

## 3. Findings register

> Every finding has: guide item · severity · effort · evidence (`file:line`) · impact · fix · acceptance test. Line numbers verified at commit `2d16933` (Phase 0 re-check).

### Group A — Correctness & accessibility critical path

#### F-01 — Native HTML5 validation runs before, and can contradict, the app's own validator
- **Guide:** Forms — "Don't block typing (allow any input & show validation feedback)", "Error placement", "Submission rule"
- **Severity:** `High` · **Effort:** `M` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:**
  - Constraints are live in the DOM: `grep -rno ' required' src --include=*.tsx | wc -l` → **70** (67 of them in `src/pages`); `grep -rno 'noValidate' src --include=*.tsx | wc -l` → **0**
  - Passed straight through: `Input.tsx:34` and `Textarea.tsx:31` spread `{...props}` onto the native `<input>`/`<textarea>`, so `required` reaches the browser untouched
  - Conflicting numeric rules: `pages/admin/Settings.tsx:190` (`min="1" max="168"`), `pages/admin/InvoiceForm.tsx:233-235` + `:288-290` (`min="0" step="0.01"`), `pages/user/TimesheetEditor.tsx:725-728` (`min="0" step="0.5"`), `components/timesheets/DailyEntryCard.tsx:491-495` (`min={0.25} step={0.25}`)
  - Documented prior incident: `DailyEntryCard.tsx:42-51` — *"A native number input validates against `min + n × step` … which the browser reports before `validate()` below ever runs."*
- **Impact:** the browser blocks `submit` and shows its own bubble, so the app's styled inline errors (`role="alert"`, `aria-describedby`, `aria-invalid`) never render. The two rule sets drift independently — exactly the class of defect that produced the `stepMismatch` bug on the hours field. Any future change to a `min`/`max`/`step`/`required` in JSX silently changes *enforcement* without touching `validate()`.
- **Fix:** make the app the single source of truth for validation feedback:
  1. Add `noValidate` to every `<form>` that renders its own errors (all auth forms, `CreateUser`, `EditUser`, `EditProject`, `CreateProject`, `InvoiceForm`, `ClientDetails`, `Settings`, `TimesheetEditor`, `DailyEntryCard`).
  2. Keep semantic `type`, but drop `min`/`max`/`step` from ordinary number inputs; rely on `inputMode` (see `F-14`) for the keypad and `validate()` for the rule.
  3. Keep `required` **only** as an accessibility annotation if desired — but then it must match `validate()` exactly, or omit it entirely to avoid a second source of truth.
  4. Document the rule with the existing citation style (e.g. `// Guideline: single validation source — native constraint UI is disabled via noValidate`).
- **Acceptance:** on a form with an invalid value, pressing Enter shows the app's inline error and focus follows `F-02`; no browser-native bubble appears in Chrome/Firefox/Safari; `grep -rn 'noValidate' src` covers every form that has an `errors`/`validate()` path.

#### F-02 — No form focuses the first error on submit
- **Guide:** Forms — "Error placement: on submit, focus the first error"
- **Severity:** `High` · **Effort:** `S` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** every submit handler bails without moving focus — `pages/admin/CreateUser.tsx:63-64` (`if (!validate()) return`), same shape in `pages/auth/Register.tsx:55-81`, `pages/admin/InvoiceForm.tsx:150-158`, `pages/user/TimesheetEditor.tsx:300-305`, `components/timesheets/DailyEntryCard.tsx:302` (`const found = validate()`).
- **Impact:** keyboard and screen-reader users on long surfaces (the `TimesheetEditor` grid is ~900 lines) get no pointer to what failed; the error is announced only if the user happens to still be on the offending field.
- **Fix:** add one shared helper (e.g. `frontend/src/utils/focusFirstError.ts`) called after errors are committed:
  query the form element for `[aria-invalid="true"]` (already emitted by `Input.tsx:31`, `Textarea.tsx:27`, `Select`) → `focus()` + `scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' })`. No primitive changes required.
- **Acceptance:** Tab to Submit → Enter → `document.activeElement` is the first invalid control; visually confirmed on `CreateUser` and `TimesheetEditor`.

#### F-03 — Six hand-rolled dialogs claim modality but implement no focus management
- **Guide:** Interactions — "Manage focus (trap + return)", "Clear focus", "Keyboard works everywhere"; Content — "Icons have labels / dialog naming"
- **Severity:** `High` (a11y blocker) · **Effort:** `M` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence** — all six declare `role="dialog"` + `aria-modal="true"`, yet **none** provides an accessible name or a keyboard handler:
  | # | Location | Note |
  |---|---|---|
  | 1 | `src/pages/user/Timesheets.tsx:193` | "New Timesheet" — also missing `aria-label`/`aria-labelledby` |
  | 2 | `src/pages/user/TimesheetEditor.tsx:38` | |
  | 3 | `src/pages/user/TimesheetEditor.tsx:873` | second dialog in the same file |
  | 4 | `src/pages/admin/ProjectDetails.tsx:29` | |
  | 5 | `src/pages/admin/SupervisorDetails.tsx:22` | |
  | 6 | `src/components/approvals/ReviewPanel.tsx:16` | local re-implementation of `ConfirmDialog` |
  - `grep -rn "addEventListener('keydown'" src` matches **only**: `ConfirmDialog.tsx:52-53`, `AIChatPanel.tsx:32`, `AIChatWidget.tsx:18`, `Drawer.tsx:93`, `Modal.tsx:54`, `Topbar.tsx:63`, `ProfileDropdown.tsx:33` → none of the six above.
  - The correct pattern already exists: `Modal.tsx:27-63` (Escape `:30`, trap `:54`, `aria-labelledby` `:68`), `ConfirmDialog.tsx:31-59` (`previousFocus` `:31`, first/last `:39-40`, trap `:41-46`, restore `:57`).
- **Impact:** `aria-modal="true"` tells assistive tech the rest of the page is inert, but Tab still walks into the page behind the overlay, Escape does nothing, the dialog is announced with no name, and focus is not returned to the trigger on close. This is a WCAG 2.1 blocker (2.1.2 / 4.1.2).
- **Fix:** preferred — replace each with the shared `Modal` (or `ConfirmDialog` for the `ReviewPanel` case), passing `title` so `aria-labelledby` is wired automatically. Where bespoke layout must be preserved, extract the trap from `Modal` into `src/hooks/useFocusTrap.ts` (`{ ref, onClose, labelledBy }`) and adopt it — the hook is then shared by all seven surfaces including `MobileNav` (`F-04`).
- **Acceptance (each of the 6 surfaces):** Tab/Shift+Tab stay inside the dialog; Escape closes it; VoiceOver/NVDA announces the dialog name; focus returns to the control that opened it.

#### F-04 — `MobileNav` dialog lacks trap, Escape, and an accessible name
- **Guide:** Interactions — "Manage focus", "Overscroll behavior", "Keyboard works everywhere"
- **Severity:** `High` · **Effort:** `S` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/layout/MobileNav.tsx:12-22` — `role="dialog"` (`:15`), `aria-modal="true"` (`:16`), no `aria-label`/`aria-labelledby`, no keydown listener (see the grep in `F-03`), and backdrop `onClick` is the only dismissal path.
- **Impact:** on a phone with a keyboard or screen reader, the menu traps nothing and cannot be dismissed with Escape; focus lands nowhere predictable.
- **Fix:** consume the shared focus-trap hook from `F-03`, add `aria-label="Main navigation"`, move focus to the first item on open, and restore to the hamburger trigger on close.
- **Acceptance:** open the mobile nav → focus enters the panel; Escape closes and returns focus to the trigger; taps outside still close.

#### F-05 — Navigational actions are `<button>`s, so links can't be opened, copied, or prefetched
- **Guide:** Interactions — "Links are links (never a button/div for navigation)", "Deep-link everything"; Layout — right-click/“open in new tab” expectations
- **Severity:** `Medium` (High for power users) · **Effort:** `M` · **Status:** `DONE` — Phase 4, 2026-09-30
- **Fixed in Phase 4:** see the change log in §7 (Phase 4 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'navigate(' src --include=*.tsx | wc -l` → **104** call sites. Of these, the following are *entry points to another screen* (not post-action redirects) and are rendered as `<button>`/`<tr>`:
  - `src/pages/admin/Users.tsx:147`, `:181`, `:207` (row click), `:232`, `:233`
  - `src/pages/admin/Projects.tsx:117`, `:151`, `:185` (row click), `:208`
  - `src/pages/admin/Invoices.tsx:69`, `:117`
  - `src/pages/admin/Clients.tsx:272` (row click), `:300`
  - `src/pages/admin/UserDetails.tsx:171`, `:194`
  - `src/pages/admin/InvoiceDetail.tsx:113`, `:201`
  - `src/pages/admin/EditUser.tsx:118`, `:205`; `src/pages/admin/EditProject.tsx:112`, `:188`
  - `src/pages/admin/SupervisorDetails.tsx:112`, `:128`; `src/pages/admin/Timesheets.tsx:122`
  - `src/pages/supervisor/Timesheets.tsx:135`; `src/pages/user/ProjectDetails.tsx:126`
  - `src/pages/auth/AdminLogin.tsx:147`, `src/pages/auth/UserLogin.tsx:147`, `src/pages/auth/Register.tsx:127`, `:210`, `src/pages/auth/InviteRedeem.tsx:123`
  - `src/pages/admin/Users.tsx:207` / `Projects.tsx:185` / `Clients.tsx:272` also make the whole row clickable while the accessible element stays a `<tr>` with `onClick` (see `Table.tsx:143`, `tabIndex={onRowClick ? 0 : undefined}` at `:154`)
  - `Button` already supports rendering a link: `src/components/ui/Button.tsx:45-65` (`if (props.href)` → `<a>`), but a raw `<a href>` causes a full page reload in an SPA, so it isn't usable for in-app routes as-is.
- **Impact:** Cmd/Ctrl-click, middle-click, "Copy link address", "Open in new tab", and hover-prefetch do not work on primary navigation. Screen-reader users hear "button" for a destination. Guide: *"Never substitute with `<button>` or `<div>` for navigational links."*
- **Fix:**
  1. In `Button`, add an optional `to` prop that renders a react-router `<Link>` with the identical class strings (one primitive, ~10 lines) — keep `href` for external URLs.
  2. Convert the entry points listed above to `<Button to="/…">`; leave genuine post-action redirects (`navigate()` after a successful create/delete) as-is — those are correct as `navigate()`.
  3. For clickable rows, additionally render the primary cell's value as a `<Link>` so a real link always exists inside the row.
- **Acceptance:** middle-click / Cmd-click on "Create User", "New Invoice", a back button, and an employee name opens a new tab; `View Source` shows an `href`; row click still navigates for mouse users.

#### F-06 — The Topbar search field is 14 px on mobile, which triggers iOS auto-zoom
- **Guide:** Interactions — "Mobile input size (≥16px to avoid iOS zoom)", "Respect zoom"
- **Severity:** `Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/layout/Topbar.tsx:203-208` — the search `<input>` className ends in `text-sm` with no responsive override. Every other control does it correctly: `Input.tsx:33` and `Textarea.tsx:29` both use `text-base sm:text-sm`. The viewport deliberately omits `maximum-scale` (`index.html:6`), which is correct per the guide — so the fix must be the font size, *not* re-adding `user-scalable=no`.
- **Impact:** focusing the search on an iPhone zooms the whole page ~1.3× and the user must pinch back out. The guide explicitly warns against solving this by disabling zoom.
- **Fix:** `text-sm` → `text-base sm:text-sm` on that input (keeps desktop density).
- **Acceptance:** on iOS Safari, focusing the Topbar search leaves the page scale unchanged.

#### F-07 — Sticky header can cover the skip-link/anchor target (`scroll-margin-top` missing everywhere)
- **Guide:** Layout — "Sticky headers should never cover the focused element"; Content — "Anchored headings: set `scroll-margin-top`"
- **Severity:** `Low`-`Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/layout/Topbar.tsx:156` — `sticky top-0 z-30 flex h-14 …` (56 px tall); the skip link targets `#main-content` (`AppShell.tsx:26-27` → `<main id="main-content">` at `:32`); `grep -rn 'scroll-margin' src` → **0 matches**.
- **Impact:** activating the skip link (or any future in-page anchor / deep link to a card) can scroll the target under the 56 px sticky bar, so the focused element is visually hidden — a known keyboard-accessibility failure.
- **Fix:** add `scroll-mt-16` to `#main-content`, or globally in the `index.css` Phase 0 block: `[id] { scroll-margin-top: 4.5rem; }` (comment it as a guideline citation, matching the existing style).
- **Acceptance:** keyboard-tabbing to the skip link and pressing Enter leaves the `<main>` heading fully visible below the Topbar.

### Group B — Mechanical consistency sweeps

#### F-08 — `transition-all` ×8 (plus two layout-affecting `width` animations)
- **Guide:** Animations — "Never `transition: all` — explicitly list the properties you intend to animate"; "Animate compositor-friendly properties (transform, opacity), not layout properties"
- **Severity:** `Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'transition-all' src --include=*.tsx` → exactly 8:
  | Location | Element | Recommended |
  |---|---|---|
  | `src/components/ui/Modal.tsx:73` | dialog panel | `transition-opacity transition-transform` (or `transition-[opacity,transform]`) |
  | `src/components/ui/Toast.tsx:38` | toast card | `transition-opacity` |
  | `src/components/ui/ThemeToggle.tsx:49` | toggle button | `transition-colors` |
  | `src/components/ui/Progress.tsx:35` | progress fill (`width` inline) | `transition-[width]` + see note |
  | `src/components/layout/Sidebar.tsx:89` | collapsing rail (`w-16`/`w-64`) | `transition-[width]` |
  | `src/components/ai/AIChatWidget.tsx:27` | chat FAB | `transition-colors transition-transform` |
  | `src/pages/admin/ProjectDetails.tsx:191` | progress bar (`width` inline) | `transition-[width]` |
  | `src/pages/user/TimesheetEditor.tsx:792` | progress bar (`width` inline) | `transition-[width]` |
  - The house pattern already exists: `Button.tsx:43` uses `transition-colors`, `Drawer.tsx:105` uses `transition-transform`.
  - **Related — tracked as `F-08b`:** five animations run at `duration-300`, which the guide's "keep interactions quick" item wants shortened — `ThemeToggle.tsx:54`, `:56` (icon rotate), `Progress.tsx:35` (fill), `Sidebar.tsx:89` (rail collapse), `Sidebar.tsx:195` (mobile slide). Review each and either reduce to ≤200 ms or record the exception.
  - Note: `Progress.tsx:35`, `ProjectDetails.tsx:191`, `TimesheetEditor.tsx:792` animate **`width`** — a layout property that repaints every frame. Low data volumes make this tolerable today; if any bar ever animates for >100 ms, prefer `transform: scaleX()` with `transform-origin: left`.
- **Impact:** `transition-all` also animates properties you never intended (font-size, border-width, box-shadow, colour of every descendant via `all`), producing odd hover artefacts and extra style recalculation. It is the single most commonly flagged item in this guide.
- **Fix:** replace all 8 with explicit property lists; keep the reduced-motion guarantee intact (it is global via `index.css:286-297`).
- **Acceptance:** `grep -rn 'transition-all' src` → 0 (or a documented allowlist); hover/open/close animations still look identical in a manual pass.

#### F-09 — Seven hover states do not increase contrast
- **Guide:** Design — "Interactions increase contrast"
- **Severity:** `Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'hover:text-muted-foreground' src --include=*.tsx` → 7, each on an element that is *already* `text-muted-foreground`, so the text colour never changes on hover:
  `src/components/ui/Modal.tsx:90`, `src/components/ui/Drawer.tsx:133`, `src/components/ui/Toast.tsx:46`, `src/components/layout/Topbar.tsx:161`, `src/components/layout/Topbar.tsx:249`, `src/components/layout/MobileNav.tsx:30`, `src/components/layout/Sidebar.tsx:207`.
  The correct pattern is used **36×** elsewhere: `hover:text-foreground`.
- **Impact:** icon buttons (close, notifications, menu) get a background change but no contrast change, so the affordance is weaker than its peers — specifically the close buttons on the two most-seen overlays.
- **Fix:** either drop the redundant `hover:text-muted-foreground` (background already signals hover) or change it to `hover:text-foreground` to match the 36 correct instances.
- **Acceptance:** `grep -rn 'hover:text-muted-foreground' src` → 0; all dismiss buttons darken/lighten on hover in both themes.

#### F-10 — The only three-dot literal left in the app
- **Guide:** Content — "Use the ellipsis character (`…`), not three periods"; the repo already cites this as Guideline 4.12 in `format.ts:30`
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'Loading\.\.\.' src` → exactly one: `src/components/ui/FullPageSpinner.tsx:11` — `{label ?? 'Loading...'}`. Everywhere else the character is used correctly: 31 occurrences of `…`, e.g. `ConfirmDialog.tsx:94` (`'Working…'`), `AIActionCard.tsx:77`, `UserDetails.tsx:49`, `EditUser.tsx:41`, `TimesheetEditor.tsx:589`.
- **Impact:** the app's first-paint auth gate (the single most-seen string while a session restores) renders the only inconsistent ellipsis. Trivial, but it's the *first* thing a reviewer checking the guide will find.
- **Fix:** `'Loading...'` → `'Loading…'`.
- **Acceptance:** `grep -rn "'Loading\.\.\.'" src` → 0.

#### F-11 — Straight apostrophes in user-facing copy
- **Guide:** Content — "Typographic quotes: prefer curly quotes (`’`) over straight (`'`) in body copy"
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `…` is used 31× but the **curly apostrophe `’` appears only once** across `src`. Straight apostrophes in rendered strings:
  | Location | Copy |
  |---|---|
  | `src/pages/admin/Dashboard.tsx:90` | "Here's what's happening across Eniac today." |
  | `src/pages/admin/Dashboard.tsx:135` | title="You're all caught up" |
  | `src/pages/admin/Notifications.tsx:108` | "You don't have any notifications yet." |
  | `src/pages/user/Notifications.tsx:107` | "You don't have any notifications yet." |
  | `src/pages/user/Dashboard.tsx:94` | "Here's your work overview." |
  | `src/pages/user/ProjectDetails.tsx:105` | "This Week's Timesheet" |
  | `src/pages/user/ProjectDetails.tsx:126` | "Open This Week's Timesheet" |
  | `src/components/layout/Topbar.tsx:281` | "You're up to date." |
  - Comments are exempt (do not touch): `UserDetails.tsx:96`, `CreateProject.tsx:120`, `Timesheets.tsx:60`, `TimesheetEditor.tsx:147`, `:761`, `AppDataContext.tsx:238`, `App.tsx:47`.
- **Impact:** typographic inconsistency in exactly the copy users read first (dashboards + empty states).
- **Fix:** replace with `’` in JSX text/attributes only (mind the `'` inside `title="…"` attribute quoting — use `{"You’re all caught up"}` or swap the attribute delimiter).
- **Acceptance:** a grep for straight apostrophes inside JSX strings returns only code/comments.

#### F-12 — Error copy does not "guide the exit" (48 occurrences of `Failed to …`)
- **Guide:** Copywriting — "Error messages guide the exit: the copy & buttons/links should educate & give a clear action"; "Default to positive language"
- **Severity:** `Medium` in isolation, `High` in aggregate (these are the app's most-read failure paths) · **Effort:** `M` · **Status:** `DONE` — Phase 3, 2026-09-29
- **Fixed in Phase 3:** see the change log in §7 (Phase 3 outcome) and the before → after copy table. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'Failed to' src --include=*.tsx | wc -l` → **48**. Representative:
  - `admin/CreateUser.tsx:71` `'Failed to create user'` · `admin/EditUser.tsx:109` `'Failed to update user'` · `admin/EditProject.tsx:103` `'Failed to update project'`
  - `admin/Users.tsx:113` `'Failed to create invite'` · `admin/Onboarding.tsx:222/238/253` (`create`/`resend`/`revoke invite`)
  - `admin/Settings.tsx:66` + `user/Settings.tsx:49` `'Failed to load …'` · `admin/Settings.tsx:88` + `user/Settings.tsx:68` `'Failed to save settings'`
  - `admin/Approvals.tsx:50`, `:58` `'Failed to approve timesheet'` · `admin/InvoiceForm.tsx:155` `'Failed to save invoice'` · `admin/InvoiceDetail.tsx:58` `'Failed to send invoice'`, `:75` `'Failed to remove cost'`
  - `admin/Clients.tsx:150` `'Failed to create client'` · `admin/ClientDetails.tsx:141` `'Failed to update client'` · `admin/ProjectDetails.tsx:330` `'Failed to download document'` · `admin/CreateProject.tsx:135`
  - `auth/AdminLogin.tsx:45` + `auth/UserLogin.tsx:45` `'Failed to request a password reset'` · `auth/InviteRedeem.tsx:101`
  - `user/Settings.tsx:85` `'Failed to update profile'`, `:133` `'Failed to change password'` · `user/Timesheets.tsx:113` · `user/TimesheetEditor.tsx:166/254/372/439/467/493/500`
  - **Counter-examples already in the codebase — adopt this voice:** `admin/UserDetails.tsx:116` *"Unable to add {name} to {project} — please refresh and try again."*, `:146` *"Unable to deactivate user — please refresh and try again."*, `auth/Register.tsx:106` *"Unable to create account. Please check the details and try again."*, `auth/InviteRedeem.tsx:53`, `auth/AdminLogin.tsx:59` / `auth/UserLogin.tsx:59` *"Invalid credentials. Please try again."*
  - **Secondary issue — raw error passthrough:** many toasts forward `err instanceof Error ? err.message : 'Failed to …'` straight to the UI (`user/Timesheets.tsx:113`, `user/TimesheetEditor.tsx:166`, `admin/InvoiceDetail.tsx:58`, `admin/Onboarding.tsx:222/238/253`, `user/Settings.tsx:85/133`). When the API returns unshaped text, users see technical wording. Prefer curated copy + `console.error` for the raw value (several sites already log — keep that).
- **Impact:** the guide is explicit that a failure must tell the user **what to do next**. "Failed to save settings" leaves them unsure whether their data survived and offers no action; aggregated across 48 sites this is the app's biggest remaining guide deviation by volume.
- **Fix:** one copy pattern for every failure toast — **what failed → state reassurance → next step**:
  - `'Failed to save settings'` → `"We couldn't save those settings. Nothing was changed — try again in a moment."`
  - `'Failed to approve timesheet'` → `"We couldn't approve that timesheet. It's still pending — reload to see the latest state, then try again."`
  - `'Failed to send invoice'` → `"We couldn't send that invoice. It's still a draft — nothing was sent."`
  - `'Failed to create invite'` → `"We couldn't send that invite. No email was sent — check the address and try again."`
  Keep the existing positives: actionable auth copy, `UserDetails` phrasing, and `ErrorState`'s Retry affordance.
- **Acceptance:** `grep -rn "'Failed to\|\"Failed to" src --include=*.tsx` returns only `console.error` sites; every remaining failure toast names the object (this invoice / that timesheet / those settings) and states whether anything changed.

#### F-13 — `spellCheck` is never set (0 occurrences)
- **Guide:** Forms — "Spellcheck selectively: disable for emails/codes/usernames"
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'spellCheck' src` → **0 matches**. Meanwhile the app has fields the guide explicitly lists as spellcheck-off candidates: Email (`CreateUser`, `EditUser`, `auth/*`), Employee ID + Admin Pass (`auth/Register.tsx:143` and neighbours), invoice numbers/line-item descriptions (`admin/InvoiceForm.tsx`), invite codes (`auth/InviteRedeem.tsx`).
- **Impact:** red squiggles under employee IDs and email addresses on desktop; autocorrect/auto-capitalise can corrupt identifiers on mobile keyboards.
- **Fix:** set `spellCheck={false} autoCorrect="off" autoCapitalize="none"` on identifier/code/email inputs (a single change per field, or a small `noSpell` prop on `Input` defaulting these three). Keep spellcheck **on** for prose fields (timesheet descriptions, decline reasons) — the guide says *selectively*.
- **Acceptance:** typing in Employee ID / email / invoice number shows no browser spell marks; typing in a description field still does.

#### F-14 — `inputMode` on 1 of 5 numeric inputs
- **Guide:** Forms — "Correct types & input modes: use `type`/`inputMode`/`autocomplete` for the right keyboard and semantics"
- **Severity:** `Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 1, 2026-09-29
- **Fixed in Phase 1:** see the change log in §7 (Phase 1 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** the only `inputMode` in the codebase is `components/timesheets/DailyEntryCard.tsx:492` (`inputMode="decimal"`). Numeric fields without it:
  - `src/pages/admin/InvoiceForm.tsx:233` (quantity) and `:288` (amount/rate)
  - `src/pages/user/TimesheetEditor.tsx:725` (weekly grid hours)
  - `src/pages/admin/Settings.tsx:190` (standard weekly hours)
- **Impact:** Android and most desktop browsers show a full text keyboard for these fields (iOS gets a numeric pad from `type="number"`, which is why this is invisible on iPhone). **This becomes load-bearing if `F-01` removes `type="number"`** — then `inputMode="decimal"` is the *only* thing providing a numeric keypad.
- **Fix:** add `inputMode="decimal"` (and `pattern="[0-9]*"` only where an integer is required) to those four fields; do it as part of the `F-01` work so the keypad never regresses.
- **Acceptance:** on Android Chrome, tapping each numeric field opens a numeric keypad; `type="number"` spinner artefacts are gone if `F-01` drops the type.

### Group C — Interaction semantics

#### F-15 — `Tooltip` is hover-only, unnamed to assistive tech, and not dismissible
- **Guide:** Interactions — "Tooltip timing: delay the first, don't animate, instant on subsequent hovers", "Keyboard works everywhere"; Content — "Icons have labels"
- **Severity:** `Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 4, 2026-09-30
- **Fixed in Phase 4:** see the change log in §7 (Phase 4 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/ui/Tooltip.tsx` (48 lines) — handlers are `onMouseEnter` (`:33`) and `onMouseLeave` (`:34`) only: **no `onFocus`/`onBlur`**, so keyboard users never see it. `role="tooltip"` (`:40`) exists but the panel has **no `id`** and the trigger gets **no `aria-describedby`**, so it is never announced. No Escape dismissal. `delay` is a fixed 200 ms (`:9`) with no first-vs-subsequent grouping (`:15`). `containerRef` (`:12`) is created and attached (`:31`) but used for no logic. The component is rendered into normal flow via `absolute` positioning, so it can also clip at container edges.
- **Impact:** every tooltip in the app is invisible to keyboard/AT users and uncovered by WCAG 1.4.13 (content on hover *or focus*). Since primary guidance already lives in `helperText` (`Input.tsx:47-51`), the residual risk is limited to the few places `Tooltip` wraps an icon — but those are exactly the icon-only explainers AT users need most.
- **Fix:** (a) add `onFocus`/`onBlur` to mirror the mouse handlers and `Escape` to dismiss; (b) generate a stable `id` with `useId()`, set `aria-describedby` on the wrapper via `cloneElement`/render-prop, and `aria-hidden` when hidden; (c) keep the 200 ms first-show delay but show instantly within a group (track "a tooltip was just shown"); (d) drop or use `containerRef`; (e) if a tooltip is the *only* source of essential info, move it into `helperText` instead (the guide: "prefer inline help first").
- **Acceptance:** focus an icon-only control with the keyboard → tooltip appears and is announced; Escape hides it; mouse behaviour unchanged.

#### F-16 — `Drawer`'s resize handle is mouse-only and miscoded
- **Guide:** Interactions — "Clean drag interactions"; "Gestures have alternatives"; "No dead zones on controls"
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE` — Phase 4, 2026-09-30
- **Fixed in Phase 4:** see the change log in §7 (Phase 4 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/ui/Drawer.tsx:109-118` — a `<div>` with `onMouseDown` (`:111`) setting `isResizing`, `aria-label="Drag to resize"` (`:116`) but **no `role`**, so the label is not exposed; **no pointer/touch path** and **no keyboard path**. (The affordance itself is sound: `w-[3px]`, `cursor-col-resize`, `opacity-30 hover:opacity-60`; the panel correctly uses `transition-transform` at `:105`.)
- **Impact:** touch and keyboard users cannot resize; AT users are told nothing. Width lives in component state (`style={{ width }}` at `:107`), so it resets on reopen — acceptable, but worth an explicit decision.
- **Fix:** either (a) give the handle `role="separator"` + `aria-orientation="vertical"` + `aria-valuenow/min/max`, switch to `onPointerDown` (covers mouse/touch/pen) and handle ArrowLeft/ArrowRight (16 px nudge, 1 px with Shift); or (b) remove the resize affordance entirely — the `size` prop already covers the need, and deletion is cheaper and fully compliant.
- **Acceptance:** if kept — keyboard resizes with Arrow keys and AT announces separator + value; if dropped — no resize handle remains in the DOM.
- **Phase 0 decision (2026-09-29): KEEP and fix** — option (a). This preserves the existing user-visible affordance and satisfies both guide items (gesture alternative + keyboard path); option (b), deletion, stays available as a fallback if usage shows the handle is unused. See §10 `0.4`.

#### F-17 — `Tabs` state is not deep-linkable, and three exported sub-components are dead code
- **Guide:** Interactions — "URL as state: list control state (tabs, filters, sort) belongs in the URL"; "Deep-link everything"; "Keyboard works everywhere"
- **Severity:** `Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 4, 2026-09-30
- **Fixed in Phase 4:** see the change log in §7 (Phase 4 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:**
  - `src/components/ui/Tabs.tsx:29-31` — internally controlled: `const [activeTab, setActiveTab] = useState(initial)`; no `value`/`onValueChange` prop and no URL sync. Its two consumers (`src/pages/admin/ProjectDetails.tsx`, `src/pages/admin/SupervisorDetails.tsx`) therefore cannot deep-link a tab — **whereas** `src/pages/admin/Approvals.tsx` *does* sync its tab to the query string, proving the team knows the pattern.
  - Keyboard support exists but is partial: `handleKeyDown` (`:33-50`) handles ArrowLeft/ArrowRight and moves focus, but there is **no Home/End** and **no roving `tabIndex`** — every tab sits in the tab order (`:63-78`) rather than only the selected one, which inverts the ARIA APG tabs pattern.
  - Dead exports: `TabList` (`:103`), `TabTrigger` (`:107`), `TabContent` (`:124`) are exported but unused project-wide; they also lack the wiring the main implementation has (`TabTrigger` sets `aria-selected` at `:112` but no `aria-controls`; `TabContent` uses `hidden={!isActive}` at `:127`).
- **Impact:** refreshing or sharing a link inside Project/Supervisor Details always resets the tab, and Back doesn't return to the previous tab — a direct violation of the "URL as state" item that is otherwise implemented well across the app. The extra tab stops also make the tab list noisy to traverse by keyboard.
- **Fix:** (1) let `Tabs` accept optional `value` + `onValueChange` (uncontrolled default preserved) and drive it from both pages using `useQueryParamState` in `'push'` mode — the hook supports exactly this (`useQueryParamState.ts:9-11`) and `Approvals` already proves it; (2) add Home/End and `tabIndex={isActive ? 0 : -1}`; (3) delete `TabList`/`TabTrigger`/`TabContent` (or finish them) — deletion preferred, per "don't ship the schema".
- **Acceptance:** change tab on Project Details → URL updates → refresh restores the tab → Back returns to the previous tab; Home/End jump to first/last tab; only the active tab is tabbable.

#### F-18 — No optimistic updates for low-risk actions
- **Guide:** Interactions — "Optimistic updates: update the UI immediately when success is likely; revert on failure"
- **Severity:** `Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 4, 2026-09-30
- **Fixed in Phase 4:** see the change log in §7 (Phase 4 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/contexts/AppDataContext.tsx:402-405` — `handleMarkNotificationAsRead` does `await markAsReadService(id)` **first**, then `setNotifications(...)`; `:407-410` (`handleMarkAllNotificationsAsRead`) is identical. Every other mutation uses the same await-then-set shape (`:277-341` for projects/users/documents). The only "optimistic" value in the codebase is a *derived* count, not a mutation — `NotificationContext.tsx:110` (comment) and `derivedUnreadCount` at `:130-137`.
- **Impact:** clicking a notification or "Mark all as read" leaves the unread badge untouched until the API answers; on a slow connection the action looks ignored and gets clicked twice.
- **Fix:** add an `optimistic` helper inside `AppDataContext` (apply → call → on reject restore the previous slice **and** toast). Apply only to safe, idempotent actions: single notification read, mark-all-read, notification-preference switches (`user/Settings.tsx`), simple membership toggles. **Do not** apply to invoice / approval / payroll mutations where a false positive is costly — the guide's "when success is likely" qualifier matters here.
- **Acceptance:** with the network throttled, the unread badge decrements immediately; a forced 500 reverts it and surfaces the toast from `F-12`.

#### F-19 — No show-delay or minimum duration on loading states (spinners can flash)
- **Guide:** Animations — "Minimum loading-state duration: avoid flicker — delay showing the indicator, then keep it visible long enough to be perceived"
- **Severity:** `Low`-`Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Fixed in Phase 5, 2026-09-30:** see the Phase 5 outcome in §7. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'minDuration\|showDelay\|useDelayed' src` → **0 matches**. `LoadingState` renders immediately on mount (`LoadingState.tsx:8-40`), `FullPageSpinner` likewise (`FullPageSpinner.tsx:3-15`), and pages do a plain `if (loading) return <LoadingState />` (e.g. `admin/Reports.tsx:178-182` and every list page). The global reduced-motion rule (`index.css:286-297`) neutralises the spinner's *motion* but not the flash.
- **Impact:** on a warm cache the indicator mounts and unmounts within a frame or two, producing a visible flicker on essentially every navigation — a classic "feels cheap" signal, and an item the guide calls out by name.
- **Fix:** add one tiny hook (e.g. `src/hooks/useDelayedLoading.ts`) that returns `show: false` for the first ~200 ms of loading, then `true`, and once shown stays true for a ~350 ms minimum. Wire it **inside** `LoadingState` and `FullPageSpinner` so all 20+ call sites benefit with zero page edits. Apply the same gate to the skeleton variant.
- **Acceptance:** with a fast local API, navigating between list/detail pages shows no flash of spinner; with throttling, the indicator appears after ~200 ms and persists ≥350 ms; nothing hangs if the request errors while hidden (error state must still render).

### Group D — Performance, content depth, and design details

#### F-20 — Search filters write to the URL on every keystroke (no debounce anywhere)
- **Guide:** Performance — "Keep input responsive: debounce/throttle work that can't keep up"; Interactions — "URL as state"
- **Severity:** `Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Fixed in Phase 5, 2026-09-30:** see the Phase 5 outcome in §7. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:**
  - Text params are bound straight to the router: `src/pages/admin/Users.tsx:27` (`useQueryParamState('q')`), `src/pages/admin/Invoices.tsx:36`, `src/pages/supervisor/Timesheets.tsx:20` — all in the default `'replace'` mode, which the hook documents as *"for text typing — every keystroke must not create a history entry"* (`useQueryParamState.ts:9-11`). History was considered; **the per-keystroke router navigation was not.**
  - No debouncing primitive exists: `grep -rn 'debounce\|useDeferredValue\|startTransition' src` → **0 matches**.
  - Same shape on `admin/Clients.tsx:201`, `admin/Timesheets.tsx:67`, `user/Projects.tsx:79`, `user/Timesheets.tsx:136`, `admin/Supervisors.tsx:123`.
- **Impact:** a 12-character query fires 12 `setSearchParams` navigations, each re-rendering the page shell and re-filtering the entire client-side row set. On a mid-range phone the field visibly lags, and each keystroke can interleave with an in-flight fetch.
- **Fix:** hold the visible value in local state and debounce (200–300 ms) before writing the param; seed local state from the param on mount and on Back/Forward. If profiling still shows blocking, wrap the derived filter/sort in `useDeferredValue`/`startTransition`. Keep `'push'` for discrete filters and tabs (already correct).
- **Acceptance:** a 12-character query produces ≤2 URL updates and the list keeps up while typing on a throttled CPU; Back restores the previous screen, not the previous keystroke.

#### F-21 — Reports chart: hardcoded tick colour, no text alternative, and a bespoke spinner
- **Guide:** Design — "Use semantic colour tokens, not literals"; Content — "Accessible charts: give the data a text alternative"; Interactions — "Use the shared loading patterns"
- **Severity:** `Medium` · **Effort:** `S`-`M` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Fixed in Phase 5, 2026-09-30:** see the Phase 5 outcome in §7. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/pages/admin/Reports.tsx` —
  - `:196`, `:197`: `<XAxis … tick={{ fontSize: 12, fill: '#94a3b8' }} />` / `<YAxis … />` — the **only** hardcoded colour on the page. Everything else uses tokens: grid `stroke="var(--color-border)"` (`:195`), tooltip `backgroundColor: 'var(--color-card)'` (`:200-207`), `<Bar … fill="var(--color-accent)" />` (`:208`).
  - No `role="img"`/`aria-label`/caption on the chart container (`:193-210`) — recharts emits a bare `<svg>`.
  - `:178-182`: a hand-rolled spinner (`h-8 w-8 animate-spin rounded-full border-4 …`) instead of `LoadingState`, even though the empty case *does* use `EmptyState` (`:190`).
- **Impact:** `#94a3b8` is unrelated to any token and is identical in the `black` theme — the one surface that ignores the three-theme token system, with marginal contrast on the light canvas. Screen-reader users get an unlabelled graphic with no numbers.
- **Fix:** `fill: 'var(--color-muted-foreground)'` (SVG `fill` accepts a custom property) or a dedicated `--color-chart-tick` token in `@theme`; add `role="img"` + `aria-label` summarising the series *or* a visually-hidden `<table>` of the same values; replace `:180` with `LoadingState`.
- **Acceptance:** ticks are legible in light/dark/black and token-driven (`grep -n "'#" src/pages/admin/Reports.tsx` returns no colour literals); the chart is announced with a summary; loading uses the shared component.

#### F-22 — Number/unit spacing and non-breaking spaces
- **Guide:** Content — "Units: space between the number and unit"; "Use non-breaking spaces to keep numbers and units together"
- **Severity:** `Low` · **Effort:** `S` + call-site audit · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/utils/format.ts:1-3` — `formatHours` returns `` `${hours.toFixed(1)}h` `` (`8.0h`); `src/pages/admin/Reports.tsx:207` — tooltip formatter `` `${Number(value).toFixed(1)}h` ``; weekly-hours defaults render as `40h`. By contrast `formatFileSize` (`format.ts:22-25`) *does* space its units (`1.5 KB`, `10 MB`), so the codebase is internally inconsistent. No `\u00a0`/`&nbsp;` is used anywhere (`grep -rn 'nbsp' src` → 0).
- **Impact:** `8.0h` reads as a code token rather than a quantity, and with nothing non-breaking, `40 h` / `10 MB` can wrap mid-value in narrow table cells and KPI chips.
- **Fix:** pick one house rule, apply it in the two formatters (`format.ts:3`, `Reports.tsx:207`) using `\u00a0` between number and unit, and audit `formatHours` call sites first (Dashboard, TimesheetEditor, Reports, tight chips) so no layout regresses. If the team prefers the compact `8.0h` form for dense grids, record that here as an **accepted exception** instead.
- **Acceptance:** a number never splits from its unit across lines; one unit style is used everywhere numbers appear.

#### F-23 — Dates are formatted through three paths, two of them locale-dependent
- **Guide:** Content — "Format numbers/dates consistently"; Copywriting — consistent formats
- **Severity:** `Medium` · **Effort:** `M` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Fixed in Phase 5, 2026-09-30:** see the Phase 5 outcome in §7. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:**
  - date-fns with hardcoded English patterns: `src/utils/date.ts:26` (`MMM d, yyyy`), `:37` (`MMM d` – `MMM d, yyyy`), `:43`, `:54` (`EEE, MMM d`).
  - `Intl.DateTimeFormat('en-US', …)` constructed inline inside components: `pages/admin/Dashboard.tsx:165`, `:210`; `pages/user/Dashboard.tsx:273`, `:304`; `components/dashboard/ActivityTimeline.tsx:60`; `components/dashboard/DeadlineCard.tsx:39`.
  - **Bare `toLocaleDateString()`** — no locale, no options, so it follows the *browser's* locale: `components/layout/Topbar.tsx:303` (notification timestamps) and `pages/admin/InvoiceDetail.tsx:157` (`sentAt`). These are the only two in the app.
  - By contrast currency is exemplary: `formatCurrency` (`format.ts:6-11`) is the sole Intl number formatter, with zero manual `'$' + toFixed` sites.
- **Impact:** the same screen can show "Mar 4, 2026" (list) beside "3/4/2026" (notification), and for a non-US browser locale the bare call can render day/month in the opposite order — genuinely ambiguous for dates like 4/3. Three paths also guarantee drift.
- **Fix:** keep `utils/date.ts` as the single user-visible entry point and have it delegate to one module-level `Intl.DateTimeFormat`; replace the two bare calls with `formatDate`; migrate the six inline `Intl.DateTimeFormat` sites to the shared helpers. Decide and document the app locale — a single `en-US` is defensible for an internal tool, and stating it removes the ambiguity rather than leaving two systems live.
- **Acceptance:** `grep -rn 'toLocaleDateString()' src` → 0; `new Intl.DateTimeFormat` appears only inside `utils/date.ts` (or in a documented exception list); notifications and invoice detail read like the rest of the app.

#### F-24 — `translate="no"` is absent, so brand and code tokens are translatable
- **Guide:** Content — "Mark brand names, code, and identifiers as non-translatable (`translate=\"no\"`)"
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE` — Phase 2, 2026-09-29
- **Fixed in Phase 2:** see the change log in §7 (Phase 2 outcome). The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `grep -rn 'translate=' src index.html` → **0 matches**. `index.html:2` correctly declares `<html lang="en">`, and `index.html:12-27` restores the theme before paint — but nothing protects "Eniac", "Employee ID", "W2/C2C", invoice numbers or admin-pass labels from Chrome's auto-translate.
- **Impact:** a user running the page through Google Translate can have the product name and identifiers rewritten mid-sentence, which reads as broken and can scramble labels used in support conversations.
- **Fix:** add `translate="no"` to the `<html>` element (`index.html:2`) since this is an application UI, and/or `translate="no"` on individual brand/code nodes; `notranslate` class where a node-level opt-out is clearer.
- **Acceptance:** Chrome's translate leaves "Eniac" and identifier strings unchanged.

#### F-25 — `Avatar`: labels on roleless elements, and presence is colour-only
- **Guide:** Design — "Don't rely on colour alone for status; add a redundant cue"; Content — "Icons/images have accessible names"; Interactions — "Semantics before ARIA"
- **Severity:** `Low`-`Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Evidence:** `src/components/ui/Avatar.tsx` —
  - `:54` — `aria-label={name}` sits on the **initials fallback `<div>`**, which has no `role`, so the label is not exposed to assistive tech (and there is no `role="img"`).
  - `:68` — `aria-label={status}` on the **status dot** `<span>`, again roleless; the dot's meaning (`online` / `offline` / `away`, `:62-64`) is conveyed by colour alone with no text alternative.
  - `:46-48` — the `<img>` branch correctly supplies `alt` (`alt={alt || name}`) but declares no intrinsic `width`/`height`.
  - `Avatar` is rendered in **23** places, so any inconsistency here propagates widely.
- **Impact:** AT users hear either nothing or a stray label, and colour-blind users cannot distinguish presence states — the guide explicitly asks for a redundant status cue alongside colour.
- **Fix:** give the wrapper `role="img"` + a single composed label (name + status) and drop the two inner labels to avoid double announcement; render visually-hidden text for the status (e.g. `<span className="sr-only">Online</span>`); add `width`/`height` to the `<img>`.
- **Acceptance:** focusing/reading an avatar announces a name and a status **once**; presence is distinguishable with a greyscale screenshot.

#### F-26 — Programmatic smooth scrolling by-passes `prefers-reduced-motion`
- **Guide:** Animations — "Honor `prefers-reduced-motion` for *all* motion, including scripted scrolling"; Interactions — "Don't move the user's viewport unexpectedly"
- **Severity:** `Low`-`Medium` · **Effort:** `S` · **Status:** `DONE` — Phase 5, 2026-09-30
- **Fixed in Phase 5, 2026-09-30:** see the Phase 5 outcome in §7. The `file:line` evidence below is the *pre-fix* state, kept for the record.
- **Evidence:** `src/components/ai/AIChatPanel.tsx:16` — `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`, fired on every change to `messages`/`isLoading`. The global CSS override (`index.css:289-297`) sets `scroll-behavior: auto !important`, but the JS `behavior: 'smooth'` option is an API argument and is **not** covered by that rule — a subtle hole in otherwise-excellent reduced-motion handling.
- **Impact:** users who enabled "reduce motion" at OS level still get an animated scroll on every AI message (and a streaming reply can re-trigger it repeatedly). Auto-scroll also yanks the viewport back down when the user scrolls up to read an earlier answer.
- **Fix:** read `window.matchMedia('(prefers-reduced-motion: reduce)')` and pass `behavior: reduced ? 'auto' : 'smooth'`; additionally only auto-scroll when the user is already near the bottom (a "stick to bottom" check), so reading history is never interrupted.
- **Acceptance:** with reduce-motion on, new messages appear without animation; scrolling up during a streaming reply is not pulled back down.

#### F-27 — Images lack intrinsic dimensions; one asset is unreferenced
- **Guide:** Content — "Set `width`/`height` on images to prevent layout shift"; "Lazy-load below-the-fold images"; Performance — "Optimize asset weight"
- **Severity:** `Low` · **Effort:** `S` · **Status:** `PARTIAL` — Phase 5, 2026-09-30: code items done, asset deletion left open (§10, item `5.1`)
- **Evidence:** the app renders only **two** `<img>` elements — `components/ui/Avatar.tsx:46` and `pages/admin/Settings.tsx:128` (logo preview) — and **neither** declares `width`/`height` or `loading="lazy"`. `src/assets/hero.png` is referenced **nowhere** in `src` (`grep -rn 'hero.png' src` → 0); `react.svg` and `vite.svg` are also unreferenced Vite defaults.
- **Impact:** low in practice (both images are sized by CSS classes), so this is mostly hygiene and reviewer confusion: a large `hero.png` in the tree looks like a used above-the-fold asset, and a future full-bleed use would ship unoptimised.
- **Fix:** add `width`/`height` (or an `aspect-*` class) to both images, `loading="lazy"` where below the fold; confirm with the design owner, then delete `src/assets/hero.png`, `react.svg`, `vite.svg`.
- **Acceptance:** `grep -rn '<img' src` shows dimension attributes; nothing in `src/assets` is unreferenced.

### Group E — Tooling, process, and policy

#### F-28 — Single-layer shadows (lowest priority, optional)
- **Guide:** Design — "Shadows: prefer layered, subtle shadows over one heavy shadow"
- **Severity:** `Low` · **Effort:** `M` (tokens + visual QA) · **Status:** `WONTFIX (accepted)` — Phase 0 decision 2026-09-29: deferred for lack of visual-QA budget; revisit only if a design review asks (see §10, item `0.4`)
- **Evidence:** stock single-layer Tailwind shadows throughout — `shadow-xl` ×13, `shadow-lg` ×7 (e.g. `Modal.tsx:73`, `Toast.tsx:38`, `Drawer.tsx:105`, `Topbar.tsx:201`, `:260`). No custom `--shadow-*` token exists in the `@theme` block (`index.css:16-45`), unlike the otherwise thorough tokenisation of colour, radius and font.
- **Impact:** purely aesthetic — overlays read flat against the light "paper" canvas compared with the depth cues users expect from native UI. The last un-tokenised visual dimension.
- **Fix:** define two or three layered shadow tokens (`--shadow-card`, `--shadow-overlay`, `--shadow-popover`) as two stacked `box-shadow` layers with a tinted ambient component, then map the existing `shadow-xl`/`shadow-lg` sites onto them. Do this only if visual-QA budget exists.
- **Acceptance:** overlays consume the tokens; light/dark/black each look intentional; no raw `shadow-xl` outside the token definition.

#### F-29 — No regression guard: the cited evaluation doc is missing and there is no frontend test runner
- **Guide:** Content — "Don't ship docs you don't have"; process — make the rules enforceable
- **Severity:** `Medium` (process risk) · **Effort:** `S` (doc) / `L` (tests) · **Status:** `DONE` (F-29.1, F-29.2) · `F-29.3` **declined by decision** `D-7`(b), re-confirmed with the owner 2026-09-30
- **Evidence:**
  - **The cited documents are missing.** 5 comments name `frontend_eval.md §12` outright — `index.css:251`, `App.tsx:45`, `hooks/useQueryParamState.ts:4`, `hooks/useUnsavedChanges.ts:4`, `hooks/usePageTitle.ts:3` — and all 24 `Guideline N.M` comments carry a parenthetical `(checklist item x.y)` / `(frontend_eval.md §12 item x.y)` that resolves to no file in the repo. Verified: `flowIntegration-checklist.md` is a **backend** flow-integration checklist (phases 0–9, `CLIENTS`/`ASSIGNMENTS`/`PAYROLLS` work) and cannot satisfy these frontend citations. Following any of the 24 citations hits a dead end.
  - **No frontend test infrastructure:** `frontend/package.json` scripts are exactly `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview` — no `test`, and no vitest/jest/testing-library dependency. (The backend *does* have tests, e.g. `backend/src/tests/payrolls.test.ts`.)
  - **Two** mis-citations, not one: (a) `AIChatPanel.tsx:50` attributes Cmd/Ctrl+Enter-to-submit to "Guideline 1.3" (*Manage focus*), but that behaviour belongs to the Forms textarea item — **5.2 "Textarea behavior"**, `interface_guide.txt:80`; (b) `AIChatPanel.tsx:202` cites "Guideline 8.16", but **section 8 is Vercel-specific and contains no numbered items at all**, so the number resolves to nothing. Both corrected in Phase 6. Every other citation checked maps correctly.
- **Impact:** every rule in this document is protected only by reviewer memory. The `F-01` class of bug (already fixed once, in `DailyEntryCard`) can silently return with the next numeric field, and the two bare `toLocaleDateString()` calls (`F-23`) show how formatting paths re-multiply.
- **Fix:**
  1. Make the citations resolve: either repoint the 24 `Guideline N.M` / `frontend_eval.md §12` comments at `interface_guide.txt` (the document that *is* in the repo), or commit the referenced checklist so the numbers mean something. Cheapest correct move: update the comments.
  2. Fix the `AIChatPanel.tsx:41` citation.
  3. *(Needs approval — adds dependencies)* add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` with `environment: 'jsdom'` and a `test` script; cover the four highest-risk rules behaviourally: submit-with-invalid focuses the first error and shows no native bubble (`F-01`/`F-02`); each dialog traps focus and closes on Escape (`F-03`/`F-04`); `formatCurrency`/`formatHours`/`formatDate` output (`F-22`/`F-23`); `Tabs` syncs to the URL (`F-17`).
- **Acceptance:** `grep -rn 'frontend_eval.md' src` → 0 (or the file exists); `npm run lint && npm run build` stay green; if tests are approved, `npm test` runs in CI and the four rules above fail loudly on regression.
- **Phase 0 decision (2026-09-29):** `F-29.1` and `F-29.2` remain in Phase 6. **`F-29.3` (vitest) is OUT of this pass** — decision `D-7` chose (b): no new devDependencies. The §9 command set is preserved as a runnable, dependency-free script in [`interface_fix_baseline.md`](./interface_fix_baseline.md) §5 so CI or a pre-push hook can guard the rules today. Re-open `D-7`(a) at Phase 6.

#### F-30 — Copy-policy items requiring an explicit decision (not defects)
- **Guide:** Copywriting — Title Case headings; `and` vs `&` (the guide's blanket rule is qualified by a Vercel-specific carve-out); numerals vs words
- **Severity:** `Low` · **Effort:** `S` (audit + agreement) · **Status:** `DONE` — convention recorded as **§4.A HS-1…HS-7**, applied 2026-09-30
- **Evidence / observations:**
  - `auth/Register.tsx:135` — `<h1>Create your account</h1>` is **sentence case**, while the rest of the app uses Title Case headings ("New Timesheet", "Hours by Project", "Standard Weekly Hours"). One of the two is wrong, but which depends on whether the general or the Vercel-specific variant governs.
  - *(Phase 6)* A scripted sweep of **every** `<h1>`–`<h6>` literal found **2** stragglers, not 1: the planned `Register.tsx:135` plus `ResetPassword.tsx:69` `Reset password`. The plan's single example had under-counted. After the fix, **101/101** headings conform.
  - `&` and slash-separated labels (`W2/C2C`, `Projects / Users`) appear in a few table headers and select options — a taste call given the carve-out, not a violation.
  - Acronym/capitalisation usage (`W2`, `C2C`, `SOW`, `PTO`) is otherwise consistent — worth preserving as house style.
- **Impact:** no functional impact; it creates review churn when one reviewer applies a rule and another applies its exception.
- **Fix:** decide the house style explicitly — recommended: Title Case for headings, `and` in body copy, numerals for all quantities, acronyms as-is — record it in §4 below as an accepted convention, then fix the single sentence-case straggler.
- **Acceptance:** the convention is documented in this repo and heading case is consistent across pages.

#### F-31 — Search shortcut advertises a Mac-only key on every platform *(raised by the Phase 6 final sweep)*

- **Guide:** Interactions — *"Locale-aware keyboard shortcuts. Internationalize keyboard shortcuts for non-QWERTY layouts. Show platform-specific symbols."* (`interface_guide.txt:32`)
- **Severity:** `Low` · **Effort:** `S` · **Status:** `DONE`
- **Evidence:** `Topbar.tsx:199` (pre-Phase-6) rendered a fixed `<kbd>⌘K</kbd>` next to the search field, while the handler at `Topbar.tsx:54` accepts `event.metaKey || event.ctrlKey`. The shortcut **works** on Windows and Linux; only the advertised affordance was wrong, telling those users to press a key their keyboard does not have. `AppShell.tsx:39` had the same split in prose ("Ctrl/⌘+Shift+A").
- **Impact:** a visible hint that contradicts the behaviour on every non-Mac machine. The guide calls this out because users who trust the hint press the wrong key and conclude the shortcut is broken.
- **Fix:** new `hooks/useIsMac.ts` resolves the platform once in a lazy `useState` initialiser (correct on the first render, no effect, no `set-state-in-effect` warning). `Topbar` derives `searchKeyLabel` = `⌘ + K` or `Ctrl + K`, with ` ` between tokens so the label cannot wrap apart.
- **Acceptance:** no rendered `⌘K` — the `<kbd>` is bound to a platform-derived variable, so a hardcoded symbol can no longer appear in markup; the one remaining `⌘K` match in `src` is inside `useIsMac`'s doc comment describing this bug. Lint warning count unchanged at **20**.

#### F-32 — `AIChatPanel` claims `aria-modal` but never trapped Tab *(raised by the Phase 6 final sweep)*

- **Guide:** Interactions — *"Manage focus. Use focus traps, move & return focus according to the WAI-ARIA Patterns."* (`interface_guide.txt:7`)
- **Severity:** `Medium` (a11y) · **Effort:** `S` · **Status:** `DONE`
- **Evidence:** `AIChatPanel.tsx:85` renders `role="dialog" aria-modal="true" aria-label="AI chat"` and ran a bespoke effect that handled **Escape** and **focus return** but contained no `Tab` handling. Tab therefore walked straight out of the panel into the page behind it. The surface was **not** in `F-03`'s list of six (that audit covered overlays in *pages*, and this one lives in `components/ai/`), so the gap survived Phase 1 intact.
- **Impact:** `aria-modal="true"` promises assistive tech that the background is inert. A keyboard user tabbing out of the chat lands on invisible page content with no focus ring in view, and no announcement that the modal ended. Same WCAG 2.1.2 class as `F-03`.
- **Fix:** replaced the bespoke effect with the shared `useFocusTrap(true, panelRef, { onClose, initialFocus: 'container' })`. The ref moved from the positioning wrapper onto the `role="dialog"` element (a trap scoped to the wrapper would have included the `aria-hidden` backdrop), which gained `tabIndex={-1}` to match `Modal`/`Drawer`/`ConfirmDialog`. Initial focus stays the composer via a one-line effect, so the panel is still typeable on open.
- **Bonus:** Escape handling is now ordered through the trap's `activeTraps` stack, so a dialog opened *over* the chat no longer closes both at once.
- **Acceptance:** `grep -rln "addEventListener('keydown'" src` → the bespoke panel listener is gone; all **5/5** real `role="dialog"` elements run the shared trap; lint warnings unchanged at **20**.

---

## 4. Compliance inventory — verified passing (the "do not regress" list)

Every item below was checked directly. Treat this as a regression contract: a change that breaks one of these is a guideline regression, regardless of what else it improves.

| # | Guide item | Evidence |
|---|---|---|
| C-01 | **Zoom is never blocked** | `index.html:6` — viewport has `width=device-width, initial-scale=1.0` with **no** `maximum-scale`/`user-scalable=no`. `F-06` must be fixed via font size, never by disabling zoom |
| C-02 | **Paste is never blocked** | `grep -rn 'onPaste\|onCopy\|onCut' src` → **0** |
| C-03 | **Reduced motion honoured globally** | `index.css:286-297` — `@media (prefers-reduced-motion: reduce)` zeroes `animation-duration`/`transition-duration`, pins `animation-iteration-count: 1`, forces `scroll-behavior: auto`; documented in the Phase 0 block |
| C-04 | **Keyboard-only focus indicator** | `index.css:254-266` — `:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px }` plus `:focus:not(:focus-visible) { outline: none }` so pointer clicks don't double-ring; primitives pair it with `focus-visible:ring-*` (`Button.tsx:43`) |
| C-05 | **Touch ergonomics** | `index.css:268-284` — `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` on `button`, `a`, `[role=button]`, `[role=switch]`, `[role=menuitem]`, `[role=tab]`, `input`, `select`, `textarea` |
| C-06 | **Overscroll containment on overlays** | `overscroll-contain` ×5 — `Modal.tsx`, `Drawer.tsx:127`, `AIChatPanel`, `MobileNav` scroll panels |
| C-07 | **`color-scheme` per theme** | `index.css:72` (light), `:110` (dark), `:161` (black); cited as Guideline 7.9 at `index.css:70` |
| C-08 | **`theme-color` matches the theme, applied before paint** | `index.html:8` default `#f7f8fa`; `index.html:12-27` is a synchronous script that flips `dark`/`black` classes **and** rewrites the meta to `#090d16`/`#000000` before first paint (no flash) |
| C-09 | **Fonts: self-hosted, subset, preloaded, swap** | `index.css:6-12` (JetBrains Mono, latin subset, `font-display: swap`), `index.html:11` `rel=preload … crossorigin`, font tokens `index.css:19-20` |
| C-10 | **Touch target sizing** | `Button.tsx:24-29` — `h-[30px]`/`h-9`/`h-10`, `icon: h-8 w-8`; icon buttons carry padding to reach the target size |
| C-11 | **URL as state (filters, sort, tabs)** | `useQueryParamState.ts` with documented `'push'` vs `'replace'` modes (`:9-11`, impl `:22-42`); used for search, every filter, `sort`/`dir` (`Users.tsx:27-32`) and the Approvals tab (`supervisor/Approvals.tsx:22`) |
| C-12 | **Page `<title>` per route** | **Every** route declares `handle: { title }` (`App.tsx:62-161`); `AppShell.tsx:14-22` resolves the deepest match via `useMatches()`; `usePageTitle.ts:8-15` appends `· Eniac` and restores the previous title on unmount; the 6 out-of-shell auth pages call the hook directly |
| C-13 | **Form labelling + error wiring** | `Input.tsx:12` (id derived from label), `:19` `htmlFor`, `:31` `aria-invalid`, `:32` `aria-describedby`, `:42-46` error `<p role="alert">`, `:47-51` helper text; `Textarea.tsx:12/20/25/27/28/35-39`; `Select.tsx:12/18/23-40` |
| C-14 | **16 px mobile inputs (no iOS zoom)** | `Input.tsx:33`, `Textarea.tsx:29` and `Select.tsx` all use `text-base sm:text-sm`; the Topbar search (`F-06`) is the single exception |
| C-15 | **Typing is never blocked mid-entry** | `onKeyDown` appears on only 6 elements: the AI composer (`AIChatPanel.tsx:176`), two `Dropdown` containers, `Table.tsx:144` (row activation), `Tabs.tsx:57` — no input filters or character blocklists |
| C-16 | **Textarea affordances** | `Textarea.tsx:29` `resize-y` (user-resizable) and `:46-50` counter via `showCount`/`maxLength` |
| C-17 | **Native `<select>` for OS-level behaviour/contrast** | `Select.tsx:23-40` renders a real `<select>`/`<option>` list with token colours — no custom listbox re-implementation |
| C-18 | **Loading / empty / error states designed** | `LoadingState.tsx` (`role="status"` + `aria-live="polite"` `:35`; skeleton variant `:9-11`), `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx` (with retry) — used across pages (e.g. the empty state at `Reports.tsx:190`) |
| C-19 | **Toasts are announced, not merely shown** | `Toast.tsx:34` `aria-live="polite"`, `:39` `role="alert"` per toast, `:47` `aria-label="Dismiss notification"`, safe-area insets `:34` |
| C-20 | **Safe-area insets respected** | `env(safe-area-inset-*)` in `Toast.tsx:34`, `AIChatWidget.tsx:27` |
| C-21 | **Status is never colour-only** | `StatusBadge.tsx:23-31` — every status maps to **label + icon + variant** (`approved: { label: 'Approved', icon: <CheckCircle2/> }`), so meaning is carried by text and shape |
| C-22 | **Currency via one Intl formatter** | `format.ts:6-11` is the only currency formatter; **zero** manual `'$' + toFixed` sites anywhere |
| C-23 | **Numeric columns align** | the whole app renders in JetBrains Mono (`index.css:19-20`), so digits are already fixed-width — no extra `font-variant-numeric` work needed |
| C-24 | **Connection warmup** | `main.tsx:12-24` — `rel=preconnect` + `crossorigin` to the API origin injected at boot, with a documented best-effort fallback |
| C-25 | **Focus + Escape handling on shared overlays** | `Modal.tsx:30/54`, `Drawer.tsx:69/93`, `ConfirmDialog.tsx:50/52-53`, `Dropdown.tsx:57`, `Topbar.tsx:57/63`, `ProfileDropdown.tsx:33` |

### 4.A House copy convention *(accepted 2026-09-30 — decisions `D-5`, `D-6`; closes `F-30`)*

The guide's blanket rules are qualified by a Vercel-specific carve-out ("These preferences reflect Vercel's brand & product choices. They aren't universal guidelines.", `interface_guide.txt:128`). We are not building a Vercel product, so the carve-out is **not** inherited. This is the house style; where it differs from the guide, the difference is deliberate and this table is the authority.

| # | Rule | Authority | Notes |
|---|---|---|---|
| HS-1 | **Headings and buttons: Title Case (Chicago)** | `interface_guide.txt:133` | The guide's own sentence-case allowance is scoped to *marketing pages*; these are application screens, so Title Case applies. **101/101** headings conform |
| HS-2 | **Body copy: `and`, not `&`** | `interface_guide.txt:135` says the opposite — **deliberate override** | Decided in `D-6`(a). Readability in sentences wins; `&` stays in short UI labels where it is a label, not prose |
| HS-3 | **Numerals for all counts and quantities** | `interface_guide.txt:142-143` | No spelled-out counts remain (`V-12`) |
| HS-4 | **Acronyms and internal codes as-is, never re-cased** | House rule (no guide item) | `W2`, `C2C`, `SOW`, `PTO`, `W2/C2C` are product vocabulary, not copy |
| HS-5 | **Locale: `en-US` for all dates, times, numbers, currency** | `D-5`(a) | One path through `utils/date.ts` (`APP_LOCALE`) and `utils/format.ts`; never inline `Intl` |
| HS-6 | **Provider-neutral product copy** | House rule (no guide item) | The AI panel must not name Groq or Gemini — the backend default is env-changeable |
| HS-7 | **Ellipsis character `…`, never `...`** | `interface_guide.txt:65` | Applies to loading states and "further input" labels |

**Accepted exceptions** (taste calls, do not re-litigate): `&` is allowed in short UI labels — `Role & Access`, `Password & Review`, `Approve & Save` (3 sites, verified by `V-12`). Compound labels such as `W2/C2C` keep the slash; spelling them out would be less scannable.

---

## 5. Suspicions investigated and cleared (do not re-investigate)

| Suspicion raised during the audit | Verdict | Why |
|---|---|---|
| `ClientDetails.tsx` reuses `label="Contact Email"` / `"Payment Terms"` / `"Billing Address"` for both an edit form and a read-only panel → duplicate DOM ids | **Cleared — not a defect today** | The second occurrence is `DetailRow` (`:335`), rendering a `<p>` (`:240-244`), not a `<label>`, so no id collision exists. *Latent* fragility only: if `DetailRow` ever gains a `htmlFor`, ids will clash with the form (`:214/224/231`) |
| `index.html` omits `maximum-scale` → "zoom is broken" | **Cleared — correct as written** | `index.html:6`; omitting it is exactly what the guide asks. `F-06` is a font-size issue, not a viewport issue |
| The `DailyEntryCard` hours `stepMismatch` bug is still open | **Cleared — already fixed** | `DailyEntryCard.tsx:41/52` now anchors `min=0.25` with `step=0.25` and documents why (`:44-51`). The wider systemic risk is retained as `F-01` |
| The duplicated dialogs are only a styling inconsistency | **Cleared — it is an a11y gap** | Promoted to `F-03`: none of the six has any keydown handler (grep evidence in `F-03`) |
| The `black` theme has no contrast work | **Cleared — deliberate** | `index.css:161-177` defines the black palette (incl. `--color-accent-soft: rgba(250,250,250,0.1)`) with commentary; `index.html:23` sets `theme-color: #000000` |
| Currency formatting is ad-hoc | **Cleared — exemplary** | `format.ts:6-11` is the single source (`C-22`) |
| Data-table rows are inaccessible because they use `onClick` | **Cleared — mostly** | `Table.tsx:111-112` sets `scope="col"` + `aria-sort`, `:144` handles Enter/Space, `:154` adds `tabIndex` only when `onRowClick` is passed. Only the *link semantics* gap remains (`F-05`) |
| `usePageTitle` is only used by 6 pages → missing titles elsewhere | **Cleared — covered by the router** | Every route declares `handle: { title }` (`App.tsx:62-161`) and `AppShell.tsx:14-22` applies it; the 6 direct callers are exactly the auth screens rendered outside the shell |

---

## 6. Out of scope / not statically verifiable

Reviewed against the guide but **not settleable by reading source**. They need a design owner plus a browser session, and are listed so nobody assumes they were checked.

| Guide item | Why source isn't enough | Suggested check |
|---|---|---|
| Optical alignment (text inset vs button padding) | Needs rendered pixels | Screenshot overlay in devtools at 3 viewports |
| Concentric border radius (inner = outer − padding) | Needs computed styles | Inspect `Modal`/`Card` inners; `rounded-xl` outer vs `rounded-lg` inner |
| Line length / `text-wrap: balance`/`pretty` | No `text-wrap` usage exists, but whether it's *needed* is visual | Check long headings and paragraphs at each breakpoint |
| Focused element staying visible under sticky chrome | Needs interaction | Tab through `TimesheetEditor` with the sticky Topbar |
| Animation seamlessness and perceived latency budgets | Needs device profiling | Record paint timings on a mid-range phone profile |
| Tab order on custom grids (`TimesheetEditor`, `DailyEntryCard`) | Needs a keyboard walk-through | Manual Tab traversal; confirm order and no traps |
| Screen-reader phrasing of composed strings (statuses, week ranges, AI answers) | Needs AT | VoiceOver/NVDA pass on Dashboard, Timesheets, Reports |
| Explicit `align-content`/`justify-content` defaults | Tailwind utilities already imply them; nothing deviates in source | Spot-check flex columns in `StatCard`/`KpiChip` |
| Contrast ratios of the `muted-foreground` token in all three themes | Needs measurement | Automated contrast check (axe/Stark) on each theme |

---

## 7. Remediation plan

**Sequencing principle:** fix the *structural* causes first (validation, dialogs, links), because they generate whole classes of defects; then do the grep-verifiable sweeps; then copy quality; then depth. Every phase is independently shippable and reversible.

**Branch strategy:** one branch `interface/guide-compliance`, one commit per finding (`fix(ui): F-01 disable native constraint UI on app-validated forms`), PRs grouped by phase so review stays small. No phase merges with a red `npm run lint` or `npm run build`.

---

### Phase 0 — Baseline and decisions *(½ day, no code)* — ✅ **DONE 2026-09-29**

**Goal:** freeze the starting state and remove ambiguity before touching code.

| Step | Action |
|---|---|
| 0.1 | Run every command in §9 and paste the output into the tracking issue/PR as the **before** baseline — this is how each later fix proves itself |
| 0.2 | Resolve the open decisions in §10 and record the answers at the bottom of this file |
| 0.3 | Create the tracking checklist from §8 in your issue tracker, or tick it in place here |
| 0.4 | Decide the three optional items: `F-29.3` (add vitest), `F-28` (shadow tokens), `F-16` (keep vs delete the drawer resize handle) |

**Exit criteria:** §10 answered, baseline captured, priority confirmed. **Rollback:** N/A (no code).

**Outcome — completed 2026-09-29 at `2d16933`:**

| Step | Result |
|---|---|
| 0.1 | ✅ **Baseline captured.** All of §9 `V-1`…`V-10` + Appendix C metrics + the guard rail were executed and recorded verbatim in [`interface_fix_baseline.md`](./interface_fix_baseline.md). Guard rail: `npm run lint` → **0 errors / 20 pre-existing warnings**, `npm run build` → **exit 0** (`✓ built in 1.54s`, 529.43 kB bundle). |
| 0.2 | ✅ **Decisions `D-1`…`D-7` answered** — see the *Recorded answers* block in §10. |
| 0.3 | ✅ **Tracker adopted.** This file *is* the tracker of record: §8.1 snapshot, §8.2 per-finding table, §8.3 tick-boxes. No external issue tracker is used. |
| 0.4 | ✅ **Optional items decided:** `F-29.3` vitest → **OUT** for now (§9 script is the interim guard) · `F-28` shadows → **OUT, accepted exception** · `F-16` resize handle → **KEEP and fix** (option a). |

**Drift corrected during the capture** (documentation only — no app code touched): the audit-commit anchor (`a83e422` → `2d16933`; `DailyEntryCard.tsx` did not exist at the old hash), §9 `V-9`'s `onClick={() => navigate` baseline (≈30 → **72**), and the source-file count (130 → **135**). Every other metric re-ran and matched the audit draft exactly. Full drift log: [`interface_fix_baseline.md`](./interface_fix_baseline.md) §2.

**Exit criteria met:** ✅ §10 answered · ✅ baseline captured · ✅ priority confirmed — the phase order in §7 is unchanged, with two amendments recorded at 0.4 (`F-28` accepted out; `F-16` fixed rather than deleted).

---

### Phase 1 — Validation and accessibility critical path *(≈2–3 days)* — ✅ **DONE 2026-09-29**

**Goal:** remove the bug class that produced the `DailyEntryCard` defect, and close the two a11y blockers.
**Findings:** `F-02` → `F-01` (in this order) · `F-03` · `F-04` · `F-06` · `F-07`

| Order | Work | Why this order |
|---|---|---|
| 1 | **`F-02`** add the `focusFirstError` helper and call it from every submit handler | Independent of `F-01`, and must exist *first* so that when native validation stops blocking submit, focus handling ships in the same PR |
| 2 | **`F-01`** add `noValidate` per form — start with `DailyEntryCard` (the proven case), then `CreateUser`, `EditUser`, `EditProject`, `CreateProject`, `InvoiceForm`, `ClientDetails`, `Settings`, `TimesheetEditor`, and the four auth forms; strip `min`/`max`/`step` where `validate()` already enforces the rule | The proven defect makes `DailyEntryCard` the safest migration and validates the pattern before nine more files |
| 3 | **`F-01`/`F-14`** add `inputMode="decimal"` to the four numeric fields **in the same PR** that removes their `type="number"` constraints | Removing `type="number"` without `inputMode` regresses the mobile keypad — they must ship together |
| 4 | **`F-03`** extract `useFocusTrap`, then migrate `ReviewPanel.tsx:16` to `ConfirmDialog` (pure deletion), then the five page dialogs | `ReviewPanel` has no bespoke layout to preserve, so it de-risks the hook before the harder migrations |
| 5 | **`F-04`** adopt the same hook in `MobileNav` + `aria-label="Main navigation"` | Reuses the just-validated hook |
| 6 | **`F-06`** Topbar search `text-sm` → `text-base sm:text-sm` | One line; land it after the risky work |
| 7 | **`F-07`** `scroll-mt-16` (or the global `[id]` rule) with a guideline citation comment | One line |

**Risks & mitigations**
- *Removing `required` changes the submit path for 70 fields.* One page per commit; per page verify (a) the happy path still submits, (b) every invalid case shows the inline error, (c) Enter in a text field still submits.
- *`noValidate` on a form whose `validate()` is incomplete* removes enforcement entirely. Before each conversion, diff the JSX constraints against `validate()` and move any missing rule into `validate()` **first**; paste that diff into the PR description.
- *Focus-trap regressions in nested overlays* (`TimesheetEditor` opens dialogs on top of page content). Manually test open-dialog-from-drawer and dialog-within-dialog flows.

**Exit criteria:** every form submits with app-only validation and no native bubble; focus lands on the first error; all 7 dialog surfaces trap/restore focus and expose a name; input behaviour verified on iOS + Android; §9 `V-1`, `V-2`, `V-4` as expected.
**Rollback:** revert per commit — the helper and `inputMode` additions are inert on their own.

**Outcome — completed 2026-09-29 (23 files changed, +226 / −280, plus 2 new files):**

| Finding | What shipped | Where |
|---|---|---|
| `F-02` | `focusFirstError(scope, fallback?)` — queries `[aria-invalid="true"]`, focuses + `scrollIntoView`, honours `prefers-reduced-motion`. Deferred to the next animation frame because React has not re-rendered the error attributes yet | **new** `src/utils/focusFirstError.ts`, called from **11** submit handlers |
| `F-01` | `noValidate` on **12** form tags (11 app-validated + the new Timesheet dialog form). `min`/`max`/`step` removed where `validate()` already owns the rule; 5 raw controls gained the `aria-invalid` that `focusFirstError` keys off | `DailyEntryCard` (min/max/step gone), `InvoiceForm` (2 × `min="0"` gone, negative-amount rule **added to `validate()` first**), 5 auth + 4 admin forms |
| `F-14` | `inputMode="decimal"` on the 4 numeric fields → **5 total** | `InvoiceForm:244`, `:303`, `TimesheetEditor:719`, `Settings:190` |
| `F-03` | **`useFocusTrap` hook** — one implementation of trap + Escape + focus-restore + *topmost-wins* ordering for nested overlays. `Modal`, `ConfirmDialog` and `Drawer` all refactored onto it; the 6 hand-rolled overlays deleted | **new** `src/hooks/useFocusTrap.ts`; dialog `keydown` listeners **8 → 5** (4 dialog ones → 1) |
| `F-04` | `MobileNav` gains the trap + `aria-label="Main navigation"` + focus enters/returns to the hamburger | `layout/MobileNav.tsx:13-28` |
| `F-06` | Topbar search `text-sm` → `text-base sm:text-sm` | `layout/Topbar.tsx:208` |
| `F-07` | Global `[id] { scroll-margin-top: 4.5rem }` in the existing `index.css` compliance block | `index.css:286-293` |

**Verification (Phase 0 baselines in [`interface_fix_baseline.md`](./interface_fix_baseline.md)):**

| Metric | Before | After | Target |
|---|---|---|---|
| `<form noValidate>` | 0 | **12** | one per app-validated form ✅ |
| ` required` (now annotation-only) | 70 | 70 | unchanged by design ✅ |
| `inputMode` | 1 | **5** | 5 ✅ |
| `role="dialog"` (real elements) | 11 | **5** | only the shared surfaces ✅ |
| …of those, named | 5 | **5** | 5 ✅ |
| dialog `addEventListener('keydown'` | 4 | **1** (the hook) | single implementation ✅ |
| `min="` on numeric inputs | 5 | 3 | only where no app validator exists ✅ |
| `scroll-margin` rules | 0 | **1** | ≥1 ✅ |
| `focusFirstError` call sites | 0 | **11** | one per form ✅ |
| `tsc -b --noEmit` | clean | **clean** | ✅ |
| `npm run lint` | 0 errors / 20 warnings | **0 errors / 20 warnings** | no new findings ✅ |
| `npm run build` | exit 0, 1.54 s | **exit 0, 1.39 s** | ✅ |

**Amendments to the Phase 1 plan (recorded rather than silently absorbed):**
1. **Four forms in the checklist do not exist.** `admin/ClientDetails`, `admin/Settings`, `user/Settings` and `user/TimesheetEditor` contain **no `<form>` element and no `validate()`** — `Settings` saves via a button + `handleSave`, the editor via its confirm dialog + `getSubmissionWarnings()`. There is no native validation to disable, so `noValidate`/`focusFirstError` are **N/A** there. Their `min`/`max`/`step` attributes were therefore **kept** (they are the only client-side guard on those fields, and browsers raise no bubble for a control outside a form).
2. **`required` was kept, not removed.** With `noValidate` it enforces nothing but still maps to `aria-required`, and every form's `validate()` was diffed field-by-field against its `required` set first (§8.3). This is the "annotation-only allowlist" the §9 `V-1` target allows.
3. **`step="0.01"` / `step="0.5"` kept** on the invoice fields: they drive the spinner increment, which is useful UX, and with `noValidate` they no longer validate. Only the *duplicate* `min="0"` constraints were removed.
4. **`Drawer` was refactored too** (not in the original list) because it carried a *fourth* copy of the same trap, and nested overlays — `ReviewPanel` renders a `Drawer` **and** a `ConfirmDialog` at once — would otherwise have had two competing traps on the same keypress. The hook's topmost-wins ordering makes Escape close only the top overlay.

**Exit criteria met:** ✅ app-only validation on every form that has one · ✅ focus lands on the first error · ✅ all dialog surfaces trap/restore focus and expose a name · ✅ `V-1`/`V-2`/`V-4` as expected · ⚠️ **manual items still open** (see §8.3): iOS/Android keyboard checks, screen-reader walk, and the six dialog surfaces' Escape/focus-return matrix need a human with devices.

---

### Phase 2 — Mechanical consistency sweeps *(≈1–2 days)* — ✅ **DONE 2026-09-29**

**Goal:** clear every grep-detectable deviation.
**Findings:** `F-08` · `F-09` · `F-10` · `F-11` · `F-13` · `F-22` · `F-24` *(F-14 lands in Phase 1)*

| Order | Work | Note |
|---|---|---|
| 1 | **`F-08`** replace all 8 `transition-all` with explicit properties | Visually verify each animation: open/close Modal + Drawer, hover Toast + ThemeToggle, collapse Sidebar, progress bars |
| 2 | **`F-08b`** review the five `duration-300` usages (`ThemeToggle.tsx:54/56`, `Progress.tsx:35`, `Sidebar.tsx:89/195`) against the guide's "keep interactions quick" guidance — reduce to ≤200 ms or record an exception | The item is qualitative; whatever you choose, write it down |
| 3 | **`F-09`** fix the 7 `hover:text-muted-foreground` buttons to match the 36 correct `hover:text-foreground` instances | Check both themes |
| 4 | **`F-10`** `'Loading...'` → `'Loading…'` | One line |
| 5 | **`F-11`** curly apostrophes in the 8 user-facing strings | Mind the `title="…"` attribute quoting |
| 6 | **`F-13`** `spellCheck={false} autoCorrect="off" autoCapitalize="none"` on identifier/email/code fields; keep spellcheck **on** for prose | Prefer a `noSpell` prop on `Input` over repeating three attributes 15× |
| 7 | **`F-22`** pick the unit rule and apply it in `format.ts:3` + `Reports.tsx:207` with `\u00a0`, after auditing `formatHours` call sites | If the compact `8.0h` form wins, mark it an accepted exception **here** and close the item |
| 8 | **`F-24`** `translate="no"` on `<html>` and/or brand nodes | One line in `index.html` |

**Exit criteria:** §9 `V-3`, `V-5`, `V-6`, `V-7` report 0 (or only documented exceptions).
**Rollback:** localised edits; revert individually.

**Outcome — completed 2026-09-29 (26 files touched in this phase; 49 changed since the `2d16933` baseline, +401 / −387):**

| Finding | What shipped | Sites |
|---|---|---|
| `F-08` | every `transition-all` replaced with the property actually animated: `transition-[width]` for the 3 progress fills + the collapsing rail, `transition-colors` for the theme toggle and the chat FAB, `transition-opacity` for `Modal`/`Toast` | 8 → **0** |
| `F-08b` | **decision recorded: every interaction animation is ≤200 ms.** All five `duration-300` sites dropped to `duration-200` — theme-toggle icon rotate (×2), progress fill, sidebar rail collapse, sidebar mobile slide. Rationale: the guide asks for quick interactions, and none of these need a third of a second to read as motion | 5 → **0** |
| `F-09` | `hover:text-muted-foreground` → `hover:text-foreground` on all 7 icon buttons, matching the 36 already-correct instances | 7 → **0** (correct style now 43) |
| `F-10` | `'Loading...'` → `'Loading…'` | 1 → **0** |
| `F-11` | curly `’` in **9** user-facing strings — the 8 the audit listed plus `AIChatPanel:196`'s "Don't share sensitive personal information.", which the audit missed. Comments deliberately untouched (the one remaining `don't` is inside a JSX comment) | `’` 1 → **11** |
| `F-13` | a `noSpell` prop on the `Input` primitive (sets `spellCheck={false}` + `autoCorrect="off"` + `autoCapitalize="none"` together), applied to 14 email / Employee ID / admin-pass / password fields, plus the same three attributes on the 8 **raw** inputs that bypass the primitive. Prose fields (timesheet descriptions, notes) deliberately keep spellcheck on | 0 → 22 fields |
| `F-22` | decision `D-4`(a) applied for real: `formatHours` is now the single owner of the unit style and emits `\u00a0`, and **all 62 inline `toFixed(1)}h` sites plus 8 template-literal sites route through it** (16 files). The 6 prose sites that keep 2-decimal or integer precision get `\u00a0` inline instead. The old `0h` special case is gone — one style everywhere, zero included | `\u00a0` 0 → **8**; `formatHours` call sites 0 → **63** |
| `F-24` | `translate="no"` on `<html lang="en">` with a comment explaining the brand/identifier reasoning | 0 → 1 |

**Scope note (recorded, not silently absorbed):** `F-22` was scoped in the plan as *"2 formatters"*. The reality is **62** inline `toFixed(1)}h` expressions across 16 files — the app mostly never called `formatHours`. Fixing only the two formatters would have made the app *less* consistent (a helper emitting `8.0 h` beside 62 `8.0h` tables), so the sweep was done properly: one formatter, every call site.

**Verification:**

| Check | Baseline | After Phase 2 | Target |
|---|---|---|---|
| `transition-all` | 8 | **0** | 0 ✅ |
| `duration-300` / `duration-500` | 5 | **0** | 0 ✅ |
| `hover:text-muted-foreground` | 7 | **0** | 0 ✅ |
| `hover:text-foreground` | 36 | 43 | ≥36 ✅ |
| `'Loading...'` | 1 | **0** | 0 ✅ |
| curly `’` | 1 | 11 | ≥9 ✅ |
| `spellCheck` / `noSpell` | 0 | 22 fields | selective ✅ |
| `\u00a0` references | 0 | 8 | ≥1 ✅ |
| `translate=` | 0 | 1 | ≥1 ✅ |
| `tsc -b --noEmit` | clean | **clean** | ✅ |
| `npm run lint` | 0 errors / 20 warnings | **0 errors / 20 warnings** | no new findings ✅ |
| `npm run build` | exit 0 | **exit 0** | ✅ |

**Exit criteria met:** ✅ `V-3`, `V-5`, `V-6`, `V-7` all report 0 · ⚠️ **manual items open** (see §8.3): the animation visual pass, hover contrast in all three themes, the curly-apostrophe copy in the rendered app, spell marks on/off, and — the one with real regression risk — **`formatHours` layout**: the value is now ~5 px wider in dense right-aligned tables and KPI chips, which is exactly the check `D-4` said to run before accepting (b) as an exception.

---

### Phase 3 — Copy quality: error messages *(≈1–2 days)* — ✅ **DONE 2026-09-29**

**Goal:** satisfy the guide's "error messages guide the exit" item across all 48 sites.
**Findings:** `F-12`

| Order | Work |
|---|---|
| 1 | Build a **before → after copy table** for all 48 strings (grouped: auth, users, projects, invoices, clients, settings, timesheets, invites) and get it reviewed by whoever owns product voice — copy is cheaper to fix in a table than in a diff |
| 2 | Decide the `err.message` policy: curated user copy for every failure, raw error to `console.error`. Where the backend returns a structured, user-safe validation message, keep it (confirm against `backend/src` error shapes) |
| 3 | Apply the table; keep every object-specific noun (this invoice / that timesheet / those settings) |
| 4 | Spot-check the resulting toasts on a throttled network with the API forced to 500 for one endpoint per group |

**Risk:** the passthrough sites currently surface *useful* backend validation text (e.g. duplicate email). Mitigate: inventory which messages are user-grade before replacing them; never blanket-replace a message that tells the user *which field* is wrong.
**Exit criteria:** §9 `V-8` returns only `console.error` sites; manual pass on 8 representative failures.
**Rollback:** string-only change; revert is safe.

**Outcome — completed 2026-09-29 (22 files touched; 44 call sites).**

**The policy is now code, not 46 hand-written strings.** New `src/utils/errorMessage.ts` exports `failureMessage(err, copy)` and `failureText(copy)`, which compose every failure as **what failed → what the user can rely on → what to do next**, and enforce decision `D-3`:

- `apiClient` throws `` `[${code}] ${message}` ``, so the old `err.message` passthroughs were showing users a **bracketed error code**. The helper parses that envelope off.
- A **user-grade** detail ("email already in use") is kept and appended to the framing — the `D-3`(b) half, so we never lose the "which field" information.
- Anything else (`INTERNAL_ERROR`/`UNKNOWN_ERROR`, `Internal server error`, `Request timeout`, `Unauthorized`, stack or JSON text) is replaced by the curated sentence and written to `console.error` instead — the `D-3`(a) half, so nothing is lost without being shown to the user.
- `AppDataContext`'s two re-throw sites no longer flatten the error into a generic string; they propagate the original error so the calling page applies this same policy.

**Behaviour verified** (helper executed directly on the real cases, via Node's type stripping — no new dependencies):

| Backend message | Toast the user now sees |
|---|---|
| `[VALIDATION_ERROR] Email already in use` | We couldn't create that user — email already in use. No account was created — check the details and try again. |
| `[INTERNAL_ERROR] Internal server error` | We couldn't save those settings. Nothing was changed — try again in a moment. |
| `Request timeout` | We couldn't send that message. Nothing was sent to the assistant — try again. |
| `Unauthorized` | We couldn't load your settings. Your saved settings are unchanged — refresh the page and try again. |
| `[AI_QUOTA_EXCEEDED] API quota exceeded for today` | We couldn't send that message — API quota exceeded for today. Nothing was sent to the assistant — try again. |
| `{"stack":"at foo (/x.js:1:1)"}` | We couldn't save that draft. Your edits are still on screen — try again in a moment. |
| *(no error object at all)* | We couldn't open that week. No changes were made — pick another week or go back. |

**Before → after copy table** — every one of the 48 sites is listed; an `×n` suffix means that copy is shared by *n* sites. Generated from the shipped code, so it cannot drift from what users see.

| Group | Site | Before | After |
|---|---|---|---|
| Auth | `AdminLogin`, `UserLogin` (×2 each) | "Failed to request a password reset" | We couldn't request that password reset. No email was sent — try again in a moment. |
| Auth | `InviteRedeem` | "Failed to activate account. Please try again." | We couldn't activate that account. Nothing was changed — request a fresh invite link and try again. |
| Users | `CreateUser` | "Failed to create user" | We couldn't create that user. No account was created — check the details and try again. |
| Users | `EditUser` | "Failed to update user" | We couldn't save those account changes. The account is unchanged — try again in a moment. |
| Invites | `Users`, `Onboarding` create (×2) | "Failed to create invite" | We couldn't send that invite. No email was sent — check the address and try again. |
| Invites | `Onboarding` resend | "Failed to resend invite" | We couldn't resend that invite. No new email was sent — try again in a moment. |
| Invites | `Onboarding` revoke | "Failed to revoke invite" | We couldn't revoke that invite. The invite is still active — try again in a moment. |
| Projects | `EditProject` | "Failed to update project" | We couldn't save those project changes. The project is unchanged — try again in a moment. |
| Projects | `CreateProject` | "Failed to create project" | We couldn't create that project. Nothing was saved — check the details and try again. |
| Projects | `ProjectDetails`, `user/ProjectDetails` | "Failed to download document" | We couldn't download that document. The file is still on the server — try again. |
| Clients | `Clients` | "Failed to create client" | We couldn't create that client. Nothing was saved — check the details and try again. |
| Clients | `ClientDetails` | "Failed to update client" | We couldn't save those client changes. The client is unchanged — try again in a moment. |
| Invoices | `InvoiceForm` | "Failed to save invoice" | We couldn't save that invoice. Nothing was sent and no changes were saved — try again in a moment. |
| Invoices | `InvoiceDetail` send | "Failed to send invoice" | We couldn't send that invoice. It is still a draft — nothing was sent — try again in a moment. |
| Invoices | `InvoiceDetail` cost | "Failed to remove cost" | We couldn't remove that cost. The cost is still on the invoice — try again. |
| Approvals | `Approvals` ×2, `ReviewPanel` approve | "Failed to approve timesheet" | We couldn't approve that timesheet. It is still pending — reload the page and try again. |
| Approvals | `ReviewPanel` decline | "Failed to decline timesheet" | We couldn't decline that timesheet. It is still pending and unchanged — try again in a moment. |
| Timesheets | `user/Timesheets` | "Failed to create timesheet" | We couldn't create that timesheet. Nothing was saved — try again in a moment. |
| Timesheets | `TimesheetEditor` load | "Failed to load daily logs" | We couldn't load your daily logs. The weekly grid is unchanged — try again. |
| Timesheets | `TimesheetEditor` open week | "Failed to open that week" | We couldn't open that week. No changes were made — pick another week or go back. |
| Timesheets | `TimesheetEditor` compile ×3 | "Failed to compile daily logs…" | We couldn't compile your daily logs. The weekly grid is unchanged — try again in a moment. |
| Timesheets | `TimesheetEditor` draft ×3 | "Failed to save draft…" | We couldn't save that draft. Your edits are still on screen — try again in a moment. |
| Timesheets | `TimesheetEditor` submit ×2 | "Failed to submit timesheet…" | We couldn't submit that timesheet. It is still a draft — nothing was submitted — try again in a moment. |
| Timesheets | `TimesheetEditor` withdraw ×2 | "Failed to withdraw timesheet…" | We couldn't withdraw that timesheet. It is still pending — try again in a moment. |
| Settings | `admin/Settings` load | "Failed to load settings" | We couldn't load your settings. Your saved settings are unchanged — refresh the page and try again. |
| Settings | `admin/Settings`, `user/Settings` save | "Failed to save settings" | We couldn't save those settings. Nothing was changed — try again in a moment. |
| Settings | `user/Settings` load | "Failed to load notification preferences" | We couldn't load your notification preferences. Your saved settings are unchanged — refresh the page and try again. |
| Settings | `user/Settings` profile | "Failed to update profile" | We couldn't save your profile. Nothing was changed — check the details and try again. |
| Settings | `user/Settings` password | "Failed to change password" | We couldn't change your password. Your current password still works — try again in a moment. |
| AI assistant | `AIContext` send | "Failed to send message" | We couldn't send that message. Nothing was sent to the assistant — try again. |
| AI assistant | `AIContext` approve | "Failed to approve action" | We couldn't complete that action. Nothing was applied — try again. |
| AI assistant | `AIContext` cancel | "Failed to cancel action" | We couldn't cancel that action. It is still running — try again. |
| Shared | `AppDataContext` ×2 | "Failed to create project / timesheet" (re-thrown) | *shape changed*: the original error propagates and the calling page applies this same copy policy |

**Verification:**

| Check | Baseline | After Phase 3 | Target |
|---|---|---|---|
| `Failed to …` in `.tsx` | 48 | **2** | 0 ✅ |
| …of those, inside `console.error` | 2 | 2 | allowed ✅ |
| …in user-facing copy | 46 | **0** | 0 ✅ |
| `failureMessage` / `failureText` call sites | 0 / 0 | 30 / 14 | every failure path ✅ |
| helper behaviour assertions | — | **7/7 pass** | ✅ |
| `tsc -b --noEmit` | clean | **clean** | ✅ |
| `npm run lint` | 0 errors / 20 warnings | **0 errors / 20 warnings** | no new findings ✅ |
| `npm run build` | exit 0 | **exit 0** | ✅ |

**Exit criteria met:** ✅ `V-8` returns only the two `console.error` sites · ⚠️ **manual item open** (see §8.3): the throttled-network / forced-500 pass across the 8 representative failure groups, and a product-voice read of the copy table above — the reassurance clauses are the part most likely to need a human ear.

---

### Phase 4 — Interaction semantics *(≈3–4 days)* — ✅ **DONE 2026-09-30**

**Goal:** make navigation behave like navigation and control state survive a refresh.
**Findings:** `F-05` · `F-17` · `F-18` · `F-15` · `F-16`

| Order | Work | Note |
|---|---|---|
| 1 | **`F-05`** add a `to` prop to `Button` (renders react-router `<Link>` with identical classes), then convert the entry points listed in `F-05`; leave post-action `navigate()` calls alone | Do the primitive first so each page conversion is a one-word change |
| 2 | **`F-05b`** add a real `<Link>` inside clickable table rows (primary cell) while keeping the row click | Covers keyboard/screen-reader users without removing a convenience |
| 3 | **`F-17`** make `Tabs` optionally controlled; wire `ProjectDetails` + `SupervisorDetails` to `useQueryParamState(…, 'push')`; add Home/End + roving `tabIndex`; delete the three dead exports | Mirrors the pattern already proven in `Approvals` |
| 4 | **`F-18`** optimistic updates for notification read / mark-all-read / preference toggles, with rollback + toast | Explicitly **not** for invoice, approval or payroll mutations |
| 5 | **`F-15`** Tooltip: focus/blur, `id` + `aria-describedby`, Escape, instant-within-group | Decide per usage whether the info belongs in `helperText` instead |
| 6 | **`F-16`** drawer resize handle: add `role="separator"` + pointer + arrow-key support, **or** delete it (decision from §10) | Deleting is the cheaper compliant option |

**Risk:** converting row clicks to links can change click targets and break Playwright-free manual flows (dropdown menus inside rows already `stopPropagation` at `Table.tsx:166`). Mitigate: convert one page, verify the row dropdown still works, then batch the rest.
**Exit criteria:** middle-click/Cmd-click work on shared entry points; Project/Supervisor tabs survive refresh and Back; notification badge updates instantly (throttled); §9 `V-9` justified.
**Rollback:** per page/commit.

**Outcome — completed 2026-09-30 (32 files touched).**

| Finding | What shipped | Result |
|---|---|---|
| `F-05` | `Button` gained a `to` prop that renders a react-router `<Link>`, and **43** controls across 25 files were converted — every back button, edit button, "New/Create" CTA, empty-state action and auth link. The button / external-anchor / `Link` renderings now share one `content` block, so they cannot drift | `onClick={() => navigate(...)}` on a `Button`: **72 → 0**; total `navigate(` 104 → **61** |
| `F-05b` | the primary cell of each clickable row is now a real `<Link>` (`Users`, `Supervisors`, `Clients`, `Projects`) with `stopPropagation()` so the row's convenience click does not double-fire. The row `onClick` and the dropdown `stopPropagation` are untouched, so mouse users lose nothing and keyboard/AT users get a link | 0 → **4** row links |
| `F-17` | `Tabs` is optionally controlled (`value` / `onValueChange`, uncontrolled default preserved); `ProjectDetails` and `SupervisorDetails` drive it from `useQueryParamState('tab', 'overview', 'push')` — the pattern `Approvals` already proved. Added **Home/End** and a roving `tabIndex`, and deleted the three dead exports | tabs deep-linkable; 3 dead exports → **0** references |
| `F-15` | `Tooltip` opens on **focus** as well as hover, closes on **Escape**, gives the panel a `useId()` id and clones the trigger with `aria-describedby` while visible, and shows instantly within a group via a module-level `lastShownAt`. The dead `containerRef` is gone | keyboard/AT users can now reach it |
| `F-16` | **Phase 0's "keep and fix" decision applied.** The handle is a real `role="separator"` with `aria-orientation`/`aria-valuenow`/`min`/`max` and `tabIndex={0}`; drag moved from mouse to **pointer** events (touch and pen work); Arrow keys resize 16 px, Shift+Arrow 1 px, Home/End to the bounds | mouse-only → mouse + touch + keyboard |
| `F-18` | `markAsRead` / `markAllAsRead` move the unread badge immediately, then reconcile against the endpoint. On failure the previous count is restored **and** a `failureMessage` toast explains it, so the optimistic value is never a lie | badge updates without the round-trip |

**Two scope corrections, recorded rather than absorbed:**

1. **`F-05`'s list named 22 sites; there were 43.** Every `<Button onClick={() => navigate(…) }}` in the app is navigational (post-action redirects are bare `navigate()` calls inside async handlers), so all 43 were converted and 6 files' newly-unused `useNavigate` imports removed.
2. **`F-18`'s third site does not exist as described.** "Preference toggles" are saved as one `putOrgSettings` call behind a single Save button in both Settings pages, so there is no per-toggle mutation to make optimistic. The optimistics landed on the two notification mutations, which are the ones users actually watch.

**Deliberately excluded** (and why): dropdown `DropdownItem` "View/Edit" items stay buttons — a menu has its own keyboard model, and every one of those menus sits inside a row that now exposes a real link; the `Dashboard` clickable cards/rows are not `Button`s and were out of the plan's list.

**Verification:**

| Check | Baseline | After Phase 4 | Target |
|---|---|---|---|
| `onClick={() => navigate(` on a `Button` | 72 | **0** | 0 ✅ |
| `navigate(` call sites | 104 | 61 | post-action allowlist ✅ |
| `<Button to={…}>` | 0 | **43** | every navigational control ✅ |
| real `<Link>` in clickable rows | 0 | **4** | ≥3 ✅ |
| `Tabs` controlled + URL-synced | 0 | **2** pages | both ✅ |
| roving `tabIndex` in `Tabs` | no | **yes** | ARIA tabs pattern ✅ |
| dead tab exports (`TabList`/`TabTrigger`/`TabContent`) | 3 | **0** | deleted ✅ |
| `Tooltip` `onFocus` / `aria-describedby` / Escape | 0 / 0 / 0 | **all three** | ✅ |
| Drawer handle `role="separator"` / pointer / arrow keys | 0 / 0 / 0 | **all three** | ✅ |
| optimistic notification mutations | 0 | **2** | low-risk only ✅ |
| `tsc -b --noEmit` | clean | **clean** | ✅ |
| `npm run lint` | 0 errors / 20 warnings | **0 errors / 20 warnings** | no new findings ✅ |
| `npm run build` | exit 0 | **exit 0** | ✅ |

**Exit criteria:** ⚠️ **the command-verifiable criteria are met; the manual ones are not yet.** `V-9` is now fully justified — every remaining `navigate()` is a post-action redirect or non-`Button` wiring. Still open, each needing a human (§8.3): Cmd/middle-click on a converted control and on a row name, tab refresh + Back on both detail pages, the tooltip actually being *announced* (needs a screen reader), keyboard resize of the drawer (needs a device), and the optimistic badge on Slow 3G plus its forced-500 rollback.

---

### Phase 5 — Depth and polish *(≈3–4 days)*

**Goal:** responsiveness, perceived quality, and the remaining content/design details.
**Findings:** `F-20` · `F-19` · `F-21` · `F-23` · `F-25` · `F-26` · `F-27` · `F-28` *(optional)*

| Order | Work | Note |
|---|---|---|
| 1 | **`F-20`** debounce search → URL (local state + 200–300 ms); add `useDeferredValue` only if profiling demands it | Highest perceived-quality win of the phase; measure with a throttled CPU |
| 2 | **`F-19`** add `useDelayedLoading` and wire it **inside** `LoadingState` / `FullPageSpinner` so all call sites inherit it | Verify the error path still renders while the spinner is hidden |
| 3 | **`F-23`** consolidate date formatting: route the 2 bare `toLocaleDateString()` calls and the 6 inline `Intl.DateTimeFormat` sites through `utils/date.ts`; document the app locale | Do this before `F-22` if you also touch `format.ts`, to keep one PR touching the same helper |
| 4 | **`F-21`** chart tick colour → token; add `role="img"` + summary (or a visually-hidden table); loading → `LoadingState` | Check the `black` theme specifically |
| 5 | **`F-25`** Avatar: `role="img"` + composed label, sr-only status text, img dimensions | 23 call sites — one component change covers all |
| 6 | **`F-26`** respect reduced motion + "stick to bottom only if at bottom" in `AIChatPanel` | Tiny, satisfying fix for AI users |
| 7 | **`F-27`** image dimensions, lazy-loading, delete unreferenced assets (confirm with design owner first) | `src/assets/hero.png`, `react.svg`, `vite.svg` |
| 8 | **`F-28`** *(optional, only with visual-QA budget)* layered shadow tokens and remap | Lowest priority in the register |

**Exit criteria:** typing is smooth on a throttled CPU; no spinner flash on fast navigation; chart ticks adapt to all three themes and the chart is announced; `grep -rn 'toLocaleDateString()' src` → 0.
**Rollback:** per commit; `F-19` and `F-20` are the only ones with shared-component reach, and both are individually revertible.

---

### Phase 6 — Guards and policy *(docs now; tests with approval)*

**Goal:** make these rules enforceable so the audit doesn't have to be repeated.
**Findings:** `F-29` · `F-30`

| Order | Work |
|---|---|
| 1 | **`F-30`** agree the house style (heading case, `and` vs `&`, numerals, acronyms, title pattern) and record it in §4 of this file; fix the `Register.tsx:131` straggler |
| 2 | **`F-29.1`** make the citations resolve — repoint the 24 `Guideline N.M` comments (5 of which name `frontend_eval.md §12`) at `interface_guide.txt`, or commit the referenced checklist |
| 3 | **`F-29.2`** fix the `AIChatPanel.tsx:41` mis-citation |
| 4 | **`F-29.3`** *(needs approval — new devDependencies)* add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` (`environment: 'jsdom'`) and a `test` script; write behavioural tests for `F-01`/`F-02`, `F-03`/`F-04`, formatters, and `Tabs` URL sync |
| 5 | Optional: wire `npm run lint` + `npm test` + `npm run build` into CI so Phases 1–5 can't silently regress |

**Exit criteria:** `grep -rn 'frontend_eval.md' src` → 0 or the file exists; lint/build green; tests (if approved) fail when `noValidate` or the focus trap is removed.

---

### Phase summary

| Phase | Findings | Effort | Risk | Dependency |
|---|---|---|---|---|
| 0 Baseline & decisions ✅ | — | ½ d *(done 2026-09-29)* | none | — |
| 1 Validation & a11y ✅ | F-01, F-02, F-03, F-04, F-06, F-07, F-14 | 2–3 d *(done 2026-09-29)* | ~~Medium-High~~ shipped | Phase 0 decisions |
| 2 Mechanical sweeps ✅ | F-08, F-08b, F-09, F-10, F-11, F-13, F-22, F-24 | 1–2 d *(done 2026-09-29)* | Low | none |
| 3 Error copy ✅ | F-12 | 1–2 d *(done 2026-09-29)* | Low | copy review (can run in parallel with Phase 2) |
| 4 Interaction semantics ✅ | F-05, F-05b, F-15, F-16, F-17, F-18 | 3–4 d *(done 2026-09-30)* | Medium | Phase 1 (focus hook) |
| 5 Depth & polish | F-19, F-20, F-21, F-23, F-25, F-26, F-27, F-28 | 3–4 d | Low-Medium | Phase 2 (formatters) |
| 6 Guards & policy | F-29, F-30 | ½ d + (tests) | Low | approval for tests |

**Total:** roughly **11–16 working days** for Phases 0–6 excluding the optional test infrastructure. Phases 2 and 3 are independent of Phase 1 and can be parallelised with a second reviewer.

---

## 8. Progress checklist

> Tick items as work lands. `[ ]` = todo · `[x]` = done · `[~]` = accepted exception (record *why* next to it). **Nothing is "done" without two things: the §9 verification command passing, and a commit hash recorded in the `Commit` column of §8.2.**

### 8.1 Status snapshot

| Phase | Items | Done | Exceptions | Status |
|---|---|---|---|---|
| 0 — Baseline & decisions | 4 process items | **4 ✅** | 0 | ✅ **Done** |
| 1 — Validation & a11y | 7 (F-01, F-02, F-03, F-04, F-06, F-07, F-14) | **7 ✅** | 0 | ✅ **Done** — manual device checks open (§8.3) |
| 2 — Mechanical sweeps | 8 (F-08, F-08b, F-09, F-10, F-11, F-13, F-22, F-24) | **8 ✅** | 0 | ✅ **Done** — manual visual checks open (§8.3) |
| 3 — Error copy | 1 (F-12) | **1 ✅** | 0 | ✅ **Done** — manual voice/500 pass open (§8.3) |
| 4 — Interaction semantics | 6 (F-05, F-05b, F-15, F-16, F-17, F-18) | **6 ✅** | 0 | ✅ **Done** — manual keyboard/device passes open (§8.3) |
| 5 — Depth & polish | 8 (F-19, F-20, F-21, F-23, F-25, F-26, F-27, F-28) | **6 ✅** + 1 partial (F-27) | 1 (F-28) | 🟡 Code done — F-27 asset deletion awaits the design owner; visual checks open (§8.3) |
| 6 — Guards & policy | 2 (F-29, F-30) **+ F-31, F-32 raised** | **4 ✅** | 0 | ✅ Complete — 29.3 declined by decision |
| **Total** | **38** — 32 findings + 2 derived items (F-05b, F-08b) + 4 process items | **36** (Phases 0–6) | **1** (F-28) | ✅ Phases 0–6 complete — 1 partial (F-27, blocked on the design owner) |

**Findings marked WONTFIX / accepted exception:** **F-28** — single-layer shadows accepted *out* (Phase 0, 2026-09-29: no visual-QA budget allocated; revisit if a design review asks).

### 8.2 Per-finding tracker

| ID | Finding (short) | Sev | Phase | Status | Commit | Notes |
|---|---|---|---|---|---|---|
| F-01 | Native validation vs app validation | High | 1 | `DONE` | *uncommitted* | `noValidate` ×12; `min`/`step` cut where `validate()` owns the rule |
| F-02 | No focus-first-error | High | 1 | `DONE` | *uncommitted* | `utils/focusFirstError.ts`, 11 call sites |
| F-03 | 6 hand-rolled dialogs | High | 1 | `DONE` | *uncommitted* | all 6 deleted; `hooks/useFocusTrap.ts`; Modal/ConfirmDialog/Drawer on the hook |
| F-04 | MobileNav dialog | High | 1 | `DONE` | *uncommitted* | trap + `aria-label="Main navigation"` |
| F-05 | Navigational buttons | Med | 4 | `DONE` | *uncommitted* | `Button to=` → `<Link>`; 43 controls converted, 72 → 0 |
| F-06 | Topbar search 14 px | Med | 1 | `DONE` | *uncommitted* | `text-base sm:text-sm` |
| F-07 | No scroll-margin under sticky header | Low-Med | 1 | `DONE` | *uncommitted* | global `[id] { scroll-margin-top: 4.5rem }` |
| F-08 | `transition-all` ×8 (+ `duration-300` ×5) | Med | 2 | `DONE` | *uncommitted* | `transition-all` 8 → 0, explicit properties; F-08b all → `duration-200` |
| F-09 | 7 hover-contrast pairs | Med | 2 | `DONE` | *uncommitted* | 7 → 0; `hover:text-foreground` now 43 |
| F-10 | `Loading...` literal | Low | 2 | `DONE` | *uncommitted* | `'Loading…'` |
| F-11 | Straight apostrophes ×8 | Low | 2 | `DONE` | *uncommitted* | 9 strings (8 listed + 1 the audit missed); comments untouched |
| F-12 | 48 `Failed to …` strings | Med | 3 | `DONE` | *uncommitted* | `utils/errorMessage.ts`; 46 user-facing strings → 0, only 2 `console.error` remain |
| F-13 | `spellCheck` never set | Low | 2 | `DONE` | *uncommitted* | `noSpell` prop on `Input`; 14 sites + 8 raw inputs |
| F-14 | `inputMode` 1/5 fields | Med | 1 | `DONE` | *uncommitted* | 5/5 fields |
| F-15 | Tooltip hover-only | Med | 4 | `DONE` | *uncommitted* | focus/blur, Escape, `useId` + `aria-describedby`, instant-in-group |
| F-16 | Drawer resize mouse-only | Low | 4 | `DONE` | *uncommitted* | Phase 0 decision: kept + fixed (`role="separator"`, pointer, arrow keys) |
| F-17 | Tabs not URL-synced + dead exports | Med | 4 | `DONE` | *uncommitted* | controlled `Tabs`, URL-synced on 2 pages, Home/End + roving tabIndex, 3 dead exports deleted |
| F-18 | No optimistic updates | Med | 4 | `DONE` | *uncommitted* | optimistic badge + rollback + toast on both notification mutations |
| F-19 | No min loading duration | Low-Med | 5 | `DONE` | *uncommitted* | `hooks/useDelayedLoading.ts` inside `LoadingState` + `FullPageSpinner`; 200 ms delay / 350 ms min |
| F-20 | Search writes URL per keystroke | Med | 5 | `DONE` | *uncommitted* | `useDebouncedQueryParam`; 9 search fields (plan listed 8) |
| F-21 | Chart tick literal + no alt + spinner | Med | 5 | `DONE` | *uncommitted* | tick → `var(--color-muted-foreground)`, `role="img"` + summary + `sr-only` table, `LoadingState` |
| F-22 | Unit spacing / nbsp | Low | 2 | `DONE` | *uncommitted* | D-4 (a): `formatHours` owns the style; 62 call sites routed |
| F-23 | 3 date-formatting paths | Med | 5 | `DONE` | *uncommitted* | D-5 (a) en-US documented; 2 bare + 6 inline sites migrated; V-7 → 0 |
| F-24 | No `translate="no"` | Low | 2 | `DONE` | *uncommitted* | `translate="no"` on `<html>` |
| F-25 | Avatar labels/colour-only status | Low-Med | 5 | `DONE` | *uncommitted* | one composed `role="img"` label, `sr-only` status text, `img` dimensions |
| F-26 | Smooth scroll ignores reduce-motion | Low-Med | 5 | `DONE` | *uncommitted* | `matchMedia` check + stick-to-bottom-only-when-at-bottom (120 px) |
| F-27 | Image dimensions + dead assets | Low | 5 | `PARTIAL` | *uncommitted* | dimensions + lazy loading on both `<img>` done; asset deletion gated on the design owner (§10 `5.1`) |
| F-28 | Single-layer shadows (optional) | Low | 5 | `WONTFIX (accepted)` | — | Phase 0: accepted out, no visual-QA budget |
| F-29 | Missing eval doc + no test runner | Med | 6 | `DONE` (29.3 declined) | *uncommitted* | 29.1: 26 citations repointed to `interface_guide.txt`; 29.2: **2** mis-citations fixed (1.3→5.2, 8.16→house rule); 29.3 declined — `D-7` re-confirmed (b) |
| F-30 | Copy-policy decisions | Low | 6 | `DONE` | *uncommitted* | §4.A HS-1…HS-7 recorded; 2 sentence-case headings fixed (101/101 conform); body-copy `&`→`and` |
| F-31 | Shortcut hint hardcodes `⌘K` | Low | 6 | `DONE` | *uncommitted* | *Raised by the Phase 6 sweep.* New `useIsMac`; label is `⌘ + K` / `Ctrl + K` |
| F-32 | `AIChatPanel` had no Tab trap | Med | 6 | `DONE` | *uncommitted* | *Raised by the Phase 6 sweep.* Bespoke effect replaced by `useFocusTrap`; 5/5 dialogs now trapped |

### 8.3 Actionable checklist

#### Phase 0 — Baseline & decisions — ✅ **COMPLETE 2026-09-29**
- [x] **0.1** Baseline captured: output of §9 `V-1`…`V-10` pasted into the tracking PR/issue · evidence: [`interface_fix_baseline.md`](./interface_fix_baseline.md) — 489-line transcript (guard rail, drift log, raw outputs) captured at `2d16933`
- [x] **0.2** Decisions `D-1`…`D-7` (§10) answered and recorded below · owner: engineering, recorded 2026-09-29 (`D-4` and `D-6` are the two product-visible taste calls — reversible at their phase's review)
- [x] **0.3** This checklist adopted as the tracker (issue created, or ticked in place here) · **this file is the tracker of record** — no external issue tracker
- [x] **0.4** Optional items decided: `F-29.3` vitest **OUT** (§9 script is the interim guard) · `F-28` shadows **OUT, accepted exception** · `F-16` resize handle **KEEP + fix**
- *Reconciled while executing 0.1:* commit anchor `a83e422` → `2d16933` (`DailyEntryCard.tsx` did not exist at the old hash), `V-9` baseline ≈30 → **72**, file count 130 → **135** · evidence: baseline file §2

#### Phase 1 — Validation & accessibility critical path — ✅ **CODE COMPLETE 2026-09-29** (manual device checks open)
- [x] **F-02** focus-first-error helper
  - [x] helper created · path: `src/utils/focusFirstError.ts` (deferred to `requestAnimationFrame`, honours `prefers-reduced-motion`, optional `fallback` for list-style errors)
  - [x] wired into `auth/AdminLogin`, `auth/UserLogin`, `auth/Register`, `auth/ResetPassword`, `auth/InviteRedeem` (5)
  - [x] wired into `admin/CreateUser`, `admin/EditUser`, `admin/CreateProject`, `admin/EditProject`, `admin/InvoiceForm` (5)
  - [x] wired into `components/timesheets/DailyEntryCard` (list-style errors → `fallback` = `#daily-hours`) — **11 call sites total**
  - [ ] manual: Tab → Submit → Enter lands on the first invalid control (keyboard only) · **needs a human pass**
  - [x] pre-req discovered: 5 raw controls that render an app error had no `aria-invalid`, so focus could never reach them — `AdminLogin`/`UserLogin` password (plus the missing `id`/`htmlFor`), `CreateUser`/`EditUser` password, `InvoiceForm` project `<select>`
- [x] **F-01** single validation source (`noValidate` + app rules)
  - [x] constraint diff done per form before conversion — every `required` in JSX is covered by that form's `validate()`; **the one rule that was missing** (negative variable-cost amount) was **moved into `InvoiceForm`'s `validate()` first**, then the attribute removed
  - [x] `DailyEntryCard` (proven case — `min`/`max`/`step` gone, quarter rule app-only, historical note kept at `:43-52`)
  - [x] `admin/CreateUser` · [x] `admin/EditUser` · [x] `admin/CreateProject` · [x] `admin/EditProject`
  - [x] `admin/InvoiceForm` · [x] `auth/AdminLogin` · [x] `auth/UserLogin` · [x] `auth/Register` · [x] `auth/ResetPassword` · [x] `auth/InviteRedeem` · [x] `user/Timesheets` (new dialog form)
  - [x] `admin/ClientDetails` · `admin/Settings` · `user/Settings` · `user/TimesheetEditor` → **N/A, no `<form>` and no `validate()` exist** (see §7 Phase 1 amendment 1)
  - [x] `min`/`max`/`step` removed where `validate()` owns the rule — `DailyEntryCard` (min/max/step), `InvoiceForm` (2 × `min="0"`); kept on `TimesheetEditor`'s grid and `Settings:190`, which have no app validator (amendment 3)
  - [x] `required` kept as an **annotation-only allowlist** (70, unchanged) — inert under `noValidate`, still exposes `aria-required` (amendment 2)
  - [x] §9 `V-1`: `<form noValidate>` 0 → **12**, one per app-validated form
  - [ ] manual: no native bubble in Chrome, Firefox, Safari; inline errors render and are announced · **needs a human pass**
- [x] **F-14** `inputMode="decimal"` on `InvoiceForm:244`, `InvoiceForm:303`, `TimesheetEditor:719`, `Settings:190` *(shipped with F-01)* — 1 → **5**
  - [ ] manual: Android Chrome numeric keypad on all four fields · **needs a device**

- [x] **F-03** six hand-rolled dialogs — all six hand-rolled overlays **deleted**
  - [x] `useFocusTrap` hook extracted (from `Modal.tsx:27-63` / `ConfirmDialog.tsx:31-59`) · path: `src/hooks/useFocusTrap.ts` — also adopted by `Drawer`, which carried a 4th copy (topmost-wins ordering for nested overlays)
  - [x] `Modal`, `ConfirmDialog`, `Drawer` refactored onto the hook (no behaviour change: `Modal`/`Drawer` focus the panel, `ConfirmDialog` focuses the first control)
  - [x] `components/approvals/ReviewPanel.tsx:16` → shared `ConfirmDialog` (local copy deleted, + F-03 note)
  - [x] `pages/user/Timesheets.tsx:193` → `Modal` with `title`/`description`; the fields now sit in a real `<form noValidate>`, so Enter submits
  - [x] `pages/user/TimesheetEditor.tsx:38` (local `ConfirmDialog`) → shared one; warnings passed as `children` via a small `WarningList`
  - [x] `pages/user/TimesheetEditor.tsx:873` (`WithdrawModal`) → shared `Modal`, matching the `DeclineModal` house pattern
  - [x] `pages/admin/ProjectDetails.tsx:29` → shared `ConfirmDialog` (local copy deleted)
  - [x] `pages/admin/SupervisorDetails.tsx:22` → shared `ConfirmDialog` (local copy deleted)
  - [x] `role="dialog"` 11 → **5**, and all 5 expose `aria-label`/`aria-labelledby` (checked mechanically)
  - [x] dialog `addEventListener('keydown'` 4 → **1**
  - [ ] manual: Tab/Shift+Tab trapped · Escape closes · name announced · focus returned to trigger, on all 7 surfaces · **needs a human + screen reader**
- [x] **F-04** `MobileNav.tsx:12-22` (now `:13-28`)
  - [x] focus trap + Escape wired (via `useFocusTrap`) · [x] `aria-label="Main navigation"` · [x] `tabIndex={-1}` on the panel so focus can land on it
  - [ ] manual: focus enters panel on open / returns to the hamburger on close · **needs a device**
- [x] **F-06** `Topbar.tsx:203-208` → `text-base sm:text-sm` (desktop keeps `text-sm`)
  - [ ] manual: iOS Safari, no page zoom on focus · **needs a device**
- [x] **F-07** global `[id] { scroll-margin-top: 4.5rem }` added to the `index.css` Phase 0 block (`:286-293`) with a citation comment, rather than a one-off `scroll-mt-16` on `#main-content`
  - [ ] manual: skip link leaves the target fully visible below the sticky Topbar · **needs a human pass**

#### Phase 2 — Mechanical consistency sweeps — ✅ **CODE COMPLETE 2026-09-29** (manual visual checks open)
- [x] **F-08** `transition-all` → explicit properties · **8 → 0**
  - [x] `ui/Modal.tsx` → `transition-opacity` · [x] `ui/Toast.tsx` → `transition-opacity` · [x] `ui/ThemeToggle.tsx` → `transition-colors`
  - [x] `ui/Progress.tsx` → `transition-[width]` · [x] `layout/Sidebar.tsx` → `transition-[width]` · [x] `ai/AIChatWidget.tsx` → `transition-colors`
  - [x] `pages/admin/ProjectDetails.tsx` → `transition-[width]` · [x] `pages/user/TimesheetEditor.tsx` → `transition-[width]`
  - [x] §9 `V-3` returns 0
  - [ ] visual pass: Modal/Drawer open-close, Toast in/out, Sidebar collapse, progress bars · **needs a human**
- [x] **F-08b** `duration-300` review — **decision: every interaction animation ≤200 ms** (5 → 0). Why: the guide asks for quick interactions, and none of these need a third of a second to read as motion. Applied to `ThemeToggle.tsx:54`/`:56` (icon rotate), `Progress.tsx` (fill), `Sidebar.tsx:89` (rail collapse), `Sidebar.tsx:195` (mobile slide)
- [x] **F-09** hover-contrast: `Modal`, `Drawer`, `Toast`, `Topbar` ×2, `MobileNav`, `Sidebar`
  - [x] all 7 fixed (7 → 0; correct `hover:text-foreground` now 43) · [x] §9 `V-5` returns 0
  - [ ] checked in light + dark + black · **needs a human**
- [x] **F-10** `FullPageSpinner.tsx:11` → `'Loading…'` · §9 `V-6` returns 0
- [x] **F-11** curly apostrophes: the 8 listed + **`AIChatPanel.tsx:196`**, which the audit missed
  - [x] all 9 replaced (comments untouched — the one remaining `don't` is inside a JSX comment)
  - [ ] verified in the rendered app · **needs a human**
- [x] **F-13** spellcheck off on identifiers/emails/codes, on for prose
  - [x] `noSpell` prop added to `Input` (sets the three attributes together) · [x] applied to **14** sites: every email field, Employee ID (Create/Edit/Onboarding/user Settings), admin pass, passwords
  - [x] the **8 raw inputs** that bypass the primitive got the same three attributes
  - [x] prose confirmed untouched (timesheet descriptions, notes, decline reasons keep spellcheck)
  - [ ] verified: no spell marks on identifiers, still present on prose · **needs a browser**
- [x] **F-22** unit rule applied per decision `D-4`(a) — `formatHours` now emits `\u00a0` and owns the style
  - [x] **scope corrected:** the plan said 2 formatters; reality was **62** inline `toFixed(1)}h` expressions across 16 files. All 62 + 8 template-literal sites now route through `formatHours`; the 6 prose sites keeping 2-decimal/integer precision use `\u00a0` inline
  - [x] `Reports.tsx:206` chart formatter switched to `formatHours`
  - [x] call sites audited (Dashboard, TimesheetEditor, Reports, all timesheet tables, ReviewPanel, KPI chips — 16 files)
  - [ ] **layout regression check** — the value is ~5 px wider in dense right-aligned tables; `D-4` said to fall back to (b) here if it visibly hurts · **needs a human**
- [x] **F-24** `translate="no"` added to `<html lang="en">` (`index.html:2`) with a rationale comment
  - [ ] verified with Chrome translate on "Eniac" and identifier strings · **needs a browser**

#### Phase 3 — Error copy *(F-12)* — ✅ **CODE COMPLETE 2026-09-29** (manual voice/500 pass open)
- [x] Before → after copy table for all **48** sites, grouped by area · owner: audit (needs a **product-voice read** — see below) · evidence: §7 Phase 3 outcome
- [x] `err.message` passthrough policy decided and implemented as code (`D-3`), and user-grade backend messages identified: the helper keeps "email already in use"-style details and drops the `[CODE] ` envelope the `apiClient` adds, plus `INTERNAL_ERROR`, `Request timeout`, `Unauthorized`, stack/JSON text
- [x] Applied — admin: `CreateUser`, `EditUser`, `CreateProject`, `EditProject`, `Users`, `Onboarding`, `Clients`, `ClientDetails`, `InvoiceForm`, `InvoiceDetail`, `Approvals`, `ProjectDetails`, `Settings`
- [x] Applied — user: `Settings`, `Timesheets`, `TimesheetEditor`, `ProjectDetails` · components: `approvals/ReviewPanel` · contexts: `AIContext`, `AppDataContext`
- [x] Every message names the object and states whether anything changed ("It is still a draft — nothing was sent", "Your edits are still on screen", "Your current password still works")
- [x] §9 `V-8` shows the only remaining `Failed to` inside `console.error` (48 → 2)
- [x] helper behaviour verified on 7 real backend responses — 7/7 assertions pass, run via Node's type stripping (no new dependencies installed)
- [ ] **product-voice read of the copy table** — the reassurance clauses are judgement calls, not facts · **needs a human**
- [ ] verified on a throttled network with forced 500s across the 8 groups (auth, users, invites, projects, clients, invoices, timesheets, settings) · **needs a human**

#### Phase 4 — Interaction semantics — ✅ **CODE COMPLETE 2026-09-30** (manual keyboard/mouse passes open)
- [x] **F-05** links for navigation
  - [x] `Button` gains a `to` prop rendering react-router `<Link>` (keeps `href` for external) · path: `components/ui/Button.tsx` — and the three renderings (button / external anchor / in-app Link) now share one `content` block so they cannot drift
  - [x] converted **43** controls across **25** files: every `admin/` + `user/` + `supervisor/` back button, edit button, "New/Create" CTA and empty-state action, plus the auth links (`AdminLogin`, `UserLogin`, `Register`, `InviteRedeem`)
  - [x] post-action `navigate()` redirects left untouched (intentional) — after login, after a successful create, after delete
  - [x] 6 files' now-unused `useNavigate` imports/bindings removed (caught by `tsc` `noUnusedLocals`)
  - [x] §9 `V-9`: `onClick={() => navigate(...)}` on a `Button` **72 → 0**; total `navigate(` 104 → 61 (all remaining are post-action or non-`Button` wiring)
- [x] **F-05b** clickable rows expose a real `<Link>` in the primary cell
  - [x] `admin/Users`, `admin/Supervisors`, `admin/Clients`, `admin/Projects` — each primary cell now wraps the name in a `<Link>` with `stopPropagation()` so the row's convenience click does not double-navigate
  - [x] row `onClick` and the dropdown `stopPropagation` left intact
  - [ ] Ctrl/Cmd-click + middle-click on a row name opens a new tab · **needs a human**
- [x] **F-17** `Tabs`
  - [x] optional `value` + `onValueChange` added; uncontrolled default preserved
  - [x] `admin/ProjectDetails` + `admin/SupervisorDetails` wired to `useQueryParamState('tab', 'overview', 'push')` — the `Approvals` pattern
  - [x] Home/End keys + roving `tabIndex={isActive ? 0 : -1}`
  - [x] dead exports removed: `TabList`, `TabTrigger`, `TabContent` (0 references anywhere)
  - [ ] verified: tab survives refresh, Back returns to the previous tab, only the active tab is tabbable · **needs a human**
- [x] **F-18** optimistic updates — **2 of the 3 proposed sites**
  - [x] `markAsRead` / `markAllAsRead` in `contexts/NotificationContext.tsx` move the badge immediately, then reconcile from the endpoint; on failure the previous count is restored **and** a `failureMessage` toast explains it
  - [x] confirmed **not** applied to invoice / approval / payroll mutations
  - [x] *preference toggles not applicable* — `admin/Settings` and `user/Settings` save the whole preference set in one `putOrgSettings` call behind a single Save button, so there is no per-toggle mutation to be optimistic about. Recorded rather than silently dropped
  - [ ] verified: badge updates instantly on Slow 3G; a forced 500 reverts and toasts · **needs a human**
- [x] **F-15** Tooltip: focus/blur mirror, `id` + `aria-describedby`, Escape dismissal, instant-within-group, dead `containerRef` removed
  - [x] `role="tooltip"` now carries a `useId()` id and the trigger is cloned with `aria-describedby` while visible; a module-level `lastShownAt` makes the second tooltip in a group instant
  - [ ] verified: keyboard focus shows **and announces** the tooltip; Escape hides it · **needs a screen reader**
- [x] **F-16** drawer resize handle — **Phase 0 decision applied: keep and fix**
  - [x] `role="separator"` + `aria-orientation="vertical"` + `aria-valuenow/min/max` + `tabIndex={0}`, so AT announces a separator with a value
  - [x] `onMouseDown`/`mousemove` → **pointer** events (mouse, touch and pen)
  - [x] Arrow keys resize by 16 px (1 px with Shift), plus Home/End
  - [ ] verified: keyboard resize announces the new width; touch drag works · **needs a device**

#### Phase 5 — Depth & polish — 🟡 **CODE COMPLETE 2026-09-30** (F-27 asset deletion open)
- [x] **F-20** debounce search → URL — `useDebouncedQueryParam('q')` (250 ms) on all 9 search fields: `admin/Users.tsx`, `admin/Invoices.tsx`, `supervisor/Timesheets.tsx`, `admin/Clients.tsx`, `admin/Timesheets.tsx`, `user/Projects.tsx`, `user/Timesheets.tsx`, `admin/Supervisors.tsx` **+ `admin/Projects.tsx`** (the plan listed 8; the sweep found 9)
  - [x] code: the field updates instantly, only the URL write is debounced, and Back/Forward re-seeds the field without clobbering in-flight typing
  - [ ] manual: ≤2 URL updates for a 12-char query; typing smooth on 6× CPU throttle; Back restores the screen
- [x] **F-19** `useDelayedLoading` hooked **inside** `LoadingState` + `FullPageSpinner` (200 ms delay, 350 ms minimum); the optional `isLoading` prop lets a caller holding a real flag also honour the minimum
  - [x] code: the gate renders `null` until the delay elapses and holds once shown
  - [ ] manual: no flash on fast navigation · slow request still shows the indicator · error state renders while hidden
- [x] **F-23** dates through one path
  - [x] `Topbar.tsx:306` (→ `formatDateTime`) + `InvoiceDetail.tsx:157` (→ `formatDate`) bare `toLocaleDateString()` replaced
  - [x] inline `Intl.DateTimeFormat` migrated: `admin/Dashboard.tsx` ×2, `user/Dashboard.tsx` ×2, `ActivityTimeline.tsx`, `DeadlineCard.tsx` → `formatShortDate` / `formatDate` / `formatDateAutoYear`
  - [x] app locale documented (`APP_LOCALE = 'en-US'`, decision `D-5` (a), comment block in `utils/date.ts`) · [x] §9 `V-7` returns **0**
- [x] **F-21** Reports chart: tick → `var(--color-muted-foreground)` (0 colour literals left on the page) · `role="img"` + generated `chartSummary` · `sr-only` table carrying the same values · bespoke spinner → `LoadingState`
  - [ ] manual: verified in all three themes
- [x] **F-25** Avatar: `role="img"` + composed label (`name — status`) on the wrapper, inner labels removed, `sr-only` status text, `width`/`height` from a size→pixel map
  - [ ] manual: announced once; greyscale screenshot distinguishes presence
- [x] **F-26** `AIChatPanel.tsx`: `matchMedia('(prefers-reduced-motion: reduce)')` picks the scroll behaviour, and auto-scroll only fires when already within 120 px of the bottom
- [x] **F-27** image dimensions — `Avatar` (`width`/`height` + `loading="lazy"` + `decoding="async"`) and the admin logo preview (`64`×`64`, lazy)
- [ ] **F-27** dead assets — `hero.png`, `react.svg`, `vite.svg` still present **by decision**: all three have 0 references, but deletion is gated on design-owner confirmation (§10 item `5.1`). Once confirmed: `git rm frontend/src/assets/hero.png frontend/src/assets/react.svg frontend/src/assets/vite.svg`
- [x] **F-28** *(optional)* marked **WONTFIX (accepted)** — Phase 0 decision: no visual-QA budget allocated (reason recorded in §3 and §8.2)

#### Phase 6 — Guards & policy
- [x] **F-30** house style agreed (`D-5`(a) en-US, `D-6`(a) Title Case + `and`) and recorded as **§4.A HS-1…HS-7** with the Vercel carve-out and the `&` exception spelled out
  - [x] `Register.tsx:135` `Create your account` → **Create Your Account**
  - [x] `ResetPassword.tsx:69` `Reset password` → **Reset Password** *(the straggler scan found a second one, not the one in the plan)*
  - [x] heading sweep: **101/101** conform, **0** stragglers
  - [x] `AIChatPanel.tsx:205` body copy `&` → `and` per HS-2 (the 3 remaining `&` are short labels, covered by the exception)
  - [x] numerals: **0** spelled-out counts remain
- [x] **F-29.1** all **26 citation sites** repointed from the non-existent `frontend_eval.md` to `interface_guide.txt`, each with a line number **and** the rule's opening words (they sit on **24** source lines; 5 of those cite two rules each)
  - [x] `grep -rn 'frontend_eval' src` → **0** · [x] `grep -rn 'checklist item' src` → **0**
- [x] **F-29.2** mis-citations corrected — **two** found, not one:
  - [x] `AIChatPanel.tsx:50` Cmd/Ctrl+Enter: `Guideline 1.3` (Manage focus) → **`5.2` "Textarea behavior"** (`interface_guide.txt:80`)
  - [x] `AIChatPanel.tsx:202` `Guideline 8.16` — **section 8 (Vercel-specific) has no numbered items at all**, so this pointed at nothing; replaced with the HS-6 house convention it actually implements (now `AIChatPanel.tsx:195`)
- [x] **F-29.3** **not approved — re-opened and closed at Phase 6.** `D-7`(a) was re-confirmed with the owner on 2026-09-30: keep deferring, no new devDependencies. `npm test` still does not exist by decision; the §9 greps remain the regression guard (`V-11`)
- [x] **F-31** *(raised by this sweep, fixed immediately)* the search `<kbd>` hardcoded `⌘K` on every platform while the handler accepts Ctrl too — new `useIsMac` hook, label now `⌘ + K` / `Ctrl + K` (the only surviving `⌘K` string is the doc comment explaining the fix)
- [x] **F-32** *(raised by this sweep, fixed immediately)* `AIChatPanel` declared `aria-modal="true"` but had **no Tab trap** — the one overlay `F-03`'s page-level audit missed. Bespoke effect replaced by the shared `useFocusTrap`; **5/5** real dialogs now trapped
- [x] Final: `npx tsc -b --noEmit` clean · `npm run lint` 0 errors · `npm run build` green · all §9 commands re-run and recorded as the Phase 6 result tables below · §1 scorecard updated to the final verdicts

---

#### 5.1 — Dead assets: `hero.png`, `react.svg`, `vite.svg` *(open — design owner)*
- **Question for the design owner:** may `frontend/src/assets/hero.png` be deleted? All three files have **0 references** anywhere in `src` or `index.html` (re-verified 2026-09-30). `react.svg` and `vite.svg` are Vite starter defaults and are clearly safe; `hero.png` is the one that could have been intended for a future landing page.
- **Decision (2026-09-30):** **not deleted.** F-27's code items are complete; the deletion stays open until the design owner answers, because a large unreferenced image in the tree reads as an in-use above-the-fold asset to the next reviewer.
- **To close:** run the `git rm` in §8.3 Phase 5, re-run §9 `V-10`, and flip F-27 to `DONE`.

---

## 9. Verification command reference

Run from `frontend/`. Each command is the objective test for the finding(s) named beside it. Record the **before** and **after** output in the tracking issue — that's the definition of done.

```bash
# V-1  F-01, F-02, F-14 — validation surface & numeric keypads
grep -rn '<form noValidate' src --include=*.tsx       # Phase 1 result: 12 — one per app-validated form
grep -rn '<form ' src --include=*.tsx | grep -v noValidate  # Phase 1 result: only the AI chat composer (no validation at all)
grep -rno ' required' src --include=*.tsx | wc -l   # stays 70 by decision: annotation-only (aria-required), inert under noValidate
grep -rn 'focusFirstError(' src --include=*.tsx | grep -v utils/ | wc -l   # Phase 1 result: 11 call sites
grep -rn 'step=\|min="' src --include=*.tsx         # Phase 1 result: only Settings:190 + the TimesheetEditor grid (no app validator there)
grep -rn 'inputMode' src --include=*.tsx            # Phase 1 result: 5 ✅
grep -rn 'aria-invalid' src/components/ui/*.tsx     # unchanged — this is what focusFirstError keys off

# V-2  F-03, F-04 — dialog focus management
grep -rn 'role="dialog"' src --include=*.tsx        # Phase 1 result: only Modal / Drawer / ConfirmDialog / AIChatPanel / MobileNav
grep -rn 'aria-modal' src --include=*.tsx           # every hit must sit beside aria-label or aria-labelledby
grep -rn "addEventListener('keydown'" src           # Phase 1 result: the 4 dialog listeners are now 1, inside useFocusTrap
grep -rln 'useFocusTrap(' src                       # Phase 1 result: Modal, ConfirmDialog, Drawer, MobileNav

# V-3  F-08 — animation property discipline
grep -rn 'transition-all' src --include=*.tsx       # Phase 2 result: 0 ✅
grep -rn 'duration-300\|duration-500' src --include=*.tsx   # Phase 2 result: 0 ✅ (house rule: <=200ms)

# V-4  F-06, C-01 — mobile zoom safety
grep -n 'viewport' index.html                       # must NOT contain maximum-scale / user-scalable
grep -n 'text-sm\|text-base' src/components/layout/Topbar.tsx   # search input must be text-base sm:text-sm

# V-5  F-09 — hover contrast
grep -rn 'hover:text-muted-foreground' src --include=*.tsx | wc -l   # Phase 2 result: 0 ✅
grep -rn 'hover:text-foreground' src --include=*.tsx | wc -l         # baseline 36 -> 43 ✅

# V-6  F-10, F-11 — typography
grep -rn 'Loading\.\.\.' src                        # Phase 2 result: 0 ✅
grep -rn "Here's\|You're\|don't\|Week's" src --include=*.tsx   # Phase 2 result: comment lines only
grep -rno '’' src --include=*.tsx | wc -l           # baseline 1 -> 11 ✅
grep -rno '…' src --include=*.tsx | wc -l           # baseline 31 — must not fall

# V-7  F-22, F-23, F-24 — formats, units, translation
grep -rn 'toLocaleDateString()' src                 # baseline 2 -> expect 0 (F-23, Phase 5)
grep -rn 'Intl\.' src --include=*.tsx               # expect 0 outside shared utils (F-23, Phase 5)
grep -rn 'nbsp\|\\u00a0' src                        # Phase 2 result: 8 ✅ (F-22 closed)
grep -rn 'formatHours(' src --include=*.tsx --include=*.ts | grep -v utils/format   # 66 call sites (63 + 3 in the Phase 5 chart alt text) — every hours value goes through the one formatter
grep -rn 'toFixed(1)}h' src                         # Phase 2 result: 0 ✅ (no inline hours units left)
grep -rn 'translate=' src index.html                # Phase 2 result: 1 ✅ (F-24 closed)
grep -rn 'noSpell\|spellCheck' src --include=*.tsx  # Phase 2 result: 14 noSpell sites + 8 raw inputs (F-13 closed)

# V-8  F-12 — error copy
grep -rn 'Failed to' src --include=*.tsx            # Phase 3 result: 2, both inside console.error
grep -rn "addToast('error'" src --include=*.tsx | wc -l   # count unchanged; every failure now goes through the helper
grep -rn 'failureMessage(\|failureText(' src --include=*.tsx | wc -l   # Phase 3 result: 44 call sites

# V-9  F-05, F-05b, F-17 — links & URL state
grep -rn 'onClick={() => navigate' src --include=*.tsx | grep '<Button' | wc -l   # Phase 4 result: 0 — every navigational Button is a <Link>
grep -rn 'navigate(' src --include=*.tsx | grep -v 'useNavigate()' | wc -l   # Phase 4 result: 61 — the documented post-action allowlist
grep -rho 'to={' src/pages --include=*.tsx | wc -l   # Phase 4 result: 47 = 43 <Button to> + 4 row <Link>s
grep -rn 'useQueryParamState' src --include=*.tsx | wc -l        # must stay >= 64 (Tabs consumers added)
grep -rn 'TabList\|TabTrigger\|TabContent' src --include=*.tsx | wc -l   # Phase 4 result: 0 (dead exports deleted)

# V-10 F-13, F-15, F-18..F-21, F-25, F-26, F-29 — remaining items
grep -rn 'spellCheck' src --include=*.tsx           # baseline 0 -> expect coverage on identifier fields
grep -rn 'onFocus' src/components/ui/Tooltip.tsx    # expect present after F-15
grep -rn 'optimist' src/contexts/AppDataContext.tsx
grep -rn 'useDelayedLoading\|minDuration\|showDelay' src   # baseline 0 -> expect the hook + usages
grep -rn 'debounce\|useDeferredValue\|startTransition' src # baseline 0 -> expect debounce in the search path
grep -rn "'#" src/pages/admin/Reports.tsx           # expect no colour literals
grep -rn 'role="img"' src/components/ui/Avatar.tsx  # expect present after F-25
grep -rn "behavior: 'smooth'" src --include=*.tsx   # expect a reduced-motion guard beside it
grep -rn 'Guideline [0-9]\+\.[0-9]\+' src | wc -l  # baseline 24 -> expect 0 repointed at interface_guide.txt
grep -rn 'frontend_eval.md' src                     # baseline 5 -> expect 0 (or the file exists)

# V-11  F-29.1, F-29.2 — every citation resolves to a file that exists
grep -rn 'frontend_eval' src | wc -l                # Phase 6 result: 0 ✅
grep -rn 'checklist item' src | wc -l               # Phase 6 result: 0 ✅
grep -rn 'interface_guide.txt:' src | wc -l         # Phase 6 result: 24 resolvable citations
#   each one is  interface_guide.txt:<line> ("<rule>")  — spot-check any line with:
sed -n '15p;27p;56p;65p;80p;93p;109p;124p' ../interface_guide.txt

# V-12  F-30 — house copy convention (§4.A HS-1…HS-7)
grep -rn 'Create your account' src | wc -l          # Phase 6: 1 — body copy in the auth hero (correct; HS-1 covers headings only)
grep -rn '>Reset password<' src | wc -l             # Phase 6 result: 0 ✅
grep -rn 'Responses are AI-generated &' src | wc -l  # Phase 6 result: 0 ✅ (HS-2: body copy uses "and")
grep -rn '⌘K' src | wc -l                            # Phase 6: 1 — inside useIsMac's doc comment describing the bug, not rendered markup
grep -rno "'[^']* & [^']*'" src --include=*.tsx | grep -vi 'class\|import\|React\|&&' | wc -l   # 3 — the documented §4.A exception
# heading case: no <h1..h6> literal may be sentence case (scripted; returns stragglers, want none)

# Guard rail — must stay green in every PR
npm run lint && npm run build
```

**Manual matrices a grep cannot cover** (run after Phase 1 and again at the end):
1. Submit-with-error keyboard walk on 6 forms (Tab → Enter → focus lands correctly).
2. Escape/backdrop close + focus return on all 7 dialog surfaces.
3. Ctrl/Cmd-click + middle-click on 6 shared navigation entry points.
4. Refresh + Back on the Project Details and Supervisor Details tabs.
5. iOS Safari focus on the search field; Android Chrome numeric keypads on the 4 numeric fields.
6. Slow-3G notification read (instant badge) and a forced 500 (rollback + toast).

---

## 10. Open decisions (needed before Phase 1)

Answer these, then paste the answers under this list — they change what "correct" means for several findings.

| # | Decision | Options | Recommendation | Affects |
|---|---|---|---|---|
| D-1 | Validation ownership | (a) app-only: `noValidate` everywhere + `inputMode` for keypads · (b) keep native constraints, drop the app validator · (c) keep both, synced by hand | **(a)** — one source of truth, styled and announced errors, no browser bubbles | F-01, F-02, F-14 |
| D-2 | Dialog strategy | (a) migrate all 6 to shared `Modal`/`ConfirmDialog` · (b) keep bespoke layouts, share a `useFocusTrap` hook | **(a)** where the layout allows, **(b)** otherwise — the hook is needed either way for `MobileNav` | F-03, F-04 |
| D-3 | Raw `err.message` in toasts | (a) never show raw text — curated copy + `console.error` · (b) keep raw where the backend names the offending field | **(b) for field-level validation, (a) otherwise** — never lose the "which field" detail | F-12 |
| D-4 | Number/unit style | (a) `8.0 h` / `1.5 KB` with `\u00a0` · (b) keep compact `8.0h` as house style | **(a)**, unless dense grids visibly suffer — then record (b) as an accepted exception | F-22 |
| D-5 | App locale | (a) fix `en-US` for everyone and state it · (b) follow the browser locale end-to-end | **(a)** for an internal tool — removes date ambiguity with no i18n work | F-23 |
| D-6 | Heading case and `and` vs `&` | (a) Title Case headings + `and` in body copy · (b) follow the guide's Vercel-specific carve-out | **(a)**, then fix `Register.tsx:131` | F-30 |
| D-7 | Test infrastructure | (a) add vitest + testing-library in Phase 6 · (b) defer, relying on review + the §9 greps | **(a) if** this guide must hold long-term; otherwise (b) with the §9 baselines kept as a CI shell script | F-29 |

**Recorded answers — Phase 0, 2026-09-29** *(owner: engineering. `D-4` and `D-6` are the two product-visible taste calls — adopted at the recommended option and reversible at their own phase's review.)*

| # | Choice | Why this, not the alternative | Affects |
|---|---|---|---|
| D-1 | **(a) app-only validation** — `noValidate` on every app-validated form, `inputMode` for keypads, keep `aria-invalid` + inline messages | `DailyEntryCard.tsx:42-51` already documents the bug that mixed systems produce: native `min`/`step` snapped hours to 0.25/0.75 and pre-empted the app's error. One source of truth also means errors are styled *and* screen-reader-announced. (b) throws away the styled/announced path; (c) is the status-quo defect. | F-01, F-02, F-14 |
| D-2 | **(a) migrate where layout allows, (b) `useFocusTrap` hook** otherwise | `Modal.tsx:27-63` and `ConfirmDialog.tsx:31-59` already implement the trap. `MobileNav` needs the hook regardless, so the hook is built first and each of the 6 surfaces then picks per-surface. | F-03, F-04 |
| D-3 | **(b) keep raw backend text for field-level errors, (a) curated copy otherwise** | The backend names the offending field; replacing that with generic copy would cost users the "which field" detail. Non-field failures get curated copy, with the raw message kept in `console.error`. | F-12 |
| D-4 | **(a) spaced units with `\u00a0`** — `8.0 h`, `1.5 KB` | Matches the guide's unit-spacing item; the NBSP stops value and unit from wrapping apart. Recorded fallback: if dense grids visibly suffer, log (b) `8.0h` as an explicit exception at the Phase 2 review. | F-22 |
| D-5 | **(a) fixed `en-US`, stated as policy** | Internal tool → one locale removes date ambiguity (`03/04`) with no i18n work, and legitimises the 6 inline `Intl.DateTimeFormat('en-US')` call sites until Phase 5 centralises them. | F-23 |
| D-6 | **(a) Title Case headings + "and" in body copy**; fix `Register.tsx:131` | Consistent with the existing UI and with the guide's own wording; the Vercel carve-out is not a house style we inherited. | F-30 |
| D-7 | **(b) defer the test runner; keep §9 as a dependency-free script** | Phase 0 adds no dependencies. The §9 suite is preserved as a runnable script (`interface_fix_baseline.md` §5) and can go into CI with no new packages. Option (a) vitest is **re-opened at Phase 6** — if approved there it becomes `F-29.3`. | F-29 |

**Also decided at 0.4** (the three optional items):
- `F-29.3` vitest → **OUT** for this pass (follows D-7).
- `F-28` layered shadows → **OUT**, recorded as an accepted exception in §8.1. Pure aesthetics; revisit only if a design review asks.
- `F-16` drawer resize handle → **KEEP and fix** (option a: `role="separator"` + `aria-orientation` + `aria-valuenow/min/max`, `onPointerDown` for mouse/touch/pen, Arrow-key nudge). Deleting a user-visible control is a product change; option (b) remains the fallback if the handle proves unused.

**Reversibility rule:** each answer is a one-line policy flip at the start of the phase it affects. Record a flip as a **new dated row** below — never edit the record above.

**Amendments:** _none yet_

---

## Appendix A — Guideline area → finding cross-reference

| Guide area | Item (per the guide's wording) | Status | Findings / inventory |
|---|---|---|---|
| **Interactions** | Links are links (never a button/div for navigation) | ❌ | F-05 |
| | Keyboard: everything reachable and operable | 🟡 | F-03, F-04, F-16 |
| | Manage focus: trap inside overlays, return on close | ❌ | F-03, F-04 |
| | Clear focus: visible ring, no double ring | ✅ | C-04 |
| | Tooltips: first-hover delay, subsequent instant, focusable, dismissible | 🟡 | F-15 |
| | Mobile input ≥16 px (avoid iOS zoom) | 🟡 | F-06 (single offender), C-14 |
| | Never block paste; never block typing mid-entry | ✅ | C-02, C-15 |
| | URL as state (tabs, filters, sort, pagination) | 🟡 | F-17 (Tabs); C-11 covers the rest |
| | Optimistic updates where success is likely | ❌ | F-18 |
| | Gestures have alternatives; clean drag interactions | 🟡 | F-16 |
| | Overscroll behaviour on overlays | ✅ | C-06 |
| | Page titles reflect context | ✅ | C-12 |
| **Animations** | Honour `prefers-reduced-motion` | 🟡 | C-03 (CSS ✅), F-26 (scripted scroll) |
| | Never `transition: all` | ❌ | F-08 |
| | Animate compositor-friendly properties | 🟡 | F-08 (the three `width` bars) |
| | Loading indicators: show-delay + minimum duration | ❌ | F-19 |
| | Keep interactions quick (short durations) | 🟡 | F-08b (`duration-300` ×5) |
| **Layout** | Sticky headers must not cover focused/scroll targets | ❌ | F-07 |
| | Optical alignment, concentric radii | ⚠️ not verifiable | §6 |
| | Safe areas, flex/grid, alignment defaults | ✅ | C-20 |
| **Content** | Ellipsis character, curly quotes | 🟡 | F-10, F-11 |
| | Units: space between number and unit; non-breaking spaces | 🟡 | F-22 |
| | Charts: text alternative for the data | ❌ | F-21 |
| | `translate="no"` on brand/code | ❌ | F-24 |
| | Consistent number/date formats | 🟡 | F-23; C-22 ✅ for currency |
| | Don't ship docs you don't have | ❌ | F-29 |
| | Loading, empty and error states all designed | ✅ | C-18, C-19 |
| | Images: dimensions, lazy-loading | 🟡 | F-27 |
| **Forms** | Labels, descriptions, error placement, first-error focus | 🟡 | C-13 (wiring ✅), F-02 (focus ❌) |
| | Don't block typing; show feedback instead | ✅ | C-15 |
| | Correct `type`/`inputMode`/`autocomplete` | 🟡 | F-14, C-14, C-17 |
| | Spellcheck off for emails/codes/usernames | ❌ | F-13 |
| | Native validation must not pre-empt app validation | ❌ | F-01 |
| | Textarea: modifier+Enter to submit, resizable, counter | 🟡 | C-16 ✅; modifier+Enter exists only in the AI composer |
| **Performance** | Preconnect / warm connections | ✅ | C-24 |
| | Fonts: subset, preload, `font-display: swap` | ✅ | C-09 |
| | Keep input responsive (debounce/throttle) | ❌ | F-20 |
| | Large-list handling | ⚠️ mitigated by pagination | §6 |
| **Design** | Semantic colour tokens, no literals | 🟡 | F-21 (one literal); C-07/C-08 ✅ |
| | `color-scheme` and `theme-color` | ✅ | C-07, C-08 |
| | Hover increases contrast | 🟡 | F-09 (7 wrong vs 36 right) |
| | Layered shadows | 🟡 | F-28 (optional) |
| | Don't rely on colour alone for status | 🟡 | C-21 ✅ badges; F-25 ❌ avatar presence |
| | Focus-visible only (not on pointer) | ✅ | C-04 |
| **Copywriting** | Error copy guides the exit | ❌ | F-12 |
| | Title Case headings; numerals; `and` vs `&` | 🟡 | F-30 |
| | Consistent terminology and formats | 🟡 | F-23 |

Legend: ✅ verified passing · 🟡 partial (finding listed) · ❌ not compliant · ⚠️ needs a human/browser check.

---

## Appendix B — Finding → file index (jump straight to the code)

| File | Findings |
|---|---|
| `src/components/ui/Button.tsx` | F-05 (extend with a `to` prop) |
| `src/components/ui/Modal.tsx` | F-08 (`:73`), F-09 (`:90`), source for the `useFocusTrap` extraction (F-03) |
| `src/components/ui/Drawer.tsx` | F-09 (`:133`), F-16 (`:109-118`) |
| `src/components/ui/Toast.tsx` | F-08 (`:38`), F-09 (`:46`) |
| `src/components/ui/Tooltip.tsx` | F-15 |
| `src/components/ui/Tabs.tsx` | F-17 (`:29-31`, `:33-50`, `:103-130`) |
| `src/components/ui/Progress.tsx` | F-08 (`:35`), F-08b (`duration-300`) |
| `src/components/ui/ThemeToggle.tsx` | F-08 (`:49`), F-08b (`:54`, `:56`) |
| `src/components/ui/FullPageSpinner.tsx` | F-10 (`:11`), F-19 |
| `src/components/ui/LoadingState.tsx` | F-19 |
| `src/components/ui/Avatar.tsx` | F-25 (`:46`, `:54`, `:68`), F-27 (`:46`) |
| `src/components/ui/Select.tsx` | C-17 (verified good — native `<select>`) |
| `src/components/ConfirmDialog.tsx` | F-03 (migration target for `ReviewPanel`) |
| `src/components/approvals/ReviewPanel.tsx` | F-03 (`:16`) |
| `src/components/timesheets/DailyEntryCard.tsx` | F-01 / F-14 (the originating bug: `:41-52`, `:491-495`) |
| `src/components/layout/Topbar.tsx` | F-06 (`:203-208`), F-09 (`:161`, `:249`), F-23 (`:303`) |
| `src/components/layout/MobileNav.tsx` | F-04 (`:12-22`), F-09 (`:30`) |
| `src/components/layout/Sidebar.tsx` | F-08 (`:89`), F-09 (`:207`), F-08b (`:89`, `:195`) |
| `src/components/layout/AppShell.tsx` | F-07 (skip-link target `#main-content`) |
| `src/components/ai/AIChatPanel.tsx` | F-26 (`:16`), F-29 (`:41`) |
| `src/components/ai/AIChatWidget.tsx` | F-08 (`:27`) |
| `src/pages/admin/Users.tsx` | F-05 (`:147`, `:181`, `:207`, `:232-233`), F-20 (`:27`) |
| `src/pages/admin/Projects.tsx` | F-05 (`:117`, `:151`, `:185`, `:208`), F-20 |
| `src/pages/admin/Clients.tsx` | F-05 (`:272`, `:300`), F-20 (`:201`) |
| `src/pages/admin/ProjectDetails.tsx` | F-03 (`:29`), F-08 (`:191`), F-17 (tabs) |
| `src/pages/admin/SupervisorDetails.tsx` | F-03 (`:22`), F-17 (tabs) |
| `src/pages/admin/Reports.tsx` | F-21 (`:180`, `:196-197`), F-22 (`:207`) |
| `src/pages/user/Timesheets.tsx` | F-03 (`:193`), F-12, F-20 |
| `src/pages/user/TimesheetEditor.tsx` | F-03 (`:38`, `:873`), F-08 (`:792`), F-12, F-14 (`:725-728`) |
| `src/pages/admin/InvoiceDetail.tsx` | F-23 (`:157`), F-12 |
| `src/pages/admin/InvoiceForm.tsx` | F-01 (`:233-235`, `:288-290`), F-14 (`:233`, `:288`) |
| `src/pages/admin/Settings.tsx` | F-01 / F-14 (`:190`) |
| `src/pages/auth/*` | F-01, F-12 (`AdminLogin:45`, `UserLogin:45`, `Register:106/131`, `InviteRedeem:53/101`) |
| `src/utils/format.ts` | F-22 (`:1-3`), C-22 (`:6-11`) |
| `src/utils/date.ts` | F-23 (`:26`, `:37`, `:43`, `:54`) |
| `src/contexts/AppDataContext.tsx` | F-18 (`:402-410`) |
| `src/hooks/useQueryParamState.ts` | C-11, F-17, F-20 |
| `src/hooks/useFocusTrap.ts` | **new in Phase 1** — shared dialog focus contract (F-03, F-04) |
| `src/utils/focusFirstError.ts` | **new in Phase 1** — focus-first-error helper (F-02) |
| `src/utils/errorMessage.ts` | **new in Phase 3** — the D-3 failure-copy policy (F-12) |
| `src/index.css` | C-03/C-04/C-05 (`:250-297`), C-07 (`:72`, `:110`, `:161`) |
| `index.html` | C-01 (`:6`), C-08 (`:8`, `:12-27`), C-09 (`:11`), F-24 |
| `frontend/package.json` | F-29 (no `test` script / no test deps) |

---

## Appendix C — Baseline metrics captured at audit time

Use these numbers to prove progress. **All were re-measured in Phase 0 (2026-09-29) against commit `2d16933`** — full transcript in [`interface_fix_baseline.md`](./interface_fix_baseline.md); the drift log there records the three figures corrected from the audit draft (anchor commit, `onClick={() => navigate` ≈30 → 72, source files 130 → 135) and confirms the rest reproduced exactly.

| Metric | Baseline | Target |
|---|---|---|
| `transition-all` occurrences | 8 | 0 |
| `duration-300`/`duration-500` occurrences | 5 | 0 or documented |
| `hover:text-muted-foreground` occurrences | 7 | 0 |
| `hover:text-foreground` occurrences | 36 | ≥36 |
| `noValidate` occurrences | 0 | one per app-validated form |
| ` required` occurrences | 70 | 0 or annotation-only allowlist |
| `inputMode` occurrences | 1 | 5 |
| `spellCheck` occurrences | 0 | coverage on identifier/email/code fields |
| `translate=` occurrences | 0 | ≥1 (`translate="no"`) |
| `"Failed to …"` occurrences | 48 | 0 in user-facing copy |
| `'Loading...'` (three dots) occurrences | 1 | 0 |
| `…` (ellipsis char) occurrences | 31 | ≥31 |
| `’` (curly apostrophe) occurrences | 1 | ≥9 |
| bare `toLocaleDateString()` occurrences | 2 | 0 |
| inline `Intl.DateTimeFormat` in components | 6 | 0 (or documented) |
| `role="dialog"` without an accessible name | 6 (+MobileNav) | 0 |
| `Guideline N.M` citation comments | 24 | repointed at `interface_guide.txt` |
| comments naming `frontend_eval.md §12` | 5 | 0 (or the file exists) |
| `navigate(` call sites | 104 | baseline minus converted entry points |
| `onClick={() => navigate` call sites | 72 | post-action only (F-05) |
| `useQueryParamState` call sites | 64 | must rise (F-17) |
| `addToast('error'` call sites | 60 | wording reviewed (Phase 3) |
| `shadow-xl` / `shadow-lg` | 13 / 7 | tokens only if F-28 re-opens |
| files in `src/` | 135 (94 `.tsx`, 37 `.ts`, 2 `.svg`, 1 `.png`, 1 `.css`) | — |
| debounce/`useDeferredValue`/`startTransition` | 0 | ≥1 (search) |
| min-loading/show-delay helpers | 0 | 1 hook + usages |
| optimistic mutations in `AppDataContext` | 0 | ≥2 (notification actions) |
| `scroll-margin*` occurrences | 0 | ≥1 |
| Theme pre-paint script (`index.html:12-27`, inline, synchronous) | present ✅ | keep — it is what prevents a theme flash |
| `npm run lint` / `npm run build` | green ✅ (lint 0 errors / 20 pre-existing warnings; build exit 0, 1.54 s, 529.43 kB) | stay green — the exit codes are the contract |
| frontend test runner | none | exists (if D-7 = a) |

### Phase 1 result (2026-09-29) — the rows that moved

| Metric | Baseline | After Phase 1 | Why |
|---|---|---|---|
| `<form noValidate>` | 0 | **12** | one per app-validated form (11 + the new Timesheet dialog form) |
| `inputMode` | 1 | **5** | F-14 closed |
| `role="dialog"` (real elements) | 11 | **5** | the 6 hand-rolled overlays deleted |
| …of those, carrying an accessible name | 5 | **5** | `aria-label`/`aria-labelledby` on all five |
| dialog `addEventListener('keydown'` | 4 | **1** | consolidated in `hooks/useFocusTrap.ts` |
| `min="` on numeric inputs | 5 | 3 | only the two sites with no app validator keep theirs |
| `scroll-margin` rules | 0 | **1** | F-07 closed |
| `focusFirstError(` call sites | 0 | **11** | F-02 closed |
| `useFocusTrap(` consumers | 0 | 4 | Modal, ConfirmDialog, Drawer, MobileNav |
| ` required` | 70 | 70 | **intentionally unchanged** — annotation-only allowlist (`aria-required`), inert under `noValidate` |
| `transition-all` / `hover:text-muted-foreground` / `Failed to` / `…` / `’` / `navigate(` | 8 / 7 / 48 / 31 / 1 / 104 | unchanged | Phase 2–5 territory |

### Phase 2 result (2026-09-29) — the rows that moved

| Metric | Baseline | After Phase 2 | Target |
|---|---|---|---|
| `transition-all` | 8 | **0** | 0 ✅ |
| `duration-300` / `duration-500` | 5 | **0** | 0 ✅ |
| `hover:text-muted-foreground` | 7 | **0** | 0 ✅ |
| `hover:text-foreground` | 36 | 43 | ≥36 ✅ |
| `'Loading...'` | 1 | **0** | 0 ✅ |
| curly `’` | 1 | 11 | ≥9 ✅ |
| `noSpell` sites / raw `spellCheck={false}` | 0 / 0 | 14 / 8 | selective ✅ |
| `\u00a0` references | 0 | 8 | ≥1 ✅ |
| inline `toFixed(1)}h` | 62 | **0** | 0 ✅ |
| `formatHours` call sites | 0 | 63 | every hours value ✅ |
| `translate=` | 0 | 1 | ≥1 ✅ |
| `Failed to …` / `navigate(` / `toLocaleDateString()` / `Intl.` | 48 / 104 / 2 / 6 | unchanged | Phase 4 / 5 |

### Phase 3 result (2026-09-29) — the row that moved

| Metric | Baseline | After Phase 3 | Target |
|---|---|---|---|
| `Failed to …` in user-facing copy | 46 | **0** | 0 ✅ |
| `Failed to …` inside `console.error` | 2 | 2 | allowed ✅ |
| `failureMessage` / `failureText` call sites | 0 / 0 | 30 / 14 | every failure path ✅ |
| `navigate(` / `toLocaleDateString()` / `Intl.` | 104 / 2 / 6 | unchanged | Phase 4 / 5 |

### Phase 4 result (2026-09-30) — the rows that moved

| Metric | Baseline | After Phase 4 | Target |
|---|---|---|---|
| `onClick={() => navigate(` on a `Button` | 72 | **0** | 0 ✅ |
| `navigate(` call sites (excl. the hook itself) | 104 | 61 | post-action allowlist ✅ |
| `<Button to={…}>` / row `<Link>`s | 0 / 0 | **43 / 4** | every navigational control ✅ |
| `useQueryParamState` call sites | 64 | 68 | must not fall ✅ |
| dead tab exports (`TabList`/`TabTrigger`/`TabContent`) | 3 | **0** | deleted ✅ |
| `Tabs` URL-synced pages | 1 (`Approvals`) | **3** | both detail pages ✅ |
| `Tooltip` `onFocus` / Escape / `aria-describedby` | 0 / 0 / 0 | **all three** | ✅ |
| Drawer handle `role="separator"` / pointer / arrow keys | 0 / 0 / 0 | **all three** | ✅ |
| optimistic notification mutations | 0 | 2 | low-risk only ✅ |
| `toLocaleDateString()` / `Intl.` | 2 / 6 | unchanged | Phase 5 |

### Phase 6 result (2026-09-30) — the rows that moved

| Metric | Baseline (Phase 0) | After Phase 6 | Target |
|---|---|---|---|
| citations naming `frontend_eval.md` | 5 | **0** | 0 ✅ |
| citations naming a non-existent "checklist item" | 24 | **0** | 0 ✅ |
| citations resolving to `interface_guide.txt:<line>` | 0 | **36 across 24 lines** | all ✅ |
| guideline **mis**-citations | 2 | **0** | 0 ✅ |
| `<h1>–<h6>` literals in Title Case | 99/101 | **101/101** | 100% ✅ |
| `&` in body copy (HS-2) | 1 | **0** | 0 ✅ |
| spelled-out counts (HS-3) | 0 | **0** | 0 ✅ |
| hardcoded `⌘K` **rendered** (F-31) | 1 | **0** | 0 ✅ |
| real dialogs without a Tab trap (F-32) | 1 | **0** | 0 ✅ |
| real `role="dialog"` on the shared trap | 4/5 | **5/5** | 100% ✅ |
| `npm run lint` | 0 errors / 20 warnings | **0 errors / 20 warnings** | unchanged ✅ |
| frontend test runner | none | none | declined by `D-7`(b) |

**Regression guards from Phases 1–5 re-verified unchanged in Phase 6:** `noValidate` 12 · `focusFirstError` 11 · `inputMode` 5 · `transition-all` 0 · `duration-300/500` 0 · `hover:text-muted-foreground` 0 · `Loading...` 0 · `toLocaleDateString()` 0 · inline `Intl.` 0 · `toFixed(1)}h` 0 · `Failed to` 2 (both inside `console.error`).

---

*End of document. **Status: Phases 0–6 complete (2026-09-30) — 28 findings fixed (`F-01`–`F-15`, `F-17`–`F-26`, `F-29`–`F-32`), `F-28` accepted out, `F-27` partial; 36/38 tracker items done. All 36 in-code citations (on 24 lines) now resolve to `interface_guide.txt`, and the house copy style is written down as §4.A HS-1…HS-7.** Working tree still uncommitted; `tsc`, lint (0 errors / 20 pre-existing warnings) and build are green. Remaining: (1) commit and backfill the commit column; (2) `F-27` asset deletion, blocked on the design owner (§10 item 5.1); (3) the **manual** QA listed per phase in §8.3 — dialogs/tab-trap, mobile keyboards, all three themes, screen readers, debounce, chart/Avatar a11y, optimistic rollback; (4) `F-29.3` test runner stays declined under `D-7`(b).*

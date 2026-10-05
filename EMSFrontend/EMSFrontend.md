# EMSFrontend.md — Eniac EMS Frontend Specification & Build Tracker

> **Deliverable:** a production-grade, professional, industry-standard **Employee Management System (EMS) frontend shell** for Eniac Inc.
> **Location:** all EMS frontend code lives in `/home/nikhil/Alpha-net/EMSFrontend`.
> **Companion docs:** [`../interface_guide.txt`](../interface_guide.txt) (Web Interface Guidelines — the styling law), [`../flowIntegration.md`](../flowIntegration.md) (staffing domain model), the existing timesheet platform at [`../frontend/`](../frontend) (the visual + architectural sibling to mirror).
> **Status:** 🚧 **Phase 0 complete** — `/EMSFrontend` is scaffolded, the toolchain mirrors the sibling, the Eniac tokens + EMS density layer are in place, and `typecheck`/`lint`/`build`/`dev` all pass. Tick items in §15 as later phases land.

---

## 0. How to use this document

| Section | Purpose |
|---|---|
| §1 | Executive summary — read first |
| §2 | Scope & non-goals |
| §3 | Tech stack (locked to match the timesheet platform) |
| §4 | **Design language — "Eniac Dense Maximalist"** (the styling contract) |
| §5 | Information architecture & route map |
| §6 | Roles, billable model & permission matrix |
| §7 | **Module specifications** (every page, its layout, data, states, acceptance) |
| §8 | Component library plan (primitives + EMS-specific) |
| §9 | Data layer, API contract & mock strategy |
| §10 | State management, contexts & providers |
| §11 | Accessibility, motion & interaction rules |
| §12 | Performance budget |
| §13 | Target folder structure |
| §14 | **Phased build plan** (Phase 0 … Phase 8) with acceptance gates |
| §15 | **Master progress checklist** (the tracking artefact) |
| §16 | Verification & commands |
| §17 | Risks & open decisions |
| App. A | Design-token reference |
| App. B | Route → page → role matrix |
| App. C | Component inventory |

**Severity / effort legend (used in §14 tasks).** Effort: `S` < 1 h · `M` < half day · `L` ≥ half day. Status: `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE`.

**Non-negotiable rules.**
1. **Additive & non-breaking.** The EMS is a NEW app in a NEW folder. It must never modify `frontend/` or `backend/`. Connectivity to the timesheet platform is via the **shared MongoDB** and a **shared API contract**, never via cross-imports between the two frontends.
2. **Mirror the sibling.** Visual language, token names, naming conventions, file layout, hooks, and utility helpers are ported from `frontend/` so the two apps feel like one product family.
3. **Guideline compliance.** Every UI choice must satisfy `interface_guide.txt`. Where this spec and the guide disagree, the guide wins and this doc is corrected.
4. **Shell-first.** Phase 0–2 must produce a runnable, navigable, fully-styled application shell with typed mock data **before** any real API wiring. A stakeholder must be able to click through every role's screens from Phase 2 onward.

---

## 1. Executive summary

Eniac today ships **one** product: a specialized **timesheet platform** used by billable resources to log daily/weekly hours. The company needs a **company-wide EMS** that owns the whole employment lifecycle — onboarding, attendance, client & project management, assignments, payrates, and HR — while remaining **tightly coupled** to the timesheet platform through a shared database.

This document specifies the **EMS frontend**, a new React application at `/EMSFrontend` that:

- Serves **5 roles** — `admin`, `hr`, `manager`, `supervisor`, `employee` — each with a **distinct dashboard** and role-scoped navigation.
- Implements **Attendance** as a first-class, daily, first-task module (all roles except `admin`).
- Implements **HR onboarding** — full employee records with **payrate** and **billable/non-billable** classification.
- Implements the **Manager pipeline** — create **Client IDs** → link **Client Projects** → **assign Employees** → employees become timesheet-logging resources.
- Uses a **denser, sleeker, maximalist** variant of the Eniac design system: more information per screen, compact tables, KPI strips, layered panels, keyboard-first navigation — without sacrificing the accessibility guarantees already proven in the timesheet app.
- Ships as a **static build** (`dist/`) for Hostinger, consuming the EMS Cloudflare Workers API over HTTPS.

**Definition of done for the shell:** a stakeholder can log in as any of the 5 roles, land on a role-appropriate dashboard, complete attendance, walk every module page (onboarding, employees, clients, projects, assignments, payroll, reports, notifications, settings), see correct role-based navigation, and the app passes `tsc`, `oxlint`, and a production build — all against a typed mock/API layer.

**Relationship to the platform:**

```
                         ┌────────────────────────┐
   EMS (NEW, this doc)   │  EMSFrontend (React)   │  → Cloudflare Workers API
                         └───────────┬────────────┘
                                     │  shared MongoDB  (single source of truth)
                         ┌───────────┴────────────┐
  Timesheet (EXISTS)     │  frontend (React)      │  → Vercel backend
                         └────────────────────────┘
```

Create once in EMS (e.g. a Client) → instantly available to the timesheet platform via the shared DB, and vice-versa. **Connectivity is a database + contract concern, not a UI concern.**

---

## 2. Scope & non-goals

### In scope
- Full application shell: routing (data router), layout (sidebar/topbar/command palette), guards, theming (light/dark/black), providers.
- Design system: ported Eniac tokens + new **density** tokens, extended primitives, EMS-specific components.
- All pages for all 5 roles, with realistic states (loading, empty, error, permission-denied).
- Attendance module (clock-in/mark, calendar, heatmap, HR/admin oversight).
- HR onboarding wizard, employee directory, employee detail/edit, payrate management.
- Client registry, projects, assignment pipeline.
- Payroll & report views (read-oriented shell), notifications, settings/profile.
- Typed **API client + service layer + domain types** mirroring the EMS backend contract.
- A **mock data adapter** so the shell runs standalone before the backend exists.

### Out of scope (tracked elsewhere)
- EMS backend implementation (Express-on-Cloudflare-Workers) — separate spec.
- Database schema/migrations — shared with timesheet platform; see `flowIntegration.md`.
- Billing/invoicing engine changes — owned by the timesheet platform.
- Native mobile apps.
- Actual Hostinger/Vercel deployment mechanics (frontend is static; "don't worry about deployment").


---

## 3. Tech stack (locked — matches the timesheet platform)

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Runtime/build | **Vite** | `^8` | `@vitejs/plugin-react` |
| Language | **TypeScript** | `~6` | strict, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax` |
| UI | **React** | `^19` | function components + hooks only |
| Routing | **react-router-dom** | `^7` | **data router** (`createBrowserRouter`) for `useBlocker` + route `handle`s |
| Styling | **Tailwind CSS** | `^4` | `@tailwindcss/vite`; CSS-first `@theme` tokens |
| Client state | **zustand** | `^5` | only for cross-cutting UI state (see §10) |
| Icons | **lucide-react** | `^1` | single icon family, `h-* w-*` sized |
| Charts | **recharts** | `^3` | dashboards & reports |
| Dates | **date-fns** | `^4` | all date math |
| Lint | **oxlint** | `^1` | 0 errors gate |
| Type-check | `tsc -b` | — | 0 errors gate |
| Font | **JetBrains Mono** (self-hosted woff2) | OFL-1.1 | copy from `frontend/public/fonts` |

**Explicit non-dependencies:** no component library (MUI, Mantine, shadcn-as-pkg), no CSS-in-JS, no Redux, no axios (use `fetch`), no form library by default (native + a small `validation.ts` helper ported from `frontend/`). Keep the dependency surface identical to the sibling unless a spec change is logged in §17.

**Scaffolding command (executed in Phase 0):**
```bash
cd /home/nikhil/Alpha-net/EMSFrontend
npm create vite@latest . -- --template react-ts
npm i react-router-dom zustand lucide-react recharts date-fns
npm i -D oxlint @types/node
```
Then port `tsconfig*.json`, `.oxlintrc.json`, `vite.config.ts`, `index.html`, `public/`, and `src/index.css` from `../frontend/` and extend (never break) them.

**`vite.config.ts` (EMS):** same dev proxy shape as the sibling but pointed at the EMS API origin (env `VITE_API_BASE_URL`), plus the same manual-chunk split (`react-vendor`, `recharts`, and a new `charts`/`editor` split if needed):
```ts
server: { proxy: { '/api/v1': { target: 'http://localhost:8787', changeOrigin: true } } }
```

**Deployment target:** `npm run build` → `dist/` → uploaded to Hostinger (static). `VITE_API_BASE_URL` must be set at build time to the Cloudflare Workers origin. BrowserRouter requires an SPA fallback (`/* → /index.html`); document the Hostinger rewrite rule in `EMSFrontend/DEPLOY.md` during Phase 8.


---

## 4. Design language — "Eniac Dense Maximalist"

The EMS inherits the Eniac visual identity **exactly** (same tokens, same font, same accent, same theme modes) and then changes **three things only**: **density**, **information altitude**, and **interaction speed**. The result is a tool that feels like a professional operations console: more data on screen, laid out with hairline precision, still calm and accessible.

### 4.1 Inherited identity (copy verbatim from `frontend/src/index.css`)

- **Font:** JetBrains Mono everywhere (`--font-sans` = `--font-mono`).
- **Accent:** blue-600 `#2563eb` (`--color-accent`), soft `#eff4ff`.
- **Surfaces:** canvas `#f7f8fa`, card `#ffffff`, secondary `#f8fafc`.
- **Borders:** hairline `#e8eaf0` / `#d6dae3`.
- **Text:** `#0f172a` / `#475569` / `#64748b`.
- **Semantics:** success `#16a34a`, warning `#d97706`, error `#dc2626` (+ `-soft` fills).
- **Themes:** `light`, `dark` (calm slate), `black` (true dark). Custom variants `@custom-variant dark` and `@custom-variant black`.
- **Radius:** `rounded-lg` (8px) controls, `rounded-xl` (12px) cards.
- **Focus:** `:focus-visible` 2px `--color-ring`; pointer focus outlined off.
- **Radii nesting:** child radius ≤ parent radius (guide "Nested radii").

### 4.2 New: density tokens (EMS additions — additive only)

Add to `@theme` in EMS `index.css`. Names are **prefixed `ems-`** so they never collide with a future sibling token. All values on a strict **4px grid**.

```css
@theme {
  /* Density scale — three modes; default is "comfortable", users toggle to "compact". */
  --ems-row-comfortable: 40px;   /* table/list row height */
  --ems-row-compact: 32px;
  --ems-row-dense: 28px;
  --ems-gutter: 12px;            /* grid gap (vs sibling's 16px) */
  --ems-pad-card: 16px;          /* card body padding (vs sibling's 20px) */
  --ems-pad-section: 20px;
  --ems-control-h: 32px;         /* default control height (vs sibling's 36px) */
  --ems-control-h-sm: 28px;

  /* Type scale — one step denser than the sibling. */
  --ems-text-micro: 10px;        /* uppercase section labels, overline */
  --ems-text-label: 11px;        /* meta, table headers */
  --ems-text-dense: 12px;        /* dense body, table cells */
  --ems-text-body: 13px;         /* standard body */
  --ems-text-title: 15px;        /* card titles */
  --ems-text-h2: 18px;           /* page sub-titles */
  --ems-text-h1: 22px;           /* page titles */
  --ems-text-kpi: 28px;          /* KPI numbers (hero 34px via utility) */

  /* Elevation — layered shadows (guide "Layered shadows": ambient + direct). */
  --ems-shadow-card: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06);
  --ems-shadow-raised: 0 2px 4px rgba(15,23,42,.05), 0 6px 16px rgba(15,23,42,.08);
  --ems-shadow-overlay: 0 10px 30px rgba(15,23,42,.18), 0 2px 8px rgba(15,23,42,.10);
}
```

**Density modes.** A `data-density="comfortable|compact"` attribute on `<html>` (set from a zustand `uiStore` + `localStorage['eniac_ems_density']`) selects which row height / control height class set is active via a small `@layer utilities` block that maps `--ems-row-*` to `.ems-row` helpers. Default **comfortable**; power users switch to **compact** in Settings and via `Cmd/Ctrl+.`.

### 4.3 New: the "maximalist" layout grammar

Density is not just smaller text — it's **structure**. Every EMS page follows this altitude model, from most aggregated to most granular:

1. **Status rail** (optional, top) — a 1-line, 24px strip of live counters (e.g. `● 14 on site · 3 late · 2 on leave · 6 pending approvals`). Uses `KpiChip`s separated by dot dividers.
2. **Header band** — page title (22px) + contextual actions (right-aligned) + a **breadcrumb** and optional **view switcher** (list / board / calendar). 56px tall, sticky.
3. **KPI strip** — a horizontal band of **4–6** `StatCard`s (compact variant, 28px numbers, sparkline slot). Never fewer than 3, never more than 6 before it wraps to two rows on wide screens.
4. **Primary grid** — 12-column layout. Typical splits: `8/4`, `7/5`, `4/4/4`, `3/6/3`. Cards are always **filled with content, never decorative**.
5. **Detail tables** — dense, sticky-header tables with inline row actions, row-level status color, and a right-aligned numeric column (right-align numbers, guide "right-align numbers").

**Maximalist rules (do):**
- Fill horizontal space — dashboards should rarely have large empty gutters on ≥1440px.
- Prefer **one dense table** over paginated card lists for record sets (employees, clients, assignments, payroll).
- Surface **secondary metadata inline** (badges, chips, avatars-in-stack, relative time) rather than behind a click.
- Use **micro-visualizations**: sparklines, mini bar rows, radial gauges, heatmap cells.

**Maximalist rules (don't):**
- Never more than **one** primary CTA per band; secondary actions are ghost/icon.
- Never sacrifice contrast (`interface_guide.txt` "Minimum contrast", "Interactions increase contrast").
- Never animate width/height/top/left (guide "Compositor-friendly") — animate `transform`/`opacity` only.
- Never let density drop below **32px** row height / **24px** hit target (guide "Match visual & hit targets"; 44px on mobile).

### 4.4 Motion

- Durations: 120–180ms for interation feedback, 220–280ms for overlay enter/exit.
- Easing: `ease-out` for enter, `ease-in` for exit; never linear for UI.
- All motion collapses under `prefers-reduced-motion` (port the sibling's global override — keep end states visible).
- Respect `interface_guide.txt` Animations section in full.


### 4.5 Copy & typography rules (ported from the guide, enforced by review)

- **Title Case** for headings, buttons, page titles, table headers, nav labels (guide "Headings & buttons use Title Case").
- **Sentence case** only for helper text, tooltips, empty-state bodies.
- **Numerals for counts** ("8 employees", not "eight employees").
- **Space between number and unit**, non-breaking (`formatHours` → `12.5&nbsp;h`, guide Content).
- **Consistent currency** — always 2 decimals for money in EMS (`$1,250.00`), formatted via the shared `formatCurrency`.
- **Ellipsis character `…`** for loading/continuation states ("Saving…", "Add employee…").
- **Active voice, second person, action-oriented** ("Assign employee", not "Employee will be assigned").
- **Error messages guide the exit** — every error names the fix.
- Greeting pattern matches sibling dashboards (`Good morning, Priya`).

### 4.6 What "sleek" means here (concrete)

- **Hairline borders + layered shadow** on every card (guide "Crisp borders", "Layered shadows").
- **Tabular numerals** for all metrics (`.font-variant-numeric: tabular-nums`) so columns align.
- **Color as signal, not decoration** — semantic badges only; brand accent reserved for the active path.
- **Tinted neutrals on colored surfaces** (guide "Hue consistency").
- **Optical alignment** — numeric columns right-aligned, avatar stacks overlap by 8px, badges vertically centered to the cap height.

---

## 5. Information architecture & route map

### 5.1 URL scheme

Role-scoped prefixes keep permissions and mental models obvious and mirror the sibling's `/admin` + `/user` + `/supervisor` structure. Each role owns one namespace; `supervisor` and `employee` share the `employee` workspace surface with extra supervisor routes.

```
/                        → HomeRedirect (role-aware)
/login                   → Login (shared; admin login optional at /adminlog to match sibling)
/onboarding/:token       → InviteRedeem (invited employee sets password)
/reset-password          → ResetPassword

/admin/*                 → role: admin
/hr/*                    → role: hr
/manager/*               → role: manager
/supervisor/*            → role: supervisor (also reachable by admin)
/me/*                    → role: employee (landing surface for every non-admin role too)
```

### 5.2 Route → page map (abbreviated; full matrix in App. B)

| Namespace | Routes |
|---|---|
| `/admin` | `dashboard`, `employees`, `employees/:id`, `attendance`, `clients`, `clients/:id`, `projects`, `projects/:id`, `assignments`, `payroll`, `reports`, `roles`, `audit`, `settings`, `notifications` |
| `/hr` | `dashboard`, `onboarding` (+ `onboarding/new` wizard), `employees`, `employees/:id` (+ `/edit`), `payroll` (rates), `attendance`, `leave`, `documents`, `reports`, `settings`, `notifications` |
| `/manager` | `dashboard`, `clients` (+ `new`, `:id`), `projects` (+ `new`, `:id`), `assignments` (+ `new`), `resources`, `attendance`, `reports`, `settings`, `notifications` |
| `/supervisor` | `dashboard`, `team`, `attendance`, `approvals`, `assignments`, `reports`, `settings`, `notifications` |
| `/me` | `dashboard`, `attendance`, `profile`, `schedule`, `leave`, `documents`, `settings`, `notifications` |

### 5.3 Route guards & handles

- `<ProtectedRoute allowedRoles={[...]}>` — ported from sibling, extended to 5 roles (+ `requireSupervisor`).
- `<RedirectIfAuthenticated>` for `/login`.
- `<HomeRedirect>` sends each role to its dashboard (`admin→/admin/dashboard`, `hr→/hr/dashboard`, `manager→/manager/dashboard`, `supervisor→/supervisor/dashboard`, `employee→/me/dashboard`).
- Every route sets `handle: { title, breadcrumb }` consumed by `useMatches()` in the shell (guide "Accurate page titles", "Breadcrumbs").
- **Deep-link everything** (guide): filters, tabs, selected row, date range, wizard step all live in the URL via the ported `useQueryParamState` hook.


---

## 6. Roles, billable model & permission matrix

### 6.1 Role model

```ts
// EMSFrontend/src/types/auth.ts
export type UserRole = 'admin' | 'hr' | 'manager' | 'supervisor' | 'employee'

export interface EmsUser {
  id: string
  name: string
  email: string
  role: UserRole
  employeeId: string          // e.g. E000123
  department?: string
  title?: string
  status: 'active' | 'inactive' | 'invited' | 'on_leave'
  billable: boolean           // true only for billable employees
  payRate?: number            // hourly, set during onboarding (billable employees)
  currency?: 'USD' | 'INR' | string
  managerId?: string          // reporting line
  supervisorId?: string
  avatarUrl?: string
  joinedAt?: string           // ISO date
}
```

### 6.2 Billable model

| Role | Billable | Payrate | Logs timesheet (sibling app) | Marks attendance |
|---|---|---|---|---|
| `admin` | ❌ | — | ❌ | ❌ (exempt) |
| `hr` | ❌ | — | ❌ | ✅ |
| `manager` | ❌ | — | ❌ | ✅ |
| `supervisor` | ❌ (may also be a billing resource — see §17 D-2) | optional | ✅ if billable | ✅ |
| `employee` | ✅ | ✅ (set at onboarding, editable) | ✅ | ✅ |

**Rules.**
- Only `billable === true` users get a link/CTA into the **timesheet platform** (§7.7). Non-billable roles never see timesheet surfaces.
- `payRate` is mandatory when `billable` is true and `role === 'employee'`; the onboarding wizard enforces it and HR/admin can edit later with an audit trail (§7.5).

### 6.3 Permission matrix (frontend capability model)

Ported `permissions.ts` returns a **capability object** derived from the role. UI reads capabilities — never raw role strings — for feature gating (avoids `role === 'x'` scattering).

| Capability | admin | hr | manager | supervisor | employee |
|---|:--:|:--:|:--:|:--:|:--:|
| `viewOwnDashboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `manageUsers` (create/edit/deactivate any) | ✅ | ✅ | — | — | — |
| `onboardEmployee` | ✅ | ✅ | — | — | — |
| `managePayRates` | ✅ | ✅ | — | — | — |
| `viewAllEmployees` | ✅ | ✅ | ✅ (view) | — | — |
| `manageClients` (create Client ID) | ✅ | — | ✅ | — | — |
| `manageProjects` | ✅ | — | ✅ | — | — |
| `manageAssignments` | ✅ | — | ✅ | — | — |
| `reviewTimesheets` | ✅ | — | — | ✅ | — |
| `viewTeamAttendance` | ✅ | ✅ | ✅ | ✅ (own team) | — |
| `viewTeam` | ✅ | ✅ | ✅ | ✅ | — |
| `viewOwnAttendance` | ✅ (oversight) | ✅ | ✅ | ✅ | ✅ |
| `markAttendance` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `openTimesheetPlatform` | ✅ | — | — | ✅ (if billable) | ✅ |
| `viewPayroll` | ✅ | ✅ | — | — | — |
| `viewReports` | ✅ | ✅ | ✅ | ✅ (team) | — |
| `viewAuditLog` | ✅ | — | — | — | — |
| `manageSettings` | ✅ | ✅ (HR-scoped) | — | — | — |

### 6.4 Navigation per role

Sidebar nav is an array keyed by role (mirrors sibling `adminNavItems`/`userNavItems`), grouped into **SECTION** headers (`OVERVIEW`, `PEOPLE`, `COMMERCIAL`, `TIME`, `FINANCE`, `SYSTEM`). Nav items are filtered by capability, so a role never sees a dead link.

- **admin:** Overview · People (Employees, Roles, Onboarding, Audit) · Commercial (Clients, Projects, Assignments) · Time (Attendance, Approvals) · Finance (Payroll, Reports) · System (Notifications, Settings).
- **hr:** Overview · People (Employees, Onboarding, Leave, Documents) · Time (Attendance) · Finance (Pay Rates, Reports) · System.
- **manager:** Overview · Commercial (Clients, Projects, Assignments) · People (Resources) · Time (Attendance, Approvals*) · Reports · System. (*read/submit only; approvals are a supervisor duty.)
- **supervisor:** Overview · Team · Time (Attendance, Approvals) · Reports · System.
- **employee:** Overview · My Work (Attendance, Schedule, Leave) · Profile · Documents · System.


---

## 7. Module specifications

Each module below lists: **purpose**, **who**, **layout**, **data**, **states**, **acceptance**. All modules are built in the shell phase against typed mock data (§9) and later re-pointed at the EMS API with zero UI change.

### 7.1 Authentication — `/login`, `/onboarding/:token`, `/reset-password`

- **Purpose:** Single entry point; invited employees redeem a token and set a password.
- **Who:** everyone.
- **Layout:** split-screen — left = brand panel (gradient + product name + a rotating "what's new" fact, hidden < `lg`), right = centered card (`max-w-sm`) with email + password, an SSO placeholder, "Forgot password?" link. Login redirects by role.
- **Data:** `authService.login(email, password)` → `{ user, accessToken }`; refresh via httpOnly cookie (`apiClient` ported from sibling, same in-memory-token security model).
- **States:** idle, submitting (button spinner + label kept, guide "Loading buttons"), invalid creds (inline error, `aria-live`), rate-limited (429 → "Too many attempts — try again in Ns"), locked account.
- **Acceptance:** keyboard-only login works; error is announced; successful login routes to the role dashboard; refresh-cookie flow survives a hard reload.

### 7.2 Attendance — the daily first-task module

- **Purpose:** every non-admin role marks attendance at the start of their day; HR/admin get oversight. This is the **landing gate**: on first login each day, the employee/HR/manager/supervisor is routed to `/…/attendance` (or shown a blocking-but-dismissible "Mark your attendance" banner) until today's status is set. Admin is exempt.
- **Who:** `hr`, `manager`, `supervisor`, `employee` (mark); `admin`, `hr` (oversight).
- **Layouts:**
  - **Mark view (`/me/attendance`, `/…/attendance`):** big "clock" card — current time (live, tabular), today's date, a **Mark Attendance** primary button → opens a small form (status: `present | remote | on_leave | half_day`; optional note; optional location). After marking: a confirmation card with the timestamp + an "Undo within 5 min" affordance (guide "Confirm destructive actions" / optimistic + undo).
  - **Calendar view:** month grid, each day a cell with a status dot; click a day → popover with that day's record (edit if HR/admin, or owner same-day).
  - **Team/oversight view (HR/admin/supervisor):** dense table (rows = employees, columns = last 7/14/30 days as heatmap cells, plus today's status and a streak counter). Filters: department, status, date range, search. A KPI strip: On site, Remote, On leave, Late, Not marked.
- **Data:** `attendanceService.mark({ status, note? })`, `getMine(month)`, `getTeam(filters)`. Model: `{ id, userId, date, status, markedAt, note?, location?, source }`.
- **States:** not-marked (CTA), marked (summary), weekend/holiday (read-only), already-marked (edit within window), permission-denied for admin mark.
- **Acceptance:** date math uses UTC-safe helpers (port sibling `date.ts`); heatmap is color-blind safe (guide "Accessible charts"); admin sees oversight but no mark button; the mark action is optimistic with rollback.


### 7.3 Dashboards (one per role — all distinct)

Common chrome: greeting header, optional status rail, KPI strip, then a role-specific 12-col grid. Each dashboard is a **read-only command center** — every widget links deeper (whole card or its rows are links).

**7.3.1 Admin Dashboard — `/admin/dashboard` (platform-wide control)**
- **KPI strip (6):** Active Employees, Billable vs Non-billable split, Open Client IDs, Active Projects, Attendance Today (present/absent), Revenue-at-risk (open SOWs).
- **Grid:** `8/4` — *Platform Health* (headcount trend line, attendance rate bar, project status donut) + *System* (recent audit events, failed logins, integration sync status EMS↔Timesheet).
- **Lower band:** *Upcoming renewals/PO burn* table, *Role distribution* bar, *Latest onboardings* list.
- **Admin-only widgets:** user/deactivation guardrails (last-admin protection, ported), integration connector status ("Clients synced: ✅ N").

**7.3.2 HR Dashboard — `/hr/dashboard` (people operations)**
- **KPI strip (5):** Total Headcount, New This Month, Pending Onboardings, On Leave Today, Attendance Compliance %.
- **Grid:** `7/5` — *Onboarding Pipeline* (kanban-by-status: Invited → Docs → Payrate → Active) + *Attendance Exceptions* (late/absent list, actionable).
- **Lower band:** *Payrate changes pending*, *Upcoming birthdays/anniversaries*, *Leave calendar* (month heat strip), *Document expiries* (I-9/W-4/visa).

**7.3.3 Manager Dashboard — `/manager/dashboard` (commercial pipeline)**
- **KPI strip (5):** Active Clients, Active Projects, Unassigned Resources, Utilization %, Billable Hours (this week).
- **Grid:** `8/4` — *Client/Project pipeline* (stage funnel: Client created → Project linked → Staffed → Active) + *Assignment queue* (employees awaiting assignment).
- **Lower band:** *Project health table* (SOW, client, team size, %staffed, deadline countdown), *Top clients by hours*, *Capacity vs demand* bar.

**7.3.4 Supervisor Dashboard — `/supervisor/dashboard` (team execution)**
- **KPI strip (5):** My Team, Present Today, Pending Approvals, Hours Logged (week), Overdue Submissions.
- **Grid:** `7/5` — *Approvals queue* (newest-first, inline approve/decline) + *Team attendance today* roster (avatars + status dots).
- **Lower band:** *Team timesheet status* (who has/hasn't submitted), *Weekly hours bar per member*, *Escalations*.

**7.3.5 Employee Dashboard — `/me/dashboard` (personal)**
- **KPI strip (4):** Attendance Streak, Hours This Week, Assigned Projects, Pending Leave Requests.
- **Grid:** `7/5` — *Today* (attendance status card + next action) + *My Week* (mini week strip of logged hours).
- **Lower band:** *My assignments* (projects + client + bill rate visibility rule per §17 D-4), *Open timesheet handoff* CTA (billable only), *Documents to sign*, *Recent notifications*.
- **Employee dashboard is the *most* maximalist for the individual:** it should answer "what do I need to do today?" within the first screen.

**Acceptance (all dashboards):** each widget renders loading skeleton → data → empty → error; widget titles are Title Case; numbers right-aligned/tabular; a screen reader announces each section via `aria-labelledby`; zero horizontal scroll at 1280px; ≤ 3 network requests for first meaningful paint (aggregate endpoints).


### 7.4 HR Onboarding — `/hr/onboarding` (+ `/hr/onboarding/new` wizard)

- **Purpose:** guided, multi-step capture of a complete employee record; the "detailed process for onboarding" requirement.
- **Who:** `hr`, `admin`.
- **Wizard steps (each its own deep-linked step `?step=1..6`, ported `useQueryParamState`):**
  1. **Identity** — legal name, preferred name, email, personal email, phone, DOB, gender (optional), address.
  2. **Employment** — employeeId (auto-suggest `E000###`), role (`hr|manager|supervisor|employee`), department, title, manager (combobox), employment type (`full_time|part_time|contract`), start date, work location.
  3. **Billing & Pay** — **billable** toggle (defaults on for `employee`), **payRate** (currency-aware input; required when billable), pay frequency, **client/project pre-assignment** (optional — hands off to §7.7).
  4. **Compliance & Documents** — file dropzones for ID/contract/tax forms; per-doc status chips.
  5. **Access & Roles** — system roles, supervisor flag, invite vs. set-password, optional 2FA note.
  6. **Review & Confirm** — read-back of everything, an inline validation summary (guide "Error messages guide the exit"), then **Create Employee** (stages an invite).
- **Pipeline view (`/hr/onboarding`):** a **kanban** of in-progress onboardings by status (`Invited → Docs pending → Payrate pending → Ready → Active`) + a searchable table of pending invites.
- **Wizard UX:** left **Stepper** rail (vertical, numbered, with per-step completion ticks), right form panel; `Save Draft` + `Save & Continue`; unsaved-changes guard via ported `useUnsavedChanges`; per-step field validation with `focusFirstError`.
- **Acceptance:** can't advance past a step with invalid required fields; leaving mid-wizard warns; a completed wizard creates a user visible in the directory; the payrate validation blocks billable employees without a rate.

### 7.5 Employees directory, detail & payrate — `/hr/employees`, `/hr/employees/:id`, `/:id/edit`

- **Purpose:** the system of record for people.
- **Who:** `hr`/`admin` (full CRUD); `manager` (read); `supervisor` (own team read); `employee` (self).
- **Directory layout:** **dense table** — columns: Employee (avatar + name + id), Role, Department, Manager, Billable (badge), Pay Rate (right-aligned, currency), Status, Attendance (7-day spark), ⋯ actions. Sticky header, column sort, saved views (`?view=`), filters (role, dept, billable, status, location), bulk actions (invite/resend, export CSV). A view switcher to **grid** (avatar cards) for a "people wall".
- **Detail page:** header band (avatar, name, id, role badge, billable chip, status, quick actions: Edit / Invite / Deactivate), then tabs (`Overview · Pay & Billing · Attendance · Assignments · Documents · Activity`) — tabs are URL state.
  - *Pay & Billing tab:* current payRate, currency, history timeline of rate changes (who/when/old→new), billable classification.
- **Edit page:** sectioned form (same groups as the wizard) with the admin guardrails from `permissions.ts` (can't deactivate self / last admin, etc.).
- **Acceptance:** editing payRate writes an audit entry; billable toggle forces/removes the rate field correctly; deactivating the last active admin is blocked with an explanatory tooltip (guide "Error messages guide the exit").


### 7.6 Clients — `/manager/clients`, `/manager/clients/new`, `/manager/clients/:id`

- **Purpose:** create and own **Client IDs**; the root of the commercial chain. **A client created here is available to the timesheet platform** (shared DB).
- **Who:** `manager`, `admin`.
- **List:** dense table — Client ID (mono chip), Client name, Primary contact, Active projects, Billable hours (MTD), Status (`prospect|active|on_hold|churned`), ⋯ actions. KPI strip: Active Clients, New This Qtr, Total Contract Value, At-risk.
- **Create/Edit:** modal or slide-over drawer form — client name, legal entity, **Client ID** (auto-generated `CL-2026-###` with manual override + uniqueness check), billing address, payment terms (`net_15|net_30|net_45|custom`), primary contact (name/email/phone), tax id, currency, notes.
- **Detail:** header (name, Client ID, status), tabs (`Overview · Projects · Contacts · Billing · Activity`) with a projects sub-table linking to §7.7.
- **Cross-platform indicator:** a small "Synced to Timesheet ✅" chip on the record, driven by `syncStatus` in the model; on create it shows `Syncing… → Synced` (optimistic, guide "Optimistic updates").
- **Acceptance:** creating a client reflects immediately in the list and the timesheet platform (via shared DB — verified in Phase 8 integration test); duplicate Client ID is blocked inline; Client ID is deep-linkable.

### 7.7 Projects & Assignments — `/manager/projects*`, `/manager/assignments*`

- **Purpose:** link **Client Projects** to a Client ID, then **assign Employees** to projects — the moment an employee becomes a billable timesheet resource.
- **Who:** `manager`, `admin`.
- **Projects list/detail/new:** table (Project, Client, SOW#, Team size, %Staffed, Bill rate, Status, Deadline). Project detail tabs (`Overview · Team · Rates · Timesheets (link) · Documents`). Create form: name, client (combobox from §7.6), SOW number, PO cap, start/end, skills required, bill rate default.
- **Assignments — the centerpiece screen:** a **two-pane staffing board**:
  - *Left:* project/role demand list (open seats, required skills, date range).
  - *Right:* available resources (filter by skill/availability/billable) with drag-to-assign **and** a keyboard/click alternative (guide "Gestures have alternatives").
  - Assigning opens a slide-over to set `billRate`, `payRate` (default from employee record), FTE %, start/end, role on project. On confirm: employee becomes connected to the timesheet platform (badge "Timesheet access enabled ✅").
  - A **table view** of all assignments (Resource, Project, Client, Bill, Pay, Margin%, Status) is the default for dense audit; board is the alternate view.
- **Timesheet handoff:** a prominent **"Open Timesheet Platform"** action (external link, `target=_blank rel=noopener`) shown only to billable users and to managers inspecting a staffed project (guide "Links are links").
- **Acceptance:** assigning a resource creates an assignment visible in both apps; unassigning warns + confirms; margin% is computed `(bill-pay)/bill` and shown to managers; drag and click paths both work and both are keyboard-operable.

### 7.8 Payroll & Pay Rates — `/hr/payroll`, `/admin/payroll`

- **Purpose:** read-oriented compensation oversight (calculation stays backend-side).
- **Who:** `hr`, `admin`.
- **Layout:** KPI strip (Total Payroll Cost MTD, Billable vs Non-billable cost, Avg Pay Rate, Pending rate changes). Dense payroll table per pay period (Employee, Role, Billable, Hours, Pay Rate, Gross, Status) + a **rate-change log** table. Export CSV. Period selector in URL.
- **Acceptance:** currency formatting consistent (2 decimals); totals reconcile with row sums; period is deep-linkable.

### 7.9 Reports & Analytics — `/…/reports`

- **Purpose:** role-scoped analytics.
- **Who:** all except pure `employee` (employee sees a personal "My Stats" variant).
- **Layout:** filter bar (date range, dept, client, project — all URL state) + a **widget grid** of charts (headcount, attendance rate, utilization, billable hours, margin, project profitability). Each chart card is a `Card` with a title, meta, and a `⋯` (export/expand). Color-blind-safe palettes (guide "Accessible charts"). Charts lazy-load (recharts in its own chunk).
- **Acceptance:** charts have text alternatives (table toggle); no layout shift on load (fixed chart heights); recharts chunk is code-split.

### 7.10 Notifications — `/…/notifications` + Topbar bell

- **Purpose:** action-oriented inbox (approvals, attendance exceptions, onboarding tasks, assignment changes).
- **Layout:** Topbar bell with unread count → dropdown (latest 5) → full page with filters (`All · Unread · Mentions`) and a type filter; row click deep-links to the subject; mark-read/mark-all (optimistic + rollback, guide "Optimistic updates").
- **Acceptance:** `aria-live` polite region announces new items; routing resolves per notification type; unread badge is accurate.

### 7.11 Settings & Profile — `/…/settings`, `/me/profile`

- **Purpose:** self-service + org settings.
- **Layout:** sectioned settings (Profile, Appearance incl. **density toggle**, Notifications, Security, (HR/Admin) Org: departments, locations, pay cycles, holiday calendar).
- **Acceptance:** density toggle persists and applies `<html data-density>`; theme toggle matches sibling (light/dark/black).


---

## 8. Component library plan

### 8.1 Ported primitives (copy from `frontend/src/components/ui`, keep API identical)

`Avatar`, `Badge`, `Button`, `Card` (+`CardHeader/Body/Footer`), `Checkbox`, `ChipStrip`, `DatePicker`, `Drawer`, `Dropdown`, `EmptyState`, `ErrorState`, `FullPageSpinner`, `Input`, `KpiChip`, `LoadingState`, `Modal`, `Progress`, `Select`, `Skeleton`, `StatusBadge`, `Switch`, `Table`, `Tabs`, `Textarea`, `ThemeToggle`, `Toast`, `Tooltip`.

**Adaptation:** the shared primitives stay pixel-identical; density is applied **around** them (rows/paddings), not by mutating the primitives, so the two apps remain visually consistent.

### 8.2 New EMS components (build in Phase 1–2)

| Component | Purpose |
|---|---|
| `DataTable` | Dense, sortable, sticky-header, selectable, column-configurable table with saved views. Wraps the ported `Table`. |
| `KpiStrip` | Responsive band of 4–6 `KpiStat`s with dividers; handles wrap. |
| `KpiStat` | Compact stat (label + big tabular number + delta + optional sparkline slot). |
| `Sparkline` | Tiny inline trend (recharts, no axes). |
| `StatDelta` | ▲/▼ with semantic color + accessible label. |
| `StatusRail` | One-line live counters strip. |
| `RoleBadge` | Color-coded badge per role (accessible, not color-only — includes label). |
| `BillableChip` | Billable / Non-billable chip. |
| `PayRateCell` | Currency + currency-aware formatting + tabular nums. |
| `ClientIdBadge` | Mono `CL-2026-###` chip, copyable. |
| `EmployeeIdBadge` | Mono `E000###` chip. |
| `AvatarStack` | Overlapping avatars with `+N` overflow. |
| `AttendanceStatusDot` | Status + shape (not color-only) for heatmaps/rosters. |
| `AttendanceHeatmap` | Calendar/roster heatmap grid. |
| `Stepper` | Vertical onboarding stepper with per-step ticks. |
| `FormSection` | Titled form group with helper text + inline error slot. |
| `SlideOver` | Right-side drawer for create/edit (replaces modal for records). |
| `CommandPalette` | `Cmd/Ctrl+K` quick nav + actions (maximalist, keyboard-first). |
| `ViewSwitcher` | List/board/calendar toggle persisted in URL. |
| `FilterBar` | Composable filter chips + search + saved views (URL state). |
| `TimelineRail` | Vertical audit/activity timeline. |
| `PermissionGate` | Renders children only if a capability passes; else `EmptyState`/nothing. |
| `MoneyInput`, `RateInput` | Currency-aware inputs with formatting. |
| `DensityToggle` | comfortable/compact switch bound to `uiStore`. |
| `IntegrationStatusChip` | Shows EMS↔Timesheet sync state (Syncing/Synced/Error). |
| `AIChatWidget` (optional) | Only if the EMS enables the assistant in a later phase (§17 D-6). |

**Stories/playground:** a dev-only `/dev/components` route (excluded from prod nav) that renders every primitive in every state — the living style guide. Ship it behind `import.meta.env.DEV`.

---

## 9. Data layer, API contract & mock strategy

### 9.1 Layers (mirror sibling)
```
services/apiClient.ts      → fetch wrapper: in-memory token, single-flight refresh, retry, timeout, blob
services/*Service.ts        → one per domain (auth, attendance, employees, clients, projects,
                             assignments, payroll, reports, notifications, settings)
types/*.ts                  → domain types mirroring the shared schema
utils/*.ts                  → format, date, validation, permissions, storage, id, errorMessage
```

### 9.2 API base & auth
- `VITE_API_BASE_URL` → EMS Workers origin (`/api/v1`).
- Same auth model as sibling: 1h access token in memory, 7d refresh in httpOnly cookie, `credentials: 'include'`, same 401→refresh→retry single-flight.

### 9.3 Mock strategy (critical for "shell-first")
- `services/mock/` holds typed fixtures + a `mockAdapter` that resolves every service call with a small artificial latency (e.g. 250ms) so loading/skeleton states are real.
- Selected by `VITE_USE_MOCK=true` (default in Phase 2–6). `apiClient` is the single switch point:
  ```ts
  const api = import.meta.env.VITE_USE_MOCK === 'true' ? mockAdapter : httpAdapter
  ```
- Fixtures are **realistic** (50+ employees, 12 clients, 20 projects, 300 attendance rows) so dense tables, pagination, sorting, and empty/edge states are exercised.
- Flipping to the real API in Phase 8 must require **no component changes** — only the env flag.

### 9.4 Error & loading conventions
- Every page: `LoadingState`/`Skeleton` (delayed + min-visible per guide "Minimum loading-state duration" via `useDelayedLoading`) → content → `EmptyState` → `ErrorState` (with retry + guidance).
- Mutations: optimistic where safe, toast on success/failure, rollback on error.

---

## 10. State management, contexts & providers

- **Server state:** fetched per page via services; no global server cache in the shell (keep it simple). A lightweight `AppDataContext` mirrors the sibling for shared lookups (employees, clients, projects) with refresh.
- **Auth:** `AuthContext` (user, capabilities, login/logout, bootstrap `/auth/me`).
- **UI:** `ThemeContext` (light/dark/black), `ToastContext`, `NotificationContext`.
- **EMS-specific zustand `uiStore`:** `{ density, sidebarCollapsed, commandPaletteOpen, savedViews }` persisted to `localStorage` (`eniac_ems_*`).
- **Provider nesting (main.tsx):** `Theme → Auth → Toast → AppData → Notification → UI → App`.
- **Capabilities:** `usePermissions()` hook returns the capability object from §6.3; components use `PermissionGate` / `if (!caps.manageClients) return null`.


---

## 11. Accessibility, motion & interaction rules

The EMS adopts `interface_guide.txt` **in full**. The highest-risk items (because dense UIs tempt shortcuts) are called out here and must be verified in each phase:

- **Keyboard everywhere** — every flow (incl. drag-to-assign, heatmap navigation, palette) is keyboard-operable. WAI-ARIA patterns for menus, dialogs, tables, tabs, combobox.
- **Focus management** — focus traps in every `role="dialog"`/`SlideOver`/`Drawer` (ported `useFocusTrap`); focus returns to the trigger on close; skip-link to `#main-content`.
- **Hit targets** — ≥ 24px desktop, ≥ 44px mobile even in compact density; visual target may be smaller than the hit area.
- **Drag has alternatives** — the assignment board must also work via click/keyboard.
- **URL as state / deep-link everything** — filters, tabs, wizard steps, selected row, view mode.
- **Announce async updates** — `aria-live="polite"` for toasts and inline validation.
- **Color is never the only signal** — status bad/heatmap cells carry a label/shape/pattern too.
- **Contrast** — verify in all three themes; interactions increase contrast.
- **Mobile input size** ≥ 16px; never disable zoom or paste.
- **Reduced motion** — the global override is ported and kept.
- **Confirm destructive actions** — deactivate employee, unassign, delete client, bulk actions.
- **Copy** — Title Case headings/buttons; ellipsis for loading; errors guide the exit.

**Per-phase a11y gate:** keyboard-only walkthrough of the phase's screens + axe/oxlint pass + manual contrast spot-check in light/dark/black.

---

## 12. Performance budget

| Metric | Target |
|---|---|
| Initial JS (gzip, main chunk) | ≤ 180 KB |
| Route chunk (gzip) | ≤ 60 KB |
| Recharts chunk | lazy-loaded, only on dashboard/reports routes |
| First contentful paint (cold, cable) | ≤ 1.5 s |
| Time to interactive (dashboard) | ≤ 2.5 s |
| Lighthouse performance | ≥ 90 |
| Lighthouse accessibility | ≥ 95 |
| Network requests for dashboard FMP | ≤ 3 aggregate endpoints |
| Layout shift (CLS) | ≤ 0.05 (fixed chart heights, skeletons matching layout) |

**Tactics:** route-level `React.lazy` + `<Suspense>` with the sibling's delayed-loading pattern; manual chunks (`react-vendor`, `recharts`, `charts`); preconnect to the API origin (ported `main.tsx` logic); preload the mono font; tabular-nums; no main-thread heavy work.

---

## 13. Target folder structure

```
EMSFrontend/
├── index.html
├── package.json
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json
├── vite.config.ts
├── .oxlintrc.json
├── .env.local  .env.production         # VITE_API_BASE_URL, VITE_USE_MOCK
├── DEPLOY.md                           # Hostinger SPA-fallback notes
├── public/
│   ├── favicon.svg  icons.svg
│   └── fonts/jetbrains-mono-latin-wght-normal.woff2
└── src/
    ├── main.tsx
    ├── App.tsx                         # createBrowserRouter route tree
    ├── index.css                       # ported tokens + EMS density tokens
    ├── routes/                         # HomeRedirect, ProtectedRoute, RedirectIfAuthenticated
    ├── contexts/                       # Auth, Theme, Toast, AppData, Notification, UI
    ├── hooks/                          # useQueryParamState, useFocusTrap, useDelayedLoading,
    │                                   # useUnsavedChanges, usePageTitle, useIsMac, usePermissions, useDensity
    ├── services/
    │   ├── apiClient.ts  httpAdapter.ts  mockAdapter.ts
    │   ├── authService.ts  attendanceService.ts  employeeService.ts  clientService.ts
    │   ├── projectService.ts  assignmentService.ts  payrollService.ts  reportService.ts
    │   ├── notificationService.ts  settingsService.ts
    │   └── mock/                       # fixtures per domain
    ├── types/                          # auth, user, attendance, client, project, assignment,
    │                                   # payroll, report, notification, document, activity
    ├── utils/                          # format, date, validation, permissions, storage, id,
    │                                   # errorMessage, focusFirstError, currency
    ├── components/
    │   ├── layout/                     # AppShell, Sidebar, Topbar, Breadcrumbs, CommandPalette,
    │   │                               # MobileNav, ProfileDropdown, DensityToggle
    │   ├── ui/                         # ported primitives
    │   ├── ems/                        # DataTable, KpiStrip, KpiStat, RoleBadge, BillableChip,
    │   │                               # Stepper, SlideOver, TimelineRail, PermissionGate, ...
    │   ├── attendance/                 # AttendanceClock, AttendanceHeatmap, RosterTable
    │   ├── dashboard/                  # StatCard, Sparkline, ActivityTimeline, widgets
    │   ├── onboarding/                 # wizard steps, Stepper integration
    │   ├── clients/  projects/  assignments/  payroll/  reports/  notifications/
    │   └── dev/                        # component playground (DEV only)
    └── pages/
        ├── auth/                       # Login, ResetPassword, InviteRedeem
        ├── admin/  hr/  manager/  supervisor/  me/
        └── dev/ComponentPlayground.tsx
```


---

## 14. Phased build plan

> **Stop-the-line rule:** a phase is not done until its **Acceptance gate** passes (`tsc` 0 errors, `oxlint` 0 errors, production build succeeds, keyboard walkthrough of the phase's screens). Never start the next phase with a red gate.

### Phase 0 — Scaffold & toolchain (0.5 day, no UI) `[x]` ✅
**Goal:** an empty but *running* app that builds, lints, and type-checks exactly like the sibling.
- [x] 0.1 Scaffold the React+TS app in `/EMSFrontend` with `name: ems-frontend`. *Done by hand (not `npm create vite`) so every file mirrors `../frontend` exactly and the scaffold is deterministic.*
- [x] 0.2 Ported & adapted `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `vite.config.ts` (dev proxy → EMS API on `localhost:8787`), `index.html`, `public/` (fonts, favicon, icons), plus a project `.gitignore`.
- [x] 0.3 Ported `src/index.css` verbatim and **appended** the EMS density tokens (§4.2) + density utilities (`.ems-row`, `.ems-overline`, `.ems-tabular`, `.ems-shadow-card`, `[data-density]`); every inherited token preserved.
- [x] 0.4 Created `.env.local`, `.env.production`, and a committed `.env.example` with `VITE_API_BASE_URL` + `VITE_USE_MOCK=true`.
- [x] 0.5 npm scripts: `dev`, `build`, `lint`, `preview`, `typecheck`.
- **Gate (verified):** `npm run typecheck` = **0 errors** · `npm run lint` = **0 warnings / 0 errors** · `npm run build` **succeeds** (`dist/` produced; `--ems-*` tokens + `[data-density]` confirmed in the built CSS) · `npm run dev` serves a styled Eniac placeholder (`HTTP 200`, `<title>Eniac EMS</title>`).

### Phase 1 — Design system & shared primitives (1.5 days) `[x]` ✅
**Goal:** the full component vocabulary exists and is demonstrable.
- [x] 1.1 Ported all `components/ui/*` primitives unchanged (27 files byte-identical to `../frontend`, except `ThemeToggle` which intentionally adds the third "black" theme).
- [x] 1.2 Ported `utils/*` (format, date, validation, storage, id, errorMessage, focusFirstError — all verified identical) and added `currency.ts` (USD/INR/EUR/GBP, `formatMoney`/`formatRate`/`parseMoney`).
- [x] 1.3 Ported `hooks/*` (useQueryParamState, useFocusTrap, useDelayedLoading, useUnsavedChanges, usePageTitle, useIsMac — verified identical) plus EMS `usePermissions` + `useDensity`.
- [x] 1.4 Built new EMS primitives (§8.2): DataTable, KpiStrip/KpiStat, Sparkline, StatDelta, StatusRail, RoleBadge, BillableChip, PayRateCell, ClientIdBadge, EmployeeIdBadge, AvatarStack, AttendanceStatusDot, Stepper, FormSection, SlideOver, ViewSwitcher, FilterBar, TimelineRail, PermissionGate, DensityToggle, CommandPalette (shell), IntegrationStatusChip — plus supporting EmsCard/CollapsibleCard/WidgetGrid, Board, BulkActionBar, NotificationBell, SearchPalette, AttendanceHeatmap, MoneyInput/RateInput.
- [x] 1.5 Dev component playground at `/dev/components` (DEV-only: registered behind `import.meta.env.DEV`, absent from the production bundle — verified by grepping `dist/`). Renders every primitive in every state; header carries `ThemeToggle` (light/dark/black) + `DensityToggle` (comfortable/compact).
- **Gate (verified):** `npm run typecheck` = **0 errors** · `npm run lint` = **0 errors** (13 warnings, all inherited from byte-identical ported files — same rules fire in `../frontend` which has 20) · `npm run build` **succeeds** (`dist/` produced) · `npm run dev` serves `/` **and** `/dev/components` at HTTP 200 with all playground modules transforming cleanly · playground header exposes all 3 themes × 2 densities for contrast review; every interactive primitive is keyboard-focusable (ported focus-visible rings).

### Phase 2 — App shell, routing, providers, guards (1.5 days) `[x]` ✅
**Goal:** the clickable skeleton the stakeholder can navigate in every role.
- [x] 2.1 `App.tsx`: `createBrowserRouter` route tree for all namespaces (§5), each route with `handle.title` + `breadcrumb`. *58 leaves across the 5 namespaces (§5.2), built from `namespace()`/`page()` helpers so every route carries `handle: { title, breadcrumb }` by construction; `useMatches()` drives `<title>` + breadcrumbs. `/` and `*` both resolve via `HomeRedirect`.*
- [x] 2.2 `layout/`: AppShell (skip-link, sidebar, topbar, main), Sidebar (role nav, collapsible, SECTION groups), Topbar (breadcrumbs, command-palette trigger, notifications bell, profile menu, theme + density), MobileNav, Breadcrumbs. *One `nav.tsx` registry feeds Sidebar + MobileNav + the palette's quick-nav, so all three stay in lockstep. Collapsed icons keep an `sr-only` label.*
- [x] 2.3 `CommandPalette` (`Cmd/Ctrl+K`): quick nav + role-appropriate actions. *Keybinding lives in `CommandPaletteHost` (renders once in AppShell); quick-nav entries derive from the same role-scoped registry as the sidebar, so the palette can never offer a dead link. Actions: theme, density, notifications, settings, sign out.*
- [x] 2.4 Guards: `ProtectedRoute` (5 roles + supervisor), `RedirectIfAuthenticated`, `HomeRedirect` (role-aware). *Role→dashboard mapping is centralised in `utils/dashboardPath.ts` so all three guards plus the login page resolve through one function.*
- [x] 2.5 Providers/contexts (§10) wired in `main.tsx`; `uiStore` (zustand) with density persistence. *Theme → Auth → Toast → AppData → Notification; density is mirrored onto `<html data-density>` and restored pre-paint.*
- [x] 2.6 `usePermissions()` + capability model; every nav item gated so no role sees dead links. *18 capabilities keyed off role (never raw role strings in the UI); nav items declare the capability they need and are filtered out when ungranted.*
- [x] 2.7 Empty placeholder pages for every route (title + breadcrumb + `EmptyState`) so navigation is fully walkable. *`RoutePlaceholder` names the delivering phase so the stakeholder can see what is real vs. scheduled.*
- **Gate (verified):** `npm run typecheck` = **0 errors** · `npm run lint` = **0 errors** (13 warnings, same inherited ported-file set as Phases 0–1) · `npm run build` **succeeds** · `npm run dev` and `npm run preview` both serve deep links (`/admin/dashboard`, `/manager/clients/1`) **and** unknown paths at HTTP 200 → SPA fallback → `HomeRedirect`; playground still absent from `dist/`. **Role walk executed** against the real modules (Vite SSR loader) for all 5 mock users → each lands on its own dashboard (`admin→/admin/dashboard` … `employee→/me/dashboard`), each sidebar renders 8–12 items, **zero dead links** (every visible item maps to a real route inside that namespace), and no role sees another role's namespace — except the two §5.1 exceptions (`/supervisor` reachable by admin, `/me` shared by non-admins), both asserted explicitly. §5.2 conformance: all 58 documented routes present. Capability gate proven live (manager nav loses 6 items under employee caps; inactive user gets none; employee denied payroll/users/audit/clients; admin stays attendance-exempt; supervisor's timesheet access tracks `billable` per §6.2). Keyboard/a11y: skip-link → `<main id="main-content" tabIndex={-1}>`, `aria-label`d `nav` landmarks, `aria-current` via `NavLink`, focus-trapped palette (`role="dialog"` + `listbox`/`option` + `aria-activedescendant` + `aria-live`) and MobileNav drawer, Escape closes both, visible focus rings throughout.


### Phase 3 — Auth + Attendance (2 days) `[x]`
**Goal:** real login flow and the daily attendance gate.
- [x] 3.1 `services/apiClient` (ported) + `httpAdapter`/`apiClient` real adapter + `mockAdapter` switch via `VITE_USE_MOCK`; `authService` (login/logout/me/forgot/reset/redeem-invite).
- [x] 3.2 `AuthContext` bootstrap on `/auth/me` with refresh-fallback; in-memory access token + refresh-cookie model; role-aware redirect preserved.
- [x] 3.3 Pages: `Login` (updated for `login(email, password)`), `ResetPassword`, `InviteRedeem`.
- [x] 3.4 Attendance: `AttendanceClock` mark view (live clock, optimistic mark + 5-min Undo, rollback), `AttendanceHeatmap` (reused from §8.2), `RosterTable` oversight view (KPI strip + 7-day spark + streak); `attendanceService`.
- [x] 3.5 Daily gate: dismissible per-day `AttendanceBanner` in the shell for every markable non-admin role, soft-link to the attendance page, auto-hides once marked, syncs via `onAttendanceChange`.
- **Gate:** `tsc -b`, `oxlint`, `vite build` all 0 errors. Dev server boots clean (200). Trace-verified role walk: admin lands on dashboard (banner suppressed by `markAttendance:false` cap); employee/hr/manager/supervisor see the banner → `/…/attendance` → mark present (optimistic) → confirmation + Undo → banner retracts via the change signal → Undo re-opens the mark form. Unify guard: the demo directory (`mocks/data/users.ts`) now derives from the canonical `MOCK_USERS` fixture so every sign-in email resolves in the adapter.

### Phase 4 — Role dashboards (2.5 days) `[x]` ✅
**Goal:** all 5 dashboards, data-dense and real-feeling (mock).
- [x] 4.1 Shared dashboard widgets (LazyChart line/bar/donut, DashboardShell with skeleton→data→error states) + mock aggregate service (`dashboardService.ts`, 5 aggregate endpoints).
- [x] 4.2 Admin dashboard (§7.3.1): 6 KPIs (active employees, billable split, clients, projects, attendance, revenue-at-risk), Platform Health chart band (headcount trend line, attendance rate bar, project status donut), System panel (audit timeline, integration sync chips), lower band (upcoming renewals table, role distribution, latest onboardings).
- [x] 4.3 HR dashboard (§7.3.2): 5 KPIs (headcount, new this month, pending onboardings, on leave, compliance %), onboarding pipeline kanban grid, attendance exceptions table, lower band (payrate changes, birthdays/anniversaries, leave calendar, document expiries).
- [x] 4.4 Manager dashboard (§7.3.3): 5 KPIs (clients, projects, unassigned resources, utilization %, billable hours), pipeline funnel, assignment queue, lower band (project health table, top clients by hours, capacity vs demand).
- [x] 4.5 Supervisor dashboard (§7.3.4): 5 KPIs (team, present today, pending approvals, hours logged, overdue), approvals queue with inline approve/decline, team attendance roster, lower band (timesheet status, weekly hours bars, escalations).
- [x] 4.6 Employee dashboard (§7.3.5): 4 KPIs (streak, hours, projects, pending leave), Today card (attendance status + next action), My Week bar chart, lower band (my assignments, timesheet handoff CTA for billable users, documents to sign, recent notifications).
- [x] 4.7 Lazy-load recharts; fixed chart heights; text-alternative toggles.
- **Gate:** `tsc -b` = **0 errors** · `oxlint` = **0 errors** (17 pre-existing warnings, same categories as Phase 3) · `vite build` succeeds (`recharts-DdCjDfN-.js` is a separate lazy chunk) · dev server boots clean (200). All 5 dashboards render loading skeleton → mock data → empty states; each KPI/chart links to its deeper route. ≤3 aggregate requests per dashboard; recharts in its own chunk.

### Phase 5 — HR: onboarding & people (3 days) `[x]` ✅
**Goal:** complete the people module.
- [x] 5.1 Onboarding wizard (6 steps, §7.4) with Stepper, draft save, unsaved guard, per-step validation, review + confirm.
- [x] 5.2 Onboarding pipeline (kanban) + invites table.
- [x] 5.3 Employees directory (`DataTable`: columns, sort, filters, saved views, bulk actions, grid view).
- [x] 5.4 Employee detail (tabs) + Edit (sectioned form, guardrails).
- [x] 5.5 Payrate management: rate cell, rate-change history timeline, billable toggle logic.
- [x] 5.6 Leave & Documents sub-modules (list/create; upload dropzones mocked).
- **Gate:** wizard creates a directory-visible employee; payrate validation blocks billable-without-rate; guardrails block last-admin deactivation; all forms keyboard-operable with error focus.

### Phase 6 — Manager: clients, projects, assignments (3 days) `[x]`
**Goal:** the commercial pipeline + timesheet linkage.
- [x] 6.1 Clients list/create/detail (§7.6) with Client ID generation + uniqueness + sync chip.
- [x] 6.2 Projects list/create/detail (§7.7) linked to clients.
- [x] 6.3 Assignments board + table view; slide-over for rates/term; drag **and** keyboard alternatives.
- [x] 6.4 Timesheet handoff CTA (external link) for billable users / staffed projects.
- [x] 6.5 Margin computation display (bill/pay/margin%).
- **Gate:** assign flow works both ways; unassign confirms; sync chip transitions; open-timesheet link correct; board is keyboard-operable.

### Phase 7 — Finance, reports, notifications, settings (2 days) `[x]`
**Goal:** the remaining surfaces.
- [x] 7.1 Payroll tables + rate-change log + export (§7.8).
- [x] 7.2 Reports grid with filter bar + chart widgets + table toggle (§7.9); employee "My Stats" variant.
- [x] 7.3 Notifications page + bell integration (§7.10).
- [x] 7.4 Settings/Profile incl. density + theme + org settings (§7.11).
- **Gate:** reports deep-linkable; notifications deep-link correctly; density/theme persist; exports produce files.

### Phase 8 — Integration wiring, polish, QA, deploy (2 days) `[ ]`
**Goal:** flip from mock to real API and harden.
- [ ] 8.1 Set `VITE_USE_MOCK=false`; point services at EMS API; fix contract mismatches (backend-shape only).
- [ ] 8.2 Cross-platform verification: create Client/Project/Assignment in EMS → confirm visibility in timesheet platform (manual integration test); document result.
- [ ] 8.3 Empty/error/edge-state sweep across every page; loading-flicker check.
- [ ] 8.4 Full a11y pass (keyboard, focus, contrast in 3 themes, aria-live, landmarks).
- [ ] 8.5 Performance pass vs §12 budget; Lighthouse ≥ targets.
- [ ] 8.6 `DEPLOY.md` (Hostinger SPA fallback, env, cache headers) + production build smoke test.
- **Gate:** all §12 budgets met; a11y gate met; integration test documented; `npm run build` produces a deployable `dist/`.


---

## 15. Master progress checklist

> This is the **tracker of record**. Tick as work lands. Phase gates (§14) must stay green.
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` accepted-out.

### Foundation  *(Phase 0)* ✅
- [x] `EMSFrontend/` folder exists at repo root
- [x] Vite + React 19 + TS project scaffolded
- [x] Toolchain matches sibling (tsconfig, oxlint, vite config)
- [x] Design tokens ported + EMS density tokens added (`index.css`)
- [x] `public/` fonts + favicon ported
- [x] env files + `VITE_USE_MOCK` switch configured

### Design system  *(Phase 1)* ✅
- [x] All `components/ui/*` primitives ported (verified byte-identical)
- [x] All `utils/*` + `hooks/*` ported (verified byte-identical) + EMS `currency.ts`/`permissions.ts`
- [x] New EMS primitives built (§8.2) — full list
- [x] Dev component playground (`/dev/components`) complete in 3 themes × 2 densities (DEV-only, excluded from prod bundle)

### Shell
- [x] Route tree for all 5 namespaces with handles/breadcrumbs
- [x] AppShell + Sidebar (role nav) + Topbar + MobileNav + Breadcrumbs
- [x] CommandPalette (`Cmd/Ctrl+K`)
- [x] Guards: ProtectedRoute (5 roles), RedirectIfAuthenticated, HomeRedirect
- [x] Providers/contexts wired; `uiStore` density persistence
- [x] Capability model + PermissionGate wired into nav & pages
- [x] Placeholder pages for every route (walkable)

### Auth & attendance
- [x] `apiClient` + http/mock adapters + `authService` (+ `attendanceService`; `VITE_USE_MOCK` switch)
- [x] Login / ResetPassword / InviteRedeem pages
- [x] Attendance mark view + heatmap + roster oversight + daily gate

### Dashboards
- [x] Admin dashboard
- [x] HR dashboard
- [x] Manager dashboard
- [x] Supervisor dashboard
- [x] Employee dashboard
- [x] Charts lazy-loaded + accessible + CLS-safe

### HR module
- [x] Onboarding wizard (6 steps)
- [x] Onboarding pipeline (kanban) + invites table
- [x] Employees directory (dense DataTable + views)
- [x] Employee detail (tabs) + Edit (guardrails)
- [x] Payrate management + change history
- [x] Leave + Documents sub-modules

### Manager module
- [x] Clients list/create/detail + Client ID + sync chip
- [x] Projects list/create/detail
- [x] Assignments board + table; drag + keyboard
- [x] Timesheet handoff CTA
- [x] Margin display

### Finance / system
- [x] Payroll tables + rate log + export
- [x] Reports grid + filters + table toggle
- [x] Notifications page + bell
- [x] Settings/Profile (density/theme/org)

### Integration & release
- [ ] Flip to real API (`VITE_USE_MOCK=false`)
- [ ] Cross-platform integration test documented
- [ ] Empty/error/edge sweep
- [ ] Full a11y pass (3 themes)
- [ ] Performance budget met (Lighthouse ≥ 90 / 95)
- [ ] `DEPLOY.md` + production smoke test

---

## 16. Verification & commands

Run from `/home/nikhil/Alpha-net/EMSFrontend`:

```bash
npm run typecheck   # tsc -b → must be 0 errors
npm run lint        # oxlint → must be 0 errors
npm run build       # tsc -b && vite build → dist/
npm run preview     # serve the production build locally
npm run dev         # dev server (proxies /api/v1 → EMS API)
```

**Per-phase drift guard (manual checklist):**
- [ ] `grep -rn "role ===" src` returns only `permissions.ts`/`usePermissions` (no scattered role checks).
- [ ] `grep -rn "text-white" src` — verify each occurrence works in `black` theme (sibling contrast rule).
- [ ] `grep -rn "onClick.*navigate" src` — prefer `<Button to>` / `<Link>` (guide "Links are links").
- [ ] `grep -rn "transition-all" src` — should be 0 (use specific properties).
- [ ] Every `role="dialog"` uses `useFocusTrap`.
- [ ] No `import` from `../frontend` (apps are decoupled).

**Cross-platform integration test (Phase 8.2):**
1. In EMS (mock→real), create a Client `CL-2026-001`.
2. Query the shared DB / timesheet platform — client must be present.
3. In EMS, create a Project + assign an Employee (billable).
4. Confirm the employee now appears as a timesheet-logging resource in the sibling app.
5. Record pass/fail + evidence in this doc.


---

## 17. Risks & open decisions

| ID | Item | Status | Impact if unresolved |
|---|---|---|---|
| D-1 | **Role enum final shape:** confirm `admin/hr/manager/supervisor/employee` are the final 5 and whether `supervisor` is a role *or* still an `isSupervisor` flag on `employee`. | ⏳ open | Access predicates, route guards, nav. |
| D-2 | **Can a supervisor/manager be billable?** (dual-hat resource) | ⏳ open | Timesheet-handoff visibility, payrate fields. |
| D-3 | **Auth shape:** does EMS reuse the timesheet JWT/cookie session (single sign-on across both apps), or a separate session? | ⏳ open | Shared `/auth` vs EMS-only auth; SSO UX. |
| D-4 | **Bill-rate visibility to the employee** on their own assignments (show or hide) | ⏳ open | Employee dashboard/assignment fields. |
| D-5 | **Client ID format** (`CL-2026-###` proposed) + who can override. | ⏳ open | Client module + cross-platform key. |
| D-6 | **AI assistant in EMS** (carry over the sibling's assistant?) | ⏳ open | Scope of a later phase; adds provider config. |
| D-7 | **Attendance policy details** (grace period, holidays, half-day hours, timezone) | ⏳ open | Attendance rules & validation. |
| R-1 | **Shared-DB contract drift** between EMS and timesheet backends. | ⚠️ risk | Mitigation: a **shared types/schema package** or a single-source `types.ts` copied + CI-checked; document the contract in one place. |
| R-2 | **Dual sources of truth for clients/projects** if both apps write them. | ⚠️ risk | Mitigation: one writer per field; the other reads; add `syncStatus` + an integration test. |
| R-3 | **Cloudflare Workers API CORS/cookie** differences vs Vercel. | ⚠️ risk | Verify refresh-cookie (`SameSite`) + CORS allowlist from the Workers origin early (Phase 3). |
| R-4 | **Density hurting accessibility** if pushed too far. | ⚠️ risk | Mitigation: hard floors (32px rows, 24px targets) + a11y gate each phase. |
| R-5 | Scope creep — EMS grows beyond a *frontend shell*. | ⚠️ risk | Mitigation: mock-first shell (Phases 0–7), real API only in Phase 8. |

> **Decision protocol:** when a `D-*` item is resolved, move it to **Appendix D — Decisions Log** with date, decision, and rationale (mirror how `interface_fix.md` tracks decisions).

---

## Appendix A — Design-token reference

**Ported (identical to sibling)** — see `frontend/src/index.css`: `--color-canvas`, `--color-bg-primary/secondary/tertiary`, `--color-text-primary/secondary/tertiary`, `--color-border-primary/secondary`, `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-success(/soft)`, `--color-warning(/soft)`, `--color-error(/soft)`, semantic shadcn-style tokens (`--color-background`, `--color-foreground`, `--color-card`, `--color-primary`, `--color-muted`, `--color-border`, `--color-ring`, sidebar tokens), `--font-sans`, `--font-mono`.

**EMS additions (§4.2):** `--ems-row-{comfortable,compact,dense}`, `--ems-gutter`, `--ems-pad-card`, `--ems-pad-section`, `--ems-control-h(-sm)`, `--ems-text-{micro,label,dense,body,title,h2,h1,kpi}`, `--ems-shadow-{card,raised,overlay}`.

**Themes:** `light` (default), `dark`, `black` — toggled via `ThemeContext`, `data-*`/classes on `<html>`, `color-scheme` set correctly, `theme-color` meta updated (ported inline script in `index.html`).

**Rules:** numbers right-aligned + `tabular-nums`; currency always 2 decimals; hours `12.5 h` with non-breaking space; radius nesting respected; layered shadows only.


---

## Appendix B — Route → page → role matrix

| Route | Page | admin | hr | manager | supervisor | employee |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `/login` | Login | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin/dashboard` | Admin Dashboard | ✅ | — | — | — | — |
| `/admin/employees(/:id)` | Directory/Detail (oversight) | ✅ | — | — | — | — |
| `/admin/roles` | Roles & Permissions | ✅ | — | — | — | — |
| `/admin/audit` | Audit Log | ✅ | — | — | — | — |
| `/admin/clients(/:id)` | Clients | ✅ | — | — | — | — |
| `/admin/projects(/:id)` | Projects | ✅ | — | — | — | — |
| `/admin/assignments` | Assignments | ✅ | — | — | — | — |
| `/admin/attendance` | Attendance (oversight) | ✅ | — | — | — | — |
| `/admin/payroll` | Payroll | ✅ | — | — | — | — |
| `/admin/reports` | Reports | ✅ | — | — | — | — |
| `/hr/dashboard` | HR Dashboard | — | ✅ | — | — | — |
| `/hr/onboarding(/new)` | Onboarding | ✅ | ✅ | — | — | — |
| `/hr/employees(/:id)(/edit)` | Employees | ✅ | ✅ | — | — | — |
| `/hr/payroll` | Pay & Rates | ✅ | ✅ | — | — | — |
| `/hr/attendance` | Attendance | ✅ | ✅ | — | — | — |
| `/hr/leave` | Leave | ✅ | ✅ | — | — | — |
| `/hr/documents` | Documents | ✅ | ✅ | — | — | — |
| `/hr/reports` | Reports | ✅ | ✅ | — | — | — |
| `/manager/dashboard` | Manager Dashboard | — | — | ✅ | — | — |
| `/manager/clients(/new)(/:id)` | Clients | ✅ | — | ✅ | — | — |
| `/manager/projects(/new)(/:id)` | Projects | ✅ | — | ✅ | — | — |
| `/manager/assignments(/new)` | Assignments | ✅ | — | ✅ | — | — |
| `/manager/resources` | Resources | ✅ | — | ✅ | — | — |
| `/manager/attendance` | Attendance | — | — | ✅ | — | — |
| `/manager/reports` | Reports | ✅ | — | ✅ | — | — |
| `/supervisor/dashboard` | Supervisor Dashboard | — | — | — | ✅ | — |
| `/supervisor/team` | Team | ✅ | — | — | ✅ | — |
| `/supervisor/attendance` | Team Attendance | ✅ | — | — | ✅ | — |
| `/supervisor/approvals` | Approvals | ✅ | — | — | ✅ | — |
| `/supervisor/reports` | Reports | ✅ | — | — | ✅ | — |
| `/me/dashboard` | Employee Dashboard | — | — | — | — | ✅ |
| `/me/attendance` | My Attendance | ✅* | ✅ | ✅ | ✅ | ✅ |
| `/me/profile` | Profile | ✅* | ✅ | ✅ | ✅ | ✅ |
| `/me/schedule` | Schedule | — | — | — | — | ✅ |
| `/me/leave` | Leave | — | — | — | — | ✅ |
| `/me/documents` | Documents | — | — | — | — | ✅ |
| `/…/notifications` | Notifications | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/…/settings` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ |

`*` admin may view `/me/*` self-service for profile/attendance oversight; admin does **not** mark attendance.


---

## Appendix C — Component inventory

*(Acceptance = renders in the dev playground with every state, in all three themes and both densities.)*

**Primitives (ported from `frontend/src/components/ui`):** Avatar, Badge, Button, Card, CardHeader, CardBody, CardFooter, Checkbox, ChipStrip, DatePicker, Drawer, Dropdown, EmptyState, ErrorState, FullPageSpinner, Input, KpiChip, LoadingState, Modal, Progress, Select, Skeleton, StatusBadge, Switch, Table, Tabs, Textarea, ThemeToggle, Toast, Tooltip.

**EMS components (§8.2):** DataTable, KpiStrip, KpiStat, Sparkline, StatDelta, StatusRail, RoleBadge, BillableChip, PayRateCell, ClientIdBadge, EmployeeIdBadge, AvatarStack, AttendanceStatusDot, AttendanceHeatmap, AttendanceClock, RosterTable, Stepper, FormSection, SlideOver, CommandPalette, ViewSwitcher, FilterBar, TimelineRail, PermissionGate, MoneyInput, RateInput, DensityToggle, IntegrationStatusChip.

**Layout chrome:** AppShell, Sidebar, Topbar, MobileNav, Breadcrumbs, ProfileDropdown.

**Charts (recharts, lazy):** Sparkline, MiniBarRow, TrendLine, StatusDonut, FunnelChart, CapacityBar, HeatStrip.

---

## Appendix D — Decisions log

Record every resolved `D-*` (and any spec deviation) here. This is the audit trail for the EMS frontend.

| Date | ID | Decision | Rationale / evidence |
|---|---|---|---|
| — | — | _(nothing logged yet)_ | — |

---

*End of `EMSFrontend.md`. This document is both the plan and the tracker of record: keep §15 current, keep every §14 phase gate green, and never let §4's design contract drift from `interface_guide.txt`.*


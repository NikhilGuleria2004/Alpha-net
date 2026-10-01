# Interface Guide — Phase 0 Baseline Capture

**Purpose:** freeze the starting state before any Phase 1 code lands. This is the "before" column that every later fix is measured against.
**Tracked in:** [`interface_fix.md`](./interface_fix.md) §8.3 item `0.1` · **Source of truth:** [`interface_guide.txt`](./interface_guide.txt) · **Plan of record:** [`interface_fix.md`](./interface_fix.md)
> **This file is the immutable "before" capture.** It is never edited after a phase lands. The matching "after" figures live in [`interface_fix.md`](./interface_fix.md) §7 (Phase 1 outcome) and Appendix C ("Phase 1 result").

| | |
|---|---|
| Repo | `/home/nikhil/Alpha-net` |
| Branch | `master` |
| **Baseline commit** | **`2d169334c0be841e0bcbdbd8291d4d46a2801799`** — clean working tree at capture, apart from the two untracked docs (`interface_fix.md`, this file) |
| Captured | 2026-09-29T21:41:06+05:30 |
| Toolchain | Node `v26.8.1` · npm `12.0.2` · Vite + React 19 + react-router + Tailwind v4 · oxlint |
| Command set | `interface_fix.md` §9 `V-1`…`V-10`, the Appendix C metrics, plus the guard rail (§1) |

> **Commit anchor corrected in Phase 0.** The audit draft named `a83e4221` as the audit commit (the value the workspace tooling reported). That commit **predates `DailyEntryCard.tsx`**, which `F-01`/`F-14` cite at `:42-51`, `:492`, `:495` — verified with `git show a83e422:frontend/src/components/timesheets/DailyEntryCard.tsx` → *path exists on disk, but not in `a83e422`*. The tree the audit actually read is `2d16933`, so every `file:line` citation and every number below is anchored there.

## 1. Guard rail — must stay green in every PR

```text
$ npm run lint
Found 20 warnings and 0 errors.
Finished in 520ms on 132 files with 116 rules using 8 threads.
exit 0        # the 20 warnings are pre-existing react-hooks / react-compiler hints

$ npm run build
dist/assets/index-BFc62nYQ.js   529.43 kB │ gzip: 120.65 kB
✓ built in 1.54s
exit 0        # warnings only: >500 kB chunk, 3 × INEFFECTIVE_DYNAMIC_IMPORT
```

**The exit codes are the contract** — `0` / `0` at baseline. Any Phase 1–5 change that turns either non-zero, or that adds a *new* lint error/warning, is a regression even if the finding it targeted is fixed.

## 2. Drift found while capturing — and corrected in `interface_fix.md`

| # | Audit draft said | Measured at `2d16933` | Action taken |
|---|---|---|---|
| 2.1 | Audit/baseline anchor `a83e422` | `2d16933`; `DailyEntryCard.tsx` **does not exist** at `a83e422` although `F-01`/`F-14` cite it | Anchor corrected in the header, in Appendix C, and here |
| 2.2 | §9 `V-9`: `onClick={() => navigate` → *"baseline ~30"* | **72** | Baseline corrected to 72 (V-9 + Appendix C) |
| 2.3 | "130 source files" | **135** files in `src/`: 94 `.tsx`, 37 `.ts`, 2 `.svg`, 1 `.png`, 1 `.css` (131 `.ts`/`.tsx`) | Header corrected |
| 2.4 | `addToast('error'` — no baseline recorded | **60** | Added to Appendix C and V-8 |
| 2.5 | `hero.png`, `react.svg`, `vite.svg` unreferenced (`F-27`) | **Confirmed unreferenced.** The only asset references anywhere are `index.html:5` (`/favicon.svg`) and `CreateProject.tsx:250` (an `accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"` file-input filter). `src/assets/` holds `hero.png` (13 KB), `react.svg`, `vite.svg` | No change — `F-27` verified, keep as-is |

### Everything else reproduced exactly

| Metric | Audit draft | Phase 0 measurement |
|---|---|---|
| ` required` occurrences | 70 | **70** ✔ |
| `noValidate` occurrences | 0 | **0** ✔ |
| `inputMode` occurrences | 1 | **1** ✔ |
| `min="` / `step=` numeric inputs | 5 | **5** ✔ (`Settings:190`, `InvoiceForm:234-235`, `:289-290`, `TimesheetEditor:726/728`, `DailyEntryCard:495`) |
| `aria-invalid` in UI primitives | 3 | **3** ✔ (`Input:31`, `Select:25`, `Textarea:27`) |
| `role="dialog"` total | 11 (6 unnamed + 4 named + MobileNav) | **11** ✔ |
| `addEventListener('keydown'` | only `ConfirmDialog`, `AIChatPanel`, `AIChatWidget`, `Drawer`, `Modal`, `Topbar`, `ProfileDropdown` | ✔ exact match — none of the 6 offending dialogs |
| `transition-all` | 8 | **8** ✔ |
| `duration-300` | 5 | **5** ✔ (`ThemeToggle:54`, `:56`, `Progress:35`, `Sidebar:89`, `:195`) |
| `hover:text-muted-foreground` | 7 | **7** ✔ |
| `hover:text-foreground` | 36 | **36** ✔ |
| `'Loading...'` three-dot literal | 1 | **1** ✔ (`FullPageSpinner:11`) |
| `…` ellipsis character | 31 | **31** ✔ |
| `’` curly apostrophe | 1 | **1** ✔ (`Clients.tsx:234`) |
| `Failed to …` | 48 | **48** ✔ |
| bare `toLocaleDateString()` | 2 | **2** ✔ (`InvoiceDetail:157`, `Topbar:303`) |
| inline `Intl.` in components | 6 | **6** ✔ |
| `navigate(` call sites | 104 | **104** ✔ |
| `useQueryParamState` uses | — | 64 (recorded) |
| `Guideline N.M` comments | 24 | **24** ✔ |
| comments naming `frontend_eval.md` | 5 | **5** ✔ |
| `spellCheck` / `translate=` / `role="img"` (Avatar) / `debounce`+`useDeferredValue` / `optimist` / loading-delay helpers / `scroll-margin` | 0 | **0** for each ✔ |
| `shadow-xl` / `shadow-lg` | 13 / 7 | **13 / 7** ✔ |
| hardcoded colour literals in `Reports.tsx` | 2 | **2** ✔ (`:196`, `:197` — `fill: '#94a3b8'`) |
| `scrollIntoView({ behavior: 'smooth' })` | 1 | **1** ✔ (`AIChatPanel:16`) |
| `npm run lint` / `npm run build` | green | **green** ✔ (see §1) |

## 3. How this baseline is used

1. **Before starting** a finding: re-run that finding's §9 command. It must still equal the value recorded here. If it doesn't, the file moved — refresh the `file:line` citations before writing code.
2. **After the fix:** the same command must reach the stated target, and the §1 guard rail must stay `0` / `0`.
3. **"Done" means three things:** the command output, a green guard rail, and a commit hash in the `Commit` column of [`interface_fix.md`](./interface_fix.md) §8.2.

**Interim regression guard (dependency-free).** Decision `D-7` selected option **(b)** for now, so this capture doubles as the guard: §5's script needs no new packages. Save it as `frontend/scripts/interface-baseline.sh`, then `bash interface-baseline.sh > after.txt` and diff it against §4 to see exactly what a PR changed. Wire it into CI (or a pre-push hook) when Phase 6 lands.

## 4. Raw transcript — §9 `V-1`…`V-10` + Appendix C metrics

Verbatim and unedited. `[exit n]` is the shell exit code of the command above it; for the "expect 0" greps **`exit 1` / a count of `0` is the desired result at baseline**.

```text
PHASE 0 BASELINE — interface_fix.md §9 verification suite
captured: 2026-09-29T21:41:06+05:30
commit:   2d169334c0be841e0bcbdbd8291d4d46a2801799
branch:   master

===== V-1  F-01 F-02 F-14 — validation surface & numeric keypads =====

$ grep -rn 'noValidate' src --include=*.tsx
[exit 1]

$ grep -rno ' required' src --include=*.tsx | wc -l
70
[exit 0]

$ grep -rn 'step=\|min="' src --include=*.tsx
src/pages/admin/Settings.tsx:190:          <Input label="Standard Weekly Hours" type="number" min="1" max="168" value={standardWeeklyHours} onChange={(e) => setStandardWeeklyHours(e.target.value)} />
src/pages/admin/InvoiceForm.tsx:234:                min="0"
src/pages/admin/InvoiceForm.tsx:235:                step="0.01"
src/pages/admin/InvoiceForm.tsx:289:                        step="0.01"
src/pages/admin/InvoiceForm.tsx:290:                        min="0"
src/pages/user/TimesheetEditor.tsx:726:                          min="0"
src/pages/user/TimesheetEditor.tsx:728:                          step="0.5"
src/components/timesheets/DailyEntryCard.tsx:46: * min=0.25 with step=0.5 lands it on 0.25/0.75 and turns every whole and half
src/components/timesheets/DailyEntryCard.tsx:495:              step={HOURS_INCREMENT}
[exit 0]

$ grep -rn 'inputMode' src --include=*.tsx
src/components/timesheets/DailyEntryCard.tsx:492:              inputMode="decimal"
[exit 0]

$ grep -rn 'aria-invalid' src/components/ui/*.tsx
src/components/ui/Input.tsx:31:          aria-invalid={Boolean(error)}
src/components/ui/Select.tsx:25:          aria-invalid={Boolean(error)}
src/components/ui/Textarea.tsx:27:        aria-invalid={Boolean(error)}
[exit 0]

$ grep -rn 'required' src --include=*.tsx | grep -vc '//'
70
[exit 0]

===== V-2  F-03 F-04 — dialog focus management =====

$ grep -rn 'role="dialog"' src --include=*.tsx
src/pages/admin/SupervisorDetails.tsx:22:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/admin/ProjectDetails.tsx:29:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/Timesheets.tsx:193:        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/TimesheetEditor.tsx:38:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/TimesheetEditor.tsx:873:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/components/ConfirmDialog.tsx:66:        role="dialog"
src/components/ai/AIChatPanel.tsx:76:      <div role="dialog" aria-modal="true" aria-label="AI chat" className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
src/components/approvals/ReviewPanel.tsx:16:    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/components/ui/Drawer.tsx:100:    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={title ? 'drawer-title' : undefined}>
src/components/ui/Modal.tsx:68:    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
src/components/layout/MobileNav.tsx:15:      role="dialog"
[exit 0]

$ grep -rn 'aria-modal' src --include=*.tsx
src/pages/admin/SupervisorDetails.tsx:22:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/admin/ProjectDetails.tsx:29:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/Timesheets.tsx:193:        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/TimesheetEditor.tsx:38:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/pages/user/TimesheetEditor.tsx:873:    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/components/ConfirmDialog.tsx:67:        aria-modal="true"
src/components/ai/AIChatPanel.tsx:76:      <div role="dialog" aria-modal="true" aria-label="AI chat" className="relative flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
src/components/approvals/ReviewPanel.tsx:16:    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
src/components/ui/Drawer.tsx:100:    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={title ? 'drawer-title' : undefined}>
src/components/ui/Modal.tsx:68:    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
src/components/layout/MobileNav.tsx:16:      aria-modal="true"
[exit 0]

$ grep -rn 'aria-label\|aria-labelledby' src/pages/user/Timesheets.tsx src/pages/admin/ProjectDetails.tsx
src/pages/admin/ProjectDetails.tsx:349:                <button type="button" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50" aria-label="Download document"><Download className="h-4 w-4" /></button>
src/pages/admin/ProjectDetails.tsx:350:                <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="File type"><span className="text-xs font-medium uppercase">{doc.mimeType.split('/')[1] || doc.mimeType}</span></button>
[exit 0]

$ grep -rn "addEventListener('keydown'" src
src/components/ConfirmDialog.tsx:52:    document.addEventListener('keydown', trap)
src/components/ConfirmDialog.tsx:53:    document.addEventListener('keydown', escape)
src/components/ai/AIChatPanel.tsx:32:    document.addEventListener('keydown', handleKeyDown, true)
src/components/ai/AIChatWidget.tsx:18:    window.addEventListener('keydown', handleKeyDown)
src/components/ui/Drawer.tsx:93:    document.addEventListener('keydown', handleKeyDown)
src/components/ui/Modal.tsx:54:    document.addEventListener('keydown', handleKeyDown)
src/components/layout/Topbar.tsx:63:    document.addEventListener('keydown', handleKeyDown)
src/components/layout/ProfileDropdown.tsx:33:    document.addEventListener('keydown', handleKeyDown)
[exit 0]

===== V-3  F-08 — animation property discipline =====

$ grep -rn 'transition-all' src --include=*.tsx
src/pages/admin/ProjectDetails.tsx:191:            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
src/pages/user/TimesheetEditor.tsx:792:              <div className={`h-full rounded-full transition-all ${isAboveTarget ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${progressPercent}%` }} />
src/components/ai/AIChatWidget.tsx:27:        className={`fixed right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-white shadow-xl transition-all hover:bg-accent-hover ${
src/components/ui/ThemeToggle.tsx:49:      className={`relative inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${buttonSize} ${className}`}
src/components/ui/Progress.tsx:35:          className={`h-full rounded-full transition-all duration-300 ${variantClasses[variant]}`}
src/components/ui/Toast.tsx:38:          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] shadow-xl transition-all ${bgMap[toast.type]}`}
src/components/ui/Modal.tsx:73:        className={`relative w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto overscroll-contain rounded-none sm:rounded-xl border border-border bg-card shadow-xl transition-all`}
src/components/layout/Sidebar.tsx:89:        className={`relative z-40 hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}
[exit 0]

$ grep -rn 'duration-300\|duration-500' src --include=*.tsx
src/components/ui/ThemeToggle.tsx:54:        <Sun className={`${iconSize} text-amber-400 transition-transform duration-300 hover:rotate-45`} />
src/components/ui/ThemeToggle.tsx:56:        <Contrast className={`${iconSize} transition-transform duration-300`} />
src/components/ui/Progress.tsx:35:          className={`h-full rounded-full transition-all duration-300 ${variantClasses[variant]}`}
src/components/layout/Sidebar.tsx:89:        className={`relative z-40 hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}
src/components/layout/Sidebar.tsx:195:        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-card shadow-xl transition-transform duration-300 md:hidden ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
[exit 0]

===== V-4  F-06 C-01 — mobile zoom safety =====

$ grep -n 'viewport' index.html
6:    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
[exit 0]

$ grep -n 'text-sm\|text-base' src/components/layout/Topbar.tsx
167:          <ol className="flex items-center gap-2 text-sm">
208:                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
223:                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-left hover:bg-muted"
237:                <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">No results found</div>
263:                  <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
301:                          <p className="text-sm font-medium text-foreground">{notification.title}</p>
323:              <p className="text-sm font-medium text-foreground">{user?.name}</p>
331:                <p className="text-sm font-medium text-foreground">{user?.name}</p>
338:                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
346:                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
356:                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-error-soft disabled:opacity-50"
[exit 0]

===== V-5  F-09 — hover contrast =====

$ grep -rn 'hover:text-muted-foreground' src --include=*.tsx | wc -l
7
[exit 0]

$ grep -rn 'hover:text-muted-foreground' src --include=*.tsx
src/components/ui/Drawer.tsx:133:          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
src/components/ui/Toast.tsx:46:            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-muted-foreground"
src/components/ui/Modal.tsx:90:          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
src/components/layout/Topbar.tsx:161:          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground md:hidden"
src/components/layout/Topbar.tsx:249:            className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
src/components/layout/MobileNav.tsx:30:            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
src/components/layout/Sidebar.tsx:207:            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
[exit 0]

$ grep -rn 'hover:text-foreground' src --include=*.tsx | wc -l
36
[exit 0]

===== V-6  F-10 F-11 — typography =====

$ grep -rn 'Loading\.\.\.' src
src/components/ui/FullPageSpinner.tsx:11:        <p className="text-sm text-foreground">{label ?? 'Loading...'}
[exit 0]

$ grep -rn "Here's\|You're\|don't\|Week's" src --include=*.tsx
src/pages/admin/CreateProject.tsx:120:        // reported per-file but don't block navigation (the project itself is
src/pages/admin/Notifications.tsx:108:              description="You don't have any notifications yet."
src/pages/admin/Dashboard.tsx:90:        <p className="mt-1 text-sm text-muted-foreground">Here's what's happening across Eniac today.</p>
src/pages/admin/Dashboard.tsx:135:                    title="You're all caught up"
src/pages/user/TimesheetEditor.tsx:761:        so users don't have to guess why a day is greyed out. */}
src/pages/user/ProjectDetails.tsx:105:              <h3 className="text-lg font-semibold text-foreground">This Week's Timesheet</h3>
src/pages/user/ProjectDetails.tsx:126:                  <Button className="w-full" onClick={() => navigate(`/user/timesheets/${myTimesheet.id}`)}>Open This Week's Timesheet</Button>
src/pages/user/Notifications.tsx:107:              description="You don't have any notifications yet."
src/pages/user/Dashboard.tsx:94:        <p className="mt-1 text-sm text-muted-foreground">Here's your work overview.</p>
src/components/layout/Topbar.tsx:281:                    <EmptyState title="No notifications" description="You're up to date." />
src/contexts/AppDataContext.tsx:238:  // is authenticated, pausing when the tab is hidden so idle tabs don't waste
src/contexts/NotificationContext.tsx:78:  // login screen don't waste requests.
[exit 0]

$ grep -rno '’' src --include=*.tsx | wc -l
1
[exit 0]

$ grep -rno '’' src --include=*.tsx
src/pages/admin/Clients.tsx:234:’
[exit 0]

$ grep -rno '…' src --include=*.tsx | wc -l
31
[exit 0]

===== V-7  F-22 F-23 F-24 — formats, units, translation =====

$ grep -rn 'toLocaleDateString()' src
src/pages/admin/InvoiceDetail.tsx:157:              <span className="text-sm font-medium text-foreground">{new Date(invoice.sentAt).toLocaleDateString()}</span>
src/components/layout/Topbar.tsx:303:                          <p className="mt-1 text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleDateString()}</p>
[exit 0]

$ grep -rn 'Intl\.' src --include=*.tsx
src/pages/admin/Dashboard.tsx:165:                              {submittedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(submittedDate) : '-'}
src/pages/admin/Dashboard.tsx:210:                              <span className="text-foreground">{submittedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(submittedDate) : '-'}</span>
src/pages/user/Dashboard.tsx:273:                          {project.client} • Due {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(project.deadline))}
src/pages/user/Dashboard.tsx:304:                          {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(project.deadline))}
src/components/dashboard/ActivityTimeline.tsx:60:  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(date)
src/components/dashboard/DeadlineCard.tsx:39:            Deadline: {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(deadlineDate)}
[exit 0]

$ grep -rn 'nbsp' src
[exit 1]

$ grep -rn 'u00a0' src
[exit 1]

$ grep -rn "$'\u00a0'" src | wc -l
grep: warning: stray \ before u
0
[exit 0]

$ grep -rn 'translate=' src index.html
[exit 1]

===== V-8  F-12 — error copy =====

$ grep -rn 'Failed to' src --include=*.tsx | wc -l
48
[exit 0]

$ grep -rn 'Failed to' src --include=*.tsx | grep -c console.error
2
[exit 0]

$ grep -rn "addToast('error'" src --include=*.tsx | wc -l
60
[exit 0]

===== V-9  F-05 F-17 — links & URL state =====

$ grep -rn 'navigate(' src --include=*.tsx | wc -l
104
[exit 0]

$ grep -rn 'onClick={() => navigate' src --include=*.tsx | wc -l
72
[exit 0]

$ grep -rn 'useQueryParamState' src --include=*.tsx | wc -l
64
[exit 0]

===== V-10  F-13 F-15 F-18..F-21 F-25 F-26 F-29 — remaining items =====

$ grep -rn 'spellCheck' src --include=*.tsx
[exit 1]

$ grep -rn 'onFocus' src/components/ui/Tooltip.tsx
[exit 1]

$ grep -rn 'optimist' src/contexts/AppDataContext.tsx
[exit 1]

$ grep -rn 'useDelayedLoading\|minDuration\|showDelay' src
[exit 1]

$ grep -rn 'debounce\|useDeferredValue\|startTransition' src
[exit 1]

$ grep -rn "'#" src/pages/admin/Reports.tsx
196:                      <XAxis dataKey="projectName" tick={{ fontSize: 12, fill: '#94a3b8' }} />
197:                      <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
[exit 0]

$ grep -rn 'role="img"' src/components/ui/Avatar.tsx
[exit 1]

$ grep -rn "behavior: 'smooth'" src --include=*.tsx
src/components/ai/AIChatPanel.tsx:16:    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
[exit 0]

$ grep -rn 'Guideline [0-9]\+\.[0-9]\+' src | wc -l
24
[exit 0]

$ grep -rn 'frontend_eval.md' src
src/index.css:251:   Web Interface Guidelines compliance (frontend_eval.md §12, Phase 0)
src/hooks/useQueryParamState.ts:4:// Guideline 1.11/1.23 (frontend_eval.md §12 item 1.4): list control state —
src/hooks/useUnsavedChanges.ts:4:// Guideline 5.15 (frontend_eval.md §12 item 1.2): warn before navigation when
src/hooks/usePageTitle.ts:3:// Guideline 4.3 (frontend_eval.md §12 item 1.3): the <title> must reflect the
src/App.tsx:45:// Data router (frontend_eval.md §12 items 1.2/1.3): createBrowserRouter
[exit 0]

===== Appendix C — remaining baseline metrics =====

$ grep -rc '' src --include=*.tsx --include=*.ts -h | wc -l
131
[exit 0]

$ find src -type f | wc -l
135
[exit 0]

$ grep -rn 'shadow-xl' src --include=*.tsx | wc -l
13
[exit 0]

$ grep -rn 'shadow-lg' src --include=*.tsx | wc -l
7
[exit 0]

$ grep -rn 'useState' src --include=*.tsx | wc -l
272
[exit 0]

$ grep -rn 'toast' src --include=*.tsx | wc -l
19
[exit 0]

===== END =====
```

## 5. Capture script — `scripts/interface-baseline.sh` (when `D-7` is actioned)

This is the exact script that produced §4, to be run from `frontend/`. It lives here rather than in `frontend/` because Phase 0 is a no-code phase and `D-7` deferred new tooling: drop it into `frontend/scripts/`, `chmod +x`, and wire it into CI when Phase 6 lands.

```bash
#!/usr/bin/env bash
# Phase 0.1 — capture the "before" baseline for every §9 verification command.
# Run from frontend/ (or anywhere — it cds itself). Writes a sectioned transcript to stdout.
cd "$(dirname "$0")" 2>/dev/null
if [ ! -d src ]; then cd /home/nikhil/Alpha-net/frontend; fi

sec() { printf '\n===== %s =====\n' "$1"; }
run() { printf '\n$ %s\n' "$1"; eval "$1"; printf '[exit %s]\n' "$?"; }

printf 'PHASE 0 BASELINE — interface_fix.md §9 verification suite\n'
printf 'captured: %s\n' "$(date -Iseconds)"
printf 'commit:   %s\n' "$(git -C /home/nikhil/Alpha-net rev-parse HEAD)"
printf 'branch:   %s\n' "$(git -C /home/nikhil/Alpha-net rev-parse --abbrev-ref HEAD)"

sec "V-1  F-01 F-02 F-14 — validation surface & numeric keypads"
run "grep -rn 'noValidate' src --include=*.tsx"
run "grep -rno ' required' src --include=*.tsx | wc -l"
run "grep -rn 'step=\\|min=\"' src --include=*.tsx"
run "grep -rn 'inputMode' src --include=*.tsx"
run "grep -rn 'aria-invalid' src/components/ui/*.tsx"
run "grep -rn 'required' src --include=*.tsx | grep -vc '//'"

sec "V-2  F-03 F-04 — dialog focus management"
run "grep -rn 'role=\"dialog\"' src --include=*.tsx"
run "grep -rn 'aria-modal' src --include=*.tsx"
run "grep -rn 'aria-label\\|aria-labelledby' src/pages/user/Timesheets.tsx src/pages/admin/ProjectDetails.tsx"
run "grep -rn \"addEventListener('keydown'\" src"

sec "V-3  F-08 — animation property discipline"
run "grep -rn 'transition-all' src --include=*.tsx"
run "grep -rn 'duration-300\\|duration-500' src --include=*.tsx"

sec "V-4  F-06 C-01 — mobile zoom safety"
run "grep -n 'viewport' index.html"
run "grep -n 'text-sm\\|text-base' src/components/layout/Topbar.tsx"

sec "V-5  F-09 — hover contrast"
run "grep -rn 'hover:text-muted-foreground' src --include=*.tsx | wc -l"
run "grep -rn 'hover:text-muted-foreground' src --include=*.tsx"
run "grep -rn 'hover:text-foreground' src --include=*.tsx | wc -l"

sec "V-6  F-10 F-11 — typography"
run "grep -rn 'Loading\\.\\.\\.' src"
run "grep -rn \"Here's\\|You're\\|don't\\|Week's\" src --include=*.tsx"
run "grep -rno '’' src --include=*.tsx | wc -l"
run "grep -rno '’' src --include=*.tsx"
run "grep -rno '…' src --include=*.tsx | wc -l"

sec "V-7  F-22 F-23 F-24 — formats, units, translation"
run "grep -rn 'toLocaleDateString()' src"
run "grep -rn 'Intl\\.' src --include=*.tsx"
run "grep -rn 'nbsp' src"
run "grep -rn 'u00a0' src"
run "grep -rn \"\$'\\u00a0'\" src | wc -l"
run "grep -rn 'translate=' src index.html"

sec "V-8  F-12 — error copy"
run "grep -rn 'Failed to' src --include=*.tsx | wc -l"
run "grep -rn 'Failed to' src --include=*.tsx | grep -c console.error"
run "grep -rn \"addToast('error'\" src --include=*.tsx | wc -l"

sec "V-9  F-05 F-17 — links & URL state"
run "grep -rn 'navigate(' src --include=*.tsx | wc -l"
run "grep -rn 'onClick={() => navigate' src --include=*.tsx | wc -l"
run "grep -rn 'useQueryParamState' src --include=*.tsx | wc -l"

sec "V-10  F-13 F-15 F-18..F-21 F-25 F-26 F-29 — remaining items"
run "grep -rn 'spellCheck' src --include=*.tsx"
run "grep -rn 'onFocus' src/components/ui/Tooltip.tsx"
run "grep -rn 'optimist' src/contexts/AppDataContext.tsx"
run "grep -rn 'useDelayedLoading\\|minDuration\\|showDelay' src"
run "grep -rn 'debounce\\|useDeferredValue\\|startTransition' src"
run "grep -rn \"'#\" src/pages/admin/Reports.tsx"
run "grep -rn 'role=\"img\"' src/components/ui/Avatar.tsx"
run "grep -rn \"behavior: 'smooth'\" src --include=*.tsx"
run "grep -rn 'Guideline [0-9]\\+\\.[0-9]\\+' src | wc -l"
run "grep -rn 'frontend_eval.md' src"

sec "Appendix C — remaining baseline metrics"
run "grep -rc '' src --include=*.tsx --include=*.ts -h | wc -l"
run "find src -type f | wc -l"
run "grep -rn 'shadow-xl' src --include=*.tsx | wc -l"
run "grep -rn 'shadow-lg' src --include=*.tsx | wc -l"
run "grep -rn 'useState' src --include=*.tsx | wc -l"
run "grep -rn 'toast' src --include=*.tsx | wc -l"
printf '\n===== END =====\n'
```

---

*Captured in Phase 0 of [`interface_fix.md`](./interface_fix.md) on 2026-09-29 at commit `2d16933`. Regenerate rather than hand-edit: the transcript is the evidence.*

# EMSFrontend

The **Eniac Employee Management System (EMS)** frontend lives here.

> **📘 Read the specification & build tracker first:** [`./EMSFrontend.md`](./EMSFrontend.md).
> It is the plan of record and the progress tracker — follow its phases in order and tick items in its §15 checklist as work lands.

## What goes here

This folder holds the entire EMS React application. It is a **sibling** of the timesheet platform at [`../frontend`](../frontend):

- **New, standalone app** — never import from or modify `../frontend` or `../backend`.
- **Shared visual language** — inherits the Eniac design tokens (`../frontend/src/index.css`) and adds an EMS "dense maximalist" density layer.
- **Shared data** — talks to the EMS backend (Cloudflare Workers) which uses the **same MongoDB** as the timesheet platform, so clients/projects/employees created here are instantly available there and vice-versa.
- **Static deploy** — `npm run build` → `dist/` for Hostinger.

## Getting started

**Phase 0 is complete** — this is a runnable Vite + React 19 + TypeScript project with the Eniac design tokens and the EMS density layer in place.

```bash
cd EMSFrontend
npm install
npm run dev        # dev server on :5173 (proxies /api/v1 → localhost:8787)
npm run typecheck  # tsc -b — 0 errors required
npm run lint       # oxlint — 0 errors required
npm run build      # tsc -b && vite build → dist/ (Hostinger)
npm run preview    # serve the production build locally
```

Environment (Vite — only `VITE_`-prefixed vars reach the client): see `.env.example`. `VITE_USE_MOCK=true` keeps the shell running on typed mock data until the real API is wired in Phase 8.

See [`./EMSFrontend.md`](./EMSFrontend.md) §3 for the stack, §4 for the design language, §13 for the target folder structure, and §14 for the phased build plan.

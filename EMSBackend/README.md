# Eniac EMS Backend

Company-wide Employee Management System (EMS) backend API — auth, attendance, HR onboarding, leave, manager commercial (clients / projects / assignments), finance / reports, notifications, and settings.

Shares a single MongoDB cluster/database with the timesheet platform backend (`/backend`) — additive collections + fields only. Never modifies the platform backend.

Full specification and build tracker: [`EMSBackend.md`](./EMSBackend.md).

## Quick start

```bash
cd EMSBackend
npm install
cp .env.example .env          # edit secrets
npm run dev                    # tsx watch → :8787
```

Health check: `curl http://localhost:8787/health` → `{"status":"ok"}`

## Commands

| Script | What it does |
|---|---|
| `npm run dev` | Start in watch mode (`:8787`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run seed:demo` | Seed mock-parity demo data (idempotent) |
| `npm run seed:demo -- --reset` | Wipe the demo rows first, then reseed |

### Demo accounts

`seed:demo` creates 6 users covering every role. All share the password
**`EniacDemo!2026`** (override with `SEED_DEMO_PASSWORD`):

`admin@eniac.demo` · `hr@eniac.demo` · `manager@eniac.demo` ·
`supervisor@eniac.demo` · `esha@eniac.demo` · `dev@eniac.demo`

Re-running the seed never duplicates rows. `--reset` deletes **only** rows
carrying the `seed:demo` tag, so it can never touch real data — but it does
drop every demo row, including any you edited by hand.

Run it against a scratch database. The seeder **refuses to run against the
shared `alphanet` database** — its fixtures all share one well-known password, so
seeding them there would expose real employee data behind known credentials:

```bash
MONGODB_DB_NAME=eniac_ems_seed npm run seed:demo
```

Set `SEED_ALLOW_SHARED_DB=true` only if you truly intend to override that guard.
The platform database name defaults to `alphanet`; override with `PLATFORM_DB_NAME`.

## Architecture notes

- **Express 4 + TypeScript 5 strict + Node 22**
- **MongoDB 6 driver** — shares the platform's Atlas `alphanet` database, and its `JWT_SECRET`, so both services read the same rows and accept each other's tokens. See `EMSBackend.md` D-15.
  - All collections are **shared**. EMS only ever *adds* fields and indexes; it never rewrites a platform row's shape.
  - Unique indexes on shared collections are **partial** (D-16). Platform rows predate the EMS fields (`clients.clientCode`, `invites.tokenHash`, `sessions.refreshHash`), so a plain unique index would collide on `null` — and could not even be built.
  - **Do not run `npm run seed:demo` against `alphanet`.** It writes 6 accounts sharing a well-known password. The seeder now hard-refuses to target the shared database; point `MONGODB_DB_NAME` at a scratch database instead.
- **jose JWT** — 15 min access token, 30-day rotating refresh (httpOnly, SameSite=Lax)
- **zod** validation per router, uniform error envelopes (`{ error: { code, message, details? } }`)
- **pino** structured logging with `X-Request-Id` tracing
- See `EMSBackend.md` §3 (tech stack), §4 (API contract), §13 (folder structure)

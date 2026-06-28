# CLAUDE.md

Guidance for Claude Code when working in this repository. Read this first; it records the
decisions that aren't obvious from the code alone.

## What this is

A **multi-tenant AI Receptionist SaaS**. An inbound voice assistant (Vapi) answers calls for many
customer organizations, answers from each org's knowledge base, and books appointments with a free
staff member — all isolated per organization. A super-admin oversees every org and can switch into
any one of them.

**Source-of-truth documents (read for full detail — do not duplicate them here):**
- `01-PRODUCT-RESEARCH.md` — market/vendor research (Vapi specifics, provider landscape).
- `02-SCOPE.md` — scope v3.0, data model, business rules.
- `03-CLAUDE-CODE-PLAN.md` — **the build plan**, task-by-task, with "Done when" checks per task.
- `04-TEST-CASES.md` — the itemized, IDed test list to build against.
- Approved execution plan: `C:\Users\PC-1002\.claude\plans\now-you-need-to-jazzy-prism.md`

We are currently building **Phase 1 only**, milestone-by-milestone, with a check-in at each
milestone boundary.

## Locked stack decisions (override doc 03 where they differ)

Doc 03 was written for React+Vite SPA + a separate Express API. The user has since chosen
**Next.js full-stack**. When doc 03's *framework wrapper* conflicts with the table below, this
table wins; doc 03's *architecture principles, data model, business rules, and test cases* still
fully apply.

| Concern | Choice |
|---|---|
| Framework | **Next.js (App Router), TypeScript** — single full-stack app at repo root |
| Backend | Next.js **Route Handlers** (`app/api/**/route.ts`), thin — they call feature services in `src/server/` |
| Frontend | React Server/Client Components + **Tailwind** + **TanStack Query** |
| ORM / DB | **Prisma** + **PostgreSQL** (DB is the source of truth) |
| Auth | JWT access + rotating refresh, **bcrypt**, delivered via **httpOnly cookies**; roles `super_admin`/`org_admin`/`org_staff` |
| Validation | **Zod** on every route input and tool payload |
| Voice | `VoiceProvider` **port** + a **fake** (tests) + a **real Vapi adapter** (`@vapi-ai/server-sdk`) |
| Tests | **Vitest** (unit + integration vs a real test Postgres) + **React Testing Library** + optional **Playwright** |
| Package mgr | **npm workspaces** (no global pnpm) |

## Standing rules (from doc 03 — non-negotiable)

1. **Every customer-data query is scoped by `organizationId`.** No exceptions. The `platform/db`
   wrapper must throw if a customer-data query runs unscoped (see test `U-ISO-10`). This is the
   golden rule — a cross-org leak is catastrophic for a SaaS.
2. **The database is the source of truth.** Vapi and Google Calendar are mirrors.
3. **Tenant identity is server-trusted, never AI-decided** — it arrives in voice tool calls as the
   Vapi `organization_id` **static parameter**, cross-checked against mirrored `vapiAssistantId`/
   `vapiPhoneNumber`. Vapi webhooks are NOT JWT-authed.
4. **All booking logic lives in one module** (`src/server/features/bookings/booking.engine.ts`),
   shared by every channel; double-booking guarded inside a DB transaction.
5. **Business logic never imports a vendor SDK.** Features depend on a **port**; vendors live in
   **adapters** behind it. `@vapi-ai/server-sdk` may be imported **only** under
   `src/server/adapters/voice/vapi/`. (Acceptance includes a grep check for this.)
   - *Documented exception — the Vapi API Tester:* the super-admin `/vapi-tester` debug page does
     **not** go through the `VoiceProvider` port (the port bundles multi-call workflows; the tester
     needs raw 1:1 read-only endpoint access). It uses `src/server/adapters/voice/vapi/vapi.tester.ts`,
     a Vapi-specific module that lives *inside* the adapter folder and imports `getVapiClient` from
     `vapi.client` — so the SDK stays isolated and the grep check still passes. Read-only ops only;
     never logs the key. If you add a second voice provider, this tester stays Vapi-only by design.
6. **Mirror every Vapi identifier in our DB** (`vapiId`/`vapiOrgId`/`provider`/`syncStatus`/
   `lastSyncedAt`/`syncError`, plus per-entity ids). Our DB stays canonical; Vapi ids are join keys.
7. **Frontend and backend talk only through the typed contract** in `src/contracts/` (Zod schemas +
   inferred types). Client components never import `src/server/**`.
8. **Features are self-contained slices** — reach another feature via its service or the event bus,
   never by querying its tables directly.
9. **Every task ships with its tests.** A task isn't done until its `04-TEST-CASES.md` rows are
   green. Write tests alongside the code, not at the end.

## Architecture / layout (single Next.js app)

```
app/                     # App Router: (auth)/login, (admin)/* pages, and api/** route handlers
  api/.../route.ts       # = the backend; thin, validate with src/contracts, call src/server/features
src/
  contracts/             # Zod request/response schemas + types = the FE<->BE seam
  domain/                # shared enums/types (Role, BookingStatus, Source, SyncStatus…)
  features/              # CLIENT feature slices (components, hooks, queries)
  shared/ui/             # design-system components — consume theme CSS variables, never hardcoded hex
  theme/                 # ThemeProvider, defaultTheme, tokens.css
  server/                # BACKEND — never imported by client components
    config/{env,providers}   # Zod-validated env; binds ports -> adapters
    platform/{db,http,auth,tenant,events,logging}
    features/            # auth, organizations, staff, services, schedules, customers,
                         #   bookings, calls, knowledge, theme, receptionist-tools, platform-settings
    ports/               # voice-provider.port.ts (+ payments/messaging/calendar stubs)
    adapters/voice/vapi/ # ONLY place that imports the Vapi SDK
    channels/            # voice webhook handlers wired into app/api/webhook/voice/*
prisma/schema.prisma
test/                    # vitest setup, test-db helpers, fake VoiceProvider, fixtures
```

## Multi-tenancy

- **org_admin / org_staff:** active org = their own `organizationId` from the JWT. Any other org id
  → 403.
- **super_admin:** active org comes from the `X-Org-Id` request header (set by the client org
  switcher). No header → platform (all-orgs) view. The switcher shows an "acting as {org}" banner.

## Environment / setup notes

- Secrets Claude generates: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `CREDENTIAL_ENCRYPTION_KEY` (32-byte base64, AES-256-GCM for per-customer Vapi keys at rest).
- User provides: `DATABASE_URL` (dev), a test DB (`DATABASE_URL_TEST` or an isolated schema),
  `VAPI_API_KEY` (Vapi **private** key — public keys won't work server-side), and a public webhook
  URL (`PUBLIC_API_BASE_URL`) via tunnel or deploy for live Vapi.
- Per-customer Vapi private keys are stored **encrypted**; only last-4 is ever returned to the
  browser. The plaintext key never appears in any API response shape in `src/contracts/`.
- Node is currently **v25** (very new) — if a tool misbehaves, flag it; we may pin an LTS.

## Working agreement

- Build **Phase 1 only**, one milestone at a time (M1.0 → M1.9), pausing to report at each boundary.
- Tests are **mocked at the `VoiceProvider` port** — no real Vapi calls in the test suite.
- After each task, run its "Done when" check (doc 03) before moving on.
- Keep this file updated when a lasting architectural decision is made.

## Build status (Phase 1 — all milestones coded)

All Phase 1 code is written and passing static gates: `npm run typecheck`, `npm run lint`
(0 errors), `npm test` (**70 unit tests green**), and `npm run build` all pass. The **24
integration tests** (`npm run test:integration`) are written and **skip until a test DB is
configured** — they run the SaaS-critical isolation, booking/double-book, webhook,
provisioning, credential, theme, and knowledge suites against real Postgres with the fake
voice provider.

**Pending = anything that needs live credentials** (the user provides these later, then we
verify): run DB migrations + seed, run the integration suite, and a live Vapi call test.

## How to run it (once `.env.local` has DATABASE_URL etc.)

```
npm install
npx prisma db push          # or: npx prisma migrate dev --name init
npm run db:seed             # super-admin + 2 demo orgs (see prisma/seed.ts output)
npm run dev                 # http://localhost:3000  — log in as superadmin@example.com / Password123!
# Tests:
npm test                    # unit
DATABASE_URL_TEST=... npm run test:integration   # integration (real Postgres)
```

- Demo logins after seed: super-admin `superadmin@example.com`; org admins
  `admin@brightsmile.example.com` / `admin@sharpcuts.example.com`; all password `Password123!`.
- Live Vapi: set `VAPI_API_KEY` + a public `PUBLIC_API_BASE_URL` (tunnel/deploy), set
  `VOICE_PROVIDER=vapi`, then provision an org from its Vapi settings page. Tests always use the
  fake provider regardless.
- CI: `.github/workflows/ci.yml` spins up Postgres and runs typecheck + lint + unit (coverage) +
  integration + build on every push/PR.

# Claude Code Build Plan — AI Receptionist SaaS

**Document 3 of 4** · Companion to: Product Research (01), Scope (02), Test Cases (04)
**Stack:** React (frontend) + Node.js (backend) + PostgreSQL
**Scope source:** Scope Document v3.0 (02-SCOPE.md) — multi-tenant inbound receptionist, Vapi Mode A
**This plan covers:** Phase 1 (full build) with the codebase structured so Phases 2–6 slot in without rework. Phase 1 includes: multi-tenant org isolation with a super-admin org switcher, a swappable voice-provider layer (Vapi behind a port), per-customer and platform-wide Vapi settings pages, and a theme/branding config page to recolor the platform.

---

## How to use this plan

Hand this file to Claude Code. Work through it **task by task, top to bottom**. Each task is small enough to finish and verify before moving on. Don't skip ahead — later tasks assume earlier ones are done. After each task there's a short "Done when" check; only move on once it passes.

A few standing rules for the whole build:

1. **Every customer-data query is scoped by the organization id.** No exceptions. This is the golden rule of the whole app. (Naming: it's `organizationId` in Prisma/TS code and the DB, and `organization_id` as the Vapi static-parameter name — same value, two naming conventions because each system has its own.)
2. **The database is the source of truth.** Vapi and Google Calendar are mirrors.
3. **Tenant identity is server-trusted, never AI-decided** — it rides in tool calls as a Vapi static parameter.
4. **All booking logic lives in one module**, shared by every channel.
5. **Every channel enters through its own adapter**, then hits the same tools and same DB.
6. **Mirror every Vapi identifier in our DB.** Any entity that also lives in Vapi (org/assistant/phone number/tool/knowledge-base file/call) stores its Vapi id (and `orgId`, timestamps, provider ids where relevant) locally. Our DB stays the source of truth; Vapi ids are the join keys for every read-back, update, re-provision, or future migration to Retell. Never rely on Vapi as the only place an id exists.
7. **Business logic never imports a vendor SDK.** Features depend on a **port** (interface); each vendor (Vapi, Stripe, Twilio, Google) is an **adapter** behind that port. Swapping or adding a provider = one new adapter, no feature changes.
8. **Frontend and backend communicate only over HTTP via `packages/contracts`.** The web app never imports backend source. This boundary is what makes a future repo-split or microservice-split mechanical.
9. **Features are self-contained slices.** A feature reaches another feature through its service interface or the event bus — never by querying another feature's tables directly.
10. **Every task ships with its tests.** A task isn't "done" until its unit tests (and, where it touches routes/DB, its integration tests) pass. The test cases to write are enumerated per-task here and in the companion `04-TEST-CASES.md` document — build them as you go, not at the end.

---

## Tech choices (locked for this plan)

| Concern | Choice | Why |
|---|---|---|
| Frontend | **React + Vite + TypeScript** | Fast, standard, no framework lock-in |
| UI styling | **Tailwind CSS + CSS variables** | The theme config page rewrites CSS variables live |
| Routing | **React Router** | Standard SPA routing |
| Data fetching | **TanStack Query (React Query)** | Caching + server state |
| Backend | **Node.js + Express + TypeScript** | Simple, well-documented, matches Vapi webhook examples |
| ORM | **Prisma** | Type-safe, easy migrations, enforces the schema |
| Database | **PostgreSQL** | Single source of truth (Scope §3) |
| Auth | **JWT (access + refresh) with bcrypt password hashing** | Role-based, no third-party dependency for Phase 1 |
| Validation | **Zod** | Validate every tool payload and API body |
| Vapi calls | **`@vapi-ai/server-sdk` (official Vapi Server SDK for TypeScript), server-side only, key in env** | Official, typed, auto-retries; customers never see Vapi |
| Background jobs | **node-cron** (Phase 3 reminders) | Simple scheduler; swap for a queue later |
| Unit tests | **Vitest** | Fast, TS-native, same config style as Vite; mirrors the Vapi SDK's own test setup |
| Integration tests (API) | **Vitest + Supertest** against a **real Postgres** (Testcontainers or a disposable Docker DB) | Exercises routes + DB + tenant scoping for real, not mocks |
| Frontend component tests | **Vitest + React Testing Library** | Renders feature components, asserts behavior |
| End-to-end (optional, Phase 1.9) | **Playwright** | Drives login → switch org → book → see booking in the browser |
| Vapi in tests | **mocked at the port** (`VoiceProvider`) | The port abstraction means tests inject a fake voice provider — no real Vapi calls |

> Note: an earlier version of the scope floated Next.js as one option. This plan (and the current Scope v3.0) uses **React + Node.js (Express)** as you asked. The architecture (adapters, tools, multi-tenancy) is identical — only the framework wrapper differs.

### Vapi SDK

Use the **official Vapi Server SDK for TypeScript** for all backend Vapi work (provisioning assistants, phone numbers, knowledge bases, tools):

```
npm i @vapi-ai/server-sdk
```

- Package: `@vapi-ai/server-sdk` — runs on Node.js 18+.
- Instantiate once with the server-side key: `new VapiClient({ token: process.env.VAPI_API_KEY })`.
- All request/response types are exported under the `Vapi` namespace for type-safe provisioning and webhook handling.
- Errors throw `VapiError` (`statusCode`, `message`, `body`); the SDK also does automatic retries with exponential backoff and a 60s default timeout.
- **Do not** add the client/real-time Web SDK in Phase 1 — this project is Vapi **Mode A** (Vapi runs the call; we only provision and serve tools). The Web SDK only becomes relevant if you later add an in-browser test-call widget to the admin panel.
- **Caveat:** the SDK wraps Vapi's REST API but does **not** define the inbound webhook payload shapes your tool endpoints must echo (the `toolCallId` nesting, Research §3.6). For the voice webhooks (`/webhook/voice/tools` and `/webhook/voice/call-ended`, see Tasks 1.5.3/1.5.4), still match field-for-field against Vapi's current Custom Tools and Server Events docs; the `Vapi.*` types help but verify against live docs.

---

## Architecture principles (read before the structure)

You want three things, and the structure below is built to deliver all three from day one without over-engineering Phase 1:

1. **Feature-sliced, not layer-sliced.** Code is grouped by *business capability* (bookings, organizations, calls, knowledge, theme, voice-provisioning), and each feature owns its routes, services, data access, validation, and types. You can understand, test, or extract one feature without touching the others. Adding a feature = adding a folder, not editing ten shared files.

2. **Frontend and backend are already separate apps with a contract between them — never a shared runtime.** They live in one repo for now (a monorepo) but communicate *only* over HTTP through a typed API contract in `packages/contracts`. The frontend never imports backend code. That means "split them into two repos later" is a `git move` + change one base URL, not a rewrite. Same for "split a feature into its own microservice."

3. **The voice/telephony provider sits behind an interface (a port).** Nothing in your features calls Vapi directly. They call a `VoiceProvider` interface; Vapi is one implementation behind it. Swapping in Retell (or running both) means writing one new adapter class and changing one line of config — no feature code changes. This is the [hexagonal / ports-and-adapters](#) idea applied narrowly where you need it. (See **Appendix A** for the full menu of providers that could sit behind this port.)

A rule of thumb that keeps it scalable: **features depend on interfaces (ports); concrete vendors (Vapi, Stripe, Twilio, Google) live in adapters behind those ports.** Business logic never imports a vendor SDK directly.

---

## Repository shape

A monorepo with **independent apps** and **shared contract packages**. Each app can be deployed, scaled, and later extracted on its own. Each backend feature is a self-contained slice that could become its own service.

```
ai-receptionist/
├── apps/
│   ├── api/                          # Node.js + Express backend (deployable on its own)
│   │   ├── src/
│   │   │   ├── main.ts                       # composition root: wires features + adapters, starts server
│   │   │   ├── app.ts                        # express app (middleware, mounts each feature's router)
│   │   │   ├── config/
│   │   │   │   ├── env.ts                    # validated env (Zod)
│   │   │   │   └── providers.ts              # picks which adapter implements each port (voice=vapi, etc.)
│   │   │   ├── platform/                     # cross-cutting infra, NOT business logic
│   │   │   │   ├── db/                        # Prisma client + base repository helpers
│   │   │   │   ├── http/                      # error handling, request context, response helpers
│   │   │   │   ├── auth/                      # JWT verify, role guards
│   │   │   │   ├── tenant/                    # resolves & enforces organization_id (multi-tenant guard)
│   │   │   │   ├── events/                    # in-process event bus (see note) — swap for a queue later
│   │   │   │   └── logging/
│   │   │   ├── features/                      # ← FEATURE SLICES (the heart of the app)
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.repository.ts
│   │   │   │   │   └── auth.schema.ts         # Zod request/response
│   │   │   │   ├── organizations/            # CRUD + onboarding orchestration
│   │   │   │   ├── staff/
│   │   │   │   ├── services/
│   │   │   │   ├── schedules/
│   │   │   │   ├── customers/
│   │   │   │   ├── bookings/                 # owns booking.engine.ts (the single booking brain)
│   │   │   │   │   ├── booking.routes.ts
│   │   │   │   │   ├── booking.service.ts
│   │   │   │   │   ├── booking.engine.ts     # auto-assign + transaction-level no-double-book
│   │   │   │   │   ├── booking.repository.ts
│   │   │   │   │   └── booking.schema.ts
│   │   │   │   ├── calls/                    # call records, transcripts
│   │   │   │   ├── knowledge/                # documents (master) + KB file mirroring
│   │   │   │   ├── theme/                    # branding/colour config API
│   │   │   │   └── receptionist-tools/       # the 3 tools the voice provider calls
│   │   │   │       ├── tools.service.ts      # checkAvailability / bookAppointment / lookupCustomer
│   │   │   │       └── tools.schema.ts       # channel-agnostic tool I/O contract
│   │   │   ├── ports/                        # ← INTERFACES (no vendor code here)
│   │   │   │   ├── voice-provider.port.ts    # VoiceProvider interface (provision, webhooks shape)
│   │   │   │   ├── payments.port.ts          # (Phase 4)
│   │   │   │   ├── messaging.port.ts         # SMS/WhatsApp (Phase 2/3)
│   │   │   │   └── calendar.port.ts          # (Phase 1 optional / Phase 6)
│   │   │   ├── adapters/                     # ← VENDOR IMPLEMENTATIONS (behind the ports)
│   │   │   │   ├── voice/
│   │   │   │   │   ├── vapi/                 # implements VoiceProvider with @vapi-ai/server-sdk
│   │   │   │   │   │   ├── vapi.provider.ts
│   │   │   │   │   │   ├── vapi.client.ts    # thin SDK wrapper, key server-side only
│   │   │   │   │   │   ├── vapi.mapper.ts    # Vapi payloads ⇄ our domain types
│   │   │   │   │   │   └── vapi.webhooks.ts  # /webhook/voice/tools + /webhook/voice/call-ended
│   │   │   │   │   └── retell/               # (Phase 6) implements the SAME VoiceProvider port
│   │   │   │   ├── messaging/                # twilio / meta (Phase 2/3)
│   │   │   │   ├── payments/                 # stripe (Phase 4)
│   │   │   │   └── calendar/                 # google (Phase 1 optional)
│   │   │   └── channels/                     # inbound entrypoints per channel → map to receptionist-tools
│   │   │       ├── voice.webhook.routes.ts   # mounts the active voice adapter's webhook handlers
│   │   │       └── whatsapp.webhook.routes.ts# (Phase 2)
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── package.json                       # api has its OWN package.json (independent deploy)
│   │
│   └── web/                          # React + Vite frontend (deployable on its own)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/                          # app shell, router, providers
│       │   ├── theme/                        # ThemeProvider, defaultTheme, tokens.css
│       │   ├── shared/                        # design-system components, api client, hooks
│       │   │   ├── api/                       # typed client generated from packages/contracts
│       │   │   └── ui/                        # Button, Card, Table…
│       │   └── features/                      # ← FEATURE SLICES (mirror the backend)
│       │       ├── auth/
│       │       ├── organizations/             # super-admin views
│       │       ├── bookings/
│       │       ├── calendar/
│       │       ├── calls/
│       │       ├── staff/
│       │       ├── services/
│       │       ├── schedules/
│       │       ├── customers/
│       │       ├── knowledge/
│       │       ├── theme-config/              # the colour config page
│       │       └── help/                      # "how to use this app" guide (Markdown-driven)
│       ├── Dockerfile
│       └── package.json                       # web has its OWN package.json (independent deploy)
│
├── packages/                         # shared, versioned, framework-agnostic
│   ├── contracts/                    # ← THE FRONTEND↔BACKEND CONTRACT
│   │   └── src/                       # Zod schemas + inferred TS types for every API request/response
│   ├── domain/                       # shared enums + domain types (BookingStatus, Role, Source…)
│   ├── test-utils/                   # fake VoiceProvider, DB test helpers, fixtures (used by both apps)
│   └── config/                       # shared tsconfig, eslint, prettier
│
├── docker-compose.yml                # local Postgres (+ later: api, web, queue)
├── package.json                      # workspace root (pnpm/npm workspaces) — orchestration only
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

### Why this is "split-ready" and microservice-ready

- **api and web each have their own `package.json` and `Dockerfile`** and never import each other's source. They already talk over HTTP only. Moving `web` to its own repo = copy the folder + `packages/contracts` + point it at the API URL. Nothing else changes.
- **`packages/contracts` is the seam.** Both sides depend on the same typed request/response schemas, so the boundary is enforced by the compiler. When you split repos, publish `contracts` as a small private package (or copy it) — the contract stays identical.
- **Each backend feature is a slice with its own routes/service/repository.** A feature talks to other features through their service interfaces or the event bus, never by reaching into another feature's tables directly. To extract (say) `knowledge` into its own service later: give it its own deploy, replace its in-process service calls with HTTP/queue calls, and keep the same interface. The blast radius is one folder.
- **`platform/events` is an in-process event bus now** (e.g. "BookingCreated" → schedule reminder). It's a single small abstraction. When you go multi-service, swap its implementation for a real queue (SQS/Rabbit/Redis) — publishers and subscribers don't change. This is the cheapest insurance for future microservices.
- **`ports/` + `adapters/` keep every vendor swappable** (voice, payments, messaging, calendar), not just Vapi.

> Phase 1 still runs as **one process** (`apps/api`) and **one frontend** (`apps/web`). You are not building microservices now — you are making sure the *boundaries already exist* so splitting later is mechanical, not a rewrite.

---

## Environment variables (`.env.example`)

```
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_receptionist

# Auth
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# Vapi (server-side only — never expose to the browser)
VAPI_API_KEY=                 # platform-wide Vapi PRIVATE key (the default for all customers)
VAPI_BASE_URL=https://api.vapi.ai
PUBLIC_API_BASE_URL=https://your-deployed-api.example.com   # Vapi calls this for tools/webhooks

# Secrets-at-rest (encrypts any per-customer Vapi private keys stored in the DB)
CREDENTIAL_ENCRYPTION_KEY=    # 32-byte key (base64) for AES-256-GCM; rotate carefully

# App
PORT=4000
WEB_ORIGIN=http://localhost:5173
```

> Host the API near **us-west-2** (Vapi's region) for call latency — see Research §3.7.

---

# PHASE 1 — Build tasks

## Milestone 1.0 — Project scaffolding

**Task 1.0.1 — Monorepo + independent apps**
Set up pnpm (or npm) workspaces with the shape above. `apps/api` and `apps/web` each get their **own `package.json` and `Dockerfile`** (independently buildable/deployable). Create `packages/contracts`, `packages/domain`, `packages/config` (shared tsconfig/eslint/prettier). Root `package.json` only orchestrates (build/dev/test across workspaces). Add `docker-compose.yml` with Postgres and `.env.example`.
*Done when:* `pnpm -r build` builds every workspace; `apps/api` and `apps/web` each build in isolation; the web app has no import path into `apps/api`.

**Task 1.0.2 — Contracts package (the FE↔BE seam)**
In `packages/contracts`, set up Zod schemas + inferred TS types for the first endpoints (start with auth + health). Export both the schemas (for runtime validation on the API) and the types (for the typed web client). Establish the convention: **every endpoint's request/response is defined here first**, then implemented on the API and consumed by the web client.
*Done when:* both apps import shared request/response types from `@app/contracts` and a type change in contracts breaks compilation on both sides (proving the seam).

**Task 1.0.3 — Backend skeleton (composition root + platform)**
`apps/api` with `main.ts` (composition root — wires features and adapters, then starts the server), `app.ts` (Express app, mounts feature routers), `config/env.ts` (Zod-validated), `config/providers.ts` (selects which adapter implements each port), and `platform/` cross-cutting infra (db, http/error-handling, request context, logging). Add `GET /health`, CORS limited to `WEB_ORIGIN`, JSON parsing, centralized errors.
*Done when:* `GET /health` returns `{ ok: true }` and the server starts from `main.ts` with adapters chosen in `config/providers.ts`.

**Task 1.0.4 — Define the ports (interfaces) up front**
Create `ports/voice-provider.port.ts` (the `VoiceProvider` interface — see Task 1.4.2) and empty stubs for `payments.port.ts`, `messaging.port.ts`, `calendar.port.ts`. No vendor code here. These exist now so features are written against interfaces from the first line.
*Done when:* the `VoiceProvider` interface compiles and is referenced by `config/providers.ts` (even before an implementation exists).

**Task 1.0.5 — Frontend skeleton**
`apps/web`: Vite + React + TS + Tailwind + React Router + React Query. Set up `shared/api` as a typed client built on `@app/contracts`, `app/` shell + router, and an empty `features/` tree. Blank shell rendering "Login" and "App" placeholder routes.
*Done when:* the frontend boots, routes render, and the api client's types come from `@app/contracts`.

---

## Milestone 1.1 — Database schema & multi-tenancy foundation

**Task 1.1.1 — Prisma schema (all Phase 1 tables, Vapi-mirrored)**
Translate Scope §5 (data model) into `schema.prisma`. Every customer-data model gets `organizationId`. Include: `Organization`, `OrgVapiConfig`, `OrgTheme` (new — see below), `User`, `Staff`, `Service`, `StaffSchedule`, `StaffTimeOff`, `Customer`, `Booking`, `Call`, `CallMessage`, `Reminder`, `Document`, plus `VapiTool` and `KnowledgeBaseFile` (new — see mirroring map). Define enums for roles, booking status, source, etc.

**Vapi identifier mirroring (required).** Any entity that also exists in Vapi must store its Vapi identifiers locally so our DB can talk to Vapi for that entity at any time. Standard mirror columns to add wherever the entity has a Vapi counterpart:

- `vapiId` — the object's own `id` in Vapi (assistant id, phone number id, tool id, file id, call id).
- `vapiOrgId` — Vapi's `orgId` (Vapi's own tenant id; not our `organizationId`). Store it once per org and on synced objects so we can detect mismatches.
- `provider` — `"vapi"` now, `"retell"` later. Lets the same row survive a platform swap.
- `syncStatus` — `pending | synced | failed | stale`, plus `lastSyncedAt` and `syncError`. Makes provisioning failures (Research §8) visible and retryable.
- `vapiRaw` (Json, nullable) — the last raw object we got back from Vapi, for debugging/reconciliation. Optional but recommended.

Per-entity mirror map:

| Our model | Vapi object | Vapi ids to store locally |
|---|---|---|
| `Organization` | (our tenant) | — (our id is canonical) |
| `OrgVapiConfig` | assistant + phone number + KB | `vapiAssistantId`, `vapiPhoneNumberId`, `vapiPhoneNumber` (E.164), `vapiKnowledgeBaseId`, `vapiOrgId`, `provider`, `syncStatus`, `lastSyncedAt`, `syncError` |
| `VapiTool` (new) | each custom tool | `vapiToolId`, `name` (`check_availability`/`book_appointment`/`lookup_customer`), `serverUrl`, `staticParams` (Json — includes our `organization_id`), `provider`, `syncStatus` |
| `KnowledgeBaseFile` (new, child of `Document`) | uploaded KB file | `documentId` → `Document`, `vapiFileId`, `vapiKnowledgeBaseId`, `sizeBytes`, `syncStatus`, `lastSyncedAt` |
| `Call` | call object | `vapiCallId`, `vapiOrgId`, `vapiAssistantId`, `vapiPhoneNumberId`, `phoneCallProvider`, `phoneCallProviderId`, `endedReason`, `cost`, `costBreakdown` (Json), `recordingUrl`, `direction` (inbound/outbound — `inbound` in Phase 1), plus our own fields |
| `CallMessage` | call `messages[]` turn | no Vapi id per turn; store `role`, `text`, `secondsFromStart`/`time` to preserve ordering |
| `Booking` | (ours; not a Vapi object) | keep `google_calendar_event_id` for the calendar mirror (same discipline, different platform) |
| `Customer` | (ours) | — |

Keep `Document` as the master copy (source of truth) and put the Vapi-specific file id in the child `KnowledgeBaseFile` so one master document can map to its Vapi working copy (and later to a Phase-5 RAG copy) without overloading one row.

Notes:
- Index `vapiCallId`, `OrgVapiConfig.vapiAssistantId`, and `OrgVapiConfig.vapiPhoneNumber` (unique) — these are the lookup keys when a webhook arrives and we must resolve which org/call it belongs to.
- On the inbound webhook path, resolve our org from the **static parameter** `organization_id` first (server-trusted, Research §3.4); use the mirrored `vapiAssistantId`/`vapiPhoneNumber` only as a secondary cross-check, never as the trust boundary.

Add this new model for the theme config page:

```prisma
model OrgTheme {
  id             String   @id @default(cuid())
  organizationId String   @unique
  organization   Organization @relation(fields: [organizationId], references: [id])
  // null = platform default. Stores overrides only.
  tokens         Json     // { accent, accentSoftLight, accentSoftDark, bg, card, text, ... } per mode
  defaultMode    String   @default("light")   // "light" | "dark"
  allowUserToggle Boolean @default(true)
  updatedAt      DateTime @updatedAt
}
```

Illustrative shape for the Vapi-mirrored config (refine field names against the SDK's `Vapi.*` types at build time):

```prisma
model OrgVapiConfig {
  id                  String   @id @default(cuid())
  organizationId      String   @unique
  organization        Organization @relation(fields: [organizationId], references: [id])

  provider            String   @default("vapi")     // "vapi" | "retell"
  vapiOrgId           String?                        // Vapi's own orgId
  vapiAssistantId     String?
  vapiPhoneNumberId   String?
  vapiPhoneNumber     String?  @unique               // E.164
  vapiKnowledgeBaseId String?

  greeting            String?
  prompt              String?
  voice               String?
  llmModel            String?

  // Optional per-customer Vapi credential override.
  // Normally NULL → the platform-wide key (env / PlatformVoiceConfig) is used.
  // Set only if this customer runs on its own Vapi org/account (see Task 1.4.8).
  // Store ENCRYPTED at rest; never return the plaintext to the browser.
  vapiPrivateKeyEnc   String?                        // encrypted; nullable
  vapiKeyLast4        String?                        // for display only ("…aB3c")

  syncStatus          String   @default("pending")   // pending|synced|failed|stale
  lastSyncedAt        DateTime?
  syncError           String?
  vapiRaw             Json?

  updatedAt           DateTime @updatedAt
}
```

**Platform-level voice settings** — add a single-row `PlatformVoiceConfig` (or reserved-id row) for the defaults that apply to every customer unless overridden: the platform Vapi **private key** (encrypted; normally injected via env, mirrored here only if you want it editable from the UI), default `voice`, default `llmModel`, default greeting/prompt templates, and `PUBLIC_API_BASE_URL` for webhooks. The per-customer `OrgVapiConfig` overrides any of these.

Also add a **platform-level theme** (for the super-admin's global default) — store it as a single row keyed by a reserved id, or a separate `PlatformTheme` table.

*Done when:* `prisma migrate dev` creates all tables with `organizationId` on every customer-data table, and every Vapi-backed model carries its `vapi*` id columns + `syncStatus`.

**Task 1.1.2 — Tenant scoping + super-admin org switching**
Build a `platform/tenant` guard that resolves the **active organization** for every request and a DB helper so any customer-data query *must* receive an org id (a wrapper that throws if a customer-data query runs unscoped).

How the active org is resolved, by role:
- **org_admin / org_staff:** active org = their own `organizationId` from the JWT. They can never act on another org. Any attempt to pass a different org id is rejected (403).
- **super_admin (you):** active org comes from an explicit, per-request signal — an `X-Org-Id` header (or `?orgId=`) set by the admin UI's org switcher. The super-admin's JWT carries no fixed org, so this is how you "switch into" a customer. If no org is selected, super-admin sees the platform-wide (all-orgs) view; once selected, every read/write is scoped to that org exactly as the customer would see it.

> **Two different "organizations" — don't conflate them.** *Our* organization (this table) is the customer/tenant on **our** platform, fully under our control, and is what the switcher moves between. **Vapi also has its own org concept** (a separate Vapi workspace with its own keys/usage). Per Research §3.8 we use **one Vapi account with one assistant + phone number per customer** and isolate customers in **our** DB — we do **not** create a Vapi org per customer in Phase 1. The optional "one Vapi org per customer" strategy (useful only if you later want per-client Vapi billing/keys) is captured as a future toggle in Task 1.4.8 and costs nothing now because everything already goes through the `VoiceProvider` port.

*Done when:* a query without an org id throws in dev; an org user is locked to their own org; a super-admin can set the active org per request and see exactly that org's data, or no org for the platform view.

**Task 1.1.3 — Seed script**
Seed one super-admin user **plus two demo organizations** (so switching is testable from day one), each with demo staff/services/schedules and its own org_admin user.
*Done when:* `npm run seed` creates a super-admin and two isolated demo orgs; logging in as super-admin and switching between the two shows different, non-overlapping data.

---

## Milestone 1.2 — Authentication & roles

**Task 1.2.1 — Auth backend**
`POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`. bcrypt password check, JWT access + refresh. Roles: `super_admin`, `org_admin`, `org_staff`. A `requireRole()` guard and a `requireOrgAccess()` guard.
*Done when:* login returns tokens; protected routes reject the wrong role.

**Task 1.2.2 — Auth frontend + org switcher**
Login page, auth context, token storage (in memory + refresh), an `api.ts` fetch wrapper that attaches the token and auto-refreshes. Route guards: super-admin routes vs org routes.

Add an **active-org context** on the frontend: the `api.ts` client automatically sends the selected `X-Org-Id` on every request when a super-admin has an org selected. Persist the selection in app state (not localStorage — re-derive on load) so a refresh keeps you in the same org until you switch or clear it.

Add an **org switcher control** in the top bar, visible only to super-admins: a searchable dropdown of all organizations plus an "All organizations (platform view)" option. Selecting one sets the active org; the rest of the app instantly re-queries scoped to it. A clear visual indicator (e.g. a colored banner with the org name) shows which org you're currently acting as, so you never edit the wrong customer by accident. Org users don't see the switcher at all — they're locked to their own org.

*Done when:* logging in lands a super-admin on the all-orgs view and an org user on their org dashboard; the super-admin can pick any org from the switcher and the whole UI rescopes to it with a clear "acting as {org}" indicator; the wrong role can't reach a page or switch orgs.

---

## Milestone 1.3 — Theme / colour config (your requested feature)

This is built early because every screen after it should already consume theme variables.

**Task 1.3.1 — Theme tokens & defaults**
Create `defaultTheme.ts` from your colour guide (values below). Declare CSS variables in `tokens.css`. Build `ThemeProvider` that:
- reads the active theme (platform default → org override → user toggle),
- writes the values onto `:root` as CSS variables,
- toggles `data-theme="light|dark"` on `<html>`.

All components use the variables (`var(--accent)`, `var(--bg)`, etc.) — never hardcoded hex.

Default tokens (from your guide):

```css
:root {
  /* Brand (shared) */
  --accent: #6366F1;
  --accent-soft: #4F46E5;   /* dark mode overrides to #A5B4FC */
  --on-accent: #FFFFFF;
  --positive: #28C840;

  /* Light theme */
  --bg: #F4F6FB;
  --card: #FFFFFF;
  --text: #0F1422;
  --ink2: #4D526A;
  --muted: #48516A;
  --muted2: #5A6378;
  --muted3: #6B7584;
  --faint: #7D8699;
  --faint2: #8F98A8;
  --faint3: #A1AAB8;
  --border: rgba(30,41,59,0.06);
}

[data-theme="dark"] {
  --accent-soft: #A5B4FC;
  --bg: #0B0D14;
  --card: #14161F;
  --text: #EEF1F8;
  --ink2: #CDD3E0;
  --muted: #9AA0B2;
  --muted2: #B6BCCB;
  --muted3: #898F9F;
  --faint: #797F90;
  --faint2: #6E7385;
  --faint3: #5B6072;
  --border: rgba(255,255,255,0.06);
}
```

Fonts: **Space Grotesk** (headings + body), **Sora** (secondary display), **JetBrains Mono** (code). Load via Google Fonts or self-host; set as CSS variables too (`--font-body`, `--font-display`, `--font-mono`).

*Done when:* flipping `data-theme` recolors the whole app from CSS variables, with no hardcoded colors anywhere.

**Task 1.3.2 — Theme config API**
`GET /theme` (resolved theme for the active org), `PUT /theme` (save the active org's overrides — allowed for an org_admin on their own org, or a super-admin acting inside that org via the switcher), and a super-admin-only `PUT /platform-theme` (global default). Validate every color with Zod (hex or rgba). Store overrides only; unset values fall back to the platform default.
*Done when:* saving a color persists and re-resolves correctly on reload.

**Task 1.3.3 — Theme config page UI** (`features/theme-config/`)
A settings page for recoloring the UI. An **org admin** recolors their *own organization's* instance (saved as an org override); the **super-admin** can additionally set the platform-wide default that every org inherits. The page offers:
- color pickers for every token (accent, backgrounds, surfaces, text levels, borders, positive),
- separate light/dark columns,
- a default-mode selector and "allow users to toggle" switch,
- **live preview** (changes apply instantly via `ThemeProvider`),
- "Reset to platform default" and "Save",
- super-admin gets an extra tab to edit the **platform-wide** default that all orgs inherit.

Make it impossible to save an unreadable combo by showing a contrast warning (accent vs on-accent, text vs bg) — non-blocking, just a heads-up.

*Done when:* an org admin changes the accent and their whole org view (buttons, links, highlights) recolors live and persists; a super-admin can change the platform default and new/un-overridden orgs inherit it.

---

## Milestone 1.4 — Organizations, voice provisioning & Vapi settings page (provider-abstracted)

**Task 1.4.1 — Organizations CRUD (super-admin)**
`GET/POST/PATCH /organizations` (in `features/organizations`). Create org → also create its default `OrgTheme`, an empty `OrgVapiConfig`, and an `org_admin` user (invite/temp password).
*Done when:* super-admin can create and list orgs; a new org appears with a default theme.

**Task 1.4.2 — Define the `VoiceProvider` port** (`ports/voice-provider.port.ts`)
Write the interface every voice vendor must satisfy, in **our** domain terms (no Vapi/Retell words in the signatures). At minimum:
- `provisionOrg(input): Promise<ProvisionResult>` — create assistant, number, KB, tools; returns provider ids in a neutral shape (`assistantId`, `phoneNumber`, `phoneNumberId`, `knowledgeBaseId`, `toolIds`, `providerOrgId`).
- `updateAssistant`, `deleteOrg`, `uploadKnowledgeFile`, `deleteKnowledgeFile`.
- `parseInboundToolCall(req): NormalizedToolCall` and `formatToolResponse(toolCallId, result)` — so webhook shape stays vendor-specific but the tool logic is neutral.
- `parseCallEnded(req): NormalizedCallRecord`.
The `features/organizations` onboarding code depends **only** on this interface. `config/providers.ts` binds it to the Vapi adapter for now.

> **Forward-compat note (outbound calling).** Phase 1 is inbound-only, but design the port so outbound is a *future method on this same interface*, not a redesign. Reserve a `startOutboundCall(input): Promise<NormalizedCallRecord>` shape in a comment (don't implement it). Vapi, Retell, and Bland all support outbound, so it's another method on this port, not a new abstraction. The neutral `NormalizedCallRecord` already covers both directions via the `direction` field. This keeps "add an outbound module later" a pure addition. See the Outbound Calling note under *Later phases*.

*Done when:* the interface compiles and onboarding references `VoiceProvider`, not any Vapi type.

**Task 1.4.3 — Vapi adapter: client + mapper** (`adapters/voice/vapi/`)
Install `@vapi-ai/server-sdk`. `vapi.client.ts` is a thin wrapper around `VapiClient` (key from env, server-side only). `vapi.mapper.ts` converts between Vapi payloads and our neutral domain types. `vapi.provider.ts` implements the `VoiceProvider` port using the client + mapper. Handle `VapiError`; rely on the SDK's built-in retries (408/429/5xx) and add app-level handling only for non-retriable errors (bad config, quota, auth).
*Done when:* `VapiProvider` satisfies the `VoiceProvider` interface and each operation is a typed method; nothing outside `adapters/voice/vapi/` imports the Vapi SDK.

**Task 1.4.4 — Onboarding / provisioning flow** (`features/organizations`, calling the port)
On org creation (or a "Provision" button), call `voiceProvider.provisionOrg(...)` to:
1. create the org's **assistant** (greeting, prompt, voice, LLM, tools),
2. provision a **phone number**,
3. create the org's **knowledge base**,
4. configure the three custom tools to hit `PUBLIC_API_BASE_URL/webhook/voice/tools`, with `organization_id` baked in as a **static parameter** (Research §3.4 — the AI never sees it),
5. set the **end-of-call webhook** to `/webhook/voice/call-ended`,
6. **persist every returned Vapi identifier** into `OrgVapiConfig` (`vapiAssistantId`, `vapiPhoneNumberId`, `vapiPhoneNumber`, `vapiKnowledgeBaseId`, `vapiOrgId`) and one `VapiTool` row per tool (`vapiToolId`, `name`, `serverUrl`, `staticParams`). Set `syncStatus = "synced"` and `lastSyncedAt` on success; on any step failing, set `syncStatus = "failed"` + `syncError` and leave the partial ids you did get (so a retry is idempotent and can resume rather than duplicate).

Make provisioning **idempotent**: before creating, check for an existing `vapi*` id in our row and reuse/update it instead of creating a duplicate in Vapi. Add a "Re-sync" action that re-reads the objects from Vapi by their stored ids and refreshes `vapiRaw` + `syncStatus`.

Master copies of prompts/tool definitions live in our repo/DB; Vapi holds a copy (Research §3.3).

*Done when:* creating + provisioning an org yields a working assistant and phone number with tools wired to our endpoints and the correct org identity baked in, **and every Vapi id is stored locally with `syncStatus = "synced"`**; re-running provisioning does not create duplicates in Vapi.

**Task 1.4.5 — Per-customer Vapi settings page (your requested page)** (`features/organizations` + a settings route in the web app)
A super-admin settings page, opened from a customer's org, to **configure and inspect that customer's Vapi setup** in one place. It has two parts:

*Inputs you can set/edit:*
- **Assistant config:** greeting, system prompt, voice, LLM model. Saving calls `voiceProvider.updateAssistant(...)` through the port and refreshes `syncStatus`.
- **Phone number:** show the provisioned number; allow (re)provision if none yet.
- **Optional per-customer Vapi private key:** a masked field. If left blank, the customer uses the **platform key** (the normal case). If filled, it's stored **encrypted** (`vapiPrivateKeyEnc`), and only `vapiKeyLast4` is ever shown back — the plaintext is never returned to the browser. A "Test key" button calls a lightweight Vapi endpoint server-side to validate it before saving (catch the "private vs public key" mistake early — only the **private** key works for backend operations).
- **Webhook URLs (read-only):** show the tool + call-ended URLs this customer is wired to, so you can verify them against the Vapi dashboard.

*Read-only / status:*
- Mirrored identifiers (`vapiAssistantId`, `vapiPhoneNumberId`, `vapiKnowledgeBaseId`, `vapiOrgId`) and current `syncStatus` / `lastSyncedAt` / `syncError`, with the "Re-sync" and "Provision" actions.

Security: this page is **super-admin only**; org_admins never see Vapi keys or ids. All key handling is server-side; the API request/response in `packages/contracts` must never include the plaintext key in any response shape.

*Done when:* from one page a super-admin can edit a customer's greeting/prompt/voice/LLM (pushed to Vapi via the port), optionally enter and validate a per-customer private key (stored encrypted, shown only as last-4), and see that customer's live Vapi ids + sync status.

**Task 1.4.6 — Platform-wide voice settings page** (`features/platform-settings`, super-admin)
A separate settings page for the **defaults** that apply across all customers: the platform Vapi **private key** (encrypted; or a read-only indicator if you keep it in env), default voice, default LLM, default greeting/prompt templates new orgs inherit, and the `PUBLIC_API_BASE_URL` used for webhooks. Per-customer values from Task 1.4.5 override these.
*Done when:* changing a platform default changes what new orgs inherit, and a customer with its own override is unaffected; the platform key is never exposed to the browser in plaintext.

**Task 1.4.7 — Sync status surface + reconcile (light)**
In the super-admin org view, show each org's `syncStatus` (synced / pending / failed) with the `syncError` and a "Re-sync" button (re-reads the stored `vapi*` ids from Vapi and refreshes state). Add a small `reconcileOrg(orgId)` helper that, given our stored ids, verifies the assistant/number/tools/KB still exist in Vapi and flags `stale` if Vapi returns 404. (Full scheduled reconciliation is Phase 6; this is just the manual button + helper.)
*Done when:* a failed provision is visible with its error and can be retried from the panel without creating duplicates.

**Task 1.4.8 — (Design only, not built now) Vapi-org-per-customer strategy hook**
Document — don't implement — how a customer could later map to its *own Vapi organization* instead of sharing one Vapi account. The only reasons to do this are per-client Vapi billing, per-client API keys, or hard usage isolation at the Vapi level; for Phase 1 the per-customer assistant + number inside one Vapi account (Research §3.8) is simpler and sufficient. The pieces are already in place: the per-customer key field (`vapiPrivateKeyEnc`) from Task 1.4.5, the `providerOrgId` returned by `provisionOrg`, and `OrgVapiConfig.vapiOrgId` + `provider`. So switching a customer to its own Vapi org later means the Vapi adapter creates/selects a Vapi org during provisioning and uses that customer's stored key — no change to features, the switcher, or the schema.
*Done when:* a short note in the repo (e.g. `adapters/voice/vapi/README.md`) records this strategy and confirms the schema/port/key-field already accommodate it. No runtime change.

---

## Milestone 1.5 — Booking engine, receptionist tools & voice webhooks

**Task 1.5.1 — The booking engine** (`features/bookings/booking.engine.ts`)
The single source of booking truth, channel-agnostic, living inside the bookings feature. Functions:
- `getAvailability(orgId, serviceId, date)` — compute open slots from `staff_schedules` minus `staff_time_off` minus existing `bookings`, honoring service duration and org timezone.
- `autoAssignAndBook(orgId, {serviceId, startDatetime, customer})` — pick a free staff member and book.
- **Double-booking guard:** inside a single DB transaction, re-check the slot is still free immediately before insert; abort if taken (Scope §6 rule 4).
- On success, publish a `BookingCreated` event on `platform/events` (reminders subscribe to it in Phase 3 — wired now, no-op subscriber for now).
*Done when:* unit tests confirm correct slots and that two concurrent books on the same slot can't both succeed.

**Task 1.5.2 — Receptionist tools (channel-agnostic)** (`features/receptionist-tools/tools.service.ts`)
`checkAvailability`, `bookAppointment`, `lookupCustomer` — pure functions taking `(orgId, args)` and calling the bookings/customers feature services. **No vendor/Vapi specifics here.** I/O defined by `tools.schema.ts` (the neutral tool contract).
*Done when:* tools work when called directly with an org id, with zero references to any voice provider.

**Task 1.5.3 — Voice webhook (tool calls), via the port** (`adapters/voice/vapi/vapi.webhooks.ts` + `channels/voice.webhook.routes.ts`)
`POST /webhook/voice/tools` is mounted from the **active** voice adapter. The Vapi adapter uses `parseInboundToolCall` to read `organization_id` from the static parameters (server-trusted) and the `toolCallId` + function + arguments, dispatches to the neutral `receptionist-tools` service, then uses `formatToolResponse` to reply in Vapi's exact shape **echoing the same `toolCallId`** (Research §3.6). The vendor-specific JSON lives only in the adapter; the dispatch + tool logic is neutral. Validate with Zod.
*Done when:* simulated Vapi payloads for each tool return correctly-shaped responses scoped to the right org, and the dispatch code contains no Vapi field names (those are isolated in the adapter's mapper).

**Task 1.5.4 — Call-ended webhook, via the port** (`adapters/voice/vapi/vapi.webhooks.ts`)
`POST /webhook/voice/call-ended`: the adapter's `parseCallEnded` normalizes Vapi's report into a `NormalizedCallRecord`; the `calls` feature saves it (+ turn rows in `call_messages`), tagged to the org. **Store all Vapi call identifiers**: `vapiCallId` (unique-indexed), `vapiOrgId`, `vapiAssistantId`, `vapiPhoneNumberId`, `phoneCallProvider`, `phoneCallProviderId`, `endedReason`, `cost` + `costBreakdown` (Json), `recordingUrl`, `startedAt`/`endedAt`/duration, and `summary`. Link to a customer by phone if known. Resolve the org from the static-parameter `organization_id`; cross-check against the mirrored `vapiAssistantId`/`vapiPhoneNumber` and log a warning on mismatch.
*Done when:* an end-of-call report is persisted to the right org with `vapiCallId` and the cost/ended-reason fields populated, and re-delivery of the same `vapiCallId` updates rather than duplicates.

> **Build note (from Research §3.6):** Vapi's exact JSON nesting is the #1 cause of a broken first integration. When you build 1.5.3/1.5.4, copy the precise current payload shapes from Vapi's Custom Tools, Query Tool, and Server Events docs and match field-for-field **inside the Vapi adapter's mapper** — keep it out of the feature code.

---

## Milestone 1.6 — Knowledge base management

**Task 1.6.1 — Document upload (master copy)**
`documents` API + storage: upload a file, store the master copy in our storage, record it in the DB per org. Keep files lean (<~300KB, Research §3.2).
*Done when:* a doc is stored and listed for its org only.

**Task 1.6.2 — Push to voice KB, via the port** (`features/knowledge` → `voiceProvider.uploadKnowledgeFile`)
On upload, call the voice provider's `uploadKnowledgeFile` (Vapi adapter implements it) to push the file to the org's knowledge base and attach it to the assistant. Create a `KnowledgeBaseFile` row linked to the master `Document`, storing `vapiFileId`, `vapiKnowledgeBaseId`, `sizeBytes`, `syncStatus`, and `lastSyncedAt`. The `Document` stays the source of truth; the child row holds the Vapi working-copy id (and later a Phase-5 RAG copy id). Support delete via the port; set `syncStatus = "failed"` + error if the provider call fails so it can be retried.
*Done when:* a provisioned org's call can answer a question from an uploaded document, and each pushed file has its `vapiFileId` stored with `syncStatus = "synced"` — with the knowledge feature calling only the port, not the Vapi SDK.

**Task 1.6.3 — Knowledge admin screen**
Org view to upload, list, and delete documents.
*Done when:* an org admin manages their docs without touching code.

---

## Milestone 1.7 — Admin panel (the rest of the org views)

Build these as React routes that all consume the theme variables. Every list/detail call is org-scoped.

**Task 1.7.1 — Super-admin views:** list all orgs, org health (provisioned? number live? `syncStatus`), create/onboard org, and **drill into any org via the org switcher** (sets active org → every other view rescopes to it), plus the platform theme tab. The "acting as {org}" indicator from 1.2.2 is always visible while inside an org.
**Task 1.7.2 — Staff & services:** CRUD for `staff`, `services`.
**Task 1.7.3 — Schedules & time-off:** weekly `staff_schedules` editor + one-off `staff_time_off`.
**Task 1.7.4 — Customers:** list/search end-callers; view history.
**Task 1.7.5 — Calls:** list calls with transcript + recording playback + summary.
**Task 1.7.6 — Bookings:** list/filter; view, edit, cancel (status changes go through the engine).
**Task 1.7.7 — "How to use this app" page** (`features/help/` → route `/help`, in-app, theme-aware)
A single in-app guide page, reachable from the top-bar/help menu, written for the two audiences and rendered from Markdown content so it's easy to edit:
- **For the super-admin (you):** how to create/onboard a customer org, set up that customer's Vapi from the settings page (Task 1.4.5), enter/validate a key, provision the assistant + number, push knowledge docs, switch between orgs, and read the platform vs per-customer settings split.
- **For an org admin (the customer):** how to add staff, services, schedules and time-off; upload knowledge documents; read calls/transcripts; view/edit/cancel bookings; use the calendar; and recolor their org from the theme page.
- A short **"how a call works"** explainer (caller → Vapi → tools → booking → call saved) so non-technical owners understand what the receptionist does.
- Content is role-aware: an org admin doesn't see the super-admin/Vapi-key sections.
*Done when:* both roles can open `/help` and find step-by-step instructions for every screen they have access to; the page respects the active theme; content lives in editable Markdown, not hardcoded JSX.
*Done when (milestone):* a customer can run their receptionist end-to-end from the panel; super-admin can oversee all orgs; both roles have an in-app guide.

---

## Milestone 1.8 — In-app calendar

**Task 1.8.1 — Calendar grid**
Month/week view of bookings, org-scoped, colored with theme tokens.
**Task 1.8.2 — (Optional) one-way Google Calendar write**
Per booking, create a copy event in a connected Google Calendar; store `google_calendar_event_id`. No read-back (that's Phase 6). Can slip to later.
*Done when:* bookings appear on a calendar grid in the org view.

---

## Milestone 1.9 — Testing (unit + integration)

> Tests are written **per task as you go** (standing rule 10), but this milestone makes the strategy explicit and adds the cross-cutting suites that don't belong to a single feature. The full, itemized list of test cases lives in the companion **`04-TEST-CASES.md`** — build against that document; this milestone is the wiring + the high-value suites.

**Task 1.9.1 — Test infrastructure**
Set up Vitest at the workspace root with per-app configs. For API integration tests, stand up a **real, disposable Postgres** (Testcontainers, or a dedicated Docker DB in `docker-compose.test.yml`), run Prisma migrations against it, and reset state between tests (truncate or per-test transaction rollback). Add a **fake `VoiceProvider`** implementation in a test-utils package so nothing in tests calls real Vapi. Add test scripts: `test`, `test:unit`, `test:integration`, `test:watch`, `coverage`.
*Done when:* `pnpm test` runs both unit and integration suites green against a throwaway DB, with zero real Vapi calls.

**Task 1.9.2 — Unit tests (per feature)**
Pure-logic tests with mocked dependencies. Minimum coverage (full cases in `04-TEST-CASES.md`):
- **Booking engine** — availability math (schedules minus time-off minus existing bookings, timezone, service duration); auto-assign picks a free staff member; **double-booking guard** rejects the second concurrent book; edge cases (no staff free, zero-length service, DST boundary).
- **Tenant guard** — org user locked to own org; super-admin resolves active org from `X-Org-Id`; unscoped customer-data query throws.
- **Auth** — password hashing/verify; JWT issue/verify/expiry; role guard allow/deny matrix.
- **Vapi mapper** — Vapi payload ⇄ neutral domain type both directions; `toolCallId` echoed correctly; call-ended report → `NormalizedCallRecord`.
- **Theme resolver** — platform default → org override → user toggle precedence; invalid color rejected.
- **Credential encryption** — encrypt/decrypt round-trip; only last-4 ever exposed.
*Done when:* each feature's unit suite passes and covers its happy path + the edge cases listed in `04-TEST-CASES.md`.

**Task 1.9.3 — Integration tests (routes + DB + scoping)**
Real HTTP (Supertest) against the app with a real test DB and the fake voice provider. Minimum coverage:
- **Multi-tenant isolation (highest priority):** seed two orgs; assert org A's token can never read/write org B's staff, services, bookings, calls, customers, documents, or theme — every cross-org attempt returns 403/404 and never leaks data. This is the SaaS-critical suite.
- **Org switching:** super-admin with `X-Org-Id=A` sees only A; switching to B sees only B; no header → platform view.
- **Booking flow end-to-end (server):** check availability → book → re-check now shows the slot gone; concurrent double-book → exactly one succeeds.
- **Voice webhooks:** POST a simulated Vapi tool-call payload → correct tool runs, scoped to the static-parameter org, response echoes `toolCallId`; POST a call-ended report → `Call` row saved with all Vapi ids; re-POST same `vapiCallId` → updates, no duplicate.
- **Provisioning:** create org → fake provider returns ids → `OrgVapiConfig`/`VapiTool` persisted with `syncStatus=synced`; simulate a provider failure → `syncStatus=failed` + error, and a retry is idempotent (no duplicate).
- **Knowledge:** upload doc → master stored + `KnowledgeBaseFile` created via the port; delete removes both.
- **Auth + RBAC over HTTP:** login, refresh, expired token rejected; org_admin blocked from super-admin routes and from ever seeing Vapi keys/ids.
*Done when:* the isolation suite proves no cross-org access on any resource, and every flow above passes against the real test DB.

**Task 1.9.4 — Frontend component tests (key flows)**
React Testing Library for: login form, org switcher (super-admin only; rescopes on select), theme config page (changing accent updates CSS variables; contrast warning shows), and the Vapi settings page (key field masks input, never renders plaintext back, "Test key" calls the API). 
*Done when:* these components pass behavior tests; the settings page test asserts no plaintext key is ever in the DOM.

**Task 1.9.5 — (Optional) End-to-end smoke** (`Playwright`)
One happy-path browser test: super-admin logs in → creates an org → switches into it → adds a service + staff + schedule → books via the booking UI → sees it on the calendar and in the bookings list. Run in CI on a seeded test stack.
*Done when:* the e2e smoke passes headless in CI.

**Task 1.9.6 — Coverage gate + CI**
Wire `pnpm test` + `coverage` into CI (GitHub Actions). Set a coverage floor on the critical modules (booking engine, tenant guard, auth, vapi mapper) — these must stay high; UI can be lower. Fail the build on red tests or coverage drop below the floor.
*Done when:* CI runs all suites on every push and blocks merge on failure or coverage regression in the critical modules.

---

## Phase 1 acceptance (the whole milestone)

A provisioned org can: receive a real call → answer from its own knowledge base → book with a free staff member (no double-book) → and see the call, transcript, and booking in its **own isolated** view. The super-admin sees all orgs and can switch into any one of them. An org admin can **recolor their own org's view** (and the super-admin can set the platform-wide default) from the theme config page. Both roles have an in-app "how to use this app" guide. No query ever crosses organizations — and the multi-tenant isolation test suite (Task 1.9.3) proves it. All unit and integration suites pass in CI.

---

# Later phases (build on the same core — keep the seams ready)

These are **not** built now, but the codebase above already leaves the slots for them. Each is a thin addition, not a rewrite.

**Phase 2 — WhatsApp:** add a `messaging` adapter (Twilio or Meta) behind `messaging.port.ts`, plus a `whatsapp.webhook.routes.ts` channel that resolves the org by WhatsApp number and calls the **same `receptionist-tools` service**. Decide whether to bring Phase 5 RAG forward so WhatsApp shares voice's knowledge.

**Phase 3 — Reminders:** add a `reminders` feature that **subscribes to the `BookingCreated` event** (already published in 1.5.1) and a scheduler (node-cron now; swap `platform/events` for a real queue when you split services) that sends due reminders via the `messaging` port; track sent/failed; per-org timing config.

**Phase 4 — Payments:** add a `payments` feature + a Stripe adapter behind `payments.port.ts` (connected accounts per org); deposits/prepay; payment links over the chosen channel; refunds; optional no-show fees.

**Phase 5 — Own RAG (FastAPI):** add `apps/rag/` (Python) as its **own deployable service** with pgvector embeddings + `answer_from_docs`, called by features through a `knowledge.port.ts`. This is the first real microservice split — the structure already supports it (own app, talks over HTTP/queue, neutral interface). Migrate from Vapi's KB.

**Phase 6 — Hardening + integrations:** monitoring/alerts, mid-call fallback, secured webhooks, backups; recording consent + retention/GDPR + audit logs; **Retell adapter** — a new `adapters/voice/retell/` implementing the **same `VoiceProvider` port**, switched on per-org via `config/providers.ts` (no feature changes; see **Appendix A** for other provider options); two-way Google/Outlook sync behind `calendar.port.ts`; white-label per-org branding (your theme system already covers logo + colors — extend to custom domains).

**Future module — Outbound calling (designed-for, not scheduled):** the platform is inbound-only through Phase 6, but the seams for outbound already exist so it slots in as a pure addition. To add it later:
- Implement the reserved `startOutboundCall(...)` method on the **existing `VoiceProvider` port** (Vapi/Retell/Bland all support outbound) — no new abstraction.
- Add an `outbound` feature slice that owns the *trigger logic* (who to call, when, why) — e.g. campaigns, follow-ups, or reminder-escalation calls. This is the genuinely new part: outbound is **initiated by our system**, unlike reactive inbound.
- Use the existing `platform/events` bus + a job/queue to place calls (the same scheduler infra Phase 3 reminders introduce).
- The `calls.direction` field already distinguishes inbound vs outbound, so the data layer, multi-tenancy, the calls UI, and the booking tools all work unchanged.
- **Compliance is the real new work**, not the plumbing: outbound carries legal weight (consent / do-not-call lists / permitted calling hours / TCPA-style rules) that inbound doesn't. Treat that as a first-class requirement of the outbound module, not an afterthought.

Net: outbound reuses the port, the booking engine, the tools, the calls table, the events bus, and the scheduler. What's new is a trigger feature + a port method + compliance — an addition, not a refactor.

---

# Suggested build order summary (give this to Claude Code as the running checklist)

1. 1.0 Scaffolding (workspaces, contracts seam, backend composition root, **ports**, frontend)
2. 1.1 DB schema (+ Vapi-mirrored ids) + tenant scoping + seed
3. 1.2 Auth + roles + **super-admin org switcher**
4. **1.3 Theme system + colour config page** ← do before other UI
5. 1.4 Organizations + **VoiceProvider port** + Vapi adapter + provisioning + **per-customer Vapi settings page** + platform voice settings
6. 1.5 Booking engine + receptionist-tools + voice webhooks (via the port)
7. 1.6 Knowledge base
8. 1.7 Admin panel views + **"how to use this app" page**
9. 1.8 Calendar
10. 1.9 Testing (infra + unit + integration + CI gate) — *write each task's tests as you build it; this milestone adds the cross-cutting suites and CI*
11. Phase 1 acceptance pass (multi-tenant isolation test + double-booking test + live call test + **"no vendor SDK outside its adapter" check**)

> Note on test timing: tests are written **alongside each task** (standing rule 10), not deferred to step 10. Milestone 1.9 is where the shared test infrastructure, the cross-feature isolation suite, and the CI gate get finalized — not where testing starts.

Work one task at a time. After each, run its "Done when" check before continuing.

---

# Appendix A — Voice provider landscape (what can sit behind the `VoiceProvider` port)

Phase 1 ships on **Vapi**. But because every feature talks to the `VoiceProvider` port and never to a vendor SDK directly (architecture principle 3, standing rule 7), swapping or adding a provider later is one new adapter in `adapters/voice/<name>/` plus a line in `config/providers.ts` — no feature changes. This appendix is the menu of what those adapters could be, so the decision is documented rather than rediscovered later.

> This is the build-facing summary of the fuller research in **Product Research (Doc 01, §5)** — the two are kept in sync; if they ever disagree, Doc 01 is the source.

> **Caveat on the numbers below.** Pricing, latency, and "best overall" claims are drawn largely from vendor blogs and comparison sites, several published by competitors with an angle. Treat them as **directional, not gospel** — benchmark for yourself before any migration. The category structure is the durable part; the specific figures deserve your own testing.

**Category 1 — Managed BYOK platforms (most like Vapi; smallest conceptual switch).** You bring your own LLM/voice keys; they handle orchestration. Each of these maps cleanly onto the existing port.
- **Retell AI** — the most-cited Vapi alternative; developer-oriented but friendlier than raw APIs, strong appointment-booking workflows, pay-as-you-go with no platform fee, base ~$0.07/min (slightly above Vapi's ~$0.05), leans outbound. Best conceptual fit for an inbound receptionist after Vapi, and already named as the Phase 6 adapter.
- **Bland AI** — developer-first, outbound-heavy; notable for running agents on your own dedicated models/servers/GPUs including a self-hosted stack. All-in from ~$0.09/min, often cheaper at outbound volume; trade-off is lower voice quality and less model flexibility. Relevant for the data-control angle.
- **Synthflow** — the no-code/all-in-one end: visual workflow builder, deep CRM integrations, HIPAA, inbound routing, multi-tenant agency management, post-call analytics, own telephony network. Bundled-minute pricing (~$29/mo for 5k min up to ~$249/mo for 60k). Interesting because it overlaps features you're building yourself (multi-tenant + CRM).

**Category 2 — Self-hostable / open-source (removes the per-minute orchestration fee; you run the compute).** These are the "eliminate the platform fee at scale" path.
- **Pipecat** — open-source Python by Daily. Worth knowing: **Vapi itself is built on Pipecat**, so this is effectively the engine under Vapi, self-hosted.
- **LiveKit Agents** — open-source on LiveKit's WebRTC infra; strong real-time/scaling story for self-hosting.
- **Vocode** — lighter-weight open-source Python/Node framework; full choice of ASR/TTS/LLM/flow/hosting, built in your own codebase.

**Category 3 — Owned-infrastructure telco platforms (bundled, not BYOK).**
- **Telnyx** — a licensed carrier owning edge compute + voice-AI + global comms in one stack, removing external hops and the orchestration fee; ~$0.08/min including STT/TTS. More bundled, less mix-and-match.
- **Cloud-native:** Azure Voice Live API and AWS (Amazon Connect + Lex/Bedrock) — strongest fit if you want to consolidate onto cloud infrastructure you already pay for.

**Category 4 — No-code / business-operator platforms (less relevant to a technical build, listed for completeness).** Goodcall (budget SMB receptionist, flat monthly), Voiceflow (omnichannel design), Lindy (all-in-one assistant), Air AI (autonomous outbound), Cognigy and PolyAI (enterprise contact-center), Replicant (enterprise, HIPAA).

**Category 5 — Components, not orchestrators (do NOT mistake these for Vapi replacements).** ElevenLabs (best raw voice + a conversational product, but primarily a TTS layer), Deepgram (STT), Cartesia, PlayHT. These are pipeline pieces you'd plug *into* a platform above — including your current Vapi setup — not behind the `VoiceProvider` port as a standalone provider.

**Practical shortlist to keep warm (for a technical, cost-sensitive build already on Azure/AWS/Twilio):**
1. **Stay on Vapi** for Phase 1 — lowest base fee, already integrated.
2. **Retell** — the easy lateral move if Vapi friction grows (Phase 6 adapter).
3. **Pipecat / LiveKit** — the serious "kill the per-minute fee at scale" path.
4. **Azure Voice Live** — the "consolidate onto infrastructure I already pay for" path.

The rest are situational. None of this changes Phase 1; it's the documented option set behind the abstraction you're already building.

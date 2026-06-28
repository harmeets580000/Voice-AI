# Scope Document — AI Receptionist SaaS

**Document 2 of 4** · Companion to: Product Research (01), Claude Code Plan (03), Test Cases (04)
**Version:** 3.0 (detailed multi-phase scope)
**Status:** Phase 1 locked for development; Phases 2–6 defined, refined before each begins
**Scope:** Inbound call flow built as a multi-tenant SaaS. Outbound calling is a future feature — not built in any phase here, but the architecture is deliberately designed to receive it as an addition (see §7, "Future module — Outbound calling").

---

## 1. What we are building

A multi-tenant SaaS platform that gives any business an AI phone receptionist. It answers incoming calls for each customer business, talks to *their* callers, answers questions from *their* knowledge base, and books appointments with *their* available staff. Every call and booking is stored and shown in a panel — each customer sees only their own organization, and the super-admin can see and manage all of them.

Telephony and voice are handled by **Vapi** (Mode A). Knowledge/RAG is handled by **Vapi's built-in knowledge base** for Phase 1. Everything else — multi-tenancy, the booking brain, the data, the admin panel, onboarding, reminders — is our own platform. The design keeps the door open to **swap the voice provider** (Retell and the wider menu in Product Research §5) and to **add WhatsApp** later without rebuilding the core.

**One-line summary:** Vapi answers and runs each call (and holds each customer's knowledge base). Our platform runs the SaaS: organizations, booking, data, admin, and per-customer voice setup. Our database is the single source of truth.

---

## 2. Locked decisions

| Decision | Answer |
|---|---|
| Channel for Phase 1 | Inbound phone calls only |
| Product type | Multi-tenant SaaS — many customer organizations on one platform |
| Who uses it | Super-admin (you) + each customer = an isolated organization |
| Voice platform | Vapi |
| Vapi integration style | Mode A — conversation LLM runs inside Vapi; our backend provides tools only |
| Knowledge/RAG | Vapi's built-in KB (Query Tool) for now; own RAG (FastAPI) is a later phase |
| Vapi management | Admin panel provisions assistants, phone numbers, and KBs per org via the Vapi API |
| Voice provider portability | All voice work behind a `VoiceProvider` port; provider swap = one adapter |
| Future channel | WhatsApp |
| Staff model | Multiple staff per organization, each with their own schedule |
| Staff selection by caller | No — auto-assign whoever is free (caller-choice is future) |
| Source of truth | Our own PostgreSQL database |
| Calendar (Phase 1) | In-app calendar view; optional one-way write to Google Calendar |
| Tech stack | React + Node.js (Express) + PostgreSQL + Prisma |
| Architecture | Feature-sliced; frontend/backend split-ready; vendors behind ports/adapters |

---

## 3. System architecture (high level)

**Roles in one line each:**
- **Vapi** = phone line + voice + conversation + each org's knowledge base. Decides *when* to call a tool. Does the talking.
- **Node.js backend** = the SaaS — multi-tenant data, tools, onboarding, per-org provisioning, saving calls.
- **PostgreSQL** = the source of truth.
- **Admin panel** = the window. Super-admin sees all orgs; each customer sees only their own. Never part of a live call.

**The inbound call flow (for one organization):**
```
1. A caller dials a customer-org's number  ──►  that org's Vapi assistant answers
2. Vapi greets, listens, turns speech into text
3. Vapi (running the conversation LLM) decides what is needed:
   • A question?            ──► Vapi's built-in KB (that org's docs)
   • "Are you free Friday?" ──► backend check_availability  (scoped to this org)
   • "Book me in"           ──► backend book_appointment     (scoped to this org)
   • "I called last week…"  ──► backend lookup_customer      (scoped to this org)
4. Each tool call carries the org's identity (static parameter), so the backend
   knows exactly which org's data to use
5. The tool returns a short result  ──►  Vapi speaks it
6. Steps 3–5 repeat until done
7. Call ends  ──►  Vapi sends transcript + recording to /webhook/voice/call-ended
                   ──►  saved to Postgres (tagged to org)
8. Customer opens their org view  ──►  reads Postgres (their org only)  ──►
   sees the call, transcript, booking
```

**The adapter/port pattern (keeps it open for Retell + WhatsApp):**
```
Vapi      ──► voice adapter   ──┐
Retell    ──► voice adapter   ──┤──► VoiceProvider port ──► same tools (org-scoped) ──► same DB
WhatsApp  ──► messaging adapter─┘
```
Adding a provider later means writing one new adapter implementing the same port. The tools, booking logic, database, multi-tenancy, and admin panel do not change.

---

## 4. Multi-tenancy design (the backbone)

### 4.1 Isolation
Every table holding customer data carries an `organizationId`. **Every query is scoped by it.** A customer can never see or touch another organization's data. The super-admin can see across all organizations.

### 4.2 Roles
- **Super-admin (you)** — manage all orgs, onboard customers, see platform-wide data, switch into any org.
- **Org-admin (customer owner)** — manage only their own org (staff, services, schedules, knowledge, view calls/bookings, theme).
- **Org-staff** — limited view within their organization.

### 4.3 Tenant identity at runtime
- **Voice calls:** `organization_id` rides in every tool call as a Vapi static parameter (server-trusted; the AI never sees it).
- **Admin panel:** an org user's `organizationId` (from their token) scopes every request; a super-admin sets the active org per request via the org switcher (`X-Org-Id`), or sees the platform view with none selected.
- **Future channels (WhatsApp):** the channel adapter resolves which org an incoming message belongs to (e.g. by the WhatsApp number) and tags it.

### 4.4 Onboarding a new customer
```
1. Super-admin creates an Organization (self-signup is a future phase)
2. Backend calls Vapi (via the VoiceProvider port) to:
     • create the org's assistant
     • provision a phone number
     • upload + attach the org's knowledge base
     • configure tools with the org's organization_id baked in (static parameter)
   …and persists every returned Vapi id locally with sync status
3. Org-admin logs in to their isolated view and sets up staff, services, schedules
4. The org's phone number is live — calls now work for that customer
```

### 4.5 The two "organizations" (do not conflate)
*Our* organization is the customer/tenant on our platform (what the switcher moves between). **Vapi also has its own org concept** (a separate workspace with its own keys/usage). Phase 1 uses one Vapi account with one assistant + number per customer, isolating customers in *our* DB. The "Vapi org per customer" strategy stays available later (only worth it for per-client Vapi billing/keys), at no cost now because everything routes through the port.

---

## 5. Data model (starting draft)

Every customer-data table has `organizationId`. Field details refine during Phase 1; these tables and relationships define the shape.

**Core tables (Phase 1)**
- **organizations** — `id`, `name`, `slug`, `timezone`, `status` (trial/active/suspended), `plan`, `logo_url`, `business_hours_config`, `created_at`
- **org_vapi_config** — Vapi resources + sync per org: `organizationId`, `provider`, `vapiOrgId`, `vapiAssistantId`, `vapiPhoneNumberId`, `vapiPhoneNumber`, `vapiKnowledgeBaseId`, `greeting`, `prompt`, `voice`, `llmModel`, optional encrypted `vapiPrivateKeyEnc` + `vapiKeyLast4`, `syncStatus`, `lastSyncedAt`, `syncError`, `vapiRaw`, `updatedAt`
- **org_theme** — branding overrides: `organizationId`, `tokens` (JSON), `defaultMode`, `allowUserToggle`, `updatedAt`
- **users** — `id`, `organizationId` (nullable for super-admin), `email`, `name`, auth credential, `role` (super_admin/org_admin/org_staff), `is_active`, `created_at`
- **staff** — `id`, `organizationId`, `name`, `email`, `phone`, `title`, `user_id` (nullable), `is_active`, `created_at`
- **services** — `id`, `organizationId`, `name`, `description`, `duration_minutes`, `price`, `is_active`
- **staff_schedules** — recurring weekly hours: `id`, `organizationId`, `staff_id`, `day_of_week`, `start_time`, `end_time`
- **staff_time_off** — one-off blocks: `id`, `organizationId`, `staff_id`, `start_datetime`, `end_datetime`, `reason`
- **customers** — end-callers: `id`, `organizationId`, `name`, `phone`, `email`, `notes`, `created_at`
- **bookings** — the heart: `id`, `organizationId`, `customer_id`, `staff_id`, `service_id`, `start_datetime`, `end_datetime`, `status` (booked/cancelled/completed/no_show), `source` (phone/whatsapp/web/admin), `payment_status` (future), `google_calendar_event_id` (nullable), `notes`, `created_at`
- **calls** — one row per call, Vapi-mirrored: `id`, `organizationId`, `vapiCallId`, `vapiOrgId`, `vapiAssistantId`, `vapiPhoneNumberId`, `customer_id` (nullable), `caller_number`, `direction` (inbound/outbound — always `inbound` in Phase 1; present now so outbound is a later data addition, not a schema change), `started_at`, `ended_at`, `duration_seconds`, `recording_url`, `ended_reason`, `cost`, `cost_breakdown` (JSON), `summary`, `transcript_json` (nullable), `phone_call_provider`, `phone_call_provider_id`, `created_at`
- **call_messages** — structured transcript turns: `id`, `organizationId`, `call_id`, `role`, `text`, `timestamp`
- **vapi_tools** — mirrored tool config: `id`, `organizationId`, `vapiToolId`, `name`, `serverUrl`, `staticParams` (JSON), `provider`, `syncStatus`
- **documents** — master knowledge files: `id`, `organizationId`, `title`, `storage_path`, `uploaded_at`
- **knowledge_base_files** — Vapi working-copy mapping: `id`, `organizationId`, `documentId`, `vapiFileId`, `vapiKnowledgeBaseId`, `sizeBytes`, `syncStatus`, `lastSyncedAt`
- **reminders** — scheduled reminders: `id`, `organizationId`, `booking_id`, `channel` (sms/whatsapp/email), `scheduled_for`, `status` (pending/sent/failed), `sent_at`
- **platform_voice_config** / **platform_theme** — single-row platform defaults

**Future tables (later phases):** `staff_services`, `payments`, `subscriptions`, `usage_records`, `document_chunks` (pgvector, Phase 5), `audit_logs`, `locations`.

---

## 6. Key design rules

1. **Every query is scoped by `organizationId`.** No cross-org access except for the super-admin.
2. **Database is the source of truth; Vapi and calendars are mirrors.** Every Vapi id mirrored locally with sync status.
3. **Tenant identity is server-trusted, never AI-decided.** Rides in tool calls as a static parameter.
4. **Booking safety — re-check the slot inside the save** (same DB transaction). Prevents double-bookings.
5. **All booking logic lives in one place**, shared by every channel.
6. **Adapter/port pattern for every vendor.** Voice, payments, messaging, calendar each behind an interface; business logic never imports a vendor SDK.
7. **Always have a human handoff** (`transferCall`) when the AI is unsure or asked.
8. **One calendar provider first** (Google); others later on demand.
9. **Provision the voice provider per org via API**, never by manual dashboard work — onboarding must be automatic to scale.
10. **Tests ship with each task;** multi-tenant isolation is the highest-priority suite.

---

## 7. Development phases

Phase 1 is large because it delivers a working, multi-tenant inbound receptionist end-to-end. Phases 2+ build on the same core. **Start with Phase 1, then move through the others in order.**

---

### PHASE 1 — Core multi-tenant inbound receptionist

**Goal:** A provisioned customer organization can receive a real call, answer questions from its own knowledge base, book an appointment with a free staff member, and see everything in its own isolated view — fully separated from other organizations. A super-admin can onboard and oversee all customers, configure each customer's Vapi from a settings page, switch between customers, and recolor the platform. Full unit + integration tests, plus an in-app how-to-use guide.

**Milestones (detailed task breakdown in the Claude Code Plan, Doc 03):**
- **1.0 Scaffolding** — monorepo (independent api + web apps), shared contracts package, composition root, ports defined up front.
- **1.1 Database & multi-tenancy** — full schema with `organizationId` everywhere and Vapi ids mirrored; tenant-scoping guard with super-admin org switching; seed two demo orgs.
- **1.2 Auth & roles** — JWT, three roles, RBAC guards; frontend auth + **super-admin org switcher** with "acting as {org}" indicator.
- **1.3 Theme / colour config** — token system (light/dark) from the brand guide; theme config page; org override + platform default. Built early so all later UI consumes theme variables.
- **1.4 Organizations, voice provisioning & Vapi settings page** — org CRUD; the `VoiceProvider` port; the Vapi adapter (SDK client + mapper + provider); provisioning flow that persists all Vapi ids with sync status; **per-customer Vapi settings page** (assistant config, phone, optional encrypted key, webhook URLs, live ids/status); **platform-wide voice settings page**; sync-status surface + light reconcile.
- **1.5 Booking engine, tools & voice webhooks** — the single booking brain (auto-assign + transaction-level no-double-book + `BookingCreated` event); channel-agnostic receptionist tools; voice tool webhook + call-ended webhook via the port (Vapi shapes isolated in the adapter).
- **1.6 Knowledge base** — per-org document upload (master in our DB); push to Vapi KB via the port; knowledge admin screen.
- **1.7 Admin panel** — super-admin views; staff/services; schedules/time-off; customers; calls (transcript + recording); bookings (view/edit/cancel); **"how to use this app" page**.
- **1.8 In-app calendar** — month/week grid, org-scoped; optional one-way Google Calendar write.
- **1.9 Testing** — Vitest + Supertest + real disposable Postgres + fake VoiceProvider; unit + integration suites (isolation suite is highest priority); optional Playwright smoke; CI coverage gate.

**Phase 1 acceptance:** a provisioned org can receive a real call → answer from its own KB → book with a free staff member (no double-book) → and see the call, transcript, and booking in its own isolated view. Super-admin sees all orgs and can switch into any. Org admins recolor their own view; super-admin sets the platform default. Both roles have an in-app guide. No query ever crosses organizations, proven by the isolation test suite. All unit + integration suites pass in CI.

---

### PHASE 2 — WhatsApp channel

**Goal:** Each organization's callers can also reach the receptionist via WhatsApp, reusing all Phase 1 tools.

- Integrate the WhatsApp Business API (Twilio or Meta — decide at build time) behind a `messaging.port.ts`.
- Build a WhatsApp adapter that resolves which org a message belongs to (by the WhatsApp number) and translates messages into the standard format.
- Route WhatsApp through the **same** receptionist tools (org-scoped).
- Decide how WhatsApp answers knowledge questions: keep it booking-only at first, or bring forward Phase 5 (own RAG) so WhatsApp shares the same knowledge as voice (Vapi's KB only serves voice — this is the trigger point for own RAG).
- Save WhatsApp conversations alongside calls; show them in the org view.

**Acceptance:** a caller can complete a booking entirely over WhatsApp, correctly scoped to the right organization.

---

### PHASE 3 — Reminders

**Goal:** Customers automatically get a reminder before their appointment.

- Add a `reminders` feature that **subscribes to the `BookingCreated` event** already published in Phase 1.
- A scheduled job (node-cron now; swap the event bus for a real queue when services split) checks upcoming bookings across all orgs and sends due reminders.
- Decide the reminder channel(s): SMS, WhatsApp, or Email (reuse the messaging port).
- Update reminder status (sent/failed), handle failures (retry/flag); let each org configure timing; show reminder status per booking.

**Acceptance:** a booking triggers a reminder at the configured time before the appointment, per organization.

---

### PHASE 4 — Payments against bookings

**Goal:** Take payment or a deposit for a booking.

- Add a `payments` feature + a Stripe adapter behind `payments.port.ts`; each org connects their own payout account.
- Support deposits or full prepayment at booking time, and pay-at-venue as an option.
- Build the `payments` table; link payments to bookings (`payment_status`).
- Handle payment links over the chosen channel (SMS/WhatsApp/email), refunds, and failed payments.
- Optional: cancellation/no-show fees tied to a cancellation policy.

**Acceptance:** a booking can require and collect a deposit or full payment, with status tracked and refunds possible.

---

### PHASE 5 — Own RAG / knowledge service (FastAPI)

**Goal:** One shared knowledge brain usable by every channel (not just Vapi voice), with faster, more controllable retrieval.

- Add `apps/rag/` (Python/FastAPI) as its **own deployable service** — the first real microservice split (the architecture already supports it).
- Document ingestion, embeddings (pgvector), retrieval; expose an `answer_from_docs` endpoint usable by voice, WhatsApp, web chat, etc., behind a `knowledge.port.ts`.
- Migrate knowledge from Vapi's KB to the shared service (or run both during transition).
- Lower latency and gain full control over retrieval logic.

**Acceptance:** every channel answers from the same knowledge source, faster than Vapi's built-in KB.

---

### PHASE 6 — Production hardening + future integrations

**Goal:** Make the platform reliable for real business use and open the bigger integrations.

- **Reliability:** monitoring/alerts for failed calls; mid-call fallback (transfer to human or take a message); usage/cost dashboards; secured webhooks; backups.
- **Privacy/compliance:** call-recording consent, secure storage, data retention/GDPR, audit logs.
- **Provider swap proof:** build a Retell adapter (`adapters/voice/retell/`) implementing the same `VoiceProvider` port, switched per-org via config — proving the abstraction. (See Product Research §5 for the wider provider menu.)
- **Two-way calendar sync:** read staff's external calendars so external blocks are respected; handle conflicts/edits/deletions; optionally Outlook.
- **White-label:** per-org branding (logo, colours via the existing theme system, custom domain) so customers present it as their own.

**Acceptance:** the platform runs reliably with monitoring, fallback, and compliance; a voice-provider switch is possible; external calendars are respected; customers can brand it.

---

### Future module — Outbound calling (designed-for, not scheduled)

Outbound is **not** part of Phases 1–6, but the architecture is built to receive it as an addition rather than a rewrite. What already carries over: the `VoiceProvider` port (outbound is a reserved `startOutboundCall` method on the same interface — Vapi/Retell/Bland all support it), the booking engine and receptionist tools (direction-agnostic), the `calls.direction` field (present from Phase 1), the events bus, and the Phase 3 scheduler infrastructure.

What's genuinely new when outbound is built: (1) an `outbound` feature that owns the *trigger* — who to call, when, and why (campaigns, follow-ups, reminder escalation) — since outbound is initiated by the system, not a caller; and (2) **compliance** — consent, do-not-call lists, permitted calling hours, TCPA-style rules — which inbound doesn't carry and which must be treated as first-class, not an afterthought. Net: a trigger feature + a port method + compliance, all additive.

---

## 8. Future features roadmap (backlog menu)

Pick by customer demand. Items already covered by a phase are marked.

**Booking & scheduling:** payments/deposits *(P4)*; rescheduling & cancellation (AI, self-service link, admin); cancellation policies & no-show fees; recurring appointments; waitlists; group bookings/classes; buffer times; service-specific staff; caller chooses a staff member; resource booking (rooms/equipment); multi-location; booking confirmations.

**Communication channels:** WhatsApp *(P2)*; two-way SMS; web chat widget; email handling; Messenger/Instagram DM; outbound calls; voicemail handling & transcription.

**AI capabilities:** own shared RAG *(P5)*; multi-language; call summaries & sentiment; intent detection & categorization; lead qualification & routing; spam-call filtering; custom voice/persona per org; blended document + live-database answers.

**Admin & business:** analytics dashboard (volume, conversion, peak times, revenue, missed calls); reports & CSV/PDF exports; white-label *(P6)*; custom prompts/scripts per org; staff notifications (email/SMS/Slack); built-in CRM (history, notes, tags, LTV); custom hours/holidays/closures; audit logs.

**Monetization (your SaaS side):** subscription plans & tiers; usage-based billing (per call/minute); free trials & self-signup; per-org usage tracking & limits; Stripe billing for your own subscriptions.

**Integrations:** Google Calendar two-way *(P6)*; Outlook & others; CRM (HubSpot, Salesforce); accounting (QuickBooks, Xero); Zapier/Make/webhooks; import from Calendly/Acuity.

**Reliability & ops:** human handoff *(P1)*; voicemail/message-taking fallback; monitoring/alerting *(P6)*; alternative voice provider *(P6)*; data retention/backups/DR; rate limiting & abuse protection.

**Customer-facing self-service:** customer portal to manage bookings; self-reschedule/cancel links; post-appointment reviews; public booking page (web link, not only call).

---

*End of scope document.*

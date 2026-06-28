# Product Research — AI Receptionist SaaS

**Document 1 of 4** · Companion to: Scope (02), Claude Code Plan (03), Test Cases (04)
**Status:** Living research log — captures everything researched and decided so far
**Last updated:** Phase 1 pre-build

---

## 1. What this product is

A multi-tenant SaaS that gives any business an AI phone receptionist. The platform answers incoming calls for each customer business, talks to *their* callers, answers questions from *their* knowledge base, and books appointments with *their* available staff. Every call and booking is stored and shown in a panel; each customer sees only their own organization, and the platform owner (super-admin) can see and manage all of them.

The voice and telephony are handled by a third-party voice platform (**Vapi** for Phase 1). Everything else — multi-tenancy, the booking brain, the data, the admin panel, onboarding, reminders — is the platform we build.

**One-line summary:** Vapi answers and runs each call (and holds each customer's knowledge base). Our platform runs the SaaS: organizations, booking, data, admin, and per-customer voice setup. Our database is the single source of truth.

---

## 2. Why this product exists (the value thesis)

Voice platforms like Vapi and Retell are **infrastructure for developers**, not products a business can use. They answer phones but know nothing about a specific business, have no multi-tenant admin panel, don't store organized booking/customer data, and need coding to do anything.

This platform is the finished SaaS wrapped around that infrastructure:
- Serves **many businesses at once**, each isolated and self-contained.
- **Onboards a customer automatically**, provisioning their phone, assistant, and knowledge base in a few clicks.
- Gives non-technical owners a **panel they can actually use**.
- Holds the **booking brain** (auto-assign, no double-bookings, reminders, payments).
- **Connects everything** (calls → bookings → reminders → payments → customers), per organization.
- Customers never touch Vapi, API keys, or code.

**The core insight:** the voice conversation is roughly 20% of what a receptionist does. The other 80% — knowing the business, managing the calendar and staff, remembering customers, taking payment, following up — plus running it as a multi-tenant SaaS, is what we build. That is why the platform is worth paying for, and why development effort should concentrate there, not on the voice plumbing.

**The thin-wrapper risk** ("why not use Vapi directly?") is answered by exactly this: value lives in multi-tenancy, booking logic, admin, onboarding, and support — not the voice plumbing.

---

## 3. The Vapi integration model (researched)

### 3.1 Integration style — "Mode A"
The conversation LLM runs **inside Vapi**; our backend provides **tools (actions) only**. Vapi decides *when* to call a tool; our backend answers with data. We do not run the conversation model ourselves in Phase 1.

### 3.2 Knowledge base
Each organization gets its own knowledge base **inside Vapi** (built-in KB, Query Tool). We upload that org's documents via the Vapi API; Vapi handles retrieval during calls. Researched specifics:
- Provider under the hood is Google/Gemini; expect ~2 seconds for a knowledge lookup (acceptable; a custom RAG would be faster — that's the future-phase trade-off).
- Keep individual files small (~under 300KB each) for fast processing.
- Master copies of all documents live in **our** database/storage; Vapi holds a working copy. This avoids lock-in and prepares for a shared RAG later.

### 3.3 Provisioning per customer (via API)
Our backend holds the Vapi API key (server-side only) and uses the Vapi API to set up each organization automatically during onboarding: create the assistant, provision a phone number, upload + attach the knowledge base, and configure the tools to point at our endpoints. One Vapi account (ours); a separate assistant + phone number per organization inside it. Customers never need their own Vapi account.

### 3.4 Telling tools which organization a call belongs to (critical)
Vapi's **static parameters** — server-trusted values merged into each tool call without the LLM ever seeing them — carry the org's `organization_id` into every tool call. The AI can never get the wrong org because it never touches this value. This is the security backbone of multi-tenancy at call time.

### 3.5 Tools
- **Custom tools we build:** `check_availability`, `book_appointment`, `lookup_customer`.
- **Default tools we switch on:** `transferCall` (human handoff), `endCall`, `sms` (needs connected Twilio).

### 3.6 Webhooks & payload shape
On call end, Vapi sends an end-of-call report (transcript, recording link, duration, end reason) to our webhook. Tool calls carry a `toolCallId` that our response **must echo back**. Researched caveat: the exact JSON keys and nesting are fiddly and are the most common cause of a broken first integration — match field-for-field against Vapi's current Custom Tools and Server Events docs.

### 3.7 Latency rules
- Host the backend near Vapi's region (**us-west-2**) — biggest latency lever.
- For dynamic inbound assistant selection, Vapi enforces a fixed ~7.5-second end-to-end limit.
- Keep tool responses fast; the KB lookup (~2s) is the slowest part.

### 3.8 The two "organizations" (a key clarification)
There are two distinct org concepts that must not be conflated:
- **Our organization** — the customer/tenant on *our* platform, in our database, fully under our control. This is what the admin org-switcher moves between.
- **Vapi's organization** — a separate Vapi workspace with its own keys and usage logs. Research shows some agencies create a Vapi org per client for per-client billing/keys, but moving assistant configs between Vapi orgs is a manual copy and adds friction.

**Decision:** Phase 1 uses one Vapi account with one assistant + number per customer, isolating customers in *our* DB — not a Vapi org per customer. The "Vapi org per customer" path stays available later (only worth it for per-client Vapi billing/keys) because everything routes through a provider abstraction.

---

## 4. Official SDK (researched)

For the Node.js backend, use the **official Vapi Server SDK for TypeScript**:
- Package: `@vapi-ai/server-sdk`; runs on Node.js 18+.
- Instantiate with the server-side key; all request/response types exported under the `Vapi` namespace.
- Built-in automatic retries with backoff and a 60s default timeout; errors throw `VapiError`.
- **Two key types:** the **private** key does backend work (provisioning, managing assistants); the **public** key is scoped to web-call creation only and 401s elsewhere. Phase 1 (Mode A, no in-browser calls) needs only the **private** key.
- Do **not** add the client/real-time Web SDK in Phase 1 — only relevant if an in-browser test-call widget is added later.
- Caveat: the SDK wraps the REST API but does not define the inbound webhook payload shapes the tool endpoints must echo — still match those against live docs.

---

## 5. Voice provider landscape (researched alternatives)

Phase 1 ships on Vapi, but the build routes everything through a `VoiceProvider` abstraction so a provider can be swapped or added later with one adapter. The researched menu:

> **Caveat:** pricing/latency/"best overall" claims below come largely from vendor and competitor blogs with an angle — treat them as **directional, not gospel**, and benchmark before any migration. The category structure is the durable part; the numbers deserve independent testing.

**Category 1 — Managed BYOK platforms (most like Vapi; smallest switch).**
- **Retell AI** — most-cited Vapi alternative; friendlier than raw APIs; strong appointment-booking; pay-as-you-go, no platform fee; base ~$0.07/min (vs Vapi ~$0.05); leans outbound. Best conceptual fit after Vapi; designated as the future adapter.
- **Bland AI** — developer-first, outbound-heavy; can run on your own models/servers/GPUs incl. self-hosted; ~$0.09/min all-in, cheaper at outbound volume; lower voice quality, less model flexibility. Relevant for data control.
- **Synthflow** — no-code/all-in-one; visual builder, CRM integrations, HIPAA, inbound routing, multi-tenant agency management, analytics, own telephony; bundled-minute pricing (~$29/mo for 5k min → ~$249/mo for 60k). Overlaps features we're building ourselves.

**Category 2 — Self-hostable / open-source (removes the per-minute platform fee).**
- **Pipecat** — open-source Python by Daily. Key fact: **Vapi itself is built on Pipecat**, so this is effectively the engine under Vapi, self-hosted.
- **LiveKit Agents** — open-source on LiveKit WebRTC; strong real-time/scaling.
- **Vocode** — lighter-weight open-source Python/Node framework; full ASR/TTS/LLM/flow/hosting choice in your own codebase.

**Category 3 — Owned-infrastructure telco platforms (bundled, not BYOK).**
- **Telnyx** — licensed carrier owning the whole stack; ~$0.08/min incl. STT/TTS; more bundled, less mix-and-match.
- **Cloud-native:** Azure Voice Live API and AWS (Amazon Connect + Lex/Bedrock) — best fit if consolidating onto cloud infra already paid for.

**Category 4 — No-code / business-operator platforms (for completeness).** Goodcall, Voiceflow, Lindy, Air AI, Cognigy, PolyAI, Replicant.

**Category 5 — Components, NOT orchestrators (don't mistake for Vapi replacements).** ElevenLabs (best raw voice + a conversational product, but a TTS layer), Deepgram (STT), Cartesia, PlayHT. These plug *into* a platform, including Vapi — they don't replace the orchestration layer.

**Practical shortlist to keep warm** (technical, cost-sensitive, already on Azure/AWS/Twilio):
1. **Stay on Vapi** for Phase 1 — lowest base fee, already integrated.
2. **Retell** — easy lateral move if Vapi friction grows.
3. **Pipecat / LiveKit** — serious "kill the per-minute fee at scale" path.
4. **Azure Voice Live** — "consolidate onto infrastructure I already pay for" path.

The honest framing from the research roundups: the choice is less about features and more about team capability, scale, and whether you're optimizing for speed, control, or reliability.

---

## 6. Locked product decisions (researched & committed)

| Decision | Answer |
|---|---|
| Channel for Phase 1 | Inbound phone calls only |
| Product type | Multi-tenant SaaS — many customer orgs on one platform |
| Who uses it | Super-admin (you) + isolated customer organizations |
| Voice platform | Vapi (Mode A) |
| Knowledge/RAG | Vapi built-in KB now; own RAG (FastAPI) later |
| Vapi management | Admin panel provisions assistants/numbers/KBs per org via API |
| Future voice platform | Retell (and the wider menu in §5) — provider abstraction allows swap |
| Future channel | WhatsApp |
| Staff model | Multiple staff per org, each with own schedule |
| Staff selection by caller | No — auto-assign whoever is free (caller-choice is future) |
| Source of truth | Our own PostgreSQL database |
| Calendar (Phase 1) | In-app calendar view; optional one-way write to Google Calendar |
| Tech stack | React (frontend) + Node.js/Express (backend) + PostgreSQL + Prisma |
| Architecture | Feature-sliced, frontend/backend split-ready, vendor behind ports/adapters |

---

## 7. Open decisions (decide before the relevant phase, don't block Phase 1)

| Decision | Needed by | Note / recommendation |
|---|---|---|
| LLM choice (Vapi conversation) | Phase 1 testing | Pick by cost-per-minute and quality during testing |
| Reminder channel | Phase 3 | If WhatsApp exists (Phase 2), reuse it; SMS is simplest/most reliable |
| Hosting region & provider | Phase 1 | Must be near us-west-2 for Vapi latency; provider flexible |
| WhatsApp provider (Twilio vs Meta) | Phase 2 | Twilio faster to set up; Meta direct can be cheaper at scale |
| Payment provider | Phase 4 | Stripe is the common default; check regional support |
| When to add own RAG | Phase 2 or 5 | Triggered when WhatsApp/web chat must answer the same questions as voice |
| Self-signup vs super-admin-only onboarding | Phase 6 | Phase 1 assumes super-admin provisions every org |

---

## 8. Key risks & mitigations (researched)

| Risk | Why it matters | Mitigation |
|---|---|---|
| Cross-tenant data leak | One customer seeing another's data is catastrophic for a SaaS | Scope every query by `organization_id`; server-trusted org identity in tool calls; test isolation thoroughly |
| Double-booking | Most damaging receptionist failure | Re-check slot inside the save transaction |
| AI making up answers | Wrong info damages trust | Answer only from the org's KB; when unsure, take a message or transfer to a human |
| Latency / laggy calls | Calls feel broken | Host near us-west-2; keep tool responses fast; keep knowledge files lean |
| Vapi outage or price increase | Platform depends on Vapi | Provider abstraction allows switching (see §5); track per-org cost early |
| Knowledge stuck in Vapi | WhatsApp/web can't use Vapi's KB | Keep master docs in our DB; add own RAG when multi-channel knowledge is needed |
| Privacy / recordings | Legal and trust issue | Consent message, secure storage, retention policy (Phase 6) |
| Provisioning failures | A broken onboarding leaves a customer without a working number | Make provisioning robust with retries, sync status, and clear error states |
| Thin-wrapper perception | "Why not use Vapi directly?" | Value lives in multi-tenancy, booking, admin, onboarding, support |

---

## 9. What's been decided about HOW to build it (architecture research)

These choices come from the scalability requirements and are detailed in the Scope (02) and Claude Code Plan (03):
- **Feature-sliced codebase** — grouped by business capability, each feature self-contained.
- **Frontend and backend are separate apps** in a monorepo, communicating only over a typed HTTP contract — so a future repo-split or microservice-split is mechanical.
- **Every external vendor sits behind a port (interface); adapters implement them.** Business logic never imports a vendor SDK. This is what makes the voice-provider menu in §5 actionable.
- **Database is the single source of truth;** every Vapi identifier is mirrored locally with sync status.
- **Tests written alongside each task;** multi-tenant isolation is the highest-priority suite.

---

*End of product research document.*

# Test Cases — AI Receptionist SaaS (Phase 1)

**Document 4 of 4** · Companion to: Product Research (01), Scope (02), Claude Code Plan (03)
**Purpose:** the itemized, trackable list of every test to write for Phase 1. Each row has an ID, a type, the thing under test, the scenario, and the expected result. Build tests against this document; check them off as they go green.

**How to read the IDs:** `U-` = unit test, `I-` = integration test (real DB + HTTP), `C-` = frontend component test, `E-` = end-to-end (browser). Numbers are grouped by area.

**Standing expectations for every test**
- No test ever calls real Vapi — the `VoiceProvider` port is replaced with a fake (`packages/test-utils`).
- Integration tests run against a real, disposable Postgres and reset state between tests.
- Anything touching customer data is checked for correct `organizationId` scoping.

---

## 1. Multi-tenancy & isolation (SaaS-critical — highest priority)

These prove no customer can ever see or touch another's data. If any of these fail, nothing else ships.

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| I-ISO-01 | Integration | Tenant scoping | Org A token requests org B's staff list | 403/404; no org B data in body |
| I-ISO-02 | Integration | Tenant scoping | Org A token requests org B's bookings | 403/404; no leakage |
| I-ISO-03 | Integration | Tenant scoping | Org A token requests org B's calls/transcripts | 403/404; no leakage |
| I-ISO-04 | Integration | Tenant scoping | Org A token requests org B's customers | 403/404; no leakage |
| I-ISO-05 | Integration | Tenant scoping | Org A token requests org B's documents | 403/404; no leakage |
| I-ISO-06 | Integration | Tenant scoping | Org A token reads org B's theme | 403/404; no leakage |
| I-ISO-07 | Integration | Tenant scoping | Org A token tries to **write** (PATCH) an org B booking | 403; org B row unchanged |
| I-ISO-08 | Integration | Tenant scoping | Org A token tries to create staff with `organizationId=B` in body | Ignored/overridden to A, or 403 — never written to B |
| I-ISO-09 | Integration | Tenant scoping | Org A token tries to read org B's `OrgVapiConfig` | 403; never returns Vapi ids/keys |
| U-ISO-10 | Unit | DB scoping helper | Customer-data query called without an org id | Throws (fails fast in dev) |
| U-ISO-11 | Unit | Tenant guard | org_admin JWT resolves active org = own org | Returns own `organizationId` |
| U-ISO-12 | Unit | Tenant guard | org_admin passes a different `X-Org-Id` | Rejected (403) |
| U-ISO-13 | Unit | Tenant guard | super_admin with `X-Org-Id=A` | Active org = A |
| U-ISO-14 | Unit | Tenant guard | super_admin with no `X-Org-Id` | Active org = none (platform view) |

---

## 2. Authentication & roles (RBAC)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-AUTH-01 | Unit | Password hashing | Hash then verify correct password | Verify true |
| U-AUTH-02 | Unit | Password hashing | Verify wrong password | Verify false |
| U-AUTH-03 | Unit | JWT | Issue + verify valid access token | Decodes with correct claims (role, org) |
| U-AUTH-04 | Unit | JWT | Verify expired token | Rejected |
| U-AUTH-05 | Unit | JWT | Verify tampered/garbage token | Rejected |
| U-AUTH-06 | Unit | Role guard | Matrix: each role vs each protected route | Allowed/denied per spec |
| I-AUTH-07 | Integration | Login | Valid credentials | 200 + access & refresh tokens |
| I-AUTH-08 | Integration | Login | Invalid credentials | 401; no token |
| I-AUTH-09 | Integration | Refresh | Valid refresh token | New access token |
| I-AUTH-10 | Integration | Refresh | Expired/invalid refresh token | 401 |
| I-AUTH-11 | Integration | RBAC over HTTP | org_admin hits a super-admin-only route | 403 |
| I-AUTH-12 | Integration | RBAC over HTTP | org_staff hits an org_admin-only write | 403 |
| I-AUTH-13 | Integration | RBAC over HTTP | org_admin requests any Vapi key/id field | Never present in response |
| I-AUTH-14 | Integration | `/auth/me` | Valid token | Returns the user's role + org |

---

## 3. Booking engine (core business logic)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-BOOK-01 | Unit | Availability | Open slots from schedule minus nothing | All working slots returned |
| U-BOOK-02 | Unit | Availability | Slot overlapping existing booking | That slot excluded |
| U-BOOK-03 | Unit | Availability | Slot inside a time-off block | That slot excluded |
| U-BOOK-04 | Unit | Availability | Service duration longer than remaining window | Slot excluded near end of day |
| U-BOOK-05 | Unit | Availability | Org timezone applied correctly | Slots in org-local time |
| U-BOOK-06 | Unit | Availability | DST boundary day | No phantom/missing hour |
| U-BOOK-07 | Unit | Availability | No staff scheduled that day | Empty list (not error) |
| U-BOOK-08 | Unit | Auto-assign | Two staff free, one busy | Picks a free one |
| U-BOOK-09 | Unit | Auto-assign | All staff busy at that time | No assignment / clear "none free" |
| U-BOOK-10 | Unit | Double-booking guard | Two concurrent books for the same slot/staff | Exactly one succeeds; other rejected |
| U-BOOK-11 | Unit | Double-booking guard | Re-check inside transaction sees slot taken | Aborts, no row written |
| U-BOOK-12 | Unit | Booking event | Successful book | Publishes `BookingCreated` once |
| U-BOOK-13 | Unit | Edge | Zero-length or negative service duration | Rejected with validation error |
| I-BOOK-14 | Integration | Booking flow | check availability → book → check again | Booked slot no longer offered |
| I-BOOK-15 | Integration | Concurrency | Fire two book requests at the same slot in parallel | One 200, one conflict; one DB row |
| I-BOOK-16 | Integration | Cancel | Cancel a booking via API | Status=cancelled; slot frees up |
| I-BOOK-17 | Integration | Edit | Reschedule a booking | New slot checked for conflicts before save |

---

## 4. Receptionist tools (channel-agnostic)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-TOOL-01 | Unit | check_availability | Valid args | Returns slots for that org/service/date |
| U-TOOL-02 | Unit | book_appointment | Valid args | Books + returns confirmation |
| U-TOOL-03 | Unit | book_appointment | Slot just taken | Returns "not available", no crash |
| U-TOOL-04 | Unit | lookup_customer | Known phone number | Returns the customer (this org only) |
| U-TOOL-05 | Unit | lookup_customer | Unknown number | Returns "not found", not an error |
| U-TOOL-06 | Unit | All tools | Given org A id | Never reads org B data |
| U-TOOL-07 | Unit | Tool I/O | Payloads validate against `tools.schema.ts` | Invalid args rejected |

---

## 5. Voice provider adapter (Vapi) & webhooks

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-VAPI-01 | Unit | Mapper | Vapi tool-call payload → NormalizedToolCall | Correct org, function, args, `toolCallId` |
| U-VAPI-02 | Unit | Mapper | Tool result → Vapi response shape | Echoes same `toolCallId` |
| U-VAPI-03 | Unit | Mapper | Vapi call-ended report → NormalizedCallRecord | All ids + cost + endedReason mapped |
| U-VAPI-04 | Unit | Provider | `provisionOrg` happy path (fake client) | Returns neutral ids shape |
| U-VAPI-05 | Unit | Provider | Vapi returns error | Throws typed, non-retriable surfaced |
| I-VAPI-06 | Integration | Tool webhook | POST simulated tool-call to `/webhook/voice/tools` | Correct tool runs, scoped to static-param org, response echoes `toolCallId` |
| I-VAPI-07 | Integration | Tool webhook | Payload with org A static param can't touch org B | Scoped to A only |
| I-VAPI-08 | Integration | Call-ended webhook | POST call-ended report | `Call` row saved with all Vapi ids, tagged to org |
| I-VAPI-09 | Integration | Call-ended webhook | Re-POST same `vapiCallId` | Updates existing row; no duplicate |
| I-VAPI-10 | Integration | Webhook | Malformed payload | 4xx, no crash, nothing written |

---

## 6. Provisioning & Vapi sync

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| I-PROV-01 | Integration | Provision | Create org → provision (fake provider) | `OrgVapiConfig` + `VapiTool` rows saved; `syncStatus=synced` |
| I-PROV-02 | Integration | Provision | Provider fails mid-way | `syncStatus=failed` + `syncError`; partial ids kept |
| I-PROV-03 | Integration | Idempotency | Re-run provision when ids already exist | Reuses ids; no duplicate created |
| I-PROV-04 | Integration | Re-sync | Trigger re-sync | Re-reads by stored ids; refreshes status |
| I-PROV-05 | Integration | Reconcile | Stored id 404s in (fake) Vapi | Flagged `stale` |
| U-PROV-06 | Unit | Sync status | Status transitions pending→synced→failed→stale | Only valid transitions allowed |

---

## 7. Knowledge base

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| I-KB-01 | Integration | Upload | Upload a doc | Master `Document` stored for that org only |
| I-KB-02 | Integration | Push to KB | Upload triggers `uploadKnowledgeFile` via port | `KnowledgeBaseFile` row with `vapiFileId`, `syncStatus=synced` |
| I-KB-03 | Integration | Delete | Delete a doc | Removed from both master + KB-file row |
| I-KB-04 | Integration | Push failure | Provider rejects file | `syncStatus=failed`; retryable |
| I-KB-05 | Integration | Isolation | Org A lists docs | Sees only A's docs |
| U-KB-06 | Unit | File guard | File over size limit | Rejected with clear error |

---

## 8. Theme / branding config

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-THEME-01 | Unit | Resolver | platform default only | Returns platform values |
| U-THEME-02 | Unit | Resolver | org override on top of default | Override wins; unset fall back to default |
| U-THEME-03 | Unit | Resolver | user light/dark toggle | Correct mode's tokens applied |
| U-THEME-04 | Unit | Validation | Invalid color (not hex/rgba) | Rejected |
| I-THEME-05 | Integration | Save org theme | org_admin PUT /theme | Persists; re-resolves on reload |
| I-THEME-06 | Integration | Save platform theme | super-admin PUT /platform-theme | New orgs inherit it |
| I-THEME-07 | Integration | Access | org_admin tries PUT /platform-theme | 403 |
| C-THEME-08 | Component | Theme page | Change accent in picker | CSS variables update live |
| C-THEME-09 | Component | Theme page | Low-contrast combo (accent vs on-accent) | Non-blocking contrast warning shows |
| C-THEME-10 | Component | Theme page | "Reset to platform default" | Reverts overrides |

---

## 9. Org switcher (super-admin)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| I-SW-01 | Integration | Switch | super-admin sets `X-Org-Id=A` | Reads return only A's data |
| I-SW-02 | Integration | Switch | switch to `X-Org-Id=B` | Reads now return only B's data |
| I-SW-03 | Integration | Platform view | no `X-Org-Id` | All-orgs/platform view |
| C-SW-04 | Component | Switcher UI | super-admin sees switcher | Dropdown lists orgs + "All organizations" |
| C-SW-05 | Component | Switcher UI | org_admin logs in | No switcher rendered |
| C-SW-06 | Component | Switcher UI | Select an org | "Acting as {org}" indicator appears; views rescope |

---

## 10. Credential security (per-customer Vapi key)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| U-SEC-01 | Unit | Encryption | Encrypt then decrypt a key | Round-trips to original |
| U-SEC-02 | Unit | Encryption | Stored value | Ciphertext, not plaintext |
| U-SEC-03 | Unit | Display | Key for display | Only last-4 returned |
| I-SEC-04 | Integration | Settings API | Save per-customer key | Stored encrypted; response has only last-4 |
| I-SEC-05 | Integration | Settings API | GET settings | Plaintext key never in any response body |
| I-SEC-06 | Integration | Test-key button | Validate a wrong (public) key | Server reports invalid before save |
| C-SEC-07 | Component | Settings page | Key input field | Masked; plaintext never rendered back into DOM |

---

## 11. How-to-use / help page

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| C-HELP-01 | Component | Help page | Open as super-admin | Shows onboarding + Vapi-setup sections |
| C-HELP-02 | Component | Help page | Open as org_admin | Hides super-admin/Vapi-key sections |
| C-HELP-03 | Component | Help page | Active theme | Page respects current theme tokens |

---

## 12. End-to-end smoke (optional, Playwright)

| ID | Type | Under test | Scenario | Expected result |
|---|---|---|---|---|
| E-01 | E2E | Full happy path | super-admin logs in → creates org → switches in → adds service/staff/schedule → books via UI → sees it on calendar + bookings list | All steps succeed in the browser |
| E-02 | E2E | Isolation in UI | Switch from org A to org B | UI shows B's data, never A's |

---

## Coverage priorities (where to be strict)

Keep coverage **high** on these — they're where a bug is most damaging:
1. Multi-tenant isolation (Section 1) — a leak here is catastrophic for a SaaS.
2. Booking engine, especially the double-booking guard (Section 3).
3. Tenant guard + auth/RBAC (Sections 1–2).
4. Vapi mapper + webhook echo (Section 5) — the integration most likely to break silently.
5. Credential encryption (Section 10).

UI/component and e2e coverage can be lighter; the CI gate (Task 1.9.6) enforces the floor only on the critical modules above.

---

*End of test-case document. Build against this list; each green test is one row checked off.*

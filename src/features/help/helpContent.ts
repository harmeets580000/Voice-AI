/**
 * Help content as editable Markdown (doc 03 §1.7.7). Role-aware: super-admin sees the
 * onboarding + Vapi sections; org admins see only the customer-facing guide.
 */

export const HOW_A_CALL_WORKS = `
## How a call works

1. A caller dials your organization's phone number.
2. **Vapi** answers and runs the conversation with your AI receptionist.
3. When the caller asks about availability or wants to book, the assistant calls our
   tools (check availability → book appointment → look up customer), scoped to your
   organization.
4. The booking is saved in our database (the source of truth) and a free staff member is
   auto-assigned — never double-booked.
5. When the call ends, the transcript, recording, and summary are saved to your **Calls**
   view.
`;

export const ORG_ADMIN_GUIDE = `
# Using your receptionist

${HOW_A_CALL_WORKS}

## Set up your business
- **Staff** — add the people who take appointments.
- **Services** — add what you offer and how long each takes.
- **Schedules** — set each staff member's weekly working hours; add **time off** for one-off
  closures. Availability is computed from schedules minus time-off minus existing bookings.

## Day to day
- **Bookings** — see upcoming appointments; create one by picking a service + date and
  choosing an open slot; cancel or reschedule as needed.
- **Calendar** — a month/week view of all bookings.
- **Customers** — search past callers and see their details.
- **Calls** — read transcripts, play recordings, and read call summaries.
- **Knowledge** — upload documents your receptionist can answer questions from.
- **Theme** — recolor your organization's view; switch light/dark.
`;

export const SUPER_ADMIN_GUIDE = `
# Super-admin guide

${ORG_ADMIN_GUIDE}

---

# Operating the platform (super-admin only)

## Onboard a customer
1. Go to **Organizations → New organization**. This creates the org, its default theme, an
   empty Vapi config, and an org-admin login (note the temporary password shown once).
2. Open the org's **Vapi settings** and set the greeting, system prompt, voice, and LLM
   model.
3. (Optional) Enter a **per-customer Vapi private key** — it's validated, stored encrypted,
   and only the last 4 are ever shown. Leave blank to use the platform key.
4. Click **Provision** to create the assistant, phone number, and tools in Vapi. Every Vapi
   id is mirrored locally with a sync status; **Re-sync** re-reads them.
5. Upload **Knowledge** documents so the assistant can answer questions.

## Switching between customers
Use the **org switcher** in the top bar. With an org selected you act exactly as that
customer would see it (an "Acting as …" banner shows which). With none selected you get the
platform (all-orgs) view.

## Platform defaults
**Platform voice** sets the defaults new orgs inherit (voice, model, prompt templates,
public webhook URL, platform key). **Theme → Platform default** sets the global look every
org inherits unless they override it.
`;

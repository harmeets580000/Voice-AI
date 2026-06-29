/**
 * Help content as editable Markdown. Role-aware: super-admin sees the onboarding + Vapi sections;
 * org admins see only the customer-facing guide. Lives under the Inbound nav section.
 */

export const HOW_A_CALL_WORKS = `
## How an inbound call works

1. A caller dials one of your **assistants'** phone numbers — each assistant has its own number.
2. The **assistant** answers and runs the conversation with its own greeting, system prompt, and voice.
3. When the caller asks about availability or wants to book, the assistant runs its selected **tools**
   (check availability → book appointment → look up customer) — limited to the **services and staff you
   assigned to that assistant** — and answers questions from its selected **knowledge** documents.
4. The booking is written to our database (the source of truth) and a free staff member is
   auto-assigned — never double-booked. It appears under **Bookings** and **Calendar**.
5. When the call ends, the transcript, recording, cost, and summary are saved under **Calls**.

Your portal and Vapi stay in sync automatically: assistants and their config are pulled from Vapi every
~60 seconds, and adding or editing an assistant in the portal is pushed straight to Vapi.
`;

export const ORG_ADMIN_GUIDE = `
# Using your receptionist

${HOW_A_CALL_WORKS}

## Set up (in order)
- **Services** — what you offer and how long each takes.
- **Staff** — the people who take appointments.
- **Schedules** — each staff member's weekly hours; add **time off** for one-off closures. Availability
  is schedules − time off − existing bookings.
- **Knowledge** — upload documents your assistant can answer from.
- **Tools** — the actions an assistant can take on a call (the three booking tools are built in).
- **Assistants** — the hub. Create an assistant, then on its page choose which **services, staff,
  knowledge, and tools** it uses (no selection = it offers everything).

## Day to day
- **Dashboard** — calls, bookings, revenue, and conversion at a glance.
- **Bookings** — upcoming appointments; create one by picking a service + date and an open slot; cancel
  or reschedule as needed.
- **Calendar** — a month/week view of all bookings.
- **Customers** — search past callers and see their details.
- **Calls** — read transcripts, play recordings, and read call summaries.
`;

export const SUPER_ADMIN_GUIDE = `
# Super-admin guide

${ORG_ADMIN_GUIDE}

---

# Operating the platform (super-admin only)

## Onboard a customer
1. Go to **Super admin → Vapi Settings → New organization**. This creates the org, its default theme, an
   empty Vapi connection, and an org-admin login (note the temporary password shown once).
2. Select the org in the **org switcher**, open **Vapi Settings**, and add its **Vapi private key** —
   it's validated, stored encrypted, and only the last 4 are ever shown. Leave blank to use the platform key.
3. Go to **Assistants → Add** to create an assistant — it's created in Vapi (assistant + phone number +
   tools) with its sync status shown. Open it to pick its services, staff, knowledge, and tools.
4. Upload **Knowledge** documents so the assistant can answer questions.

## Switching between customers
Use the **org switcher** in the top bar. With an org selected you act exactly as that customer would (an
"Acting as …" banner shows which). With none selected you get the **platform dashboard** (all orgs).

## Keeping in sync
The background poller pulls every keyed org's Vapi data (assistants, config, tools, calls) every ~60s,
and **Sync from Vapi** on the Assistants page pulls immediately. Changes you make in the portal (add or
edit an assistant) are pushed to Vapi.
`;

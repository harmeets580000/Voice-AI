/**
 * Seed: one super-admin + two isolated demo organizations (so org switching and tenant
 * isolation are testable from day one). Idempotent via upsert on unique keys.
 *
 * Run: npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "../src/server/platform/auth/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function seedOrg(opts: {
  slug: string;
  name: string;
  timezone: string;
  adminEmail: string;
  staff: { name: string; email: string; title: string }[];
  services: { name: string; durationMinutes: number; price: number }[];
}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const org = await prisma.organization.upsert({
    where: { slug: opts.slug },
    update: { name: opts.name, timezone: opts.timezone },
    create: {
      slug: opts.slug,
      name: opts.name,
      timezone: opts.timezone,
      status: "active",
      theme: { create: { tokens: {} as Prisma.InputJsonValue } },
      vapiConfig: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: { email: opts.adminEmail },
    update: { organizationId: org.id, role: "org_admin" },
    create: {
      email: opts.adminEmail,
      name: `${opts.name} Admin`,
      passwordHash,
      role: "org_admin",
      organizationId: org.id,
    },
  });

  // Staff (idempotent-ish: clear and recreate the demo staff/services for this org)
  await prisma.staffSchedule.deleteMany({ where: { organizationId: org.id } });
  await prisma.staff.deleteMany({ where: { organizationId: org.id } });
  await prisma.service.deleteMany({ where: { organizationId: org.id } });

  for (const s of opts.staff) {
    const staff = await prisma.staff.create({
      data: {
        organizationId: org.id,
        name: s.name,
        email: s.email,
        title: s.title,
      },
    });
    // Mon–Fri 09:00–17:00
    for (let day = 1; day <= 5; day++) {
      await prisma.staffSchedule.create({
        data: {
          organizationId: org.id,
          staffId: staff.id,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "17:00",
        },
      });
    }
  }

  for (const svc of opts.services) {
    await prisma.service.create({
      data: {
        organizationId: org.id,
        name: svc.name,
        durationMinutes: svc.durationMinutes,
        price: new Prisma.Decimal(svc.price),
      },
    });
  }

  return org;
}

/**
 * Ensure an org-admin login exists for an org WITHOUT touching its staff/services/schedules.
 * Use this for slugs that may belong to a real org (so re-seeding never destroys real data).
 */
async function ensureLoginOnly(opts: {
  slug: string;
  name: string;
  timezone: string;
  adminEmail: string;
}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let org = await prisma.organization.findUnique({ where: { slug: opts.slug } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        slug: opts.slug,
        name: opts.name,
        timezone: opts.timezone,
        status: "active",
        theme: { create: { tokens: {} as Prisma.InputJsonValue } },
        vapiConfig: { create: {} },
      },
    });
  }
  await prisma.user.upsert({
    where: { email: opts.adminEmail },
    update: { organizationId: org.id, role: "org_admin" },
    create: {
      email: opts.adminEmail,
      name: `${opts.name} Admin`,
      passwordHash,
      role: "org_admin",
      organizationId: org.id,
    },
  });
  return org;
}

/**
 * Enable Outbound Sales (Product 2) for a demo org and seed a little sample data (contacts, a
 * from-number, an agent, one lead). Idempotent: product/number upserted; sample rows created once.
 */
async function seedOutbound(orgId: string) {
  await prisma.orgProduct.upsert({
    where: {
      organizationId_product: { organizationId: orgId, product: "OUTBOUND_SALES" },
    },
    update: { status: "active", enabledAt: new Date() },
    create: {
      organizationId: orgId,
      product: "OUTBOUND_SALES",
      status: "active",
      enabledAt: new Date(),
    },
  });
  const existing = await prisma.outboundContact.count({
    where: { organizationId: orgId },
  });
  if (existing === 0) {
    const c1 = await prisma.outboundContact.create({
      data: {
        organizationId: orgId,
        name: "Jordan Lee",
        phone: "+14155551234",
        email: "jordan@example.com",
        tags: ["warm"],
        source: "IMPORT",
      },
    });
    await prisma.outboundContact.create({
      data: {
        organizationId: orgId,
        name: "Sam Rivera",
        phone: "+14155555678",
        tags: ["cold"],
        source: "IMPORT",
      },
    });
    await prisma.outboundContact.create({
      data: {
        organizationId: orgId,
        name: "Casey Kim",
        phone: "+14155559012",
        optOut: true,
        source: "IMPORT",
      },
    });
    await prisma.outboundAgent.create({
      data: {
        organizationId: orgId,
        name: "Demo Sales Agent",
        status: "ACTIVE",
        persona: "Friendly SDR",
        openingLine: "Hi, this is Alex from the team!",
        providerPhoneNumber: "+14155550100",
      },
    });
    await prisma.lead.create({
      data: {
        organizationId: orgId,
        contactId: c1.id,
        source: "MANUAL",
        stage: "NEW",
        value: new Prisma.Decimal(1500),
      },
    });
  }

  // Ensure the demo agent has a from-number so "Place call" works out of the box.
  await prisma.outboundAgent.updateMany({
    where: { organizationId: orgId, providerPhoneNumber: null },
    data: { providerPhoneNumber: "+14155550100" },
  });
}

async function main() {
  // Platform-level singletons.
  await prisma.platformTheme.upsert({
    where: { id: "platform" },
    update: {},
    create: { id: "platform", tokens: {} as Prisma.InputJsonValue },
  });
  await prisma.platformVoiceConfig.upsert({
    where: { id: "platform" },
    update: {},
    create: { id: "platform" },
  });

  // Super-admin (no org).
  await prisma.user.upsert({
    where: { email: "superadmin@example.com" },
    update: { role: "super_admin", organizationId: null },
    create: {
      email: "superadmin@example.com",
      name: "Super Admin",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role: "super_admin",
      organizationId: null,
    },
  });

  const orgA = await seedOrg({
    slug: "bright-smile-dental",
    name: "Bright Smile Dental",
    timezone: "America/Los_Angeles",
    adminEmail: "admin@brightsmile.example.com",
    staff: [
      { name: "Dr. Alice Nguyen", email: "alice@brightsmile.example.com", title: "Dentist" },
      { name: "Dr. Ben Carter", email: "ben@brightsmile.example.com", title: "Dentist" },
    ],
    services: [
      { name: "Cleaning", durationMinutes: 30, price: 90 },
      { name: "Check-up", durationMinutes: 60, price: 150 },
    ],
  });

  // Extra convenience logins (org_admin + org_staff) under Bright Smile Dental.
  const simpleHash = await hashPassword("123123");
  await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: { role: "org_admin", organizationId: orgA.id, passwordHash: simpleHash },
    create: {
      email: "admin@gmail.com",
      name: "Admin User",
      passwordHash: simpleHash,
      role: "org_admin",
      organizationId: orgA.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "user1@gmail.com" },
    update: { role: "org_staff", organizationId: orgA.id, passwordHash: simpleHash },
    create: {
      email: "user1@gmail.com",
      name: "Staff User",
      passwordHash: simpleHash,
      role: "org_staff",
      organizationId: orgA.id,
    },
  });

  // Enable Outbound Sales for the first demo org so the module is explorable after seeding.
  await seedOutbound(orgA.id);

  const orgB = await seedOrg({
    slug: "sharp-cuts-barbershop",
    name: "Sharp Cuts Barbershop",
    timezone: "America/New_York",
    adminEmail: "admin@sharpcuts.example.com",
    staff: [
      { name: "Marco Reyes", email: "marco@sharpcuts.example.com", title: "Barber" },
      { name: "Tina Lopez", email: "tina@sharpcuts.example.com", title: "Barber" },
    ],
    services: [
      { name: "Haircut", durationMinutes: 30, price: 35 },
      { name: "Beard Trim", durationMinutes: 20, price: 20 },
    ],
  });

  // H8H login — NON-destructive. The `h8h-demo` slug belongs to a real org, so we only ensure the
  // admin login exists (never wipe staff/services like seedOrg does). Creates a bare org only if
  // none exists yet.
  const orgH = await ensureLoginOnly({
    slug: "h8h-demo",
    name: "H8H Demo",
    timezone: "America/Los_Angeles",
    adminEmail: "admin@h8h.example.com",
  });

  console.log("Seeded:", {
    superAdmin: "superadmin@example.com",
    password: DEMO_PASSWORD,
    orgs: [
      { name: orgA.name, slug: orgA.slug, admin: "admin@brightsmile.example.com" },
      { name: orgB.name, slug: orgB.slug, admin: "admin@sharpcuts.example.com" },
      { name: orgH.name, slug: orgH.slug, admin: "admin@h8h.example.com" },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

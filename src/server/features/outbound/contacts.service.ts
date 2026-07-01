/**
 * Outbound contacts (Product 2) — the sales "Contacts", org-scoped. Self-contained: this is
 * NOT the inbound Customer table. Holds opt-out/DNC + tags/source/customFields, deduped by
 * phone/email. Used by CSV import, segments/audiences, bulk actions, and lead intake (Q3.5).
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";

export interface ContactFilter {
  search?: string;
  tags?: string[];
  source?: string;
  /** When set, filter by opt-out state; omitted = both. Audiences force this to false. */
  optOut?: boolean;
}

export interface ContactInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string | null;
  customFields?: unknown;
  optOut?: boolean;
}

/** Build the Prisma `where` for a contact filter (used by list + audience resolution). */
export function buildContactWhere(
  filter: ContactFilter,
): Prisma.OutboundContactWhereInput {
  const where: Prisma.OutboundContactWhereInput = {};
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: "insensitive" } },
      { phone: { contains: filter.search } },
      { email: { contains: filter.search, mode: "insensitive" } },
    ];
  }
  if (filter.tags && filter.tags.length > 0) {
    where.tags = { hasSome: filter.tags };
  }
  if (filter.source) where.source = filter.source;
  if (filter.optOut !== undefined) where.optOut = filter.optOut;
  return where;
}

export function listContacts(orgId: string, filter: ContactFilter = {}) {
  return tenantDb(orgId).outboundContact.findMany({
    where: buildContactWhere(filter),
    orderBy: { createdAt: "desc" },
  });
}

export function getContact(orgId: string, id: string) {
  return tenantDb(orgId).outboundContact.findFirst({ where: { id } });
}

/** Dedupe lookup: match an existing contact by phone or (case-insensitive) email. */
export function findContactByPhoneOrEmail(
  orgId: string,
  key: { phone?: string | null; email?: string | null },
) {
  const or: Prisma.OutboundContactWhereInput[] = [];
  if (key.phone) or.push({ phone: key.phone });
  if (key.email) or.push({ email: { equals: key.email, mode: "insensitive" } });
  if (or.length === 0) return Promise.resolve(null);
  return tenantDb(orgId).outboundContact.findFirst({ where: { OR: or } });
}

export function createContact(orgId: string, input: ContactInput) {
  return tenantDb(orgId).outboundContact.create({
    data: {
      organizationId: orgId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      source: input.source ?? null,
      customFields: input.customFields as Prisma.InputJsonValue | undefined,
      optOut: input.optOut ?? false,
    },
  });
}

/** Find-or-create by phone/email, backfilling missing name/email/phone. Shared with lead intake. */
export async function findOrCreateContact(orgId: string, input: ContactInput) {
  const existing = await findContactByPhoneOrEmail(orgId, {
    phone: input.phone,
    email: input.email,
  });
  if (existing) {
    const data: Prisma.OutboundContactUpdateInput = {};
    if (!existing.name && input.name) data.name = input.name;
    if (!existing.email && input.email) data.email = input.email;
    if (!existing.phone && input.phone) data.phone = input.phone;
    if (Object.keys(data).length > 0) {
      return tenantDb(orgId).outboundContact.update({
        where: { id: existing.id },
        data,
      });
    }
    return existing;
  }
  return createContact(orgId, input);
}

export async function updateContact(
  orgId: string,
  id: string,
  input: ContactInput,
) {
  const db = tenantDb(orgId);
  const data: Prisma.OutboundContactUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.source !== undefined) data.source = input.source;
  if (input.customFields !== undefined)
    data.customFields = input.customFields as Prisma.InputJsonValue;
  if (input.optOut !== undefined) data.optOut = input.optOut;
  const res = await db.outboundContact.updateMany({ where: { id }, data });
  if (res.count === 0) return null;
  return db.outboundContact.findFirst({ where: { id } });
}

export async function deleteContact(orgId: string, id: string) {
  const res = await tenantDb(orgId).outboundContact.deleteMany({ where: { id } });
  return { deleted: res.count };
}

/** Bulk opt-out / opt-in (used by the Contacts bulk-action bar). */
export async function setContactsOptOut(
  orgId: string,
  ids: string[],
  optOut: boolean,
  reason?: string,
) {
  const res = await tenantDb(orgId).outboundContact.updateMany({
    where: { id: { in: ids } },
    data: { optOut, optOutReason: optOut ? (reason ?? null) : null },
  });
  return { updated: res.count };
}

/** Bulk-add a tag (dedupes so a tag isn't pushed twice). */
export async function addTagToContacts(
  orgId: string,
  ids: string[],
  tag: string,
) {
  const db = tenantDb(orgId);
  const contacts = await db.outboundContact.findMany({
    where: { id: { in: ids } },
  });
  let updated = 0;
  for (const c of contacts) {
    if (!c.tags.includes(tag)) {
      await db.outboundContact.update({
        where: { id: c.id },
        data: { tags: { push: tag } },
      });
      updated++;
    }
  }
  return { updated };
}

export interface ImportRow {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  source?: string;
  customFields?: unknown;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

/**
 * Import contacts from mapped CSV rows: validate, dedupe (in-file and against existing),
 * create, and record a ContactImport audit row. Opt-out is not settable via import.
 */
export async function importContacts(
  orgId: string,
  args: {
    filename: string;
    mapping?: Prisma.InputJsonValue;
    rows: ImportRow[];
  },
): Promise<ImportSummary> {
  const errors: { row: number; reason: string }[] = [];
  let imported = 0;
  let skipped = 0;
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < args.rows.length; i++) {
    const r = args.rows[i];
    const rowNum = i + 1;
    const phone = r.phone?.trim() || null;
    const email = r.email?.trim().toLowerCase() || null;
    const name = r.name?.trim() || null;

    if (!phone && !email && !name) {
      skipped++;
      errors.push({ row: rowNum, reason: "empty row" });
      continue;
    }
    if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) {
      skipped++;
      errors.push({ row: rowNum, reason: "duplicate in file" });
      continue;
    }
    const existing = await findContactByPhoneOrEmail(orgId, { phone, email });
    if (existing) {
      skipped++;
      errors.push({ row: rowNum, reason: "already exists" });
      continue;
    }
    await createContact(orgId, {
      name,
      phone,
      email,
      notes: r.notes ?? null,
      tags: r.tags ?? [],
      source: r.source ?? "IMPORT",
      customFields: r.customFields,
    });
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    imported++;
  }

  await tenantDb(orgId).contactImport.create({
    data: {
      organizationId: orgId,
      filename: args.filename,
      mappingJson: args.mapping,
      totalRows: args.rows.length,
      importedRows: imported,
      skippedRows: skipped,
      errorsJson: errors,
      status: "COMPLETED",
    },
  });

  return { total: args.rows.length, imported, skipped, errors };
}

/**
 * Lead intake (Product 2 §H) — add leads directly via CSV upload or a manual form. Both UPSERT
 * an OutboundContact first (O2: a lead is always backed by a contact), respect opt-out, and
 * dedupe against an existing open lead.
 */

import type { Prisma } from "@prisma/client";
import { tenantDb } from "@server/platform/db/scoped";
import { AppError } from "@server/platform/http/errors";
import { findOrCreateContact } from "./contacts.service";
import {
  createLead,
  findOpenLeadByContact,
  getLead,
  addActivity,
  type LeadStage,
  type LeadDTO,
} from "./leads.service";

export interface LeadImportRow {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  stage?: LeadStage;
  value?: number;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export async function importLeads(
  orgId: string,
  args: {
    filename: string;
    mapping?: Prisma.InputJsonValue;
    rows: LeadImportRow[];
  },
  userId?: string | null,
): Promise<ImportSummary> {
  const db = tenantDb(orgId);
  const record = await db.leadImport.create({
    data: {
      organizationId: orgId,
      filename: args.filename,
      mappingJson: args.mapping,
      totalRows: args.rows.length,
      status: "PENDING",
    },
  });

  const errors: { row: number; reason: string }[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < args.rows.length; i++) {
    const r = args.rows[i];
    const rowNum = i + 1;
    const name = r.name?.trim() || null;
    const phone = r.phone?.trim() || null;
    const email = r.email?.trim().toLowerCase() || null;
    if (!name && !phone && !email) {
      skipped++;
      errors.push({ row: rowNum, reason: "empty row" });
      continue;
    }
    const contact = await findOrCreateContact(orgId, {
      name,
      phone,
      email,
      notes: r.notes ?? null,
      source: "IMPORT",
    });
    if (contact.optOut) {
      skipped++;
      errors.push({ row: rowNum, reason: "contact opted out" });
      continue;
    }
    if (await findOpenLeadByContact(orgId, contact.id)) {
      skipped++;
      errors.push({ row: rowNum, reason: "already has an open lead" });
      continue;
    }
    await createLead(
      orgId,
      {
        contactId: contact.id,
        source: "IMPORT",
        stage: r.stage,
        value: r.value ?? null,
        leadImportId: record.id,
      },
      userId,
    );
    imported++;
  }

  await db.leadImport.update({
    where: { id: record.id },
    data: {
      importedRows: imported,
      skippedRows: skipped,
      errorsJson: errors,
      status: "COMPLETED",
    },
  });

  return { total: args.rows.length, imported, skipped, errors };
}

export interface ManualLeadInput {
  name?: string;
  phone?: string;
  email?: string;
  stage?: LeadStage;
  value?: number;
  ownerUserId?: string;
  note?: string;
}

/**
 * Create a lead from the manual form. Upserts the contact; if the contact already has an open
 * lead, returns THAT lead (existed=true) rather than duplicating. Opt-out is a hard block.
 */
export async function createManualLead(
  orgId: string,
  input: ManualLeadInput,
  userId?: string | null,
): Promise<{ lead: LeadDTO; existed: boolean }> {
  if (!input.name && !input.phone && !input.email) {
    throw AppError.badRequest("Provide a name, phone, or email");
  }
  const contact = await findOrCreateContact(orgId, {
    name: input.name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    source: "MANUAL",
  });
  if (contact.optOut) {
    throw AppError.badRequest("This contact has opted out and cannot be a lead");
  }
  const open = await findOpenLeadByContact(orgId, contact.id);
  if (open) {
    return { lead: (await getLead(orgId, open.id))!, existed: true };
  }
  const lead = await createLead(
    orgId,
    {
      contactId: contact.id,
      source: "MANUAL",
      stage: input.stage,
      value: input.value ?? null,
      ownerUserId: input.ownerUserId,
    },
    userId,
  );
  if (input.note) {
    await addActivity(orgId, lead.id, "NOTE", { note: input.note }, userId);
  }
  return { lead: (await getLead(orgId, lead.id))!, existed: false };
}

/**
 * Org-level settings (currently the display date format). Stored on the Organization row.
 */

import { prisma } from "@server/platform/db/client";
import { AppError } from "@server/platform/http/errors";
import { DEFAULT_DATE_FORMAT, type DateFormat } from "@contracts/settings";

export async function getOrgSettings(
  orgId: string | null,
): Promise<{ dateFormat: DateFormat }> {
  if (!orgId) return { dateFormat: DEFAULT_DATE_FORMAT as DateFormat };
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { dateFormat: true },
  });
  return {
    dateFormat: (org?.dateFormat ?? DEFAULT_DATE_FORMAT) as DateFormat,
  };
}

export async function updateOrgSettings(
  orgId: string,
  input: { dateFormat: DateFormat },
): Promise<{ dateFormat: DateFormat }> {
  const org = await prisma.organization
    .update({
      where: { id: orgId },
      data: { dateFormat: input.dateFormat },
      select: { dateFormat: true },
    })
    .catch(() => {
      throw AppError.notFound("Organization not found");
    });
  return { dateFormat: org.dateFormat as DateFormat };
}

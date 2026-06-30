/**
 * Booking notifications — composes and sends the customer-facing confirmation email through the
 * EmailProvider PORT (SendGrid in prod, fake/log in dev/tests). Best-effort: callers should not let
 * an email failure roll back a confirmation, so this never throws — it returns whether it sent.
 */

import { DateTime } from "luxon";
import { prisma } from "@server/platform/db/client";
import { tenantDb } from "@server/platform/db/scoped";
import { getEmailProvider } from "@server/config/providers";
import { logger } from "@server/platform/logging/logger";

export async function sendBookingConfirmationEmail(
  orgId: string,
  bookingId: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const booking = await tenantDb(orgId).booking.findFirst({
      where: { id: bookingId },
      include: { customer: true, service: true, staff: true },
    });
    if (!booking) return { sent: false, reason: "booking not found" };
    const email = booking.customer?.email?.trim();
    if (!email) {
      logger.warn("Booking confirmation skipped — customer has no email", {
        orgId,
        bookingId,
      });
      return { sent: false, reason: "no customer email" };
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, timezone: true },
    });
    const tz = org?.timezone ?? "UTC";
    const when = DateTime.fromJSDate(booking.startDatetime)
      .setZone(tz)
      .toFormat("cccc, LLL d, yyyy 'at' h:mm a");

    const orgName = org?.name ?? "your appointment";
    const serviceName = booking.service?.name ?? "your appointment";
    const staffName = booking.staff?.name;
    const customerName = booking.customer?.name ?? "there";

    const lines = [
      `Hi ${customerName},`,
      ``,
      `Your appointment with ${orgName} is confirmed.`,
      ``,
      `Service: ${serviceName}`,
      `When: ${when} (${tz})`,
      ...(staffName ? [`With: ${staffName}`] : []),
      ``,
      `If you need to change or cancel, just reply or give us a call.`,
    ];
    const text = lines.join("\n");
    const html = `<div style="font-family:sans-serif;line-height:1.5">${lines
      .map((l) => (l === "" ? "<br/>" : `<p style="margin:0 0 8px">${l}</p>`))
      .join("")}</div>`;

    await getEmailProvider().sendEmail({
      to: email,
      subject: `Appointment confirmed — ${serviceName} on ${when}`,
      text,
      html,
    });
    logger.info("Booking confirmation email sent", { orgId, bookingId, to: email });
    return { sent: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    logger.error("Booking confirmation email failed", { orgId, bookingId, reason });
    return { sent: false, reason };
  }
}

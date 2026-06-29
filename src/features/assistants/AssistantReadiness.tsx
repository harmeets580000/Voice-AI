"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/api/client";
import { Card, cx } from "@shared/ui/primitives";
import { CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import type { AssistantDTO } from "@contracts/assistants";

type Status = "ok" | "warn" | "optional";

function Row({
  status,
  label,
  detail,
  fixHref,
  fixLabel,
}: {
  status: Status;
  label: string;
  detail: string;
  fixHref?: string;
  fixLabel?: string;
}) {
  const Icon =
    status === "ok" ? CheckCircle2 : status === "warn" ? AlertTriangle : MinusCircle;
  const tone =
    status === "ok"
      ? "text-positive"
      : status === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-faint";
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon size={16} className={cx("mt-0.5 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
      {status === "warn" && fixHref && (
        <Link
          href={fixHref}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          {fixLabel ?? "Fix"}
        </Link>
      )}
    </li>
  );
}

/** At-a-glance "is this assistant ready to take calls?" checklist on the detail page. */
export function AssistantReadiness({
  orgId,
  assistant,
}: {
  orgId: string;
  assistant: AssistantDTO;
}) {
  const services = useQuery({
    queryKey: ["services", orgId],
    queryFn: () => api.get<{ services: { id: string }[] }>("/services"),
  });
  const staff = useQuery({
    queryKey: ["staff", orgId],
    queryFn: () =>
      api.get<{ staff: { id: string; isActive: boolean }[] }>("/staff"),
  });
  const schedules = useQuery({
    queryKey: ["schedules", orgId],
    queryFn: () => api.get<{ schedules: { staffId: string }[] }>("/schedules"),
  });

  const orgServiceCount = services.data?.services.length ?? 0;
  const activeStaff = (staff.data?.staff ?? []).filter((s) => s.isActive);
  const scheduledStaffIds = new Set(
    (schedules.data?.schedules ?? []).map((s) => s.staffId),
  );

  // Empty per-assistant selection means "offer everything", so the effective set falls back to all.
  const effectiveServiceCount = assistant.selectedServiceIds.length || orgServiceCount;
  const effectiveStaffIds =
    assistant.selectedStaffIds.length > 0
      ? assistant.selectedStaffIds
      : activeStaff.map((s) => s.id);
  const bookableStaff = effectiveStaffIds.filter((id) => scheduledStaffIds.has(id));

  // Live in Vapi.
  const live: Status =
    assistant.syncStatus === "synced" && assistant.providerAssistantId
      ? "ok"
      : "warn";

  // Bookable-staff messaging.
  let staffStatus: Status = "ok";
  let staffDetail = `${bookableStaff.length} staff member(s) available to book.`;
  let staffFix: { href: string; label: string } | undefined;
  if (bookableStaff.length === 0) {
    staffStatus = "warn";
    if (activeStaff.length === 0) {
      staffDetail = "No active staff yet — add someone who takes appointments.";
      staffFix = { href: "/staff", label: "Add staff" };
    } else {
      staffDetail = "Staff exist but none have a weekly schedule, so no slots are bookable.";
      staffFix = { href: "/schedules", label: "Add schedule" };
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-semibold text-text">Setup status</h2>
      <p className="mb-2 text-xs text-muted">
        What this assistant needs to answer and book appointments.
      </p>
      <ul className="divide-y divide-border">
        <Row
          status={live}
          label="Live in Vapi"
          detail={
            live === "ok"
              ? "Created and synced with Vapi."
              : assistant.syncError ||
                "Not provisioned yet — use Provision above to create it in Vapi."
          }
        />
        <Row
          status={effectiveServiceCount > 0 ? "ok" : "warn"}
          label="Offers a service"
          detail={
            effectiveServiceCount > 0
              ? `Can book ${effectiveServiceCount} service(s).`
              : "No services yet — add at least one bookable service."
          }
          fixHref="/services"
          fixLabel="Add service"
        />
        <Row
          status={staffStatus}
          label="Has bookable staff"
          detail={staffDetail}
          fixHref={staffFix?.href}
          fixLabel={staffFix?.label}
        />
        <Row
          status={assistant.providerPhoneNumber ? "ok" : "optional"}
          label="Phone number"
          detail={
            assistant.providerPhoneNumber
              ? `📞 ${assistant.providerPhoneNumber}`
              : "Optional — none yet. Test with the Simulator, or provision a number to take live calls."
          }
        />
        <Row
          status={assistant.selectedKnowledgeFileIds.length > 0 ? "ok" : "optional"}
          label="Knowledge"
          detail={
            assistant.selectedKnowledgeFileIds.length > 0
              ? `${assistant.selectedKnowledgeFileIds.length} document(s) selected.`
              : "Optional — add documents the assistant can answer questions from."
          }
        />
      </ul>
    </Card>
  );
}

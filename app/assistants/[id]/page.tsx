"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@shared/ui/AppShell";
import { AssistantDetailPage } from "@features/assistants/AssistantDetailPage";

export default function AssistantDetailRoute() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <AssistantDetailPage assistantId={params.id} />
    </AppShell>
  );
}

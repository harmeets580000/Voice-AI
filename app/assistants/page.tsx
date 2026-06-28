"use client";

import { AppShell } from "@shared/ui/AppShell";
import { AssistantsPage } from "@features/assistants/AssistantsPage";

export default function AssistantsRoute() {
  return (
    <AppShell>
      <AssistantsPage />
    </AppShell>
  );
}

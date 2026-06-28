"use client";

import { AppShell } from "@shared/ui/AppShell";
import { VapiTesterPage } from "@features/vapi-tester/VapiTesterPage";

export default function VapiTesterRoute() {
  return (
    <AppShell>
      <VapiTesterPage />
    </AppShell>
  );
}

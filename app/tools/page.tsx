"use client";

import { AppShell } from "@shared/ui/AppShell";
import { ToolCatalogPage } from "@features/tools/ToolCatalogPage";

export default function ToolsRoute() {
  return (
    <AppShell>
      <ToolCatalogPage />
    </AppShell>
  );
}

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { hasTestDb, truncateAll, disconnect, prisma } from "./helpers/db";
import { createOrg } from "./helpers/factories";
import {
  saveOrgOverride,
  getResolvedTheme,
  savePlatformTheme,
} from "@server/features/theme/theme.service";

describe.skipIf(!hasTestDb)("theme persistence (I-THEME-05/06)", () => {
  beforeEach(async () => {
    await truncateAll();
    await prisma.platformTheme.upsert({
      where: { id: "platform" },
      update: { tokens: {} },
      create: { id: "platform", tokens: {} },
    });
  });
  afterAll(async () => {
    await disconnect();
  });

  it("I-THEME-05: saving an org override persists and re-resolves", async () => {
    const org = await createOrg();
    await saveOrgOverride(org.id, { light: { accent: "#123456" } });
    const { theme } = await getResolvedTheme(org.id);
    expect(theme.light.accent).toBe("#123456");
    // Unset tokens still fall back to the platform default.
    expect(theme.light.bg).toBeTruthy();
  });

  it("I-THEME-06: a platform default is inherited by an org with no override", async () => {
    await savePlatformTheme({ light: { accent: "#abcdef" } });
    const org = await createOrg();
    const { theme } = await getResolvedTheme(org.id);
    expect(theme.light.accent).toBe("#abcdef");
  });
});

/**
 * Theme feature service: read the resolved theme for the active org, save an org override,
 * and save the platform-wide default. Storage is "overrides only" — unset tokens fall back
 * to the platform default (doc 03 §1.3.2).
 */

import { prisma } from "@server/platform/db/client";
import { resolveTheme } from "@theme/resolve";
import { defaultTheme } from "@theme/tokens";
import type { Theme, ThemeOverride } from "@theme/tokens";
import type { ThemeDTO, ThemeOverrideDTO } from "@contracts/theme";

const PLATFORM_ID = "platform";

/** Load the platform default theme (full), falling back to the built-in default. */
export async function getPlatformTheme(): Promise<Theme> {
  const row = await prisma.platformTheme.findUnique({
    where: { id: PLATFORM_ID },
  });
  const stored = (row?.tokens ?? null) as ThemeOverride | null;
  // The platform row stores a (possibly partial) theme; layer it on the built-in default.
  return resolveTheme(defaultTheme, stored);
}

/** Load an org's raw override (or null). */
export async function getOrgOverride(
  organizationId: string,
): Promise<ThemeOverride | null> {
  const row = await prisma.orgTheme.findUnique({ where: { organizationId } });
  if (!row) return null;
  const tokens = (row.tokens ?? {}) as ThemeOverride;
  return {
    ...tokens,
    defaultMode: row.defaultMode as ThemeOverride["defaultMode"],
    allowUserToggle: row.allowUserToggle,
  };
}

/** Resolve the effective theme for an org (platform default + org override). */
export async function getResolvedTheme(organizationId: string | null): Promise<{
  theme: ThemeDTO;
  override: ThemeOverride | null;
}> {
  const platform = await getPlatformTheme();
  const override = organizationId ? await getOrgOverride(organizationId) : null;
  return { theme: resolveTheme(platform, override) as ThemeDTO, override };
}

/** Platform view (no org) just returns the platform default. */
export async function getPlatformResolved(): Promise<ThemeDTO> {
  return (await getPlatformTheme()) as ThemeDTO;
}

/** Save an org's override (stores only the overrides). */
export async function saveOrgOverride(
  organizationId: string,
  override: ThemeOverrideDTO,
): Promise<ThemeDTO> {
  const { defaultMode, allowUserToggle, ...tokenOverrides } = override;
  await prisma.orgTheme.upsert({
    where: { organizationId },
    update: {
      tokens: tokenOverrides,
      ...(defaultMode ? { defaultMode } : {}),
      ...(allowUserToggle !== undefined ? { allowUserToggle } : {}),
    },
    create: {
      organizationId,
      tokens: tokenOverrides,
      defaultMode: defaultMode ?? "light",
      allowUserToggle: allowUserToggle ?? true,
    },
  });
  const { theme } = await getResolvedTheme(organizationId);
  return theme;
}

/** Save the platform-wide default theme. */
export async function savePlatformTheme(
  override: ThemeOverrideDTO,
): Promise<ThemeDTO> {
  await prisma.platformTheme.upsert({
    where: { id: PLATFORM_ID },
    update: { tokens: override },
    create: { id: PLATFORM_ID, tokens: override },
  });
  return (await getPlatformTheme()) as ThemeDTO;
}

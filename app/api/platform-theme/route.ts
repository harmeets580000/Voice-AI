import { handleRoute, ok } from "@server/platform/http/responses";
import { PutThemeRequest, type PutThemeResponse } from "@contracts/theme";
import { requireRole } from "@server/platform/auth/context";
import { Role } from "@domain/enums";
import { savePlatformTheme } from "@server/features/theme/theme.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save the platform-wide default theme. Super-admin only (test I-THEME-07). */
export const PUT = handleRoute(async (req) => {
  await requireRole([Role.SUPER_ADMIN]);
  const body = PutThemeRequest.parse(await req.json());
  const theme = await savePlatformTheme(body);
  const res: PutThemeResponse = { theme };
  return ok(res);
});

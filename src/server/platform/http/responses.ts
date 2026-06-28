/**
 * Route-handler helpers: consistent JSON success/error envelopes + a wrapper that
 * catches thrown AppErrors and Zod errors and turns them into proper responses.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "@server/platform/logging/logger";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Wrap a route handler so any thrown AppError / ZodError becomes a clean JSON error
 * and unexpected errors become a 500 (without leaking internals).
 */
export function handleRoute(
  fn: (req: Request, ctx: unknown) => Promise<NextResponse> | NextResponse,
) {
  return async (req: Request, ctx: unknown): Promise<NextResponse> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return errorResponse(err.code, err.message, err.status, err.details);
      }
      if (err instanceof ZodError) {
        return errorResponse(
          "validation_error",
          "Validation failed",
          422,
          err.flatten(),
        );
      }
      logger.error("Unhandled route error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return errorResponse("internal_error", "Internal server error", 500);
    }
  };
}

/**
 * Typed application errors + a single mapper to HTTP responses. Route handlers throw
 * these; `handleRoute` (responses.ts) converts them to consistent JSON error bodies.
 */

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_error"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_error: 422,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static badRequest(msg = "Bad request", details?: unknown) {
    return new AppError("bad_request", msg, details);
  }
  static unauthorized(msg = "Unauthorized") {
    return new AppError("unauthorized", msg);
  }
  static forbidden(msg = "Forbidden") {
    return new AppError("forbidden", msg);
  }
  static notFound(msg = "Not found") {
    return new AppError("not_found", msg);
  }
  static conflict(msg = "Conflict") {
    return new AppError("conflict", msg);
  }
  static validation(msg = "Validation failed", details?: unknown) {
    return new AppError("validation_error", msg, details);
  }
}

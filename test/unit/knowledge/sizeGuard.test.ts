import { describe, it, expect } from "vitest";
import {
  assertFileSize,
  MAX_FILE_BYTES,
} from "@server/features/knowledge/knowledge.service";
import { AppError } from "@server/platform/http/errors";

describe("knowledge file size guard (U-KB-06)", () => {
  it("accepts a file within the limit", () => {
    expect(() => assertFileSize(1024)).not.toThrow();
    expect(() => assertFileSize(MAX_FILE_BYTES)).not.toThrow();
  });

  it("U-KB-06: rejects a file over the size limit", () => {
    expect(() => assertFileSize(MAX_FILE_BYTES + 1)).toThrow(AppError);
  });

  it("rejects an empty file", () => {
    expect(() => assertFileSize(0)).toThrow(AppError);
  });
});

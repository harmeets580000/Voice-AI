import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Architecture guard (doc 03 rule 5/7): vendor SDKs may only be imported from their adapter
 * folder. Business/feature code depends on PORTS, never a concrete SDK. This replaces the
 * manual "grep check" with an automated test.
 */

const ROOT = path.resolve(__dirname, "../../../src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function importsOf(sdk: string): string[] {
  const needle = `"${sdk}"`;
  const alt = `'${sdk}'`;
  return walk(ROOT).filter((f) => {
    const src = readFileSync(f, "utf8");
    return src.includes(needle) || src.includes(alt);
  });
}

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

describe("vendor SDK isolation (U-ISO / doc 03 rule 5)", () => {
  it("@vapi-ai/server-sdk is imported only under adapters/voice/vapi", () => {
    const offenders = importsOf("@vapi-ai/server-sdk")
      .map(rel)
      .filter((f) => !f.startsWith("server/adapters/voice/vapi/"));
    expect(offenders).toEqual([]);
  });

  it("@anthropic-ai/sdk is imported only under adapters/llm/anthropic", () => {
    const offenders = importsOf("@anthropic-ai/sdk")
      .map(rel)
      .filter((f) => !f.startsWith("server/adapters/llm/anthropic/"));
    expect(offenders).toEqual([]);
  });
});

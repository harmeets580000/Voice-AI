import { describe, it, expect } from "vitest";
import { diffNewCalls } from "@server/features/calls/calls.service";

describe("diffNewCalls (insert-only sync helper)", () => {
  it("returns only records not already in the DB", () => {
    const out = diffNewCalls(
      ["a", "b"],
      [{ providerCallId: "a" }, { providerCallId: "c" }],
    );
    expect(out.map((c) => c.providerCallId)).toEqual(["c"]);
  });

  it("de-dupes repeated ids within the incoming batch", () => {
    const out = diffNewCalls(
      [],
      [
        { providerCallId: "x" },
        { providerCallId: "x" },
        { providerCallId: "y" },
      ],
    );
    expect(out.map((c) => c.providerCallId)).toEqual(["x", "y"]);
  });

  it("skips records with no providerCallId", () => {
    const out = diffNewCalls(
      [],
      [{ providerCallId: "" }, { providerCallId: undefined }, { providerCallId: "z" }],
    );
    expect(out.map((c) => c.providerCallId)).toEqual(["z"]);
  });

  it("returns empty when everything already exists", () => {
    expect(
      diffNewCalls(["a", "b"], [{ providerCallId: "a" }, { providerCallId: "b" }]),
    ).toEqual([]);
  });
});

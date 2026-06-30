import { describe, it, expect } from "vitest";
import { providerForModel } from "@server/adapters/voice/voiceOptions";

describe("providerForModel (dynamic LLM provider)", () => {
  it("maps a model id to its LLM provider", () => {
    expect(providerForModel("gpt-4o")).toBe("openai");
    expect(providerForModel("claude-3-5-sonnet-20241022")).toBe("anthropic");
    expect(providerForModel("gemini-2.0-flash")).toBe("google");
  });

  it("defaults to openai for unknown or missing model ids", () => {
    expect(providerForModel("some-future-model")).toBe("openai");
    expect(providerForModel(undefined)).toBe("openai");
    expect(providerForModel(null)).toBe("openai");
    expect(providerForModel("")).toBe("openai");
  });
});

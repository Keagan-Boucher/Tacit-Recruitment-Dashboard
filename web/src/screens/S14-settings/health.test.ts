import { describe, expect, it } from "vitest";
import { aiStatus } from "./health";

describe("aiStatus", () => {
  it("maps /api/health to the three words", () => {
    expect(aiStatus({ ok: true, modelConfigured: true })).toBe("connected");
    expect(aiStatus({ ok: true, modelConfigured: false })).toBe("not-configured");
    expect(aiStatus({ ok: false, modelConfigured: true })).toBe("unreachable");
    expect(aiStatus(null)).toBe("unreachable");
  });
});

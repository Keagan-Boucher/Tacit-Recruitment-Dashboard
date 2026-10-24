import { describe, expect, it } from "vitest";

describe("function entry", () => {
  it("loads without env vars (deploy-time discovery) and exports api; the app is built lazily", async () => {
    delete process.env.ALLOWED_ORIGIN;
    const m = await import("./function.ts");
    expect(typeof m.api).toBe("function");
  }, 30_000); // cold import of firebase-functions + the whole app takes ~5 s under a full parallel test run
});

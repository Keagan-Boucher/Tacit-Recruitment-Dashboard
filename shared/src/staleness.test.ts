import { describe, expect, it } from "vitest";
import { factStaleness, isForgotten, isPerishable, monthsSince, staleness } from "./staleness.ts";

const now = new Date("2026-10-26T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 30.4375 * 86_400_000 - 1000);

describe("staleness", () => {
  it("follows the data-model thresholds", () => {
    expect(staleness(ago(2), now)).toBe("fresh");
    expect(staleness(ago(6), now)).toBe("ageing");
    expect(staleness(ago(12), now)).toBe("ageing");
    expect(staleness(ago(13), now)).toBe("stale");
    expect(monthsSince(ago(14), now)).toBe(14);
    expect(monthsSince(new Date(now.getTime() + 1e9), now)).toBe(0);
    expect(monthsSince(new Date("2025-08-14T09:00:00"), new Date("2026-10-14T08:00:00"))).toBe(14); // the demo's "14 months"
    expect(monthsSince(new Date("2025-08-15T09:00:00"), new Date("2026-10-14T08:00:00"))).toBe(13);
  });
  it("flags candidates not opened in 6 months", () => {
    expect(isForgotten(ago(14), now)).toBe(true);
    expect(isForgotten(ago(1), now)).toBe(false);
    expect(isForgotten(undefined, now)).toBe(true);
  });
});

describe("factStaleness", () => {
  const now = new Date(2026, 9, 22), old = new Date(2025, 7, 12);
  it("ages perishable facts only", () => {
    expect(factStaleness("salary", old, now)).toBe("stale");
    expect(factStaleness("trajectory", old, now)).toBe("stale");
    expect(factStaleness("skill", old, now)).toBe("fresh");
    expect(isPerishable("work-mode")).toBe(true);
    expect(isPerishable("motivation")).toBe(false);
  });
});

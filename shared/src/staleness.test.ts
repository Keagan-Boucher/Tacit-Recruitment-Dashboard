import { describe, expect, it } from "vitest";
import { isForgotten, monthsSince, staleness } from "./staleness.ts";

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
  });
  it("flags candidates not opened in 6 months", () => {
    expect(isForgotten(ago(14), now)).toBe(true);
    expect(isForgotten(ago(1), now)).toBe(false);
    expect(isForgotten(undefined, now)).toBe(true);
  });
});

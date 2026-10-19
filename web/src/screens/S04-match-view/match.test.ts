import { describe, expect, it } from "vitest";
import type { Alignment, Attribute } from "@tacit/shared";
import { budgetText, evidencedCount, forgottenNow, provenance } from "./match";

const now = new Date("2026-10-14T00:00:00Z");
const attr = { id: "a", sourceType: "note", observedAt: new Date("2025-08-12T00:00:00Z") } as Attribute & { id: string };

describe("S04 helpers", () => {
  it("formats the budget", () => expect(budgetText({ min: 52000, max: 55000, currency: "ZAR" })).toBe("R52k to R55k"));
  it("counts evidenced rows", () => {
    const rows = [{ kind: "stated" }, { kind: "interpreted" }, { kind: "not-seen" }] as Alignment[];
    expect(evidencedCount(rows)).toBe("2 of 3 evidenced");
  });
  it("ages the cited attribute and skips unknown ids", () => {
    const p = provenance(["x", "a"], new Map([["a", attr]]), now)!;
    expect(p).toMatchObject({ source: "Note, 12 Aug 2025", staleness: "stale", months: 14 });
    expect(provenance(["x"], new Map(), now)).toBeNull();
  });
});

describe("provenance link target", () => {
  it("names the newest cited attribute and its candidate", () => {
    const older = { ...attr, id: "old", candidateId: "c1", observedAt: new Date("2024-01-01T00:00:00Z") } as Attribute & { id: string };
    const newer = { ...attr, id: "new", candidateId: "c1" } as Attribute & { id: string };
    const p = provenance(["old", "new"], new Map([["old", older], ["new", newer]]), now)!;
    expect(p).toMatchObject({ attributeId: "new", candidateId: "c1" });
  });
});

describe("forgottenNow", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("follows the candidate's live lastOpenedAt, so opening the profile clears it", () => {
    expect(forgottenNow({ lastOpenedAt: new Date("2025-08-19T12:00:00Z") }, now)).toBe(true);
    expect(forgottenNow({ lastOpenedAt: now }, now)).toBe(false);
    expect(forgottenNow({ lastOpenedAt: undefined }, now)).toBe(true);
    expect(forgottenNow(undefined, now)).toBe(false);
  });
});

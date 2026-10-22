import { describe, expect, it } from "vitest";
import type { Alignment, Attribute, AttributeType, Override } from "@tacit/shared";
import { agedFacts, decisionNote, evidencedCount, forgottenNow, provenance, sourceLine, standingDecision } from "./match";

const now = new Date("2026-10-14T00:00:00Z");
const old = new Date("2025-08-12T00:00:00Z");
const attr = (id: string, type: AttributeType, observedAt = old, extra: Partial<Attribute> = {}) =>
  ({ id, candidateId: "c1", type, sourceType: "note", observedAt, value: "R60k", ...extra }) as Attribute & { id: string };

describe("S04 helpers", () => {
  it("counts rows in the notes, with the total", () => {
    const rows = [{ kind: "stated" }, { kind: "interpreted" }, { kind: "not-seen" }] as Alignment[];
    expect(evidencedCount(rows)).toEqual({ n: 2, total: 3 });
  });
  it("skips unknown ids", () => expect(provenance(["x"], new Map(), now)).toBeNull());
});

describe("ages only on perishable facts", () => {
  it("a stale skill shows its date and no age", () => {
    expect(provenance(["a"], new Map([["a", attr("a", "skill")]]), now)).toMatchObject({ text: "Your note · 12 Aug 2025", age: null });
  });
  it("a stale salary shows the age", () => {
    expect(provenance(["a"], new Map([["a", attr("a", "salary")]]), now)).toMatchObject({ text: "Your note · 12 Aug 2025", age: "14 months ago" });
  });
  it("a fresh perishable fact shows no age", () => {
    expect(provenance(["a"], new Map([["a", attr("a", "salary", new Date("2026-09-01T00:00:00Z"))]]), now)?.age).toBeNull();
  });
  it("the stale-prompt footer lists only aged perishable facts", () => {
    const attrs = new Map([attr("s", "salary"), attr("k", "skill"), attr("w", "work-mode", new Date("2026-02-01T00:00:00Z"))].map((a) => [a.id, a]));
    const facts = agedFacts(["k", "s", "w", "s", "gone"], attrs, now);
    expect(facts.map((f) => [f.label, f.age])).toEqual([["Work mode R60k", null], ["Salary R60k", "14 months ago"]]);
  });
});

describe("provenance link target", () => {
  it("names the newest cited attribute and its candidate", () => {
    const older = attr("old", "skill", new Date("2024-01-01T00:00:00Z"));
    const newer = attr("new", "skill");
    expect(provenance(["old", "new"], new Map([["old", older], ["new", newer]]), now)).toMatchObject({ attributeId: "new", candidateId: "c1" });
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

describe("sourceLine", () => {
  const d = new Date("2025-08-12T00:00:00Z");
  it("names the source and date", () => {
    expect(sourceLine("note", d)).toEqual({ text: "Your note · 12 Aug 2025", age: null });
    expect(sourceLine("override", d)).toEqual({ text: "Your reason · 12 Aug 2025", age: null });
    expect(sourceLine("brief", new Date("2026-10-24T00:00:00Z"))).toEqual({ text: "Brief · 24 Oct 2026", age: null });
    expect(sourceLine("cv", undefined)).toEqual({ text: "CV", age: null });
  });
  it("adds the age only when the cited fact is stale", () => {
    expect(sourceLine("note", d, "stale", 14).age).toBe("14 months ago");
    expect(sourceLine("note", d, "ageing", 9).age).toBeNull();
    expect(sourceLine("note", d, "fresh", 1).age).toBeNull();
  });
});

describe("decisions", () => {
  const o = (id: string, decidedAt: string, extra: Partial<Override> = {}) =>
    ({ id, matchId: "m1", decision: "reject", reasonCodes: [], reasonText: "", decidedAt: new Date(decidedAt), ...extra }) as Override & { id: string };
  it("the newest decision that is not reversed stands", () => {
    const list = [o("a", "2026-10-01"), o("b", "2026-10-05"), o("c", "2026-10-09", { reversedAt: new Date("2026-10-10") }), o("d", "2026-10-09", { matchId: "m2" })];
    expect(standingDecision(list, "m1")?.id).toBe("b");
    expect(standingDecision(list, "m3")).toBeUndefined();
  });
  it("a shortlist reads 'Your call'; a reject quotes the typed reason, else the chosen ones", () => {
    expect(decisionNote(o("a", "2026-10-21T12:00:00", { decision: "shortlist" }))).toEqual({ text: "Your call · 21 Oct 2026", quote: null });
    expect(decisionNote(o("a", "2026-10-21T12:00:00", { reasonText: "Wants R65k." }))).toEqual({ text: "Your reason · 21 Oct 2026", quote: "Wants R65k." });
    expect(decisionNote(o("a", "2026-10-21T12:00:00", { reasonCodes: ["salary-above-budget", "location"] })).quote).toBe("Salary above budget, Location does not work");
  });
});

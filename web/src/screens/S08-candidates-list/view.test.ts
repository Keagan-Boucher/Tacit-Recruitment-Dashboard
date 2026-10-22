import { describe, expect, it } from "vitest";
import type { Attribute } from "@tacit/shared";
import { groupByAge, highlight, hitSource, lastSeenLabel, matchesFilter, matchesQuery, matchesSource, sourceCounts, staleIds, type CitedAttr, type Person } from "./view";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const person = (id: string, days: number, extra: Partial<Person> = {}): Person => ({
  id, ownerUid: "u", createdAt: ago(days), updatedAt: ago(days), fullName: `Name ${id}`, headline: "SAP FI consultant",
  location: "Cape Town", parseConfidence: 0.9, parseStatus: "ok", topSkills: ["S/4HANA"], lastInterviewAt: ago(days), ...extra,
});

describe("candidates list view", () => {
  it("labels how long ago", () => {
    expect(lastSeenLabel(ago(2), now)).toBe("this week");
    expect(lastSeenLabel(ago(14), now)).toBe("2 wk ago");
    expect(lastSeenLabel(ago(150), now)).toBe("4 mo ago");
  });

  it("groups by age and drops empty groups", () => {
    const g = groupByAge([person("a", 5), person("b", 200), person("c", 500)], now);
    expect(g.map((x) => [x.label, x.people.length])).toEqual([["Last 3 months", 1], ["3 to 12 months", 1], ["Over a year", 1]]);
    expect(groupByAge([person("a", 5)], now)).toHaveLength(1);
  });

  it("searches every word across name, headline, location and skills", () => {
    const p = person("a", 5);
    expect(matchesQuery(p, "s/4hana CAPE")).toBe(true);
    expect(matchesQuery(p, "s/4hana durban")).toBe(false);
    expect(matchesQuery(p, "")).toBe(true);
  });

  it("stale means a stale perishable fact, not an old interview", () => {
    const a = (candidateId: string, type: Attribute["type"], days: number, confirmedByRecruiter = true) => ({ candidateId, type, observedAt: ago(days), confirmedByRecruiter });
    const stale = staleIds([a("c1", "salary", 500), a("c2", "skill", 500), a("c3", "availability", 30), a("c4", "work-mode", 500, false), a("c5", "salary", 500), a("c5", "availability", 30)], now);
    expect([...stale]).toEqual(["c1"]); // c5's newest perishable fact is fresh
    expect(matchesFilter(person("c1", 5), "stale", now, stale)).toBe(true);
    expect(matchesFilter(person("c2", 500), "stale", now, stale)).toBe(false); // old interview, nothing perishable
  });

  it("filters", () => {
    expect(matchesFilter(person("a", 500), "stale", now)).toBe(false);
    expect(matchesFilter(person("a", 5), "stale", now, new Set(["a"]))).toBe(true);
    expect(matchesFilter(person("a", 5, { parseStatus: "flagged" }), "cv", now)).toBe(true);
    expect(matchesFilter(person("a", 5, { lastOpenedAt: ago(5) }), "unopened", now)).toBe(false);
  });
});

describe("search results: sources and highlighting", () => {
  const attr = (id: string, days: number, sourceType: CitedAttr["sourceType"] = "note", type: CitedAttr["type"] = "salary"): [string, CitedAttr] => [id, { id, candidateId: "c1", type, observedAt: ago(days), sourceType }];
  const attrs = new Map([attr("a1", 30), attr("a2", 430), attr("a3", 40, "cv"), attr("a4", 10, "override"), attr("a5", 430, "note", "skill")]);

  it("cites the newest attribute with its date, and the age only when a perishable fact is stale", () => {
    expect(hitSource({ kind: "stated", attributeIds: ["a1", "a2"] }, attrs, now)).toMatchObject({ text: "Your note · 14 Sep 2026", staleMonths: undefined, attributeId: "a1" });
    expect(hitSource({ kind: "interpreted", attributeIds: ["a2"] }, attrs, now)).toMatchObject({ text: "Interpreted from your note · 10 Aug 2025", staleMonths: 14 });
    expect(hitSource({ kind: "stated", attributeIds: ["a5"] }, attrs, now)).toMatchObject({ text: "Your note · 10 Aug 2025", staleMonths: undefined }); // old skill: date only
    expect(hitSource({ kind: "stated", attributeIds: ["a3"] }, attrs, now)?.text).toBe("CV · 4 Sep 2026");
    expect(hitSource({ kind: "stated", attributeIds: ["a4"] }, attrs, now)?.text).toBe("Your reason · 4 Oct 2026");
    expect(hitSource({ kind: "stated", attributeIds: ["gone"] }, attrs, now)).toBeNull();
  });

  it("counts hits by source", () => {
    const s = ["a1", "a2", "a3", "a4", "a5", "gone"].map((id) => hitSource({ kind: "stated", attributeIds: [id] }, attrs, now));
    expect(sourceCounts(s)).toEqual({ all: 6, cv: 1, note: 4, stale: 1 }); // the old skill (a5) is a note but not stale
    expect(s.filter((x) => matchesSource(x, "stale"))).toHaveLength(1);
  });

  it("marks the user's words, case-insensitively, merging neighbours", () => {
    const hits = (t: string, q: string) => highlight(t, q).filter((r) => r.hit).map((r) => r.text);
    expect(hits("Lives in Cape Town, did s/4hana rollouts.", "S/4HANA cape town")).toEqual(["Cape Town", "s/4hana"]);
    expect(hits("Ran month-end reconciliation daily.", "reconciliations")).toEqual(["reconciliation"]);
    expect(hits("Financial Accounting and Controlling", "FICO")).toEqual([]);
    expect(hits("Controlling the ledger", "co")).toEqual([]);
    expect(hits("anything (really)", "(")).toEqual([]);
    expect(highlight("abc", "").map((r) => r.text)).toEqual(["abc"]);
    expect(highlight("Cape Town!", "cape").map((r) => r.text).join("")).toBe("Cape Town!");
  });
});

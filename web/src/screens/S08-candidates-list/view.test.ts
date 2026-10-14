import { describe, expect, it } from "vitest";
import { groupByAge, lastSeenLabel, matchesFilter, matchesQuery, type Person } from "./view";

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

  it("filters", () => {
    expect(matchesFilter(person("a", 500), "stale", now)).toBe(true);
    expect(matchesFilter(person("a", 5), "stale", now)).toBe(false);
    expect(matchesFilter(person("a", 5, { parseStatus: "flagged" }), "cv", now)).toBe(true);
    expect(matchesFilter(person("a", 5, { lastOpenedAt: ago(5) }), "unopened", now)).toBe(false);
  });
});

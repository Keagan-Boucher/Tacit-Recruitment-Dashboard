import { describe, expect, it } from "vitest";
import type { Attribute, Candidate, Match } from "@tacit/shared";
import { buildShareRequest, cardProblems, nameHits, prefillCard, shortlistedIds, yearsFromCv } from "./ShareShortlistDialog.logic";

const now = new Date("2026-10-27T10:00:00Z");
const candidate = {
  id: "c1", fullName: "Thandi van der Merwe", headline: "Senior payments engineer", location: "Cape Town",
  cv: { history: [{ title: "Dev", from: "Mar 2014" }, { title: "Lead", from: "2019" }], education: [], skills: [] },
} as unknown as Candidate & { id: string };
const match = {
  generatedAt: new Date("2026-10-20"),
  reasonsFor: [{ text: "Has run a payments platform", attributeIds: ["a1"] }],
  reasonsAgainst: [{ text: "Wants hybrid", attributeIds: ["a2"] }],
} as unknown as Match;
const attr = (type: string, value: string, day: number, extra: object = {}) =>
  ({ id: `${type}-${day}`, candidateId: "c1", type, value, confirmedByRecruiter: true, observedAt: new Date(2026, 0, day), ...extra }) as unknown as Attribute & { id: string };

describe("prefillCard", () => {
  it("uses the newest confirmed attributes, then the profile, and both sides of the match", () => {
    const attrs = [attr("salary", "R70k", 1), attr("salary", "R80k", 5), attr("salary", "R99k", 9, { confirmedByRecruiter: false }), attr("work-mode", "Remote", 2, { editedValue: "Hybrid" })];
    const d = prefillCard({ candidate, match, attrs, index: 1, now });
    expect(d).toMatchObject({ label: "Candidate B", years: "12", location: "Cape Town", salary: "R80k", workMode: "Hybrid", notice: "", forText: "Has run a payments platform", againstText: "Wants hybrid" });
    expect(d.dates).toEqual({ "for:Has run a payments platform": match.generatedAt, "against:Wants hybrid": match.generatedAt }); // no attribute resolves
  });
  it("dates each line by the newest attribute it cites; a typed line gets today", () => {
    const attrs = [attr("skill", "x", 3, { id: "a1", observedAt: new Date("2025-08-12") }), attr("skill", "y", 4, { id: "a2", observedAt: new Date("2025-09-30") }), attr("skill", "z", 5, { id: "a3", observedAt: new Date("2026-01-05") })];
    const m = { ...match, reasonsFor: [{ text: "Has run a payments platform", attributeIds: ["a1", "a2"] }], reasonsAgainst: [{ text: "Wants hybrid", attributeIds: ["a3"] }] } as unknown as Match;
    const d = prefillCard({ candidate, match: m, attrs, index: 0, now });
    const body = buildShareRequest("r1", [{ ...d, forText: `${d.forText}
Brand new point` }], now);
    expect(body.entries[0]?.case.for.map((r) => [r.text, r.at.toISOString().slice(0, 10)])).toEqual([["Has run a payments platform", "2025-09-30"], ["Brand new point", "2026-10-27"]]);
    expect(body.entries[0]?.case.against[0]?.at.toISOString().slice(0, 10)).toBe("2026-01-05");
  });
  it("leaves years blank when the CV has no year", () => expect(yearsFromCv([{ from: "recently" }], now)).toBeUndefined());
});

describe("name guard", () => {
  const d = prefillCard({ candidate, match, attrs: [], index: 0, now });
  it("passes a clean card", () => expect(cardProblems(d, candidate.fullName)).toEqual([]));
  it("blocks any name token, whole word, any case, and says which field", () => {
    expect(nameHits({ ...d, headline: "Ask THANDI about it" }, candidate.fullName)).toEqual(["Headline"]);
    expect(nameHits({ ...d, againstText: "Merwe's notice is long", forText: "Strong" }, candidate.fullName)).toEqual(["Reasons against"]);
    expect(cardProblems({ ...d, headline: "Thandi" }, candidate.fullName)[0]).toMatch(/^Headline contains their name/);
  });
  it("folds diacritics both ways", () => {
    expect(nameHits({ ...d, headline: "Ask Sipho" }, "Sípho Dlamini")).toEqual(["Headline"]);
    expect(nameHits({ ...d, headline: "Ask Sípho" }, "Sipho Dlamini")).toEqual(["Headline"]);
  });
  it("does not trip on a name inside another word", () => expect(nameHits({ ...d, headline: "Thandiwe's peer" }, candidate.fullName)).toEqual([]));
  it("needs both sides", () => {
    expect(cardProblems({ ...d, againstText: "  " }, candidate.fullName)).toContain("Add at least one reason against.");
    expect(cardProblems({ ...d, forText: "" }, candidate.fullName)).toContain("Add at least one reason for.");
  });
});

describe("shortlistedIds / request", () => {
  it("keeps standing shortlists only", () => {
    const o = (candidateId: string, decision: "shortlist" | "reject", day: number, reversed = false) =>
      ({ candidateId, decision, decidedAt: new Date(2026, 9, day), reversedAt: reversed ? new Date() : undefined });
    expect(shortlistedIds([o("a", "shortlist", 1), o("b", "shortlist", 1, true), o("c", "shortlist", 1), o("c", "reject", 2)])).toEqual(["a"]);
  });
  it("builds a body that passes the shared schema", () => {
    const d = prefillCard({ candidate, match, attrs: [], index: 0, now });
    const body = buildShareRequest("r1", [d], now);
    expect(body.entries[0]?.case.for[0]?.text).toBe("Has run a payments platform");
    expect(body.entries[0]?.years).toBe(12);
    expect(() => buildShareRequest("r1", [{ ...d, againstText: "" }], now)).toThrow();
  });
});

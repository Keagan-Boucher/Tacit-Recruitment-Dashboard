import { describe, expect, it } from "vitest";
import type { Match, Override, Role } from "@tacit/shared";
import { budgetLabel, matchesQuery, personWord, placedLine, roleRows } from "./view";

const d = new Date("2026-10-01");
const role = { id: "r1", companyId: "c1", title: "SAP FICO consultant", openedAt: d, interpretedBrief: { mustHave: ["S/4HANA"], niceToHave: [], budget: { min: 55000, max: 55000, currency: "ZAR" } } } as never;
const m = (id: string, staleness: Match["staleness"] = "fresh") => ({ id, roleId: "r1", staleness }) as never;
const o = (id: string, decision: Override["decision"], at: number, reversed = false) =>
  ({ id: `o${id}${at}`, matchId: id, decision, decidedAt: new Date(at), ...(reversed ? { reversedAt: d } : {}) }) as never;

describe("roleRows", () => {
  it("counts waiting, shortlisted and stale; a reversed decision puts the match back to waiting", () => {
    const [row] = roleRows([role], [{ id: "c1", name: "Vantage" } as never], [m("a"), m("b", "stale"), m("c")], [o("a", "shortlist", 1), o("b", "reject", 1), o("c", "shortlist", 2, true)]);
    expect(row).toMatchObject({ company: "Vantage", suggested: 3, waiting: 1, shortlisted: 1, stale: 1 });
  });
});

describe("helpers", () => {
  it("formats the budget", () => {
    expect(budgetLabel({ budget: { min: 75000, max: 85000, currency: "ZAR" } } as Role["interpretedBrief"])).toBe("R75k to R85k");
    expect(budgetLabel({ budget: { min: 55000, max: 55000, currency: "ZAR" } } as Role["interpretedBrief"])).toBe("R55k");
    expect(budgetLabel({ budget: { min: 0, max: 0, currency: "ZAR" } } as Role["interpretedBrief"])).toBe("");
  });
  it("searches title, company and skills", () => {
    const row = { role, company: "Vantage" } as never;
    expect([matchesQuery(row, "fico"), matchesQuery(row, "vantage"), matchesQuery(row, "s/4"), matchesQuery(row, "cobol")]).toEqual([true, true, true, false]);
  });
});

describe("S12 words", () => {
  it("singular and plural for the stale-evidence unit", () => expect([personWord(1), personWord(2)]).toEqual(["person", "people"]));
  it("reads the placed amount from the reason, and omits it when there is none", () => {
    expect(placedLine("Nomvula Zulu", "Placed at R52k a month.")).toEqual({ who: "Nomvula Zulu", rest: " placed · R52k a month" });
    expect(placedLine("Busisiwe Ndlovu", "Client loved her.").rest).toBe(" placed");
    expect(placedLine("Busisiwe Ndlovu").rest).toBe(" placed");
  });
});

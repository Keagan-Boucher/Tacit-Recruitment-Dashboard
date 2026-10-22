import { describe, expect, it } from "vitest";
import { historyRows } from "./MatchHistory";

const at = (d: string) => new Date(d);
const roles = [{ id: "r1", companyId: "c1", title: "SAP FICO" }, { id: "r2", companyId: "c1", title: "Oracle" }] as never;
const companies = [{ id: "c1", name: "Karoo" }] as never;

describe("historyRows", () => {
  it("names each state in words, newest first", () => {
    const rows = historyRows({
      matches: [{ id: "m1", roleId: "r1", rank: 1, generatedAt: at("2026-10-22") }, { id: "m2", roleId: "r2", rank: 2, generatedAt: at("2025-01-01") }, { id: "m3", roleId: "r2", rank: 3, generatedAt: at("2025-01-02") }] as never,
      overrides: [
        { id: "o2", matchId: "m2", decision: "reject", reasonText: "No Oracle.", decidedAt: at("2025-08-14") },
        { id: "o3", matchId: "m3", decision: "shortlist", reasonText: "Keen.", decidedAt: at("2025-09-01") },
        { id: "o4", matchId: "m1", decision: "reject", reasonText: "undone", decidedAt: at("2026-10-01"), reversedAt: at("2026-10-02") },
      ] as never,
      placements: [{ id: "p1", roleId: "r1", companyId: "c1", outcome: "client-rejected", reason: "Wanted Joburg.", date: at("2024-03-20") }] as never,
      roles,
      companies,
    });
    expect(rows.map((r) => [r.status.text, r.status.tone, r.companyName])).toEqual([
      ["Suggested 1st", "accent", "Karoo"],
      ["Shortlisted", "for", "Karoo"],
      ["Not this one", "against", "Karoo"],
      ["Client passed", "against", "Karoo"],
    ]);
    expect(rows[2]!.body).toBe("You said: “No Oracle.”");
  });
});

import { describe, expect, it } from "vitest";
import type { Company, Override, Placement, Role } from "@tacit/shared";
import { buildRows, matchesFilter, matchesQuery } from "./view";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
const co = (id: string, name: string, age: number) =>
  ({ id, ownerUid: "u", createdAt: ago(age), updatedAt: ago(age), name, sector: "Logistics software, Durban", hiringPattern: "", notes: "" }) as Company & { id: string };
const role = (companyId: string, status: Role["status"], openedAt: Date) => ({ companyId, status, openedAt }) as Role;
const placed = (companyId: string, date: Date, outcome: Placement["outcome"] = "placed") => ({ companyId, date, outcome, reason: "Wanted S/4HANA hands-on" }) as Placement;

describe("companies list view", () => {
  const rows = buildRows(
    [co("a", "Vantage", 900), co("b", "Sable", 900)],
    [role("a", "open", ago(3)), role("a", "filled", ago(400)), role("b", "filled", ago(500))],
    [placed("a", ago(20)), placed("a", ago(30), "client-rejected"), placed("b", ago(450))],
    [{ companyId: "b", decidedAt: ago(430) } as Override, { companyId: "b", decidedAt: ago(1), reversedAt: ago(0) } as Override],
  );

  it("counts open roles and placements, newest contact first, ignoring reversed overrides", () => {
    expect(rows.map((r) => [r.company.name, r.openRoles, r.placements])).toEqual([["Vantage", 1, 1], ["Sable", 0, 1]]);
    expect(rows[1]!.lastContact).toEqual(ago(430));
  });

  it("filters and searches", () => {
    expect(rows.filter((r) => matchesFilter(r, "hiring", now)).map((r) => r.company.name)).toEqual(["Vantage"]);
    expect(rows.filter((r) => matchesFilter(r, "stale", now)).map((r) => r.company.name)).toEqual(["Sable"]);
    expect(rows.filter((r) => matchesQuery(r, "durban s/4hana")).length).toBe(2);
    expect(rows.filter((r) => matchesQuery(r, "sable")).length).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import type { Override, Placement } from "@tacit/shared";
import { reasonLabel, turnedDown } from "./turnedDown";

const at = (d: number) => new Date(2026, 9, d);
const rejected = { id: "p1", outcome: "client-rejected", reason: "Client wanted S/4HANA hands-on.", candidateId: "c1", roleId: "r1", date: at(1) } as unknown as Placement;
const placed = { id: "p2", outcome: "placed", reason: "Placed at R52k.", candidateId: "c2", roleId: "r1", date: at(2) } as unknown as Placement;
const ov = (id: string, decision: Override["decision"], reasonCodes: string[], reversedAt?: Date) =>
  ({ id, decision, reasonCodes, candidateId: "c3", roleId: "r2", decidedAt: at(5), reversedAt }) as unknown as Override;

describe("what they have turned down", () => {
  it("collects client rejections and reject overrides, grouped by reason, newest first", () => {
    const g = turnedDown([rejected, placed], [ov("o1", "reject", ["salary-above-budget", "no-s4-hands-on"]), ov("o2", "reject", ["salary-above-budget"])]);
    expect(g.map((x) => [x.label, x.cases.length])).toEqual([["Salary above budget", 2], ["No S/4HANA hands-on", 1], ["Client wanted S/4HANA hands-on.", 1]]);
  });

  it("ignores reversed overrides and shortlists", () => {
    expect(turnedDown([], [ov("o1", "reject", ["location"], at(6)), ov("o2", "shortlist", ["strong-fit"])])).toEqual([]);
  });

  it("makes a readable label out of an unknown code", () => {
    expect(reasonLabel("fusion-enough")).toBe("Fusion enough");
  });
});

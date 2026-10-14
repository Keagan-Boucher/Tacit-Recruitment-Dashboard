import { describe, expect, it } from "vitest";
import { buildDecision, fromDate } from "./override";

const base = {
  overrideId: "ov1", uid: "u1", match: { id: "m1", roleId: "r1", candidateId: "c1" }, companyId: "co1",
  codes: ["salary-above-budget"], text: " Too high ", salary: "", available: "", now: new Date("2026-10-14"),
};

describe("buildDecision", () => {
  it("writes only an override when nothing new was heard", () => {
    const { override, attributes } = buildDecision(base);
    expect(attributes).toEqual([]);
    expect(override).toMatchObject({ decision: "reject", companyId: "co1", reasonText: "Too high" });
    expect("updates" in override).toBe(false);
  });
  it("adds one confirmed override-sourced attribute per filled update", () => {
    const { override, attributes } = buildDecision({ ...base, salary: " R60k ", available: "2026-11-01" });
    expect(override.updates).toEqual([{ type: "salary", value: "R60k" }, { type: "availability", value: "From 1 Nov 2026" }]);
    expect(attributes.map((a) => [a.type, a.sourceSpan.end, a.overrideId, a.confirmedByRecruiter, a.confidence])).toEqual([
      ["salary", 4, "ov1", true, 1],
      ["availability", 15, "ov1", true, 1],
    ]);
  });
  it("formats the date", () => expect(fromDate("2026-12-09")).toBe("From 9 Dec 2026"));
});

import { describe, expect, it } from "vitest";
import { approvedItems, courseEligible, statusLine } from "./CourseSuggestions.logic";

const now = new Date("2026-10-27T10:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 30.4375 * 86_400_000 - 1000);

describe("courseEligible", () => {
  it("needs 9 months in the pool", () => {
    expect(courseEligible(ago(9), [], now)).toBe(true);
    expect(courseEligible(ago(8), [], now)).toBe(false);
    expect(courseEligible(undefined, [], now)).toBe(false);
  });
  it("is off once they were placed since joining the pool", () => {
    expect(courseEligible(ago(12), [{ outcome: "placed", date: ago(3) }], now)).toBe(false);
    expect(courseEligible(ago(12), [{ outcome: "placed", date: ago(20) }], now)).toBe(true);
    expect(courseEligible(ago(12), [{ outcome: "client-rejected", date: ago(3) }, { outcome: "withdrew", date: ago(2) }], now)).toBe(true);
  });
});

describe("statusLine / approvedItems", () => {
  it("words each decided state", () => {
    expect(statusLine({ status: "approved", approvedAt: new Date("2026-10-20") }, "Thandi")).toBe("Shown to Thandi on 20 Oct 2026");
    expect(statusLine({ status: "snoozed", snoozedUntil: new Date("2027-01-05") }, "Thandi")).toBe("Snoozed until 5 Jan 2027");
    expect(statusLine({ status: "dismissed" }, "Thandi")).toBe("Dismissed");
    expect(statusLine({ status: "draft" }, "Thandi")).toBeNull();
  });
  it("rejects an incomplete item and trims a complete one", () => {
    expect(approvedItems([{ title: " ", why: "x", duration: "" }])).toBeNull();
    expect(approvedItems([{ title: " Intro to SQL ", why: "Asked for in 7 of 10 roles", duration: "" }])).toEqual([{ title: "Intro to SQL", why: "Asked for in 7 of 10 roles", duration: "" }]);
  });
});

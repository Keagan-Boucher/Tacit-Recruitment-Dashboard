import { describe, expect, it } from "vitest";
import { companyFixture } from "../../features/portal/companyFixtures";
import { band, RESEND, roleCards } from "./view";

const NOW = new Date(2026, 9, 24, 12);
const fx = companyFixture("default", NOW);
const cards = roleCards(fx.submissions, fx.entries);

describe("roleCards", () => {
  it("orders open, under review, not accepted, filled", () => {
    expect(cards.map((c) => c.word)).toEqual(["Open", "Under review", "Not accepted", "Filled"]);
    expect(cards.map((c) => c.tone)).toEqual(["for", "neutral", "against", "for"]);
  });
  it("counts only on an open role, and only it links to the shortlist as an action", () => {
    expect(cards[0]!.counts).toEqual({ shortlisted: 4, interviewing: 1 });
    expect(cards[0]!.action).toEqual({ label: "Review shortlist", to: "/company/roles/role-sap" });
    expect(cards.slice(1).every((c) => !c.counts)).toBe(true);
  });
  it("quotes the recruiter's reason and offers a resend, with no card link", () => {
    expect(cards[2]!.quote).toBe("Add a salary range and send it again.");
    expect(cards[2]!.action).toEqual({ label: "Send it again", to: RESEND });
    expect(cards[2]!.to).toBeUndefined();
    expect(cards[1]!.to).toBeUndefined();
  });
  it("names the hire on a filled role and opens its shortlist", () => {
    expect(cards[3]!.context).toMatch(/^Johan Pretorius started \d+ \w+$/);
    expect(cards[3]!.to).toBe("/company/roles/role-fin");
  });
  it("never puts an unshared name on a card", () => {
    expect(JSON.stringify(cards)).not.toContain("Thabo");
  });
  it("is empty with nothing sent", () => {
    expect(roleCards([], [])).toEqual([]);
  });
  it("formats the salary band", () => {
    expect(band({ min: 52000, max: 55000, currency: "ZAR" })).toBe("R52k to R55k");
    expect(band({ min: 0, max: 78000, currency: "ZAR" })).toBe("R78k");
    expect(band({ min: 0, max: 0, currency: "ZAR" })).toBeUndefined();
  });
});

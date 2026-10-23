import { describe, expect, it } from "vitest";
import { ShortlistStatusRequest } from "@tacit/shared";
import { fixtureEntries } from "./fixtures";
import type { Entry } from "./shortlist";
import { applyChange, buildHired, buildInterviewing, buildNotProgressing, changeError, decisionRow, factsLine, headlineParts, parseAmount, sharedLine, whoLine } from "./shortlist";
const [a, b, c, d] = fixtureEntries() as [Entry, Entry, Entry, Entry];

describe("decisionRow", () => {
  it("shortlisted waits for a decision, with Not progressing and Move to interviewing", () => {
    expect(decisionRow(b)).toMatchObject({ tone: "waiting", word: "Waiting for your decision", line: "Shortlisted by Naledi · 22 Oct 2026", actions: ["not-progressing", "interviewing"], change: false });
  });
  it("interviewing shows the date, who arranges it and the times, with Not progressing and Mark as hired", () => {
    expect(decisionRow(a)).toMatchObject({ tone: "for", word: "Interviewing", actions: ["not-progressing", "hired"], quote: "Tue 28 Oct, mornings" });
    expect(decisionRow(a).line).toBe("Your call · 22 Oct 2026 · interview arranged by Naledi · you suggested ");
  });
  it("not progressing shows the company's reason and Change", () => {
    expect(decisionRow(d)).toMatchObject({ tone: "against", word: "Not progressing", line: "Your reason · 21 Oct 2026 · ", quote: "Needs more hands-on SAP CO.", actions: [], change: true });
  });
  it("a role filled elsewhere is not presented as the company's own reason", () => {
    const closed = applyChange([a, b, c], { entryId: a.id, status: "hired", startDate: "2026-12-01", salary: { amount: 1, currency: "ZAR", period: "month" } }, "u", new Date(2026, 9, 25));
    expect(decisionRow(closed[1]!)).toMatchObject({ word: "Not progressing", line: "Role filled · 25 Oct 2026", change: false });
    expect(decisionRow(closed[1]!).quote).toBeUndefined();
  });
});

describe("lines", () => {
  it("joins the facts and drops the empty ones", () => {
    expect(factsLine(b.facts)).toBe("Cape Town · hybrid · 1 month notice · R60k a month");
    expect(factsLine(a.facts)).toBe("Durban, will relocate · 1 month notice · R58k a month");
  });
  it("years agree with the count", () => {
    expect(whoLine({ headline: "Lead", years: 1 })).toBe("Lead · 1 year");
    expect(whoLine(b)).toBe("SAP support lead · 8 years");
    expect(headlineParts(1).rest).toBe(" person shortlisted.");
    expect(headlineParts(4)).toEqual({ count: "4", rest: " people shortlisted." });
  });
  it("shares contact only when there is some", () => {
    expect(sharedLine(a.identity!).rest).toBe(" · thabo.nkosi@mail.test · +27 83 555 0110");
    expect(sharedLine({ fullName: "X", email: "", phone: "" }).rest).toBe(" · Naledi will share their contact details");
  });
});

describe("request builders", () => {
  it("interviewing: times are optional", () => {
    expect(buildInterviewing("e1", "  ")).toEqual({ entryId: "e1", status: "interviewing" });
    expect(buildInterviewing("e1", " Tue ")).toEqual({ entryId: "e1", status: "interviewing", interviewTimes: ["Tue"] });
    expect(ShortlistStatusRequest.safeParse(buildInterviewing("e1", "Tue")).success).toBe(true);
  });
  it("not progressing needs a reason", () => {
    expect(buildNotProgressing("e1", "   ")).toMatchObject({ ok: false, field: "reason" });
    const r = buildNotProgressing("e1", " Needs more CO ");
    expect(r.ok && r.body).toEqual({ entryId: "e1", status: "not-progressing", reasonText: "Needs more CO" });
    expect(r.ok && ShortlistStatusRequest.safeParse(r.body).success).toBe(true);
  });
  it("hired needs a start date and a salary, ZAR by default", () => {
    const f = { startDate: "2026-12-01", amount: "R62 000", currency: " ", period: "month" as const };
    expect(buildHired("e1", { ...f, startDate: "" })).toMatchObject({ ok: false, field: "startDate" });
    expect(buildHired("e1", { ...f, amount: "lots" })).toMatchObject({ ok: false, field: "salary" });
    const r = buildHired("e1", f);
    expect(r.ok && r.body).toEqual({ entryId: "e1", status: "hired", startDate: "2026-12-01", salary: { amount: 62000, currency: "ZAR", period: "month" } });
    expect(r.ok && ShortlistStatusRequest.safeParse(r.body).success).toBe(true);
  });
  it("reads amounts the way people type them", () => {
    expect([parseAmount("62000"), parseAmount("62,000.50"), parseAmount("R 62 000"), parseAmount("0"), parseAmount("-5"), parseAmount("")]).toEqual([62000, 62000.5, 62000, undefined, undefined, undefined]);
  });
});

describe("changeError", () => {
  it("says plainly what happened and that typed text is kept", () => {
    expect(changeError({ status: 409, code: "bad_transition", message: "That role has already been filled" })).toBe("That role has already been filled Nothing was changed.");
    expect(changeError({ status: 403, code: "forbidden" })).toMatch(/can't change this shortlist/);
    expect(changeError({ status: 0 })).toMatch(/still here/);
  });
});

describe("applyChange (dev fixtures)", () => {
  const all = fixtureEntries();
  const now = new Date(2026, 9, 25);
  it("interviewing reveals identity only for that person", () => {
    const next = applyChange(all, { entryId: "entry_b", status: "interviewing" }, "u", now, { fullName: "Anele K", email: "a@x.test", phone: "" });
    expect(next.find((e) => e.id === "entry_b")).toMatchObject({ status: "interviewing", identity: { fullName: "Anele K" } });
    expect(next.find((e) => e.id === "entry_c")!.identity).toBeUndefined();
  });
  it("a hire closes everyone else who was still open and leaves the already closed alone", () => {
    const next = applyChange(all, { entryId: "entry_a", status: "hired", startDate: "2026-12-01", salary: { amount: 1, currency: "ZAR", period: "month" } }, "u", now);
    expect(next.map((e) => e.status)).toEqual(["hired", "not-progressing", "not-progressing", "not-progressing"]);
    expect(next[3]!.statusHistory).toHaveLength(2);
  });
});

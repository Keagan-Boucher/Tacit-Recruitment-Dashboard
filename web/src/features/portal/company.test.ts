import { describe, expect, it } from "vitest";
import { SubmitRequest } from "@tacit/shared";
import { briefsInReview, headline, heroFor, hiredSummary, inviteView, joinProblem, meetingRows, roleRows, validateJoin } from "./company";
import { buildFields, buildSubmit, correctedFields, draftFrom, sendProblem, unclearFields, validateDraft } from "./companyBrief";
import { briefFixture, companyFixture } from "./companyFixtures";

const NOW = new Date(2026, 9, 23, 12);

describe("invite status to state", () => {
  const open = { status: "open" as const, expiresAt: new Date(2026, 9, 30).toISOString() };
  it("maps the server status", () => {
    expect(inviteView(open, NOW)).toBe("open");
    expect(inviteView({ ...open, status: "used" }, NOW)).toBe("used");
    expect(inviteView({ ...open, status: "expired" }, NOW)).toBe("expired");
    expect(inviteView(null, NOW)).toBe("missing");
  });
  it("treats an open invite past its date as expired", () => {
    expect(inviteView({ ...open, expiresAt: new Date(2026, 9, 1).toISOString() }, NOW)).toBe("expired");
    expect(inviteView({ ...open, expiresAt: "" }, NOW)).toBe("expired");
  });
});

describe("join", () => {
  it("needs a name and 10+ characters for a new account", () => {
    expect(validateJoin({ name: " ", password: "short", existing: false })).toEqual({ name: "Enter your name.", password: "Use at least 10 characters." });
    expect(validateJoin({ name: "Megan Pillay", password: "0123456789", existing: false })).toEqual({});
  });
  it("only needs a password for an account that exists", () => {
    expect(validateJoin({ name: "Megan", password: "x", existing: true })).toEqual({});
    expect(validateJoin({ name: "Megan", password: "", existing: true }).password).toBe("Enter your password.");
  });
  it("turns codes into sentences and offers sign-in for an email that has an account", () => {
    expect(joinProblem("auth/email-already-in-use", "a@b.test")).toMatchObject({ existing: true, field: "form" });
    expect(joinProblem("invite_expired", "a@b.test").text).toBe("This invitation has expired. Ask Naledi for a new one.");
    expect(joinProblem("email_mismatch", "a@b.test").text).toContain("a@b.test");
    expect(joinProblem("invite_used", "a@b.test").text).toContain("already been used");
    expect(joinProblem("rate_limited", "a@b.test").text).toContain("Too many attempts");
    expect(joinProblem("auth/weak-password", "a@b.test").field).toBe("password");
    expect(joinProblem(undefined, "a@b.test").text).toContain("Nothing was lost");
  });
});

describe("home: the default company", () => {
  const { submissions, entries } = companyFixture("default", NOW);

  it("heroes the newest shortlist, undecided people first, names only where an identity exists", () => {
    const hero = heroFor(entries, submissions);
    expect(hero).toMatchObject({ kind: "shortlist", roleId: "role-sap", title: "SAP FICO consultant (S/4HANA)", count: 4 });
    if (hero.kind !== "shortlist") throw new Error("no hero");
    expect(hero.people.map((p) => p.who)).toEqual(["Candidate B", "Candidate C", "Thabo Nkosi"]);
    expect(hero.people[0]!.line).toBe("SAP support lead · 8 years · Cape Town");
    expect(hero.people[2]!.line).toBe("Finance systems analyst · interviewing");
    expect(headline(hero, "Megan")).toEqual({ count: 4, text: " people shortlisted for you." });
  });

  it("never shows a name for an entry without identity, even one marked interviewing", () => {
    const hidden = entries.map((e) => (e.id === "e3" ? { ...e, identity: undefined } : e));
    const hero = heroFor(hidden, submissions);
    if (hero.kind !== "shortlist") throw new Error("no hero");
    expect(JSON.stringify(hero)).not.toContain("Thabo");
    expect(JSON.stringify(meetingRows(hidden))).not.toContain("Thabo");
    expect(hero.people.map((p) => p.who)).toContain("Candidate A");
  });

  it("lists roles as Open, Under review and Not accepted with the reason quoted", () => {
    const rows = roleRows(submissions, entries);
    expect(rows.map((r) => [r.title, r.word, r.tone])).toEqual([
      ["SAP FICO consultant (S/4HANA)", "Open", "for"],
      ["Finance systems lead", "Filled", "for"],
      ["Payroll systems lead", "Under review", "neutral"],
      ["Treasury analyst", "Not accepted", "against"],
    ]);
    expect(rows[0]!.meta).toBe("4 shortlisted · 1 interviewing");
    expect(rows[3]!.quote).toBe("Add a salary range and send it again.");
    expect(rows[0]!.roleId).toBe("role-sap");
    expect(rows[2]!.roleId).toBeUndefined();
  });

  it("lists briefs still under review", () => {
    expect(briefsInReview(submissions)).toEqual([{ id: "b-payroll", title: "Payroll systems lead", meta: "sent 21 Oct" }]);
  });

  it("counts hires and lists the people being met by name", () => {
    expect(hiredSummary(entries, NOW)).toMatchObject({ count: 1, thisYear: 1 });
    expect(meetingRows(entries).map((m) => [m.name, m.word])).toEqual([["Thabo Nkosi", "Interviewing"], ["Johan Pretorius", "Hired"]]);
  });
});

describe("home: nothing yet", () => {
  it("is the first-brief hero with a welcome headline", () => {
    const { submissions, entries } = companyFixture("empty", NOW);
    const hero = heroFor(entries, submissions);
    expect(hero).toEqual({ kind: "empty" });
    expect(headline(hero, "Megan").text).toBe("Welcome, Megan.");
    expect(roleRows(submissions, entries)).toEqual([]);
    expect(hiredSummary(entries, NOW).count).toBe(0);
  });
  it("says nothing is shortlisted yet once a brief is in", () => {
    const { submissions } = companyFixture("default", NOW);
    expect(heroFor([], submissions)).toEqual({ kind: "waiting" });
  });
});

describe("brief: corrections and the submit body", () => {
  const brief = briefFixture();
  const original = draftFrom(brief.result);

  it("reads Tacit's answer into the form, nulls as empty", () => {
    expect(original).toMatchObject({ title: "Payroll systems lead", travel: "", budgetMin: "70000", budgetMax: "80000", mustHave: "SAP HCM payroll\nSouth African tax rules" });
  });
  it("outlines what Tacit found nothing for, until it is filled in", () => {
    expect(unclearFields(original, original)).toEqual(["travel"]);
    expect(unclearFields(original, { ...original, travel: "None" })).toEqual([]);
  });
  it("tracks only the fields the company changed, budget once", () => {
    expect(correctedFields(original, original)).toEqual([]);
    expect(correctedFields(original, { ...original, title: "  Payroll systems lead ", location: "Pretoria", budgetMin: "75 000", budgetMax: "85000", mustHave: "SAP HCM payroll" })).toEqual(["budget", "location", "mustHave"]);
  });
  it("requires a title and a budget that runs the right way", () => {
    expect(validateDraft({ ...original, title: " " }).title).toBeTruthy();
    expect(validateDraft({ ...original, budgetMin: "90000" }).budgetMax).toBeTruthy();
    expect(validateDraft(original)).toEqual({});
  });
  it("keeps the client's quotes for untouched fields and drops them for corrected ones", () => {
    const f = buildFields(brief.result, { ...original, location: "Pretoria", niceToHave: "Power BI\nExcel" });
    expect(f.quotes?.workMode).toBe("hybrid");
    expect(f.quotes?.location).toBe("");
    expect(f.quotes?.mustHave).toEqual(["SAP HCM payroll", "South African tax rules"]);
    expect(f.quotes?.niceToHave).toEqual(["", ""]);
    expect(f.unclear).toEqual(brief.result.unclear);
  });
  it("builds a body that passes SubmitRequest: a file for an upload, the text for a paste, never both", () => {
    const upload = buildSubmit(brief, { ...original, seniority: "Senior lead" });
    expect(SubmitRequest.safeParse(upload).success).toBe(true);
    expect(upload).toMatchObject({ kind: "brief", text: null, fileRef: brief.briefFileRef, correctedFields: ["seniority"] });
    const paste = buildSubmit({ ...brief, briefSource: "paste", briefFileRef: undefined }, original);
    expect(SubmitRequest.safeParse(paste).success).toBe(true);
    expect(paste).toMatchObject({ text: brief.briefText, fileRef: null, correctedFields: [] });
  });
  it("sends a missing budget as 0 to 0 and a one-sided one as that figure", () => {
    expect(buildFields(brief.result, { ...original, budgetMin: "", budgetMax: "" }).budget).toMatchObject({ min: 0, max: 0 });
    expect(buildFields(brief.result, { ...original, budgetMin: "", budgetMax: "65 000" }).budget).toMatchObject({ min: 65000, max: 65000 });
  });
  it("explains a failed send in a sentence", () => {
    expect(sendProblem("rate_limited")).toContain("Wait a few minutes");
    expect(sendProblem("internal", 0)).toContain("Couldn’t reach");
    expect(sendProblem(undefined)).toContain("Nothing was lost");
  });
});

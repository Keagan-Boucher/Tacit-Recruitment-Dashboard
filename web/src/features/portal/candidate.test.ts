import { describe, expect, it } from "vitest";
import {
  cvFileName, detailRows, detailsBody, freshDetails, freshLine, headline, heroFor, historyEvents, latestCv, pendingDetails, poolSince, profileStatus,
  roleSteps, roleUpdateRows, showCourses, updatesThisWeek, type Sub, type Upd,
} from "./candidate";
import { candidateFixture } from "./candidateFixtures";

const NOW = new Date(2026, 9, 23, 12);
const at = (day: number) => new Date(2026, 9, day, 9);
const fields = { fullName: "Lerato Dlamini", headline: "SAP FI analyst", location: "Johannesburg", currentRole: "SAP FI analyst", history: [], education: [], skills: ["SAP FI"] };
const base = { ownerUid: "o", createdAt: at(1), updatedAt: at(1), submittedBy: "u", correctedFields: [], readStatus: "clear" as const };
const cv = (id: string, status: Sub["status"], day: number, extra: Record<string, unknown> = {}): Sub =>
  ({ ...base, id, kind: "cv", status, submittedAt: at(day), fields: { ...fields, ...extra }, ...(status === "pending" ? {} : { reviewedAt: at(day + 1) }), ...(status === "not-accepted" ? { reasonCode: "other", reasonText: "Scanned image." } : {}) }) as Sub;
const change = (id: string, status: Sub["status"], day: number, f: Record<string, unknown>): Sub =>
  ({ ...base, id, kind: "details-change", status, submittedAt: at(day), fields: f, ...(status === "pending" ? {} : { reviewedAt: at(day + 1) }) }) as Sub;
const update = (id: string, status: Upd["status"], day: number): Upd =>
  ({ ...base, id, candidateId: "c", portalUid: "u", status, at: at(day), roleAnon: { title: `Role ${id}`, sector: "Logistics", region: "Cape Town", seniority: "Senior", salaryBand: "R55k" } });

describe("profile status", () => {
  it("is the latest CV's status as a word and a tone", () => {
    expect(profileStatus([])).toMatchObject({ word: "Not sent yet", tone: "quiet" });
    expect(profileStatus([cv("a", "pending", 2)])).toMatchObject({ word: "Under review", tone: "neutral" });
    expect(profileStatus([cv("a", "accepted", 2)])).toMatchObject({ word: "Accepted", tone: "for" });
    expect(profileStatus([cv("a", "not-accepted", 2)])).toMatchObject({ word: "Not accepted", tone: "against" });
  });
  it("looks at the newest CV, not the first one", () => {
    const subs = [cv("old", "accepted", 2), cv("new", "pending", 9)];
    expect(latestCv(subs)?.id).toBe("new");
    expect(profileStatus(subs).word).toBe("Under review");
  });
  it("dates the pool from the first accepted CV", () => {
    expect(poolSince([cv("a", "accepted", 9), cv("b", "accepted", 2)])).toEqual(at(3));
    expect(poolSince([cv("a", "pending", 2)])).toBeUndefined();
  });
});

describe("hero", () => {
  it("is empty before anything is sent", () => expect(heroFor([], []).kind).toBe("empty"));
  it("follows the CV while it is pending or not accepted", () => {
    expect(heroFor([cv("a", "pending", 2)], [update("u", "shortlisted", 3)]).kind).toBe("under-review");
    expect(heroFor([cv("a", "not-accepted", 2)], []).kind).toBe("not-accepted");
  });
  it("quotes the reason with the recruiter and the date", () => {
    expect(heroFor([cv("a", "not-accepted", 2)], [])).toMatchObject({ reason: "Scanned image.", by: "Naledi Mokoena", at: at(3) });
  });
  it("shows the newest role still open, skipping closed ones", () => {
    const hero = heroFor([cv("a", "accepted", 2)], [update("closed", "not-taken-forward", 20), update("open", "interviewing", 10), update("older", "shortlisted", 5)]);
    expect(hero).toMatchObject({ kind: "role", role: { title: "Role open" } });
  });
  it("falls back to the pool when every role is closed", () => {
    expect(heroFor([cv("a", "accepted", 2)], [update("c1", "not-taken-forward", 5), update("c2", "not-taken-forward", 6)])).toMatchObject({ kind: "pool", shortlisted: 2 });
  });
  it("marks the step the update is on", () => {
    expect(roleSteps("shortlisted", at(20)).map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(roleSteps("interviewing", at(20)).map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(roleSteps("placed", at(20)).map((s) => `${s.label}:${s.state}`)).toContain("Placed:current");
  });
  it("words the headline by state", () => {
    expect(headline({ kind: "empty" }, 0, "Lerato").text).toBe("Welcome, Lerato.");
    expect(headline({ kind: "pool", since: at(1), shortlisted: 0 }, 2, "L")).toEqual({ count: 2, text: " updates this week." });
    expect(headline({ kind: "pool", since: at(1), shortlisted: 0 }, 1, "L").text).toBe(" update this week.");
    expect(headline({ kind: "pool", since: at(1), shortlisted: 0 }, 0, "L").text).toBe("No new updates this week.");
  });
  it("counts only the last 7 days", () => {
    expect(updatesThisWeek([update("a", "shortlisted", 23), update("b", "interviewing", 18), update("c", "interviewing", 8)], NOW)).toBe(2);
  });
});

describe("role updates", () => {
  it("shows no company, newest first, with words for status", () => {
    const rows = roleUpdateRows([update("a", "interviewing", 8), update("b", "shortlisted", 23), update("c", "not-taken-forward", 18)], NOW);
    expect(rows.map((r) => [r.word, r.tone])).toEqual([["Shortlisted", "for"], ["Not taken forward", "quiet"], ["Interviewing", "for"]]);
    expect(rows[0]?.meta).toBe("Logistics · Cape Town · today");
    expect(rows[1]?.meta).toContain("closed 18 Oct");
    expect(rows[2]?.meta).toContain("since 8 Oct");
  });
});

describe("which submission feeds fresh details", () => {
  it("uses the accepted CV as sent", () => {
    const f = freshDetails([cv("a", "accepted", 2, { salaryExpectation: "R60k a month", workMode: "hybrid" })]);
    expect(f).toMatchObject({ salary: "R60k a month", workMode: "hybrid", viaCv: false, at: at(3) });
  });
  it("lets a newer accepted change override field by field", () => {
    const f = freshDetails([cv("a", "accepted", 2, { salaryExpectation: "R60k", workMode: "hybrid" }), change("b", "accepted", 10, { salary: "R70k", availability: "1 month notice" })]);
    expect(f).toMatchObject({ salary: "R70k", availability: "1 month notice", workMode: "hybrid", at: at(11) });
  });
  it("ignores a pending change: the pool keeps the old values", () => {
    const f = freshDetails([cv("a", "accepted", 2, { salaryExpectation: "R60k" }), change("b", "pending", 10, { salary: "R99k" })]);
    expect(f?.salary).toBe("R60k");
    expect(pendingDetails([change("b", "pending", 10, { salary: "R99k" })])).toEqual(at(10));
  });
  it("falls back to the CV as sent while it is under review", () => {
    expect(freshDetails([cv("a", "pending", 2, { salaryExpectation: "R60k" })])).toMatchObject({ salary: "R60k", viaCv: true, at: at(2) });
    expect(freshDetails([])).toBeUndefined();
  });
  it("writes the line as plain text", () => {
    expect(freshLine({ salary: "R60k a month", availability: "1 month notice", workMode: "hybrid" })).toBe("R60k a month · 1 month notice · Hybrid");
    expect(freshLine({})).toBe("No details yet");
  });
  it("sends only what is filled in, and nothing when empty", () => {
    expect(detailsBody({ salary: " R70k ", availability: "", workMode: "remote" })).toEqual({ salary: "R70k", workMode: "remote" });
    expect(detailsBody({ salary: " ", workMode: "" })).toBeUndefined();
  });
});

describe("course dialog", () => {
  const items = [{ title: "T", why: "W", duration: "D" }];
  it("shows once approved", () => expect(showCourses({ status: "approved", items }, NOW)).toBe(true));
  it("waits out a snooze, then shows again", () => {
    expect(showCourses({ status: "snoozed", snoozedUntil: at(30), items }, NOW)).toBe(false);
    expect(showCourses({ status: "snoozed", snoozedUntil: at(10), items }, NOW)).toBe(true);
  });
  it("never shows a draft, a dismissed one or none", () => {
    expect(showCourses({ status: "draft", items }, NOW)).toBe(false);
    expect(showCourses({ status: "dismissed", items }, NOW)).toBe(false);
    expect(showCourses(null, NOW)).toBe(false);
  });
});

describe("C03 details and history", () => {
  it("builds key-value rows from their own CV, skills as tags", () => {
    const rows = detailRows(cv("a", "accepted", 2, { phone: "+27 82 555 0187", history: [{ title: "A", company: "X", from: "2022" }, { title: "B", company: "Y", from: "2018", to: "2022" }] }) as never, "l@mail.test", { workMode: "hybrid", salary: "R60k", at: at(2), viaCv: false });
    expect(rows.map((r) => r.label)).toEqual(["Full name", "Email", "Phone", "Based in", "Now", "Before", "Skills", "Work mode", "Salary expectation"]);
    expect(rows.find((r) => r.label === "Now")?.text).toEqual(["A, X, 2022 to now"]);
    expect(rows.find((r) => r.label === "Skills")?.tags).toEqual(["SAP FI"]);
  });
  it("lists account created, CV sent, accepted and details confirmed, newest first", () => {
    const ev = historyEvents(at(1), [cv("a", "accepted", 2), change("b", "accepted", 10, { salary: "R70k" })], [update("u", "shortlisted", 15)]);
    expect(ev.map((e) => e.title)).toEqual(["Put forward for Role u", "Details confirmed", "Details sent for review", "Accepted into the pool", "CV sent", "Account created"]);
    expect(ev[3]?.meta).toBe("3 Oct 2026 · Naledi Mokoena");
  });
  it("names the file without the upload stamp", () => expect(cvFileName("users/u/cvs/1760000000000-lerato-dlamini-cv.pdf")).toBe("lerato-dlamini-cv.pdf"));
});

describe("dev fixtures", () => {
  it("never carry a company name or id", () => {
    for (const s of ["default", "under-review", "not-accepted", "empty", "courses"]) {
      const text = JSON.stringify(candidateFixture(s, NOW));
      expect(text).not.toMatch(/companyId|companyName/);
    }
  });
  it("cover each hero", () => {
    const kinds = Object.fromEntries(["default", "under-review", "not-accepted", "empty", "courses"].map((s) => { const d = candidateFixture(s, NOW); return [s, heroFor(d.submissions, d.updates).kind]; }));
    expect(kinds).toEqual({ default: "role", "under-review": "under-review", "not-accepted": "not-accepted", empty: "empty", courses: "pool" });
  });
});

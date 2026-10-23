import { describe, expect, it } from "vitest";
import {
  AcceptInviteRequest, Alignment, Attribute, Candidate, CandidateUpdate, Company, CourseRequest, CourseSuggestion,
  DEFAULT_USER_PREFS, InterviewNote, Invite, Match, Override, Placement, PortalUser, QuestionGuide, Reason,
  RegisterRequest, ReviewRequest, Role, RoleAnon, ShareShortlistRequest, ShortlistEntry, ShortlistLink, SubmissionCheck, ShortlistStatusRequest,
  CvSubmissionFields, SourceSpan, Submission, SubmitRequest, UserPrefs,
} from "./index.ts";

const d = new Date("2026-01-01");
const base = { ownerUid: "u1", createdAt: d, updatedAt: d };
const reason = { text: "t", attributeIds: ["a1"] };

const attribute = { ...base, candidateId: "c", sourceType: "note", noteId: "n", type: "skill", value: "SAP FI", confidence: 0.8, sourceSpan: { start: 0, end: 5 }, observedAt: d, confirmedByRecruiter: false, modelVersion: "m/v1" };
const match = { ...base, roleId: "r", candidateId: "c", rank: 1, reasonsFor: [reason], reasonsAgainst: [reason], skillAlignment: [], questionsToAsk: [], evidenceAgeDays: 3, staleness: "fresh", forgotten: false, generatedAt: d, modelVersion: "m/v1" };

const fixtures: [string, { safeParse(v: unknown): { success: boolean } }, unknown][] = [
  ["Candidate", Candidate, { ...base, fullName: "A B", headline: "h", location: "CT", parseConfidence: 0.9, parseStatus: "ok" }],
  ["InterviewNote", InterviewNote, { ...base, candidateId: "c", rawText: "x", capturedAt: d, interpretStatus: "pending" }],
  ["Attribute", Attribute, attribute],
  ["Company", Company, { ...base, name: "n", sector: "s", hiringPattern: "h", notes: "" }],
  ["Role", Role, { ...base, companyId: "co", title: "t", briefText: "b", briefSource: "paste", status: "open", openedAt: d }],
  ["Match", Match, match],
  ["Override", Override, { ...base, matchId: "m", roleId: "r", candidateId: "c", companyId: "co", decision: "reject", reasonCodes: [], reasonText: "", decidedAt: d }],
  ["QuestionGuide", QuestionGuide, { ownerUid: "u1", questions: ["q"], version: 1, updatedAt: d }],
  ["Placement", Placement, { ...base, companyId: "co", candidateId: "c", roleId: "r", outcome: "placed", reason: "", date: d }],
  ["UserPrefs", UserPrefs, DEFAULT_USER_PREFS],
];

describe("valid fixtures parse", () => {
  it.each(fixtures)("%s", (_n, schema, value) => expect(schema.safeParse(value).success).toBe(true));
});

describe("non-negotiable refinements", () => {
  it("rejects inverted, empty and negative spans", () => {
    for (const s of [{ start: 5, end: 2 }, { start: 3, end: 3 }, { start: -1, end: 4 }])
      expect(SourceSpan.safeParse(s).success).toBe(false);
  });
  it("rejects an uncited reason", () => {
    expect(Reason.safeParse({ text: "t", attributeIds: [] }).success).toBe(false);
  });
  it("alignment id rules", () => {
    const al = (kind: string, attributeIds: string[]) =>
      Alignment.safeParse({ requirement: "r", evidence: "e", kind, attributeIds }).success;
    expect(al("not-seen", ["a"])).toBe(false);
    expect(al("interpreted", [])).toBe(false);
    expect(al("stated", [])).toBe(false);
    expect(al("not-seen", [])).toBe(true);
    expect(al("stated", ["a"])).toBe(true);
  });
  it("match needs both reason arrays and has no score; confidence bounded", () => {
    const noAgainst: Record<string, unknown> = { ...match };
    delete noAgainst.reasonsAgainst;
    expect(Match.safeParse(noAgainst).success).toBe(false);
    expect("score" in Match.parse({ ...match, score: 99 })).toBe(false);
    expect(Attribute.safeParse({ ...attribute, confidence: 1.2 }).success).toBe(false);
  });
  it("default board fills 12 cells and shelves six widgets", () => {
    const cells = { "1x1": 1, "2x1": 2, "2x2": 4 };
    const on = DEFAULT_USER_PREFS.dashboard.filter((w) => w.visible);
    expect(on.reduce((n, w) => n + cells[w.size], 0)).toBe(12);
    expect(DEFAULT_USER_PREFS.dashboard.length - on.length).toBe(6);
  });
  it("a candidate-sourced attribute must cite its submission", () => {
    expect(Attribute.safeParse({ ...attribute, sourceType: "candidate", noteId: undefined }).success).toBe(false);
    expect(Attribute.safeParse({ ...attribute, sourceType: "candidate", noteId: undefined, submissionId: "s" }).success).toBe(true);
  });
});

// ---- Portals ----
const anon = { title: "SAP FICO consultant", sector: "Logistics", region: "Western Cape", seniority: "Senior", salaryBand: "R50k–R60k" };
const cvFields = { fullName: "Lerato M", headline: "h", location: "CT", currentRole: "Analyst", history: [{ title: "Analyst" }], education: [], skills: ["SAP FI"] };
const briefFields = { title: "FICO", workMode: "hybrid", travel: "", budget: { min: 1, max: 2, currency: "ZAR" }, location: "CT", mustHave: [], niceToHave: [], seniority: "Senior" };
const sub = { ...base, submittedBy: "p1", correctedFields: [], readStatus: "clear", status: "pending", submittedAt: d };
const card = { label: "Candidate B", headline: "h", years: 6, facts: { location: "CT", workMode: "Hybrid", notice: "1 month", salary: "R55k" }, case: { for: [{ text: "t", at: d }], against: [{ text: "t", at: d }] } };
const entry = { ...base, ...card, roleId: "r", roleTitle: "FICO", companyId: "co", status: "shortlisted", statusHistory: [], sharedAt: d };
const course = { title: "S/4HANA Finance", why: "Asked for in 7 of the 10 roles you came close to", duration: "6 weeks" };

const portal: [string, { safeParse(v: unknown): { success: boolean } }, unknown, unknown][] = [
  ["PortalUser", PortalUser, { ...base, role: "candidate", email: "a@b.co", displayName: "A" }, { ...base, role: "recruiter", email: "a@b.co", displayName: "A" }],
  ["Invite", Invite, { ...base, companyId: "co", email: "m@v.co", expiresAt: d, createdBy: "u1" }, { ...base, companyId: "co", email: "not-an-email", expiresAt: d, createdBy: "u1" }],
  ["Submission cv", Submission, { ...sub, kind: "cv", fields: cvFields }, { ...sub, kind: "cv", fields: briefFields }],
  ["Submission brief", Submission, { ...sub, kind: "brief", fields: briefFields }, { ...sub, kind: "brief", fields: { ...briefFields, title: "" } }],
  ["Submission details-change", Submission, { ...sub, kind: "details-change", fields: { salary: "R60k" } }, { ...sub, kind: "details-change", fields: {} }],
  ["Submission not-accepted", Submission, { ...sub, kind: "cv", fields: cvFields, status: "not-accepted", reasonCode: "unreadable", reasonText: "The PDF is a scan." }, { ...sub, kind: "cv", fields: cvFields, status: "not-accepted", reasonCode: "unreadable" }],
  ["ShortlistEntry", ShortlistEntry, entry, { ...entry, case: { for: card.case.for, against: [] } }],
  ["ShortlistEntry identity", ShortlistEntry, { ...entry, status: "interviewing", statusHistory: [{ status: "interviewing", by: "co1", at: d }], identity: { fullName: "A", email: "e", phone: "p" } }, { ...entry, identity: { fullName: "A", email: "e", phone: "p" } }],
  ["ShortlistLink", ShortlistLink, { ...base, roleId: "r", candidateId: "c", sharedAt: d }, { ...base, roleId: "r", sharedAt: d }],
  ["SubmissionCheck", SubmissionCheck, { ...base, possibleDuplicateOf: "c" }, { ...base }],
  ["CandidateUpdate", CandidateUpdate, { ...base, candidateId: "c", portalUid: "p", roleAnon: anon, status: "shortlisted", at: d }, { ...base, candidateId: "c", portalUid: "p", roleAnon: anon, status: "hired", at: d }],
  ["CourseSuggestion", CourseSuggestion, { ...base, items: [course], basis: { roleIds: ["r"] }, status: "draft", generatedAt: d, modelVersion: "m/v1" }, { ...base, items: [course, course, course, course], basis: { roleIds: [] }, status: "draft", generatedAt: d, modelVersion: "m/v1" }],
  ["RegisterRequest", RegisterRequest, { displayName: "Lerato", consent: true }, { displayName: "Lerato", consent: false }],
  ["AcceptInviteRequest", AcceptInviteRequest, { displayName: "Megan" }, { displayName: " " }],
  ["SubmitRequest cv", SubmitRequest, { kind: "cv", fileRef: "users/p/cvs/a.pdf", fields: cvFields, correctedFields: ["location"], parseConfidence: 0.8 }, { kind: "cv", fields: cvFields, correctedFields: [], parseConfidence: 0.8 }],
  ["SubmitRequest brief", SubmitRequest, { kind: "brief", text: "We need…", fileRef: null, fields: briefFields, correctedFields: [] }, { kind: "brief", text: "We need…", fileRef: "users/p/briefs/b.pdf", fields: briefFields, correctedFields: [] }],
  ["ReviewRequest", ReviewRequest, { action: "not-accepted", reasonCode: "other", reasonText: "Outside SAP." }, { action: "not-accepted", reasonCode: "other", reasonText: "" }],
  ["ShareShortlistRequest", ShareShortlistRequest, { roleId: "r", entries: [{ ...card, candidateId: "c" }] }, { roleId: "r", entries: [] }],
  ["ShortlistStatusRequest", ShortlistStatusRequest, { entryId: "e", status: "hired", startDate: "2026-12-01", salary: { amount: 55000, currency: "ZAR", period: "month" } }, { entryId: "e", status: "not-progressing" }],
  ["CourseRequest", CourseRequest, { action: "approve", items: [course] }, { action: "approve", items: [] }],
];

describe("portal schemas", () => {
  it.each(portal)("%s accepts the valid case and rejects the invalid one", (_n, schema, ok, bad) => {
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });
  it("a candidate update cannot carry a company field", () => {
    const update = { ...base, candidateId: "c", portalUid: "p", roleAnon: anon, status: "shortlisted", at: d };
    expect(CandidateUpdate.safeParse({ ...update, companyId: "co_demo_vantage" }).success).toBe(false);
    expect(CandidateUpdate.safeParse({ ...update, roleAnon: { ...anon, company: "Vantage" } }).success).toBe(false);
    expect(Object.keys(CandidateUpdate.shape).some((k) => /company/i.test(k))).toBe(false);
    expect(Object.keys(RoleAnon.shape).some((k) => /company/i.test(k))).toBe(false);
  });
  it("a CV submission may carry notice and an ISO available-from date, both optional", () => {
    expect(CvSubmissionFields.safeParse(cvFields).success).toBe(true);
    expect(CvSubmissionFields.safeParse({ ...cvFields, notice: "One calendar month", availableFrom: "2026-12-01" }).success).toBe(true);
    expect(CvSubmissionFields.safeParse({ ...cvFields, availableFrom: "1 Dec 2026" }).success).toBe(false);
    expect(CvSubmissionFields.safeParse({ ...cvFields, notice: "x".repeat(101) }).success).toBe(false);
  });
  it("roles carry anon and portal briefs; placements carry hire terms", () => {
    expect(Role.safeParse({ ...base, companyId: "co", title: "t", briefText: "b", briefSource: "portal", status: "open", openedAt: d, anon }).success).toBe(true);
    expect(Placement.safeParse({ ...base, companyId: "co", candidateId: "c", roleId: "r", outcome: "placed", reason: "", date: d, startDate: d, salary: { amount: 55000, currency: "ZAR", period: "month" }, source: "company" }).success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  Alignment, Attribute, Candidate, Company, DEFAULT_USER_PREFS, InterviewNote, Match, Override,
  Placement, QuestionGuide, Reason, Role, SourceSpan, UserPrefs,
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
  it("default board fills 12 cells and shelves five widgets", () => {
    const cells = { "1x1": 1, "2x1": 2, "2x2": 4 };
    const on = DEFAULT_USER_PREFS.dashboard.filter((w) => w.visible);
    expect(on.reduce((n, w) => n + cells[w.size], 0)).toBe(12);
    expect(DEFAULT_USER_PREFS.dashboard.length - on.length).toBe(5);
  });
});

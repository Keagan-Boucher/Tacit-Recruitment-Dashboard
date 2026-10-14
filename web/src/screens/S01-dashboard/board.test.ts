import { expect, it } from "vitest";
import type { Candidate, Match, Override, Role } from "@tacit/shared";
import { buildBoard, EMPTY, type Snapshot } from "./board";

const now = new Date("2026-10-20");
const ago = (months: number) => new Date(now.getTime() - months * 30.4375 * 86_400_000);
const base = { ownerUid: "u", createdAt: ago(20), updatedAt: ago(20) };
const cand = (id: string, openedMo: number) => ({ ...base, id, fullName: id, headline: "", location: "", parseConfidence: 1, parseStatus: "ok", topSkills: [], lastOpenedAt: ago(openedMo) }) as Candidate & { id: string };
const role = { ...base, id: "r1", companyId: "c1", title: "FICO", status: "open", openedAt: ago(1) } as Role & { id: string };
const match = (id: string, candidateId: string, rank: number) => ({ ...base, id, roleId: "r1", candidateId, rank, reasonsFor: [{ text: "f", attributeIds: ["a"] }], reasonsAgainst: [], questionsToAsk: ["q"], evidenceAgeDays: 400, staleness: "stale", forgotten: false, generatedAt: ago(1) }) as unknown as Match & { id: string };
const snap: Snapshot = { ...EMPTY, candidates: [cand("old", 14), cand("new", 1)], roles: [role], matches: [match("m1", "new", 1), match("m2", "old", 2)] };

it("forgotten hero is the best-ranked undecided match for someone not opened in months", () => {
  expect(buildBoard(snap, now).forgotten?.candidate.id).toBe("old");
  expect(buildBoard(snap, now).waiting).toHaveLength(1); // the hero is not listed twice
});

it("a decided match leaves the queue; a reversed decision brings it back", () => {
  const ov = { ...base, id: "o1", matchId: "m2", roleId: "r1", candidateId: "old", companyId: "c1", decision: "shortlist", reasonCodes: [], reasonText: "x", decidedAt: ago(0) } as Override & { id: string };
  expect(buildBoard({ ...snap, overrides: [ov] }, now).forgotten).toBeUndefined();
  expect(buildBoard({ ...snap, overrides: [ov] }, now).shortlist).toHaveLength(0); // already shortlisted
  expect(buildBoard({ ...snap, overrides: [{ ...ov, reversedAt: now }] }, now).forgotten).toBeDefined();
});

it("an empty snapshot is a quiet board", () => {
  const b = buildBoard(EMPTY, now);
  expect(b.total).toBe(0);
  expect(b.forgotten).toBeUndefined();
  expect(b.people.bars).toHaveLength(12);
});

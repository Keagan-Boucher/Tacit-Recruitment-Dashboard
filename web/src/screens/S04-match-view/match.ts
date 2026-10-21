import type { Alignment, Attribute, Candidate, InterpretedBrief, Staleness } from "@tacit/shared";
import { isForgotten, monthsSince, staleness } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { fmtDate } from "../S03-candidate-profile/profile";

const rand = (n: number) => `R${Math.round(n / 1000)}k`;

/** "R52k to R55k"; other currencies lead with their code. */
export function budgetText({ min, max, currency }: InterpretedBrief["budget"]) {
  const [a, b] = currency === "ZAR" ? [rand(min), rand(max)] : [`${currency} ${min}`, `${currency} ${max}`];
  return `${a} to ${b}`;
}

/** The brief in the recruiter's screening order (work mode, travel, budget, location, must-haves, nice-to-haves, seniority). */
export const briefRows = (b: InterpretedBrief): [label: string, value: string][] => [
  ["Work mode", b.workMode],
  ["Travel", b.travel],
  ["Budget", budgetText(b.budget)],
  ["Location", b.location],
  ["Must have", b.mustHave.join(", ")],
  ["Nice to have", b.niceToHave.join(", ")],
  ["Seniority", b.seniority],
];

/** "2 of 3 evidenced": rows that are not "Not seen". Never a percentage. */
export const evidencedCount = (rows: Alignment[]) => `${rows.filter((r) => r.kind !== "not-seen").length} of ${rows.length} evidenced`;

export const ALIGN_LABEL = { stated: "Stated", interpreted: "Interpreted", "not-seen": "Not seen" } as const;

export type SourceKind = "note" | "override" | "cv" | "brief";
const SOURCE_NAME: Record<SourceKind, string> = { note: "Your note", override: "Your reason", cv: "CV", brief: "Brief" };

/** The quiet line under a reason: "Your note · 12 Aug 2025", "Brief · 24 Oct 2026", "CV" (undated). `age` ("14 months ago") only when the cited fact is stale. */
export function sourceLine(kind: SourceKind, observedAt: Date | undefined, st: Staleness = "fresh", months = 0) {
  return {
    text: observedAt ? `${SOURCE_NAME[kind]} · ${fmtDate(observedAt)}` : SOURCE_NAME[kind],
    age: st === "stale" ? `${months} months ago` : null,
  };
}

export type Provenance = { text: string; age: string | null; attributeId: string; candidateId: string } | null;

/** Forgotten now, from the candidate's live lastOpenedAt (opening S03 clears it), not the flag stamped when the match ran. */
export const forgottenNow = (c: Pick<Candidate, "lastOpenedAt"> | undefined, now: Date) => !!c && isForgotten(c.lastOpenedAt, now);

/** Where a reason or alignment row comes from: its newest cited attribute, with that attribute's age. Null when none resolves. */
export function provenance(ids: string[], attrs: Map<string, WithId<Attribute>>, now: Date): Provenance {
  const found = ids.map((id) => attrs.get(id)).filter((a): a is WithId<Attribute> => !!a);
  if (!found.length) return null;
  const a = found.reduce((x, y) => (y.observedAt > x.observedAt ? y : x));
  return {
    ...sourceLine(a.sourceType, a.observedAt, staleness(a.observedAt, now), monthsSince(a.observedAt, now)),
    attributeId: a.id,
    candidateId: a.candidateId,
  };
}

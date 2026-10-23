import type { Alignment, Attribute, AttributeType, Candidate, Override, Staleness } from "@tacit/shared";
import { factStaleness, isForgotten, isPerishable, monthsSince } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { fmtDate } from "../S03-candidate-profile/profile";
import { REASONS } from "../S06-override-dialog/override";

/** Rows that are not "Not seen", with the total: "2" of "4 in your notes". Never a percentage. */
export const evidencedCount = (rows: Alignment[]) => ({ n: rows.filter((r) => r.kind !== "not-seen").length, total: rows.length });

export type SourceKind = "note" | "override" | "cv" | "brief" | "candidate";
const SOURCE_NAME: Record<SourceKind, string> = { note: "Your note", override: "Your reason", cv: "CV", brief: "Brief", candidate: "Their update" };

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

/** Where a reason or alignment row comes from: its newest cited attribute. The age shows only when that fact is perishable and stale. Null when none resolves. */
export function provenance(ids: string[], attrs: Map<string, WithId<Attribute>>, now: Date): Provenance {
  const found = ids.map((id) => attrs.get(id)).filter((a): a is WithId<Attribute> => !!a);
  if (!found.length) return null;
  const a = found.reduce((x, y) => (y.observedAt > x.observedAt ? y : x));
  return {
    ...sourceLine(a.sourceType, a.observedAt, factStaleness(a.type, a.observedAt, now), monthsSince(a.observedAt, now)),
    attributeId: a.id,
    candidateId: a.candidateId,
  };
}

const PERISHABLE_LABEL: Partial<Record<AttributeType, string>> = { salary: "Salary", availability: "Availability", "work-mode": "Work mode", trajectory: "Current work" };

/** The perishable facts a card rests on that are no longer fresh, newest first: what to re-check before shortlisting. */
export function agedFacts(ids: string[], attrs: Map<string, WithId<Attribute>>, now: Date) {
  const seen = new Set<string>();
  return ids
    .filter((id) => !seen.has(id) && seen.add(id))
    .map((id) => attrs.get(id))
    .filter((a): a is WithId<Attribute> => !!a && isPerishable(a.type) && factStaleness(a.type, a.observedAt, now) !== "fresh")
    .sort((x, y) => y.observedAt.getTime() - x.observedAt.getTime())
    .map((a) => ({
      id: a.id,
      candidateId: a.candidateId,
      label: `${PERISHABLE_LABEL[a.type]} ${a.editedValue ?? a.value}`,
      ...sourceLine(a.sourceType, a.observedAt, factStaleness(a.type, a.observedAt, now), monthsSince(a.observedAt, now)),
    }));
}

/** The recruiter's standing decision on a match: the newest one not reversed. */
export const standingDecision = <T extends Pick<Override, "matchId" | "reversedAt" | "decidedAt">>(overrides: T[], matchId: string): T | undefined =>
  overrides.filter((o) => o.matchId === matchId && !o.reversedAt).sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())[0];

/** "Your call · 21 Oct 2026" for a shortlist; "Your reason · 21 Oct 2026" plus the reason (typed text, else the chosen reasons) for a reject. */
export function decisionNote(o: Pick<Override, "decision" | "decidedAt" | "reasonText" | "reasonCodes">) {
  if (o.decision === "shortlist") return { text: `Your call · ${fmtDate(o.decidedAt)}`, quote: null };
  const why = o.reasonText.trim() || o.reasonCodes.map((c) => REASONS.find(([slug]) => slug === c)?.[1] ?? c).join(", ");
  return { text: `Your reason · ${fmtDate(o.decidedAt)}`, quote: why || null };
}

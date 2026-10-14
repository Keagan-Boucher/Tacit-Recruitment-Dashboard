import type { Match } from "@tacit/shared";
import { Attribute, Override } from "@tacit/shared";

/** Reason chips from the S06 frame. The slug is what is stored (S11 groups on it); the label is what the recruiter reads. */
export const REASONS = [
  ["salary-above-budget", "Salary above budget"],
  ["seniority-no-fit", "Seniority does not fit"],
  ["location", "Location does not work"],
  ["missing-must-have", "Missing a must-have skill"],
  ["not-looking", "Not looking right now"],
  ["client-declined-before", "Client turned them down before"],
  ["other", "Something else"],
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-01" (from <input type="date">) -> "From 1 Nov 2026". */
export const fromDate = (iso: string) => {
  const [y, m = 1, d] = iso.split("-").map(Number);
  return `From ${d} ${MONTHS[m - 1]} ${y}`;
};

type In = {
  overrideId: string;
  uid: string;
  match: Pick<Match, "roleId" | "candidateId"> & { id: string };
  companyId: string;
  codes: string[];
  text: string;
  salary: string;
  available: string;
  now: Date;
};

/**
 * One reject override plus one fresh, confirmed attribute per filled "Anything new?" field. Both are parsed with
 * the shared schemas, so nothing unvalidated is written. The attribute's span covers the update value itself.
 */
export function buildDecision({ overrideId, uid, match, companyId, codes, text, salary, available, now }: In) {
  const updates = [
    { type: "salary" as const, value: salary.trim() },
    { type: "availability" as const, value: available ? fromDate(available) : "" },
  ].filter((u) => u.value);
  const stamp = { ownerUid: uid, createdAt: now, updatedAt: now };
  const override = Override.parse({
    ...stamp, matchId: match.id, roleId: match.roleId, candidateId: match.candidateId, companyId,
    decision: "reject", reasonCodes: codes, reasonText: text.trim(), decidedAt: now,
    ...(updates.length ? { updates } : {}),
  });
  const attributes = updates.map((u) =>
    Attribute.parse({
      ...stamp, candidateId: match.candidateId, sourceType: "override", overrideId, type: u.type, value: u.value,
      confidence: 1, sourceSpan: { start: 0, end: u.value.length }, observedAt: now, confirmedByRecruiter: true, modelVersion: "recruiter",
    }),
  );
  return { override, attributes };
}

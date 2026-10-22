import type { Override, Placement } from "@tacit/shared";
import { REASONS } from "../S06-override-dialog/override";

// Codes the seed and older overrides use beyond the S06 chips.
const EXTRA: Record<string, string> = {
  "no-s4-hands-on": "No S/4HANA hands-on",
  "wants-leadership": "Wants to lead, not build",
};
const LABELS = new Map<string, string>([...REASONS, ...Object.entries(EXTRA)]);
export const reasonLabel = (code: string) => LABELS.get(code) ?? (code.charAt(0).toUpperCase() + code.slice(1).replaceAll("-", " "));

/** `source`: the client's own rejection, or the recruiter's override. */
export type Case = { key: string; candidateId: string; roleId: string; at: Date; source: "client" | "override" };
export type Group = { label: string; cases: Case[] };

/** What the client has said no to: client rejections (by the reason given) and the recruiter's own rejects (by reason chip). Reversed overrides do not count. */
export function turnedDown(placements: Placement[], overrides: Override[]): Group[] {
  const groups = new Map<string, Case[]>();
  const add = (label: string, c: Case) => groups.set(label, [...(groups.get(label) ?? []), c]);
  for (const p of placements as (Placement & { id: string })[])
    if (p.outcome === "client-rejected") add(p.reason.trim(), { key: p.id, candidateId: p.candidateId, roleId: p.roleId, at: p.date, source: "client" });
  for (const o of overrides as (Override & { id: string })[])
    if (o.decision === "reject" && !o.reversedAt)
      for (const code of o.reasonCodes) add(reasonLabel(code), { key: `${o.id}:${code}`, candidateId: o.candidateId, roleId: o.roleId, at: o.decidedAt, source: "override" });
  return [...groups]
    .map(([label, cases]) => ({ label, cases: cases.sort((a, b) => b.at.getTime() - a.at.getTime()) }))
    .sort((a, b) => b.cases.length - a.cases.length || b.cases[0]!.at.getTime() - a.cases[0]!.at.getTime());
}

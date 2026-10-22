import type { Match, Override } from "@tacit/shared";

export type RoleCounts = { waiting: number; shortlisted: number; passed: number };

/** Where a role's suggestions stand: the latest unreversed decision per match; undecided ones are waiting on the recruiter. */
export function roleCounts(roleId: string, matches: (Match & { id: string })[], overrides: Override[]): RoleCounts {
  const decided = new Map<string, Override["decision"]>();
  for (const o of [...overrides].sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime())) if (!o.reversedAt) decided.set(o.matchId, o.decision);
  const ms = matches.filter((m) => m.roleId === roleId);
  return {
    waiting: ms.filter((m) => !decided.has(m.id)).length,
    shortlisted: ms.filter((m) => decided.get(m.id) === "shortlist").length,
    passed: ms.filter((m) => decided.get(m.id) === "reject").length,
  };
}

/** "7 suggestions waiting on you", or once everything is decided "2 shortlisted, 1 passed". */
export function roleLine({ waiting, shortlisted, passed }: RoleCounts): string {
  if (waiting) return `${waiting} ${waiting === 1 ? "suggestion" : "suggestions"} waiting on you`;
  return [shortlisted && `${shortlisted} shortlisted`, passed && `${passed} passed`].filter(Boolean).join(", ") || "No suggestions yet";
}

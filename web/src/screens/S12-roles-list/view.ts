import type { Company, Match, Override, Role } from "@tacit/shared";
import type { WithId } from "../../lib/data";

export type RoleRow = { role: WithId<Role>; company: string; suggested: number; waiting: number; shortlisted: number; stale: number };

/** "R55k", "R75k to R85k"; "" when the brief had no budget. */
export function budgetLabel(b: Role["interpretedBrief"]): string {
  const { min, max } = b?.budget ?? { min: 0, max: 0 };
  const k = (n: number) => `R${Math.round(n / 1000)}k`;
  return !max && !min ? "" : min === max || !min ? k(max) : !max ? k(min) : `${k(min)} to ${k(max)}`;
}

/** One row per role: counts come from its matches, minus the ones the recruiter has decided (a reversed decision doesn't count). */
export function roleRows(roles: WithId<Role>[], companies: WithId<Company>[], matches: WithId<Match>[], overrides: WithId<Override>[]): RoleRow[] {
  const decided = new Map<string, Override["decision"]>();
  for (const o of [...overrides].sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime())) {
    if (!o.reversedAt) decided.set(o.matchId, o.decision);
  }
  return roles
    .map((role) => {
      const ms = matches.filter((m) => m.roleId === role.id);
      const shortlisted = ms.filter((m) => decided.get(m.id) === "shortlist").length;
      const waiting = ms.filter((m) => !decided.has(m.id)).length;
      return {
        role,
        company: companies.find((c) => c.id === role.companyId)?.name ?? "",
        suggested: ms.length,
        waiting,
        shortlisted,
        stale: ms.filter((m) => m.staleness === "stale").length,
      };
    })
    .sort((a, b) => b.waiting - a.waiting || b.role.openedAt.getTime() - a.role.openedAt.getTime());
}

/** Role title, company or any brief skill. */
export function matchesQuery({ role, company }: RoleRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  const skills = [...(role.interpretedBrief?.mustHave ?? []), ...(role.interpretedBrief?.niceToHave ?? [])];
  return !needle || [role.title, company, ...skills].some((s) => s.toLowerCase().includes(needle));
}

import { monthsSince, staleness } from "@tacit/shared";
import type { Company, Role } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { lastSeen, matchesQuery, type Person } from "../S08-candidates-list/view";

export type Hit = { key: string; kind: "candidate" | "company" | "role"; to: string; title: string; sub: string; staleMonths?: number };
export type HitGroup = { label: string; hits: Hit[] };

const PER_GROUP_RECENT = 3;
const PER_GROUP_FOUND = 5;

const newest = <T extends { updatedAt: Date }>(key: (x: T) => Date = (x) => x.updatedAt) => (a: T, b: T) => key(b).getTime() - key(a).getTime();

/**
 * Candidates, companies and roles for the palette. Empty query = the most recently touched few of each;
 * otherwise every word of the query must appear in the item's text (case-insensitive). Empty groups are dropped.
 */
// ponytail: plain substring match over the recruiter's own data; swap for /api/search (R-13) if "by meaning" is wanted here.
export function buildGroups(people: Person[], companies: WithId<Company>[], roles: WithId<Role>[], query: string, now: Date): HitGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (...parts: string[]) => terms.every((t) => parts.join(" ").toLowerCase().includes(t));
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const pick = <T,>(rows: T[], ok: (r: T) => boolean, recent: (a: T, b: T) => number): T[] =>
    terms.length ? rows.filter(ok).slice(0, PER_GROUP_FOUND) : [...rows].sort(recent).slice(0, PER_GROUP_RECENT);
  const label = (w: string) => (terms.length ? w : `Recent ${w.toLowerCase()}`);

  const groups: HitGroup[] = [
    {
      label: label("People"),
      hits: pick(people, (p) => matchesQuery(p, query), newest<Person>((p) => p.lastOpenedAt ?? p.updatedAt)).map((p) => ({
        key: `candidate-${p.id}`,
        kind: "candidate",
        to: `/candidates/${p.id}`,
        title: p.fullName,
        sub: [p.headline, p.location].filter(Boolean).join(", "),
        staleMonths: staleness(lastSeen(p), now) === "stale" ? monthsSince(lastSeen(p), now) : undefined,
      })),
    },
    {
      label: label("Companies"),
      hits: pick(companies, (c) => has(c.name, c.sector), newest<WithId<Company>>()).map((c) => ({
        key: `company-${c.id}`,
        kind: "company",
        to: `/companies/${c.id}`,
        title: c.name,
        sub: c.sector,
      })),
    },
    {
      label: label("Roles"),
      hits: pick(roles, (r) => has(r.title, names.get(r.companyId) ?? ""), newest<WithId<Role>>()).map((r) => ({
        key: `role-${r.id}`,
        kind: "role",
        to: `/roles/${r.id}`,
        title: r.title,
        sub: [names.get(r.companyId), r.status].filter(Boolean).join(", "),
      })),
    },
  ];
  return groups.filter((g) => g.hits.length > 0);
}

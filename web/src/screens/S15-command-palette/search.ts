import type { Company, Role } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { matchesQuery, type Person } from "../S08-candidates-list/view";

export type Hit = { key: string; kind: "candidate" | "company" | "role" | "search" | "new"; to: string; title: string; sub: string; recent?: boolean };
/** `count` is the true number of matches (a group lists at most PER_GROUP_FOUND of them); only set for search results. */
export type HitGroup = { label: string; hits: Hit[]; count?: number };

const PER_GROUP_RECENT = 3;
const PER_GROUP_FOUND = 5;

const newest = <T extends { updatedAt: Date }>(key: (x: T) => Date = (x) => x.updatedAt) => (a: T, b: T) => key(b).getTime() - key(a).getTime();

/**
 * Candidates, companies and roles for the palette. Empty query = the most recently touched few of each;
 * otherwise every word of the query must appear in the item's text (case-insensitive). Empty groups are dropped.
 */
// ponytail: plain substring match over the recruiter's own data; swap for /api/search (R-13) if "by meaning" is wanted here.
export function buildGroups(people: Person[], companies: WithId<Company>[], roles: WithId<Role>[], query: string): HitGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (...parts: string[]) => terms.every((t) => parts.join(" ").toLowerCase().includes(t));
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const totals: number[] = []; // one per group, in the order pick is called below
  const pick = <T,>(rows: T[], ok: (r: T) => boolean, recent: (a: T, b: T) => number): T[] => {
    if (!terms.length) return [...rows].sort(recent).slice(0, PER_GROUP_RECENT);
    const all = rows.filter(ok);
    totals.push(all.length);
    return all.slice(0, PER_GROUP_FOUND);
  };
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
  if (terms.length) groups.forEach((g, i) => (g.count = totals[i]));
  return groups.filter((g) => g.hits.length > 0);
}

const NEW_NOTE: Hit = { key: "action-new", kind: "new", to: "/candidates", title: "New interview note", sub: "" };
const searchNotes = (q: string): Hit => ({ key: "action-search", kind: "search", to: `/candidates?q=${encodeURIComponent(q)}`, title: `Search notes for “${q}”`, sub: "" });
const RECENT_ON_MISS = 2;

/**
 * What the palette shows: results (or recent items) then an Actions group. A miss swaps that for
 * Suggested ("Search notes for …", first so Enter runs it) and a short Recent list: one person, one role.
 */
export function paletteGroups(people: Person[], companies: WithId<Company>[], roles: WithId<Role>[], query: string): { groups: HitGroup[]; miss: boolean } {
  const q = query.trim();
  const found = buildGroups(people, companies, roles, q);
  if (!q || found.length > 0) return { groups: [...found, { label: "Actions", hits: q ? [searchNotes(q), NEW_NOTE] : [NEW_NOTE] }], miss: false };
  const order = ["candidate", "role", "company"];
  const recent = buildGroups(people, companies, roles, "")
    .map((g) => g.hits[0]!)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, RECENT_ON_MISS)
    .map((h) => ({ ...h, sub: "", recent: true }));
  return { groups: [{ label: "Suggested", hits: [searchNotes(q)] }, ...(recent.length ? [{ label: "Recent", hits: recent }] : [])], miss: true };
}

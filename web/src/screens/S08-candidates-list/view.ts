import { isForgotten, monthsSince, staleness } from "@tacit/shared";
import type { Candidate } from "@tacit/shared";
import type { WithId } from "../../lib/data";

export type Person = WithId<Candidate>;
export type FilterId = "all" | "unopened" | "stale" | "cv";

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unopened", label: "Not opened in 6 months" },
  { id: "stale", label: "Stale evidence" },
  { id: "cv", label: "CV needs checking" },
];

const DAY = 86_400_000;

/** When the recruiter last heard from this person; a candidate with no interview yet counts from when they were added. */
export const lastSeen = (c: Person) => c.lastInterviewAt ?? c.createdAt;

/** "this week", "2 wk ago", "5 mo ago". */
export function lastSeenLabel(d: Date, now = new Date()) {
  const days = Math.floor((now.getTime() - d.getTime()) / DAY);
  if (days < 7) return "this week";
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  return `${monthsSince(d, now)} mo ago`;
}

const matchers: Record<FilterId, (c: Person, now: Date) => boolean> = {
  all: () => true,
  unopened: (c, now) => isForgotten(c.lastOpenedAt, now),
  stale: (c, now) => staleness(lastSeen(c), now) === "stale",
  cv: (c) => c.parseStatus !== "ok",
};
export const matchesFilter = (c: Person, f: FilterId, now: Date) => matchers[f](c, now);

/** Every word of the query must appear in the name, headline, location or a top skill (case-insensitive). */
// ponytail: R-13 swaps this for /api/search (search by meaning, "Why it matched"); until then it is a local text filter.
export function matchesQuery(c: Person, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [c.fullName, c.headline, c.location, ...c.topSkills].join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export type Group = { label: string; fade: 0 | 1 | 2; people: Person[] };

/** 0 = last 3 months, 1 = 3 to 12 months, 2 = over a year (row fade and group). */
export function fadeFor(p: Person, now: Date): Group["fade"] {
  const m = monthsSince(lastSeen(p), now);
  return m < 3 ? 0 : m <= 12 ? 1 : 2;
}

/** Newest-first people into "Last 3 months" / "3 to 12 months" / "Over a year". Empty groups are dropped. */
export function groupByAge(people: Person[], now: Date): Group[] {
  const groups: Group[] = [
    { label: "Last 3 months", fade: 0, people: [] },
    { label: "3 to 12 months", fade: 1, people: [] },
    { label: "Over a year", fade: 2, people: [] },
  ];
  for (const p of people) groups[fadeFor(p, now)]?.people.push(p);
  return groups.filter((g) => g.people.length > 0);
}

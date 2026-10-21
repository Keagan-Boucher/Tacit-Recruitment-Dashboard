import { isForgotten, monthsSince, staleness } from "@tacit/shared";
import type { Candidate, SearchHit } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { fmtDate } from "../S03-candidate-profile/profile";

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

// ---- search by meaning: where each "why it matched" comes from ----------------------------------

export type SourceFilterId = "all" | "cv" | "note" | "stale";
export const SOURCE_FILTERS: { id: SourceFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cv", label: "From CVs" },
  { id: "note", label: "From notes" },
  { id: "stale", label: "Stale evidence" },
];

/** What a hit may cite. "cv" is for CV facts once they are citable; today a cited attribute comes from a note or an override. */
export type CitedAttr = { id: string; candidateId: string; observedAt: Date; sourceType: "note" | "override" | "cv" };
export type HitSource = {
  kind: CitedAttr["sourceType"];
  /** "CV · 8 Sep 2026", "Your note · 12 Aug 2025", "Interpreted from your note · 14 Jul 2026" */
  text: string;
  /** Set only when the cited evidence is stale, e.g. 14. */
  staleMonths?: number;
  attributeId: string;
  candidateId: string;
};

/** The newest attribute the hit cites, as a source line. Null when none of them resolves (still loading, or deleted). */
export function hitSource(hit: Pick<SearchHit, "kind" | "attributeIds">, attrs: ReadonlyMap<string, CitedAttr>, now: Date): HitSource | null {
  const found = hit.attributeIds.map((id) => attrs.get(id)).filter((a): a is CitedAttr => !!a);
  if (!found.length) return null;
  const a = found.reduce((x, y) => (y.observedAt > x.observedAt ? y : x));
  const label = a.sourceType === "cv" ? "CV" : a.sourceType === "override" ? "Your reason" : hit.kind === "interpreted" ? "Interpreted from your note" : "Your note";
  return {
    kind: a.sourceType,
    text: `${label} · ${fmtDate(a.observedAt)}`,
    staleMonths: staleness(a.observedAt, now) === "stale" ? monthsSince(a.observedAt, now) : undefined,
    attributeId: a.id,
    candidateId: a.candidateId,
  };
}

/** Notes and the recruiter's own reasons both count as "From notes". Hits whose source is unresolved count only in All. */
export const matchesSource = (s: HitSource | null, f: SourceFilterId) =>
  f === "all" || (f === "cv" ? s?.kind === "cv" : f === "note" ? !!s && s.kind !== "cv" : s?.staleMonths !== undefined);

export const sourceCounts = (sources: (HitSource | null)[]): Record<SourceFilterId, number> => ({
  all: sources.length,
  cv: sources.filter((s) => matchesSource(s, "cv")).length,
  note: sources.filter((s) => matchesSource(s, "note")).length,
  stale: sources.filter((s) => matchesSource(s, "stale")).length,
});

// ---- highlighting the user's own words in the model's sentence ----------------------------------

const STOP = new Set(["the", "and", "for", "of", "in", "at", "to", "a", "an", "with", "is"]);
const trim = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const WORD = String.raw`\p{L}\p{N}`;

/**
 * Splits `text` into runs, marking the ones that match a word of `query` (case-insensitive, at the start of a word;
 * a trailing "s" on the query word is optional; two-letter words must match whole). Neighbouring matches merge,
 * so "Cape Town" is one run. The model's own spans are never invented.
 */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = new Set<string>();
  for (const w of query.toLowerCase().split(/\s+/)) {
    const t = trim(w);
    if (t.length < 2 || STOP.has(t)) continue;
    terms.add(t);
    if (t.length > 3 && t.endsWith("s")) terms.add(t.slice(0, -1));
  }
  if (!terms.size) return [{ text, hit: false }];
  const alt = [...terms].sort((a, b) => b.length - a.length).map((t) => escape(t) + (t.length <= 2 ? `(?![${WORD}])` : "")).join("|");
  const re = new RegExp(String.raw`(?<![${WORD}])(?:${alt})(?:\s+(?:${alt}))*`, "giu");
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

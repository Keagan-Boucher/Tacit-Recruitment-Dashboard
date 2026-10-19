import type { Attribute, AttributeType, InterviewNote, Override, Staleness } from "@tacit/shared";
import { monthsSince, staleness } from "@tacit/shared";
import type { WithId } from "../../lib/data";

// Pure helpers for S03: provenance (attribute -> exact phrase), ageing, and the "ask first" prompt.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

export function ordinal(n: number) {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Salary, availability and the like read bare ("R60k minimum"), so they get their label. */
const PREFIX: Partial<Record<AttributeType, string>> = {
  salary: "Salary expectation: ",
  availability: "Availability: ",
  "work-mode": "Work mode: ",
  location: "Location: ",
};

export type Observed = {
  id: string;
  n: number;
  label: string;
  /** What is shown; `original` is set when the recruiter edited it. */
  original?: string;
  quote: string;
  type: AttributeType;
  noteId?: string;
  /** [start, end) into the note's rawText; undefined for override-sourced attributes (their text is not a note). */
  span?: { start: number; end: number };
  /** "Note, 12 Aug 2025" / "Your reason, 14 Aug 2025" */
  source: string;
  observedAt: Date;
  months: number;
  staleness: Staleness;
};

/**
 * Confirmed attributes with the exact phrase they came from, newest first. An attribute whose span does not fit its
 * source text is dropped (and logged): it is never shown without its citation.
 */
export function buildObserved(
  attrs: WithId<Attribute>[],
  notes: WithId<InterviewNote>[],
  overrides: WithId<Override>[],
  now: Date,
): Observed[] {
  const out: Omit<Observed, "n">[] = [];
  for (const a of attrs) {
    if (!a.confirmedByRecruiter) continue;
    const isNote = a.sourceType === "note";
    const source = isNote ? notes.find((n) => n.id === a.noteId) : overrides.find((o) => o.id === a.overrideId);
    // S06 "Anything new?" values (modelVersion "recruiter") are spanned over the typed update, seeded ones over reasonText.
    const text = !source ? undefined
      : "rawText" in source ? source.rawText
      : a.modelVersion === "recruiter" ? source.updates?.find((u) => u.type === a.type)?.value
      : source.reasonText;
    const { start, end } = a.sourceSpan;
    if (text === undefined || start < 0 || end > text.length || start >= end) {
      console.warn(`S03: attribute ${a.id} hidden, its source span [${start}, ${end}) does not fit its text`);
      continue;
    }
    const shown = a.editedValue ?? a.value;
    out.push({
      id: a.id,
      label: (PREFIX[a.type] ?? "") + shown,
      original: a.editedValue && a.editedValue !== a.value ? a.value : undefined,
      quote: text.slice(start, end),
      type: a.type,
      noteId: isNote ? a.noteId : undefined,
      span: isNote ? { start, end } : undefined,
      source: isNote
        ? `Note, ${fmtDate((source as WithId<InterviewNote>).capturedAt)}`
        : `Your reason, ${fmtDate((source as WithId<Override>).decidedAt)}`,
      observedAt: a.observedAt,
      months: monthsSince(a.observedAt, now),
      staleness: staleness(a.observedAt, now),
    });
  }
  // Same observation time = same note: keep the order the phrases have in it.
  out.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || (a.span?.start ?? 0) - (b.span?.start ?? 0));
  return out.map((o, i) => ({ ...o, n: i + 1 }));
}

/** noteId -> how many of its attributes the recruiter has not kept yet. */
export function unkeptByNote(attrs: Attribute[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of attrs) if (a.noteId && !a.confirmedByRecruiter) m.set(a.noteId, (m.get(a.noteId) ?? 0) + 1);
  return m;
}

export type Piece = { text: string; id?: string; n?: number };

/** Splits a note into plain text and linked phrases. A span that overlaps an earlier one stays in the list but is not underlined. */
export function pieces(text: string, linked: Pick<Observed, "id" | "n" | "span">[]): Piece[] {
  const spans = linked.filter((l) => l.span).sort((a, b) => a.span!.start - b.span!.start);
  const out: Piece[] = [];
  let at = 0;
  for (const l of spans) {
    const { start, end } = l.span!;
    if (start < at) continue;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ text: text.slice(start, end), id: l.id, n: l.n });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

const CHECK: Partial<Record<AttributeType, string>> = { salary: "salary", availability: "availability", "work-mode": "work mode", location: "location" };

const joinList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Check his salary..." with the actual stale attribute types, no pronoun. Empty when nothing specific aged. */
export function recheckList(stale: Pick<Observed, "type">[]): string {
  const topics = [...new Set(stale.map((s) => CHECK[s.type]).filter((x): x is string => Boolean(x)))];
  if (stale.some((s) => s.type === "skill")) topics.push("any project work since");
  return joinList(topics);
}

/** The prompt is due when the newest thing the recruiter knows is itself stale. */
export function askFirst(observed: Observed[]) {
  if (!observed.length) return null;
  const newest = observed.reduce((a, b) => (b.observedAt > a.observedAt ? b : a));
  if (newest.staleness !== "stale") return null;
  return { months: newest.months, check: recheckList(observed.filter((o) => o.staleness === "stale")) };
}

/**
 * The selected attribute: the recruiter's own pick wins; before one, `?attr=` (a link from a match reason) if it names a row
 * shown here, else the dev default. Null = nothing selected.
 */
export function activeAttribute(picked: string | null | undefined, attrParam: string | null, observed: Pick<Observed, "id">[], fallback: string | null): string | null {
  if (picked !== undefined) return picked;
  return attrParam && observed.some((o) => o.id === attrParam) ? attrParam : fallback;
}

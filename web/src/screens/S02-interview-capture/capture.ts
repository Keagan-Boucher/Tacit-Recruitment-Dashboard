import type { Attribute, AttributeType } from "@tacit/shared";

// Pure helpers for S02: question headings, draft restore, provenance pieces, labels.

// ---- question guide ------------------------------------------------------------------------

const lines = (text: string) => text.split("\n");

/** Start offset of the line that is exactly `question`, or -1. */
export function headingAt(text: string, question: string): number {
  let at = 0;
  for (const l of lines(text)) {
    if (l.trim() === question) return at;
    at += l.length + 1;
  }
  return -1;
}

/** Questions whose heading is a line of the text. A chip is ticked exactly when this says so. */
export const askedQuestions = (text: string, questions: string[]) =>
  new Set(questions.filter((q) => headingAt(text, q) >= 0));

/**
 * Puts `question` on its own line at the cursor, followed by a new line so the cursor lands under it. Text after the
 * cursor moves under the heading. Sections are separated by a blank line. `cursor` is where the new cursor goes.
 */
export function insertHeading(text: string, at: number, question: string): { text: string; cursor: number } {
  const i = Math.max(0, Math.min(at, text.length));
  const before = text.slice(0, i);
  const sep = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const head = `${sep}${question}\n`;
  return { text: before + head + text.slice(i), cursor: i + head.length };
}

/** The note without its heading lines (for the "Earlier note" card). */
export function stripHeadings(text: string, questions: string[]): string {
  return lines(text)
    .filter((l) => !questions.includes(l.trim()))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ---- draft restore -------------------------------------------------------------------------

export type Draft = { noteId: string | null; text: string; at: number };

/**
 * Which text to open with. The local draft wins only when it is newer than what the server has (or the server has
 * nothing) and differs from it: the recruiter typed something that never got confirmed.
 */
export function pickDraft(server: { text: string; updatedAt?: Date } | null, draft: Draft | null): { text: string; restored: boolean } {
  if (!draft) return { text: server?.text ?? "", restored: false };
  if (!server) return { text: draft.text, restored: draft.text !== "" };
  const newer = draft.at > (server.updatedAt?.getTime() ?? 0);
  return newer && draft.text !== server.text ? { text: draft.text, restored: true } : { text: server.text, restored: false };
}

// ---- provenance ----------------------------------------------------------------------------

export type Cited = { id: string; n: number; start: number; end: number };
export type Part = { text: string; id?: string; n?: number };
export type Line = { heading: boolean; parts: Part[] };

/** Attributes whose span lies inside the text, in reading order, numbered 1..n. Anything else is not shown. */
export function citedAttributes<T extends Pick<Attribute, "sourceSpan"> & { id: string }>(attrs: T[], text: string): (T & { n: number })[] {
  return attrs
    .filter((a) => a.sourceSpan.start >= 0 && a.sourceSpan.start < a.sourceSpan.end && a.sourceSpan.end <= text.length)
    .sort((a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end)
    .map((a, i) => ({ ...a, n: i + 1 }));
}

/**
 * The note as display lines: heading lines (a line that is exactly a guide question) and body lines, with cited
 * phrases cut out as parts. A span that overlaps an earlier one is skipped here (its card still lists it). A span that
 * runs over a line break is split at it, each piece keeping the id.
 */
export function noteLines(text: string, questions: string[], cited: Cited[]): Line[] {
  const spans = [...cited].sort((a, b) => a.start - b.start);
  // Drop overlaps once, up front, so the line walk below can stay simple.
  const used: Cited[] = [];
  for (const s of spans) if (s.start >= (used[used.length - 1]?.end ?? 0)) used.push(s);

  const out: Line[] = [];
  let lineStart = 0;
  for (const l of lines(text)) {
    const lineEnd = lineStart + l.length;
    const parts: Part[] = [];
    let at = lineStart;
    for (const s of used) {
      const a = Math.max(s.start, lineStart);
      const b = Math.min(s.end, lineEnd);
      if (a >= b) continue;
      if (a > at) parts.push({ text: text.slice(at, a) });
      parts.push({ text: text.slice(a, b), id: s.id, n: s.n });
      at = b;
    }
    if (at < lineEnd) parts.push({ text: text.slice(at, lineEnd) });
    out.push({ heading: questions.includes(l.trim()), parts });
    lineStart = lineEnd + 1;
  }
  return out;
}

// ---- labels --------------------------------------------------------------------------------

export const TYPE_LABEL: Record<AttributeType, string> = {
  skill: "Skill",
  motivation: "Wants next",
  "reason-for-leaving": "Reason for leaving",
  "team-culture": "Team and culture",
  constraint: "Constraint",
  salary: "Salary",
  availability: "Availability",
  "work-mode": "Work mode",
  location: "Location",
  signal: "Signal",
  trajectory: "Trajectory",
};

const WORDS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
/** "Second interview": position among the candidate's notes, oldest first. */
export const noteTitle = (n: number, call: boolean) =>
  WORDS[n - 1] ? `${WORDS[n - 1]} ${call ? "call" : "interview"}` : `${call ? "Call" : "Interview"} ${n}`;

export const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** "R52k to R55k a month". */
export function budgetLine(b: { min: number; max: number; currency: string }): string {
  const sym = b.currency === "ZAR" ? "R" : `${b.currency} `;
  const k = (n: number) => `${sym}${n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1)}k`;
  return `${k(b.min)} to ${k(b.max)} a month`;
}

/** Candidate projection after skills are kept: newest kept first, no repeats, at most four. */
export const mergeTopSkills = (kept: string[], existing: string[]) =>
  [...new Set([...kept, ...existing])].slice(0, 4);

import type { Attribute, AttributeType, Candidate, InterviewNote } from "@tacit/shared";

export const DAY = 86_400_000;
export const MODEL = "seed/v1";
export const monthsAgo = (now: Date, m: number) => new Date(now.getTime() - Math.round(m * 30.4375) * DAY);
export const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * DAY);

export interface Doc<T> { id: string; data: T }
/** [type, value, phrase (must occur verbatim in the note text), keyword (must occur in the spanned text), confidence?] */
export type AttrSpec = [type: AttributeType, value: string, phrase: string, kw: string, confidence?: number];
export interface Section { q: string; text: string; attrs: AttrSpec[] }
export const sec = (q: string, text: string, ...attrs: AttrSpec[]): Section => ({ q, text, attrs });

export interface Ctx {
  now: Date;
  owner: string;
  notes: Doc<InterviewNote>[];
  attributes: Doc<Attribute>[];
  /** attribute id -> keyword the spanned text must contain (test + match lookups) */
  keywords: Record<string, string>;
}

const base = (ctx: Ctx, at: Date) => ({ ownerUid: ctx.owner, createdAt: at, updatedAt: at });

/** Positions of `phrase` in `text`; throws if absent so a bad seed can never ship. */
export function span(text: string, phrase: string) {
  const start = text.indexOf(phrase);
  if (start < 0) throw new Error(`phrase not found: "${phrase}"`);
  return { start, end: start + phrase.length };
}

export function addAttribute(ctx: Ctx, id: string, a: Omit<Attribute, "ownerUid" | "createdAt" | "updatedAt" | "sourceSpan" | "modelVersion">, text: string, spec: AttrSpec) {
  const [, , phrase, kw] = spec;
  const sourceSpan = span(text, phrase);
  if (!text.slice(sourceSpan.start, sourceSpan.end).toLowerCase().includes(kw.toLowerCase())) throw new Error(`kw "${kw}" not in "${phrase}"`);
  ctx.attributes.push({ id, data: { ...base(ctx, a.observedAt), ...a, sourceSpan, modelVersion: MODEL } });
  ctx.keywords[id] = kw;
}

/** Writes one note (rawText = question headings as plain lines) and its attributes. m = months ago. */
export function addNote(ctx: Ctx, slug: string, n: number, m: number, sections: Section[], o: { role?: string; unconfirmed?: boolean } = {}) {
  const id = `note_${slug}_${n}`;
  const rawText = sections.map((s) => `${s.q}\n${s.text}`).join("\n\n");
  const capturedAt = monthsAgo(ctx.now, m);
  const interpretedAt = new Date(capturedAt.getTime() + 120_000);
  ctx.notes.push({
    id,
    data: {
      ...base(ctx, capturedAt), candidateId: `cand_${slug}`, ...(o.role ? { roleContextId: o.role } : {}), rawText,
      questionGuideVersion: 1, capturedAt, interpretedAt, interpretStatus: "ok", modelVersion: MODEL,
    },
  });
  let i = 0;
  for (const s of sections) for (const spec of s.attrs) {
    const [type, value, , , confidence = 0.85] = spec;
    addAttribute(ctx, `attr_${slug}_${n}_${i++}`, {
      candidateId: `cand_${slug}`, sourceType: "note", noteId: id, type, value, confidence,
      observedAt: capturedAt, confirmedByRecruiter: !o.unconfirmed,
    }, rawText, spec);
  }
}

export interface CandRow { slug: string; name: string; headline: string; location: string; parse?: [Candidate["parseStatus"], number]; opened?: number; cv?: Candidate["cv"] }

/** Candidates are derived from their notes: dates, and the topSkills projection from skill attributes. */
export function buildCandidates(ctx: Ctx, rows: CandRow[]): Doc<Candidate>[] {
  return rows.map((r, i) => {
    const id = `cand_${r.slug}`;
    const notes = ctx.notes.filter((n) => n.data.candidateId === id).sort((a, b) => a.data.capturedAt.getTime() - b.data.capturedAt.getTime());
    if (!notes.length) throw new Error(`no notes for ${id}`);
    const last = notes[notes.length - 1].data.capturedAt;
    const topSkills = [...new Set(
      ctx.attributes.filter((a) => a.data.candidateId === id && a.data.type === "skill")
        .sort((a, b) => b.data.observedAt.getTime() - a.data.observedAt.getTime()).map((a) => a.data.value),
    )].slice(0, 4);
    const [parseStatus, parseConfidence] = r.parse ?? ["ok", 0.86 + (i % 10) * 0.01];
    return {
      id,
      data: {
        ...base(ctx, notes[0].data.capturedAt), updatedAt: last, fullName: r.name, headline: r.headline, location: r.location,
        parseConfidence, parseStatus, topSkills, lastInterviewAt: last,
        // CV claims: hand-written for the demo people, otherwise the headline and the skills they list.
        cv: { readAt: notes[0].data.capturedAt, modelVersion: MODEL, ...(r.cv ?? { history: [{ title: r.headline }], education: [], skills: topSkills }) },
        lastOpenedAt: r.opened !== undefined ? monthsAgo(ctx.now, r.opened) : new Date(Math.min(ctx.now.getTime(), last.getTime() + 2 * DAY)),
      },
    };
  });
}

import { ShareShortlistRequest } from "@tacit/shared";
import type { Attribute, Candidate, Match, Override } from "@tacit/shared";

/** What the recruiter edits per person. `forText` / `againstText` hold one reason per line. */
export type CardDraft = {
  candidateId: string;
  label: string;
  headline: string;
  years: string;
  location: string;
  workMode: string;
  notice: string;
  salary: string;
  forText: string;
  againstText: string;
  /** When each prefilled line was observed, keyed `for:<line>` / `against:<line>`. A line not in here is new and gets today's date. */
  dates: Record<string, Date>;
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The text fields the name guard checks, with the words used when telling the recruiter which one. */
export const FIELD_NAMES = {
  label: "Label", headline: "Headline", location: "Location", workMode: "Work mode", notice: "Notice", salary: "Salary",
  forText: "Reasons for", againstText: "Reasons against",
} as const;

export const cardLabel = (i: number) => `Candidate ${String.fromCharCode(65 + i)}`;

/**
 * Labels for this share: someone already on the role keeps their card's label; everyone else gets the next
 * "Candidate X" no entry on the role uses, so a re-share never makes a second "Candidate A".
 */
export function nextLabels(candidateIds: string[], links: { id: string; candidateId: string }[], entries: { id: string; label: string }[]): Record<string, string> {
  const labelOf = new Map(entries.map((e) => [e.id, e.label]));
  const used = new Set(entries.map((e) => e.label));
  const out: Record<string, string> = {};
  let next = 0;
  for (const id of candidateIds) {
    const prior = labelOf.get(links.find((l) => l.candidateId === id)?.id ?? "");
    if (prior) { out[id] = prior; continue; }
    while (used.has(cardLabel(next))) next++;
    out[id] = cardLabel(next);
    used.add(out[id]);
  }
  return out;
}

/** Candidates with a standing shortlist decision for the role: newest decision per person, not reversed. */
export function shortlistedIds(overrides: Pick<Override, "candidateId" | "decision" | "reversedAt" | "decidedAt">[]) {
  const latest = new Map<string, Pick<Override, "decision" | "reversedAt" | "decidedAt">>();
  for (const o of overrides) {
    const prev = latest.get(o.candidateId);
    if (!prev || o.decidedAt > prev.decidedAt) latest.set(o.candidateId, o);
  }
  return [...latest].filter(([, o]) => o.decision === "shortlist" && !o.reversedAt).map(([id]) => id);
}

/** Whole years since the earliest year the CV history mentions. Undefined when no year is readable. */
export function yearsFromCv(history: { from?: string }[] | undefined, now: Date) {
  const years = (history ?? []).flatMap((h) => {
    const y = h.from?.match(/\b(?:19|20)\d{2}\b/);
    return y ? [Number(y[0])] : [];
  });
  return years.length ? Math.min(60, Math.max(0, now.getFullYear() - Math.min(...years))) : undefined;
}

/** Newest confirmed value of a type (the card's "notice" is the availability attribute). */
function newestValue(attrs: Attribute[], type: Attribute["type"]) {
  const a = attrs.filter((x) => x.type === type && x.confirmedByRecruiter).sort((x, y) => y.observedAt.getTime() - x.observedAt.getTime())[0];
  return a ? (a.editedValue ?? a.value) : "";
}

type WithId<T> = T & { id: string };

/** Each reason's date is the newest observedAt among the attributes it cites; the match's date only when none resolves. */
function reasonDates(side: "for" | "against", reasons: Match["reasonsFor"], attrs: WithId<Attribute>[], fallback: Date) {
  const out: Record<string, Date> = {};
  for (const r of reasons) {
    const seen = attrs.filter((a) => r.attributeIds.includes(a.id)).map((a) => a.observedAt.getTime());
    out[`${side}:${r.text.trim()}`] = seen.length ? new Date(Math.max(...seen)) : fallback;
  }
  return out;
}

export function prefillCard(a: { candidate: WithId<Candidate>; match: Match; attrs: WithId<Attribute>[]; index: number; now: Date }): CardDraft {
  const mine = a.attrs.filter((x) => x.candidateId === a.candidate.id);
  const fallback = a.match.generatedAt ?? a.now;
  const years = yearsFromCv(a.candidate.cv?.history, a.now);
  return {
    candidateId: a.candidate.id,
    label: cardLabel(a.index),
    headline: a.candidate.headline,
    years: years === undefined ? "" : String(years),
    location: newestValue(mine, "location") || a.candidate.location,
    workMode: newestValue(mine, "work-mode"),
    notice: newestValue(mine, "availability"),
    salary: newestValue(mine, "salary"),
    forText: a.match.reasonsFor.map((r) => r.text).join("\n"),
    againstText: a.match.reasonsAgainst.map((r) => r.text).join("\n"),
    dates: { ...reasonDates("for", a.match.reasonsFor, mine, fallback), ...reasonDates("against", a.match.reasonsAgainst, mine, fallback) },
  };
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names of the draft's text fields that contain any word of the candidate's name (whole word, any case). */
export function nameHits(d: CardDraft, fullName: string): string[] {
  const tokens = fold(fullName).split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${tokens.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "u");
  return (Object.keys(FIELD_NAMES) as (keyof typeof FIELD_NAMES)[]).filter((k) => re.test(fold(d[k]))).map((k) => FIELD_NAMES[k]);
}

/** Problems the recruiter must fix before sending, as sentences. Empty = ready. */
export function cardProblems(d: CardDraft, fullName: string): string[] {
  const out: string[] = [];
  const hits = nameHits(d, fullName);
  if (hits.length) out.push(`${hits.join(", ")} contains their name. Remove it so the client cannot tell who this is.`);
  if (!lines(d.forText).length) out.push("Add at least one reason for.");
  if (!lines(d.againstText).length) out.push("Add at least one reason against.");
  if (!/^\d{1,2}$/.test(d.years.trim())) out.push("Add their years of experience.");
  if (!d.label.trim()) out.push("Add a label.");
  return out;
}

/** The body for POST /api/shortlists/share. Throws if it would not pass the shared schema. */
export function buildShareRequest(roleId: string, drafts: CardDraft[], now: Date): ShareShortlistRequest {
  return ShareShortlistRequest.parse({
    roleId,
    entries: drafts.map((d) => ({
      candidateId: d.candidateId,
      label: d.label.trim(),
      headline: d.headline.trim(),
      years: Number(d.years),
      facts: { location: d.location.trim(), workMode: d.workMode.trim(), notice: d.notice.trim(), salary: d.salary.trim() },
      case: {
        for: lines(d.forText).map((text) => ({ text, at: d.dates[`for:${text}`] ?? now })),
        against: lines(d.againstText).map((text) => ({ text, at: d.dates[`against:${text}`] ?? now })),
      },
    })),
  });
}

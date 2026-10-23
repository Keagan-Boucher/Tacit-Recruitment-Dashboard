import type { ReadStatus, ReviewReasonCode, Submission } from "@tacit/shared";
import { screeningRows } from "../../features/brief/helpers";
import type { WithId } from "../../lib/data";

export type Sub = WithId<Submission>;
export type Tone = "for" | "stale" | "against";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "22 Oct", or "22 Oct 2026" with `year`. */
export const day = (d: Date, year = false) => `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;

export const oldestFirst = (a: Sub, b: Sub) => a.submittedAt.getTime() - b.submittedAt.getTime();

export const REASONS: [ReviewReasonCode, string][] = [
  ["unreadable", "Can’t read the file"],
  ["details-missing", "Details missing"],
  ["already-in-pool", "Already in the pool"],
  ["outside-scope", "Outside what we place"],
  ["other", "Something else"],
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How many fields the recruiter should look at: what the candidate corrected, or what the brief left open. */
export const checkCount = (s: Sub) => (s.kind === "cv" ? s.correctedFields.length : s.kind === "brief" ? s.fields.unclear.length : 0);

/** Read status as a coloured word: Read clearly (for), Check N fields (stale), Couldn’t read (against). */
export function readWord(s: Sub): { text: string; tone: Tone } {
  const map: Record<ReadStatus, { text: string; tone: Tone }> = {
    clear: { text: "Read clearly", tone: "for" },
    check: { text: checkCount(s) ? `Check ${plural(checkCount(s), "field", "fields")}` : "Check this", tone: "stale" },
    unreadable: { text: "Couldn’t read", tone: "against" },
  };
  return map[s.readStatus];
}

const WORK_MODE = { office: "Office", hybrid: "Hybrid", remote: "Remote" } as const;

export type Row = { key: string; label: string; lines?: string[]; tags?: string[]; mark?: string; quiet?: boolean };

type Job = { title: string; company?: string; from?: string; to?: string };
const job = (j: Job) => [[j.title, j.company].filter(Boolean).join(", "), j.from ? `${j.from} to ${j.to ?? "now"}` : ""].filter(Boolean).join(", ");

const CORRECTED = " · they corrected this";

/** A CV as sent, one row per thing the candidate gave. Anything in `correctedFields` carries the stale mark. */
export function cvRows(s: Extract<Sub, { kind: "cv" }>): Row[] {
  const f = s.fields;
  const fixed = (...keys: string[]) => (keys.some((k) => s.correctedFields.includes(k)) ? CORRECTED : undefined);
  const [cur, ...prev] = f.history;
  const current = cur && !cur.to;
  const rows: Row[] = [
    { key: "headline", label: "Headline", lines: f.headline ? [f.headline] : [], mark: fixed("headline") },
    { key: "now", label: "Now", lines: current ? [job(cur)] : f.currentRole ? [f.currentRole] : [], mark: fixed("currentRole", ...(current ? ["history"] : [])) },
    { key: "before", label: "Before", lines: (current ? prev : f.history).map(job), mark: fixed("history") },
    { key: "location", label: "Based in", lines: f.location ? [f.location] : [], mark: fixed("location") },
    { key: "education", label: "Education", lines: f.education, mark: fixed("education") },
    { key: "skills", label: "Skills", tags: f.skills, mark: fixed("skills") },
    { key: "workMode", label: "Work mode", lines: f.workMode ? [WORK_MODE[f.workMode]] : [], mark: fixed("workMode") },
    { key: "salary", label: "Salary", lines: f.salaryExpectation ? [f.salaryExpectation] : [], mark: fixed("salaryExpectation") },
    { key: "phone", label: "Phone", lines: f.phone ? [f.phone] : [], mark: fixed("phone") },
  ];
  return rows.filter((r) => r.lines?.length || r.tags?.length);
}

/** The brief in the recruiter’s screening order. What it left out, and what Tacit flagged unclear, is marked and says who to ask. */
export function briefRows(s: Extract<Sub, { kind: "brief" }>, who: string): Row[] {
  const ask = ` · check with ${who}`;
  const rows: Row[] = screeningRows(s.fields, s.fields.quotes).map((r) => ({
    key: r.key,
    label: r.label,
    lines: [r.value ?? "Not mentioned"],
    mark: r.value === null ? ask : undefined,
    quiet: r.value === null,
  }));
  return [...rows, ...s.fields.unclear.map((q, i) => ({ key: `unclear-${i}`, label: "Unclear", lines: [q], mark: ask }))];
}

/** A details change: only what they changed. */
export function changeRows(s: Extract<Sub, { kind: "details-change" }>): Row[] {
  const f = s.fields;
  const rows: Row[] = [
    { key: "salary", label: "Salary", lines: f.salary ? [f.salary] : [] },
    { key: "availability", label: "Available", lines: f.availability ? [f.availability] : [] },
    { key: "workMode", label: "Work mode", lines: f.workMode ? [WORK_MODE[f.workMode]] : [] },
    { key: "currentWork", label: "Current work", lines: f.currentWork ? [f.currentWork] : [] },
  ];
  return rows.filter((r) => r.lines?.length);
}

const LABEL: Record<string, string> = {
  fullName: "name", headline: "headline", location: "location", currentRole: "current role", salaryExpectation: "salary", workMode: "work mode",
  phone: "phone", history: "work history", education: "education", skills: "skills",
};
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The "How Tacit read it" note: plain facts from the submission, no scores. */
export function readNote(s: Extract<Sub, { kind: "cv" }>): string {
  const fixed = s.correctedFields.map((k) => LABEL[k] ?? k);
  if (s.readStatus === "unreadable") return "Tacit couldn’t read this file reliably. Open it yourself before you decide.";
  const fixedNote = fixed.length ? `The candidate corrected ${list(fixed)} before sending.` : "";
  if (s.readStatus === "check") return ["Some fields were unclear.", fixedNote || "Open the file to check them."].join(" ");
  return ["Every field read clearly.", fixedNote].filter(Boolean).join(" ");
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Lerato Dlamini, SAP FI analyst · your note · 14 Mar 2024. Passing links the two." */
export function duplicateLine(c: { fullName: string; headline: string; lastInterviewAt?: Date }) {
  return [[c.fullName, c.headline].filter(Boolean).join(", "), c.lastInterviewAt && `your note · ${day(c.lastInterviewAt, true)}`].filter(Boolean).join(" · ") + ". Passing links the two.";
}

/** "3 CVs and 2 briefs", "1 update and 1 brief". */
export function mix(subs: { kind: Sub["kind"] }[]) {
  const n = (k: Sub["kind"]) => subs.filter((s) => s.kind === k).length;
  return [
    n("cv") && plural(n("cv"), "CV", "CVs"),
    n("details-change") && plural(n("details-change"), "update", "updates"),
    n("brief") && plural(n("brief"), "brief", "briefs"),
  ].filter(Boolean).join(" and ");
}

const DAY = 86_400_000;
/** "The oldest was sent 2 days ago." */
export function oldestLine(subs: { submittedAt: Date }[], now: Date) {
  if (!subs.length) return "";
  const days = Math.max(0, Math.floor((now.getTime() - Math.min(...subs.map((s) => s.submittedAt.getTime()))) / DAY));
  return `The oldest was sent ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.`;
}

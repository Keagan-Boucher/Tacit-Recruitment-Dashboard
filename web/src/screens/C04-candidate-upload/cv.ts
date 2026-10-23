import { SubmitRequest, type CvParseResult, type WorkMode } from "@tacit/shared";
import { dedupe, draftFromResult, type FieldKey } from "../S09-cv-upload/parse";

// Pure parts of C04: a file in, what Tacit read, what the candidate changed, the request to send. No Firebase or React.
// S09's parse.ts is reused only for reading a parse result into flagged fields (it touches no recruiter collection).

export const MAX_BYTES = 10 * 1024 * 1024; // Storage rules refuse >= 10 MiB, so the limit is strict
export const ACCEPT_ATTR = ".pdf,.docx"; // what the proxy reads for a candidate (no .txt, no .doc)
export const RECRUITER = "Naledi Mokoena";

export type Problem = string;

/** One CV: the first file given. A plain sentence when it can't be used. */
export function pickCvFile<T extends { name: string; size: number }>(files: readonly T[]): { file: T } | { problem: Problem } {
  const file = files[0];
  if (!file) return { problem: "Choose a file to send." };
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (ext !== "pdf" && ext !== "docx") return { problem: "Tacit reads PDF and Word (.docx) files. Choose one of those." };
  if (file.size >= MAX_BYTES) return { problem: "That file is over 10 MB. Choose a smaller one." };
  if (file.size === 0) return { problem: "That file is empty. Choose another." };
  return { file };
}

export type Job = { title: string; company: string; from: string; to: string };
/** What the candidate sees and edits. Everything is text so an input can hold it; "" workMode = not said. */
export type Details = {
  fullName: string;
  phone: string;
  location: string;
  headline: string;
  currentRole: string;
  salaryExpectation: string;
  workMode: WorkMode | "";
  history: Job[];
  education: string[];
  skills: string[];
};
export type DetailKey = keyof Details;

export type Read = {
  details: Details;
  /** Fields the model was unsure of (confidence < LOW_CONFIDENCE). Outlined until the candidate has been to them. */
  unclear: ReadonlySet<DetailKey>;
  /** Indexes into history. */
  unclearJobs: ReadonlySet<number>;
  parseConfidence: number;
};

const FIELD_OF: Record<FieldKey, DetailKey> = { fullName: "fullName", location: "location", headline: "headline", currentRole: "currentRole", salary: "salaryExpectation" };

export function readFromParse(r: CvParseResult): Read {
  const d = draftFromResult(r);
  const unclear = new Set<DetailKey>();
  for (const k of Object.keys(FIELD_OF) as FieldKey[]) if (d[k].flag) unclear.add(FIELD_OF[k]);
  return {
    details: {
      fullName: d.fullName.value,
      phone: "",
      location: d.location.value,
      headline: d.headline.value,
      currentRole: d.currentRole.value,
      salaryExpectation: d.salary.value,
      workMode: "",
      history: d.history.map(({ title, company, from, to }) => ({ title, company, from, to })),
      education: d.education,
      skills: d.skills,
    },
    unclear,
    unclearJobs: new Set(d.history.flatMap((j, i) => (j.flag ? [i] : []))),
    parseConfidence: d.parseConfidence,
  };
}

/** Still outlined: the model was unsure and the candidate hasn't been to the field yet. `touched` holds field keys, or `job:<i>`. */
export const isUnclear = (read: Read, key: DetailKey, touched: ReadonlySet<string>) => read.unclear.has(key) && !touched.has(key);
export const isJobUnclear = (read: Read, i: number, touched: ReadonlySet<string>) => read.unclearJobs.has(i) && !touched.has(`job:${i}`);

/** How many outlined fields are left, for the one-line summary above the form. */
export const unclearCount = (read: Read, touched: ReadonlySet<string>) =>
  [...read.unclear].filter((k) => !touched.has(k)).length + [...read.unclearJobs].filter((i) => !touched.has(`job:${i}`)).length;

const KEYS: DetailKey[] = ["fullName", "phone", "location", "headline", "currentRole", "salaryExpectation", "workMode", "history", "education", "skills"];

/** Names (as in CvSubmissionFields) of every field that now differs from what Tacit read. Order = form order. */
export function correctedFields(read: Details, now: Details): string[] {
  const norm = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "string" ? x.trim() : x)); // stray spaces are not a correction
  return KEYS.filter((k) => norm(read[k]) !== norm(now[k]));
}

const opt = (s: string) => s.trim() || undefined;

/** The body for POST /api/portal/submit. Parsed against the shared schema, so a bad form throws before it is sent. */
export function buildSubmit(fileRef: string, read: Read, now: Details): SubmitRequest {
  const workMode = now.workMode || undefined;
  return SubmitRequest.parse({
    kind: "cv",
    fileRef,
    fields: {
      fullName: now.fullName.trim(),
      headline: now.headline.trim(),
      location: now.location.trim(),
      currentRole: now.currentRole.trim(),
      salaryExpectation: opt(now.salaryExpectation),
      workMode,
      phone: opt(now.phone),
      history: now.history
        .filter((j) => j.title.trim())
        .map((j) => ({ title: j.title.trim(), company: opt(j.company), from: opt(j.from), to: opt(j.to) })),
      education: now.education.map((e) => e.trim()).filter(Boolean),
      skills: dedupe(now.skills),
    },
    correctedFields: correctedFields(read.details, now),
    parseConfidence: read.parseConfidence,
  });
}

/** "184 KB", "1.2 MB". */
export const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

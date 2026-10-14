import { Candidate, LOW_CONFIDENCE, type CvField, type CvParseJob, type CvParseResult } from "@tacit/shared";

// Pure parts of S09: files in, a reviewable draft out, a Candidate to write. No Firebase or React here so it all unit-tests.

// ---- picking files --------------------------------------------------------------------------

const ACCEPT = ["pdf", "docx", "txt"];
export const ACCEPT_ATTR = ACCEPT.map((e) => `.${e}`).join(",");

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** Keep PDF, Word and text files in the order given. Hidden files and Word's `~$` lock files are dropped quietly. */
export function filterCvFiles<T extends { name: string }>(files: readonly T[]): { kept: T[]; skipped: number } {
  const kept = files.filter((f) => ACCEPT.includes(extOf(f.name)) && !f.name.startsWith("~$") && !f.name.startsWith("."));
  return { kept, skipped: files.length - kept.length };
}

/** Storage-safe file name: ASCII letters, digits, dot, dash, underscore. The extension survives (the proxy reads it). */
export function sanitiseName(name: string): string {
  const ext = extOf(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeExt = ext.replace(/[^a-z0-9]/g, "");
  return `${base || "cv"}${safeExt ? `.${safeExt}` : ""}`;
}

export const storagePath = (uid: string, name: string, stamp: number) => `users/${uid}/cvs/${stamp}-${sanitiseName(name)}`;

// ---- the draft the recruiter reviews ---------------------------------------------------------

/** What the model read and how sure it was. Present = "Check this"; Looks right sets it back to null. */
export type Flag = { readAs: string | null; note: string | null };
export type FieldDraft = { value: string; flag: Flag | null };
export type JobDraft = { title: string; company: string; from: string; to: string; flag: Flag | null };
export type FieldKey = "fullName" | "location" | "headline" | "currentRole" | "salary";
export type Draft = Record<FieldKey, FieldDraft> & {
  /** Newest first. An empty `to` is the current job. */
  history: JobDraft[];
  education: string[];
  skills: string[];
  parseConfidence: number;
  modelVersion?: string;
};

const flagOf = (confidence: number, readAs: string | null, note: string | null, hasContent: boolean): Flag | null =>
  confidence < LOW_CONFIDENCE && hasContent ? { readAs, note } : null;

const field = (f: CvField): FieldDraft => ({
  value: f.value?.trim() ?? "",
  flag: flagOf(f.confidence, f.readAs, f.note, (f.value ?? f.readAs ?? f.note) !== null),
});

const job = (j: CvParseJob): JobDraft => ({
  title: j.title.trim(),
  company: j.company?.trim() ?? "",
  from: j.from?.trim() ?? "",
  to: j.to?.trim() ?? "",
  flag: flagOf(j.confidence, j.readAs, j.note, true),
});

export function draftFromResult(r: CvParseResult, modelVersion?: string): Draft {
  return {
    fullName: field(r.fullName),
    location: field(r.location),
    headline: field(r.headline),
    currentRole: field(r.currentRole),
    salary: field(r.salaryExpectation),
    history: r.history.map(job),
    education: r.education.map((e) => e.trim()).filter(Boolean),
    skills: dedupe(r.skills),
    parseConfidence: r.parseConfidence,
    modelVersion,
  };
}

const empty = (): FieldDraft => ({ value: "", flag: null });
/** "Add by hand": nothing read, nothing to check, the recruiter is the source. */
export const blankDraft = (): Draft => ({
  fullName: empty(), location: empty(), headline: empty(), currentRole: empty(), salary: empty(),
  history: [], education: [], skills: [], parseConfidence: 1,
});

export const blankJob = (): JobDraft => ({ title: "", company: "", from: "", to: "", flag: null });

const FIELDS: FieldKey[] = ["fullName", "location", "headline", "currentRole", "salary"];

/** How many things still need the recruiter: flagged fields plus flagged jobs. */
export const countFlags = (d: Draft) => FIELDS.filter((k) => d[k].flag).length + d.history.filter((j) => j.flag).length;

export function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map((v) => v.trim()).filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
}

/** "Check Lerato’s CV." Falls back to a nameless sentence when the name is blank. */
export function checkTitle(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `Check ${first}’s CV.` : "Check this CV.";
}

/** "2022 to 2025", "2022 to now", "2021". */
export function datesLabel(j: Pick<JobDraft, "from" | "to">): string {
  if (j.from && j.to) return j.from === j.to ? j.from : `${j.from} to ${j.to}`;
  if (j.from) return `${j.from} to now`;
  return j.to;
}

// ---- the Candidate to write ------------------------------------------------------------------

export type SaveContext = {
  uid: string;
  status: "ok" | "flagged";
  now: Date;
  fileName?: string;
  /** Storage path of the uploaded CV, kept so S03 can open it. */
  fileRef?: string;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Recruiter edits win over what the model read. Throws when there is no name (the one thing a candidate can't lack)
 * or when the shared schema rejects the result. The current role becomes the newest job's title when that job has no
 * end; with no current job it is added as one, unless it just repeats the newest job.
 */
export function toCandidate(d: Draft, ctx: SaveContext): Candidate {
  const fullName = d.fullName.value.trim();
  if (!fullName) throw new Error("A candidate needs a name.");

  const history = d.history
    .filter((j) => j.title.trim())
    .map((j) => {
      const out: { title: string; company?: string; from?: string; to?: string } = { title: j.title.trim() };
      if (j.company.trim()) out.company = j.company.trim();
      if (j.from.trim()) out.from = j.from.trim();
      if (j.to.trim()) out.to = j.to.trim();
      return out;
    });
  const role = d.currentRole.value.trim();
  const newest = history[0];
  if (role) {
    if (newest && !newest.to) newest.title = role;
    else if (!newest || !same(newest.title, role)) history.unshift({ title: role });
  }

  const skills = dedupe(d.skills);
  const education = d.education.map((e) => e.trim()).filter(Boolean);
  const salary = d.salary.value.trim();
  const hasCv = Boolean(ctx.fileName || history.length || education.length || skills.length || salary);

  return Candidate.parse({
    ownerUid: ctx.uid,
    fullName,
    headline: d.headline.value.trim(),
    location: d.location.value.trim(),
    ...(hasCv && {
      cv: {
        history,
        education,
        skills,
        ...(salary && { salaryExpectation: salary }),
        ...(ctx.fileName && { fileName: ctx.fileName }),
        // by hand = no model involved, so nothing was "read"
        ...(d.modelVersion && { readAt: ctx.now, modelVersion: d.modelVersion }),
      },
    }),
    ...(ctx.fileRef && { cvFileRef: ctx.fileRef }),
    parseConfidence: d.parseConfidence,
    parseStatus: ctx.status,
    topSkills: skills.slice(0, 4),
    lastOpenedAt: ctx.now,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
}

// ---- queue rules ------------------------------------------------------------------------------

export type Status = "waiting" | "uploading" | "reading" | "ready" | "failed" | "unreadable";

export interface QueueItem {
  id: string;
  /** "hand" = Add by hand: no file was read, the draft starts blank. */
  kind: "file" | "hand";
  fileName: string;
  /** Kept in memory for upload and View CV. Lost on a full page reload (the Storage copy stays). */
  file?: File;
  fileRef?: string;
  status: Status;
  draft?: Draft;
  /** Why it failed, in a sentence. */
  message?: string;
}

export const isBusy = (s: Status) => s === "waiting" || s === "uploading" || s === "reading";
/** One at a time, in the order the files were added. A retried file keeps its place, so it goes next. */
export const nextToRun = (items: readonly QueueItem[]) => items.find((i) => i.status === "waiting");
export const nextReady = (items: readonly QueueItem[]) => items.find((i) => i.status === "ready");

export function summary(items: readonly QueueItem[]) {
  return { total: items.length, ready: items.filter((i) => i.status === "ready").length, busy: items.some((i) => isBusy(i.status)) };
}

/** What went wrong, in words the recruiter can act on. `bad_file` can't be retried; everything else can. */
export function describeError(e: unknown, stage: "upload" | "read"): { status: "failed" | "unreadable"; message: string } {
  const x = (e ?? {}) as { status?: number; code?: string; message?: string };
  if (stage === "upload") return { status: "failed", message: "Couldn’t upload this file." };
  if (x.code === "bad_file") return { status: "unreadable", message: `Couldn’t read this file. ${x.message ?? ""}`.trim() };
  if (x.status === 0) return { status: "failed", message: "Can’t reach Tacit’s server." };
  if (x.code === "ai_failed") return { status: "failed", message: "Couldn’t read this reliably." };
  if (x.code === "ai_unconfigured") return { status: "failed", message: "Reading CVs isn’t set up yet." };
  return { status: "failed", message: "Something went wrong reading this." };
}

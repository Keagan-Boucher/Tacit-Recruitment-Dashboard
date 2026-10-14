import type { ApiErrorBody, BriefInterpretation, ParseBriefRequest } from "@tacit/shared";

export type BriefSource = ParseBriefRequest["source"];

export const ACCEPT = ".pdf,.docx,.eml,.msg,.txt";
const EXTENSIONS = ACCEPT.split(",");
/** Mirrors the proxy's limit (server/src/files.ts). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Null when the file can go to the proxy, otherwise a plain sentence for the recruiter. */
export function fileProblem(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot < 0 ? "" : file.name.slice(dot).toLowerCase();
  if (!EXTENSIONS.includes(ext)) return "Tacit can read PDF, Word (.docx), .eml, .msg and .txt files.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "That file is over 10 MB.";
  return null;
}

/** Storage-safe file name: keeps the extension, drops path parts and anything outside letters, digits, dot, dash, underscore. */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "").replace(/\.{2,}/g, ".").replace(/^[.-]+/, "");
  return clean || "brief.txt";
}

export const briefStoragePath = (uid: string, fileName: string, now: number) =>
  `users/${uid}/briefs/${now}-${sanitiseFileName(fileName)}`;

/** Exactly one of text / fileRef, as the proxy requires. */
export function buildParseBriefRequest(
  source: BriefSource,
  input: { text: string } | { fileRef: string },
): ParseBriefRequest {
  if ("fileRef" in input) return { source: "upload", text: null, fileRef: input.fileRef };
  return { source, text: input.text.trim(), fileRef: null };
}

const money = (n: number) => {
  const k = n / 1000;
  return n >= 1000 && Number.isInteger(k * 10) ? `${k}k` : n.toLocaleString("en-ZA");
};

/** "R52k to R55k". The model returns no period, so none is shown; the basis goes to `unclear`. */
export function formatBudget(b: BriefInterpretation["budget"]): string | null {
  if (b.min === null && b.max === null) return null;
  const sym = !b.currency || b.currency === "ZAR" ? "R" : `${b.currency} `;
  if (b.min !== null && b.max !== null && b.min !== b.max) return `${sym}${money(b.min)} to ${sym}${money(b.max)}`;
  if (b.min !== null && b.max === null) return `From ${sym}${money(b.min)}`;
  return `${sym}${money(b.max ?? b.min!)}`;
}

export type ScreeningRow = { key: string; label: string; values: string[] };

/** The recruiter's screening order. An empty `values` means the brief didn't say. */
export function screeningRows(r: BriefInterpretation): ScreeningRow[] {
  const one = (v: string | null) => (v?.trim() ? [v.trim()] : []);
  const budget = formatBudget(r.budget);
  return [
    { key: "workMode", label: "Work mode", values: one(r.workMode) },
    { key: "travel", label: "Travel", values: one(r.travel) },
    { key: "budget", label: "Budget", values: budget ? [budget] : [] },
    { key: "location", label: "Location", values: one(r.location) },
    { key: "mustHave", label: "Must have", values: r.mustHave.filter((v) => v.trim()) },
    { key: "niceToHave", label: "Nice to have", values: r.niceToHave.filter((v) => v.trim()) },
    { key: "seniority", label: "Seniority", values: one(r.seniority) },
  ];
}

export type BriefProblem = { kind: "bad_file" | "retry"; title: string; detail: string };

/** What went wrong, in words. `retry` keeps the input and offers Try again; `bad_file` offers paste instead. */
export function describeProblem(
  err: { status?: number; code?: ApiErrorBody["code"] | string; message?: string } | null,
  source: BriefSource,
): BriefProblem {
  const kept = source === "upload" ? "Your file is still chosen." : "Your text is still here.";
  if (err?.code === "bad_file")
    return { kind: "bad_file", title: "We couldn’t read any text in this file.", detail: err.message ?? "" };
  if (err?.code?.startsWith("storage/")) return { kind: "retry", title: "Couldn’t upload this file.", detail: kept };
  if (err?.status === 0) return { kind: "retry", title: "Couldn’t reach Tacit’s server.", detail: kept };
  if (err?.code === "unauthorized") return { kind: "retry", title: "You’ve been signed out.", detail: `Sign in again, then try again. ${kept}` };
  if (err?.code === "ai_unconfigured") return { kind: "retry", title: "Tacit’s reader isn’t set up yet.", detail: kept };
  if (err?.code === "ai_failed") return { kind: "retry", title: "Couldn’t read this brief reliably.", detail: kept };
  return { kind: "retry", title: "Couldn’t read this brief.", detail: kept };
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

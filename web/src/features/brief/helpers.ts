import type { ApiErrorBody, BriefInterpretation, BriefQuotes, ParseBriefRequest } from "@tacit/shared";

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

/** One line of "What Tacit read": a value and the brief phrase it came from, or `value: null` when the brief didn't say.
 *  `quote` is null when there is nothing to cite (old roles without quotes, or the model found no phrase). */
export type ScreeningRow = { key: string; label: string; value: string | null; quote: string | null };

type Read = Pick<BriefInterpretation, "workMode" | "travel" | "budget" | "location" | "mustHave" | "niceToHave" | "seniority">;

// Roles store a missing field as "", a missing budget as 0 to 0, and older ones as "None mentioned".
const said = (v: string | null | undefined) => (v?.trim() && !/^none( mentioned)?$/i.test(v.trim()) ? v.trim() : null);

/** The recruiter's screening order, one row per value (lists get one row per item, each with its own quote, which the
 *  index-aligned `quotes` lists make possible). A field the brief left out is one row with `value: null`. */
export function screeningRows(r: Read, quotes?: BriefQuotes): ScreeningRow[] {
  const q = (s: string | undefined) => s?.trim() || null;
  const single = (key: string, label: string, v: string | null | undefined, quote: string | undefined): ScreeningRow[] => [
    { key, label, value: said(v), quote: said(v) ? q(quote) : null },
  ];
  const list = (key: "mustHave" | "niceToHave", label: string): ScreeningRow[] => {
    const rows = r[key].flatMap((v, i) => (said(v) ? [{ key: `${key}-${i}`, label, value: said(v), quote: q(quotes?.[key][i]) }] : []));
    return rows.length ? rows : [{ key, label, value: null, quote: null }];
  };
  const noBudget = r.budget.min === 0 && r.budget.max === 0;
  return [
    ...single("workMode", "Work mode", r.workMode, quotes?.workMode),
    ...single("travel", "Travel", r.travel, quotes?.travel),
    ...single("budget", "Budget", noBudget ? null : formatBudget(r.budget), quotes?.budget),
    ...single("location", "Location", r.location, quotes?.location),
    ...list("mustHave", "Must have"),
    ...list("niceToHave", "Nice to have"),
    ...single("seniority", "Seniority", r.seniority, quotes?.seniority),
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

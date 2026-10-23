import type { BriefSubmissionFields, QuotedBriefInterpretation, SubmitRequest } from "@tacit/shared";
import type { InterpretedBrief } from "../brief";

// B03: the brief Tacit read, as the company checks and corrects it, and the body it sends to /api/portal/submit.

/** Every editable field as text, in the recruiter's screening order. Lists are one item a line; budget is whole rand a month. */
export type BriefDraft = {
  title: string;
  workMode: string;
  travel: string;
  budgetMin: string;
  budgetMax: string;
  location: string;
  mustHave: string;
  niceToHave: string;
  seniority: string;
};
export type DraftKey = keyof BriefDraft;
export const DRAFT_KEYS: DraftKey[] = ["title", "workMode", "travel", "budgetMin", "budgetMax", "location", "mustHave", "niceToHave", "seniority"];

const amount = (n: number | null | undefined) => (n ? String(n) : "");

/** The model's nulls become empty fields; those are what B03 outlines as unclear. */
export function draftFrom(r: QuotedBriefInterpretation): BriefDraft {
  return {
    title: r.title ?? "",
    workMode: r.workMode ?? "",
    travel: r.travel ?? "",
    budgetMin: amount(r.budget.min ?? r.budget.max),
    budgetMax: amount(r.budget.max ?? r.budget.min),
    location: r.location ?? "",
    mustHave: r.mustHave.join("\n"),
    niceToHave: r.niceToHave.join("\n"),
    seniority: r.seniority ?? "",
  };
}

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const norm = (s: string) => s.trim().replace(/\s+/g, " ");
const digits = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const same = (key: DraftKey, a: BriefDraft, b: BriefDraft) =>
  key === "mustHave" || key === "niceToHave" ? JSON.stringify(lines(a[key])) === JSON.stringify(lines(b[key]))
  : key === "budgetMin" || key === "budgetMax" ? digits(a[key]) === digits(b[key])
  : norm(a[key]) === norm(b[key]);

/** Fields Tacit found nothing for and the company has not filled in yet: outlined in `stale`. */
export const unclearFields = (original: BriefDraft, now: BriefDraft): DraftKey[] =>
  DRAFT_KEYS.filter((k) => k !== "title" && !original[k].trim() && !now[k].trim());

/** Which fields the company changed from what Tacit read. Budget counts once, as "budget". */
export function correctedFields(original: BriefDraft, now: BriefDraft): string[] {
  const keys = DRAFT_KEYS.filter((k) => !same(k, original, now)).map((k) => (k === "budgetMin" || k === "budgetMax" ? "budget" : k));
  return [...new Set(keys)];
}

export type DraftErrors = Partial<Record<"title" | "budgetMax", string>>;

export function validateDraft(d: BriefDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.title.trim()) e.title = "Give the role a title.";
  if (digits(d.budgetMin) && digits(d.budgetMax) && digits(d.budgetMin) > digits(d.budgetMax)) e.budgetMax = "The top of the budget is lower than the bottom.";
  return e;
}

/** The brief in screening order as the company confirmed it. A missing budget is 0 to 0, the same convention as a Role.
 *  Quotes (the client's own words, shown to the recruiter in S18) are kept for everything the company left alone; a corrected value drops its quote. */
export function buildFields(r: QuotedBriefInterpretation, now: BriefDraft): BriefSubmissionFields {
  const corrected = correctedFields(draftFrom(r), now);
  const one = (k: "workMode" | "travel" | "budget" | "location" | "seniority") => (corrected.includes(k) ? "" : r.quotes[k]);
  const list = (k: "mustHave" | "niceToHave", items: string[]) => (corrected.includes(k) ? items.map(() => "") : r.quotes[k]);
  const must = lines(now.mustHave);
  const nice = lines(now.niceToHave);
  const min = digits(now.budgetMin);
  const max = digits(now.budgetMax);
  return {
    title: now.title.trim(),
    workMode: now.workMode.trim(),
    travel: now.travel.trim(),
    budget: { min: min || max, max: max || min, currency: r.budget.currency ?? "ZAR" },
    location: now.location.trim(),
    mustHave: must,
    niceToHave: nice,
    seniority: now.seniority.trim(),
    quotes: { workMode: one("workMode"), travel: one("travel"), budget: one("budget"), location: one("location"), seniority: one("seniority"), mustHave: list("mustHave", must), niceToHave: list("niceToHave", nice) },
    unclear: r.unclear,
  };
}

/** The /api/portal/submit body: the text pasted or the file uploaded (exactly one), the fields, and what the company corrected. */
export function buildSubmit(brief: InterpretedBrief, now: BriefDraft): SubmitRequest {
  const upload = brief.briefSource === "upload" && !!brief.briefFileRef;
  return {
    kind: "brief",
    text: upload ? null : brief.briefText,
    fileRef: upload ? brief.briefFileRef! : null,
    fields: buildFields(brief.result, now),
    correctedFields: correctedFields(draftFrom(brief.result), now),
  };
}

/** A failed send as a plain sentence; the brief is still on the page. */
export function sendProblem(code: string | undefined, status?: number): string {
  if (code === "rate_limited") return "You have sent a lot of briefs in a short time. Wait a few minutes, then send it again.";
  if (code === "unauthorized") return "You have been signed out. Sign in again, then send it. Your brief is still here.";
  if (status === 0) return "Couldn’t reach Tacit’s server. Your brief is still here. Try again.";
  if (code === "bad_request") return "Something in the brief wasn’t accepted. Check the fields and try again.";
  return "Couldn’t send your brief. Nothing was lost. Try again.";
}

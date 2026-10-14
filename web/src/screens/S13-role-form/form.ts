export type Fields = { title: string; company: string; hasBrief: boolean; min: string; max: string };
export type Errors = Partial<Record<"title" | "company" | "brief" | "budget", string>>;

/** What stops the role being saved. Empty = good to go. Budget is optional; when given, from must not exceed to. */
export function validate({ title, company, hasBrief, min, max }: Fields): Errors {
  const e: Errors = {};
  if (!title.trim()) e.title = "Give the role a title.";
  if (!company.trim()) e.company = "Choose a company, or add a new one.";
  if (!hasBrief) e.brief = "Read the brief first, so Tacit knows what to check people against.";
  if (min && max && Number(min) > Number(max)) e.budget = "The top of the band is below the bottom.";
  return e;
}

/** The recruiter's band over the interpretation: a blank field keeps what Tacit read; a one-sided band reads as that figure. */
export function budgetFrom(min: string, max: string, read: { min: number | null; max: number | null; currency: string | null }) {
  const lo = min ? Number(min) : read.min;
  const hi = max ? Number(max) : read.max;
  return { min: lo ?? hi, max: hi ?? lo, currency: read.currency };
}

/** "75000" -> "R75 000" for the field; typing strips everything but digits. */
export const rand = (digits: string) => (digits ? `R${Number(digits).toLocaleString("en-ZA")}` : "");
export const digits = (s: string) => s.replace(/\D/g, "");

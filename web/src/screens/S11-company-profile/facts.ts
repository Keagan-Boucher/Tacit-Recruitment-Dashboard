import { monthsSince, staleness } from "@tacit/shared";
import type { Company, CompanyFact } from "@tacit/shared";
import { fmtDate } from "../S03-candidate-profile/profile";

export type FactLine = {
  text: string;
  /** "Your note · 24 Oct 2026", "Megan Naidoo, by email · 3 Jun 2026" */
  source: string;
  /** "14 months ago", only when the fact is stale. */
  age: string | null;
  /** The line under a stale fact; null when fresh. */
  ask: string | null;
  kind: CompanyFact["source"];
  at: Date;
};

export const monthYear = (d: Date) => fmtDate(d).split(" ").slice(1).join(" ");

/** Sources that cannot name a sender read as a fixed label; email names who said it. */
function sourceName(f: Pick<CompanyFact, "source" | "by">) {
  return f.source === "email" ? `${f.by ?? "Client"}, by email` : { note: "Your note", "client-feedback": "Client feedback", placements: "Placements" }[f.source];
}

/** Placements are dated to the month; everything else to the day. */
export const factDate = (kind: CompanyFact["source"], d: Date) => (kind === "placements" ? monthYear(d) : fmtDate(d));

/** "19 months ago" when `d` is stale (over 12 months), otherwise null. Shared by the fact lines and the turned-down source lines. */
export const staleAge = (d: Date, now: Date) => (staleness(d, now) === "stale" ? `${monthsSince(d, now)} months ago` : null);

/** The salary a placement landed at, read from its reason ("Placed at R52k a month." gives "R52k"); undefined when it names none. */
export function placedAmount(reason: string) {
  // shortcut: first R<digits>k only; upgrade when placements carry an amount field or reasons hold several figures
  return reason.match(/R\d+k/)?.[0];
}

function line(text: string, kind: CompanyFact["source"], name: string, observedAt: Date, now: Date): FactLine {
  const age = staleAge(observedAt, now);
  return {
    text, kind, at: observedAt, source: `${name} · ${factDate(kind, observedAt)}`,
    age,
    // A money fact has an obvious thing to check; anything else gets the generic line.
    ask: age ? (/R\d+k/.test(text) ? "Ask about salary before you shortlist anyone." : "Check this still holds before you shortlist.") : null,
  };
}

/** What you know, newest first: per-fact provenance, or, for a company without `facts`, the hiring-pattern sentences and note under one "Your notes" source. */
export function companyFacts(c: Pick<Company, "facts" | "hiringPattern" | "notes" | "updatedAt">, now: Date): FactLine[] {
  if (c.facts?.length) return c.facts.map((f) => line(f.text, f.source, sourceName(f), f.observedAt, now)).sort((a, b) => b.at.getTime() - a.at.getTime());
  const sentences = [...new Set([...c.hiringPattern.split(/(?<=\.)\s+/), c.notes].map((s) => s.trim()).filter(Boolean))];
  return sentences.map((s) => line(s, "note", "Your notes", c.updatedAt, now));
}

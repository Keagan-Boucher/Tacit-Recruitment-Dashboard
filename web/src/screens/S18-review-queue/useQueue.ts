import { useLocation } from "react-router";
import type { Candidate, Company, Submission } from "@tacit/shared";
import { devParam } from "../../app/dev";
import { useOwned } from "../../lib/data";
import { fixtureFor, type Fixture, type Person } from "./fixtures";
import { oldestFirst } from "./review";
import type { Sub } from "./review";

/** Pending submissions, oldest first. `subs` undefined = loading. An explicit dev `?state=` swaps in fixtures (never in production). */
export function usePending(): { subs: Sub[] | undefined; error: Error | undefined; fx: Fixture | undefined } {
  const state = devParam(useLocation().search, "state");
  const live = useOwned<Submission>("submissions", ["status", "pending"], oldestFirst);
  const fx = state ? fixtureFor(state) : undefined;
  if (state === "loading") return { subs: undefined, error: undefined, fx: undefined };
  if (fx) return { subs: fx.subs, error: undefined, fx };
  return { subs: live.data, error: live.error, fx: undefined };
}

/** Company and candidate names for the rows. A missing one reads as "the company" / "the candidate". */
export function useSenders(fx: Fixture | undefined): { companies: Record<string, string>; people: Record<string, Person> } {
  const companies = useOwned<Company>("companies");
  const candidates = useOwned<Candidate>("candidates");
  if (fx) return fx;
  return {
    companies: Object.fromEntries((companies.data ?? []).map((c) => [c.id, c.name])),
    people: Object.fromEntries((candidates.data ?? []).map((c) => [c.id, { fullName: c.fullName, headline: c.headline, lastInterviewAt: c.lastInterviewAt }])),
  };
}

import * as S from "@tacit/shared";
import type { Attribute, InterviewNote } from "@tacit/shared";
import { buildCompanies, buildGuide, buildPlacements, buildRoles } from "./business.ts";
import type { Ctx, Doc } from "./build.ts";
import { buildPeople } from "./candidates.ts";
import { buildMatches, buildOverrides } from "./matches.ts";

/** Collections the seed owns (and wipes per owner). userPrefs is deliberately absent. */
export const COLLECTIONS = ["candidates", "interviewNotes", "attributes", "companies", "roles", "matches", "overrides", "questionGuides", "placements"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export interface Dataset extends Record<Collection, Doc<unknown>[]> { keywords: Record<string, string> }

const check = <T>(name: string, schema: { parse(v: unknown): T }, docs: Doc<T>[]): Doc<T>[] =>
  docs.map((d) => {
    try { return { id: d.id, data: schema.parse(d.data) }; }
    catch (e) { throw new Error(`${name}/${d.id} failed validation: ${e instanceof Error ? e.message : e}`, { cause: e }); }
  });

/** Deterministic dataset relative to `now`; every record is parsed with its @tacit/shared schema or this throws. */
export function buildDataset(now: Date, owner: string): Dataset {
  const ctx: Ctx = { now, owner, notes: [] as Doc<InterviewNote>[], attributes: [] as Doc<Attribute>[], keywords: {} };
  const own = (at: Date) => ({ ownerUid: owner, createdAt: at, updatedAt: at });
  const candidates = buildPeople(ctx);
  const matches = buildMatches(ctx, candidates);
  const overrides = buildOverrides(ctx); // also appends override-sourced attributes
  return {
    candidates: check("candidates", S.Candidate, candidates),
    interviewNotes: check("interviewNotes", S.InterviewNote, ctx.notes),
    attributes: check("attributes", S.Attribute, ctx.attributes),
    companies: check("companies", S.Company, buildCompanies(own, now)),
    roles: check("roles", S.Role, buildRoles(own, now)),
    matches: check("matches", S.Match, matches),
    overrides: check("overrides", S.Override, overrides),
    questionGuides: check("questionGuides", S.QuestionGuide, [buildGuide(owner, now)]),
    placements: check("placements", S.Placement, buildPlacements(own, now)),
    keywords: ctx.keywords,
  };
}

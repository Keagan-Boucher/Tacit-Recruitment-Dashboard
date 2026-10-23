import type { Attribute, Candidate, InterviewNote, Override, Placement } from "@tacit/shared";
import type { WithId } from "../../lib/data";

export type CandidateRecord = {
  candidate: WithId<Candidate>;
  attributes: WithId<Attribute>[];
  interviewNotes: WithId<InterviewNote>[];
  overrides: WithId<Override>[];
  placements: WithId<Placement>[];
};

/** One candidate's own docs as a JSON file. Filters by candidateId again so another person's doc can never slip in; drops the recruiter's uid. */
export function buildExport(r: CandidateRecord, now: Date): { filename: string; json: string } {
  const strip = (x: object) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "ownerUid"));
  const own = (rows: { candidateId: string }[]) => rows.filter((x) => x.candidateId === r.candidate.id).map(strip);
  const body = {
    exportedAt: now,
    candidate: strip(r.candidate),
    attributes: own(r.attributes),
    interviewNotes: own(r.interviewNotes),
    overrides: own(r.overrides),
    placements: own(r.placements),
  };
  // JSON.stringify writes every Date as an ISO string.
  return { filename: `tacit-${r.candidate.id}.json`, json: JSON.stringify(body, null, 2) };
}

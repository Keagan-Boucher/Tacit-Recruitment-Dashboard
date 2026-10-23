import { collection, getDocs, query, where } from "firebase/firestore";
import type { Attribute, Candidate, InterviewNote, Override, Placement } from "@tacit/shared";
import { db } from "../../lib/firebase";
import { toDates, type WithId } from "../../lib/data";
import type { CandidateRecord } from "./record";

/** One-shot reads (not live): only run when the recruiter presses Export. */
export async function fetchRecord(uid: string, candidate: WithId<Candidate>): Promise<CandidateRecord> {
  const rows = <T,>(col: string) =>
    getDocs(query(collection(db, col), where("ownerUid", "==", uid), where("candidateId", "==", candidate.id))).then((s) =>
      s.docs.map((d) => ({ ...(toDates(d.data()) as T), id: d.id })),
    );
  const [attributes, interviewNotes, overrides, placements] = await Promise.all([
    rows<Attribute>("attributes"),
    rows<InterviewNote>("interviewNotes"),
    rows<Override>("overrides"),
    rows<Placement>("placements"),
  ]);
  return { candidate, attributes, interviewNotes, overrides, placements };
}

import { Router, type Response } from "express";
import type { Auth } from "firebase-admin/auth";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import {
  Attribute, BriefSubmissionFields, Candidate, CvSubmissionFields, DetailsChangeFields, ReviewRequest, Role, RoleAnon,
  type ReviewResponse,
} from "@tacit/shared";

// The shared ApiErrorBody code union has no portal codes yet, so the codes here are plain strings.
export const fail = (res: Response, status: number, code: string, error: string) => void res.status(status).json({ error, code });
export class Reject extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const SUFFIXES = new Set(["pty", "ltd", "limited", "inc", "llc", "plc", "cc", "co", "corp", "group", "holdings", "the", "and"]);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Removes the company name and its distinctive words (not legal suffixes or the sector own words), whole words only. */
const scrub = (s: string, name: string, sector = "") => {
  const generic = new Set(words(sector));
  const hide = words(name).filter((w, i) => !SUFFIXES.has(w) && (i === 0 || !generic.has(w)));
  const tidy = (x: string) => x.replace(/\s+/g, " ").trim();
  if (!hide.length) return tidy(s);
  const alts = hide.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return tidy(s.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, "giu"), ""));
};

/** What candidates see of a role. Everything copied has the company's name stripped out. */
export function draftAnon(
  role: { title: string; interpretedBrief?: { location?: string; seniority?: string; budget?: { min: number; max: number; currency: string } } },
  company: { name?: string; sector?: string },
) {
  const name = company.name ?? "";
  const sec = company.sector ?? "";
  const b = role.interpretedBrief;
  const band = b?.budget && (b.budget.min || b.budget.max) ? `${b.budget.currency} ${b.budget.min}–${b.budget.max}` : "";
  return RoleAnon.parse({
    title: scrub(role.title, name, sec) || "Role",
    sector: scrub(sec, name, sec),
    region: scrub(b?.location ?? "", name, sec),
    seniority: scrub(b?.seniority ?? "", name, sec),
    salaryBand: band,
  });
}

const READ_TO_PARSE = { clear: "ok", check: "flagged", unreadable: "failed" } as const;

export function reviewRouter({ db, auth, recruiterUid }: { db: Firestore; auth: Pick<Auth, "setCustomUserClaims">; recruiterUid: string }) {
  const router = Router();

  router.post("/review/:submissionId", async (req, res) => {
    const body = ReviewRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "A not-accepted decision needs a reason code and the words the submitter will see");
    const action = body.data;
    const uid = req.uid!;
    try {
      const out = await db.runTransaction(async (t) => {
        // All reads first (Firestore transactions), then writes.
        const sref = db.collection("submissions").doc(String(req.params.submissionId));
        const snap = await t.get(sref);
        const sub = snap.exists ? snap.data()! : undefined;
        if (!sub || sub.ownerUid !== uid) throw new Reject(404, "not_found", "That submission doesn't exist");
        const want = action.action === "pass" ? "accepted" : "not-accepted";
        if (sub.status !== "pending") {
          if (sub.status !== want) throw new Reject(409, "already_decided", "That submission was already decided the other way");
          return { status: want, resultId: sub.resultId as string | undefined, claimFor: want === "accepted" && sub.kind === "cv" ? (sub.submittedBy as string) : undefined };
        }

        const now = new Date();
        const patch: Record<string, unknown> = { status: want, reviewedAt: now, reviewedBy: uid, updatedAt: now };
        let resultId: string | undefined;
        let claimFor: string | undefined;
        const writes: [DocumentReference, Record<string, unknown>][] = [];
        const put = (ref: DocumentReference, d: Record<string, unknown>) => void writes.push([ref, d]);

        if (action.action === "not-accepted") {
          patch.reasonCode = action.reasonCode;
          patch.reasonText = action.reasonText;
        } else if (sub.kind === "cv") {
          const f = CvSubmissionFields.parse(sub.fields);
          const dupRef = sub.possibleDuplicateOf ? db.collection("candidates").doc(String(sub.possibleDuplicateOf)) : undefined;
          const dup = dupRef ? await t.get(dupRef) : undefined;
          const pu = db.collection("portalUsers").doc(sub.submittedBy);
          const puSnap = await t.get(pu);
          if (dupRef && dup?.exists) {
            const c = dup.data()!;
            if (c.portalUid && c.portalUid !== sub.submittedBy) throw new Reject(409, "bad_transition", "That candidate is already linked to a different portal account");
            resultId = dupRef.id;
            put(dupRef, Candidate.omit({ topSkills: true }).partial().parse({
              portalUid: sub.submittedBy, sourceSubmissionId: snap.id, updatedAt: now,
              ...(!c.inPoolSince && { inPoolSince: now }),
              ...(!c.cvFileRef && sub.fileRef && { cvFileRef: sub.fileRef }),
            }));
          } else {
            const cref = db.collection("candidates").doc();
            resultId = cref.id;
            put(cref, Candidate.parse({
              ownerUid: recruiterUid, createdAt: now, updatedAt: now,
              fullName: f.fullName, headline: f.headline, location: f.location,
              cv: { history: f.history, education: f.education, skills: f.skills, ...(f.salaryExpectation && { salaryExpectation: f.salaryExpectation }) },
              ...(sub.fileRef && { cvFileRef: sub.fileRef }),
              parseConfidence: sub.parseConfidence ?? 0,
              parseStatus: READ_TO_PARSE[sub.readStatus as keyof typeof READ_TO_PARSE] ?? "flagged",
              topSkills: f.skills.slice(0, 10),
              portalUid: sub.submittedBy, inPoolSince: now, sourceSubmissionId: snap.id,
            }));
          }
          if (puSnap.exists) put(pu, { candidateId: resultId, updatedAt: now });
          claimFor = sub.submittedBy;
        } else if (sub.kind === "brief") {
          const f = BriefSubmissionFields.parse(sub.fields);
          if (!sub.companyId) throw new Reject(400, "bad_request", "That brief has no company");
          const co = await t.get(db.collection("companies").doc(String(sub.companyId)));
          if (!co.exists) throw new Reject(409, "bad_transition", "That brief's company no longer exists");
          const { title, ...interpretedBrief } = { ...f, unclear: undefined };
          delete interpretedBrief.unclear;
          const rref = db.collection("roles").doc();
          resultId = rref.id;
          const role = {
            ownerUid: recruiterUid, createdAt: now, updatedAt: now,
            companyId: String(sub.companyId), title, briefText: sub.text ?? "", briefSource: "portal",
            ...(sub.fileRef && { briefFileRef: sub.fileRef }),
            interpretedBrief, status: "open", openedAt: now, sourceSubmissionId: snap.id,
          };
          put(rref, Role.parse({ ...role, anon: draftAnon(role, co.data() as { name?: string; sector?: string }) }));
        } else {
          const f = DetailsChangeFields.parse(sub.fields);
          if (!sub.candidateId) throw new Reject(409, "not_in_pool", "That submitter isn't in the pool");
          const candidateId = String(sub.candidateId);
          resultId = candidateId;
          const facts: [string, string | undefined][] = [["salary", f.salary], ["availability", f.availability], ["work-mode", f.workMode], ["trajectory", f.currentWork]];
          for (const [type, value] of facts) {
            if (!value) continue;
            put(db.collection("attributes").doc(), Attribute.parse({
              ownerUid: recruiterUid, createdAt: now, updatedAt: now, candidateId, sourceType: "candidate", submissionId: snap.id,
              type, value, confidence: 1, sourceSpan: { start: 0, end: value.length }, observedAt: now, confirmedByRecruiter: true, modelVersion: "candidate",
            }));
          }
        }
        if (resultId) patch.resultId = resultId;
        put(sref, patch);
        for (const [ref, d] of writes) t.set(ref, d, { merge: true });
        return { status: want, resultId, claimFor };
      });
      // After the commit; also runs on a repeat, so a failed claim write is finished by retrying the pass.
      if (out.claimFor && out.resultId) await auth.setCustomUserClaims(out.claimFor, { role: "candidate", candidateId: out.resultId });
      res.json({ status: out.status, ...(out.resultId && { resultId: out.resultId }) } as ReviewResponse);
    } catch (e) {
      if (e instanceof Reject) return void fail(res, e.status, e.code, e.message);
      console.error("review failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  return router;
}

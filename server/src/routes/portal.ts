import { Router, type Request, type Response } from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { AcceptInviteRequest, LOW_CONFIDENCE, PortalUser, RegisterRequest, Submission, SubmitRequest } from "@tacit/shared";
import type { AcceptInviteResponse, InvitePreview, RegisterResponse, SubmitResponse } from "@tacit/shared";
import { requireNoRole, requireRole } from "../auth.ts";

const fail = (res: Response, status: number, code: string, error: string) => void res.status(status).json({ error, code });

class Reject extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Same trust boundary as files.ts readUploadText: exactly users/<uid>/<folder>/<name>, caller's uid, no traversal. */
const ownFile = (uid: string, ref: string, folder: "cvs" | "briefs") => {
  const [a, b, c, name, ...rest] = ref.split("/");
  return a === "users" && b === uid && c === folder && !!name && !rest.length && !name.includes("..") && !/[\\\0]/.test(ref);
};

/** lower-case, trimmed, single-spaced, accents stripped. */
export const normaliseName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

const toDate = (v: unknown): Date | undefined => (v instanceof Date ? v : (v as { toDate?: () => Date } | null)?.toDate?.());

/** GET /api/invites/:id, mounted before requireAuth: B01 shows the company and locked email before an account exists. */
export const invitePreview = (db: Firestore) => async (req: Request, res: Response) => {
  try {
    const snap = await db.collection("invites").doc(String(req.params.id)).get();
    const inv = snap.exists ? snap.data() : undefined;
    if (!inv) return void fail(res, 404, "not_found", "That invite doesn't exist");
    const company = await db.collection("companies").doc(String(inv.companyId)).get();
    const expires = toDate(inv.expiresAt);
    const status = inv.acceptedAt ? "used" : !expires || expires.getTime() <= Date.now() ? "expired" : "open";
    res.json({ companyName: String(company.data()?.name ?? ""), email: String(inv.email), expiresAt: expires?.toISOString() ?? "", status } satisfies InvitePreview);
  } catch (e) {
    console.error("invite preview failed:", (e as Error)?.name);
    fail(res, 500, "internal", "Something went wrong.");
  }
};

/** The Admin Auth calls the portal routes make; getUser reads the live claims, not the (up to 1 h old) token's. */
export type ClaimsAuth = Pick<Auth, "setCustomUserClaims"> & { getUser(uid: string): Promise<{ customClaims?: Record<string, unknown> }> };

export function portalRouter({ db, auth, recruiterUid }: { db: Firestore; auth: ClaimsAuth; recruiterUid: string }) {
  const router = Router();

  router.post("/portal/register", requireNoRole, async (req, res) => {
    const body = RegisterRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "Add your name and accept the consent line");
    if (!req.email) return void fail(res, 400, "bad_request", "Your account has no email address");
    try {
      // A token minted before a role was set still says "no role": never let it overwrite a real role or portalUsers doc.
      if ((await auth.getUser(req.uid!)).customClaims?.role) return void fail(res, 409, "already_registered", "This account is already set up");
      const now = new Date();
      const user = PortalUser.parse({
        ownerUid: recruiterUid, role: "candidate", email: req.email, displayName: body.data.displayName, consentAt: now, createdAt: now, updatedAt: now,
      });
      // Doc first: if the claim write fails the account still has no role, so a retry passes requireNoRole and finishes.
      await db.collection("portalUsers").doc(req.uid!).set(user);
      await auth.setCustomUserClaims(req.uid!, { role: "candidate" });
      res.json({ role: "candidate" } satisfies RegisterResponse);
    } catch (e) {
      console.error("register failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  router.post("/invites/:id/accept", requireNoRole, async (req, res) => {
    const body = AcceptInviteRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "Add your name");
    if (!req.email) return void fail(res, 400, "bad_request", "Your account has no email address");
    const uid = req.uid!;
    const ref = db.collection("invites").doc(String(req.params.id));
    try {
      const companyId = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        const inv = snap.exists ? snap.data() : undefined;
        if (!inv) throw new Reject(404, "not_found", "That invite doesn't exist");
        // A retry after a failed claim write: the same account may finish accepting.
        const retry = !!inv.acceptedAt && inv.acceptedUid === uid;
        if (inv.acceptedAt && !retry) throw new Reject(409, "invite_used", "That invite has already been used");
        const expires = toDate(inv.expiresAt);
        if (!retry && (!expires || expires.getTime() <= Date.now())) throw new Reject(410, "invite_expired", "That invite has expired");
        if (String(inv.email ?? "").toLowerCase() !== req.email!.toLowerCase()) throw new Reject(403, "email_mismatch", "Sign in with the email the invite was sent to");
        if (!retry) {
          const now = new Date();
          t.update(ref, { acceptedAt: now, acceptedUid: uid, updatedAt: now });
          t.set(db.collection("portalUsers").doc(uid), PortalUser.parse({
            ownerUid: recruiterUid, role: "company", companyId: inv.companyId, email: req.email, displayName: body.data.displayName, createdAt: now, updatedAt: now,
          }));
        }
        return inv.companyId as string;
      });
      await auth.setCustomUserClaims(uid, { role: "company", companyId });
      res.json({ companyId } satisfies AcceptInviteResponse);
    } catch (e) {
      if (e instanceof Reject) return void fail(res, e.status, e.code, e.message);
      console.error("accept failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  /** A candidate already in the recruiter's pool that this CV probably repeats: same name, same email, or same phone as an earlier CV. */
  async function findDuplicate(email: string | undefined, fullName: string, phone: string | undefined) {
    const [cands, sameEmail, samePhone] = await Promise.all([
      db.collection("candidates").where("ownerUid", "==", recruiterUid).get(),
      email ? db.collection("portalUsers").where("ownerUid", "==", recruiterUid).where("email", "==", email).get() : null,
      phone ? db.collection("submissions").where("ownerUid", "==", recruiterUid).where("fields.phone", "==", phone).get() : null,
    ]);
    const portalUids = new Set(sameEmail?.docs.map((d) => d.id));
    const phoneIds = new Set(samePhone?.docs.filter((d) => d.data().kind === "cv").map((d) => d.data().candidateId));
    const name = normaliseName(fullName);
    return cands.docs.find((d) => {
      const c = d.data();
      return normaliseName(String(c.fullName ?? "")) === name || (c.portalUid && portalUids.has(c.portalUid)) || phoneIds.has(d.id);
    })?.id;
  }

  router.post("/portal/submit", requireRole("candidate", "company"), async (req, res) => {
    const body = SubmitRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "That submission isn't complete");
    const sub = body.data;
    const uid = req.uid!;
    const { candidateId, companyId } = req.claims ?? {};
    const isCandidate = req.role === "candidate";
    if (isCandidate !== (sub.kind !== "brief")) return void fail(res, 403, "forbidden", "Your account can't send that");
    if (sub.kind === "details-change" && !candidateId) return void fail(res, 409, "not_in_pool", "You're not in the pool yet");
    if (sub.kind === "brief" && !companyId) return void fail(res, 403, "forbidden", "Your account can't send that");
    if (sub.kind === "cv" && !ownFile(uid, sub.fileRef, "cvs")) return void fail(res, 400, "bad_request", "That file isn't in your uploads.");
    if (sub.kind === "brief" && sub.fileRef && !ownFile(uid, sub.fileRef, "briefs")) return void fail(res, 400, "bad_request", "That file isn't in your uploads.");

    try {
      const now = new Date();
      const corrected = sub.kind === "details-change" ? [] : sub.correctedFields;
      const conf = sub.kind === "cv" ? sub.parseConfidence : undefined;
      const readStatus =
        conf !== undefined && conf < 0.4 ? "unreadable"
        : corrected.length || (conf !== undefined && conf < LOW_CONFIDENCE) || (sub.kind === "brief" && sub.fields.unclear.length) ? "check"
        : "clear";
      const dup = sub.kind === "cv" ? await findDuplicate(req.email, sub.fields.fullName, sub.fields.phone) : undefined;
      const doc = Submission.parse({
        ownerUid: recruiterUid, createdAt: now, updatedAt: now, submittedAt: now, status: "pending", submittedBy: uid,
        ...(candidateId && { candidateId }), ...(companyId && { companyId }),
        kind: sub.kind, fields: sub.fields, correctedFields: corrected, readStatus,
        ...(conf !== undefined && { parseConfidence: conf }),
        ...("fileRef" in sub && sub.fileRef && { fileRef: sub.fileRef }),
        ...("text" in sub && sub.text && { text: sub.text }),
        ...(dup && { possibleDuplicateOf: dup }),
      });
      const ref = db.collection("submissions").doc();
      await ref.set(doc);
      res.json({ submissionId: ref.id } satisfies SubmitResponse);
    } catch (e) {
      console.error("submit failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  return router;
}

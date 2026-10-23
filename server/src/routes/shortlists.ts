import { Router } from "express";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { CandidateUpdate, Placement, ShareShortlistRequest, ShortlistCard, ShortlistEntry, ShortlistStatusRequest, StatusChange } from "@tacit/shared";
import type { ShareShortlistResponse, ShortlistStatusResponse } from "@tacit/shared";
import { draftAnon, fail, Reject } from "./review.ts";

const MIRROR = { interviewing: "interviewing", hired: "placed", "not-progressing": "not-taken-forward" } as const;
const ctx = (db: Firestore, c: string, id: string) => db.collection(c).doc(id);

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first card field that contains any whole-word token of the candidate's name (case and diacritics folded), or undefined. */
export function nameInCard(card: ShortlistCard, fullName: string): string | undefined {
  const tokens = fold(fullName).split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return undefined;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${tokens.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "u");
  const fields: [string, string][] = [
    ["Label", card.label], ["Headline", card.headline],
    ["Location", card.facts.location], ["Work mode", card.facts.workMode], ["Notice", card.facts.notice], ["Salary", card.facts.salary],
    ...card.case.for.map((r): [string, string] => ["Reasons for", r.text]),
    ...card.case.against.map((r): [string, string] => ["Reasons against", r.text]),
  ];
  return fields.find(([, text]) => re.test(fold(text)))?.[0];
}

export function shortlistsRouter({ db, recruiterUid }: { db: Firestore; recruiterUid: string }) {
  const router = Router();

  router.post("/shortlists/share", async (req, res) => {
    const body = ShareShortlistRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "That shortlist isn't complete");
    if (new Set(body.data.entries.map((e) => e.candidateId)).size !== body.data.entries.length) return void fail(res, 400, "bad_request", "A candidate is on that shortlist twice");
    const uid = req.uid!;
    try {
      const roleSnap = await ctx(db, "roles", body.data.roleId).get();
      const role = roleSnap.exists ? roleSnap.data()! : undefined;
      if (!role || role.ownerUid !== uid) throw new Reject(404, "not_found", "That role doesn't exist");
      const [coSnap, existing] = await Promise.all([
        ctx(db, "companies", role.companyId).get(),
        db.collection("shortlistEntries").where("ownerUid", "==", uid).where("roleId", "==", roleSnap.id).get(),
      ]);
      const roleAnon = role.anon ?? draftAnon(role as { title: string }, coSnap.exists ? coSnap.data()! : {});
      const known = new Map(existing.docs.map((d) => [d.data().candidateId as string, d]));
      const hadUpdate = new Set<string>();
      await Promise.all(existing.docs.map(async (d) => void ((await ctx(db, "candidateUpdates", d.id).get()).exists && hadUpdate.add(d.id))));
      const cands = await Promise.all(body.data.entries.map((e) => ctx(db, "candidates", e.candidateId).get()));
      if (cands.some((c) => !c.exists || c.data()!.ownerUid !== uid)) throw new Reject(404, "not_found", "A candidate on that shortlist doesn't exist");

      for (const [i, e] of body.data.entries.entries()) {
        const field = nameInCard(e, cands[i]!.data()!.fullName ?? "");
        if (field) throw new Reject(400, "bad_request", `${field} contains the candidate's name`);
      }

      const now = new Date();
      const entryIds: string[] = [];
      await db.runTransaction(async (t) => {
        body.data.entries.forEach((e, i) => {
          const { candidateId, ...card } = e;
          const prior = known.get(candidateId);
          const ref = prior ? ctx(db, "shortlistEntries", prior.id) : db.collection("shortlistEntries").doc();
          entryIds.push(ref.id);
          const portalUid = cands[i]!.data()!.portalUid as string | undefined;
          if (prior) {
            // Re-share: refresh the approved card and title; status, history and identity stay as they are.
            t.set(ref, { ...ShortlistCard.parse(card), roleTitle: role.title, sharedAt: now, updatedAt: now }, { merge: true });
            if (portalUid && !hadUpdate.has(prior.id)) {
              const st = prior.data().status as keyof typeof MIRROR | "shortlisted";
              t.set(ctx(db, "candidateUpdates", ref.id), CandidateUpdate.parse({
                ownerUid: recruiterUid, createdAt: now, updatedAt: now, candidateId, portalUid, roleAnon, status: st === "shortlisted" ? st : MIRROR[st], at: now,
              }));
            }
            return;
          }
          t.set(ref, ShortlistEntry.parse({
            ...card, ownerUid: uid, createdAt: now, updatedAt: now, sharedAt: now,
            roleId: roleSnap.id, roleTitle: role.title, companyId: role.companyId, candidateId,
            status: "shortlisted", statusHistory: [{ status: "shortlisted", by: uid, at: now }],
          }));
          if (portalUid) {
            t.set(ctx(db, "candidateUpdates", ref.id), CandidateUpdate.parse({
              ownerUid: recruiterUid, createdAt: now, updatedAt: now, candidateId, portalUid, roleAnon, status: "shortlisted", at: now,
            }));
          }
        });
      });
      res.json({ entryIds } satisfies ShareShortlistResponse);
    } catch (e) {
      if (e instanceof Reject) return void fail(res, e.status, e.code, e.message);
      console.error("share failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  router.post("/portal/shortlist-status", async (req, res) => {
    const body = ShortlistStatusRequest.safeParse(req.body);
    if (!body.success) return void fail(res, 400, "bad_request", "Add your reason for not progressing");
    const r = body.data;
    const uid = req.uid!;
    try {
      const eref = ctx(db, "shortlistEntries", r.entryId);
      const pre = await eref.get();
      const e0 = pre.exists ? pre.data() : undefined;
      // Someone else's entry and a missing one look the same to a company.
      if (!e0 || !req.claims?.companyId || e0.companyId !== req.claims.companyId) throw new Reject(403, "forbidden", "Your account can't do that");

      // Everything the writes need, read before the transaction.
      const cand = (await ctx(db, "candidates", e0.candidateId).get()).data() ?? {};
      let identity: { fullName: string; email: string; phone: string } | undefined;
      if (r.status === "interviewing") {
        const [pu, sub] = await Promise.all([
          cand.portalUid ? ctx(db, "portalUsers", cand.portalUid).get() : null,
          cand.sourceSubmissionId ? ctx(db, "submissions", cand.sourceSubmissionId).get() : null,
        ]);
        identity = { fullName: cand.fullName ?? "", email: pu?.data()?.email ?? "", phone: sub?.data()?.fields?.phone ?? "" };
      }
      const status = await db.runTransaction(async (t) => {
        // All reads first, so two concurrent hires on one role cannot both win.
        const cur = (await t.get(eref)).data()!;
        if (cur.status === r.status) return cur.status as ShortlistStatusResponse["status"]; // repeat
        const others = r.status === "hired"
          ? (await t.get(db.collection("shortlistEntries").where("ownerUid", "==", e0.ownerUid).where("roleId", "==", e0.roleId))).docs.filter((d) => d.id !== pre.id)
          : [];
        // Only people with a portal account have a candidateUpdates doc; don't conjure one for the rest.
        const hasUpdate = new Set<string>();
        for (const id of [pre.id, ...others.map((o) => o.id)]) if ((await t.get(ctx(db, "candidateUpdates", id))).exists) hasUpdate.add(id);
        if (others.some((o) => o.data().status === "hired")) throw new Reject(409, "bad_transition", "That role has already been filled");
        const ok = r.status === "interviewing" ? cur.status === "shortlisted"
          : r.status === "hired" ? cur.status === "interviewing"
          : cur.status === "shortlisted" || cur.status === "interviewing";
        if (!ok) throw new Reject(409, "bad_transition", "That person can't move to that step");

        const now = new Date();
        const change = StatusChange.parse({ status: r.status, by: uid, at: now, ...(r.reasonText && { reasonText: r.reasonText }) });
        const mirror = (id: string, s: (typeof MIRROR)[keyof typeof MIRROR]) =>
          hasUpdate.has(id) && t.set(ctx(db, "candidateUpdates", id), CandidateUpdate.partial().parse({ status: s, at: now, updatedAt: now }), { merge: true });
        const touch = (ref: DocumentReference, d: Record<string, unknown>) => void t.set(ref, { updatedAt: now, ...d }, { merge: true });

        touch(eref, {
          status: r.status, statusHistory: [...cur.statusHistory, change],
          ...(identity && { identity }), ...(r.interviewTimes && { interviewTimes: r.interviewTimes }),
        });
        mirror(r.entryId, MIRROR[r.status]);

        if (r.status !== "interviewing") {
          t.set(db.collection("placements").doc(), Placement.parse({
            ownerUid: e0.ownerUid, createdAt: now, updatedAt: now, companyId: e0.companyId, candidateId: e0.candidateId, roleId: e0.roleId,
            outcome: r.status === "hired" ? "placed" : "client-rejected", reason: r.status === "hired" ? "" : r.reasonText, date: now,
            ...(r.startDate && { startDate: new Date(r.startDate) }), ...(r.salary && { salary: r.salary }), source: "company",
          }));
        }
        if (r.status === "hired") {
          touch(ctx(db, "roles", e0.roleId), { status: "filled", closedAt: now });
          for (const o of others) {
            const s = o.data().status;
            if (s !== "shortlisted" && s !== "interviewing") continue;
            touch(o.ref, {
              status: "not-progressing",
              statusHistory: [...o.data().statusHistory, StatusChange.parse({ status: "not-progressing", by: uid, at: now, reasonText: "Role filled" })],
            });
            mirror(o.id, "not-taken-forward");
          }
        }
        return r.status;
      });
      res.json({ status } satisfies ShortlistStatusResponse);
    } catch (e) {
      if (e instanceof Reject) return void fail(res, e.status, e.code, e.message);
      console.error("shortlist-status failed:", (e as Error)?.name);
      fail(res, 500, "internal", "Something went wrong.");
    }
  });

  return router;
}

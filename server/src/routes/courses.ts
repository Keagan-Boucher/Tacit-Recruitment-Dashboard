import { Router } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { CourseItem, CourseRequest, CourseSuggestion, type ApiErrorBody, type CourseResponse } from "@tacit/shared";
import { z } from "zod";
import { mentionsDemographic } from "../ai/demographics.ts";
import { aiErrorResponse, loadPrompt, runStructured, type Ai } from "../ai/index.ts";

/** Model output. Strict-ready; the 1-3 bound is enforced by the proxy (size limits are stripped for Groq). */
export const CourseDraft = z.object({ items: z.array(CourseItem).max(3) });

// ponytail: 12 requirements and 20 facts keep the prompt small; raise only with a paid tier.
export const REQ_CAP = 12;
export const FACTS_CAP = 20;
const MONTHS = 9;

const err = (code: ApiErrorBody["code"], error: string): ApiErrorBody => ({ error, code });
const toDate = (v: unknown): Date => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : (v as Date));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function courseRouter({ ai, db }: { ai: Ai; db: Firestore }) {
  const router = Router();
  router.post("/courses/:candidateId", async (req, res) => {
    const body = CourseRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "That request isn't valid"));
    const uid = req.uid;
    const candidateId = String(req.params.candidateId);
    try {
      const candSnap = await db.collection("candidates").doc(candidateId).get();
      const cand = candSnap.data();
      if (!candSnap.exists || !cand || cand.ownerUid !== uid) return void res.status(404).json(err("not_found", "Candidate not found"));

      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - MONTHS);
      const since = cand.inPoolSince ? toDate(cand.inPoolSince) : undefined;
      if (!since || since > cutoff) return void res.status(409).json(err("bad_transition", "Course suggestions start once someone has been in the pool for nine months."));
      const placements = await db.collection("placements").where("ownerUid", "==", uid).where("candidateId", "==", candidateId).get();
      if (placements.docs.some((d) => d.data().outcome === "placed" && toDate(d.data().date) > since)) {
        return void res.status(409).json(err("bad_transition", "This candidate has been placed since joining the pool."));
      }

      const ref = db.collection("courseSuggestions").doc(candidateId);
      const existingSnap = await ref.get();
      const existing = existingSnap.exists ? existingSnap.data() : undefined;
      const companies = (await db.collection("companies").where("ownerUid", "==", uid).get()).docs.map((d) => norm(String(d.data().name ?? ""))).filter((n) => n.length >= 3);
      const namesCompany = (t: string) => companies.some((n) => norm(t).includes(n));

      if (body.data.action === "approve") {
        if (!existing || existing.status !== "draft") return void res.status(409).json(err("bad_transition", "There is no draft to approve. Draft suggestions first."));
        if (body.data.items.some((i) => namesCompany(`${i.title} ${i.why} ${i.duration}`))) return void res.status(400).json(err("bad_request", "Suggestions can't name a company."));
        if (body.data.items.some((i) => mentionsDemographic(`${i.title} ${i.why} ${i.duration}`))) return void res.status(400).json(err("bad_request", "Suggestions can't mention personal characteristics."));
        await ref.update({ items: body.data.items, status: "approved", approvedBy: uid, approvedAt: now, updatedAt: now });
        return void res.json({ status: "approved", items: body.data.items } satisfies CourseResponse);
      }

      if (existing && existing.status !== "draft") return void res.status(409).json(err("bad_transition", "These suggestions were already approved, snoozed or dismissed."));

      // Roles they came close to: a match, or a shortlist decision.
      const [ms, os, as] = await Promise.all([
        db.collection("matches").where("ownerUid", "==", uid).where("candidateId", "==", candidateId).get(),
        db.collection("overrides").where("ownerUid", "==", uid).where("candidateId", "==", candidateId).get(),
        db.collection("attributes").where("ownerUid", "==", uid).where("candidateId", "==", candidateId).get(),
      ]);
      const roleIds = [...new Set([
        ...ms.docs.map((d) => d.data().roleId as string),
        ...os.docs.filter((d) => d.data().decision === "shortlist" && !d.data().reversedAt).map((d) => d.data().roleId as string),
      ])];
      const roles = (await Promise.all(roleIds.map((id) => db.collection("roles").doc(id).get())))
        .map((s) => (s.exists ? s.data() : undefined))
        .filter((r) => r && r.ownerUid === uid && r.interpretedBrief);
      if (!roles.length) return void res.status(409).json(err("bad_transition", "There are no briefs this candidate came close to yet."));

      // Counts are computed here so the model never invents them.
      const total = roles.length;
      const counts = new Map<string, { text: string; n: number }>();
      for (const r of roles) {
        const b = r!.interpretedBrief as { mustHave: string[]; niceToHave: string[] };
        for (const t of new Set([...b.mustHave, ...b.niceToHave].map(norm))) {
          const c = counts.get(t) ?? { text: t, n: 0 };
          c.n++;
          counts.set(t, c);
        }
      }
      const reqs = [...counts.values()].sort((a, z) => z.n - a.n).slice(0, REQ_CAP);
      const facts = as.docs.map((d) => d.data()).filter((a) => a.confirmedByRecruiter)
        .sort((x, y) => toDate(y.observedAt).getTime() - toDate(x.observedAt).getTime()).slice(0, FACTS_CAP)
        .map((a) => `${a.type} | ${String(a.editedValue ?? a.value).slice(0, 140)}`);
      const input = [
        `CANDIDATE FACTS\n${[cand.headline, ...(cand.topSkills ?? []).map((s: string) => `skill | ${s}`), ...facts].join("\n")}`,
        `ROLES THEY CAME CLOSE TO: ${total}`,
        `REQUIREMENTS (asked for in N of ${total} roles)\n${reqs.map((r) => `${r.text} | ${r.n} of ${total}`).join("\n")}`,
      ].join("\n");

      const prompt = loadPrompt("course-suggest", 1);
      const modelVersion = `${ai.model}/course-suggest.v${prompt.version}`;
      const allowed = new Set([String(total), ...reqs.map((r) => String(r.n))]);
      let kept: CourseItem[] = [];
      await runStructured(
        {
          task: "course-suggest", prompt, schema: CourseDraft, input, reasoningEffort: "low",
          check: (d) => {
            let demo = 0;
            kept = d.items.filter((i) => {
              const t = `${i.title} ${i.why} ${i.duration}`;
              if (mentionsDemographic(t)) { demo++; return false; }
              // Any number in `why` must be one we supplied.
              return !namesCompany(t) && (i.why.match(/\d+/g) ?? []).every((n) => allowed.has(n));
            }).slice(0, 3);
            if (demo) console.log(JSON.stringify({ task: "course-suggest", demographicDropped: demo })); // counts only
            if (!kept.length) throw new Error("No usable suggestion. Name a course for a requirement the candidate does not show, use only the counts given, and never name a company.");
            return d;
          },
        },
        ai,
      );

      const parsed = CourseSuggestion.parse({
        ownerUid: uid, items: kept, basis: { roleIds }, status: "draft", generatedAt: now, modelVersion,
        createdAt: existing ? toDate(existing.createdAt) : now, updatedAt: now,
      });
      await ref.set(parsed);
      res.json({ status: "draft", items: parsed.items } satisfies CourseResponse);
    } catch (e) {
      const r = aiErrorResponse(e);
      if (r) return void res.status(r.status).json(r.body);
      console.error("courses failed:", (e as Error)?.name);
      res.status(500).json(err("internal", "Couldn't save the suggestions. Try again."));
    }
  });
  return router;
}

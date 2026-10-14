import { Router } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { Match, MatchRequest, MatchResult, staleness, isForgotten, type ApiErrorBody, type MatchResponse } from "@tacit/shared";
import { mentionsDemographic } from "../ai/demographics.ts";
import { aiErrorResponse, loadPrompt, runStructured, type Ai } from "../ai/index.ts";

// ponytail: ~10 candidates x 12 facts keeps the prompt under ~4k tokens (Groq on-demand ~8k TPM). Raise only with a paid tier.
export const SHORTLIST_CAP = 10;
export const FACTS_PER_CANDIDATE = 12;
const DAY = 86_400_000;

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Firestore doc data
const toDate = (v: unknown): Date => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : (v as Date));
const err = (code: ApiErrorBody["code"], error: string): ApiErrorBody => ({ error, code });
const STOP = new Set(["the", "and", "for", "with", "have", "experience", "hands", "years", "year"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const budgetOf = (v: string) => {
  const m = /(\d+(?:[ ,]\d{3})*)\s*(k)?/i.exec(v);
  const n = m ? Number(m[1]!.replace(/[ ,]/g, "")) * (m[2] ? 1000 : 1) : 0;
  return n >= 1000 ? n : 0;
};
const modeOf = (v: string) => (/remote/i.test(v) ? "remote" : /hybrid/i.test(v) ? "hybrid" : /on-?site|office/i.test(v) ? "on-site" : "");
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

/** A confirmed attribute (editedValue already applied to value). */
export interface Fact { id: string; type: string; value: string; observedAt: Date }

/**
 * Stage 1, no model. Ranks by must-have overlap; work mode, budget and location mismatches only lower the score
 * (they become reasons against, never exclusions) and age never counts. Candidates with no confirmed facts are
 * skipped (nothing to cite). ponytail: keyword overlap on headline/topSkills/skill facts; swap for embeddings if recall disappoints.
 */
export function preFilter(role: Rec, cands: { id: string; data: Rec }[], facts: Map<string, Fact[]>, rejected: Set<string>) {
  const b = role.interpretedBrief as Rec | undefined;
  const need = new Set(words(b ? b.mustHave.join(" ") : String(role.briefText ?? "")));
  const mode = b ? modeOf(b.workMode) : "";
  const locWords = new Set(b ? words(b.location).filter((w) => w.length >= 4) : []);
  return cands
    .filter((c) => !rejected.has(c.id) && facts.get(c.id)?.length)
    .map((c) => {
      const fs = facts.get(c.id)!;
      const val = (t: string) => fs.filter((f) => f.type === t).map((f) => f.value);
      const have = new Set(words([c.data.headline, ...(c.data.topSkills ?? []), ...val("skill")].join(" ")));
      const hits = [...need].filter((w) => have.has(w)).length;
      let miss = 0;
      const modes = val("work-mode").map(modeOf).filter(Boolean);
      if (mode && modes.length && !modes.includes(mode)) miss++;
      const pay = Math.max(0, ...val("salary").map(budgetOf));
      if (b && pay && pay > b.budget.max * 1.15) miss++;
      const where = new Set(words([c.data.location, ...val("location")].join(" ")));
      if (locWords.size && ![...locWords].some((w) => where.has(w))) miss++;
      return { c, score: hits * 10 - miss * 3 };
    })
    .sort((a, z) => z.score - a.score)
    .slice(0, SHORTLIST_CAP)
    .map((x) => x.c);
}

export function matchRouter({ ai, db }: { ai: Ai; db: Firestore }) {
  const router = Router();
  router.post("/match", async (req, res) => {
    const body = MatchRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "roleId is required"));
    const { roleId, force } = body.data;
    const uid = req.uid;
    const roleSnap = await db.collection("roles").doc(roleId).get();
    const role = roleSnap.data();
    if (!roleSnap.exists || !role || role.ownerUid !== uid) return void res.status(404).json(err("not_found", "Role not found"));
    const modelVersion = `${ai.model}/match.v1`;

    try {
      const old = await db.collection("matches").where("ownerUid", "==", uid).where("roleId", "==", roleId).get();
      const roleUpdated = toDate(role.updatedAt).getTime();
      if (!force && old.docs.length && old.docs.every((d) => d.data().modelVersion === modelVersion && toDate(d.data().generatedAt).getTime() >= roleUpdated)) {
        return void res.json({ matchIds: old.docs.map((d) => d.id), modelVersion, cached: true } satisfies MatchResponse);
      }

      const [cs, as, os] = await Promise.all([
        db.collection("candidates").where("ownerUid", "==", uid).get(),
        // ponytail: reads every confirmed fact the recruiter has; fine for hundreds of candidates, query per candidate beyond that.
        db.collection("attributes").where("ownerUid", "==", uid).where("confirmedByRecruiter", "==", true).get(),
        db.collection("overrides").where("ownerUid", "==", uid).where("roleId", "==", roleId).get(),
      ]);
      const facts = new Map<string, Fact[]>();
      for (const d of as.docs) {
        const a = d.data();
        const f = { id: d.id, type: a.type, value: String(a.editedValue ?? a.value), observedAt: toDate(a.observedAt) };
        facts.set(a.candidateId, [...(facts.get(a.candidateId) ?? []), f]);
      }
      for (const [k, v] of facts) facts.set(k, v.sort((x, y) => y.observedAt.getTime() - x.observedAt.getTime()).slice(0, FACTS_PER_CANDIDATE));
      const rejected = new Set(os.docs.filter((d) => d.data().decision === "reject" && !d.data().reversedAt).map((d) => d.data().candidateId as string));
      const cands = cs.docs.map((d) => ({ id: d.id, data: d.data() }));
      const short = preFilter(role, cands, facts, rejected);

      const now = new Date();
      let kept: { s: MatchResult["suggestions"][number]; newest: Date }[] = [];
      if (short.length) {
        const input = [
          `Today: ${dateStr(now)}`,
          `ROLE BRIEF\n${role.interpretedBrief ? JSON.stringify(role.interpretedBrief) : role.briefText}`,
          "CANDIDATES",
          ...short.map((c) => `## ${c.id} | ${c.data.headline} | ${c.data.location}\n${facts.get(c.id)!.map((f) => `${f.id} | ${f.type} | ${f.value.slice(0, 140)} | ${dateStr(f.observedAt)}`).join("\n")}`),
        ].join("\n");
        await runStructured(
          {
            task: "match", prompt: loadPrompt("match", 2), schema: MatchResult, input, reasoningEffort: "low",
            check: (d) => {
              const seen = new Set<string>();
              const allIds = [...facts.values()].flat().map((f) => f.id);
              let demo = 0;
              kept = [];
              for (const s of d.suggestions) {
                if (!short.some((c) => c.id === s.candidateId) || seen.has(s.candidateId)) continue;
                const own = new Map((facts.get(s.candidateId) ?? []).map((f) => [f.id, f]));
                const clean = (t: string) => !mentionsDemographic(t) || (demo++, false);
                // Ids belong in attributeIds, not in the sentence the recruiter reads.
                const strip = (t: string) => allIds.reduce((x, id) => x.split(id).join(""), t).replace(/\(\s*[,;\s]*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;])/g, "$1").trim();
                // A stray foreign id voids only itself; the reason survives on its own candidate's facts.
                const mine = (ids: string[]) => ids.filter((i) => own.has(i));
                const reasons = (rs: typeof s.reasonsFor) =>
                  rs.map((r) => ({ text: strip(r.text), attributeIds: mine(r.attributeIds) })).filter((r) => r.attributeIds.length && r.text && clean(r.text));
                const out = {
                  ...s,
                  reasonsFor: reasons(s.reasonsFor),
                  reasonsAgainst: reasons(s.reasonsAgainst),
                  skillAlignment: s.skillAlignment
                    .map((a) => ({ ...a, evidence: strip(a.evidence), attributeIds: a.kind === "not-seen" ? [] : mine(a.attributeIds) }))
                    .filter((a) => (a.kind === "not-seen" || a.attributeIds.length > 0) && clean(a.evidence) && clean(a.requirement)),
                  questionsToAsk: s.questionsToAsk.map(strip).filter(clean),
                };
                if (!out.reasonsFor.length) continue;
                // Both sides always show: if no reason against survived the citation checks, say so plainly instead of dropping the person.
                if (!out.reasonsAgainst.length) {
                  out.reasonsAgainst = [{ text: "Tacit couldn't ground a reason against in your notes. Check fit, location and pay yourself.", attributeIds: out.reasonsFor[0]!.attributeIds }];
                }
                const cited = [...out.reasonsFor, ...out.reasonsAgainst, ...out.skillAlignment].flatMap((x) => x.attributeIds);
                seen.add(s.candidateId);
                kept.push({ s: out, newest: new Date(Math.max(...cited.map((i) => own.get(i)!.observedAt.getTime()))) });
              }
              if (demo) console.log(JSON.stringify({ task: "match", demographicDropped: demo })); // counts only
              if (d.suggestions.length && !kept.length) throw new Error("Every suggestion was discarded. Cite attributeIds copied exactly from that candidate's own facts, and give at least one reason for and one against.");
              return d;
            },
          },
          ai,
        );
      }

      // Parse everything before opening the batch: nothing unvalidated is persisted.
      const col = db.collection("matches");
      const docs = kept.map(({ s, newest }, i) => {
        const opened = cands.find((c) => c.id === s.candidateId)?.data.lastOpenedAt;
        return {
          ref: col.doc(),
          parsed: Match.parse({
            ownerUid: uid, roleId, candidateId: s.candidateId, rank: i + 1,
            reasonsFor: s.reasonsFor, reasonsAgainst: s.reasonsAgainst, skillAlignment: s.skillAlignment, questionsToAsk: s.questionsToAsk,
            evidenceAgeDays: Math.max(0, Math.floor((now.getTime() - newest.getTime()) / DAY)), staleness: staleness(newest, now),
            forgotten: isForgotten(opened ? toDate(opened) : undefined, now),
            generatedAt: now, modelVersion, createdAt: now, updatedAt: now,
          }),
        };
      });
      const batch = db.batch();
      old.docs.forEach((d) => batch.delete(d.ref));
      docs.forEach(({ ref, parsed }) => batch.create(ref, parsed));
      await batch.commit();
      res.json({ matchIds: docs.map((d) => d.ref.id), modelVersion, cached: false } satisfies MatchResponse);
    } catch (e) {
      const r = aiErrorResponse(e);
      if (r) return void res.status(r.status).json(r.body);
      console.error("match failed:", (e as Error)?.name);
      res.status(500).json(err("internal", "Couldn't save the matches. Try again."));
    }
  });
  return router;
}

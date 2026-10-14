import { Router } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { SearchRequest, SearchResult, type ApiErrorBody, type SearchHit, type SearchResponse } from "@tacit/shared";
import { mentionsDemographic } from "../ai/demographics.ts";
import { aiErrorResponse, loadPrompt, runStructured, type Ai } from "../ai/index.ts";

// ponytail: ~14k chars is roughly 4k tokens, inside Groq's shared 8k TPM. Candidates past the cap are not searched; add a keyword pre-filter if that bites.
export const FACTS_PER_CANDIDATE = 6;
export const INPUT_CHAR_CAP = 14_000;

const err = (code: ApiErrorBody["code"], error: string): ApiErrorBody => ({ error, code });
const time = (v: unknown): number => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : (v as Date)).getTime();

export function searchRouter({ ai, db }: { ai: Ai; db: Firestore }) {
  const router = Router();
  router.post("/search", async (req, res) => {
    const body = SearchRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "query is required"));
    const uid = req.uid;
    const modelVersion = `${ai.model}/search.v1`;
    try {
      const [cs, as] = await Promise.all([
        db.collection("candidates").where("ownerUid", "==", uid).get(),
        db.collection("attributes").where("ownerUid", "==", uid).where("confirmedByRecruiter", "==", true).get(),
      ]);
      const facts = new Map<string, { id: string; type: string; value: string; at: number }[]>();
      for (const d of as.docs) {
        const a = d.data();
        facts.set(a.candidateId, [...(facts.get(a.candidateId) ?? []), { id: d.id, type: a.type, value: String(a.editedValue ?? a.value).slice(0, 140), at: time(a.observedAt) }]);
      }
      let size = 0;
      const blocks: string[] = [];
      const lines = new Map<string, Set<string>>(); // candidateId -> every confirmed attribute id (what a hit may cite)
      for (const c of cs.docs) {
        const fs = facts.get(c.id);
        if (!fs?.length) continue; // nothing to cite
        const block = `## ${c.id} | ${c.data().headline}\n${[...fs].sort((x, y) => y.at - x.at).slice(0, FACTS_PER_CANDIDATE).map((f) => `${f.id} | ${f.type} | ${f.value}`).join("\n")}`;
        if (size + block.length > INPUT_CHAR_CAP) break;
        size += block.length;
        blocks.push(block);
        lines.set(c.id, new Set(fs.map((f) => f.id)));
      }
      if (!blocks.length) return void res.json({ hits: [], modelVersion } satisfies SearchResponse);

      let kept: SearchHit[] = [];
      await runStructured(
        {
          task: "search", prompt: loadPrompt("search", 1), schema: SearchResult, input: `QUERY\n${body.data.query}\nCANDIDATES\n${blocks.join("\n")}`, reasoningEffort: "low",
          check: (d) => {
            const seen = new Set<string>();
            let demo = 0;
            kept = d.hits.filter((h) => {
              const own = lines.get(h.candidateId);
              if (!own || seen.has(h.candidateId) || !h.attributeIds.length || !h.attributeIds.every((i) => own.has(i))) return false;
              if (mentionsDemographic(h.whyMatched)) { demo++; return false; }
              seen.add(h.candidateId);
              return true;
            });
            if (demo) console.log(JSON.stringify({ task: "search", demographicDropped: demo })); // counts only
            if (d.hits.length && !kept.length) throw new Error("Every hit was discarded. Cite attributeIds copied exactly from that candidate's own facts, with at least one per hit.");
            return d;
          },
        },
        ai,
      );
      res.json({ hits: kept, modelVersion } satisfies SearchResponse);
    } catch (e) {
      const r = aiErrorResponse(e);
      if (r) return void res.status(r.status).json(r.body);
      console.error("search failed:", (e as Error)?.name);
      res.status(500).json(err("internal", "Couldn't search. Try again."));
    }
  });
  return router;
}

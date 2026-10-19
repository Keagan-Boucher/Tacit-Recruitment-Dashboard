// Search eval section: runs the production POST /api/search over the seeded dataset (in-memory Firestore).
import { mentionsDemographic } from "../server/src/ai/demographics.ts";
import type { Ai } from "../server/src/ai/index.ts";
import { searchRouter } from "../server/src/routes/search.ts";
import { factIds, memDb, nameOf, post } from "./harness.ts";

// Expected candidates are people whose confirmed seed facts answer the query (see scripts/seed/matches.ts specs).
const QUERIES: { query: string; expect: string }[] = [
  { query: "self-taught S/4HANA", expect: "cand_demo_forgotten" },
  { query: "Oracle Fusion migration experience", expect: "cand_ayesha_patel" },
  { query: "NetSuite SuiteScript", expect: "cand_nomvula_zulu" },
];

/** Returns the number of gate failures (demographic leaks + uncited or fabricated citations). */
export async function runSearchEval(ai: Ai, out: (s: string) => void): Promise<number> {
  let gate = 0, hits3 = 0, errors = 0;
  out("\n== search ==");
  for (const q of QUERIES) {
    const { db } = memDb();
    const r = await post(searchRouter({ ai, db }), "/search", { query: q.query });
    if (r.status !== 200) { errors++; out(`ERROR "${q.query}": ${r.status} ${r.body?.code ?? ""}`); continue; }
    const hits: { candidateId: string; whyMatched: string; attributeIds: string[] }[] = r.body.hits;
    let bad = 0, leaks = 0;
    for (const h of hits) {
      const mine = factIds(h.candidateId);
      if (!h.attributeIds.length || h.attributeIds.some((i) => !mine.has(i))) { bad++; out(`    CITATION ${h.candidateId} -> ${JSON.stringify(h.attributeIds)}`); }
      if (mentionsDemographic(h.whyMatched)) { leaks++; out(`    DEMOGRAPHIC LEAK ${h.candidateId}: "${h.whyMatched}"`); }
    }
    gate += bad + leaks;
    const rank = hits.findIndex((h) => h.candidateId === q.expect) + 1;
    if (rank > 0 && rank <= 3) hits3++;
    out(`  ${rank > 0 && rank <= 3 ? "pass" : "miss"}  "${q.query}" -> ${nameOf(q.expect)?.fullName} ${rank ? `at ${rank}` : "not found"}  (top: ${hits.slice(0, 3).map((h) => nameOf(h.candidateId)?.fullName).join(", ") || "none"}; citations ${bad ? bad + " bad" : "ok"}, leaks ${leaks})`);
  }
  out(`search: queries ${QUERIES.length}  errors ${errors}  hit@3 ${hits3}/${QUERIES.length}  gate failures (leaks + bad citations) ${gate}`);
  return gate;
}

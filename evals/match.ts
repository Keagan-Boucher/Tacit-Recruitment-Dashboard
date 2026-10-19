// Match eval section: runs the production POST /api/match over the seeded dataset (in-memory Firestore).
// Expectations come from the seed's own buildMatches specs (rank-1 people, plus the demo's forgotten candidate).
import { mentionsDemographic } from "../server/src/ai/demographics.ts";
import type { Ai } from "../server/src/ai/index.ts";
import { matchRouter } from "../server/src/routes/match.ts";
import { factIds, memDb, nameOf, post } from "./harness.ts";

interface Case { role: string; label: string; mustInclude: string[]; forgotten?: string }
const CASES: Case[] = [
  { role: "role_demo_fico", label: "FICO at Vantage", mustInclude: ["cand_demo_forgotten", "cand_demo_thabo"], forgotten: "cand_demo_forgotten" },
  { role: "role_karoo_oracle_fin", label: "Oracle Financials at Karoo", mustInclude: ["cand_ayesha_patel"] },
  { role: "role_bluewater_netsuite", label: "NetSuite admin at Bluewater", mustInclude: ["cand_nomvula_zulu"] },
];
const MONTH = 30.4375;

/** Returns the number of gate failures (demographic leaks + uncited or fabricated citations). */
export async function runMatchEval(ai: Ai, out: (s: string) => void): Promise<number> {
  let gate = 0, errors = 0, includeHit = 0, includeTotal = 0, soft = 0;
  out("\n== match ==");
  for (const c of CASES) {
    const { db, store } = memDb();
    const r = await post(matchRouter({ ai, db }), "/match", { roleId: c.role, force: true });
    if (r.status !== 200) { errors++; out(`ERROR ${c.label}: ${r.status} ${r.body?.code ?? ""}`); continue; }
    const docs = [...store].filter(([k]) => k.startsWith("matches/")).map(([, v]) => v).sort((a, b) => a.rank - b.rank);
    const row = (ok: boolean, name: string, detail = "") => out(`  ${ok ? "pass" : "FAIL"}  ${name}${detail ? " " + detail : ""}`);
    out(`${c.label}  (${r.body.modelVersion}, ${docs.length} suggestions)`);

    let bothSides = true, badCites = 0, leaks = 0;
    for (const d of docs) {
      const mine = factIds(d.candidateId);
      if (!d.reasonsFor.length || !d.reasonsAgainst.length) bothSides = false;
      const cited = [...d.reasonsFor, ...d.reasonsAgainst].concat(d.skillAlignment.filter((a: { kind: string }) => a.kind !== "not-seen"));
      for (const x of cited) if (!x.attributeIds.length || x.attributeIds.some((i: string) => !mine.has(i))) { badCites++; out(`    CITATION ${nameOf(d.candidateId)?.fullName ?? d.candidateId}: "${x.text ?? x.evidence}" -> ${JSON.stringify(x.attributeIds)}`); }
      const texts = [...d.reasonsFor, ...d.reasonsAgainst].map((x: { text: string }) => x.text)
        .concat(d.skillAlignment.flatMap((a: { requirement: string; evidence: string }) => [a.requirement, a.evidence]), d.questionsToAsk);
      for (const t of texts) if (mentionsDemographic(t)) { leaks++; out(`    DEMOGRAPHIC LEAK ${d.candidateId}: "${t}"`); }
    }
    row(badCites === 0, "every cited id exists in that candidate's facts", badCites ? `(${badCites} bad)` : "");
    row(leaks === 0, "no demographic text in reasons, alignment or questions");
    row(bothSides, "every suggestion has a reason for and a reason against");
    if (!bothSides) soft++;
    gate += badCites + leaks;

    for (const id of c.mustInclude) {
      includeTotal++;
      const hit = docs.find((d) => d.candidateId === id);
      if (hit) includeHit++; else soft++;
      row(!!hit, `${nameOf(id)?.fullName ?? id} in results`, hit ? `(rank ${hit.rank})` : `(got ${docs.map((d) => nameOf(d.candidateId)?.fullName).join(", ") || "none"})`);
    }
    if (c.forgotten) {
      const hit = docs.find((d) => d.candidateId === c.forgotten);
      if (hit) {
        const months = hit.evidenceAgeDays / MONTH;
        const okForgotten = hit.forgotten === true, okAge = Math.abs(months - 14) <= 1;
        row(okForgotten, "flagged forgotten");
        row(okAge, "evidence age about 14 months", `(${hit.evidenceAgeDays} days = ${months.toFixed(1)} months, ${hit.staleness})`);
        soft += (okForgotten ? 0 : 1) + (okAge ? 0 : 1);
      }
    }
  }
  out(`match: cases ${CASES.length}  errors ${errors}  must-include ${includeHit}/${includeTotal}  content misses ${soft}  gate failures (leaks + bad citations) ${gate}`);
  return gate;
}

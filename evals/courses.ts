// Course-suggest eval section: runs the production POST /api/courses over the seeded dataset (in-memory Firestore).
import { mentionsDemographic } from "../server/src/ai/demographics.ts";
import type { Ai } from "../server/src/ai/index.ts";
import { courseRouter } from "../server/src/routes/courses.ts";
import { dataset, memDb, nameOf, OWNER, post } from "./harness.ts";

// cand_ruan_botha is the seeded nine-month candidate; cand_demo_forgotten has no inPoolSince, so must be refused.
const CASES: { id: string; expect: 200 | 409 }[] = [
  { id: "cand_ruan_botha", expect: 200 },
  { id: "cand_demo_forgotten", expect: 409 },
];

/** Returns the number of gate failures (company names, demographic text, wrong eligibility, unsaved or invalid drafts). */
export async function runCourseEval(ai: Ai, out: (s: string) => void): Promise<number> {
  let gate = 0;
  out("\n== courses ==");
  const companies = (dataset.companies as { data: { name: string } }[]).map((c) => c.data.name.toLowerCase());
  for (const c of CASES) {
    const { db, store } = memDb();
    // memDb leaves these out on purpose (match cache); the course route needs them.
    for (const col of ["matches", "companies", "placements"] as const) for (const d of dataset[col]) store.set(`${col}/${d.id}`, structuredClone(d.data));
    // The seed gives Ruan no matches yet, so he "came close" to the first three briefs for this eval only.
    dataset.roles.filter((x) => (x.data as { interpretedBrief?: unknown }).interpretedBrief).slice(0, 3).forEach((x, i) => store.set(`matches/eval_close_${c.id}_${i}`, { ownerUid: OWNER, candidateId: c.id, roleId: x.id }));
    const r = await post(courseRouter({ ai, db }), `/courses/${c.id}`, { action: "draft" });
    let bad = 0;
    if (r.status !== c.expect) { bad++; out(`    STATUS ${c.id}: got ${r.status} ${r.body?.code ?? ""}, wanted ${c.expect}`); }
    const items: { title: string; why: string; duration: string }[] = r.status === 200 ? r.body.items : [];
    for (const i of items) {
      const t = `${i.title} ${i.why} ${i.duration}`;
      if (companies.some((n) => t.toLowerCase().includes(n))) { bad++; out(`    COMPANY NAME ${c.id}: "${t}"`); }
      if (mentionsDemographic(t)) { bad++; out(`    DEMOGRAPHIC LEAK ${c.id}: "${t}"`); }
    }
    if (r.status === 200 && store.get(`courseSuggestions/${c.id}`)?.status !== "draft") { bad++; out(`    NOT SAVED ${c.id}`); }
    gate += bad;
    out(`  ${bad ? "FAIL" : "pass"}  ${nameOf(c.id)?.fullName}: ${r.status}${items.length ? ` ${items.map((i) => `"${i.title}" (${i.why})`).join("; ")}` : ""}`);
  }
  out(`courses: cases ${CASES.length}  gate failures ${gate}`);
  return gate;
}

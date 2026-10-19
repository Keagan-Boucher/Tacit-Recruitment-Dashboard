// npm run eval: interpret (evals/notes), match and search sections against the live model. EVAL_FAKE=1 swaps in a deterministic fake.
import { readdirSync, readFileSync } from "node:fs";
import { loadConfig } from "../server/src/config.ts";
import { createAi } from "../server/src/ai/index.ts";
import { mentionsDemographic } from "../server/src/ai/demographics.ts";
import { loadPrompt } from "../server/src/ai/index.ts";
import { interpretNote } from "../server/src/routes/interpret-note.ts";
import { fakeAi } from "./fake.ts";
import { runMatchEval } from "./match.ts";
import { runSearchEval } from "./search.ts";

type Exp = { type: string; quote: string };
const here = new URL(".", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, here), "utf8").replace(/\r\n/g, "\n");
const names = readdirSync(new URL("notes/", here)).filter((f) => f.endsWith(".txt")).map((f) => f.slice(0, -4)).sort();

const ai = process.env.EVAL_FAKE ? fakeAi() : createAi(loadConfig({ ALLOWED_ORIGIN: "http://eval", ...process.env }));
// Versions the routes load today (interpret-note.ts, match.ts, search.ts); each response also reports its own modelVersion.
const prompts = [["interpret-note", 1], ["match", 2], ["search", 1]] as const;
console.log(`model ${ai.model || "(not configured)"}  prompts ${prompts.map(([t, v]) => (loadPrompt(t, v), `${t}.v${v}`)).join(" ")}${process.env.EVAL_FAKE ? "  [EVAL_FAKE: deterministic fake, not a quality score]" : ""}`);

const tp: Record<string, number> = {}, fp: Record<string, number> = {}, fn: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
let spanFails = 0, leaks = 0, cost = 0, errors = 0;
const out = console.log;
console.log = (...a: unknown[]) => { // swallow the proxy's per-request log lines, summing cost
  try { const j = JSON.parse(String(a[0])); if (typeof j.costUsd === "number") { cost += j.costUsd; return; } } catch { /* not a log line */ }
  out(...a);
};
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

for (const name of names) {
  const text = read(`notes/${name}.txt`);
  const exp: Exp[] = JSON.parse(read(`expected/${name}.json`)).attributes;
  let got;
  try { got = (await interpretNote(text, ai)).attributes; } catch (e) { errors++; { const c = (e as Error).cause as { status?: number; code?: string; type?: string; message?: string } | undefined; out(`ERROR ${name}: ${(e as Error).message} cause: status=${c?.status} code=${c?.code} type=${c?.type ?? c?.constructor?.name} msg=${(c?.message ?? "").slice(0, 160)}`); }; continue; }
  const want = exp.map((x) => {
    const start = text.indexOf(x.quote);
    if (start < 0) out(`BAD EXPECTED ${name}: ${x.quote}`);
    return { ...x, start, end: start + x.quote.length };
  });
  const used = new Set<number>();
  for (const g of got) {
    const slice = text.slice(g.sourceSpan.start, g.sourceSpan.end);
    if (!squash(slice).includes(squash(g.quote))) { spanFails++; out(`SPAN FAIL ${name}: "${g.quote}" vs "${slice}"`); }
    if (mentionsDemographic(g.value) || mentionsDemographic(g.quote)) { leaks++; out(`DEMOGRAPHIC LEAK ${name}: ${g.type} "${g.value}" / "${g.quote}"`); }
    const i = want.findIndex((x, k) => !used.has(k) && x.type === g.type && x.start < g.sourceSpan.end && g.sourceSpan.start < x.end);
    if (i >= 0) { used.add(i); bump(tp, g.type); } else { bump(fp, g.type); out(`  extra  ${name}: ${g.type} "${g.quote}"`); }
  }
  want.forEach((x, k) => { if (!used.has(k)) { bump(fn, x.type); out(`  missed ${name}: ${x.type} "${x.quote}"`); } });
}

const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(0) + "%" : "-");
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
const row = (t: string, a: number, b: number, c: number) =>
  out(`${t.padEnd(20)}${String(a).padStart(4)}${String(b).padStart(4)}${String(c).padStart(4)}   P ${pct(a, a + b).padStart(4)}  R ${pct(a, a + c).padStart(4)}`);
out(`\n${"type".padEnd(20)}  TP  FP  FN`);
[...new Set([...Object.keys(tp), ...Object.keys(fp), ...Object.keys(fn)])].sort().forEach((t) => row(t, tp[t] ?? 0, fp[t] ?? 0, fn[t] ?? 0));
row("OVERALL", sum(tp), sum(fp), sum(fn));
out(`\nnotes ${names.length}  errors ${errors}  span failures ${spanFails}  demographic leaks ${leaks}  cost $${cost.toFixed(4)}`);
// errors and scores are reported, not gated; spans, leaks and bad citations gate
const costBefore = cost;
const gateFails = (await runMatchEval(ai, out)) + (await runSearchEval(ai, out));
out(`
match + search cost ${(cost - costBefore).toFixed(4)}`);
process.exit(spanFails || leaks || gateFails ? 1 : 0);

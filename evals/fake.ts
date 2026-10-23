// EVAL_FAKE=1: a deterministic stand-in for the model so the eval harness can be proven end to end without a live call.
// Not a quality measure: interpret echoes evals/expected, match cites each shortlisted candidate's own facts, search does keyword overlap.
import { readdirSync, readFileSync } from "node:fs";
import type { Ai } from "../server/src/ai/index.ts";

const here = new URL(".", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, here), "utf8").replace(/\r\n/g, "\n");
const notes = new Map(readdirSync(new URL("notes/", here)).filter((f) => f.endsWith(".txt")).map((f) => [read(`notes/${f}`), JSON.parse(read(`expected/${f.slice(0, -4)}.json`)).attributes] as const));

/** "## id | headline ...\nfactId | type | value ..." blocks -> candidates with fact lines. */
const blocks = (input: string) =>
  input.split(/^## /m).slice(1).map((b) => {
    const [head, ...lines] = b.trim().split("\n");
    return { id: head!.split(" | ")[0]!, facts: lines.map((l) => l.split(" | ")).filter((p) => p.length >= 3).map(([id, type, value]) => ({ id: id!, type: type!, value: value! })) };
  });

function answer(task: string, input: string): unknown {
  if (task === "interpret-note") {
    const exp = notes.get(input) ?? [];
    return { attributes: exp.map((x: { type: string; quote: string }) => ({ type: x.type, value: x.quote, quote: x.quote, confidence: 0.9, note: null })) };
  }
  if (task === "match") {
    return {
      suggestions: blocks(input).filter((c) => c.facts.length).map((c) => ({
        candidateId: c.id,
        reasonsFor: [{ text: "Has relevant confirmed experience", attributeIds: [c.facts[0]!.id] }],
        reasonsAgainst: [{ text: "Evidence may be dated", attributeIds: [c.facts[c.facts.length - 1]!.id] }],
        skillAlignment: [{ requirement: "Role requirement", evidence: "See the cited note", kind: "interpreted", attributeIds: [c.facts[0]!.id] }],
        questionsToAsk: ["Are you still looking?"],
      })),
    };
  }
  if (task === "search") {
    const query = input.split("\nCANDIDATES\n")[0]!.replace(/^QUERY\n/, "").toLowerCase().split(/[^a-z0-9/+]+/).filter((w) => w.length >= 4);
    const scored = blocks(input).map((c) => ({ c, f: c.facts.filter((f) => query.some((w) => f.value.toLowerCase().includes(w))) })).filter((x) => x.f.length).sort((a, b) => b.f.length - a.f.length);
    return { hits: scored.map(({ c, f }) => ({ candidateId: c.id, whyMatched: "Confirmed notes mention the topic.", kind: "stated", attributeIds: f.map((x) => x.id) })) };
  }
  if (task === "course-suggest") {
    // Top two requirements by count, as "text | N of M" lines.
    const reqs = (input.split("\n").filter((l) => /^.+ \| \d+ of \d+$/.test(l)).map((l) => l.split(" | ")) as [string, string][]).slice(0, 2);
    return { items: reqs.map(([t, n]) => ({ title: `Short course: ${t}`, why: `Asked for in ${n.replace(" of ", " of the ")} roles you came close to`, duration: "self-paced" })) };
  }
  throw new Error(`fake ai: unknown task ${task}`);
}

export const fakeAi = (): Ai => ({
  model: "fake/eval",
  provider: {
    complete: async (r) => ({ content: JSON.stringify(answer(r.name, r.messages[1]!.content)), model: "fake/eval", usage: { inputTokens: 1, outputTokens: 1 } }),
  },
});

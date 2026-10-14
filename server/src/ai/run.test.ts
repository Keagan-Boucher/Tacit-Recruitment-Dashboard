import { BriefInterpretation, CvParseResult, NoteInterpretation } from "@tacit/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type Ai, AiFailedError, AiUnconfiguredError, aiErrorResponse, loadPrompt, runStructured, toStrictSchema } from "./index.ts";
import type { AiProvider, StructuredRequest } from "./provider.ts";

const S = z.object({ n: z.number().min(0).max(1), s: z.string().nullable() });
const prompt = { task: "t", version: 2, system: "sys" };
const reply = (content: string) => ({ content, model: "m", usage: { inputTokens: 10, outputTokens: 5 } });

function fake(...steps: (string | Error)[]) {
  const calls: StructuredRequest[] = [];
  const provider: AiProvider = {
    async complete(req) {
      calls.push(structuredClone(req));
      const s = steps[calls.length - 1];
      if (s instanceof Error) throw s;
      return reply(s ?? "");
    },
  };
  return { ai: { provider, model: "vendor/model" }, calls };
}
const run = (ai: Ai, check?: (d: z.infer<typeof S>) => z.infer<typeof S>) =>
  runStructured({ task: "t", prompt, schema: S, input: "SECRET NOTE TEXT", check }, ai);

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => { log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => log.mockRestore());
const logged = () => log.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string));

describe("runStructured", () => {
  it("valid first try, stamps modelVersion, logs one line", async () => {
    const { ai, calls } = fake('{"n":0.5,"s":null}');
    const r = await run(ai);
    expect(r).toEqual({ data: { n: 0.5, s: null }, modelVersion: "vendor/model/t.v2" });
    expect(calls).toHaveLength(1);
    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatchObject({ task: "t", attempts: 1, inputTokens: 10, outputTokens: 5, ok: true });
  });

  it("repairs invalid JSON, sums tokens, never logs input", async () => {
    const { ai, calls } = fake("not json", '{"n":1,"s":"x"}');
    expect((await run(ai)).data.n).toBe(1);
    expect(calls[1]!.messages.at(-2)).toEqual({ role: "assistant", content: "not json" });
    expect(logged()[0]).toMatchObject({ attempts: 2, inputTokens: 20, outputTokens: 10, ok: true });
    expect(log.mock.calls.join()).not.toContain("SECRET");
  });

  it("repairs Zod-invalid output with the issues in the message", async () => {
    const { ai, calls } = fake('{"n":5,"s":null}', '{"n":0.2,"s":null}');
    await run(ai);
    expect(calls[1]!.messages.at(-1)!.content).toMatch(/n:/);
  });

  it("repairs when check throws, and uses check's pruned result", async () => {
    const { ai, calls } = fake('{"n":0.1,"s":"bad"}', '{"n":0.2,"s":"ok"}');
    const r = await run(ai, (d) => {
      if (d.s === "bad") throw new Error("quote not in note");
      return { ...d, n: 0.9 };
    });
    expect(calls[1]!.messages.at(-1)!.content).toContain("quote not in note");
    expect(r.data).toEqual({ n: 0.9, s: "ok" });
  });

  it("two failures -> AiFailedError, ok:false logged", async () => {
    const { ai } = fake("nope", "still nope");
    await expect(run(ai)).rejects.toBeInstanceOf(AiFailedError);
    expect(logged()[0]).toMatchObject({ attempts: 2, ok: false });
  });

  it("transport error -> AiFailedError without retry", async () => {
    const { ai, calls } = fake(new Error("timeout"));
    await expect(run(ai)).rejects.toBeInstanceOf(AiFailedError);
    expect(calls).toHaveLength(1);
  });

  it("unconfigured -> AiUnconfiguredError / ai_unconfigured", async () => {
    const e = await run({ provider: null, model: "" }).catch((x) => x);
    expect(e).toBeInstanceOf(AiUnconfiguredError);
    expect(aiErrorResponse(e)!.body.code).toBe("ai_unconfigured");
    expect(aiErrorResponse(new AiFailedError("x"))!.body.code).toBe("ai_failed");
  });

  it("loads versioned prompts", () => {
    expect(loadPrompt("smoke", 1).system).toMatch(/structured data/);
  });
});

function everyObjectStrict(node: unknown, path = "$"): string[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => everyObjectStrict(v, `${path}[${i}]`));
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const bad: string[] = [];
  if (n.properties) {
    const keys = Object.keys(n.properties as object).sort();
    const req = [...((n.required as string[]) ?? [])].sort();
    if (n.additionalProperties !== false || JSON.stringify(keys) !== JSON.stringify(req)) bad.push(path);
  }
  for (const [k, v] of Object.entries(n)) bad.push(...everyObjectStrict(v, `${path}.${k}`));
  return bad;
}

describe("toStrictSchema", () => {
  it.each([
    ["NoteInterpretation", NoteInterpretation],
    ["CvParseResult", CvParseResult],
    ["BriefInterpretation", BriefInterpretation],
  ])("%s: every object has full required + additionalProperties:false", (_, schema) => {
    const js = toStrictSchema(schema);
    expect(everyObjectStrict(js)).toEqual([]);
    expect(JSON.stringify(js)).not.toMatch(/"(minimum|maximum|\$schema)"/);
  });
});

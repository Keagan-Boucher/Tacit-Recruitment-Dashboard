/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AiProvider } from "../ai/provider.ts";
import { searchRouter } from "./search.ts";

function fakeDb(seed: Record<string, Record<string, any>>) {
  const store = Object.entries(seed).flatMap(([c, d]) => Object.entries(d).map(([id, v]) => [c, id, v] as const));
  return {
    collection: (c: string) => ({
      where(f: string, _o: string, v: unknown, filters: [string, unknown][] = [[f, v]]) {
        return {
          where: (f2: string, o2: string, v2: unknown) => (this as any).where(f, o2, v, [...filters, [f2, v2]]),
          get: async () => ({ docs: store.filter(([k, , d]) => k === c && filters.every(([ff, vv]) => d[ff] === vv)).map(([, id, d]) => ({ id, data: () => d })) }),
        };
      },
    }),
  } as unknown as Firestore;
}

const provider = (...outs: unknown[]): AiProvider & { calls: number; inputs: string[] } => {
  const p = { calls: 0, inputs: [] as string[], complete: async (r: any) => {
    p.inputs.push(r.messages[1].content);
    return { content: JSON.stringify(outs[Math.min(p.calls++, outs.length - 1)]), model: "m", usage: { inputTokens: 1, outputTokens: 1 } };
  } };
  return p;
};
const hit = (candidateId: string, attributeIds: string[], o = {}) => ({ candidateId, whyMatched: "Worked on FI/CO.", kind: "interpreted", attributeIds, ...o });
const att = (candidateId: string, o = {}) => ({ ownerUid: "u1", candidateId, type: "skill", value: "Financial Accounting and Controlling", observedAt: new Date(), confirmedByRecruiter: true, ...o });

function setup(p: AiProvider) {
  const db = fakeDb({
    candidates: { c1: { ownerUid: "u1", headline: "Finance lead", fullName: "Zed Secretname" }, c2: { ownerUid: "u1", headline: "Analyst" }, cx: { ownerUid: "u2", headline: "Foreign person" } },
    attributes: { a1: att("c1"), a2: att("c2", { value: "Happy where I am" }), a3: att("c1", { confirmedByRecruiter: false, value: "unconfirmedfact" }), ax: att("cx", { ownerUid: "u2", value: "foreignfact" }) },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = "u1"; next(); });
  app.use("/api", searchRouter({ ai: { provider: p, model: "vendor/m" }, db }));
  return app;
}
const post = (app: any, b: any = { query: "FICO" }) => request(app).post("/api/search").send(b);

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("POST /api/search", () => {
  it("returns validated hits; prompt holds only the caller's confirmed facts and no names", async () => {
    const p = provider({ hits: [hit("c1", ["a1"]), hit("c2", ["a2"], { kind: "stated" })] });
    const r = await post(setup(p));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ hits: [hit("c1", ["a1"]), hit("c2", ["a2"], { kind: "stated" })], modelVersion: "vendor/m/search.v1" });
    expect(p.inputs[0]).toContain("a1 | skill | Financial Accounting and Controlling");
    for (const bad of ["unconfirmedfact", "foreignfact", "Foreign person", "Secretname"]) expect(p.inputs[0]).not.toContain(bad);
  });

  it("drops foreign, uncited, wrongly cited and duplicate hits", async () => {
    const p = provider({ hits: [hit("cx", ["ax"]), hit("c1", []), hit("c1", ["a2"]), hit("c1", ["a3"]), hit("c1", ["a1"]), hit("c1", ["a1"]), hit("zzz", ["a1"])] });
    const r = await post(setup(p));
    expect(r.body.hits).toEqual([hit("c1", ["a1"])]);
  });

  it("drops demographic text", async () => {
    const p = provider({ hits: [hit("c1", ["a1"], { whyMatched: "Young woman with FI/CO" }), hit("c2", ["a2"])] });
    expect((await post(setup(p))).body.hits.map((h: any) => h.candidateId)).toEqual(["c2"]);
  });

  it("repairs once when every hit is discarded, then fails visibly", async () => {
    const p = provider({ hits: [hit("cx", ["ax"])] });
    const r = await post(setup(p));
    expect(r.status).toBe(502);
    expect(p.calls).toBe(2);
  });

  it("empty or missing query is a 400 and never calls the model", async () => {
    const p = provider({ hits: [] });
    const app = setup(p);
    expect((await post(app, { query: "   " })).status).toBe(400);
    expect((await post(app, {})).status).toBe(400);
    expect(p.calls).toBe(0);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AiProvider } from "../ai/provider.ts";
import { matchRouter, preFilter, SHORTLIST_CAP, type Fact } from "./match.ts";

const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * 86_400_000);
const MV = "vendor/m/match.v2";

function fakeDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>(Object.entries(seed).flatMap(([c, d]) => Object.entries(d).map(([id, v]) => [`${c}/${id}`, v])));
  let n = 0;
  const ref = (c: string, id: string) => ({ id, path: `${c}/${id}`, get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }) });
  const db = {
    collection: (c: string) => ({
      doc: (id = `auto${++n}`) => ref(c, id),
      where(f: string, _o: string, v: unknown, filters: [string, unknown][] = [[f, v]]) {
        return {
          where: (f2: string, o2: string, v2: unknown) => (this as any).where(f, o2, v, [...filters, [f2, v2]]),
          get: async () => ({
            docs: [...store].filter(([k, d]) => k.startsWith(c + "/") && filters.every(([ff, vv]) => d[ff] === vv)).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => d, ref: ref(c, k.slice(c.length + 1)) })),
          }),
        };
      },
    }),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        delete: (r: any) => ops.push(() => store.delete(r.path)),
        create: (r: any, d: any) => ops.push(() => store.set(r.path, d)),
        commit: async () => ops.forEach((o) => o()),
      };
    },
  } as unknown as Firestore;
  return { db, store };
}

const provider = (...outs: unknown[]): AiProvider & { calls: number; inputs: string[] } => {
  const p = { calls: 0, inputs: [] as string[], complete: async (r: any) => {
    p.inputs.push(r.messages[1].content);
    const o = outs[Math.min(p.calls++, outs.length - 1)];
    return { content: JSON.stringify(o), model: "m", usage: { inputTokens: 1, outputTokens: 1 } };
  } };
  return p;
};

const brief = { workMode: "Hybrid", travel: "None", budget: { min: 50000, max: 55000, currency: "ZAR" }, location: "Durban", mustHave: ["FI/CO configuration"], niceToHave: ["Group reporting"], seniority: "Consultant" };
const role = (o = {}) => ({ ownerUid: "u1", title: "FICO", briefText: "FICO consultant", interpretedBrief: brief, updatedAt: ago(5), ...o });
const cand = (o = {}) => ({ ownerUid: "u1", headline: "SAP FI/CO consultant", location: "Cape Town", topSkills: ["FI/CO"], lastOpenedAt: ago(30), ...o });
const att = (candidateId: string, o = {}) => ({ ownerUid: "u1", candidateId, type: "skill", value: "FI/CO on S/4", observedAt: ago(20), confirmedByRecruiter: true, ...o });
const sug = (candidateId: string, ids: string[], o = {}) => ({
  candidateId,
  reasonsFor: [{ text: "Has FI/CO", attributeIds: ids }],
  reasonsAgainst: [{ text: "Based in Cape Town", attributeIds: ids }],
  skillAlignment: [{ requirement: "FI/CO configuration", evidence: "Did it", kind: "stated", attributeIds: ids }, { requirement: "Group reporting", evidence: "Not seen", kind: "not-seen", attributeIds: [] }],
  questionsToAsk: ["Still looking?"],
  ...o,
});

function setup(p: AiProvider, seed: Record<string, any> = {}) {
  const base = {
    roles: { r1: role(), other: role({ ownerUid: "u2" }) },
    candidates: { c1: cand(), c2: cand({ lastOpenedAt: ago(400) }), cx: cand({ ownerUid: "u2" }) },
    attributes: { a1: att("c1"), a2: att("c2", { observedAt: ago(500) }), a2b: att("c2", { type: "salary", value: "R70k", observedAt: ago(450) }), a3: att("c1", { confirmedByRecruiter: false, value: "unconfirmed" }) },
    matches: {}, overrides: {},
  };
  const { db, store } = fakeDb({ ...base, ...seed });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = "u1"; next(); });
  app.use("/api", matchRouter({ ai: { provider: p, model: "vendor/m" }, db }));
  return { app, store };
}
const post = (app: any, b: any = { roleId: "r1" }) => request(app).post("/api/match").send(b);
const stored = (store: Map<string, any>) => [...store].filter(([k]) => k.startsWith("matches/")).map(([, v]) => v);

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("preFilter", () => {
  const facts = (m: Record<string, Fact[]>) => new Map(Object.entries(m));
  const f = (id: string, type: string, value: string, days = 10): Fact => ({ id, type, value, observedAt: ago(days) });

  it("keeps budget, location and old-evidence candidates; ranks them lower, never drops them", () => {
    const cands = [
      { id: "good", data: cand({ location: "Durban" }) },
      { id: "dear", data: cand({ location: "Cape Town" }) },
      { id: "old", data: cand({ location: "Durban" }) },
    ];
    const out = preFilter(role(), cands, facts({
      good: [f("g1", "skill", "FI/CO")],
      dear: [f("d1", "skill", "FI/CO"), f("d2", "salary", "R90k basic"), f("d3", "work-mode", "On-site only")],
      old: [f("o1", "skill", "FI/CO", 900)],
    }), new Set());
    expect(out.map((c) => c.id)).toEqual(["good", "old", "dear"]);
  });

  it("excludes only rejected candidates and those with no confirmed facts; caps the shortlist", () => {
    const cands = Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, data: cand() }));
    const all = facts(Object.fromEntries(cands.map((c) => [c.id, [f(`f${c.id}`, "skill", "FI/CO")]])));
    expect(preFilter(role(), cands, all, new Set(["c0"]))).toHaveLength(SHORTLIST_CAP);
    expect(preFilter(role(), cands.slice(0, 2), facts({ c0: [f("x", "skill", "FI/CO")] }), new Set(["c0"]))).toEqual([]);
  });
});

describe("POST /api/match", () => {
  it("happy path: validated docs, deterministic fields, no score", async () => {
    const p = provider({ suggestions: [sug("c2", ["a2", "a2b"]), sug("c1", ["a1"])] });
    const { app, store } = setup(p);
    const r = await post(app);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ cached: false, modelVersion: MV });
    const docs = stored(store);
    expect(docs).toHaveLength(2);
    const c2 = docs.find((d) => d.candidateId === "c2");
    expect(c2).toMatchObject({ rank: 1, forgotten: true, staleness: "stale", modelVersion: MV, ownerUid: "u1", roleId: "r1" });
    expect(c2.evidenceAgeDays).toBe(450); // newest cited fact, not the oldest
    expect(docs.find((d) => d.candidateId === "c1")).toMatchObject({ rank: 2, forgotten: false, staleness: "fresh" });
    expect(JSON.stringify(docs)).not.toMatch(/"score"/);
    expect(p.inputs[0]).not.toContain("unconfirmed"); // unconfirmed facts never reach the model
  });

  it("drops foreign candidates and uncited reasons; a missing against becomes a plain fallback, never a dropped person", async () => {
    const p = provider({ suggestions: [
      sug("cx", ["a1"]), // not in the shortlist (other owner)
      sug("c1", ["a1"], { reasonsFor: [{ text: "uncited", attributeIds: [] }, { text: "foreign id", attributeIds: ["a2"] }] }), // no valid for
      sug("c2", ["a2"], { reasonsAgainst: [{ text: "invented", attributeIds: ["zzz"] }] }), // no valid against
      sug("c1", ["a1"], { skillAlignment: [{ requirement: "FI/CO configuration", evidence: "x", kind: "stated", attributeIds: ["a2"] }, { requirement: "G", evidence: "x", kind: "not-seen", attributeIds: ["a1"] }] }),
    ] });
    const { app, store } = setup(p);
    const r = await post(app);
    expect(r.status).toBe(200);
    const docs = stored(store);
    expect(docs).toHaveLength(2);
    // stated row citing another candidate's fact is dropped; a not-seen row keeps its place with its ids cleared
    expect(docs[0]).toMatchObject({ candidateId: "c2", rank: 1 });
    expect(docs[0].reasonsAgainst).toEqual([{ text: expect.stringContaining("couldn't ground a reason against"), attributeIds: ["a2"] }]);
    expect(docs[1]).toMatchObject({ candidateId: "c1", rank: 2, skillAlignment: [{ requirement: "G", kind: "not-seen", attributeIds: [] }] });
  });

  it("strips attribute ids the model wrote into the text", async () => {
    const p = provider({ suggestions: [sug("c1", ["a1"], { reasonsFor: [{ text: "Has FI/CO on S/4 (a1).", attributeIds: ["a1"] }] })] });
    const { app, store } = setup(p);
    await post(app);
    expect(stored(store)[0].reasonsFor[0].text).toBe("Has FI/CO on S/4.");
  });

  it("drops demographic-looking reasons like interpret-note does", async () => {
    const p = provider({ suggestions: [
      sug("c1", ["a1"], { reasonsFor: [{ text: "Young woman, strong fit", attributeIds: ["a1"] }] }),
      sug("c2", ["a2"], { reasonsAgainst: [{ text: "Has three kids so may not travel", attributeIds: ["a2"] }, { text: "Cape Town based", attributeIds: ["a2"] }], questionsToAsk: ["Is she married?", "Still looking?"] }),
    ] });
    const { app, store } = setup(p);
    await post(app);
    const docs = stored(store);
    expect(docs.map((d) => d.candidateId)).toEqual(["c2"]);
    expect(docs[0].reasonsAgainst).toEqual([{ text: "Cape Town based", attributeIds: ["a2"] }]);
    expect(docs[0].questionsToAsk).toEqual(["Still looking?"]);
  });

  it("cache hit makes no provider call; force bypasses it; stale role invalidates it", async () => {
    const out = { suggestions: [sug("c1", ["a1"])] };
    const p = provider(out);
    const seed = { matches: { m1: { ownerUid: "u1", roleId: "r1", candidateId: "c1", modelVersion: MV, generatedAt: ago(1) } } };
    const { app } = setup(p, seed);
    const hit = await post(app);
    expect(hit.body).toEqual({ matchIds: ["m1"], modelVersion: MV, cached: true });
    expect(p.calls).toBe(0);
    expect((await post(app, { roleId: "r1", force: true })).body.cached).toBe(false);
    expect(p.calls).toBe(1);
    const edited = setup(provider(out), { roles: { r1: role({ updatedAt: ago(0) }) }, ...seed });
    expect((await post(edited.app)).body.cached).toBe(false);
  });

  it("a non-reversed reject override for this role excludes the candidate; a reversed one does not", async () => {
    const p = provider({ suggestions: [] });
    const { app } = setup(p, { overrides: { o1: { ownerUid: "u1", roleId: "r1", candidateId: "c1", decision: "reject" }, o2: { ownerUid: "u1", roleId: "r1", candidateId: "c2", decision: "reject", reversedAt: ago(1) } } });
    await post(app);
    expect(p.inputs[0]).not.toContain("## c1 |");
    expect(p.inputs[0]).toContain("## c2 |");
  });

  it("replaces earlier matches and 404s someone else's role", async () => {
    const p = provider({ suggestions: [sug("c1", ["a1"])] });
    const { app, store } = setup(p, { matches: { old: { ownerUid: "u1", roleId: "r1", modelVersion: "older", generatedAt: ago(9) } } });
    await post(app);
    expect(store.has("matches/old")).toBe(false);
    expect(stored(store)).toHaveLength(1);
    expect((await post(app, { roleId: "other" })).status).toBe(404);
    expect((await post(app, {})).status).toBe(400);
  });

  it("invalid model output after the repair retry: ai_failed and nothing stored", async () => {
    const p = provider({ nope: true });
    const { app, store } = setup(p, { matches: { old: { ownerUid: "u1", roleId: "r1", modelVersion: "older", generatedAt: ago(9) } } });
    const r = await post(app);
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("ai_failed");
    expect(p.calls).toBe(2);
    expect(store.has("matches/old")).toBe(true);
  });
});

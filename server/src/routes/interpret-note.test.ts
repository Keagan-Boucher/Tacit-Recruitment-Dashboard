/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AiProvider } from "../ai/provider.ts";
import { interpretNoteRouter, locateQuote } from "./interpret-note.ts";

const TEXT = "Where are you now?\nSAP  support lead at Lumen.\nWants R60k minimum, notice is one month.";

// Tiny in-memory Firestore: only what the route uses.
function fakeDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>(Object.entries(seed).flatMap(([c, d]) => Object.entries(d).map(([id, v]) => [`${c}/${id}`, v])));
  let n = 0;
  const ref = (c: string, id: string) => ({ id, path: `${c}/${id}`, get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }), update: async (u: any) => void store.set(`${c}/${id}`, { ...store.get(`${c}/${id}`), ...u }) });
  const db = {
    collection: (c: string) => ({
      doc: (id = `auto${++n}`) => ref(c, id),
      where(f: string, _o: string, v: unknown, filters: [string, unknown][] = [[f, v]]) {
        return {
          where: (f2: string, o2: string, v2: unknown) => (this as any).where(f, o2, v, [...filters, [f2, v2]]),
          get: async () => ({ docs: [...store].filter(([k, d]) => k.startsWith(c + "/") && filters.every(([ff, vv]) => d[ff] === vv)).map(([k]) => ({ ref: ref(c, k.slice(c.length + 1)) })) }),
        };
      },
    }),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        delete: (r: any) => ops.push(() => store.delete(r.path)),
        create: (r: any, d: any) => ops.push(() => store.set(r.path, d)),
        update: (r: any, u: any) => ops.push(() => store.set(r.path, { ...store.get(r.path), ...u })),
        commit: async () => ops.forEach((o) => o()),
      };
    },
  } as unknown as Firestore;
  return { db, store };
}

const attr = (quote: string, o = {}) => ({ type: "salary", value: "R60k", quote, confidence: 0.9, note: null, ...o });
const provider = (...outs: unknown[]): AiProvider & { calls: number } => {
  const p = { calls: 0, complete: async () => {
    const o = outs[p.calls++];
    if (o instanceof Error) throw o;
    return { content: JSON.stringify(o), model: "m", usage: { inputTokens: 1, outputTokens: 1 } };
  } };
  return p;
};
const note = (o = {}) => ({ ownerUid: "u1", candidateId: "c1", rawText: TEXT, capturedAt: new Date("2026-01-02"), interpretStatus: "pending", ...o });

function setup(p: AiProvider, seed: Record<string, any> = {}, fail = false) {
  const { db, store } = fakeDb({ interviewNotes: { n1: note() }, candidates: { c1: { ownerUid: "u1" } }, attributes: {}, ...seed });
  if (fail) (db as any).batch = () => ({ delete() {}, create() {}, update() {}, commit: async () => { throw new Error("firestore down"); } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = "u1"; next(); });
  app.use("/api", interpretNoteRouter({ ai: { provider: p, model: "vendor/m" }, db }));
  return { app, store };
}

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("locateQuote", () => {
  it("exact", () => expect(locateQuote(TEXT, "Lumen")).toEqual({ start: TEXT.indexOf("Lumen"), end: TEXT.indexOf("Lumen") + 5 }));
  it("case and whitespace insensitive, mapped to original indices", () => {
    const s = locateQuote(TEXT, "sap support LEAD")!;
    expect(TEXT.slice(s.start, s.end)).toBe("SAP  support lead");
  });
  it("not found / blank", () => {
    expect(locateQuote(TEXT, "Java")).toBeNull();
    expect(locateQuote(TEXT, "  ")).toBeNull();
  });
});

describe("POST /api/interpret-note", () => {
  it("happy path: validated unconfirmed attributes, spans, note ok", async () => {
    const p = provider({ attributes: [attr("Wants R60k minimum", { note: "Basic or CTC?", confidence: 0.6 }), attr("wants r60k MINIMUM"), attr("not in the note")] });
    const { app, store } = setup(p);
    const r = await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(r.status).toBe(200);
    expect(r.body.attributeIds).toHaveLength(1); // duplicate span and missing quote dropped
    const a = store.get(`attributes/${r.body.attributeIds[0]}`);
    expect(TEXT.slice(a.sourceSpan.start, a.sourceSpan.end)).toBe("Wants R60k minimum");
    expect(a).toMatchObject({ ownerUid: "u1", candidateId: "c1", sourceType: "note", noteId: "n1", confirmedByRecruiter: false, confidenceNote: "Basic or CTC?", modelVersion: "vendor/m/interpret-note.v1" });
    expect(a.observedAt).toEqual(new Date("2026-01-02"));
    expect(store.get("interviewNotes/n1")).toMatchObject({ interpretStatus: "ok", rawText: TEXT });
  });

  it("drops demographic attributes server-side, even if the model returns them", async () => {
    const t = ["Where are you now?", "Muslim, so needs a prayer room.", "Lead at Lumen, three kids.", "R60k minimum."].join("\n");
    const p = provider({ attributes: [attr("Muslim, so needs a prayer room", { type: "constraint", value: "Needs prayer room" }), attr("three kids", { type: "constraint", value: "Wants time" }), attr("R60k minimum")] });
    const { app, store } = setup(p, { interviewNotes: { n1: note({ rawText: t }) } });
    const r = await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(r.body.attributeIds).toHaveLength(1);
    expect(store.get(`attributes/${r.body.attributeIds[0]}`).value).toBe("R60k");
  });

  it("all quotes missing: repairs once, then ai_failed and note failed with rawText intact", async () => {
    const bad = { attributes: [attr("nope")] };
    const p = provider(bad, bad);
    const { app, store } = setup(p);
    const r = await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(p.calls).toBe(2);
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("ai_failed");
    expect(store.get("interviewNotes/n1")).toMatchObject({ interpretStatus: "failed", rawText: TEXT });
    expect([...store.keys()].some((k) => k.startsWith("attributes/"))).toBe(false);
  });

  it("transport failure: ai_failed, note failed", async () => {
    const { app, store } = setup(provider(new Error("down"), new Error("down")));
    expect((await request(app).post("/api/interpret-note").send({ noteId: "n1" })).status).toBe(502);
    expect(store.get("interviewNotes/n1").interpretStatus).toBe("failed");
  });

  it("empty attributes is valid", async () => {
    const { app, store } = setup(provider({ attributes: [] }));
    const r = await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(r.body.attributeIds).toEqual([]);
    expect(store.get("interviewNotes/n1").interpretStatus).toBe("ok");
  });

  it("other owner's note is 404; bad body 400; blank text 400", async () => {
    const { app } = setup(provider(), { interviewNotes: { n1: note({ ownerUid: "other" }), n2: note({ rawText: "  " }) } });
    expect((await request(app).post("/api/interpret-note").send({ noteId: "n1" })).status).toBe(404);
    expect((await request(app).post("/api/interpret-note").send({ noteId: "zzz" })).status).toBe(404);
    expect((await request(app).post("/api/interpret-note").send({})).status).toBe(400);
    expect((await request(app).post("/api/interpret-note").send({ noteId: "n2" })).status).toBe(400);
  });

  it("re-interpretation deletes only this note's unconfirmed attributes", async () => {
    const base = { ownerUid: "u1", noteId: "n1" };
    const { app, store } = setup(provider({ attributes: [attr("Lumen", { type: "skill" })] }), {
      attributes: { old: { ...base, confirmedByRecruiter: false }, kept: { ...base, confirmedByRecruiter: true }, other: { ownerUid: "u1", noteId: "n9", confirmedByRecruiter: false } },
    });
    await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(store.has("attributes/old")).toBe(false);
    expect(store.has("attributes/kept")).toBe(true);
    expect(store.has("attributes/other")).toBe(true);
  });

  it("refuses before calling the model: other owner's candidate, missing capture time, over-long note", async () => {
    const p = provider();
    const { app } = setup(p, {
      candidates: { c1: { ownerUid: "u1" }, c2: { ownerUid: "other" } },
      interviewNotes: { n1: note({ candidateId: "c2" }), n2: note({ capturedAt: undefined }), n3: note({ rawText: "x".repeat(40_001) }) },
    });
    for (const noteId of ["n1", "n2", "n3"]) expect((await request(app).post("/api/interpret-note").send({ noteId })).status).toBe(400);
    expect(p.calls).toBe(0);
  });

  it("a failure after the model answered marks the note failed and returns a coded 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, store } = setup(provider({ attributes: [attr("Wants R60k minimum")] }), {}, true);
    const r = await request(app).post("/api/interpret-note").send({ noteId: "n1" });
    expect(r.status).toBe(500);
    expect(r.body.code).toBe("internal");
    expect(store.get("interviewNotes/n1")).toMatchObject({ interpretStatus: "failed", rawText: TEXT });
  });
});

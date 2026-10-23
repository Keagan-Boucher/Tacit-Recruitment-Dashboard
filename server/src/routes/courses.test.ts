/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { CourseSuggestion } from "@tacit/shared";
import { toStrictSchema } from "../ai/index.ts";
import type { AiProvider } from "../ai/provider.ts";
import { CourseDraft, courseRouter } from "./courses.ts";

const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
const MV = "vendor/m/course-suggest.v1";

function fakeDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>(Object.entries(seed).flatMap(([c, d]) => Object.entries(d).map(([id, v]) => [`${c}/${id}`, v])));
  const ref = (c: string, id: string) => ({
    id, path: `${c}/${id}`,
    get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }),
    set: async (d: any) => void store.set(`${c}/${id}`, d),
    update: async (d: any) => void store.set(`${c}/${id}`, { ...store.get(`${c}/${id}`), ...d }),
  });
  const db = {
    collection: (c: string) => ({
      doc: (id: string) => ref(c, id),
      where(f: string, _o: string, v: unknown, filters: [string, unknown][] = [[f, v]]) {
        return {
          where: (f2: string, o2: string, v2: unknown) => (this as any).where(f, o2, v, [...filters, [f2, v2]]),
          get: async () => ({ docs: [...store].filter(([k, d]) => k.startsWith(c + "/") && filters.every(([ff, vv]) => d[ff] === vv)).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => d })) }),
        };
      },
    }),
  } as unknown as Firestore;
  return { db, store };
}

const provider = (...outs: unknown[]): AiProvider & { calls: number; inputs: string[] } => {
  const p = { calls: 0, inputs: [] as string[], complete: async (r: any) => {
    p.inputs.push(r.messages[1].content);
    return { content: JSON.stringify(outs[Math.min(p.calls++, outs.length - 1)]), model: "m", usage: { inputTokens: 1, outputTokens: 1 } };
  } };
  return p;
};

const brief = (mustHave: string[], niceToHave: string[] = []) => ({ workMode: "Hybrid", travel: "None", budget: { min: 1, max: 2, currency: "ZAR" }, location: "Durban", mustHave, niceToHave, seniority: "Consultant" });
const item = (o = {}) => ({ title: "SAP Fiori development", why: "Asked for in 2 of the 2 roles you came close to", duration: "3 days", ...o });
const draftOut = (...items: unknown[]) => ({ items });

function setup(p: AiProvider, seed: Record<string, Record<string, any>> = {}, cand: Record<string, any> = {}) {
  const { db, store } = fakeDb({
    candidates: { c1: { ownerUid: "u1", headline: "ABAP developer", topSkills: ["ABAP"], fullName: "Secret Name", inPoolSince: ago(300), ...cand }, cx: { ownerUid: "u2", headline: "x", inPoolSince: ago(300) } },
    attributes: { a1: { ownerUid: "u1", candidateId: "c1", type: "skill", value: "ABAP reports", observedAt: ago(30), confirmedByRecruiter: true }, a2: { ownerUid: "u1", candidateId: "c1", type: "skill", value: "unconfirmedfact", observedAt: ago(30), confirmedByRecruiter: false } },
    companies: { co1: { ownerUid: "u1", name: "Voltmark" } },
    roles: { r1: { ownerUid: "u1", companyId: "co1", title: "Voltmark Fiori dev", interpretedBrief: brief(["Fiori", "ABAP"]) }, r2: { ownerUid: "u1", companyId: "co1", title: "x", interpretedBrief: brief(["fiori"], ["CDS views"]) } },
    matches: { m1: { ownerUid: "u1", candidateId: "c1", roleId: "r1" } },
    overrides: { o1: { ownerUid: "u1", candidateId: "c1", roleId: "r2", decision: "shortlist" } },
    placements: {}, courseSuggestions: {},
    ...seed,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = "u1"; next(); });
  app.use("/api", courseRouter({ ai: { provider: p, model: "vendor/m" }, db }));
  return { app, store };
}
const post = (app: any, b: any = { action: "draft" }, id = "c1") => request(app).post(`/api/courses/${id}`).send(b);

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("POST /api/courses/:candidateId draft", () => {
  it("writes a valid draft; the prompt has computed counts and no company, role id or candidate name", async () => {
    const p = provider(draftOut(item()));
    const { app, store } = setup(p);
    const r = await post(app);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "draft", items: [item()] });
    const doc = CourseSuggestion.parse(store.get("courseSuggestions/c1"));
    expect(doc).toMatchObject({ ownerUid: "u1", status: "draft", modelVersion: MV });
    expect(doc.basis.roleIds.sort()).toEqual(["r1", "r2"]);
    const input = p.inputs[0]!;
    expect(input).toContain("fiori | 2 of 2");
    expect(input).toContain("abap | 1 of 2");
    expect(input).toContain("skill | ABAP reports");
    for (const bad of ["Voltmark", "co1", "r1", "r2", "Secret", "unconfirmedfact"]) expect(input).not.toContain(bad);
  });

  it("drops items naming a company, with demographics, or with invented numbers; fails visibly when none survive", async () => {
    const p = provider(draftOut(item({ title: "Voltmark onboarding" }), item({ why: "Young woman needs this" }), item({ title: "CDS views" })));
    const { app, store } = setup(p);
    const r = await post(app);
    expect(r.body.items.map((i: any) => i.title)).toEqual(["CDS views"]);
    expect(store.get("courseSuggestions/c1").items).toHaveLength(1);

    const bad = provider(draftOut(item({ title: "Voltmark course" }), item({ why: "Asked for in 9 of the 2 roles" })));
    const s2 = setup(bad);
    const r2 = await post(s2.app);
    expect(r2.status).toBe(502);
    expect(bad.calls).toBe(2);
    expect(s2.store.get("courseSuggestions/c1")).toBeUndefined();
  });

  it("eligibility: 8 months is 409, placed since joining is 409, an older placement is fine, 9+ months is ok", async () => {
    const p = provider(draftOut(item()));
    expect((await post(setup(p, {}, { inPoolSince: ago(240) }).app)).status).toBe(409);
    expect((await post(setup(p, {}, { inPoolSince: undefined }).app)).status).toBe(409);
    const placed = (days: number) => ({ placements: { p1: { ownerUid: "u1", candidateId: "c1", outcome: "placed", date: ago(days) } } });
    expect((await post(setup(p, placed(100)).app)).status).toBe(409);
    expect((await post(setup(p, placed(400)).app)).status).toBe(200);
    expect(p.calls).toBe(1);
    expect((await post(setup(p, {}, { inPoolSince: ago(280) }).app)).status).toBe(200);
  });

  it("owner check: unknown or someone else's candidate is 404; bad body is 400", async () => {
    const p = provider(draftOut(item()));
    const { app } = setup(p);
    expect((await post(app, { action: "draft" }, "cx")).status).toBe(404);
    expect((await post(app, { action: "draft" }, "nope")).status).toBe(404);
    expect((await post(app, { action: "approve", items: [] })).status).toBe(400);
    expect(p.calls).toBe(0);
  });

  it("never overwrites an approved, snoozed or dismissed doc; redrafting a draft is fine", async () => {
    for (const status of ["approved", "snoozed", "dismissed"]) {
      const p = provider(draftOut(item()));
      const { app, store } = setup(p, { courseSuggestions: { c1: { status, items: [item()] } } });
      expect((await post(app)).status).toBe(409);
      expect(store.get("courseSuggestions/c1").status).toBe(status);
      expect(p.calls).toBe(0);
    }
    const created = ago(5);
    const { app, store } = setup(provider(draftOut(item())), { courseSuggestions: { c1: { status: "draft", items: [item()], createdAt: created } } });
    expect((await post(app)).status).toBe(200);
    expect(store.get("courseSuggestions/c1").createdAt).toEqual(created);
  });

  it("no briefs came close is 409 without calling the model", async () => {
    const p = provider(draftOut(item()));
    expect((await post(setup(p, { matches: {}, overrides: {} }).app)).status).toBe(409);
    expect(p.calls).toBe(0);
  });
});

describe("POST /api/courses/:candidateId approve", () => {
  const edited = [item({ title: "Fiori basics", duration: "1 day" })];
  it("needs a draft, then stores the recruiter's edited items", async () => {
    const none = setup(provider());
    expect((await post(none.app, { action: "approve", items: edited })).status).toBe(409);

    const { app, store } = setup(provider(), { courseSuggestions: { c1: { ownerUid: "u1", status: "draft", items: [item()] } } });
    const r = await post(app, { action: "approve", items: edited });
    expect(r.body).toEqual({ status: "approved", items: edited });
    expect(store.get("courseSuggestions/c1")).toMatchObject({ status: "approved", items: edited, approvedBy: "u1" });
    expect(store.get("courseSuggestions/c1").approvedAt).toBeInstanceOf(Date);
    expect((await post(app, { action: "approve", items: edited })).status).toBe(409); // no longer a draft
  });

  it("rejects edited text that names a company, and ineligible candidates", async () => {
    const seed = { courseSuggestions: { c1: { ownerUid: "u1", status: "draft", items: [item()] } } };
    expect((await post(setup(provider(), seed).app, { action: "approve", items: [item({ why: "Voltmark wants it" })] })).status).toBe(400);
    expect((await post(setup(provider(), seed, { inPoolSince: ago(100) }).app, { action: "approve", items: edited })).status).toBe(409);
  });
});

describe("CourseDraft schema", () => {
  it("is Groq-strict: every object fully required, no additional properties", () => {
    const js = JSON.stringify(toStrictSchema(CourseDraft));
    expect(js).toContain('"additionalProperties":false');
    expect(js).toContain('"required":["title","why","duration"]');
    expect(js).not.toMatch(/"(minLength|maxLength|maxItems|\$schema)"/);
  });
});

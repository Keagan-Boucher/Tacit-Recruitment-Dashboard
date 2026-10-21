import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider } from "../ai/provider.ts";
import type { BucketLike } from "../files.ts";
import { checkQuotes, parseRouter } from "./parse.ts";

const field = (value: string | null) => ({ value, readAs: value, confidence: 0.9, note: null });
const CV = {
  fullName: field("Thandi Nkosi"), headline: field("SAP FICO Consultant"), location: field("Durban"),
  currentRole: field(null), salaryExpectation: field(null), history: [], education: [], skills: ["SAP FICO"], parseConfidence: 0.9,
};
const BRIEF = {
  title: "SAP FICO Consultant", companyName: "Vantage", workMode: "Hybrid", travel: null,
  budget: { min: 52000, max: 55000, currency: "ZAR" }, location: "Durban", mustHave: ["FI/CO"], niceToHave: [], seniority: null, unclear: [],
  quotes: { workMode: "hybrid", travel: "", budget: "R52k-R55k", location: "", seniority: "", mustHave: ["FI/CO"], niceToHave: [] },
};

const provider = (...outs: unknown[]): AiProvider => {
  let n = 0;
  return {
    complete: async () => {
      const o = outs[n++];
      if (o instanceof Error) throw o;
      return { content: JSON.stringify(o), model: "m", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
};
const bucket: BucketLike = {
  file: () => ({ getMetadata: async () => [{ size: 5 }], download: async () => [Buffer.from("SAP FICO, Durban")] }),
};
const setup = (p: AiProvider | null) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = "u1"; next(); });
  app.use("/api", parseRouter({ ai: { provider: p, model: "v/m" }, bucket }));
  return app;
};

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("POST /api/parse-cv", () => {
  it("happy path", async () => {
    const r = await request(setup(provider(CV))).post("/api/parse-cv").send({ fileRef: "users/u1/cvs/a.txt" });
    expect(r.status).toBe(200);
    expect(r.body.result.fullName.value).toBe("Thandi Nkosi");
    expect(r.body.modelVersion).toBe("v/m/parse-cv.v2");
  });
  it("bad body 400, other uid 400, ai failure 502, unconfigured 503", async () => {
    const app = setup(provider({ nope: 1 }, { nope: 1 }));
    expect((await request(app).post("/api/parse-cv").send({})).body.code).toBe("bad_request");
    const other = await request(app).post("/api/parse-cv").send({ fileRef: "users/u2/cvs/a.txt" });
    expect([other.status, other.body.code]).toEqual([400, "bad_request"]);
    const f = await request(app).post("/api/parse-cv").send({ fileRef: "users/u1/cvs/a.txt" });
    expect([f.status, f.body.code]).toEqual([502, "ai_failed"]);
    const u = await request(setup(null)).post("/api/parse-cv").send({ fileRef: "users/u1/cvs/a.txt" });
    expect([u.status, u.body.code]).toEqual([503, "ai_unconfigured"]);
  });
});

describe("POST /api/parse-brief", () => {
  it("text and fileRef both work", async () => {
    const a = await request(setup(provider(BRIEF))).post("/api/parse-brief").send({ source: "paste", text: "Hybrid, R52k-R55k", fileRef: null });
    expect(a.status).toBe(200);
    expect(a.body.result.budget.max).toBe(55000);
    const b = await request(setup(provider(BRIEF))).post("/api/parse-brief").send({ source: "upload", text: null, fileRef: "users/u1/briefs/a.txt" });
    expect(b.status).toBe(200);
  });
  it("keeps real quotes (case/whitespace-insensitive), blanks invented ones, aligns list items", async () => {
    const out = {
      ...BRIEF,
      mustHave: ["FI/CO", "S/4HANA", "SQL"],
      quotes: { ...BRIEF.quotes, workMode: "HYBRID,  R52k", travel: "lots of travel", mustHave: ["fi/co", "invented skill"] },
    };
    const r = await request(setup(provider(out))).post("/api/parse-brief").send({ source: "paste", text: "Hybrid, R52k-R55k. FI/CO needed", fileRef: null });
    expect(r.status).toBe(200);
    expect(r.body.modelVersion).toBe("v/m/parse-brief.v2");
    // kept quotes come back as the brief wrote them
    expect(r.body.result.quotes).toEqual({ workMode: "Hybrid, R52k", travel: "", budget: "R52k-R55k", location: "", seniority: "", mustHave: ["FI/CO", "", ""], niceToHave: [] });
  });
  it("blanks a demographic quote", () => {
    const text = "Must be a young male candidate, hybrid";
    const d = { ...BRIEF, quotes: { ...BRIEF.quotes, workMode: "hybrid", seniority: "young male candidate" } };
    expect(checkQuotes(text)(d).quotes).toMatchObject({ workMode: "hybrid", seniority: "" });
  });
  it("rejects both or neither", async () => {
    const app = setup(provider(BRIEF));
    const bodies = [
      { source: "paste", text: "x", fileRef: "users/u1/briefs/a.txt" },
      { source: "paste", text: null, fileRef: null },
      { source: "paste", text: "", fileRef: null },
    ];
    for (const body of bodies) {
      const r = await request(app).post("/api/parse-brief").send(body);
      expect([r.status, r.body.code]).toEqual([400, "bad_request"]);
    }
  });
  it("a CV path is not a brief path", async () => {
    const r = await request(setup(provider(BRIEF))).post("/api/parse-brief").send({ source: "upload", text: null, fileRef: "users/u1/cvs/a.txt" });
    expect(r.status).toBe(400);
  });
});

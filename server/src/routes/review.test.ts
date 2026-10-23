/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { Attribute, Candidate, Role, type Claims } from "@tacit/shared";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { draftAnon } from "./review.ts";

const R = "rec1";
const get = (o: any, path: string) => path.split(".").reduce((a, k) => a?.[k], o);

function fakeDb(seed: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(seed));
  let n = 0;
  const put = (path: string, d: any, o?: any) => void store.set(path, o?.merge ? { ...store.get(path), ...d } : d);
  const ref = (c: string, id: string) => ({
    id, path: `${c}/${id}`,
    get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }),
    set: async (d: any, o?: any) => put(`${c}/${id}`, d, o),
  });
  const query = (c: string, filters: [string, unknown][]): any => ({
    where: (f: string, _o: string, v: unknown) => query(c, [...filters, [f, v]]),
    get: async () => ({ docs: [...store].filter(([k, d]) => k.startsWith(c + "/") && filters.every(([f, v]) => get(d, f) === v)).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => d, ref: ref(c, k.slice(c.length + 1)) })) }),
  });
  const db = {
    collection: (c: string) => ({ doc: (id = `auto${++n}`) => ref(c, id), where: (f: string, _o: string, v: unknown) => query(c, [[f, v]]) }),
    runTransaction: async (fn: any) => fn({ get: (r: any) => r.get(), set: (r: any, d: any, o?: any) => put(r.path, d, o) }),
  } as unknown as Firestore;
  return { db, store };
}

const TOKENS: Record<string, { uid: string; email?: string; claims: Claims }> = {
  rec: { uid: R, claims: { role: "recruiter" } },
  cand: { uid: "c1", claims: { role: "candidate" } },
  comp: { uid: "k1", claims: { role: "company", companyId: "co1" } },
};
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

const CV_FIELDS = { fullName: "Thandi Nkosi", headline: "SAP FICO", location: "Durban", currentRole: "Lead", history: [], education: [], skills: ["SAP", "FICO"], salaryExpectation: "R60k" };
const BRIEF_FIELDS = { title: "Voltmark SAP FICO", workMode: "Hybrid", travel: "", budget: { min: 52000, max: 55000, currency: "ZAR" }, location: "Durban", mustHave: ["FI/CO"], niceToHave: [], seniority: "Senior", unclear: [] };
const sub = (o: any) => ({ ownerUid: R, status: "pending", submittedBy: "c1", readStatus: "clear", kind: "cv", fields: CV_FIELDS, fileRef: "users/c1/cvs/cv.pdf", parseConfidence: 0.9, ...o });

function setup(seed: Record<string, any> = {}, live: Record<string, any> = {}) {
  const { db, store } = fakeDb({ "portalUsers/c1": { role: "candidate", email: "t@x.co" }, ...seed });
  const claimsSet: [string, object][] = [];
  const auth = { setCustomUserClaims: async (u: string, c: object) => void claimsSet.push([u, c]), getUser: async (u: string) => ({ customClaims: live[u] }) };
  const app = createApp(loadConfig({ ALLOWED_ORIGIN: "http://a.test", RECRUITER_UID: R }), async (t) => {
    if (!TOKENS[t]) throw new Error("bad");
    return TOKENS[t]!;
  }, { db, auth });
  return { app, store, claimsSet };
}
const review = (app: any, id: string, body: any, tok = "rec") => request(app).post(`/api/review/${id}`).set(as(tok)).send(body);

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("review gates and reasons", () => {
  it("portal tokens are 403", async () => {
    const { app } = setup({ "submissions/s1": sub({}) });
    expect((await review(app, "s1", { action: "pass" }, "cand")).status).toBe(403);
    expect((await review(app, "s1", { action: "pass" }, "comp")).status).toBe(403);
  });
  it("not-accepted needs both reason fields (400)", async () => {
    const { app, store } = setup({ "submissions/s1": sub({}) });
    expect((await review(app, "s1", { action: "not-accepted" })).status).toBe(400);
    expect((await review(app, "s1", { action: "not-accepted", reasonCode: "other", reasonText: " " })).status).toBe(400);
    expect(store.get("submissions/s1").status).toBe("pending");
  });
  it("not-accepted stores the words verbatim", async () => {
    const { app, store } = setup({ "submissions/s1": sub({}) });
    const r = await review(app, "s1", { action: "not-accepted", reasonCode: "unreadable", reasonText: "Please resend as PDF" });
    expect(r.body).toEqual({ status: "not-accepted" });
    expect(store.get("submissions/s1")).toMatchObject({ status: "not-accepted", reasonCode: "unreadable", reasonText: "Please resend as PDF", reviewedBy: R });
  });
  it("another recruiter's submission is 404", async () => {
    const { app } = setup({ "submissions/s1": sub({ ownerUid: "other" }) });
    expect((await review(app, "s1", { action: "pass" })).status).toBe(404);
  });
});

describe("pass cv", () => {
  it("creates a Candidate, adds the claim and portalUsers.candidateId", async () => {
    const { app, store, claimsSet } = setup({ "submissions/s1": sub({}) });
    const r = await review(app, "s1", { action: "pass" });
    expect(r.status).toBe(200);
    const id = r.body.resultId;
    const c = store.get(`candidates/${id}`);
    expect(Candidate.safeParse(c).success).toBe(true);
    expect(c).toMatchObject({ portalUid: "c1", sourceSubmissionId: "s1", cvFileRef: "users/c1/cvs/cv.pdf", parseStatus: "ok", topSkills: ["SAP", "FICO"] });
    expect(c.inPoolSince).toBeInstanceOf(Date);
    expect(claimsSet).toEqual([["c1", { role: "candidate", candidateId: id }]]);
    expect(store.get("portalUsers/c1").candidateId).toBe(id);
    expect(store.get("submissions/s1")).toMatchObject({ status: "accepted", resultId: id, reviewedBy: R });
  });
  it("links the possible duplicate instead", async () => {
    const { app, store } = setup({
      "submissions/s1": sub({ possibleDuplicateOf: "cand7" }),
      "candidates/cand7": { ownerUid: R, fullName: "Thandi Nkosi", cvFileRef: "users/rec/old.pdf" },
    });
    const r = await review(app, "s1", { action: "pass" });
    expect(r.body.resultId).toBe("cand7");
    expect(store.get("candidates/cand7")).toMatchObject({ portalUid: "c1", sourceSubmissionId: "s1", cvFileRef: "users/rec/old.pdf" });
    expect(store.get("candidates/cand7").inPoolSince).toBeInstanceOf(Date);
    expect([...store.keys()].filter((k) => k.startsWith("candidates/"))).toEqual(["candidates/cand7"]);
  });
  it("linking keeps the duplicate's existing topSkills", async () => {
    const { app, store } = setup({
      "submissions/s1": sub({ possibleDuplicateOf: "cand7" }),
      "candidates/cand7": { ownerUid: R, fullName: "T", topSkills: ["Excel"] },
    });
    await review(app, "s1", { action: "pass" });
    expect(store.get("candidates/cand7").topSkills).toEqual(["Excel"]);
  });
  it("won't relink a candidate that has a different portal account (409)", async () => {
    const { app, store } = setup({
      "submissions/s1": sub({ possibleDuplicateOf: "cand7" }),
      "candidates/cand7": { ownerUid: R, fullName: "T", portalUid: "someone-else" },
    });
    expect((await review(app, "s1", { action: "pass" })).status).toBe(409);
    expect(store.get("submissions/s1").status).toBe("pending");
  });
  it("is idempotent and 409 for the opposite action", async () => {
    const { app, store } = setup({ "submissions/s1": sub({}) });
    const a = await review(app, "s1", { action: "pass" });
    const b = await review(app, "s1", { action: "pass" });
    expect(b.body).toEqual(a.body);
    expect([...store.keys()].filter((k) => k.startsWith("candidates/"))).toHaveLength(1);
    expect((await review(app, "s1", { action: "not-accepted", reasonCode: "other", reasonText: "x" })).status).toBe(409);
  });
});

describe("pass brief", () => {
  it("creates an open portal role whose anon has no company name", async () => {
    const { app, store } = setup({
      "companies/co1": { ownerUid: R, name: "Voltmark", sector: "Energy" },
      "submissions/s2": sub({ kind: "brief", submittedBy: "k1", companyId: "co1", fields: BRIEF_FIELDS, text: "Voltmark needs FICO", fileRef: undefined }),
    });
    const r = await review(app, "s2", { action: "pass" });
    const role = store.get(`roles/${r.body.resultId}`);
    expect(Role.safeParse(role).success).toBe(true);
    expect(role).toMatchObject({ companyId: "co1", status: "open", briefSource: "portal", briefText: "Voltmark needs FICO", sourceSubmissionId: "s2" });
    expect(role.anon).toEqual({ title: "SAP FICO", sector: "Energy", region: "Durban", seniority: "Senior", salaryBand: "ZAR 52000–55000" });
    expect(JSON.stringify(role.anon)).not.toMatch(/voltmark/i);
  });
  it("scrubs the name's distinctive words, not suffixes or partial words", () => {
    const a = draftAnon({ title: "Voltmark FICO Lead", interpretedBrief: { location: "Voltmark campus", seniority: "Table lead" } }, { name: "Voltmark Energy (Pty) Ltd", sector: "Energy" });
    expect(JSON.stringify(a)).not.toMatch(/voltmark/i);
    expect(a).toMatchObject({ title: "FICO Lead", sector: "Energy", seniority: "Table lead" });
    expect(draftAnon({ title: "Table lead" }, { name: "AB Ltd" }).title).toBe("Table lead");
  });
  it("refuses a brief with no company doc (409) or no companyId (400)", async () => {
    const { app, store } = setup({
      "submissions/s2": sub({ kind: "brief", submittedBy: "k1", companyId: "gone", fields: BRIEF_FIELDS, text: "x", fileRef: undefined }),
      "submissions/s4": sub({ kind: "brief", submittedBy: "k1", fields: BRIEF_FIELDS, text: "x", fileRef: undefined }),
    });
    expect((await review(app, "s2", { action: "pass" })).status).toBe(409);
    expect((await review(app, "s4", { action: "pass" })).status).toBe(400);
    expect([...store.keys()].some((k) => k.startsWith("roles/"))).toBe(false);
  });
  it("draftAnon strips the name everywhere", () => {
    const a = draftAnon({ title: "ACME Ltd Lead", interpretedBrief: { location: "acme ltd campus, Pretoria" } }, { name: "Acme Ltd", sector: "Acme Ltd logistics" });
    expect(JSON.stringify(a)).not.toMatch(/acme/i);
  });
});

describe("pass details-change", () => {
  it("writes valid candidate-sourced attributes", async () => {
    const { app, store } = setup({
      "submissions/s3": sub({ kind: "details-change", candidateId: "cand9", fields: { salary: "R70k", workMode: "remote" }, fileRef: undefined }),
    });
    const r = await review(app, "s3", { action: "pass" });
    expect(r.body.resultId).toBe("cand9");
    const attrs = [...store].filter(([k]) => k.startsWith("attributes/")).map(([, v]) => v);
    expect(attrs.map((a) => [a.type, a.value]).sort()).toEqual([["salary", "R70k"], ["work-mode", "remote"]]);
    for (const a of attrs) {
      expect(Attribute.safeParse(a).success).toBe(true);
      expect(a).toMatchObject({ sourceType: "candidate", submissionId: "s3", candidateId: "cand9", confidence: 1, confirmedByRecruiter: true, modelVersion: "candidate", sourceSpan: { start: 0, end: a.value.length } });
    }
  });
});

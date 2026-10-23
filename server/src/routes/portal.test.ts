/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { Submission, type Claims } from "@tacit/shared";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";
import { normaliseName } from "./portal.ts";

const R = "rec1";
const get = (o: any, path: string) => path.split(".").reduce((a, k) => a?.[k], o);

function fakeDb(seed: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(seed));
  let n = 0;
  const ref = (c: string, id: string) => ({
    id, path: `${c}/${id}`,
    get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }),
    set: async (d: any) => void store.set(`${c}/${id}`, d),
  });
  const query = (c: string, filters: [string, unknown][]): any => ({
    where: (f: string, _o: string, v: unknown) => query(c, [...filters, [f, v]]),
    get: async () => ({ docs: [...store].filter(([k, d]) => k.startsWith(c + "/") && filters.every(([f, v]) => get(d, f) === v)).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => d })) }),
  });
  const db = {
    collection: (c: string) => ({ doc: (id = `auto${++n}`) => ref(c, id), where: (f: string, _o: string, v: unknown) => query(c, [[f, v]]) }),
    runTransaction: async (fn: any) => fn({
      get: (r: any) => r.get(),
      update: (r: any, u: any) => store.set(r.path, { ...store.get(r.path), ...u }),
      set: (r: any, d: any) => store.set(r.path, d),
    }),
  } as unknown as Firestore;
  return { db, store };
}

type Tok = { uid: string; email?: string; claims: Claims };
const TOKENS: Record<string, Tok> = {
  rec: { uid: R, email: "r@x.co", claims: { role: "recruiter" } },
  cand: { uid: "c1", email: "lerato@x.co", claims: { role: "candidate" } },
  pooled: { uid: "c2", email: "p@x.co", claims: { role: "candidate", candidateId: "cand9" } },
  comp: { uid: "k1", email: "megan@v.co", claims: { role: "company", companyId: "co1" } },
  fresh: { uid: "f1", email: "megan@v.co", claims: {} },
  noemail: { uid: "f2", claims: {} },
};

function setup(seed: Record<string, any> = {}, allowedUids = "") {
  const { db, store } = fakeDb(seed);
  const claimsSet: [string, object][] = [];
  const auth = { setCustomUserClaims: async (u: string, c: object) => void claimsSet.push([u, c]) };
  const config = loadConfig({ ALLOWED_ORIGIN: "http://a.test", RECRUITER_UID: R, ALLOWED_UIDS: allowedUids });
  const app = createApp(config, async (t) => {
    const v = TOKENS[t];
    if (!v) throw new Error("bad");
    return v;
  }, { db, auth, bucket: { file: () => ({ getMetadata: async () => [{ size: 1 }], download: async () => [Buffer.from("x")] }) } });
  return { app, store, claimsSet };
}
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

const CV_FIELDS = { fullName: "Thandi Nkosi", headline: "SAP FICO", location: "Durban", currentRole: "Lead", history: [], education: [], skills: ["SAP"] };
const cv = (o: any = {}) => ({ kind: "cv", fileRef: "users/c1/cvs/cv.pdf", fields: CV_FIELDS, correctedFields: [], parseConfidence: 0.9, ...o });
const BRIEF_FIELDS = {
  title: "SAP FICO", workMode: "Hybrid", travel: "", budget: { min: 52000, max: 55000, currency: "ZAR" }, location: "Durban", mustHave: ["FI/CO"], niceToHave: [], seniority: "", unclear: [],
};
const brief = (o: any = {}) => ({ kind: "brief", text: "We need an SAP FICO consultant", fileRef: null, fields: BRIEF_FIELDS, correctedFields: [], ...o });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("role gates", () => {
  const { app } = setup();
  const routes: [string, string[]][] = [
    ["/api/interpret-note", ["cand", "comp"]],
    ["/api/match", ["cand", "comp"]],
    ["/api/search", ["cand", "comp"]],
    ["/api/parse-cv", ["comp"]],
    ["/api/parse-brief", ["cand"]],
    ["/api/portal/submit", ["rec"]],
    ["/api/portal/register", ["cand", "comp", "rec"]],
    ["/api/invites/x/accept", ["cand", "comp", "rec"]],
  ];
  it.each(routes)("%s: no token 401", async (path) => {
    expect((await request(app).post(path).send({})).status).toBe(401);
  });
  it.each(routes.flatMap(([p, bad]) => bad.map((t) => [p, t] as const)))("%s rejects %s", async (path, tok) => {
    const noRoleRoute = path.includes("register") || path.includes("accept");
    const r = await request(app).post(path).set(as(tok)).send({});
    expect([r.status, r.body.code]).toEqual(noRoleRoute ? [409, "already_registered"] : [403, "forbidden"]);
  });
  it("a no-role token can't reach recruiter routes", async () => {
    expect((await request(app).post("/api/match").set(as("fresh")).send({})).status).toBe(403);
  });
  it("/api/me returns the role", async () => {
    expect((await request(app).get("/api/me").set(as("cand"))).body).toEqual({ uid: "c1", role: "candidate" });
  });
});

describe("ALLOWED_UIDS", () => {
  it("only filters the recruiter", async () => {
    const { app } = setup({}, "someone-else");
    expect((await request(app).post("/api/portal/submit").set(as("cand")).send(cv())).status).toBe(200);
    expect((await request(app).post("/api/portal/register").set(as("fresh")).send({ displayName: "M", consent: true })).status).toBe(200);
    expect((await request(app).get("/api/me").set(as("rec"))).status).toBe(403);
  });
});

describe("rate limit", () => {
  it("the 11th portal parse in an hour is 429; the recruiter is not limited", async () => {
    const { app } = setup();
    for (let i = 0; i < 10; i++) expect((await request(app).post("/api/parse-cv").set(as("cand")).send({})).status).not.toBe(429);
    const r = await request(app).post("/api/parse-cv").set(as("cand")).send({});
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("rate_limited");
    for (let i = 0; i < 12; i++) expect((await request(app).post("/api/parse-cv").set(as("rec")).send({})).status).not.toBe(429);
  });
});

describe("register", () => {
  it("consent missing or false is 400", async () => {
    const { app, claimsSet } = setup();
    expect((await request(app).post("/api/portal/register").set(as("fresh")).send({ displayName: "M" })).status).toBe(400);
    expect((await request(app).post("/api/portal/register").set(as("fresh")).send({ displayName: "M", consent: false })).status).toBe(400);
    expect(claimsSet).toEqual([]);
  });
  it("no email on the token is 400", async () => {
    const { app } = setup();
    expect((await request(app).post("/api/portal/register").set(as("noemail")).send({ displayName: "M", consent: true })).status).toBe(400);
  });
  it("sets the claim and writes a PortalUser", async () => {
    const { app, store, claimsSet } = setup();
    const r = await request(app).post("/api/portal/register").set(as("fresh")).send({ displayName: "Megan", consent: true });
    expect(r.body).toEqual({ role: "candidate" });
    expect(claimsSet).toEqual([["f1", { role: "candidate" }]]);
    const u = store.get("portalUsers/f1");
    expect(u).toMatchObject({ ownerUid: R, role: "candidate", email: "megan@v.co", displayName: "Megan" });
    expect(u.consentAt).toBeInstanceOf(Date);
  });
});

describe("invite accept", () => {
  const inv = (o: any = {}) => ({ "invites/i1": { ownerUid: R, companyId: "co1", email: "Megan@V.co", expiresAt: new Date(Date.now() + 86_400_000), createdBy: R, ...o } });
  const accept = async (seed: any) => {
    const s = setup(seed);
    const r = await request(s.app).post("/api/invites/i1/accept").set(as("fresh")).send({ displayName: "Megan" });
    return { r, ...s };
  };
  it("404 when missing", async () => expect((await accept({})).r.status).toBe(404));
  it("410 when expired", async () => {
    const { r } = await accept(inv({ expiresAt: new Date(Date.now() - 1000) }));
    expect([r.status, r.body.code]).toEqual([410, "invite_expired"]);
  });
  it("409 when used by someone else", async () => {
    const { r } = await accept(inv({ acceptedAt: new Date(), acceptedUid: "other" }));
    expect([r.status, r.body.code]).toEqual([409, "invite_used"]);
  });
  it("403 on email mismatch", async () => {
    const { r, claimsSet } = await accept(inv({ email: "someone@else.co" }));
    expect([r.status, r.body.code]).toEqual([403, "email_mismatch"]);
    expect(claimsSet).toEqual([]);
  });
  it("happy path sets claims, portalUser and acceptedAt (email case-insensitive)", async () => {
    const { r, store, claimsSet } = await accept(inv());
    expect(r.body).toEqual({ companyId: "co1" });
    expect(claimsSet).toEqual([["f1", { role: "company", companyId: "co1" }]]);
    expect(store.get("invites/i1")).toMatchObject({ acceptedUid: "f1" });
    expect(store.get("invites/i1").acceptedAt).toBeInstanceOf(Date);
    expect(store.get("portalUsers/f1")).toMatchObject({ role: "company", companyId: "co1", ownerUid: R });
  });
  it("the same account can finish after a failed claim write", async () => {
    const { r, claimsSet } = await accept(inv({ acceptedAt: new Date(), acceptedUid: "f1" }));
    expect(r.status).toBe(200);
    expect(claimsSet).toHaveLength(1);
  });
});

describe("submit", () => {
  const send = async (tok: string, body: unknown, seed: any = {}) => {
    const s = setup(seed);
    const r = await request(s.app).post("/api/portal/submit").set(as(tok)).send(body as object);
    return { r, ...s };
  };
  const written = (store: Map<string, any>) => [...store].filter(([k]) => k.startsWith("submissions/")).map(([, v]) => v);
  const status = async (tok: string, body: unknown) => (await send(tok, body)).r.status;

  it("candidate can't send a brief, company can't send a cv", async () => {
    expect(await status("cand", brief())).toBe(403);
    expect(await status("comp", cv({ fileRef: "users/k1/cvs/a.pdf" }))).toBe(403);
  });
  it("invalid body is 400", async () => expect(await status("cand", { kind: "cv" })).toBe(400));
  it("fileRef outside the caller's folder is 400", async () => {
    for (const fileRef of ["users/other/cvs/a.pdf", "users/c1/briefs/a.pdf", "users/c1/cvs/../x.pdf", "users/c1/cvs/a/b.pdf"]) {
      expect(await status("cand", cv({ fileRef }))).toBe(400);
    }
    expect(await status("comp", brief({ text: null, fileRef: "users/c1/briefs/a.pdf" }))).toBe(400);
  });
  it("details-change needs a candidateId claim", async () => {
    const body = { kind: "details-change", fields: { salary: "R70k" } };
    const no = await send("cand", body);
    expect([no.r.status, no.r.body.code]).toEqual([409, "not_in_pool"]);
    const { r, store } = await send("pooled", body);
    expect(r.status).toBe(200);
    expect(Submission.parse(written(store)[0])).toMatchObject({ kind: "details-change", candidateId: "cand9", readStatus: "clear", status: "pending", submittedBy: "c2", ownerUid: R });
  });
  it("clear CV is pending, owned by the recruiter, and valid", async () => {
    const { r, store } = await send("cand", cv());
    const d = Submission.parse(store.get(`submissions/${r.body.submissionId}`));
    expect(d).toMatchObject({ ownerUid: R, submittedBy: "c1", status: "pending", readStatus: "clear", fileRef: "users/c1/cvs/cv.pdf" });
    expect(d.possibleDuplicateOf).toBeUndefined();
  });
  it("readStatus: unreadable / check / clear", async () => {
    const rs = async (o: any) => written((await send("cand", cv(o))).store)[0].readStatus;
    expect(await rs({ parseConfidence: 0.39 })).toBe("unreadable");
    expect(await rs({ parseConfidence: 0.5 })).toBe("check");
    expect(await rs({ correctedFields: ["location"] })).toBe("check");
    expect(await rs({ parseConfidence: 0.7 })).toBe("clear");
  });
  it("brief: text stored, unclear makes it check, companyId from claims", async () => {
    const { r, store } = await send("comp", brief());
    expect(r.status).toBe(200);
    expect(Submission.parse(written(store)[0])).toMatchObject({ kind: "brief", text: "We need an SAP FICO consultant", companyId: "co1", readStatus: "clear" });
    const u = await send("comp", brief({ fields: { ...BRIEF_FIELDS, unclear: ["Budget"] } }));
    expect(written(u.store)[0].readStatus).toBe("check");
  });
  it("duplicate by normalised name, email, or an earlier CV's phone", async () => {
    const dup = async (name: string, seed: any, phone?: string) => {
      const { store } = await send("cand", cv({ fields: { ...CV_FIELDS, fullName: name, ...(phone && { phone }) } }), seed);
      return written(store).find((d) => d.submittedBy === "c1").possibleDuplicateOf;
    };
    const pool = { "candidates/cA": { ownerUid: R, fullName: "  Thándi   nkosi " }, "candidates/cB": { ownerUid: "other", fullName: "Someone Else" } };
    expect(await dup("Thandi Nkosi", pool)).toBe("cA");
    expect(await dup("Someone Else", pool)).toBeUndefined();
    expect(await dup("New Name", { "candidates/cE": { ownerUid: R, fullName: "Old", portalUid: "zz" }, "portalUsers/zz": { ownerUid: R, email: "lerato@x.co" } })).toBe("cE");
    expect(await dup("New Name", { "candidates/cP": { ownerUid: R, fullName: "Old" }, "submissions/s0": { ownerUid: R, kind: "cv", candidateId: "cP", fields: { phone: "0821234567" } } }, "0821234567")).toBe("cP");
  });
});

describe("normaliseName", () => {
  it("strips accents, case and extra spaces", () => expect(normaliseName("  Zoë   VAN der Merwe ")).toBe("zoe van der merwe"));
});

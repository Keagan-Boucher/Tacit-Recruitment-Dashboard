/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { CandidateUpdate, ShortlistEntry, type Claims } from "@tacit/shared";
import { createApp } from "../app.ts";
import { loadConfig } from "../config.ts";

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

const TOKENS: Record<string, { uid: string; claims: Claims }> = {
  rec: { uid: R, claims: { role: "recruiter" } },
  cand: { uid: "c1", claims: { role: "candidate", candidateId: "cand1" } },
  comp: { uid: "k1", claims: { role: "company", companyId: "co1" } },
  other: { uid: "k2", claims: { role: "company", companyId: "co2" } },
};
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const CARD = {
  label: "Candidate A", headline: "SAP FICO consultant", years: 8,
  facts: { location: "Durban", workMode: "Hybrid", notice: "1 month", salary: "R60k" },
  case: { for: [{ text: "Strong FI/CO", at: "2026-09-01T00:00:00.000Z" }], against: [{ text: "Wants hybrid", at: "2026-09-01T00:00:00.000Z" }] },
};
const SEED = {
  "companies/co1": { ownerUid: R, name: "Voltmark", sector: "Energy" },
  "roles/r1": { ownerUid: R, companyId: "co1", title: "SAP FICO", status: "open", interpretedBrief: { location: "Durban", seniority: "Senior", budget: { min: 1, max: 2, currency: "ZAR" } } },
  "candidates/cand1": { ownerUid: R, fullName: "Thandi Nkosi", portalUid: "c1", sourceSubmissionId: "s1" },
  "candidates/cand2": { ownerUid: R, fullName: "Sipho Dlamini", portalUid: "c9" },
  "candidates/cand3": { ownerUid: R, fullName: "Walk In" },
  "portalUsers/c1": { email: "thandi@x.co" },
  "submissions/s1": { fields: { phone: "082 000 0000" } },
};

function setup(seed: Record<string, any> = SEED) {
  const { db, store } = fakeDb({ ...seed });
  const app = createApp(loadConfig({ ALLOWED_ORIGIN: "http://a.test", RECRUITER_UID: R }), async (t) => {
    if (!TOKENS[t]) throw new Error("bad");
    return TOKENS[t]!;
  }, { db, auth: { setCustomUserClaims: async () => {}, getUser: async () => ({}) } });
  return { app, store };
}
const share = (app: any, ids = ["cand1"], tok = "rec") =>
  request(app).post("/api/shortlists/share").set(as(tok)).send({ roleId: "r1", entries: ids.map((candidateId, i) => ({ ...CARD, label: `Candidate ${i}`, candidateId })) });
const status = (app: any, body: any, tok = "comp") => request(app).post("/api/portal/shortlist-status").set(as(tok)).send(body);
const all = (store: Map<string, any>, c: string) => [...store].filter(([k]) => k.startsWith(c + "/"));
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" && !(v instanceof Date) ? Object.values(v).flatMap(strings) : []);

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("gates", () => {
  it("recruiter-only share rejects portal tokens; shortlist-status rejects recruiter and candidate", async () => {
    const { app } = setup();
    for (const t of ["cand", "comp"]) expect((await share(app, ["cand1"], t)).status).toBe(403);
    for (const t of ["rec", "cand"]) expect((await status(app, { entryId: "x", status: "interviewing" }, t)).status).toBe(403);
  });
});

describe("share", () => {
  it("writes an identity-free entry and a company-free candidate update", async () => {
    const { app, store } = setup();
    const r = await share(app, ["cand1", "cand3"]);
    expect(r.status).toBe(200);
    expect(r.body.entryIds).toHaveLength(2);
    const [id1, id3] = r.body.entryIds;
    const e = store.get(`shortlistEntries/${id1}`);
    expect(ShortlistEntry.safeParse(e).success).toBe(true);
    expect(e).toMatchObject({ roleId: "r1", roleTitle: "SAP FICO", companyId: "co1", candidateId: "cand1", status: "shortlisted", ownerUid: R });
    expect(e.identity).toBeUndefined();
    expect(e.statusHistory).toMatchObject([{ status: "shortlisted", by: R }]);
    const u = store.get(`candidateUpdates/${id1}`);
    expect(CandidateUpdate.safeParse(u).success).toBe(true);
    expect(u).toMatchObject({ candidateId: "cand1", portalUid: "c1", status: "shortlisted", roleAnon: { title: "SAP FICO", sector: "Energy" } });
    expect(store.has(`candidateUpdates/${id3}`)).toBe(false); // no portal account
    for (const [, d] of all(store, "candidateUpdates")) {
      const s = strings(d).join(" ");
      expect(s).not.toMatch(/co1|voltmark/i);
      expect(Object.keys(d)).not.toContain("companyId");
    }
  });
  it("re-sharing updates rather than duplicates", async () => {
    const { app, store } = setup();
    const a = await share(app);
    const b = await share(app);
    expect(b.body.entryIds).toEqual(a.body.entryIds);
    expect(all(store, "shortlistEntries")).toHaveLength(1);
    expect(all(store, "candidateUpdates")).toHaveLength(1);
  });
  it("duplicate candidates in one request are 400", async () => {
    const { app } = setup();
    expect((await share(app, ["cand1", "cand1"])).status).toBe(400);
  });
  it("a card containing the candidate's name is 400 and names the field; nothing is written", async () => {
    const { app, store } = setup({ ...SEED, "candidates/cand2": { ownerUid: R, fullName: "Sípho Dlamini" } });
    const send = (card: any, id = "cand1") => request(app).post("/api/shortlists/share").set(as("rec")).send({ roleId: "r1", entries: [{ ...CARD, ...card, candidateId: id }] });
    const r = await send({ headline: "Ask THANDI about SAP" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "bad_request", error: expect.stringContaining("Headline") });
    expect((await send({ case: { ...CARD.case, against: [{ text: "Nkosi's notice is long", at: CARD.case.against[0]!.at }] } })).body.error).toContain("Reasons against");
    expect((await send({ facts: { ...CARD.facts, salary: "Dlamini wants R60k" } }, "cand2")).body.error).toContain("Salary");
    expect((await send({ headline: "Siphó, SAP consultant" }, "cand2")).status).toBe(400); // diacritics fold both ways
    expect((await send({ headline: "Thandiwe's peer" })).status).toBe(200); // whole words only
    expect(all(store, "shortlistEntries")).toHaveLength(1);
  });
  it("re-share refreshes roleTitle and creates the missing candidateUpdate", async () => {
    const { app, store } = setup();
    const a = await share(app, ["cand3"]);
    store.set("candidates/cand3", { ...store.get("candidates/cand3"), portalUid: "c3" });
    store.set("roles/r1", { ...store.get("roles/r1"), title: "SAP FICO Lead" });
    await share(app, ["cand3"]);
    expect(store.get(`shortlistEntries/${a.body.entryIds[0]}`).roleTitle).toBe("SAP FICO Lead");
    expect(store.get(`candidateUpdates/${a.body.entryIds[0]}`)).toMatchObject({ portalUid: "c3", status: "shortlisted" });
  });
  it("someone else's role or a bad body fails", async () => {
    const { app } = setup({ ...SEED, "roles/r1": { ...SEED["roles/r1"], ownerUid: "other" } });
    expect((await share(app)).status).toBe(404);
    expect((await request(app).post("/api/shortlists/share").set(as("rec")).send({ roleId: "r1", entries: [] })).status).toBe(400);
  });
});

describe("shortlist-status", () => {
  async function shared() {
    const s = setup();
    const r = await share(s.app, ["cand1", "cand2"]);
    return { ...s, ids: r.body.entryIds as string[] };
  }

  it("a company can't touch another company's entry", async () => {
    const { app, ids, store } = await shared();
    const r = await status(app, { entryId: ids[0], status: "interviewing" }, "other");
    expect(r.status).toBe(403);
    expect(store.get(`shortlistEntries/${ids[0]}`).status).toBe("shortlisted");
  });
  it("not-progressing needs a reason (400)", async () => {
    const { app, ids } = await shared();
    expect((await status(app, { entryId: ids[0], status: "not-progressing" })).status).toBe(400);
    expect((await status(app, { entryId: ids[0], status: "shortlisted" })).status).toBe(400);
  });
  it("identity appears only at interviewing", async () => {
    const { app, ids, store } = await shared();
    for (const [, e] of all(store, "shortlistEntries")) expect(e.identity).toBeUndefined();
    const r = await status(app, { entryId: ids[0], status: "interviewing", interviewTimes: ["Tue 10:00"] });
    expect(r.body).toEqual({ status: "interviewing" });
    const e = store.get(`shortlistEntries/${ids[0]}`);
    expect(ShortlistEntry.safeParse(e).success).toBe(true);
    expect(e.identity).toEqual({ fullName: "Thandi Nkosi", email: "thandi@x.co", phone: "082 000 0000" });
    expect(e.interviewTimes).toEqual(["Tue 10:00"]);
    expect(e.statusHistory.map((h: any) => h.status)).toEqual(["shortlisted", "interviewing"]);
    expect(store.get(`candidateUpdates/${ids[0]}`).status).toBe("interviewing");
    expect(store.get(`shortlistEntries/${ids[1]}`).identity).toBeUndefined();
  });
  it("hired needs interviewing first; then places, fills the role and tells the rest", async () => {
    const { app, ids, store } = await shared();
    expect((await status(app, { entryId: ids[0], status: "hired" })).status).toBe(409);
    await status(app, { entryId: ids[0], status: "interviewing" });
    const salary = { amount: 60000, currency: "ZAR", period: "month" };
    expect((await status(app, { entryId: ids[0], status: "hired", startDate: "2026-12-01", salary })).body).toEqual({ status: "hired" });
    const p = all(store, "placements")[0]![1];
    expect(p).toMatchObject({ outcome: "placed", candidateId: "cand1", roleId: "r1", companyId: "co1", source: "company", salary, reason: "", ownerUid: R });
    expect(p.startDate).toEqual(new Date("2026-12-01"));
    expect(store.get("roles/r1")).toMatchObject({ status: "filled" });
    expect(store.get("roles/r1").closedAt).toBeInstanceOf(Date);
    const other = store.get(`shortlistEntries/${ids[1]}`);
    expect(other.status).toBe("not-progressing");
    expect(other.statusHistory.at(-1)).toMatchObject({ status: "not-progressing", reasonText: "Role filled" });
    expect(all(store, "placements")).toHaveLength(1); // none for the rest
    expect(store.get(`candidateUpdates/${ids[0]}`).status).toBe("placed");
    expect(store.get(`candidateUpdates/${ids[1]}`).status).toBe("not-taken-forward");
    for (const [, d] of all(store, "candidateUpdates")) expect(strings(d).join(" ")).not.toMatch(/co1|voltmark/i);
  });
  it("a hire is refused when another entry on the role is already hired", async () => {
    const { app, ids, store } = await shared();
    await status(app, { entryId: ids[0], status: "interviewing" });
    store.set(`shortlistEntries/${ids[1]}`, { ...store.get(`shortlistEntries/${ids[1]}`), status: "hired" });
    expect((await status(app, { entryId: ids[0], status: "hired" })).status).toBe(409);
    expect(all(store, "placements")).toHaveLength(0);
  });
  it("not-progressing writes a client-rejected placement with the reason", async () => {
    const { app, ids, store } = await shared();
    await status(app, { entryId: ids[0], status: "not-progressing", reasonText: "Salary too high" });
    expect(all(store, "placements")[0]![1]).toMatchObject({ outcome: "client-rejected", reason: "Salary too high", source: "company" });
    expect(store.get(`candidateUpdates/${ids[0]}`).status).toBe("not-taken-forward");
    expect(store.get("roles/r1").status).toBe("open");
  });
  it("repeat is idempotent; moving on from a final state is 409", async () => {
    const { app, ids, store } = await shared();
    await status(app, { entryId: ids[0], status: "interviewing" });
    expect((await status(app, { entryId: ids[0], status: "interviewing" })).body).toEqual({ status: "interviewing" });
    expect(store.get(`shortlistEntries/${ids[0]}`).statusHistory).toHaveLength(2);
    await status(app, { entryId: ids[0], status: "not-progressing", reasonText: "No" });
    expect((await status(app, { entryId: ids[0], status: "interviewing" })).status).toBe(409);
  });
});

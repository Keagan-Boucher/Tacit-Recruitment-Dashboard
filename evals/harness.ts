// Shared by the match and search eval sections: the seeded dataset in an in-memory Firestore, served by the real routers.
/* eslint-disable @typescript-eslint/no-explicit-any -- tiny in-memory Firestore fake, same shape as server/src/routes/match.test.ts */
import express from "express";
import request from "supertest";
import type { Firestore } from "firebase-admin/firestore";
import { buildDataset, type Dataset } from "../scripts/seed/dataset.ts";

export const OWNER = "eval-owner";
export const NOW = new Date();
export const dataset: Dataset = buildDataset(NOW, OWNER);
// Seeded matches are what the model is expected to reproduce, never an input: leaving them out also defeats the match cache.
export const SEED = (["roles", "candidates", "attributes", "overrides"] as const).map((c) => [c, dataset[c]] as const);

export function memDb() {
  const store = new Map<string, any>(SEED.flatMap(([c, docs]) => docs.map((d) => [`${c}/${d.id}`, structuredClone(d.data)] as [string, any])));
  let n = 0;
  const ref = (c: string, id: string) => ({ id, path: `${c}/${id}`, get: async () => ({ id, exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }), set: async (d: any) => void store.set(`${c}/${id}`, d), update: async (d: any) => void store.set(`${c}/${id}`, { ...store.get(`${c}/${id}`), ...d }) });
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

/** POST `body` to the production router mounted at /api, as OWNER. */
export async function post(router: express.Router, path: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.uid = OWNER; next(); });
  app.use("/api", router);
  const r = await request(app).post(`/api${path}`).send(body as object);
  return { status: r.status, body: r.body as any };
}

/** Confirmed facts per candidate: what the production routes may cite. */
type Doc = { id: string; data: any };
export const factIds = (candidateId: string) =>
  new Set((dataset.attributes as Doc[]).filter((a) => a.data.candidateId === candidateId && a.data.confirmedByRecruiter).map((a) => a.id));

export const nameOf = (candidateId: string) => (dataset.candidates as Doc[]).find((c) => c.id === candidateId)?.data as { fullName: string } | undefined;

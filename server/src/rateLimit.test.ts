import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { rateLimit } from "./rateLimit.ts";

const setup = (role: "candidate" | "recruiter") => {
  let t = 0;
  const app = express();
  app.use((req, _res, next) => { req.uid = "u1"; req.role = role; next(); });
  app.use(rateLimit(10, 3600_000, () => t));
  app.post("/x", (_req, res) => void res.json({ ok: true }));
  return { app, tick: (ms: number) => void (t += ms) };
};

describe("rateLimit", () => {
  it("blocks the 11th call in an hour, then lets the window pass", async () => {
    const { app, tick } = setup("candidate");
    for (let i = 0; i < 10; i++) expect((await request(app).post("/x")).status).toBe(200);
    const r = await request(app).post("/x");
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("rate_limited");
    tick(3600_001);
    expect((await request(app).post("/x")).status).toBe(200);
  });
  it("never limits the recruiter", async () => {
    const { app } = setup("recruiter");
    for (let i = 0; i < 12; i++) expect((await request(app).post("/x")).status).toBe(200);
  });
});

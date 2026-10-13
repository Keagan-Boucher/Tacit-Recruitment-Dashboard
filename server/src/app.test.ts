import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig({ ALLOWED_ORIGIN: "http://allowed.test" });
const app = createApp(config, async (t) => {
  if (t !== "good") throw new Error("bad");
  return "uid_1";
});

describe("proxy", () => {
  it("health is public", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, modelConfigured: false });
  });
  it("CORS: only the allowed origin", async () => {
    const bad = await request(app).get("/api/health").set("Origin", "http://evil.test");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
    const ok = await request(app).get("/api/health").set("Origin", "http://allowed.test");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://allowed.test");
  });
  it("/api/me needs a valid token", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
    expect((await request(app).get("/api/me").set("Authorization", "Bearer nope")).status).toBe(401);
    const r = await request(app).get("/api/me").set("Authorization", "Bearer good");
    expect(r.body).toEqual({ uid: "uid_1" });
  });
  it("unknown /api route is JSON 404 (after auth)", async () => {
    const r = await request(app).get("/api/zzz").set("Authorization", "Bearer good");
    expect(r.status).toBe(404);
    expect(r.body.error).toBeTruthy();
  });
  it("malformed JSON gives a plain error", async () => {
    const r = await request(app).post("/api/me").set("Content-Type", "application/json").send("{bad");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain("at ");
  });
  it("config fails fast without ALLOWED_ORIGIN", () => {
    expect(() => loadConfig({})).toThrow(/ALLOWED_ORIGIN/);
  });
});

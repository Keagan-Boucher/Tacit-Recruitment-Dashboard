import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { createAi } from "./ai/index.ts";
import { requireAuth, type TokenVerifier } from "./auth.ts";
import type { Config } from "./config.ts";
import type { BucketLike } from "./files.ts";
import { interpretNoteRouter } from "./routes/interpret-note.ts";
import { matchRouter } from "./routes/match.ts";
import { parseRouter } from "./routes/parse.ts";

/** Firebase-backed services; omitted in tests that don't need them, and their routes aren't mounted. */
export interface Services { db?: Firestore; bucket?: BucketLike }

// Kept separate from listen() so a Cloud Function can wrap `app` later (D-04).
export function createApp(config: Config, verifyToken: TokenVerifier, services: Services = {}) {
  const ai = createAi(config);
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: (origin, cb) => cb(null, origin === config.allowedOrigin) }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, modelConfigured: ai.provider !== null });
  });

  app.use("/api", requireAuth(verifyToken, config.allowedUids));
  app.get("/api/me", (req, res) => void res.json({ uid: req.uid }));
  if (services.db) app.use("/api", interpretNoteRouter({ ai, db: services.db }));
  if (services.db) app.use("/api", matchRouter({ ai, db: services.db }));
  if (services.bucket) app.use("/api", parseRouter({ ai, bucket: services.bucket }));

  app.use("/api", (_req, res) => void res.status(404).json({ error: "Not found", code: "not_found" }));

  // Express identifies error handlers by arity (4 args), so _next must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("Unhandled error:", err?.message ?? err);
    else console.warn("Request rejected:", status, err?.type ?? err?.name); // e.g. 413 entity.too.large
    res.status(status).json(status === 500
      ? { error: "Internal server error", code: "internal" }
      : { error: status === 413 ? "That request is too large" : "Bad request", code: "bad_request" });
  };
  app.use(onError);
  return app;
}

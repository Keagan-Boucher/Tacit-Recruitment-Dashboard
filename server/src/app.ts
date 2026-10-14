import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { requireAuth, type TokenVerifier } from "./auth.ts";
import type { Config } from "./config.ts";

// Kept separate from listen() so a Cloud Function can wrap `app` later (D-04).
export function createApp(config: Config, verifyToken: TokenVerifier) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: (origin, cb) => cb(null, origin === config.allowedOrigin) }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, modelConfigured: Boolean(config.aiBaseUrl && config.aiApiKey && config.aiModel) });
  });

  app.use("/api", requireAuth(verifyToken));
  app.get("/api/me", (req, res) => void res.json({ uid: req.uid }));

  app.use("/api", (_req, res) => void res.status(404).json({ error: "Not found" }));

  // Express identifies error handlers by arity (4 args), so _next must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("Unhandled error:", err?.message ?? err);
    res.status(status).json({ error: status === 500 ? "Internal server error" : "Bad request" });
  };
  app.use(onError);
  return app;
}

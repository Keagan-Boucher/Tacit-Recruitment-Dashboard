import type { NextFunction, Request, Response } from "express";

// shortcut: in-memory per instance, resets on restart; move to Firestore if the proxy runs on several instances
/** Per-uid fixed-window limit for portal parse calls. The recruiter is never limited. */
export function rateLimit(max = 10, windowMs = 60 * 60 * 1000, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.role === "recruiter") return next();
    const t = now();
    const recent = (hits.get(req.uid!) ?? []).filter((h) => t - h < windowMs);
    if (recent.length >= max) {
      hits.set(req.uid!, recent);
      return void res.status(429).json({ error: "Too many uploads this hour. Try again later.", code: "rate_limited" });
    }
    hits.set(req.uid!, [...recent, t]);
    next();
  };
}

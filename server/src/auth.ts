import type { NextFunction, Request, Response } from "express";

/** Resolves a Firebase ID token to a uid, or throws. */
export type TokenVerifier = (token: string) => Promise<string>;

declare module "express-serve-static-core" {
  interface Request {
    uid?: string;
  }
}

/** `allowedUids` empty = any signed-in user of the Firebase project; set ALLOWED_UIDS in production. */
export const requireAuth = (verify: TokenVerifier, allowedUids: string[] = []) => async (req: Request, res: Response, next: NextFunction) => {
  const m = /^Bearer (.+)$/.exec(req.header("authorization") ?? "");
  if (!m) return void res.status(401).json({ error: "Missing bearer token", code: "unauthorized" });
  try {
    req.uid = await verify(m[1]!);
  } catch {
    return void res.status(401).json({ error: "Invalid or expired token", code: "unauthorized" });
  }
  if (allowedUids.length && !allowedUids.includes(req.uid)) return void res.status(403).json({ error: "Not allowed", code: "unauthorized" });
  next();
};

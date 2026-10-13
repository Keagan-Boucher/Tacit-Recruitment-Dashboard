import type { NextFunction, Request, Response } from "express";

/** Resolves a Firebase ID token to a uid, or throws. */
export type TokenVerifier = (token: string) => Promise<string>;

declare module "express-serve-static-core" {
  interface Request {
    uid?: string;
  }
}

export const requireAuth = (verify: TokenVerifier) => async (req: Request, res: Response, next: NextFunction) => {
  const m = /^Bearer (.+)$/.exec(req.header("authorization") ?? "");
  if (!m) return void res.status(401).json({ error: "Missing bearer token" });
  try {
    req.uid = await verify(m[1]!);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

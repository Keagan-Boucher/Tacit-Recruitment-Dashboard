import type { NextFunction, Request, Response } from "express";
import { Claims, type AccountRole } from "@tacit/shared";

export interface VerifiedToken { uid: string; email?: string; claims: Claims }
/** Resolves a Firebase ID token to its uid, email and custom claims, or throws. */
export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

declare module "express-serve-static-core" {
  interface Request {
    uid?: string;
    email?: string;
    role?: AccountRole;
    claims?: Claims;
  }
}

const deny = (res: Response, status: number, error: string, code: string) => void res.status(status).json({ error, code });

/** `allowedUids` is an optional extra filter for the recruiter role only; portal users and no-role tokens never hit it. */
export const requireAuth = (verify: TokenVerifier, allowedUids: string[] = []) => async (req: Request, res: Response, next: NextFunction) => {
  const m = /^Bearer (.+)$/.exec(req.header("authorization") ?? "");
  if (!m) return deny(res, 401, "Missing bearer token", "unauthorized");
  try {
    const t = await verify(m[1]!);
    req.uid = t.uid;
    req.email = t.email;
    req.claims = t.claims;
    req.role = t.claims.role;
  } catch {
    return deny(res, 401, "Invalid or expired token", "unauthorized");
  }
  if (req.role === "recruiter" && allowedUids.length && !allowedUids.includes(req.uid)) return deny(res, 403, "Not allowed", "forbidden");
  next();
};

export const requireRole = (...roles: AccountRole[]) => (req: Request, res: Response, next: NextFunction) =>
  req.role && roles.includes(req.role) ? next() : deny(res, 403, "Your account can't do that", "forbidden");

/** For register / accept: a token that already has a role is done. */
export const requireNoRole = (req: Request, res: Response, next: NextFunction) =>
  req.role ? deny(res, 409, "This account is already set up", "already_registered") : next();

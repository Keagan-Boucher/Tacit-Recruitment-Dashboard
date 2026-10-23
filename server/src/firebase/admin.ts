import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Claims } from "@tacit/shared";
import type { Config } from "../config.ts";
import type { TokenVerifier } from "../auth.ts";

/** Initialise Firebase Admin once; returns the real ID-token verifier. */
export function initFirebase(config: Config): TokenVerifier {
  if (!getApps().length) {
    initializeApp({
      credential: config.serviceAccountPath ? cert(config.serviceAccountPath) : applicationDefault(),
      storageBucket: config.storageBucket,
    });
  }
  const auth = getAuth();
  return async (token) => {
    const d = await auth.verifyIdToken(token);
    const c = Claims.safeParse(d);
    return { uid: d.uid, email: d.email, claims: c.success ? c.data : {} };
  };
}

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Config } from "../config.ts";
import type { TokenVerifier } from "../auth.ts";

/** Initialise Firebase Admin once; returns the real ID-token verifier. */
export function initFirebase(config: Config): TokenVerifier {
  if (!getApps().length) {
    initializeApp({
      credential: config.serviceAccountPath ? cert(config.serviceAccountPath) : applicationDefault(),
    });
  }
  const auth = getAuth();
  return async (token) => (await auth.verifyIdToken(token)).uid;
}

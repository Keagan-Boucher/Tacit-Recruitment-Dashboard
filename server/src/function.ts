import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { initFirebase } from "./firebase/admin.ts";

const aiKey = defineSecret("AI_API_KEY");

// Built on the first request: secrets are only in process.env at request time, and deploy-time discovery loads this module without ALLOWED_ORIGIN.
let app: ReturnType<typeof createApp> | undefined;
function build() {
  // Functions reserves the FIREBASE_ env prefix, so the bucket is configured as STORAGE_BUCKET.
  process.env.FIREBASE_STORAGE_BUCKET ||= process.env.STORAGE_BUCKET;
  delete process.env.PORT; // Functions sets PORT (a named pipe in the Windows emulator); the app never listens, and loadConfig rejects non-integers
  const config = loadConfig();
  if (!config.recruiterUid) throw new Error("Missing required env var RECRUITER_UID. See functions/.env.example.");
  const verify = initFirebase(config); // no service-account path in production: applicationDefault()
  return createApp(config, verify, { db: getFirestore(), auth: getAuth(), bucket: getStorage().bucket() });
}

export const api = onRequest(
  { region: "africa-south1", secrets: [aiKey], timeoutSeconds: 120, memory: "512MiB", minInstances: 0, maxInstances: 2 },
  (req, res) => (app ??= build())(req, res),
);

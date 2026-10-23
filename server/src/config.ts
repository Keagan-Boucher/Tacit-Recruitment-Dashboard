export interface Config {
  port: number;
  allowedOrigin: string;
  serviceAccountPath?: string;
  /** Firebase Storage bucket for uploaded CVs and briefs, e.g. tacit-3cdd4.firebasestorage.app */
  storageBucket?: string;
  /** Uids allowed to call the proxy (ALLOWED_UIDS, comma-separated). Optional extra filter for the recruiter role only. */
  allowedUids: string[];
  /** Portal records are owned by this recruiter (RECRUITER_UID). Required wherever Firestore is used. */
  recruiterUid?: string;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
}

const opt = (env: NodeJS.ProcessEnv, k: string) => env[k]?.trim() || undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const allowedOrigin = opt(env, "ALLOWED_ORIGIN");
  if (!allowedOrigin) {
    throw new Error("Missing required env var ALLOWED_ORIGIN (e.g. http://localhost:5173). See server/.env.example.");
  }
  const port = Number(opt(env, "PORT") ?? 8787);
  if (!Number.isInteger(port) || port <= 0) throw new Error("PORT must be a positive integer.");
  return {
    port,
    allowedOrigin,
    serviceAccountPath: opt(env, "FIREBASE_SERVICE_ACCOUNT_PATH"),
    storageBucket: opt(env, "FIREBASE_STORAGE_BUCKET"),
    allowedUids: (opt(env, "ALLOWED_UIDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    recruiterUid: opt(env, "RECRUITER_UID"),
    // OpenAI-compatible endpoint: Groq today (https://api.groq.com/openai/v1, openai/gpt-oss-120b).
    aiBaseUrl: opt(env, "AI_BASE_URL"),
    aiApiKey: opt(env, "AI_API_KEY"),
    aiModel: opt(env, "AI_MODEL"),
  };
}

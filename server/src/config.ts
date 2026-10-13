export interface Config {
  port: number;
  allowedOrigin: string;
  serviceAccountPath?: string;
  openaiApiKey?: string;
  openaiModel?: string;
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
    openaiApiKey: opt(env, "OPENAI_API_KEY"),
    openaiModel: opt(env, "OPENAI_MODEL"),
  };
}

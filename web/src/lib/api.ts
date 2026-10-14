import type { ApiErrorBody } from "@tacit/shared";
import { auth } from "./firebase";

// The only way the web app reaches the model: POST to the proxy with the recruiter's ID token. No keys here.
const base = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(public status: number, public code: ApiErrorBody["code"], message: string) {
    super(message);
  }
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "internal", "Can't reach Tacit's server.");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
  if (!res.ok) throw new ApiError(res.status, json.code ?? "internal", json.error ?? res.statusText);
  return json as T;
}

// What GET /api/health says, as the three words the AI card shows. No auth needed; no model call.
export type Health = { ok: boolean; modelConfigured: boolean; model?: string | null };
export type AiStatus = "connected" | "not-configured" | "unreachable";

export const aiStatus = (h: Health | null): AiStatus =>
  !h || !h.ok ? "unreachable" : h.modelConfigured ? "connected" : "not-configured";

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

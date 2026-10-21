import { DEFAULT_USER_PREFS, UserPrefs } from "@tacit/shared";

export type ThemePref = "dark" | "light" | "system";

export const resolveTheme = (pref: ThemePref, systemPrefersDark: boolean): "dark" | "light" =>
  pref === "system" ? (systemPrefersDark ? "dark" : "light") : pref;

export function applyTheme(theme: "dark" | "light", root: HTMLElement = document.documentElement) {
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
}

export function applyReduceMotion(on: boolean, root: HTMLElement = document.documentElement) {
  if (on) root.dataset.reduceMotion = "";
  else delete root.dataset.reduceMotion;
}

/** Firestore doc data -> UserPrefs. Missing fields fall back to defaults; anything invalid -> all defaults. */
export function parsePrefs(data: Record<string, unknown> | undefined): UserPrefs {
  if (!data) return DEFAULT_USER_PREFS;
  const u = data.updatedAt as { toDate?: () => Date } | undefined;
  const merged = { ...DEFAULT_USER_PREFS, ...data, updatedAt: u?.toDate ? u.toDate() : u };
  const r = UserPrefs.safeParse(merged);
  return r.success ? withNewWidgets(r.data) : DEFAULT_USER_PREFS;
}

/** A layout saved before a widget existed has no entry for it: add it hidden (on the shelf) and last in the small-screen order. */
function withNewWidgets(p: UserPrefs): UserPrefs {
  const have = new Set(p.dashboard.map((w) => w.widgetId));
  const missing = DEFAULT_USER_PREFS.dashboard.filter((w) => !have.has(w.widgetId));
  if (missing.length === 0 && DEFAULT_USER_PREFS.smallScreenOrder.every((id) => p.smallScreenOrder.includes(id))) return p;
  const top = Math.max(-1, ...p.dashboard.map((w) => w.order));
  return {
    ...p,
    dashboard: [...p.dashboard, ...missing.map((w, i) => ({ ...w, visible: false, order: top + 1 + i }))],
    smallScreenOrder: [...p.smallScreenOrder, ...DEFAULT_USER_PREFS.smallScreenOrder.filter((id) => !p.smallScreenOrder.includes(id))],
  };
}

// Cache read by the inline script in index.html. Keep the keys in sync with it.
export function cachePrefs(p: Pick<UserPrefs, "theme" | "reduceMotion">) {
  try {
    localStorage.setItem("tacit.theme", p.theme);
    localStorage.setItem("tacit.reduceMotion", String(p.reduceMotion));
  } catch {
    /* storage unavailable: the cache is only an optimisation */
  }
}

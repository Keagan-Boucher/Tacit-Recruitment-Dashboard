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
  return r.success ? r.data : DEFAULT_USER_PREFS;
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

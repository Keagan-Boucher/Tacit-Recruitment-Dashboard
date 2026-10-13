import { useLocation } from "react-router";

// Dev-only hooks for the verifier: ?state=, ?dialog=, ?palette=, ?theme=light|dark. All inert unless import.meta.env.DEV.

/** Value of `?key=` in a query string, or null. Always null when `enabled` is false (production). */
export function devParam(search: string, key: string, enabled: boolean = import.meta.env.DEV): string | null {
  return enabled ? new URLSearchParams(search).get(key) : null;
}

/** The screen state to render (`?state=`), `"default"` when absent. */
export function useScreenState(): string {
  return devParam(useLocation().search, "state") ?? "default";
}

/** Open overlay name from `?dialog=` or `?palette=`, or null. */
export function useDevOverlay(name: "dialog" | "palette"): string | null {
  return devParam(useLocation().search, name);
}

/** `?theme=light` sets data-theme="light"; `?theme=dark` removes it. Call once before first render. */
export function applyDevTheme(search: string = window.location.search): void {
  const theme = devParam(search, "theme");
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else if (theme === "dark") delete document.documentElement.dataset.theme;
}

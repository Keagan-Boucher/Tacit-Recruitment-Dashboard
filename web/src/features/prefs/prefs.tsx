import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { DEFAULT_USER_PREFS, type UserPrefs } from "@tacit/shared";
import { auth, db } from "../../lib/firebase";
import { devParam } from "../../app/dev";
import { useAuth } from "../auth/auth";
import { applyReduceMotion, applyTheme, cachePrefs, parsePrefs, resolveTheme } from "./theme";

const dark = () => window.matchMedia("(prefers-color-scheme: dark)");
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)");

type PrefsState = { prefs: UserPrefs; savePrefs: (partial: Partial<UserPrefs>) => Promise<void> };
const PrefsContext = createContext<PrefsState>({ prefs: DEFAULT_USER_PREFS, savePrefs: async () => {} });

export const usePrefs = () => useContext(PrefsContext);

/** Reduced motion if the setting is on or the OS asks for it. */
export function useReduceMotion(): boolean {
  const { prefs } = usePrefs();
  const [os, setOs] = useState(() => reduce().matches);
  useEffect(() => {
    const mq = reduce();
    const on = () => setOs(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return prefs.reduceMotion || os;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  // Seed from the pre-paint cache so the first render matches what the inline script painted.
  const [prefs, setPrefs] = useState<UserPrefs>(() => {
    try {
      const t = localStorage.getItem("tacit.theme");
      const r = localStorage.getItem("tacit.reduceMotion") === "true";
      return { ...DEFAULT_USER_PREFS, theme: t === "light" || t === "system" ? t : "dark", reduceMotion: r };
    } catch {
      return DEFAULT_USER_PREFS;
    }
  });

  // Load once per sign-in. A missing doc means defaults; a failed read keeps the cached prefs,
  // so a network or permission blip never overwrites the recruiter's saved choice.
  useEffect(() => {
    if (!uid) return; // signed out: keep the last prefs and cache
    let live = true;
    getDoc(doc(db, "userPrefs", uid))
      .then((s) => {
        if (!live) return;
        const p = parsePrefs(s.data());
        setPrefs(p);
        cachePrefs(p);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uid]);

  // Apply theme (and follow the OS live when "system"). A DEV ?theme= override wins.
  useEffect(() => {
    if (devParam(window.location.search, "theme")) return;
    const mq = dark();
    const apply = () => applyTheme(resolveTheme(prefs.theme, mq.matches));
    apply();
    if (prefs.theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme]);

  useEffect(() => {
    const mq = reduce();
    const apply = () => applyReduceMotion(prefs.reduceMotion || mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.reduceMotion]);

  const savePrefs = async (partial: Partial<UserPrefs>) => {
    const id = auth.currentUser?.uid;
    if (!id) return;
    const next = { ...prefs, ...partial };
    setPrefs(next);
    cachePrefs(next);
    await setDoc(doc(db, "userPrefs", id), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
  };

  return <PrefsContext.Provider value={{ prefs, savePrefs }}>{children}</PrefsContext.Provider>;
}

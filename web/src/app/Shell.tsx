import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { CommandPalette } from "../screens/S15-command-palette/CommandPalette";
import { useAuth } from "../features/auth";
import { Rail } from "./Rail";
import styles from "./Shell.module.css";

/** How long after a page change the shell keeps re-claiming focus for a heading that is replaced when data arrives. */
const CLAIM_WINDOW_MS = 4000;

/** Frame for every railed screen. S07 (/login) renders outside it. The page title is set by `RouteTitle` in routes.tsx. */
export function Shell() {
  const { role } = useAuth();
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const last = useRef(pathname);

  // After an in-app page change (not ?dialog= and not first load) move focus to the page heading so it is announced.
  // Screens render a loading heading that is swapped when data arrives, so keep claiming focus for a few seconds,
  // but only while nothing else holds it: never from a field, dialog or autofocus, and never after the user acts.
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const root = main.current;
    if (!root) return;

    const claim = (scroll: boolean) => {
      const a = document.activeElement;
      if (a && a !== document.body && a !== root && (root.contains(a) || a.closest('[role="dialog"], dialog'))) return;
      const el = root.querySelector<HTMLElement>("h1") ?? root;
      if (el === a) return;
      el.tabIndex = -1;
      el.focus({ preventScroll: !scroll });
    };
    claim(true);

    const observer = new MutationObserver(() => claim(false));
    observer.observe(root, { childList: true, subtree: true });
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("pointerdown", stop);
    };
    const timer = setTimeout(stop, CLAIM_WINDOW_MS);
    window.addEventListener("keydown", stop);
    window.addEventListener("pointerdown", stop);
    return stop;
  }, [pathname]);

  return (
    <>
      <a
        href="#main"
        className={styles.skip}
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <Rail />
      {role === "recruiter" && <CommandPalette />}{/* searches recruiter records only */}
      <main id="main" ref={main} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </>
  );
}

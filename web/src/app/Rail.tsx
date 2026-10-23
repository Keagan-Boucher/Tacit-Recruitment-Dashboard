import { NavLink } from "react-router";
import type { AccountRole, Submission } from "@tacit/shared";
import { initials, useAuth } from "../features/auth";
import { useOwned } from "../lib/data";
import { Logo } from "./Logo";
import styles from "./Rail.module.css";

type Item = { to: string; label: string; icon: string; end?: boolean; count?: number; compactHide?: boolean };

// Review sits under Dashboard on every recruiter screen (Keagan, 23 Oct; only the new frames show it).
const TOP: Record<AccountRole, Item[]> = {
  recruiter: [
    { to: "/", label: "Dashboard", icon: "bx-home", end: true },
    { to: "/review", label: "Review", icon: "bx-archive-in" },
    { to: "/candidates", label: "Candidates", icon: "bx-group" },
    { to: "/companies", label: "Companies", icon: "bx-buildings" },
    { to: "/roles", label: "Roles", icon: "bx-briefcase" },
    { to: "/brief", label: "Brief", icon: "bx-file" },
    // Eight 44 px items don't fit at 320; Widgets is also reachable from Settings → Manage widgets.
    { to: "/widgets", label: "Widgets", icon: "", compactHide: true },
  ],
  candidate: [
    { to: "/candidate", label: "Home", icon: "bx-home", end: true },
    { to: "/candidate/details", label: "My details", icon: "bx-file" },
  ],
  company: [
    { to: "/company", label: "Home", icon: "bx-home", end: true },
    { to: "/company/roles", label: "Roles", icon: "bx-briefcase" },
  ],
};
const settings: Item = { to: "/settings", label: "Settings", icon: "bx-cog" };

function RailItem({ to, label, icon, end, count, compactHide }: Item) {
  const tip = count ? `${label}, ${count} waiting` : label;
  return (
    <NavLink to={to} end={end} aria-label={tip} data-tip={tip} data-compact-hide={compactHide || undefined} className={styles.item}>
      {count ? <span className={`t-meta ${styles.count}`} aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}
      {icon ? (
        <i className={`bx ${icon}`} aria-hidden="true" />
      ) : (
        // Widgets glyph: four tiles, one round (not in Boxicons).
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
          <rect x="1" y="1" width="8" height="8" rx="2.5" />
          <rect x="11" y="1" width="8" height="8" rx="4" />
          <rect x="1" y="11" width="8" height="8" rx="2.5" />
          <rect x="11" y="11" width="8" height="8" rx="2.5" />
        </svg>
      )}
    </NavLink>
  );
}

/** Pending submissions for the recruiter's Review item; undefined while loading or before the rules allow the read. */
function usePendingCount(on: boolean): number | undefined {
  const { data } = useOwned<Submission>("submissions", on ? ["status", "pending"] : ["status", undefined]);
  return data?.length;
}

export function Rail() {
  const { user, role } = useAuth();
  const who = initials(user);
  const pending = usePendingCount(role === "recruiter");
  const top = TOP[role ?? "recruiter"].map((i) => (i.to === "/review" ? { ...i, count: pending } : i));
  return (
    <nav className={styles.rail} aria-label="Main">
      <Logo />
      <div className={styles.gap} />
      {top.map((i) => (
        <RailItem key={i.to} {...i} />
      ))}
      <div className={styles.spacer} />
      <RailItem {...settings} />
      <div className={styles.avatar} role="img" aria-label={`Signed in as ${who}`}>
        {who}
      </div>
    </nav>
  );
}

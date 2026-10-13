import { NavLink } from "react-router";
import { initials, useAuth } from "../features/auth";
import { Logo } from "./Logo";
import styles from "./Rail.module.css";

type Item = { to: string; label: string; icon: string; end?: boolean };

const top: Item[] = [
  { to: "/", label: "Dashboard", icon: "bx-home", end: true },
  { to: "/candidates", label: "Candidates", icon: "bx-group" },
  { to: "/companies", label: "Companies", icon: "bx-buildings" },
  { to: "/roles", label: "Roles", icon: "bx-briefcase" },
  { to: "/brief", label: "Brief", icon: "bx-file" },
  { to: "/widgets", label: "Widgets", icon: "" },
];
const settings: Item = { to: "/settings", label: "Settings", icon: "bx-cog" };

function RailItem({ to, label, icon, end }: Item) {
  return (
    <NavLink to={to} end={end} aria-label={label} data-tip={label} className={styles.item}>
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

export function Rail() {
  const { user } = useAuth();
  const who = initials(user);
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

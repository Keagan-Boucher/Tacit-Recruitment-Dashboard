import type { CSSProperties } from "react";
import styles from "./Icon.module.css";

/** Boxicons regular glyph, decorative. `name` is the class, e.g. "bx-search". Colour follows the parent text. */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <i
      className={`bx ${name} ${styles.icon}`}
      style={{ "--icon-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

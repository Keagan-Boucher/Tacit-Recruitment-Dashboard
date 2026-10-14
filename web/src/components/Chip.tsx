import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export type ChipTone = "neutral" | "quiet" | "for" | "against" | "stale" | "accent";

type Props = {
  /** for / against / stale are the only status colours. Always put a word (and a count or age) in the chip. */
  tone?: ChipTone;
  /** Chip sits on a lime surface: black fill or black outline. */
  onLime?: boolean;
  /** lg = 24 high (hero), default 22. */
  size?: "md" | "lg";
  /** Boxicon class before the text, e.g. "bx-error-circle" for "Low confidence". */
  icon?: string;
  children: ReactNode;
};

export function Chip({ tone = "neutral", onLime = false, size = "md", icon, children }: Props) {
  const cls = [styles.chip, "t-chip", styles[tone], onLime && styles.onLime, size === "lg" && styles.lg]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

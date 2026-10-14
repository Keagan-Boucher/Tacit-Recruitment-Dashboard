import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

type Props = {
  /** CSS length or number of px. Default 100%. */
  width?: number | string;
  height?: number | string;
  /** inner = rows and inputs, pill = chips and buttons, widget = whole cards. */
  radius?: "inner" | "pill" | "widget";
  /** Use 3 on top of a surface-2 block; lime on the lime hero card. */
  tone?: 2 | 3 | "lime";
  className?: string;
};

const px = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

/** Placeholder block in the shape of the real content. Decorative; pair the screen with one sentence saying what is loading. */
export function Skeleton({ width = "100%", height = 16, radius = "inner", tone = 2, className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={[styles.block, styles[`r-${radius}`], tone === 3 && styles.tone3, tone === "lime" && styles.toneLime, className].filter(Boolean).join(" ")}
      style={{ "--sk-w": px(width), "--sk-h": px(height) } as CSSProperties}
    />
  );
}

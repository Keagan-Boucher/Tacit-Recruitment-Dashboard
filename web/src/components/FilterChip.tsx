import type { ButtonHTMLAttributes } from "react";
import styles from "./FilterChip.module.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  selected: boolean;
  /** Shown after the label: "All 214". */
  count?: number;
};

/** Toggle chip (32 high). Selected = lime fill with the count. Reports state through aria-pressed. */
export function FilterChip({ selected, count, className, type = "button", children, ...rest }: Props) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[styles.root, "t-body-s-strong", selected && styles.selected, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
      {count !== undefined && <span className={`${styles.count} tabular`}>{count}</span>}
    </button>
  );
}

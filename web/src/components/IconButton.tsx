import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./IconButton.module.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** Boxicon class, e.g. "bx-dots-horizontal-rounded". */
  icon: string;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  size?: number;
};

/** Icon-only button with a 44 x 44 hit area. */
export function IconButton({ icon, label, size = 20, className, type = "button", title, ...rest }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={[styles.root, className].filter(Boolean).join(" ")}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

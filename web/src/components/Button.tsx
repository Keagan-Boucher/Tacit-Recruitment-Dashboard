import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "ghost" | "on-lime";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = the one lime button per page; ghost = everything else; on-lime = inside the lime hero. */
  variant?: ButtonVariant;
  /** Boxicon class before the label, e.g. "bx-plus". */
  icon?: string;
  /** Boxicon class after the label, e.g. "bx-chevron-right". */
  iconAfter?: string;
  fullWidth?: boolean;
  /** lg = 44 px tall (sign-in). Default md. */
  size?: "md" | "lg";
};

/** Class string for putting button styling on a router link or anchor: `<Link className={buttonClass("ghost")}>`. */
export function buttonClass(variant: ButtonVariant = "ghost", fullWidth = false, size: "md" | "lg" = "md") {
  return [styles.root, "t-body-m-strong", styles[variant], fullWidth && styles.full, size === "lg" && styles.lg].filter(Boolean).join(" ");
}

export function Button({ variant = "ghost", icon, iconAfter, fullWidth, size, className, type = "button", children, ...rest }: Props) {
  return (
    <button type={type} className={[buttonClass(variant, fullWidth, size), className].filter(Boolean).join(" ")} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </button>
  );
}

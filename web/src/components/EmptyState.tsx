import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type Props = {
  /** One sentence about what goes here. */
  message: string;
  /** One action, usually a ghost Button (or the primary Button when this is the page's one lime button). */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ message, action, className }: Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      <p className={`${styles.message} t-body-m-para`}>{message}</p>
      {action}
    </div>
  );
}

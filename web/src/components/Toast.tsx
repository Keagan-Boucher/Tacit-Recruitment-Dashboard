import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import styles from "./Toast.module.css";

/** Mount once near the root and keep it mounted: screen readers announce toasts added to a live region. */
export function ToastRegion({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {children}
    </div>
  );
}

type Props = {
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
};

/** Short confirmation ("Saved", "Moved to Not this one") with an optional single action such as Undo. */
export function Toast({ message, action, onDismiss }: Props) {
  return (
    <div className={styles.toast}>
      <p className={`${styles.message} t-body-m-strong`}>{message}</p>
      {action && (
        <button type="button" className={`${styles.action} t-body-m-strong`} onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && <IconButton icon="bx-x" label="Dismiss" size={18} className={styles.dismiss} onClick={onDismiss} />}
    </div>
  );
}

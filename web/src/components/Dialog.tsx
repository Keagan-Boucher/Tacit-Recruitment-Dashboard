import type { CSSProperties, KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { useEffect, useId, useRef } from "react";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  /** Called on Escape and on any other native close request. The parent flips `open`. */
  onClose: () => void;
  title: string;
  /** Small line above the title (role and company). */
  eyebrow?: string;
  description?: ReactNode;
  /** Right-aligned action row; Cancel then the primary action. */
  footer?: ReactNode;
  width?: number;
  children?: ReactNode;
};

/**
 * Modal built on the native <dialog>: showModal() gives the focus trap and inert background, the scrim is
 * ::backdrop. Escape closes; focus goes back to whatever opened it. Children mount only while open, so
 * form state resets each time.
 */
export function Dialog({ open, onClose, title, eyebrow, description, footer, width = 600, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    onClose();
  }

  function onCancel(e: SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.dialog}
      style={{ "--dialog-width": `${width}px` } as CSSProperties}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            {eyebrow && <p className={`${styles.eyebrow} t-caption`}>{eyebrow}</p>}
            <h2 id={titleId} className={`${styles.title} t-figure`}>
              {title}
            </h2>
            {description && <p className={`${styles.description} t-body-s-para`}>{description}</p>}
          </header>
          {children}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./ErrorBanner.module.css";

type Props = {
  /** What happened: "Couldn't load today's list." */
  title: string;
  /** Reassurance and fallback. Defaults to "Nothing was lost." */
  detail?: string;
  onRetry: () => void;
  className?: string;
};

export function ErrorBanner({ title, detail = "Nothing was lost.", onRetry, className }: Props) {
  return (
    <div className={[styles.banner, className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <span className={styles.icon}>
        <Icon name="bx-error-circle" size={20} />
      </span>
      <p className={`${styles.title} t-body-m-strong`}>{title}</p>
      <p className={`${styles.detail} t-body-s`}>{detail}</p>
      <Button icon="bx-refresh" onClick={onRetry} className={styles.retry}>
        Try again
      </Button>
    </div>
  );
}

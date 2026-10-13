import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type Props = {
  /** Optional 13 px context line above the headline; drop it when it repeats the headline. */
  context?: ReactNode;
  headline: ReactNode;
  /** Right-aligned actions (at most one lime button). */
  actions?: ReactNode;
};

export function PageHeader({ context, headline, actions }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.title}>
        {context ? <p className={`t-body-s ${styles.context}`}>{context}</p> : null}
        <h1 className="t-headline">{headline}</h1>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

import type { ScreeningRow } from "./helpers";
import styles from "./BriefRows.module.css";

/** "What Tacit read from the brief": per row the label, the value, then the brief phrase it came from.
 *  Reads in that order. A value with no quote (older roles) has no source line; a missing value says to ask the client. */
export function BriefRows({ rows }: { rows: ScreeningRow[] }) {
  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.key} className={styles.row}>
          <div className={styles.top}>
            <span className={`${styles.label} t-caption`}>{row.label}</span>
            <span className={`${row.value ? styles.value : styles.none} t-body-m-strong`}>{row.value ?? "Not mentioned"}</span>
          </div>
          {row.value === null ? (
            <p className={`${styles.ask} t-body-s-strong`}>Nothing in the brief. Ask the client before you shortlist.</p>
          ) : (
            row.quote && (
              <p className={`${styles.source} t-caption`}>
                <span className={styles.brief}>Brief · </span>
                <span className={styles.quote}>“{row.quote}”</span>
              </p>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

import styles from "./CandidateProfile.module.css";

/** "4 roles", "1 note": the numeral carries the weight, its word sits beside it in Caption. */
export function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className={styles.count}>
      <span className="t-body-s-bold tabular">{n}</span> <span className="t-caption">{n === 1 ? one : many}</span>
    </span>
  );
}

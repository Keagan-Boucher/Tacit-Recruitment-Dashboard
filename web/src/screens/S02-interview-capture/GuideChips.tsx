import { Icon } from "../../components";
import styles from "./InterviewCapture.module.css";

type Props = {
  questions: string[];
  asked: Set<string>;
  skipped: Set<string>;
  /** Read only (while Tacit reads the note, and after): chips show their state but do nothing. */
  locked: boolean;
  onInsert: (q: string) => void;
  onToggleSkip: (q: string) => void;
};

/** The recruiter's own questions. Tap = heading in the note and a tick; a skipped one is dashed. */
export function GuideChips({ questions, asked, skipped, locked, onInsert, onToggleSkip }: Props) {
  if (!questions.length) return null;
  return (
    <div className={styles.guide}>
      <p className="t-body-s-strong" id="guide-label">Question guide</p>
      <ul className={styles.chips} aria-labelledby="guide-label">
        {questions.map((q) => {
          const isAsked = asked.has(q);
          const isSkipped = !isAsked && skipped.has(q);
          const cls = [styles.chip, "t-body-s-strong", isAsked && styles.asked, isSkipped && styles.skipped].filter(Boolean).join(" ");
          const glyph = isAsked ? "bx-check" : isSkipped ? "bx-x" : "bx-plus";
          const label = (
            <>
              <Icon name={glyph} size={14} />
              {q}
              {isSkipped && <span className={`${styles.skipTag} t-meta`}>skipped</span>}
              {isAsked && <span className="sr-only">, asked</span>}
            </>
          );
          if (locked) {
            return (
              <li key={q} className={cls}>
                <span className={styles.chipStatic}>{label}</span>
              </li>
            );
          }
          return (
            <li key={q} className={cls}>
              {isSkipped ? (
                <button type="button" aria-pressed="true" title="Skipped. Tap to ask it after all." onClick={() => onToggleSkip(q)}>
                  {label}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => onInsert(q)}>{label}</button>
                  {!isAsked && (
                    <button type="button" className={styles.skipBtn} aria-label={`Skip: ${q}`} title="Skip this question" onClick={() => onToggleSkip(q)}>
                      <Icon name="bx-x" size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

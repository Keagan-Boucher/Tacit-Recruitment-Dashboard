import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Link } from "react-router";
import { LOW_CONFIDENCE, type Attribute } from "@tacit/shared";
import { Button, buttonClass, Chip, Icon } from "../../components";
import type { WithId } from "../../lib/data";
import type { Line } from "./capture";
import { TYPE_LABEL } from "./capture";
import styles from "./InterviewCapture.module.css";

export type Row = WithId<Attribute> & { n: number };
const shown = (r: Row) => r.editedValue || r.value;

// ---- the note, read only, with the phrases Tacit used underlined and numbered ----------------

type ReaderProps = { lines: Line[]; activeId: string | null; onSelect: (id: string | null) => void; locked: boolean };

export function Reader({ lines, activeId, onSelect, locked }: ReaderProps) {
  return (
    <div className={`${styles.reader} ${locked ? styles.locked : ""}`}>
      {lines.map((l, i) => {
        if (!l.parts.length) return <div key={i} className={styles.gap} />;
        return (
          <p key={i} className={`${styles.rline} ${l.heading ? `${styles.head} t-body-m-strong` : `${styles.body} t-note`}`}>
            {l.parts.map((p, j) => (p.id ? <Phrase key={j} id={p.id} n={p.n!} active={p.id === activeId} onSelect={onSelect}>{p.text}</Phrase> : <span key={j}>{p.text}</span>))}
          </p>
        );
      })}
    </div>
  );
}

function Phrase({ id, n, active, onSelect, children }: { id: string; n: number; active: boolean; onSelect: (id: string | null) => void; children: ReactNode }) {
  const toggle = () => onSelect(active ? null : id);
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  // A span, not a <button>: an inline button will not wrap across lines the way a long phrase has to.
  return (
    <span role="button" tabIndex={0} aria-pressed={active} data-phrase={id} className={`${styles.phrase} ${active ? styles.phraseOn : ""}`} onClick={toggle} onKeyDown={key}>
      {children}
      <sup className={`${styles.phraseNum} t-meta`}>{n}</sup>
    </span>
  );
}

// ---- What Tacit heard ----------------------------------------------------------------------

type HeardProps = {
  rows: Row[];
  text: string;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onKeep: (r: Row, keep: boolean) => void;
  onFix: (r: Row, value: string) => void;
  onKeepAll: () => void;
  /** Set when the last write failed; cleared by the next one that works. */
  problem: string | null;
  backTo: string;
};

export function Heard({ rows, text, activeId, onSelect, onKeep, onFix, onKeepAll, problem, backTo }: HeardProps) {
  const [fixing, setFixing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const kept = rows.filter((r) => r.confirmedByRecruiter).length;
  const unkept = rows.length - kept;

  const save = (r: Row) => {
    if (!value.trim()) return;
    onFix(r, value.trim());
    setFixing(null);
  };

  return (
    <section className={`${styles.card} ${styles.heard} ${styles.grow}`} aria-labelledby="heard-title">
      <header className={styles.heardHead}>
        <h3 id="heard-title" className="t-title">What Tacit heard</h3>
        <Chip>{kept} of {rows.length} kept</Chip>
      </header>
      <p className={`${styles.dim} t-body-s-para`}>Nothing is stored until you keep it.</p>

      {rows.length === 0 ? (
        <p className={`${styles.none} t-body-s-para`}>Nothing in this note could be tied to your words, so there is nothing to keep. The note itself is saved.</p>
      ) : (
        <ol className={styles.attrs}>
          {rows.map((r) => {
            const on = r.id === activeId;
            const low = r.confidence < LOW_CONFIDENCE;
            const quote = text.slice(r.sourceSpan.start, r.sourceSpan.end);
            const isKept = r.confirmedByRecruiter;
            const edited = Boolean(r.editedValue) && r.editedValue !== r.value;
            return (
              <li key={r.id} data-attr={r.id}>
                <div
                  className={`${styles.acard} ${on ? styles.on : ""}`}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("button, input")) onSelect(on ? null : r.id);
                  }}
                >
                  <div className={styles.arow}>
                    <span className={`${styles.marker} t-chip`} aria-hidden="true">{r.n}</span>
                    <span className={`${styles.atype} t-meta`}>{TYPE_LABEL[r.type]}</span>
                    <button type="button" className={`${styles.mini} t-caption-strong`} aria-pressed={isKept} aria-label={`${isKept ? "Kept" : "Keep"} ${r.n}: ${shown(r)}`} onClick={() => onKeep(r, !isKept)}>
                      <Icon name="bx-check" size={12} />
                      {isKept ? "Kept" : "Keep"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.mini} t-caption-strong`}
                      aria-label={`Fix ${r.n}: ${shown(r)}`}
                      onClick={() => {
                        setValue(shown(r));
                        setFixing(r.id);
                      }}
                    >
                      <Icon name="bx-pencil" size={12} />
                      Fix
                    </button>
                  </div>

                  {fixing === r.id ? (
                    <form
                      className={styles.fix}
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(r);
                      }}
                    >
                      <input
                        className={`${styles.fixInput} t-body-m`}
                        aria-label={`Wording for ${r.n}`}
                        value={value}
                        autoFocus
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setFixing(null)}
                      />
                      <div className={styles.fixBtns}>
                        <Button type="submit" variant="primary" size="lg" disabled={!value.trim()}>Save and keep</Button>
                        <Button size="lg" onClick={() => setFixing(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" className={styles.pick} aria-pressed={on} onClick={() => onSelect(on ? null : r.id)}>
                      <span className={`${styles.val} t-body-m-strong`}>
                        {shown(r)}
                        {edited && <span className="sr-only"> (edited, originally {r.value})</span>}
                      </span>
                      <span className={`${styles.quote} t-caption-para`}>“{quote}”</span>
                    </button>
                  )}

                  {low && (
                    <div className={styles.conf}>
                      <Chip icon="bx-error-circle">Low confidence</Chip>
                      {r.confidenceNote && <span className="t-caption-para">{r.confidenceNote}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {problem && (
        <p className={`${styles.problem} t-caption-para`} role="alert">
          <Icon name="bx-error-circle" size={14} />
          {problem}
        </p>
      )}

      <div className={styles.foot}>
        {unkept > 0 ? (
          <Button variant="primary" icon="bx-check" onClick={onKeepAll}>Keep all {unkept}</Button>
        ) : (
          <Link to={backTo} className={buttonClass("primary")}>
            <Icon name="bx-check" />
            Back to profile
          </Link>
        )}
        {unkept > 0 && <Link to={backTo} className={buttonClass("ghost")}>Save note only</Link>}
      </div>
    </section>
  );
}

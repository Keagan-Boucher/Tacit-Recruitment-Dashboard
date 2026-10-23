import { forwardRef, useId, useState } from "react";
import type { Ref } from "react";
import { Button, Icon } from "../../components";
import { decisionRow, factsLine, fmtDate, moreLabel, RECRUITER, reasonCount, sharedLine, whoLine } from "./shortlist";
import type { Entry } from "./shortlist";
import styles from "./CompanyShortlist.module.css";

export type Ask = "interviewing" | "hired" | "not-progressing";
type Props = { entry: Entry; onAsk: (kind: Ask, entry: Entry) => void };

/** Reasons shown per side before "and N more". */
const SHOWN = 1;

function Reasons({ tone, items, name }: { tone: "for" | "against"; items: Entry["case"]["for"]; name: string }) {
  const [all, setAll] = useState(false);
  const labelId = useId();
  const { n, word } = reasonCount(items.length, tone);
  const hidden = items.length - SHOWN;
  return (
    <div className={styles.reasons} role="group" aria-labelledby={labelId}>
      <p id={labelId} className={styles.count}>
        <span className={`${styles[tone]} t-body-s-bold tabular`}>{n}</span> <span className="t-caption">{word}</span>
      </p>
      <ul className={styles.reasonList}>
        {(all ? items : items.slice(0, SHOWN)).map((r, i) => (
          <li key={i}>
            <p className="t-body-m-strong">{r.text}</p>
            <p className={`${styles.source} t-caption`}>{RECRUITER} · {fmtDate(r.at)}</p>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" className={`${styles.more} t-caption`} aria-expanded={all} aria-label={all ? `Show fewer reasons ${tone} ${name}` : moreLabel(hidden, tone, name)} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `and ${hidden} more`}
        </button>
      )}
    </div>
  );
}

/** One person on the shortlist. A name appears only when the proxy has written `identity`. */
export const ShortlistCard = forwardRef(function ShortlistCard({ entry: e, onAsk }: Props, ref: Ref<HTMLElement>) {
  const row = decisionRow(e);
  const [changeNote, setChangeNote] = useState(false);
  const name = e.identity?.fullName || e.label;
  const shared = e.identity && sharedLine(e.identity);
  const closed = e.status === "not-progressing";
  const verdict = row.tone === "for" ? "bx-check" : row.tone === "against" ? "bx-x" : undefined;
  return (
    <article ref={ref} tabIndex={-1} aria-label={name} className={[styles.card, e.status === "interviewing" || e.status === "hired" ? styles.live : "", closed ? styles.closed : ""].join(" ")}>
      <header className={styles.who}>
        <h2 className="t-title">{name}</h2>
        <p className={`${styles.headline} t-body-s`}>{whoLine(e)}</p>
        {shared ? (
          <p className="t-caption-strong">
            <span className={styles.sharedLead}>{shared.lead}</span>
            <span className={`${styles.sharedRest} t-caption`}>{shared.rest}</span>
          </p>
        ) : (
          e.status === "shortlisted" && <p className={`${styles.note} t-caption`}>Name and contact shared when you move them to interviewing.</p>
        )}
      </header>

      <p className={`${styles.facts} t-body-s`}>{factsLine(e.facts)}</p>

      <div className={styles.case}>
        <Reasons tone="for" items={e.case.for} name={name} />
        <Reasons tone="against" items={e.case.against} name={name} />
      </div>

      <div className={styles.decision}>
        <div className={styles.state}>
          <p className={`${styles[row.tone]} ${styles.word} t-body-m-strong`}>
            {verdict && <Icon name={verdict} size={18} />}
            {row.word}
          </p>
          <p className={`${styles.note} t-caption`}>
            {row.line}
            {row.quote && <span className={styles.quote}>“{row.quote}”</span>}
          </p>
          {changeNote && (
            <p className={`${styles.note} t-caption`} role="status">
              A decision not to progress can’t be changed here. Ask {RECRUITER} if you’ve changed your mind.
            </p>
          )}
        </div>
        {row.actions.includes("not-progressing") && (
          <Button icon="bx-x" onClick={() => onAsk("not-progressing", e)} aria-label={`Not progressing: ${name}`}>
            Not progressing
          </Button>
        )}
        {row.actions.includes("interviewing") && (
          <Button iconAfter="bx-chevron-right" onClick={() => onAsk("interviewing", e)} aria-label={`Move to interviewing: ${name}`}>
            Move to interviewing
          </Button>
        )}
        {row.actions.includes("hired") && (
          <Button icon="bx-check" onClick={() => onAsk("hired", e)} aria-label={`Mark as hired: ${name}`}>
            Mark as hired
          </Button>
        )}
        {row.change && (
          <button type="button" className={`${styles.change} t-body-s-strong`} aria-expanded={changeNote} onClick={() => setChangeNote(!changeNote)} aria-label={`Change: ${name}`}>
            Change
          </button>
        )}
      </div>
    </article>
  );
});

import { useId } from "react";
import { Button, Chip, Icon } from "../../components";
import { CvFileActions } from "../../features/files";
import type { Person } from "./fixtures";
import { briefRows, changeRows, cvRows, day, duplicateLine, firstName, readNote, readWord } from "./review";
import type { Row, Sub } from "./review";
import styles from "./ReviewQueue.module.css";

function Sparkle() {
  return (
    <svg className={styles.spark} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className={styles.kv}>
      {rows.map((r) => (
        <div key={r.key} className={styles.kvRow}>
          <dt className="t-body-s">{r.label}</dt>
          <dd>
            {r.tags ? (
              <span className={styles.tags}>{r.tags.map((t) => <Chip key={t}>{t}</Chip>)}</span>
            ) : (
              r.lines?.map((l, i) => (
                <span key={l} className={`${styles.line} ${r.quiet ? styles.quietLine : ""} t-body-m`}>
                  {l}
                  {i === r.lines!.length - 1 && r.mark && <span className={`${styles.mark} t-caption-strong`}>{r.mark}</span>}
                </span>
              ))
            )}
            {r.tags && r.mark && <span className={`${styles.mark} t-caption-strong`}>{r.mark}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Props = {
  sub: Sub;
  /** Candidate name for a CV or details change, company name for a brief. */
  who: string;
  /** The existing candidate a CV may duplicate. */
  dup?: Person;
  busy: boolean;
  onPass: () => void;
  onNotAccepted: () => void;
};

/** The selected submission as it was sent, with the two decisions underneath. */
export function Detail({ sub, who, dup, busy, onPass, onNotAccepted }: Props) {
  const headId = useId();
  const sent = day(sub.submittedAt, true);
  const word = readWord(sub);
  const fileName = sub.fileRef?.split("/").pop() ?? "file";
  const isBrief = sub.kind === "brief";
  const name = firstName(who);

  return (
    <section aria-labelledby={headId} className={`${styles.card} ${styles.detail}`}>
      <div className={styles.top}>
        <div className={styles.who}>
          <h2 id={headId} className="t-figure">{sub.kind === "brief" ? sub.fields.title : who}</h2>
          <p className={`${styles.sub} t-body-s`}>
            {sub.kind === "cv" && `Sent ${sent}`}
            {sub.kind === "details-change" && `Updated details · sent ${sent}`}
            {sub.kind === "brief" && `${who} · sent ${sent}`}
            {sub.kind === "cv" && sub.correctedFields.includes("fullName") && <span className={`${styles.mark} t-caption-strong`}> · they corrected this</span>}
          </p>
        </div>
        {sub.fileRef && <CvFileActions className={styles.file} fileRef={sub.fileRef} fileName={fileName} viewLabel={isBrief ? "View brief" : "View CV"} />}
      </div>

      {dup && (
        <p className={`${styles.dup} t-body-s`}>
          <Icon name="bx-error" size={18} />
          <span>
            <strong className="t-body-s-strong">You may have met this person before. </strong>
            <span className={styles.dupLine}>{duplicateLine(dup)}</span>
          </span>
        </p>
      )}

      <div className={styles.columns}>
        {sub.kind === "brief" && (
          <div className={`${styles.panel} ${styles.theBrief}`}>
            <h3 className="t-body-m-strong">The brief</h3>
            <p className="t-body-s-para">{sub.text ? <>“{sub.text.replace(/^[“"]|[”"]$/g, "")}”</> : "Sent as a file. Open it to read the original."}</p>
          </div>
        )}
        <div className={styles.sent}>
          <h3 className={`${styles.sentHead} t-body-m-strong`}>
            {isBrief && <Sparkle />}
            {sub.kind === "brief" ? "What Tacit understood" : sub.kind === "cv" ? "What they sent" : "What changed"}
          </h3>
          <Rows rows={sub.kind === "cv" ? cvRows(sub) : sub.kind === "brief" ? briefRows(sub, who) : changeRows(sub)} />
        </div>
        {sub.kind === "cv" && (
          <div className={`${styles.panel} ${styles.read}`}>
            <p className={`${styles.kicker} t-caption`}>
              <Sparkle />
              How Tacit read it
            </p>
            <p className={`${styles[word.tone]} t-body-m-strong`}>{word.text}</p>
            <p className={`${styles.note} t-body-s-para`}>{readNote(sub)}</p>
          </div>
        )}
      </div>

      <div className={styles.divider} />
      <div className={styles.footer}>
        <p className={`${styles.footText} t-body-s`}>
          {sub.kind === "cv" && `Passing adds ${name} to the pool. If you do not accept, they see your reason on their dashboard.`}
          {sub.kind === "details-change" && `Passing updates ${name}’s details in the pool. If you do not accept, they see your reason.`}
          {sub.kind === "brief" && `Passing opens the role and starts your shortlist search. If you do not accept, ${who} sees your reason.`}
        </p>
        <Button icon="bx-x" onClick={onNotAccepted} disabled={busy}>Not accepted</Button>
        <Button variant="primary" icon="bx-check" onClick={onPass} disabled={busy}>
          {sub.kind === "cv" ? "Pass into the pool" : sub.kind === "brief" ? "Pass and open the role" : "Pass the update"}
        </Button>
      </div>
    </section>
  );
}

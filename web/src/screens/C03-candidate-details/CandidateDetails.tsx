import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app";
import { Button, buttonClass, Card, Chip, ErrorBanner, Icon, Skeleton } from "../../components";
import {
  cvFileName, detailRows, fmtDate, freshDetails, historyEvents, latestCv, pendingDetails, RECRUITER, RECRUITER_FIRST,
  type CandidatePortal,
} from "../../features/portal/candidate";
import { ChangeDetailsDialog, useSendDetails } from "../../features/portal/candidateChange";
import { useCandidateScreen } from "../../features/portal/candidateData";
import { ViewCv } from "../../features/portal/candidateViewCv";
import styles from "./CandidateDetails.module.css";

const mailto = (subject: string, body: string) => `mailto:${RECRUITER.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function Panel({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={[styles.panel, className].filter(Boolean).join(" ")}>
      <h2 id={id} className={`t-title ${styles.title}`}>{title}</h2>
      {children}
    </Card>
  );
}

export default function CandidateDetails() {
  const { data, error, retry, dev } = useCandidateScreen();
  return <Screen key={dev ?? "live"} data={data} error={!!error} retry={retry} dev={dev !== null} />;
}

function Screen({ data, error, retry, dev }: { data: CandidatePortal | undefined; error: boolean; retry: () => void; dev: boolean }) {
  const details = useSendDetails(dev);
  const [changing, setChanging] = useState({ open: false, n: 0 });

  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader headline={error ? "What you sent." : "Loading what you sent."} />
        {error && <ErrorBanner className={styles.banner} title="Couldn’t load what you sent." detail="Nothing was lost. It is all still saved." onRetry={retry} />}
        <div className={styles.cols}>
          <Skeleton radius="widget" height="100%" className={styles.sk} />
          <Skeleton radius="widget" height="100%" className={styles.sk} />
          <Skeleton radius="widget" height="100%" className={styles.sk} />
        </div>
      </div>
    );
  }

  const { submissions, updates, portalUser } = data;
  const cv = latestCv(submissions);
  const fresh = freshDetails(submissions);
  const rows = cv ? detailRows(cv, portalUser?.email, fresh) : [];
  const events = historyEvents(portalUser?.createdAt, submissions, updates);
  const waiting = details.sent || pendingDetails(submissions);

  return (
    <div className={styles.page}>
      <PageHeader
        headline="What you sent."
        actions={
          <>
            <Link to="/candidate/cv" className={buttonClass("ghost")}><Icon name="bx-upload" />Update my CV</Link>
            {cv && <Button variant="primary" icon="bx-pencil" onClick={() => setChanging((c) => ({ open: true, n: c.n + 1 }))}>Change my details</Button>}
          </>
        }
      />
      {details.failed && <ErrorBanner className={styles.banner} title="Couldn’t send your details." detail="Nothing was lost. Your current details are unchanged." onRetry={details.retry} />}
      <div className={styles.cols}>
        <Panel title="Your CV">
          {cv ? (
            <>
              <div className={styles.file}>
                <Icon name="bx-file" size={20} />
                <span className={styles.stack}>
                  <span className={`t-body-m-strong ${styles.fileName}`}>{cv.fileRef ? cvFileName(cv.fileRef) : "Your CV"}</span>
                  <span className={`t-body-s ${styles.quiet}`}>Sent {fmtDate(cv.submittedAt)}</span>
                </span>
              </div>
              <div className={styles.buttons}>
                {cv.fileRef && <ViewCv fileRef={cv.fileRef} />}
                <Link to="/candidate/cv" className={buttonClass("ghost")}><Icon name="bx-upload" />Replace</Link>
              </div>
            </>
          ) : (
            <>
              <p className={`t-body-m-para ${styles.body}`}>You haven’t sent a CV yet. Once you do, it shows here exactly as you sent it.</p>
              <Link to="/candidate/cv" className={`${buttonClass("ghost")} ${styles.start}`}><Icon name="bx-upload" />Upload your CV</Link>
            </>
          )}
          <span className={styles.spacer} />
          <div className={styles.note}>
            <p className="t-body-m-strong">Only you and your recruiter see this</p>
            <p className={`t-body-s-para ${styles.body}`}>This page shows exactly what you sent. Changes go back to {RECRUITER_FIRST} to check before they replace what is in the pool.</p>
          </div>
        </Panel>

        <Panel title="Your details" className={styles.details}>
          <div aria-live="polite">
            {waiting && <p className={`t-body-s-strong ${styles.sentLine}`}><Icon name="bx-check" />Sent for review. The pool keeps your old details until {RECRUITER_FIRST} passes it.</p>}
          </div>
          {rows.length === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>Nothing to show yet.</p>
          ) : (
            <dl className={styles.kv}>
              {rows.map((r) => (
                <div key={r.label} className={styles.kvRow}>
                  <dt className={`t-body-s ${styles.quiet}`}>{r.label}</dt>
                  <dd className="t-body-m">
                    {r.text?.map((line) => <p key={line}>{line}</p>)}
                    {r.tags && <ul className={styles.tags}>{r.tags.map((s) => <li key={s}><Chip>{s}</Chip></li>)}</ul>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        <div className={styles.right}>
          <Panel title="History" className={styles.history}>
            <ul className={styles.events} tabIndex={0} aria-label="History events">
              {events.map((e) => (
                <li key={e.id} className={styles.event}>
                  <Icon name={e.icon} size={20} />
                  <span className={styles.stack}>
                    <span className="t-body-m-strong">{e.title}</span>
                    <span className={`t-body-s ${styles.quiet}`}>{e.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Your data" className={styles.data}>
            <p className={`t-body-s-para ${styles.body}`}>You can ask for a copy of everything Tacit holds about you, or for it to be deleted.</p>
            <span className={styles.spacer} />
            <a className={`${buttonClass("ghost")} ${styles.start}`} href={mailto("Request a copy of my data", `Hi ${RECRUITER_FIRST}, please send me a copy of everything Tacit holds about me.`)}>Request a copy</a>
            <a className={`${buttonClass("ghost")} ${styles.start} ${styles.danger}`} href={mailto("Delete my account", `Hi ${RECRUITER_FIRST}, please delete my Tacit account and everything you hold about me.`)}>Delete my account</a>
          </Panel>
        </div>
      </div>

      <ChangeDetailsDialog key={changing.n} open={changing.open} onClose={() => setChanging((c) => ({ ...c, open: false }))} initial={fresh} sending={details.sending} onSend={details.send} />
    </div>
  );
}

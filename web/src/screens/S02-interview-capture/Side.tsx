import { Link } from "react-router";
import type { Company, InterviewNote, Role } from "@tacit/shared";
import { Button, buttonClass, Icon, Skeleton } from "../../components";
import { budgetLine, fmtDate, stripHeadings } from "./capture";
import styles from "./InterviewCapture.module.css";

/** Four-point star, the "Tacit is reading" mark. */
export function Sparkle({ size = 18 }: { size?: number }) {
  return (
    <svg className={styles.spark} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

/** The role this interview is for, from the brief the model understood. */
export function RoleCard({ role, company }: { role: Role; company: Company | null | undefined }) {
  const b = role.interpretedBrief;
  const rows: [string, string][] = b
    ? [
        ["Work mode", [b.workMode, b.location].filter(Boolean).join(", ")],
        ["Budget", budgetLine(b.budget)],
        ["Must have", b.mustHave.join(", ")],
      ]
    : [];
  return (
    <section className={`${styles.card} ${styles.stack}`} aria-labelledby="role-title">
      <p className={`${styles.sub} t-body-s-strong`}>Interviewing for</p>
      <div>
        <h3 id="role-title" className="t-title">{role.title}</h3>
        {company && <p className={`${styles.sub} t-body-s`}>{company.name}</p>}
      </div>
      {rows.length > 0 && (
        <dl className={styles.rows}>
          {rows.map(([k, v]) => (
            <div key={k} className={`${styles.row} t-body-s`}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function EarlierNote({ note, questions }: { note: InterviewNote; questions: string[] }) {
  return (
    <section className={`${styles.card} ${styles.earlier}`} aria-labelledby="earlier-title">
      <header className={styles.earlierHead}>
        <h3 id="earlier-title" className="t-body-s-strong">Earlier note</h3>
        <span className="t-caption">{fmtDate(note.capturedAt)}</span>
      </header>
      <p className={`${styles.clamp} t-body-s-para`}>{stripHeadings(note.rawText, questions)}</p>
    </section>
  );
}

export function Hint({ first }: { first: string }) {
  return (
    <section className={`${styles.card} ${styles.hint}`}>
      <Sparkle />
      <p className="t-body-s-para">When you press Done, Tacit pulls out skills, salary and what {first} wants next.</p>
    </section>
  );
}

/** While the model reads: one sentence of what is happening, and the shape of what is coming. */
export function Working({ first }: { first: string }) {
  return (
    <section className={`${styles.card} ${styles.working} ${styles.grow}`} aria-busy="true">
      <p className={`${styles.say} t-body-s`}>
        <Sparkle />
        <span>Reading your note for skills, salary and what {first} wants next…</span>
      </p>
      <h3 className={`${styles.dim} t-title`}>What Tacit heard</h3>
      <div className={styles.skel} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.skelRow}>
            <div className={styles.skelTop}>
              <Skeleton width={20} height={20} radius="pill" tone={3} />
              <Skeleton width={`${12 + ((i * 7) % 10)}%`} height={9} tone={3} />
              <span className={styles.skelGrow} />
              <Skeleton width={54} height={22} radius="pill" tone={3} />
              <Skeleton width={46} height={22} radius="pill" tone={3} />
            </div>
            <Skeleton width={`${50 + ((i * 17) % 30)}%`} height={11} tone={3} />
            <Skeleton width={`${40 + ((i * 13) % 40)}%`} height={9} tone={3} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The note is safe; the reading (or the save itself) did not work. */
export function Failed({ kind, onRetry, backTo }: { kind: "ai" | "save"; onRetry: () => void; backTo: string }) {
  const ai = kind === "ai";
  return (
    <section className={`${styles.card} ${styles.failed}`}>
      <span className={styles.ico}><Icon name="bx-error-circle" size={22} /></span>
      <h3 className="t-title">{ai ? "Couldn’t read this reliably" : "Couldn’t save this yet"}</h3>
      <p className="t-body-s">
        {ai ? "Your note is saved." : "Your text is kept in this browser and Tacit keeps retrying."}
      </p>
      <div className={styles.btns}>
        <Button variant="primary" icon="bx-refresh" onClick={onRetry}>Try again</Button>
        {ai && <Link to={backTo} className={buttonClass("ghost")}>Keep note only</Link>}
      </div>
    </section>
  );
}

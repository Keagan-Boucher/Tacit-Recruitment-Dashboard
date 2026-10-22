import type { KeyboardEvent, ReactNode } from "react";
import { Link } from "react-router";
import type { InterviewNote, Role, Company } from "@tacit/shared";
import { buttonClass, Card, EmptyState, Icon } from "../../components";
import type { WithId } from "../../lib/data";
import { Count } from "./Count";
import { ageText, fmtDate, fmtDay, pieces, type Observed } from "./profile";
import styles from "./CandidateProfile.module.css";

type Select = (id: string | null) => void;

/** "Your note · 12 Aug 2025 · 14 months ago · “quote”": the age only when the fact is perishable and stale. */
function SourceLine({ o }: { o: Observed }) {
  const age = ageText(o);
  return (
    <span className={`${styles.sourceLine} t-caption-para`}>
      <span className={styles.source}>{o.source} · </span>
      {age && (
        <>
          <span className={`${styles.age} t-caption-strong`}>{age}</span>
          <span className={styles.source}> · </span>
        </>
      )}
      <span className={styles.quote}>“{o.quote}”</span>
    </span>
  );
}

type ObservedProps = {
  candidateId: string;
  observed: Observed[];
  unkept: { noteId: string; count: number; capturedAt: Date }[];
  activeId: string | null;
  onSelect: Select;
  /** No notes at all: the card becomes the prompt to capture the first interview. */
  noNotes: boolean;
};

/** What the recruiter observed: confirmed attributes only, each with the phrase it came from. */
export function ObservedPanel({ candidateId, observed, unkept, activeId, onSelect, noNotes }: ObservedProps) {
  const active = observed.find((o) => o.id === activeId);
  return (
    <Card className={styles.observed} role="region" aria-labelledby="observed-title">
      <h2 id="observed-title" className="t-title">What you observed</h2>
      {noNotes ? (
        <EmptyState
          message="Nothing observed yet. Capture the first interview and what you learn shows up here, each point linked to your own words."
          action={
            <Link to={`/candidates/${candidateId}/notes/new`} className={buttonClass("ghost", false, "lg")}>
              <Icon name="bx-plus" />
              Capture the first interview
            </Link>
          }
        />
      ) : (
        <>
          {observed.length ? (
            <ol className={styles.attrList}>
              {observed.map((o) => {
                const on = o.id === activeId;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className={on ? `${styles.attr} ${styles.attrOn}` : styles.attr}
                      aria-pressed={on}
                      data-attr={o.id}
                      title={o.original ? `Originally: ${o.original}` : undefined}
                      onClick={() => onSelect(on ? null : o.id)}
                    >
                      <span className={`${styles.attrNum} t-caption-strong`}>{o.n}</span>
                      <span className={styles.attrBody}>
                        <span className="t-body-m-strong">
                          {o.label}
                          {o.original && <span className="sr-only"> (edited, originally {o.original})</span>}
                        </span>
                        <SourceLine o={o} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="t-body-s-para">Nothing kept from your notes yet.</p>
          )}
          {unkept.map((u) => (
            <Link key={u.noteId} className={`${styles.unkept} t-body-s-strong`} to={`/candidates/${candidateId}/notes/new?note=${u.noteId}`}>
              {u.count} from {fmtDay(u.capturedAt)} not yet kept
            </Link>
          ))}
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {active ? `Source shown: “${active.quote}”, ${active.source}${ageText(active) ? `, ${ageText(active)}` : ""}` : ""}
      </p>
    </Card>
  );
}

function Phrase({ id, n, active, quiet, onSelect, children }: { id: string; n: number; active: boolean; quiet: boolean; onSelect: Select; children: ReactNode }) {
  const toggle = () => onSelect(active ? null : id);
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  // A span, not a <button>: inline buttons will not wrap across lines the way a long phrase has to.
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={active}
      data-phrase={id}
      className={active ? `${styles.phrase} ${styles.phraseOn}` : quiet ? `${styles.phrase} ${styles.phraseQuiet}` : styles.phrase}
      onClick={toggle}
      onKeyDown={key}
    >
      {children}
      <sup className={`${styles.phraseNum} t-meta`}>{n}</sup>
    </span>
  );
}

type NotesProps = {
  notes: WithId<InterviewNote>[];
  observed: Observed[];
  roles: WithId<Role>[];
  companies: WithId<Company>[];
  activeId: string | null;
  onSelect: Select;
};

/** Dated timeline, newest first. Each older note reads weaker (text colour steps down); phrases an attribute came from are underlined. */
export function NotesPanel({ notes, observed, roles, companies, activeId, onSelect }: NotesProps) {
  const context = (n: WithId<InterviewNote>) => {
    const role = roles.find((r) => r.id === n.roleContextId);
    const company = companies.find((c) => c.id === role?.companyId);
    return role ? `Interview, ${role.title}${company ? ` at ${company.name}` : ""}` : "Interview";
  };
  return (
    <Card className={styles.notes} role="region" aria-labelledby="notes-title">
      <header className={styles.panelHead}>
        <h2 id="notes-title" className="t-title">Interview notes</h2>
        <Count n={notes.length} one="note" many="notes" />
      </header>
      <ol className={styles.noteList}>
        {notes.map((n, i) => {
          return (
            <li key={n.id} className={`${styles.note} ${styles[`fade${Math.min(i, 2)}`]}`}>
              <div className={styles.noteMeta}>
                <p className="t-caption-strong">{fmtDate(n.capturedAt)}</p>
                <p className="t-caption-para">{context(n)}</p>
              </div>
              <p className={`${styles.noteText} t-body-s-para`}>
                {pieces(n.rawText, observed.filter((o) => o.noteId === n.id)).map((p, i) =>
                  p.id ? (
                    <Phrase key={i} id={p.id} n={p.n!} active={p.id === activeId} quiet={activeId !== null} onSelect={onSelect}>
                      {p.text}
                    </Phrase>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

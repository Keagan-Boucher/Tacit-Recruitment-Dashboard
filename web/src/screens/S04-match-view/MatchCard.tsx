import { useId, useState } from "react";
import { Link } from "react-router";
import type { Alignment, Attribute, Candidate, Match, Override, Reason } from "@tacit/shared";
import { monthsSince } from "@tacit/shared";
import { Button, Card, Icon } from "../../components";
import type { WithId } from "../../lib/data";
import { agedFacts, decisionNote, evidencedCount, forgottenNow, provenance } from "./match";
import styles from "./MatchView.module.css";

type Props = {
  match: WithId<Match>;
  candidate: WithId<Candidate> | undefined;
  attrs: Map<string, WithId<Attribute>>;
  decision: WithId<Override> | undefined;
  /** The lead card: lime outline. */
  focal: boolean;
  now: Date;
  saving: boolean;
  onShortlist: () => void;
  onReject: () => void;
  /** "Change" on a decided card. No reversal flow exists yet, so S04 opens the S06 dialog; defaults to onReject. */
  onChange?: () => void;
};

/** Reasons shown per column before "and N more". */
const SHOWN = 2;

/** "Your note · 12 Aug 2025 · 14 months ago": the link to the cited sentence on S03; the age only when that fact is stale. */
function Source({ ids, attrs, now }: { ids: string[]; attrs: Map<string, WithId<Attribute>>; now: Date }) {
  const p = provenance(ids, attrs, now);
  if (!p) return null;
  return (
    <Link to={`/candidates/${p.candidateId}?attr=${encodeURIComponent(p.attributeId)}`} className={`${styles.sourceLink} t-caption`}>
      {p.text}
      {p.age && <> · <span className={`${styles.age} t-caption-strong`}>{p.age}</span></>}
      <span className="sr-only"> — show source</span>
    </Link>
  );
}

/** "stated in your note · 12 Aug 2025 · <evidence>" (age only for a stale perishable fact), or "Not in your notes". */
function AlignEvidence({ a, attrs, now }: { a: Alignment; attrs: Props["attrs"]; now: Date }) {
  if (a.kind === "not-seen") return <p className={`${styles.notSeen} t-caption`}>Not in your notes</p>;
  const p = provenance(a.attributeIds, attrs, now);
  const verb = a.kind === "stated" ? "stated in" : "interpreted from";
  const from = p?.text.replace(/^Your /, "your ").replace(/^Brief/, "the brief") ?? "your notes";
  const line = (
    <>
      {verb} {from} · <span className={styles.quote}>{a.evidence}</span>{/* the model's explanation, not a verbatim quote: no quote marks */}
      {p?.age && <> · <span className={`${styles.age} t-caption-strong`}>{p.age}</span></>}
    </>
  );
  return p ? (
    <Link to={`/candidates/${p.candidateId}?attr=${encodeURIComponent(p.attributeId)}`} className={`${styles.sourceLink} t-caption`}>
      {line}
      <span className="sr-only"> — show source</span>
    </Link>
  ) : (
    <p className={`${styles.sourceLink} t-caption`}>{line}</p>
  );
}

function Reasons({ tone, reasons, empty, attrs, now }: { tone: "for" | "against"; reasons: Reason[]; empty: string; attrs: Props["attrs"]; now: Date }) {
  const [all, setAll] = useState(false);
  const labelId = useId();
  const hidden = reasons.length - SHOWN;
  const shown = all ? reasons : reasons.slice(0, SHOWN);
  return (
    <div className={styles.reasons} role="group" aria-labelledby={labelId}>
      <p id={labelId} className={styles.label}>
        <span className={`${tone === "for" ? styles.for : styles.against} t-body-s-bold tabular`}>{reasons.length}</span>{" "}
        <span className="t-caption">{reasons.length === 1 ? "reason" : "reasons"} {tone}</span>
      </p>
      {reasons.length ? (
        <>
          <ul className={styles.reasonList}>
            {shown.map((r, i) => (
              <li key={i}>
                <p className="t-body-m-strong">{r.text}</p>
                <Source ids={r.attributeIds} attrs={attrs} now={now} />
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" className={`${styles.andMore} t-caption`} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `and ${hidden} more`}
            </button>
          )}
        </>
      ) : (
        <p className={`${styles.none} t-body-m-strong`}>{empty}</p>
      )}
    </div>
  );
}

export function MatchCard({ match: m, candidate: c, attrs, decision, focal, now, saving, onShortlist, onReject, onChange }: Props) {
  const first = c?.fullName.split(" ")[0] ?? "this person";
  const aged = agedFacts([...m.reasonsFor, ...m.reasonsAgainst, ...m.skillAlignment].flatMap((x) => x.attributeIds), attrs, now);
  const hasFooter = m.staleness !== "fresh" || m.questionsToAsk.length > 0;
  const align = evidencedCount(m.skillAlignment);
  const actions = (
    <div className={styles.actions}>
      <Button size="lg" icon="bx-check" onClick={onShortlist} disabled={saving} aria-label={`Shortlist ${c?.fullName ?? ""}`.trim()}>Shortlist</Button>
      <Button size="lg" icon="bx-x" onClick={onReject} disabled={saving} aria-label={`Not this one: ${c?.fullName ?? ""}`.trim()}>Not this one</Button>
    </div>
  );
  const note = decision && decisionNote(decision);
  const shortlisted = decision?.decision === "shortlist";

  return (
    <Card className={`${styles.card} ${focal ? styles.focal : ""}`} role="article" aria-label={c?.fullName ?? "Suggestion"}>
      <div className={styles.main}>
        <header className={styles.who}>
          <div className={styles.name}>
            <span className={`${styles.rank} t-caption tabular`}>{String(m.rank).padStart(2, "0")}</span>
            {c ? (
              <Link to={`/candidates/${c.id}`} className="t-title">{c.fullName}</Link>
            ) : (
              <span className="t-title">Candidate no longer available</span>
            )}
          </div>
          {c && <p className={`${styles.headline} t-body-s`}>{c.headline}</p>}
          {forgottenNow(c, now) && (
            <p className={`${styles.opened} t-caption`}>
              {c?.lastOpenedAt ? <>Not opened in <span className={`${styles.age} t-caption-strong`}>{monthsSince(c.lastOpenedAt, now)} months</span></> : "Not opened yet"}
            </p>
          )}
          {decision && note ? (
            <div className={styles.decision}>
              <p className={`${shortlisted ? styles.for : styles.against} ${styles.verdict} t-body-m-strong`}>
                <Icon name={shortlisted ? "bx-check" : "bx-x"} size={18} />
                {shortlisted ? "Shortlisted" : "Not this one"}
              </p>
              <p className={`${styles.note} t-caption`}>
                {note.text}
                {note.quote && <> · <span className={styles.quote}>“{note.quote}”</span></>}
              </p>
              <button type="button" className={`${styles.change} t-body-s-strong`} onClick={onChange ?? onReject} aria-label={`Change decision on ${c?.fullName ?? "this person"}`}>
                Change
              </button>
            </div>
          ) : (
            !hasFooter && <div className={styles.decide}>{actions}</div>
          )}
        </header>

        <div className={styles.reasonPair}>
          <Reasons tone="for" reasons={m.reasonsFor} empty="Nothing for in the notes yet." attrs={attrs} now={now} />
          <Reasons tone="against" reasons={m.reasonsAgainst} empty="Tacit couldn't ground a reason against in your notes. Check fit, location and pay yourself." attrs={attrs} now={now} />
        </div>
      </div>

      {m.skillAlignment.length > 0 && (
        <section className={styles.align} aria-label={`Skill alignment for ${first}`}>
          <h3 className={`${styles.alignHead} t-body-s-strong`}>
            Skill alignment{" "}
            <span className="t-body-s-bold tabular">{align.n}</span>{" "}
            <span className="t-caption">of {align.total} in your notes</span>
          </h3>
          <ul className={styles.alignList}>
            {m.skillAlignment.map((a, i) => (
              <li key={i} className={styles.alignRow}>
                <p className="t-body-s-strong">{a.requirement}</p>
                <AlignEvidence a={a} attrs={attrs} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasFooter && (
        <footer className={styles.ask}>
          <div className={styles.askText}>
            <span className={styles.askIcon}><Icon name="bx-time-five" size={18} /></span>
            <div className={styles.askBody}>
              <p className="t-body-s-strong">
                {m.questionsToAsk.length ? "Before you shortlist, ask:" : "Check what has changed before you shortlist."}
              </p>
              {m.questionsToAsk.length > 0 && (
                <ul className={styles.questions}>
                  {m.questionsToAsk.map((q, i) => <li key={i} className="t-body-s-para">{q}</li>)}
                </ul>
              )}
              {aged.map((f) => (
                <Link key={f.id} to={`/candidates/${f.candidateId}?attr=${encodeURIComponent(f.id)}`} className={`${styles.sourceLink} t-caption`}>
                  {f.label} · {f.text}
                  {f.age && <> · <span className={`${styles.age} t-caption-strong`}>{f.age}</span></>}
                  <span className="sr-only"> — show source</span>
                </Link>
              ))}
            </div>
          </div>
          {!decision && actions}
        </footer>
      )}
    </Card>
  );
}

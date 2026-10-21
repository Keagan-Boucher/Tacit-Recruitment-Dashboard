import { useId, useState } from "react";
import { Link } from "react-router";
import type { Attribute, Candidate, Match, Override, Reason } from "@tacit/shared";
import { monthsSince } from "@tacit/shared";
import { Button, Card, Chip, Icon } from "../../components";
import type { WithId } from "../../lib/data";
import { ALIGN_LABEL, evidencedCount, forgottenNow, provenance } from "./match";
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

export function MatchCard({ match: m, candidate: c, attrs, decision, focal, now, saving, onShortlist, onReject }: Props) {
  const first = c?.fullName.split(" ")[0] ?? "this person";
  const evidenceMonths = monthsSince(new Date(now.getTime() - m.evidenceAgeDays * 86_400_000), now); // calendar months, same as the ages on the reasons
  const hasFooter = m.staleness !== "fresh" || m.questionsToAsk.length > 0;
  const actions = decision ? (
    <Chip tone={decision.decision === "shortlist" ? "for" : "against"} icon={decision.decision === "shortlist" ? "bx-check" : "bx-x"}>
      {decision.decision === "shortlist" ? "Shortlisted" : "Not this one"}
    </Chip>
  ) : (
    <div className={styles.actions}>
      <Button size="lg" icon="bx-check" onClick={onShortlist} disabled={saving} aria-label={`Shortlist ${c?.fullName ?? ""}`.trim()}>Shortlist</Button>
      <Button size="lg" icon="bx-x" onClick={onReject} disabled={saving} aria-label={`Not this one: ${c?.fullName ?? ""}`.trim()}>Not this one</Button>
    </div>
  );

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
          {!hasFooter && <div className={styles.decide}>{actions}</div>}
        </header>

        <div className={styles.reasonPair}>
          <Reasons tone="for" reasons={m.reasonsFor} empty="Nothing for in the notes yet." attrs={attrs} now={now} />
          <Reasons tone="against" reasons={m.reasonsAgainst} empty="Tacit couldn't ground a reason against in your notes. Check fit, location and pay yourself." attrs={attrs} now={now} />
        </div>
      </div>

      {m.skillAlignment.length > 0 && (
        <section className={styles.align} aria-label={`Skill alignment for ${first}`}>
          <header className={styles.alignHead}>
            <h3 className="t-body-s-strong">Skill alignment</h3>
            <span className="t-caption tabular">{evidencedCount(m.skillAlignment)}</span>
          </header>
          <ul className={styles.alignList}>
            {m.skillAlignment.map((a, i) => (
              <li key={i} className={styles.alignRow}>
                <p className="t-body-s-strong">{a.requirement}</p>
                <Chip tone={a.kind === "not-seen" ? "quiet" : "neutral"}>{ALIGN_LABEL[a.kind]}</Chip>
                <div className={styles.alignEvidence}>
                  <p className="t-body-s-para">{a.evidence}</p>
                  <Source ids={a.attributeIds} attrs={attrs} now={now} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasFooter && (
        <footer className={styles.ask}>
          <div className={styles.askText}>
            <span className={styles.askIcon}><Icon name="bx-time-five" size={18} /></span>
            <div>
              <p className="t-body-s-para">
                {m.staleness === "fresh"
                  ? "Worth asking before you shortlist:"
                  : `This evidence is ${evidenceMonths} months old. ${m.questionsToAsk.length ? "Before you shortlist, ask:" : "Check what has changed before you shortlist."}`}
              </p>
              {m.questionsToAsk.length > 0 && (
                <ul className={styles.questions}>
                  {m.questionsToAsk.map((q, i) => <li key={i} className="t-body-s-para">{q}</li>)}
                </ul>
              )}
            </div>
          </div>
          {actions}
        </footer>
      )}
    </Card>
  );
}

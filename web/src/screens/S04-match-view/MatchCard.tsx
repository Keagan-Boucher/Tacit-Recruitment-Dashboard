import { Link } from "react-router";
import type { Attribute, Candidate, Match, Override, Reason } from "@tacit/shared";
import { monthsSince } from "@tacit/shared";
import { Button, Card, Chip, Icon } from "../../components";
import type { WithId } from "../../lib/data";
import { ALIGN_LABEL, evidencedCount, provenance } from "./match";
import styles from "./MatchView.module.css";

type Props = {
  match: WithId<Match>;
  candidate: WithId<Candidate> | undefined;
  attrs: Map<string, WithId<Attribute>>;
  decision: WithId<Override> | undefined;
  /** The lead card: lime outline, larger name. */
  focal: boolean;
  now: Date;
  saving: boolean;
  onShortlist: () => void;
  onReject: () => void;
};

const MONTH = 30.4375;

function Source({ ids, attrs, now }: { ids: string[]; attrs: Map<string, WithId<Attribute>>; now: Date }) {
  const p = provenance(ids, attrs, now);
  if (!p) return null;
  return (
    <span className={styles.source}>
      <span className="t-meta">{p.source}</span>
      {p.staleness !== "fresh" && <Chip tone="stale">{p.staleness === "stale" ? "Stale" : "Ageing"} · {p.months} mo</Chip>}
    </span>
  );
}

function Reasons({ tone, label, reasons, empty, attrs, now }: { tone: "for" | "against"; label: string; reasons: Reason[]; empty: string; attrs: Props["attrs"]; now: Date }) {
  return (
    <div className={styles.reasons}>
      <span className={styles.chipRow}><Chip tone={tone}>{label} · {reasons.length}</Chip></span>
      {reasons.length ? (
        <ul className={styles.reasonList}>
          {reasons.map((r, i) => (
            <li key={i}>
              <p className="t-body-s-para">{r.text}</p>
              <Source ids={r.attributeIds} attrs={attrs} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${styles.none} t-body-s-para`}>{empty}</p>
      )}
    </div>
  );
}

export function MatchCard({ match: m, candidate: c, attrs, decision, focal, now, saving, onShortlist, onReject }: Props) {
  const first = c?.fullName.split(" ")[0] ?? "this person";
  const evidenceMonths = Math.floor(m.evidenceAgeDays / MONTH);
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
      <header className={styles.cardHead}>
        <span className={`${styles.rank} t-body-s-strong tabular`}>{String(m.rank).padStart(2, "0")}</span>
        <div className={styles.who}>
          {c ? (
            <Link to={`/candidates/${c.id}`} className={focal ? "t-figure" : "t-title"}>{c.fullName}</Link>
          ) : (
            <span className="t-title">Candidate no longer available</span>
          )}
          {c && <p className="t-body-s">{c.headline}</p>}
        </div>
        {m.forgotten && (
          <Chip icon="bx-history">
            {c?.lastOpenedAt ? `Not opened in ${monthsSince(c.lastOpenedAt, now)} months` : "Not opened yet"}
          </Chip>
        )}
        {!hasFooter && actions}
      </header>

      <div className={styles.reasonPair}>
        <Reasons tone="for" label="For" reasons={m.reasonsFor} empty="Nothing for in the notes yet." attrs={attrs} now={now} />
        <Reasons tone="against" label="Against" reasons={m.reasonsAgainst} empty="Nothing against in the notes: evidence is thin." attrs={attrs} now={now} />
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

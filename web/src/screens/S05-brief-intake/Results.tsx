import { useMemo, useState } from "react";
import { Link } from "react-router";
import { addDoc, collection } from "firebase/firestore";
import type { Attribute, Candidate, Company, Match, Override, Role } from "@tacit/shared";
import { PageHeader } from "../../app";
import { Button, buttonClass, Card, Chip, EmptyState, ErrorBanner, Icon, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { BriefRows } from "../../features/brief/BriefRows";
import { screeningRows } from "../../features/brief/helpers";
import { useDocument, useOwned } from "../../lib/data";
import type { WithId } from "../../lib/data";
import { db } from "../../lib/firebase";
import NotFound from "../S16-not-found/NotFound";
import { MatchCard } from "../S04-match-view/MatchCard";
import { forgottenNow } from "../S04-match-view/match";
import { OverrideDialog } from "../S06-override-dialog/OverrideDialog";
import styles from "./BriefIntake.module.css";

const byRank = (a: Match, b: Match) => a.rank - b.rank;
const SHOWN = 3;

type Props = { roleId: string; people: WithId<Candidate>[]; unclear?: string[]; onEdit: () => void };

/** S05 results: what Tacit read on the left, the same cards as S04 on the right. */
export function Results(props: Props) {
  const [attempt, setAttempt] = useState(0);
  // Remounting re-subscribes every read, which is all "Try again" needs for a failed load.
  return <Loaded key={attempt} {...props} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Loaded({ roleId, people, unclear = [], onEdit, onRetry }: Props & { onRetry: () => void }) {
  const uid = useAuth().user?.uid;
  const role = useDocument<Role>("roles", roleId);
  const company = useDocument<Company>("companies", role.data?.companyId);
  const matches = useOwned<Match>("matches", ["roleId", roleId], byRank);
  const overrides = useOwned<Override>("overrides", ["roleId", roleId]);
  // ponytail: whole collection, as S04 does; query by id sets if it passes ~1k docs.
  const attributes = useOwned<Attribute>("attributes");
  const [clock] = useState(() => new Date());
  const [all, setAll] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const attrMap = useMemo(() => new Map((attributes.data ?? []).map((a) => [a.id, a])), [attributes.data]);

  if ([role, company, matches, overrides, attributes].some((l) => l.error)) {
    return (
      <>
        <PageHeader headline="Brief intake" />
        <ErrorBanner title="Couldn’t load the matches." detail="The role is saved and nothing was lost." onRetry={onRetry} />
      </>
    );
  }
  if (role.data === null) return <NotFound />;
  if (!role.data || !matches.data || !overrides.data || !attributes.data || company.data === undefined) return <Skeletons />;

  const r = role.data;
  const rows = matches.data;
  const shown = all ? rows : rows.slice(0, SHOWN);
  const rest = rows.slice(SHOWN);
  const focalId = (rows.find((m) => forgottenNow(people.find((c) => c.id === m.candidateId), clock)) ?? rows[0])?.id;
  const criteria = r.interpretedBrief ? screeningRows(r.interpretedBrief, r.interpretedBrief.quotes) : [];
  const dialogMatch = rows.find((m) => m.id === rejecting);
  const dialogCandidate = people.find((c) => c.id === dialogMatch?.candidateId);

  const shortlist = async (m: WithId<Match>) => {
    if (!uid) return;
    setSaving(m.id);
    setSaveFailed(false);
    const now = new Date();
    try {
      await addDoc(collection(db, "overrides"), {
        ownerUid: uid, matchId: m.id, roleId: r.id, candidateId: m.candidateId, companyId: r.companyId,
        decision: "shortlist", reasonCodes: [], reasonText: "", decidedAt: now, createdAt: now, updatedAt: now,
      });
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <PageHeader
        context={[r.title, company.data?.name].filter(Boolean).join(" · ")}
        headline={
          rows.length ? (
            <><span className={styles.count}>{rows.length}</span> of {people.length} are worth a look.</>
          ) : (
            "Nobody stood out."
          )
        }
        actions={
          <>
            <Button size="lg" icon="bx-pencil" onClick={onEdit}>Edit brief</Button>
            <Link to={`/roles/${r.id}`} className={buttonClass("primary", false, "lg")}>
              <Icon name="bx-right-arrow-alt" />Open the role
            </Link>
          </>
        }
      />
      <div className={styles.results}>
        <Card className={styles.criteria} role="region" aria-labelledby="read-title">
          <h2 id="read-title" className="t-title">What Tacit read from the brief</h2>
          <BriefRows rows={criteria} />
          {unclear.length > 0 && (
            <div className={styles.ask}>
              <span><Chip icon="bx-help-circle">Ask the client · {unclear.length}</Chip></span>
              <ul className={styles.questions}>{unclear.map((q) => <li key={q} className="t-body-s-para">{q}</li>)}</ul>
            </div>
          )}
        </Card>

        <div className={styles.col}>
          {/* The one live region on the column; it is empty until a decision fails to save. */}
          <p role="status" className={`${styles.status} t-caption`}>{saveFailed && "Couldn’t save that decision. Try again."}</p>
          {rows.length === 0 ? (
            <EmptyState message={`Tacit checked ${people.length} people and nobody fits this brief yet. The role is saved.`} />
          ) : (
            <>
              {shown.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  candidate={people.find((c) => c.id === m.candidateId)}
                  attrs={attrMap}
                  decision={overrides.data!.find((o) => o.matchId === m.id && !o.reversedAt)}
                  focal={m.id === focalId}
                  now={clock}
                  saving={saving === m.id}
                  onShortlist={() => shortlist(m)}
                  onReject={() => setRejecting(m.id)}
                />
              ))}
              {rest.length > 0 && !all && (
                <button type="button" className={styles.more} onClick={() => setAll(true)}>
                  <span className="t-body-s-strong">{rest.length} more {rest.length === 1 ? "suggestion" : "suggestions"}</span>
                  <span className="t-caption">
                    Next: {rest.slice(0, 3).map((m) => people.find((c) => c.id === m.candidateId)?.fullName).filter(Boolean).join(", ")}
                  </span>
                  <Icon name="bx-chevron-down" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {dialogMatch && dialogCandidate && (
        <OverrideDialog match={dialogMatch} role={r} candidate={dialogCandidate} onClose={() => setRejecting(null)} />
      )}
    </>
  );
}

function Skeletons() {
  return (
    <>
      <PageHeader context={<span role="status">Getting the matches ready.</span>} headline={<Skeleton width={480} height={44} />} />
      <div className={styles.results} aria-busy="true">
        <Card className={styles.criteria}>
          <Skeleton width={220} height={20} />
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={44} />)}
        </Card>
        <div className={styles.col}>
          {[0, 1].map((i) => (
            <Card key={i} className={styles.skelCard}>
              <Skeleton width={220} height={24} />
              <Skeleton height={110} />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

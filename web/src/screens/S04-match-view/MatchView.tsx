import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { addDoc, collection } from "firebase/firestore";
import type { Attribute, Candidate, Company, Match, MatchResponse, Override, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, Card, EmptyState, ErrorBanner, Icon, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { api } from "../../lib/api";
import { useDocument, useOwned } from "../../lib/data";
import { db } from "../../lib/firebase";
import NotFound from "../S16-not-found/NotFound";
import { OverrideDialog } from "../S06-override-dialog/OverrideDialog";
import { BriefPanel } from "./BriefPanel";
import { MatchCard } from "./MatchCard";
import { forgottenNow } from "./match";
import styles from "./MatchView.module.css";

const byRank = (a: Match, b: Match) => a.rank - b.rank;
const SHOWN = 2;

/** S04: the brief on the left, ranked suggestions on the right. The model recommends, the recruiter decides. */
export default function MatchView() {
  const [attempt, setAttempt] = useState(0);
  // Remounting re-subscribes every read, which is all "Try again" needs for a failed load.
  return <View key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}

function View({ onRetry }: { onRetry: () => void }) {
  const { roleId } = useParams();
  const state = useScreenState();
  const uid = useAuth().user?.uid;
  const [params, setParams] = useSearchParams();
  const role = useDocument<Role>("roles", roleId);
  const company = useDocument<Company>("companies", role.data?.companyId);
  const matches = useOwned<Match>("matches", ["roleId", roleId], byRank);
  const overrides = useOwned<Override>("overrides", ["roleId", roleId]);
  // ponytail: whole collections, filtered client-side; one recruiter's data is small. Query by id sets if it passes ~1k docs.
  const candidates = useOwned<Candidate>("candidates");
  const attributes = useOwned<Attribute>("attributes");
  const [clock] = useState(() => new Date());
  const [run, setRun] = useState<"idle" | "working" | "failed">("idle");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [all, setAll] = useState(false);

  const error = [role, company, matches, overrides, candidates, attributes].find((l) => l.error)?.error;
  const ready =
    state !== "loading" && role.data !== undefined && matches.data && overrides.data && candidates.data && attributes.data &&
    (role.data === null || company.data !== undefined);
  const attrMap = useMemo(() => new Map((attributes.data ?? []).map((a) => [a.id, a])), [attributes.data]);

  if (error) {
    return (
      <>
        <PageHeader headline="Role" />
        <ErrorBanner title="Couldn’t load this role." detail="Nothing was lost." onRetry={onRetry} />
      </>
    );
  }
  if (!ready) return <MatchSkeleton />;
  if (!role.data) return <NotFound />;

  const r = role.data;
  const people = candidates.data!;
  const rows = matches.data!;
  const working = state === "ai-working" || run === "working";
  const failed = state === "ai-failed" || run === "failed";
  const empty = state === "no-matches" || rows.length === 0;

  const find = async (force: boolean) => {
    setRun("working");
    try {
      await api<MatchResponse>("/api/match", { roleId: r.id, force });
      setRun("idle");
    } catch {
      setRun("failed");
    }
  };

  const shortlist = async (m: Match & { id: string }) => {
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

  // Real search params, so "Not this one" works in production too.
  const reject = (id: string) => setParams((p) => { p.set("dialog", "override"); p.set("match", id); return p; });
  const closeDialog = () => setParams((p) => { p.delete("dialog"); p.delete("match"); return p; });

  const dialogMatch = params.get("dialog") === "override" ? rows.find((m) => m.id === params.get("match")) : undefined;
  const dialogCandidate = people.find((c) => c.id === dialogMatch?.candidateId);

  const focalId = (rows.find((m) => forgottenNow(people.find((c) => c.id === m.candidateId), clock)) ?? rows[0])?.id;
  const rest = rows.slice(SHOWN);
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <>
      <PageHeader
        context={<nav aria-label="Breadcrumb"><Link to="/roles" className={styles.crumb}>Roles</Link>{company.data ? ` / ${company.data.name}` : ""}</nav>}
        headline={r.title}
        actions={
          <>
            <Link to="/brief" className={buttonClass("ghost", false, "lg")}><Icon name="bx-search" />Search everyone</Link>
            <Button variant="primary" size="lg" icon="bx-refresh" onClick={() => find(!empty)} disabled={working}>
              {empty ? "Find matches" : "Re-run matches"}
            </Button>
          </>
        }
      />
      <div className={styles.grid}>
        <BriefPanel role={r} />
        <div className={styles.col} aria-busy={working}>
          {/* The one live region on the column: what Tacit is doing, then what it found. The error banner announces itself. */}
          <p role="status" className={`${styles.status} ${working ? styles.working : ""} t-body-m-strong`}>
            {working ? (
              <>
                <Sparkle />
                Checking {people.length} {people.length === 1 ? "person" : "people"} against the brief…
              </>
            ) : (
              !empty && `${rows.length} ${rows.length === 1 ? "suggestion" : "suggestions"} from the ${people.length} people you have met`
            )}
          </p>
          {working ? (
            <>
              {[0, 1].map((i) => (
                <Card key={i} className={styles.card}>
                  <Skeleton width={220} height={24} />
                  <Skeleton height={110} />
                  <Skeleton height={64} />
                </Card>
              ))}
            </>
          ) : (
            <>
              {failed && <ErrorBanner title="Couldn’t read the matches reliably." detail="The brief is unchanged and nothing was lost." onRetry={() => find(!empty)} />}
              {saveFailed && <p role="status" className="t-caption">Couldn’t save that decision. Try again.</p>}
              {empty ? (
                !failed && (
                  <EmptyState
                    message="No matches yet. Tacit checks the people you have met against this brief."
                    action={<Button icon="bx-search" onClick={() => find(false)}>Find matches</Button>}
                  />
                )
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
                      onReject={() => reject(m.id)}
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
            </>
          )}
        </div>
      </div>
      {dialogMatch && dialogCandidate && (
        <OverrideDialog match={dialogMatch} role={r} candidate={dialogCandidate} onClose={closeDialog} />
      )}
    </>
  );
}

function Sparkle() {
  return (
    <svg className={styles.spark} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

function MatchSkeleton() {
  return (
    <>
      <PageHeader
        context={<span role="status" aria-live="polite">Getting this role ready.</span>}
        headline={<><Skeleton width={480} height={44} /><span className="sr-only">Role</span></>}
      />
      <div className={styles.grid} aria-busy="true">
        <Card className={styles.brief}>
          <Skeleton width={110} height={20} />
          <Skeleton height={56} />
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={38} />)}
        </Card>
        <div className={styles.col}>
          <Skeleton width={320} height={18} />
          {[0, 1].map((i) => (
            <Card key={i} className={styles.card}>
              <Skeleton width={220} height={24} />
              <Skeleton height={120} />
              <Skeleton height={64} />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

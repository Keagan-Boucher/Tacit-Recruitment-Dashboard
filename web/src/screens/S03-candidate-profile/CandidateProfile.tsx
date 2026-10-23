import { useEffect, useMemo, useRef, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Link, useParams, useSearchParams } from "react-router";
import type { Company, Match, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { buttonClass, Card, ErrorBanner, Icon, Skeleton } from "../../components";
import { useAttributes, useCandidate, useNotes, useOwned } from "../../lib/data";
import { db } from "../../lib/firebase";
import NotFound from "../S16-not-found/NotFound";
import { CourseSuggestions } from "./CourseSuggestions";
import { CvPanel } from "./CvPanel";
import { MatchHistory, historyRows } from "./MatchHistory";
import { NotesPanel, ObservedPanel } from "./Observations";
import { activeAttribute, ageText, askFirst, askTopic, buildObserved, unkeptByNote } from "./profile";
import styles from "./CandidateProfile.module.css";

const MONTH_MS = 30.4375 * 86_400_000;

/** S03: one candidate, what the CV claims beside what the recruiter observed. Opening it records lastOpenedAt and nothing else. */
export default function CandidateProfile() {
  const [attempt, setAttempt] = useState(0);
  // Remounting re-subscribes every read, which is all "Try again" needs.
  return <Profile key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Profile({ onRetry }: { onRetry: () => void }) {
  const { candidateId } = useParams();
  const attrParam = useSearchParams()[0].get("attr");
  const state = useScreenState();
  const candidate = useCandidate(candidateId);
  const notesLive = useNotes(candidateId);
  const attrsLive = useAttributes(candidateId);
  const matches = useOwned<Match>("matches", ["candidateId", candidateId]);
  const overrides = useOwned<Override>("overrides", ["candidateId", candidateId]);
  const placements = useOwned<Placement>("placements", ["candidateId", candidateId]);
  const roles = useOwned<Role>("roles");
  const companies = useOwned<Company>("companies");
  const [clock] = useState(() => new Date());
  // Dev ?state=: the three that change what is read.
  const noNotes = state === "no-notes";
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  // Opening the profile is what "Not opened in N months" counts from (decided 19 Oct). Best effort; dev ?state= renders don't count.
  const found = !!candidate.data;
  useEffect(() => {
    if (candidateId && found && state === "default") updateDoc(doc(db, "candidates", candidateId), { lastOpenedAt: serverTimestamp() }).catch(() => {});
  }, [candidateId, found, state]);

  const all = [candidate, notesLive, attrsLive, matches, overrides, placements, roles, companies];
  const error = all.find((l) => l.error)?.error;
  const ready = state !== "loading" && all.every((l) => l.data !== undefined);

  const notes = useMemo(() => (noNotes ? [] : notesLive.data ?? []), [noNotes, notesLive.data]);
  const attrs = useMemo(() => (noNotes ? [] : attrsLive.data ?? []), [noNotes, attrsLive.data]);

  // ?state=stale-evidence ages the clock just enough for the newest evidence to be stale, so any candidate shows the prompt.
  const now = useMemo(() => {
    if (state !== "stale-evidence") return clock;
    const newest = Math.max(0, ...attrs.map((a) => a.observedAt.getTime()));
    const shift = newest ? Math.max(0, newest + 14 * MONTH_MS - clock.getTime()) : 0;
    return new Date(clock.getTime() + shift);
  }, [state, clock, attrs]);

  const observed = useMemo(
    () => buildObserved(attrs, notes, overrides.data ?? [], now),
    [attrs, notes, overrides.data, now],
  );
  const activeId = activeAttribute(picked, attrParam, observed, state === "provenance-open" ? (observed.find((o) => o.span)?.id ?? null) : null);

  // Selecting one side brings the other into view.
  useEffect(() => {
    if (!activeId) return;
    const sel = CSS.escape(activeId);
    for (const q of [`[data-attr="${sel}"]`, `[data-phrase="${sel}"]`]) document.querySelector(q)?.scrollIntoView({ block: "center" });
  }, [activeId]);

  // Arriving from a match reason (?attr=): put keyboard focus on that attribute once, so the link lands where it points.
  // The shell only claims focus for the heading while nothing inside the page holds it, so this wins whenever the row exists;
  // later picks by the recruiter never move focus.
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!attrParam || picked !== undefined || focusedFor.current === attrParam) return;
    const el = document.querySelector<HTMLElement>(`[data-attr="${CSS.escape(attrParam)}"]`);
    if (!el) return;
    focusedFor.current = attrParam;
    el.focus({ preventScroll: true });
  }, [attrParam, picked, observed]);

  if (error) {
    return (
      <>
        <PageHeader headline="Candidate" />
        <ErrorBanner title="Couldn’t load this profile." detail="Nothing was lost. Your notes are saved." onRetry={onRetry} />
      </>
    );
  }
  if (!ready) return <ProfileSkeleton />;
  if (candidate.data === null || !candidate.data) return <NotFound />;

  const c = candidate.data;
  const first = c.fullName.split(" ")[0];
  const ask = askFirst(observed, now);
  const unkept = [...unkeptByNote(attrs)].flatMap(([noteId, count]) => {
    const note = notes.find((n) => n.id === noteId);
    return note ? [{ noteId, count, capturedAt: note.capturedAt }] : [];
  });
  const rows = historyRows({
    matches: matches.data!,
    overrides: overrides.data!,
    placements: placements.data!,
    roles: roles.data!,
    companies: companies.data!,
  });

  return (
    <>
      <PageHeader
        headline={c.fullName}
        actions={
          <>
            <Link to={`/candidates/${c.id}/notes/new?kind=call`} className={buttonClass("ghost", false, "lg")}>
              <Icon name="bx-time" />
              Log a call
            </Link>
            <Link to={`/candidates/${c.id}/notes/new`} className={buttonClass("primary", false, "lg")}>
              <Icon name="bx-plus" />
              New interview note
            </Link>
          </>
        }
      />
      <div className={styles.grid}>
        <div className={styles.col}>
          <CvPanel candidate={c} />
        </div>
        <div className={styles.col}>
          <ObservedPanel candidateId={c.id} observed={observed} unkept={unkept} activeId={activeId} onSelect={setPicked} noNotes={notes.length === 0} />
          {notes.length > 0 && (
            <NotesPanel notes={notes} observed={observed} roles={roles.data!} companies={companies.data!} activeId={activeId} onSelect={setPicked} />
          )}
        </div>
        <div className={styles.col}>
          {ask && (
            <Card className={styles.ask} role="region" aria-labelledby="ask-title">
              <h2 id="ask-title" className="t-title">Ask before you put {first} forward</h2>
              <p className="t-body-s-strong">{ask.check ? `Ask about ${ask.check}.` : "Check what has changed since."}</p>
              {ask.sources.length > 0 && (
                <ul className={`${styles.askSources} t-caption`}>
                  {ask.sources.map((o) => (
                    <li key={o.id}>
                      {askTopic(o)} · {o.source}{" "}
                      <span className={styles.noBreak}>
                        · <span className={`${styles.age} t-caption-strong`}>{ageText(o)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <CourseSuggestions candidate={c} placements={placements.data!} />
          <MatchHistory rows={rows} now={now} />
        </div>
      </div>
    </>
  );
}

function ProfileSkeleton() {
  const rows = (n: number, h: number) => Array.from({ length: n }, (_, i) => <Skeleton key={i} height={h} />);
  return (
    <>
      <PageHeader
        context={<span role="status" aria-live="polite">Getting this profile ready.</span>}
        headline={<><Skeleton width={320} height={44} /><span className="sr-only">Candidate</span></>}
      />
      <div className={styles.grid} aria-busy="true">
        <div className={styles.col}>
          <Card className={styles.panel}>
            <Skeleton width={150} height={20} />
            {rows(4, 38)}
            <Skeleton width="60%" height={22} radius="pill" />
          </Card>
        </div>
        <div className={styles.col}>
          <Card className={styles.observed}>
            <Skeleton width={160} height={20} />
            {rows(4, 52)}
          </Card>
          <Card className={styles.notes}>
            <Skeleton width={140} height={20} />
            {rows(2, 90)}
          </Card>
        </div>
        <div className={styles.col}>
          <Card className={styles.history}>
            <Skeleton width={130} height={20} />
            {rows(3, 80)}
          </Card>
        </div>
      </div>
    </>
  );
}

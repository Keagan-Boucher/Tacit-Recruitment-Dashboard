import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ReviewRequest, ReviewResponse } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, EmptyState, ErrorBanner, SegmentedControl, Skeleton } from "../../components";
import { api } from "../../lib/api";
import { Detail } from "./Detail";
import { NotAcceptedDialog } from "./NotAcceptedDialog";
import { day, firstName, readWord } from "./review";
import type { Sub } from "./review";
import { usePending, useSenders } from "./useQueue";
import styles from "./ReviewQueue.module.css";

/** S18: everything a candidate or company sent waits here until the recruiter passes it or says why not. */
export default function ReviewQueue() {
  const [attempt, setAttempt] = useState(0);
  // Remounting re-subscribes every read, which is all "Try again" needs for a failed load.
  return <Queue key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Queue({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const [params, setParams] = useSearchParams();
  const { subs, error, fx } = usePending();
  const { companies, people, dups } = useSenders(fx);

  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [sel, setSel] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [failed, setFailed] = useState<Sub>();
  const [said, setSaid] = useState("");
  const [dialogId, setDialogId] = useState<string | undefined>(state === "not-accepted" ? "fx-lerato" : undefined);
  const rows = useRef(new Map<string, HTMLElement>());
  const emptyRef = useRef<HTMLDivElement>(null);
  const focus = useRef<string | undefined>(undefined);

  const tab = (params.get("tab") ?? (state === "briefs" ? "briefs" : "cvs")) === "briefs" ? "briefs" : "cvs";
  const pending = subs?.filter((s) => !gone.has(s.id));
  const cvs = pending?.filter((s) => s.kind !== "brief");
  const briefs = pending?.filter((s) => s.kind === "brief");
  const items = (tab === "briefs" ? briefs : cvs) ?? [];
  const current = items.find((s) => s.id === sel) ?? items[0];

  const who = (s: Sub) =>
    s.kind === "brief" ? (s.companyId && companies[s.companyId]) || "the company" : s.kind === "cv" ? s.fields.fullName : (s.candidateId && people[s.candidateId]?.fullName) || "the candidate";
  const title = (s: Sub) => (s.kind === "brief" ? s.fields.title : who(s));
  const kindLabel = (s: Sub) => (s.kind === "brief" ? "Brief" : s.kind === "cv" ? "CV" : "Updated details");
  const meta = (s: Sub) => (s.kind === "cv" ? s.fields.currentRole || s.fields.headline : s.kind === "brief" ? who(s) : "Updated details");

  // After a decision the row that took its place gets focus (or the empty message when nothing is left). Dialog's own
  // focus restore runs first, in the child, so this one wins.
  useEffect(() => {
    const target = focus.current;
    if (!target) return;
    const el = target === "empty" ? emptyRef.current : rows.current.get(target);
    el?.focus();
    // Behind an open dialog the page is inert and focus() does nothing: keep the target and retry once it closes.
    if (el && document.activeElement === el) focus.current = undefined;
  });

  async function decide(s: Sub, body: ReviewRequest) {
    // Fixtures stand in for the proxy, so a dev state can be walked through without it.
    if (!fx) await api<ReviewResponse>(`/api/review/${s.id}`, body);
    const i = items.findIndex((x) => x.id === s.id);
    const next = items[i + 1] ?? items[i - 1];
    focus.current = next?.id ?? "empty";
    setSel(next?.id);
    setGone((g) => new Set(g).add(s.id));
    setSaid(body.action === "pass" ? `${title(s)} passed.` : `${title(s)} not accepted. ${who(s)} will see your reason.`);
  }

  async function pass(s: Sub) {
    setBusy(s.id);
    setFailed(undefined);
    try {
      await decide(s, { action: "pass" });
    } catch {
      setFailed(s);
    } finally {
      setBusy(undefined);
    }
  }

  const dialogSub = subs?.find((s) => s.id === dialogId);
  const closeDialog = useCallback(() => setDialogId(undefined), []);
  const total = pending?.length ?? 0;
  const other = tab === "briefs" ? "CVs" : "briefs";

  if (error && !subs) {
    return (
      <>
        <PageHeader headline="Review queue" />
        <ErrorBanner title="Couldn’t load the review queue." detail="Nothing was lost. Nothing waiting has been touched." onRetry={onRetry} />
      </>
    );
  }

  const loading = !pending;
  const headline = loading ? (
    <span className={styles.dim}>Getting the queue ready.</span>
  ) : total === 0 ? (
    "Nothing waiting for review."
  ) : (
    <>
      <span className={styles.num}>{total}</span> waiting for review.
    </>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        headline={headline}
        actions={
          <SegmentedControl
            label="Queue"
            value={tab}
            options={[
              { value: "cvs", label: `CVs${cvs ? ` · ${cvs.length}` : ""}` },
              { value: "briefs", label: `Briefs${briefs ? ` · ${briefs.length}` : ""}` },
            ]}
            onChange={(v) => {
              setParams({ tab: v }, { replace: true });
              setSel(undefined);
              focus.current = undefined;
            }}
          />
        }
      />
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
      {failed && (
        <ErrorBanner className={styles.banner} title={`Couldn’t pass ${title(failed)}.`} detail="Nothing changed. It is still in the queue." onRetry={() => void pass(failed)} />
      )}

      {loading ? (
        <div className={styles.grid} aria-busy="true">
          <div className={styles.card}>
            <Skeleton width={190} height={20} radius="pill" />
            {[0, 1, 2].map((i) => <Skeleton key={i} height={52} />)}
          </div>
          <div className={`${styles.card} ${styles.detail}`}>
            <Skeleton width={260} height={28} radius="pill" />
            <Skeleton width={320} height={14} radius="pill" />
            <Skeleton height={180} />
          </div>
        </div>
      ) : !current ? (
        <div className={styles.card}>
          <div ref={emptyRef} tabIndex={-1} className={styles.empty}>
            {total === 0 ? (
              <EmptyState message="Nothing waiting. New CVs and briefs land here." action={<Link to="/" className={buttonClass("ghost")}>Back to the dashboard</Link>} />
            ) : (
              <EmptyState
                message={`No ${tab === "briefs" ? "briefs" : "CVs"} waiting. New ones land here.`}
                action={<Button onClick={() => setParams({ tab: tab === "briefs" ? "cvs" : "briefs" }, { replace: true })}>Open {other}</Button>}
              />
            )}
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          <section aria-labelledby="queue-head" className={styles.card}>
            <h2 id="queue-head" className="t-title">{tab === "briefs" ? "Briefs from companies" : "CVs from candidates"}</h2>
            <ul className={styles.list}>
              {items.map((s) => {
                const w = readWord(s);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      ref={(el) => { if (el) rows.current.set(s.id, el); else rows.current.delete(s.id); }}
                      className={styles.row}
                      aria-current={s.id === current.id ? "true" : undefined}
                      onClick={() => setSel(s.id)}
                    >
                      <span className={`${styles.rowTitle} t-body-m-strong`}>{title(s)}</span>
                      <span className={styles.rowLine}>
                        <span className={`${styles[w.tone]} t-body-s-strong`}>{w.text}</span>
                        <span className={`${styles.quiet} t-caption`}> · {meta(s) ? `${meta(s)} · ` : ""}sent {day(s.submittedAt)}</span>
                      </span>
                      <span className="sr-only">{kindLabel(s)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={`${styles.quiet} ${styles.hint} t-caption-para`}>
              {tab === "briefs" ? "Briefs from client companies wait here. A role opens only when you pass its brief." : "Candidates who sign up wait here. Nobody joins the pool until you pass them."}
            </p>
          </section>
          <Detail
            key={current.id}
            sub={current}
            who={who(current)}
            dup={current.kind === "cv" && dups[current.id] ? people[dups[current.id]!] : undefined}
            busy={busy === current.id}
            onPass={() => void pass(current)}
            onNotAccepted={() => setDialogId(current.id)}
          />
        </div>
      )}

      {dialogSub && (
        <NotAcceptedDialog
          eyebrow={`${kindLabel(dialogSub)} · sent ${day(dialogSub.submittedAt)}`}
          subject={title(dialogSub)}
          to={dialogSub.kind === "brief" ? who(dialogSub) : firstName(who(dialogSub))}
          description={
            dialogSub.kind === "brief"
              ? `${who(dialogSub)} sees your reason on their dashboard and can send again. It comes back to this queue.`
              : `${firstName(who(dialogSub))} sees your reason on their dashboard and can send again. It comes back to this queue.`
          }
          draft={state === "not-accepted" ? { code: "unreadable", text: "Your CV is a scanned image, so we couldn’t read your roles and dates. Please upload a PDF or Word file with selectable text." } : undefined}
          onSend={(code, text) => decide(dialogSub, { action: "not-accepted", reasonCode: code, reasonText: text })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

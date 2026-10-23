import { useEffect, useRef, useState } from "react";
import type { Candidate, CourseItem, CourseRequest, CourseResponse, CourseSuggestion, Placement } from "@tacit/shared";
import { monthsSince } from "@tacit/shared";
import { useScreenState } from "../../app";
import { Button, Card, ErrorBanner, Icon, Input, Skeleton, Textarea } from "../../components";
import { ApiError, api } from "../../lib/api";
import { useDocument } from "../../lib/data";
import type { WithId } from "../../lib/data";
import { approvedItems, courseEligible, statusLine } from "./CourseSuggestions.logic";
import styles from "./CourseSuggestions.module.css";

type Props = { candidate: WithId<Candidate>; placements: Placement[] };
type View = Pick<CourseSuggestion, "status" | "items" | "approvedAt" | "snoozedUntil">;

const SAMPLE: CourseItem[] = [
  { title: "SQL for analysts", why: "Asked for in 7 of the 10 roles that came close", duration: "6 weeks, online" },
  { title: "Stakeholder communication", why: "Named in 4 of the 10 roles that came close", duration: "2 days" },
  { title: "Cloud fundamentals", why: "Asked for in 3 of the 10 roles that came close", duration: "4 weeks, online" },
];

/** S03: course suggestions for a candidate waiting 9+ months. Draft with the model, edit, approve. Renders nothing for anyone else. */
export function CourseSuggestions(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <Suggestions key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Suggestions({ candidate, placements, onRetry }: Props & { onRetry: () => void }) {
  const state = useScreenState();
  const dev = state.startsWith("courses-");
  const [now] = useState(() => new Date());
  const doc = useDocument<CourseSuggestion>("courseSuggestions", candidate.id);
  const [local, setLocal] = useState<View | null>(null);
  const [edit, setEdit] = useState<CourseItem[] | null>(null);
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);
  const [fail, setFail] = useState<{ title: string; detail: string; retry?: () => void } | null>(null);
  const [incomplete, setIncomplete] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Approve with an empty field: focus the first one flagged.
  useEffect(() => {
    if (incomplete) bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [incomplete]);

  if (!dev && !courseEligible(candidate.inPoolSince, placements, now)) return null;

  const first = candidate.fullName.split(" ")[0] ?? candidate.fullName;
  const months = candidate.inPoolSince ? monthsSince(candidate.inPoolSince, now) : 9;
  const decided = doc.data && doc.data.status !== "draft" ? doc.data : null;
  const devView: View | null =
    state === "courses-draft" ? { status: "draft", items: SAMPLE }
    : state === "courses-approved" ? { status: "approved", items: SAMPLE, approvedAt: new Date(now.getTime() - 3 * 86_400_000) }
    : null;
  const view: View | null | undefined = dev ? devView : (decided ?? local ?? doc.data);
  const loading = !dev && doc.data === undefined && !doc.error;

  async function call(body: CourseRequest, kind: "draft" | "approve") {
    setBusy(kind);
    setFail(null);
    try {
      const res = await api<CourseResponse>(`/api/courses/${candidate.id}`, body);
      setLocal({ status: res.status, items: res.items });
      setEdit(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "internal";
      // The server's own words for a request it refused; a 409 can never succeed, so it offers no retry.
      const said = e instanceof ApiError && (code === "bad_request" || code === "bad_transition") ? e.message : null;
      setFail({
        title: kind === "draft" ? "Couldn’t draft course suggestions." : "Couldn’t approve these.",
        detail: said ?? (code === "ai_unconfigured" ? "The model isn’t set up on this server yet. Nothing was lost."
          : code === "ai_failed" ? "The draft wasn’t reliable, so nothing was stored."
          : kind === "approve" ? "Your edits are still here." : "Nothing was lost."),
        retry: e instanceof ApiError && e.status === 409 ? undefined : () => void call(body, kind),
      });
    } finally {
      setBusy(null);
    }
  }

  const items = edit ?? view?.items ?? [];
  const change = (i: number, patch: Partial<CourseItem>) => { setEdit(items.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
  const asked = incomplete > 0;
  const approve = () => {
    const ok = approvedItems(items);
    if (!ok) return setIncomplete((n) => n + 1);
    setIncomplete(0);
    void call({ action: "approve", items: ok }, "approve");
  };
  const line = view ? statusLine(view, first) : null;

  return (
    <Card className={styles.card} role="region" aria-labelledby="courses-title">
      <h2 id="courses-title" className="t-title">Courses for {first}</h2>
      <div ref={bodyRef} className={styles.body} aria-live="polite" aria-busy={loading || busy !== null}>
        {state === "courses-conflict" || (fail && !fail.retry) ? (
          <div className={styles.stop}>
            <Icon name="bx-error-circle" size={20} />
            <p className="t-body-m-strong">{fail?.title ?? "Couldn’t approve these."}</p>
            <p className="t-body-s">{fail?.detail ?? "This suggestion has already been decided."}</p>
          </div>
        ) : state === "courses-error" || fail ? (
          <ErrorBanner
            className={styles.banner}
            title={fail?.title ?? "Couldn’t draft course suggestions."}
            detail={fail?.detail ?? "Nothing was lost."}
            onRetry={fail?.retry ?? onRetry}
          />
        ) : loading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={40} />
          </>
        ) : busy === "draft" ? (
          <p className={`${styles.working} t-body-m-strong`}><Sparkle />Drafting course suggestions…</p>
        ) : !view ? (
          <>
            <p className="t-body-s-para">
              {first} has been in your pool for {months} months. Tacit drafts up to three courses from the roles they came close to. Nothing reaches {first} until you approve it.
            </p>
            <Button icon="bx-book" onClick={() => void call({ action: "draft" }, "draft")}>Draft course suggestions</Button>
          </>
        ) : view.status === "draft" ? (
          <>
            <p className="t-body-s-para">Edit anything, then approve. {first} sees only what is below.</p>
            {items.map((it, i) => (
              <div key={i} role="group" aria-label={`Course ${i + 1}`} className={styles.item}>
                <Input label="Course" value={it.title} maxLength={200} error={asked && !it.title.trim() ? "Add the course name." : undefined} onChange={(e) => change(i, { title: e.target.value })} />
                <Textarea label="Why it helps" rows={2} value={it.why} maxLength={300} error={asked && !it.why.trim() ? "Add why it helps." : undefined} onChange={(e) => change(i, { why: e.target.value })} />
                <Input label="Duration" note="Optional" value={it.duration} maxLength={60} onChange={(e) => change(i, { duration: e.target.value })} />
              </div>
            ))}
            <Button icon="bx-check" disabled={busy === "approve"} onClick={approve}>
              {busy === "approve" ? "Approving…" : `Approve and show to ${first}`}
            </Button>
          </>
        ) : (
          <>
            <p className="t-body-s-strong">{line}</p>
            {view.status === "approved" && (
              <ul className={styles.list}>
                {view.items.map((it) => (
                  <li key={it.title} className={styles.row}>
                    <span className="t-body-s-strong">{it.title}</span>
                    <span className={`${styles.quiet} t-caption`}>{[it.why, it.duration].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
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

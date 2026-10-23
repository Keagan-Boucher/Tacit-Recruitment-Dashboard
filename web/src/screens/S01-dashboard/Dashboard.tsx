import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import type { Attribute, Candidate, Company, DashboardWidget, InterviewNote, Match, Override, Role, WidgetId } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, ErrorBanner, Icon } from "../../components";
import { usePrefs } from "../../features/prefs";
import { useOwned } from "../../lib/data";
import { buildBoard, EMPTY, type Snapshot } from "./board";
import { zoomVar } from "./arrange";
import { Customise } from "./Customise";
import { AskNext, Forgotten, PeopleMet, RolesInPlay, RolesToShortlist, Shelf, ToConfirm, Waiting, WorthACall } from "./Widgets";
import styles from "./Dashboard.module.css";

const WIDGETS: Partial<Record<WidgetId, (p: { b?: ReturnType<typeof buildBoard> }) => ReactNode>> = {
  forgotten: Forgotten,
  "roles-to-shortlist": RolesToShortlist,
  "to-confirm": ToConfirm,
  "people-met": PeopleMet,
  "roles-in-play": RolesInPlay,
  "worth-a-call": WorthACall,
  waiting: Waiting,
  "ask-next": AskNext,
};
const SIZE = { "1x1": "", "2x1": styles.w2, "2x2": styles.w2h2 } as const;

/** Retry remounts the screen, which opens fresh Firestore listeners (a failed listener does not recover by itself). */
export default function Dashboard() {
  const [attempt, setAttempt] = useState(0);
  return <Board key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

/** Dev frame 274:2128 (`?state=review-waiting`): Waiting for review takes Things to confirm's cell. */
function reviewWaiting(d: DashboardWidget[]): DashboardWidget[] {
  const cell = d.find((w) => w.widgetId === "to-confirm");
  if (!cell) return d;
  return d.map((w) =>
    w.widgetId === "to-confirm" ? { ...w, visible: false }
    : w.widgetId === "waiting-for-review" ? { ...w, visible: true, order: cell.order, size: cell.size }
    : w);
}

function Board({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const navigate = useNavigate();
  const { prefs, savePrefs } = usePrefs();
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => new Date());

  const candidates = useOwned<Candidate>("candidates");
  const roles = useOwned<Role>("roles");
  const companies = useOwned<Company>("companies");
  const matches = useOwned<Match>("matches");
  const overrides = useOwned<Override>("overrides");
  const notes = useOwned<InterviewNote>("interviewNotes");
  const attributes = useOwned<Attribute>("attributes");

  const liveError = [candidates, roles, companies, matches, overrides, notes, attributes].find((l) => l.error)?.error;
  const loaded = useMemo<Snapshot | undefined>(
    () =>
      candidates.data && roles.data && companies.data && matches.data && overrides.data && notes.data && attributes.data
        ? { candidates: candidates.data, roles: roles.data, companies: companies.data, matches: matches.data, overrides: overrides.data, notes: notes.data, attributes: attributes.data }
        : undefined,
    [candidates.data, roles.data, companies.data, matches.data, overrides.data, notes.data, attributes.data],
  );
  const snap = state === "loading" ? undefined : state === "empty" ? EMPTY : loaded;
  const error = state === "error" || liveError;

  // Widgets keep their last content when a read fails.
  const [kept, setKept] = useState<{ snap: Snapshot; at: Date }>();
  if (snap && snap !== kept?.snap) setKept({ snap, at: new Date() });
  const shown = snap ?? (error ? kept?.snap : undefined);
  const b = useMemo(() => shown && buildBoard(shown, now), [shown, now]);

  // Customise mode: `?customise=1` (or dev `?state=customise`) edits a draft of prefs.dashboard; Done saves it, Cancel drops it.
  const customising = state === "customise" || params.get("customise") === "1";
  const [edit, setEdit] = useState<DashboardWidget[]>();
  const editing = customising ? (edit ?? prefs.dashboard) : undefined;
  const [shelfOpen, setShelfOpen] = useState(true);
  const [said, setSaid] = useState("");
  const [failed, setFailed] = useState(false);
  const base = useRef<DashboardWidget[]>(undefined);

  const layout = state === "review-waiting" ? reviewWaiting(prefs.dashboard) : prefs.dashboard;
  const board = [...layout].filter((w) => w.visible).sort((a, b) => a.order - b.order);
  const small = (id: WidgetId) => { const i = prefs.smallScreenOrder.indexOf(id); return i < 0 ? prefs.smallScreenOrder.length : i; };

  function change(next: DashboardWidget[], msg: string) {
    base.current ??= prefs.dashboard;
    setEdit(next);
    setSaid(msg);
  }
  function leave() {
    setEdit(undefined);
    setSaid("");
    setFailed(false);
    base.current = undefined;
    void navigate("/", { replace: true }); // clears ?customise and the dev ?state
  }
  async function done() {
    setFailed(false);
    try {
      await savePrefs({ dashboard: editing });
      leave();
    } catch {
      setFailed(true); // stay here with the edits kept; savePrefs already showed them
    }
  }
  function cancel() {
    // A failed save left the edits in the live prefs; put the saved layout back.
    if (failed && base.current) void savePrefs({ dashboard: base.current }).catch(() => {});
    leave();
  }
  const renderWidget = (w: DashboardWidget) => {
    const Widget = WIDGETS[w.widgetId];
    return Widget ? <Widget b={b} /> : <Shelf id={w.widgetId} />;
  };

  // One handler for every in-widget link, so navigation stays client-side (the links are plain anchors).
  function goInApp(e: MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

  const summary = !b
    ? "Getting today’s list ready."
    : b.total === 0
      ? b.hasPeople ? "Nothing needs you today." : "Nothing needs you yet."
      : `${b.total} ${b.total === 1 ? "thing needs" : "things need"} you today.`;
  const headline = !b ? (
    <span className={styles.dim}>{summary}</span>
  ) : b.total === 0 ? (
    summary
  ) : (
    <>
      <span className={styles.num}>{b.total}</span> {b.total === 1 ? "thing needs" : "things need"} you today.
    </>
  );

  return (
    <div className={`${styles.page} ${editing ? styles.arranging : ""}`} style={editing ? zoomVar : undefined}>
      <PageHeader
        headline={editing ? "Arrange your dashboard." : headline}
        actions={
          editing ? (
            <div className={styles.actions}>
              {!shelfOpen && (
                <Button icon="bx-dock-right" onClick={() => setShelfOpen(true)}>
                  Widget shelf
                </Button>
              )}
              <Button onClick={cancel}>Cancel</Button>
              <Button icon="bx-reset" onClick={() => change(DEFAULT_USER_PREFS.dashboard, "Board reset to the default. Press Done to save it.")}>
                Reset to default
              </Button>
              <Button variant="primary" icon="bx-check" onClick={() => void done()}>
                Done
              </Button>
            </div>
          ) : (
          <div className={styles.actions}>
            {/* The command palette (S15) listens for Ctrl K; this is its button. */}
            <button
              type="button"
              className={styles.search}
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            >
              <Icon name="bx-search" />
              <span className="t-body-m">Search people, roles, notes</span>
              <kbd className={`${styles.kbd} t-meta`}>Ctrl K</kbd>
            </button>
            <Button icon="bx-pencil" onClick={() => setParams({ customise: "1" })}>
              Customise
            </Button>
            <a href="/candidates" className={buttonClass("primary")} onClick={goInApp}>
              <Icon name="bx-plus" />
              New interview note
            </a>
          </div>
          )
        }
      />
      {failed && <ErrorBanner className={styles.banner} title="Couldn’t save your layout." detail="Your changes are still here." onRetry={() => void done()} />}
      {/* The one place this screen announces: customise changes while arranging, otherwise how the list came out. */}
      <p className="sr-only" role="status">
        {editing ? said : summary}
      </p>
      {error && (
        <ErrorBanner
          className={styles.banner}
          title="Couldn’t load today’s list."
          detail={kept ? `Nothing was lost. Showing what loaded at ${kept.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}.` : undefined}
          onRetry={onRetry}
        />
      )}
      {editing ? (
        <Customise draft={editing} onChange={change} render={renderWidget} sizeClass={(w) => SIZE[w.size] ?? ""} shelfOpen={shelfOpen} onCloseShelf={() => setShelfOpen(false)} />
      ) : (
        <div className={styles.board} onClick={goInApp} role="region" aria-label="Today’s list" aria-busy={!b}>
          {board.map((w) => (
            <div key={w.widgetId} className={`${styles.cell} ${SIZE[w.size]}`} style={{ "--so": small(w.widgetId) } as CSSProperties}>
              {renderWidget(w)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DEFAULT_USER_PREFS, type WidgetId, type WidgetSize } from "@tacit/shared";
import { PageHeader } from "../../app";
import { Button, buttonClass, ErrorBanner, FilterChip, Icon, IconButton, SegmentedControl, Toggle } from "../../components";
import { usePrefs } from "../../features/prefs";
import { boardOf, move, setSize, setVisible, SIZES, spaces, TITLES } from "./layout";
import styles from "./Widgets.module.css";

type Kind = "hero" | "lines" | "number" | "bars" | "grid" | "list";
const KIND: Record<WidgetId, Kind> = {
  forgotten: "hero", "roles-to-shortlist": "lines", "to-confirm": "number", "people-met": "bars", "roles-in-play": "grid",
  "worth-a-call": "lines", waiting: "list", "ask-next": "list", "recent-notes": "list", "brief-inbox": "lines", "company-coverage": "list",
  "match-history": "lines", "override-log": "list", "waiting-for-review": "list",
};
const BARS = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6];
const HEAT = ["f", "o", "o", "o", "o", "f", "o", "n", "o", "s", "o", "o", "n", "n", "o"];
const three = [0, 1, 2];

/** Decorative sketch of what the widget looks like. */
function Preview({ kind }: { kind: Kind }) {
  return (
    <div className={`${styles.preview} ${styles[kind]}`} aria-hidden="true">
      {kind === "hero" && (
        <>
          <b className="t-figure">Sipho Mabaso</b>
          <i />
          <i />
        </>
      )}
      {kind === "lines" && three.map((n) => <span key={n}><i /><u /></span>)}
      {kind === "list" && three.map((n) => <span key={n}><s /><i /></span>)}
      {kind === "number" && (
        <>
          <b className="t-display-l">6</b>
          <em>{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} />)}</em>
        </>
      )}
      {kind === "bars" && BARS.map((h, n) => <i key={n} style={{ height: `${h * 12 + 18}%` }} />)}
      {kind === "grid" && HEAT.map((c, n) => <i key={n} data-c={c} />)}
    </div>
  );
}

const FILTERS = [["all", "All"], ["on", "On your board"], ["off", "Off"]] as const;

export default function Widgets() {
  const { prefs, savePrefs } = usePrefs();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [failed, setFailed] = useState(false);
  const [said, setSaid] = useState("");
  const focus = useRef<string | undefined>(undefined);

  // savePrefs updates the screen first, so a failed save keeps what the recruiter chose and offers a retry.
  async function save(partial: Parameters<typeof savePrefs>[0]) {
    setFailed(false);
    try {
      await savePrefs(partial);
    } catch {
      setFailed(true);
    }
  }
  const retry = () => save({ dashboard: prefs.dashboard, smallScreenOrder: prefs.smallScreenOrder });
  const reset = () => {
    setSaid("Board reset to default.");
    void save({ dashboard: DEFAULT_USER_PREFS.dashboard, smallScreenOrder: DEFAULT_USER_PREFS.smallScreenOrder });
  };

  const board = boardOf(prefs.dashboard);
  const shown = new Set(board.map((w) => w.widgetId));
  const library = [...prefs.dashboard].sort((a, b) => a.order - b.order).filter((w) => filter === "all" || (filter === "on") === w.visible);
  const sp = spaces(prefs.dashboard);
  const stack = prefs.smallScreenOrder.filter((id) => shown.has(id));

  function onMove(id: WidgetId, dir: -1 | 1) {
    const r = move(prefs.smallScreenOrder, shown, id, dir);
    if (!r) return;
    focus.current = `${id}:${dir}`;
    setSaid(`Moved ${TITLES[id]} to position ${r.position}`);
    void save({ smallScreenOrder: r.order });
  }
  // Keep keyboard focus on the moved row's button (on the other one when it hit an edge).
  useEffect(() => {
    if (!focus.current) return;
    const [id, dir] = focus.current.split(":");
    focus.current = undefined;
    const q = (d: string) => document.querySelector<HTMLElement>(`[data-move="${id}:${d}"]:not(:disabled)`);
    (q(dir!) ?? q(dir === "1" ? "-1" : "1"))?.focus();
  }, [prefs.smallScreenOrder]);

  return (
    <div className={styles.page}>
      <PageHeader
        headline="Widgets"
        actions={
          <>
            <Button icon="bx-refresh" onClick={reset}>
              Reset to default
            </Button>
            <Link to="/?customise=1" className={buttonClass("primary")}>
              <Icon name="bx-pencil" />
              Customise
            </Link>
          </>
        }
      />
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      {failed && (
        <ErrorBanner className={styles.banner} title="Couldn’t save your board." detail="Your change is still shown here. Try again to save it." onRetry={() => void retry()} />
      )}
      <div className={styles.layout}>
        <div>
          <div className={styles.filters} role="group" aria-label="Show widgets">
            {FILTERS.map(([id, label]) => (
              <FilterChip
                key={id}
                selected={filter === id}
                count={id === "all" ? prefs.dashboard.length : id === "on" ? board.length : prefs.dashboard.length - board.length}
                onClick={() => setFilter(id)}
              >
                {label}
              </FilterChip>
            ))}
          </div>
          <ul className={styles.library}>
            {library.map((w) => (
              <li key={w.widgetId} className={styles.card}>
                <Preview kind={KIND[w.widgetId]} />
                <h2 className={`${styles.name} t-body-m ${w.visible ? "" : styles.off}`}>{TITLES[w.widgetId]}</h2>
                <div className={styles.controls}>
                  <SegmentedControl
                    label={`Size for ${TITLES[w.widgetId]}`}
                    options={SIZES}
                    value={w.size}
                    onChange={(v) => void save({ dashboard: setSize(prefs.dashboard, w.widgetId, v as WidgetSize) })}
                  />
                  <Toggle
                    showWord
                    checked={w.visible}
                    label={`Show ${TITLES[w.widgetId]} on the board`}
                    onChange={(on) => void save({ dashboard: setVisible(prefs.dashboard, w.widgetId, on) })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className={styles.side}>
          <section className={styles.panel} aria-labelledby="board-h">
            <header className={styles.panelHead}>
              <h2 id="board-h" className="t-body-m-strong">
                Your board
              </h2>
              <span className={`${styles.dim} t-body-s tabular`}>
                {sp.used} of {sp.of} spaces
              </span>
            </header>
            <ol className={styles.schematic}>
              {board.map((w) => (
                <li key={w.widgetId} className={`${styles.cell} ${styles[`s${w.size}`]} ${w.widgetId === "forgotten" ? styles.hero : ""} t-meta`}>
                  {TITLES[w.widgetId]}
                </li>
              ))}
            </ol>
            <p className={`${styles.dim} t-caption`}>Turning on another widget adds a row below.</p>
          </section>

          <section className={styles.panel} aria-labelledby="order-h">
            <h2 id="order-h" className="t-body-m-strong">
              Order on small screens
            </h2>
            <ol className={styles.order}>
              {stack.map((id, i) => (
                <li key={id} className={styles.row}>
                  <span className={`${styles.dim} t-body-s tabular`} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={`${styles.rowName} t-body-m`}>{TITLES[id]}</span>
                  <IconButton icon="bx-chevron-up" label={`Move ${TITLES[id]} up`} data-move={`${id}:-1`} disabled={i === 0} onClick={() => onMove(id, -1)} />
                  <IconButton icon="bx-chevron-down" label={`Move ${TITLES[id]} down`} data-move={`${id}:1`} disabled={i === stack.length - 1} onClick={() => onMove(id, 1)} />
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

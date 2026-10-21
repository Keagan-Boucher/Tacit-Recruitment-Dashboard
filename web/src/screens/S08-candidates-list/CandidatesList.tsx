import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { staleness, type SearchHit, type SearchResponse } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, Chip, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, ListRow, Skeleton } from "../../components";
import { api } from "../../lib/api";
import { useCandidates } from "../../lib/data";
import styles from "./CandidatesList.module.css";
import { useCited } from "./useCited";
import {
  FILTERS,
  SOURCE_FILTERS,
  fadeFor,
  groupByAge,
  highlight,
  hitSource,
  lastSeen,
  lastSeenLabel,
  matchesFilter,
  matchesQuery,
  matchesSource,
  sourceCounts,
  type CitedAttr,
  type FilterId,
  type HitSource,
  type Person,
  type SourceFilterId,
} from "./view";

const PEEK = 3; // rows a group shows before "See all"
// Dev only: what ?state=search-results / search-no-results type into the search box.
const DEV_QUERY: Record<string, string> = { "search-results": "FICO", "search-no-results": "Cobol" };
// Dev only: canned "Why it matched" and the attribute each one cites (days old), for ?state=search-results, so snap needs no model call.
const DEV_WHY: [text: string, kind: SearchHit["kind"], source: CitedAttr["sourceType"], days: number][] = [
  ["Did FICO configuration on two S/4HANA rollouts.", "stated", "cv", 40],
  ["“Financial Accounting and Controlling” is FICO spelled out.", "interpreted", "note", 95],
  ["Taught himself FICO, month-end close inside SAP finance modules.", "stated", "note", 430],
  ["Ran the FICO close for a retailer, keen to move.", "stated", "override", 20],
];

/** Retry remounts the screen, which opens a fresh Firestore listener (a failed listener does not recover by itself). */
export default function CandidatesList() {
  const [attempt, setAttempt] = useState(0);
  return <Candidates key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Candidates({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const live = useCandidates();
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [params, setParams] = useSearchParams();
  const q0 = params.get("q")?.trim().slice(0, 200) ?? ""; // the palette's "Search notes for …" lands here
  const [query, setQuery] = useState(DEV_QUERY[state] ?? q0);
  const [filter, setFilter] = useState<FilterId>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterId>("all");
  const [hits, setHits] = useState<SearchHit[] | null>(null); // set once "Search by meaning" has answered
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const error = state === "error" ? new Error("dev") : live.error;
  const all = state === "loading" || error ? undefined : state === "empty" ? [] : live.data;

  const cited = useCited(hits);
  const syncUrl = (q: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (q) n.set("q", q);
        else n.delete("q");
        return n;
      },
      { replace: true },
    );

  async function searchByMeaning(text = query) {
    const q = text.trim();
    if (!q || asking) return;
    setAsking(true);
    setFailed(false);
    syncUrl(q);
    try {
      setSourceFilter("all");
      setHits((await api<SearchResponse>("/api/search", { query: q })).hits);
    } catch {
      setFailed(true); // keep the typed query and the local results
    } finally {
      setAsking(false);
    }
  }
  const type = (v: string) => {
    setQuery(v);
    setHits(null);
    setFailed(false);
    if (!v.trim()) syncUrl("");
  };
  // Arriving with ?q= runs the by-meaning search once (the ref stops StrictMode's second effect firing it twice).
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !q0 || DEV_QUERY[state]) return;
    arrived.current = true;
    void searchByMeaning(q0);
    // runs once on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addButton = (
    <Link to="/candidates/new" className={buttonClass("primary")}>
      <Icon name="bx-plus" />
      Add a candidate
    </Link>
  );

  if (!all) {
    return (
      <div className={styles.page}>
        <PageHeader headline="People you have met." />
        {error ? (
          <ErrorBanner title="Couldn’t load your candidates." onRetry={onRetry} />
        ) : (
          <div role="status" aria-live="polite">
            <p className={`${styles.loading} t-body-s`}>Loading everyone you have met.</p>
            <div className={styles.card} aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} height={56} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader headline="No one yet." />
        <div className={styles.card}>
          <EmptyState message="Everyone you interview will show up here." action={addButton} />
        </div>
      </div>
    );
  }

  const searching = query.trim() !== "";
  const sample = state === "search-results" && all.length ? all.slice(0, DEV_WHY.length).map((c, i): SearchHit => ({ candidateId: c.id, whyMatched: DEV_WHY[i]![0], kind: DEV_WHY[i]![1], attributeIds: [`dev-${i}`] })) : null;
  const meaning = hits ?? sample;
  const sources: ReadonlyMap<string, CitedAttr> = hits
    ? cited
    : new Map((sample ?? []).map((h, i) => [`dev-${i}`, { id: `dev-${i}`, candidateId: h.candidateId, sourceType: DEV_WHY[i]![2], observedAt: new Date(now.getTime() - DEV_WHY[i]![3] * 86_400_000) }]));
  const byId = new Map(all.map((c) => [c.id, c]));
  const why = new Map((meaning ?? []).map((h) => [h.candidateId, h]));
  // Meaning results keep the model's order; typing falls back to the instant local filter.
  const found = meaning ? meaning.flatMap((h) => byId.get(h.candidateId) ?? []) : all.filter((c) => matchesQuery(c, query));
  const sourceOf = (c: Person): HitSource | null => {
    const h = why.get(c.id);
    return h ? hitSource(h, sources, now) : null;
  };
  // While meaning results show, the filters say where the evidence came from; otherwise they are about the person.
  const shown = found.filter((c) => (meaning ? matchesSource(sourceOf(c), sourceFilter) : matchesFilter(c, filter, now)));
  const narrowed = searching || filter !== "all" || Boolean(meaning);
  const count = (f: FilterId) => found.filter((c) => matchesFilter(c, f, now)).length;
  const counts = sourceCounts(found.map(sourceOf));
  const groups = narrowed ? [] : groupByAge(shown, now);

  // One click handler for every row and "See all" link, so navigation stays client-side (ListRow renders plain anchors).
  function goInApp(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

  /** A search hit: the person, the model's sentence with the user's words marked, and where it came from. */
  const hitRow = (c: Person, h: SearchHit, fade: 0 | 1 | 2) => {
    const src = sourceOf(c);
    return (
      <li key={c.id}>
        <ListRow
          className={styles.hit}
          chevron
          title={
            <Link to={`/candidates/${c.id}`} className={styles.stretch}>
              {c.fullName}
            </Link>
          }
          meta={`${c.headline}, ${c.location}`}
          fade={fade}
        >
          <span className={styles.why}>
            <span className="t-body-s">
              {highlight(h.whyMatched, query).map((r, i) =>
                r.hit ? (
                  <mark key={i} className={`${styles.mark} t-body-s-strong`}>
                    {r.text}
                  </mark>
                ) : (
                  r.text
                ),
              )}
            </span>
            {src && (
              <span className={`${styles.source} t-caption`}>
                <Icon name={src.kind === "cv" ? "bx-file" : "bx-pencil"} size={14} />
                <Link to={`/candidates/${src.candidateId}?attr=${encodeURIComponent(src.attributeId)}`} className={styles.sourceLink}>
                  {src.text}
                  {src.staleMonths !== undefined && (
                    <>
                      {" · "}
                      <span className={`${styles.stale} t-caption-strong`}>{src.staleMonths} months ago</span>
                    </>
                  )}
                  <span className="sr-only"> — show source</span>
                </Link>
              </span>
            )}
          </span>
          <span className={`${styles.heard} t-caption`}>{lastSeenLabel(lastSeen(c), now)}</span>
        </ListRow>
      </li>
    );
  };

  const row = (c: Person, fade: 0 | 1 | 2) => {
    const seen = lastSeen(c);
    const h = why.get(c.id);
    if (h) return hitRow(c, h, fade);
    const stale = staleness(seen, now) === "stale";
    return (
      <li key={c.id}>
        <ListRow href={`/candidates/${c.id}`} title={c.fullName} meta={`${c.headline}, ${c.location}`} fade={fade}>
          <span className={`${styles.heard} ${stale ? `${styles.stale} t-caption-strong` : "t-caption"}`}>
            {lastSeenLabel(seen, now)}
            {stale && <span className="sr-only">, stale evidence</span>}
          </span>
          <span className={styles.skills}>
            {c.topSkills.slice(0, 2).map((s) => (
              <Chip key={s} tone={fade === 2 ? "quiet" : "neutral"}>
                {s}
              </Chip>
            ))}
          </span>
        </ListRow>
      </li>
    );
  };

  return (
    <div className={styles.page}>
      <PageHeader
        headline={
          narrowed ? (
            <>
              <span className={styles.num}>{shown.length}</span> of {all.length} match.
            </>
          ) : (
            <>
              <span className={styles.num}>{all.length}</span> {all.length === 1 ? "person" : "people"} you have met.
            </>
          )
        }
        actions={addButton}
      />

      <div className={styles.toolbar} role="search">
        <Input
          className={styles.search}
          size="sm"
          label="Search candidates"
          hideLabel
          placeholder="Search by name, skill or location"
          value={query}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void searchByMeaning()}
          leading={<Icon name="bx-search" size={18} />}
          trailing={searching ? <IconButton icon="bx-x" label="Clear search" size={18} onClick={() => type("")} /> : undefined}
        />
        {searching && !meaning && (
          <Button icon="bx-star" onClick={() => void searchByMeaning()} disabled={asking}>
            {asking ? "Searching by meaning…" : "Search by meaning"}
          </Button>
        )}
        {meaning
          ? SOURCE_FILTERS.map((f) => (
              <FilterChip key={f.id} selected={sourceFilter === f.id} count={counts[f.id]} onClick={() => setSourceFilter(f.id)}>
                {f.label}
              </FilterChip>
            ))
          : FILTERS.map((f) => (
              <FilterChip key={f.id} selected={filter === f.id} count={count(f.id)} onClick={() => setFilter(f.id)}>
                {f.label}
              </FilterChip>
            ))}
      </div>

      {failed && (
        <ErrorBanner className={styles.banner} title="Couldn’t search by meaning." detail="Showing the words-only matches instead." onRetry={() => void searchByMeaning()} />
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {asking ? "Searching by meaning." : narrowed ? `${shown.length} of ${all.length} match.` : ""}
      </p>

      {/* The card is a click delegate only; every real control inside it is an anchor or button. */}
      <div className={styles.card} onClick={goInApp}>
        {shown.length === 0 ? (
          <EmptyState
            message={searching && sourceFilter === "all" ? `No one matches “${query.trim()}”.` : "No one matches this filter."}
            action={
              <Button
                onClick={() => {
                  type("");
                  setFilter("all");
                  setSourceFilter("all");
                }}
              >
                {searching ? "Clear search" : "Show everyone"}
              </Button>
            }
          />
        ) : narrowed || meaning ? (
          <>
            {meaning && (
              <p className={`${styles.note} t-body-s`}>
                <span className={styles.sparkle}><Icon name="bx-star" size={16} /></span> Matched by meaning, not just the words you typed.
              </p>
            )}
            <div className={`${styles.cols} t-meta`} aria-hidden="true">
              <span className={styles.who}>Person</span>
              {meaning ? <span className={styles.why}>Why it matched</span> : null}
              <span className={styles.heard}>Last heard</span>
              {!meaning && <span className={styles.skills}>Top skills</span>}
            </div>
            <ul className={styles.rows}>{shown.map((c) => row(c, fadeFor(c, now)))}</ul>
          </>
        ) : (
          groups.map((g) => {
            const expanded = open.has(g.label);
            const more = g.people.length > PEEK;
            return (
              <section key={g.label} className={styles.group} aria-label={g.label}>
                <div className={styles.head}>
                  <h2 className="t-body-m-strong">{g.label}</h2>
                  <span className={`${styles.n} t-caption tabular`}>{g.people.length}</span>
                  {more && (
                    <button
                      type="button"
                      className={`${styles.seeAll} t-caption-strong`}
                      aria-expanded={expanded}
                      onClick={() => setOpen((s) => (s.has(g.label) ? new Set([...s].filter((l) => l !== g.label)) : new Set(s).add(g.label)))}
                    >
                      {expanded ? "Show fewer" : `See all ${g.people.length}`}
                      <Icon name={expanded ? "bx-chevron-up" : "bx-chevron-down"} size={14} />
                    </button>
                  )}
                </div>
                <ul className={styles.rows}>{(expanded ? g.people : g.people.slice(0, PEEK)).map((c) => row(c, g.fade))}</ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { monthsSince, staleness, type SearchHit, type SearchResponse } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, Chip, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, ListRow, Skeleton } from "../../components";
import { api } from "../../lib/api";
import { useCandidates } from "../../lib/data";
import styles from "./CandidatesList.module.css";
import { FILTERS, fadeFor, groupByAge, lastSeen, lastSeenLabel, matchesFilter, matchesQuery, type FilterId, type Person } from "./view";

const PEEK = 3; // rows a group shows before "See all"
// Dev only: what ?state=search-results / search-no-results type into the search box.
const DEV_QUERY: Record<string, string> = { "search-results": "FICO", "search-no-results": "Cobol" };
// Dev only: canned "Why it matched" for ?state=search-results, so snap needs no model call.
const DEV_WHY: [string, SearchHit["kind"]][] = [
  ["Did FI/CO configuration on two S/4HANA rollouts.", "stated"],
  ["“Financial Accounting and Controlling” is FICO spelled out.", "interpreted"],
  ["Ran month-end close inside SAP finance modules.", "interpreted"],
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
  const [query, setQuery] = useState(DEV_QUERY[state] ?? "");
  const [filter, setFilter] = useState<FilterId>("all");
  const [hits, setHits] = useState<SearchHit[] | null>(null); // set once "Search by meaning" has answered
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const error = state === "error" ? new Error("dev") : live.error;
  const all = state === "loading" || error ? undefined : state === "empty" ? [] : live.data;

  async function searchByMeaning() {
    const q = query.trim();
    if (!q || asking) return;
    setAsking(true);
    setFailed(false);
    try {
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
  };

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
  const sample = state === "search-results" && all.length ? all.slice(0, 3).map((c, i): SearchHit => ({ candidateId: c.id, whyMatched: DEV_WHY[i]![0], kind: DEV_WHY[i]![1], attributeIds: [] })) : null;
  const meaning = hits ?? sample;
  const byId = new Map(all.map((c) => [c.id, c]));
  const why = new Map((meaning ?? []).map((h) => [h.candidateId, h]));
  // Meaning results keep the model's order; typing falls back to the instant local filter.
  const found = meaning ? meaning.flatMap((h) => byId.get(h.candidateId) ?? []) : all.filter((c) => matchesQuery(c, query));
  const shown = found.filter((c) => matchesFilter(c, filter, now));
  const narrowed = searching || filter !== "all" || Boolean(meaning);
  const count = (f: FilterId) => found.filter((c) => matchesFilter(c, f, now)).length;
  const groups = narrowed ? [] : groupByAge(shown, now);

  // One click handler for every row and "See all" link, so navigation stays client-side (ListRow renders plain anchors).
  function goInApp(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

  const row = (c: Person, fade: 0 | 1 | 2) => {
    const seen = lastSeen(c);
    const h = why.get(c.id);
    return (
      <li key={c.id}>
        <ListRow href={`/candidates/${c.id}`} title={c.fullName} meta={`${c.headline}, ${c.location}`} fade={fade} mainWidth={320}>
          {h ? (
            <span className={`${styles.why} t-body-s`}>
              {h.whyMatched}
              {h.kind === "interpreted" && (
                <Chip tone="quiet" icon="bx-star">
                  Interpreted
                </Chip>
              )}
            </span>
          ) : null}
          <span className={`${styles.heard} t-caption`}>{lastSeenLabel(seen, now)}</span>
          {!h && (
            <span className={styles.skills}>
              {c.topSkills.slice(0, 2).map((s) => (
                <Chip key={s} tone={fade === 2 ? "quiet" : "neutral"}>
                  {s}
                </Chip>
              ))}
            </span>
          )}
          <span className={styles.evidence}>
            {staleness(seen, now) === "stale" && <Chip tone="stale">Stale · {monthsSince(seen, now)} mo</Chip>}
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
        {FILTERS.map((f) => (
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
            message={searching ? `No one matches “${query.trim()}”.` : "No one matches this filter."}
            action={
              <Button
                onClick={() => {
                  type("");
                  setFilter("all");
                }}
              >
                {searching ? "Clear search" : "Show everyone"}
              </Button>
            }
          />
        ) : narrowed || meaning ? (
          <>
            {meaning && (
              <p className={`${styles.note} t-caption`}>
                <Icon name="bx-star" size={14} /> Matched by meaning, not just the words you typed.
              </p>
            )}
            <div className={`${styles.cols} t-meta`} aria-hidden="true">
              <span className={styles.who}>Person</span>
              {meaning ? <span className={styles.why}>Why it matched</span> : null}
              <span className={styles.heard}>Last heard</span>
              {!meaning && <span className={styles.skills}>Top skills</span>}
              <span className={styles.evidence}>Evidence</span>
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

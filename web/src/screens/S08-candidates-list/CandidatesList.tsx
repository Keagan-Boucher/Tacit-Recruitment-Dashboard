import { useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { monthsSince, staleness } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, Chip, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, ListRow, Skeleton } from "../../components";
import { useCandidates } from "../../lib/data";
import styles from "./CandidatesList.module.css";
import { FILTERS, fadeFor, groupByAge, lastSeen, lastSeenLabel, matchesFilter, matchesQuery, type FilterId, type Person } from "./view";

const PEEK = 3; // rows a group shows before "See all"
// Dev only: what ?state=search-results / search-no-results type into the search box.
const DEV_QUERY: Record<string, string> = { "search-results": "Cape Town", "search-no-results": "Cobol" };

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
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const error = state === "error" ? new Error("dev") : live.error;
  const all = state === "loading" || error ? undefined : state === "empty" ? [] : live.data;

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
  const found = all.filter((c) => matchesQuery(c, query));
  const shown = found.filter((c) => matchesFilter(c, filter, now));
  const narrowed = searching || filter !== "all";
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
    return (
      <li key={c.id}>
        <ListRow href={`/candidates/${c.id}`} title={c.fullName} meta={`${c.headline}, ${c.location}`} fade={fade} mainWidth={320}>
          <span className={`${styles.heard} t-caption`}>{lastSeenLabel(seen, now)}</span>
          <span className={styles.skills}>
            {c.topSkills.slice(0, 2).map((s) => (
              <Chip key={s} tone={fade === 2 ? "quiet" : "neutral"}>
                {s}
              </Chip>
            ))}
          </span>
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
          onChange={(e) => setQuery(e.target.value)}
          leading={<Icon name="bx-search" size={18} />}
          trailing={searching ? <IconButton icon="bx-x" label="Clear search" size={18} onClick={() => setQuery("")} /> : undefined}
        />
        {FILTERS.map((f) => (
          <FilterChip key={f.id} selected={filter === f.id} count={count(f.id)} onClick={() => setFilter(f.id)}>
            {f.label}
          </FilterChip>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {narrowed ? `${shown.length} of ${all.length} match.` : ""}
      </p>

      {/* The card is a click delegate only; every real control inside it is an anchor or button. */}
      <div className={styles.card} onClick={goInApp}>
        {shown.length === 0 ? (
          <EmptyState
            message={searching ? `No one matches “${query.trim()}”.` : "No one matches this filter."}
            action={
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {searching ? "Clear search" : "Show everyone"}
              </Button>
            }
          />
        ) : narrowed ? (
          <>
            {/* ponytail: R-13 inserts the "Why it matched" column here (and the "Matched by meaning" note above the list). */}
            <div className={`${styles.cols} t-meta`} aria-hidden="true">
              <span className={styles.who}>Person</span>
              <span className={styles.heard}>Last heard</span>
              <span className={styles.skills}>Top skills</span>
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

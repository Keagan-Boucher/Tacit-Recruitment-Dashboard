import { useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { Candidate, Company, Match, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, ListRow, Skeleton } from "../../components";
import { useOwned } from "../../lib/data";
import styles from "./RolesList.module.css";
import { budgetLabel, matchesQuery, personWord, placedLine, roleRows, type RoleRow } from "./view";

type Status = Role["status"];
const STATUSES: { id: Status; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "filled", label: "Filled" },
  { id: "expired", label: "Expired" },
];

/** A count as a plain numeral: Title weight, and quiet Body M when it is zero. */
const Num = ({ n }: { n: number }) => <span className={n ? "t-title tabular" : `${styles.zero} t-body-m tabular`}>{n}</span>;

/** Retry remounts the screen, which opens fresh Firestore listeners (a failed listener does not recover by itself). */
export default function RolesList() {
  const [attempt, setAttempt] = useState(0);
  return <Roles key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Roles({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const navigate = useNavigate();
  const roles = useOwned<Role>("roles");
  const companies = useOwned<Company>("companies");
  const matches = useOwned<Match>("matches");
  const overrides = useOwned<Override>("overrides");
  const candidates = useOwned<Candidate>("candidates");
  const placements = useOwned<Placement>("placements");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("open");

  const error = state === "error" ? new Error("dev") : [roles, companies, matches, overrides, candidates, placements].find((l) => l.error)?.error;
  const ready = roles.data && companies.data && matches.data && overrides.data && candidates.data && placements.data;
  const loading = state === "loading" || (state !== "empty" && !error && !ready);
  const all = state === "empty" ? [] : roleRows(roles.data ?? [], companies.data ?? [], matches.data ?? [], overrides.data ?? []);

  const newRole = (
    <Link to="/roles/new" className={buttonClass("primary")}>
      <Icon name="bx-plus" />
      New role
    </Link>
  );

  if (error || loading || all.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader headline={all.length === 0 && !loading && !error ? "No roles yet." : "Your roles."} />
        {error ? (
          <ErrorBanner title="Couldn’t load your roles." onRetry={onRetry} />
        ) : loading ? (
          <div role="status" aria-live="polite">
            <p className={`${styles.loading} t-body-s`}>Loading your roles.</p>
            <div className={styles.card} aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} height={56} />
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <EmptyState message="Roles you open from a client brief will show up here." action={newRole} />
          </div>
        )}
      </div>
    );
  }

  const found = all.filter((r) => matchesQuery(r, query));
  const count = (s: Status) => found.filter((r) => r.role.status === s).length;
  const shown = found.filter((r) => r.role.status === status);
  const searching = query.trim() !== "";
  const label = STATUSES.find((s) => s.id === status)!.label.toLowerCase();
  const name = (id: string) => candidates.data?.find((c) => c.id === id)?.fullName;
  // The two newest roles that were filled, with who got the job.
  const filled = status === "open" && !searching
    ? all
        .filter((r) => r.role.status === "filled")
        .sort((a, b) => (b.role.closedAt ?? b.role.openedAt).getTime() - (a.role.closedAt ?? a.role.openedAt).getTime())
        .slice(0, 2)
    : [];

  // One click handler for every row, so navigation stays client-side (ListRow renders plain anchors).
  function goInApp(e: MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

  const sub = (r: RoleRow) => [r.role.interpretedBrief?.location, budgetLabel(r.role.interpretedBrief)].filter(Boolean).join(" · ");

  return (
    <div className={styles.page}>
      <PageHeader
        headline={
          <>
            <span className={styles.num}>{shown.length}</span> {label} {shown.length === 1 ? "role" : "roles"}.
          </>
        }
        actions={
          <>
            <Input
              className={styles.search}
              size="sm"
              label="Search roles"
              hideLabel
              placeholder="Search by role, company or skill"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leading={<Icon name="bx-search" size={18} />}
              trailing={searching ? <IconButton icon="bx-x" label="Clear search" size={18} onClick={() => setQuery("")} /> : undefined}
            />
            {newRole}
          </>
        }
      />

      <div className={styles.toolbar} role="group" aria-label="Role status">
        {STATUSES.map((s) => (
          <FilterChip key={s.id} selected={status === s.id} count={count(s.id)} onClick={() => setStatus(s.id)}>
            {s.label}
          </FilterChip>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {searching ? `${shown.length} ${label} ${shown.length === 1 ? "role" : "roles"} match.` : ""}
      </p>

      {/* The cards are click delegates only; every real control inside is an anchor or button. */}
      <div className={styles.stack} onClick={goInApp}>
        <div className={styles.card}>
          {shown.length === 0 ? (
            <EmptyState
              message={searching ? `No ${label} role matches “${query.trim()}”.` : `No ${label} roles.`}
              action={searching ? <Button onClick={() => setQuery("")}>Clear search</Button> : undefined}
            />
          ) : (
            <>
              <div className={`${styles.cols} t-meta`} aria-hidden="true">
                <span className={styles.role}>Role</span>
                <span className={styles.company}>Company</span>
                <span className={styles.waiting}>Waiting on you</span>
                <span className={styles.short}>Shortlisted</span>
                <span className={styles.evidence}>Stale evidence</span>
              </div>
              <ul className={styles.rows}>
                {shown.map((r) => (
                  <li key={r.role.id}>
                    <ListRow href={`/roles/${r.role.id}`} title={r.role.title} meta={sub(r)} className={styles.row}>
                      <span className={`${styles.company} t-body-s`}>{r.company}</span>
                      <span className={styles.waiting}>
                        <Num n={r.waiting} />
                        <span className={`${styles.lbl} t-caption`}> waiting on you</span>
                      </span>
                      <span className={styles.short}>
                        <Num n={r.shortlisted} />
                        <span className={`${styles.lbl} t-caption`}> shortlisted</span>
                      </span>
                      <span className={styles.evidence}>
                        {r.stale > 0 ? (
                          <>
                            <span className={`${styles.stale} t-title tabular`}>{r.stale}</span>
                            <span className={`${styles.unit} t-caption`}> {personWord(r.stale)}<span className={`${styles.lbl} t-caption`}> with stale evidence</span></span>
                          </>
                        ) : r.suggested === 0 ? (
                          <span className={`${styles.zero} t-body-s`}>No one fits yet</span>
                        ) : null}
                      </span>
                    </ListRow>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {filled.length > 0 && (
          <section className={styles.card} aria-labelledby="filled-title">
            <div className={styles.head}>
              <h2 id="filled-title" className="t-body-m-strong">Recently filled</h2>
              <span className={`${styles.n} t-caption tabular`}>{count("filled")}</span>
            </div>
            <ul className={styles.rows}>
              {filled.map((r) => {
                const who = placements.data?.find((p) => p.roleId === r.role.id && p.outcome === "placed");
                const person = who && name(who.candidateId);
                const line = person ? placedLine(person, who.reason) : null;
                return (
                  <li key={r.role.id}>
                    <ListRow href={`/roles/${r.role.id}`} title={r.role.title} meta={sub(r)} className={styles.row}>
                      <span className={`${styles.company} t-body-s`}>{r.company}</span>
                      <span className={`${styles.placed} t-body-s`}>
                        {line && (
                          <>
                            <strong className="t-body-s-strong">{line.who}</strong>
                            {line.rest}
                          </>
                        )}
                      </span>
                    </ListRow>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

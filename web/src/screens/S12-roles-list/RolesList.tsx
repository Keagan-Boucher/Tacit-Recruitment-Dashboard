import { useState } from "react";
import { Link } from "react-router";
import type { Candidate, Company, Match, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, Skeleton } from "../../components";
import { useOwned } from "../../lib/data";
import { lastSeenLabel } from "../S08-candidates-list/view";
import styles from "./RolesList.module.css";
import { budgetLabel, matchesQuery, personWord, placedLine, roleRows, type RoleRow } from "./view";

type Status = Role["status"];
type Placed = ReturnType<typeof placedLine> | null;
const STATUSES: { id: Status; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "filled", label: "Filled" },
  { id: "expired", label: "Expired" },
];

/** Retry remounts the screen, which opens fresh Firestore listeners (a failed listener does not recover by itself). */
export default function RolesList() {
  const [attempt, setAttempt] = useState(0);
  return <Roles key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Roles({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const roles = useOwned<Role>("roles");
  const companies = useOwned<Company>("companies");
  const matches = useOwned<Match>("matches");
  const overrides = useOwned<Override>("overrides");
  const candidates = useOwned<Candidate>("candidates");
  const placements = useOwned<Placement>("placements");
  const [now] = useState(() => new Date());
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
            <div className={styles.skeletons} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} height={260} radius="widget" />
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.panel}>
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
  const placed = (r: RoleRow): Placed => {
    const p = placements.data?.find((x) => x.roleId === r.role.id && x.outcome === "placed");
    const person = p && candidates.data?.find((c) => c.id === p.candidateId)?.fullName;
    return person ? placedLine(person, p.reason) : null;
  };
  // The two newest roles that were filled, with who got the job.
  const filled = status === "open" && !searching
    ? all
        .filter((r) => r.role.status === "filled")
        .sort((a, b) => (b.role.closedAt ?? b.role.openedAt).getTime() - (a.role.closedAt ?? a.role.openedAt).getTime())
        .slice(0, 2)
    : [];

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

      {shown.length === 0 ? (
        <div className={styles.panel}>
          <EmptyState
            message={searching ? `No ${label} role matches “${query.trim()}”.` : `No ${label} roles.`}
            action={searching ? <Button onClick={() => setQuery("")}>Clear search</Button> : undefined}
          />
        </div>
      ) : (
        <ul className={styles.grid}>
          {shown.map((r) => (
            <li key={r.role.id}>
              <RoleCard row={r} now={now} placed={placed(r)} />
            </li>
          ))}
          {filled.length > 0 && (
            <li className={styles.filledCell}>
              <section className={styles.filled} aria-labelledby="filled-title">
                <div className={styles.head}>
                  <h2 id="filled-title" className="t-body-m-strong">Recently filled</h2>
                  <span className={`${styles.n} t-caption tabular`}>{count("filled")}</span>
                </div>
                <ul className={styles.filledRows}>
                  {filled.map((r) => {
                    const line = placed(r);
                    return (
                      <li key={r.role.id}>
                        <Link to={`/roles/${r.role.id}`} className={styles.filledRow}>
                          <span className={styles.name}>
                            <span className="t-body-m-strong">{r.role.title}</span>
                            <span className={`${styles.sub} t-caption`}>{r.company} · filled {lastSeenLabel(r.role.closedAt ?? r.role.openedAt, now)}</span>
                          </span>
                          {line && (
                            <span className={`${styles.placed} t-body-s`}>
                              <strong className="t-body-s-strong">{line.who}</strong>
                              {line.rest}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className={`${styles.seeAll} t-body-s-strong`} onClick={() => setStatus("filled")}>
                  See all {count("filled")} filled roles
                </button>
              </section>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function RoleCard({ row: r, now, placed }: { row: RoleRow; now: Date; placed: Placed }) {
  const { role } = r;
  const isFilled = role.status === "filled";
  const brief = role.interpretedBrief;
  const fact = [brief?.location, budgetLabel(brief), brief?.mustHave[0]].filter(Boolean).join(" · ") || "No brief yet.";
  const when: [string, Date] = isFilled && role.closedAt ? ["Filled", role.closedAt] : ["Opened", role.openedAt];
  const stat = (n: number, words: string, tone?: string) => (
    <span className={`${styles.stat} ${n === 0 ? styles.zero : tone}`}>
      <b className="t-figure-medium tabular">{n}</b>
      <span className={`${styles.sub} t-caption`}>{words}</span>
    </span>
  );
  return (
    <Link to={`/roles/${role.id}`} className={styles.card}>
      <span className={styles.title}>
        <span className={styles.name}>
          <span className="t-title">{role.title}</span>
          <span className={`${styles.sub} t-caption`}>{r.company}</span>
        </span>
        <Icon name="bx-chevron-right" size={18} />
      </span>
      {isFilled ? (
        <span className={`${styles.placed} t-body-s`}>
          {placed ? (
            <>
              <strong className="t-body-s-strong">{placed.who}</strong>
              {placed.rest}
            </>
          ) : (
            "Filled"
          )}
        </span>
      ) : (
        <span className={styles.stats}>
          {stat(r.waiting, "waiting on you", styles.lime)}
          {stat(r.shortlisted, "shortlisted")}
        </span>
      )}
      <span className={`${styles.sub} ${styles.clock} t-caption`}>
        <Icon name="bx-time" size={14} />
        {when[0]} {lastSeenLabel(when[1], now)}
      </span>
      <span className={styles.fact}>
        <span className="t-body-s-para">{fact}</span>
        {!isFilled && r.stale > 0 ? (
          <span className={`${styles.sub} t-caption`}>
            <span className={`${styles.age} t-caption-strong`}>{r.stale} {personWord(r.stale)}</span> with stale evidence
          </span>
        ) : !isFilled && r.suggested === 0 ? (
          <span className={`${styles.sub} t-caption`}>No one fits yet</span>
        ) : null}
      </span>
    </Link>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import type { Company, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, EmptyState, ErrorBanner, FilterChip, Icon, IconButton, Input, Skeleton } from "../../components";
import { useOwned } from "../../lib/data";
import { lastSeenLabel } from "../S08-candidates-list/view";
import { monthYear, staleAge } from "../S11-company-profile/facts";
import styles from "./CompaniesList.module.css";
import { NewCompanyDialog } from "./NewCompanyDialog";
import { buildRows, FILTERS, matchesFilter, matchesQuery, type FilterId, type Row } from "./view";

/** Retry remounts the screen, which opens fresh Firestore listeners. */
export default function CompaniesList() {
  const [attempt, setAttempt] = useState(0);
  return <Companies key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Companies({ onRetry }: { onRetry: () => void }) {
  const state = useScreenState();
  const companies = useOwned<Company>("companies");
  const roles = useOwned<Role>("roles");
  const placements = useOwned<Placement>("placements");
  const overrides = useOwned<Override>("overrides");
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [adding, setAdding] = useState(state === "new-company");

  const error = state === "error" ? new Error("dev") : [companies, roles, placements, overrides].find((l) => l.error)?.error;
  const ready = state !== "loading" && !error && [companies, roles, placements, overrides].every((l) => l.data);
  const all = ready ? buildRows(state === "empty" ? [] : companies.data!, roles.data!, placements.data!, overrides.data!) : undefined;

  if (!all) {
    return (
      <div className={styles.page}>
        <PageHeader headline="Companies." />
        {error ? (
          <ErrorBanner title="Couldn’t load your companies." detail="Nothing was lost." onRetry={onRetry} />
        ) : (
          <div role="status" aria-live="polite">
            <p className={`${styles.loading} t-body-s`}>Loading your companies.</p>
            <div className={styles.skeletons} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} height={227} radius="widget" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const newCompany = (
    <Button variant="primary" icon="bx-plus" onClick={() => setAdding(true)}>
      New company
    </Button>
  );
  const dialog = adding && <NewCompanyDialog companies={companies.data!} onClose={() => setAdding(false)} />;

  if (all.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader headline="No companies yet." />
        <div className={styles.panel}>
          <EmptyState
            message="Companies you place people with will show up here, with what you have learned about each."
            action={
              <div className={styles.actions}>
                {newCompany}
                <Link to="/roles/new" className={buttonClass()}>
                  Open a role
                </Link>
              </div>
            }
          />
        </div>
        {dialog}
      </div>
    );
  }

  const searching = query.trim() !== "";
  const found = all.filter((r) => matchesQuery(r, query));
  const shown = found.filter((r) => matchesFilter(r, filter, now));
  const count = (f: FilterId) => found.filter((r) => matchesFilter(r, f, now)).length;
  const openRoles = all.reduce((n, r) => n + r.openRoles, 0);

  return (
    <div className={styles.page}>
      <PageHeader
        headline={
          <>
            <span className={styles.num}>{all.length}</span> {all.length === 1 ? "company" : "companies"}, {plural(openRoles, "open role")}.
          </>
        }
        actions={newCompany}
      />
      <div className={styles.toolbar} role="search">
        <Input
          className={styles.search}
          size="sm"
          label="Search companies"
          hideLabel
          placeholder="Search by company, sector or placement"
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
        {searching || filter !== "all" ? `${shown.length} of ${all.length} match.` : ""}
      </p>
      {shown.length === 0 ? (
        <div className={styles.panel}>
          <EmptyState
            message={searching ? `No company matches “${query.trim()}”.` : "No company matches this filter."}
            action={
              <button type="button" className={buttonClass()} onClick={() => { setQuery(""); setFilter("all"); }}>
                Show every company
              </button>
            }
          />
        </div>
      ) : (
        <ul className={styles.grid}>
          {shown.map((r) => (
            <li key={r.company.id}>
              <CompanyCard row={r} now={now} />
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}

function CompanyCard({ row: { company, openRoles, placements, lastContact, paySeen }, now }: { row: Row; now: Date }) {
  const payAge = paySeen && staleAge(paySeen, now);
  return (
    <Link to={`/companies/${company.id}`} className={`${styles.card} ${openRoles === 0 ? styles.quiet : ""}`}>
      <span className={styles.title}>
        <span className={styles.name}>
          <span className="t-title">{company.name}</span>
          <span className={`${styles.sector} t-caption`}>{company.sector.replace(", ", " · ")}</span>
        </span>
        <Icon name="bx-chevron-right" size={18} />
      </span>
      <span className={styles.stats}>
        <span className={`${styles.stat} ${openRoles === 0 ? styles.zero : ""}`}>
          <b className="t-figure-medium tabular">{openRoles}</b>
          <span className={`${styles.sector} t-caption`}>{openRoles === 1 ? "open role" : "open roles"}</span>
        </span>
        <span className={`${styles.stat} ${placements === 0 ? styles.zero : ""}`}>
          <b className="t-figure-medium tabular">{placements}</b>
          <span className={`${styles.sector} t-caption`}>{placements === 1 ? "placement" : "placements"}</span>
        </span>
      </span>
      <span className={`${styles.contact} t-caption`}>
        <Icon name="bx-time" size={14} />
        Last contact {lastSeenLabel(lastContact, now)}
      </span>
      <span className={styles.fact}>
        <span className="t-body-s-para">{company.notes || company.hiringPattern || "Nothing recorded yet."}</span>
        {paySeen && payAge && (
          <span className={`${styles.pay} t-caption`}>
            Pay seen · {monthYear(paySeen)} · <span className={`${styles.age} t-caption-strong`}>{payAge}</span>
          </span>
        )}
      </span>
    </Link>
  );
}

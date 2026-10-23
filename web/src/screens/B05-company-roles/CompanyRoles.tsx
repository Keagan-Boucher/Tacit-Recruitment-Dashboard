import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app";
import { buttonClass, EmptyState, ErrorBanner, Icon, Skeleton } from "../../components";
import { RECRUITER_FIRST, type CompanyPortal } from "../../features/portal/company";
import { useCompanyScreen } from "../../features/portal/companyData";
import styles from "./CompanyRoles.module.css";
import { headlineFor, roleCards, type RoleCard } from "./view";

const send = (
  <Link to="/company/briefs/new" className={buttonClass("primary")}>
    <Icon name="bx-plus" />
    Send a brief
  </Link>
);

/** Retry and dev states remount through the key, like B02. */
export default function CompanyRoles() {
  const { data, error, retry, dev } = useCompanyScreen();
  return <Screen key={dev ?? "live"} data={data} error={!!error} retry={retry} />;
}

function Screen({ data, error, retry }: { data: CompanyPortal | undefined; error: boolean; retry: () => void }) {
  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader headline={error ? "Your roles." : "Loading your roles."} actions={send} />
        {error ? (
          <ErrorBanner title="Couldn’t load your roles." detail="Nothing was lost. Your briefs and shortlists are safe." onRetry={retry} />
        ) : (
          <div className={styles.grid} role="status" aria-live="polite" aria-label="Loading your roles">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} radius="widget" height={219} />)}
          </div>
        )}
      </div>
    );
  }

  const cards = roleCards(data.submissions, data.entries);
  if (cards.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader headline="No roles yet." actions={send} />
        <div className={styles.panel}>
          <EmptyState message={`Send a brief and, once ${RECRUITER_FIRST} accepts it, the role shows up here with its shortlist.`} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader headline={<><span className={styles.num}>{cards.length}</span> {headlineFor(cards.length)}</>} actions={send} />
      <ul className={styles.grid} aria-live="polite">
        {cards.map((c) => <li key={c.id}><Card card={c} /></li>)}
      </ul>
    </div>
  );
}

/** The whole card is the link when the role has a shortlist to open; otherwise a plain card whose own action is the link. */
function Card({ card: c }: { card: RoleCard }) {
  const cls = `${styles.card} ${c.word === "Filled" ? styles.filled : ""} ${c.to ? styles.linked : ""}`;
  const body: ReactNode = (
    <>
      <span className={styles.head}>
        <span className={styles.name}>
          <span className="t-title">{c.title}</span>
          <span className={styles.status}>
            <span className={`t-caption-strong ${styles[c.tone]}`}>{c.word}</span>
            <span className={`t-caption ${styles.context}`}>{c.context}</span>
          </span>
        </span>
        {c.to && <Icon name="bx-chevron-right" size={18} />}
      </span>
      {c.counts && (
        <span className={styles.stats}>
          <span className={styles.stat}><b className="t-figure-medium tabular">{c.counts.shortlisted}</b><span className="t-caption">shortlisted</span></span>
          {c.counts.interviewing > 0 && <span className={styles.stat}><b className="t-figure-medium tabular">{c.counts.interviewing}</b><span className="t-caption">interviewing</span></span>}
        </span>
      )}
      {(c.note || c.quote || c.facts || c.action) && (
        <span className={styles.rest}>
          {c.note && <span className={`t-body-s-para ${styles.text}`}>{c.note}</span>}
          {c.quote && <span className={`t-body-s-para ${styles.text}`}>“{c.quote}”</span>}
          {c.facts && <span className={`t-caption ${styles.facts}`}>{c.facts}</span>}
          {c.action && (c.to ? (
            <span className={`t-body-s-strong ${styles.action}`}>{c.action.label}<Icon name="bx-chevron-right" size={16} /></span>
          ) : (
            <Link to={c.action.to} className={`t-body-s-strong ${styles.action} ${styles.actionLink}`}>{c.action.label}<Icon name="bx-chevron-right" size={16} /></Link>
          ))}
        </span>
      )}
    </>
  );
  return c.to ? <Link to={c.to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

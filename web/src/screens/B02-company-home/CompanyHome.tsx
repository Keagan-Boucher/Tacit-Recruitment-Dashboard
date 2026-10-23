import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "../../app";
import { buttonClass, Card, ErrorBanner, Icon, Skeleton } from "../../components";
import { initials, useAuth } from "../../features/auth";
import {
  briefsInReview, dayMonth, fmtDay, headline, heroFor, hiredSummary, meetingRows, monthYear, RECRUITER, RECRUITER_FIRST, RECRUITER_INITIALS, roleRows,
  type CompanyPortal, type Hero, type Row, type Tone,
} from "../../features/portal/company";
import { useCompanyScreen } from "../../features/portal/companyData";
import styles from "./CompanyHome.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** Status is a coloured word, then quiet detail: "Open · 4 shortlisted · 1 interviewing". */
function Meta({ word, tone, children }: { word: string; tone: Tone; children?: ReactNode }) {
  return (
    <>
      <span className={`t-body-s-strong ${styles[tone]}`}>{word}</span>
      {children && <span className={styles.quiet}>{` · `}{children}</span>}
    </>
  );
}

/** A surface-2 row: title, then a quiet line that wraps. Clickable (a button) when given onOpen. */
function Row({ title, meta, onOpen }: { title: string; meta: ReactNode; onOpen?: () => void }) {
  const body = (
    <>
      <span className={styles.rowMain}>
        <span className="t-body-m-strong">{title}</span>
        <span className={`t-caption ${styles.rowMeta}`}>{meta}</span>
      </span>
      {onOpen && <Icon name="bx-chevron-right" size={18} />}
    </>
  );
  return onOpen ? <button type="button" className={styles.row} onClick={onOpen}>{body}</button> : <div className={styles.row}>{body}</div>;
}

function Widget({ title, count, className, children }: { title: string; count?: number; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={cx(styles.widget, className)}>
      <header className={styles.wh}>
        <h2 id={id} className={`t-body-m-strong ${styles.wt}`}>{title}</h2>
        {count !== undefined && <span className={`t-body-m-strong tabular ${styles.count}`}>{count}</span>}
      </header>
      {children}
    </Card>
  );
}

export default function CompanyHome() {
  const { data, error, retry, dev } = useCompanyScreen();
  return <Screen key={dev ?? "live"} data={data} error={!!error} retry={retry} />;
}

function Screen({ data, error, retry }: { data: CompanyPortal | undefined; error: boolean; retry: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const send = <Link to="/company/briefs/new" className={buttonClass("primary")}><Icon name="bx-plus" />Send a brief</Link>;

  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader headline={error ? "Welcome back." : "Loading your page."} actions={send} />
        {error && <ErrorBanner className={styles.banner} title="Couldn’t load your page." detail="Nothing was lost. Your briefs and shortlists are safe." onRetry={retry} />}
        <Board><Skeletons /></Board>
      </div>
    );
  }

  const { submissions, entries, portalUser } = data;
  const first = (portalUser?.displayName ?? user?.displayName ?? "").split(" ")[0] ?? "";
  const hero = heroFor(entries, submissions);
  const head = headline(hero, first);
  const inReview = briefsInReview(submissions);
  const roles = roleRows(submissions, entries);
  const hired = hiredSummary(entries, now);
  const meeting = meetingRows(entries);
  const empty = submissions.length === 0 && entries.length === 0;

  return (
    <div className={styles.page}>
      <PageHeader headline={<>{head.count !== undefined && <span className={styles.num}>{head.count}</span>}{head.text}</>} actions={send} />
      <Board>
        <HeroCard hero={hero} />
        <Widget title="Briefs under review" count={inReview.length || undefined} className={styles.briefs}>
          {inReview.length === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>Briefs you send wait here until {RECRUITER_FIRST} accepts them.</p>
          ) : (
            <>
              <ul className={styles.list} aria-live="polite">
                {inReview.map((b) => (
                  <li key={b.id}><Row title={b.title} meta={<Meta word="Under review" tone="neutral">{b.meta}</Meta>} /></li>
                ))}
              </ul>
              <span className={styles.spacer} />
              <Link to="/company/briefs/new" className={`t-body-s-strong ${styles.link}`}>Send another brief<Icon name="bx-chevron-right" size={16} /></Link>
            </>
          )}
        </Widget>
        <Widget title="Hired through Tacit" className={styles.hired}>
          {hired.count === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>People you hire through Tacit are counted here.</p>
          ) : (
            <>
              <p className={styles.figure}>
                <span className="t-figure tabular">{hired.count}</span>
                {hired.count > hired.thisYear && hired.thisYear > 0 && <span className={`t-body-s ${styles.quiet}`}>+{hired.thisYear} this year</span>}
              </p>
              <p className={`t-body-s-para ${styles.body}`}>
                Since {monthYear(hired.since!)}. The latest was hired on {dayMonth(hired.latest!)}.
              </p>
            </>
          )}
        </Widget>
        <Widget title="Your roles" count={roles.length || undefined} className={styles.roles}>
          {roles.length === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>Accepted briefs become roles. Each shows how many people are shortlisted and where they are.</p>
          ) : (
            <ul className={styles.list} aria-live="polite">
              {roles.map((r) => (
                <li key={r.id}><RoleRow row={r} onOpen={(id) => void navigate(`/company/roles/${id}`)} /></li>
              ))}
            </ul>
          )}
        </Widget>
        <Widget title="People you are meeting" count={meeting.length || undefined} className={styles.meeting}>
          {meeting.length === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>When you move someone to interviewing, their name and contact details appear here.</p>
          ) : (
            <ul className={styles.list} aria-live="polite">
              {meeting.map((m) => (
                <li key={m.id}><Row title={m.name} meta={<Meta word={m.word} tone="for">{m.meta}</Meta>} onOpen={() => void navigate(`/company/roles/${m.roleId}`)} /></li>
              ))}
            </ul>
          )}
        </Widget>
        <Widget title="Your recruiter" className={styles.recruiter}>
          {empty ? (
            <>
              <p className="t-body-m-strong">{RECRUITER.name}</p>
              <p className={`t-body-s ${styles.quiet}`}>{RECRUITER.org} · {RECRUITER.email} · {RECRUITER.phone}</p>
            </>
          ) : (
            <>
              <div className={styles.person}>
                <span className={`t-body-s-bold ${styles.avatar}`} aria-hidden="true">{RECRUITER_INITIALS || initials({ displayName: RECRUITER.name })}</span>
                <span className={styles.stack}>
                  <span className="t-body-m-strong">{RECRUITER.name}</span>
                  <span className={`t-body-s ${styles.quiet}`}>{RECRUITER.org} · {RECRUITER.email} · {RECRUITER.phone}</span>
                </span>
              </div>
              <p className={`t-body-s-para ${styles.body}`}>Questions about a shortlist or a candidate go to {RECRUITER_FIRST}. She arranges every interview.</p>
            </>
          )}
          <span className={styles.spacer} />
          <a href={`mailto:${RECRUITER.email}`} className={cx(buttonClass("ghost"), styles.start)}>Email {RECRUITER_FIRST}</a>
        </Widget>
      </Board>
    </div>
  );
}

function RoleRow({ row, onOpen }: { row: Row; onOpen: (roleId: string) => void }) {
  const meta = (
    <>
      <span className={`t-body-s-strong ${styles[row.tone]}`}>{row.word}</span>
      <span className={styles.quiet}>{` · ${row.meta}`}</span>
      {row.quote && <span className={styles.body}>{` · “${row.quote}”`}</span>}
    </>
  );
  const { roleId } = row;
  return <Row title={row.title} meta={meta} {...(roleId ? { onOpen: () => onOpen(roleId) } : {})} />;
}

function Board({ children }: { children: ReactNode }) {
  return <div className={styles.board}>{children}</div>;
}

function Skeletons() {
  return (
    <>
      <Skeleton radius="widget" tone={3} height="100%" className={styles.hero} />
      {[styles.briefs, styles.hired, styles.roles, styles.meeting, styles.recruiter].map((c) => <Skeleton key={c} radius="widget" height="100%" className={c} />)}
    </>
  );
}

function HeroCard({ hero }: { hero: Hero }) {
  const id = useId();
  const label =
    hero.kind === "shortlist" ? `New shortlist · ready ${fmtDay(hero.readyAt)}` : hero.kind === "empty" ? "Start here" : "Where things stand";
  const title = hero.kind === "shortlist" ? hero.title : hero.kind === "empty" ? "Send your first brief" : "Nothing shortlisted yet";
  return (
    <Card tone="accent" role="region" aria-labelledby={id} className={styles.hero}>
      <div className={styles.heroBody} aria-live="polite">
        <p className="t-body-m-strong">{label}</p>
        <span className={styles.spacer} />
        <h2 id={id} className={`t-display-l ${styles.big}`}>{title}</h2>
        {hero.kind === "shortlist" && (
          <p className="t-title">
            {RECRUITER_FIRST} shortlisted {hero.count} {hero.count === 1 ? "person" : "people"} she has met and checked. You see their names when you move them to interviewing.
          </p>
        )}
        {hero.kind === "empty" && <p className="t-title">Paste it, or upload a PDF, Word file or email. {RECRUITER_FIRST} checks it, then shortlists from people she has already met.</p>}
        {hero.kind === "waiting" && <p className="t-title">{RECRUITER_FIRST} shortlists from people she has already met. It shows here as soon as she shares it.</p>}
        <span className={styles.spacer} />
        {hero.kind === "shortlist" && (
          <ul className={styles.people}>
            {hero.people.map((p) => (
              <li key={p.id} className={styles.person2}>
                <span className="t-body-m-strong">{p.who}</span>
                <span className="t-body-s">{p.line}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={cx(styles.footEnd, hero.kind !== "shortlist" && styles.right)}>
          {hero.kind === "shortlist" ? (
            <Link to={`/company/roles/${hero.roleId}`} className={buttonClass("on-lime")}>Review shortlist<Icon name="bx-chevron-right" /></Link>
          ) : (
            <Link to="/company/briefs/new" className={buttonClass("on-lime")}><Icon name="bx-plus" />Send a brief</Link>
          )}
        </div>
      </div>
    </Card>
  );
}

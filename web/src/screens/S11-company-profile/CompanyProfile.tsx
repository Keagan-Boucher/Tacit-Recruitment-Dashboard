import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Company, Match, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { buttonClass, Card, ErrorBanner, Icon, ListRow, Skeleton } from "../../components";
import { useCandidates, useDocument, useOwned } from "../../lib/data";
import NotFound from "../S16-not-found/NotFound";
import { fmtDate } from "../S03-candidate-profile/profile";
import styles from "./CompanyProfile.module.css";
import { companyFacts, monthYear, placedAmount, type FactLine } from "./facts";
import { roleCounts, roleLine } from "./roleLine";
import { turnedDown } from "./turnedDown";

/** Retry remounts the screen, which opens fresh Firestore listeners. */
export default function CompanyProfile() {
  const [attempt, setAttempt] = useState(0);
  return <Profile key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

const SOURCE_ICON: Record<FactLine["kind"], string> = { note: "bx-pen", email: "bx-file", "client-feedback": "bx-history", placements: "bx-briefcase" };
const CLOSED: Record<Role["status"], string> = { open: "Open", filled: "Filled", expired: "Expired" };

function Profile({ onRetry }: { onRetry: () => void }) {
  const { companyId } = useParams();
  const state = useScreenState();
  const navigate = useNavigate();
  const company = useDocument<Company>("companies", companyId);
  const rolesLive = useOwned<Role>("roles", ["companyId", companyId]);
  const placementsLive = useOwned<Placement>("placements", ["companyId", companyId]);
  const overridesLive = useOwned<Override>("overrides", ["companyId", companyId]);
  const matchesLive = useOwned<Match>("matches");
  const candidates = useCandidates();
  const [now] = useState(() => new Date());

  const all = [company, rolesLive, placementsLive, overridesLive, matchesLive, candidates];
  const error = state === "error" ? new Error("dev") : all.find((l) => l.error)?.error;
  if (error) return <><PageHeader headline="Company" /><ErrorBanner title="Couldn’t load this company." onRetry={onRetry} /></>;
  if (state === "loading" || !all.every((l) => l.data !== undefined)) return <ProfileSkeleton />;
  if (!company.data) return <NotFound />;

  const c = company.data;
  const noHistory = state === "no-history";
  const roles = [...rolesLive.data!].sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.openedAt.getTime() - a.openedAt.getTime());
  const openRoles = roles.filter((r) => r.status === "open");
  const earlier = roles.filter((r) => r.status !== "open");
  const placements = noHistory ? [] : [...placementsLive.data!].sort((a, b) => b.date.getTime() - a.date.getTime());
  const placed = placements.filter((p) => p.outcome === "placed");
  const overrides = noHistory ? [] : overridesLive.data!.filter((o) => !o.reversedAt);
  const groups = turnedDown(placements, overrides);

  const names = new Map(candidates.data!.map((x) => [x.id, x.fullName]));
  const roleTitle = new Map(roles.map((r) => [r.id, r.title]));
  const who = (id: string) => <Link className={styles.link} to={`/candidates/${id}`}>{names.get(id) ?? "Someone no longer on file"}</Link>;
  const forRole = (id: string) => roleTitle.get(id) ?? "a role no longer on file";

  const log: { key: string; at: Date; label: string; line: ReactNode; why: string }[] = [
    ...overrides.map((o) => ({
      key: o.id, at: o.decidedAt, label: "Your override", why: o.reasonText,
      line: o.decision === "reject"
        ? <>You passed on {who(o.candidateId)} for {forRole(o.roleId)}.</>
        : <>You put {who(o.candidateId)} forward for {forRole(o.roleId)}.</>,
    })),
    ...placements.flatMap((p) => p.outcome === "placed" ? [] : [{
      key: p.id, at: p.date, label: p.outcome === "withdrew" ? "Withdrew" : "Client said no", why: p.reason,
      line: <>{who(p.candidateId)} for {forRole(p.roleId)}.</>,
    }]),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const facts = companyFacts(c, now);

  // One click handler for every ListRow in the grid so navigation stays client-side (ListRow renders plain anchors).
  function goInApp(e: MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

  const roleRow = (r: Role & { id: string }) => {
    const counts = roleCounts(r.id, matchesLive.data!, overridesLive.data!);
    return (
      <li key={r.id}>
        <ListRow
          href={`/roles/${r.id}`}
          title={r.title}
          meta={r.status === "open" ? roleLine(counts) : `${CLOSED[r.status]}, closed ${fmtDate(r.closedAt ?? r.openedAt)}`}
          chips={r.status === "open" && counts.waiting > 0 ? (
            <span className={styles.new}><span className={`${styles.numeral} t-title tabular`}>{counts.waiting}</span><span className="t-caption">new</span></span>
          ) : undefined}
          fade={r.status === "open" ? 0 : 1}
        />
      </li>
    );
  };

  return (
    <>
      <PageHeader
        context={<Link to="/companies" className={styles.crumb}>Companies</Link>}
        headline={c.name}
        actions={
          <Link to={`/roles/new?companyId=${c.id}`} className={buttonClass("primary", false, "lg")}>
            <Icon name="bx-plus" />
            Open a role
          </Link>
        }
      />
      <p className={`${styles.meta} t-body-s`}>{[...c.sector.split(", "), `Client since ${monthYear(c.createdAt)}`].join(" · ")}</p>
      <div className={styles.grid} onClick={goInApp}>
        <div className={styles.col}>
          <Panel id="roles" title="Open roles" count={openRoles.length}>
            {openRoles.length ? (
              <ul className={`${styles.list} ${styles.rows}`}>{openRoles.map(roleRow)}</ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>No open role for this company.</p>
            )}
            {earlier.length > 0 && (
              <section aria-labelledby="earlier-title" className={styles.sub}>
                <h3 id="earlier-title" className={`${styles.label} t-caption-strong`}>Earlier roles</h3>
                <ul className={`${styles.list} ${styles.rows}`}>{earlier.map(roleRow)}</ul>
              </section>
            )}
          </Panel>
          <Panel id="placed" title="Placed here" count={placed.length}>
            {placed.length ? (
              <ul className={styles.list}>
                {placed.map((p) => {
                  const amount = placedAmount(p.reason);
                  return (
                    <li key={p.id} className={styles.placed}>
                      <span className="t-body-s-strong">{who(p.candidateId)}</span>
                      <span className={`${styles.role} t-caption`}>{forRole(p.roleId)}</span>
                      <span className={styles.when}>
                        {amount && <span className="t-body-s-strong">{amount}</span>}
                        <time className="t-caption" dateTime={p.date.toISOString()}>{amount ? " · " : ""}{monthYear(p.date)}</time>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>Nobody placed here yet.</p>
            )}
          </Panel>
        </div>

        <div className={styles.col}>
          <Panel id="know" title="What you know" count={facts.length}>
            <ul className={styles.list}>
              {facts.map((f) => (
                <li key={`${f.at.getTime()}-${f.text}`} className={styles.block}>
                  <p className={`${f.age ? styles.quiet : ""} t-body-m-strong`}>{f.text}</p>
                  <p className={`${styles.source} ${styles.factSource} t-caption`}>
                    <Icon name={SOURCE_ICON[f.kind]} size={14} />
                    <span>
                      {f.source}
                      {f.age && <> · <span className={`${styles.age} t-caption-strong`}>{f.age}</span></>}
                    </span>
                  </p>
                  {f.ask && <p className="t-body-s-strong">{f.ask}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className={styles.col}>
          <Panel id="log" title="Override log" count={log.length}>
            {log.length ? (
              <ul className={styles.list}>
                {log.map((e) => (
                  <li key={e.key} className={styles.entry}>
                    <div className={styles.top}>
                      <span className={`${styles.label} t-caption-strong`}>{e.label}</span>
                      <time className="t-caption" dateTime={e.at.toISOString()}>{fmtDate(e.at)}</time>
                    </div>
                    <p className="t-body-s-strong">{e.line}</p>
                    {e.why && <p className={`${styles.why} t-body-s-para`}>“{e.why}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>No overrides or client rejections recorded.</p>
            )}
            <section aria-labelledby="turned-down-title" className={styles.sub}>
              <h3 id="turned-down-title" className={`${styles.label} t-caption-strong`}>What they’ve turned down</h3>
              {groups.length ? (
                <ul className={styles.claims}>
                  {groups.map((g) => (
                    <li key={g.label} className={styles.claim}>
                      <p className="t-body-s-strong">{g.label}</p>
                      {g.cases.map((k) => (
                        <p key={k.key} className={`${styles.source} t-caption`}>
                          {k.source === "client" ? `Client feedback · ${fmtDate(k.at)}` : <>Override log · {who(k.candidateId)}, {fmtDate(k.at)}</>}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${styles.empty} t-body-s-para`}>Nothing yet. This fills in from the client’s rejections and the people you pass on.</p>
              )}
            </section>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Panel({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  return (
    <Card className={styles.card} role="region" aria-labelledby={`${id}-title`}>
      <header className={styles.head}>
        <h2 id={`${id}-title`} className="t-title">{title}</h2>
        <span className="t-body-s tabular">{count}</span>
      </header>
      {children}
    </Card>
  );
}

function ProfileSkeleton() {
  const col = (n: number, h: number) => (
    <Card className={styles.card}>
      <Skeleton width={140} height={20} />
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} height={h} />)}
    </Card>
  );
  return (
    <>
      <PageHeader
        context={<span role="status" aria-live="polite">Getting this company ready.</span>}
        headline={<><Skeleton width={320} height={44} /><span className="sr-only">Company</span></>}
      />
      <div className={styles.grid} aria-busy="true">
        <div className={styles.col}>{col(2, 56)}{col(2, 40)}</div>
        <div className={styles.col}>{col(5, 64)}</div>
        <div className={styles.col}>{col(4, 80)}</div>
      </div>
    </>
  );
}

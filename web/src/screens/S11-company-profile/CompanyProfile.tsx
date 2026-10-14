import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { monthsSince, staleness } from "@tacit/shared";
import type { Company, Override, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { buttonClass, Card, Chip, ErrorBanner, Icon, ListRow, Skeleton, type ChipTone } from "../../components";
import { useCandidates, useDocument, useOwned } from "../../lib/data";
import NotFound from "../S16-not-found/NotFound";
import { fmtDate } from "../S03-candidate-profile/profile";
import styles from "./CompanyProfile.module.css";
import { turnedDown } from "./turnedDown";

/** Retry remounts the screen, which opens fresh Firestore listeners. */
export default function CompanyProfile() {
  const [attempt, setAttempt] = useState(0);
  return <Profile key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

const OUTCOME: Record<Placement["outcome"], { tone: ChipTone; text: string }> = {
  placed: { tone: "for", text: "Placed" },
  "client-rejected": { tone: "against", text: "Client passed" },
  withdrew: { tone: "neutral", text: "Withdrew" },
};
const ROLE_CHIP: Record<Role["status"], { tone: ChipTone; text: string }> = {
  open: { tone: "accent", text: "Open" },
  filled: { tone: "neutral", text: "Filled" },
  expired: { tone: "quiet", text: "Expired" },
};

function Profile({ onRetry }: { onRetry: () => void }) {
  const { companyId } = useParams();
  const state = useScreenState();
  const navigate = useNavigate();
  const company = useDocument<Company>("companies", companyId);
  const rolesLive = useOwned<Role>("roles", ["companyId", companyId]);
  const placementsLive = useOwned<Placement>("placements", ["companyId", companyId]);
  const overridesLive = useOwned<Override>("overrides", ["companyId", companyId]);
  const candidates = useCandidates();
  const [now] = useState(() => new Date());

  const all = [company, rolesLive, placementsLive, overridesLive, candidates];
  const error = state === "error" ? new Error("dev") : all.find((l) => l.error)?.error;
  if (error) return <><PageHeader headline="Company" /><ErrorBanner title="Couldn’t load this company." onRetry={onRetry} /></>;
  if (state === "loading" || !all.every((l) => l.data !== undefined)) return <ProfileSkeleton />;
  if (!company.data) return <NotFound />;

  const c = company.data;
  const noHistory = state === "no-history";
  const roles = [...rolesLive.data!].sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.openedAt.getTime() - a.openedAt.getTime());
  const placements = noHistory ? [] : [...placementsLive.data!].sort((a, b) => b.date.getTime() - a.date.getTime());
  const overrides = noHistory ? [] : overridesLive.data!.filter((o) => !o.reversedAt);
  const groups = turnedDown(placements, overrides);

  const names = new Map(candidates.data!.map((x) => [x.id, x.fullName]));
  const roleTitle = new Map(roles.map((r) => [r.id, r.title]));
  const who = (id: string) => <Link className={styles.link} to={`/candidates/${id}`}>{names.get(id) ?? "Someone no longer on file"}</Link>;
  const forRole = (id: string) => roleTitle.get(id) ?? "a role no longer on file";

  const log: { key: string; at: Date; chip: string; line: ReactNode; why: string }[] = [
    ...overrides.map((o) => ({
      key: o.id, at: o.decidedAt, chip: "Your override", why: o.reasonText,
      line: o.decision === "reject"
        ? <>You passed on {who(o.candidateId)} for {forRole(o.roleId)}.</>
        : <>You put {who(o.candidateId)} forward for {forRole(o.roleId)}.</>,
    })),
    ...placements.filter((p) => p.outcome !== "placed").map((p) => ({
      key: p.id, at: p.date, chip: p.outcome === "withdrew" ? "Withdrew" : "Client said no", why: p.reason,
      line: <>{who(p.candidateId)} for {forRole(p.roleId)}.</>,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // What you know: the sentences of the hiring pattern, then the note if it adds something.
  const facts = [...new Set([...c.hiringPattern.split(/(?<=\.)\s+/), c.notes].map((s) => s.trim()).filter(Boolean))];
  const stale = staleness(c.updatedAt, now) === "stale";

  // One click handler for every ListRow in the grid so navigation stays client-side (ListRow renders plain anchors).
  function goInApp(e: MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/") || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  }

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
      <div className={styles.meta}>
        {c.sector.split(", ").map((s) => <Chip key={s}>{s}</Chip>)}
        <Chip>Client since {fmtDate(c.createdAt).split(" ").slice(1).join(" ")}</Chip>
      </div>
      <div className={styles.grid} onClick={goInApp}>
        <div className={styles.col}>
          <Panel id="roles" title="Roles" count={roles.length}>
            {roles.length ? (
              <ul className={`${styles.list} ${styles.rows}`}>
                {roles.map((r) => (
                  <li key={r.id}>
                    <ListRow
                      href={`/roles/${r.id}`}
                      title={r.title}
                      meta={`Opened ${fmtDate(r.openedAt)}${r.closedAt ? `, closed ${fmtDate(r.closedAt)}` : ""}`}
                      chips={<Chip tone={ROLE_CHIP[r.status].tone}>{ROLE_CHIP[r.status].text}</Chip>}
                      fade={r.status === "open" ? 0 : 1}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>No role opened for this company yet.</p>
            )}
          </Panel>
          <Panel id="placements" title="Placements" count={placements.length}>
            {placements.length ? (
              <ul className={styles.list}>
                {placements.map((p) => (
                  <li key={p.id} className={styles.entry}>
                    <div className={styles.top}>
                      <Chip tone={OUTCOME[p.outcome].tone}>{OUTCOME[p.outcome].text}</Chip>
                      <time className="t-meta" dateTime={p.date.toISOString()}>{fmtDate(p.date)}</time>
                    </div>
                    <p className="t-body-s-strong">{who(p.candidateId)}, {forRole(p.roleId)}</p>
                    <p className={`${styles.why} t-body-s-para`}>{p.reason}</p>
                  </li>
                ))}
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
                <li key={f} className={styles.block}>
                  <p className={`${stale ? styles.quiet : ""} t-body-m`}>{f}</p>
                </li>
              ))}
            </ul>
            <p className={`${styles.source} t-meta`}>
              Your notes, updated {fmtDate(c.updatedAt)} {stale && <Chip tone="stale">Stale · {monthsSince(c.updatedAt, now)} mo</Chip>}
            </p>
          </Panel>
        </div>

        <div className={styles.col}>
          <Panel id="turned-down" title="What they’ve turned down" count={groups.length}>
            {groups.length ? (
              <ul className={styles.groups}>
                {groups.map((g) => (
                  <li key={g.label} className={styles.group}>
                    <div className={styles.groupHead}>
                      <p className="t-body-s-strong">{g.label}</p>
                      <Chip>{g.cases.length === 1 ? "1 time" : `${g.cases.length} times`}</Chip>
                    </div>
                    <ul className={`${styles.cases} t-caption`}>
                      {g.cases.map((k) => (
                        <li key={k.key}>{who(k.candidateId)} for {forRole(k.roleId)}, {fmtDate(k.at)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>Nothing yet. This fills in from the client’s rejections and the people you pass on.</p>
            )}
          </Panel>
          <Panel id="log" title="Override log" count={log.length}>
            {log.length ? (
              <ul className={styles.list}>
                {log.map((e) => (
                  <li key={e.key} className={styles.entry}>
                    <div className={styles.top}>
                      <Chip>{e.chip}</Chip>
                      <time className="t-meta" dateTime={e.at.toISOString()}>{fmtDate(e.at)}</time>
                    </div>
                    <p className="t-body-s-strong">{e.line}</p>
                    {e.why && <p className={`${styles.why} t-body-s-para`}>“{e.why}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${styles.empty} t-body-s-para`}>No overrides or client rejections recorded.</p>
            )}
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
        <div className={styles.col}>{col(2, 56)}{col(2, 72)}</div>
        <div className={styles.col}>{col(5, 64)}</div>
        <div className={styles.col}>{col(3, 80)}{col(3, 80)}</div>
      </div>
    </>
  );
}

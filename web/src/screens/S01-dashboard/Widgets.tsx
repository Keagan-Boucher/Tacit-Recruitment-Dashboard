import { buttonClass, Chip, Icon, Skeleton, WidgetCard } from "../../components";
import type { Board, PlayRow } from "./board";
import styles from "./Dashboard.module.css";

// One component per default widget. `b` undefined = loading: skeletons in the real layout's shape.

type P = { b?: Board };
const SEE = 3; // rows a widget shows before "See all"
const say = (b: Board, first: string, quiet: string) => <p className={`${styles.say} t-body-s-para`}>{b.hasPeople ? quiet : first}</p>;

const rowSk = (n: number, key = "r") => Array.from({ length: n }, (_, i) => <Skeleton key={`${key}${i}`} height={52} />);

export function Forgotten({ b }: P) {
  const f = b?.forgotten;
  if (!b)
    return (
      <WidgetCard title="Someone you forgot" tone="accent" className={styles.hero}>
        <div className={styles.heroBody}>
          <div className={styles.person}>
            <div className={styles.skRow}>
              <Skeleton tone="lime" width={160} height={26} radius="pill" />
              <Skeleton tone="lime" width={92} height={26} radius="pill" />
            </div>
            <Skeleton tone="lime" width={440} height={72} />
            <Skeleton tone="lime" width={540} height={16} radius="pill" />
            <Skeleton tone="lime" width={360} height={16} radius="pill" />
          </div>
          <div className={styles.case}>
            {[0, 1].map((i) => (
              <div key={i} className={styles.skRow}>
                <Skeleton tone="lime" width={56} height={24} radius="pill" />
                <Skeleton tone="lime" width={420} height={14} radius="pill" />
              </div>
            ))}
            <div className={styles.footer}>
              <Skeleton tone="lime" width={300} height={14} radius="pill" />
              <Skeleton tone="lime" width={170} height={44} radius="pill" />
            </div>
          </div>
        </div>
      </WidgetCard>
    );

  if (!f)
    return (
      <WidgetCard title={b.hasPeople ? "Someone you forgot" : "Start here"} tone="accent" className={styles.hero}>
        <div className={styles.heroBody}>
          <div className={`${styles.person} ${styles.start}`}>
            <span className={styles.uploadIcon}>
              <Icon name={b.hasPeople ? "bx-search" : "bx-upload"} size={22} />
            </span>
            <p className="t-display-l">{b.hasPeople ? "No one forgotten right now" : "Bring in your CV folder"}</p>
            <p className={`${styles.sub} t-note`}>
              {b.hasPeople
                ? "Paste a brief and Tacit checks everyone you have met, including the people you met years ago."
                : "Tacit reads them and checks what it found with you, so people you met years ago turn up for new roles."}
            </p>
          </div>
          <div className={styles.footer}>
            <span />
            <a href={b.hasPeople ? "/brief" : "/candidates/new"} className={buttonClass("on-lime")}>
              <Icon name={b.hasPeople ? "bx-file" : "bx-upload"} />
              {b.hasPeople ? "Paste a brief" : "Upload CVs"}
            </a>
          </div>
        </div>
      </WidgetCard>
    );

  const c = f.candidate;
  return (
    <WidgetCard title="Someone you forgot" tone="accent" className={styles.hero}>
      <div className={styles.heroBody}>
        <div className={styles.person}>
          <div>
            {f.match.staleness === "stale" ? (
              <Chip tone="stale" onLime size="lg">
                Stale · {f.months} mo
              </Chip>
            ) : (
              <Chip onLime size="lg">
                Not opened in {f.notOpened} mo
              </Chip>
            )}
          </div>
          <h3 className="t-display-xl">{c.fullName}</h3>
          <p className={`${styles.sub} t-note`}>
            {c.headline}, {c.location}. Could fit {f.role.title} at {f.company}.
          </p>
        </div>
        <div className={styles.case} aria-live="polite">
          <div className={styles.reason}>
            <Chip tone="for" onLime size="lg">
              For · {f.nFor}
            </Chip>
            <p className="t-body-m-para">{f.reasonFor ?? "Nothing recorded for this one yet."}</p>
          </div>
          <div className={styles.reason}>
            <Chip tone="against" onLime size="lg">
              Against · {f.nAgainst}
            </Chip>
            <p className="t-body-m-para">{f.reasonAgainst ?? "Nothing against on record."}</p>
          </div>
          <div className={styles.footer}>
            {f.ask ? (
              <p className={`${styles.ask} t-body-s-para`}>
                <Icon name="bx-time-five" />
                {f.ask}
              </p>
            ) : (
              <span />
            )}
            <a href={`/roles/${f.role.id}`} className={buttonClass("on-lime")}>
              See the full case
              <Icon name="bx-chevron-right" />
            </a>
          </div>
        </div>
      </div>
    </WidgetCard>
  );
}

export function RolesToShortlist({ b }: P) {
  const rows = b?.shortlist ?? [];
  return (
    <WidgetCard title="Roles to shortlist" count={b && rows.length > 0 ? rows.length : undefined}>
      {!b ? (
        rowSk(3)
      ) : rows.length === 0 ? (
        <>
          {say(b, "Paste a client brief to see who fits.", "No role is waiting for a shortlist.")}
          {b.play.length === 0 && (
            <a href="/brief" className={`${buttonClass("ghost")} ${styles.bottom}`}>
              <Icon name="bx-file" />
              Paste a brief
            </a>
          )}
        </>
      ) : (
        <ul className={styles.list}>
          {rows.slice(0, SEE).map((p) => (
            <li key={p.role.id}>
              <a href={`/roles/${p.role.id}`} className={styles.item}>
                <span className={styles.main}>
                  <span className={`${styles.line} t-body-s-strong`}>{p.role.title}</span>
                  <span className={`${styles.quiet} t-caption`}>{p.company}</span>
                </span>
                <Chip tone="accent">{p.waiting} new</Chip>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function ToConfirm({ b }: P) {
  const c = b?.confirm;
  return (
    <WidgetCard title="Things to confirm">
      {!b ? (
        <>
          <Skeleton width={40} height={56} />
          <Skeleton height={14} radius="pill" />
          <Skeleton height={14} radius="pill" />
          <Skeleton width={150} height={44} radius="pill" className={styles.bottom} />
        </>
      ) : !c ? (
        say(b, "Facts from your interview notes wait here.", "Nothing to confirm.")
      ) : (
        <>
          <p className={styles.figure}>
            <span className={`${styles.big} t-display-l`}>{c.count}</span>
            <span className="t-body-m-strong">to keep or fix</span>
          </p>
          {c.candidate && <p className={`${styles.say} t-body-s-para`}>From {c.candidate.fullName}’s interview.</p>}
          <a href={`/candidates/${c.candidate.id}/notes/new?note=${c.noteId}`} className={`${buttonClass("ghost")} ${styles.bottom}`}>
            Review note
            <Icon name="bx-chevron-right" />
          </a>
        </>
      )}
    </WidgetCard>
  );
}

export function PeopleMet({ b }: P) {
  const p = b?.people;
  const max = Math.max(1, ...(p?.bars ?? []));
  return (
    <WidgetCard title="People you have met">
      {!b || !p ? (
        <>
          <div className={styles.skRow}>
            <Skeleton width={120} height={56} />
            <Skeleton width={100} height={26} radius="pill" />
          </div>
          <Bars />
        </>
      ) : p.count === 0 ? (
        <>
          {say(b, "Everyone you meet, counted by month.", "")}
          <Bars flat />
        </>
      ) : (
        <>
          <a href="/candidates" className={`${styles.figure} ${styles.plain}`} aria-label={`${p.count} people you have met. See everyone.`}>
            <span className={`${styles.big} t-display-l ${styles.text}`}>{p.count}</span>
            {p.newThisMonth > 0 && <Chip tone="accent">+{p.newThisMonth} this month</Chip>}
          </a>
          <Bars values={p.bars.map((n) => n / max)} label={`People met per month, last 12 months: ${p.bars.join(", ")}.`} />
        </>
      )}
    </WidgetCard>
  );
}

/** Twelve monthly bars, oldest first, the current month in lime. */
function Bars({ values, flat, label }: { values?: number[]; flat?: boolean; label?: string }) {
  return (
    <div className={styles.bars} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={`${styles.bar} ${i === 11 && values ? styles.barNow : ""}`}
          style={{ height: flat ? "3px" : values ? `${Math.max(8, (values[i] ?? 0) * 100)}%` : `${30 + ((i * 37) % 60)}%` }}
        />
      ))}
    </div>
  );
}

const cell = (n: number, stale = false) =>
  stale ? (n >= 3 ? styles.cStaleSolid : n >= 1 ? styles.cStale : styles.cZero) : n >= 9 ? styles.cFill : n >= 3 ? styles.cLine : n >= 1 ? styles.cLow : styles.cZero;

const COLS = ["Suggested", "Waiting", "Shortlisted", "Not this one", "Stale"];

export function RolesInPlay({ b }: P) {
  const rows = b?.play ?? [];
  const counts = (p: PlayRow) => [p.suggested, p.waiting, p.shortlisted, p.rejected, p.stale];
  return (
    <WidgetCard title="Roles in play" seeAll={b && rows.length > SEE ? { count: rows.length, href: "/roles" } : undefined}>
      {b && rows.length === 0 ? (
        say(b, "Your open roles, by stage.", "No open roles.")
      ) : (
        <div className={styles.heat}>
          <div className={`${styles.heatRow} t-meta`} aria-hidden="true">
            <span />
            {COLS.map((c) => (
              <span key={c} className={styles.colHead}>
                {c}
              </span>
            ))}
          </div>
          {!b
            ? [0, 1, 2].map((i) => (
                <div key={i} className={styles.heatRow}>
                  <Skeleton width={130} height={30} />
                  {COLS.map((c) => (
                    <Skeleton key={c} height={38} />
                  ))}
                </div>
              ))
            : rows.slice(0, SEE).map((p) => (
                <a
                  key={p.role.id}
                  href={`/roles/${p.role.id}`}
                  className={`${styles.heatRow} ${styles.plain}`}
                  aria-label={`${p.role.title}, ${p.company}: ${COLS.map((c, i) => `${counts(p)[i]} ${c.toLowerCase()}`).join(", ")}`}
                >
                  <span className={styles.main}>
                    <span className={`${styles.line} t-body-s-strong`}>{p.role.title}</span>
                    <span className={`${styles.quiet} t-meta`}>{p.company}</span>
                  </span>
                  {counts(p).map((n, i) => (
                    <span key={COLS[i]} className={`${styles.hc} ${cell(n, i === 4)} t-body-s-strong tabular`}>
                      {n}
                    </span>
                  ))}
                </a>
              ))}
        </div>
      )}
    </WidgetCard>
  );
}

export function WorthACall({ b }: P) {
  const rows = b?.worth ?? [];
  return (
    <WidgetCard title="Worth a call" seeAll={b && rows.length > SEE ? { count: rows.length, href: "/candidates" } : undefined}>
      {!b ? (
        rowSk(3)
      ) : rows.length === 0 ? (
        say(b, "People whose salary or availability is over a year old.", "No one’s evidence is over a year old.")
      ) : (
        <ul className={styles.list}>
          {rows.slice(0, SEE).map((w) => (
            <li key={w.candidate.id}>
              <a href={`/candidates/${w.candidate.id}`} className={`${styles.item} ${styles.flat}`}>
                <span className={styles.main}>
                  <span className={`${styles.line} t-body-s-strong`}>{w.candidate.fullName}</span>
                  {w.text && <span className={`${styles.quiet} t-caption`}>{w.text}</span>}
                </span>
                <Chip tone="stale">Stale · {w.months} mo</Chip>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function Waiting({ b }: P) {
  const rows = b?.waiting ?? [];
  return (
    <WidgetCard title="Also waiting on you" seeAll={b && rows.length > SEE ? { count: rows.length, href: "/roles" } : undefined}>
      {!b ? (
        rowSk(3)
      ) : rows.length === 0 ? (
        say(b, "Suggestions appear once you have a role and a few people.", "No other suggestions waiting.")
      ) : (
        <ul className={styles.list}>
          {rows.slice(0, SEE).map(({ match, candidate, role }) => (
            <li key={match.id}>
              <a href={`/roles/${role.id}`} className={`${styles.item} ${styles.flat}`}>
                <span className={styles.main}>
                  <span className={`${styles.line} t-body-s-strong`}>{candidate.fullName}</span>
                  <span className={`${styles.quiet} t-meta`}>for {role.title}</span>
                </span>
                <Chip tone="for">For · {match.reasonsFor.length}</Chip>
                <Chip tone="against">Against · {match.reasonsAgainst.length}</Chip>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** A shelf widget turned on: a title and one way in. */
const SHELF: Record<string, [title: string, href: string]> = {
  "recent-notes": ["Recent notes", "/candidates"],
  "brief-inbox": ["Brief inbox", "/brief"],
  "company-coverage": ["Company coverage", "/companies"],
  "match-history": ["Match history", "/roles"],
  "override-log": ["Override log", "/roles"],
};

export function Shelf({ id }: { id: string }) {
  const [title, href] = SHELF[id] ?? [id, "/"];
  return (
    <WidgetCard title={title}>
      <a href={href} className={`${buttonClass("ghost")} ${styles.bottom}`}>
        Open
        <Icon name="bx-chevron-right" />
      </a>
    </WidgetCard>
  );
}

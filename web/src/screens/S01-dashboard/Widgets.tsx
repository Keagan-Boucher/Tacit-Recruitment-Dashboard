import type { AttributeType } from "@tacit/shared";
import { buttonClass, Icon, Skeleton, WidgetCard } from "../../components";
import type { Board, PlayRow } from "./board";
import styles from "./Dashboard.module.css";

// One component per default widget. `b` undefined = loading: skeletons in the real layout's shape.

type P = { b?: Board };
const SEE = 3; // rows a widget shows before "See all"
const say = (b: Board, first: string, quiet: string) => <p className={`${styles.say} t-body-s-para`}>{b.hasPeople ? quiet : first}</p>;

const ago = (months: number) => `${months} ${months === 1 ? "month" : "months"} ago`;
const reasons = (n: number, side: "for" | "against") => `${n} ${n === 1 ? "reason" : "reasons"} ${side}`;

const rowSk = (n: number, key = "r") => Array.from({ length: n }, (_, i) => <Skeleton key={`${key}${i}`} height={52} />);

export function Forgotten({ b }: P) {
  const f = b?.forgotten;
  if (!b)
    return (
      <WidgetCard title="Someone you forgot" tone="accent" className={styles.hero}>
        <div className={styles.heroBody}>
          <div className={styles.person}>
            <Skeleton tone="lime" width={440} height={72} />
            <Skeleton tone="lime" width={540} height={16} radius="pill" />
            <Skeleton tone="lime" width={360} height={16} radius="pill" />
          </div>
          <div className={styles.case}>
            <div className={styles.columns}>
              {[0, 1].map((i) => (
                <div key={i} className={styles.reason}>
                  <Skeleton tone="lime" width={90} height={13} radius="pill" />
                  <Skeleton tone="lime" height={18} radius="pill" />
                  <Skeleton tone="lime" width={180} height={18} radius="pill" />
                </div>
              ))}
            </div>
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
          <h3 className="t-display-xl">{c.fullName}</h3>
          <p className={`${styles.sub} t-note`}>
            {c.headline}, {c.location}. Could fit {f.role.title} at {f.company}.
            {f.heardFor === undefined && f.heardAgainst === undefined && ` Not opened in ${f.notOpened} months.`}
          </p>
        </div>
        <div className={styles.case}>
          <div className={styles.columns}>
            <div className={styles.reason}>
              <p className={`${styles.label} t-body-s-strong`}>{reasons(f.nFor, "for")}</p>
              <p className="t-title">{f.reasonFor ?? "Nothing recorded for this one yet."}</p>
              {f.heardFor !== undefined && <p className="t-body-s-bold">Heard {ago(f.heardFor)}</p>}
            </div>
            <div className={styles.reason}>
              <p className={`${styles.label} t-body-s-strong`}>{reasons(f.nAgainst, "against")}</p>
              <p className="t-title">{f.reasonAgainst ?? "Nothing against on record."}</p>
              {f.heardAgainst !== undefined && <p className="t-body-s-bold">Heard {ago(f.heardAgainst)}</p>}
            </div>
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
                <span className={styles.count}>
                  <span className="t-figure tabular">{p.waiting}</span>
                  <span className={`${styles.quiet} t-caption`}>new</span>
                </span>
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
            <Skeleton width={60} height={28} />
            <Skeleton width={100} height={16} radius="pill" />
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
            <span className="t-figure tabular">{p.count}</span>
            {p.newThisMonth > 0 && <span className={`${styles.dim} t-body-m-strong`}>+{p.newThisMonth} this month</span>}
          </a>
          <Bars values={p.bars.map((n) => n / max)} label={`People met per month, last 12 months: ${p.bars.join(", ")}.`} />
        </>
      )}
    </WidgetCard>
  );
}

/** Twelve monthly bars, oldest first, the current month a shade stronger. */
function Bars({ values, flat, label }: { values?: number[]; flat?: boolean; label?: string }) {
  return (
    <div className={styles.bars} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={`${styles.bar} ${i === 11 && values ? styles.barNow : ""}`}
          style={{ height: flat ? "3px" : values ? `${Math.max(20, (values[i] ?? 0) * 60)}%` : `${30 + ((i * 37) % 60)}%` }}
        />
      ))}
    </div>
  );
}

// Numbers only: zeros recede, the Stale column's numbers take the stale colour.
const cell = (n: number, stale: boolean) => (n === 0 ? `${styles.cZero} t-body-m` : `${stale ? styles.cStale : ""} t-title`);

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
                    <span key={COLS[i]} className={`${styles.hc} ${cell(n, i === 4)} tabular`}>
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

const FACT: Partial<Record<AttributeType, string>> = { salary: "Salary: ", availability: "Availability: " };

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
                  <span className={`${styles.quiet} ${styles.fact} t-caption`}>
                    {w.text && (
                      <>
                        <span className={styles.factText}>
                          {FACT[w.type!] ?? ""}“{w.text}”
                        </span>
                        <span>·</span>
                      </>
                    )}
                    <span className={styles.age}>{ago(w.months)}</span>
                  </span>
                </span>
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
                <span className={`${styles.tally} t-body-s`}>
                  <b className={`${styles.tFor} t-body-s-bold`}>{match.reasonsFor.length}</b> for ·{" "}
                  <b className={`${styles.tAgainst} t-body-s-bold`}>{match.reasonsAgainst.length}</b> against
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function AskNext({ b }: P) {
  const rows = b?.ask ?? [];
  const none = "No questions waiting. Run a brief to get some.";
  return (
    <WidgetCard title="Ask on your next call" seeAll={b && rows.length > SEE ? { count: rows.length, href: "/roles" } : undefined}>
      {!b ? (
        rowSk(3)
      ) : rows.length === 0 ? (
        say(b, none, none)
      ) : (
        <ul className={styles.list}>
          {rows.slice(0, SEE).map(({ match, candidate, role, question, months }) => (
            <li key={match.id}>
              <a href={`/roles/${role.id}`} className={`${styles.item} ${styles.flat}`}>
                <span className={styles.main}>
                  <span className={`${styles.line} t-body-m-strong`} title={question}>{question}</span>
                  <span className={`${styles.quiet} ${styles.fact} t-caption`}>
                    <span className={styles.factText}>{candidate.fullName}</span>
                    <span>·</span>
                    {months !== undefined ? <span className={styles.age}>heard {ago(months)}</span> : <span className={styles.rest}>for {role.title}</span>}
                  </span>
                </span>
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

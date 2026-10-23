import type { DragEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { CourseItem } from "@tacit/shared";
import { PageHeader } from "../../app";
import { Button, buttonClass, Card, Chip, Dialog, ErrorBanner, FieldError, Icon, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import {
  cvFileName, detailsBody, freshCaption, freshDetails, freshLine, fmtDate, headline, heroFor, latestCv, pendingDetails, profileStatus, RECRUITER,
  RECRUITER_FIRST, RECRUITER_INITIALS, roleUpdateRows, sentSummary, showCourses, updatesThisWeek,
  type CandidatePortal, type CvSub, type Fresh, type Hero, type Step,
} from "../../features/portal/candidate";
import { ChangeDetailsDialog, useSendDetails } from "../../features/portal/candidateChange";
import { answerCourses, useCandidateScreen } from "../../features/portal/candidateData";
import { ViewCv } from "../../features/portal/candidateViewCv";
import styles from "./CandidateHome.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const THINGS = ["", "One thing", "Two things", "Three things"];
const TIMES = ["", "once", "twice"];

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

export default function CandidateHome() {
  const { data, error, retry, dev } = useCandidateScreen();
  return <Screen key={dev ?? "live"} data={data} error={!!error} retry={retry} dev={dev !== null} />;
}

function Screen({ data, error, retry, dev }: { data: CandidatePortal | undefined; error: boolean; retry: () => void; dev: boolean }) {
  const { user, claims } = useAuth();
  const [now] = useState(() => new Date());
  const details = useSendDetails(dev);
  const [changing, setChanging] = useState({ open: false, n: 0 });
  const [coursesHidden, setCoursesHidden] = useState(false);
  const [courseError, setCourseError] = useState(false);

  if (!data) {
    return (
      <div className={styles.page}>
        <PageHeader headline={error ? "Welcome back." : "Loading your page."} />
        {error && <ErrorBanner className={styles.banner} title="Couldn’t load your page." detail="Nothing was lost. What you sent is safe." onRetry={retry} />}
        <Board><Skeletons /></Board>
      </div>
    );
  }

  const { submissions, updates, suggestion, portalUser } = data;
  const first = (portalUser?.displayName ?? user?.displayName ?? "").split(" ")[0] || "there";
  const hero = heroFor(submissions, updates);
  const head = headline(hero, updatesThisWeek(updates, now), first);
  const status = profileStatus(submissions);
  const rows = roleUpdateRows(updates, now);
  const cv = latestCv(submissions);
  const fresh = freshDetails(submissions);
  const pending = pendingDetails(submissions);
  const courses = suggestion && showCourses(suggestion, now) && !coursesHidden ? suggestion : null;

  const stillRight = () => {
    const fields = detailsBody({ salary: fresh?.salary, availability: fresh?.availability, workMode: fresh?.workMode });
    if (fields) void details.send(fields);
  };

  async function answer(a: "snooze" | "dismiss") {
    setCourseError(false);
    try {
      await answerCourses(claims.candidateId, a, dev);
      setCoursesHidden(true);
    } catch {
      setCourseError(true);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        headline={<>{head.count !== undefined && <span className={styles.num}>{head.count}</span>}{head.text}</>}
        actions={hero.kind !== "empty" && <Link to="/candidate/cv" className={buttonClass("ghost")}><Icon name="bx-upload" />Update my CV</Link>}
      />
      {details.failed && (
        <ErrorBanner className={styles.banner} title="Couldn’t send your details." detail="Nothing was lost. Your current details are unchanged." onRetry={details.retry} />
      )}
      <Board>
        <HeroCard hero={hero} />
        <Widget title="Your profile" className={styles.profile}>
          <div className={styles.stack} aria-live="polite">
            <p className={`t-title ${styles.word} ${styles[status.tone]}`}>{status.word}</p>
            <p className={`t-caption ${styles.quiet}`}>{status.line}</p>
            <p className={`t-body-s-para ${styles.body}`}>{status.body}</p>
          </div>
          <span className={styles.spacer} />
          <Link to="/candidate/details" className={cx(buttonClass("ghost"), styles.start)}>Review what you sent<Icon name="bx-chevron-right" /></Link>
        </Widget>
        <Widget title="Your recruiter" className={styles.recruiter}>
          <div className={styles.person}>
            <span className={`t-body-s-bold ${styles.avatar}`} aria-hidden="true">{RECRUITER_INITIALS}</span>
            <span className={styles.stack}>
              <span className="t-body-m-strong">{RECRUITER.name}</span>
              <span className={`t-body-s ${styles.quiet}`}>{RECRUITER.org}</span>
            </span>
          </div>
          <p className={`t-body-s-para ${styles.body}`}>{RECRUITER.email}<br />{RECRUITER.phone}</p>
          <span className={styles.spacer} />
          <a href={`mailto:${RECRUITER.email}`} className={cx(buttonClass("ghost"), styles.start)}>Email {RECRUITER_FIRST}</a>
        </Widget>
        <Widget title="Role updates" count={rows.length || undefined} className={styles.updates}>
          {rows.length === 0 ? (
            <p className={`t-body-m-para ${styles.body}`}>Nothing yet. When your recruiter puts you forward for a role, it shows here. The company stays anonymous until you agree to interview.</p>
          ) : (
            <ul className={styles.list} aria-live="polite">
              {rows.map((r) => (
                <li key={r.id} className={styles.row}>
                  <p className={`t-body-m-strong ${styles.rowTitle}`}>{r.title}</p>
                  <p className={`t-caption ${styles.quiet}`}><span className={`t-body-s-strong ${styles[r.tone === "quiet" ? "body" : r.tone]}`}>{r.word}</span>{` · ${r.meta}`}</p>
                </li>
              ))}
            </ul>
          )}
        </Widget>
        <Widget title="What you sent" className={styles.sent}>
          {cv ? <Sent cv={cv} /> : <p className={`t-body-m-para ${styles.body}`}>Your CV and details show here once you send them. Only you and your recruiter can see them.</p>}
        </Widget>
        {fresh ? (
          <Widget title="Keep your details fresh" className={styles.fresh}>
            <FreshCard fresh={fresh} sent={details.sent} pending={pending} sending={details.sending} onStill={stillRight} onChange={() => setChanging((c) => ({ open: true, n: c.n + 1 }))} />
          </Widget>
        ) : (
          <HowItWorks />
        )}
      </Board>

      <ChangeDetailsDialog key={changing.n} open={changing.open} onClose={() => setChanging((c) => ({ ...c, open: false }))} initial={fresh} sending={details.sending} onSend={details.send} />

      <Dialog
        open={!!courses}
        onClose={() => setCoursesHidden(true)}
        eyebrow="A suggestion, 9 months in"
        title={`${THINGS[courses?.items.length ?? 3]} that could help you get placed`}
        description={`These come from what clients asked for in the roles you came close to. ${RECRUITER_FIRST} checked them before they reached you.`}
        footer={
          <>
            <Button onClick={() => void answer("snooze")}>Remind me in a month</Button>
            <Button variant="primary" onClick={() => void answer("dismiss")}>Got it</Button>
          </>
        }
      >
        <ul className={styles.courses}>{courses?.items.map((c) => <Course key={c.title} course={c} />)}</ul>
        <p className={`t-caption ${styles.quiet}`}>Suggestions, not requirements. Tacit is not paid by any course provider.</p>
        {courseError && <FieldError>Couldn’t save that. Try again.</FieldError>}
      </Dialog>
    </div>
  );
}

function Board({ children }: { children: ReactNode }) {
  return <div className={styles.board}>{children}</div>;
}

function Skeletons() {
  return (
    <>
      <Skeleton radius="widget" tone={3} height="100%" className={styles.hero} />
      {[styles.profile, styles.recruiter, styles.updates, styles.sent, styles.fresh].map((c) => <Skeleton key={c} radius="widget" height="100%" className={c} />)}
    </>
  );
}

function StepBar({ steps }: { steps: Step[] }) {
  return (
    <ol className={styles.steps} aria-label="Progress">
      {steps.map((s) => (
        <li key={s.label} className={styles.step} data-state={s.state} aria-current={s.state === "current" ? "step" : undefined}>
          <span className={styles.bar} aria-hidden="true" />
          <span className={s.state === "current" ? "t-body-m-strong" : "t-body-s"}>{s.label}<span className="sr-only">{s.state === "done" ? " (done)" : s.state === "todo" ? " (next)" : " (now)"}</span></span>
          {s.date && <span className={`t-caption ${styles.date}`}>{s.date}</span>}
        </li>
      ))}
    </ol>
  );
}

function Clock({ children }: { children: ReactNode }) {
  return <p className={`t-body-s-para ${styles.foot}`}><Icon name="bx-time-five" />{children}</p>;
}

function HeroCard({ hero }: { hero: Hero }) {
  const id = useId();
  const navigate = useNavigate();
  const [over, setOver] = useState(false);
  const label = hero.kind === "empty" ? "Start here" : hero.kind === "role" ? "Put forward for a role" : "Where things stand";
  const title =
    hero.kind === "empty" ? "Upload your CV"
    : hero.kind === "under-review" ? "Checking your CV"
    : hero.kind === "not-accepted" ? "We couldn’t add your CV yet"
    : hero.kind === "role" ? hero.role.title
    : `In the pool since ${hero.since.toLocaleDateString("en-GB", { month: "long" })}`;

  // The file can't ride along to C04 through the router yet (see report), so a drop opens the upload page.
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void navigate("/candidate/cv", { state: { file: e.dataTransfer.files[0] } });
  }

  return (
    <Card tone="accent" role="region" aria-labelledby={id} className={styles.hero}>
      <div className={styles.heroBody} aria-live="polite">
        <p className="t-body-m-strong">{label}</p>
        <div className={styles.mid}>
          <h2 id={id} className={`t-display-l ${styles.big}`}>{title}</h2>
          {hero.kind === "empty" && <p className="t-title">PDF or Word, up to 10 MB. A recruiter checks it before it joins the pool.</p>}
          {hero.kind === "under-review" && <p className="t-title">{RECRUITER.name} usually checks new CVs within 2 working days. You see the result here and by email.</p>}
          {hero.kind === "not-accepted" && (
            <>
              <blockquote className={`t-title ${styles.quote}`}>“{hero.reason}”</blockquote>
              <p className="t-body-s">{hero.by} · {fmtDate(hero.at)}</p>
            </>
          )}
          {hero.kind === "role" && <p className="t-title">{[hero.role.sector, hero.role.region, hero.role.seniority, hero.role.salaryBand].filter(Boolean).join(" · ")}</p>}
          {hero.kind === "pool" && (
            <p className="t-title">
              {hero.shortlisted > 0 && `Shortlisted ${hero.shortlisted < 3 ? TIMES[hero.shortlisted] : `${hero.shortlisted} times`} so far. `}Every new role is matched against your details.
            </p>
          )}
        </div>
        {hero.kind === "empty" && (
          <div className={styles.drop} data-over={over || undefined} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
            <Icon name="bx-upload" size={24} />
            <p className="t-body-m-strong">Drop your CV here</p>
            <Link to="/candidate/cv" className={buttonClass("on-lime")}>Choose a file</Link>
          </div>
        )}
        {(hero.kind === "under-review" || hero.kind === "role") && <StepBar steps={hero.steps} />}
        {hero.kind === "under-review" && <Clock>Nothing to do for now. You can still change your details while you wait.</Clock>}
        {hero.kind === "role" && <Clock>{RECRUITER_FIRST} calls you before anything is arranged. You learn the company’s name when you agree to interview.</Clock>}
        {hero.kind === "not-accepted" && (
          <div className={styles.footEnd}>
            <Link to="/candidate/cv" className={buttonClass("on-lime")}><Icon name="bx-upload" />Upload again</Link>
          </div>
        )}
      </div>
    </Card>
  );
}

function Sent({ cv }: { cv: CvSub }) {
  const name = cv.fileRef ? cvFileName(cv.fileRef) : "Your CV";
  return (
    <>
      <div className={styles.file}>
        <Icon name="bx-file" size={20} />
        <span className={styles.stack}>
          <span className={`t-body-m-strong ${styles.fileName}`}>{name}</span>
          <span className={`t-body-s ${styles.quiet}`}>Sent {fmtDate(cv.submittedAt)}</span>
        </span>
        {cv.fileRef && <ViewCv fileRef={cv.fileRef} label="View" />}
      </div>
      <p className="t-body-m">{sentSummary(cv)}</p>
      {cv.fields.skills.length > 0 && (
        <ul className={styles.tags} aria-label="Skills">
          {cv.fields.skills.slice(0, 6).map((s) => <li key={s}><Chip>{s}</Chip></li>)}
        </ul>
      )}
      <span className={styles.spacer} />
      <Link to="/candidate/details" className={`t-body-s-strong ${styles.link}`}>See everything you sent<Icon name="bx-chevron-right" size={16} /></Link>
    </>
  );
}

function FreshCard({ fresh, sent, pending, sending, onStill, onChange }: { fresh: Fresh; sent: boolean; pending: Date | undefined; sending: boolean; onStill: () => void; onChange: () => void }) {
  const waiting = sent || pending;
  return (
    <>
      <p className="t-title">{freshLine(fresh)}</p>
      <p className={`t-caption ${styles.quiet}`}>{freshCaption(fresh)}</p>
      <p className={`t-body-s-para ${styles.body} ${styles.gapTop}`}>Salary, notice period and work mode change. Recruiters check these first when a role arrives.</p>
      <span className={styles.spacer} />
      <div aria-live="polite">
        {waiting ? (
          <p className={`t-body-m-strong ${styles.sentLine}`}>
            <Icon name="bx-check" />Sent for review<span className={`t-body-s ${styles.quiet}`}>{RECRUITER_FIRST} checks it before it replaces what the pool holds.</span>
          </p>
        ) : (
          <div className={styles.buttons}>
            <Button icon="bx-check" disabled={sending || !fresh.salary && !fresh.availability && !fresh.workMode} onClick={onStill}>Still right</Button>
            <Button icon="bx-pencil" disabled={sending} onClick={onChange}>Change them</Button>
          </div>
        )}
      </div>
    </>
  );
}

function HowItWorks() {
  const steps = ["Upload your CV. PDF or Word, up to 10 MB.", "A recruiter checks it, usually within 2 working days.", "You see here when you are shortlisted, interviewing or placed."];
  return (
    <Widget title="How this works" className={styles.fresh}>
      <ol className={styles.hows}>
        {steps.map((s, i) => (
          <li key={s}><span className={`t-figure ${styles.n}`} aria-hidden="true">{i + 1}</span><span className="t-body-m">{s}</span></li>
        ))}
      </ol>
    </Widget>
  );
}

function Course({ course }: { course: CourseItem }) {
  return (
    <li className={styles.course}>
      <p className={styles.courseTitle}><span className="t-body-m-strong">{course.title}</span><span className={`t-caption ${styles.quiet}`}>{course.duration}</span></p>
      <p className={`t-body-s ${styles.body}`}>{course.why}</p>
    </li>
  );
}

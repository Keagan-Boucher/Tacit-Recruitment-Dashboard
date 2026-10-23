import type { DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { deleteObject, ref as storageRef, uploadBytes } from "firebase/storage";
import type { ParseCvResponse, SubmitResponse } from "@tacit/shared";
import { PageHeader } from "../../app";
import { devParam } from "../../app/dev";
import { Button, buttonClass, ErrorBanner, Icon, Input, SegmentedControl, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { api, ApiError } from "../../lib/api";
import { storage } from "../../lib/firebase";
import { datesLabel, dedupe, storagePath } from "../S09-cv-upload/parse";
import {
  ACCEPT_ATTR, buildSubmit, isJobUnclear, isUnclear, pickCvFile, readFromParse, RECRUITER, sizeLabel, unclearCount,
  type Details, type Read,
} from "./cv";
import { FIXTURE_EMAIL, FIXTURE_FILE, fixtureRead } from "./fixtures";
import styles from "./CandidateUpload.module.css";

type FileInfo = { name: string; size: number };
type Why = "unreadable" | "busy" | "upload";
type Phase =
  | { kind: "empty" }
  | { kind: "reading"; file: FileInfo }
  | { kind: "failed"; file: FileInfo; why: Why }
  | { kind: "check"; file: FileInfo }
  | { kind: "sent" };

const UNCLEAR = "Couldn't read this clearly. Check it.";
const FAILED: Record<Why, string> = {
  unreadable: "We couldn't read this file. Try a PDF with selectable text.",
  busy: "Tacit is busy reading other CVs. Try again in a minute.",
  upload: "We couldn't upload this file. Check your connection and try again.",
};
const WORK_MODES = [
  { value: "office", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "none", label: "Not sure" }, // the control can't show "nothing chosen", and the field is optional
];

const BLANK: Details = { fullName: "", phone: "", location: "", headline: "", currentRole: "", salaryExpectation: "", workMode: "", history: [], education: [], skills: [] };
const BLANK_READ: Read = { details: BLANK, unclear: new Set(), unclearJobs: new Set(), parseConfidence: 1 };

export default function CandidateUpload() {
  const dev = devParam(useLocation().search, "state");
  // key: a changed ?state= remounts with that state
  return <Screen key={dev ?? "live"} dev={dev} />;
}

function Sparkle() {
  return (
    <svg className={styles.spark} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

function initialPhase(dev: string | null): Phase {
  switch (dev) {
    case null: case "empty": return { kind: "empty" };
    case "ai-working": return { kind: "reading", file: FIXTURE_FILE };
    case "ai-failed": return { kind: "failed", file: FIXTURE_FILE, why: "unreadable" };
    case "sent": return { kind: "sent" };
    default: return { kind: "check", file: FIXTURE_FILE }; // default, check
  }
}

function Screen({ dev }: { dev: string | null }) {
  const { user } = useAuth();
  const fixture = useMemo(() => (dev ? fixtureRead() : null), [dev]);
  const [phase, setPhase] = useState<Phase>(() => initialPhase(dev));
  const [read, setRead] = useState<Read>(fixture?.read ?? BLANK_READ);
  const [details, setDetails] = useState<Details>(fixture?.details ?? BLANK);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const skillInput = useRef<HTMLInputElement>(null);
  // One parse at a time: Groq's tokens-per-minute cap is shared.
  const busy = useRef(false);
  const current = useRef<{ file: File; fileRef?: string } | null>(null);
  const fileRef = useRef<string>(dev ? "users/dev/cvs/0-cv.pdf" : "");

  // The step changed: put focus on that step's heading so it is announced and the keyboard keeps its place.
  const shown = useRef(phase.kind);
  useEffect(() => {
    if (shown.current === phase.kind) return; // first render (and StrictMode's second effect run): leave focus alone
    shown.current = phase.kind;
    root.current?.querySelector<HTMLElement>("[data-focus]")?.focus({ preventScroll: true });
  }, [phase.kind]);

  async function run(file: File, existingRef?: string) {
    if (dev || busy.current) return;
    busy.current = true;
    const info = { name: file.name, size: file.size };
    setPhase({ kind: "reading", file: info });
    current.current = { file, fileRef: existingRef };
    try {
      if (!existingRef) {
        const path = storagePath(user?.uid ?? "", file.name, Date.now());
        await uploadBytes(storageRef(storage, path), file);
        current.current.fileRef = path;
      }
    } catch {
      busy.current = false;
      setPhase({ kind: "failed", file: info, why: "upload" });
      return;
    }
    try {
      const res = await api<ParseCvResponse>("/api/parse-cv", { fileRef: current.current.fileRef });
      const r = readFromParse(res.result);
      fileRef.current = current.current.fileRef!;
      setRead(r);
      setDetails(r.details);
      setTouched(new Set());
      setNameError(undefined);
      setSendError(null);
      setPhase({ kind: "check", file: info });
    } catch (e) {
      setPhase({ kind: "failed", file: info, why: e instanceof ApiError && e.code === "rate_limited" ? "busy" : "unreadable" });
    } finally {
      busy.current = false;
    }
  }

  function choose(files: File[]) {
    const picked = pickCvFile(files);
    if ("problem" in picked) return setNote(picked.problem);
    setNote("");
    const old = fileRef.current; // a replaced CV is not kept in Storage
    if (!dev && old && phase.kind === "check") void deleteObject(storageRef(storage, old)).catch(() => {});
    void run(picked.file);
  }

  const retry = () => current.current && void run(current.current.file, current.current.fileRef);

  const set = <K extends keyof Details>(key: K, value: Details[K]) => {
    setDetails((d) => ({ ...d, [key]: value }));
    touch(key);
  };
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const setJob = (i: number, patch: Partial<Details["history"][number]>) => {
    setDetails((d) => ({ ...d, history: d.history.map((j, n) => (n === i ? { ...j, ...patch } : j)) }));
    touch(`job:${i}`);
  };
  function addSkill() {
    const next = dedupe([...details.skills, skillDraft]);
    if (next.length !== details.skills.length) set("skills", next);
    setSkillDraft("");
  }

  async function send() {
    if (!details.fullName.trim()) {
      setNameError("Enter your full name.");
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setNameError(undefined);
    setSendError(null);
    if (dev) return setPhase({ kind: "sent" });
    setSending(true);
    try {
      await api<SubmitResponse>("/api/portal/submit", buildSubmit(fileRef.current, read, details));
      setPhase({ kind: "sent" });
    } catch (e) {
      setSendError(e instanceof ApiError && e.code === "rate_limited" ? "Too many tries. Wait a few minutes and send again." : "Couldn't send your CV.");
    } finally {
      setSending(false);
    }
  }

  if (phase.kind === "sent") {
    return (
      <div ref={root} className={styles.sent}>
        <span className={styles.tick}>
          <Icon name="bx-check" size={36} />
        </span>
        <h1 data-focus tabIndex={-1} className="t-headline">
          Sent for review.
        </h1>
        <p className={`t-body-m-para ${styles.sentText}`}>
          {RECRUITER} usually checks new CVs within 2 working days. You see the result on your Tacit home page.
        </p>
        <Link to="/candidate" className={buttonClass("primary")}>
          Back to home
        </Link>
      </div>
    );
  }

  const checking = phase.kind === "check";
  const unclear = (k: keyof Details) => isUnclear(read, k, touched);
  const flagged = (k: keyof Details) => (unclear(k) ? { className: styles.stale, error: UNCLEAR } : {});
  const text = (k: "fullName" | "phone" | "location" | "headline" | "currentRole" | "salaryExpectation", label: string, extra = {}) => (
    <Input
      label={label}
      value={details[k]}
      onChange={(e) => set(k, e.target.value)}
      onBlur={() => touch(k)}
      {...(k === "fullName" && nameError ? { error: nameError } : flagged(k))}
      {...extra}
    />
  );
  const left = unclearCount(read, touched);

  return (
    <div ref={root} className={styles.page}>
      <PageHeader
        context={
          <>
            <span className={styles.context}>
              <Link to="/candidate" className={styles.crumb}>
                Home
              </Link>{" "}
              / Update my CV
            </span>
          </>
        }
        headline="Send your CV."
        actions={
          <Link to="/candidate" className={buttonClass("ghost")}>
            Cancel
          </Link>
        }
      />
      <div className={styles.cols}>
        <section className={styles.card} aria-labelledby="cv-file">
          <h2 id="cv-file" {...(!checking && { "data-focus": "", tabIndex: -1 })} className="t-title">
            Your CV
          </h2>
          {phase.kind !== "empty" && <FileRow file={phase.file} state={phase.kind} />}
          {phase.kind !== "reading" && (
            <Drop
              title={phase.kind === "empty" ? "Drop your CV here, or choose a file" : checking ? "Drop a different file" : "Drop a different file, or choose one"}
              onFiles={choose}
            />
          )}
          <p className={`t-body-s ${styles.note}`} role="status" aria-live="polite">
            {note}
          </p>
          <div className={styles.spacer} />
          {checking && (
            <p className={`t-body-s-para ${styles.tip}`}>
              <Sparkle />
              <span>Tacit read your CV to fill in the details. Check them, especially anything marked, before you send.</span>
            </p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="cv-check">
          <h2 id="cv-check" {...(checking && { "data-focus": "", tabIndex: -1 })} className="t-title">
            Check your details
          </h2>
          {phase.kind === "empty" && <p className={`t-body-s ${styles.quiet}`}>Your details appear here once Tacit has read your CV. You check them before anything is sent.</p>}
          {phase.kind === "reading" && <Reading />}
          {phase.kind === "failed" && (
            <>
              <ErrorBanner title={FAILED[phase.why]} detail="Your file is kept." onRetry={retry} />
              <Skeletons still />
            </>
          )}
          {checking && (
            <>
              <p className={`t-body-s ${styles.quiet}`} aria-live="polite">
                {left > 0 ? `${left} ${left === 1 ? "thing" : "things"} to check. ` : ""}This is what {RECRUITER.split(" ")[0]} sees first. Fix anything that is wrong.
              </p>
              {sendError && <ErrorBanner title={sendError} detail="Your details are still here." onRetry={() => void send()} />}
              <div className={styles.row}>
                {text("fullName", "Full name", { autoComplete: "name" })}
                <Input label="Email" value={user?.email ?? FIXTURE_EMAIL} readOnly className={styles.readonly} />
              </div>
              <div className={styles.row}>
                {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
                {text("location", "Based in")}
              </div>
              <div className={styles.row}>
                {text("headline", "Headline")}
                {text("currentRole", "Current role")}
              </div>
              <div className={styles.row}>
                {text("salaryExpectation", "Salary expectation (a month)")}
                <div className={styles.group}>
                  <p className={`t-body-s-strong ${styles.label}`} aria-hidden="true">
                    Work mode
                  </p>
                  <SegmentedControl
                    className={styles.mode}
                    label="Work mode"
                    options={WORK_MODES}
                    value={details.workMode || "none"}
                    onChange={(v) => set("workMode", v === "none" ? "" : (v as Details["workMode"]))}
                  />
                </div>
              </div>

              {details.history.length > 0 && (
                <fieldset className={styles.history}>
                  <legend className="t-body-s-strong">Work history</legend>
                  {details.history.map((j, i) => (
                    <div key={i} className={`${styles.job} ${isJobUnclear(read, i, touched) ? styles.jobStale : ""}`}>
                      <div className={styles.row}>
                        <Input label={`Job ${i + 1} title`} value={j.title} onChange={(e) => setJob(i, { title: e.target.value })} onBlur={() => touch(`job:${i}`)} />
                        <Input label={`Job ${i + 1} company`} value={j.company} onChange={(e) => setJob(i, { company: e.target.value })} onBlur={() => touch(`job:${i}`)} />
                      </div>
                      {datesLabel(j) && <p className={`t-caption ${styles.quiet}`}>{datesLabel(j)}</p>}
                      {isJobUnclear(read, i, touched) && (
                        <p className={`t-caption-strong ${styles.flag}`}>
                          <Icon name="bx-error-circle" size={14} />
                          {UNCLEAR}
                        </p>
                      )}
                    </div>
                  ))}
                </fieldset>
              )}

              {details.education.length > 0 && (
                <div className={styles.group}>
                  <h3 className="t-body-s-strong">Education</h3>
                  <ul className={styles.plain}>
                    {details.education.map((e) => (
                      <li key={e} className="t-body-m">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.group}>
                <h3 className="t-body-s-strong" id="skills-h">
                  Skills
                </h3>
                <ul className={styles.tags} aria-labelledby="skills-h">
                  {details.skills.map((s) => (
                    <li key={s} className={`t-body-s ${styles.tag}`}>
                      {s}
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove ${s}`}
                        onClick={() => {
                          set("skills", details.skills.filter((x) => x !== s));
                          skillInput.current?.focus();
                        }}
                      >
                        <Icon name="bx-x" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={styles.addSkill}>
                  <Input
                    ref={skillInput}
                    label="Add a skill"
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                  />
                  <Button icon="bx-plus" onClick={addSkill} disabled={!skillDraft.trim()}>
                    Add
                  </Button>
                </div>
              </div>

              <div className={styles.spacer} />
              <hr className={styles.rule} />
              <div className={styles.footer}>
                <p className={`t-body-s ${styles.quiet}`}>A recruiter checks everything before it joins the pool, usually within 2 working days.</p>
                <Button variant="primary" iconAfter="bx-chevron-right" onClick={() => void send()} disabled={sending} aria-busy={sending}>
                  Send for review
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FileRow({ file, state }: { file: FileInfo; state: "reading" | "failed" | "check" }) {
  return (
    <div className={styles.file}>
      <Icon name="bx-file" size={20} />
      <div className={styles.fileText}>
        <p className={`t-body-m-strong ${styles.fileName}`}>{file.name}</p>
        <p className="t-caption">
          {state === "check" && <span className={`t-body-s-strong ${styles.ok}`}>Read</span>}
          {state === "reading" && <span className="t-body-s-strong">Reading…</span>}
          {state === "failed" && <span className={`t-body-s-strong ${styles.bad}`}>Couldn't read</span>}
          <span className={styles.quiet}> · {sizeLabel(file.size)}</span>
        </p>
      </div>
    </div>
  );
}

function Drop({ title, onFiles }: { title: string; onFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles([...e.dataTransfer.files]);
  };
  return (
    <div
      className={styles.drop}
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <button type="button" className={styles.dropButton} onClick={() => input.current?.click()}>
        <Icon name="bx-upload" size={24} />
        <span className="t-body-m-strong">{title}</span>
        <span className={`t-caption ${styles.quiet}`}>PDF or Word, up to 10 MB</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={ACCEPT_ATTR}
        tabIndex={-1}
        aria-label="CV file"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = ""; // choosing the same file again should fire again
        }}
      />
    </div>
  );
}

function Skeletons({ still }: { still?: boolean }) {
  return (
    <div className={styles.skeletons} data-still={still || undefined}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.row}>
          <Skeleton height={46} />
          <Skeleton height={46} />
        </div>
      ))}
      <Skeleton width={260} height={36} radius="pill" />
    </div>
  );
}

function Reading() {
  return (
    <>
      <p className={`t-body-m-strong ${styles.working}`} role="status" aria-live="polite">
        <Sparkle />
        Tacit is reading your CV. This usually takes a few seconds.
      </p>
      <Skeletons />
    </>
  );
}

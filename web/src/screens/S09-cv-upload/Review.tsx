import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app";
import { Button, Card, Chip, ErrorBanner, Icon, Input } from "../../components";
import { blankJob, checkTitle, countFlags, datesLabel, dedupe, type Draft, type FieldKey, type Flag, type JobDraft, type QueueItem } from "./parse";
import styles from "./CvUpload.module.css";

type Props = {
  item: QueueItem;
  onChange: (d: Draft) => void;
  /** Writes the candidate and moves on. Throws when the write fails, so the review stays on screen. */
  onSave: (status: "ok" | "flagged") => Promise<void>;
  onDiscard: () => void;
  /** Back to the list of CVs. */
  onBack: () => void;
};

function openCv(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "Read as “…”" plus the model's note: what was actually on the page, so the recruiter checks instead of trusting. */
function ReadAs({ flag }: { flag: Flag }) {
  return (
    <p className={styles.readAs}>
      <span className="t-meta">Read as</span>
      {flag.readAs && <q className="t-caption">{flag.readAs}</q>}
      {flag.note && <span className={`${styles.note} t-caption`}>{flag.note}</span>}
    </p>
  );
}

function LooksRight({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button className={styles.small} icon="bx-check" aria-label={`Looks right: ${label}`} onClick={onClick}>
      Looks right
    </Button>
  );
}

type FieldProps = {
  label: string;
  value: string;
  flag: Flag | null;
  error?: string;
  onChange: (v: string) => void;
  onClear: () => void;
  className?: string;
};

function Field({ label, value, flag, error, onChange, onClear, className }: FieldProps) {
  return (
    <div className={[styles.fieldBlock, className].filter(Boolean).join(" ")}>
      <div className={styles.labelRow}>
        <span className={`${styles.label} t-body-s-strong`} aria-hidden="true">
          {label}
        </span>
        {flag && <Chip icon="bx-error-circle">Check this</Chip>}
        {flag && <LooksRight label={label} onClick={onClear} />}
      </div>
      <Input hideLabel label={label} value={value} error={error} onChange={(e) => onChange(e.target.value)} />
      {flag && <ReadAs flag={flag} />}
    </div>
  );
}

function JobCard({ job, editing, onEdit, onChange, onDone, onRemove }: {
  job: JobDraft;
  editing: boolean;
  onEdit: () => void;
  onChange: (j: JobDraft) => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  if (editing) {
    return (
      <li className={`${styles.job} ${styles.jobEditing}`}>
        <Input size="sm" label="Job title" value={job.title} onChange={(e) => onChange({ ...job, title: e.target.value })} />
        <Input size="sm" label="Company" value={job.company} onChange={(e) => onChange({ ...job, company: e.target.value })} />
        <div className={styles.dates}>
          <Input size="sm" label="From" value={job.from} onChange={(e) => onChange({ ...job, from: e.target.value })} />
          <Input size="sm" label="To" note="Blank if current" value={job.to} onChange={(e) => onChange({ ...job, to: e.target.value })} />
        </div>
        <div className={styles.jobActions}>
          <Button className={styles.quiet} onClick={onRemove}>
            Remove
          </Button>
          <Button className={styles.small} icon="bx-check" onClick={onDone}>
            Done
          </Button>
        </div>
      </li>
    );
  }
  const dates = datesLabel(job);
  return (
    <li className={`${styles.job} ${job.flag ? styles.jobFlagged : ""}`}>
      <div className={styles.jobHead}>
        <p className="t-body-m-strong">{job.title}</p>
        {job.flag ? (
          <Chip icon="bx-error-circle">Check this</Chip>
        ) : (
          <button type="button" className={`${styles.link} t-caption`} onClick={onEdit} aria-label={`Edit ${job.title}`}>
            Edit
          </button>
        )}
      </div>
      {job.company && <p className="t-body-s">{job.company}</p>}
      {dates && <p className={`${styles.dim} t-caption`}>{dates}</p>}
      {job.flag && <ReadAs flag={job.flag} />}
      {job.flag && (
        <div className={styles.jobActions}>
          <button type="button" className={`${styles.link} t-caption`} onClick={onEdit} aria-label={`Edit ${job.title}`}>
            Edit
          </button>
          <LooksRight label={job.title} onClick={() => onChange({ ...job, flag: null })} />
        </div>
      )}
    </li>
  );
}

function Skills({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    onChange(dedupe([...skills, ...text.split(",")]));
    setText("");
  }
  return (
    <div className={styles.skills}>
      <h3 className="t-body-m-strong">Skills found</h3>
      <ul className={styles.chips}>
        {skills.map((s) => (
          <li key={s}>
            <Chip>
              {s}
              <button type="button" className={styles.x} aria-label={`Remove ${s}`} onClick={() => onChange(skills.filter((x) => x !== s))}>
                <Icon name="bx-x" size={12} />
              </button>
            </Chip>
          </li>
        ))}
        <li>
          {adding ? (
            <form className={styles.addSkill} onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && setAdding(false)}>
              <Input size="sm" hideLabel label="New skill" placeholder="Add a skill" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" className={styles.small}>
                Add
              </Button>
            </form>
          ) : (
            <button type="button" className={`${styles.link} t-body-s`} onClick={() => setAdding(true)}>
              <Icon name="bx-plus" size={14} />
              Add skill
            </button>
          )}
        </li>
      </ul>
    </div>
  );
}

export function Review({ item, onChange, onSave, onDiscard, onBack }: Props) {
  const d = item.draft!;
  const hand = item.kind === "hand";
  const flags = countFlags(d);
  const [saving, setSaving] = useState<"ok" | "flagged" | null>(null);
  const [failed, setFailed] = useState<"ok" | "flagged" | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const titleId = useId();

  const nameMissing = !d.fullName.value.trim();

  async function save(status: "ok" | "flagged") {
    setTriedSave(true);
    if (nameMissing) return;
    setSaving(status);
    setFailed(null);
    try {
      await onSave(status);
    } catch {
      setFailed(status);
      setSaving(null);
    }
  }

  const setValue = (k: FieldKey, value: string) => onChange({ ...d, [k]: { ...d[k], value } });
  const clear = (k: FieldKey) => onChange({ ...d, [k]: { ...d[k], flag: null } });
  const field = (k: FieldKey, label: string, className?: string) => (
    <Field
      className={className}
      label={label}
      value={d[k].value}
      flag={d[k].flag}
      error={k === "fullName" && triedSave && nameMissing ? "Add a name to save this candidate." : undefined}
      onChange={(v) => setValue(k, v)}
      onClear={() => clear(k)}
    />
  );
  const setJob = (i: number, j: JobDraft) => onChange({ ...d, history: d.history.map((x, n) => (n === i ? j : x)) });
  const removeJob = (i: number) => {
    onChange({ ...d, history: d.history.filter((_, n) => n !== i) });
    setEditing(null);
  };

  const busy = saving !== null;
  return (
    <div className={styles.page}>
      <PageHeader
        context={
          <>
            <Link to="/candidates" className={styles.crumb}>
              Candidates
            </Link>
            {" / "}
            <button type="button" className={`${styles.crumb} ${styles.crumbButton}`} onClick={onBack}>
              Add a candidate
            </button>
          </>
        }
        headline={hand ? "Add by hand." : checkTitle(d.fullName.value)}
        actions={
          <>
            <Button className={styles.quiet} icon="bx-x" onClick={onDiscard} disabled={busy}>
              Discard
            </Button>
            {!hand && (
              <Button onClick={() => void save("flagged")} disabled={busy}>
                Keep as flagged draft
              </Button>
            )}
            <Button variant="primary" icon="bx-check" onClick={() => void save("ok")} disabled={busy} aria-busy={saving === "ok"}>
              {saving === "ok" ? "Adding…" : "Confirm and add"}
            </Button>
          </>
        }
      />

      {failed && (
        <ErrorBanner
          className={styles.error}
          title="Couldn’t add this candidate."
          detail="Nothing was lost. Your edits are still here."
          onRetry={() => void save(failed)}
        />
      )}

      <section className={styles.notice} role="status" aria-live="polite">
        <span className={styles.noticeIcon}>
          <Icon name={flags ? "bx-error-circle" : "bx-check-circle"} size={20} />
        </span>
        <div className={styles.noticeText}>
          <p className="t-body-m-strong">
            {flags
              ? `Only part of this CV could be read, so ${flags} ${flags === 1 ? "thing needs" : "things need"} you.`
              : hand
                ? "Add this person by hand."
                : "Nothing in this CV needs a second look."}
          </p>
          <p className="t-body-s">Nothing is saved until you confirm.</p>
        </div>
        {item.file && (
          <Button className={styles.small} icon="bx-show" onClick={() => openCv(item.file!)}>
            View CV
          </Button>
        )}
      </section>

      <div className={styles.cols}>
        <Card className={styles.form} aria-labelledby={titleId} role="region">
          <div className={styles.formHead}>
            <h2 id={titleId} className="t-title">
              What the CV says
            </h2>
            <p className="t-caption">Claims, not what you heard</p>
          </div>
          <div className={styles.pair}>
            {field("fullName", "Full name")}
            {field("location", "Location")}
          </div>
          {field("headline", "Headline")}
          {field("currentRole", "Current role")}
          {field("salary", "Salary expectation")}
        </Card>

        <Card className={styles.side} aria-label="Employment history" role="region">
          <h2 className="t-body-m-strong">Employment history</h2>
          <ul className={styles.jobs}>
            {d.history.map((j, i) => (
              <JobCard
                key={i}
                job={j}
                editing={editing === i}
                onEdit={() => setEditing(i)}
                onChange={(next) => setJob(i, next)}
                onDone={() => (j.title.trim() ? setEditing(null) : removeJob(i))}
                onRemove={() => removeJob(i)}
              />
            ))}
          </ul>
          <button
            type="button"
            className={`${styles.link} t-body-s`}
            onClick={() => {
              onChange({ ...d, history: [...d.history, blankJob()] });
              setEditing(d.history.length);
            }}
          >
            <Icon name="bx-plus" size={14} />
            Add a job
          </button>
          {d.education.length > 0 && (
            <div className={styles.education}>
              <h3 className="t-body-m-strong">Education</h3>
              <ul>
                {d.education.map((e) => (
                  <li key={e} className="t-body-s">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <hr className={styles.rule} />
          <Skills skills={d.skills} onChange={(skills) => onChange({ ...d, skills })} />
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ShortlistStatusRequest } from "@tacit/shared";
import { Button, Dialog, FieldError, Input, SegmentedControl, Textarea } from "../../components";
import { buildHired, buildInterviewing, buildNotProgressing, changeError, RECRUITER } from "./shortlist";
import type { Entry } from "./shortlist";
import type { Ask } from "./ShortlistCard";
import styles from "./StatusDialog.module.css";

type Props = {
  kind: Ask;
  entry: Entry;
  /** Resolves when the change is saved; rejects with the proxy's error. */
  onSend: (req: ShortlistStatusRequest) => Promise<void>;
  /** Called after the dialog has closed. `done` = the change was saved. */
  onClose: (done: boolean) => void;
};

type Errors = Partial<Record<"reason" | "startDate" | "salary", string>>;

/** The three decisions share one dialog: a labelled form, the proxy's sentence on failure, everything typed kept. */
export function StatusDialog({ kind, entry, onSend, onClose }: Props) {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);
  const [times, setTimes] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ZAR");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [errors, setErrors] = useState<Errors>({});
  const [failed, setFailed] = useState("");
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Close in two steps so Dialog puts focus back on the trigger before the screen moves it.
  useEffect(() => { if (!open) onClose(done); }, [open, done, onClose]);

  const name = entry.identity?.fullName ?? entry.label;
  const copy = {
    interviewing: {
      title: `Move ${name} to interviewing?`,
      description: `You will see their name and contact details. ${RECRUITER} is told straight away and arranges the interview with them.`,
      action: "Move to interviewing", busy: "Moving…",
    },
    hired: {
      title: `Mark ${name} as hired?`,
      description: `${RECRUITER} is told and the role closes. Everyone else on this shortlist hears that the role is filled.`,
      action: "Mark as hired", busy: "Saving…",
    },
    "not-progressing": {
      title: `Not progressing: ${name}`,
      description: `${RECRUITER} is told and sees your reason.`,
      action: "Not progressing", busy: "Saving…",
    },
  }[kind];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    let body: ShortlistStatusRequest;
    if (kind === "interviewing") body = buildInterviewing(entry.id, times);
    else {
      const built = kind === "hired" ? buildHired(entry.id, { startDate, amount, currency, period }) : buildNotProgressing(entry.id, reason);
      if (!built.ok) {
        setErrors({ [built.field]: built.message });
        (built.field === "reason" ? reasonRef : built.field === "startDate" ? dateRef : amountRef).current?.focus();
        return;
      }
      body = built.body;
    }
    setSaving(true);
    setFailed("");
    try {
      await onSend(body);
      setDone(true);
      setOpen(false);
    } catch (err) {
      setFailed(changeError(err as { status?: number; code?: string; message?: string }));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && setOpen(false)}
      width={560}
      eyebrow={entry.roleTitle}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={saving}>
            {saving ? copy.busy : copy.action}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {kind === "interviewing" && (
          <div className={styles.field}>
            <Input label="Times that suit you" value={times} maxLength={200} onChange={(e) => setTimes(e.target.value)} placeholder="Tue 28 or Wed 29 Oct, mornings" />
            <p className={`${styles.help} t-caption`}>Optional. {RECRUITER} checks these with the candidate.</p>
          </div>
        )}
        {kind === "hired" && (
          <>
            <div className={styles.row}>
              <Input ref={dateRef} label="Start date" type="date" value={startDate} error={errors.startDate} onChange={(e) => { setStartDate(e.target.value); setErrors({}); }} />
              <Input ref={amountRef} label={`Agreed salary (a ${period})`} inputMode="decimal" value={amount} error={errors.salary} placeholder="R62 000" onChange={(e) => { setAmount(e.target.value); setErrors({}); }} />
            </div>
            <div className={styles.row}>
              <Input label="Currency" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              <div className={styles.field}>
                <p className={`${styles.legend} t-body-s-strong`}>Paid</p>
                <SegmentedControl label="Salary period" options={[{ value: "month", label: "A month" }, { value: "year", label: "A year" }]} value={period} onChange={(v) => setPeriod(v === "year" ? "year" : "month")} />
              </div>
            </div>
            <p className={`${styles.help} t-caption`}>Only {RECRUITER} sees the salary. It goes on the placement record.</p>
          </>
        )}
        {kind === "not-progressing" && (
          <Textarea ref={reasonRef} label="Your reason" note="Required" value={reason} maxLength={1000} placeholder={`What should ${RECRUITER} know?`} error={errors.reason} onChange={(e) => { setReason(e.target.value); setErrors({}); }} />
        )}
        <div className={styles.live} aria-live="polite">{failed && <FieldError>{failed}</FieldError>}</div>
      </form>
    </Dialog>
  );
}

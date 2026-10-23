import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import type { ReviewReasonCode } from "@tacit/shared";
import { Button, Dialog, FieldError, FilterChip, Icon, Textarea } from "../../components";
import { REASONS } from "./review";
import styles from "./ReviewQueue.module.css";

type Props = {
  /** "CV · sent 22 Oct" */
  eyebrow: string;
  /** What this is called in the title: the candidate's name or the brief's title. */
  subject: string;
  /** Who sees the reason: "Lerato" or "Vantage Logistics". */
  to: string;
  description: string;
  /** Sends the decision. Throws when it fails, so the dialog stays open with the words intact. */
  onSend: (code: ReviewReasonCode, text: string) => Promise<void>;
  onClose: () => void;
  /** Dev fixture state: open with the frame's draft filled in. */
  draft?: { code: ReviewReasonCode; text: string };
};

/** S18 Not accepted: one reason chip and the recruiter's own words, which the submitter reads verbatim. Both are required. */
export function NotAcceptedDialog({ eyebrow, subject, to, description, onSend, onClose, draft }: Props) {
  const [open, setOpen] = useState(true);
  const [code, setCode] = useState<ReviewReasonCode | undefined>(draft?.code);
  const [text, setText] = useState(draft?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const formId = useId();
  const labelId = useId();

  // Close in two steps so Dialog puts focus back on the trigger before the parent unmounts us.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  const ready = !!code && text.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code || !ready || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSend(code, text.trim());
      setOpen(false);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      eyebrow={eyebrow}
      title={`Not accepted: ${subject}`}
      description={description}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!ready || saving}>
            {saving ? "Sending…" : "Send reason"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.reasonForm} onSubmit={submit} noValidate>
        <div className={styles.reasonGroup}>
          <p id={labelId} className={`${styles.reasonLabel} t-body-s-strong`}>
            Reason<span className={`${styles.reasonNote} t-meta`}>Required</span>
          </p>
          <div role="group" aria-labelledby={labelId} className={styles.chips}>
            {REASONS.map(([value, label]) => (
              <FilterChip key={value} selected={code === value} onClick={() => setCode(value)}>
                {code === value && <Icon name="bx-check" size={14} />}
                {label}
              </FilterChip>
            ))}
          </div>
        </div>
        <Textarea
          label={`In your words · sent to ${to}`}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        <div aria-live="polite">{failed && <FieldError>Couldn’t send this. What you wrote is still here. Try again.</FieldError>}</div>
      </form>
    </Dialog>
  );
}

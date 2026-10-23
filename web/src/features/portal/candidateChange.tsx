import { useRef, useState } from "react";
import type { DetailsChangeFields, WorkMode } from "@tacit/shared";
import { Button, Dialog, FieldError, Input, SegmentedControl } from "../../components";
import { detailsBody, RECRUITER_FIRST, type Fresh } from "./candidate";
import { sendDetailsChange } from "./candidateData";
import styles from "./candidateChange.module.css";

const MODES = [
  { value: "office", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

/** Sends a details-change (C02 Still right / Change them, C03 Change my details). The pool keeps the old values until the recruiter passes it. */
export function useSendDetails(dev: boolean) {
  const [state, setState] = useState({ sending: false, failed: false, sent: false });
  const last = useRef<DetailsChangeFields | undefined>(undefined);
  async function send(fields: DetailsChangeFields): Promise<boolean> {
    last.current = fields;
    setState({ sending: true, failed: false, sent: false });
    try {
      await sendDetailsChange(fields, dev);
      setState({ sending: false, failed: false, sent: true });
      return true;
    } catch {
      setState({ sending: false, failed: true, sent: false });
      return false;
    }
  }
  return { ...state, send, retry: () => last.current && void send(last.current) };
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** The values the form starts from. */
  initial: Pick<Fresh, "salary" | "availability" | "workMode"> | undefined;
  sending: boolean;
  /** True: the send failed (the banner on the page says so); the form stays open with what was typed. */
  onSend: (fields: DetailsChangeFields) => Promise<boolean>;
};

/** Mount with a fresh `key` each time it opens so the form starts from the current values. */
export function ChangeDetailsDialog({ open, onClose, initial, sending, onSend }: Props) {
  const [draft, setDraft] = useState<{ salary: string; availability: string; workMode: WorkMode | "" }>({ salary: initial?.salary ?? "", availability: initial?.availability ?? "", workMode: initial?.workMode ?? "" });
  const [error, setError] = useState<string>();

  async function submit() {
    const fields = detailsBody(draft);
    if (!fields) return setError("Add at least one detail.");
    setError(undefined);
    if (await onSend(fields)) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change your details"
      description={`${RECRUITER_FIRST} checks these before they replace what the pool holds.`}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={sending} onClick={() => void submit()}>{sending ? "Sending…" : "Send for review"}</Button>
        </>
      }
    >
      <div className={styles.form}>
        <Input label="Salary expectation" value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} placeholder="R60k a month" />
        <Input label="Notice period" value={draft.availability} onChange={(e) => setDraft({ ...draft, availability: e.target.value })} placeholder="1 month notice" />
        <div className={styles.field}>
          <span className="t-body-s-strong">Work mode</span>
          <SegmentedControl label="Work mode" options={MODES} value={draft.workMode} onChange={(workMode) => setDraft({ ...draft, workMode: workMode as WorkMode })} />
        </div>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </Dialog>
  );
}

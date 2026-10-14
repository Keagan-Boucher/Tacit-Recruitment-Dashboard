import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import type { Candidate, Company, Match, Role } from "@tacit/shared";
import { useScreenState } from "../../app";
import { Button, Dialog, FieldError, FilterChip, Icon, Input, Textarea } from "../../components";
import { useAuth } from "../../features/auth";
import { useDocument } from "../../lib/data";
import type { WithId } from "../../lib/data";
import { db } from "../../lib/firebase";
import { buildDecision, REASONS } from "./override";
import styles from "./OverrideDialog.module.css";

type Props = { match: WithId<Match>; role: WithId<Role>; candidate: WithId<Candidate>; onClose: () => void };

/** S06: "Not this one" needs a reason. Optional "Anything new?" fields are saved as fresh attributes heard today. */
export function OverrideDialog({ match, role, candidate, onClose }: Props) {
  const uid = useAuth().user?.uid;
  const company = useDocument<Company>("companies", role.companyId).data;
  const [open, setOpen] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [more, setMore] = useState(false);
  const [salary, setSalary] = useState("");
  const [available, setAvailable] = useState("");
  const [missing, setMissing] = useState(useScreenState() === "reason-missing");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  const labelId = useId();

  // Close in two steps so Dialog puts focus back on the trigger before S04 unmounts us.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  const first = candidate.fullName.split(" ")[0];
  const toggle = (code: string) => {
    setMissing(false);
    setCodes((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!codes.length && !text.trim()) {
      setMissing(true);
      textRef.current?.focus();
      return;
    }
    if (!uid) return;
    setSaving(true);
    setFailed(false);
    try {
      const overrideRef = doc(collection(db, "overrides"));
      const { override, attributes } = buildDecision({
        overrideId: overrideRef.id, uid, match, companyId: role.companyId, codes, text, salary, available, now: new Date(),
      });
      const batch = writeBatch(db);
      batch.set(overrideRef, override);
      attributes.forEach((a) => batch.set(doc(collection(db, "attributes")), a));
      await batch.commit();
      setOpen(false);
    } catch {
      // Everything typed stays in state; the recruiter can try again.
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      eyebrow={`${role.title}${company ? ` · ${company.name}` : ""}`}
      title={`Not this one: ${candidate.fullName}`}
      description={`Your reason is recorded on ${first}’s profile and on ${company ? `${company.name}’${company.name.endsWith("s") ? "" : "s"}` : "the company’s"} hiring history.`}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={saving || missing}>
            {saving ? "Recording…" : "Record decision"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.reason}>
          <p id={labelId} className={`${styles.label} t-body-s-strong`}>
            Reason<span className={`${styles.note} t-meta`}>Required</span>
          </p>
          <div role="group" aria-labelledby={labelId} className={styles.chips}>
            {REASONS.map(([code, label]) => {
              const on = codes.includes(code);
              return (
                <FilterChip key={code} selected={on} onClick={() => toggle(code)}>
                  {on && <Icon name="bx-check" size={14} />}
                  {label}
                </FilterChip>
              );
            })}
          </div>
          <Textarea
            ref={textRef}
            label="In your words"
            value={text}
            maxLength={1000}
            placeholder="What should you remember about this next time?"
            error={missing ? "Add a reason so you remember why next time." : undefined}
            onChange={(e) => { setText(e.target.value); setMissing(false); }}
          />
        </div>
        {more ? (
          <div className={styles.fresh}>
            <Input label="New salary expectation" note="Optional" value={salary} maxLength={60} placeholder="R60k" onChange={(e) => setSalary(e.target.value)} />
            <Input label="Available from" note="Optional" type="date" value={available} onChange={(e) => setAvailable(e.target.value)} />
          </div>
        ) : (
          <button type="button" className={`${styles.more} t-body-s-strong`} onClick={() => setMore(true)}>
            Add new salary or availability for {first}
          </button>
        )}
        <div aria-live="polite">
          {failed && <FieldError>Couldn’t record this decision. What you typed is still here. Try again.</FieldError>}
        </div>
      </form>
    </Dialog>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Button, Dialog, ErrorBanner, Input, Textarea } from "../../components";
import { useAuth } from "../../features/auth";
import { db } from "../../lib/firebase";
import { buildCompany } from "./newCompany";
import styles from "./NewCompanyDialog.module.css";

type Props = { companies: { id: string; name: string }[]; onClose: () => void };

/** S10 "New company": the name is the only required field; what is typed stays put if the save fails. */
export function NewCompanyDialog({ companies, onClose }: Props) {
  const uid = useAuth().user?.uid ?? "";
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [problem, setProblem] = useState<{ kind: "name" } | { kind: "duplicate"; id: string; name: string }>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  // Close in two steps so Dialog puts focus back on the trigger before the parent unmounts us.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (saving) return;
    const built = buildCompany({ name, sector, location, notes }, companies, uid);
    setFailed(false);
    if (!built.ok) {
      if (built.reason === "invalid") return setFailed(true);
      setProblem(built.reason === "duplicate" ? { kind: "duplicate", id: built.existing.id, name: built.existing.name } : { kind: "name" });
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "companies"), { ...built.company, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setOpen(false);
      void navigate(`/companies/${ref.id}`);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      eyebrow="Companies"
      title="New company"
      description="Add what you know now. Roles, facts and an invite can follow from its profile."
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={saving}>
            {saving ? "Adding…" : "Add company"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.name}>
          <Input
            ref={nameRef}
            label="Company name"
            value={name}
            maxLength={120}
            autoComplete="off"
            required
            error={problem?.kind === "name" ? "Add the company’s name." : problem ? `You already have ${problem.name}.` : undefined}
            onChange={(e) => { setName(e.target.value); setProblem(undefined); }}
          />
          {problem?.kind === "duplicate" && (
            <Link to={`/companies/${problem.id}`} className={`${styles.link} t-body-s-strong`}>
              Open {problem.name}
            </Link>
          )}
        </div>
        <div className={styles.pair}>
          <Input label="Sector" value={sector} maxLength={80} placeholder="e.g. Logistics software" onChange={(e) => setSector(e.target.value)} />
          <Input label="Location" value={location} maxLength={80} placeholder="e.g. Durban" onChange={(e) => setLocation(e.target.value)} />
        </div>
        <Textarea label="What you know so far" note="Optional" value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} />
        {failed && <ErrorBanner title="Couldn’t add this company." detail="What you typed is still here." onRetry={() => void submit()} />}
      </form>
    </Dialog>
  );
}

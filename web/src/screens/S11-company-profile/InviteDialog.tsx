import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { addDoc, collection } from "firebase/firestore";
import type { Company, Invite } from "@tacit/shared";
import { useScreenState } from "../../app";
import { Button, Dialog, FieldError, Input } from "../../components";
import { useAuth } from "../../features/auth";
import { useOwned } from "../../lib/data";
import type { WithId } from "../../lib/data";
import { db } from "../../lib/firebase";
import { fmtDate } from "../S03-candidate-profile/profile";
import { buildInvite, INVITE_DAYS, inviteStatus, isEmail, joinLink } from "./InviteDialog.logic";
import styles from "./InviteDialog.module.css";

const byNewest = (a: Invite, b: Invite) => b.createdAt.getTime() - a.createdAt.getTime();

/** S11: the recruiter's door for a company's hiring manager. Trigger button plus the dialog (`?dialog=invite`). Nothing is emailed. */
export function InviteDialog({ company }: { company: WithId<Company> }) {
  const [params, setParams] = useSearchParams();
  const open = params.get("dialog") === "invite";
  const set = (on: boolean) => setParams((p) => { if (on) p.set("dialog", "invite"); else p.delete("dialog"); return p; });
  return (
    <>
      <Button icon="bx-user-plus" aria-label={`Invite someone from ${company.name}`} onClick={() => set(true)}>Invite someone</Button>
      {open && <InviteBody company={company} onClose={() => set(false)} />}
    </>
  );
}

type Made = { id: string; email: string; expiresAt: Date };

function InviteBody({ company, onClose }: { company: WithId<Company>; onClose: () => void }) {
  const uid = useAuth().user?.uid;
  const state = useScreenState();
  const earlier = useOwned<Invite>("invites", ["companyId", company.id], byNewest);
  const [now] = useState(() => new Date());
  const [open, setOpen] = useState(true);
  const [email, setEmail] = useState(state === "invite-error" ? "thandi@acme.example" : "");
  const [bad, setBad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(state === "invite-error");
  const [made, setMade] = useState<Made | null>(
    state === "invite-created" ? { id: "demo-invite", email: "thandi@acme.example", expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000) } : null,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  // Close in two steps so Dialog puts focus back on the trigger before we unmount.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !uid) return;
    if (!isEmail(email)) { setBad(true); emailRef.current?.focus(); return; }
    setSaving(true);
    setFailed(false);
    try {
      const invite = buildInvite({ uid, companyId: company.id, email, now: new Date() });
      const ref = await addDoc(collection(db, "invites"), invite);
      setMade({ id: ref.id, email: invite.email, expiresAt: invite.expiresAt });
    } catch {
      setFailed(true); // the email stays typed
    } finally {
      setSaving(false);
    }
  }

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(joinLink(window.location.origin, id));
      setCopied(id);
    } catch {
      setCopied(null); // the link is also shown in a selectable field
    }
  }

  const rows = (earlier.data ?? []).filter((i) => i.id !== made?.id);
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      eyebrow={company.name}
      title={`Invite someone from ${company.name}`}
      description={
        made
          ? `Send this link to ${made.email} yourself. Tacit does not send emails. It works once and expires on ${fmtDate(made.expiresAt)}.`
          : `Creates a link for their hiring manager, valid for ${INVITE_DAYS} days. Tacit does not email it. You send it yourself.`
      }
      footer={
        made ? (
          <>
            <Button onClick={() => setOpen(false)}>Done</Button>
            <Button variant="primary" icon={copied === made.id ? "bx-check" : "bx-copy"} onClick={() => copy(made.id)}>
              {copied === made.id ? "Copied" : "Copy link"}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form={formId} disabled={saving}>{saving ? "Creating…" : "Create invite"}</Button>
          </>
        )
      }
    >
      {made ? (
        <div className={styles.body}>
          <Input label="Join link" readOnly value={joinLink(window.location.origin, made.id)} onFocus={(e) => e.currentTarget.select()} />
          <span className="sr-only" role="status" aria-live="polite">{copied === made.id ? "Link copied" : ""}</span>
        </div>
      ) : (
        <form id={formId} className={styles.body} onSubmit={submit} noValidate>
          <Input
            ref={emailRef}
            label="Work email"
            type="email"
            autoComplete="off"
            value={email}
            maxLength={200}
            placeholder="name@company.co.za"
            error={bad ? "Enter their work email, like name@company.co.za." : undefined}
            onChange={(e) => { setEmail(e.target.value); setBad(false); }}
          />
          <div aria-live="polite">
            {failed && <FieldError>Couldn’t create the invite. The email is still here. Try again.</FieldError>}
          </div>
        </form>
      )}
      {rows.length > 0 && (
        <section aria-labelledby="earlier-invites" className={styles.earlier}>
          <h3 id="earlier-invites" className={`${styles.label} t-caption-strong`}>Earlier invites</h3>
          <ul className={styles.list}>
            {rows.map((i) => {
              const s = inviteStatus(i, now);
              return (
                <li key={i.id} className={styles.row}>
                  <span className={`${styles.who} t-body-s-strong`}>{i.email}</span>
                  <span className={`${styles.status} ${s.kind === "waiting" ? "" : styles.quiet} t-caption`}>{s.text}</span>
                  {s.kind === "waiting" && (
                    <button type="button" className={`${styles.link} t-body-s-strong`} onClick={() => copy(i.id)}>
                      {copied === i.id ? "Copied" : "Copy link"}<span className="sr-only"> for {i.email}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Dialog>
  );
}

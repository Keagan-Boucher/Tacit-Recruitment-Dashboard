import { sendPasswordResetEmail } from "firebase/auth";
import type { ComponentProps, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { InvitePreview } from "@tacit/shared";
import { Logo } from "../../app/Logo";
import { devParam } from "../../app/dev";
import { Button, buttonClass, FieldError, Icon, Input, Skeleton } from "../../components";
import { useAuth, useSignIn } from "../../features/auth";
import { fmtDate, inviteView, joinProblem, PASSWORD_MIN, RECRUITER, RECRUITER_FIRST, validateJoin, type InviteView, type JoinErrors } from "../../features/portal/company";
import { fetchInvitePreview, joinCompany } from "../../features/portal/companyData";
import { auth } from "../../lib/firebase";
import styles from "./CompanySignIn.module.css";

type Note = { tone: "ok" | "error"; text: string };
type Stage = InviteView | "sign-in" | "loading" | "failed";

// Dev only (?state=): the Figma frame's invitation. Nothing here is sent anywhere.
const FIXTURE: InvitePreview = { companyName: "Vantage Logistics", email: "megan.pillay@vantage.test", expiresAt: "2026-10-30T12:00:00.000Z", status: "open" };

/** The invitation for this link: fetched signed out, or the fixture for a dev `?state=`. */
function useInvite(inviteId: string | undefined, dev: string | null, skip: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<{ key: string; preview: InvitePreview | null; failed: boolean }>();
  const key = `${inviteId}|${attempt}`;
  useEffect(() => {
    if (skip || dev !== null || !inviteId) return;
    let stale = false;
    fetchInvitePreview(inviteId).then(
      (preview) => !stale && setLive({ key, preview, failed: false }),
      () => !stale && setLive({ key, preview: null, failed: true }),
    );
    return () => {
      stale = true;
    };
  }, [inviteId, dev, skip, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (dev !== null) {
    const status: InvitePreview["status"] = dev === "expired" ? "expired" : dev === "used" ? "used" : "open";
    if (dev === "missing") return { stage: "missing" as Stage, preview: null, retry };
    if (dev === "loading") return { stage: "loading" as Stage, preview: null, retry };
    if (dev === "failed") return { stage: "failed" as Stage, preview: null, retry };
    return { stage: status as Stage, preview: { ...FIXTURE, status }, retry };
  }
  if (!inviteId) return { stage: "missing" as Stage, preview: null, retry };
  if (live?.key !== key) return { stage: "loading" as Stage, preview: null, retry };
  if (live.failed) return { stage: "failed" as Stage, preview: null, retry };
  return { stage: inviteView(live.preview), preview: live.preview, retry };
}

export default function CompanySignIn() {
  const { pathname, search } = useLocation();
  const { inviteId } = useParams();
  const dev = devParam(search, "state");
  const signingIn = dev !== null ? dev === "sign-in" || dev === "error" : pathname.endsWith("/login");
  const invite = useInvite(inviteId, dev, signingIn);
  const stage: Stage = signingIn ? "sign-in" : invite.stage;
  const preview = invite.preview;
  const heading = useRef<HTMLHeadingElement>(null);

  // The step changed (sign in, join, expired…): move focus to the new heading so it is announced.
  useEffect(() => heading.current?.focus({ preventScroll: true }), [stage]);

  const title: Record<Stage, string> = {
    "sign-in": "Sign in",
    loading: "Checking your invitation.",
    failed: "We couldn’t check your invitation.",
    open: `Join ${preview?.companyName || "Tacit"}`,
    expired: "This invitation has expired.",
    used: "This invitation has already been used.",
    missing: "We can’t find this invitation.",
  };
  const lead: Record<Stage, string> = {
    "sign-in": "Your shortlists, briefs and roles.",
    loading: "",
    failed: "Nothing was lost. Check your connection, then try again.",
    open: `${RECRUITER.name} at ${RECRUITER.org} invited you to send briefs and review shortlists.`,
    expired: `Ask ${RECRUITER_FIRST} for a new one.`,
    used: "Sign in with the account you made from it.",
    missing: `Check the link in your email, or ask ${RECRUITER_FIRST} to send it again.`,
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <Logo size={44} reversed />
          <span className={`t-figure ${styles.brandName}`}>Tacit</span>
          <span className="t-body-m">for companies</span>
        </div>
        <p className={`t-display-xl ${styles.pitch}`}>Shortlists from people your recruiter has already met.</p>
        <p className="t-body-s">Your recruiter shortlists. You decide who to meet.</p>
      </section>

      <div className={styles.side}>
        <div className={styles.form}>
          <div className={styles.heading}>
            <h1 ref={heading} tabIndex={-1} className="t-headline">
              {title[stage]}
            </h1>
            {lead[stage] && <p className={`t-body-m-para ${styles.lead}`}>{lead[stage]}</p>}
          </div>
          {stage === "sign-in" && <SignInForm key="in" seeded={dev !== null} failed={dev === "error"} />}
          {stage === "open" && preview && <JoinForm key={preview.email} preview={preview} inviteId={inviteId ?? ""} seeded={dev !== null} />}
          {stage === "loading" && <Placeholder />}
          {stage === "failed" && <Button icon="bx-refresh" className={styles.submit} onClick={invite.retry}>Try again</Button>}
          {(stage === "expired" || stage === "missing") && (
            <p className={`t-body-m ${styles.linkLine}`}>
              Already have an account?{" "}
              <Link className={`t-body-m-strong ${styles.link}`} to="/company/login">
                Sign in
              </Link>
            </p>
          )}
          {stage === "used" && (
            <Link to="/company/login" className={`${buttonClass("primary", true, "lg")} ${styles.submit}`}>
              Sign in
              <Icon name="bx-chevron-right" />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

/** The join form's shape while the invitation loads. */
function Placeholder() {
  return (
    <div className={styles.fields} aria-hidden="true">
      <Skeleton height={46} />
      <Skeleton height={46} />
      <Skeleton height={46} />
      <Skeleton height={44} radius="pill" />
    </div>
  );
}

type PasswordFieldProps = { id: string; label: string; hint?: string; hintId?: string } & Omit<ComponentProps<typeof Input>, "label" | "trailing" | "type" | "id">;

function PasswordField({ id, label, hint, hintId, ...rest }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.group}>
      <Input
        {...rest}
        id={id}
        label={label}
        type={shown ? "text" : "password"}
        // Input's own describedby only points at the error; keep the hint linked too.
        aria-describedby={[rest.error ? `${id}-error` : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        trailing={
          // Not IconButton: its aria-label would also match getByLabel(/password/i) in the snap script.
          <button type="button" className={styles.eye} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
            <Icon name={shown ? "bx-hide" : "bx-show"} />
            <span className="sr-only">Show password</span>
          </button>
        }
      />
      {hint && (
        <p id={hintId} className={`t-caption ${styles.hint}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function JoinForm({ preview, inviteId, seeded }: { preview: InvitePreview; inviteId: string; seeded: boolean }) {
  const navigate = useNavigate();
  const { user, refreshClaims } = useAuth();
  const [name, setName] = useState(seeded ? "Megan Pillay" : (user?.displayName ?? ""));
  const [password, setPassword] = useState(seeded ? "xxxxxxxxxxxx" : "");
  const [existing, setExisting] = useState(false);
  const [errors, setErrors] = useState<JoinErrors & { form?: string }>({});
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateJoin({ name, password, existing });
    setErrors(found);
    if (Object.keys(found).length) {
      // first invalid control, in page order, once React has flagged it
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    if (seeded) return; // dev fixture: never creates an account
    setPending(true);
    try {
      await joinCompany({ inviteId, email: preview.email, name, password, existing });
      await refreshClaims();
      void navigate("/company", { replace: true });
    } catch (err) {
      const problem = joinProblem((err as { code?: string }).code, preview.email);
      if (problem.existing) setExisting(true);
      setErrors(problem.field === "password" ? { password: problem.text } : { form: problem.text });
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={form} className={styles.fields} onSubmit={(e) => void submit(e)} noValidate>
      <div className={styles.group}>
        <Input className={styles.locked} label="Work email" type="email" autoComplete="username" value={preview.email} readOnly aria-describedby="invite-email-hint" />
        <p id="invite-email-hint" className={`t-caption ${styles.hint}`}>
          From your invitation. Ask {RECRUITER_FIRST} to change it.
        </p>
      </div>
      <Input label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <PasswordField
        id="company-password"
        label={existing ? "Your password" : "Create a password"}
        autoComplete={existing ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        {...(existing ? {} : { hint: `At least ${PASSWORD_MIN} characters.`, hintId: "company-password-hint" })}
      />
      <div aria-live="polite">{errors.form && (existing && !errors.password ? <p className={`t-body-s-para ${styles.note}`}>{errors.form}</p> : <FieldError>{errors.form}</FieldError>)}</div>
      <Button type="submit" variant="primary" fullWidth iconAfter="bx-chevron-right" disabled={pending} aria-busy={pending} className={styles.submit}>
        {existing ? "Sign in and join" : "Join and continue"}
      </Button>
      <p className={`t-caption ${styles.expiry}`}>This invitation expires on {fmtDate(new Date(preview.expiresAt))}.</p>
    </form>
  );
}

function SignInForm({ seeded, failed }: { seeded: boolean; failed: boolean }) {
  const [email, setEmail] = useState(seeded ? "megan.pillay@vantage.test" : "");
  const [password, setPassword] = useState(seeded && !failed ? "xxxxxxxxxxxx" : "");
  const [note, setNote] = useState<Note | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { signIn, pending, error: signInError } = useSignIn();
  const error = signInError ?? (failed ? "That email and password don’t match." : null);

  // Both fields get the red outline; only the password carries the message.
  useEffect(() => {
    if (error) emailRef.current?.setAttribute("aria-invalid", "true");
    else emailRef.current?.removeAttribute("aria-invalid");
  }, [error]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setNote(null);
    void signIn(email, password);
  }

  async function forgot() {
    const to = email.trim();
    if (!to) {
      emailRef.current?.focus();
      setNote({ tone: "error", text: "Enter your email above, then choose Forgot password." });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, to);
      setNote({ tone: "ok", text: `Reset link sent to ${to}. Check your inbox.` });
    } catch {
      setNote({ tone: "error", text: "Couldn’t send a reset link. Check the email address and try again." });
    }
  }

  return (
    <form className={styles.fields} onSubmit={submit} noValidate>
      <Input ref={emailRef} className={error ? styles.flagged : undefined} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField
        id="company-signin-password"
        label="Password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error ?? undefined}
      />
      <Button type="submit" variant="primary" fullWidth iconAfter="bx-chevron-right" disabled={pending} aria-busy={pending} className={styles.submit}>
        Sign in
      </Button>
      <div className={styles.forgotWrap}>
        <button type="button" className={`t-body-m-strong ${styles.link}`} onClick={() => void forgot()}>
          Forgot password?
        </button>
        <p className={`t-caption-para ${note?.tone === "error" ? styles.noteError : styles.note}`} role="status" aria-live="polite">
          {note?.text}
        </p>
      </div>
    </form>
  );
}

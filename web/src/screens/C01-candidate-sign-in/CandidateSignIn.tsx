import { sendPasswordResetEmail } from "firebase/auth";
import type { ComponentProps, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Logo } from "../../app/Logo";
import { devParam } from "../../app/dev";
import { Button, FieldError, Icon, Input } from "../../components";
import { FINISHING, signOut, useAuth, useSignIn } from "../../features/auth";
import { auth } from "../../lib/firebase";
import styles from "./CandidateSignIn.module.css";
import { CV_PATH, FINISH_THEN_CV, PASSWORD_MIN, registerCandidate, signUpCandidate, signUpError, validateSignUp, withNext, type SignUpErrors } from "./signUp";

type Mode = "sign-in" | "sign-up" | "finishing";
type Note = { tone: "ok" | "error"; text: string };

const COPY: Record<Mode, { title: string; lead: string }> = {
  "sign-in": { title: "Sign in", lead: "See what you sent us, and any roles you have been put forward for." },
  "sign-up": { title: "Create your account", lead: "Next you will upload your CV. A recruiter checks it before it joins the pool." },
  finishing: { title: "Finish setting up your account", lead: "Your account exists. We just need your name and your consent to finish." },
};

function modeOf(pathname: string, search: string): Mode {
  const dev = devParam(search, "state");
  if (dev !== null) return dev === "sign-up" ? "sign-up" : dev === "finishing" ? "finishing" : "sign-in";
  if (pathname.endsWith("/signup")) return "sign-up";
  return new URLSearchParams(search).get("finishing") === "1" ? "finishing" : "sign-in";
}

export default function CandidateSignIn() {
  const { pathname, search } = useLocation();
  const mode = modeOf(pathname, search);
  const dev = devParam(search, "state");
  const heading = useRef<HTMLHeadingElement>(null);

  // The step changed (sign in, sign up, finishing): move focus to the new heading so it is announced.
  useEffect(() => heading.current?.focus({ preventScroll: true }), [mode]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <Logo size={44} reversed />
          <span className={`t-figure ${styles.brandName}`}>Tacit</span>
          <span className="t-body-m">for candidates</span>
        </div>
        <p className={`t-display-xl ${styles.pitch}`}>Your next role, through someone who knows your work.</p>
        <p className="t-body-s">Only your recruiter sees what you send. Companies never see your name until you agree to interview.</p>
      </section>

      <div className={styles.side}>
        <div className={styles.form}>
          <div className={styles.heading}>
            <h1 ref={heading} tabIndex={-1} className="t-headline">
              {COPY[mode].title}
            </h1>
            <p className={`t-body-m-para ${styles.lead}`}>{COPY[mode].lead}</p>
          </div>
          {/* key: switching steps starts a fresh form */}
          {mode === "sign-in" && <SignInForm key="in" seeded={dev !== null} failed={dev === "error"} />}
          {mode === "sign-up" && <SignUpForm key="up" seeded={dev !== null} />}
          {mode === "finishing" && <FinishingForm key="fin" seeded={dev !== null} />}
        </div>
      </div>
    </main>
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
          <button type="button" className={styles.eye} onClick={() => setShown((s) => !s)}>
            <Icon name={shown ? "bx-hide" : "bx-show"} />
            <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
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

function SignInForm({ seeded, failed }: { seeded: boolean; failed: boolean }) {
  const [email, setEmail] = useState(seeded ? "lerato.dlamini@mail.test" : "");
  const [password, setPassword] = useState(seeded && !failed ? "xxxxxxxxxxxx" : "");
  const [note, setNote] = useState<Note | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { signIn, pending, error: signInError } = useSignIn();
  const error = signInError ?? (failed ? "That email and password don’t match." : null);
  const next = new URLSearchParams(useLocation().search).get("next");
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();

  // Signed in but no role yet (sign-up stopped half way): this form can't help them, finishing can.
  useEffect(() => {
    if (user && !role && !loading) void navigate(FINISH_THEN_CV, { replace: true });
  }, [user, role, loading, navigate]);

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
      setNote({ tone: "error", text: "Couldn't send a reset link. Check the email address and try again." });
    }
  }

  return (
    <form className={styles.fields} onSubmit={submit} noValidate>
      <Input ref={emailRef} className={error ? styles.flagged : undefined} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField
        id="candidate-password"
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
      <hr className={styles.rule} />
      <p className={`t-body-m ${styles.linkLine}`}>
        New here?{" "}
        <Link className={`t-body-m-strong ${styles.link}`} to={next ? `/candidate/signup?next=${encodeURIComponent(next)}` : "/candidate/signup"}>
          Create an account
        </Link>
      </p>
    </form>
  );
}

function Consent({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div className={styles.group}>
      <label className={styles.consent}>
        <input
          type="checkbox"
          className={styles.check}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "consent-error" : undefined}
        />
        <span className={styles.box} aria-hidden="true">
          <Icon name="bx-check" size={16} />
        </span>
        <span className="t-body-s-para">Tacit Recruitment may store my CV and contact me about roles. I can ask for my details to be deleted at any time.</span>
      </label>
      <div aria-live="polite">{error && <FieldError id="consent-error">{error}</FieldError>}</div>
    </div>
  );
}

function SignUpForm({ seeded }: { seeded: boolean }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { refreshClaims } = useAuth();
  const [name, setName] = useState(seeded ? "Lerato Dlamini" : "");
  const [email, setEmail] = useState(seeded ? "lerato.dlamini@mail.test" : "");
  const [password, setPassword] = useState(seeded ? "xxxxxxxxxxxx" : "");
  const [consent, setConsent] = useState(seeded);
  const [errors, setErrors] = useState<SignUpErrors & { form?: string }>({});
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSignUp({ name, email, password, consent });
    setErrors(found);
    if (Object.keys(found).length) {
      // first invalid control, in page order, once React has flagged it
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setPending(true);
    try {
      if ((await signUpCandidate({ name, email, password, consent })) === "finish") {
        void navigate(FINISHING, { replace: true });
        return;
      }
      // RedirectIfRole follows ?next= as soon as the role claim lands, so set it first instead of racing it with our own navigate.
      void navigate({ search: withNext(search, CV_PATH) }, { replace: true });
      await refreshClaims();
    } catch (err) {
      const { field, text } = signUpError((err as { code?: string }).code);
      setErrors({ [field]: text });
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={form} className={styles.fields} onSubmit={(e) => void submit(e)} noValidate>
      <Input label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <PasswordField
        id="candidate-new-password"
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
        hintId="candidate-password-hint"
      />
      <Consent checked={consent} onChange={setConsent} error={errors.consent} />
      <div aria-live="polite">{errors.form && <FieldError>{errors.form}</FieldError>}</div>
      <Button type="submit" variant="primary" fullWidth iconAfter="bx-chevron-right" disabled={pending} aria-busy={pending} className={styles.submit}>
        Create account
      </Button>
      <p className={`t-body-m ${styles.linkLine}`}>
        Already have an account?{" "}
        <Link className={`t-body-m-strong ${styles.link}`} to="/candidate/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** Signed in, no role yet (sign-up stopped half way): the account and its name are kept, only the role call is retried. */
function FinishingForm({ seeded }: { seeded: boolean }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { user, refreshClaims } = useAuth();
  const [name, setName] = useState(user?.displayName ?? (seeded ? "Lerato Dlamini" : ""));
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<SignUpErrors & { form?: string }>({});
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSignUp({ name, consent });
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await registerCandidate(name);
      void navigate({ search: withNext(search, CV_PATH) }, { replace: true }); // see SignUpForm: the guard does the redirect
      await refreshClaims();
    } catch {
      setErrors({ form: "Couldn't finish setting up your account. Nothing was lost. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.fields} onSubmit={(e) => void submit(e)} noValidate>
      <Input label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Consent checked={consent} onChange={setConsent} error={errors.consent} />
      <div aria-live="polite">{errors.form && <FieldError>{errors.form}</FieldError>}</div>
      <Button type="submit" variant="primary" fullWidth iconAfter="bx-chevron-right" disabled={pending} aria-busy={pending} className={styles.submit}>
        Finish
      </Button>
      <p className={`t-body-m ${styles.linkLine}`}>
        {user?.email ? `Signed in as ${user.email}. ` : ""}
        <button type="button" className={`t-body-m-strong ${styles.link}`} onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
    </form>
  );
}

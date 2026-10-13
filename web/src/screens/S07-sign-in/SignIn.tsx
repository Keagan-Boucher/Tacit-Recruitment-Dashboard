import { sendPasswordResetEmail } from "firebase/auth";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Logo } from "../../app/Logo";
import { devParam, useScreenState } from "../../app/dev";
import { Button, Icon, Input } from "../../components";
import { useSignIn } from "../../features/auth";
import { auth } from "../../lib/firebase";
import styles from "./SignIn.module.css";

type Note = { tone: "ok" | "error"; text: string };

export default function SignIn() {
  const state = useScreenState();
  // Dev only: ?state=<name> fills the fields the way the Figma frames show them.
  const seeded = devParam(useLocation().search, "state") !== null;
  const [email, setEmail] = useState(seeded ? "naledi.mokoena@tacit.test" : "");
  const [password, setPassword] = useState(seeded && state !== "error" ? "xxxxxxxxxxxx" : "");
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const { signIn, pending, error: signInError } = useSignIn();
  const error = signInError ?? (state === "error" ? "That email and password don’t match." : null);

  // Both fields get the red outline; only the password carries the message (Input only flags the field it is given a message for).
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
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <Logo size={44} reversed />
          <span className={`t-figure ${styles.brandName}`}>Tacit</span>
        </div>
        <p className={`t-display-xl ${styles.pitch}`}>Everyone you’ve met, back in the room when the right role arrives.</p>
        <p className="t-body-s">The model recommends. You decide.</p>
      </section>

      <div className={styles.side}>
        <form className={styles.form} onSubmit={submit} noValidate>
          <h1 className="t-headline">Sign in</h1>
          <Input
            ref={emailRef}
            className={error ? styles.flagged : undefined}
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
            trailing={
              // Not IconButton: its aria-label would also match getByLabel(/password/i) in the snap script.
              <button type="button" className={styles.eye} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
                <Icon name={shown ? "bx-hide" : "bx-show"} />
                <span className="sr-only">Show password</span>
              </button>
            }
          />
          <Button type="submit" variant="primary" fullWidth iconAfter="bx-chevron-right" disabled={pending} aria-busy={pending} className={styles.submit}>
            Sign in
          </Button>
          <div className={styles.forgotWrap}>
            <button type="button" className={`t-body-m-strong ${styles.forgot}`} onClick={() => void forgot()}>
              Forgot password?
            </button>
            <p className={`t-caption-para ${note?.tone === "error" ? styles.noteError : styles.note}`} role="status" aria-live="polite">
              {note?.text}
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

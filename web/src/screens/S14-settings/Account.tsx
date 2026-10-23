import { useRef, useState } from "react";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { Button, Card, Input } from "../../components";
import { initials, signOut, useAuth } from "../../features/auth";
import { auth } from "../../lib/firebase";
import type { Notify } from "./notify";
import styles from "./Settings.module.css";

/** S14 Account: who is signed in, the display name (saved on Enter or blur), reset password and sign out. Portal users get this card too. */
export function Account({ onProblem, onToast }: Notify) {
  const { user, role, refreshUser } = useAuth();
  const saved = user?.displayName ?? "";
  const [name, setName] = useState(saved);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const saving = useRef(false); // Enter and the blur that follows it must not save twice

  async function commit() {
    const next = name.trim();
    setName(next);
    if (next === saved) return setError(undefined);
    if (!next) return setError("Add a display name.");
    setError(undefined);
    if (!user || saving.current) return;
    saving.current = true;
    try {
      await updateProfile(user, { displayName: next });
      refreshUser(); // the rail initials and this card read the same user
      onToast("Display name saved");
    } catch {
      onProblem({ title: "Couldn’t save your name.", detail: "Your account wasn’t changed.", retry: () => void commit() });
    } finally {
      saving.current = false;
    }
  }

  async function reset() {
    const email = user?.email;
    if (!email) return;
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, email);
      onToast(`Reset link sent to ${email}`);
    } catch {
      onProblem({ title: "Couldn’t send the reset link.", detail: "Your password wasn’t changed.", retry: () => void reset() });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className={`${styles.card} ${styles.account}`}>
      <h2 className="t-title">Account</h2>
      <div className={styles.who}>
        <span className={`${styles.avatar} t-body-s-bold`} aria-hidden="true">{initials(user)}</span>
        <span className={styles.whoText}>
          <span className={`${styles.name} t-body-m-strong`}>{saved || user?.email}</span>
          <span className={`${styles.sub} t-caption`}>
            {role ? `${role[0]?.toUpperCase()}${role.slice(1)} · ` : ""}
            {user?.email}
          </span>
        </span>
      </div>
      <Input
        label="Display name"
        className={styles.nameField}
        value={name}
        error={error}
        maxLength={60}
        autoComplete="name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === "Enter" && void commit()}
      />
      <div className={styles.buttons}>
        <Button disabled={!user?.email || sending} onClick={() => void reset()}>Reset password</Button>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </div>
    </Card>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { Claims, type AccountRole } from "@tacit/shared";
import { auth, db } from "../../lib/firebase";
import { signInErrorMessage } from "./errors";
import { guardRedirect, HOME } from "./roles";

type AuthState = {
  user: User | null;
  /** True until the user and their claims are known. */
  loading: boolean;
  /** From the ID token's custom claims; null = signed out or no role yet. */
  role: AccountRole | null;
  claims: Claims;
  /** Force-refresh the ID token after the proxy changed a claim (register, invite accept, CV passed). */
  refreshClaims: () => Promise<void>;
};
const AuthContext = createContext<AuthState>({ user: null, loading: true, role: null, claims: {}, refreshClaims: async () => {} });

async function readClaims(user: User, force = false): Promise<Claims> {
  const parsed = Claims.safeParse((await user.getIdTokenResult(force)).claims);
  return parsed.success ? parsed.data : {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; loading: boolean; claims: Claims }>({ user: null, loading: true, claims: {} });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        const claims = user ? await readClaims(user).catch(() => ({})) : {};
        if (auth.currentUser?.uid === user?.uid) setState({ user, loading: false, claims }); // a newer change may have landed meanwhile
      }),
    [],
  );

  const refreshClaims = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const claims = await readClaims(user, true);
    setState((s) => (s.user?.uid === user.uid ? { ...s, claims } : s));
  }, []);

  // The proxy mirrors claim changes to portalUsers/{uid} (e.g. candidateId once the CV is passed): refresh when it changes.
  const uid = state.user?.uid;
  const portal = state.claims.role === "candidate" || state.claims.role === "company";
  useEffect(() => {
    if (!uid || !portal) return;
    let first = true;
    return onSnapshot(
      doc(db, "portalUsers", uid),
      () => (first ? (first = false) : void refreshClaims()),
      () => {}, // no doc or no access yet: claims still refresh on the next explicit refreshClaims()
    );
  }, [uid, portal, refreshClaims]);

  const value = useMemo(() => ({ ...state, role: state.claims.role ?? null, refreshClaims }), [state, refreshClaims]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const signOut = () => fbSignOut(auth);

/** `next` must be an in-app path; anything else falls back to "/". */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Wraps a shell route group. Signed out → that role's login; wrong role → its own home; no role → finish the account. */
export function RequireRole({ role, children }: { role: AccountRole | AccountRole[]; children: ReactNode }) {
  const { user, loading, role: have } = useAuth();
  const { pathname, search } = useLocation();
  if (loading) return null;
  const to = guardRedirect(role, !!user, have, pathname + search);
  return to ? <Navigate to={to} replace /> : children;
}

/** Wraps portal entry pages (C01, B01): an account that already has a role goes on; signed out or mid-sign-up stays. */
export function RedirectIfRole({ children }: { children: ReactNode }) {
  const { loading, role } = useAuth();
  const { search } = useLocation();
  if (loading) return null;
  const next = new URLSearchParams(search).get("next");
  if (role) return <Navigate to={next ? safeNext(next) : HOME[role]} replace />;
  return children;
}

/** Wraps /login: a signed-in user goes to `next` or "/". */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { search } = useLocation();
  if (loading) return null;
  if (user) return <Navigate to={safeNext(new URLSearchParams(search).get("next"))} replace />;
  return children;
}

/** `error` is a plain sentence ready to show; null until a sign-in fails. */
export function useSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async (email: string, password: string) => {
    setPending(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(signInErrorMessage((e as { code?: string }).code));
    } finally {
      setPending(false);
    }
  }, []);
  return { signIn, pending, error };
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { signInErrorMessage } from "./errors";

type AuthState = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const signOut = () => fbSignOut(auth);

/** `next` must be an in-app path; anything else falls back to "/". */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Wraps the shell route. Renders nothing while auth resolves. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname, search } = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
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

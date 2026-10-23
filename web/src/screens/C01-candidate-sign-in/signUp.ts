import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import type { RegisterRequest, RegisterResponse } from "@tacit/shared";
import { api, ApiError } from "../../lib/api";
import { auth } from "../../lib/firebase";

export const PASSWORD_MIN = 10;

export type SignUpForm = { name: string; email: string; password: string; consent: boolean };
export type SignUpErrors = Partial<Record<keyof SignUpForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks only the fields it is given: sign-up passes all four, "finishing" passes name and consent. */
export function validateSignUp(f: Partial<SignUpForm>): SignUpErrors {
  const e: SignUpErrors = {};
  if (f.name !== undefined && !f.name.trim()) e.name = "Enter your full name.";
  if (f.email !== undefined && !EMAIL.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (f.password !== undefined && f.password.length < PASSWORD_MIN) e.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (f.consent !== undefined && !f.consent) e.consent = "Tick this box to continue. We can only store your CV with your consent.";
  return e;
}

export const registerBody = (name: string): RegisterRequest => ({ displayName: name.trim(), consent: true });

/** Creates the candidate role. An account that is already a candidate counts as done. */
export async function registerCandidate(name: string): Promise<void> {
  try {
    await api<RegisterResponse>("/api/portal/register", registerBody(name));
  } catch (e) {
    if (!(e instanceof ApiError && e.code === "already_registered")) throw e;
  }
}

/**
 * Firebase account, then the display name, then the role. "finish" = the account exists but the role call failed:
 * the caller sends them to the finishing page, which retries only the role. Account errors throw.
 */
export async function signUpCandidate(f: SignUpForm): Promise<"ok" | "finish"> {
  const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.password);
  await updateProfile(cred.user, { displayName: f.name.trim() }).catch(() => {});
  try {
    await registerCandidate(f.name);
    return "ok";
  } catch {
    return "finish";
  }
}

/** Which field a sign-up failure belongs to, and the plain sentence for it. */
export function signUpError(code: string | undefined): { field: "email" | "password" | "form"; text: string } {
  if (code === "auth/email-already-in-use") return { field: "email", text: "That email already has an account. Sign in instead." };
  if (code === "auth/invalid-email") return { field: "email", text: "Enter a valid email address." };
  if (code === "auth/weak-password") return { field: "password", text: `Use at least ${PASSWORD_MIN} characters.` };
  if (code === "auth/network-request-failed") return { field: "form", text: "Couldn't reach the server. Check your connection and try again." };
  if (code === "auth/too-many-requests") return { field: "form", text: "Too many attempts. Wait a few minutes and try again." };
  return { field: "form", text: "Couldn't create your account. Try again in a moment." };
}

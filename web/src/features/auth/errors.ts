/** Recruiter-facing sentence for a Firebase Auth error code. */
export function signInErrorMessage(code: string | undefined): string {
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "Couldn't reach the server. Check your connection and try again.";
  if (code && /^auth\/(invalid-credential|invalid-email|user-not-found|wrong-password|user-disabled|missing-password)$/.test(code))
    return "That email and password don't match. Check them and try again.";
  return "Couldn't sign in. Try again in a moment.";
}

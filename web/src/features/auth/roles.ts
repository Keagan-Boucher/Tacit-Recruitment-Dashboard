import type { AccountRole } from "@tacit/shared";

// Where each role lives. Guards are for the user's sake only: the rules and the proxy enforce.
export const HOME: Record<AccountRole, string> = { recruiter: "/", candidate: "/candidate", company: "/company" };
export const LOGIN: Record<AccountRole, string> = { recruiter: "/login", candidate: "/candidate/login", company: "/company/login" };
/** Signed in but no role claim yet (sign-up or invite not finished): C01 shows "finishing your account". */
export const FINISHING = "/candidate/login?finishing=1";

/** Where a route for `want` sends this visitor, or null to render it. `here` = path + search, kept as ?next=. */
export function guardRedirect(want: AccountRole | AccountRole[], signedIn: boolean, role: AccountRole | null, here: string): string | null {
  const roles = [want].flat();
  if (!signedIn) return `${LOGIN[roles[0]!]}?next=${encodeURIComponent(here)}`;
  if (!role) return FINISHING;
  return roles.includes(role) ? null : HOME[role];
}

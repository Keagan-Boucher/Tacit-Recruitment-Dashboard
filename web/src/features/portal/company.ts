import type { InvitePreview, PortalUser, ShortlistEntry, Submission } from "@tacit/shared";
import { RECRUITER, RECRUITER_FIRST, RECRUITER_INITIALS } from "./recruiter";
export { RECRUITER, RECRUITER_FIRST, RECRUITER_INITIALS };

// Pure helpers for B01 / B02. Everything here reads only what a company may read: its own briefs (submissions where
// submittedBy == uid), its own shortlistEntries and its portal user. A person's name exists only on an entry with `identity`.

export type WithId<T> = T & { id: string };
export type Sub = WithId<Submission>;
export type BriefSub = Sub & { kind: "brief" };
export type Entry = WithId<ShortlistEntry>;
export type CompanyPortal = { portalUser: WithId<PortalUser> | null; submissions: Sub[]; entries: Entry[] };


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "30 Oct 2026". */
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** "22 Oct". */
export const fmtDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const t = (d: Date | undefined) => d?.getTime() ?? 0;
const newest = <T,>(pick: (x: T) => Date | undefined) => (a: T, b: T) => t(pick(b)) - t(pick(a));

// ---- B01: the invite ---------------------------------------------------------------------------------

export type InviteView = "open" | "used" | "expired" | "missing";

/** Which B01 state an invite preview calls for. `null` = the server said there is no such invite. */
export function inviteView(preview: Pick<InvitePreview, "status" | "expiresAt"> | null, now = new Date()): InviteView {
  if (!preview) return "missing";
  if (preview.status !== "open") return preview.status;
  const expires = Date.parse(preview.expiresAt);
  return Number.isNaN(expires) || expires <= now.getTime() ? "expired" : "open";
}

export const PASSWORD_MIN = 10;
export type JoinForm = { name: string; password: string; existing: boolean };
export type JoinErrors = Partial<Record<"name" | "password", string>>;

/** A new account needs 10+ characters; someone signing in to an account they already have only needs to type it. */
export function validateJoin(f: JoinForm): JoinErrors {
  const e: JoinErrors = {};
  if (!f.name.trim()) e.name = "Enter your name.";
  if (f.existing ? !f.password : f.password.length < PASSWORD_MIN) e.password = f.existing ? "Enter your password." : `Use at least ${PASSWORD_MIN} characters.`;
  return e;
}

export type JoinProblem = { field: "password" | "form"; text: string; existing?: boolean };

/** A failed join as a plain sentence. `code` is a Firebase auth code or a proxy ApiErrorBody code. */
export function joinProblem(code: string | undefined, invitedEmail: string): JoinProblem {
  switch (code) {
    case "auth/email-already-in-use":
      return { field: "form", existing: true, text: "That email already has a Tacit account. Enter its password to join with it." };
    case "auth/weak-password":
      return { field: "password", text: `Use at least ${PASSWORD_MIN} characters.` };
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return { field: "password", text: "That password doesn’t match this account." };
    case "auth/too-many-requests":
    case "rate_limited":
      return { field: "form", text: "Too many attempts. Wait a few minutes and try again." };
    case "auth/network-request-failed":
      return { field: "form", text: "Couldn’t reach the server. Check your connection and try again." };
    case "invite_used":
      return { field: "form", text: "This invitation has already been used. Sign in instead." };
    case "invite_expired":
      return { field: "form", text: `This invitation has expired. Ask ${RECRUITER_FIRST} for a new one.` };
    case "email_mismatch":
      return { field: "form", text: `This invitation is for ${invitedEmail}. Sign out of the other account and try again.` };
    case "already_registered":
    case "forbidden":
      return { field: "form", text: "This account already has a role in Tacit. Sign in instead." };
    default:
      return { field: "form", text: "Couldn’t finish joining. Nothing was lost. Try again in a moment." };
  }
}

// ---- B02: shortlists, briefs and roles -----------------------------------------------------------------

export type Tone = "for" | "against" | "neutral";

const groupByRole = (entries: readonly Entry[]) => {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) groups.set(e.roleId, [...(groups.get(e.roleId) ?? []), e]);
  return groups;
};
const lastShared = (g: readonly Entry[]) => Math.max(...g.map((e) => t(e.sharedAt)));
const briefsOf = (subs: readonly Sub[]): BriefSub[] => subs.filter((s): s is BriefSub => s.kind === "brief");

const STATUS_ORDER = { shortlisted: 0, interviewing: 1, hired: 2, "not-progressing": 3 } as const;
const STATUS_WORD = { shortlisted: "shortlisted", interviewing: "interviewing", hired: "hired", "not-progressing": "not progressing" } as const;

export type HeroPerson = { id: string; who: string; line: string };
export type Hero =
  | { kind: "empty" }
  | { kind: "waiting" }
  | { kind: "shortlist"; roleId: string; title: string; count: number; readyAt: Date; people: HeroPerson[] };

/** The first three people of a role: undecided first. Anonymous = "Candidate B" and headline, years, place; named (interviewing or hired) = name and headline. */
export function heroPeople(group: readonly Entry[]): HeroPerson[] {
  return [...group]
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.label.localeCompare(b.label))
    .filter((e) => e.status !== "not-progressing")
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      // The name only when the rules gave it to us: no identity, no name.
      who: e.identity?.fullName ?? e.label,
      line: e.identity
        ? `${e.headline} · ${STATUS_WORD[e.status]}`
        : [e.headline, `${e.years} ${e.years === 1 ? "year" : "years"}`, e.facts.location].filter(Boolean).join(" · "),
    }));
}

/** The newest shortlist ready for them; with none, "send your first brief" (or "nothing yet" once a brief is in). */
export function heroFor(entries: readonly Entry[], subs: readonly Sub[]): Hero {
  const groups = [...groupByRole(entries).values()].sort((a, b) => lastShared(b) - lastShared(a));
  const group = groups[0];
  if (!group) return briefsOf(subs).length ? { kind: "waiting" } : { kind: "empty" };
  return { kind: "shortlist", roleId: group[0]!.roleId, title: group[0]!.roleTitle, count: group.length, readyAt: new Date(lastShared(group)), people: heroPeople(group) };
}

/** The page headline: the count in the first word is lime in the screen. */
export function headline(hero: Hero, firstName: string): { count?: number; text: string } {
  if (hero.kind === "shortlist") return { count: hero.count, text: ` ${hero.count === 1 ? "person" : "people"} shortlisted for you.` };
  return { text: `Welcome, ${firstName || "there"}.` };
}

export type Row = { id: string; title: string; word: string; tone: Tone; meta: string; quote?: string; roleId?: string };

/** One Open (or Filled) role from its shortlist: "4 shortlisted · 1 interviewing". */
function openRole(group: readonly Entry[], title: string, roleId: string): Row {
  const n = (s: Entry["status"]) => group.filter((e) => e.status === s).length;
  const parts = [`${group.length} shortlisted`, n("interviewing") ? `${n("interviewing")} interviewing` : "", n("hired") ? `${n("hired")} hired` : ""].filter(Boolean);
  return { id: `role-${roleId}`, title, word: n("hired") ? "Filled" : "Open", tone: "for", meta: parts.join(" · "), roleId };
}

/** Your roles: accepted briefs and shortlisted roles as Open, briefs waiting as Under review, briefs refused as Not accepted with the reason quoted. */
export function roleRows(subs: readonly Sub[], entries: readonly Entry[]): Row[] {
  const groups = groupByRole(entries);
  const used = new Set<string>();
  const rows: { rank: number; at: number; row: Row }[] = [];
  for (const b of briefsOf(subs)) {
    if (b.status === "pending") {
      rows.push({ rank: 1, at: t(b.submittedAt), row: { id: b.id, title: b.fields.title, word: "Under review", tone: "neutral", meta: `sent ${fmtDay(b.submittedAt)} · ${RECRUITER_FIRST} is checking it` } });
    } else if (b.status === "not-accepted") {
      rows.push({
        rank: 2,
        at: t(b.reviewedAt ?? b.submittedAt),
        row: { id: b.id, title: b.fields.title, word: "Not accepted", tone: "against", meta: `${RECRUITER_FIRST} · ${fmtDay(b.reviewedAt ?? b.submittedAt)}`, ...(b.reasonText ? { quote: b.reasonText } : {}) },
      });
    } else {
      const group = b.resultId ? groups.get(b.resultId) : undefined;
      if (b.resultId && group) used.add(b.resultId);
      rows.push({ rank: 0, at: group ? lastShared(group) : t(b.reviewedAt ?? b.submittedAt), row: group ? openRole(group, group[0]!.roleTitle, b.resultId!) : { id: b.id, title: b.fields.title, word: "Open", tone: "for", meta: "no shortlist yet" } });
    }
  }
  // Roles the recruiter shortlisted for them without a brief of theirs.
  for (const [roleId, group] of groups) if (!used.has(roleId)) rows.push({ rank: 0, at: lastShared(group), row: openRole(group, group[0]!.roleTitle, roleId) });
  return rows.sort((a, b) => a.rank - b.rank || b.at - a.at).map((r) => r.row);
}

/** Briefs under review: the ones the recruiter has not passed or refused yet, newest first. */
export function briefsInReview(subs: readonly Sub[]): { id: string; title: string; meta: string }[] {
  return briefsOf(subs)
    .filter((b) => b.status === "pending")
    .sort(newest((b) => b.submittedAt))
    .map((b) => ({ id: b.id, title: b.fields.title, meta: `sent ${fmtDay(b.submittedAt)}` }));
}

const hiredAt = (e: Entry) => [...e.statusHistory].reverse().find((h) => h.status === "hired")?.at ?? e.sharedAt;
const startedAt = (e: Entry) => [...e.statusHistory].reverse().find((h) => h.status === "interviewing")?.at;

export type Hired = { count: number; thisYear: number; since?: Date; latest?: Date };

/** Hired through Tacit: a count, not a verdict. */
export function hiredSummary(entries: readonly Entry[], now = new Date()): Hired {
  const dates = entries.filter((e) => e.status === "hired").map(hiredAt).sort((a, b) => a.getTime() - b.getTime());
  const last = dates.at(-1);
  return { count: dates.length, thisYear: dates.filter((d) => d.getFullYear() === now.getFullYear()).length, ...(dates[0] ? { since: dates[0] } : {}), ...(last ? { latest: last } : {}) };
}
export const monthYear = (d: Date) => `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const dayMonth = (d: Date) => `${d.getDate()} ${LONG_MONTHS[d.getMonth()]}`;

export type Meeting = { id: string; name: string; word: "Interviewing" | "Hired"; meta: string; roleId: string };

/** People you are meeting: only entries the company moved to Interviewing or Hired, so only entries with a name. */
export function meetingRows(entries: readonly Entry[]): Meeting[] {
  return entries
    .filter((e) => e.identity && (e.status === "interviewing" || e.status === "hired"))
    .sort(newest((e) => e.statusHistory.at(-1)?.at ?? e.sharedAt))
    .map((e) => {
      const hired = e.status === "hired";
      const time = e.interviewTimes?.[0];
      const when = hired ? `hired ${fmtDay(hiredAt(e))}` : time ? `interview ${time}` : startedAt(e) ? `moved ${fmtDay(startedAt(e)!)}` : "";
      return { id: e.id, name: e.identity!.fullName, word: hired ? "Hired" : "Interviewing", meta: [e.roleTitle, when].filter(Boolean).join(" · "), roleId: e.roleId };
    });
}

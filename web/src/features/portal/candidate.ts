import type { CandidateUpdate, CourseSuggestion, DetailsChangeFields, PortalUser, RoleAnon, Submission, WorkMode } from "@tacit/shared";

// Pure helpers for C02 / C03. Everything here reads only what a candidate may read: their own submissions,
// their own candidateUpdates and their portal user. No company name or id exists in these types.

export type WithId<T> = T & { id: string };
export type Sub = WithId<Submission>;
export type CvSub = Sub & { kind: "cv" };
export type Upd = WithId<CandidateUpdate>;

// shortcut: one recruiter in this MVP; read from a recruiter profile doc when there are several
export const RECRUITER = { name: "Naledi Mokoena", org: "Tacit Recruitment", email: "naledi.mokoena@example.com", phone: "+27 21 555 0142" } as const;
export const RECRUITER_FIRST = RECRUITER.name.split(" ")[0] ?? RECRUITER.name;
export const RECRUITER_INITIALS = RECRUITER.name.split(" ").map((w) => w[0]).join("");

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORK_MODE: Record<WorkMode, string> = { office: "On-site", hybrid: "Hybrid", remote: "Remote" };
export const workModeLabel = (m: WorkMode) => WORK_MODE[m];

/** "3 Oct 2026". */
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** "8 Oct" (year only when it isn't this year); "today" / "yesterday". */
export function dayLabel(d: Date, now: Date): string {
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const t = (d: Date | undefined) => d?.getTime() ?? 0;

const isCv = (s: Sub): s is CvSub => s.kind === "cv";

/** The newest CV they sent, whatever its status. */
export function latestCv(subs: readonly Sub[]): CvSub | undefined {
  return subs.filter(isCv).reduce<CvSub | undefined>((best, s) => (!best || t(s.submittedAt) > t(best.submittedAt) ? s : best), undefined);
}

// ---- profile status ------------------------------------------------------------------------------

export type Tone = "for" | "against" | "neutral" | "quiet";
export type ProfileStatus = { kind: "none" | "pending" | "accepted" | "not-accepted"; word: string; tone: Tone; line: string; body: string };

/** When the first accepted CV was passed: the pool date. */
export function poolSince(subs: readonly Sub[]): Date | undefined {
  const dates = subs.filter((s): s is CvSub => isCv(s) && s.status === "accepted").map((s) => s.reviewedAt ?? s.submittedAt);
  return dates.length ? new Date(Math.min(...dates.map(t))) : undefined;
}

/** The status word is the latest CV's status: pending, accepted, not accepted, or nothing sent. */
export function profileStatus(subs: readonly Sub[]): ProfileStatus {
  const cv = latestCv(subs);
  if (!cv) return { kind: "none", word: "Not sent yet", tone: "quiet", line: "Nothing sent", body: "Once your CV is accepted, every new role is matched against it." };
  if (cv.status === "pending")
    return { kind: "pending", word: "Under review", tone: "neutral", line: `Sent ${fmtDate(cv.submittedAt)}`, body: "A recruiter reads every CV before it joins the pool." };
  if (cv.status === "accepted") {
    const since = poolSince(subs) ?? cv.submittedAt;
    return { kind: "accepted", word: "Accepted", tone: "for", line: `In the pool since ${fmtDate(since)} · checked by ${RECRUITER.name}`, body: "Every new role is matched against your details." };
  }
  return {
    kind: "not-accepted",
    word: "Not accepted",
    tone: "against",
    line: `Checked ${fmtDate(cv.reviewedAt ?? cv.submittedAt)} · ${RECRUITER.name}`,
    body: `Fix what ${RECRUITER_FIRST} asked for and send it again. It goes straight back to review.`,
  };
}

// ---- hero ------------------------------------------------------------------------------------------

export type Step = { label: string; state: "done" | "current" | "todo"; date?: string };
export type Hero =
  | { kind: "empty" }
  | { kind: "under-review"; steps: Step[] }
  | { kind: "not-accepted"; reason: string; by: string; at: Date }
  | { kind: "role"; role: RoleAnon; steps: Step[] }
  | { kind: "pool"; since: Date; shortlisted: number };

const ROLE_STEP = { shortlisted: 1, interviewing: 2, placed: 3 } as const;
const isLive = (u: Upd): u is Upd & { status: keyof typeof ROLE_STEP } => u.status !== "not-taken-forward";

/** Sent → Shortlisted → Interviewing → Outcome, with the step the latest update is on marked current. */
export function roleSteps(status: keyof typeof ROLE_STEP, at: Date): Step[] {
  const cur = ROLE_STEP[status];
  return ["Sent to the company", "Shortlisted", "Interviewing", status === "placed" ? "Placed" : "Outcome"].map((label, i) => ({
    label,
    state: i < cur ? "done" : i === cur ? "current" : "todo",
    ...(i === cur ? { date: `${at.getDate()} ${MONTHS[at.getMonth()]}` } : {}),
  }));
}

/** Where things stand: the CV's status first (pending, not accepted), then the newest role still open (or placed), else the pool. */
export function heroFor(subs: readonly Sub[], updates: readonly Upd[]): Hero {
  const cv = latestCv(subs);
  if (!cv) return { kind: "empty" };
  if (cv.status === "pending")
    return {
      kind: "under-review",
      steps: [
        { label: "Sent", state: "done", date: `${cv.submittedAt.getDate()} ${MONTHS[cv.submittedAt.getMonth()]}` },
        { label: "Under review", state: "current", date: "Now" },
        { label: "In the pool", state: "todo" },
      ],
    };
  if (cv.status === "not-accepted")
    return { kind: "not-accepted", reason: cv.reasonText ?? "", by: RECRUITER.name, at: cv.reviewedAt ?? cv.submittedAt };
  const live = updatesNewestFirst(updates).find(isLive);
  if (live) return { kind: "role", role: live.roleAnon, steps: roleSteps(live.status, live.at) };
  return { kind: "pool", since: poolSince(subs) ?? cv.submittedAt, shortlisted: updates.length };
}

export const updatesNewestFirst = (updates: readonly Upd[]) => [...updates].sort((a, b) => t(b.at) - t(a.at));

/** Role updates in the last 7 days. */
export const updatesThisWeek = (updates: readonly Upd[], now: Date) => updates.filter((u) => t(u.at) > now.getTime() - 7 * DAY).length;

export function headline(hero: Hero, thisWeek: number, firstName: string): { count?: number; text: string } {
  if (hero.kind === "empty") return { text: `Welcome, ${firstName}.` };
  if (hero.kind === "under-review") return { text: "Your CV is with a recruiter." };
  if (hero.kind === "not-accepted") return { text: "Your CV needs another look." };
  return thisWeek ? { count: thisWeek, text: ` update${thisWeek === 1 ? "" : "s"} this week.` } : { text: "No new updates this week." };
}

// ---- role updates ----------------------------------------------------------------------------------

export type RoleUpdateRow = { id: string; title: string; word: string; tone: Tone; meta: string };

const UPDATE_WORD: Record<Upd["status"], { word: string; tone: Tone; when: (d: string) => string }> = {
  shortlisted: { word: "Shortlisted", tone: "for", when: (d) => d },
  interviewing: { word: "Interviewing", tone: "for", when: (d) => `since ${d}` },
  placed: { word: "Placed", tone: "for", when: (d) => `placed ${d}` },
  "not-taken-forward": { word: "Not taken forward", tone: "quiet", when: (d) => `closed ${d}` },
};

export function roleUpdateRows(updates: readonly Upd[], now: Date): RoleUpdateRow[] {
  return updatesNewestFirst(updates).map((u) => {
    const w = UPDATE_WORD[u.status];
    return { id: u.id, title: u.roleAnon.title, word: w.word, tone: w.tone, meta: [u.roleAnon.sector, u.roleAnon.region, w.when(dayLabel(u.at, now))].filter(Boolean).join(" · ") };
  });
}

// ---- keep your details fresh ------------------------------------------------------------------------

export type Fresh = { salary?: string; availability?: string; workMode?: WorkMode; at: Date; viaCv: boolean };

const sentAt = (s: Sub) => s.reviewedAt ?? s.submittedAt;
const perishables = (s: Sub): Pick<Fresh, "salary" | "availability" | "workMode"> =>
  s.kind === "cv"
    ? { salary: s.fields.salaryExpectation, workMode: s.fields.workMode }
    : s.kind === "details-change"
      ? { salary: s.fields.salary, availability: s.fields.availability, workMode: s.fields.workMode }
      : {};

/**
 * What the pool holds: the newest accepted CV or details change, field by field (a details change that only moved the
 * salary keeps the CV's work mode). Before anything is accepted, the CV as sent.
 */
export function freshDetails(subs: readonly Sub[]): Fresh | undefined {
  const accepted = subs.filter((s) => s.status === "accepted" && (s.kind === "cv" || s.kind === "details-change")).sort((a, b) => t(sentAt(b)) - t(sentAt(a)));
  const first = accepted[0];
  if (first) {
    const merged: Fresh = { at: sentAt(first), viaCv: false };
    for (const s of accepted) {
      const p = perishables(s);
      merged.salary ??= p.salary || undefined;
      merged.availability ??= p.availability || undefined;
      merged.workMode ??= p.workMode;
    }
    return merged;
  }
  const cv = latestCv(subs);
  return cv ? { ...perishables(cv), at: cv.submittedAt, viaCv: true } : undefined;
}

/** "R60k a month · 1 month notice · Hybrid". */
export function freshLine(f: Pick<Fresh, "salary" | "availability" | "workMode">): string {
  return [f.salary, f.availability, f.workMode && workModeLabel(f.workMode)].filter(Boolean).join(" · ") || "No details yet";
}

export const freshCaption = (f: Fresh) => (f.viaCv ? `Sent with your CV on ${fmtDate(f.at)}` : `Last confirmed ${fmtDate(f.at)}`);

/** A details change the recruiter hasn't passed yet. */
export const pendingDetails = (subs: readonly Sub[]): Date | undefined =>
  subs.filter((s) => s.kind === "details-change" && s.status === "pending").map((s) => s.submittedAt).sort((a, b) => t(b) - t(a))[0];

/** The body of a details-change: trimmed, blanks dropped. Undefined when nothing is left (the schema needs one detail). */
export function detailsBody(f: { salary?: string; availability?: string; workMode?: WorkMode | "" }): DetailsChangeFields | undefined {
  const salary = f.salary?.trim();
  const availability = f.availability?.trim();
  const out: DetailsChangeFields = { ...(salary ? { salary } : {}), ...(availability ? { availability } : {}), ...(f.workMode ? { workMode: f.workMode } : {}) };
  return Object.keys(out).length ? out : undefined;
}

// ---- courses ---------------------------------------------------------------------------------------

/** Approved, or snoozed and the snooze is over. Dismissed and draft never show. */
export function showCourses(s: Pick<CourseSuggestion, "status" | "snoozedUntil" | "items"> | null | undefined, now: Date): boolean {
  if (!s || !s.items.length) return false;
  if (s.status === "approved") return true;
  return s.status === "snoozed" && (!s.snoozedUntil || s.snoozedUntil.getTime() <= now.getTime());
}
export const snoozeUntil = (now: Date) => new Date(now.getTime() + 30 * DAY);

// ---- what you sent / C03 ---------------------------------------------------------------------------

/** "lerato-dlamini-cv.pdf" from "users/uid/cvs/1760000000000-lerato-dlamini-cv.pdf". */
export const cvFileName = (fileRef: string) => (fileRef.split("/").pop() ?? fileRef).replace(/^\d{8,}-/, "");

type Job = CvSub["fields"]["history"][number];
const job = (j: Job) => [j.title, j.company, j.from ? `${j.from} to ${j.to ?? "now"}` : undefined].filter(Boolean).join(", ");

/** "SAP FI analyst at Mzansi Freight, 2022 to now · Johannesburg". */
export function sentSummary(cv: CvSub): string {
  const f = cv.fields;
  const now = f.history[0];
  const where = now ? `${now.title}${now.company ? ` at ${now.company}` : ""}${now.from ? `, ${now.from} to ${now.to ?? "now"}` : ""}` : f.currentRole || f.headline;
  return [where, f.location].filter(Boolean).join(" · ");
}

export type DetailRow = { label: string; text?: string[]; tags?: string[] };

/** The candidate's details as they sent them. Perishable facts come from the newest accepted change, else the CV itself. */
export function detailRows(cv: CvSub, email: string | undefined, fresh: Fresh | undefined): DetailRow[] {
  const f = cv.fields;
  const [now, ...before] = f.history;
  const rows: (DetailRow | false | undefined | "")[] = [
    { label: "Full name", text: [f.fullName] },
    email && { label: "Email", text: [email] },
    f.phone && { label: "Phone", text: [f.phone] },
    f.location && { label: "Based in", text: [f.location] },
    now && { label: "Now", text: [job(now)] },
    before.length > 0 && { label: "Before", text: before.map(job) },
    f.education.length > 0 && { label: "Education", text: f.education },
    f.skills.length > 0 && { label: "Skills", tags: f.skills },
    fresh?.workMode && { label: "Work mode", text: [workModeLabel(fresh.workMode)] },
    fresh?.availability && { label: "Notice period", text: [fresh.availability] },
    fresh?.salary && { label: "Salary expectation", text: [fresh.salary] },
  ];
  return rows.filter((r): r is DetailRow => !!r);
}

export type HistoryEvent = { id: string; icon: string; title: string; meta: string; at: Date };

const UPDATE_EVENT: Record<Upd["status"], (title: string) => string> = {
  shortlisted: (r) => `Put forward for ${r}`,
  interviewing: (r) => `Interviewing for ${r}`,
  placed: (r) => `Placed as ${r}`,
  "not-taken-forward": (r) => `Not taken forward for ${r}`,
};

/** Account created, CV sent, accepted, details confirmed, role updates: newest first. Only their own records. */
export function historyEvents(createdAt: Date | undefined, subs: readonly Sub[], updates: readonly Upd[]): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  if (createdAt) out.push({ id: "created", icon: "bx-time-five", title: "Account created", meta: fmtDate(createdAt), at: createdAt });
  for (const s of subs) {
    if (s.kind === "brief") continue;
    const cv = s.kind === "cv";
    out.push({ id: `${s.id}:sent`, icon: "bx-upload", title: cv ? "CV sent" : "Details sent for review", meta: fmtDate(s.submittedAt), at: s.submittedAt });
    const reviewed = s.reviewedAt;
    if (!reviewed) continue;
    if (s.status === "accepted")
      out.push({ id: `${s.id}:ok`, icon: "bx-check", title: cv ? "Accepted into the pool" : "Details confirmed", meta: `${fmtDate(reviewed)} · ${RECRUITER.name}`, at: reviewed });
    else if (s.status === "not-accepted")
      out.push({ id: `${s.id}:no`, icon: "bx-x", title: cv ? "CV not accepted" : "Details not accepted", meta: `${fmtDate(reviewed)} · ${RECRUITER.name}`, at: reviewed });
  }
  for (const u of updates) out.push({ id: u.id, icon: "bx-briefcase", title: UPDATE_EVENT[u.status](u.roleAnon.title), meta: fmtDate(u.at), at: u.at });
  return out.sort((a, b) => t(b.at) - t(a.at));
}

/** Everything the candidate screens read: the four portal reads, nothing else. */
export type CandidatePortal = {
  portalUser: WithId<PortalUser> | null;
  submissions: Sub[];
  updates: Upd[];
  /** Null when there is none to show (no claim, not approved, or the rules refused the read). */
  suggestion: WithId<CourseSuggestion> | null;
};

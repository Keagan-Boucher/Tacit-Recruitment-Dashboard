import type { Attribute, Candidate, Company, InterviewNote, Match, Override, Role } from "@tacit/shared";
import { isForgotten, monthsSince, staleness } from "@tacit/shared";
import type { WithId } from "../../lib/data";

// Pure view-model for the dashboard: everything the seven widgets show, from the recruiter's own docs.
// Whole collections in, small lists out (one recruiter, small data).

type R<T> = WithId<T>;
export type Snapshot = {
  candidates: R<Candidate>[];
  roles: R<Role>[];
  companies: R<Company>[];
  matches: R<Match>[];
  overrides: R<Override>[];
  notes: R<InterviewNote>[];
  attributes: R<Attribute>[];
};
export const EMPTY: Snapshot = { candidates: [], roles: [], companies: [], matches: [], overrides: [], notes: [], attributes: [] };

export type PlayRow = {
  role: R<Role>;
  company: string;
  suggested: number;
  waiting: number;
  shortlisted: number;
  rejected: number;
  stale: number;
};

export type Board = ReturnType<typeof buildBoard>;

const MONTHS = 12;
const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

export function buildBoard(s: Snapshot, now: Date) {
  const cand = new Map(s.candidates.map((c) => [c.id, c]));
  const company = (r: Role) => s.companies.find((c) => c.id === r.companyId)?.name ?? "";
  const open = s.roles.filter((r) => r.status === "open");
  const roleById = new Map(open.map((r) => [r.id, r]));

  // The recruiter's standing decision per match (a reversed one no longer counts; the newest wins).
  const decision = new Map<string, Override["decision"]>();
  for (const o of [...s.overrides].sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime())) {
    if (!o.reversedAt) decision.set(o.matchId, o.decision);
  }
  const live = s.matches.filter((m) => roleById.has(m.roleId) && cand.has(m.candidateId));
  const undecided = live.filter((m) => !decision.has(m.id));

  const play: PlayRow[] = open
    .map((role) => {
      const ms = live.filter((m) => m.roleId === role.id);
      const n = (d: Override["decision"]) => ms.filter((m) => decision.get(m.id) === d).length;
      const shortlisted = n("shortlist");
      const rejected = n("reject");
      return { role, company: company(role), suggested: ms.length, waiting: ms.length - shortlisted - rejected, shortlisted, rejected, stale: ms.filter((m) => m.staleness === "stale").length };
    })
    .sort((a, b) => b.waiting - a.waiting || b.suggested - a.suggested);
  const shortlist = play.filter((p) => p.suggested > 0 && p.shortlisted === 0 && p.waiting > 0);

  // Someone you forgot: the best-ranked undecided suggestion for a person not opened in months.
  const pick = undecided
    .filter((m) => isForgotten(cand.get(m.candidateId)!.lastOpenedAt, now)) // live: opening the profile clears it
    .sort((a, b) => a.rank - b.rank || b.evidenceAgeDays - a.evidenceAgeDays)[0];
  const forgotten = pick && {
    match: pick,
    candidate: cand.get(pick.candidateId)!,
    role: roleById.get(pick.roleId)!,
    company: company(roleById.get(pick.roleId)!),
    nFor: pick.reasonsFor.length,
    nAgainst: pick.reasonsAgainst.length,
    reasonFor: pick.reasonsFor[0]?.text,
    reasonAgainst: pick.reasonsAgainst[0]?.text,
    ask: pick.questionsToAsk[0],
    months: monthsSince(new Date(now.getTime() - pick.evidenceAgeDays * 86_400_000), now),
    notOpened: monthsSince(cand.get(pick.candidateId)!.lastOpenedAt ?? cand.get(pick.candidateId)!.createdAt, now),
  };

  // Things to confirm: unkept items from the newest note that has any.
  const unkept = s.attributes.filter((a) => !a.confirmedByRecruiter && a.noteId);
  const note = [...s.notes].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()).find((n) => cand.has(n.candidateId) && unkept.some((a) => a.noteId === n.id));
  const confirm = note && { noteId: note.id, count: unkept.filter((a) => a.noteId === note.id).length, candidate: cand.get(note.candidateId)! };

  // People you have met: notes per month, oldest first, the current month last.
  const bars = Array<number>(MONTHS).fill(0);
  const first = new Map<string, Date>();
  for (const n of s.notes) {
    const i = MONTHS - 1 - (monthIndex(now) - monthIndex(n.capturedAt));
    if (i >= 0 && i < MONTHS) bars[i] = (bars[i] ?? 0) + 1;
    const f = first.get(n.candidateId);
    if (!f || n.capturedAt < f) first.set(n.candidateId, n.capturedAt);
  }
  const newThisMonth = [...first.values()].filter((d) => monthIndex(d) === monthIndex(now)).length;

  // Worth a call: the newest confirmed evidence is over a year old.
  const worth = s.candidates
    .flatMap((c) => {
      const mine = s.attributes.filter((a) => a.candidateId === c.id && a.confirmedByRecruiter).sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
      const at = mine[0]?.observedAt ?? c.lastInterviewAt;
      return at && staleness(at, now) === "stale" ? [{ candidate: c, text: mine[0] && (mine[0].editedValue ?? mine[0].value), months: monthsSince(at, now) }] : [];
    })
    .sort((a, b) => b.months - a.months);

  // Also waiting on you: the rest of the undecided suggestions, strongest first.
  const waiting = undecided
    .filter((m) => m.id !== pick?.id)
    .sort((a, b) => a.rank - b.rank || b.generatedAt.getTime() - a.generatedAt.getTime())
    .map((m) => ({ match: m, candidate: cand.get(m.candidateId)!, role: roleById.get(m.roleId)! }));

  return {
    total: shortlist.length + (confirm?.count ?? 0) + worth.length,
    hasPeople: s.candidates.length > 0,
    forgotten,
    shortlist,
    confirm,
    people: { count: s.candidates.length, newThisMonth, bars },
    play,
    worth,
    waiting,
  };
}

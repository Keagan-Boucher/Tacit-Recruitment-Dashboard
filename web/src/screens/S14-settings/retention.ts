import type { Candidate } from "@tacit/shared";

type Seen = Pick<Candidate, "createdAt" | "lastInterviewAt" | "lastOpenedAt">;

/** Last contact = the latest of lastInterviewAt, createdAt and lastOpenedAt (opening a profile counts: S03 stamps it). */
export function lastSeen(c: Seen): Date | undefined {
  const times = [c.lastInterviewAt, c.createdAt, c.lastOpenedAt].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : undefined;
}

/** Whole calendar months from `from` to `now`. */
export function monthsBetween(from: Date, now: Date): number {
  const m = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth();
  return now.getDate() < from.getDate() ? m - 1 : m;
}

/** Everyone whose last contact is `months` or more ago, oldest first. Nobody without a usable date. This only lists; it never deletes. */
export function pastRetention<T extends Seen & { id: string }>(people: T[], months: number, now: Date): { person: T; seen: Date; ago: number }[] {
  return people
    .flatMap((person) => {
      const seen = lastSeen(person);
      return seen ? [{ person, seen, ago: monthsBetween(seen, now) }] : [];
    })
    .filter((r) => r.ago >= months)
    .sort((a, b) => a.seen.getTime() - b.seen.getTime());
}

import { CourseItem, monthsSince } from "@tacit/shared";
import type { CourseSuggestion, Placement } from "@tacit/shared";
import { fmtDate } from "./profile";

export const WAIT_MONTHS = 9;

/** Eligible once in the pool 9+ months with no `placed` placement since they joined it. */
export function courseEligible(inPoolSince: Date | undefined, placements: Pick<Placement, "outcome" | "date">[], now: Date) {
  if (!inPoolSince || monthsSince(inPoolSince, now) < WAIT_MONTHS) return false;
  return !placements.some((p) => p.outcome === "placed" && p.date >= inPoolSince);
}

/** The quiet line for a decided suggestion. Never shows `basis`. */
export function statusLine(s: Pick<CourseSuggestion, "status" | "approvedAt" | "snoozedUntil">, first: string) {
  if (s.status === "approved") return `Shown to ${first}${s.approvedAt ? ` on ${fmtDate(s.approvedAt)}` : ""}`;
  if (s.status === "snoozed") return s.snoozedUntil ? `Snoozed until ${fmtDate(s.snoozedUntil)}` : "Snoozed";
  if (s.status === "dismissed") return "Dismissed";
  return null;
}

/** Trimmed items ready for the approve call, or null when one is incomplete. */
export function approvedItems(items: { title: string; why: string; duration: string }[]) {
  const r = CourseItem.array().min(1).max(3).safeParse(items.map((i) => ({ title: i.title.trim(), why: i.why.trim(), duration: i.duration.trim() })));
  return r.success ? r.data : null;
}

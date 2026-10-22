import type { AttributeType, Staleness } from "./schemas.ts";

// Thresholds from data-model.md (tunable; record any change in Decisions).
export const AGEING_MONTHS = 6;
export const STALE_MONTHS = 12;
export const FORGOTTEN_MONTHS = 6;

/** Whole calendar months between `d` and `now` (14 Aug 2025 → 14 Oct 2026 is 14), never negative. */
export const monthsSince = (d: Date, now = new Date()) =>
  Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth() - (now.getDate() < d.getDate() ? 1 : 0));

/** < 6 months fresh, 6–12 ageing, > 12 stale. Ages the evidence, never removes it. */
export function staleness(observedAt: Date, now = new Date()): Staleness {
  const m = monthsSince(observedAt, now);
  return m > STALE_MONTHS ? "stale" : m >= AGEING_MONTHS ? "ageing" : "fresh";
}

/** Facts that go out of date (Keagan, 22 Oct 2026): only these ever show an age. "Current work" is the trajectory type. */
export const PERISHABLE: readonly AttributeType[] = ["salary", "availability", "work-mode", "trajectory"];
export const isPerishable = (type: AttributeType) => PERISHABLE.includes(type);

/** A fact's staleness: perishable facts age; everything else stays fresh and shows only its date. */
export const factStaleness = (type: AttributeType, observedAt: Date, now = new Date()): Staleness =>
  isPerishable(type) ? staleness(observedAt, now) : "fresh";

/** Not opened by the recruiter in over 6 months (or never). */
export const isForgotten = (lastOpenedAt: Date | undefined, now = new Date()) =>
  !lastOpenedAt || monthsSince(lastOpenedAt, now) >= FORGOTTEN_MONTHS;

import type { Staleness } from "./schemas.ts";

// Thresholds from data-model.md (tunable; record any change in Decisions).
const MONTH = 30.4375 * 86_400_000;
export const AGEING_MONTHS = 6;
export const STALE_MONTHS = 12;
export const FORGOTTEN_MONTHS = 6;

/** Whole months between `d` and `now` (never negative). */
export const monthsSince = (d: Date, now = new Date()) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / MONTH));

/** < 6 months fresh, 6–12 ageing, > 12 stale. Ages the evidence, never removes it. */
export function staleness(observedAt: Date, now = new Date()): Staleness {
  const m = monthsSince(observedAt, now);
  return m > STALE_MONTHS ? "stale" : m >= AGEING_MONTHS ? "ageing" : "fresh";
}

/** Not opened by the recruiter in over 6 months (or never). */
export const isForgotten = (lastOpenedAt: Date | undefined, now = new Date()) =>
  !lastOpenedAt || monthsSince(lastOpenedAt, now) >= FORGOTTEN_MONTHS;

import type { Candidate, Match, Role } from "@tacit/shared";
import type { WithId } from "../../lib/data";

// Stub until S06 lands (R-07).
export function OverrideDialog(_: { match: WithId<Match>; role: WithId<Role>; candidate: WithId<Candidate>; onClose: () => void }) {
  return null;
}

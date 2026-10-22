import { staleness } from "@tacit/shared";
import type { Company, Override, Placement, Role } from "@tacit/shared";
import type { WithId } from "../../lib/data";

export type Row = {
  company: WithId<Company>;
  openRoles: number;
  placements: number;
  /** Latest thing that happened with this company; falls back to when it was added. */
  lastContact: Date;
  /** Placement reasons, searchable ("placement" in the search box). */
  placementText: string;
  /** When the newest pay fact (a `placements` company fact) was seen; the only company fact that goes out of date. */
  paySeen?: Date;
};
export type FilterId = "all" | "hiring" | "stale";
export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hiring", label: "Hiring now" },
  { id: "stale", label: "Stale facts" },
];

export function buildRows(companies: WithId<Company>[], roles: Role[], placements: Placement[], overrides: Override[]): Row[] {
  return companies
    .map((company) => {
      const rs = roles.filter((r) => r.companyId === company.id);
      const ps = placements.filter((p) => p.companyId === company.id);
      const pay = (company.facts ?? []).filter((f) => f.source === "placements");
      const dates = [
        company.createdAt,
        ...rs.flatMap((r) => [r.openedAt, r.closedAt]),
        ...ps.map((p) => p.date),
        ...overrides.filter((o) => o.companyId === company.id && !o.reversedAt).map((o) => o.decidedAt),
      ].filter((d): d is Date => !!d);
      return {
        company,
        openRoles: rs.filter((r) => r.status === "open").length,
        placements: ps.filter((p) => p.outcome === "placed").length,
        lastContact: new Date(Math.max(...dates.map((d) => d.getTime()))),
        placementText: ps.map((p) => p.reason).join(" "),
        paySeen: pay.length ? new Date(Math.max(...pay.map((f) => f.observedAt.getTime()))) : undefined,
      };
    })
    .sort((a, b) => b.lastContact.getTime() - a.lastContact.getTime());
}

const filters: Record<FilterId, (r: Row, now: Date) => boolean> = {
  all: () => true,
  hiring: (r) => r.openRoles > 0,
  stale: (r, now) => !!r.paySeen && staleness(r.paySeen, now) === "stale",
};
export const matchesFilter = (r: Row, f: FilterId, now: Date) => filters[f](r, now);

/** Every word of the query must appear in the name, sector or a placement reason. */
export function matchesQuery(r: Row, query: string) {
  const hay = [r.company.name, r.company.sector, r.placementText].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

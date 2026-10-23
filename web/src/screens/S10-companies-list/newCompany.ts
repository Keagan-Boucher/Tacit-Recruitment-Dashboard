import { Company } from "@tacit/shared";

type Input = { name: string; sector: string; location: string; notes: string };
type Existing = { id: string; name: string };

/** What goes in a new company doc; createdAt / updatedAt are server timestamps added at write time. */
const Draft = Company.omit({ createdAt: true, updatedAt: true, facts: true });
export type NewCompany = ReturnType<typeof Draft.parse>;

export type Built =
  | { ok: true; company: NewCompany }
  | { ok: false; reason: "name" | "invalid" }
  | { ok: false; reason: "duplicate"; existing: Existing };

/**
 * Trims every field, refuses a blank or already-used name (case-insensitive), and parses the doc with the shared
 * schema so nothing unvalidated is written. The schema has no location: it is stored after the sector, "Sector, Location",
 * which is how the seeded companies read.
 */
export function buildCompany(input: Input, companies: Existing[], uid: string): Built {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "name" };
  const existing = companies.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return { ok: false, reason: "duplicate", existing };
  const parsed = Draft.safeParse({
    ownerUid: uid,
    name,
    sector: [input.sector.trim(), input.location.trim()].filter(Boolean).join(", "),
    hiringPattern: "",
    notes: input.notes.trim(),
  });
  return parsed.success ? { ok: true, company: parsed.data } : { ok: false, reason: "invalid" };
}

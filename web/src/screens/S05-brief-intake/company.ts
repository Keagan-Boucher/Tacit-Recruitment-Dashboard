export type CompanyChoice = { mode: "existing"; existing: string } | { mode: "new"; newName: string };

/**
 * Where a brief's company goes by default: an existing company with the same name (any case), else a new one.
 * Null while companies are still loading (decide later) or when the brief names no company (leave the form alone).
 */
export function defaultCompany(name: string | null | undefined, companies: { id: string; name: string }[] | undefined): CompanyChoice | null {
  const n = name?.trim();
  if (!n || !companies) return null;
  const known = companies.find((c) => c.name.trim().toLowerCase() === n.toLowerCase());
  return known ? { mode: "existing", existing: known.id } : { mode: "new", newName: n };
}

export type Hand = { mode?: "existing" | "new"; existing?: string; newName?: string };

/** The form's company fields: what the recruiter set by hand wins over the brief's default. */
export function companyFields(hand: Hand, auto: CompanyChoice | null) {
  return {
    mode: hand.mode ?? auto?.mode ?? "existing",
    existing: hand.existing ?? (auto?.mode === "existing" ? auto.existing : ""),
    newName: hand.newName ?? (auto?.mode === "new" ? auto.newName : ""),
  };
}

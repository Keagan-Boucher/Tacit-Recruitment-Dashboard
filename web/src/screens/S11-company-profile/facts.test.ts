import { describe, expect, it } from "vitest";
import { companyFacts, placedAmount, staleAge } from "./facts";

const now = new Date(2026, 9, 24);
const base = { hiringPattern: "", notes: "", updatedAt: new Date(2026, 9, 1) };

describe("company facts", () => {
  it("labels each source and dates it; fresh facts carry no age or ask", () => {
    const [note, email, fb] = companyFacts({ ...base, facts: [
      { text: "A.", source: "note", observedAt: new Date(2026, 9, 24) },
      { text: "B.", source: "email", by: "Megan Naidoo", observedAt: new Date(2026, 5, 3) },
      { text: "C.", source: "client-feedback", observedAt: new Date(2026, 1, 18) },
    ] }, now);
    expect(note).toMatchObject({ source: "Your note · 24 Oct 2026", age: null, ask: null });
    expect(email!.source).toBe("Megan Naidoo, by email · 3 Jun 2026");
    expect(fb).toMatchObject({ source: "Client feedback · 18 Feb 2026", age: null });
  });

  it("falls back to a generic sender when an email has no `by`", () => {
    expect(companyFacts({ ...base, facts: [{ text: "A.", source: "email", observedAt: now }] }, now)[0]!.source).toBe("Client, by email · 24 Oct 2026");
  });

  it("a stale fact carries its age and an ask line; a money fact asks about salary; placements are dated to the month", () => {
    const [pay, other] = companyFacts({ ...base, facts: [
      { text: "Hires at R52k and R55k.", source: "placements", observedAt: new Date(2025, 7, 20) },
      { text: "Prefers contract.", source: "client-feedback", observedAt: new Date(2025, 7, 20) },
    ] }, now);
    expect(pay).toMatchObject({ source: "Placements · Aug 2025", age: "14 months ago", ask: "Ask about salary before you shortlist anyone." });
    expect(other).toMatchObject({ age: "14 months ago", ask: "Check this still holds before you shortlist." });
  });

  it("falls back to the hiring pattern and note under one Your notes source, with age when stale", () => {
    const fresh = companyFacts({ hiringPattern: "Hybrid. Pays well.", notes: "Pays well.", updatedAt: new Date(2026, 9, 1) }, now);
    expect(fresh.map((f) => f.text)).toEqual(["Hybrid.", "Pays well."]);
    expect(fresh[0]).toMatchObject({ source: "Your notes · 1 Oct 2026", age: null });
    expect(companyFacts({ hiringPattern: "", notes: "Old.", updatedAt: new Date(2025, 0, 5) }, now)[0]).toMatchObject({ age: "21 months ago", ask: expect.any(String) });
  });

  it("lists facts newest first", () => {
    const f = companyFacts({ ...base, facts: [{ text: "Old.", source: "note", observedAt: new Date(2025, 1, 1) }, { text: "New.", source: "note", observedAt: new Date(2026, 8, 1) }] }, now);
    expect(f.map((x) => x.text)).toEqual(["New.", "Old."]);
  });

  it("an empty facts array also falls back", () => {
    expect(companyFacts({ ...base, facts: [], notes: "Note." }, now).map((f) => f.text)).toEqual(["Note."]);
  });

  it("ages a date only when it is stale", () => {
    expect(staleAge(new Date(2025, 2, 6), now)).toBe("19 months ago");
    expect(staleAge(new Date(2025, 9, 24), now)).toBeNull(); // exactly 12 months: not yet stale
    expect(staleAge(new Date(2026, 5, 3), now)).toBeNull();
  });

  it("reads the amount a placement landed at", () => {
    expect(placedAmount("Placed at R52k a month.")).toBe("R52k");
    expect(placedAmount("Placed after two rounds.")).toBeUndefined();
    expect(placedAmount("Offered R60k, placed at R55k.")).toBe("R60k"); // known limit: first figure wins
  });
});

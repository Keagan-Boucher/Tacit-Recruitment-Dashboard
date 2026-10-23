import { describe, expect, it } from "vitest";
import { fixtureFor } from "./fixtures";
import { briefRows, cvRows, duplicateLine, mix, oldestLine, readNote, readWord } from "./review";
import type { Sub } from "./review";

const subs = fixtureFor("default")!.subs;
const sub = (id: string) => subs.find((s) => s.id === id)!;

describe("S18 helpers", () => {
  it("reads status as a word with a count", () => {
    expect(readWord(sub("fx-lerato"))).toEqual({ text: "Read clearly", tone: "for" });
    expect(readWord(sub("fx-kabelo"))).toEqual({ text: "Check 2 fields", tone: "stale" });
    expect(readWord(sub("fx-anke"))).toEqual({ text: "Couldn’t read", tone: "against" });
    expect(readWord(sub("fx-payroll"))).toEqual({ text: "Check 1 field", tone: "stale" });
  });

  it("marks corrected CV fields only", () => {
    const rows = cvRows(sub("fx-lerato") as Extract<Sub, { kind: "cv" }>);
    expect(rows.find((r) => r.key === "salary")?.mark).toContain("they corrected this");
    expect(rows.find((r) => r.key === "location")?.mark).toBeUndefined();
    expect(rows.find((r) => r.key === "now")?.lines).toEqual(["SAP FI analyst, Mzansi Freight, 2022 to now"]);
    expect(readNote(sub("fx-anke") as Extract<Sub, { kind: "cv" }>)).toMatch(/couldn’t read/);
  });

  it("keeps the brief in screening order and marks what is unclear", () => {
    const rows = briefRows(sub("fx-payroll") as Extract<Sub, { kind: "brief" }>, "Vantage Logistics");
    expect(rows.map((r) => r.label).slice(0, 3)).toEqual(["Work mode", "Travel", "Budget"]);
    expect(rows.find((r) => r.key === "travel")?.mark).toContain("check with Vantage Logistics");
    expect(rows.at(-1)).toMatchObject({ label: "Unclear", lines: ["Early 2027, no exact start date"] });
  });

  it("words the widget line", () => {
    expect(mix(subs)).toBe("3 CVs and 2 briefs");
    expect(oldestLine(subs, new Date(2026, 9, 23, 12))).toBe("The oldest was sent 2 days ago.");
    expect(oldestLine([{ submittedAt: new Date(2026, 9, 23, 1) }], new Date(2026, 9, 23, 12))).toBe("The oldest was sent today.");
    expect(duplicateLine({ fullName: "A B", headline: "SAP", lastInterviewAt: new Date(2024, 2, 14) })).toBe("A B, SAP · your note · 14 Mar 2024. Passing links the two.");
  });
});

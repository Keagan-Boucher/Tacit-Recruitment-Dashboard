import { describe, expect, it, vi } from "vitest";
import type { Attribute, InterviewNote } from "@tacit/shared";
import { activeAttribute, ageText, askFirst, askTopic, buildObserved, ordinal, pieces, unkeptByNote } from "./profile";

const now = new Date("2026-10-14T00:00:00Z");
const note = { id: "n1", rawText: "Q?\nWants R60k minimum for a move. Calm.", capturedAt: new Date("2025-08-12T00:00:00Z") } as InterviewNote & { id: string };
const attr = (id: string, start: number, end: number, extra: Partial<Attribute> = {}) =>
  ({ id, type: "salary", value: "R60k", sourceType: "note", noteId: "n1", sourceSpan: { start, end }, observedAt: note.capturedAt, confirmedByRecruiter: true, ...extra }) as Attribute & { id: string };

describe("S03 provenance and staleness", () => {
  it("quotes the exact span, labels it, ages it", () => {
    const o = buildObserved([attr("a", 3, 21)], [note], [], new Date("2026-03-01"))[0]!;
    expect(o.quote).toBe("Wants R60k minimum");
    expect(o.label).toBe("Salary expectation: R60k");
    expect(o.staleness).toBe("ageing"); // Aug 2025 -> Mar 2026 = 6 months
  });

  it("hides unconfirmed and out-of-range attributes, never shows them uncited", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const list = buildObserved([attr("bad", 5, 999), attr("raw", 3, 21, { confirmedByRecruiter: false })], [note], [], now);
    expect(list).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(unkeptByNote([attr("raw", 3, 21, { confirmedByRecruiter: false })]).get("n1")).toBe(1);
  });

  it("an edit replaces the shown value and keeps the original", () => {
    const o = buildObserved([attr("a", 3, 21, { editedValue: "R62k" })], [note], [], now)[0]!;
    expect(o.label).toBe("Salary expectation: R62k");
    expect(o.original).toBe("R60k");
  });

  it("splits a note around linked phrases and skips overlaps", () => {
    const p = pieces("abcdef", [{ id: "x", n: 1, span: { start: 1, end: 3 } }, { id: "y", n: 2, span: { start: 2, end: 5 } }]);
    expect(p.map((x) => x.text)).toEqual(["a", "bc", "def"]);
    expect(p[1]?.id).toBe("x");
  });

  it("asks first only when the newest evidence is stale, naming what aged", () => {
    const early = new Date("2026-01-01");
    expect(askFirst(buildObserved([attr("a", 3, 21)], [note], [], early), early)).toBeNull();
    const late = new Date("2027-01-01");
    const ask = askFirst(buildObserved([attr("a", 3, 21)], [note], [], late), late)!;
    expect(ask.check).toBe("salary");
    expect(ask.sources.map(askTopic)).toEqual(["Salary R60k"]);
    expect(ordinal(1) + ordinal(2) + ordinal(11)).toBe("1st2nd11th");
  });
});

describe("S03 only perishable facts age", () => {
  const late = new Date("2027-01-01"); // Aug 2025 -> Jan 2027 = 16 months
  const list = buildObserved([attr("s", 3, 21), attr("c", 3, 21, { type: "skill", value: "Calm" }), attr("w", 3, 21, { type: "trajectory", value: "SAP lead" })], [note], [], late);
  it("a stale salary shows its age; a stale-by-date skill shows none", () => {
    expect(list.map((o) => [o.type, ageText(o)])).toEqual([["salary", "16 months ago"], ["skill", null], ["trajectory", "16 months ago"]]);
  });
  it("the prompt names only perishable topics and keeps the quote source", () => {
    const ask = askFirst(list, late)!;
    expect(ask.check).toBe("salary and current work");
    expect(ask.sources).toHaveLength(2);
    expect(list[0]!.source).toBe("Your note · 12 Aug 2025");
  });
  it("still asks first when only non-perishable facts are known and they are old", () => {
    const only = buildObserved([attr("c", 3, 21, { type: "skill", value: "Calm" })], [note], [], late);
    expect(askFirst(only, late)).toMatchObject({ check: "", sources: [] });
  });
});

describe("S03 ?attr= selection", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  it("opens on the linked attribute until the recruiter picks", () => {
    expect(activeAttribute(undefined, "b", rows, null)).toBe("b");
    expect(activeAttribute("a", "b", rows, null)).toBe("a");
    expect(activeAttribute(null, "b", rows, null)).toBeNull();
  });
  it("ignores an id that is not shown here", () => expect(activeAttribute(undefined, "zzz", rows, "a")).toBe("a"));
});

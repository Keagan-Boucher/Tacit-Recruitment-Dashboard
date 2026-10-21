import { describe, expect, it } from "vitest";
import { askedQuestions, budgetLine, citedAttributes, headingAt, insertHeading, joinSections, locate, mergeTopSkills, noteLines, noteTitle, offsetIn, pickDraft, splitSections, stripHeadings } from "./capture";

const Q = ["Where are you now?", "Why are you looking to leave?", "Salary and notice"];
const join = (ls: { parts: { text: string }[] }[]) => ls.map((l) => l.parts.map((p) => p.text).join("")).join("\n");

describe("question headings", () => {
  it("inserts a heading as its own line and lands the cursor under it", () => {
    expect(insertHeading("", 0, Q[0]!)).toEqual({ text: "Where are you now?\n", cursor: 19 });
    const r = insertHeading("Bored.", 6, Q[1]!);
    expect(r.text).toBe("Bored.\n\nWhy are you looking to leave?\n");
    expect(r.text.slice(r.cursor)).toBe("");
  });

  it("splits a line when the cursor is mid-sentence, keeping every character", () => {
    const r = insertHeading("Wants R65k, soon", 11, Q[2]!);
    expect(r.text).toBe("Wants R65k,\n\nSalary and notice\n soon");
    expect(r.text.replace(/\s+/g, "")).toBe("WantsR65k,Salaryandnoticesoon");
  });

  it("does not stack blank lines", () => {
    expect(insertHeading("One.\n\n", 6, Q[0]!).text).toBe("One.\n\nWhere are you now?\n");
    expect(insertHeading("One.\n", 5, Q[0]!).text).toBe("One.\n\nWhere are you now?\n");
  });

  it("ticks a question only when its heading is a whole line", () => {
    const text = "Where are you now?\nBored.\n\nSalary and notice \nR65k. Why are you looking to leave? Not said.";
    expect([...askedQuestions(text, Q)]).toEqual(["Where are you now?", "Salary and notice"]);
    expect(headingAt(text, Q[2]!)).toBe(text.indexOf("Salary"));
    expect(headingAt(text, Q[1]!)).toBe(-1);
  });

  it("strips headings for the earlier-note preview", () => {
    expect(stripHeadings("Where are you now?\nFirst call.\n\nSalary and notice\nR60k.", Q)).toBe("First call.\nR60k.");
  });
});

describe("draft restore", () => {
  const server = { text: "saved", updatedAt: new Date(1000) };
  it("uses the draft only when newer than the server copy and different", () => {
    expect(pickDraft(server, { noteId: "n", text: "saved plus more", at: 2000 })).toEqual({ text: "saved plus more", restored: true });
    expect(pickDraft(server, { noteId: "n", text: "older", at: 500 })).toEqual({ text: "saved", restored: false });
    expect(pickDraft(server, { noteId: "n", text: "saved", at: 2000 })).toEqual({ text: "saved", restored: false });
  });
  it("restores a draft whose note never reached the server, and opens empty with neither", () => {
    expect(pickDraft(null, { noteId: null, text: "typed offline", at: 1 })).toEqual({ text: "typed offline", restored: true });
    expect(pickDraft(null, null)).toEqual({ text: "", restored: false });
  });
});

describe("provenance pieces", () => {
  const text = "Where are you now?\nBored. Owns month-end close.\n\nSalary and notice\nAround R65k, one month.";
  const span = (phrase: string) => ({ start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length });
  const attr = (id: string, phrase: string) => ({ id, sourceSpan: span(phrase) });

  it("numbers in reading order and drops spans that do not fit the text", () => {
    const list = citedAttributes([attr("b", "Around R65k"), attr("a", "Owns month-end close"), { id: "bad", sourceSpan: { start: 5, end: 9999 } }, { id: "empty", sourceSpan: { start: 4, end: 4 } }], text);
    expect(list.map((a) => [a.id, a.n])).toEqual([["a", 1], ["b", 2]]);
  });

  it("cuts the exact phrase out of its line and marks headings", () => {
    const cited = citedAttributes([attr("a", "Owns month-end close"), attr("b", "Around R65k")], text).map((a) => ({ id: a.id, n: a.n, ...a.sourceSpan }));
    const ls = noteLines(text, Q, cited);
    expect(ls[0]).toEqual({ heading: true, parts: [{ text: "Where are you now?" }] });
    expect(ls[1]!.parts).toEqual([{ text: "Bored. " }, { text: "Owns month-end close", id: "a", n: 1 }, { text: "." }]);
    expect(ls[3]!.heading).toBe(true);
    expect(ls[4]!.parts[0]).toEqual({ text: "Around R65k", id: "b", n: 2 });
    expect(join(ls)).toBe(text); // lossless
  });

  it("keeps the text whole when a span crosses a line break or overlaps another", () => {
    const cross = { id: "x", n: 1, start: text.indexOf("close."), end: text.indexOf("Salary") + 6 };
    const lap = { id: "y", n: 2, start: cross.start + 2, end: cross.start + 5 };
    const ls = noteLines(text, Q, [cross, lap]);
    const ids = ls.flatMap((l) => l.parts).flatMap((p) => (p.id ? [p.id] : []));
    expect(join(ls)).toBe(text);
    expect(ids).toContain("x");
    expect(ids).not.toContain("y");
  });
});

describe("labels", () => {
  it("titles by position", () => {
    expect(noteTitle(2, false)).toBe("Second interview");
    expect(noteTitle(1, true)).toBe("First call");
    expect(noteTitle(12, false)).toBe("Interview 12");
  });
  it("formats the budget and merges skills", () => {
    expect(budgetLine({ min: 52000, max: 55000, currency: "ZAR" })).toBe("R52k to R55k a month");
    expect(mergeTopSkills(["B", "A"], ["A", "C", "D", "E"])).toEqual(["B", "A", "C", "D"]);
  });
});

describe("editor sections", () => {
  const texts = [
    "",
    "Just free text.\nTwo lines.",
    "Where are you now?",
    "Where are you now?\n",
    "Where are you now?\nBored.\n\nWhy are you looking to leave?\nGrowth.\n\nSalary and notice \nR65k.",
    "Intro line\n\nWhere are you now?\nBored.\nStill here.\nWhy are you looking to leave?\nSalary and notice\n\n",
    "\n\nWhere are you now?\n\n\n",
  ];

  it("joins back to exactly the stored text", () => {
    for (const t of texts) expect(joinSections(splitSections(t, Q))).toBe(t);
  });

  it("splits free text before the first heading from the answers under each heading", () => {
    expect(splitSections("Intro\n\nWhere are you now?\nBored.\nStill.\nSalary and notice", Q)).toEqual([
      { head: null, body: "Intro\n" },
      { head: "Where are you now?", body: "Bored.\nStill." },
      { head: "Salary and notice", body: null },
    ]);
    expect(splitSections("", Q)).toEqual([{ head: null, body: "" }]);
  });

  it("round-trips an edit of one answer and what insertHeading produces", () => {
    const made = insertHeading("Intro.", 6, Q[0]!).text;
    const s = splitSections(made, Q);
    expect(s.map((x) => x.head)).toEqual([null, Q[0]]);
    s[1]!.body = "Bored.";
    expect(joinSections(s)).toBe("Intro.\n\nWhere are you now?\nBored.");
    expect([...askedQuestions(joinSections(s), Q)]).toEqual([Q[0]]);
  });

  it("maps a cursor offset to the answer it is in, and back", () => {
    const t = "Intro\n\nWhere are you now?\nBored.\nSalary and notice\nR65k";
    const s = splitSections(t, Q);
    const bored = t.indexOf("Bored") + 2;
    expect(locate(s, bored)).toEqual({ index: 1, at: 2 });
    expect(offsetIn(s, 1, 2)).toBe(bored);
    expect(locate(s, t.indexOf("Where") + 3)).toEqual({ index: 1, at: 0 });
    expect(locate(s, t.length)).toEqual({ index: 2, at: 4 });
    expect(locate(s, 0)).toEqual({ index: 0, at: 0 });
  });
});

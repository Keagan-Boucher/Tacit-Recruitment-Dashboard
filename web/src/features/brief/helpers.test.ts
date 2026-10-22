import { describe, expect, it } from "vitest";
import { briefStoragePath, buildParseBriefRequest, describeProblem, fileProblem, formatBudget, sanitiseFileName, screeningRows } from "./helpers";

const brief = (over = {}) => ({
  title: null, companyName: null, workMode: "Hybrid, two days in the office", travel: null,
  budget: { min: 52000, max: 55000, currency: "ZAR" }, location: "Durban",
  mustHave: ["S/4HANA FI/CO configuration"], niceToHave: [], seniority: null, unclear: [], ...over,
});

describe("fileProblem", () => {
  it("accepts the five types in any case", () => {
    for (const n of ["a.pdf", "a.DOCX", "a.eml", "a.msg", "a.txt"]) expect(fileProblem({ name: n, size: 10 })).toBeNull();
  });
  it("rejects other types, empty and oversize files", () => {
    expect(fileProblem({ name: "a.png", size: 10 })).toMatch(/PDF/);
    expect(fileProblem({ name: "noext", size: 10 })).toMatch(/PDF/);
    expect(fileProblem({ name: "a.txt", size: 0 })).toMatch(/empty/);
    expect(fileProblem({ name: "a.txt", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});

describe("storage path", () => {
  it("sanitises the name and keeps the extension", () => {
    expect(sanitiseFileName("../../Vantage brief (final).PDF")).toBe("Vantage-brief-final.PDF");
    expect(sanitiseFileName("???")).toBe("brief.txt");
    expect(briefStoragePath("u1", "My brief.txt", 123)).toBe("users/u1/briefs/123-My-brief.txt");
  });
});

describe("buildParseBriefRequest", () => {
  it("sends exactly one of text or fileRef", () => {
    expect(buildParseBriefRequest("call", { text: "  hi  " })).toEqual({ source: "call", text: "hi", fileRef: null });
    expect(buildParseBriefRequest("paste", { fileRef: "users/u/briefs/1-a.txt" })).toEqual({
      source: "upload", text: null, fileRef: "users/u/briefs/1-a.txt",
    });
  });
});

describe("formatBudget", () => {
  it("formats ranges, single figures and nothing", () => {
    expect(formatBudget({ min: 52000, max: 55000, currency: "ZAR" })).toBe("R52k to R55k");
    expect(formatBudget({ min: null, max: 55000, currency: "ZAR" })).toBe("R55k");
    expect(formatBudget({ min: 52500, max: null, currency: null })).toBe("From R52.5k");
    expect(formatBudget({ min: null, max: 90000, currency: "USD" })).toBe("USD 90k");
    expect(formatBudget({ min: null, max: null, currency: null })).toBeNull();
  });
});

describe("screeningRows", () => {
  const quotes = {
    workMode: "hybrid is fine", travel: "", budget: "R52k-R55k a month", location: "", seniority: "",
    mustHave: ["hands-on FI/CO on S/4"], niceToHave: [],
  };
  it("is in screening order and marks gaps with a null value", () => {
    const rows = screeningRows(brief());
    expect(rows.map((r) => r.label)).toEqual(["Work mode", "Travel", "Budget", "Location", "Must have", "Nice to have", "Seniority"]);
    expect(rows.find((r) => r.key === "travel")?.value).toBeNull();
    expect(rows.find((r) => r.key === "budget")?.value).toBe("R52k to R55k");
    expect(rows.every((r) => r.quote === null)).toBe(true);
  });
  it("carries each value's quote, and none for a blank quote or a missing value", () => {
    const rows = screeningRows(brief(), quotes);
    expect(rows.find((r) => r.key === "workMode")?.quote).toBe("hybrid is fine");
    expect(rows.find((r) => r.key === "budget")?.quote).toBe("R52k-R55k a month");
    expect(rows.find((r) => r.key === "location")?.quote).toBeNull();
    expect(rows.find((r) => r.key === "travel")).toMatchObject({ value: null, quote: null });
  });
  it("gives each list item its own row and quote, matched by position", () => {
    const rows = screeningRows(
      brief({ mustHave: ["FI/CO", "Full cycle"], niceToHave: ["", "Group reporting"] }),
      { ...quotes, mustHave: ["hands-on FI/CO", "one full-cycle"], niceToHave: ["", "group reporting bonus"] },
    );
    expect(rows.filter((r) => r.label === "Must have").map((r) => [r.value, r.quote])).toEqual([["FI/CO", "hands-on FI/CO"], ["Full cycle", "one full-cycle"]]);
    expect(rows.filter((r) => r.label === "Nice to have").map((r) => [r.value, r.quote])).toEqual([["Group reporting", "group reporting bonus"]]);
  });
  it("reads stored empties (0 to 0 budget, 'None mentioned', no items) as not mentioned", () => {
    const rows = screeningRows(brief({ budget: { min: 0, max: 0, currency: "ZAR" }, travel: "None mentioned", mustHave: [] }));
    for (const k of ["budget", "travel", "mustHave"]) expect(rows.find((r) => r.key === k)?.value).toBeNull();
  });
});

describe("describeProblem", () => {
  it("bad_file offers paste, everything else retries and says the input is kept", () => {
    expect(describeProblem({ status: 400, code: "bad_file", message: "x" }, "upload").kind).toBe("bad_file");
    expect(describeProblem({ status: 0, code: "internal" }, "paste")).toMatchObject({ kind: "retry", detail: "Your text is still here." });
    expect(describeProblem({ status: 502, code: "ai_failed" }, "upload").detail).toBe("Your file is still chosen.");
  });
});

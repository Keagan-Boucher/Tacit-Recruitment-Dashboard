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
  it("is in screening order and marks gaps with no values", () => {
    const rows = screeningRows(brief());
    expect(rows.map((r) => r.label)).toEqual(["Work mode", "Travel", "Budget", "Location", "Must have", "Nice to have", "Seniority"]);
    expect(rows.find((r) => r.key === "travel")?.values).toEqual([]);
    expect(rows.find((r) => r.key === "budget")?.values).toEqual(["R52k to R55k"]);
  });
});

describe("describeProblem", () => {
  it("bad_file offers paste, everything else retries and says the input is kept", () => {
    expect(describeProblem({ status: 400, code: "bad_file", message: "x" }, "upload").kind).toBe("bad_file");
    expect(describeProblem({ status: 0, code: "internal" }, "paste")).toMatchObject({ kind: "retry", detail: "Your text is still here." });
    expect(describeProblem({ status: 502, code: "ai_failed" }, "upload").detail).toBe("Your file is still chosen.");
  });
});

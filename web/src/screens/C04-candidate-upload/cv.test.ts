import { describe, expect, it } from "vitest";
import type { CvField, CvParseResult } from "@tacit/shared";
import { buildSubmit, correctedFields, isJobUnclear, isUnclear, pickCvFile, readFromParse, unclearCount } from "./cv";

const f = (value: string | null, confidence = 0.95): CvField => ({ value, readAs: null, confidence, note: null });
const parsed: CvParseResult = {
  fullName: f("Lerato Dlamini"),
  headline: f("SAP FI analyst"),
  location: f("Johannesburg"),
  currentRole: f("SAP FI analyst"),
  salaryExpectation: f("R60 000", 0.5), // below LOW_CONFIDENCE (0.7)
  history: [
    { title: "SAP FI analyst", company: "Mzansi Freight", from: "2022", to: null, readAs: null, confidence: 0.9, note: null },
    { title: "Finance intern", company: null, from: "2021", to: "2021", readAs: "Intern @ Ma?ula", confidence: 0.4, note: "Company unreadable." },
  ],
  education: ["BCom Accounting"],
  skills: ["SAP FI", "sap fi", "Excel"],
  parseConfidence: 0.82,
};

describe("pickCvFile", () => {
  it("takes the first PDF or Word file", () => {
    expect(pickCvFile([{ name: "cv.PDF", size: 100 }, { name: "b.docx", size: 1 }])).toEqual({ file: { name: "cv.PDF", size: 100 } });
    expect(pickCvFile([{ name: "cv.docx", size: 100 }])).toHaveProperty("file");
  });
  it("says why a file can't be used", () => {
    expect(pickCvFile([{ name: "me.jpg", size: 10 }])).toHaveProperty("problem");
    expect(pickCvFile([{ name: "notes.txt", size: 10 }])).toHaveProperty("problem");
    expect(pickCvFile([{ name: "big.pdf", size: 10 * 1024 * 1024 }])).toEqual({ problem: "That file is over 10 MB. Choose a smaller one." });
    expect(pickCvFile([])).toHaveProperty("problem");
  });
});

describe("low-confidence flagging", () => {
  const read = readFromParse(parsed);
  it("flags fields and jobs under LOW_CONFIDENCE, nothing else", () => {
    expect([...read.unclear]).toEqual(["salaryExpectation"]);
    expect([...read.unclearJobs]).toEqual([1]);
    expect(unclearCount(read, new Set())).toBe(2);
  });
  it("stops flagging a field once the candidate has been to it", () => {
    const touched = new Set(["salaryExpectation"]);
    expect(isUnclear(read, "salaryExpectation", new Set())).toBe(true);
    expect(isUnclear(read, "salaryExpectation", touched)).toBe(false);
    expect(isJobUnclear(read, 1, new Set(["job:1"]))).toBe(false);
    expect(unclearCount(read, touched)).toBe(1);
  });
});

describe("correctedFields", () => {
  const { details } = readFromParse(parsed);
  it("is empty when nothing changed", () => expect(correctedFields(details, { ...details })).toEqual([]));
  it("lists exactly what the candidate changed, in form order", () => {
    const now = { ...details, salaryExpectation: "R62 000", workMode: "hybrid" as const, skills: [...details.skills, "SQL"], location: "Pretoria" };
    expect(correctedFields(details, now)).toEqual(["location", "salaryExpectation", "workMode", "skills"]);
  });
  it("never counts notice or availableFrom: Tacit did not propose them", () => {
    expect(correctedFields(details, { ...details, notice: "1 month", availableFrom: "2026-12-01" })).toEqual([]);
  });
  it("notices a changed job", () => {
    const history = details.history.map((j, i) => (i === 1 ? { ...j, company: "Maluleke Foods" } : j));
    expect(correctedFields(details, { ...details, history })).toEqual(["history"]);
  });
});

describe("buildSubmit", () => {
  const read = readFromParse(parsed);
  it("builds the cv submission the proxy expects", () => {
    const now = { ...read.details, fullName: "  Lerato Dlamini ", phone: " +27 82 555 0187 ", workMode: "hybrid" as const, salaryExpectation: "R62 000" };
    const body = buildSubmit("users/u1/cvs/1-cv.pdf", read, now);
    expect(body).toMatchObject({
      kind: "cv",
      fileRef: "users/u1/cvs/1-cv.pdf",
      parseConfidence: 0.82,
      correctedFields: ["phone", "salaryExpectation", "workMode"],
    });
    if (body.kind !== "cv") throw new Error("kind");
    expect(body.fields).toMatchObject({ fullName: "Lerato Dlamini", phone: "+27 82 555 0187", workMode: "hybrid", skills: ["SAP FI", "Excel"], education: ["BCom Accounting"] });
    expect(body.fields.history[0]).toEqual({ title: "SAP FI analyst", company: "Mzansi Freight", from: "2022" });
  });
  it("sends notice and availableFrom when typed, trimmed, and nothing when blank", () => {
    const withBoth = buildSubmit("users/u1/cvs/1-cv.pdf", read, { ...read.details, notice: " One calendar month ", availableFrom: "2026-12-01" });
    if (withBoth.kind !== "cv") throw new Error("kind");
    expect(withBoth.fields).toMatchObject({ notice: "One calendar month", availableFrom: "2026-12-01" });
    expect(withBoth.correctedFields).toEqual([]);
    const blank = buildSubmit("users/u1/cvs/1-cv.pdf", read, { ...read.details, notice: "  ", availableFrom: "" });
    if (blank.kind !== "cv") throw new Error("kind");
    expect(blank.fields.notice).toBeUndefined();
    expect(blank.fields.availableFrom).toBeUndefined();
    expect(() => buildSubmit("users/u1/cvs/1-cv.pdf", read, { ...read.details, availableFrom: "1 Dec 2026" })).toThrow();
  });
  it("leaves blank optional fields out and refuses a missing name", () => {
    const body = buildSubmit("users/u1/cvs/1-cv.pdf", read, { ...read.details, salaryExpectation: " " });
    if (body.kind !== "cv") throw new Error("kind");
    expect(body.fields.salaryExpectation).toBeUndefined();
    expect(body.fields.workMode).toBeUndefined();
    expect(() => buildSubmit("users/u1/cvs/1-cv.pdf", read, { ...read.details, fullName: " " })).toThrow();
  });
});

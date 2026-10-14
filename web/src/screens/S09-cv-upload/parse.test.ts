import { describe, expect, it } from "vitest";
import type { CvField, CvParseResult } from "@tacit/shared";
import {
  blankDraft, checkTitle, countFlags, datesLabel, draftFromResult, filterCvFiles, nextReady, nextToRun, sanitiseName,
  storagePath, summary, toCandidate, describeError, type Draft, type QueueItem,
} from "./parse";
import { createQueue, type Deps } from "./queueCore";

const f = (value: string | null, confidence = 0.95, readAs: string | null = null, note: string | null = null): CvField => ({ value, readAs, confidence, note });
const result = (over: Partial<CvParseResult> = {}): CvParseResult => ({
  fullName: f("Lerato Dlamini"),
  headline: f("SAP consultant", 0.55, "SAP Constlant", "Spelling garbled."),
  location: f("Gqeberha"),
  currentRole: f("SAP MM analyst", 0.5, "S?P MM ana1yst", "Scan unclear."),
  salaryExpectation: f(null, 0.2),
  history: [
    { title: "SAP MM analyst", company: "NMB Municipality", from: "2022", to: null, readAs: null, confidence: 0.95, note: null },
    { title: "Finance intern", company: null, from: "2021", to: "2021", readAs: "Intern @ Ma?ula", confidence: 0.4, note: "Company unreadable." },
  ],
  education: ["BCom"],
  skills: ["SAP MM", "sap mm", "Excel", "Power BI", "SAP SD", "SQL"],
  parseConfidence: 0.6,
  ...over,
});
const now = new Date("2026-10-14T10:00:00Z");
const ctx = { uid: "u1", status: "ok" as const, now, fileName: "lerato.pdf", fileRef: "users/u1/cvs/1-lerato.pdf" };

describe("picking files", () => {
  it("keeps PDF, Word and text in order, drops the rest and Word lock files", () => {
    const names = ["b.PDF", "a.docx", "~$a.docx", "photo.jpg", ".hidden.pdf", "notes.txt", "noext"].map((name) => ({ name }));
    const { kept, skipped } = filterCvFiles(names);
    expect(kept.map((x) => x.name)).toEqual(["b.PDF", "a.docx", "notes.txt"]);
    expect(skipped).toBe(4);
  });

  it("makes Storage-safe names that keep the extension", () => {
    expect(sanitiseName("Sipho Mabaso CV (final).pdf")).toBe("Sipho-Mabaso-CV-final.pdf");
    expect(sanitiseName("../../etc/passwd.txt")).toBe("etc-passwd.txt");
    expect(sanitiseName("Zoë Ñandi..docx")).toBe("Zoe-Nandi.docx");
    expect(storagePath("u1", "My CV.docx", 123)).toBe("users/u1/cvs/123-My-CV.docx");
    expect(sanitiseName(".pdf")).toBe("cv.pdf");
  });
});

describe("parse result to draft", () => {
  it("flags only values below LOW_CONFIDENCE, with what was read", () => {
    const d = draftFromResult(result(), "m1");
    expect(d.headline.flag).toEqual({ readAs: "SAP Constlant", note: "Spelling garbled." });
    expect(d.fullName.flag).toBeNull();
    expect(d.salary.flag).toBeNull(); // nothing read, nothing to check
    expect(d.history[1]?.flag?.readAs).toBe("Intern @ Ma?ula");
    expect(d.skills).toEqual(["SAP MM", "Excel", "Power BI", "SAP SD", "SQL"]);
    expect(d.modelVersion).toBe("m1");
  });

  it("counts unresolved flags and drops them as the recruiter clears each", () => {
    const d = draftFromResult(result());
    expect(countFlags(d)).toBe(3); // headline, current role, finance intern
    const cleared: Draft = { ...d, headline: { ...d.headline, flag: null } };
    expect(countFlags(cleared)).toBe(2);
    expect(countFlags(blankDraft())).toBe(0);
  });

  it("words the title and dates", () => {
    expect(checkTitle("Lerato Dlamini")).toBe("Check Lerato’s CV.");
    expect(checkTitle("  ")).toBe("Check this CV.");
    expect(datesLabel({ from: "2022", to: "2025" })).toBe("2022 to 2025");
    expect(datesLabel({ from: "2022", to: "" })).toBe("2022 to now");
    expect(datesLabel({ from: "2021", to: "2021" })).toBe("2021");
  });
});

describe("draft to candidate", () => {
  it("maps to the shared schema with no undefined values and no model-only fields", () => {
    const c = toCandidate(draftFromResult(result(), "m1"), ctx);
    expect(c.fullName).toBe("Lerato Dlamini");
    expect(c.cvFileRef).toBe("users/u1/cvs/1-lerato.pdf");
    expect(c.cv?.fileName).toBe("lerato.pdf");
    expect(c.cv?.modelVersion).toBe("m1");
    expect(c.cv?.readAt).toEqual(now);
    expect(c.cv?.history).toEqual([
      { title: "SAP MM analyst", company: "NMB Municipality", from: "2022" }, // `to: null` omitted
      { title: "Finance intern", from: "2021", to: "2021" },
    ]);
    expect(c.topSkills).toEqual(["SAP MM", "Excel", "Power BI", "SAP SD"]);
    expect(c.parseStatus).toBe("ok");
    expect(JSON.stringify(c)).not.toMatch(/readAs|confidence"|note"/);
    expect(Object.values(c).every((v) => v !== undefined)).toBe(true);
    expect(Object.values(c.cv!).every((v) => v !== undefined)).toBe(true);
  });

  it("lets the recruiter's edits win, and flagged drafts keep their status", () => {
    const d = draftFromResult(result());
    d.fullName.value = "Lerato Dlamini-Khumalo";
    d.currentRole.value = "SAP MM lead";
    d.salary.value = "R45 000 per month";
    const c = toCandidate(d, { ...ctx, status: "flagged" });
    expect(c.fullName).toBe("Lerato Dlamini-Khumalo");
    expect(c.cv?.history[0]?.title).toBe("SAP MM lead"); // newest job has no end
    expect(c.cv?.salaryExpectation).toBe("R45 000 per month");
    expect(c.parseStatus).toBe("flagged");
  });

  it("adds a typed current role as a job only when no current job exists and it is new", () => {
    const ended = result({ history: [{ title: "SAP MM analyst", company: null, from: "2022", to: "2025", readAs: null, confidence: 1, note: null }] });
    const same = toCandidate(draftFromResult(ended), ctx);
    expect(same.cv?.history).toHaveLength(1);
    const d = draftFromResult(ended);
    d.currentRole.value = "Freelance SAP consultant";
    expect(toCandidate(d, ctx).cv?.history[0]).toEqual({ title: "Freelance SAP consultant" });
  });

  it("needs a name, and a by-hand candidate carries no model fields", () => {
    expect(() => toCandidate(blankDraft(), ctx)).toThrow(/name/);
    const d = blankDraft();
    d.fullName.value = "Pieter Jacobs";
    const c = toCandidate(d, { uid: "u1", status: "ok", now });
    expect(c.cv).toBeUndefined();
    expect(c.cvFileRef).toBeUndefined();
    expect(c.parseConfidence).toBe(1);
  });
});

describe("queue rules", () => {
  const item = (id: string, status: QueueItem["status"]): QueueItem => ({ id, kind: "file", fileName: id, status });
  it("runs the first waiting file, in order, and reviews the first ready one", () => {
    const items = [item("a", "ready"), item("b", "reading"), item("c", "waiting"), item("d", "waiting"), item("e", "ready")];
    expect(nextToRun(items)?.id).toBe("c");
    expect(nextReady(items)?.id).toBe("a");
    expect(summary(items)).toEqual({ total: 5, ready: 2, busy: true });
    expect(summary([item("a", "ready"), item("b", "failed")]).busy).toBe(false);
  });

  it("explains errors; only unreadable files skip retry", () => {
    expect(describeError({ code: "bad_file", status: 422, message: "It may be damaged." }, "read")).toEqual({ status: "unreadable", message: "Couldn’t read this file. It may be damaged." });
    expect(describeError({ code: "ai_failed", status: 502 }, "read").status).toBe("failed");
    expect(describeError({ code: "internal", status: 0 }, "read").message).toMatch(/reach/);
    expect(describeError(new Error("x"), "upload").message).toMatch(/upload/);
  });
});

describe("parse queue", () => {
  const file = (name: string) => new File(["x"], name);
  const response = { result: result(), modelVersion: "m1" };
  const tail = (p: string) => p.split("-").slice(1).join("-");

  function setup(parse: Deps["parse"]) {
    const log: string[] = [];
    const deps: Deps = {
      uid: () => "u1",
      upload: async (_f, path) => void log.push(`up ${tail(path)}`),
      parse: async (ref) => (log.push(`parse ${tail(ref)}`), parse(ref)),
      removeFile: async (p) => void log.push(`rm ${tail(p)}`),
    };
    return { q: createQueue(deps), log };
  }
  const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

  it("uploads and parses one file at a time, in the order given", async () => {
    let running = 0;
    let most = 0;
    const { q, log } = setup(async () => {
      most = Math.max(most, ++running);
      await settle(5);
      running--;
      return response;
    });
    q.enqueue([file("a.pdf"), file("b.docx"), file("c.txt")]);
    await settle(150);
    expect(log).toEqual(["up a.pdf", "parse a.pdf", "up b.docx", "parse b.docx", "up c.txt", "parse c.txt"]);
    expect(most).toBe(1);
    expect(q.getSnapshot().map((i) => i.status)).toEqual(["ready", "ready", "ready"]);
    expect(q.getSnapshot()[0]?.draft?.fullName.value).toBe("Lerato Dlamini");
  });

  it("a failed parse can be retried without uploading again; a bad file becomes unreadable", async () => {
    let calls = 0;
    const { q, log } = setup(async () => {
      if (++calls === 1) throw Object.assign(new Error("x"), { status: 502, code: "ai_failed" });
      if (calls === 3) throw Object.assign(new Error("scan"), { status: 422, code: "bad_file" });
      return response;
    });
    q.enqueue([file("a.pdf")]);
    await settle();
    expect(q.getSnapshot()[0]?.status).toBe("failed");
    q.retry(q.getSnapshot()[0]!.id);
    await settle();
    expect(q.getSnapshot()[0]?.status).toBe("ready");
    expect(log.filter((l) => l.startsWith("up"))).toHaveLength(1);
    q.enqueue([file("b.pdf")]);
    await settle();
    expect(q.getSnapshot()[1]?.status).toBe("unreadable");
  });

  it("discard deletes the upload; by hand keeps the file but starts blank", async () => {
    const { q, log } = setup(async () => response);
    q.enqueue([file("a.pdf"), file("b.pdf")]);
    await settle(100);
    const [a, b] = q.getSnapshot();
    q.discard(a!.id);
    expect(q.getSnapshot().map((i) => i.id)).toEqual([b!.id]);
    expect(log).toContain("rm a.pdf");
    q.byHandFromFile(b!.id);
    expect(q.getSnapshot()[0]).toMatchObject({ kind: "hand", status: "ready", fileRef: expect.stringContaining("b.pdf") });
    expect(q.getSnapshot()[0]?.draft).toEqual(blankDraft());
    const h = q.addByHand();
    q.remove(h);
    expect(log.filter((l) => l.startsWith("rm"))).toHaveLength(1);
  });
});

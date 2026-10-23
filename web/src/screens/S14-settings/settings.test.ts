import { describe, expect, it } from "vitest";
import type { Attribute, Candidate, InterviewNote, Override, Placement } from "@tacit/shared";
import { buildExport } from "./record";
import { lastSeen, monthsBetween, pastRetention } from "./retention";

const now = new Date("2026-10-25T10:00:00Z");
const at = (iso: string) => new Date(iso);
const person = (id: string, o: Partial<Candidate> = {}) => ({ id, createdAt: at("2026-01-01"), ...o }) as Candidate & { id: string };

describe("pastRetention", () => {
  it("uses the latest of interview, created and opened", () => {
    expect(lastSeen({ createdAt: at("2024-01-01"), lastInterviewAt: at("2025-03-01"), lastOpenedAt: at("2024-06-01") })).toEqual(at("2025-03-01"));
    expect(lastSeen({ createdAt: at("2024-01-01"), lastOpenedAt: at("2026-01-01") } as Candidate)).toEqual(at("2026-01-01"));
  });
  it("counts whole months", () => {
    expect(monthsBetween(at("2024-07-15T12:00:00"), at("2026-10-25T12:00:00"))).toBe(27);
    expect(monthsBetween(at("2024-10-30T12:00:00"), at("2026-10-25T12:00:00"))).toBe(23);
  });
  it("lists people at or past the setting, oldest first, and changes with it", () => {
    const people = [
      person("a", { createdAt: at("2024-09-10") }), // 25 months
      person("b", { createdAt: at("2024-07-10") }), // 27 months
      person("c", { createdAt: at("2025-08-01"), lastOpenedAt: at("2026-09-01") }), // opened recently
      person("d", { createdAt: at("2025-06-01") }), // 16 months
    ];
    expect(pastRetention(people, 24, now).map((r) => r.person.id)).toEqual(["b", "a"]);
    expect(pastRetention(people, 12, now).map((r) => r.person.id)).toEqual(["b", "a", "d"]);
    expect(pastRetention(people, 36, now)).toEqual([]);
    expect(pastRetention(people, 24, now)[0]?.ago).toBe(27);
  });
});

describe("buildExport", () => {
  const candidate = { ...person("c1"), ownerUid: "u1", fullName: "Pieter van Wyk" } as Candidate & { id: string };
  const mine = { candidateId: "c1", ownerUid: "u1", observedAt: at("2025-01-02T03:04:05Z") };
  const theirs = { candidateId: "c2", ownerUid: "u1", observedAt: at("2025-01-02") };
  const out = buildExport(
    {
      candidate,
      attributes: [{ ...mine, id: "a1" }, { ...theirs, id: "a2" }] as (Attribute & { id: string })[],
      interviewNotes: [{ candidateId: "c1", id: "n1", rawText: "x" }, { candidateId: "c2", id: "n2", rawText: "SECRET" }] as (InterviewNote & { id: string })[],
      overrides: [{ candidateId: "c2", id: "o1" }] as (Override & { id: string })[],
      placements: [{ candidateId: "c1", id: "p1" }] as (Placement & { id: string })[],
    },
    now,
  );
  const body = JSON.parse(out.json);
  it("names the file after the candidate", () => expect(out.filename).toBe("tacit-c1.json"));
  it("holds only this candidate's docs, dates as ISO strings, no owner uid", () => {
    expect(body.candidate.fullName).toBe("Pieter van Wyk");
    expect(body.attributes.map((a: { id: string }) => a.id)).toEqual(["a1"]);
    expect(body.attributes[0].observedAt).toBe("2025-01-02T03:04:05.000Z");
    expect(body.interviewNotes).toHaveLength(1);
    expect(body.overrides).toEqual([]);
    expect(body.placements).toHaveLength(1);
    expect(out.json).not.toContain("SECRET");
    expect(out.json).not.toContain("u1");
    expect(body.exportedAt).toBe(now.toISOString());
  });
});

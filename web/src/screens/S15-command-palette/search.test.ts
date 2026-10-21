import { describe, expect, it } from "vitest";
import type { Company, Role } from "@tacit/shared";
import { buildGroups, paletteGroups } from "./search";
import type { Person } from "../S08-candidates-list/view";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
const person = (id: string, fullName: string, age: number) =>
  ({ id, fullName, headline: "SAP support lead", location: "Cape Town", topSkills: ["FICO"], createdAt: ago(age), updatedAt: ago(age), lastInterviewAt: ago(age) }) as Person;
const company = { id: "v", name: "Vantage Logistics", sector: "Logistics", updatedAt: ago(5) } as Company & { id: string };
const role = { id: "r", companyId: "v", title: "SAP FICO consultant", status: "open", updatedAt: ago(2) } as Role & { id: string };
const people = [person("s", "Sipho Mabaso", 430), person("t", "Thabo Nkosi", 20)];

describe("palette search", () => {
  it("finds a person by name and flags stale evidence", () => {
    const [g] = buildGroups(people, [company], [role], "sipho", now);
    expect(g?.hits.map((h) => [h.to, h.staleMonths])).toEqual([["/candidates/s", 14]]);
  });
  it("finds a company and its roles by company name", () => {
    const groups = buildGroups(people, [company], [role], "vantage", now);
    expect(groups.map((g) => g.hits[0]?.to)).toEqual(["/companies/v", "/roles/r"]);
  });
  it("shows recent items per group on an empty query and nothing for a miss", () => {
    expect(buildGroups(people, [company], [role], "", now).map((g) => g.label)).toEqual(["Recent people", "Recent companies", "Recent roles"]);
    expect(buildGroups(people, [company], [role], "mainframe", now)).toEqual([]);
  });
});

describe("palette groups", () => {
  it("adds group counts and an Actions group with the notes search first", () => {
    const { groups, miss } = paletteGroups(people, [company], [role], "fico", now);
    expect(miss).toBe(false);
    expect(groups.map((g) => [g.label, g.count])).toEqual([["People", 2], ["Roles", 1], ["Actions", undefined]]);
    expect(groups.at(-1)!.hits.map((h) => [h.title, h.to])).toEqual([["Search notes for “fico”", "/candidates?q=fico"], ["New interview note", "/candidates"]]);
  });
  it("offers only New interview note when nothing is typed", () => {
    const { groups } = paletteGroups(people, [company], [role], "  ", now);
    expect(groups.map((g) => g.label)).toEqual(["Recent people", "Recent companies", "Recent roles", "Actions"]);
    expect(groups.at(-1)!.hits.map((h) => h.key)).toEqual(["action-new"]);
  });
  it("on a miss puts Suggested first, then two recent rows (a person and a role)", () => {
    const { groups, miss } = paletteGroups(people, [company], [role], "main frame & more", now);
    expect(miss).toBe(true);
    expect(groups.map((g) => g.label)).toEqual(["Suggested", "Recent"]);
    expect(groups[0]!.hits[0]!.to).toBe("/candidates?q=main%20frame%20%26%20more");
    expect(groups[1]!.hits.map((h) => h.kind)).toEqual(["candidate", "role"]);
    expect(groups[1]!.hits.every((h) => h.recent && !h.sub && h.staleMonths === undefined)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { Company, Role } from "@tacit/shared";
import { buildGroups } from "./search";
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

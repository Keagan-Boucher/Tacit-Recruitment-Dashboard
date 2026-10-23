import { describe, expect, it } from "vitest";
import { buildCompany } from "./newCompany";

const mine = [{ id: "c1", name: "Vantage Logistics" }];
const typed = { name: "  Test Co (synthetic)  ", sector: " Logistics software ", location: " Durban ", notes: "  Met at a mixer.  " };

describe("buildCompany", () => {
  it("trims every field and stores sector and location as one sector", () => {
    expect(buildCompany(typed, mine, "u1")).toEqual({
      ok: true,
      company: { ownerUid: "u1", name: "Test Co (synthetic)", sector: "Logistics software, Durban", hiringPattern: "", notes: "Met at a mixer." },
    });
  });
  it("leaves out the comma when only one of sector and location is given", () => {
    const sector = (s: string, l: string) => (buildCompany({ ...typed, sector: s, location: l }, mine, "u1") as { company: { sector: string } }).company.sector;
    expect([sector("Retail", ""), sector("", "Durban"), sector("", "")]).toEqual(["Retail", "Durban", ""]);
  });
  it("refuses an empty or whitespace name", () => {
    expect(buildCompany({ ...typed, name: "   " }, mine, "u1")).toEqual({ ok: false, reason: "name" });
  });
  it("refuses a name the recruiter already has, ignoring case and padding, and says which", () => {
    expect(buildCompany({ ...typed, name: " vantage LOGISTICS " }, mine, "u1")).toEqual({ ok: false, reason: "duplicate", existing: mine[0] });
  });
  it("refuses when there is no signed-in owner", () => {
    expect(buildCompany(typed, mine, "")).toEqual({ ok: false, reason: "invalid" });
  });
});

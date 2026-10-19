import { describe, expect, it } from "vitest";
import { companyFields, defaultCompany } from "./company";

const companies = [{ id: "c1", name: "Vantage Logistics" }, { id: "c2", name: "Fico" }] as { id: string; name: string }[];

describe("S05 company default", () => {
  it("picks the existing company whatever the case or padding", () => {
    expect(defaultCompany("vantage LOGISTICS ", companies)).toEqual({ mode: "existing", existing: "c1" });
  });
  it("offers a new company when none matches", () => {
    expect(defaultCompany("Acme", companies)).toEqual({ mode: "new", newName: "Acme" });
  });
  it("waits while companies are loading, so a late load can still find the match", () => {
    expect(defaultCompany("Vantage Logistics", undefined)).toBeNull();
    expect(defaultCompany("Vantage Logistics", companies)).toEqual({ mode: "existing", existing: "c1" });
  });
  it("leaves the form alone when the brief names no company", () => {
    expect(defaultCompany(null, companies)).toBeNull();
    expect(defaultCompany("  ", companies)).toBeNull();
  });
});

describe("S05 company fields", () => {
  const auto = defaultCompany("Vantage Logistics", companies);
  it("starts from the brief's company", () => expect(companyFields({}, auto)).toEqual({ mode: "existing", existing: "c1", newName: "" }));
  it("keeps a hand-made choice when the default arrives or changes", () => {
    expect(companyFields({ mode: "new", newName: "Acme" }, auto)).toMatchObject({ mode: "new", newName: "Acme" });
    expect(companyFields({ existing: "c2" }, auto)).toMatchObject({ mode: "existing", existing: "c2" });
  });
});

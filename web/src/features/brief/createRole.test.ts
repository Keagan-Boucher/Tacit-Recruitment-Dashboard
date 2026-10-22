import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ db: {} }));
const { buildRoleDoc } = await import("./createRole");

const now = new Date("2026-10-26T08:00:00Z");
const picked = (result = {}, extra = {}) => ({
  result: {
    title: "SAP FICO consultant", companyName: "Vantage Logistics", workMode: null, travel: null,
    budget: { min: null, max: null, currency: null }, location: "Durban or Cape Town",
    mustHave: ["FI/CO on S/4HANA"], niceToHave: [], seniority: null, unclear: [], ...result,
  } as never,
  modelVersion: "m", briefText: "We need a FICO consultant.", briefSource: "paste" as const, ...extra,
});
const build = (p = picked()) => buildRoleDoc({ uid: "u1", brief: p, title: "  SAP FICO consultant ", companyId: "c1", now });

const quotes = { workMode: "hybrid is fine", travel: "", budget: "", location: "Durban or Cape Town", seniority: "", mustHave: ["hands-on FI/CO"], niceToHave: [] };

describe("buildRoleDoc", () => {
  it("keeps the brief quotes on the saved role, and saves no quotes key without them", () => {
    expect(build(picked({ quotes })).interpretedBrief?.quotes).toEqual(quotes);
    expect("quotes" in build().interpretedBrief!).toBe(false);
  });
  it("maps nulls to empty strings, 0 and ZAR, and passes Role", () => {
    const r = build();
    expect(r).toMatchObject({ title: "SAP FICO consultant", status: "open", ownerUid: "u1", companyId: "c1", openedAt: now });
    expect(r.interpretedBrief).toMatchObject({ workMode: "", travel: "", seniority: "", budget: { min: 0, max: 0, currency: "ZAR" } });
    expect("briefFileRef" in r).toBe(false);
  });
  it("reads a one-sided budget as that figure", () => {
    expect(build(picked({ budget: { min: null, max: 55000, currency: "ZAR" } })).interpretedBrief?.budget).toEqual({ min: 55000, max: 55000, currency: "ZAR" });
  });
  it("keeps the file reference for uploads", () => {
    expect(build(picked({}, { briefSource: "upload", briefFileRef: "users/u1/briefs/1-a.pdf" })).briefFileRef).toBe("users/u1/briefs/1-a.pdf");
  });
});

import { describe, expect, it } from "vitest";
import { budgetFrom, validate } from "./form";

const ok = { title: "Analyst", company: "co1", hasBrief: true, min: "", max: "" };

describe("validate", () => {
  it("passes with title, company and a read brief; budget is optional", () => expect(validate(ok)).toEqual({}));
  it("names every missing piece", () => expect(Object.keys(validate({ ...ok, title: " ", company: "", hasBrief: false }))).toEqual(["title", "company", "brief"]));
  it("rejects a band that runs backwards", () => expect(validate({ ...ok, min: "85000", max: "75000" }).budget).toBeTruthy());
});

describe("budgetFrom", () => {
  const read = { min: 60000, max: null, currency: null };
  it("keeps what Tacit read when the fields are blank", () => expect(budgetFrom("", "", read)).toEqual({ min: 60000, max: 60000, currency: null }));
  it("lets the recruiter's figures win", () => expect(budgetFrom("75000", "85000", read)).toMatchObject({ min: 75000, max: 85000 }));
});

import { describe, expect, it } from "vitest";
import { FINISHING, guardRedirect } from "./roles";

describe("guardRedirect", () => {
  it("sends a signed-out visitor to the login for the route's role", () => {
    expect(guardRedirect("recruiter", false, null, "/roles?x=1")).toBe("/login?next=%2Froles%3Fx%3D1");
    expect(guardRedirect("candidate", false, null, "/candidate/cv")).toBe("/candidate/login?next=%2Fcandidate%2Fcv");
    expect(guardRedirect("company", false, null, "/company")).toBe("/company/login?next=%2Fcompany");
  });
  it("sends a wrong role to its own home", () => {
    expect(guardRedirect("recruiter", true, "candidate", "/")).toBe("/candidate");
    expect(guardRedirect("recruiter", true, "company", "/review")).toBe("/company");
    expect(guardRedirect("candidate", true, "recruiter", "/candidate")).toBe("/");
    expect(guardRedirect("company", true, "candidate", "/company/roles/r1")).toBe("/candidate");
  });
  it("sends a signed-in account with no role to finish its account", () => {
    expect(guardRedirect("recruiter", true, null, "/")).toBe(FINISHING);
    expect(guardRedirect("company", true, null, "/company")).toBe(FINISHING);
  });
  it("renders the route for the right role, including shared routes", () => {
    expect(guardRedirect("recruiter", true, "recruiter", "/")).toBeNull();
    expect(guardRedirect(["recruiter", "candidate", "company"], true, "company", "/settings")).toBeNull();
  });
});

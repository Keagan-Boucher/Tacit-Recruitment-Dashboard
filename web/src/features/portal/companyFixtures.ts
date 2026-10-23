import type { ShortlistEntry } from "@tacit/shared";
import type { InterpretedBrief } from "../brief";
import type { CompanyPortal, Entry, Sub } from "./company";

// Dev only (?state=): the Figma frames' company, synthetic (Megan Pillay at Vantage Logistics). Dates are relative to now.
// Nothing here is sent anywhere.

const DAY = 86_400_000;

export function companyFixture(state: string, now = new Date()): CompanyPortal {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const base = { ownerUid: "dev", createdAt: ago(30), updatedAt: ago(1) };
  const portalUser = { ...base, id: "dev-company", role: "company" as const, email: "megan.pillay@vantage.test", displayName: "Megan Pillay", companyId: "co-vantage" };
  if (state === "empty") return { portalUser, submissions: [], entries: [] };

  const brief = (id: string, title: string, status: "pending" | "accepted" | "not-accepted", sent: number, extra: Record<string, unknown> = {}): Sub =>
    ({
      ...base, id, kind: "brief", submittedBy: "dev-company", companyId: "co-vantage", correctedFields: [], readStatus: "clear", status, submittedAt: ago(sent),
      fields: { title, workMode: "Hybrid", travel: "", budget: { min: 70000, max: 80000, currency: "ZAR" }, location: "Johannesburg", mustHave: ["SAP HCM payroll"], niceToHave: [], seniority: "Lead", unclear: [] },
      ...(status === "pending" ? {} : { reviewedAt: ago(sent - 1), reviewedBy: "dev-recruiter" }),
      ...extra,
    }) as Sub;

  const card = { facts: { location: "", workMode: "Hybrid", notice: "1 month", salary: "R70k a month" }, case: { for: [{ text: "Ran S/4HANA month-end for three years.", at: ago(20) }], against: [{ text: "Has not led a team.", at: ago(20) }] } };
  const entry = (id: string, roleId: string, roleTitle: string, label: string, headline: string, years: number, location: string, status: ShortlistEntry["status"], shared: number, extra: Partial<ShortlistEntry> = {}): Entry => {
    const history = status === "shortlisted" ? [] : [{ status: "interviewing" as const, by: "dev-company", at: ago(shared - 2) }, ...(status === "hired" ? [{ status: "hired" as const, by: "dev-company", at: ago(Math.max(shared - 20, 1)) }] : [])];
    return {
      ...base, id, roleId, roleTitle, companyId: "co-vantage", label, headline, years, ...card, facts: { ...card.facts, location },
      status, statusHistory: status === "not-progressing" ? [{ status: "not-progressing" as const, by: "dev-company", at: ago(1), reasonText: "Salary too high." }] : history, sharedAt: ago(shared), ...extra,
    };
  };
  const sap = "role-sap";
  const entries: Entry[] = [
    entry("e1", sap, "SAP FICO consultant (S/4HANA)", "Candidate B", "SAP support lead", 8, "Cape Town", "shortlisted", 1),
    entry("e2", sap, "SAP FICO consultant (S/4HANA)", "Candidate C", "SAP FI consultant", 6, "Johannesburg", "shortlisted", 1),
    entry("e3", sap, "SAP FICO consultant (S/4HANA)", "Candidate A", "Finance systems analyst", 9, "Pretoria", "interviewing", 5, {
      identity: { fullName: "Thabo Nkosi", email: "thabo.nkosi@mail.test", phone: "+27 82 555 0110" }, interviewTimes: ["Wed 28 Oct, 10:00"],
    }),
    entry("e4", sap, "SAP FICO consultant (S/4HANA)", "Candidate F", "SAP analyst", 3, "Durban", "not-progressing", 5),
    entry("e5", "role-fin", "Finance systems lead", "Candidate A", "Finance systems lead", 11, "Johannesburg", "hired", 60, {
      identity: { fullName: "Johan Pretorius", email: "johan.pretorius@mail.test", phone: "+27 83 555 0123" },
    }),
  ];
  const submissions = [
    brief("b-sap", "SAP FICO consultant (S/4HANA)", "accepted", 14, { resultId: sap }),
    brief("b-payroll", "Payroll systems lead", "pending", 2),
    brief("b-treasury", "Treasury analyst", "not-accepted", 3, { reasonCode: "details-missing", reasonText: "Add a salary range and send it again." }),
  ];
  return { portalUser, submissions, entries };
}

/** B03 `default` / `ai-working`: the payroll brief as Tacit read it. Start date has no field in a brief, so the unclear question carries it. */
export function briefFixture(): InterpretedBrief {
  return {
    briefText: "We need a Payroll systems lead in Johannesburg, hybrid, R70k to R80k a month. SAP HCM payroll and South African tax rules are a must. Start early 2027.",
    briefSource: "upload",
    briefFileRef: "users/dev/briefs/1760000000000-payroll-systems-lead.pdf",
    modelVersion: "fixture",
    result: {
      title: "Payroll systems lead",
      companyName: "Vantage Logistics",
      workMode: "Hybrid",
      travel: null,
      budget: { min: 70000, max: 80000, currency: "ZAR" },
      location: "Johannesburg",
      mustHave: ["SAP HCM payroll", "South African tax rules"],
      niceToHave: ["SuccessFactors Employee Central"],
      seniority: "Lead",
      unclear: ["Start date: the brief says early 2027, not an exact date."],
      quotes: {
        workMode: "hybrid", travel: "", budget: "R70k to R80k a month", location: "Johannesburg", seniority: "",
        mustHave: ["SAP HCM payroll", "South African tax rules"], niceToHave: [""],
      },
    },
  };
}

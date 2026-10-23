import type { Sub } from "./review";

// Dev-only stand-ins for ?state=, so every state can be checked before the live queue is seeded.

export type Person = { fullName: string; headline: string; lastInterviewAt?: Date };
/** `dups`: submission id to the pool candidate it may duplicate (the recruiter-only submissionChecks). */
export type Fixture = { subs: Sub[]; companies: Record<string, string>; people: Record<string, Person>; dups: Record<string, string> };

const base = { ownerUid: "dev", createdAt: new Date(), updatedAt: new Date(), status: "pending" as const };
const brief = (title: string, extra: Record<string, unknown>) => ({
  workMode: "Hybrid", travel: "", budget: { min: 70000, max: 80000, currency: "ZAR" }, location: "Johannesburg", mustHave: ["SAP HCM payroll", "South African tax rules"],
  niceToHave: ["SuccessFactors Employee Central"], seniority: "Lead", title, unclear: [], ...extra,
});

const CVS: Sub[] = [
  {
    ...base, id: "fx-lerato", kind: "cv", submittedBy: "u1", submittedAt: new Date(2026, 9, 22, 9), readStatus: "clear", correctedFields: ["salaryExpectation"],
    fileRef: "users/u1/cvs/lerato-dlamini.pdf",
    fields: {
      fullName: "Lerato Dlamini", headline: "SAP FI analyst", location: "Johannesburg", currentRole: "SAP FI analyst", workMode: "hybrid", salaryExpectation: "R60k a month",
      history: [{ title: "SAP FI analyst", company: "Mzansi Freight", from: "2022" }, { title: "Accounts payable lead", company: "Ubuntu Retail", from: "2018", to: "2022" }],
      education: [], skills: ["SAP FI", "SAP ECC", "Excel", "Power BI"],
    },
  },
  {
    ...base, id: "fx-kabelo", kind: "cv", submittedBy: "u2", submittedAt: new Date(2026, 9, 22, 11), readStatus: "check", correctedFields: ["location", "phone"], parseConfidence: 0.6,
    fileRef: "users/u2/cvs/kabelo-mahlangu.pdf",
    fields: {
      fullName: "Kabelo Mahlangu", headline: "Payroll administrator", location: "Pretoria", currentRole: "Payroll administrator", phone: "082 555 0142",
      history: [{ title: "Payroll administrator", company: "Highveld Mining", from: "2020" }], education: ["BCom Accounting, UNISA"], skills: ["SAP HCM", "Payroll", "Excel"],
    },
  },
  {
    ...base, id: "fx-anke", kind: "cv", submittedBy: "u3", submittedAt: new Date(2026, 9, 21, 15), readStatus: "unreadable", correctedFields: [], parseConfidence: 0.2,
    fileRef: "users/u3/cvs/anke-visser.pdf",
    fields: { fullName: "Anke Visser", headline: "SAP Basis consultant", location: "", currentRole: "SAP Basis consultant", history: [], education: [], skills: [] },
  },
];

const BRIEFS: Sub[] = [
  {
    ...base, id: "fx-payroll", kind: "brief", submittedBy: "b1", companyId: "co-vantage", submittedAt: new Date(2026, 9, 21, 10), readStatus: "check", correctedFields: [],
    text: "“We need a payroll systems lead in Joburg to own SAP HCM payroll and keep us right on SA tax. SuccessFactors would help. Hybrid, start early next year, R70–80k.”",
    fields: brief("Payroll systems lead", { unclear: ["Early 2027, no exact start date"] }),
  },
  {
    ...base, id: "fx-treasury", kind: "brief", submittedBy: "b1", companyId: "co-vantage", submittedAt: new Date(2026, 9, 22, 8), readStatus: "clear", correctedFields: [],
    text: "Treasury analyst, Joburg, hybrid. Cash forecasting and Kyriba.",
    fields: brief("Treasury analyst", { seniority: "Mid", mustHave: ["Cash forecasting", "Kyriba"], niceToHave: [], budget: { min: 0, max: 0, currency: "ZAR" } }),
  },
];

const ALL = { dups: { "fx-lerato": "cand-lerato" }, companies: { "co-vantage": "Vantage Logistics" }, people: { "cand-lerato": { fullName: "Lerato Dlamini", headline: "SAP FI analyst", lastInterviewAt: new Date(2024, 2, 14) } } };

/** `state` from ?state=; undefined when it is not one of the S18 / S01 fixture states. */
export function fixtureFor(state: string): Fixture | undefined {
  if (state === "empty") return { subs: [], ...ALL };
  if (["default", "briefs", "not-accepted", "review-waiting", "customise"].includes(state)) return { subs: [...CVS, ...BRIEFS], ...ALL };
  return undefined;
}

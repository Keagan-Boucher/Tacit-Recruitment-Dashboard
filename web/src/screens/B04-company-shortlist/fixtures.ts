import type { Entry } from "./shortlist";

// Dev only (?state=): the four FICO entries from the seed, as the Figma frames show them. Synthetic people;
// nothing here is sent anywhere.

const d = (day: number) => new Date(2026, 9, day, 10);
const dated = (text: string) => ({ text, at: d(20) });
const base = { ownerUid: "dev-recruiter", createdAt: d(20), updatedAt: d(22), roleId: "role_demo_fico", roleTitle: "SAP FICO consultant (S/4HANA)", companyId: "co_demo_vantage", sharedAt: d(22) };
const shortlisted = { status: "shortlisted" as const, by: "dev-recruiter", at: d(22) };

export const FIXTURE_ROLE = base.roleTitle;

/** What the proxy would reveal for each person who can still be moved to Interviewing. */
export const FIXTURE_IDENTITY: Record<string, NonNullable<Entry["identity"]>> = {
  entry_b: { fullName: "Anele Khumalo", email: "anele.khumalo@mail.test", phone: "+27 82 555 0143" },
  entry_c: { fullName: "Ruan Pretorius", email: "ruan.pretorius@mail.test", phone: "" },
};

export function fixtureEntries(): Entry[] {
  return [
    {
      ...base, id: "entry_a", label: "Candidate A", headline: "Finance systems analyst", years: 7,
      facts: { location: "Durban, will relocate", workMode: "", notice: "1 month notice", salary: "R58k a month" },
      case: {
        for: [dated("Ran month-end close on S/4HANA for a three-company group."), dated("Owns the intercompany reconciliation."), dated("Trained two junior analysts."), dated("Certified in S/4HANA Finance.")],
        against: [dated("Has supported an implementation, never led one.")],
      },
      status: "interviewing",
      statusHistory: [shortlisted, { status: "interviewing", by: "dev-company", at: d(22) }],
      identity: { fullName: "Thabo Nkosi", email: "thabo.nkosi@mail.test", phone: "+27 83 555 0110" },
      interviewTimes: ["Tue 28 Oct, mornings"],
    },
    {
      ...base, id: "entry_b", label: "Candidate B", headline: "SAP support lead", years: 8,
      facts: { location: "Cape Town", workMode: "hybrid", notice: "1 month notice", salary: "R60k a month" },
      case: {
        for: [dated("Self-taught on S/4HANA Finance, and passed the FICO certification."), dated("Led a support team of six through a year-end close."), dated("Clear, calm communicator.")],
        against: [dated("Asks R60k. Your band tops out at R65k, so there is little room."), dated("Has not worked on group reporting.")],
      },
      status: "shortlisted", statusHistory: [shortlisted],
    },
    {
      ...base, id: "entry_c", label: "Candidate C", headline: "SAP FI consultant", years: 6,
      facts: { location: "Johannesburg", workMode: "hybrid", notice: "2 months notice", salary: "R62k a month" },
      case: {
        for: [dated("Two full S/4HANA implementations, both on time."), dated("Strong references from both clients.")],
        against: [dated("Little group reporting, which your brief calls a bonus.")],
      },
      status: "shortlisted", statusHistory: [shortlisted],
    },
    {
      ...base, id: "entry_d", label: "Candidate D", headline: "Finance systems consultant", years: 5,
      facts: { location: "Cape Town", workMode: "on-site", notice: "available now", salary: "" },
      case: {
        for: [dated("Strong on controlling and cost centres.")],
        against: [dated("Most of their work is in Oracle, not SAP."), dated("Has not used S/4HANA in production.")],
      },
      status: "not-progressing",
      statusHistory: [shortlisted, { status: "not-progressing", by: "dev-company", at: d(21), reasonText: "Needs more hands-on SAP CO." }],
    },
  ];
}

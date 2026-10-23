import type { CvSubmissionFields, RoleAnon } from "@tacit/shared";
import type { CandidatePortal, Sub, Upd } from "./candidate";

// Dev only (?state=): the Figma frames' candidate, synthetic (Lerato Dlamini). Dates are relative to now so
// "this week" holds whenever the screen is opened. Nothing here is sent anywhere.

const DAY = 86_400_000;
const FILE = "users/dev/cvs/1760000000000-lerato-dlamini-cv.pdf";

const fields: CvSubmissionFields = {
  fullName: "Lerato Dlamini",
  headline: "SAP FI analyst",
  location: "Johannesburg",
  currentRole: "SAP FI analyst, Mzansi Freight",
  salaryExpectation: "R60k a month",
  workMode: "hybrid",
  phone: "+27 82 555 0187",
  history: [
    { title: "SAP FI analyst", company: "Mzansi Freight", from: "2022" },
    { title: "Accounts payable lead", company: "Ubuntu Retail", from: "2018", to: "2022" },
  ],
  education: ["BCom Accounting, University of Johannesburg, 2017"],
  skills: ["SAP FI", "SAP ECC", "Excel", "Power BI", "Month-end close"],
};

const anon = (title: string, sector: string, region: string, seniority: string, salaryBand: string): RoleAnon => ({ title, sector, region, seniority, salaryBand });

export function candidateFixture(state: string, now = new Date()): CandidatePortal {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const base = { ownerUid: "dev", createdAt: ago(30), updatedAt: ago(1), submittedBy: "dev-candidate", correctedFields: [], readStatus: "clear" as const };
  const cv = (status: "pending" | "accepted" | "not-accepted", sent: number): Sub => ({
    ...base, id: `cv-${status}`, kind: "cv", fileRef: FILE, fields, submittedAt: ago(sent), status,
    ...(status === "pending" ? {} : { reviewedAt: ago(sent - 2), reviewedBy: "dev-recruiter" }),
    ...(status === "not-accepted"
      ? { reasonCode: "unreadable" as const, reasonText: "Your CV is a scanned image, so we couldn’t read your roles and dates. Please upload a PDF or Word file with selectable text." }
      : {}),
  });
  const change: Sub = { ...base, id: "dc-1", kind: "details-change", fields: { availability: "1 month notice" }, submittedAt: ago(20), reviewedAt: ago(20), status: "accepted" };
  const update = (id: string, status: Upd["status"], days: number, role: RoleAnon): Upd => ({ id, ownerUid: "dev", createdAt: ago(days), updatedAt: ago(days), candidateId: "cand-dev", portalUid: "dev-candidate", roleAnon: role, status, at: ago(days) });
  const portalUser = { id: "dev-candidate", ownerUid: "dev", createdAt: ago(23), updatedAt: ago(1), role: "candidate" as const, email: "lerato.dlamini@mail.test", displayName: "Lerato Dlamini", candidateId: "cand-dev" };
  const none = { portalUser, submissions: [], updates: [], suggestion: null };

  switch (state) {
    case "empty":
      return { ...none, portalUser: { ...portalUser, candidateId: undefined } };
    case "under-review":
      return { ...none, submissions: [cv("pending", 1)] };
    case "not-accepted":
      return { ...none, submissions: [cv("not-accepted", 2)] };
    case "courses":
      return {
        portalUser,
        submissions: [{ ...cv("accepted", 280), submittedAt: ago(282), reviewedAt: ago(280) }, { ...change, submittedAt: ago(280), reviewedAt: ago(280) }],
        updates: [
          update("u1", "not-taken-forward", 12, anon("SAP FI analyst", "Fintech", "Johannesburg", "Mid", "R45k–R55k a month")),
          update("u2", "not-taken-forward", 110, anon("Finance systems analyst", "Healthcare", "Remote", "Mid", "R50k–R60k a month")),
        ],
        suggestion: {
          id: "cand-dev", ownerUid: "dev", createdAt: ago(3), updatedAt: ago(1), generatedAt: ago(3), modelVersion: "fixture", basis: { roleIds: [] }, status: "approved",
          items: [
            { title: "SAP S/4HANA Finance certification", why: "Asked for in 7 of the 10 roles you came close to. Your CV lists SAP ECC only.", duration: "About 6 weeks" },
            { title: "Group reporting in S/4HANA", why: "The gap named in both roles you were shortlisted for.", duration: "Self-paced" },
            { title: "Power BI Data Analyst (PL-300)", why: "Finance analyst roles ask for reporting dashboards more each month.", duration: "About 4 weeks" },
          ],
        },
      };
    default:
      return {
        portalUser,
        submissions: [{ ...cv("accepted", 20), submittedAt: ago(22), reviewedAt: ago(20) }, change],
        updates: [
          update("u1", "shortlisted", 0, anon("SAP FICO consultant", "Logistics", "Cape Town", "Senior", "R55k–R65k a month")),
          update("u2", "interviewing", 15, anon("Finance systems analyst", "Healthcare", "Remote", "Mid", "R50k–R60k a month")),
          update("u3", "not-taken-forward", 5, anon("SAP FI analyst", "Fintech", "Johannesburg", "Mid", "R45k–R55k a month")),
        ],
        suggestion: null,
      };
  }
}

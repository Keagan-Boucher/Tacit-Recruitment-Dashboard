import type { Candidate, CandidateUpdate, CourseSuggestion, Invite, PortalUser, Role, ShortlistEntry, Submission } from "@tacit/shared";
import { daysAgo, type Doc } from "./build.ts";

/** The two pre-created snap portal accounts. --dry and tests use the placeholders. */
export interface PortalAccounts { candidate: { uid: string; email: string }; company: { uid: string; email: string } }
export const PLACEHOLDER_ACCOUNTS: PortalAccounts = {
  candidate: { uid: "portal_demo_lerato", email: "lerato.dlamini@example.com" },
  company: { uid: "portal_demo_megan", email: "megan.pillay@example.com" },
};

export const LERATO = "cand_demo_lerato";
export const POOL_CANDIDATE = "cand_ruan_botha"; // seeded in candidates.ts; no placement, wants Fiori

export interface PortalDocs {
  portalUsers: Doc<PortalUser>[];
  invites: Doc<Invite>[];
  submissions: Doc<Submission>[];
  shortlistEntries: Doc<ShortlistEntry>[];
  candidateUpdates: Doc<CandidateUpdate>[];
  courseSuggestions: Doc<CourseSuggestion>[];
  /** Lerato's candidate, plus the pool-since patch for the nine-month candidate. */
  extraCandidates: Doc<Candidate>[];
  patchCandidate: (c: Doc<Candidate>) => Doc<Candidate>;
}

export function buildPortal(now: Date, owner: string, roles: Doc<Role>[], acc: PortalAccounts): PortalDocs {
  const own = (at: Date) => ({ ownerUid: owner, createdAt: at, updatedAt: at });
  const role = (id: string) => roles.find((r) => r.id === id)!.data;
  // Accepted on 3 October of the current year, as the Candidate Dashboard frames show.
  const accepted = new Date(Math.min(Date.UTC(now.getUTCFullYear(), 9, 3, 9), now.getTime() - 86_400_000));
  const inPool = new Date(Date.UTC(now.getUTCFullYear(), 0, 8, 9)); // "in the pool since January"
  const lerato = acc.candidate, megan = acc.company;

  const portalUsers: Doc<PortalUser>[] = [
    { id: lerato.uid, data: { ...own(daysAgo(now, 25)), role: "candidate", email: lerato.email, displayName: "Lerato Dlamini", candidateId: LERATO, consentAt: daysAgo(now, 25) } },
    { id: megan.uid, data: { ...own(daysAgo(now, 40)), role: "company", email: megan.email, displayName: "Megan Pillay", companyId: "co_demo_vantage" } },
  ];

  const invites: Doc<Invite>[] = [
    { id: "inv_demo_vantage", data: { ...own(daysAgo(now, 41)), companyId: "co_demo_vantage", email: megan.email, expiresAt: daysAgo(now, 27), acceptedAt: daysAgo(now, 40), acceptedUid: megan.uid, createdBy: owner } },
    // Open and unexpired, for the join page.
    { id: "inv_demo_open", data: { ...own(daysAgo(now, 2)), companyId: "co_umoya_mobile", email: "invitee@example.com", expiresAt: daysAgo(now, -12), createdBy: owner } },
  ];

  const cvFields = (fullName: string, headline: string, location: string, skills: string[]) =>
    ({ fullName, headline, location, currentRole: headline, history: [{ title: headline, from: "2021" }], education: ["BCom Information Systems, 2016"], skills });
  const sub = (id: string, at: Date, submittedBy: string, rest: Omit<Submission, "ownerUid" | "createdAt" | "updatedAt" | "submittedBy" | "submittedAt" | "status" | "correctedFields" | "readStatus"> & Partial<Pick<Submission, "correctedFields" | "readStatus" | "status">>): Doc<Submission> =>
    ({ id, data: { ...own(at), submittedBy, submittedAt: at, status: "pending", correctedFields: [], readStatus: "clear", ...rest } as Submission });
  const brief = (title: string, workMode: string, min: number, max: number, location: string, mustHave: string[], niceToHave: string[], seniority: string, unclear: string[]) =>
    ({ kind: "brief" as const, fields: { title, workMode, travel: "None mentioned", budget: { min, max, currency: "ZAR" }, location, mustHave, niceToHave, seniority, unclear } });

  const submissions: Doc<Submission>[] = [
    sub("sub_demo_lerato_cv", accepted, lerato.uid, {
      kind: "cv", candidateId: LERATO, parseConfidence: 0.93, status: "accepted", reviewedAt: accepted, reviewedBy: owner, resultId: LERATO,
      fields: { ...cvFields("Lerato Dlamini", "SAP FICO consultant", "Durban", ["SAP FI", "SAP CO", "S/4HANA Finance", "Group reporting"]), salaryExpectation: "R58k a month", workMode: "hybrid" },
    }),
    // S18 queue: three CVs...
    sub("sub_demo_cv_clear", daysAgo(now, 1), "portal_demo_cv_clear", {
      kind: "cv", parseConfidence: 0.95, fields: cvFields("Zodwa Mkhize", "SAP MM consultant", "Pretoria", ["SAP MM", "Procurement", "Inventory management"]),
    }),
    sub("sub_demo_cv_check", daysAgo(now, 2), "portal_demo_cv_check", {
      kind: "cv", parseConfidence: 0.71, readStatus: "check", correctedFields: ["location", "salaryExpectation"], possibleDuplicateOf: "cand_ayesha_patel",
      fields: { ...cvFields("Ayesha Patel", "Oracle Financials analyst", "Cape Town", ["Oracle EBS", "Oracle GL and AP"]), salaryExpectation: "R80k a month" },
    }),
    sub("sub_demo_cv_unreadable", daysAgo(now, 3), "portal_demo_cv_unreadable", {
      kind: "cv", parseConfidence: 0.18, readStatus: "unreadable", fields: cvFields("Sizwe Nkabinde", "", "", []),
    }),
    // ...and two briefs.
    sub("sub_demo_brief_vantage", daysAgo(now, 1), megan.uid, {
      companyId: "co_demo_vantage", text: "We need an SAP MM consultant for procurement in Durban. Hybrid, budget around R55k to R60k a month. Five years minimum.",
      ...brief("SAP MM consultant", "Hybrid", 55000, 60000, "Durban", ["SAP MM"], ["Procurement"], "Consultant, 5 or more years", ["Travel"]),
    }),
    sub("sub_demo_brief_karoo", daysAgo(now, 4), "portal_demo_company_karoo", {
      companyId: "co_karoo_health", text: "Oracle Fusion payables analyst, Cape Town, hybrid. Three years experience.",
      ...brief("Oracle Fusion payables analyst", "Hybrid", 0, 0, "Cape Town", ["Oracle Fusion payables"], [], "Analyst, 3 or more years", ["Budget"]),
    }),
  ];

  const ficoRole = role("role_demo_fico");
  const card = (label: string, headline: string, years: number, location: string, workMode: string, notice: string, salary: string, forText: string[], againstText: string[]) => {
    const at = daysAgo(now, 2);
    return { label, headline, years, facts: { location, workMode, notice, salary }, case: { for: forText.map((text) => ({ text, at })), against: againstText.map((text) => ({ text, at })) } };
  };
  const entry = (id: string, candidateId: string, c: ReturnType<typeof card>, status: ShortlistEntry["status"], history: ShortlistEntry["statusHistory"], identity?: ShortlistEntry["identity"]): Doc<ShortlistEntry> => ({
    id,
    data: {
      ...own(daysAgo(now, 2)), roleId: "role_demo_fico", roleTitle: ficoRole.title, companyId: "co_demo_vantage", candidateId, ...c,
      status, statusHistory: [{ status: "shortlisted", by: owner, at: daysAgo(now, 2) }, ...history], ...(identity ? { identity } : {}), sharedAt: daysAgo(now, 2),
    },
  });
  const shortlistEntries: Doc<ShortlistEntry>[] = [
    entry("sl_fico_a", "cand_demo_thabo", card("Candidate A", "Finance systems analyst", 9, "Durban", "Hybrid", "One calendar month", "R65k a month",
      ["Led two S/4HANA FI/CO rollouts end to end.", "Group reporting at a listed retailer."], ["Asking for R65k, above the top of your budget.", "Currently in a support seat, so notice may move."]),
      "interviewing", [{ status: "interviewing", by: megan.uid, at: daysAgo(now, 1) }], { fullName: "Thabo Nkosi", email: "thabo.nkosi@example.com", phone: "082 555 0101" }),
    entry("sl_fico_b", "cand_demo_forgotten", card("Candidate B", "SAP support lead", 8, "Cape Town", "Hybrid", "One month", "R60k a month",
      ["Passed the FICO certification on his own.", "Taught himself S/4HANA Finance and wants implementation work."], ["His FICO work is support tickets, not a full implementation.", "Based in Cape Town."]),
      "shortlisted", []),
    entry("sl_fico_c", LERATO, card("Candidate C", "SAP FICO analyst", 6, "Durban", "Hybrid", "Two months", "R58k a month",
      ["Six years of SAP FICO, strong on group reporting and consolidations."], ["Six years on ECC, no S/4HANA seen.", "Two months notice."]),
      "shortlisted", []),
    entry("sl_fico_d", "cand_kagiso_molefe", card("Candidate D", "SAP FI consultant", 8, "Johannesburg", "On-site", "One month", "R56k a month",
      ["Eight years of SAP FI, asset accounting a strength."], ["ECC 6.0 only, no S/4HANA experience.", "Johannesburg only, will not relocate to Durban."]),
      "not-progressing", [{ status: "not-progressing", by: megan.uid, at: daysAgo(now, 1), reasonText: "We need hands-on S/4HANA and someone based in Durban." }]),
  ];

  const upd = (id: string, roleId: string, status: CandidateUpdate["status"], d: number): Doc<CandidateUpdate> => {
    const { title, sector, region, seniority, salaryBand } = role(roleId).anon!;
    return { id, data: { ...own(daysAgo(now, d)), candidateId: LERATO, portalUid: lerato.uid, roleAnon: { title, sector, region, seniority, salaryBand }, status, at: daysAgo(now, d) } };
  };
  const candidateUpdates = [
    upd("sl_fico_c", "role_demo_fico", "shortlisted", 2),
    upd("upd_lerato_pm", "role_vantage_sap_pm", "interviewing", 6),
    upd("upd_lerato_abap", "role_protea_abap", "not-taken-forward", 20),
  ];

  const courseSuggestions: Doc<CourseSuggestion>[] = [{
    id: POOL_CANDIDATE,
    data: {
      ...own(daysAgo(now, 9)),
      items: [
        { title: "SAP Fiori and UI5 fundamentals", why: "Asked for in 7 of the 10 roles you came close to.", duration: "6 weeks, part time" },
        { title: "ABAP for S/4HANA", why: "Asked for in 5 of the 10 roles you came close to.", duration: "4 weeks, part time" },
        { title: "SAP Activate project methodology", why: "Asked for in 3 of the 10 roles you came close to.", duration: "2 weeks, part time" },
      ],
      basis: { roleIds: ["role_protea_abap", "role_umoya_sf", "role_vantage_sap_pm"] },
      status: "approved", approvedBy: owner, approvedAt: daysAgo(now, 8), generatedAt: daysAgo(now, 9), modelVersion: "seed",
    },
  }];

  const extraCandidates: Doc<Candidate>[] = [{
    id: LERATO,
    data: {
      ...own(accepted), fullName: "Lerato Dlamini", headline: "SAP FICO consultant", location: "Durban", parseConfidence: 0.93, parseStatus: "ok",
      topSkills: ["SAP FI", "SAP CO", "S/4HANA Finance", "Group reporting"],
      cv: { history: [{ title: "SAP FICO consultant", from: "2021" }], education: ["BCom Information Systems, 2016"], skills: ["SAP FI", "SAP CO", "S/4HANA Finance", "Group reporting"], salaryExpectation: "R58k a month", readAt: accepted },
      portalUid: lerato.uid, inPoolSince: accepted, sourceSubmissionId: "sub_demo_lerato_cv",
    },
  }];

  const patchCandidate = (c: Doc<Candidate>): Doc<Candidate> => (c.id === POOL_CANDIDATE ? { id: c.id, data: { ...c.data, inPoolSince: inPool } } : c);

  return { portalUsers, invites, submissions, shortlistEntries, candidateUpdates, courseSuggestions, extraCandidates, patchCandidate };
}

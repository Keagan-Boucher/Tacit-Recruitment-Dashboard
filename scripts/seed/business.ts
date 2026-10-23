import type { Company, CompanyFact, Placement, QuestionGuide, Role } from "@tacit/shared";
import { daysAgo, monthsAgo, type Doc } from "./build.ts";

type Own = (at: Date) => { ownerUid: string; createdAt: Date; updatedAt: Date };

const COMPANIES: [id: string, name: string, sector: string, pattern: string, notes: string][] = [
  ["co_demo_vantage", "Vantage Logistics", "Logistics software, Durban", "Last two SAP hires at R52k and R55k. Hybrid, two days in the Durban office. Pays on budget, rarely above it.", "Last two SAP hires at R52k and R55k."],
  ["co_karoo_health", "Karoo Health Systems", "Health tech, Cape Town", "Oracle shop moving from EBS to Fusion. Hires analysts and one finance lead a year.", "Wants Oracle Fusion, not EBS."],
  ["co_bluewater_fintech", "Bluewater Fintech", "Financial services, Johannesburg", "NetSuite for finance. Wants Johannesburg-based SAP people for anything on-site.", "NetSuite admins report to the CFO."],
  ["co_umoya_mobile", "Umoya Mobile", "Mobile apps, Cape Town", "New client. SuccessFactors rollout for HR, no placement history yet.", "First role with you. Nobody placed yet."],
  ["co_protea_retail", "Protea Retail Group", "Retail, Johannesburg", "Hires juniors in bursts after budget approval.", "Hiring freeze lifted in March."],
  ["co_sable_insurance", "Sable Insurance", "Insurance, Durban", "Mostly contract engagements around the ECC finance module.", "Prefers contract to permanent."],
  ["co_fynbos_analytics", "Fynbos Analytics", "Data consultancy, Stellenbosch", "Occasional project managers for client rollouts.", "Thandi Mokoena is the hiring contact."],
  ["co_highveld_mining", "Highveld Mining Tech", "Mining software, Johannesburg", "Hires SAP PMs for plant system rollouts.", "SAP PM budget of R70k."],
];
const COMPANY_AGE = [24, 24, 23, 0.8, 22, 21, 20, 19];

// Per-fact provenance (S11): [text, source, by | null, observedAt as [unit, amount] ago]. Consistent with hiringPattern / notes / placements.
type FactRow = [string, CompanyFact["source"], string | null, ["d" | "m", number]];
const FACTS: Record<string, FactRow[]> = {
  co_demo_vantage: [
    ["Hybrid, two days in the Durban office.", "note", null, ["d", 4]],
    ["Pays on budget, rarely above it.", "client-feedback", null, ["m", 4]],
    ["Wants S/4HANA hands-on, not ECC only.", "client-feedback", null, ["m", 19]],
    ["Mid-market SAP hires at R52k and R55k a month.", "placements", null, ["m", 14]], // stale on purpose: older than 12 months
  ],
  co_karoo_health: [
    ["Oracle shop moving from EBS to Fusion.", "email", "Priya Pillay", ["m", 3]],
    ["Wants Oracle Fusion, not EBS.", "note", null, ["d", 10]],
    ["Hires analysts and one finance lead a year.", "placements", null, ["m", 13]],
  ],
  co_bluewater_fintech: [
    ["NetSuite for finance; admins report to the CFO.", "note", null, ["m", 2]],
    ["Wants Johannesburg-based SAP people for anything on-site.", "client-feedback", null, ["m", 30]],
  ],
  co_umoya_mobile: [
    ["New client. SuccessFactors rollout for HR.", "note", null, ["d", 20]],
    ["First role with you. Nobody placed yet.", "note", null, ["d", 20]],
  ],
  co_protea_retail: [
    ["Hiring freeze lifted in March.", "email", "Lerato Mahlangu", ["m", 7]],
    ["Hires juniors in bursts after budget approval.", "placements", null, ["m", 20]],
  ],
  co_sable_insurance: [
    ["Mostly contract engagements around the ECC finance module.", "placements", null, ["m", 18]],
    ["Prefers contract to permanent.", "client-feedback", null, ["m", 5]],
  ],
  co_fynbos_analytics: [
    ["Thandi Mokoena is the hiring contact.", "email", "Thandi Mokoena", ["m", 6]],
    ["Occasional project managers for client rollouts.", "placements", null, ["m", 16]],
  ],
  co_highveld_mining: [
    ["Hires SAP PMs for plant system rollouts.", "placements", null, ["m", 15]],
    ["SAP PM budget of R70k.", "client-feedback", null, ["m", 8]],
  ],
};

export const buildCompanies = (own: Own, now: Date): Doc<Company>[] =>
  COMPANIES.map(([id, name, sector, hiringPattern, notes], i) => ({
    id,
    data: {
      ...own(monthsAgo(now, COMPANY_AGE[i])), name, sector, hiringPattern, notes,
      facts: FACTS[id]!.map(([text, source, by, [u, n]]) => ({ text, source, ...(by ? { by } : {}), observedAt: u === "d" ? daysAgo(now, n) : monthsAgo(now, n) })),
    },
  }));

// quotes are verbatim substrings of briefText ("" = the brief does not say it); checked in data.test.ts.
type Quotes = NonNullable<NonNullable<Role["interpretedBrief"]>["quotes"]>;
const brief = (workMode: string, travel: string, min: number, max: number, location: string, mustHave: string[], niceToHave: string[], seniority: string, quotes?: Quotes) =>
  ({ workMode, travel, budget: { min, max, currency: "ZAR" }, location, mustHave, niceToHave, seniority, ...(quotes ? { quotes } : {}) });
const q = (workMode: string, travel: string, budget: string, location: string, seniority: string, mustHave: string[], niceToHave: string[]): Quotes =>
  ({ workMode, travel, budget, location, seniority, mustHave, niceToHave });

// [id, company, title, briefText, status, openedDaysAgo (open) | monthsAgo [opened, closed] (filled/expired), brief?]
type RoleRow = [string, string, string, string, Role["status"], number | [number, number], Role["interpretedBrief"]?];
const ROLES: RoleRow[] = [
  ["role_demo_fico", "co_demo_vantage", "SAP FICO consultant (S/4HANA)", "SAP FICO consultant for our S/4HANA rollout. Hands-on FI/CO on S/4. Group reporting a bonus. Hybrid, two days in the office. Budget is R52k-R55k a month. Durban or Cape Town. Consultant level, 5 or more years.", "open", 3,
    brief("Hybrid, two days in the office", "None mentioned", 52000, 55000, "Durban or Cape Town", ["FI/CO configuration on S/4HANA"], ["Asset accounting", "Group reporting"], "Consultant, 5 or more years",
      q("Hybrid, two days in the office", "", "R52k-R55k a month", "Durban or Cape Town", "5 or more years", ["Hands-on FI/CO on S/4"], ["", "Group reporting"]))],
  ["role_karoo_oracle_fin", "co_karoo_health", "Oracle Financials analyst", "Oracle GL and AP analyst for the finance team. We are moving to Fusion, so Fusion exposure counts for more than EBS.", "open", 9,
    brief("Hybrid", "None", 75000, 85000, "Cape Town", ["Oracle GL and AP", "Oracle Fusion exposure"], ["Month-end close ownership"], "Analyst, 3 or more years",
      q("", "", "", "", "", ["Oracle GL and AP", "Fusion exposure"], [""]))],
  ["role_bluewater_netsuite", "co_bluewater_fintech", "NetSuite administrator", "NetSuite administrator reporting to the CFO. Saved searches, approvals workflow, some SuiteScript. Fully remote.", "open", 12,
    brief("Remote", "None", 44000, 48000, "Remote, South Africa", ["NetSuite administration", "SuiteScript"], ["Approval workflows"], "Administrator, 3 or more years",
      q("Fully remote", "", "", "", "", ["NetSuite administrator", "SuiteScript"], ["approvals workflow"]))],
  ["role_protea_abap", "co_protea_retail", "Junior SAP ABAP developer", "Junior ABAP developer, reports and Fiori apps for our retail ERP team.", "open", 36,
    brief("Hybrid", "None", 30000, 35000, "Cape Town", ["ABAP"], ["Fiori"], "Junior, 1 to 3 years",
      q("", "", "", "", "Junior", ["ABAP"], ["Fiori"]))],
  ["role_vantage_sap_pm", "co_demo_vantage", "SAP project manager", "Project manager for the S/4HANA rollout across three depots. Steering committee and vendor management.", "open", 15,
    brief("On-site, Durban", "Occasional depot visits", 85000, 90000, "Durban", ["SAP rollout project management"], ["Retail or logistics background"], "Senior, 8 or more years",
      q("", "", "", "", "", ["Project manager for the S/4HANA rollout"], [""]))],
  ["role_umoya_sf", "co_umoya_mobile", "SAP SuccessFactors consultant", "SuccessFactors Employee Central consultant for our HR rollout.", "open", 21,
    brief("Hybrid", "None mentioned", 65000, 70000, "Johannesburg", ["Employee Central"], ["Recruiting module"], "Consultant, 3 or more years",
      q("", "", "", "", "", ["Employee Central"], [""]))],
  ["role_vantage_netsuite", "co_demo_vantage", "NetSuite administrator", "NetSuite administrator for the finance team, remote.", "filled", [11, 9]],
  ["role_karoo_finance_lead", "co_karoo_health", "Finance systems lead", "Finance systems lead on Oracle EBS, owning the migration plan.", "filled", [19, 16]],
  ["role_vantage_sap_fi_analyst", "co_demo_vantage", "SAP FI analyst", "SAP FI analyst for the Durban finance team.", "filled", [22, 19]],
  ["role_vantage_sap_mm", "co_demo_vantage", "SAP MM consultant", "SAP MM consultant for procurement and inventory.", "filled", [17, 14]],
  ["role_bluewater_sap_fi", "co_bluewater_fintech", "SAP FI analyst", "SAP FI analyst, Johannesburg office.", "expired", [32, 30]],
  ["role_karoo_support_mgr", "co_karoo_health", "SAP support manager", "Support manager for the SAP helpdesk team.", "expired", [15, 13]],
];

// What candidates see of each role (Role.anon): [sector, region, seniority, salaryBand]. Never the company name.
const ANON: Record<string, [string, string, string, string]> = {
  role_demo_fico: ["Logistics software", "Durban or Cape Town", "Consultant, 5+ years", "R52k-R55k a month"],
  role_karoo_oracle_fin: ["Health technology", "Cape Town", "Analyst, 3+ years", "R75k-R85k a month"],
  role_bluewater_netsuite: ["Financial services", "Remote, South Africa", "Administrator, 3+ years", "R44k-R48k a month"],
  role_protea_abap: ["Retail", "Cape Town", "Junior, 1-3 years", "R30k-R35k a month"],
  role_vantage_sap_pm: ["Logistics software", "Durban", "Senior, 8+ years", "R85k-R90k a month"],
  role_umoya_sf: ["Mobile applications", "Johannesburg", "Consultant, 3+ years", "R65k-R70k a month"],
  role_vantage_netsuite: ["Logistics software", "Remote", "Administrator", "R50k-R55k a month"],
  role_karoo_finance_lead: ["Health technology", "Cape Town", "Lead", "R75k-R80k a month"],
  role_vantage_sap_fi_analyst: ["Logistics software", "Durban", "Analyst", "R50k-R55k a month"],
  role_vantage_sap_mm: ["Logistics software", "Durban", "Consultant", "R52k-R58k a month"],
  role_bluewater_sap_fi: ["Financial services", "Johannesburg", "Analyst", "R55k-R60k a month"],
  role_karoo_support_mgr: ["Health technology", "Cape Town", "Manager", "R70k-R78k a month"],
};

export const buildRoles = (own: Own, now: Date): Doc<Role>[] =>
  ROLES.map(([id, companyId, title, briefText, status, when, interpretedBrief]) => {
    const [opened, closed] = typeof when === "number" ? [daysAgo(now, when), undefined] : [monthsAgo(now, when[0]), monthsAgo(now, when[1])];
    return {
      id,
      data: {
        ...own(opened), companyId, title, briefText, briefSource: "paste", status, openedAt: opened,
        ...(closed ? { closedAt: closed, updatedAt: closed } : {}), ...(interpretedBrief ? { interpretedBrief } : {}),
        anon: { title, sector: ANON[id]![0], region: ANON[id]![1], seniority: ANON[id]![2], salaryBand: ANON[id]![3] },
      },
    };
  });

// [id, company, candidate slug, role, outcome, months ago, reason]
const PLACEMENTS: [string, string, string, string, Placement["outcome"], number, string][] = [
  ["place_vantage_fi_bongani", "co_demo_vantage", "bongani_sithole", "role_vantage_sap_fi_analyst", "placed", 19, "Placed at R52k a month."],
  ["reject_vantage_fi_kagiso", "co_demo_vantage", "kagiso_molefe", "role_vantage_sap_fi_analyst", "client-rejected", 19.5, "Client wanted S/4HANA hands-on. He is ECC only."],
  ["place_vantage_mm_anele", "co_demo_vantage", "anele_jacobs", "role_vantage_sap_mm", "placed", 14, "Placed at R55k a month."],
  ["place_vantage_netsuite_nomvula", "co_demo_vantage", "nomvula_zulu", "role_vantage_netsuite", "placed", 9, "Placed at R52k a month."],
  ["place_karoo_lead_busisiwe", "co_karoo_health", "busisiwe_ndlovu", "role_karoo_finance_lead", "placed", 16, "Placed at R78k a month."],
  ["reject_bluewater_fi_sipho", "co_bluewater_fintech", "demo_forgotten", "role_bluewater_sap_fi", "client-rejected", 30.5, "Client passed: wanted someone in Johannesburg."],
  ["withdrew_karoo_support_sipho", "co_karoo_health", "demo_forgotten", "role_karoo_support_mgr", "withdrew", 13.5, "Wants to move away from support, so he withdrew from the support manager process."],
];

export const buildPlacements = (own: Own, now: Date): Doc<Placement>[] =>
  PLACEMENTS.map(([id, companyId, cand, roleId, outcome, m, reason]) => {
    const date = monthsAgo(now, m);
    return { id, data: { ...own(date), companyId, candidateId: `cand_${cand}`, roleId, outcome, reason, date } };
  });

export const buildGuide = (owner: string, now: Date): Doc<QuestionGuide> => ({
  id: "qg_default",
  data: {
    ownerUid: owner, version: 1, updatedAt: monthsAgo(now, 24),
    questions: ["Where are you now?", "Why are you looking to leave?", "Remote, hybrid or on-site?", "Salary and notice", "Team and culture", "Why should we not give you the job?"],
  },
});

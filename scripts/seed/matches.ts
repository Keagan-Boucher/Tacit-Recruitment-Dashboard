import type { AlignmentKind, Candidate, Match, Override } from "@tacit/shared";
import { isPerishable } from "@tacit/shared";
import { addAttribute, DAY, daysAgo, MODEL, type AttrSpec, type Ctx, type Doc } from "./build.ts";

/** Id of the candidate's newest attribute carrying keyword `kw`. Throws if none, so reasons can never cite thin air. */
function ref(ctx: Ctx, slug: string, kw: string): string {
  const hits = ctx.attributes.filter((a) => a.data.candidateId === `cand_${slug}` && ctx.keywords[a.id].toLowerCase() === kw.toLowerCase());
  if (!hits.length) throw new Error(`no attribute ${slug}/${kw}`);
  return hits.sort((a, b) => b.data.observedAt.getTime() - a.data.observedAt.getTime())[0].id;
}

type Cite = [text: string, kws: string[]];
type Align = [requirement: string, evidence: string, kind: AlignmentKind, kws: string[]];
interface Spec { role: string; cand: string; rank: number; f: Cite[]; a: Cite[]; align: Align[]; q: string[] }

const SPECS: Spec[] = [
  {
    role: "role_demo_fico", cand: "demo_forgotten", rank: 1,
    f: [
      ["Taught himself S/4HANA Finance and passed the FICO certification", ["S/4HANA", "certification"]],
      ["Wants to move from support into implementation", ["implementation"]],
      ["Calm under pressure, which suits go-live weekends", ["Calm"]],
    ],
    a: [
      ["Asked for R60k minimum. Vantage paid R52k and R55k for its last two hires", ["R60k"]],
      ["His FICO work is support tickets, not a full implementation", ["support tickets"]],
    ],
    align: [
      ["FI/CO configuration on S/4HANA", "Passed the FICO certification; configuration is inferred, his hands-on work is support tickets", "interpreted", ["certification", "support tickets"]],
      ["Group reporting", "No mention in his notes", "not-seen", []],
      ["Asset accounting", "No mention in his notes", "not-seen", []],
    ],
    q: ["Is R60k firm, given Vantage's budget of R52k to R55k?", "Which S/4HANA FI/CO configuration have you done beyond support tickets?", "Any S/4HANA project work since August 2025?"],
  },
  {
    role: "role_demo_fico", cand: "demo_thabo", rank: 2,
    f: [
      ["Led two S/4HANA FI/CO rollouts end to end", ["rollouts"]],
      ["Wants implementation projects, not tickets", ["implementation"]],
    ],
    a: [["Wants R65k, above the R55k budget", ["R65k"]]],
    align: [
      ["FI/CO configuration on S/4HANA", "Led two S/4HANA FI/CO rollouts end to end", "stated", ["rollouts"]],
      ["Group reporting", "Group reporting at a listed retailer", "stated", ["group reporting"]],
      ["Asset accounting", "No mention in his notes", "not-seen", []],
    ],
    q: ["Would R55k work if the hybrid days are in Durban?", "Can the one-month notice move by two weeks?"],
  },
  {
    role: "role_demo_fico", cand: "lindiwe_khumalo", rank: 3,
    f: [["Strong on group reporting and consolidations", ["group reporting"]], ["Wants a bigger finance transformation project", ["transformation"]]],
    a: [["Salary was around R58k, above the R55k budget, and that is 15 months old", ["R58k"]], ["Six years on ECC, S/4 conversion at her employer is still two years out", ["conversion"]]],
    align: [
      ["FI/CO configuration on S/4HANA", "Six years on ECC; S/4 inferred as a short step", "interpreted", ["ECC"]],
      ["Group reporting", "Strong on group reporting and consolidations", "stated", ["group reporting"]],
      ["Asset accounting", "No mention in her notes", "not-seen", []],
    ],
    q: ["What is your salary expectation today?", "Have you touched S/4HANA since we last spoke?"],
  },
  {
    // Plausible but wrong: the title matches, the brief does not.
    role: "role_demo_fico", cand: "kagiso_molefe", rank: 4,
    f: [["Eight years as an SAP FI consultant with asset accounting strength", ["ECC 6.0", "asset accounting"]]],
    a: [
      ["ECC only, never worked on S/4HANA", ["Never"]],
      ["Johannesburg only, will not relocate to Durban or Cape Town", ["Johannesburg"]],
    ],
    align: [
      ["FI/CO configuration on S/4HANA", "ECC 6.0 FI configuration; no S/4HANA seen", "interpreted", ["ECC 6.0"]],
      ["Asset accounting", "Asset accounting a strength", "stated", ["asset accounting"]],
      ["Group reporting", "No mention in his notes", "not-seen", []],
    ],
    q: ["Would you consider Durban or Cape Town?", "Any S/4HANA exposure at all?"],
  },
  {
    role: "role_karoo_oracle_fin", cand: "ayesha_patel", rank: 1,
    f: [["Oracle GL and AP analyst day to day", ["GL and AP"]], ["Used Fusion on her last migration and wants Fusion work full time", ["Fusion", "full time"]]],
    a: [["Mostly EBS; Fusion on a single migration", ["Fusion"]], ["Has not run month-end close alone", ["month-end"]]],
    align: [
      ["Oracle GL and AP", "GL and AP at a Cape Town logistics firm", "stated", ["GL and AP"]],
      ["Oracle Fusion exposure", "Fusion on the last migration", "stated", ["Fusion"]],
      ["Month-end close ownership", "Says she has never run month-end close alone", "interpreted", ["month-end"]],
    ],
    q: ["How much of the Fusion migration did you own?", "Is R78k still right?"],
  },
  {
    role: "role_karoo_oracle_fin", cand: "fatima_ebrahim", rank: 2,
    f: [["Oracle GL and AP lead on a team of three", ["GL and AP"]], ["One Fusion migration behind her", ["Fusion"]]],
    a: [["Wants to lead a team, and this is a hands-on analyst role", ["lead a team"]], ["Salary around R82k is 18 months old", ["R82k"]]],
    align: [
      ["Oracle GL and AP", "GL and AP lead", "stated", ["GL and AP"]],
      ["Oracle Fusion exposure", "One Fusion migration", "stated", ["Fusion"]],
      ["Month-end close ownership", "No mention in her notes", "not-seen", []],
    ],
    q: ["Would you take an analyst seat without a team to lead?", "What is your salary expectation today?"],
  },
  {
    role: "role_bluewater_netsuite", cand: "nomvula_zulu", rank: 1,
    f: [["Writes SuiteScript for saved searches and approvals", ["SuiteScript"]], ["Would move for remote work, which this role is", ["remote"]]],
    a: [["Wants R55k to move, above the R48k budget", ["R55k"]]],
    align: [
      ["NetSuite administration", "NetSuite administrator at Vantage", "stated", ["administrator"]],
      ["SuiteScript", "Writes SuiteScript for saved searches and approvals", "stated", ["SuiteScript"]],
      ["Approval workflows", "Approvals scripted in SuiteScript", "interpreted", ["SuiteScript"]],
    ],
    q: ["Would R48k plus a remote setup be enough to move?", "You were placed at Vantage in January. Are you really looking?"],
  },
  {
    role: "role_bluewater_netsuite", cand: "devan_naicker", rank: 2,
    f: [["Hands-on NetSuite administrator", ["NetSuite"]], ["Salary around R46k fits the R48k budget", ["R46k"]]],
    a: [["Happier on-site, and this role is fully remote", ["on-site"]]],
    align: [
      ["NetSuite administration", "Hands-on with NetSuite day to day", "stated", ["NetSuite"]],
      ["SuiteScript", "Strong on SuiteScript", "stated", ["SuiteScript"]],
      ["Approval workflows", "No mention in his notes", "not-seen", []],
    ],
    q: ["Have you worked remotely full time before?"],
  },
  {
    role: "role_protea_abap", cand: "sandile_cele", rank: 1,
    f: [["Hands-on ABAP developer", ["ABAP"]], ["Fiori in his toolkit", ["Fiori"]], ["Salary around R32k fits the R35k budget", ["R32k"]]],
    a: [["Happier on-site, and this role is hybrid", ["on-site"]]],
    align: [
      ["ABAP", "Hands-on with ABAP day to day", "stated", ["ABAP"]],
      ["Fiori", "Strong on ABAP and Fiori", "stated", ["Fiori"]],
    ],
    q: ["Are you comfortable with two days a week from home?", "Would you move from Durban to Cape Town?"],
  },
  {
    role: "role_protea_abap", cand: "palesa_mokwena", rank: 2,
    f: [["Experienced ABAP developer", ["ABAP"]], ["Fiori exposure", ["Fiori"]]],
    a: [["Expects R52k, well above the R35k junior budget", ["R52k"]], ["Prefers remote, would only go hybrid", ["remote"]]],
    align: [
      ["ABAP", "Strong on ABAP", "stated", ["ABAP"]],
      ["Fiori", "Fiori listed alongside ABAP", "interpreted", ["Fiori"]],
    ],
    q: ["Would you take a junior-level salary?", "Where are you based, and would you relocate?"],
  },
  {
    // The nine-month pool candidate needs a role he came close to, or course-suggest has nothing to count (SD-13).
    role: "role_protea_abap", cand: "ruan_botha", rank: 3,
    f: [["ABAP reports and enhancements day to day", ["ECC only"]], ["Wants to learn Fiori, which this team builds", ["Fiori"]]],
    a: [["Around R48k, above the R35k junior budget", ["R48k"]], ["No Fiori yet, only wants to learn it", ["Fiori"]]],
    align: [
      ["ABAP", "ABAP developer, ECC only, reports and enhancements", "stated", ["ECC only"]],
      ["Fiori", "Wants to learn Fiori; none yet", "not-seen", []],
    ],
    q: ["Would you take a junior-level salary to learn Fiori?", "Have you built any Fiori app, even a small one?"],
  },
  {
    role: "role_vantage_sap_pm", cand: "pieter_van_wyk", rank: 1,
    f: [["Two S/4HANA rollouts for retail clients", ["rollouts"]], ["Runs a tight steering committee, calm with sponsors", ["steering"]]],
    a: [["Said he is open to contract work, and this role is permanent", ["contract"]], ["Free only after the January go-live", ["go-live"]]],
    align: [
      ["SAP rollout project management", "SAP project manager with two S/4HANA rollouts", "stated", ["project manager", "rollouts"]],
      ["Retail or logistics background", "Rollouts were for retail clients", "interpreted", ["rollouts"]],
    ],
    q: ["Would you take this as permanent rather than contract?", "Can you start before the January go-live?"],
  },
  {
    role: "role_vantage_sap_pm", cand: "chantelle_oosthuizen", rank: 2,
    f: [["Hands-on project management", ["project management"]], ["Stakeholder reporting experience", ["stakeholder reporting"]]],
    a: [["Prefers hybrid, and this role is on-site in Durban", ["Hybrid"]], ["Commute is a problem for her", ["commute"]]],
    align: [
      ["SAP rollout project management", "General project management; SAP rollouts not mentioned", "interpreted", ["project management"]],
      ["Retail or logistics background", "No mention in her notes", "not-seen", []],
    ],
    q: ["Have you run an SAP rollout?", "Would you work on-site in Durban?"],
  },
];

export function buildMatches(ctx: Ctx, candidates: Doc<Candidate>[]): Doc<Match>[] {
  const cite = (slug: string, [text, kws]: Cite) => ({ text, attributeIds: kws.map((k) => ref(ctx, slug, k)) });
  return SPECS.map((s) => {
    const alignment = s.align.map(([requirement, evidence, kind, kws]) => ({ requirement, evidence, kind, attributeIds: kws.map((k) => ref(ctx, s.cand, k)) }));
    const reasonsFor = s.f.map((c) => cite(s.cand, c)), reasonsAgainst = s.a.map((c) => cite(s.cand, c));
    const ids = new Set([...reasonsFor, ...reasonsAgainst, ...alignment].flatMap((r) => r.attributeIds));
    // Staleness is the age of the oldest perishable fact cited (data-model.md): salary, availability, work mode, current work.
    const perishable = ctx.attributes.filter((a) => ids.has(a.id) && isPerishable(a.data.type)).map((a) => a.data.observedAt.getTime());
    const evidenceAgeDays = perishable.length ? Math.floor((ctx.now.getTime() - Math.min(...perishable)) / DAY) : 0;
    const opened = candidates.find((c) => c.id === `cand_${s.cand}`)?.data.lastOpenedAt;
    const generatedAt = daysAgo(ctx.now, 7);
    return {
      id: `match_${s.role}_${s.cand}`,
      data: {
        ownerUid: ctx.owner, createdAt: generatedAt, updatedAt: generatedAt, roleId: s.role, candidateId: `cand_${s.cand}`, rank: s.rank,
        reasonsFor, reasonsAgainst, skillAlignment: alignment, questionsToAsk: s.q, evidenceAgeDays,
        staleness: evidenceAgeDays < 183 ? "fresh" : evidenceAgeDays <= 365 ? "ageing" : "stale",
        forgotten: !!opened && ctx.now.getTime() - opened.getTime() > 183 * DAY, generatedAt, modelVersion: MODEL,
      },
    };
  });
}

// [slug, role, candidate, company, decision, codes, text, daysAgo, updates: [type, value, phrase, kw][]]
type OvRow = [string, string, string, string, Override["decision"], string[], string, number, ["salary" | "availability", string, string, string][]];
const OVERRIDES: OvRow[] = [
  ["fatima_oracle", "role_karoo_oracle_fin", "fatima_ebrahim", "co_karoo_health", "reject", ["wants-leadership"],
    "Wants to lead a team and this is a hands-on role. Her salary is now R85k.", 2, [["salary", "R85k", "R85k", "R85k"]]],
  ["nomvula_netsuite", "role_bluewater_netsuite", "nomvula_zulu", "co_bluewater_fintech", "shortlist", ["strong-fit"],
    "Strong SuiteScript. She says she is available from December.", 4, [["availability", "Available from December", "available from December", "December"]]],
  ["ayesha_oracle", "role_karoo_oracle_fin", "ayesha_patel", "co_karoo_health", "shortlist", ["fusion-enough"],
    "Fusion on the last migration is enough. Shortlisting.", 5, []],
  ["kagiso_fico", "role_demo_fico", "kagiso_molefe", "co_demo_vantage", "reject", ["no-s4-hands-on", "location"],
    "ECC only and will not relocate to Durban. Vantage already turned him down once for the same reason.", 1, []],
];

export function buildOverrides(ctx: Ctx): Doc<Override>[] {
  return OVERRIDES.map(([slug, roleId, cand, companyId, decision, reasonCodes, reasonText, d, ups]) => {
    const id = `ov_${slug}`, matchId = `match_${roleId}_${cand}`, decidedAt = daysAgo(ctx.now, d);
    ups.forEach(([type, value, phrase, kw], i) => {
      const spec: AttrSpec = [type, value, phrase, kw, 0.95];
      addAttribute(ctx, `attr_override_${slug}_${i}`, {
        candidateId: `cand_${cand}`, sourceType: "override", overrideId: id, type, value, confidence: 0.95, observedAt: decidedAt, confirmedByRecruiter: true,
      }, reasonText, spec);
    });
    return {
      id,
      data: {
        ownerUid: ctx.owner, createdAt: decidedAt, updatedAt: decidedAt, matchId, roleId,
        candidateId: `cand_${cand}`, companyId, decision, reasonCodes, reasonText, decidedAt,
        ...(ups.length ? { updates: ups.map(([type, value]) => ({ type, value })) } : {}),
      },
    };
  });
}

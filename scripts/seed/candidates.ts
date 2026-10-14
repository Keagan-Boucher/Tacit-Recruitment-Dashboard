import { addNote, buildCandidates, sec, type AttrSpec, type CandRow, type Ctx } from "./build.ts";

const Q = {
  now: "Where are you now?", leave: "Why are you looking to leave?", mode: "Remote, hybrid or on-site?",
  pay: "Salary and notice", team: "Team and culture", no: "Why should we not give you the job?",
};
const sk = (v: string, phrase: string, kw: string, c = 0.85): AttrSpec => ["skill", v, phrase, kw, c];

/** Hand-written people: the demo, the edge cases and the Figma frames. */
function heroes(ctx: Ctx): CandRow[] {
  const n = (slug: string, i: number, m: number, s: ReturnType<typeof sec>[], o = {}) => addNote(ctx, slug, i, m, s, o);

  // Thabo: current, strong, but over budget. Latest note's six attributes are still unconfirmed.
  n("demo_thabo", 1, 1.3, [sec(Q.now, "First call. Finance systems support at Sable Insurance, six years. Quiet, precise. Mentioned the S/4HANA migration but moved on quickly.",
    ["signal", "Six years in finance systems support", "Finance systems support at Sable Insurance, six years", "Sable", 0.8])]);
  n("demo_thabo", 2, 0.1, [
    sec(Q.now, "Still at Sable Insurance supporting their ECC finance module, bored. Configured the new S/4HANA FI/CO company codes himself during the migration. Led two S/4HANA FI/CO rollouts end to end at a previous employer. Did group reporting for a listed retailer. Owns month-end close in SAP end to end.",
      sk("Led two S/4HANA FI/CO rollouts end to end", "Led two S/4HANA FI/CO rollouts end to end", "rollouts", 0.88),
      sk("Group reporting at a listed retailer", "Did group reporting for a listed retailer", "group reporting", 0.82)),
    sec(Q.leave, "Wants implementation projects, not tickets.", ["motivation", "Wants implementation projects", "Wants implementation projects, not tickets", "implementation", 0.9]),
    sec(Q.mode, "Won't relocate to Joburg, open to hybrid in Durban.", ["work-mode", "Hybrid in Durban", "open to hybrid in Durban", "hybrid", 0.9]),
    sec(Q.pay, "Expects around R65k, notice is a calendar month. Asked if the notice can move, he said it can, by two weeks.",
      ["salary", "R65k", "around R65k", "R65k", 0.92], ["availability", "One calendar month notice", "notice is a calendar month", "notice", 0.85]),
  ], { unconfirmed: true, role: "role_demo_fico" });

  // Sipho: the forgotten candidate (R-11). Notes run oldest first.
  n("demo_forgotten", 1, 31, [sec(Q.now, "Quick catch-up. Just promoted to SAP support lead at Lumen, happy for now. Doing an SAP Activate course in the evenings. Not looking.",
    sk("SAP Activate course (in progress)", "Doing an SAP Activate course in the evenings", "Activate", 0.8),
    ["availability", "Not looking (March 2024)", "Not looking", "Not looking", 0.6])]);
  n("demo_forgotten", 2, 14, [
    sec(Q.now, "SAP support lead at Lumen Telecoms since last year, four years at the company. Interviewed for the support manager role, wrong fit honestly. Taught himself S/4HANA Finance over the last year and passed the FICO certification on his own.",
      sk("SAP support lead experience", "SAP support lead at Lumen Telecoms", "Lumen", 0.9),
      sk("S/4HANA Finance (self-taught)", "Taught himself S/4HANA Finance over the last year", "S/4HANA", 0.86),
      sk("FICO certification (passed)", "passed the FICO certification on his own", "certification", 0.9)),
    sec(Q.leave, "Wants out of support, wants implementation projects.", ["motivation", "Wants implementation work, not support", "Wants out of support, wants implementation projects", "implementation", 0.88]),
    sec(Q.pay, "Wants R60k minimum for a move. Notice is one month.",
      ["salary", "R60k minimum", "Wants R60k minimum for a move", "R60k", 0.9], ["availability", "One month notice", "Notice is one month", "Notice", 0.8]),
    sec(Q.team, "Calm under pressure, explains clearly.", ["team-culture", "Calm under pressure", "Calm under pressure, explains clearly", "Calm", 0.75]),
    sec(Q.no, "His FICO work is support tickets, not a full implementation.",
      ["signal", "FICO work is support tickets, not a full implementation", "His FICO work is support tickets, not a full implementation", "support tickets", 0.82]),
  ], { role: "role_karoo_support_mgr" });

  // Stale records.
  n("lindiwe_khumalo", 1, 22, [sec(Q.now, "First call. SAP FICO analyst at a Durban manufacturer, S/4 conversion is two years away.", ["signal", "S/4 conversion two years away", "S/4 conversion is two years away", "conversion", 0.7])]);
  n("lindiwe_khumalo", 2, 15, [
    sec(Q.now, "SAP FICO analyst at a Durban manufacturer, six years on ECC. Strong on group reporting and consolidations.",
      sk("SAP FICO (ECC)", "six years on ECC", "ECC"), sk("Group reporting", "Strong on group reporting and consolidations", "group reporting", 0.9)),
    sec(Q.leave, "Wants a bigger finance transformation project.", ["motivation", "Wants a finance transformation project", "Wants a bigger finance transformation project", "transformation", 0.85]),
    sec(Q.pay, "Salary is around R58k, notice two months.",
      ["salary", "Around R58k", "around R58k", "R58k", 0.85], ["availability", "Two months notice", "notice two months", "notice", 0.8]),
  ]);
  n("fatima_ebrahim", 1, 23, [sec(Q.now, "First call. Oracle EBS analyst, GL and AP, steady.", sk("Oracle EBS analyst", "Oracle EBS analyst", "EBS"))]);
  n("fatima_ebrahim", 2, 18, [
    sec(Q.now, "Oracle Financials GL and AP lead on a team of three at a Cape Town retailer. EBS today, one Fusion migration.",
      sk("Oracle GL and AP", "GL and AP lead", "GL and AP"), sk("Oracle Fusion migration (one)", "one Fusion migration", "Fusion", 0.8)),
    sec(Q.leave, "Wants to lead a team.", ["motivation", "Wants to lead a team", "Wants to lead a team", "lead a team", 0.9]),
    sec(Q.pay, "Around R82k, notice one month.", ["salary", "Around R82k", "Around R82k", "R82k", 0.85], ["availability", "One month notice", "notice one month", "notice", 0.8]),
  ]);

  // Pieter: recent catch-up, but "open to contract work" is 13 months old.
  n("pieter_van_wyk", 1, 13, [
    sec(Q.now, "SAP project manager, two S/4HANA rollouts for retail clients.", sk("SAP project management", "SAP project manager", "project manager"), sk("S/4HANA rollouts for retail", "two S/4HANA rollouts for retail clients", "rollouts")),
    sec(Q.mode, "Open to contract work.", ["work-mode", "Open to contract work", "Open to contract work", "contract", 0.85]),
    sec(Q.pay, "Wants R88k, notice is two months.", ["salary", "R88k", "Wants R88k", "R88k"], ["availability", "Two months notice", "notice is two months", "notice", 0.8]),
  ]);
  n("pieter_van_wyk", 2, 1.8, [
    sec(Q.now, "Catch-up. Finishing a rollout at a Pretoria retailer, go-live in January.", ["availability", "Free after January go-live", "go-live in January", "go-live", 0.8]),
    sec(Q.team, "Runs a tight steering committee, calm with sponsors.", ["team-culture", "Runs a tight steering committee", "Runs a tight steering committee", "steering", 0.8]),
  ]);

  n("ayesha_patel", 1, 20, [sec(Q.now, "First call. Oracle EBS analyst, solid on AP.", sk("Oracle EBS (AP)", "solid on AP", "AP", 0.8))]);
  n("ayesha_patel", 2, 9, [
    sec(Q.now, "Oracle Financials analyst, GL and AP at a Cape Town logistics firm. Oracle EBS day to day, Fusion on the last migration.",
      sk("Oracle EBS day to day", "Oracle EBS day to day", "EBS"), sk("Oracle Fusion (last migration)", "Fusion on the last migration", "Fusion", 0.8),
      sk("Oracle GL and AP", "GL and AP", "GL and AP")),
    sec(Q.leave, "Wants Oracle Fusion work full time.", ["motivation", "Wants Fusion work full time", "Wants Oracle Fusion work full time", "full time", 0.85]),
    sec(Q.mode, "Hybrid is fine, based in Cape Town.", ["work-mode", "Hybrid, Cape Town", "Hybrid is fine, based in Cape Town", "Hybrid", 0.9]),
    sec(Q.pay, "Expects R78k, notice is one month.", ["salary", "R78k", "Expects R78k", "R78k", 0.9], ["availability", "One month notice", "notice is one month", "notice", 0.85]),
    sec(Q.no, "Says she has never run month-end close alone.", ["signal", "Has not run month-end close alone", "never run month-end close alone", "month-end", 0.8]),
  ]);

  n("nomvula_zulu", 1, 11, [sec(Q.now, "First call. NetSuite administrator, Durban, writes SuiteScript for approvals.", sk("NetSuite administrator", "NetSuite administrator", "NetSuite"))]);
  n("nomvula_zulu", 2, 0.5, [
    sec(Q.now, "NetSuite administrator at Vantage, placed in January. Writes SuiteScript for saved searches and approvals.",
      sk("SuiteScript", "Writes SuiteScript for saved searches and approvals", "SuiteScript", 0.9), sk("NetSuite administration", "NetSuite administrator at Vantage", "administrator")),
    sec(Q.leave, "Happy at Vantage, would only move for remote work.", ["constraint", "Would only move for remote work", "would only move for remote work", "remote", 0.85]),
    sec(Q.pay, "Now on R52k, would want R55k to move.", ["salary", "R55k to move", "R55k to move", "R55k", 0.9]),
  ]);

  n("johan_pretorius", 1, 5, [
    sec(Q.now, "SAP finance solution architect, S/4HANA greenfield design for a mining group. Moved from FI consultant to architect in four years.",
      sk("S/4HANA greenfield design", "S/4HANA greenfield design", "greenfield"), sk("Solution architecture", "solution architect", "architect"),
      ["trajectory", "FI consultant to architect in four years", "Moved from FI consultant to architect in four years", "four years", 0.8]),
    sec(Q.pay, "Wants R95k, notice is three months.", ["salary", "R95k", "Wants R95k", "R95k"], ["availability", "Three months notice", "notice is three months", "notice", 0.8]),
  ]);

  // Plausible but wrong for the FICO brief: ECC only, Johannesburg only, and Vantage already turned him down once.
  n("kagiso_molefe", 1, 21, [sec(Q.now, "First call. FI consultant at a Joburg bank, asset accounting a strength.", sk("Asset accounting", "asset accounting a strength", "asset accounting"))]);
  n("kagiso_molefe", 2, 12.4, [
    sec(Q.now, "SAP FI consultant, eight years on ECC 6.0. Never worked on S/4HANA.",
      sk("SAP FI consultant (ECC 6.0)", "eight years on ECC 6.0", "ECC 6.0"), ["signal", "No S/4HANA experience", "Never worked on S/4HANA", "Never", 0.88]),
    sec(Q.mode, "Johannesburg only, will not relocate to Durban.", ["location", "Johannesburg only, will not relocate", "Johannesburg only, will not relocate to Durban", "Johannesburg", 0.92]),
    sec(Q.pay, "Wants R56k, notice is one month.", ["salary", "R56k", "Wants R56k", "R56k"], ["availability", "One month notice", "notice is one month", "notice", 0.8]),
  ]);

  n("ruan_botha", 1, 13, [
    sec(Q.now, "SAP ABAP developer, ECC only, reports and enhancements.", sk("ABAP (ECC only)", "ECC only, reports and enhancements", "ECC only")),
    sec(Q.leave, "Wants to learn Fiori.", ["motivation", "Wants to learn Fiori", "Wants to learn Fiori", "Fiori", 0.8]),
    sec(Q.pay, "Around R48k.", ["salary", "Around R48k", "Around R48k", "R48k"]),
  ]);

  // Placed candidates (give the placement history real people behind it).
  n("busisiwe_ndlovu", 1, 17, [
    sec(Q.now, "Oracle EBS finance systems lead, Cape Town. Looking for a lead role.", sk("Oracle EBS finance systems", "Oracle EBS finance systems lead", "EBS")),
    sec(Q.pay, "Wants R78k, notice two months.", ["salary", "R78k", "Wants R78k", "R78k"], ["availability", "Two months notice", "notice two months", "notice", 0.8]),
  ]);
  n("busisiwe_ndlovu", 2, 3, [sec(Q.now, "Check-in. Settled at Karoo, building a small team.", ["signal", "Settled, building a small team", "Settled at Karoo, building a small team", "Settled", 0.85])]);
  n("bongani_sithole", 1, 20, [
    sec(Q.now, "SAP FI analyst, four years on ECC at a Durban distributor. Ready for a consultant seat.", sk("SAP FI analyst", "SAP FI analyst", "FI analyst"), ["motivation", "Ready for a consultant seat", "Ready for a consultant seat", "consultant seat", 0.8]),
    sec(Q.pay, "Wants R52k, notice one month.", ["salary", "R52k", "Wants R52k", "R52k"], ["availability", "One month notice", "notice one month", "notice", 0.8]),
  ]);
  n("anele_jacobs", 1, 15, [
    sec(Q.now, "SAP MM consultant, procurement and inventory at a Durban chemicals group.", sk("SAP MM consultant", "SAP MM consultant", "MM consultant")),
    sec(Q.pay, "Wants R55k, notice is one month.", ["salary", "R55k", "Wants R55k", "R55k"], ["availability", "One month notice", "notice is one month", "notice", 0.8]),
  ]);

  return [
    { slug: "demo_thabo", name: "Thabo Nkosi", headline: "Finance systems analyst", location: "Durban", opened: 0.03, cv: {
      history: [{ title: "Finance systems analyst", company: "Sable Insurance", from: "2020" }, { title: "Junior SAP FI analyst", company: "Coastal Freight", from: "2017", to: "2020" }],
      education: ["BCom Information Systems, University of KwaZulu-Natal, 2016"], skills: ["SAP ECC FI", "S/4HANA FI/CO", "Month-end close", "Excel"], salaryExpectation: "R65k a month" } },
    { slug: "demo_forgotten", name: "Sipho Mabaso", headline: "SAP support lead", location: "Cape Town", opened: 14, cv: {
      history: [{ title: "SAP support lead", company: "Lumen Telecoms", from: "2021" }, { title: "SAP FI support analyst", company: "Lumen Telecoms", from: "2018", to: "2021" }],
      education: ["BCom Accounting, University of the Western Cape, 2017"], skills: ["SAP ECC FI", "SAP CO", "Solution Manager", "Excel", "SQL"], fileName: "sipho-mabaso-cv.pdf" } },
    { slug: "lindiwe_khumalo", name: "Lindiwe Khumalo", headline: "SAP FICO analyst", location: "Durban", opened: 11 },
    { slug: "fatima_ebrahim", name: "Fatima Ebrahim", headline: "Oracle Financials team lead", location: "Cape Town", opened: 17 },
    { slug: "pieter_van_wyk", name: "Pieter van Wyk", headline: "SAP project manager", location: "Pretoria" },
    { slug: "ayesha_patel", name: "Ayesha Patel", headline: "Oracle Financials analyst", location: "Cape Town", opened: 8 },
    { slug: "nomvula_zulu", name: "Nomvula Zulu", headline: "NetSuite administrator", location: "Durban" },
    { slug: "johan_pretorius", name: "Johan Pretorius", headline: "SAP finance solution architect", location: "Centurion" },
    { slug: "kagiso_molefe", name: "Kagiso Molefe", headline: "SAP FI consultant", location: "Johannesburg", opened: 10 },
    { slug: "ruan_botha", name: "Ruan Botha", headline: "SAP ABAP developer", location: "Stellenbosch", opened: 12 },
    { slug: "busisiwe_ndlovu", name: "Busisiwe Ndlovu", headline: "Finance systems lead", location: "Cape Town" },
    { slug: "bongani_sithole", name: "Bongani Sithole", headline: "SAP FI analyst", location: "Durban", opened: 18 },
    { slug: "anele_jacobs", name: "Anele Jacobs", headline: "SAP MM consultant", location: "Durban", opened: 13 },
  ];
}

const SETS: Record<string, [string, string]> = {
  FI: ["SAP FI", "SAP CO"], MM: ["SAP MM", "S/4HANA"], SD: ["SAP SD", "pricing"], ABAP: ["ABAP", "Fiori"],
  SF: ["SuccessFactors", "Employee Central"], ORA: ["Oracle Financials", "Oracle GL"], NS: ["NetSuite", "SuiteScript"],
  PM: ["project management", "stakeholder reporting"], DEV: ["TypeScript", "React"], DEV2: ["Python", "Azure"],
};
const SAP = new Set(["FI", "MM", "SD", "ABAP", "SF"]);
const EMP = ["a Durban manufacturer", "a Johannesburg bank", "a Cape Town retailer", "a Pretoria utility", "a mining group", "a logistics firm", "an insurer", "a telecoms provider"];
// [text, type, value, keyword]
type Pool = [string, AttrSpec[0], string, string];
const LEAVE: Pool[] = [
  ["Wants implementation projects, not tickets.", "motivation", "Wants implementation work", "implementation"],
  ["Left after a restructure, no hard feelings.", "reason-for-leaving", "Restructure", "restructure"],
  ["Wants to lead a small team.", "motivation", "Wants to lead a team", "lead a small team"],
  ["Contract ending, would like permanent.", "reason-for-leaving", "Contract ending", "Contract ending"],
  ["Bored, nothing new to build.", "reason-for-leaving", "Bored, no new work", "Bored"],
  ["Wants more S/4HANA exposure.", "motivation", "Wants S/4HANA exposure", "S/4HANA exposure"],
  ["Commute is too long.", "constraint", "Long commute", "commute"],
];
const MODE: Pool[] = [
  ["Prefers remote, would go hybrid.", "work-mode", "Remote preferred", "remote"],
  ["Hybrid is fine, two days in the office.", "work-mode", "Hybrid", "Hybrid"],
  ["Happy on-site.", "work-mode", "On-site", "on-site"],
  ["Won't relocate.", "location", "Will not relocate", "relocate"],
];
const CULT: Pool[] = [
  ["Likes small teams and direct communication.", "team-culture", "Small team, direct communication", "small teams"],
  ["Wants clear process and documentation.", "team-culture", "Wants clear process", "process"],
  ["Quiet but dependable under pressure.", "team-culture", "Dependable under pressure", "dependable"],
  ["Does best with a close client relationship.", "team-culture", "Close client relationship", "client"],
];
const NO: Pool[] = [
  ["Can be slow to delegate.", "signal", "Slow to delegate", "delegate"],
  ["Has not led a team before.", "signal", "No team lead experience", "led a team"],
  ["Gets impatient with long approval chains.", "signal", "Impatient with approvals", "impatient"],
];
const NOTICE = ["one month", "a calendar month", "two months", "three months"];
const pool = ([text, type, value, kw]: Pool, conf = 0.8): AttrSpec => [type, value, text.replace(/\.$/, ""), kw, conf];

// [name, headline, location, skill set, salary (k), months ago per note oldest-first, options]
type Gen = [string, string, string, string, number, number[], { leave?: number; mode?: number; parse?: CandRow["parse"] }?];
const GEN: Gen[] = [
  ["Zanele Dube", "Oracle Financials analyst", "Johannesburg", "ORA", 72, [19, 10, 3], { parse: ["failed", 0] }],
  ["Marius Steyn", "SAP MM consultant", "Pretoria", "MM", 62, [22, 12], { parse: ["flagged", 0.54] }],
  ["Neo Radebe", "SAP FI consultant", "Johannesburg", "FI", 64, [14, 8, 1]],
  ["Craig Fourie", "SAP SD consultant", "Durban", "SD", 60, [23, 15]],
  ["Palesa Mokwena", "SAP ABAP developer", "Johannesburg", "ABAP", 52, [17, 9, 4]],
  ["Tshepo Maseko", "SuccessFactors consultant", "Johannesburg", "SF", 68, [21, 6]],
  ["Karen Botes", "NetSuite administrator", "Cape Town", "NS", 50, [13, 7, 0.8]],
  ["Imraan Davids", "Oracle Financials consultant", "Cape Town", "ORA", 82, [18, 11]],
  ["Lwazi Mthembu", "SAP FICO consultant", "Durban", "FI", 58, [20, 12, 5]],
  ["Chantelle Oosthuizen", "SAP project manager", "Stellenbosch", "PM", 85, [16, 2]],
  ["Sandile Cele", "Junior ABAP developer", "Durban", "ABAP", 32, [15, 9, 3]],
  ["Megan Pillay", "NetSuite consultant", "Johannesburg", "NS", 55, [24, 13]],
  ["Jabu Khoza", "SAP MM analyst", "Durban", "MM", 45, [12.6, 7, 1.5]],
  ["Riaan Coetzee", "Software developer", "Stellenbosch", "DEV", 60, [22, 10]],
  ["Naledi Sebola", "Software developer", "Cape Town", "DEV2", 58, [19, 8, 0.3]],
  ["Yusuf Hendricks", "SAP SD analyst", "Cape Town", "SD", 48, [14, 6]],
  ["Refilwe Tau", "SuccessFactors analyst", "Pretoria", "SF", 54, [23, 16, 9]],
  ["Dumisani Nxumalo", "Oracle Financials analyst", "Durban", "ORA", 70, [11, 4]],
  ["Annelie Visagie", "Project manager, ERP", "Cape Town", "PM", 78, [18, 10, 2.5]],
  ["Kabelo Mahlangu", "SAP FI analyst", "Johannesburg", "FI", 47, [20, 5]],
  ["Sarah Mitchell", "NetSuite administrator", "Johannesburg", "NS", 49, [21, 13, 6]],
  ["Themba Ngcobo", "SAP ABAP developer", "Pretoria", "ABAP", 66, [9, 1]],
  ["Louise Kruger", "SAP SD consultant", "Pretoria", "SD", 72, [17, 12.8, 3.5]],
  ["Mpho Letsoalo", "SAP FICO analyst", "Johannesburg", "FI", 61, [15, 7]],
  ["Vusi Dlamini", "Software developer", "Durban", "DEV", 64, [22, 14, 2]],
  ["Hannah Roberts", "SAP MM consultant", "Cape Town", "MM", 69, [10, 0.6]],
  ["Devan Naicker", "NetSuite administrator", "Durban", "NS", 46, [13, 5, 1], { mode: 2 }],
];

function generated(ctx: Ctx): CandRow[] {
  return GEN.map(([name, headline, location, set, sal, ages, o], i) => {
    const slug = name.toLowerCase().replace(/ /g, "_");
    const [s1, s2] = SETS[set];
    const leaves = SAP.has(set) ? LEAVE : LEAVE.filter((_, k) => k !== 0 && k !== 5);
    const L = leaves[o?.leave ?? i % leaves.length], M = MODE[o?.mode ?? i % MODE.length];
    const emp = EMP[i % EMP.length], notice = NOTICE[i % NOTICE.length];
    ages.forEach((m, j) => {
      const n = j + 1;
      if (n === 1) addNote(ctx, slug, n, m, [
        sec(Q.now, `At ${emp}, ${3 + (i % 7)} years. Strong on ${s1} and ${s2}.`, sk(s1, s1, s1), sk(s2, s2, s2)),
        sec(Q.leave, L[0], pool(L)),
        sec(Q.mode, M[0], pool(M)),
        sec(Q.pay, `Expects around R${sal}k, notice is ${notice}.`,
          ["salary", `R${sal}k`, `around R${sal}k`, `R${sal}k`, 0.88], ["availability", `${notice} notice`, `notice is ${notice}`, "notice"]),
      ]);
      else if (n === 2) addNote(ctx, slug, n, m, [
        sec(Q.now, `Catch-up. Still at ${emp}, hands-on with ${s1} day to day.`, sk(`${s1} (hands-on)`, `hands-on with ${s1}`, s1)),
        sec(Q.pay, `Now around R${sal + 3}k.`, ["salary", `R${sal + 3}k`, `around R${sal + 3}k`, `R${sal + 3}k`, 0.85]),
      ]);
      else addNote(ctx, slug, n, m, [
        sec(Q.team, CULT[i % CULT.length][0], pool(CULT[i % CULT.length])),
        sec(Q.no, NO[i % NO.length][0], pool(NO[i % NO.length])),
      ]);
    });
    return { slug, name, headline, location, ...(o?.parse ? { parse: o.parse } : {}) };
  });
}

export function buildPeople(ctx: Ctx) {
  return buildCandidates(ctx, [...heroes(ctx), ...generated(ctx)]);
}

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { CompanyFact, type CandidateUpdate, type ShortlistEntry, type Submission, type Attribute, type Candidate, type Company, type InterviewNote, type Match, type Override, type Placement, type Role } from "@tacit/shared";
import { DAY } from "./build.ts";
import { buildDataset } from "./dataset.ts";
import { PLACEHOLDER_ACCOUNTS } from "./portal.ts";

const now = new Date("2026-10-26T09:00:00Z");
const d = buildDataset(now, "owner-test");
const cands = d.candidates as { id: string; data: Candidate }[];
const notes = d.interviewNotes as { id: string; data: InterviewNote }[];
const attrs = d.attributes as { id: string; data: Attribute }[];
const roles = d.roles as { id: string; data: Role }[];
const matches = d.matches as { id: string; data: Match }[];
const overrides = d.overrides as { id: string; data: Override }[];
const placements = d.placements as { id: string; data: Placement }[];
const companies = d.companies as { id: string; data: Company }[];
const ids = (docs: { id: string }[]) => new Set(docs.map((x) => x.id));
const months = (date: Date) => (now.getTime() - date.getTime()) / DAY / 30.4375;
const cand = (id: string) => cands.find((c) => c.id === id)!.data;

test("counts are in the planned range", () => {
  assert.equal(cands.length, 41); // 40 + Lerato
  assert.equal(companies.length, 8);
  assert.equal(roles.length, 12);
  assert.ok(notes.length >= 85 && notes.length <= 95, `notes ${notes.length}`);
  assert.deepEqual(["open", "filled", "expired"].map((s) => roles.filter((r) => r.data.status === s).length), [6, 4, 2]);
});

test("fixed ids exist and ids are unique", () => {
  for (const [list, id] of [[cands, "cand_demo_thabo"], [cands, "cand_demo_forgotten"], [companies, "co_demo_vantage"], [roles, "role_demo_fico"]] as const) assert.ok(ids(list).has(id), id);
  for (const list of [cands, notes, attrs, roles, matches]) assert.equal(ids(list).size, list.length);
  assert.equal(cand("cand_demo_forgotten").fullName, "Sipho Mabaso");
});

test("forgotten candidate: old note, not opened, the right attributes", () => {
  const sipho = cand("cand_demo_forgotten");
  assert.ok(months(sipho.lastInterviewAt!) > 13 && months(sipho.lastInterviewAt!) < 15);
  assert.ok(now.getTime() - sipho.lastOpenedAt!.getTime() > 183 * DAY);
  const mine = attrs.filter((a) => a.data.candidateId === "cand_demo_forgotten").map((a) => a.data);
  const has = (type: string, re: RegExp) => assert.ok(mine.some((a) => a.type === type && re.test(a.value)), `${type} ${re}`);
  has("skill", /S\/4HANA Finance/); has("skill", /FICO certification/); has("motivation", /implementation/);
  has("salary", /R60k/); has("signal", /support tickets/);
  const m = matches.find((x) => x.data.candidateId === "cand_demo_forgotten" && x.data.roleId === "role_demo_fico")!.data;
  assert.equal(m.rank, 1);
  assert.equal(m.forgotten, true);
  assert.equal(m.staleness, "stale");
  assert.ok(m.skillAlignment.some((a) => a.kind === "interpreted") && m.skillAlignment.some((a) => a.kind === "not-seen" && /group reporting/i.test(a.requirement)));
});

test("edge cases exist", () => {
  const age = (a: Attribute) => now.getTime() - a.observedAt.getTime();
  assert.ok(attrs.some((a) => (a.data.type === "salary" || a.data.type === "availability") && age(a.data) > 365 * DAY), "stale salary/availability");
  assert.ok(cands.some((c) => c.data.parseStatus === "failed"), "failed parse");
  assert.ok(cands.some((c) => c.data.parseStatus === "flagged" && c.data.parseConfidence < 0.7), "flagged low confidence");
  const wrong = matches.find((m) => m.data.candidateId === "cand_kagiso_molefe" && m.data.roleId === "role_demo_fico")!.data;
  assert.ok(wrong.reasonsFor.length > 0 && wrong.reasonsAgainst.length > 0);
  const vantage = placements.filter((p) => p.data.companyId === "co_demo_vantage").map((p) => p.data);
  assert.ok(vantage.some((p) => p.outcome === "client-rejected" && p.reason.length > 10), "client rejection with reason at Vantage");
  const sap = vantage.filter((p) => p.outcome === "placed" && roles.find((r) => r.id === p.roleId)!.data.title.startsWith("SAP")).sort((a, b) => b.date.getTime() - a.date.getTime());
  assert.match(sap[0].reason, /R55k/); assert.match(sap[1].reason, /R52k/);
  assert.ok(placements.some((p) => p.data.outcome === "withdrew"));
  assert.ok(overrides.length >= 3 && overrides.some((o) => o.data.updates?.length));
});

test("every attribute span slices to text containing its keyword", () => {
  for (const a of attrs) {
    const text = a.data.sourceType === "note" ? notes.find((n) => n.id === a.data.noteId)?.data.rawText : overrides.find((o) => o.id === a.data.overrideId)?.data.reasonText;
    assert.ok(text, `source for ${a.id}`);
    const { start, end } = a.data.sourceSpan;
    const slice = text.slice(start, end);
    assert.ok(slice.length > 0 && end <= text.length, a.id);
    assert.ok(slice.toLowerCase().includes(d.keywords[a.id].toLowerCase()), `${a.id}: "${slice}" lacks "${d.keywords[a.id]}"`);
    assert.equal(a.data.modelVersion, "seed/v1");
  }
});

test("matches: both sides, real citations, three open roles covered", () => {
  const attrIds = ids(attrs);
  for (const { id, data: m } of matches) {
    assert.ok(m.reasonsFor.length && m.reasonsAgainst.length, id);
    for (const r of [...m.reasonsFor, ...m.reasonsAgainst]) for (const a of r.attributeIds) assert.ok(attrIds.has(a), `${id} cites ${a}`);
    for (const al of m.skillAlignment) for (const a of al.attributeIds) assert.ok(attrIds.has(a), `${id} aligns ${a}`);
    assert.ok(m.questionsToAsk.length);
    assert.equal(m.modelVersion, "seed/v1");
    assert.ok(!("score" in m));
  }
  const open = new Set(roles.filter((r) => r.data.status === "open").map((r) => r.id));
  const covered = new Set(matches.map((m) => m.data.roleId));
  assert.ok(covered.has("role_demo_fico") && covered.size >= 3);
  for (const r of covered) assert.ok(open.has(r));
  for (const o of overrides) {
    const m = matches.find((x) => x.id === o.data.matchId);
    assert.ok(m, o.id);
    assert.ok(o.data.decidedAt > m.data.generatedAt, `${o.id} predates its match`);
  }
  assert.deepEqual(open.size - covered.size, 1, "exactly one open role without matches");
  assert.ok(!covered.has("role_umoya_sf"));
  for (const { data: m } of matches) assert.ok(m.skillAlignment.length >= 2);
  const fico = roles.find((r) => r.id === "role_demo_fico")!.data.interpretedBrief!;
  const reqs = [...fico.mustHave, ...fico.niceToHave];
  for (const m of matches.filter((x) => x.data.roleId === "role_demo_fico")) assert.ok(m.data.skillAlignment.every((a) => reqs.includes(a.requirement)), m.id);
  const chrono = (c: string) => notes.filter((n) => n.data.candidateId === c).sort((a, b) => a.id.localeCompare(b.id));
  for (const c of cands) { const l = chrono(c.id); l.forEach((n, i) => i && assert.ok(n.data.capturedAt > l[i - 1].data.capturedAt, `${n.id} out of order`)); }
});

test("seeded brief quotes are verbatim substrings of briefText, aligned to the lists", () => {
  for (const { id, data: r } of roles) {
    const q = r.interpretedBrief?.quotes;
    if (!q) continue;
    assert.equal(q.mustHave.length, r.interpretedBrief!.mustHave.length, id);
    assert.equal(q.niceToHave.length, r.interpretedBrief!.niceToHave.length, id);
    for (const quote of [q.workMode, q.travel, q.budget, q.location, q.seniority, ...q.mustHave, ...q.niceToHave])
      assert.ok(quote === "" || r.briefText.includes(quote), `${id}: "${quote}" not in briefText`);
  }
  assert.ok(roles.find((r) => r.id === "role_demo_fico")!.data.interpretedBrief!.quotes!.workMode);
});

test("company facts parse, are in the past, and Vantage has a stale placements salary fact", () => {
  for (const { id, data: c } of companies) {
    assert.ok(c.facts?.length, id);
    for (const f of c.facts!) { CompanyFact.parse(f); assert.ok(f.observedAt < now, `${id} fact in the future`); }
  }
  const v = companies.find((c) => c.id === "co_demo_vantage")!.data.facts!;
  assert.ok(v.some((f) => f.source === "placements" && /R52k/.test(f.text) && now.getTime() - f.observedAt.getTime() > 365 * DAY));
});

test("seeded matches cite only confirmed attributes", () => {
  const confirmed = new Set(attrs.filter((a) => a.data.confirmedByRecruiter).map((a) => a.id));
  for (const { id, data: m } of matches)
    for (const a of [...m.reasonsFor, ...m.reasonsAgainst, ...m.skillAlignment].flatMap((r) => r.attributeIds)) assert.ok(confirmed.has(a), `${id} cites unconfirmed ${a}`);
  const thabo = attrs.filter((a) => a.data.candidateId === "cand_demo_thabo" && !a.data.confirmedByRecruiter).map((a) => d.keywords[a.id]).sort();
  assert.deepEqual(thabo, ["hybrid", "notice"]);
});

test("no demographic or photographic fields; deterministic", () => {
  const bad = /^(gender|sex|age|dob|birth\w*|ethnicity|race|nationality|photo\w*|avatar|picture)$/i;
  for (const c of ["candidates", "interviewNotes", "attributes", "companies", "roles", "matches", "overrides", "placements"] as const)
    for (const doc of d[c] as { data: object }[]) for (const k of Object.keys(doc.data)) assert.ok(!bad.test(k), `${c}.${k}`);
  assert.deepEqual(buildDataset(now, "owner-test"), d);
});

test("every cvFileRef has a matching synthetic PDF in scripts/seed/cvs", () => {
  const withRef = cands.filter((c) => c.data.cvFileRef);
  assert.ok(withRef.length >= 2);
  for (const c of withRef) {
    const file = c.data.cvFileRef!.split("/").pop()!;
    assert.equal(c.data.cvFileRef, `users/owner-test/cvs/${file}`);
    assert.equal(c.data.cv?.fileName, file);
    assert.ok(existsSync(new URL(`./cvs/${file}`, import.meta.url)), file);
  }
});

test("portal seed: deterministic, role-safe and shaped for S18 / C02 / B04", () => {
  assert.deepEqual(buildDataset(now, "owner-test"), d);
  const lerato = cand("cand_demo_lerato");
  assert.equal(lerato.portalUid, PLACEHOLDER_ACCOUNTS.candidate.uid);
  assert.ok(lerato.inPoolSince && lerato.sourceSubmissionId);
  assert.ok(months(cand("cand_ruan_botha").inPoolSince!) >= 9, "nine-month candidate");

  const updates = d.candidateUpdates as { data: CandidateUpdate }[];
  assert.equal(updates.length, 3);
  const blob = JSON.stringify(updates.map((u) => u.data));
  for (const c of companies) { assert.ok(!blob.includes(c.id), c.id); assert.ok(!blob.includes(c.data.name), c.data.name); }
  for (const r of roles) assert.ok(r.data.anon && !companies.some((c) => JSON.stringify(r.data.anon).includes(c.data.name)), r.id);

  const entries = d.shortlistEntries as { data: ShortlistEntry }[];
  assert.equal(entries.length, 4);
  for (const { data: e } of entries) {
    assert.equal(!!e.identity, e.statusHistory.some((h) => h.status === "interviewing" || h.status === "hired"), e.label);
    assert.equal(e.roleTitle, roles.find((r) => r.id === e.roleId)!.data.title);
  }
  assert.ok(entries.some((e) => e.data.status === "not-progressing" && e.data.statusHistory.some((h) => h.reasonText)));

  const subs = d.submissions as { data: Submission }[];
  const pending = subs.filter((s) => s.data.status === "pending");
  assert.deepEqual(["cv", "brief"].map((k) => pending.filter((s) => s.data.kind === k).length), [3, 2]);
  assert.equal(pending.length, 5);
  assert.deepEqual(pending.filter((s) => s.data.kind === "cv").map((s) => s.data.readStatus).sort(), ["check", "clear", "unreadable"]);
  assert.ok(subs.every((s) => !("possibleDuplicateOf" in s.data)), "submitter-readable docs carry no duplicate hint");
  const checks = d.submissionChecks as { id: string; data: SubmissionCheck }[];
  assert.equal(checks.length, 1);
  assert.ok(pending.some((s) => s.id === checks[0]!.id && s.data.kind === "cv"));
  assert.ok(ids(cands).has(checks[0]!.data.possibleDuplicateOf));

  const links = d.shortlistLinks as { id: string; data: ShortlistLink }[];
  assert.deepEqual(links.map((l) => l.id).sort(), (d.shortlistEntries as { id: string }[]).map((e) => e.id).sort());
  for (const l of links) assert.ok(ids(cands).has(l.data.candidateId), l.id);
});

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const nameHit = (blob: string, fullName: string) =>
  fold(fullName).split(/\s+/).filter((t) => t.length > 1)
    .find((t) => new RegExp(`(?<![\\p{L}\\p{N}])${t}(?![\\p{L}\\p{N}])`, "u").test(fold(blob)));

test("no company-readable or candidate-readable doc names a candidate", () => {
  const OWN = "cand_demo_lerato";
  const uid = PLACEHOLDER_ACCOUNTS.candidate.uid;
  const subs = d.submissions as { id: string; data: Submission }[];
  // An entry's identity is revealed on purpose once the company moves the person to Interviewing.
  const entries = (d.shortlistEntries as { data: ShortlistEntry }[]).map((e) => ({ ...e.data, identity: undefined }));
  const readable: Record<"company" | "candidate", unknown[]> = {
    company: [...entries, ...(d.invites as { data: unknown }[]).map((x) => x.data), ...subs.filter((s) => s.data.kind === "brief").map((s) => s.data)],
    candidate: [
      ...subs.filter((s) => s.data.submittedBy === uid).map((s) => s.data),
      ...(d.candidateUpdates as { data: unknown }[]).map((x) => x.data),
      ...(d.portalUsers as { id: string; data: unknown }[]).filter((u) => u.id === uid).map((u) => u.data),
      ...(d.courseSuggestions as { data: unknown }[]).map((x) => x.data),
    ],
  };
  // The company's own contact shares a name with one pool candidate; her own name in her own docs is not a leak.
  const staff = new Set((d.portalUsers as { data: { role: string; displayName: string } }[]).filter((u) => u.data.role === "company").map((u) => u.data.displayName));
  const ownTokens = new Set(fold(cand(OWN).fullName).split(/\s+/));
  for (const [reader, docs] of Object.entries(readable) as ["company" | "candidate", unknown[]][]) {
    assert.ok(docs.length > 0, reader);
    const blob = JSON.stringify(docs);
    for (const id of blob.match(/cand_[a-z0-9_]+/g) ?? []) assert.equal(id, reader === "candidate" ? OWN : "", `${reader} can read ${id}`);
    for (const p of cands) {
      if ((reader === "candidate" && p.id === OWN) || (reader === "company" && staff.has(p.data.fullName))) continue;
      const name = p.data.fullName.split(/\s+/).filter((t) => reader === "company" || !ownTokens.has(fold(t))).join(" ");
      assert.equal(nameHit(blob, name), undefined, `${reader} can read the name of ${p.id}`);
    }
  }
});

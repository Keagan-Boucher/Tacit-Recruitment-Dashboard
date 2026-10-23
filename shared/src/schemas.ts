import { z } from "zod";

// Timestamps are app-level Dates; each side's Firestore converter maps Timestamp <-> Date.
// No demographic, photo or name-derived fields anywhere (product rule).
const doc = { ownerUid: z.string().min(1), createdAt: z.date(), updatedAt: z.date() };
const confidence = z.number().min(0).max(1);

export const ParseStatus = z.enum(["ok", "flagged", "failed"]);
export const InterpretStatus = z.enum(["pending", "ok", "failed"]);
export const AttributeType = z.enum([
  "skill", "motivation", "reason-for-leaving", "team-culture", "constraint", "salary",
  "availability", "work-mode", "location", "signal", "trajectory",
]);
/** candidate = a perishable fact the candidate confirmed or changed in their portal, once the recruiter passed it. */
export const AttributeSourceType = z.enum(["note", "override", "candidate"]);
export const Staleness = z.enum(["fresh", "ageing", "stale"]);
export const AlignmentKind = z.enum(["stated", "interpreted", "not-seen"]);
export const Decision = z.enum(["shortlist", "reject"]);
export const BriefSource = z.enum(["paste", "upload", "call", "portal"]);
export const RoleStatus = z.enum(["open", "filled", "expired"]);
export const PlacementOutcome = z.enum(["placed", "client-rejected", "withdrew"]);
export const Theme = z.enum(["dark", "light", "system"]);
export const WidgetSize = z.enum(["1x1", "2x1", "2x2"]);
export const WidgetId = z.enum([
  "forgotten", "roles-to-shortlist", "to-confirm", "people-met", "roles-in-play", "worth-a-call",
  "waiting", "ask-next", "recent-notes", "brief-inbox", "company-coverage", "match-history", "override-log",
  "waiting-for-review",
]);

export const SourceSpan = z
  .object({ start: z.number().int().min(0), end: z.number().int().min(0) })
  .refine((s) => s.start < s.end, { message: "sourceSpan.start must be < end" });

/** What the CV claims (S03 "What the CV says"), kept apart from what the recruiter observed. */
export const CvFacts = z.object({
  /** Newest first; `to` missing = current job. */
  history: z.array(z.object({ title: z.string(), company: z.string().optional(), from: z.string().optional(), to: z.string().optional() })),
  education: z.array(z.string()),
  skills: z.array(z.string()),
  salaryExpectation: z.string().optional(),
  fileName: z.string().optional(),
  readAt: z.date().optional(),
  modelVersion: z.string().optional(), // absent when added by hand
});

export const Candidate = z.object({
  ...doc,
  fullName: z.string(),
  headline: z.string(),
  location: z.string(),
  cv: CvFacts.optional(),
  cvFileRef: z.string().optional(),
  parseConfidence: confidence,
  parseStatus: ParseStatus,
  topSkills: z.array(z.string()).default([]), // compact projection for reverse matching
  lastOpenedAt: z.date().optional(),
  lastInterviewAt: z.date().optional(),
  /** The candidate's own portal account, when they signed up. */
  portalUid: z.string().optional(),
  /** When the recruiter passed their CV in S18; drives the 9-month course check. */
  inPoolSince: z.date().optional(),
  sourceSubmissionId: z.string().optional(),
});

export const InterviewNote = z.object({
  ...doc,
  candidateId: z.string(),
  roleContextId: z.string().optional(),
  rawText: z.string(),
  questionGuideVersion: z.number().int().optional(),
  capturedAt: z.date(),
  interpretedAt: z.date().optional(),
  interpretStatus: InterpretStatus,
  modelVersion: z.string().optional(),
});

export const Attribute = z.object({
  ...doc,
  candidateId: z.string(),
  sourceType: AttributeSourceType,
  noteId: z.string().optional(),
  overrideId: z.string().optional(),
  /** sourceType candidate: the details-change submission it came from; its span covers the submitted value. */
  submissionId: z.string().optional(),
  type: AttributeType,
  value: z.string(),
  confidence,
  /** Why the model is unsure, e.g. "Basic or cost to company? Not said." Shown with a Low confidence chip. */
  confidenceNote: z.string().optional(),
  sourceSpan: SourceSpan,
  observedAt: z.date(),
  confirmedByRecruiter: z.boolean(),
  editedValue: z.string().optional(),
  modelVersion: z.string(),
}).refine((a) => a.sourceType !== "candidate" || !!a.submissionId, {
  message: "a candidate-sourced attribute cites its submission", path: ["submissionId"],
});

/** Where one company fact came from; the UI labels it ("Your note", "Client feedback", "Placements", or the email sender). */
export const CompanyFactSource = z.enum(["note", "email", "client-feedback", "placements"]);
export const CompanyFact = z.object({
  text: z.string().min(1),
  source: CompanyFactSource,
  /** Who said it, e.g. the email sender. */
  by: z.string().optional(),
  observedAt: z.date(),
});

export const Company = z.object({
  ...doc,
  name: z.string(),
  sector: z.string(),
  hiringPattern: z.string(),
  notes: z.string(),
  /** Per-fact provenance. Optional: companies without it fall back to hiringPattern / notes text. */
  facts: z.array(CompanyFact).optional(),
});

// Fields in the recruiter's screening order; the UI shows them in this order.
export const InterpretedBrief = z.object({
  workMode: z.string(),
  travel: z.string(),
  budget: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  location: z.string(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  seniority: z.string(),
  /** Verbatim brief phrase per value, "" = none. Absent on roles made before parse-brief.v2 (no source line). Mirrors ai.ts BriefQuotes. */
  quotes: z
    .object({
      workMode: z.string(),
      travel: z.string(),
      budget: z.string(),
      location: z.string(),
      seniority: z.string(),
      mustHave: z.array(z.string()),
      niceToHave: z.array(z.string()),
    })
    .optional(),
});

export const Role = z.object({
  ...doc,
  companyId: z.string(),
  title: z.string(),
  briefText: z.string(),
  briefSource: BriefSource,
  briefFileRef: z.string().optional(),
  interpretedBrief: InterpretedBrief.optional(),
  status: RoleStatus,
  openedAt: z.date(),
  closedAt: z.date().optional(),
  sourceSubmissionId: z.string().optional(),
  /** What candidates see of this role (C02). Never the company name or anything that identifies it. */
  anon: z.lazy(() => RoleAnon).optional(),
});

export const Reason = z.object({
  text: z.string(),
  attributeIds: z.array(z.string()).min(1),
});

export const Alignment = z
  .object({
    requirement: z.string(),
    evidence: z.string(),
    kind: AlignmentKind,
    attributeIds: z.array(z.string()),
  })
  .refine((a) => (a.kind === "not-seen" ? a.attributeIds.length === 0 : a.attributeIds.length >= 1), {
    message: "not-seen has no attributeIds; stated/interpreted need at least one",
    path: ["attributeIds"],
  });

// Deliberately no numeric score field.
export const Match = z.object({
  ...doc,
  roleId: z.string(),
  candidateId: z.string(),
  rank: z.number().int().min(1),
  reasonsFor: z.array(Reason),
  reasonsAgainst: z.array(Reason),
  skillAlignment: z.array(Alignment),
  questionsToAsk: z.array(z.string()),
  evidenceAgeDays: z.number().min(0),
  staleness: Staleness,
  forgotten: z.boolean(),
  generatedAt: z.date(),
  modelVersion: z.string(),
});

export const Override = z.object({
  ...doc,
  matchId: z.string(),
  roleId: z.string(),
  candidateId: z.string(),
  companyId: z.string(),
  decision: Decision,
  reasonCodes: z.array(z.string()),
  reasonText: z.string(),
  updates: z
    .array(z.object({ type: z.enum(["salary", "availability"]), value: z.string() }))
    .optional(),
  decidedAt: z.date(),
  reversedAt: z.date().optional(),
});

export const QuestionGuide = z.object({
  ownerUid: z.string().min(1),
  questions: z.array(z.string()),
  version: z.number().int(),
  updatedAt: z.date(),
});

export const Placement = z.object({
  ...doc,
  companyId: z.string(),
  candidateId: z.string(),
  roleId: z.string(),
  outcome: PlacementOutcome,
  reason: z.string(),
  date: z.date(),
  startDate: z.date().optional(),
  /** Recruiter-only: no portal user can read a placement. */
  salary: z.lazy(() => Salary).optional(),
  source: z.enum(["recruiter", "company"]).optional(),
});

export const DashboardWidget = z.object({
  widgetId: WidgetId,
  size: WidgetSize,
  order: z.number().int().min(0),
  visible: z.boolean(),
});

// Doc id = the recruiter's uid, so no ownerUid field.
export const UserPrefs = z.object({
  theme: Theme,
  reduceMotion: z.boolean(),
  dashboard: z.array(DashboardWidget),
  smallScreenOrder: z.array(WidgetId),
  // S14 Review and Data & privacy (24 Oct). Missing on older docs: parsePrefs fills the defaults.
  railReviewCount: z.boolean(),
  autoReviewWidget: z.boolean(),
  retentionMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
  updatedAt: z.date().optional(),
});

// Default board, row-major, from the Figma hierarchy frames (214:2137). 4x3 = 12 cells.
const board: [WidgetId, WidgetSize][] = [
  ["forgotten", "2x2"], ["roles-to-shortlist", "1x1"], ["to-confirm", "1x1"], ["roles-in-play", "2x1"],
  ["worth-a-call", "1x1"], ["ask-next", "1x1"], ["waiting", "1x1"], ["people-met", "1x1"],
];
const shelf: WidgetId[] = ["recent-notes", "brief-inbox", "company-coverage", "match-history", "override-log", "waiting-for-review"];

export const DEFAULT_USER_PREFS: UserPrefs = {
  theme: "dark",
  reduceMotion: false,
  dashboard: [
    ...board.map(([widgetId, size], order) => ({ widgetId, size, order, visible: true })),
    ...shelf.map((widgetId, i) => ({ widgetId, size: "1x1" as const, order: board.length + i, visible: false })),
  ],
  smallScreenOrder: [...board.map(([id]) => id), ...shelf],
  railReviewCount: true,
  autoReviewWidget: true,
  retentionMonths: 24,
};

// ---- Portals (23 Oct 2026; data-model.md *Portal entities*, architecture.md *Auth and roles*) ----------------
// Written only by the proxy unless marked. ownerUid is always the recruiter (RECRUITER_UID).

export const AccountRole = z.enum(["recruiter", "candidate", "company"]);
export const PortalRole = AccountRole.exclude(["recruiter"]);
/** The custom claims the rules trust. A fresh account has none. */
export const Claims = z.object({
  role: AccountRole.optional(),
  candidateId: z.string().optional(),
  companyId: z.string().optional(),
});

export const Salary = z.object({ amount: z.number().nonnegative(), currency: z.string().min(1), period: z.enum(["month", "year"]) });

/** What candidates see of a role. Strict: a company field is rejected, not stripped. */
export const RoleAnon = z.strictObject({
  title: z.string().min(1),
  sector: z.string(),
  region: z.string(),
  seniority: z.string(),
  salaryBand: z.string(),
});

export const PortalUser = z.object({
  ...doc,
  role: PortalRole,
  email: z.email(),
  displayName: z.string(),
  /** Set when the recruiter passes their CV. */
  candidateId: z.string().optional(),
  companyId: z.string().optional(),
  /** Candidates: when they accepted the C01 consent line. */
  consentAt: z.date().optional(),
});

/** Recruiter creates (S11); acceptance goes through the proxy. */
export const Invite = z.object({
  ...doc,
  companyId: z.string().min(1),
  email: z.email(),
  expiresAt: z.date(),
  acceptedAt: z.date().optional(),
  acceptedUid: z.string().optional(),
  createdBy: z.string().min(1),
});

export const SubmissionKind = z.enum(["cv", "brief", "details-change"]);
export const SubmissionStatus = z.enum(["pending", "accepted", "not-accepted"]);
export const ReadStatus = z.enum(["clear", "check", "unreadable"]);
/** S18 not-accepted reason chips: Can't read the file, Details missing, Already in the pool, Outside what we place, Something else. */
export const ReviewReasonCode = z.enum(["unreadable", "details-missing", "already-in-pool", "outside-scope", "other"]);
export const WorkMode = z.enum(["office", "hybrid", "remote"]);

/** C04 Check your details: the parsed CV as the candidate corrected it. */
export const CvSubmissionFields = z.object({
  fullName: z.string().trim().min(1).max(200),
  headline: z.string().max(300),
  location: z.string().max(200),
  currentRole: z.string().max(200),
  salaryExpectation: z.string().max(200).optional(),
  workMode: WorkMode.optional(),
  phone: z.string().max(40).optional(),
  /** Typed by the candidate, never read from the CV: "One calendar month". */
  notice: z.string().max(100).optional(),
  /** ISO date (yyyy-mm-dd) the candidate can start. */
  availableFrom: z.iso.date().optional(),
  history: CvFacts.shape.history,
  education: z.array(z.string().max(300)).max(30),
  skills: z.array(z.string().max(100)).max(60),
});
/** B03 Check what Tacit understood: the brief in screening order, as the company corrected it. */
export const BriefSubmissionFields = InterpretedBrief.extend({
  title: z.string().trim().min(1).max(200),
  /** Things the brief leaves open (S18 marks them). */
  unclear: z.array(z.string()).default([]),
});
/** C02 Keep your details fresh / C03 Change my details: perishable facts only. At least one. */
export const DetailsChangeFields = z
  .object({
    salary: z.string().max(200).optional(),
    availability: z.string().max(200).optional(),
    workMode: WorkMode.optional(),
    currentWork: z.string().max(300).optional(),
  })
  .refine((f) => Object.values(f).some((v) => v !== undefined), { message: "Send at least one detail" });

const submissionBase = {
  ...doc,
  submittedBy: z.string().min(1),
  candidateId: z.string().optional(),
  companyId: z.string().optional(),
  fileRef: z.string().optional(),
  text: z.string().optional(),
  correctedFields: z.array(z.string()),
  parseConfidence: confidence.optional(),
  readStatus: ReadStatus,
  status: SubmissionStatus,
  submittedAt: z.date(),
  reviewedAt: z.date().optional(),
  reviewedBy: z.string().optional(),
  reasonCode: ReviewReasonCode.optional(),
  /** Shown to the submitter verbatim (C02 / B02). */
  reasonText: z.string().optional(),
  /** The Candidate or Role a pass created or updated. */
  resultId: z.string().optional(),
};
export const Submission = z
  .discriminatedUnion("kind", [
    z.object({ ...submissionBase, kind: z.literal("cv"), fields: CvSubmissionFields }),
    z.object({ ...submissionBase, kind: z.literal("brief"), fields: BriefSubmissionFields }),
    z.object({ ...submissionBase, kind: z.literal("details-change"), fields: DetailsChangeFields }),
  ])
  .refine((s) => s.status !== "not-accepted" || (!!s.reasonCode && !!s.reasonText?.trim()), {
    message: "Not accepted needs a reason code and the words the submitter sees", path: ["reasonText"],
  });

export const ShortlistStatus = z.enum(["shortlisted", "interviewing", "hired", "not-progressing"]);
export const StatusChange = z.object({
  status: ShortlistStatus,
  /** uid of whoever made the change. */
  by: z.string().min(1),
  at: z.date(),
  reasonText: z.string().optional(),
});
// coerce: the share request carries `at` as an ISO string over JSON.
const datedText = z.object({ text: z.string().min(1), at: z.coerce.date() });
/** The client-facing card the recruiter approved. Never note text, spans or attribute ids; both sides always present. */
export const ShortlistCard = z.object({
  label: z.string().min(1).max(40),
  headline: z.string().max(200),
  years: z.number().int().min(0).max(60),
  facts: z.object({ location: z.string(), workMode: z.string(), notice: z.string(), salary: z.string() }),
  case: z.object({ for: z.array(datedText).min(1), against: z.array(datedText).min(1) }),
});
export const ShortlistEntry = ShortlistCard.extend({
  ...doc,
  roleId: z.string().min(1),
  /** Copied from Role.title when shared: companies cannot read roles. */
  roleTitle: z.string().min(1),
  companyId: z.string().min(1),
  status: ShortlistStatus,
  statusHistory: z.array(StatusChange),
  /** Absent until the company moves the person to Interviewing. */
  identity: z.object({ fullName: z.string(), email: z.string(), phone: z.string() }).optional(),
  interviewTimes: z.array(z.string()).optional(),
  sharedAt: z.date(),
}).refine((e) => !e.identity || e.statusHistory.some((h) => h.status === "interviewing"), {
  message: "identity is revealed only once the company moved them to interviewing", path: ["identity"],
});

/** Recruiter-only: which candidate a company-readable ShortlistEntry is. Doc id = the entry id. Rules cannot hide fields, so the id stays off the entry. */
export const ShortlistLink = z.object({ ...doc, roleId: z.string().min(1), candidateId: z.string().min(1), sharedAt: z.date() });
/** Recruiter-only, keyed by submission id: kept off the submission because the submitter can read that. */
export const SubmissionCheck = z.object({ ...doc, possibleDuplicateOf: z.string().min(1) });

export const CandidateUpdateStatus = z.enum(["shortlisted", "interviewing", "placed", "not-taken-forward"]);
/** C02 Role updates. Strict, and no company id or name by construction. */
export const CandidateUpdate = z.strictObject({
  ...doc,
  candidateId: z.string().min(1),
  portalUid: z.string().min(1),
  roleAnon: RoleAnon,
  status: CandidateUpdateStatus,
  at: z.date(),
});

export const CourseItem = z.object({
  title: z.string().min(1).max(200),
  /** Aggregate only ("Asked for in 7 of the 10 roles you came close to"); never a company name. */
  why: z.string().min(1).max(300),
  duration: z.string().max(60),
});
export const CourseStatus = z.enum(["draft", "approved", "snoozed", "dismissed"]);
/** Doc id = candidateId. */
export const CourseSuggestion = z.object({
  ...doc,
  items: z.array(CourseItem).min(1).max(3),
  /** Recruiter-only; never shown to the candidate. */
  basis: z.object({ roleIds: z.array(z.string()) }),
  status: CourseStatus,
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  snoozedUntil: z.date().optional(),
  generatedAt: z.date(),
  modelVersion: z.string(),
});

// ---- Portal endpoints (bodies are JSON, so dates travel as ISO yyyy-mm-dd strings) ---------------------

/** POST /api/portal/register (signed in, no role yet). */
export const RegisterRequest = z.object({ displayName: z.string().trim().min(1).max(200), consent: z.literal(true) });
export interface RegisterResponse { role: "candidate" }

/** POST /api/invites/:id/accept (signed in, no role yet; the account email must match the invite). */
export const AcceptInviteRequest = z.object({ displayName: z.string().trim().min(1).max(200) });
export interface AcceptInviteResponse { companyId: string }
/** GET /api/invites/:id — no sign-in (B01 opens signed out); the random invite id is the secret. Only what B01 shows. */
export interface InvitePreview { companyName: string; email: string; expiresAt: string; status: "open" | "used" | "expired" }

/** POST /api/portal/submit (candidate: cv, details-change; company: brief). readStatus is the proxy's. */
export const SubmitRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cv"),
    fileRef: z.string().min(1).max(512),
    fields: CvSubmissionFields,
    correctedFields: z.array(z.string().max(60)).max(40),
    parseConfidence: confidence,
  }),
  z.object({
    kind: z.literal("brief"),
    /** Exactly one of text (paste) or fileRef (upload, under users/{uid}/briefs/). */
    text: z.string().max(40_000).nullable(),
    fileRef: z.string().max(512).nullable(),
    fields: BriefSubmissionFields,
    correctedFields: z.array(z.string().max(60)).max(40),
  }).refine((r) => (r.text ? 1 : 0) + (r.fileRef ? 1 : 0) === 1, { message: "Send exactly one of text or fileRef" }),
  z.object({ kind: z.literal("details-change"), fields: DetailsChangeFields }),
]);
export interface SubmitResponse { submissionId: string }

/** POST /api/review/:submissionId (recruiter). Idempotent. */
export const ReviewRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pass") }),
  z.object({ action: z.literal("not-accepted"), reasonCode: ReviewReasonCode, reasonText: z.string().trim().min(1).max(1000) }),
]);
export interface ReviewResponse { status: "accepted" | "not-accepted"; resultId?: string }

/** POST /api/shortlists/share (recruiter). Each entry is the card the recruiter approved for the client. */
export const ShareShortlistRequest = z.object({
  roleId: z.string().min(1),
  entries: z.array(ShortlistCard.extend({ candidateId: z.string().min(1) })).min(1).max(12),
});
export interface ShareShortlistResponse { entryIds: string[] }

/** POST /api/portal/shortlist-status (company, own companyId only). */
export const ShortlistStatusRequest = z
  .object({
    entryId: z.string().min(1),
    status: ShortlistStatus.exclude(["shortlisted"]),
    reasonText: z.string().trim().max(1000).optional(),
    startDate: z.iso.date().optional(),
    salary: Salary.optional(),
    interviewTimes: z.array(z.string().max(200)).max(10).optional(),
  })
  .refine((r) => r.status !== "not-progressing" || !!r.reasonText, {
    message: "Not progressing needs your reason", path: ["reasonText"],
  });
export interface ShortlistStatusResponse { status: ShortlistStatus }

/** POST /api/courses/:candidateId (recruiter): draft with the model, or approve (optionally edited) items. */
export const CourseRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft") }),
  z.object({ action: z.literal("approve"), items: z.array(CourseItem).min(1).max(3) }),
]);
export interface CourseResponse { status: CourseStatus; items: CourseItem[] }

export type ParseStatus = z.infer<typeof ParseStatus>;
export type InterpretStatus = z.infer<typeof InterpretStatus>;
export type AttributeType = z.infer<typeof AttributeType>;
export type Staleness = z.infer<typeof Staleness>;
export type AlignmentKind = z.infer<typeof AlignmentKind>;
export type Decision = z.infer<typeof Decision>;
export type WidgetId = z.infer<typeof WidgetId>;
export type WidgetSize = z.infer<typeof WidgetSize>;
export type CvFacts = z.infer<typeof CvFacts>;
export type SourceSpan = z.infer<typeof SourceSpan>;
export type Candidate = z.infer<typeof Candidate>;
export type InterviewNote = z.infer<typeof InterviewNote>;
export type Attribute = z.infer<typeof Attribute>;
export type CompanyFactSource = z.infer<typeof CompanyFactSource>;
export type CompanyFact = z.infer<typeof CompanyFact>;
export type Company = z.infer<typeof Company>;
export type InterpretedBrief = z.infer<typeof InterpretedBrief>;
export type Role = z.infer<typeof Role>;
export type Reason = z.infer<typeof Reason>;
export type Alignment = z.infer<typeof Alignment>;
export type Match = z.infer<typeof Match>;
export type Override = z.infer<typeof Override>;
export type QuestionGuide = z.infer<typeof QuestionGuide>;
export type Placement = z.infer<typeof Placement>;
export type DashboardWidget = z.infer<typeof DashboardWidget>;
export type UserPrefs = z.infer<typeof UserPrefs>;
export type AccountRole = z.infer<typeof AccountRole>;
export type PortalRole = z.infer<typeof PortalRole>;
export type Claims = z.infer<typeof Claims>;
export type Salary = z.infer<typeof Salary>;
export type RoleAnon = z.infer<typeof RoleAnon>;
export type PortalUser = z.infer<typeof PortalUser>;
export type Invite = z.infer<typeof Invite>;
export type SubmissionKind = z.infer<typeof SubmissionKind>;
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;
export type ReadStatus = z.infer<typeof ReadStatus>;
export type ReviewReasonCode = z.infer<typeof ReviewReasonCode>;
export type WorkMode = z.infer<typeof WorkMode>;
export type CvSubmissionFields = z.infer<typeof CvSubmissionFields>;
export type BriefSubmissionFields = z.infer<typeof BriefSubmissionFields>;
export type DetailsChangeFields = z.infer<typeof DetailsChangeFields>;
export type Submission = z.infer<typeof Submission>;
export type ShortlistStatus = z.infer<typeof ShortlistStatus>;
export type StatusChange = z.infer<typeof StatusChange>;
export type ShortlistCard = z.infer<typeof ShortlistCard>;
export type ShortlistEntry = z.infer<typeof ShortlistEntry>;
export type ShortlistLink = z.infer<typeof ShortlistLink>;
export type SubmissionCheck = z.infer<typeof SubmissionCheck>;
export type CandidateUpdateStatus = z.infer<typeof CandidateUpdateStatus>;
export type CandidateUpdate = z.infer<typeof CandidateUpdate>;
export type CourseItem = z.infer<typeof CourseItem>;
export type CourseStatus = z.infer<typeof CourseStatus>;
export type CourseSuggestion = z.infer<typeof CourseSuggestion>;
export type RegisterRequest = z.infer<typeof RegisterRequest>;
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;
export type SubmitRequest = z.infer<typeof SubmitRequest>;
export type ReviewRequest = z.infer<typeof ReviewRequest>;
export type ShareShortlistRequest = z.infer<typeof ShareShortlistRequest>;
export type ShortlistStatusRequest = z.infer<typeof ShortlistStatusRequest>;
export type CourseRequest = z.infer<typeof CourseRequest>;

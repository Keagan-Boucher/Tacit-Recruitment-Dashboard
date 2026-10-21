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
export const AttributeSourceType = z.enum(["note", "override"]);
export const Staleness = z.enum(["fresh", "ageing", "stale"]);
export const AlignmentKind = z.enum(["stated", "interpreted", "not-seen"]);
export const Decision = z.enum(["shortlist", "reject"]);
export const BriefSource = z.enum(["paste", "upload", "call"]);
export const RoleStatus = z.enum(["open", "filled", "expired"]);
export const PlacementOutcome = z.enum(["placed", "client-rejected", "withdrew"]);
export const Theme = z.enum(["dark", "light", "system"]);
export const WidgetSize = z.enum(["1x1", "2x1", "2x2"]);
export const WidgetId = z.enum([
  "forgotten", "roles-to-shortlist", "to-confirm", "people-met", "roles-in-play", "worth-a-call",
  "waiting", "ask-next", "recent-notes", "brief-inbox", "company-coverage", "match-history", "override-log",
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
});

export const Company = z.object({
  ...doc,
  name: z.string(),
  sector: z.string(),
  hiringPattern: z.string(),
  notes: z.string(),
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
  updatedAt: z.date().optional(),
});

// Default board, row-major, from the Figma hierarchy frames (214:2137). 4x3 = 12 cells.
const board: [WidgetId, WidgetSize][] = [
  ["forgotten", "2x2"], ["roles-to-shortlist", "1x1"], ["to-confirm", "1x1"], ["roles-in-play", "2x1"],
  ["worth-a-call", "1x1"], ["ask-next", "1x1"], ["waiting", "1x1"], ["people-met", "1x1"],
];
const shelf: WidgetId[] = ["recent-notes", "brief-inbox", "company-coverage", "match-history", "override-log"];

export const DEFAULT_USER_PREFS: UserPrefs = {
  theme: "dark",
  reduceMotion: false,
  dashboard: [
    ...board.map(([widgetId, size], order) => ({ widgetId, size, order, visible: true })),
    ...shelf.map((widgetId, i) => ({ widgetId, size: "1x1" as const, order: board.length + i, visible: false })),
  ],
  smallScreenOrder: [...board.map(([id]) => id), ...shelf],
};

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

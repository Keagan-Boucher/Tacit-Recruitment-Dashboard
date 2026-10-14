import { z } from "zod";
import { AlignmentKind, AttributeType, BriefSource } from "./schemas.ts";

// Model output schemas, sent to the provider as strict JSON Schema (z.toJSONSchema) and re-validated with Zod.
// Groq strict mode: every property required, so "maybe" is nullable, never optional; no refinements here
// (semantic checks such as quote-in-note live in the proxy pipeline).
// No demographic, photo or name-derived fields anywhere (product rule).

const confidence = z.number().min(0).max(1);
/** Below this, the UI flags a value ("Low confidence" / "Check this"). */
export const LOW_CONFIDENCE = 0.7;

// ---- /api/interpret-note -------------------------------------------------------------------

export const InterpretedAttribute = z.object({
  type: AttributeType,
  /** Short, recruiter-readable claim, e.g. "Owns month-end close in SAP". */
  value: z.string(),
  /** Verbatim phrase from the note. The proxy locates it to compute sourceSpan; not found = dropped. */
  quote: z.string(),
  confidence,
  /** Why it's uncertain, e.g. "Basic or cost to company? Not said." Null when confident. */
  note: z.string().nullable(),
});

export const NoteInterpretation = z.object({ attributes: z.array(InterpretedAttribute) });

export const InterpretNoteRequest = z.object({ noteId: z.string().min(1) });
/** Attributes are written unconfirmed (confirmedByRecruiter: false); the client reads them from Firestore. */
export interface InterpretNoteResponse { attributeIds: string[]; modelVersion: string }

// ---- /api/parse-cv -------------------------------------------------------------------------

/** One field as read from the CV: the cleaned value, the raw text it was read from, and how sure. */
export const CvField = z.object({
  value: z.string().nullable(),
  readAs: z.string().nullable(),
  confidence,
  note: z.string().nullable(),
});

export const CvParseJob = z.object({
  title: z.string(),
  company: z.string().nullable(),
  from: z.string().nullable(),
  /** Null = current job. */
  to: z.string().nullable(),
  readAs: z.string().nullable(),
  confidence,
  note: z.string().nullable(),
});

export const CvParseResult = z.object({
  fullName: CvField,
  headline: CvField,
  location: CvField,
  currentRole: CvField,
  salaryExpectation: CvField,
  /** Newest first. */
  history: z.array(CvParseJob),
  education: z.array(z.string()),
  skills: z.array(z.string()),
  parseConfidence: confidence,
});

/** fileRef = Storage path, must be under users/{uid}/cvs/. */
export const ParseCvRequest = z.object({ fileRef: z.string().min(1).max(512) });
/** Not persisted by the proxy: the recruiter's Confirm on S09 writes the candidate. */
export interface ParseCvResponse { result: CvParseResult; modelVersion: string }

// ---- /api/parse-brief ----------------------------------------------------------------------

/** Same fields as Role.interpretedBrief, in screening order, but anything the brief doesn't say is null. */
export const BriefInterpretation = z.object({
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  workMode: z.string().nullable(),
  travel: z.string().nullable(),
  budget: z.object({ min: z.number().nullable(), max: z.number().nullable(), currency: z.string().nullable() }),
  location: z.string().nullable(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  seniority: z.string().nullable(),
  /** Things the brief leaves open, phrased as questions for the client. */
  unclear: z.array(z.string()),
});

/** Exactly one of text (paste / call notes) or fileRef (upload, under users/{uid}/briefs/). */
export const ParseBriefRequest = z
  .object({ source: BriefSource, text: z.string().nullable(), fileRef: z.string().max(512).nullable() })
  .refine((r) => (r.text ? 1 : 0) + (r.fileRef ? 1 : 0) === 1, { message: "Send exactly one of text or fileRef" });
/** `text` = the brief text that was interpreted (extracted from the file for uploads), stored as Role.briefText. */
export interface ParseBriefResponse { result: BriefInterpretation; modelVersion: string; text: string }

// ---- /api/match ---------------------------------------------------------------------------

const CitedReason = z.object({ text: z.string(), attributeIds: z.array(z.string()) });

/** One shortlisted candidate. Array order = rank. No score field, by design. The proxy drops reasons whose
 *  attributeIds aren't the candidate's confirmed attributes; a suggestion left with no reason for or against is dropped. */
export const MatchSuggestion = z.object({
  candidateId: z.string(),
  reasonsFor: z.array(CitedReason),
  /** Never empty: with nothing against, the model says so as a reason ("evidence is thin"), citing what it has. */
  reasonsAgainst: z.array(CitedReason),
  /** One row per brief requirement. not-seen rows carry no attributeIds. */
  skillAlignment: z.array(
    z.object({ requirement: z.string(), evidence: z.string(), kind: AlignmentKind, attributeIds: z.array(z.string()) }),
  ),
  questionsToAsk: z.array(z.string()),
});
export const MatchResult = z.object({ suggestions: z.array(MatchSuggestion) });

/** Runs replace the role's earlier matches. The proxy reads role.interpretedBrief (or role.briefText).
 *  Without `force`, fresh matches for the same role, brief and prompt version are returned as they are (cached). */
export const MatchRequest = z.object({ roleId: z.string().min(1), force: z.boolean().optional() });
/** Match docs land in `matches` (roleId, rank); the web reads them live, so the response is just ids. */
export interface MatchResponse { matchIds: string[]; modelVersion: string; cached: boolean }

// ---- errors --------------------------------------------------------------------------------

/** Every non-2xx from the proxy. `ai_failed` = the model failed after one repair retry; nothing was stored. */
export interface ApiErrorBody {
  error: string;
  code: "bad_request" | "unauthorized" | "not_found" | "bad_file" | "ai_failed" | "ai_unconfigured" | "internal";
}

export type InterpretedAttribute = z.infer<typeof InterpretedAttribute>;
export type NoteInterpretation = z.infer<typeof NoteInterpretation>;
export type InterpretNoteRequest = z.infer<typeof InterpretNoteRequest>;
export type CvField = z.infer<typeof CvField>;
export type CvParseJob = z.infer<typeof CvParseJob>;
export type CvParseResult = z.infer<typeof CvParseResult>;
export type ParseCvRequest = z.infer<typeof ParseCvRequest>;
export type BriefInterpretation = z.infer<typeof BriefInterpretation>;
export type ParseBriefRequest = z.infer<typeof ParseBriefRequest>;
export type MatchSuggestion = z.infer<typeof MatchSuggestion>;
export type MatchResult = z.infer<typeof MatchResult>;
export type MatchRequest = z.infer<typeof MatchRequest>;

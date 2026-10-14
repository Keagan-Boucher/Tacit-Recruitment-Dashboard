import { Router } from "express";
import type { Firestore } from "firebase-admin/firestore";
import { Attribute, InterpretNoteRequest, NoteInterpretation, type ApiErrorBody, type InterpretedAttribute } from "@tacit/shared";
import { mentionsDemographic } from "../ai/demographics.ts";
import { aiErrorResponse, loadPrompt, runStructured, type Ai } from "../ai/index.ts";

export type LocatedAttribute = InterpretedAttribute & { sourceSpan: { start: number; end: number } };

/**
 * Find `quote` in `text` as [start, end) of the ORIGINAL text. Exact match first, then a case- and
 * whitespace-insensitive match mapped back to original indices. null = not found.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  if (!quote.trim()) return null;
  const exact = text.indexOf(quote);
  if (exact >= 0) return { start: exact, end: exact + quote.length };
  // Normalised text: lowercase, whitespace runs -> one space; map[i] = original index of normalised char i.
  const norm = (s: string) => {
    let out = "";
    const map: number[] = [];
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i]!)) {
        if (out && !out.endsWith(" ")) { out += " "; map.push(i); }
      } else { out += s[i]!.toLowerCase(); map.push(i); }
    }
    return { out: out.trimEnd(), map };
  };
  const t = norm(text), q = norm(quote).out;
  const at = q ? t.out.indexOf(q) : -1;
  if (at < 0) return null;
  return { start: t.map[at]!, end: t.map[at + q.length - 1]! + 1 };
}

/** Pure part, shared with the eval: model call, locate quotes, drop unlocatable and duplicate ones. */
export async function interpretNote(rawText: string, ai: Ai): Promise<{ attributes: LocatedAttribute[]; modelVersion: string }> {
  const prompt = loadPrompt("interpret-note", 1);
  const { data, modelVersion } = await runStructured(
    {
      task: "interpret-note",
      prompt,
      schema: NoteInterpretation,
      input: rawText,
      check: (d) => {
        const kept: LocatedAttribute[] = [];
        let dropped = 0, unlocated = 0, duplicates = 0;
        for (const a of d.attributes) {
          if (mentionsDemographic(a.value) || mentionsDemographic(a.quote) || (a.note && mentionsDemographic(a.note))) { dropped++; continue; }
          const sourceSpan = locateQuote(rawText, a.quote);
          if (!sourceSpan) { unlocated++; continue; }
          const dup = kept.some((k) => k.type === a.type && k.sourceSpan.start < sourceSpan.end && sourceSpan.start < k.sourceSpan.end);
          if (dup) duplicates++;
          else kept.push({ ...a, sourceSpan });
        }
        if (dropped || unlocated || duplicates) {
          console.log(JSON.stringify({ task: "interpret-note", demographicDropped: dropped, unlocated, duplicates })); // counts only
        }
        // Never put note text in this message: it is sent back to the model.
        if (d.attributes.length - dropped > 0 && kept.length === 0) throw new Error("None of the quotes appear verbatim in the note. Quote exact phrases from the note.");
        return { attributes: kept } as unknown as typeof d; // carries sourceSpan through; unwrapped below
      },
    },
    ai,
  );
  return { attributes: data.attributes as LocatedAttribute[], modelVersion };
}

const toDate = (v: unknown): Date => (v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : (v as Date));
const err = (code: ApiErrorBody["code"], error: string): ApiErrorBody => ({ error, code });
/** Longer notes are refused, not truncated: a cut note would make every span past the cut unprovable. */
export const MAX_NOTE_CHARS = 40_000;

export function interpretNoteRouter({ ai, db }: { ai: Ai; db: Firestore }) {
  const router = Router();
  router.post("/interpret-note", async (req, res) => {
    const body = InterpretNoteRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "noteId is required"));
    const noteRef = db.collection("interviewNotes").doc(body.data.noteId);
    const snap = await noteRef.get();
    const note = snap.data();
    if (!snap.exists || !note || note.ownerUid !== req.uid) return void res.status(404).json(err("not_found", "Note not found"));
    const rawText = typeof note.rawText === "string" ? note.rawText : "";
    if (!rawText.trim()) return void res.status(400).json(err("bad_request", "Note is empty"));
    if (rawText.length > MAX_NOTE_CHARS) return void res.status(400).json(err("bad_request", "Note is too long to interpret"));
    // Fail before paying for a model call: a note needs its candidate (the recruiter's own) and capture time.
    const observedAt = toDate(note.capturedAt);
    const cand = typeof note.candidateId === "string" && note.candidateId ? await db.collection("candidates").doc(note.candidateId).get() : null;
    if (!cand?.exists || cand.data()?.ownerUid !== req.uid || !(observedAt instanceof Date) || isNaN(observedAt.getTime())) {
      return void res.status(400).json(err("bad_request", "Note is missing its candidate or capture time"));
    }

    let modelVersion: string, docs: { ref: FirebaseFirestore.DocumentReference; parsed: Attribute }[];
    try {
      const result = await interpretNote(rawText, ai);
      modelVersion = result.modelVersion;
      const now = new Date();
      const attrs = db.collection("attributes");
      // Parse everything before opening the batch: nothing unvalidated is persisted.
      docs = result.attributes.map((a) => ({
        ref: attrs.doc(),
        parsed: Attribute.parse({
          ownerUid: req.uid, candidateId: note.candidateId, sourceType: "note", noteId: snap.id,
          type: a.type, value: a.value, confidence: a.confidence,
          ...(a.note ? { confidenceNote: a.note } : {}),
          sourceSpan: a.sourceSpan, observedAt, confirmedByRecruiter: false,
          modelVersion, createdAt: now, updatedAt: now,
        }),
      }));
      const stale = await attrs.where("ownerUid", "==", req.uid).where("noteId", "==", snap.id).where("confirmedByRecruiter", "==", false).get();
      const batch = db.batch();
      stale.docs.forEach((d) => batch.delete(d.ref));
      docs.forEach(({ ref, parsed }) => batch.create(ref, parsed));
      batch.update(noteRef, { interpretStatus: "ok", interpretedAt: now, modelVersion, updatedAt: now });
      await batch.commit();
    } catch (e) {
      // Any failure after the note was read leaves it "failed" (never stuck "pending"); rawText is never touched.
      // A failed status write must not mask the original error.
      await noteRef.update({ interpretStatus: "failed", updatedAt: new Date() })
        .catch((u: { code?: unknown }) => console.error("interpret-note: failed-status write failed", u?.code));
      const r = aiErrorResponse(e);
      if (r) return void res.status(r.status).json(r.body);
      console.error("interpret-note failed:", (e as Error)?.name); // name only: messages can echo note text
      return void res.status(500).json(err("internal", "Couldn't save the interpretation. Your note is safe. Try again."));
    }
    res.json({ attributeIds: docs.map((d) => d.ref.id), modelVersion });
  });
  return router;
}

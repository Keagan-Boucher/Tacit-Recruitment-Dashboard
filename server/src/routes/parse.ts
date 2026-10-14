import { Router, type Response } from "express";
import { BriefInterpretation, CvParseResult, LOW_CONFIDENCE, ParseBriefRequest, ParseCvRequest, type ApiErrorBody } from "@tacit/shared";
import { aiErrorResponse, loadPrompt, runStructured, type Ai } from "../ai/index.ts";
import { FileError, MAX_CHARS, readUploadText, type BucketLike } from "../files.ts";

const err = (code: ApiErrorBody["code"], error: string): ApiErrorBody => ({ code, error });

function fail(res: Response, e: unknown) {
  if (e instanceof FileError) return void res.status(e.status).json(err(e.code, e.message));
  const r = aiErrorResponse(e);
  if (r) return void res.status(r.status).json(r.body);
  console.error("parse failed:", (e as Error)?.name); // name only: messages can echo file paths or text
  res.status(500).json(err("internal", "Something went wrong."));
}

/** S09 flags every low-confidence field, so each must say why; a missing note triggers the repair retry. */
function needNotes(cv: CvParseResult): CvParseResult {
  const fields = [cv.fullName, cv.headline, cv.location, cv.currentRole, cv.salaryExpectation, ...cv.history];
  if (fields.some((f) => f.confidence < LOW_CONFIDENCE && !f.note?.trim())) {
    throw new Error(`Every field with confidence below ${LOW_CONFIDENCE} needs a short note saying why (e.g. "Not stated in the CV").`);
  }
  return cv;
}

/** Nothing here is persisted: the recruiter's Confirm on S09 / S13 writes the record. */
export function parseRouter({ ai, bucket }: { ai: Ai; bucket: BucketLike }) {
  const router = Router();

  router.post("/parse-cv", async (req, res) => {
    const body = ParseCvRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "fileRef is required"));
    try {
      const { text } = await readUploadText(bucket, req.uid!, body.data.fileRef, "cvs");
      const { data, modelVersion } = await runStructured(
        { task: "parse-cv", prompt: loadPrompt("parse-cv", 1), schema: CvParseResult, input: text, check: needNotes },
        ai,
      );
      res.json({ result: data, modelVersion });
    } catch (e) {
      fail(res, e);
    }
  });

  router.post("/parse-brief", async (req, res) => {
    const body = ParseBriefRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json(err("bad_request", "Send exactly one of text or fileRef"));
    try {
      const pasted = body.data.text?.trim() ?? "";
      if (!body.data.fileRef && !pasted) return void res.status(400).json(err("bad_request", "The brief is empty"));
      // Refused, not truncated: the text is stored as Role.briefText and must be the recruiter's whole brief.
      if (pasted.length > MAX_CHARS) return void res.status(400).json(err("bad_request", "That brief is too long. Paste the key part."));
      const input = body.data.fileRef ? (await readUploadText(bucket, req.uid!, body.data.fileRef, "briefs")).text : pasted;
      const { data, modelVersion } = await runStructured(
        { task: "parse-brief", prompt: loadPrompt("parse-brief", 1), schema: BriefInterpretation, input },
        ai,
      );
      res.json({ result: data, modelVersion, text: input });
    } catch (e) {
      fail(res, e);
    }
  });

  return router;
}

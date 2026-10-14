// Live check that Groq accepts our strict schemas. Synthetic input only.
// Run: npx tsx --env-file=server/.env server/src/ai/smoke.ts
import { BriefInterpretation, CvParseResult, NoteInterpretation } from "@tacit/shared";
import type { z } from "zod";
import { loadConfig } from "../config.ts";
import { createAi, loadPrompt, runStructured } from "./index.ts";

const ai = createAi(loadConfig());
const prompt = loadPrompt("smoke", 1);
const cases: [string, z.ZodType, string][] = [
  ["NoteInterpretation", NoteInterpretation, "Mia Test: wants remote, 5 yrs SAP FICO, expects 900k CTC, not keen on travel."],
  ["CvParseResult", CvParseResult, "Sam Example. Senior Accountant, Acme Ltd 2019-present. Cape Town. Skills: Excel, SAP. BCom Accounting."],
  ["BriefInterpretation", BriefInterpretation, "Hybrid FICO consultant in Joburg, 3 days on site, R80-100k pm. Must know S/4HANA. Nice: SQL."],
];

let failed = false;
for (const [task, schema, input] of cases) {
  try {
    await runStructured({ task, prompt, schema, input }, ai);
    console.log(`PASS ${task}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${task}: ${(e as Error).message}`, (e as Error).cause ?? "");
  }
}
process.exit(failed ? 1 : 0);

import type { Config } from "../config.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible.ts";
import type { Ai } from "./run.ts";

export { runStructured, AiFailedError, AiUnconfiguredError, aiErrorResponse } from "./run.ts";
export type { Ai, RunOptions } from "./run.ts";
export { loadPrompt } from "./prompts.ts";
export type { Prompt } from "./prompts.ts";
export { toStrictSchema } from "./json-schema.ts";

export function createAi(c: Config): Ai {
  const model = c.aiModel ?? "";
  const provider = c.aiBaseUrl && c.aiApiKey && c.aiModel ? new OpenAiCompatibleProvider(c.aiBaseUrl, c.aiApiKey, c.aiModel) : null;
  return { provider, model };
}

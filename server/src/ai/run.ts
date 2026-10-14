import type { z } from "zod";
import type { ApiErrorBody } from "@tacit/shared";
import { toStrictSchema } from "./json-schema.ts";
import type { Prompt } from "./prompts.ts";
import type { AiProvider, ChatMessage } from "./provider.ts";

/** What runStructured needs. provider is null when AI env vars are missing. */
export interface Ai {
  provider: AiProvider | null;
  model: string;
}

/** The model failed after one repair retry (or transport failed). Nothing was stored. -> code "ai_failed" */
export class AiFailedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}
/** AI env not configured. -> code "ai_unconfigured" */
export class AiUnconfiguredError extends Error {
  constructor() {
    super("AI is not configured (AI_BASE_URL, AI_API_KEY, AI_MODEL).");
  }
}

/** Map an AI error to the HTTP response an endpoint should send; undefined = not an AI error. */
export function aiErrorResponse(e: unknown): { status: number; body: ApiErrorBody } | undefined {
  if (e instanceof AiUnconfiguredError) return { status: 503, body: { error: e.message, code: "ai_unconfigured" } };
  if (e instanceof AiFailedError) {
    return { status: 502, body: { error: "The AI could not produce a valid result. Try again.", code: "ai_failed" } };
  }
  return undefined;
}

// Groq list price for openai/gpt-oss-120b, USD per 1M tokens. ESTIMATE (not re-checked against the pricing page).
const PRICE_IN = 0.15;
const PRICE_OUT = 0.6;

export interface RunOptions<T> {
  task: string;
  prompt: Prompt;
  schema: z.ZodType<T>;
  /** User message content (note, CV text, brief). Never logged. */
  input: string;
  /** Semantic check: return the (possibly pruned) data, or throw to trigger the repair retry. */
  check?: (data: T) => T;
  reasoningEffort?: "low" | "medium" | "high";
}

export async function runStructured<T>(o: RunOptions<T>, ai: Ai): Promise<{ data: T; modelVersion: string }> {
  const provider = ai.provider;
  if (!provider) throw new AiUnconfiguredError();
  const modelVersion = `${ai.model}/${o.task}.v${o.prompt.version}`;
  const jsonSchema = toStrictSchema(o.schema);
  const messages: ChatMessage[] = [
    { role: "system", content: o.prompt.system },
    { role: "user", content: o.input },
  ];
  const t0 = Date.now();
  let attempts = 0, inputTokens = 0, outputTokens = 0, ok = false;
  let failure: string | undefined; // e.g. "RateLimitError:429" or "invalid_output"; never a message (can echo input)
  try {
    let lastError = "";
    while (attempts < 2) {
      attempts++;
      let content: string;
      try {
        const res = await provider.complete({ name: o.task.replace(/[^\w-]/g, "_"), schema: jsonSchema, messages, reasoningEffort: o.reasoningEffort });
        inputTokens += res.usage.inputTokens;
        outputTokens += res.usage.outputTokens;
        content = res.content;
      } catch (e) {
        const status = (e as { status?: unknown })?.status;
        failure = `${(e as Error)?.name ?? "Error"}${typeof status === "number" ? `:${status}` : ""}`;
        throw new AiFailedError("AI request failed", e);
      }
      try {
        const parsed = o.schema.safeParse(JSON.parse(content));
        if (!parsed.success) {
          throw new Error(
            "Schema errors:\n" + parsed.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"),
          );
        }
        const data = o.check ? o.check(parsed.data) : parsed.data;
        ok = true;
        return { data, modelVersion };
      } catch (e) {
        lastError = e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : e instanceof Error ? e.message : String(e);
        messages.push(
          { role: "assistant", content },
          { role: "user", content: `Your previous answer was rejected. Fix these errors and return the corrected JSON only:\n${lastError}` },
        );
      }
    }
    failure = "invalid_output";
    throw new AiFailedError(`AI output invalid after repair: ${lastError}`);
  } finally {
    const costUsd = (inputTokens * PRICE_IN + outputTokens * PRICE_OUT) / 1e6;
    // No input text, output text or key in the log.
    console.log(
      JSON.stringify({ task: o.task, modelVersion, attempts, inputTokens, outputTokens, costUsd: +costUsd.toFixed(6), ms: Date.now() - t0, ok, ...(failure ? { failure } : {}) }),
    );
  }
}

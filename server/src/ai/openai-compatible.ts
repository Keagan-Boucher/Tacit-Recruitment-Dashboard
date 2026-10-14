import OpenAI from "openai";
import type { AiProvider, StructuredRequest, StructuredResponse } from "./provider.ts";

export class OpenAiCompatibleProvider implements AiProvider {
  private client: OpenAI;
  constructor(baseURL: string, apiKey: string, private model: string) {
    this.client = new OpenAI({ baseURL, apiKey, timeout: 30_000, maxRetries: 2 });
  }

  async complete(req: StructuredRequest): Promise<StructuredResponse> {
    const body = {
      model: this.model,
      messages: req.messages,
      temperature: 0,
      max_completion_tokens: 6000,
      ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}),
      response_format: { type: "json_schema" as const, json_schema: { name: req.name, schema: req.schema, strict: true } },
    };
    // Groq rejects a generation that breaks the strict schema mid-stream (400 json_validate_failed); one fresh try usually lands.
    const res = await this.client.chat.completions.create(body).catch((e: { status?: number; code?: string }) => {
      if (e?.status === 400 && e?.code === "json_validate_failed") return this.client.chat.completions.create(body);
      throw e;
    });
    const choice = res.choices[0];
    // A refusal or a cut-off answer can't be repaired by asking again with the same budget.
    if (!choice?.message?.content || choice.finish_reason !== "stop") {
      throw Object.assign(new Error("Model returned no complete answer"), { name: `Incomplete_${choice?.finish_reason ?? "none"}` });
    }
    return {
      content: choice.message.content,
      model: res.model,
      usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
    };
  }
}

import OpenAI from "openai";
import type { AiProvider, StructuredRequest, StructuredResponse } from "./provider.ts";

export class OpenAiCompatibleProvider implements AiProvider {
  private client: OpenAI;
  constructor(baseURL: string, apiKey: string, private model: string) {
    this.client = new OpenAI({ baseURL, apiKey, timeout: 30_000, maxRetries: 2 });
  }

  async complete(req: StructuredRequest): Promise<StructuredResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: req.messages,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: req.name, schema: req.schema, strict: true } },
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

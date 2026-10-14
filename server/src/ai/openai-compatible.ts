import OpenAI from "openai";
import type { AiProvider, StructuredRequest, StructuredResponse } from "./provider.ts";

export class OpenAiCompatibleProvider implements AiProvider {
  private client: OpenAI;
  constructor(baseURL: string, apiKey: string, private model: string) {
    this.client = new OpenAI({ baseURL, apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async complete(req: StructuredRequest): Promise<StructuredResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: req.messages,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: req.name, schema: req.schema, strict: true } },
    });
    return {
      content: res.choices[0]?.message?.content ?? "",
      model: res.model,
      usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
    };
  }
}

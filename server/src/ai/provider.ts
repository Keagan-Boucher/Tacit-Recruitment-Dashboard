// The only thing in the app that knows which model vendor is behind it is the class implementing this.
// Today: openai-compatible.ts (Groq, openai/gpt-oss-120b). Another OpenAI-compatible host is an env change;
// a native Gemini/Claude adapter is one new file.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredRequest {
  /** Schema name sent with response_format, e.g. "NoteInterpretation". */
  name: string;
  /** Strict JSON Schema (every property required, additionalProperties: false on every object). */
  schema: Record<string, unknown>;
  messages: ChatMessage[];
}

export interface StructuredResponse {
  /** Raw JSON text from the model. The pipeline parses and Zod-validates it; the provider never does. */
  content: string;
  /** Model id the provider reports it used. */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  complete(req: StructuredRequest): Promise<StructuredResponse>;
}

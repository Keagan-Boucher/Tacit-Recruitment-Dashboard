import { z } from "zod";

// Keywords Groq strict mode may reject; Zod re-validates ranges/formats after the call anyway.
const STRIP = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "default",
]);

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.has(k)) continue;
    // "properties" holds user-defined names: recurse into values only (a property may be called "format").
    out[k] = k === "properties" && v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, walk(pv)]))
      : walk(v);
  }
  if (out.properties && typeof out.properties === "object") {
    out.type = "object";
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

/** Zod schema -> strict JSON Schema: all properties required, additionalProperties:false on every object. */
export function toStrictSchema(schema: z.ZodType): Record<string, unknown> {
  return walk(z.toJSONSchema(schema, { io: "output", target: "draft-7" })) as Record<string, unknown>;
}

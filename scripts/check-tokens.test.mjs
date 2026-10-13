import test from "node:test";
import assert from "node:assert/strict";
import { violations } from "./check-tokens.mjs";

test("flags raw colours, fonts and radii", () => {
  for (const bad of [
    "color: #D4FF3A;", "background: #fff;", "style={{ color: '#0a0a0c' }}",
    "border: 1px solid rgb(255 255 255 / .08);", "color: rgba(0,0,0,.5)",
    "font-family: Geist, sans-serif;", "fontFamily: 'Inter'",
    "border-radius: 12px;", "border-top-left-radius: 4px;", "borderRadius: 20",
  ]) assert.equal(violations(bad).length, 1, bad);
});

test("allows tokens, ids and the escape hatch", () => {
  for (const ok of [
    "color: var(--accent);", "border-radius: var(--radius-pill);", "font-family: var(--font);",
    "href=\"#main\"", "fill: rgb(var(--x))", "borderRadius: 'var(--radius-inner)'",
    "border-radius: 2px; /* token-ok: logo */",
  ]) assert.deepEqual(violations(ok), [], ok);
});

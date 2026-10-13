#!/usr/bin/env node
// F-03: fail when a component under web/src bypasses tokens.css (raw colour, font family or px radius).
// Escape hatch for the few fixed radii design-system.md allows (logo, chart bars, palette marker):
// put `token-ok` in a comment on the same line.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RULES = [
  [/#[0-9a-fA-F]{3,8}\b(?![-\w])/, "raw hex colour"],
  [/\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/, "raw colour function"],
  [/font-family\s*:(?!\s*(?:var\(|inherit))|fontFamily\s*:(?!\s*["'`]?var\()/, "font family outside var(--font)"],
  [/border(?:-[a-z]+)*-radius\s*:\s*\d|border\w*Radius\s*:\s*["'`]?\d/, "radius not from a token"],
];

export function violations(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes("token-ok")) return;
    for (const [re, why] of RULES) if (re.test(line)) out.push({ line: i + 1, why, text: line.trim() });
  });
  return out;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/src");
  const tokens = path.join(root, "styles", "tokens.css");
  let n = 0;
  for (const file of walk(root)) {
    if (file === tokens) continue;
    for (const v of violations(fs.readFileSync(file, "utf8"))) {
      n++;
      console.error(`${path.relative(process.cwd(), file)}:${v.line}  ${v.why}  ${v.text}`);
    }
  }
  if (n) { console.error(`\n${n} token violation(s). Use the variables in web/src/styles/tokens.css.`); process.exit(1); }
  console.log("check:tokens ok");
}

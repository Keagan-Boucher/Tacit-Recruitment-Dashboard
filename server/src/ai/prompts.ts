import { readFileSync } from "node:fs";

export interface Prompt {
  task: string;
  version: number;
  system: string;
}

/** Loads prompts/<task>.v<version>.md. Files are immutable once committed: a change is a new version. */
export function loadPrompt(task: string, version: number): Prompt {
  const file = new URL(`./prompts/${task}.v${version}.md`, import.meta.url);
  return { task, version, system: readFileSync(file, "utf8").trim() };
}

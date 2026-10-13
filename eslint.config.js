import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", ".claude/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["web/**/*.{ts,tsx}"], languageOptions: { globals: globals.browser }, ...reactHooks.configs.flat.recommended },
  { files: ["server/**/*.ts", "scripts/**/*.{ts,mjs,js}", "*.js"], languageOptions: { globals: globals.node } },
);

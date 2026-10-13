import { defineConfig } from "vitest/config";

// The compat app and compat firestore must resolve to the same copy, so inline firebase
// and let vite dedupe it, instead of a mix of externalised CJS and ESM copies.
export default defineConfig({
  resolve: { dedupe: ["firebase", "@firebase/app", "@firebase/app-compat", "@firebase/firestore", "@firebase/firestore-compat"] },
  test: { include: ["tests/rules/**/*.test.ts"], fileParallelism: false, server: { deps: { inline: [/firebase/] } } },
});

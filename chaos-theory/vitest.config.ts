import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/sim.ts",
        "src/research.ts",
        "src/live.ts",
        "src/storage.ts",
      ],
      reporter: ["text", "json-summary", "html"],
    },
  },
});

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
        "src/playtest.ts",
        "src/jobs.ts",
        "src/notices.ts",
        "src/schema.ts",
      ],
      reporter: ["text", "json-summary", "html"],
    },
  },
});

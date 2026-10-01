import { defineConfig } from "vitest/config";

// Served from GitHub Pages at /earworm/.
export default defineConfig({
    base: "/earworm/",
    build: {
        outDir: "dist",
        sourcemap: false,
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});

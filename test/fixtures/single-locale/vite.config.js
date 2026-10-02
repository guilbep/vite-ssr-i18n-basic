// Single-locale fixture for CI: no root redirect, no HTML minify, and a
// locale other than en/fr. Build from this directory: `npx vite build`.
import { defineConfig } from "vite";
import { createMultiLocalePlugin } from "../../../plugins/multi-locale-plugin.js";

export default defineConfig({
  plugins: [
    createMultiLocalePlugin({
      locales: ["de"],
      defaultLocale: "de",
      emitSitemaps: false,
      emit404s: false,
      emitWebmanifest: false,
      minifyHtml: false,
    }),
    {
      name: "virtual-entry",
      resolveId(id) {
        if (id === "virtual:static-site") return id;
      },
      load(id) {
        if (id === "virtual:static-site") return "// static site";
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: "virtual:static-site",
      output: { entryFileNames: ".vite/[name].js" },
    },
  },
});

import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  server: {
    proxy: {
      "/api": process.env.VITE_COMPANY_OS_API_PROXY ?? "http://127.0.0.1:4310",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

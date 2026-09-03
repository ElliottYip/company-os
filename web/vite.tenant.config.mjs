import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  build: {
    outDir: "tenant-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: new URL("./tenant.html", import.meta.url).pathname,
    },
  },
});

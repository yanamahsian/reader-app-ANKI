import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This is a GitHub Pages *project* page
// (https://yanamahsian.github.io/reader-app-ANKI/), not a user/org page,
// so every asset must be resolved under this subpath, not the domain root.
export default defineConfig({
  base: "/reader-app-ANKI/",
  plugins: [react()]
});

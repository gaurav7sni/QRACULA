// Static single-page build for AWS Amplify Hosting. Output: dist/
// Lovable keeps using vite.config.ts; Amplify uses `npm run build:amplify`.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: { outDir: "dist", emptyOutDir: true },
});

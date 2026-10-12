import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

if (process.env.VERCEL && !process.env.VITE_API_URL) {
  throw new Error("Set VITE_API_URL in Vercel to the public Render API origin.");
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": process.env.VITE_API_URL || "http://localhost:3001" } }
});

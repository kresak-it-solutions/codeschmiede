// Für Programme mit Vite-Oberfläche: in vite.config.js
//   import { vorschauAlias } from "./vorschau/vite-alias.mjs";
//   export default defineConfig({ plugins: [react()], resolve: { alias: vorschauAlias() } });
// Nur bei VITE_CS_VORSCHAU=1 (Testseite bei Cloudflare) zeigen die Tauri-Pakete auf die Nachbildung – sonst bleibt alles wie es ist.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TAURI_MODULE = ["@tauri-apps/api/core", "@tauri-apps/api/window", "@tauri-apps/api/webviewWindow", "@tauri-apps/api/event", "@tauri-apps/api/app",
  "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-fs", "@tauri-apps/plugin-notification"];

export function vorschauAlias(an = process.env.VITE_CS_VORSCHAU === "1") {
  if (!an) return {};
  const ziel = path.join(path.dirname(fileURLToPath(import.meta.url)), "tauri-api.mjs");
  return Object.fromEntries(TAURI_MODULE.map((m) => [m, ziel]));
}

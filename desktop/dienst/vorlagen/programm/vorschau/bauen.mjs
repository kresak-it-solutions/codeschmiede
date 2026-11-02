// Testseite der Programm-Oberfläche (Codeschmiede, Arbeitsplatz Stufe 2): baut aus ui/ eine Web-Fassung nach vorschau-dist/.
// Läuft bei Cloudflare Pages (Build-Befehl „node vorschau/bauen.mjs“, Ausgabe „vorschau-dist“) und in der Prüfung – nie im echten Programm.
// Davor kommen drei Skripte in jede HTML-Seite: die Tauri-Nachbildung (invoke, Dialog, Dateien, Fenster, Benachrichtigung → Beispieldaten,
// Hinweis „nachgespielt“), die Beispieldaten und der Vorschau-Helfer („Zeigen & kommentieren“). Nur Node-Bordmittel, keine Pakete.
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");
const QUELLE = path.join(WURZEL, process.env.CS_VORSCHAU_QUELLE || "ui");
const ZIEL = path.join(WURZEL, "vorschau-dist");
const MAX_DATEIEN = 2000; const MAX_BYTES = 50 * 1024 * 1024;
const SKRIPTE = ["tauri-nachbildung.js", "beispiele.js", "vorschau-helfer.js"];
const EINBAU = SKRIPTE.map((s) => `<script src="/cs-vorschau/${s}"></script>`).join("");

if (!path.relative(WURZEL, QUELLE) || path.relative(WURZEL, QUELLE).startsWith("..")) throw new Error("Quelle muss im Projekt liegen");
let anzahl = 0; let bytes = 0;
async function kopieren(von, nach) {
  await mkdir(nach, { recursive: true });
  for (const e of await readdir(von, { withFileTypes: true })) {
    const q = path.join(von, e.name); const z = path.join(nach, e.name); const l = await lstat(q);
    if (l.isSymbolicLink()) continue;                         // Verknüpfungen nie mitnehmen
    if (l.isDirectory()) { await kopieren(q, z); continue; }
    if (!l.isFile()) continue;
    if (++anzahl > MAX_DATEIEN || (bytes += l.size) > MAX_BYTES) throw new Error("ui/ ist zu groß für die Testseite");
    if (/\.html?$/i.test(e.name)) await writeFile(z, einbauen(await readFile(q, "utf8")));
    else await copyFile(q, z);
  }
}
/** Die drei Skripte direkt nach <head> einfügen (vor allen eigenen Skripten), sonst ganz vorn. */
function einbauen(html) {
  const m = /<head(\s[^>]*)?>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + EINBAU + html.slice(m.index + m[0].length) : EINBAU + html;
}

await rm(ZIEL, { recursive: true, force: true });
await kopieren(QUELLE, ZIEL);
await mkdir(path.join(ZIEL, "cs-vorschau"), { recursive: true });
for (const s of SKRIPTE) await copyFile(path.join(HIER, s), path.join(ZIEL, "cs-vorschau", s));
// Stand für „Neuer Stand da“ in der Codeschmiede (Cloudflare setzt CF_PAGES_COMMIT_SHA)
const commit = /^[0-9a-f]{7,40}$/.test(process.env.CF_PAGES_COMMIT_SHA || "") ? process.env.CF_PAGES_COMMIT_SHA : "";
await writeFile(path.join(ZIEL, "version.json"), JSON.stringify({ commit, art: "programm-testseite" }));
// Nur eigene Skripte, keine fremden Verbindungen; nicht in Suchmaschinen. Einbetten darf nur die Codeschmiede (Prüfung N5): Auch das Programm
// (Tauri) zeigt https://codeschmiede.pages.dev (desktop/ui/start.js leitet dorthin weiter) – darum keine tauri://- oder tauri.localhost-Herkunft.
await writeFile(path.join(ZIEL, "_headers"), `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors https://codeschmiede.pages.dev
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Robots-Tag: noindex
`);
console.log(`Testseite gebaut: ${anzahl} Dateien aus ${path.relative(WURZEL, QUELLE)}/ → vorschau-dist/ (Tauri-Funktionen nachgespielt)`);

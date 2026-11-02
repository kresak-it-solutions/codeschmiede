// Auftrag „Testseite für die Programm-Oberfläche einrichten“ bzw. „Seiten-Vorschau für das Dokument einrichten“ (Arbeitsplatz Stufen 2/3,
// Entwurf freigegeben von Gerhard 02.11.2026). Für BESTEHENDE Projekte: Die Werkstatt des Admins legt eine Hand-Änderung mit den Dateien
// der Vorlage an (ws_code_hand_auftrag) – mit Zweig, Prüfungen, Sicherheitsprüfung und Freigabe wie jeder Auftrag. Nichts wird ungefragt
// geändert: Vorhandene Dateien werden NIE überschrieben (nur fehlende kommen dazu); .gitignore bekommt höchstens eine Zeile dazu.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ART_ORDNER } from "./repo.mjs";
import { CHANGELOG_PFAD, changelogZeile, dateiAufMain } from "./datenbank.mjs";
import { ohneGeheimnisse } from "./geheim.mjs";
import { repoGut } from "./anbindungen.mjs";

export const SATZ = {
  windows: {
    titel: "Testseite für die Programm-Oberfläche einrichten",
    dateien: ["bauen.mjs", "tauri-nachbildung.js", "beispiele.js", "vorschau-helfer.js", "tauri-api.mjs", "vite-alias.mjs", "README.md"]
      .map((n) => [`vorschau/${n}`, path.join("programm", "vorschau", n)]),
    gitignore: "vorschau-dist/",
    text: "Testseite der Programm-Oberfläche (Arbeitsplatz Stufe 2): `vorschau/bauen.mjs` baut aus `ui/` eine Web-Fassung nach `vorschau-dist/` "
      + "mit nachgespielten Tauri-Funktionen (Beispieldaten in `vorschau/beispiele.js`, Hinweis „nachgespielt“) und dem Vorschau-Helfer. "
      + "Danach unter „Anbindungen“ › „Testseite einrichten“ (Cloudflare Pages: `node vorschau/bauen.mjs` → `vorschau-dist`). Vorhandene Dateien bleiben unverändert.",
  },
  pdf: {
    titel: "Seiten-Vorschau für das Dokument einrichten",
    dateien: [[".github/workflows/dokument.yml", path.join("_dokument", "dokument.yml")]],
    gitignore: null,
    text: "Seiten-Vorschau (Arbeitsplatz Stufe 3): Ablauf „Dokument“ baut auf Knopfdruck das PDF aus dem Zweig (`npm run pdf` → `ausgabe/dokument.pdf`) "
      + "und legt die Seiten als Bilder ab. Fehlt das Skript „pdf“, bitte als eigenen Auftrag ergänzen.",
  },
};

/** Dateien der Vorlage für ein Ziel: [{ pfad, inhalt }]. */
export async function vorlageDateien(ziel, artOrdner = ART_ORDNER) {
  const s = SATZ[ziel]; if (!s) throw new Error("Unbekanntes Ziel");
  return Promise.all(s.dateien.map(async ([pfad, quelle]) => ({ pfad, inhalt: await readFile(path.join(artOrdner, quelle), "utf8") })));
}
/** .gitignore um eine Zeile ergänzen (nur wenn sie fehlt). → neuer Inhalt oder null (nichts zu tun). */
export function gitignoreErgaenzen(alt, zeile) {
  if (!zeile) return null;
  const t = typeof alt === "string" ? alt : "";
  if (t.split(/\r?\n/).some((z) => z.trim() === zeile || z.trim() === `/${zeile}`)) return null;
  return `${t}${t && !t.endsWith("\n") ? "\n" : ""}${zeile}\n`;
}

/**
 * Hand-Auftrag vorbereiten und anlegen. auftragAnlegen({ titel, text, dateien, basis_sha }) → Auftragsnummer.
 * Rückgabe: Hinweistext für die Aktion.
 */
export async function vorschauEinrichten({ sh, projekt, ziel, auftragAnlegen, artOrdner = ART_ORDNER, heute = new Date() }) {
  if (!repoGut(projekt?.repo)) throw new Error("Ungültiges Repository");
  const s = SATZ[ziel]; if (!s) throw new Error("Unbekanntes Ziel");
  const dateien = []; const da = [];
  for (const d of await vorlageDateien(ziel, artOrdner)) {
    if (await dateiAufMain(sh, projekt.repo, d.pfad)) { da.push(d.pfad); continue; }   // nie überschreiben
    dateien.push({ pfad: d.pfad, inhalt: d.inhalt, basis_blob: "" });
  }
  if (!dateien.length) return `${s.titel}: schon da (${da.length} Datei(en) auf main) – nichts zu tun`;
  if (s.gitignore) {
    const gi = await dateiAufMain(sh, projekt.repo, ".gitignore");
    const neu = gitignoreErgaenzen(gi?.inhalt, s.gitignore);
    if (neu != null) dateien.push({ pfad: ".gitignore", inhalt: neu, basis_blob: gi?.blob || "" });
  }
  const { stdout } = await sh("gh", ["api", `repos/${projekt.repo}/git/ref/heads/main`, "--jq", ".object.sha"]);
  const basis = String(stdout).trim();
  if (!/^[0-9a-f]{40}$/.test(basis)) throw new Error("Stand von main nicht lesbar");
  const log = await dateiAufMain(sh, projekt.repo, CHANGELOG_PFAD).catch(() => null);
  const zeile = log && changelogZeile(log.inhalt, heute.toISOString().slice(0, 10), { version: "–", wer: "Codeschmiede (Arbeitsplatz, Hand-Änderung des Admins)", was: `**${s.titel}:** ${s.text}` });
  if (zeile && ohneGeheimnisse(zeile) === zeile && Buffer.byteLength(zeile) <= 512 * 1024) dateien.push({ pfad: CHANGELOG_PFAD, inhalt: zeile, basis_blob: log.blob });
  const nr = await auftragAnlegen({ titel: s.titel, text: `${s.text}${da.length ? `\n\nSchon vorhanden und unverändert: ${da.join(", ")}` : ""}`, dateien, basis_sha: basis });
  return `Auftrag #${nr} „${s.titel}“ angelegt (${dateien.length} Datei(en)) – nach Freigabe und Zusammenführen ist es da${da.length ? ` · unverändert: ${da.length} vorhandene Datei(en)` : ""}`;
}

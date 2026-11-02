// Sicherungen im Projektordner (sicherungen\, seit 0.13.1, Rest des Entwurfs 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04).
// Beim Live-Schalten legt die Werkstatt des Admins ab:
//   * <datum>_repo-main_<stand>.bundle – Stand des Repositorys (git bundle von main);
//   * <datum>_datenbank-aufbau_<stand>.json – Aufbau der Live-Datenbank vor dem Einspielen (Tabellen, Regeln, Funktionen – keine Daten). Er entsteht im
//     Ablauf „Datenbank“ bei GitHub (Sicherung in codeschmiede.sicherungen) und wird dort NUR bei privaten Repositories als Artefakt
//     „datenbank-aufbau“ (7 Tage) hochgeladen; die Werkstatt lädt genau dieses Artefakt genau dieses Laufs (Größe begrenzt) und legt es ab.
// Nie überschreiben, nie automatisch löschen, keine Geheimnisse (Text wird gefiltert), keine Verbindungsdaten (stehen nie im Aufbau).
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ohneGeheimnisse } from "./geheim.mjs";

export const AUFBAU_ARTEFAKT = "datenbank-aufbau";
export const AUFBAU_MAX = 50 * 1024 * 1024;
export const BUNDLE_MAX = 2 * 1024 * 1024 * 1024;
const zwei = (n) => String(n).padStart(2, "0");
/** Dateiname einer Sicherung: JJJJ-MM-TT_HHMM_<art>_<stand>.<endung> (Ortszeit des PCs). */
export function sicherungsName(art, stand, endung, zeit = new Date()) {
  if (!/^(repo-main|datenbank-aufbau)$/.test(art) || !/^(bundle|json)$/.test(endung)) throw new Error("Unbekannte Sicherung");
  const s = /^[0-9a-f]{7,40}$/.test(String(stand || "")) ? String(stand).slice(0, 7) : "unbekannt";
  return `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}_${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}_${art}_${s}.${endung}`;
}
const NAME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})_(repo-main|datenbank-aufbau)_([0-9a-f]{7}|unbekannt)(?:-\d{1,3})?\.(bundle|json)$/;
/** Freier Name: gibt es den Namen schon, wird -2, -3 … angehängt (nie überschreiben). */
export function freierName(name, vorhanden) {
  const da = new Set(vorhanden);
  if (!da.has(name)) return name;
  const m = /^(.*)(\.[a-z]+)$/.exec(name);
  for (let i = 2; i < 1000; i++) { const n = `${m[1]}-${i}${m[2]}`; if (!da.has(n)) return n; }
  throw new Error("Zu viele Sicherungen mit gleichem Namen");
}
/** Übersicht aus den Dateinamen im Ordner sicherungen: { anzahl, letzte: { name, zeit, art } | null, je: { repo-main, datenbank-aufbau } }. */
export function uebersicht(namen) {
  const l = [];
  for (const n of namen) {
    const m = NAME.exec(n); if (!m) continue;
    l.push({ name: n, art: m[6], zeit: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) });
  }
  l.sort((a, b) => b.zeit - a.zeit || (a.name < b.name ? 1 : -1));
  return { anzahl: l.length, letzte: l[0] || null, je: { "repo-main": l.filter((x) => x.art === "repo-main").length, "datenbank-aufbau": l.filter((x) => x.art === "datenbank-aufbau").length } };
}
/** Lampe „Sicherungen“ für die Ampel (≤ 200 Zeichen, ohne Pfad). */
export function sicherungenLampe(u) {
  if (!u.anzahl) return { stand: "grau", text: "Noch keine Sicherung im Projektordner – entsteht beim nächsten Live-Schalten (Repo-Stand, mit Datenbank auch ihr Aufbau)" };
  const z = u.letzte.zeit.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  return { stand: "gruen", text: `${u.anzahl} Sicherung(en) · letzte ${z} (${u.letzte.art === "repo-main" ? "Repo-Stand" : "Datenbank-Aufbau"})${u.anzahl > 20 ? " · ältere bleiben liegen – bei Bedarf selbst aufräumen" : ""}`.slice(0, 200) };
}

/**
 * Aufbau der Datenbank prüfen: JSON-Objekt nur mit den Schlüsseln, die der Ablauf „Datenbank“ schreibt; Geheimnisse werden gefiltert.
 * Rückgabe: { text (schön formatiert), gefiltert } oder Fehler.
 */
export function aufbauPruefen(roh) {
  const t = String(roh || "").trim();
  if (!t || t.length > AUFBAU_MAX) throw new Error("Aufbau der Datenbank fehlt oder ist zu groß");
  let j; try { j = JSON.parse(t); } catch { throw new Error("Aufbau der Datenbank ist kein gültiges JSON"); }
  if (!j || typeof j !== "object" || Array.isArray(j) || Object.keys(j).some((k) => !["tabellen", "regeln", "funktionen", "eingespielt"].includes(k))) throw new Error("Aufbau der Datenbank hat eine unerwartete Form");
  const schoen = JSON.stringify(j, null, 1);
  // Werte im Aufbau (Standardwerte, Funktionen, Regeln) könnten von Hand eingetragene Schlüssel enthalten – filtern, Ergebnis muss gültig bleiben
  const sauber = ohneGeheimnisse(schoen);
  try { JSON.parse(sauber); } catch { throw new Error("Aufbau der Datenbank enthält Zugangsdaten, die sich nicht sauber entfernen lassen – nicht abgelegt"); }
  return { text: `${sauber}\n`, gefiltert: sauber !== schoen };
}

/**
 * Artefakt „datenbank-aufbau“ eines Laufs holen: sh = gh-Aufruf (mit Grenzen), repo = owner/name (geprüft), lauf = databaseId, ordner = eigener
 * leerer Temp-Ordner. Größe vorher über die Schnittstelle prüfen. Rückgabe: Text oder null (kein Artefakt, z. B. öffentliches Repository oder alter Ablauf).
 */
export async function aufbauArtefakt({ sh, repo, lauf, ordner, max = AUFBAU_MAX }) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo || "") || !/^\d{1,20}$/.test(String(lauf || ""))) throw new Error("Ungültiger Lauf");
  const { stdout } = await sh("gh", ["api", `repos/${repo}/actions/runs/${lauf}/artifacts`, "--jq", `[.artifacts[] | select(.name == "${AUFBAU_ARTEFAKT}" and (.expired | not)) | .size_in_bytes]`]);
  let groessen = []; try { groessen = JSON.parse(stdout || "[]"); } catch { groessen = []; }
  if (!Array.isArray(groessen) || groessen.length !== 1) return null;
  if (!(Number(groessen[0]) > 0) || Number(groessen[0]) > max) throw new Error("Sicherung des Datenbank-Aufbaus ist zu groß – nicht abgelegt");
  await sh("gh", ["run", "download", String(lauf), "--repo", repo, "--name", AUFBAU_ARTEFAKT, "--dir", ordner]);
  const namen = await readdir(ordner);
  if (namen.length !== 1 || namen[0] !== "datenbank-aufbau.json") throw new Error("Unerwarteter Inhalt der Sicherung – nicht abgelegt");
  const p = path.join(ordner, namen[0]);
  const st = await lstat(p);
  if (!st.isFile() || st.isSymbolicLink() || st.size > max) throw new Error("Unerwarteter Inhalt der Sicherung – nicht abgelegt");
  return readFile(p, "utf8");
}

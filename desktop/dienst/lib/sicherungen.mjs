// Sicherungen im Projektordner (sicherungen\, seit 0.13.1, Rest des Entwurfs 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04).
// Beim Live-Schalten legt die Werkstatt des Admins ab:
//   * <datum>_repo-live_<stand>.bundle – der eben live geschaltete Stand (git bundle des Zweigs live = Live-Commit);
//   * <datum>_datenbank-aufbau_<stand>.json – Aufbau der Live-Datenbank vor dem Einspielen (Tabellen, Regeln, Funktionen – keine Daten). Er entsteht im
//     Ablauf „Datenbank“ bei GitHub (Sicherung in codeschmiede.sicherungen) und wird dort NUR bei privaten Repositories als Artefakt
//     „datenbank-aufbau“ (7 Tage) hochgeladen – als GEFILTERTE Fassung: Funktionen nur mit Signatur und Prüfsumme, Standardwerte und
//     Regel-Ausdrücke ohne bekannte Schlüssel-/Token-/Verbindungs-Muster. Die Werkstatt lädt genau dieses Artefakt genau dieses Laufs als ZIP
//     (gh api …/artifacts/<id>/zip, Größe vorher und beim Entpacken begrenzt) und legt es ab.
// Nie überschreiben, nie automatisch löschen, keine Geheimnisse (Text wird gefiltert), keine Verbindungsdaten (stehen nie im Aufbau).
import { inflateRawSync } from "node:zlib";
import { ohneGeheimnisse } from "./geheim.mjs";

export const AUFBAU_ARTEFAKT = "datenbank-aufbau";
export const AUFBAU_MAX = 50 * 1024 * 1024;
export const BUNDLE_MAX = 2 * 1024 * 1024 * 1024;
export const ZIP_MAX = 20 * 1024 * 1024;
const zwei = (n) => String(n).padStart(2, "0");
/** Dateiname einer Sicherung: JJJJ-MM-TT_HHMM_<art>_<stand>.<endung> (Ortszeit des PCs). */
export function sicherungsName(art, stand, endung, zeit = new Date()) {
  if (!/^(repo-live|repo-main|datenbank-aufbau)$/.test(art) || !/^(bundle|json)$/.test(endung)) throw new Error("Unbekannte Sicherung");
  const s = /^[0-9a-f]{7,40}$/.test(String(stand || "")) ? String(stand).slice(0, 7) : "unbekannt";
  return `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}_${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}_${art}_${s}.${endung}`;
}
const NAME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})_(repo-live|repo-main|datenbank-aufbau)_([0-9a-f]{7}|unbekannt)(?:-\d{1,3})?\.(bundle|json)$/;
/** Freier Name: gibt es den Namen schon, wird -2, -3 … angehängt (nie überschreiben). */
export function freierName(name, vorhanden) {
  const da = new Set(vorhanden);
  if (!da.has(name)) return name;
  const m = /^(.*)(\.[a-z]+)$/.exec(name);
  for (let i = 2; i < 1000; i++) { const n = `${m[1]}-${i}${m[2]}`; if (!da.has(n)) return n; }
  throw new Error("Zu viele Sicherungen mit gleichem Namen");
}
/** Übersicht aus den Dateinamen im Ordner sicherungen: { anzahl, letzte: { name, zeit, art } | null, je: { repo, datenbank-aufbau } }. */
export function uebersicht(namen) {
  const l = [];
  for (const n of namen) {
    const m = NAME.exec(n); if (!m) continue;
    l.push({ name: n, art: m[6], zeit: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) });
  }
  l.sort((a, b) => b.zeit - a.zeit || (a.name < b.name ? 1 : -1));
  return { anzahl: l.length, letzte: l[0] || null, je: { repo: l.filter((x) => x.art !== "datenbank-aufbau").length, "datenbank-aufbau": l.filter((x) => x.art === "datenbank-aufbau").length } };
}
/** Lampe „Sicherungen“ für die Ampel (≤ 200 Zeichen, ohne Pfad). */
export function sicherungenLampe(u) {
  if (!u.anzahl) return { stand: "grau", text: "Noch keine Sicherung im Projektordner – entsteht beim nächsten Live-Schalten (Repo-Stand, mit Datenbank auch ihr Aufbau)" };
  const z = u.letzte.zeit.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  return { stand: "gruen", text: `${u.anzahl} Sicherung(en) · letzte ${z} (${u.letzte.art === "datenbank-aufbau" ? "Datenbank-Aufbau" : "Repo-Stand"})${u.anzahl > 20 ? " · ältere bleiben liegen – bei Bedarf selbst aufräumen" : ""}`.slice(0, 200) };
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
  // Funktionen nur als Signatur + Prüfsumme (B2) – ein Funktions-Text wird nie abgelegt
  const FN = ["schema", "name", "argumente", "ergebnis", "sprache", "definer", "pruefsumme"];
  if (j.funktionen != null && (!Array.isArray(j.funktionen) || j.funktionen.some((f) => !f || typeof f !== "object" || Array.isArray(f) || Object.keys(f).some((k) => !FN.includes(k)) || !/^[0-9a-f]{64}$/.test(String(f.pruefsumme || ""))))) {
    throw new Error("Aufbau der Datenbank enthält Funktions-Texte (Ablauf „Datenbank“ älter als 0.13.1?) – nicht abgelegt");
  }
  const schoen = JSON.stringify(j, null, 1);
  // Werte im Aufbau (Standardwerte, Funktionen, Regeln) könnten von Hand eingetragene Schlüssel enthalten – filtern, Ergebnis muss gültig bleiben
  const sauber = ohneGeheimnisse(schoen);
  try { JSON.parse(sauber); } catch { throw new Error("Aufbau der Datenbank enthält Zugangsdaten, die sich nicht sauber entfernen lassen – nicht abgelegt"); }
  return { text: `${sauber}\n`, gefiltert: sauber !== schoen };
}

/**
 * Genau eine Datei aus einem ZIP lesen (Artefakt-Download von GitHub): nur ein Eintrag mit genau diesem Namen, nicht verschlüsselt, kein ZIP64,
 * „gespeichert“ oder „deflate“, entpackt höchstens max Bytes (inflateRawSync mit maxOutputLength – keine ZIP-Bombe).
 */
export function zipEinzeln(buf, name, max) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const fehl = (t = "Unerwarteter Inhalt der Sicherung – nicht abgelegt") => { throw new Error(t); };
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) fehl();
  if (b.readUInt16LE(e + 8) !== 1 || b.readUInt16LE(e + 10) !== 1) fehl();
  const cd = b.readUInt32LE(e + 16);
  if (cd + 46 > e || b.readUInt32LE(cd) !== 0x02014b50) fehl();
  const flags = b.readUInt16LE(cd + 8); const methode = b.readUInt16LE(cd + 10);
  const gepackt = b.readUInt32LE(cd + 20); const groesse = b.readUInt32LE(cd + 24);
  const nl = b.readUInt16LE(cd + 28); const lokal = b.readUInt32LE(cd + 42);
  if (b.toString("utf8", cd + 46, cd + 46 + nl) !== name) fehl();
  if (flags & 1 || gepackt === 0xffffffff || groesse === 0xffffffff || lokal === 0xffffffff) fehl();
  if (groesse > max) fehl("Sicherung des Datenbank-Aufbaus ist zu groß – nicht abgelegt");
  if (lokal + 30 > b.length || b.readUInt32LE(lokal) !== 0x04034b50) fehl();
  const start = lokal + 30 + b.readUInt16LE(lokal + 26) + b.readUInt16LE(lokal + 28);
  if (start + gepackt > cd) fehl();
  const daten = b.subarray(start, start + gepackt);
  let aus;
  if (methode === 0) aus = daten;
  else if (methode === 8) { try { aus = inflateRawSync(daten, { maxOutputLength: max }); } catch { fehl("Sicherung des Datenbank-Aufbaus ist zu groß oder beschädigt – nicht abgelegt"); } }
  else fehl();
  if (aus.length !== groesse || aus.length > max) fehl();
  return aus;
}

/**
 * Artefakt „datenbank-aufbau“ eines Laufs holen: sh = gh-Aufruf (mit Grenzen), repo = owner/name (geprüft), lauf = databaseId. Kennung und Größe
 * über die Schnittstelle, dann genau dieses Artefakt als ZIP (gh api …/artifacts/<id>/zip, höchstens ZIP_MAX), Entpacken begrenzt (max).
 * Rückgabe: Text oder null (kein Artefakt, z. B. öffentliches Repository, keine neuen Datenbank-Dateien oder alter Ablauf).
 */
export async function aufbauArtefakt({ sh, repo, lauf, max = AUFBAU_MAX, zipMax = ZIP_MAX }) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo || "") || !/^\d{1,20}$/.test(String(lauf || ""))) throw new Error("Ungültiger Lauf");
  const { stdout } = await sh("gh", ["api", `repos/${repo}/actions/runs/${lauf}/artifacts`, "--jq", `[.artifacts[] | select(.name == "${AUFBAU_ARTEFAKT}" and (.expired | not)) | [.id, .size_in_bytes]]`]);
  let liste = []; try { liste = JSON.parse(String(stdout || "[]")); } catch { liste = []; }
  if (!Array.isArray(liste) || liste.length !== 1 || !Array.isArray(liste[0])) return null;
  const [id, groesse] = liste[0];
  if (!/^\d{1,20}$/.test(String(id))) throw new Error("Unerwarteter Inhalt der Sicherung – nicht abgelegt");
  if (!(Number(groesse) > 0) || Number(groesse) > zipMax) throw new Error("Sicherung des Datenbank-Aufbaus ist zu groß – nicht abgelegt");
  const { stdout: zip } = await sh("gh", ["api", `repos/${repo}/actions/artifacts/${id}/zip`], { encoding: "buffer", maxBuffer: zipMax + 64 * 1024 });
  if (!zip || zip.length > zipMax) throw new Error("Sicherung des Datenbank-Aufbaus ist zu groß – nicht abgelegt");
  return zipEinzeln(zip, "datenbank-aufbau.json", max).toString("utf8");
}

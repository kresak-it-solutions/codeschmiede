// Setup-Dateien im Projektordner (setup\<version>\, 0.13.1, Entscheidung Gerhard 02.11.2026 10:00).
// Nach jedem erfolgreichen Live-Schalten eines Programms (technik_art „programm“) legt die Werkstatt des Admins die Installationsdateien GENAU
// dieses Stands ab: aus den Dateien des Ablaufs „Programm bauen“ für den Live-Commit (Artefakte installation-*) bzw. – bei der Codeschmiede selbst
// und Projekten mit Releases – aus dem GitHub-Release „programm-v<version>“. Nur das eigene Repository, nur erwartete Endungen, Größen begrenzt,
// nie überschreiben, nichts automatisch löschen. Diese Hilfen sind ohne Netz testbar; die Abrufe macht index.mjs.
import { inflateRawSync } from "node:zlib";
import { crc32 } from "./sicherungen.mjs";

export const SETUP_JE = 400 * 1024 * 1024;       // je Datei
export const SETUP_GESAMT = 1024 * 1024 * 1024;  // je Version
const ENDUNG = /\.(exe|msi|dmg|app\.tar\.gz|AppImage|deb)(\.sig)?$/;
/** Erwarteter Dateiname einer Installation: nur einfache Namen (kein Pfad), erlaubte Endung (+ .sig). */
export const setupNameOk = (n) => typeof n === "string" && n.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(n) && !n.includes("..") && !/[. ]$/.test(n) && ENDUNG.test(n);
/** Ordnername der Version: v1.2.3 bzw. v1.2.3_abc1234 / stand_abc1234 (aus „v1.2.3 · abc1234“). */
export function versionOrdner(bezeichnung, commit = "") {
  const v = /\bv?(\d{1,4}\.\d{1,4}\.\d{1,6})\b/.exec(String(bezeichnung || ""))?.[1];
  const c = /^[0-9a-f]{7,40}$/.test(String(commit || "")) ? String(commit).slice(0, 7) : "";
  if (v) return c ? `v${v}_${c}` : `v${v}`;
  if (c) return `stand_${c}`;
  throw new Error("Version unbekannt");
}
/** Release-Tag „programm-v1.2.3“ → „v1.2.3“ (sonst null). */
export const releaseVersion = (tag) => (/^programm-v(\d{1,4}\.\d{1,4}\.\d{1,6})$/.exec(String(tag || ""))?.[1] ? `v${/^programm-v(.+)$/.exec(tag)[1]}` : null);
/** Neuestes veröffentlichtes Release „programm-v…“: keine Entwürfe, keine Vorab-Versionen (auch wenn die Liste sie doch enthält). */
export const releaseWahl = (liste) => (Array.isArray(liste) ? liste : []).find((x) => x && x.draft !== true && x.prerelease !== true && releaseVersion(x.tag)) || null;
/** Wogegen der Release-Tag verglichen wird: „live“, wenn es den Zweig gibt, sonst der Standard-Zweig des Repositorys (z. B. main bei der Codeschmiede). */
export function vergleichsZweig(liveDa, standard) {
  if (liveDa) return "live";
  const z = String(standard || "").trim().replace(/^"|"$/g, "");
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(z) && !z.includes("..") && !z.endsWith("/") ? z : null;
}
/** GitHub compare live...<tag>: nur „behind“ (Tag ist Vorfahre von live) oder „identical“ zählt als „im Live-Stand“. */
export const tagImLive = (status) => ["behind", "identical"].includes(String(status || "").trim().replace(/^"|"$/g, ""));
/**
 * Dateien eines Releases auswählen: nur hochgeladene Dateien mit erlaubtem Namen, je ≤ maxJe, zusammen ≤ maxGesamt. Rückgabe { dateien, ausgelassen }.
 */
export function releaseDateien(assets, { maxJe = SETUP_JE, maxGesamt = SETUP_GESAMT } = {}) {
  const dateien = []; const ausgelassen = []; let summe = 0;
  for (const a of Array.isArray(assets) ? assets : []) {
    const n = a?.name; const g = Number(a?.size);
    if (!setupNameOk(n) || (a.state && a.state !== "uploaded") || !(g > 0) || !/^\d{1,20}$/.test(String(a?.id ?? ""))) { if (n) ausgelassen.push(String(n).slice(0, 80)); continue; }
    if (g > maxJe || summe + g > maxGesamt) { ausgelassen.push(n); continue; }
    summe += g; dateien.push({ id: String(a.id), name: n, groesse: g });
  }
  return { dateien, ausgelassen };
}
/**
 * Alle erlaubten Dateien aus einem ZIP (Artefakt von GitHub) lesen: nur Einträge OHNE Ordner, erlaubter Name, nicht verschlüsselt, kein ZIP64,
 * gespeichert oder deflate, entpackt je ≤ maxJe und zusammen ≤ maxGesamt (keine ZIP-Bombe), CRC geprüft. Andere Einträge fallen weg.
 */
export function zipDateien(buf, { maxJe = SETUP_JE, maxGesamt = SETUP_GESAMT, nameOk = setupNameOk } = {}) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const fehl = (t = "Unerwarteter Inhalt der Setup-Dateien – nichts abgelegt") => { throw new Error(t); };
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) fehl();
  const anzahl = b.readUInt16LE(e + 10); let cd = b.readUInt32LE(e + 16);
  if (anzahl === 0xffff || cd === 0xffffffff || anzahl > 200) fehl();
  const r = []; let summe = 0;
  for (let n = 0; n < anzahl; n++) {
    if (cd + 46 > e || b.readUInt32LE(cd) !== 0x02014b50) fehl();
    const flags = b.readUInt16LE(cd + 8); const methode = b.readUInt16LE(cd + 10); const crc = b.readUInt32LE(cd + 16);
    const gepackt = b.readUInt32LE(cd + 20); const groesse = b.readUInt32LE(cd + 24);
    const nl = b.readUInt16LE(cd + 28); const xl = b.readUInt16LE(cd + 30); const kl = b.readUInt16LE(cd + 32); const lokal = b.readUInt32LE(cd + 42);
    const name = b.toString("utf8", cd + 46, cd + 46 + nl);
    cd += 46 + nl + xl + kl;
    if (name.includes("/") || name.includes("\\") || !nameOk(name)) continue;   // Ordner und fremde Dateien fallen weg
    if (flags & 1 || gepackt === 0xffffffff || groesse === 0xffffffff || lokal === 0xffffffff) fehl();
    if (groesse > maxJe || summe + groesse > maxGesamt) fehl("Setup-Datei zu groß – nichts abgelegt");
    if (lokal + 30 > b.length || b.readUInt32LE(lokal) !== 0x04034b50) fehl();
    const start = lokal + 30 + b.readUInt16LE(lokal + 26) + b.readUInt16LE(lokal + 28);
    if (start + gepackt > b.length) fehl();
    const daten = b.subarray(start, start + gepackt);
    let aus;
    if (methode === 0) aus = daten;
    else if (methode === 8) { try { aus = inflateRawSync(daten, { maxOutputLength: Math.max(1, groesse) }); } catch { fehl("Setup-Datei zu groß oder beschädigt – nichts abgelegt"); } }
    else fehl();
    if (aus.length !== groesse || crc32(aus) !== crc) fehl("Setup-Datei beschädigt (Prüfsumme) – nichts abgelegt");
    summe += groesse; r.push({ name, daten: aus });
  }
  return r;
}
/** Lampe „Setup-Dateien“ (≤ 200 Zeichen, ohne Pfad). versionen = Ordnernamen in setup. */
export function setupLampe(versionen, offen = null) {
  const l = versionen.filter((v) => /^(v\d|stand_)/.test(v)).sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  if (!l.length) return { stand: "grau", text: offen ? `Wartet auf den Programm-Bau von ${offen} – danach legt die Werkstatt die Setup-Dateien ab` : "Noch keine Setup-Dateien – entstehen beim nächsten Live-Schalten (bzw. Release) des Programms" };
  return { stand: "gruen", text: `${l.length} Version(en) · letzte ${l.at(-1)}${offen ? ` · wartet auf den Bau von ${offen}` : ""}`.slice(0, 200) };
}

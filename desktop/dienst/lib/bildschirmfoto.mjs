// Bildschirmfoto der Windows-Sandbox an den Chat (Arbeitsplatz Stufe 2, Entwurf 1.0 freigegeben von Gerhard 02.11.2026, docs/KONZEPT-ARBEITSPLATZ.md).
// Nur unter Windows, nur auf dem PC, der die Sandbox gestartet hat (Ziel-PC der Aktion). Aufgenommen wird NUR das Fenster „Windows Sandbox“
// (festes PowerShell-Skript bildschirmfoto.ps1, Argument-Liste ohne Shell, PrintWindow statt Bildschirm-Kopie). Das Bild geht in den eigenen,
// privaten Chat-Speicher (ws-chat, Pfad <ich>/<projekt>/<zufall>.png) – in den Chat kommt es erst, wenn Gerhard es in der Vorschau bestätigt.
// Die lokale Datei wird danach immer gelöscht. Nichts davon geht an die KI, bevor Gerhard es selbst sendet.
import { constants } from "node:fs";
import { lstat, mkdir, open, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const SKRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "bildschirmfoto.ps1");
export const MAX_BYTES = 10 * 1024 * 1024;
export const FEHLER = {
  2: "Kein Fenster „Windows Sandbox“ offen – zuerst „In Windows-Sandbox starten“ und warten, bis das Programm zu sehen ist",
  3: "Das Fenster der Windows-Sandbox ist minimiert – bitte wieder öffnen",
  4: "Das Fenster der Windows-Sandbox hat ein leeres Bild geliefert – bitte kurz warten und noch einmal",
  5: "Ungültiger Ablageort für das Bildschirmfoto",
  6: "Mehrere Fenster „Windows Sandbox“ offen – bitte nur eines offen lassen",
  7: "Das Fenster ist zu groß für ein Bildschirmfoto",
};

/** Pfad der eingebauten Windows PowerShell (nie aus PATH, nie pwsh aus einem fremden Ordner). */
export function powershellPfad(env = process.env) {
  return path.win32.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

const ZIEL = /^[A-Za-z]:\\[^"<>|*?\r\n]{1,400}\\bildschirmfotos\\[0-9]{1,18}\.png$/;
/** Aufruf (Befehl + feste Argument-Liste). Nur unter Windows; der Zielpfad wird vom Dienst erzeugt und hier noch einmal geprüft. */
export function fotoAufruf({ ziel, plattform = process.platform, env = process.env, skript = SKRIPT }) {
  if (plattform !== "win32") throw new Error("Bildschirmfotos der Sandbox gibt es nur unter Windows");
  if (!ZIEL.test(String(ziel || ""))) throw new Error(FEHLER[5]);
  return { befehl: powershellPfad(env), args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", skript, "-Ziel", ziel] };
}

/** PNG prüfen: Signatur, erster Block IHDR, Breite/Höhe 1–10000, höchstens 10 MB. → { breite, hoehe } oder null. */
export function pngPruefen(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.length > MAX_BYTES) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => buf[i] === b)) return null;
  if (buf.readUInt32BE(8) !== 13 || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  const breite = buf.readUInt32BE(16); const hoehe = buf.readUInt32BE(20);
  if (breite < 1 || hoehe < 1 || breite > 10000 || hoehe > 10000) return null;
  return { breite, hoehe };
}

/** Eine eben geschriebene Datei sicher lesen: echte Datei, keine Verknüpfung, kein harter Link, höchstens max Bytes. */
export async function dateiSicherLesen(datei, max = MAX_BYTES) {
  const l = await lstat(datei);
  if (!l.isFile() || l.isSymbolicLink() || l.nlink !== 1 || l.size > max || l.size < 1) throw new Error("Bildschirmfoto ungültig");
  const fh = await open(datei, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const s = await fh.stat();
    if (!s.isFile() || s.ino !== l.ino || s.dev !== l.dev || s.size !== l.size) throw new Error("Bildschirmfoto ungültig");
    const b = Buffer.alloc(s.size); await fh.read(b, 0, s.size, 0); return b;
  } finally { await fh.close(); }
}

/**
 * Bildschirmfoto aufnehmen, prüfen, hochladen und melden.
 * a = Aktion { id, projekt_id }, ordner = <Daten>/bildschirmfotos, benutzer = eigene Kennung,
 * starten(befehl, args) → { code } (ohne Shell), hochladen(pfad, buf) → wirft bei Fehler, melden({ pfad, groesse, breite, hoehe }).
 */
export async function bildschirmfotoNehmen({ a, ordner, benutzer, starten, hochladen, melden, plattform = process.platform, env = process.env, uuid = randomUUID, aufrufBauen = fotoAufruf }) {
  if (!/^[0-9a-f-]{36}$/.test(String(benutzer || ""))) throw new Error("Unbekannte Kennung");
  if (!/^[a-z0-9_-]{1,60}$/.test(String(a?.projekt_id || ""))) throw new Error("Ungültige Projekt-Kennung");
  const id = String(a?.id ?? "").replace(/\D/g, ""); if (!id) throw new Error("Ungültige Aktion");
  await mkdir(ordner, { recursive: true });
  const ziel = (plattform === "win32" ? path.win32 : path).join(ordner, `${id}.png`);
  const aufruf = aufrufBauen({ ziel, plattform, env });
  await rm(ziel, { force: true });
  try {
    const { code } = await starten(aufruf.befehl, aufruf.args);
    if (code !== 0) throw new Error(FEHLER[code] || `Bildschirmfoto hat nicht geklappt (Code ${code})`);
    const buf = await dateiSicherLesen(ziel);
    const mass = pngPruefen(buf); if (!mass) throw new Error("Bildschirmfoto ist kein gültiges PNG");
    const pfad = `${benutzer}/${a.projekt_id}/${uuid()}.png`;
    await hochladen(pfad, buf);
    await melden({ pfad, groesse: buf.length, ...mass });
    return { pfad, groesse: buf.length, ...mass };
  } finally { await rm(ziel, { force: true }).catch(() => {}); }
}

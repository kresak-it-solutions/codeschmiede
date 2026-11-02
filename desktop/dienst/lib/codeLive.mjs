// „Code live“ im Arbeitsplatz (Konzept docs/KONZEPT-ARBEITSPLATZ.md, Entwurf freigegeben von Gerhard 02.11.2026, Datenbank 0059).
// Sammelt, welche Dateien die Werkstatt im Arbeitsordner gegenüber dem Startstand geändert hat – als gefilterter Diff für die Oberfläche.
// Nur Git-Lesebefehle (ohne externe Diff-/Textconv-Programme) und Lesen echter Dateien im Arbeitsordner: es wird nie Projekt-Code ausgeführt.
// Regeln: Geheimnis-Dateien nie lesen und nie übertragen (nur Name, „ausgeblendet“) · Schlüssel-Werte maskieren · Binärdateien nur nennen ·
// Größen begrenzt (je Datei und gesamt) · nur Pfade im Arbeitsordner · Verknüpfungen nie folgen · Anhänge des Laufs nie zeigen.
import { lstat, open, realpath } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { ohneGeheimnisse } from "./geheim.mjs";
import { geheimPfad, pfadOk } from "./code.mjs";

export const GRENZEN = Object.freeze({
  dateien: 60,                 // höchstens so viele Einträge (wie ws_code_live_ok)
  zeilenJeDatei: 400,          // Diff-Zeilen je Datei
  bytesJeDatei: 24 * 1024,     // Diff-Text je Datei
  gesamt: 200 * 1024,          // Diff-Text aller Dateien zusammen
  neuMax: 512 * 1024,          // neue Dateien: größer → nur genannt („gross“)
  aenderungMax: 20000,         // mehr geänderte Zeilen je Datei → kein Inhalt (nur Zahlen)
});

// Zusätzlich zur Regel des Code-Editors (geheimPfad, = ws_code_geheim): weitere typische Geheimnis-Dateien
const MEHR_GEHEIM = /(^|\/)(zugriff\.token|\.git-credentials|\.htpasswd|\.pgpass)$|\.(ppk|kdbx|asc|gpg|crt|cer|der|p8)$|(^|\/)\.ssh\/|(^|\/)\.aws\/|(^|\/)\.docker\/config\.json$|(^|\/)google-services\.json$|(^|\/)GoogleService-Info\.plist$/i;
/** Geheimnis-Datei? Dann nie lesen, nie Inhalt übertragen – nur der Name mit „ausgeblendet“. */
export const geheimDatei = (p) => geheimPfad(p) || MEHR_GEHEIM.test(String(p || ""));
// Anhänge eines Laufs (Material, Bilder, Regelwerk) sind Daten des Auftrags, kein Code – nie anzeigen
const ANHANG = /^\.codeschmiede-anhaenge(\/|$)/;

/** `git diff --numstat -z --no-renames` → [{ p, plus, minus, binaer }]. */
export function numstatLesen(roh) {
  const out = [];
  for (const z of String(roh || "").split("\0")) {
    if (!z) continue;
    const m = /^(-|\d+)\t(-|\d+)\t([\s\S]+)$/.exec(z.replace(/^\n+/, ""));
    if (!m) continue;
    out.push({ p: m[3], binaer: m[1] === "-" && m[2] === "-", plus: m[1] === "-" ? 0 : Number(m[1]), minus: m[2] === "-" ? 0 : Number(m[2]) });
  }
  return out;
}

/** `git status --porcelain=v1 -z --untracked-files=all` → Pfade neuer, noch nicht erfasster Dateien („??“). */
export function neuAusStatus(roh) {
  const out = []; const teile = String(roh || "").split("\0");
  for (let i = 0; i < teile.length; i++) {
    const z = teile[i]; if (!z) continue;
    if (/^[RC]/.test(z)) { i++; continue; }   // Umbenennung: der alte Name folgt als eigener Eintrag
    if (z.startsWith("?? ")) out.push(z.slice(3));
  }
  return out;
}

/**
 * Diff-Text einer Datei kürzen und maskieren. Kopfzeilen von Git fallen weg, Abschnitte (@@) bleiben.
 * Maskiert wird der GANZE Text zuerst (mehrzeilige private Schlüssel), dann je Zeile. → { zeilen, plus, minus, gekuerzt, art? }
 */
export function diffAufbereiten(text, { zeilenMax = GRENZEN.zeilenJeDatei, bytesMax = GRENZEN.bytesJeDatei } = {}) {
  const roh = String(text || "");
  let art = null;
  if (/^new file mode /m.test(roh)) art = "neu";
  if (/^deleted file mode /m.test(roh)) art = "geloescht";
  if (/^(new file mode|old mode|new mode|deleted file mode|index [0-9a-f]+\.\.[0-9a-f]+) 120000/m.test(roh)) art = "verknuepfung";
  if (/^Binary files /m.test(roh) || /^GIT binary patch/m.test(roh)) art = "binaer";
  if (art === "verknuepfung" || art === "binaer") return { zeilen: null, plus: 0, minus: 0, gekuerzt: false, art };
  const maskiert = ohneGeheimnisse(roh);
  const aus = []; let bytes = 0; let plus = 0; let minus = 0; let gekuerzt = false; let imAbschnitt = false;
  for (const z0 of maskiert.split("\n")) {
    if (/^@@ /.test(z0)) imAbschnitt = true;
    else if (!imAbschnitt) continue;   // diff --git, index, ---, +++, mode-Zeilen
    if (z0 === "\\ No newline at end of file") continue;
    const z = ohneGeheimnisse(z0);
    if (z.startsWith("+")) plus++; else if (z.startsWith("-")) minus++;
    if (gekuerzt) continue;
    const b = Buffer.byteLength(z) + 1;
    if (aus.length >= zeilenMax || bytes + b > bytesMax) { gekuerzt = true; continue; }
    aus.push(z); bytes += b;
  }
  while (aus.length && aus[aus.length - 1] === "") aus.pop();
  return { zeilen: aus.join("\n"), plus, minus, gekuerzt, art };
}

const istBinaer = (buf) => buf.includes(0) || !(() => { try { new TextDecoder("utf-8", { fatal: true }).decode(buf); return true; } catch { return false; } })();

/**
 * Neue Datei sicher lesen: nur im Arbeitsordner, kein Teil des Wegs und nicht die Datei selbst eine Verknüpfung, nur echte Dateien,
 * höchstens `max` Bytes. → { art: "neu"|"verknuepfung"|"gross"|"binaer"|"fehlt", inhalt? }
 */
export async function neueDateiLesen(ordner, rel, { max = GRENZEN.neuMax } = {}) {
  if (!pfadOk(rel)) return { art: "fehlt" };
  const wurzel = await realpath(ordner);
  const ziel = path.join(wurzel, ...rel.split("/"));
  if (!ziel.startsWith(wurzel + path.sep)) return { art: "fehlt" };
  let teil = wurzel;
  for (const s of rel.split("/").slice(0, -1)) {
    teil = path.join(teil, s);
    let st; try { st = await lstat(teil); } catch { return { art: "fehlt" }; }
    if (st.isSymbolicLink()) return { art: "verknuepfung" };
    if (!st.isDirectory()) return { art: "fehlt" };
  }
  let st; try { st = await lstat(ziel); } catch { return { art: "fehlt" }; }
  if (st.isSymbolicLink()) return { art: "verknuepfung" };
  if (!st.isFile() || st.nlink > 1) return { art: st.isFile() ? "verknuepfung" : "fehlt" };   // harte Links zählen wie Verknüpfungen
  if (st.size > max) return { art: "gross" };
  // O_NOFOLLOW gibt es unter Windows nicht – dort schützt die lstat-Prüfung davor; danach Größe und Kennung erneut prüfen
  const fl = typeof FS.O_NOFOLLOW === "number" ? FS.O_RDONLY | FS.O_NOFOLLOW : "r";
  let fh; try { fh = await open(ziel, fl); } catch { return { art: "verknuepfung" }; }
  try {
    const st2 = await fh.stat();
    if (st2.ino !== st.ino || st2.dev !== st.dev || !st2.isFile() || st2.size > max) return { art: "gross" };
    const buf = Buffer.alloc(st2.size); let n = 0;
    while (n < st2.size) { const { bytesRead } = await fh.read(buf, n, st2.size - n, n); if (!bytesRead) break; n += bytesRead; }
    const daten = buf.subarray(0, n);
    if (istBinaer(daten)) return { art: "binaer" };
    return { art: "neu", inhalt: daten.toString("utf8") };
  } finally { await fh.close().catch(() => {}); }
}

/** Inhalt einer neuen Datei als „+“-Zeilen (maskiert, gekürzt). */
export function neuAlsDiff(inhalt, grenzen) {
  const zeilen = String(inhalt).replace(/\r?\n$/, "").split(/\r?\n/);
  return diffAufbereiten(`@@ -0,0 +1,${zeilen.length} @@\n` + zeilen.map((z) => "+" + z).join("\n"), grenzen);
}

const GIT_DIFF = ["--no-ext-diff", "--no-textconv", "--no-color", "--no-renames"];
/**
 * Diff sammeln. git(cwd, ...args) → stdout (Text). Arbeitsordner-Modus: `bis` leer → Arbeitsordner gegen `von` plus neue Dateien.
 * Baum-Modus (Abgleich-Klon, Zweig gegen main): `von` und `bis` sind Stände, keine Dateien gelesen. → { dateien, gekuerzt }
 */
export async function diffSammeln({ git, ordner, von, bis = null, grenzen = GRENZEN }) {
  if (!/^[0-9a-f]{40}$/.test(von || "") || (bis && !/^[0-9a-f]{40}$/.test(bis))) throw new Error("Ungültiger Stand");
  const stande = bis ? [von, bis] : [von];
  const liste = numstatLesen(await git(ordner, "diff", "--numstat", "-z", ...GIT_DIFF, ...stande, "--"));
  if (!bis) {
    const schon = new Set(liste.map((x) => x.p));
    for (const p of neuAusStatus(await git(ordner, "status", "--porcelain=v1", "-z", "--untracked-files=all"))) if (!schon.has(p)) liste.push({ p, neu: true, plus: 0, minus: 0 });
  }
  liste.sort((a, b) => a.p.localeCompare(b.p));
  const dateien = []; let gesamt = 0; let gekuerzt = false;
  for (const x of liste) {
    if (!pfadOk(x.p) || ANHANG.test(x.p)) continue;   // nie Pfade außerhalb bzw. Anhänge des Laufs
    if (dateien.length >= grenzen.dateien) { gekuerzt = true; break; }
    if (geheimDatei(x.p)) { dateien.push({ p: x.p, art: "ausgeblendet" }); continue; }   // nie lesen
    if (x.binaer) { dateien.push({ p: x.p, art: "binaer", plus: 0, minus: 0 }); continue; }
    const platz = grenzen.gesamt - gesamt;
    let d;
    if (x.neu) {
      const r = await neueDateiLesen(ordner, x.p, { max: grenzen.neuMax });
      if (r.art === "fehlt") continue;
      if (r.art !== "neu") { dateien.push({ p: x.p, art: r.art }); continue; }
      if (platz <= 0) { dateien.push({ p: x.p, art: "neu", plus: r.inhalt.split("\n").length, minus: 0, gekuerzt: true }); gekuerzt = true; continue; }
      d = neuAlsDiff(r.inhalt, { zeilenMax: grenzen.zeilenJeDatei, bytesMax: Math.min(grenzen.bytesJeDatei, platz) });
      d.art = "neu";
    } else if (x.plus + x.minus > grenzen.aenderungMax || platz <= 0) {
      dateien.push({ p: x.p, art: "geaendert", plus: x.plus, minus: x.minus, gekuerzt: true }); gekuerzt = true; continue;
    } else {
      d = diffAufbereiten(await git(ordner, "--literal-pathspecs", "diff", ...GIT_DIFF, "-U2", ...stande, "--", x.p),
        { zeilenMax: grenzen.zeilenJeDatei, bytesMax: Math.min(grenzen.bytesJeDatei, platz) });
    }
    if (d.art === "verknuepfung" || d.art === "binaer") { dateien.push({ p: x.p, art: d.art }); continue; }
    const e = { p: x.p, art: d.art || "geaendert", plus: x.neu ? d.plus : x.plus, minus: x.neu ? 0 : x.minus };
    if (d.zeilen) { e.zeilen = d.zeilen; gesamt += Buffer.byteLength(d.zeilen); }
    if (d.gekuerzt) { e.gekuerzt = true; gekuerzt = true; }
    dateien.push(e);
  }
  return { dateien, gekuerzt };
}

/** Kurzer Fingerabdruck, um nur bei Änderungen zu melden. */
export const fingerabdruck = (r) => JSON.stringify(r);

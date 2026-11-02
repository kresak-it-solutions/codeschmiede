// Läufe in der Cloud für den Arbeitsplatz (Stufe 3, Entwurf 1.0 freigegeben von Gerhard 02.11.2026, docs/KONZEPT-ARBEITSPLATZ.md):
//   * Werkzeug-Konsole: Ablauf „Lauf“ (lauf.yml) mit Befehl + Beispiel-Eingabe als GEPRÜFTE Eingaben (feste Form, Liste aus beispiele/befehle.json,
//     Datei aus beispiele/) – nie eine freie Shell-Zeile; der Ablauf prüft dieselben Regeln noch einmal und gibt die Werte nur als Umgebungs-
//     variablen weiter (kein Einschleusen in das Skript). Ausgabe (gekürzt, ohne Geheimnisse) und Ergebnisdateien kommen als Artefakt zurück.
//   * Dokument-Vorschau: Ablauf „Dokument“ (dokument.yml) baut das PDF aus dem Zweig und legt die Seiten als PNG ab; die Werkstatt prüft jede
//     Seite (PNG-Kopf, Größe) und legt sie im privaten Speicher ws-vorschau ab. Kein PDF wird auf diesem PC geöffnet oder gerendert.
// Auf dem PC wird kein Projekt-Code ausgeführt: nur gh (Argument-Listen ohne Shell) und das Lesen heruntergeladener Dateien.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { ohneGeheimnisse } from "./geheim.mjs";
import { geheimDatei } from "./codeLive.mjs";
import { pngPruefen } from "./bildschirmfoto.mjs";

// gleiche Regeln wie anbindungen.mjs (hier eigen, damit es keinen Kreis-Import gibt)
const repoGut = (r) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(r || "") && !/\/\.\.?$/.test(r);
const zweigGut = (z) => /^[A-Za-z0-9._/-]{1,100}$/.test(z || "") && !/\.\./.test(z) && !/^[/.-]/.test(z);
export const BEFEHL = /^[a-z][a-z0-9-]{0,39}$/;
export const EINGABE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}(\.[A-Za-z0-9]{1,8})?$/;
export const GRENZEN = Object.freeze({ ausgabe: 20000, kopf: 4000, dateien: 30, text: 16000, textGesamt: 64000, artefakt: 60 * 1024 * 1024, seiten: 60, seiteBytes: 3 * 1024 * 1024, warten: 14 * 60 * 1000 });
const TEXT_ENDUNG = /\.(txt|csv|tsv|json|md|log|xml|yml|yaml|html?)$/i;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,79}(\/[A-Za-z0-9_][A-Za-z0-9._-]{0,79}){0,3}$/;

/** Befehle aus beispiele/befehle.json: { befehle: { <name>: "<Beschreibung>" } } → [{ name, beschreibung }] (höchstens 20, nur gültige Namen). */
export function befehleLesen(text) {
  let j; try { j = JSON.parse(String(text || "")); } catch { return []; }
  const b = j && typeof j === "object" && !Array.isArray(j) && j.befehle && typeof j.befehle === "object" && !Array.isArray(j.befehle) ? j.befehle : {};
  return Object.entries(b).filter(([k, v]) => BEFEHL.test(k) && typeof v === "string").slice(0, 20)
    .map(([name, v]) => ({ name, beschreibung: v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160) }));
}
/** Beispiel-Eingaben aus dem Baum des Zweigs ([{ p, g }]): nur Dateien direkt in beispiele/, ohne befehle.json und ohne Geheimnis-Dateien. */
export function beispielDateien(baum = []) {
  return baum.filter((x) => typeof x?.p === "string" && x.p.startsWith("beispiele/") && !x.x).map((x) => x.p.slice("beispiele/".length))
    .filter((n) => EINGABE.test(n) && n !== "befehle.json" && !geheimDatei(`beispiele/${n}`)).slice(0, 50);
}
/** Prüfweg „befehl“ (z. B. „abgleichen klein.csv“) → { befehl, eingabe } (je null, wenn nicht erkennbar). */
export function pruefwegBefehl(text) {
  const teile = String(text || "").trim().split(/\s+/);
  const befehl = BEFEHL.test(teile[0] || "") ? teile[0] : null;
  const eingabe = teile.slice(1).map((t) => t.replace(/^beispiele\//, "")).find((t) => EINGABE.test(t)) || null;
  return { befehl, eingabe };
}
/** Eingaben prüfen (gleiche Regeln wie Datenbank 0060 und lauf.yml). Fehlertext oder null. Ohne Liste wird nur die Form geprüft. */
export function eingabenFehler(e, { befehle = null, dateien = null } = {}) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return "Keine Eingaben";
  if (Object.keys(e).some((k) => k !== "befehl" && k !== "eingabe")) return "Unbekannte Eingabe";
  if (typeof e.befehl !== "string" || !BEFEHL.test(e.befehl)) return "Ungültiger Befehl";
  if (typeof e.eingabe !== "string" || !EINGABE.test(e.eingabe)) return "Ungültige Beispiel-Eingabe";
  if (befehle && !befehle.some((b) => b.name === e.befehl)) return `Befehl „${e.befehl}“ steht nicht in beispiele/befehle.json`;
  if (dateien && !dateien.includes(e.eingabe)) return `Beispiel-Eingabe „${e.eingabe}“ liegt nicht in beispiele/`;
  return null;
}
/** gh-Aufruf für den Testlauf: Ablauf lauf.yml auf dem Zweig, Werte nur als -f name=wert (Argument-Liste, keine Shell). */
export function laufArgs({ repo, zweig, eingaben = null }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  if (!zweigGut(zweig)) throw new Error("Ungültiger Zweig");
  const a = ["workflow", "run", "lauf.yml", "--repo", repo, "--ref", zweig];
  if (eingaben) {
    const f = eingabenFehler(eingaben); if (f) throw new Error(f);
    a.push("-f", `befehl=${eingaben.befehl}`, "-f", `eingabe=${eingaben.eingabe}`);
  }
  return a;
}

// Steuerzeichen (außer Zeilenumbruch und Tab) und ANSI-Farbcodes raus
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g;
export const sauber = (t) => String(t ?? "").replace(ANSI, "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "");
/** Ausgabe des Laufs für die Anzeige: ohne Geheimnisse, ohne Steuerzeichen, höchstens max Zeichen (Anfang und Ende bleiben). */
export function ausgabeAufbereiten(text, { max = GRENZEN.ausgabe, kopf = GRENZEN.kopf } = {}) {
  const t = ohneGeheimnisse(sauber(text));
  if (t.length <= max) return { ausgabe: t, gekuerzt: false };
  const ende = max - kopf - 40;
  return { ausgabe: `${t.slice(0, kopf)}\n… (gekürzt, ${t.length - kopf - ende} Zeichen ausgelassen) …\n${t.slice(-ende)}`, gekuerzt: true };
}

/** Echte Datei lesen (keine Verknüpfung, kein harter Link), höchstens max Bytes; größere: nur die ersten max Bytes, gekuerzt = true. */
async function dateiLesen(datei, max) {
  const l = await lstat(datei);
  if (!l.isFile() || l.isSymbolicLink() || l.nlink !== 1) return null;
  const fh = await open(datei, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const s = await fh.stat(); if (s.ino !== l.ino || s.dev !== l.dev) return null;
    const n = Math.min(s.size, max); const b = Buffer.alloc(n); await fh.read(b, 0, n, 0);
    return { buf: b, groesse: s.size, gekuerzt: s.size > max };
  } finally { await fh.close(); }
}
/** Alle echten Dateien unter ordner (keine Verknüpfungen, nicht nach außen), höchstens max, Pfade mit „/“. */
export async function dateienListe(ordner, { max = 200, tiefe = 4 } = {}) {
  const wurzel = await realpath(ordner); const r = [];
  const gehe = async (o, rel, t) => {
    for (const e of (await readdir(o, { withFileTypes: true })).sort((x, y) => x.name.localeCompare(y.name))) {
      if (r.length >= max) return;
      const p = path.join(o, e.name); const l = await lstat(p);
      if (l.isSymbolicLink()) continue;
      const neu = rel ? `${rel}/${e.name}` : e.name;
      if (l.isDirectory() && t > 0) await gehe(p, neu, t - 1);
      else if (l.isFile()) r.push(neu);
    }
  };
  await gehe(wurzel, "", tiefe);
  return r;
}

/**
 * Ergebnis des Testlaufs aus dem heruntergeladenen Artefakt (Ordner): konsole.txt → Ausgabe, übrige Dateien → Liste (Text-Dateien mit Inhalt,
 * ohne Geheimnisse und gekürzt). Geheimnis-Dateien nur dem Namen nach, ohne Inhalt.
 */
export async function testlaufErgebnis(ordner, { grenzen = GRENZEN } = {}) {
  const namen = await dateienListe(ordner);
  let ausgabe = { ausgabe: "", gekuerzt: false };
  if (namen.includes("konsole.txt")) {
    const k = await dateiLesen(path.join(ordner, "konsole.txt"), 1024 * 1024);
    if (k) ausgabe = ausgabeAufbereiten(k.buf.toString("utf8"), { max: grenzen.ausgabe });
    if (k?.gekuerzt) ausgabe.gekuerzt = true;
  }
  const dateien = []; let gesamt = 0;
  for (const n of namen) {
    if (n === "konsole.txt" || dateien.length >= grenzen.dateien) continue;
    if (!NAME.test(n) || n.includes("..")) continue;
    const l = await lstat(path.join(ordner, ...n.split("/")));
    const eintrag = { name: n, groesse: l.size };
    if (!geheimDatei(n) && TEXT_ENDUNG.test(n) && gesamt < grenzen.textGesamt) {
      const d = await dateiLesen(path.join(ordner, ...n.split("/")), Math.min(grenzen.text * 4, 256 * 1024));
      if (d) {
        let t = ohneGeheimnisse(sauber(d.buf.toString("utf8")));
        const platz = Math.min(grenzen.text, grenzen.textGesamt - gesamt);
        if (t.length > platz || d.gekuerzt) { t = t.slice(0, platz); eintrag.gekuerzt = true; }
        eintrag.text = t; gesamt += t.length;
      }
    }
    dateien.push(eintrag);
  }
  return { ...ausgabe, dateien };
}

/** Seiten des Dokuments aus dem Artefakt: nur seite-NNN.png (1–999), echte PNG bis 3 MB, höchstens 60. → { seiten: [{ nr, buf, breite, hoehe }], gesamt, gekuerzt } */
export async function dokumentSeiten(ordner, { grenzen = GRENZEN } = {}) {
  const namen = (await dateienListe(ordner, { max: 2000, tiefe: 1 })).filter((n) => /^(seiten\/)?seite-[0-9]{1,3}\.png$/.test(n));
  const mitNr = namen.map((n) => ({ n, nr: Number(n.match(/seite-([0-9]{1,3})\.png$/)[1]) })).filter((x) => x.nr >= 1 && x.nr <= 999)
    .sort((a, b) => a.nr - b.nr).filter((x, i, arr) => i === 0 || arr[i - 1].nr !== x.nr);
  const seiten = [];
  for (const x of mitNr.slice(0, grenzen.seiten)) {
    const d = await dateiLesen(path.join(ordner, ...x.n.split("/")), grenzen.seiteBytes + 1);
    if (!d || d.gekuerzt) continue;
    const m = pngPruefen(d.buf); if (!m || m.breite > 4000 || m.hoehe > 6000) continue;
    seiten.push({ nr: x.nr, buf: d.buf, ...m });
  }
  return { seiten, gesamt: mitNr.length, gekuerzt: mitNr.length > grenzen.seiten };
}

/** Neuesten Lauf eines Ablaufs auf dem Zweig finden, der nach `seit` (Zeit des Anstoßes) per Knopf gestartet wurde. */
export async function laufFinden({ sh, repo, workflow, zweig, seit }) {
  const { stdout } = await sh("gh", ["run", "list", "--repo", repo, "--workflow", workflow, "--branch", zweig, "--event", "workflow_dispatch", "--limit", "10",
    "--json", "databaseId,status,conclusion,createdAt,url"]);
  const l = JSON.parse(stdout || "[]").filter((x) => /^\d{1,20}$/.test(String(x.databaseId)) && new Date(x.createdAt).getTime() >= seit - 60000);
  return l.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}
/** Auf den Lauf warten (alle 15 s, höchstens grenzen.warten); lebt() hält die Aktion in der Datenbank. → Lauf oder null (Zeit um). */
export async function aufLaufWarten({ sh, repo, workflow, zweig, seit, lebt = async () => {}, pause = (ms) => new Promise((r) => setTimeout(r, ms)), jetzt = Date.now, max = GRENZEN.warten, takt = 15000 }) {
  const ende = jetzt() + max; let lauf = null;
  while (jetzt() < ende) {
    lauf = await laufFinden({ sh, repo, workflow, zweig, seit }).catch(() => lauf);
    if (lauf?.status === "completed") return lauf;
    await lebt(lauf ? "Lauf in GitHub läuft" : "Wartet auf den Start in GitHub");
    await pause(takt);
  }
  return null;
}
/** Artefakt eines Laufs herunterladen (Größe vorher geprüft). → Ordner oder null (kein Artefakt). */
export async function artefaktHolen({ sh, repo, lauf, name, ordner, max = GRENZEN.artefakt }) {
  const id = String(lauf?.databaseId ?? ""); if (!/^\d{1,20}$/.test(id)) throw new Error("Ungültiger Lauf");
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error("Ungültiger Artefakt-Name");
  const { stdout } = await sh("gh", ["api", `repos/${repo}/actions/runs/${id}/artifacts`, "--jq", `.artifacts[] | select(.name == "${name}") | .size_in_bytes`]);
  const groesse = Number(String(stdout).trim().split(/\s+/)[0]);
  if (!Number.isFinite(groesse) || groesse <= 0) return null;
  if (groesse > max) throw new Error(`Ergebnis ist größer als ${Math.round(max / 1024 / 1024)} MB`);
  await rm(ordner, { recursive: true, force: true }); await mkdir(ordner, { recursive: true });
  await sh("gh", ["run", "download", id, "--repo", repo, "--name", name, "--dir", ordner], { maxBuffer: 20 * 1024 * 1024, timeout: 300000 });
  return ordner;
}

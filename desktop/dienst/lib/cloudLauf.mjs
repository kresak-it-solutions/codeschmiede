// Läufe in der Cloud für den Arbeitsplatz (Stufe 3, Entwurf 1.0 freigegeben von Gerhard 02.11.2026, docs/KONZEPT-ARBEITSPLATZ.md):
//   * Werkzeug-Konsole: Ablauf „Lauf“ (lauf.yml) mit Befehl + Beispiel-Eingabe als GEPRÜFTE Eingaben (feste Form, Liste aus beispiele/befehle.json,
//     Datei aus beispiele/) – nie eine freie Shell-Zeile; der Ablauf prüft dieselben Regeln noch einmal und gibt die Werte nur als Umgebungs-
//     variablen weiter (kein Einschleusen in das Skript). Ausgabe (gekürzt, ohne Geheimnisse) und Ergebnisdateien kommen als Artefakt zurück.
//   * Dokument-Vorschau: Ablauf „Dokument“ (dokument.yml) baut das PDF aus dem Zweig und legt die Seiten als PNG ab; die Werkstatt prüft jede
//     Seite (PNG-Kopf, Größe) und legt sie im privaten Speicher ws-vorschau ab. Kein PDF wird auf diesem PC geöffnet oder gerendert.
// Auf dem PC wird kein Projekt-Code ausgeführt: nur gh (Argument-Listen ohne Shell) und das Lesen heruntergeladener Dateien.
import { ohneGeheimnisse } from "./geheim.mjs";
import { geheimDatei } from "./codeLive.mjs";
import { pngPruefen } from "./bildschirmfoto.mjs";
import { zipEintraege } from "./einlesen.mjs";

// 0.17.1 (Nacharbeit Sicherheitsprüfung): Zweige gehen an gh/GitHub immer als refs/heads/<zweig> (keine Verwechslung mit einem gleichnamigen Tag);
// vor dem Start wird der Kopf-Commit des Zweigs festgehalten und mit headSha des gefundenen Laufs verglichen (anders → Ergebnis verworfen).
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
/** Zweig als eindeutige Referenz für gh/GitHub (nie ein Tag gleichen Namens). */
export const zweigRef = (zweig) => { if (!zweigGut(zweig)) throw new Error("Ungültiger Zweig"); return `refs/heads/${zweig}`; };
const SHA = /^[0-9a-f]{40}$/;
export const STAND_VERWORFEN = "Zweig wurde während des Laufs verändert – Ergebnis verworfen";
export const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Name des Laufs bei GitHub (run-name in lauf.yml/dokument.yml) – darüber wird der Lauf zugeordnet, nicht über die Uhrzeit (Prüfung N7). */
export const laufTitel = (kennung) => `Codeschmiede ${kennung}`;
/**
 * gh-Aufruf für einen Lauf per Knopf: Ablauf auf dem Zweig, Werte nur als -f name=wert (Argument-Liste, keine Shell).
 * kennung (UUID) ordnet den Lauf zu; eingaben = { befehl, eingabe } nur für lauf.yml.
 */
export function laufArgs({ repo, zweig, eingaben = null, kennung = null, workflow = "lauf.yml" }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  if (!zweigGut(zweig)) throw new Error("Ungültiger Zweig");
  if (!["lauf.yml", "dokument.yml"].includes(workflow)) throw new Error("Unbekannter Ablauf");
  const a = ["workflow", "run", workflow, "--repo", repo, "--ref", zweigRef(zweig)];
  if (eingaben) {
    if (workflow !== "lauf.yml") throw new Error("Eingaben nur für den Testlauf");
    const f = eingabenFehler(eingaben); if (f) throw new Error(f);
    a.push("-f", `befehl=${eingaben.befehl}`, "-f", `eingabe=${eingaben.eingabe}`);
  }
  if (kennung != null) { if (!KENNUNG.test(kennung)) throw new Error("Ungültige Kennung"); a.push("-f", `kennung=${kennung}`); }
  return a;
}

/**
 * Prüfung M2: Ein Lauf per Knopf auf einem Zweig führt die Ablauf-Datei DES ZWEIGS aus. Gestartet wird nur, wenn sie genau so auf main
 * (bzw. live) liegt – gleiche Blob-SHA. Sonst hätte ein ungeprüfter Auftrags-Zweig den Ablauf (und damit, was in GitHub läuft) verändert.
 * stand (Commit-SHA, 0.17.1): statt des Zweig-Kopfs genau diesen Stand des Zweigs prüfen (Gegenprobe zum festgehaltenen Stand).
 * → null (in Ordnung) oder Fehlertext.
 */
export async function ablaufUnveraendert({ sh, repo, zweig, workflow, stand = null }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  if (!zweigGut(zweig)) throw new Error("Ungültiger Zweig");
  if (!["lauf.yml", "dokument.yml"].includes(workflow)) throw new Error("Unbekannter Ablauf");
  const blob = async (ref) => {
    try {
      const { stdout } = await sh("gh", ["api", `repos/${repo}/contents/.github/workflows/${workflow}?ref=${encodeURIComponent(ref)}`, "--jq", ".sha"]);
      const s = String(stdout).trim(); return /^[0-9a-f]{40}$/.test(s) ? s : null;
    } catch (e) { if (/HTTP 404|Not Found/i.test(`${e?.stderr || ""}${e?.message || ""}`)) return null; throw e; }
  };
  if (stand != null && !SHA.test(stand)) throw new Error("Ungültiger Stand");
  const main = await blob(zweigRef("main"));
  if (!main) return `Der Ablauf ${workflow} fehlt auf main – erst einrichten (Auftrag mit Prüfung und Zusammenführen)`;
  if (zweig === "main" && !stand) return null;
  const hier = await blob(stand || zweigRef(zweig));
  if (hier === main) return null;
  if (hier && zweig !== "live" && hier === (await blob(zweigRef("live")))) return null;
  return `Ablauf auf dem Zweig verändert – erst nach Prüfung und Zusammenführen (${workflow} auf ${zweig} ist nicht derselbe wie auf main)`;
}

/** Kopf-Commit des Zweigs (gh api …/git/ref/heads/<zweig>, nur genau dieser Zweig). → SHA; Fehler, wenn es den Zweig nicht gibt. */
export async function zweigKopf({ sh, repo, zweig }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  const ref = zweigRef(zweig);
  const { stdout } = await sh("gh", ["api", `repos/${repo}/git/ref/${ref.slice("refs/".length)}`, "--jq", ".object.sha"]);
  const s = String(stdout).trim();
  if (!SHA.test(s)) throw new Error(`Zweig ${zweig} nicht gefunden`);
  return s;
}
/**
 * Stand festhalten (0.17.1): nach dem SHA-Vergleich der Ablauf-Datei und VOR gh workflow run. Gegenprobe: die Ablauf-Datei genau dieses Stands ist
 * ebenfalls dieselbe wie auf main/live (sonst hätte sich der Zweig zwischen Vergleich und Festhalten geändert). → SHA des Stands.
 */
export async function standFesthalten({ sh, repo, zweig, workflow }) {
  const stand = await zweigKopf({ sh, repo, zweig });
  const f = await ablaufUnveraendert({ sh, repo, zweig, workflow, stand });
  if (f) throw new Error(f);
  return stand;
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

// ---------- Artefakt als ZIP (Prüfung M1): nie entpacken auf die Platte, nur geprüfte Einträge im Speicher ----------
export const ZIP_GRENZEN = Object.freeze({ eintraege: 500, je: 64 * 1024 * 1024, gesamt: 256 * 1024 * 1024, verhaeltnis: 200 });
/**
 * Einträge eines Artefakt-ZIPs (gleicher Leser wie „Projekt einlesen“: zipEintraege lehnt Verknüpfungen, „..“, absolute Pfade, ZIP64,
 * Verschlüsselung und doppelte Namen ab). Dazu Grenzen für Anzahl, Einzel- und Gesamtgröße (entpackt) und Packverhältnis.
 * → [{ name, groesse, lesen(max) }] (ohne Ordner)
 */
export function artefaktEintraege(buf, grenzen = ZIP_GRENZEN) {
  const alle = zipEintraege(buf, { eintraegeMax: grenzen.eintraege, verhaeltnis: grenzen.verhaeltnis }).filter((e) => !e.ordner);
  let summe = 0;
  for (const e of alle) {
    if (e.groesse > grenzen.je) throw new Error(`Datei im Ergebnis zu groß („${e.name.slice(0, 80)}“)`);
    summe += e.groesse;
  }
  if (summe > grenzen.gesamt) throw new Error("Ergebnis ist entpackt zu groß");
  return alle;
}

/**
 * Ergebnis des Testlaufs aus den Einträgen des Artefakts: konsole.txt → Ausgabe, übrige Dateien → Liste (Text-Dateien mit Inhalt,
 * ohne Geheimnisse und gekürzt). Übernommen werden nur Namen nach festem Muster; Geheimnis-Dateien nur dem Namen nach.
 */
export function testlaufErgebnis(eintraege, { grenzen = GRENZEN } = {}) {
  let ausgabe = { ausgabe: "", gekuerzt: false };
  const k = eintraege.find((e) => e.name === "konsole.txt");
  if (k && k.groesse <= 1024 * 1024) ausgabe = ausgabeAufbereiten(k.lesen(1024 * 1024).toString("utf8"), { max: grenzen.ausgabe });
  else if (k) ausgabe = { ausgabe: "(Ausgabe größer als 1 MB – bei GitHub ansehen)", gekuerzt: true };
  const dateien = []; let gesamt = 0;
  for (const e of [...eintraege].sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === "konsole.txt" || dateien.length >= grenzen.dateien) continue;
    if (!NAME.test(e.name) || e.name.includes("..")) continue;
    const eintrag = { name: e.name, groesse: e.groesse };
    const lesbar = Math.min(grenzen.text * 4, 256 * 1024);
    if (!geheimDatei(e.name) && TEXT_ENDUNG.test(e.name) && gesamt < grenzen.textGesamt) {
      if (e.groesse > lesbar) eintrag.gekuerzt = true;
      else {
        let t = ohneGeheimnisse(sauber(e.lesen(lesbar).toString("utf8")));
        const platz = Math.min(grenzen.text, grenzen.textGesamt - gesamt);
        if (t.length > platz) { t = t.slice(0, platz); eintrag.gekuerzt = true; }
        eintrag.text = t; gesamt += t.length;
      }
    }
    dateien.push(eintrag);
  }
  return { ...ausgabe, dateien };
}

/** Seiten des Dokuments: nur seite-NNN.png (1–999), echte PNG bis 3 MB, höchstens 60. → { seiten: [{ nr, buf, breite, hoehe }], gesamt, gekuerzt } */
export function dokumentSeiten(eintraege, { grenzen = GRENZEN } = {}) {
  const mitNr = eintraege.filter((e) => /^(seiten\/)?seite-[0-9]{1,3}\.png$/.test(e.name))
    .map((e) => ({ e, nr: Number(e.name.match(/seite-([0-9]{1,3})\.png$/)[1]) })).filter((x) => x.nr >= 1 && x.nr <= 999)
    .sort((a, b) => a.nr - b.nr).filter((x, i, arr) => i === 0 || arr[i - 1].nr !== x.nr);
  const seiten = [];
  for (const x of mitNr.slice(0, grenzen.seiten)) {
    if (x.e.groesse > grenzen.seiteBytes) continue;
    const buf = x.e.lesen(grenzen.seiteBytes);
    const m = pngPruefen(buf); if (!m || m.breite > 4000 || m.hoehe > 6000) continue;
    seiten.push({ nr: x.nr, buf, ...m });
  }
  return { seiten, gesamt: mitNr.length, gekuerzt: mitNr.length > grenzen.seiten };
}

/** Lauf eines Ablaufs auf dem Zweig über seine Kennung finden (run-name „Codeschmiede <kennung>“, Prüfung N7). */
export async function laufFinden({ sh, repo, workflow, zweig, kennung }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  if (!zweigGut(zweig)) throw new Error("Ungültiger Zweig");
  if (!KENNUNG.test(String(kennung || ""))) throw new Error("Ungültige Kennung");
  const { stdout } = await sh("gh", ["run", "list", "--repo", repo, "--workflow", workflow, "--branch", zweig, "--event", "workflow_dispatch", "--limit", "20",
    "--json", "databaseId,status,conclusion,createdAt,url,displayTitle,headSha"]);
  return JSON.parse(stdout || "[]").find((x) => /^\d{1,20}$/.test(String(x.databaseId)) && x.displayTitle === laufTitel(kennung)) || null;
}
/**
 * Auf den Lauf warten (alle 15 s, höchstens grenzen.warten); lebt() hält die Aktion in der Datenbank. → Lauf oder null (Zeit um).
 * stand (0.17.1): festgehaltener Kopf-Commit vor dem Start. Sobald der Lauf gefunden ist, muss headSha genau dieser Stand sein – sonst Fehler
 * STAND_VERWORFEN (e.verworfen = true, e.url = Lauf); das Ergebnis wird nicht geholt.
 */
export async function aufLaufWarten({ sh, repo, workflow, zweig, kennung, stand = null, lebt = async () => {}, pause = (ms) => new Promise((r) => setTimeout(r, ms)), jetzt = Date.now, max = GRENZEN.warten, takt = 15000 }) {
  if (stand != null && !SHA.test(stand)) throw new Error("Ungültiger Stand");
  const ende = jetzt() + max; let lauf = null;
  while (jetzt() < ende) {
    lauf = await laufFinden({ sh, repo, workflow, zweig, kennung }).catch(() => lauf);
    if (lauf && stand && lauf.headSha !== stand) throw Object.assign(new Error(STAND_VERWORFEN), { verworfen: true, url: lauf.url || null });
    if (lauf?.status === "completed") return lauf;
    await lebt(lauf ? "Lauf in GitHub läuft" : "Wartet auf den Start in GitHub");
    await pause(takt);
  }
  return null;
}
/**
 * Artefakt eines Laufs als ZIP holen (gh api …/artifacts/<id>/zip, Größe vorher und nachher geprüft) und mit dem ZIP-Leser lesen – nichts wird
 * auf die Platte entpackt. → Einträge oder null (kein Artefakt dieses Namens).
 */
export async function artefaktHolen({ sh, repo, lauf, name, max = GRENZEN.artefakt, grenzen = ZIP_GRENZEN }) {
  if (!repoGut(repo)) throw new Error("Ungültiges Repository");
  const id = String(lauf?.databaseId ?? ""); if (!/^\d{1,20}$/.test(id)) throw new Error("Ungültiger Lauf");
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error("Ungültiger Artefakt-Name");
  const { stdout } = await sh("gh", ["api", `repos/${repo}/actions/runs/${id}/artifacts`, "--jq", `.artifacts[] | select(.name == "${name}" and .expired == false) | [.id, .size_in_bytes] | @tsv`]);
  const [aid, groesseText] = String(stdout).trim().split("\n")[0].split("\t");
  const groesse = Number(groesseText);
  if (!/^\d{1,20}$/.test(aid || "") || !Number.isFinite(groesse) || groesse <= 0) return null;
  if (groesse > max) throw new Error(`Ergebnis ist größer als ${Math.round(max / 1024 / 1024)} MB`);
  const r = await sh("gh", ["api", `repos/${repo}/actions/artifacts/${aid}/zip`], { encoding: "buffer", maxBuffer: max + 1024 * 1024, timeout: 300000 });
  const buf = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(r.stdout || "");
  if (buf.length > max) throw new Error(`Ergebnis ist größer als ${Math.round(max / 1024 / 1024)} MB`);
  return artefaktEintraege(buf, grenzen);
}

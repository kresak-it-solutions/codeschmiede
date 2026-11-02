// Projektordner je Projekt (Entwurf 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04, docs/KONZEPT-PROJEKTORDNER.md).
// Jedes Projekt hat einen Ordner auf der externen Festplatte: <basis>\<kennung>\ mit code\ (Git-Arbeitskopie), code-arbeit\ (Auftrags-,
// Prüf- und Lese-Ordner), regeln\ (REGELN.md + regelwerk\), konzept\, doku\, material\, sicherungen\.
// Die Pfade legt das PROGRAMM fest (Ordner-Auswahl, Datei projektordner.json im Daten-Ordner der Werkstatt) – nie die Datenbank und nie
// die Oberfläche. Dieser Teil liest die Datei, prüft jeden Pfad und schreibt nur INNERHALB des verknüpften Ordners: kein „..“, keine
// absoluten Teilpfade, keine Verknüpfungen (symbolische Links, Junctions) – weder beim Anlegen noch beim Schreiben.
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const KENNUNG = /^[a-z0-9][a-z0-9-]{1,39}$/;
// Kennungen werden Ordnernamen: reservierte Namen von Windows sind verboten (Prüfung 02.11.2026, N4; auch Datenbank 0055 und Programm)
const WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
export const kennungOk = (k) => typeof k === "string" && KENNUNG.test(k) && !WINDOWS_NAME.test(k);
/** Kennungsdatei im Projektordner (legt nur das Programm an): { kennung, id } – muss zur lokalen Einstellung passen. */
export const KENNUNGS_DATEI = ".codeschmiede-projekt.json";
export const KONFIG_DATEI = "projektordner.json";
/** Feste Unterordner (code\ entsteht beim Klonen). */
export const UNTERORDNER = ["code-arbeit", "regeln", "regeln/regelwerk", "konzept", "konzept/entwuerfe", "doku", "material", "sicherungen"];
const REGELN_VON = /^(vorlage|leer|[a-z0-9][a-z0-9-]{1,39})$/;
// Windows verbietet diese Namen als Datei- oder Ordnername (auch mit Endung)
const RESERVIERT = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

const textOk = (t) => typeof t === "string" && t.length > 0 && t.length <= 400 && !/[\u0000-\u001f\u007f]/.test(t);
/** Absoluter Pfad dieses Systems (unter Windows mit Laufwerk oder \\Server\Freigabe). */
export function pfadOk(t, plattform = process.platform) {
  if (!textOk(t)) return false;
  // Netzwerkpfade (\\Server\Freigabe) sind nicht erlaubt (Prüfung N5)
  return plattform === "win32" ? path.win32.isAbsolute(t) && /^[A-Za-z]:\\/.test(t) : path.posix.isAbsolute(t);
}

/** Inhalt von projektordner.json prüfen. Ungültige Einträge fallen weg (nie raten). */
export function konfigPruefen(roh, plattform = process.platform) {
  const k = { basis: null, projekte: new Map() };
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return k;
  if (pfadOk(roh.basis, plattform)) k.basis = roh.basis;
  const p = roh.projekte && typeof roh.projekte === "object" && !Array.isArray(roh.projekte) ? roh.projekte : {};
  for (const [id, e] of Object.entries(p).slice(0, 500)) {
    if (!kennungOk(id) || !e || typeof e !== "object" || !pfadOk(e.pfad, plattform)) continue;
    k.projekte.set(id, { pfad: e.pfad, regeln_von: typeof e.regeln_von === "string" && REGELN_VON.test(e.regeln_von) && kennungOderArt(e.regeln_von) && e.regeln_von !== id ? e.regeln_von : null,
      kennzeichen: typeof e.kennzeichen === "string" && /^[0-9a-f]{32}$/.test(e.kennzeichen) ? e.kennzeichen : null });
  }
  return k;
}
const kennungOderArt = (r) => r === "vorlage" || r === "leer" || kennungOk(r);
/** Gehört der Ordner zu diesem Projekt? Kennungsdatei (echte Datei) mit gleicher Kennung und gleichem Kennzeichen wie in projektordner.json. */
export async function kennungPasst(wurzel, kennung, kennzeichen) {
  if (!kennzeichen) return false;
  const b = await sicherLesen(wurzel, KENNUNGS_DATEI, 4096).catch(() => null);
  if (!b) return false;
  try { const j = JSON.parse(b.toString("utf8")); return j?.kennung === kennung && j?.id === kennzeichen; } catch { return false; }
}
export async function konfigLesen(datenOrdner, { lesen = readFile, plattform = process.platform } = {}) {
  try { return konfigPruefen(JSON.parse(await lesen(path.join(datenOrdner, KONFIG_DATEI), "utf8")), plattform); }
  catch { return konfigPruefen(null, plattform); }
}

/** Ein Teilpfad innerhalb des Projektordners: nur „/“-getrennte Namen, kein „.“/„..“, keine Laufwerke, keine Sonderzeichen von Windows. */
export function relOk(rel) {
  if (typeof rel !== "string" || !rel || rel.length > 400 || rel.includes("\\") || rel.startsWith("/")) return false;
  const teile = rel.split("/");
  if (teile.length > 12) return false;
  return teile.every((t) => t && t !== "." && t !== ".." && t.length <= 120 && !/[<>:"|?*\u0000-\u001f\u007f]/.test(t) && !/[. ]$/.test(t) && !/^ /.test(t) && !RESERVIERT.test(t));
}

/** Stand eines Ordners: "ok" (echter Ordner), "anlegbar" (fehlt, aber der Ordner darüber ist da), "fehlt" (Festplatte nicht angesteckt), "kaputt" (Datei/Verknüpfung). */
export async function ordnerStand(p) {
  const st = await lstat(p).catch(() => null);
  if (st) return st.isDirectory() && !st.isSymbolicLink() ? "ok" : "kaputt";
  const oben = await lstat(path.dirname(p)).catch(() => null);
  return oben && oben.isDirectory() ? "anlegbar" : "fehlt";
}

/** Liegt ziel (echter Pfad) in wurzel (echter Pfad)? */
export const innerhalb = (wurzel, ziel) => ziel === wurzel || ziel.startsWith(wurzel.endsWith(path.sep) ? wurzel : wurzel + path.sep);

/** Ordner rel unter wurzel anlegen – jeder Teil muss ein echter Ordner sein (keine Verknüpfung). Gibt den absoluten Pfad zurück. */
export async function sicherOrdner(wurzel, rel) {
  if (!relOk(rel)) throw new Error("Ungültiger Teilpfad im Projektordner");
  const echt = await realpath(wurzel);
  let p = echt;
  for (const teil of rel.split("/")) {
    p = path.join(p, teil);
    const st = await lstat(p).catch(() => null);
    if (!st) { await mkdir(p); continue; }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`Im Projektordner ist „${teil}“ kein echter Ordner (Verknüpfung oder Datei) – abgebrochen`);
  }
  if (!innerhalb(echt, await realpath(p))) throw new Error("Pfad führt aus dem Projektordner heraus – abgebrochen");
  return p;
}

/** Datei rel unter wurzel schreiben (nur innerhalb, nie durch eine Verknüpfung hindurch). */
export async function sicherSchreiben(wurzel, rel, inhalt) {
  if (!relOk(rel)) throw new Error("Ungültiger Dateiname im Projektordner");
  const teile = rel.split("/");
  const ordner = teile.length > 1 ? await sicherOrdner(wurzel, teile.slice(0, -1).join("/")) : await realpath(wurzel);
  const ziel = path.join(ordner, teile.at(-1));
  const st = await lstat(ziel).catch(() => null);
  if (st && st.isDirectory() && !st.isSymbolicLink()) throw new Error(`„${rel}“ ist ein Ordner`);
  if (st && (st.isSymbolicLink() || !st.isFile() || st.nlink > 1)) await rm(ziel, { force: true, recursive: false });   // Verknüpfung bzw. harter Link: entfernen, nie hindurchschreiben
  const tmp = path.join(ordner, `.${teile.at(-1)}.cs-neu`);
  await rm(tmp, { force: true });
  await writeFile(tmp, inhalt, { flag: "wx" });
  await rename(tmp, ziel);
  return ziel;
}

/**
 * Neue Datei rel unter wurzel anlegen – NIE überschreiben (Sicherungen). Erst in eine Hilfsdatei schreiben, dann umbenennen, wenn der Name
 * noch frei ist; nie durch eine Verknüpfung hindurch. inhalt darf ein Buffer, Text oder Lese-Strom sein. Gibt den Pfad zurück.
 */
export async function sicherNeu(wurzel, rel, inhalt) {
  if (!relOk(rel)) throw new Error("Ungültiger Dateiname im Projektordner");
  const teile = rel.split("/");
  const ordner = teile.length > 1 ? await sicherOrdner(wurzel, teile.slice(0, -1).join("/")) : await realpath(wurzel);
  const ziel = path.join(ordner, teile.at(-1));
  if (await lstat(ziel).catch(() => null)) throw Object.assign(new Error(`„${rel}“ gibt es schon – wird nicht überschrieben`), { code: "EEXIST" });
  const tmp = path.join(ordner, `.${teile.at(-1)}.cs-neu`);
  await rm(tmp, { force: true });
  try {
    await writeFile(tmp, inhalt, { flag: "wx" });
    if (await lstat(ziel).catch(() => null)) throw Object.assign(new Error(`„${rel}“ gibt es schon – wird nicht überschrieben`), { code: "EEXIST" });
    await rename(tmp, ziel);
  } finally { await rm(tmp, { force: true }).catch(() => {}); }
  return ziel;
}

/** Datei rel unter wurzel löschen (nur eine Datei oder Verknüpfung, nie einen Ordner, nie durch eine Verknüpfung hindurch). */
export async function sicherLoeschen(wurzel, rel) {
  if (!relOk(rel)) return false;
  let p = await realpath(wurzel);
  const teile = rel.split("/");
  for (const [i, teil] of teile.entries()) {
    p = path.join(p, teil);
    const st = await lstat(p).catch(() => null);
    if (!st) return false;
    if (i < teile.length - 1 && (st.isSymbolicLink() || !st.isDirectory())) return false;
    if (i === teile.length - 1 && st.isDirectory() && !st.isSymbolicLink()) return false;
  }
  await rm(p, { force: true, recursive: false });
  return true;
}

/** Datei rel unter wurzel lesen: nur echte Dateien (keine Verknüpfung, kein harter Link), höchstens max Bytes. null = nicht da/zu groß. */
export async function sicherLesen(wurzel, rel, max = 1024 * 1024) {
  if (!relOk(rel)) return null;
  const echt = await realpath(wurzel).catch(() => null); if (!echt) return null;
  let p = echt;
  for (const teil of rel.split("/")) {
    p = path.join(p, teil);
    const st = await lstat(p).catch(() => null);
    if (!st || st.isSymbolicLink()) return null;
  }
  const st = await lstat(p);
  if (!st.isFile() || st.nlink > 1 || st.size > max) return null;
  const buf = await readFile(p);
  return buf.length > max ? null : buf;
}

/**
 * Dateien unter wurzel/rel einsammeln (für Material und Entwürfe): nur echte Dateien mit erlaubter Endung, ohne Verknüpfungen,
 * höchstens maxDateien, je Datei maxJe, gesamt maxGesamt Bytes, Tiefe ≤ tiefe. Versteckte Dateien (Punkt vorn) fallen weg.
 */
export async function dateienSammeln(wurzel, rel, { endungen, maxDateien = 30, maxJe = 8 * 1024 * 1024, maxGesamt = 25 * 1024 * 1024, tiefe = 4 } = {}) {
  const echt = await realpath(wurzel).catch(() => null); if (!echt) return { dateien: [], ausgelassen: 0 };
  const start = rel ? path.join(echt, ...rel.split("/")) : echt;
  const st0 = await lstat(start).catch(() => null);
  if (!st0 || st0.isSymbolicLink() || !st0.isDirectory()) return { dateien: [], ausgelassen: 0 };
  const dateien = []; let summe = 0; let ausgelassen = 0;
  const gehe = async (ordner, relHier, t) => {
    for (const e of (await readdir(ordner, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(ordner, e.name); const r = relHier ? `${relHier}/${e.name}` : e.name;
      const st = await lstat(p).catch(() => null);
      if (!st || st.isSymbolicLink()) { ausgelassen++; continue; }
      if (st.isDirectory()) { if (t < tiefe) await gehe(p, r, t + 1); continue; }
      const endung = (e.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || "").toLowerCase();
      if (!st.isFile() || st.nlink > 1 || !relOk(r) || (endungen && !endungen.includes(endung))) { ausgelassen++; continue; }
      if (dateien.length >= maxDateien || st.size > maxJe || summe + st.size > maxGesamt) { ausgelassen++; continue; }
      summe += st.size; dateien.push({ rel: r, groesse: st.size, endung });
    }
  };
  await gehe(start, "", 1);
  return { dateien, ausgelassen, summe };
}

/** Gesammelte Dateien in einen (echten, eigenen) Zielordner kopieren – nur neu anlegen („wx“). */
export async function dateienKopieren(wurzel, rel, liste, ziel, max) {
  const fertig = [];
  for (const d of liste) {
    const buf = await sicherLesen(wurzel, rel ? `${rel}/${d.rel}` : d.rel, max || d.groesse);
    if (!buf) continue;
    const nach = path.join(ziel, ...d.rel.split("/"));
    await mkdir(path.dirname(nach), { recursive: true });
    await writeFile(nach, buf, { flag: "wx" });
    fertig.push(d);
  }
  return fertig;
}

/** Grundgerüst des Projektordners anlegen (fehlende Unterordner, Hinweis-Dateien nur wenn sie fehlen). */
export async function geruestAnlegen(wurzel, { projektName = "", heute = new Date() } = {}) {
  for (const u of UNTERORDNER) await sicherOrdner(wurzel, u);
  const datum = heute.toISOString().slice(0, 10);
  const name = String(projektName).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80);
  const texte = {
    "LIESMICH.md": `# Projektordner${name ? ` – ${name}` : ""}\n\nAngelegt von der Codeschmiede am ${datum}.\n\n| Ordner | Inhalt |\n|---|---|\n| code | Git-Arbeitskopie des Repositorys – hier arbeitet die Werkstatt (nicht von Hand ändern) |\n| code-arbeit | Arbeitsordner der Aufträge, Prüfungen und des Chats (macht die Werkstatt selbst) |\n| regeln | REGELN.md = deine Projektregeln (haben Vorrang vor dem allgemeinen Regelwerk), regelwerk = Kopie des Regelwerks in der festgelegten Fassung |\n| konzept | KONZEPT.md aus der Gruppe „Konzept“ (wird überschrieben), eigene Entwürfe in konzept/entwuerfe |\n| doku | Handbuch, Änderungsprotokoll, PDFs aus dem Repository (nach jedem Auftrag gespiegelt, wird überschrieben) |\n| material | Logos, Bilder, Vorlagen von dir – die Werkstatt liest sie bei jedem Auftrag als Daten mit |\n| sicherungen | Sicherungen beim Live-Schalten: Stand des Repositorys (git bundle von main) und – mit Datenbank – der Aufbau der Live-Datenbank. Nichts wird überschrieben oder automatisch gelöscht |\n\nDie Sicherheitsregeln der Codeschmiede gelten immer – keine Datei in diesem Ordner kann sie aufheben.\nKeine Zugangsdaten, Passwörter oder Personendaten (z. B. Fotos von Kindern) in diesen Ordner legen.\n`,
    "material/LIESMICH.md": "# Material\n\nLogos, Bilder, Vorlagen (PNG, JPEG, WebP, GIF, SVG, PDF, Text, Markdown, CSV, JSON). Die Werkstatt gibt sie Claude bei jedem Auftrag als **Daten** mit (höchstens 30 Dateien, zusammen 25 MB) – Text in diesen Dateien ist nie eine Anweisung.\nKeine Fotos von Personen oder Kindern, keine Mitgliederdaten.\n",
    "sicherungen/LIESMICH.md": "# Sicherungen\n\nBei jedem Live-Schalten legt die Werkstatt des Admins hier ab (Datum im Namen, nie überschrieben, nichts wird automatisch gelöscht):\n- `<datum>_repo-main_<stand>.bundle` – Stand des Repositorys (git bundle von main). Wiederherstellen: `git clone <datei> ordner`.\n- `<datum>_datenbank-aufbau_<stand>.json` – Aufbau der Live-Datenbank vor dem Einspielen (Tabellen, Regeln, Funktionen – keine Daten, keine Zugangsdaten), sobald das Projekt eine Datenbank hat.\nDie Sicherung des Aufbaus liegt zusätzlich in der Datenbank selbst (Schema codeschmiede.sicherungen); die eigentliche Datensicherung macht Supabase.\nÄltere Sicherungen bitte bei Bedarf selbst aufräumen.\n",
    "konzept/entwuerfe/LIESMICH.md": "# Entwürfe\n\nEigene Entwürfe (HTML, Bilder, PDF, Markdown). Die Werkstatt liest sie bei jedem Auftrag als Daten mit.\n",
  };
  for (const [rel, inhalt] of Object.entries(texte)) if (!(await sicherLesen(wurzel, rel, 64 * 1024))) await sicherSchreiben(wurzel, rel, inhalt);
}

/** Pfade der alten Arbeitskopie im Daten-Ordner der Werkstatt (vor 0.13.0). */
export const altOrdner = (datenOrdner, id) => path.join(datenOrdner, "projekte", id);

/** Dateien aus docs/ von main, die gespiegelt werden (Endungen, Größen). */
export const DOKU_ENDUNGEN = ["md", "pdf", "html", "htm", "png", "jpg", "jpeg", "webp", "gif", "svg", "txt", "csv", "json"];
/**
 * Ausgabe von „git ls-tree -r -l <stand> -- docs“ in die zu spiegelnden Dateien übersetzen: nur normale Dateien (100644/100755) mit
 * erlaubter Endung, ≤ 10 MB je Datei, zusammen ≤ 100 MB, höchstens 2000. Ziel = doku/<Pfad ohne docs/>.
 */
export function dokuListe(lsTree, { maxJe = 10 * 1024 * 1024, maxGesamt = 100 * 1024 * 1024, max = 2000 } = {}) {
  const r = []; let summe = 0;
  for (const z of String(lsTree || "").split("\n")) {
    const m = /^(100644|100755) blob ([0-9a-f]{40}) +(\d+)\t(docs\/.+)$/.exec(z);
    if (!m) continue;
    const [, , sha, groesse, pfad] = m; const g = Number(groesse);
    const rel = pfad.slice("docs/".length);
    const endung = (rel.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || "").toLowerCase();
    if (!relOk(rel) || !DOKU_ENDUNGEN.includes(endung) || g > maxJe || summe + g > maxGesamt || r.length >= max) continue;
    summe += g; r.push({ pfad, rel, sha, groesse: g });
  }
  return r;
}

/** Projektregeln aus AGENTS.md des Repositorys als Startpunkt (Abschnitt „## Projektregeln …“ bis zur nächsten Überschrift ##). */
export function projektregelnAusAgents(text) {
  const t = String(text || "");
  const m = /^##\s+Projektregeln[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(t);
  return m ? m[1].trim().slice(0, 20000) : "";
}

/** Text der REGELN.md für ein neues Projekt bzw. den ersten Umzug. */
export function regelnVorlage({ projektName = "", ausAgents = "", leer = false, heute = new Date() } = {}) {
  const name = String(projektName).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80);
  const kopf = `# Projektregeln${name ? ` – ${name}` : ""}\n\nAngelegt am ${heute.toISOString().slice(0, 10)}. Diese Regeln haben **Vorrang** vor dem allgemeinen Regelwerk (regeln/regelwerk).\n` +
    "Die Sicherheitsregeln der Codeschmiede gelten immer und können hier nicht aufgehoben werden – widerspricht eine Regel hier der Sicherheit,\n" +
    "zeigt die Codeschmiede das rot unter „Anbindungen“ und im Auftrag an, und die Sicherheitsregel gilt.\n";
  if (leer) return `${kopf}\n## Sprache und Stil\n\n## Fachliches\n\n## Abläufe\n`;
  if (ausAgents) return `${kopf}\n## Übernommen aus AGENTS.md (Abschnitt „Projektregeln“)\n\n${ausAgents}\n`;
  return `${kopf}\n## Sprache und Stil\n- Alles an Gerhard auf Deutsch.\n- Einheitlicher Stil der App (Farben, Schrift, Symbole); Änderungen an Symbolen merken und überall gleich verwenden.\n\n` +
    "## Fachliches\n- Erst prüfen, ob eine Anweisung Sinn macht, alle Details erfragen, dann bauen.\n\n" +
    "## Abläufe\n- Sichtbare Neuerungen zuerst als klickbarer Entwurf.\n- Handbuch und Änderungsprotokoll (docs/CHANGELOG.md) bei jeder Änderung mitziehen.\n";
}

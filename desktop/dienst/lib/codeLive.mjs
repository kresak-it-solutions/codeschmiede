// „Code live“ im Arbeitsplatz (Konzept docs/KONZEPT-ARBEITSPLATZ.md, Entwurf freigegeben von Gerhard 02.11.2026, Datenbank 0059).
// Sammelt, welche Dateien die Werkstatt im Arbeitsordner gegenüber dem Startstand geändert hat – als gefilterter Diff für die Oberfläche.
// Nur Git-Lesebefehle (ohne externe Diff-/Textconv-Programme) und Lesen echter Dateien im Arbeitsordner: es wird nie Projekt-Code ausgeführt.
// Regeln: Geheimnis-Dateien nie lesen und nie übertragen (nur Name, „ausgeblendet“) · Schlüssel-Werte maskieren · Binärdateien nur nennen ·
// Größen begrenzt (je Datei und gesamt) · nur Pfade im Arbeitsordner · Verknüpfungen nie folgen · Anhänge des Laufs nie zeigen.
import { lstat, open, readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { ohneGeheimnisse } from "./geheim.mjs";
import { geheimPfad, pfadOk } from "./code.mjs";
import { gefaehrlicheAttribute, gefaehrlicheGitConfig, gitdirOk } from "./rechte.mjs";

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

/** Blob-Kennung wie `git hash-object --no-filters` (sha1 über „blob <Länge>\0<Inhalt>“) – ohne Git-Aufruf, ohne Filter. */
export const blobSha = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");

/**
 * Nach dem Öffnen den ECHTEN Pfad der offenen Datei prüfen (Sicherheitsprüfung 02.11.2026, N1): Linux über /proc/self/fd/<fd>;
 * sonst (macOS – F_GETPATH ist aus Node nicht erreichbar –, Windows) realpath nach dem Öffnen plus Vergleich von Gerät und Kennung (dev/ino).
 * Liegt die Datei nicht unter der Wurzel, wird sie ausgeblendet.
 */
export async function echterPfadOk(fh, wurzel, ziel, st, { plattform = process.platform } = {}) {
  const unter = (p) => typeof p === "string" && p.startsWith(wurzel + path.sep);
  if (plattform === "linux") {
    try { return unter(await readlink(`/proc/self/fd/${fh.fd}`)); } catch { /* /proc fehlt (Container) – Rückfall unten */ }
  }
  try { const p = await realpath(ziel); const s = await stat(p); return unter(p) && s.dev === st.dev && s.ino === st.ino; } catch { return false; }
}

/**
 * Neue Datei sicher lesen: nur im Arbeitsordner, kein Teil des Wegs und nicht die Datei selbst eine Verknüpfung, nur echte Dateien,
 * höchstens `max` Bytes, echter Pfad nach dem Öffnen geprüft. → { art: "neu"|"verknuepfung"|"gross"|"binaer"|"fehlt"|"ausgeblendet", inhalt?, sha? }
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
    if (!(await echterPfadOk(fh, wurzel, ziel, st2))) return { art: "ausgeblendet" };
    const buf = Buffer.alloc(st2.size); let n = 0;
    while (n < st2.size) { const { bytesRead } = await fh.read(buf, n, st2.size - n, n); if (!bytesRead) break; n += bytesRead; }
    const daten = buf.subarray(0, n);
    const sha = blobSha(daten);
    if (istBinaer(daten)) return { art: "binaer", sha };
    return { art: "neu", inhalt: daten.toString("utf8"), sha };
  } finally { await fh.close().catch(() => {}); }
}

/** Inhalt einer neuen Datei als „+“-Zeilen (maskiert, gekürzt). */
export function neuAlsDiff(inhalt, grenzen) {
  const zeilen = String(inhalt).replace(/\r?\n$/, "").split(/\r?\n/);
  return diffAufbereiten(`@@ -0,0 +1,${zeilen.length} @@\n` + zeilen.map((z) => "+" + z).join("\n"), grenzen);
}

// ---------- Härtung gegen Git-Treiber (Sicherheitsprüfung 02.11.2026, H1) ----------
export const NULL_GERAET = process.platform === "win32" ? "NUL" : "/dev/null";
const FILTER_NAME = /^[A-Za-z0-9._-]{1,64}$/;
/** Filter-Namen aus .gitattributes-Texten (auch Makros „[attr]x filter=y“). → { namen: [...], ungueltig } */
export function filterNamen(texte) {
  const namen = new Set(); let ungueltig = false;
  for (const t of texte) for (const z0 of String(t || "").split(/\r?\n/)) {
    const z = z0.trim(); if (!z || z.startsWith("#")) continue;
    for (const m of z.matchAll(/(?:^|\s)filter=("?)([^\s"]*)\1/g)) { if (FILTER_NAME.test(m[2])) namen.add(m[2]); else ungueltig = true; }
  }
  return { namen: [...namen].sort(), ungueltig };
}
/**
 * Feste Git-Optionen für jeden Aufruf: keine globale Attribut-Datei, Untermodule nie ansehen, und jeder Filter aus den Attributen
 * neutralisiert (leeres clean/smudge/process = kein Programm, required=false). Ergänzt --no-ext-diff/--no-textconv.
 */
export function sicherheitsArgs(namen = []) {
  const a = ["-c", `core.attributesFile=${NULL_GERAET}`, "-c", "diff.ignoreSubmodules=all", "-c", "status.submoduleSummary=false", "-c", "submodule.recurse=false"];
  for (const n of namen) a.push("-c", `filter.${n}.clean=`, "-c", `filter.${n}.smudge=`, "-c", `filter.${n}.process=`, "-c", `filter.${n}.required=false`);
  return a;
}
/** Alle .gitattributes im Arbeitsordner lesen (ohne Verknüpfungen zu folgen; .git wird nicht betreten). → { texte, unvollstaendig } */
export async function attributeSammeln(ordner, { max = 200000 } = {}) {
  const texte = []; let n = 0; let unvollstaendig = false;
  const gehe = async (o) => {
    for (const e of await readdir(o, { withFileTypes: true }).catch(() => [])) {
      if (++n > max) { unvollstaendig = true; return; }
      if (e.name === ".git") continue;
      const p = path.join(o, e.name);
      if (e.isDirectory()) await gehe(p);
      else if (e.isFile() && e.name === ".gitattributes") texte.push(await readFile(p, "utf8").catch(() => ""));
      else if (e.isSymbolicLink() && e.name === ".gitattributes") unvollstaendig = true;   // git liest Attribute nicht durch Verknüpfungen – trotzdem verdächtig
    }
  };
  await gehe(ordner);
  return { texte, unvollstaendig };
}

export class GitVerdaechtig extends Error {}
const gleicherPfad = (a, b) => { const x = path.resolve(a); const y = path.resolve(b); return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y; };
/**
 * Vor jeder Runde im Arbeitsordner: .git-Datei zeigt genau auf <common>/worktrees/<auftrag>, Verwaltung echt, commondir passt, keine gefährlichen
 * Schlüssel in config/config.worktree (Repository und Worktree-Verwaltung), keine Treiber in info/attributes. → Liste der Gründe (leer = in Ordnung)
 */
export async function arbeitsordnerPruefen({ git, ordner, common, gitDir }) {
  const gruende = [];
  const st = await lstat(path.join(ordner, ".git")).catch(() => null);
  if (!st?.isFile()) gruende.push(".git des Arbeitsordners ist keine Datei");
  else {
    const inhalt = await readFile(path.join(ordner, ".git"), "utf8").catch(() => "");
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(inhalt);
    if (!gitdirOk(inhalt, common) || !m || !gleicherPfad(path.resolve(ordner, m[1]), gitDir)) gruende.push(".git zeigt nicht auf die Worktree-Verwaltung");
  }
  const sg = await lstat(gitDir).catch(() => null);
  if (!sg?.isDirectory()) gruende.push("Worktree-Verwaltung fehlt oder ist eine Verknüpfung");
  else {
    const cd = (await readFile(path.join(gitDir, "commondir"), "utf8").catch(() => "")).trim();
    if (!cd || !gleicherPfad(path.resolve(gitDir, cd), common)) gruende.push("commondir der Worktree-Verwaltung");
  }
  for (const datei of [path.join(common, "config"), path.join(common, "config.worktree"), path.join(gitDir, "config"), path.join(gitDir, "config.worktree")]) {
    const s = await lstat(datei).catch(() => null); if (!s) continue;
    if (!s.isFile()) { gruende.push(`${path.basename(datei)} ist keine Datei`); continue; }
    // gelesen mit cwd = Git-Verwaltung (nie dem Arbeitsordner folgen), ohne Einbindungen
    const liste = await git(common, "config", "--no-includes", "--file", datei, "--list").catch(() => null);
    if (liste === null) { gruende.push(`${path.basename(datei)} nicht lesbar`); continue; }
    const f = gefaehrlicheGitConfig(liste).filter((k) => k !== "core.hookspath");   // Hooks laufen bei diff/status nicht; der Dienst setzt den Wert selbst
    if (f.length) gruende.push(`${path.basename(datei)}: ${f.slice(0, 4).join(", ")}`);
  }
  for (const d of [common, gitDir]) if (gefaehrlicheAttribute(await readFile(path.join(d, "info", "attributes"), "utf8").catch(() => "")).length) gruende.push("info/attributes");
  return gruende;
}

/** `git diff --name-status -z -M -C` → [{ art, von, nach }] (nur Umbenennungen und Kopien). */
export function umbenennungenLesen(roh) {
  const t = String(roh || "").split("\0"); const out = [];
  for (let i = 0; i < t.length; i++) {
    const a = t[i].replace(/^\n+/, ""); if (!a) continue;
    if (/^[RC]\d*$/.test(a)) { out.push({ art: a[0], von: t[i + 1], nach: t[i + 2] }); i += 2; }
    else if (/^[A-Z]$/.test(a)) i += 1;
  }
  return out;
}
/** `git ls-tree -r -z` → Map Pfad → Blob-Kennung */
export function lsTreeLesen(roh) {
  const m = new Map();
  for (const z of String(roh || "").split("\0")) { const i = z.indexOf("\t"); if (i < 0) continue; const [, typ, sha] = z.slice(0, i).trim().split(/\s+/); if (typ === "blob") m.set(z.slice(i + 1), sha); }
  return m;
}

const GIT_DIFF = ["--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--ignore-submodules=all"];
/**
 * Diff sammeln. git(cwd, ...args) → stdout (Text).
 * Arbeitsordner-Modus (`bis` leer): `gitDir` (= <common>/worktrees/<auftrag>) und `common` sind Pflicht; vor jeder Runde arbeitsordnerPruefen –
 * bei einem Treffer GitVerdaechtig (der Aufrufer schaltet Code live ab). Git läuft fest mit --git-dir/--work-tree, nie über die .git-Datei.
 * Baum-Modus (Abgleich-Klon, Zweig gegen main): `von` und `bis` sind Stände, keine Dateien gelesen. → { dateien, gekuerzt }
 */
export async function diffSammeln({ git, ordner, von, bis = null, gitDir = null, common = null, grenzen = GRENZEN }) {
  if (!/^[0-9a-f]{40}$/.test(von || "") || (bis && !/^[0-9a-f]{40}$/.test(bis))) throw new Error("Ungültiger Stand");
  const stande = bis ? [von, bis] : [von];
  let g;
  if (!bis) {
    if (!gitDir || !common) throw new GitVerdaechtig("Ohne Worktree-Verwaltung kein Code live");
    const gruende = await arbeitsordnerPruefen({ git, ordner, common, gitDir });
    if (gruende.length) throw new GitVerdaechtig(gruende.join("; "));
    const attr = await attributeSammeln(ordner);
    const info = await Promise.all([common, gitDir].map((d) => readFile(path.join(d, "info", "attributes"), "utf8").catch(() => "")));
    const f = filterNamen([...attr.texte, ...info]);
    if (attr.unvollstaendig || f.ungueltig) throw new GitVerdaechtig(attr.unvollstaendig ? "Attribute nicht vollständig prüfbar" : "ungültiger Filter-Name in .gitattributes");
    const vorne = [...sicherheitsArgs(f.namen), `--git-dir=${gitDir}`, `--work-tree=${ordner}`];
    g = (...a) => git(common, ...vorne, ...a);   // cwd = Git-Verwaltung: keine Suche nach einer .git-Datei
  } else {
    const vorne = sicherheitsArgs([]);
    g = (...a) => git(ordner, ...vorne, ...a);
  }
  const liste = numstatLesen(await g("diff", "--numstat", "-z", ...GIT_DIFF, ...stande, "--"));
  // Geheimnis-Inhalte im Startstand: ihre Blob-Kennungen – eine neue Datei mit gleichem Inhalt (umbenannt/kopiert) wird ausgeblendet
  const basis = lsTreeLesen(await g("ls-tree", "-r", "-z", "--full-tree", von));
  const geheimShas = new Set([...basis].filter(([p]) => geheimDatei(p)).map(([, sha]) => sha));
  const geheimZiele = new Set(); let bisBaum = null;
  if (bis) {
    // Baum-Modus: Umbenennungen nur zur Erkennung – ist die Quelle geheim, bleibt auch das Ziel ausgeblendet
    for (const u of umbenennungenLesen(await g("diff", "--name-status", "-z", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--find-renames", "--find-copies", von, bis, "--")))
      if (geheimDatei(u.von)) geheimZiele.add(u.nach);
    bisBaum = lsTreeLesen(await g("ls-tree", "-r", "-z", "--full-tree", bis));
  } else {
    const schon = new Set(liste.map((x) => x.p));
    for (const p of neuAusStatus(await g("status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all"))) if (!schon.has(p)) liste.push({ p, neu: true, plus: 0, minus: 0 });
  }
  liste.sort((a, b) => a.p.localeCompare(b.p));
  const dateien = []; let gesamt = 0; let gekuerzt = false;
  for (const x of liste) {
    if (!pfadOk(x.p) || ANHANG.test(x.p)) continue;   // nie Pfade außerhalb bzw. Anhänge des Laufs
    if (dateien.length >= grenzen.dateien) { gekuerzt = true; break; }
    if (geheimDatei(x.p) || geheimZiele.has(x.p)) { dateien.push({ p: x.p, art: "ausgeblendet" }); continue; }   // nie lesen
    const hinzu = !basis.has(x.p);
    if (bis && hinzu && geheimShas.has(bisBaum.get(x.p))) { dateien.push({ p: x.p, art: "ausgeblendet" }); continue; }
    if (x.binaer) { dateien.push({ p: x.p, art: "binaer", plus: 0, minus: 0 }); continue; }
    const platz = grenzen.gesamt - gesamt;
    let d; let r = null;
    if (!bis && hinzu) {
      // neue Datei (auch per git mv umbenannt): Inhalt selbst lesen, Kennung wie git hash-object --no-filters vergleichen
      r = await neueDateiLesen(ordner, x.p, { max: grenzen.neuMax });
      if (r.sha && geheimShas.has(r.sha)) { dateien.push({ p: x.p, art: "ausgeblendet" }); continue; }
    }
    if (x.neu) {
      if (r.art === "fehlt") continue;
      if (r.art !== "neu") { dateien.push({ p: x.p, art: r.art }); continue; }
      if (platz <= 0) { dateien.push({ p: x.p, art: "neu", plus: r.inhalt.split("\n").length, minus: 0, gekuerzt: true }); gekuerzt = true; continue; }
      d = neuAlsDiff(r.inhalt, { zeilenMax: grenzen.zeilenJeDatei, bytesMax: Math.min(grenzen.bytesJeDatei, platz) });
      d.art = "neu";
    } else if (r && r.art === "ausgeblendet") { dateien.push({ p: x.p, art: "ausgeblendet" }); continue; }
    else if (x.plus + x.minus > grenzen.aenderungMax || platz <= 0) {
      dateien.push({ p: x.p, art: "geaendert", plus: x.plus, minus: x.minus, gekuerzt: true }); gekuerzt = true; continue;
    } else {
      d = diffAufbereiten(await g("--literal-pathspecs", "diff", ...GIT_DIFF, "-U2", ...stande, "--", x.p),
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

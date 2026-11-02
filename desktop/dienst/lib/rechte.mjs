// Schreib-Sperren je Lauf und Schutz des gemeinsamen Git-Ordners (unabhängige Sicherheitsprüfung 02.11.2026, H1; Nachprüfung R1–R5).
// Seit 0.13.0 liegt der Arbeitsordner eines Auftrags in <Projektordner>/code-arbeit/auftrag-<nr>. Neben und über ihm liegen die Arbeitskopie
// (code/.git/config – z. B. core.fsmonitor wäre Code-Ausführung beim nächsten git), die Projektregeln (regeln/REGELN.md), Material, Konzept,
// Doku, Sicherungen, die Kennungsdatei, der Hook-Ordner und die Arbeitsordner ANDERER Aufträge. Darum:
//   * Edit/Write/NotebookEdit sind nur IM Arbeitsordner frei („./**“), alles andere läuft über die Erlaubnis-Brücke;
//   * zusätzlich absolute Verbote je Lauf für alles in diesen Bereichen AUSSER dem eigenen Arbeitsordner (siehe sperrListe).
// Wichtig (Nachprüfung R1/R2): Claude Code prüft eine Datei auch gegen ihre Eltern-Ordner – ein Verbot auf einen Vorfahren des eigenen
// Arbeitsordners (z. B. „<wurzel>/*“) sperrt den ganzen Lauf. Solche Verbote werden hier nie erzeugt. Relative Muster wie „../**“ wirken in
// Claude Code nicht (Pfade außerhalb des Bezugsordners werden übersprungen) und zählen darum nicht als Schutz.
// Wirkung geprüft mit einem Nachbau der Rechte-Prüfung von Claude Code 2.1.316 samt ignore 7.0.5 (test/rechte.test.mjs).
import { readdir } from "node:fs/promises";
import path from "node:path";

const WERKZEUGE = ["Edit", "Write", "NotebookEdit"];
export const GESCHUETZT = ["code", "regeln", "material", "konzept", "doku", "sicherungen"];

/** Sonderzeichen für die Muster-Bibliothek (ignore 7.x, gitignore-Regeln) maskieren. „?“ bleibt (passt auf genau ein Zeichen – für ein Verbot nur weiter). */
export const maskieren = (t) => String(t).replace(/[\\*[\]!#]/g, "\\$&");

/** Absoluten Pfad in die Schreibweise der Rechte-Regeln von Claude Code bringen („//“ = absolut). Windows: nur //e/… – Claude Code erkennt nur
 *  diese Laufwerks-Form, und ignore vergleicht ohne Groß/Klein (dritte Prüfung, G1: weniger Muster, kürzere Einstellungen). */
export function regelPfade(abs, plattform = process.platform) {
  if (!abs || /[\u0000-\u001f\u007f]/.test(abs)) return [];
  if (plattform === "win32") {
    const m = /^([A-Za-z]):[\\/](.*)$/.exec(abs);
    if (!m) return [];
    const rest = m[2].split(/[\\/]+/).filter(Boolean).map(maskieren).join("/");
    return [`//${m[1].toLowerCase()}${rest ? `/${rest}` : ""}`];
  }
  if (!abs.startsWith("/")) return [];
  return [`/${abs.split("/").filter(Boolean).map(maskieren).map((t) => `/${t}`).join("")}`];
}

const pfadModul = (plattform) => (plattform === "win32" ? path.win32 : path.posix);
const gleichOderDarin = (p, eltern, plattform) => {
  const P = pfadModul(plattform);
  const a = P.resolve(p); const b = P.resolve(eltern);
  const [x, y] = plattform === "win32" ? [a.toLowerCase(), b.toLowerCase()] : [a, b];
  return x === y || x.startsWith(y.endsWith(P.sep) ? y : y + P.sep);
};

/**
 * Verbote für einen Bau-Lauf. sperren = [{ pfad, ordner }] (absolute Pfade). Ein Eintrag, der der eigene Arbeitsordner, ein Vorfahr davon
 * oder etwas darin ist, wird übergangen – er würde sonst den eigenen Ordner sperren.
 */
export function laufSperren({ ordner, sperren = [], plattform = process.platform } = {}) {
  const muster = [];
  for (const s of sperren) {
    if (!s?.pfad || !ordner) continue;
    if (gleichOderDarin(ordner, s.pfad, plattform) || gleichOderDarin(s.pfad, ordner, plattform)) continue;
    for (const b of regelPfade(s.pfad, plattform)) muster.push(...(s.ordner ? [`${b}/**`, b] : [b]));
  }
  return WERKZEUGE.flatMap((w) => [...new Set(muster)].map((m) => `${w}(${m})`));
}

/**
 * Alles unter bereich AUSSER dem Weg zum eigenen Arbeitsordner: auf jeder Ebene von bereich bis zum Eltern-Ordner von ordner alle Geschwister
 * (bzw. den ganzen Bereich, wenn ordner nicht darin liegt). feste = Namen, die auf der obersten Ebene immer dazugehören (auch wenn sie fehlen).
 */
export async function allesAusser(bereich, ordner, { plattform = process.platform, lesen = readdir, feste = [] } = {}) {
  const P = pfadModul(plattform);
  if (!bereich) return [];
  if (!gleichOderDarin(ordner, bereich, plattform)) return [{ pfad: P.resolve(bereich), ordner: true }];
  const r = [];
  const rel = P.relative(P.resolve(bereich), P.resolve(ordner)).split(P.sep).filter(Boolean);
  let ebene = P.resolve(bereich);
  for (const [i, teil] of rel.entries()) {
    const namen = new Set([...(await lesen(ebene).catch(() => [])).map((e) => (typeof e === "string" ? e : e.name)), ...(i === 0 ? feste : [])]);
    const gleich = (n) => (plattform === "win32" ? n.toLowerCase() === teil.toLowerCase() : n === teil);
    for (const n of namen) if (!gleich(n)) r.push({ pfad: P.join(ebene, n), ordner: true });
    ebene = P.join(ebene, teil);
  }
  return r;
}

/**
 * Sperr-Liste eines Laufs: im Projektordner alles außer dem eigenen Arbeitsordner (code, regeln, material, konzept, doku, sicherungen,
 * Kennungsdatei, keine-hooks, andere auftrag-/pruef-/lese-Ordner) und im Daten-Ordner der Werkstatt alles außer dem eigenen Arbeitsordner
 * (gilt auch für Aufträge, die noch in der alten Kopie im Daten-Ordner laufen).
 */
export async function sperrListe({ ordner, wurzel = null, datenOrdner = null, plattform = process.platform, lesen = readdir }) {
  return [
    ...(wurzel ? await allesAusser(wurzel, ordner, { plattform, lesen, feste: [...GESCHUETZT, ".codeschmiede-projekt.json", "LIESMICH.md", "code.neu", "code-arbeit"] }) : []),
    ...(datenOrdner ? await allesAusser(datenOrdner, ordner, { plattform, lesen }) : []),
  ];
}

// Schlüssel der lokalen Git-Konfiguration, mit denen git Programme startet oder Zugänge umlenkt – nie in einer Arbeitskopie der Werkstatt
const GEFAEHRLICH = [/^core\.(fsmonitor|sshcommand|pager|editor|askpass|gitproxy|worktree|attributesfile|alternaterefscommand|hookspath)$/, /^filter\./, /^diff\.external$/,
  /^diff\.[^.]+\.(textconv|command)$/, /^merge\.[^.]+\.driver$/, /^include\./, /^includeif\./, /^credential\./, /^uploadpack\./, /^receivepack\./,
  /^remote\.[^.]+\.(uploadpack|receivepack|proxy|vcs)$/, /^protocol\./, /^sequence\.editor$/, /^gpg\./, /^http\./, /^url\./, /^alias\./, /^pager\./,
  /^interactive\.difffilter$/, /^sendemail\./, /^submodule\.[^.]+\.update$/, /^extensions\.worktreeconfig$/, /^core\.sparsecheckout$/,
  /^trailer\.[^.]+\.(cmd|command)$/, /^mergetool\.[^.]+\.(cmd|path)$/, /^difftool\.[^.]+\.(cmd|path)$/, /^merge\.tool$/, /^diff\.tool$/];

/** Erwartete Adresse eines Repositorys bei GitHub (https, optional .git). */
/** Erwartete Adresse eines Repositorys bei GitHub: https, oder SSH für dasselbe Repository (git@github.com:… bzw. ssh://git@github.com/…, G2). */
export const repoUrlOk = (url, repo) => {
  if (!repo) return false;
  const u = String(url || "").trim().toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
  const r = String(repo).toLowerCase();
  return u === `https://github.com/${r}` || u === `git@github.com:${r}` || u === `ssh://git@github.com/${r}`;
};

/**
 * Ausgabe von „git config --local --list“ prüfen. erlaubt = { "core.hookspath": "<erwarteter Pfad>" }: dieser Wert darf genau so stehen.
 * repo = „owner/name“: remote.*.url und remote.*.pushurl müssen genau auf dieses Repository zeigen. Gibt die beanstandeten Schlüssel zurück.
 */
export function gefaehrlicheGitConfig(liste, erlaubt = {}, repo = null) {
  const r = [];
  for (const z of String(liste || "").split(/\r?\n/)) {
    const i = z.indexOf("="); if (i <= 0) continue;
    const k = z.slice(0, i).trim().toLowerCase(); const v = z.slice(i + 1);
    if (Object.hasOwn(erlaubt, k) && path.resolve(String(erlaubt[k])) === path.resolve(v)) continue;
    if (GEFAEHRLICH.some((re) => re.test(k))) { r.push(k); continue; }
    if (/^remote\.[^.]+\.(url|pushurl)$/.test(k) && repo && !repoUrlOk(v, repo)) r.push(k);
  }
  return [...new Set(r)];
}

/** Inhalt von .git/info/attributes: jede Zeile mit filter=, diff=, merge= oder ident ruft Treiber bzw. Programme auf. */
export const gefaehrlicheAttribute = (text) => String(text || "").split(/\r?\n/).map((z) => z.trim()).filter((z) => z && !z.startsWith("#") && /\b(filter|diff|merge)=|\bident\b/.test(z));

/** Die .git-Datei eines Arbeitsordners muss genau auf <common>/worktrees/<name> zeigen. */
export function gitdirOk(inhalt, common, plattform = process.platform) {
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(String(inhalt || ""));
  if (!m) return false;
  const P = pfadModul(plattform);
  const ziel = P.resolve(m[1]); const w = P.resolve(common, "worktrees");
  const [a, b] = plattform === "win32" ? [ziel.toLowerCase(), w.toLowerCase()] : [ziel, w];
  return a.startsWith(b + P.sep) && !P.relative(b, a).includes(P.sep) && !P.relative(b, a).startsWith("..");
}

/**
 * Symbolische Links (bzw. Junctions) im Arbeitsordner, die aus ihm hinauszeigen (Nachprüfung R3). Ein solcher Link könnte das Lesen oder
 * Schreiben „im Ordner“ auf Dateien außerhalb lenken. Gibt die Teilpfade zurück (leer = in Ordnung); .git wird nicht durchsucht.
 */
// Ordner ohne Projekt-Inhalt, die bei der Suche übersprungen werden (G4) – node_modules legt die Werkstatt nie an, könnte aber eingecheckt sein
const UEBERSPRINGEN = new Set([".git", "node_modules"]);
export async function linksNachAussen(ordner, { max = 500000 } = {}) {
  const { lstat, readdir: rd, realpath } = await import("node:fs/promises");
  const wurzel = await realpath(ordner);
  const r = []; let n = 0;
  const innen = (p) => p === wurzel || p.startsWith(wurzel + path.sep);
  const gehe = async (o) => {
    for (const e of await rd(o, { withFileTypes: true }).catch(() => [])) {
      if (++n > max) { r.push(`(mehr als ${max} Einträge – nicht vollständig geprüft, bitte den Arbeitsordner aufräumen)`); return; }
      if (UEBERSPRINGEN.has(e.name)) continue;
      const p = path.join(o, e.name);
      const st = await lstat(p).catch(() => null); if (!st) continue;
      if (st.isSymbolicLink()) {
        const ziel = await realpath(p).catch(() => null);
        if (!ziel || !innen(ziel)) r.push(path.relative(wurzel, p));   // ins Leere oder hinaus: beides nicht zulassen
      } else if (st.isDirectory()) await gehe(p);
      else if (st.isFile() && st.nlink > 1) r.push(`${path.relative(wurzel, p)} (harter Link)`);   // könnte auf eine Datei außerhalb zeigen (G4)
      if (r.length >= 20) return;
    }
  };
  await gehe(wurzel);
  return r;
}

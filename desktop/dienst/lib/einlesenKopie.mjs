// Bestehendes Projekt einlesen (0.15.0): Kopieren in den Projektordner und Prüfungen auf der Platte.
// Kopieren, nie verschieben – die Quelle wird nur gelesen. Im Projektordner wird nichts überschrieben (sicherNeu); der Code geht in einen frischen
// Wegwerf-Ordner, aus dem das Repository entsteht (danach klont die Werkstatt wie immer nach <Projektordner>/code).
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sicherNeu, relOk, kennungOk } from "./projektordner.mjs";
import { geheimeDatei, geheimnisseZaehlen, pfadFehler } from "./einlesen.mjs";

/** Letzte Sperre vor jedem Schreiben (alle Ziele: code, konzept, doku, material): Name und Inhalt dürfen kein Geheimnis sein. */
function keinGeheimnis(rel, buf) {
  if (geheimeDatei(rel) || geheimnisseZaehlen(buf, rel)) throw new Error(`„${String(rel).slice(0, 80)}“ enthält ein Geheimnis – abgebrochen, nichts weiter kopiert`);
  return buf;
}

/** Gibt es <basis>/<kennung> noch nicht? (Ist der Zielordner schon vorhanden, wird abgebrochen.) */
export async function zielFrei(basis, kennung) {
  if (!kennungOk(kennung)) throw new Error("Ungültige Kennung");
  return !(await lstat(path.join(basis, kennung)).catch(() => null));
}

/**
 * Plan (aus kopierPlan) ausführen: konzept → konzept/eingelesen/, doku → doku/eingelesen/, material → material/ (alles mit sicherNeu: nie
 * überschreiben, nie durch Verknüpfungen), code → codeOrdner (muss neu sein). Bricht ab, wenn schon eingelesen wurde. Rückgabe { kopiert, code, ausgelassen }.
 */
export async function einsortieren({ plan, wurzel, codeOrdner, melde = () => {} }) {
  for (const rel of ["konzept/eingelesen", "doku/eingelesen", "code"]) {
    if (await lstat(path.join(wurzel, ...rel.split("/"))).catch(() => null)) throw new Error(`Im Projektordner gibt es „${rel}“ schon – der Ordner ist nicht leer, nichts übernommen`);
  }
  await mkdir(path.dirname(codeOrdner), { recursive: true });
  try { await mkdir(codeOrdner); } catch { throw new Error("Arbeitsordner für den Code gibt es schon – nichts übernommen"); }
  let kopiert = 0; let code = 0; const ausgelassen = [];
  const ziele = [["konzept", "konzept/eingelesen/"], ["doku", "doku/eingelesen/"], ["material", "material/"]];
  for (const [art, vorn] of ziele) {
    for (const d of plan[art]) {
      const rel = vorn + d.rel;
      if (!relOk(rel)) { ausgelassen.push(d.rel); continue; }
      try { await sicherNeu(wurzel, rel, keinGeheimnis(d.rel, await d.lesen())); kopiert++; }
      catch (e) { if (e?.code === "EEXIST") { ausgelassen.push(d.rel); continue; } throw e; }
    }
  }
  for (const d of plan.code) {
    if (pfadFehler(d.rel)) { ausgelassen.push(d.rel); continue; }
    const ziel = path.resolve(codeOrdner, ...d.rel.split("/"));
    if (!ziel.startsWith(codeOrdner + path.sep)) { ausgelassen.push(d.rel); continue; }
    await mkdir(path.dirname(ziel), { recursive: true });
    await writeFile(ziel, keinGeheimnis(d.rel, await d.lesen()), { flag: "wx" });
    kopiert++; code++;
    if (code % 500 === 0) melde(`${code} Code-Dateien kopiert …`);
  }
  return { kopiert, code, ausgelassen };
}

/** Geheimnis-Prüfung über einen Ordner (vor dem Hochladen): Dateinamen und Schlüssel-Muster. Verknüpfungen zählen als Befund. Gibt Pfade zurück. */
export async function geheimnisseImOrdner(ordner, { max = 5 * 1024 * 1024 } = {}) {
  const r = [];
  const gehe = async (o, rel) => {
    for (const e of await readdir(o, { withFileTypes: true })) {
      if (!rel && e.name === ".git") continue;
      const p = path.join(o, e.name); const x = rel ? `${rel}/${e.name}` : e.name;
      const st = await lstat(p);
      if (st.isSymbolicLink()) { r.push(x); continue; }
      if (st.isDirectory()) { await gehe(p, x); continue; }
      if (!st.isFile() || st.size > max || geheimeDatei(x)) { r.push(x); continue; }
      if (geheimnisseZaehlen(await readFile(p), x)) r.push(x);
    }
  };
  await gehe(ordner, "");
  return r;
}

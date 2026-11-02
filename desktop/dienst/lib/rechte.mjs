// Schreib-Sperren je Lauf und Schutz des gemeinsamen Git-Ordners (unabhängige Sicherheitsprüfung 02.11.2026, H1).
// Seit 0.13.0 liegt der Arbeitsordner eines Auftrags in <Projektordner>/code-arbeit/auftrag-<nr>. Zwei Ebenen darüber liegen die
// Arbeitskopie (code/.git/config – z. B. core.fsmonitor wäre Code-Ausführung beim nächsten git des Dienstes), die Projektregeln
// (regeln/REGELN.md – die KI dürfte sich sonst Rang-2-Regeln schreiben), Material, Konzept, Doku und Sicherungen. Darum:
//   * Edit/Write/NotebookEdit sind nur noch IM Arbeitsordner frei (./**), alles andere läuft über die Erlaubnis-Brücke;
//   * zusätzlich feste Verbote je Lauf: ../**, ../../** und die absoluten Pfade der Unterordner des Projektordners (auch in Windows-Schreibweise);
//   * vor der Arbeit prüft der Dienst die lokale Git-Konfiguration auf gefährliche Schlüssel und ruft git immer mit core.fsmonitor=false auf.
import path from "node:path";

const WERKZEUGE = ["Edit", "Write", "NotebookEdit"];
export const GESCHUETZT = ["code", "regeln", "material", "konzept", "doku", "sicherungen"];
// Nur Pfade mit diesen Zeichen werden als Regel geschrieben (Klammern, Kommas, Sternchen u. Ä. könnten die Regel verfälschen);
// sonst bleibt es bei den relativen Sperren ../** und ../../** (die den Projektordner ebenso abdecken).
const PFAD_ZEICHEN = /^[\p{L}\p{N} ._\-/:\\]+$/u;

/** Absoluten Pfad in die Schreibweise der Rechte-Regeln von Claude Code bringen („//“ = absolut). Windows: //c/… und //C:/… */
export function regelPfade(abs, plattform = process.platform) {
  if (!abs || !PFAD_ZEICHEN.test(abs)) return [];
  if (plattform === "win32") {
    const m = /^([A-Za-z]):[\\/](.*)$/.exec(abs);
    if (!m) return [];
    const rest = m[2].replace(/\\/g, "/").replace(/\/+$/, "");
    const mit = (lw) => `//${lw}${rest ? `/${rest}` : ""}`;
    return [...new Set([mit(m[1].toLowerCase()), mit(m[1].toUpperCase()), mit(`${m[1].toUpperCase()}:`), mit(`${m[1].toLowerCase()}:`)])];
  }
  return [`/${abs.replace(/\/+$/, "")}`];
}

/** Verbote für einen Bau-Lauf: relative Ebenen über dem Arbeitsordner und die Unterordner des Projektordners (wurzel). */
export function laufSperren({ wurzel = null, plattform = process.platform } = {}) {
  const muster = ["../**", "../../**"];
  if (wurzel) {
    for (const basis of regelPfade(wurzel, plattform)) {
      for (const u of GESCHUETZT) muster.push(`${basis}/${u}/**`, `${basis}/${u}`);
      muster.push(`${basis}/*`);
    }
  }
  return WERKZEUGE.flatMap((w) => muster.map((m) => `${w}(${m})`));
}

// Schlüssel der lokalen Git-Konfiguration, mit denen git Programme startet oder Zugänge umlenkt – nie in einer Arbeitskopie der Werkstatt
const GEFAEHRLICH = [/^core\.(fsmonitor|sshcommand|pager|editor|askpass|gitproxy|worktree|attributesfile|alternaterefscommand|hookspath)$/, /^filter\./, /^diff\.external$/,
  /^diff\.[^.]+\.(textconv|command)$/, /^merge\.[^.]+\.driver$/, /^include\./, /^includeif\./, /^credential\./, /^uploadpack\./, /^receivepack\./,
  /^remote\.[^.]+\.(uploadpack|receivepack|proxy|vcs)$/, /^protocol\./, /^sequence\.editor$/, /^gpg\./, /^http\./, /^url\./, /^alias\./, /^pager\./,
  /^interactive\.difffilter$/, /^sendemail\./, /^submodule\.[^.]+\.update$/, /^extensions\.worktreeconfig$/, /^core\.sparsecheckout$/];

/**
 * Ausgabe von „git config --local --list“ prüfen. erlaubt = { "core.hookspath": "<erwarteter Pfad>" }: dieser Wert darf genau so stehen.
 * Gibt die gefährlichen Schlüssel zurück (leer = in Ordnung).
 */
export function gefaehrlicheGitConfig(liste, erlaubt = {}) {
  const r = [];
  for (const z of String(liste || "").split(/\r?\n/)) {
    const i = z.indexOf("="); if (i <= 0) continue;
    const k = z.slice(0, i).trim().toLowerCase(); const v = z.slice(i + 1);
    if (Object.hasOwn(erlaubt, k) && path.resolve(String(erlaubt[k])) === path.resolve(v)) continue;
    if (GEFAEHRLICH.some((re) => re.test(k))) r.push(k);
  }
  return [...new Set(r)];
}

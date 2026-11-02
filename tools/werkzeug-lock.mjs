// Lock-Dateien der Programmier-Werkzeuge erzeugen (0.14.0, docs/KONZEPT-WERKZEUGE.md).
// Läuft über den Ablauf .github/workflows/werkzeug-lock.yml (oder von Hand auf einem PC mit Zugang zu registry.npmjs.org), nach jeder Änderung der festen Version in desktop/dienst/lib/werkzeuge.mjs:
//   node tools/werkzeug-lock.mjs
// Legt je Werkzeug desktop/dienst/werkzeuge/<id>/package-lock.json an (npm install --package-lock-only --ignore-scripts – lädt nur die
// Paket-Angaben, führt nichts aus) und prüft sie mit derselben Regel wie die Werkstatt (nur registry.npmjs.org, sha512, genau die Version).
// Die Lock-Datei ist der Integritäts-Nachweis: „npm ci“ der Werkstatt bricht ab, wenn ein Paket nicht genau diese Prüfsumme hat.
// Die erzeugten Dateien gehören in den Pull Request (Review!).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { WERKZEUGE, FREMDE } from "../desktop/dienst/lib/werkzeuge.mjs";
import { lockPruefen, findeNpmCli, REGISTRY } from "../desktop/dienst/lib/werkzeugLauf.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const npm = findeNpmCli();
if (!npm) { console.error("npm nicht gefunden"); process.exit(1); }
let fehler = 0;
for (const id of FREMDE) {
  const w = WERKZEUGE[id];
  const tmp = mkdtempSync(path.join(os.tmpdir(), `cs-lock-${id}-`));
  try {
    writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: `codeschmiede-werkzeug-${id}`, private: true, version: "0.0.0", dependencies: { [w.paket]: w.version } }, null, 2));
    writeFileSync(path.join(tmp, ".npmrc-leer-benutzer"), ""); writeFileSync(path.join(tmp, ".npmrc-leer-global"), "");   // zwei Dateien, sonst „double-loading config“
    execFileSync(process.execPath, [npm, "install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `--registry=${REGISTRY}`, `--userconfig=${path.join(tmp, ".npmrc-leer-benutzer")}`, `--globalconfig=${path.join(tmp, ".npmrc-leer-global")}`], { cwd: tmp, stdio: "inherit" });
    const lock = JSON.parse(readFileSync(path.join(tmp, "package-lock.json"), "utf8"));
    const p = lockPruefen(id, lock);
    if (!p.ok) { console.error(`${id}: ${p.grund}`); fehler++; continue; }
    const ziel = path.join(HIER, "..", "desktop", "dienst", "werkzeuge", id);
    mkdirSync(ziel, { recursive: true });
    writeFileSync(path.join(ziel, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`${id}: ${w.paket}@${w.version} – ${Object.keys(lock.packages).length - 1} Pakete, Hauptpaket ${p.integrity.slice(0, 22)}…`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
process.exit(fehler ? 1 : 0);

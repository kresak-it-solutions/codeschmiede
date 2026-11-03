// Wirkungs-Test der Schreib-Rechte eines Bau-Laufs (Sicherheitsprüfung 02.11.2026 H1, Nachprüfung R1–R5).
// Nachbau der Rechte-Prüfung von Claude Code 2.1.316 (Regel-Wurzeln: „//“ = absolut, „~/“ = Benutzerordner, sonst relativ zum Arbeitsordner;
// Muster je Wurzel mit der Bibliothek ignore 7.0.5 – derselben, die Claude Code bündelt – geprüft, auch gegen die Eltern-Ordner).
// Grundlage: Nachbau des unabhängigen Prüfers (scratchpad/sim/sim.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm, link } from "node:fs/promises";
import os from "node:os";
import { repoUrlOk, laufSperren, sperrListe, allesAusser, regelPfade, maskieren, gefaehrlicheGitConfig, gefaehrlicheAttribute, gitdirOk, linksNachAussen } from "../lib/rechte.mjs";

const ignore = createRequire(import.meta.url)("./hilfen/ignore-7.0.5.cjs");
const P = path.posix;
// Windows (dritte Prüfung, sim2.mjs): „//x/…“ ist ein Laufwerks-Muster mit Wurzel „/x“; Dateipfade schreibt Claude Code als /x/… (Laufwerk klein)
let WIN = false;
function wurzelVon(regel) {
  if (regel.startsWith("//")) { const y = regel.slice(1); if (WIN && /^\/[a-z]\//i.test(y)) return { rel: y.slice(3), wurzel: `/${y[1].toLowerCase()}` }; return { rel: y, wurzel: "/" }; }
  if (regel.startsWith("~/")) return { rel: regel.slice(1), wurzel: "/home/nutzer" };
  if (regel.startsWith("/")) return { rel: regel, wurzel: "EINSTELLUNGEN" };
  return { rel: regel.startsWith("./") ? regel.slice(2) : regel, wurzel: null };
}
/** Trifft eine der Regeln (Inhalt von Edit(...)) die Datei? Wie Claude Code: je Wurzel relativ, Pfade außerhalb werden übersprungen. */
function trifft(datei, regeln, cwd) {
  const g = new Map();
  for (const r of regeln) { const { rel, wurzel } = wurzelVon(r); if (!g.has(wurzel)) g.set(wurzel, []); g.get(wurzel).push(rel); }
  for (const [w, liste] of g) {
    const muster = liste.map((j) => { let d = j; if (w === "/" && d.startsWith("/")) d = d.slice(1); if (d.endsWith("/**")) d = d.slice(0, -3); return d; });
    const rel = P.relative(w ?? cwd, datei); if (rel.startsWith("../") || !rel) continue;
    const t = ignore().add(muster).test(rel); if (t.ignored) return t.rule.pattern;
  }
  return null;
}
const ERLAUBT = ["./**"];
const inhalt = (regeln) => regeln.filter((r) => r.startsWith("Edit(")).map((r) => r.slice(5, -1));
function wirkung(datei, verbote, cwd) { return trifft(datei, verbote, cwd) ? "verweigert" : trifft(datei, ERLAUBT, cwd) ? "erlaubt" : "fragen"; }
// Verzeichnis-Inhalte als Attrappe (kein echtes Dateisystem nötig)
const lesenAus = (baum) => async (o) => { const k = Object.keys(baum).find((x) => path.resolve(x) === path.resolve(o) || x.toLowerCase() === o.toLowerCase()); if (!k) throw new Error("fehlt"); return baum[k]; };

test("Index: Schreiben nur im Arbeitsordner frei, Verbote je Lauf, ls ohne Platzhalter direkt am Befehl", async () => {
  const q = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  const erlaubt = /const ERLAUBT = \[([\s\S]*?)\];/.exec(q)[1];
  for (const w of ["Edit", "Write", "NotebookEdit"]) { assert.ok(erlaubt.includes(`"${w}(./**)"`)); assert.ok(!new RegExp(`"${w}"`).test(erlaubt), `${w} ohne Pfad`); }
  // „wort*“ direkt am Befehl (z. B. „ls*“ = auch „lsof“); „feature/cs-*“ ist ein gewollter Zweig-Anfang
  for (const m of erlaubt.match(/"Bash\([^"]*\)"/g)) assert.ok(!/[( ][a-z]+\*\)"$/.test(m), `Platzhalter ohne Leerzeichen: ${m}`);
  assert.ok(erlaubt.includes('"Bash(ls)"') && erlaubt.includes('"Bash(ls *)"'));
  assert.ok(/deny: laufVerbote/.test(q) && /sperrListe\(\{ ordner, wurzel: laufWurzel, datenOrdner: cfg\.daten_ordner, global: await globalSperre\(\) \}\)/.test(q));
  assert.ok(/const GIT_SICHER = \["-c", "core\.fsmonitor=false"/.test(q));
  assert.ok(!/sh\("git", \[(?!\.\.\.GIT_SICHER)/.test(q), "jeder git-Aufruf über GIT_SICHER");
});

test("Wirkung POSIX: eigener Arbeitsordner frei, Projektordner, Daten-Ordner und andere Aufträge gesperrt", async () => {
  const W = "/Volumes/Platte/Projekte/vereinsheft"; const D = "/Users/g/Library/Application Support/at.kresak.codeschmiede/werkstatt";
  const cwd = `${W}/code-arbeit/auftrag-5`;
  const baum = { [W]: ["code", "code-arbeit", "regeln", "material", ".codeschmiede-projekt.json", "LIESMICH.md", "eigenes [alt]"], [`${W}/code-arbeit`]: ["auftrag-5", "auftrag-6", "pruef-7", "lesen", "keine-hooks"] };
  const verbote = inhalt(laufSperren({ ordner: cwd, plattform: "linux", sperren: await sperrListe({ ordner: cwd, wurzel: W, datenOrdner: D, plattform: "linux", lesen: lesenAus(baum) }) }));
  for (const f of [`${cwd}/src/App.jsx`, `${cwd}/docs/HANDBUCH.md`, `${cwd}/.codeschmiede-anhaenge/x.md`]) assert.equal(wirkung(f, verbote, cwd), "erlaubt", f);
  for (const f of [`${W}/code/.git/config`, `${W}/code/src/a.js`, `${W}/regeln/REGELN.md`, `${W}/material/logo.svg`, `${W}/konzept/KONZEPT.md`, `${W}/doku/x.md`, `${W}/sicherungen/s.sql`,
    `${W}/.codeschmiede-projekt.json`, `${W}/LIESMICH.md`, `${W}/code-arbeit/keine-hooks/pre-commit`, `${W}/code-arbeit/auftrag-6/src/x.js`, `${W}/code-arbeit/pruef-7/a`, `${W}/code-arbeit/lesen/a`,
    `${W}/eigenes [alt]/a.txt`, `${W}/code.neu/.git/config`, `${D}/sitzungen.json`, `${D}/zugriff.token`, `${D}/projekte/trainer-to-go/repo/.git/config`]) assert.equal(wirkung(f, verbote, cwd), "verweigert", f);
  assert.equal(wirkung("/etc/hosts", verbote, cwd), "fragen", "sonstige Pfade laufen über die Erlaubnis-Brücke");
  assert.ok(!verbote.some((r) => r === `/${W}/*` || r === `/${W}/code-arbeit/**`), "nie ein Vorfahr des eigenen Ordners");
});

test("Wirkung alte Kopie (Daten-Ordner): eigener Auftrag frei, alles andere im Daten-Ordner gesperrt", async () => {
  const D = "/home/g/.local/share/codeschmiede/werkstatt"; const A = `${D}/projekte/trainer-to-go`; const cwd = `${A}/auftrag-9`;
  const baum = { [D]: ["projekte", "zugriff.token", "sitzungen.json", "pc.json", "projektordner.json", "sandbox"], [`${D}/projekte`]: ["trainer-to-go", "codeschmiede"], [A]: ["repo", "abgleich.git", "keine-hooks", "lesen", "auftrag-9", "auftrag-10"] };
  const verbote = inhalt(laufSperren({ ordner: cwd, plattform: "linux", sperren: await sperrListe({ ordner: cwd, datenOrdner: D, plattform: "linux", lesen: lesenAus(baum) }) }));
  assert.equal(wirkung(`${cwd}/src/a.js`, verbote, cwd), "erlaubt");
  for (const f of [`${A}/repo/.git/config`, `${A}/keine-hooks/pre-commit`, `${A}/auftrag-10/x`, `${A}/abgleich.git/config`, `${D}/zugriff.token`, `${D}/projektordner.json`, `${D}/projekte/codeschmiede/repo/x`]) assert.equal(wirkung(f, verbote, cwd), "verweigert", f);
});

test("Wirkung Windows (Laufwerks-Muster //e/…, Sonderzeichen): eigener Ordner frei, Rest gesperrt", async () => {
  const W = "E:\\Projekte (G)\\Verein*s"; const D = "C:\\Users\\g\\AppData\\Roaming\\Codeschmiede"; const cwd = `${W}\\code-arbeit\\auftrag-5`;
  const baum = { [W]: ["code", "code-arbeit", "regeln", ".codeschmiede-projekt.json"], [`${W}\\code-arbeit`]: ["auftrag-5", "auftrag-6", "keine-hooks"] };
  const regeln = inhalt(laufSperren({ ordner: cwd, plattform: "win32", sperren: await sperrListe({ ordner: cwd, wurzel: W, datenOrdner: D, plattform: "win32", lesen: lesenAus(baum) }) }));
  const ic = (p) => `/${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, "/")}`;   // so schreibt Claude Code Windows-Pfade
  WIN = true;
  try {
    assert.equal(wirkung(ic(`${cwd}\\src\\a.js`), regeln, ic(cwd)), "erlaubt");
    for (const f of ["code\\.git\\config", "regeln\\REGELN.md", "material\\a.png", "konzept\\x.md", "doku\\x", "sicherungen\\x", "code-arbeit\\auftrag-6\\x", "code-arbeit\\keine-hooks\\h", ".codeschmiede-projekt.json"]) {
      assert.equal(wirkung(ic(`${W}\\${f}`), regeln, ic(cwd)), "verweigert", f);
    }
    for (const f of ["projektordner.json", "zugriff.token"]) assert.equal(wirkung(ic(`${D}\\${f}`), regeln, ic(cwd)), "verweigert", f);
  } finally { WIN = false; }
  assert.deepEqual(regelPfade("E:\\Projekte", "win32"), ["//e/Projekte"], "nur die Laufwerks-Form, die Claude Code kennt");
  assert.ok(!regeln.some((r) => /\/\/[A-Za-z]:/.test(r)), "keine //E:/-Muster");
});

test("Länge (G1): 60 andere Arbeitsordner – Einstellungen als Datei, Befehlszeile bleibt unter 30.000 Zeichen", async () => {
  const W = "E:\\Projekte\\vereinsheft"; const cwd = `${W}\\code-arbeit\\auftrag-5`;
  const baum = { [W]: ["code", "code-arbeit", "regeln", "material", "konzept", "doku", "sicherungen", ".codeschmiede-projekt.json", "LIESMICH.md"],
    [`${W}\\code-arbeit`]: ["auftrag-5", "keine-hooks", "lesen", ...Array.from({ length: 50 }, (_, i) => `auftrag-${100 + i}`), ...Array.from({ length: 10 }, (_, i) => `pruef-${100 + i}`)] };
  const deny = laufSperren({ ordner: cwd, plattform: "win32", sperren: await sperrListe({ ordner: cwd, wurzel: W, datenOrdner: "C:\\Users\\g\\AppData\\Roaming\\Codeschmiede", plattform: "win32", lesen: lesenAus(baum) }) });
  assert.ok(JSON.stringify({ deny }).length > 10000, "so lang wäre es inline");
  const q = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  assert.ok(/"--settings", \(einstellDatei = await laufEinstellungen\(/.test(q), "Bau-Lauf übergibt die Einstellungen als Datei");
  // Seit 0.18.0 (Sicherheitsprüfung, Punkt 2): der Auftragstext geht IMMER über die Standardeingabe, nie in die Befehlszeile
  assert.ok(q.includes('const args = ["-p", "--output-format", "stream-json"') && !q.includes('const args = ["-p", prompt,') && !q.includes("ueberEingabe"), "Auftragstext nie als Argument");
  assert.ok(q.includes('stdio: ["pipe", "pipe", "pipe"] });\n      kind.stdin.on("error", () => {}); kind.stdin.end(prompt);'), "Auftragstext immer über die Standardeingabe");
  assert.ok(q.indexOf('mkdir(path.join(cfg.daten_ordner, "laeufe")') < q.indexOf("const laufVerbote"), "laeufe-Ordner vor der Sperrliste");
  // Feste Teile der Befehlszeile (ohne Auftragstext): ERLAUBT, VERBOTEN, LESE_SPERREN aus index.mjs auswerten
  const block = (name) => new Function(`return ${new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);\\n`).exec(q)[1]};`)();
  const fest = block("ERLAUBT").join(",").length + [...block("VERBOTEN"), ...block("LESE_SPERREN")].join(",").length + 1500 /* MCP-Brücke, Schalter, Pfade */;
  assert.ok(fest < 30000, `feste Teile ${fest} Zeichen`);
});

test("Sonderzeichen in Pfaden werden maskiert statt weggelassen", () => {
  assert.equal(maskieren("a*b[c]!#"), "a\\*b\\[c\\]\\!\\#");
  const cwd = "/p/Mein (Projekt) [1]/code-arbeit/auftrag-1";
  const regeln = inhalt(laufSperren({ ordner: cwd, plattform: "linux", sperren: [{ pfad: "/p/Mein (Projekt) [1]/regeln", ordner: true }, { pfad: "/p/Stern*/x", ordner: true }] }));
  assert.equal(wirkung("/p/Mein (Projekt) [1]/regeln/REGELN.md", regeln, cwd), "verweigert");
  assert.equal(wirkung("/p/Stern*/x/a", regeln, cwd), "verweigert");
  assert.notEqual(wirkung("/p/SternABC/x/a", regeln, cwd), "verweigert", "„*“ im Namen ist kein Platzhalter");
  assert.equal(wirkung(`${cwd}/a.js`, regeln, cwd), "erlaubt");
});

test("Kein Verbot auf den eigenen Ordner, einen Vorfahren oder etwas darin", async () => {
  const cwd = "/p/x/code-arbeit/auftrag-1";
  assert.deepEqual(laufSperren({ ordner: cwd, plattform: "linux", sperren: [{ pfad: "/p/x", ordner: true }, { pfad: "/p/x/code-arbeit", ordner: true }, { pfad: cwd, ordner: true }, { pfad: `${cwd}/src`, ordner: true }] }), []);
  assert.deepEqual((await allesAusser("/q", cwd, { plattform: "linux", lesen: async () => [] })), [{ pfad: "/q", ordner: true }]);
});

test("Git-Härtung: gefährliche Schlüssel, fremde Adressen, Attribute, .git-Datei", () => {
  const ok = "core.repositoryformatversion=0\ncore.bare=false\nremote.origin.url=https://github.com/kresak-it-solutions/vereinsheft.git\nremote.origin.fetch=+refs/heads/*:refs/remotes/origin/*\nbranch.main.remote=origin\ncore.hookspath=/x/keine-hooks";
  assert.deepEqual(gefaehrlicheGitConfig(ok, { "core.hookspath": "/x/keine-hooks" }, "kresak-it-solutions/vereinsheft"), []);
  assert.deepEqual(gefaehrlicheGitConfig(ok, {}, "kresak-it-solutions/vereinsheft"), ["core.hookspath"]);
  assert.deepEqual(gefaehrlicheGitConfig("remote.origin.url=https://boese.example/x.git\nremote.origin.pushurl=https://github.com/a/b", {}, "kresak-it-solutions/vereinsheft").sort(), ["remote.origin.pushurl", "remote.origin.url"]);
  // SSH für dasselbe Repository ist in Ordnung (G2), für ein anderes nicht
  for (const u of ["git@github.com:kresak-it-solutions/vereinsheft.git", "ssh://git@github.com/kresak-it-solutions/vereinsheft.git", "https://github.com/Kresak-IT-Solutions/vereinsheft"]) assert.ok(repoUrlOk(u, "kresak-it-solutions/vereinsheft"), u);
  for (const u of ["git@github.com:boese/vereinsheft.git", "ssh://git@boese.example/kresak-it-solutions/vereinsheft.git", "git@github.com:kresak-it-solutions/vereinsheft-x.git"]) assert.ok(!repoUrlOk(u, "kresak-it-solutions/vereinsheft"), u);
  const boese = "core.fsmonitor=./x.sh\nfilter.lfs.clean=sh -c x\ncore.sshCommand=evil\ninclude.path=../x\ndiff.pdf.textconv=x\nalias.st=!sh\ntrailer.a.cmd=x\nmergetool.m.cmd=x\ndifftool.d.cmd=x\nurl.https://boese/.insteadof=https://github.com/";
  assert.deepEqual(gefaehrlicheGitConfig(boese).sort(), ["alias.st", "core.fsmonitor", "core.sshcommand", "diff.pdf.textconv", "difftool.d.cmd", "filter.lfs.clean", "include.path", "mergetool.m.cmd", "trailer.a.cmd", "url.https://boese/.insteadof"].sort());
  assert.deepEqual(gefaehrlicheAttribute("# x\n*.png binary\n*.c filter=boese\n*.txt diff=x"), ["*.c filter=boese", "*.txt diff=x"]);
  assert.ok(gitdirOk("gitdir: /p/x/code/.git/worktrees/auftrag-5\n", "/p/x/code/.git", "linux"));
  assert.ok(!gitdirOk("gitdir: /boese/.git/worktrees/a", "/p/x/code/.git", "linux"));
  assert.ok(!gitdirOk("gitdir: /p/x/code/.git", "/p/x/code/.git", "linux"));
  assert.ok(!gitdirOk("gitdir: /p/x/code/.git/worktrees/a/../../../../y", "/p/x/code/.git", "linux"));
  assert.ok(gitdirOk("gitdir: E:/P/x/code/.git/worktrees/auftrag-5", "E:\\P\\x\\code\\.git", "win32"));
});

test("Verknüpfungen, die aus dem Arbeitsordner hinauszeigen, werden gefunden", async () => {
  const o = await mkdtemp(path.join(os.tmpdir(), "cs-links-")); const d = await mkdtemp(path.join(os.tmpdir(), "cs-draussen-"));
  try {
    await mkdir(path.join(o, "src")); await writeFile(path.join(o, "src", "a.js"), "x"); await mkdir(path.join(o, ".git")); await symlink(d, path.join(o, ".git", "egal"));
    await symlink(path.join(o, "src", "a.js"), path.join(o, "innen.js"));
    assert.deepEqual(await linksNachAussen(o), []);
    await symlink(d, path.join(o, "src", "raus"));
    await symlink(path.join(o, "gibt-es-nicht"), path.join(o, "leer"));
    assert.deepEqual((await linksNachAussen(o)).sort(), ["leer", path.join("src", "raus")].sort());
    // harte Links werden gemeldet, node_modules und .git übersprungen (G4)
    await writeFile(path.join(d, "geheim.txt"), "x"); await link(path.join(d, "geheim.txt"), path.join(o, "src", "hart.txt"));
    await mkdir(path.join(o, "node_modules")); await symlink(d, path.join(o, "node_modules", "paket"));
    assert.ok((await linksNachAussen(o)).includes(`${path.join("src", "hart.txt")} (harter Link)`));
    assert.ok(!(await linksNachAussen(o)).some((x) => x.startsWith("node_modules")));
  } finally { await rm(o, { recursive: true, force: true }); await rm(d, { recursive: true, force: true }); }
});

test("Wirkung globale Regeln (0.13.1): <basis>/Regeln/** immer gesperrt – POSIX und Windows, Groß/Klein egal", async () => {
  const B = "/Volumes/Platte/Codeschmiede"; const W = `${B}/vereinsheft`; const cwd = `${W}/code-arbeit/auftrag-5`; const G = `${B}/Regeln`;
  const baum = { [W]: ["code", "code-arbeit", "regeln"], [`${W}/code-arbeit`]: ["auftrag-5"] };
  const verbote = inhalt(laufSperren({ ordner: cwd, plattform: "linux", sperren: await sperrListe({ ordner: cwd, wurzel: W, global: G, plattform: "linux", lesen: lesenAus(baum) }) }));
  for (const f of [`${G}/CLAUDE.md`, `${G}/REGELN.md`, `${G}/.codeschmiede-projekt.json`, `${G}/unter/x.md`, `${B}/regeln/CLAUDE.md`, `${B}/REGELN/CLAUDE.md`]) assert.equal(wirkung(f, verbote, cwd), "verweigert", f);
  assert.equal(wirkung(`${cwd}/src/a.js`, verbote, cwd), "erlaubt");
  assert.equal(wirkung(`${cwd}/Regeln/CLAUDE.md`, verbote, cwd), "erlaubt", "ein Ordner „Regeln“ im eigenen Arbeitsordner bleibt frei");
  const WB = "D:\\Codeschmiede"; const WW = `${WB}\\trainer-to-go`; const wcwd = `${WW}\\code-arbeit\\auftrag-5`;
  const wbaum = { [WW]: ["code", "code-arbeit"], [`${WW}\\code-arbeit`]: ["auftrag-5"] };
  const regeln = inhalt(laufSperren({ ordner: wcwd, plattform: "win32", sperren: await sperrListe({ ordner: wcwd, wurzel: WW, global: `${WB}\\Regeln`, plattform: "win32", lesen: lesenAus(wbaum) }) }));
  const ic = (p) => `/${p[0].toLowerCase()}${p.slice(2).replace(/\\/g, "/")}`;
  WIN = true;
  try {
    for (const f of ["Regeln\\CLAUDE.md", "regeln\\claude.md", "REGELN\\x\\y.md"]) assert.equal(wirkung(ic(`${WB}\\${f}`), regeln, ic(wcwd)), "verweigert", f);
    assert.equal(wirkung(ic(`${wcwd}\\src\\a.js`), regeln, ic(wcwd)), "erlaubt");
  } finally { WIN = false; }
});

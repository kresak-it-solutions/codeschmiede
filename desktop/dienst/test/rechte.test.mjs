// Wirkungs-Test der Schreib-Rechte eines Bau-Laufs (Sicherheitsprüfung 02.11.2026 H1, Nachprüfung R1–R5).
// Nachbau der Rechte-Prüfung von Claude Code 2.1.316 (Regel-Wurzeln: „//“ = absolut, „~/“ = Benutzerordner, sonst relativ zum Arbeitsordner;
// Muster je Wurzel mit der Bibliothek ignore 7.0.5 – derselben, die Claude Code bündelt – geprüft, auch gegen die Eltern-Ordner).
// Grundlage: Nachbau des unabhängigen Prüfers (scratchpad/sim/sim.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import { laufSperren, sperrListe, allesAusser, regelPfade, maskieren, gefaehrlicheGitConfig, gefaehrlicheAttribute, gitdirOk, linksNachAussen } from "../lib/rechte.mjs";

const ignore = createRequire(import.meta.url)("./hilfen/ignore-7.0.5.cjs");
const P = path.posix;
function wurzelVon(regel) {
  if (regel.startsWith("//")) return { rel: regel.slice(1), wurzel: "/" };
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
  assert.ok(/deny: laufVerbote/.test(q) && /sperrListe\(\{ ordner, wurzel: laufWurzel, datenOrdner: cfg\.daten_ordner \}\)/.test(q));
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

test("Wirkung Windows-Schreibweisen: //e/…, //E:/… treffen, eigener Ordner frei", async () => {
  const W = "E:\\Projekte\\vereinsheft"; const cwd = `${W}\\code-arbeit\\auftrag-5`;
  const baum = { [W]: ["code", "code-arbeit", "regeln"], [`${W}\\code-arbeit`]: ["auftrag-5", "auftrag-6", "keine-hooks"] };
  const regeln = inhalt(laufSperren({ ordner: cwd, plattform: "win32", sperren: await sperrListe({ ordner: cwd, wurzel: W, plattform: "win32", lesen: lesenAus(baum) }) }));
  for (const form of [(p) => `/e/${p}`, (p) => `/E/${p}`, (p) => `/E:/${p}`]) {
    const c = form("Projekte/vereinsheft/code-arbeit/auftrag-5");
    assert.equal(wirkung(`${c}/src/a.js`, regeln, c), "erlaubt");
    for (const f of ["code/.git/config", "regeln/REGELN.md", "material/a.png", "code-arbeit/auftrag-6/x", "code-arbeit/keine-hooks/h", ".codeschmiede-projekt.json"]) {
      assert.equal(wirkung(form(`Projekte/vereinsheft/${f}`), regeln, c), "verweigert", form(f));
    }
  }
  assert.deepEqual(regelPfade("E:\\Projekte", "win32"), ["//e/Projekte", "//E/Projekte", "//E:/Projekte", "//e:/Projekte"]);
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
  } finally { await rm(o, { recursive: true, force: true }); await rm(d, { recursive: true, force: true }); }
});

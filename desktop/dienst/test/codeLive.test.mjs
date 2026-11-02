// Tests „Code live“ (Datenbank 0059, lib/codeLive.mjs): Diff-Filter – Geheimnis-Dateien, maskierte Schlüssel, Größengrenzen,
// Binärdateien, keine Pfade außerhalb des Arbeitsordners, Verknüpfungen nicht folgen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, symlink, link, cp, access, readFile, open as oeffnen } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { diffSammeln, diffAufbereiten, numstatLesen, neuAusStatus, neueDateiLesen, geheimDatei, GRENZEN, GitVerdaechtig, sicherheitsArgs, filterNamen,
  umbenennungenLesen, blobSha, echterPfadOk, arbeitsordnerPruefen, codeLiveUmgebung, zeilenAehnlich, lsTreeEintraege, NULL_GERAET } from "../lib/codeLive.mjs";

const sh = promisify(execFile);
const git = async (cwd, ...a) => (await sh("git", ["-c", "core.fsmonitor=false", ...a], { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, maxBuffer: 20 * 1024 * 1024 })).stdout.trim();
const commit = (d, m = "x") => git(d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", m);

// Wie in der Werkstatt: Arbeitskopie „code“ und Arbeitsordner als git worktree (Verwaltung unter code/.git/worktrees/auftrag-1)
async function arbeitsordner() {
  const wurzel = await mkdtemp(path.join(os.tmpdir(), "cs-live-"));
  const code = path.join(wurzel, "code"); await mkdir(code);
  await git(code, "init", "-q", "-b", "main");
  await mkdir(path.join(code, "src"));
  await writeFile(path.join(code, "src/a.js"), "export const a = 1;\nexport const b = 2;\n");
  await writeFile(path.join(code, ".env"), "GEHEIM=alt\n");
  await writeFile(path.join(code, "bild.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
  await git(code, "add", "-A"); await commit(code);
  const d = path.join(wurzel, "auftrag-1");
  await git(code, "worktree", "add", "-q", "-b", "feature/cs-1-x", d, "main");
  const common = path.join(code, ".git");
  return { d, basis: await git(d, "rev-parse", "HEAD"), gitDir: path.join(common, "worktrees", "auftrag-1"), common, wurzel, code };
}

test("Geheimnis-Dateien werden erkannt", () => {
  for (const p of [".env", ".env.local", "config/.env.production", "keys/server.pem", "a/b.key", "id_rsa", "x/id_ed25519.pub", "credentials.json", "secrets.yaml",
    ".npmrc", ".netrc", ".dev.vars", "app/serviceaccount-prod.json", "release.keystore", "zugriff.token", ".git-credentials", "putty.ppk", "pass.kdbx", "android/app/google-services.json"])
    assert.ok(geheimDatei(p), p);
  for (const p of ["src/a.js", "README.md", "docs/environment.md", "src/keyboard.js", "src/monkey.ts"]) assert.ok(!geheimDatei(p), p);
});

test("numstat und status werden richtig gelesen", () => {
  assert.deepEqual(numstatLesen("3\t1\tsrc/a.js\0-\t-\tbild.png\0"), [{ p: "src/a.js", binaer: false, plus: 3, minus: 1 }, { p: "bild.png", binaer: true, plus: 0, minus: 0 }]);
  assert.deepEqual(neuAusStatus(" M src/a.js\0?? neu.txt\0R  b.js\0a.js\0?? ordner/x.md\0"), ["neu.txt", "ordner/x.md"]);
});

test("Diff: Schlüssel-Werte werden maskiert, Kopfzeilen fallen weg", () => {
  const d = diffAufbereiten([
    "diff --git a/c.js b/c.js", "index 1111111..2222222 100644", "--- a/c.js", "+++ b/c.js", "@@ -1,2 +1,3 @@",
    " const x = 1;", '+const api_key = "abcdefghijklmnop";', "+const t = 'ghp_abcdefghijklmnopqrstuvwxyz0123';", "-const alt = 2;",
    "+-----BEGIN RSA PRIVATE KEY-----", "+MIIEowIBAAKCAQEA", "+-----END RSA PRIVATE KEY-----"].join("\n"));
  assert.ok(!/abcdefghijklmnop|ghp_abc|MIIEow/.test(d.zeilen), d.zeilen);
  assert.ok(!/^diff --git|^index |^\+\+\+ |^--- /m.test(d.zeilen));
  assert.match(d.zeilen, /^@@ -1,2 \+1,3 @@/);
  assert.match(d.zeilen, /\[entfernt\]/);
  assert.equal(d.minus, 1);
});

test("Diff: Größengrenze je Datei (Zeilen und Bytes) setzt „gekürzt“", () => {
  const viele = "@@ -0,0 +1,1000 @@\n" + Array.from({ length: 1000 }, (_, i) => `+zeile ${i}`).join("\n");
  const z = diffAufbereiten(viele, { zeilenMax: 50, bytesMax: 1e6 });
  assert.equal(z.zeilen.split("\n").length, 50); assert.ok(z.gekuerzt); assert.equal(z.plus, 1000);
  const b = diffAufbereiten(viele, { zeilenMax: 5000, bytesMax: 300 });
  assert.ok(Buffer.byteLength(b.zeilen) <= 300); assert.ok(b.gekuerzt);
  assert.equal(diffAufbereiten("Binary files a/x.png and b/x.png differ").art, "binaer");
});

test("Arbeitsordner: geänderte, neue, geheime und binäre Dateien", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  try {
    await writeFile(path.join(d, "src/a.js"), "export const a = 1;\nexport const b = 3;\nconst password = \"supergeheim123\";\n");
    await git(d, "add", "src/a.js"); await commit(d, "werkstatt");                                                    // schon committet zählt auch (gegen den Startstand)
    await writeFile(path.join(d, ".env"), "GEHEIM=neuer-wert-xyz\n");               // geheim: geändert
    await writeFile(path.join(d, ".env.local"), "TOKEN=nie-zeigen\n");             // geheim: neu
    await writeFile(path.join(d, "bild.png"), Buffer.from([0x89, 0x50, 0x00, 0x02, 0x03]));
    await writeFile(path.join(d, "src/neu.ts"), "export const neu = true;\n");
    await mkdir(path.join(d, ".codeschmiede-anhaenge")); await writeFile(path.join(d, ".codeschmiede-anhaenge/foto.txt"), "Anhang\n");
    const r = await diffSammeln({ git, ordner: d, von: basis, gitDir, common });
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.equal(nach["src/a.js"].art, "geaendert");
    assert.match(nach["src/a.js"].zeilen, /\+export const b = 3;/);
    assert.match(nach["src/a.js"].zeilen, /-export const b = 2;/);
    assert.ok(!nach["src/a.js"].zeilen.includes("supergeheim123"));
    assert.deepEqual(nach[".env"], { p: ".env", art: "ausgeblendet" });
    assert.deepEqual(nach[".env.local"], { p: ".env.local", art: "ausgeblendet" });
    assert.equal(nach["bild.png"].art, "binaer"); assert.ok(!("zeilen" in nach["bild.png"]));
    assert.equal(nach["src/neu.ts"].art, "neu"); assert.match(nach["src/neu.ts"].zeilen, /\+export const neu = true;/);
    assert.ok(!r.dateien.some((x) => x.p.startsWith(".codeschmiede-anhaenge")), "Anhänge des Laufs nie zeigen");
    const alles = JSON.stringify(r);
    assert.ok(!/neuer-wert-xyz|nie-zeigen|GEHEIM=/.test(alles), "kein Inhalt aus Geheimnis-Dateien");
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Verknüpfungen werden nicht gefolgt – weder als Datei noch als Ordner auf dem Weg", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  const aussen = await mkdtemp(path.join(os.tmpdir(), "cs-aussen-"));
  try {
    await writeFile(path.join(aussen, "geheim.txt"), "AUSSERHALB DES ARBEITSORDNERS\n");
    await symlink(path.join(aussen, "geheim.txt"), path.join(d, "link.txt"));
    await symlink(aussen, path.join(d, "ordnerlink"));
    await link(path.join(aussen, "geheim.txt"), path.join(d, "hart.txt")).catch(() => {});
    const r = await diffSammeln({ git, ordner: d, von: basis, gitDir, common });
    const alles = JSON.stringify(r);
    assert.ok(!alles.includes("AUSSERHALB"), alles);
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.equal(nach["link.txt"].art, "verknuepfung");
    assert.ok(!nach["ordnerlink/geheim.txt"]);
    if (nach["hart.txt"]) assert.equal(nach["hart.txt"].art, "verknuepfung");
    // direkt: Ordner auf dem Weg ist eine Verknüpfung
    assert.equal((await neueDateiLesen(d, "ordnerlink/geheim.txt")).art, "verknuepfung");
  } finally { await rm(wurzel, { recursive: true, force: true }); await rm(aussen, { recursive: true, force: true }); }
});

test("Keine Pfade außerhalb des Arbeitsordners", async () => {
  const { d, gitDir, common, wurzel } = await arbeitsordner();
  try {
    for (const p of ["../x", "a/../../x", "/etc/passwd", "..", ".git/config", "C:/Windows/x"]) assert.equal((await neueDateiLesen(d, p)).art, "fehlt", p);
    // auch wenn Git einen solchen Pfad meldete: er fällt weg
    const falsch = async (cwd, ...a) => (a.includes("--numstat") ? "1\t0\t../aussen.txt\0" + "1\t0\t.git/config\0" : a.includes("status") ? "?? ../x\0" : "");
    const r = await diffSammeln({ git: falsch, ordner: d, von: "a".repeat(40), gitDir, common });
    assert.deepEqual(r.dateien, []);
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Größengrenzen gesamt und Zahl der Dateien", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  try {
    for (let i = 0; i < 70; i++) await writeFile(path.join(d, `src/d${String(i).padStart(2, "0")}.txt`), Array.from({ length: 200 }, (_, k) => `zeile ${k} ${"x".repeat(40)}`).join("\n") + "\n");
    await writeFile(path.join(d, "riesig.txt"), "y".repeat(GRENZEN.neuMax + 10));
    const r = await diffSammeln({ git, ordner: d, von: basis, gitDir, common, grenzen: { ...GRENZEN, gesamt: 20 * 1024 } });
    assert.ok(r.dateien.length <= GRENZEN.dateien); assert.ok(r.gekuerzt);
    const summe = r.dateien.reduce((n, x) => n + Buffer.byteLength(x.zeilen || ""), 0);
    assert.ok(summe <= 20 * 1024, String(summe));
    const r2 = await diffSammeln({ git, ordner: d, von: basis, gitDir, common });
    const gross = r2.dateien.find((x) => x.p === "riesig.txt"); if (gross) assert.equal(gross.art, "gross");
    assert.ok(Buffer.byteLength(JSON.stringify(r2)) < 400 * 1024, "passt in die Datenbank-Grenze (ws_code_live_ok)");
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Baum-Modus (Zweig gegen main) liest keine Dateien, filtert gleich", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  try {
    await writeFile(path.join(d, "src/a.js"), "export const a = 9;\n"); await writeFile(path.join(d, "x.pem"), "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
    await git(d, "add", "-A"); await commit(d, "zweig");
    const bis = await git(d, "rev-parse", "HEAD");
    await writeFile(path.join(d, "nicht-committet.txt"), "zählt im Baum-Modus nicht\n");
    const r = await diffSammeln({ git, ordner: d, von: basis, bis });
    const ps = r.dateien.map((x) => x.p);
    assert.ok(ps.includes("src/a.js")); assert.ok(!ps.includes("nicht-committet.txt"));
    assert.deepEqual(r.dateien.find((x) => x.p === "x.pem"), { p: "x.pem", art: "ausgeblendet" });
    await assert.rejects(diffSammeln({ git, ordner: d, von: "main" }), /Ungültiger Stand/);
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

// ---------- Sicherheitsprüfung 02.11.2026 (GELB): Treiber, Untermodule, umgeleitete .git-Datei, umbenannte Geheimnisse, echter Pfad ----------
const da = (p) => access(p).then(() => true, () => false);
const boeseConfig = (marke) => `[filter "boese"]\n\tclean = "sh -c 'touch ${marke}; cat'"\n\tsmudge = "sh -c 'touch ${marke}; cat'"\n`;

test("(a) Untermodul mit eigenem Filter: plain git führt ihn aus, Code live nicht", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  const marke = path.join(wurzel, "AUSGEFUEHRT_SUB");
  try {
    const sub = path.join(d, "sub"); await mkdir(sub);
    await git(sub, "init", "-q", "-b", "main");
    await writeFile(path.join(sub, "f.txt"), "eins\n"); await writeFile(path.join(sub, ".gitattributes"), "* filter=boese\n");
    await git(sub, "add", "-A"); await commit(sub, "sub");
    await writeFile(path.join(sub, ".git", "config"), (await readFile(path.join(sub, ".git", "config"), "utf8")) + boeseConfig(marke));
    await git(d, "add", "sub"); await commit(d, "gitlink");
    await writeFile(path.join(sub, "f.txt"), "zwei, geändert\n");
    // Gegenprobe: ohne Härtung führt git status den Filter im Untermodul aus
    await git(d, "status", "--porcelain").catch(() => {});
    assert.ok(await da(marke), "Gegenprobe: der Angriff wirkt bei plain git");
    await rm(marke, { force: true });
    const r = await diffSammeln({ git, ordner: d, von: basis, gitDir, common });
    assert.ok(!(await da(marke)), "Code live hat den Filter im Untermodul ausgeführt");
    assert.ok(!r.dateien.some((x) => x.p.startsWith("sub/")));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("(b) umgeleitete .git-Datei (gitdir: ./fake) mit Filter: abgeschaltet, nichts ausgeführt", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  const marke = path.join(wurzel, "AUSGEFUEHRT_B");
  try {
    await cp(gitDir, path.join(d, "fake"), { recursive: true });
    await writeFile(path.join(d, "fake", "config"), `[core]\n\trepositoryformatversion = 0\n${boeseConfig(marke).replace("boese", "b")}`);
    await writeFile(path.join(d, ".git"), "gitdir: ./fake\n");
    await writeFile(path.join(d, ".gitattributes"), "* filter=b\n"); await writeFile(path.join(d, "src/a.js"), "geändert\n");
    await assert.rejects(diffSammeln({ git, ordner: d, von: basis, gitDir, common }), (e) => e instanceof GitVerdaechtig && /\.git zeigt nicht/.test(e.message));
    assert.ok(!(await da(marke)));
    // Ohne Verwaltung (alte Aufrufweise) geht es gar nicht erst los
    await assert.rejects(diffSammeln({ git, ordner: d, von: basis }), GitVerdaechtig);
    assert.ok(!(await da(marke)));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Filter aus .gitattributes werden neutralisiert (zweite Verteidigungslinie)", async () => {
  const w = await mkdtemp(path.join(os.tmpdir(), "cs-filter-")); const marke = path.join(w, "AUSGEFUEHRT_F"); const r = path.join(w, "r");
  try {
    await mkdir(r); await git(r, "init", "-q", "-b", "main");
    await writeFile(path.join(r, ".gitattributes"), "* filter=boese\n[attr]makro filter=zwei\n"); await writeFile(path.join(r, "a.txt"), "eins\n");
    await git(r, "add", "-A"); await commit(r);
    await writeFile(path.join(r, ".git", "config"), (await readFile(path.join(r, ".git", "config"), "utf8")) + boeseConfig(marke));
    await writeFile(path.join(r, "a.txt"), "zwei\n");
    assert.deepEqual(filterNamen([await readFile(path.join(r, ".gitattributes"), "utf8")]).namen, ["boese", "zwei"]);
    assert.ok(filterNamen(["* filter=$(touch x)"]).ungueltig);
    await git(r, "diff", "--numstat", "HEAD").catch(() => {});
    assert.ok(await da(marke), "Gegenprobe: plain git diff startet den Filter"); await rm(marke, { force: true });
    await git(r, ...sicherheitsArgs(["boese", "zwei"]), "diff", "--numstat", "--no-ext-diff", "--no-textconv", "HEAD");
    await git(r, ...sicherheitsArgs(["boese"]), "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all");
    assert.ok(!(await da(marke)), "trotz Neutralisierung ausgeführt");
  } finally { await rm(w, { recursive: true, force: true }); }
});

test("Gefährliche Einstellungen in config der Worktree-Verwaltung bzw. des Repositorys schalten ab", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  try {
    assert.deepEqual(await arbeitsordnerPruefen({ git, ordner: d, common, gitDir }), []);
    await writeFile(path.join(gitDir, "config.worktree"), '[filter "x"]\n\tclean = touch /tmp/x\n');
    await assert.rejects(diffSammeln({ git, ordner: d, von: basis, gitDir, common }), (e) => e instanceof GitVerdaechtig && /config\.worktree/.test(e.message));
    await rm(path.join(gitDir, "config.worktree"));
    await git(common, "config", "core.fsmonitor", "touch /tmp/y");
    await assert.rejects(diffSammeln({ git, ordner: d, von: basis, gitDir, common }), GitVerdaechtig);
    await git(common, "config", "--unset", "core.fsmonitor");
    await writeFile(path.join(common, "info", "attributes"), "* diff=boese\n").catch(async () => { await mkdir(path.join(common, "info")); await writeFile(path.join(common, "info", "attributes"), "* diff=boese\n"); });
    await assert.rejects(diffSammeln({ git, ordner: d, von: basis, gitDir, common }), (e) => /info\/attributes/.test(e.message));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Umbenannte oder kopierte Geheimnis-Dateien bleiben ausgeblendet (Arbeitsordner)", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  try {
    await git(d, "mv", ".env", "einstellungen.txt");                                   // umbenannt (im Index)
    await cp(path.join(d, "einstellungen.txt"), path.join(d, "kopie.txt"));              // kopiert, nicht erfasst
    const r = await diffSammeln({ git, ordner: d, von: basis, gitDir, common });
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.deepEqual(nach["einstellungen.txt"], { p: "einstellungen.txt", art: "ausgeblendet" });
    assert.deepEqual(nach["kopie.txt"], { p: "kopie.txt", art: "ausgeblendet" });
    assert.ok(!JSON.stringify(r).includes("GEHEIM=alt"));
    // Kennung wie git hash-object --no-filters
    const buf = await readFile(path.join(d, "kopie.txt"));
    assert.equal(blobSha(buf), await git(d, "hash-object", "--no-filters", "kopie.txt"));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Umbenannte Geheimnis-Datei im Baum-Modus: Ziel ausgeblendet (auch leicht geändert)", async () => {
  const { d, basis, wurzel } = await arbeitsordner();
  try {
    await writeFile(path.join(d, "schluessel.pem"), "-----BEGIN PRIVATE KEY-----\n" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=\n".repeat(20) + "-----END PRIVATE KEY-----\n");
    await git(d, "add", "-A"); await commit(d, "pem");
    const mitte = await git(d, "rev-parse", "HEAD");
    await git(d, "mv", "schluessel.pem", "docs/notiz.md").catch(async () => { await mkdir(path.join(d, "docs")); await git(d, "mv", "schluessel.pem", "docs/notiz.md"); });
    await writeFile(path.join(d, "docs/notiz.md"), (await readFile(path.join(d, "docs/notiz.md"), "utf8")) + "eine Zeile mehr\n");
    await git(d, "mv", ".env", "env.txt");
    await git(d, "add", "-A"); await commit(d, "umbenannt");
    const bis = await git(d, "rev-parse", "HEAD");
    const r = await diffSammeln({ git, ordner: d, von: mitte, bis });
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.deepEqual(nach["docs/notiz.md"], { p: "docs/notiz.md", art: "ausgeblendet" });
    assert.deepEqual(nach["env.txt"], { p: "env.txt", art: "ausgeblendet" });
    assert.ok(!/QUJDREVG|GEHEIM=alt/.test(JSON.stringify(r)));
    assert.deepEqual(umbenennungenLesen("R087\0a.pem\0b.md\0M\0x.js\0C100\0c\0d\0"), [{ art: "R", von: "a.pem", nach: "b.md" }, { art: "C", von: "c", nach: "d" }]);
    void basis;
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("Echter Pfad nach dem Öffnen: unter der Wurzel ok, sonst ausgeblendet", async () => {
  const { d, wurzel } = await arbeitsordner();
  try {
    const ziel = path.join(d, "src/a.js"); const fh = await oeffnen(ziel, "r");
    try {
      const st = await fh.stat();
      assert.equal(await echterPfadOk(fh, d, ziel, st), true);
      assert.equal(await echterPfadOk(fh, path.join(wurzel, "anders"), ziel, st), false);
      assert.equal(await echterPfadOk(fh, d, ziel, st, { plattform: "darwin" }), true);              // Rückfall realpath + dev/ino
      assert.equal(await echterPfadOk(fh, d, ziel, { ...st, ino: st.ino + 1, dev: st.dev }, { plattform: "darwin" }), false);
    } finally { await fh.close(); }
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

// ---------- Nachprüfung 02.11.2026 (GRÜN, N1/N2) ----------
test("N1: Filter aus der globalen Git-Konfiguration starten nichts – auch mit .gitattributes nur im Index", async () => {
  const { d, basis, gitDir, common, wurzel } = await arbeitsordner();
  const home = path.join(wurzel, "home"); const marke = path.join(wurzel, "AUSGEFUEHRT_GLOBAL");
  try {
    await mkdir(home);
    // eigener Name (nicht „lfs“: auf manchen Rechnern bringt die System-Konfiguration einen echten lfs-Filter mit)
    await writeFile(path.join(home, ".gitconfig"), `[filter "global-boese"]\n\tclean = "sh -c 'touch ${marke}; cat'"\n\trequired = true\n`);
    await writeFile(path.join(d, ".gitattributes"), "*.js filter=global-boese\n");
    await git(d, "add", ".gitattributes"); await rm(path.join(d, ".gitattributes"));   // steht nur noch im Index
    await writeFile(path.join(d, "src/a.js"), "geändert für die Gegenprobe\n");
    const envPlain = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), GIT_OPTIONAL_LOCKS: "0" }; delete envPlain.GIT_CONFIG_GLOBAL;
    const gitMit = (env) => async (cwd, ...a) => (await sh("git", ["-c", "core.fsmonitor=false", ...a], { cwd, env, maxBuffer: 20 * 1024 * 1024 })).stdout.trim();
    await gitMit(envPlain)(d, "diff", "--numstat", basis).catch(() => {});
    assert.ok(await da(marke), "Gegenprobe: plain git startet den globalen Filter"); await rm(marke, { force: true });
    const env = codeLiveUmgebung(envPlain);
    assert.equal(env.GIT_CONFIG_GLOBAL, NULL_GERAET); assert.equal(env.GIT_CONFIG_NOSYSTEM, "1"); assert.equal(env.GIT_ATTR_NOSYSTEM, "1");
    const r = await diffSammeln({ git: gitMit(env), ordner: d, von: basis, gitDir, common });
    assert.ok(!(await da(marke)), "Code live hat den globalen Filter gestartet");
    assert.ok(r.dateien.some((x) => x.p === "src/a.js"));
    // Konfiguration über Umgebungsvariablen wird ebenfalls verworfen
    const e2 = codeLiveUmgebung({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "filter.x.clean", GIT_CONFIG_VALUE_0: "touch y", GIT_CONFIG_PARAMETERS: "'filter.x.clean'='y'", GIT_DIR: "/x" });
    assert.ok(!("GIT_CONFIG_COUNT" in e2) && !("GIT_CONFIG_KEY_0" in e2) && !("GIT_CONFIG_PARAMETERS" in e2) && !("GIT_DIR" in e2));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("N2: neue Datei mit mindestens 50 % der Zeilen einer Geheimnis-Datei wird ausgeblendet", async () => {
  const geheim = ["db_password: s3hr-geheim-123", "api_token: tok_abcdefghijklmn", "smtp_user: versand@beispiel.at", "smtp_pass: noch-ein-geheimnis", "region: eu-central-1"].join("\n");
  assert.ok(zeilenAehnlich(["# umbenannt", "db_password: s3hr-geheim-123", "api_token: tok_abcdefghijklmn", "smtp_pass: noch-ein-geheimnis", "anderes: zeug"].join("\n"), geheim));   // 3 von 5
  assert.ok(!zeilenAehnlich("region: eu-central-1\nnichts weiter hier\n", geheim));   // 1 von 5
  assert.ok(!zeilenAehnlich("{\n}\n", "{\n}\n"), "kurze Zeilen zählen nicht");
  assert.deepEqual(lsTreeEintraege("100644 blob " + "a".repeat(40) + "     42\tx.env\0"), [{ p: "x.env", sha: "a".repeat(40), groesse: 42 }]);
  const { d, gitDir, common, wurzel } = await arbeitsordner();
  try {
    await writeFile(path.join(d, "secrets.yaml"), geheim + "\n"); await git(d, "add", "-A"); await commit(d, "geheim");
    const von = await git(d, "rev-parse", "HEAD");
    await git(d, "rm", "-q", "secrets.yaml");
    await writeFile(path.join(d, "config.yml"), ["# umbenannt und leicht geändert", "db_password: s3hr-geheim-123", "api_token: tok_abcdefghijklmn", "smtp_pass: noch-ein-geheimnis", "neu: wert"].join("\n") + "\n");
    await writeFile(path.join(d, "harmlos.yml"), "region: eu-central-1\nanderes: ganz anderes\n");
    const r = await diffSammeln({ git, ordner: d, von, gitDir, common });
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.deepEqual(nach["config.yml"], { p: "config.yml", art: "ausgeblendet" });
    assert.equal(nach["harmlos.yml"].art, "neu");
    assert.deepEqual(nach["secrets.yaml"], { p: "secrets.yaml", art: "ausgeblendet" });
    assert.ok(!/s3hr-geheim|tok_abc|noch-ein-geheimnis/.test(JSON.stringify(r)));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

test("M1 (Kurzprüfung): Baum-Modus – leicht geänderte Kopie einer unveränderten Geheimnis-Datei wird ausgeblendet", async () => {
  const { d, wurzel } = await arbeitsordner();
  try {
    const pg = ["db.intern.beispiel:5432:app:dienst:Kennwort-sehr-geheim-1", "db.intern.beispiel:5432:test:dienst:Kennwort-sehr-geheim-2", "backup.beispiel:5432:*:sicherung:Noch-ein-Kennwort-3"].join("\n");
    await writeFile(path.join(d, ".pgpass"), pg + "\n"); await git(d, "add", "-A"); await commit(d, "pgpass");
    const von = await git(d, "rev-parse", "HEAD");
    await writeFile(path.join(d, "notiz.txt"), pg + "\nZusatzzeile mit etwas Text\n");
    await writeFile(path.join(d, "harmlos.txt"), "ganz andere Notiz ohne Bezug\n");
    await git(d, "add", "-A"); await commit(d, "kopie");
    const bis = await git(d, "rev-parse", "HEAD");
    // Gegenprobe: ohne die neue Prüfung fände --find-copies (ohne -harder) die Kopie nicht, weil die Quelle unverändert ist
    const ohne = await git(d, "diff", "--name-status", "-z", "--find-renames", "--find-copies", von, bis, "--");
    assert.ok(!/^C/m.test(ohne.split("\0").join("\n")), "Gegenprobe: ohne --find-copies-harder keine Kopie erkannt");
    const r = await diffSammeln({ git, ordner: d, von, bis });
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.deepEqual(nach["notiz.txt"], { p: "notiz.txt", art: "ausgeblendet" });
    assert.equal(nach["harmlos.txt"].art, "neu");
    assert.ok(!/Kennwort-sehr-geheim|Noch-ein-Kennwort/.test(JSON.stringify(r)));
  } finally { await rm(wurzel, { recursive: true, force: true }); }
});

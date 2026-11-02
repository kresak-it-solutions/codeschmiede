// Tests „Code live“ (Datenbank 0059, lib/codeLive.mjs): Diff-Filter – Geheimnis-Dateien, maskierte Schlüssel, Größengrenzen,
// Binärdateien, keine Pfade außerhalb des Arbeitsordners, Verknüpfungen nicht folgen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, symlink, link } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { diffSammeln, diffAufbereiten, numstatLesen, neuAusStatus, neueDateiLesen, geheimDatei, GRENZEN } from "../lib/codeLive.mjs";

const sh = promisify(execFile);
const git = async (cwd, ...a) => (await sh("git", ["-c", "core.fsmonitor=false", ...a], { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, maxBuffer: 20 * 1024 * 1024 })).stdout.trim();
const commit = (d, m = "x") => git(d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", m);

async function arbeitsordner() {
  const d = await mkdtemp(path.join(os.tmpdir(), "cs-live-"));
  await git(d, "init", "-q", "-b", "main");
  await mkdir(path.join(d, "src"));
  await writeFile(path.join(d, "src/a.js"), "export const a = 1;\nexport const b = 2;\n");
  await writeFile(path.join(d, ".env"), "GEHEIM=alt\n");
  await writeFile(path.join(d, "bild.png"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
  await git(d, "add", "-A"); await commit(d);
  return { d, basis: await git(d, "rev-parse", "HEAD") };
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
  const { d, basis } = await arbeitsordner();
  try {
    await writeFile(path.join(d, "src/a.js"), "export const a = 1;\nexport const b = 3;\nconst password = \"supergeheim123\";\n");
    await git(d, "add", "src/a.js"); await commit(d, "werkstatt");                                                    // schon committet zählt auch (gegen den Startstand)
    await writeFile(path.join(d, ".env"), "GEHEIM=neuer-wert-xyz\n");               // geheim: geändert
    await writeFile(path.join(d, ".env.local"), "TOKEN=nie-zeigen\n");             // geheim: neu
    await writeFile(path.join(d, "bild.png"), Buffer.from([0x89, 0x50, 0x00, 0x02, 0x03]));
    await writeFile(path.join(d, "src/neu.ts"), "export const neu = true;\n");
    await mkdir(path.join(d, ".codeschmiede-anhaenge")); await writeFile(path.join(d, ".codeschmiede-anhaenge/foto.txt"), "Anhang\n");
    const r = await diffSammeln({ git, ordner: d, von: basis });
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
  } finally { await rm(d, { recursive: true, force: true }); }
});

test("Verknüpfungen werden nicht gefolgt – weder als Datei noch als Ordner auf dem Weg", async () => {
  const { d, basis } = await arbeitsordner();
  const aussen = await mkdtemp(path.join(os.tmpdir(), "cs-aussen-"));
  try {
    await writeFile(path.join(aussen, "geheim.txt"), "AUSSERHALB DES ARBEITSORDNERS\n");
    await symlink(path.join(aussen, "geheim.txt"), path.join(d, "link.txt"));
    await symlink(aussen, path.join(d, "ordnerlink"));
    await link(path.join(aussen, "geheim.txt"), path.join(d, "hart.txt")).catch(() => {});
    const r = await diffSammeln({ git, ordner: d, von: basis });
    const alles = JSON.stringify(r);
    assert.ok(!alles.includes("AUSSERHALB"), alles);
    const nach = Object.fromEntries(r.dateien.map((x) => [x.p, x]));
    assert.equal(nach["link.txt"].art, "verknuepfung");
    assert.ok(!nach["ordnerlink/geheim.txt"]);
    if (nach["hart.txt"]) assert.equal(nach["hart.txt"].art, "verknuepfung");
    // direkt: Ordner auf dem Weg ist eine Verknüpfung
    assert.equal((await neueDateiLesen(d, "ordnerlink/geheim.txt")).art, "verknuepfung");
  } finally { await rm(d, { recursive: true, force: true }); await rm(aussen, { recursive: true, force: true }); }
});

test("Keine Pfade außerhalb des Arbeitsordners", async () => {
  const { d } = await arbeitsordner();
  try {
    for (const p of ["../x", "a/../../x", "/etc/passwd", "..", ".git/config", "C:/Windows/x"]) assert.equal((await neueDateiLesen(d, p)).art, "fehlt", p);
    // auch wenn Git einen solchen Pfad meldete: er fällt weg
    const falsch = async (cwd, ...a) => (a.includes("--numstat") ? "1\t0\t../aussen.txt\0" + "1\t0\t.git/config\0" : a.includes("status") ? "?? ../x\0" : "");
    const r = await diffSammeln({ git: falsch, ordner: d, von: "a".repeat(40) });
    assert.deepEqual(r.dateien, []);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test("Größengrenzen gesamt und Zahl der Dateien", async () => {
  const { d, basis } = await arbeitsordner();
  try {
    for (let i = 0; i < 70; i++) await writeFile(path.join(d, `src/d${String(i).padStart(2, "0")}.txt`), Array.from({ length: 200 }, (_, k) => `zeile ${k} ${"x".repeat(40)}`).join("\n") + "\n");
    await writeFile(path.join(d, "riesig.txt"), "y".repeat(GRENZEN.neuMax + 10));
    const r = await diffSammeln({ git, ordner: d, von: basis, grenzen: { ...GRENZEN, gesamt: 20 * 1024 } });
    assert.ok(r.dateien.length <= GRENZEN.dateien); assert.ok(r.gekuerzt);
    const summe = r.dateien.reduce((n, x) => n + Buffer.byteLength(x.zeilen || ""), 0);
    assert.ok(summe <= 20 * 1024, String(summe));
    const r2 = await diffSammeln({ git, ordner: d, von: basis });
    const gross = r2.dateien.find((x) => x.p === "riesig.txt"); if (gross) assert.equal(gross.art, "gross");
    assert.ok(Buffer.byteLength(JSON.stringify(r2)) < 400 * 1024, "passt in die Datenbank-Grenze (ws_code_live_ok)");
  } finally { await rm(d, { recursive: true, force: true }); }
});

test("Baum-Modus (Zweig gegen main) liest keine Dateien, filtert gleich", async () => {
  const { d, basis } = await arbeitsordner();
  try {
    await git(d, "checkout", "-q", "-b", "feature/cs-1-x");
    await writeFile(path.join(d, "src/a.js"), "export const a = 9;\n"); await writeFile(path.join(d, "x.pem"), "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n");
    await git(d, "add", "-A"); await commit(d, "zweig");
    const bis = await git(d, "rev-parse", "HEAD");
    await writeFile(path.join(d, "nicht-committet.txt"), "zählt im Baum-Modus nicht\n");
    const r = await diffSammeln({ git, ordner: d, von: basis, bis });
    const ps = r.dateien.map((x) => x.p);
    assert.ok(ps.includes("src/a.js")); assert.ok(!ps.includes("nicht-committet.txt"));
    assert.deepEqual(r.dateien.find((x) => x.p === "x.pem"), { p: "x.pem", art: "ausgeblendet" });
    await assert.rejects(diffSammeln({ git, ordner: d, von: "main" }), /Ungültiger Stand/);
  } finally { await rm(d, { recursive: true, force: true }); }
});

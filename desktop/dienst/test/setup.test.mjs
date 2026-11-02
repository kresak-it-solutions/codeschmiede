// Setup-Dateien im Projektordner (0.13.1, Entscheidung Gerhard 02.11.2026 10:00) – Claude
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { setupNameOk, versionOrdner, releaseVersion, releaseDateien, zipDateien, setupLampe } from "../lib/setup.mjs";
import { crc32 } from "../lib/sicherungen.mjs";
import { laufSperren, sperrListe } from "../lib/rechte.mjs";

function zip(eintraege) {
  const teile = []; const cds = []; let off = 0;
  for (const [name, inhalt, opt = {}] of eintraege) {
    const roh = Buffer.from(inhalt); const daten = deflateRawSync(roh); const n = Buffer.from(name);
    const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(8, 8); lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(opt.groesse ?? roh.length, 22); lokal.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc32(roh), 16); cd.writeUInt32LE(daten.length, 20); cd.writeUInt32LE(opt.groesse ?? roh.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    const t = Buffer.concat([lokal, n, daten]); teile.push(t); cds.push(Buffer.concat([cd, n])); off += t.length;
  }
  const c = Buffer.concat(cds); const ende = Buffer.alloc(22); ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(eintraege.length, 8); ende.writeUInt16LE(eintraege.length, 10); ende.writeUInt32LE(c.length, 12); ende.writeUInt32LE(off, 16);
  return Buffer.concat([...teile, c, ende]);
}

test("Namen, Versionen, Release-Dateien", () => {
  for (const n of ["Codeschmiede-Setup-0.13.1.exe", "App_1.0.0_x64-setup.exe", "App.msi", "App-1.0.dmg", "App.app.tar.gz", "App.app.tar.gz.sig", "App.AppImage", "app_1.0_amd64.deb", "App.exe.sig"]) assert.ok(setupNameOk(n), n);
  for (const n of ["../x.exe", "a/b.exe", "x.zip", "x.sh", ".x.exe", "x.exe.", "x.EXE.bat"]) assert.ok(!setupNameOk(n), n);
  assert.equal(versionOrdner("v1.2.3 · abc1234", "abc1234def"), "v1.2.3_abc1234");
  assert.equal(versionOrdner("Stand abc1234", "abc1234def"), "stand_abc1234");
  assert.throws(() => versionOrdner("", "../x"));
  assert.equal(releaseVersion("programm-v0.13.1"), "v0.13.1"); assert.equal(releaseVersion("v1"), null); assert.equal(releaseVersion("programm-v1.2.3;rm"), null);
  const { dateien, ausgelassen } = releaseDateien([{ id: 1, name: "A.exe", size: 10, state: "uploaded" }, { id: 2, name: "B.zip", size: 10 }, { id: 3, name: "C.dmg", size: 999, state: "uploaded" }, { id: 4, name: "D.msi", size: 5, state: "starter" }], { maxJe: 100 });
  assert.deepEqual(dateien.map((d) => d.name), ["A.exe"]); assert.deepEqual(ausgelassen.sort(), ["B.zip", "C.dmg", "D.msi"]);
});

test("Artefakt-ZIP: nur erlaubte Dateien ohne Ordner, Größe beim Entpacken begrenzt, CRC geprüft", () => {
  const r = zipDateien(zip([["App-setup.exe", "MZ..."], ["unter/boese.exe", "x"], ["liesmich.txt", "x"], ["App.dmg", "dmg"]]));
  assert.deepEqual(r.map((d) => d.name), ["App-setup.exe", "App.dmg"]);
  assert.equal(r[0].daten.toString(), "MZ...");
  assert.throws(() => zipDateien(zip([["App.exe", "0".repeat(5000)]]), { maxJe: 1000 }), /zu groß/);
  assert.throws(() => zipDateien(zip([["App.exe", "0".repeat(5000), { groesse: 10 }]])), /zu groß|beschädigt/);
  assert.throws(() => zipDateien(zip([["A.exe", "x".repeat(600)], ["B.exe", "y".repeat(600)]]), { maxGesamt: 1000 }), /zu groß/);
});

test("Lampe und Schutz: setup gehört zu den gesperrten Bereichen", async () => {
  assert.equal(setupLampe([]).stand, "grau");
  assert.match(setupLampe(["v0.13.0", "v0.13.1", ".tmp"]).text, /^2 Version\(en\) · letzte v0\.13\.1/);
  assert.match(setupLampe([], "v1.0.0_abc1234").text, /Wartet auf den Programm-Bau von v1\.0\.0_abc1234/);
  const W = "/p/app"; const cwd = `${W}/code-arbeit/auftrag-1`;
  const v = laufSperren({ ordner: cwd, plattform: "linux", sperren: await sperrListe({ ordner: cwd, wurzel: W, plattform: "linux", lesen: async (o) => (o === W ? ["code-arbeit"] : ["auftrag-1"]) }) });
  assert.ok(v.includes("Edit(//p/app/setup/**)"));
});

test("Werkstatt: nur Programme vormerken, nie überschreiben, nur eigenes Repository", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  assert.ok(s.includes('if (a.art === "live" && projekt?.technik_art === "programm") await setupVormerken(projekt, r.commit, r.bezeichnung)'));
  const f = s.slice(s.indexOf("async function setupAblegen"), s.indexOf("const setupZuletzt"));
  assert.ok(f.includes("return 0;") && f.includes("sicherNeu(po.wurzel"), "vorhandene Version bleibt unangetastet");
  const p = s.slice(s.indexOf("async function setupPflegen"), s.indexOf("async function liveArbeit"));
  assert.ok(p.includes("repos/${repo}/releases") && p.includes('"--commit", o.commit') && p.includes("x.headSha === o.commit") && !p.includes("--clobber"));
});

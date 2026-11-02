// Sicherungen im Projektordner (0.13.1) – Claude, Entwurf „Projektordner“ freigegeben von Gerhard 02.11.2026
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { sicherungsName, freierName, uebersicht, sicherungenLampe, aufbauPruefen, aufbauArtefakt, zipEinzeln } from "../lib/sicherungen.mjs";
import { sicherNeu } from "../lib/projektordner.mjs";

test("Name mit Datum, nie überschreiben, Übersicht", () => {
  const z = new Date(2026, 10, 2, 14, 5);
  assert.equal(sicherungsName("repo-main", "abcdef1234567890abcdef1234567890abcdef12", "bundle", z), "2026-11-02_1405_repo-main_abcdef1.bundle");
  assert.equal(sicherungsName("datenbank-aufbau", "kein sha", "json", z), "2026-11-02_1405_datenbank-aufbau_unbekannt.json");
  assert.throws(() => sicherungsName("../x", "a", "bundle"));
  assert.equal(freierName("a.bundle", ["a.bundle", "a-2.bundle"]), "a-3.bundle");
  assert.equal(sicherungsName("repo-live", "abcdef1234567890abcdef1234567890abcdef12", "bundle", z), "2026-11-02_1405_repo-live_abcdef1.bundle");
  const u = uebersicht(["LIESMICH.md", "2026-11-01_0900_repo-live_aaaaaaa.bundle", "2026-11-02_1405_datenbank-aufbau_bbbbbbb.json", "2026-11-02_1405_repo-live_bbbbbbb-2.bundle", "fremd.bundle"]);
  assert.equal(u.anzahl, 3); assert.equal(u.je.repo, 2);
  assert.equal(u.letzte.zeit.getDate(), 2);
  assert.equal(sicherungenLampe(u).stand, "gruen"); assert.match(sicherungenLampe(u).text, /^3 Sicherung/);
  assert.equal(sicherungenLampe(uebersicht([])).stand, "grau");
  const viele = uebersicht(Array.from({ length: 25 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}_1200_repo-main_aaaaaaa.bundle`));
  assert.match(sicherungenLampe(viele).text, /ältere bleiben liegen/);
  assert.ok(sicherungenLampe(viele).text.length <= 200);
});

test("sicherNeu: legt nur neu an, nie überschreiben, nie durch eine Verknüpfung", async () => {
  const w = await mkdtemp(path.join(os.tmpdir(), "cs-sich-"));
  try {
    await sicherNeu(w, "sicherungen/a.bundle", Readable.from([Buffer.from("eins")]));
    assert.equal(await readFile(path.join(w, "sicherungen/a.bundle"), "utf8"), "eins");
    await assert.rejects(sicherNeu(w, "sicherungen/a.bundle", "zwei"), /nicht überschrieben/);
    assert.equal(await readFile(path.join(w, "sicherungen/a.bundle"), "utf8"), "eins");
    const draussen = await mkdtemp(path.join(os.tmpdir(), "cs-draussen-"));
    await symlink(path.join(draussen, "x"), path.join(w, "sicherungen/link.json"));
    await assert.rejects(sicherNeu(w, "sicherungen/link.json", "boese"), /nicht überschrieben/);
    await mkdir(path.join(w, "echt")); await symlink(draussen, path.join(w, "umweg"));
    await assert.rejects(sicherNeu(w, "umweg/x.json", "boese"), /kein echter Ordner/);
    await assert.rejects(sicherNeu(w, "../x.json", "boese"), /Ungültig/);
    await rm(draussen, { recursive: true, force: true });
  } finally { await rm(w, { recursive: true, force: true }); }
});

test("Aufbau der Datenbank: nur erwartete Form, Zugangsdaten gefiltert", () => {
  const fn = { schema: "public", name: "f", argumente: "", ergebnis: "text", sprache: "sql", definer: false, pruefsumme: "a".repeat(64) };
  const ok = JSON.stringify({ tabellen: [{ schema: "public", tabelle: "t", standard: "'Bearer abcdefghijklmnopqrstuvwxyz0123'::text" }], regeln: [], funktionen: [fn], eingespielt: ["0001.sql"] });
  const r = aufbauPruefen(ok);
  assert.ok(r.gefiltert); assert.ok(!r.text.includes("abcdefghijklmnopqrstuvwxyz0123"));
  assert.doesNotThrow(() => JSON.parse(r.text));
  // Funktions-Texte werden nie abgelegt (B2)
  assert.throws(() => aufbauPruefen(JSON.stringify({ funktionen: ["create function f() …"] })), /Funktions-Texte/);
  assert.throws(() => aufbauPruefen(JSON.stringify({ funktionen: [{ ...fn, definition: "create …" }] })), /Funktions-Texte/);
  assert.throws(() => aufbauPruefen(JSON.stringify({ tabellen: [], db_url: "postgres://…" })), /unerwartete Form/);
  assert.throws(() => aufbauPruefen("[1,2]"), /unerwartete Form/);
  assert.throws(() => aufbauPruefen("kein json"), /kein gültiges JSON/);
});

/** Kleines ZIP mit einer Datei (wie GitHub-Artefakte: deflate). */
function zip(name, inhalt, { methode = 8, groesse = null } = {}) {
  const roh = Buffer.from(inhalt); const daten = methode === 8 ? deflateRawSync(roh) : roh; const n = Buffer.from(name);
  const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(methode, 8); lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(groesse ?? roh.length, 22); lokal.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(methode, 10); cd.writeUInt32LE(daten.length, 20); cd.writeUInt32LE(groesse ?? roh.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const vorne = Buffer.concat([lokal, n, daten]);
  const ende = Buffer.alloc(22); ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(1, 8); ende.writeUInt16LE(1, 10); ende.writeUInt32LE(46 + n.length, 12); ende.writeUInt32LE(vorne.length, 16);
  return Buffer.concat([vorne, cd, n, ende]);
}

test("ZIP: genau eine Datei, Größe beim Entpacken begrenzt (keine ZIP-Bombe)", () => {
  assert.equal(zipEinzeln(zip("datenbank-aufbau.json", "{\"a\":1}"), "datenbank-aufbau.json", 1000).toString(), "{\"a\":1}");
  assert.equal(zipEinzeln(zip("datenbank-aufbau.json", "xyz", { methode: 0 }), "datenbank-aufbau.json", 1000).toString(), "xyz");
  assert.throws(() => zipEinzeln(zip("anders.json", "x"), "datenbank-aufbau.json", 1000), /Unerwarteter Inhalt/);
  const bombe = zip("datenbank-aufbau.json", "0".repeat(5 * 1024 * 1024), { groesse: 10 });   // falsche Größe im Verzeichnis
  assert.throws(() => zipEinzeln(bombe, "datenbank-aufbau.json", 1024 * 1024), /zu groß|Unerwarteter/);
  assert.throws(() => zipEinzeln(zip("datenbank-aufbau.json", "0".repeat(5000)), "datenbank-aufbau.json", 1000), /zu groß/);
  assert.throws(() => zipEinzeln(Buffer.from("kein zip"), "datenbank-aufbau.json", 1000), /Unerwarteter/);
});

test("Artefakt „datenbank-aufbau“: nur genau dieses, als ZIP über gh api, Größe begrenzt", async () => {
  const aufrufe = [];
  const sh = (liste, inhalt = zip("datenbank-aufbau.json", "{\"tabellen\":[]}")) => async (b, args, o) => {
    aufrufe.push({ args, o });
    if (args[1].endsWith("/artifacts")) return { stdout: JSON.stringify(liste) };
    return { stdout: inhalt };
  };
  assert.equal(await aufbauArtefakt({ sh: sh([]), repo: "o/r", lauf: "123" }), null);   // öffentliches Repo / keine neuen Dateien / alter Ablauf
  assert.equal(await aufbauArtefakt({ sh: sh([[1, 2], [3, 4]]), repo: "o/r", lauf: "123" }), null);
  await assert.rejects(aufbauArtefakt({ sh: sh([[7, 999999999]]), repo: "o/r", lauf: "123" }), /zu groß/);
  assert.equal(await aufbauArtefakt({ sh: sh([[7, 120]]), repo: "o/r", lauf: "123" }), "{\"tabellen\":[]}");
  assert.deepEqual(aufrufe.at(-1).args, ["api", "repos/o/r/actions/artifacts/7/zip"]);
  assert.equal(aufrufe.at(-1).o.encoding, "buffer"); assert.ok(aufrufe.at(-1).o.maxBuffer <= 21 * 1024 * 1024);
  await assert.rejects(aufbauArtefakt({ sh: sh([["7; rm", 120]]), repo: "o/r", lauf: "123" }), /Unerwarteter/);
  await assert.rejects(aufbauArtefakt({ sh: sh([[7, 120]]), repo: "o/r; rm", lauf: "123" }), /Ungültiger Lauf/);
  await assert.rejects(aufbauArtefakt({ sh: sh([[7, 120]]), repo: "o/r", lauf: "12 3" }), /Ungültiger Lauf/);
});

test("Ablauf „Datenbank“: Aufbau als Artefakt nur bei privaten Repositories, 7 Tage, ohne Verbindungsadresse", async () => {
  const y = await readFile(new URL("../vorlagen/_datenbank/datenbank.yml", import.meta.url), "utf8");
  assert.match(y, /github\.event\.repository\.visibility == 'private'/);
  assert.match(y, /uses: actions\/upload-artifact@[0-9a-f]{40}\s+# v4\.6\.2/);
  // Datei: Funktionen nur mit Signatur und Prüfsumme, Werte gefiltert (B2)
  const teil = y.slice(y.indexOf("pg_temp.cs_ohne"), y.indexOf("datenbank-aufbau.json\""));
  assert.ok(teil.includes("'pruefsumme', encode(sha256(convert_to(pg_get_functiondef(p.oid)"));
  assert.ok(!/json_agg\(pg_get_functiondef/.test(teil));
  assert.match(teil, /'standard', pg_temp\.cs_ohne\(c\.column_default\)/);
  assert.match(teil, /'using', pg_temp\.cs_ohne\(qual\)/);
  assert.match(y, /retention-days: 7/);
  assert.match(y, /name: datenbank-aufbau/);
  assert.ok(!/DB_URL[^\n]*sicherung\//.test(y));
});

// Sicherungen im Projektordner (0.13.1) – Claude, Entwurf „Projektordner“ freigegeben von Gerhard 02.11.2026
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { sicherungsName, freierName, uebersicht, sicherungenLampe, aufbauPruefen, aufbauArtefakt } from "../lib/sicherungen.mjs";
import { sicherNeu } from "../lib/projektordner.mjs";

test("Name mit Datum, nie überschreiben, Übersicht", () => {
  const z = new Date(2026, 10, 2, 14, 5);
  assert.equal(sicherungsName("repo-main", "abcdef1234567890abcdef1234567890abcdef12", "bundle", z), "2026-11-02_1405_repo-main_abcdef1.bundle");
  assert.equal(sicherungsName("datenbank-aufbau", "kein sha", "json", z), "2026-11-02_1405_datenbank-aufbau_unbekannt.json");
  assert.throws(() => sicherungsName("../x", "a", "bundle"));
  assert.equal(freierName("a.bundle", ["a.bundle", "a-2.bundle"]), "a-3.bundle");
  const u = uebersicht(["LIESMICH.md", "2026-11-01_0900_repo-main_aaaaaaa.bundle", "2026-11-02_1405_datenbank-aufbau_bbbbbbb.json", "2026-11-02_1405_repo-main_bbbbbbb-2.bundle", "fremd.bundle"]);
  assert.equal(u.anzahl, 3); assert.equal(u.je["repo-main"], 2);
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
  const ok = JSON.stringify({ tabellen: [{ schema: "public", tabelle: "t" }], regeln: [], funktionen: ["create function f() … 'Bearer abcdefghijklmnopqrstuvwxyz0123' …"], eingespielt: ["0001.sql"] });
  const r = aufbauPruefen(ok);
  assert.ok(r.gefiltert); assert.ok(!r.text.includes("abcdefghijklmnopqrstuvwxyz0123"));
  assert.doesNotThrow(() => JSON.parse(r.text));
  assert.throws(() => aufbauPruefen(JSON.stringify({ tabellen: [], db_url: "postgres://…" })), /unerwartete Form/);
  assert.throws(() => aufbauPruefen("[1,2]"), /unerwartete Form/);
  assert.throws(() => aufbauPruefen("kein json"), /kein gültiges JSON/);
});

test("Artefakt „datenbank-aufbau“: nur genau dieses, Größe begrenzt, nur die erwartete Datei", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs-art-"));
  const aufrufe = [];
  const sh = (groessen, datei = "datenbank-aufbau.json") => async (b, args) => {
    aufrufe.push(args);
    if (args[0] === "api") return { stdout: JSON.stringify(groessen) };
    await writeFile(path.join(args[args.indexOf("--dir") + 1], datei), "{\"tabellen\":[]}");
    return { stdout: "" };
  };
  try {
    assert.equal(await aufbauArtefakt({ sh: sh([]), repo: "o/r", lauf: "123", ordner: dir }), null);   // öffentliches Repo / alter Ablauf
    await assert.rejects(aufbauArtefakt({ sh: sh([999999999]), repo: "o/r", lauf: "123", ordner: dir }), /zu groß/);
    assert.equal(await aufbauArtefakt({ sh: sh([20]), repo: "o/r", lauf: "123", ordner: dir }), "{\"tabellen\":[]}");
    assert.deepEqual(aufrufe.at(-1).slice(0, 6), ["run", "download", "123", "--repo", "o/r", "--name"]);
    const d2 = await mkdtemp(path.join(os.tmpdir(), "cs-art2-"));
    await assert.rejects(aufbauArtefakt({ sh: sh([20], "anders.json"), repo: "o/r", lauf: "123", ordner: d2 }), /Unerwarteter Inhalt/);
    await rm(d2, { recursive: true, force: true });
    await assert.rejects(aufbauArtefakt({ sh: sh([20]), repo: "o/r; rm", lauf: "123", ordner: dir }), /Ungültiger Lauf/);
    await assert.rejects(aufbauArtefakt({ sh: sh([20]), repo: "o/r", lauf: "12 3", ordner: dir }), /Ungültiger Lauf/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Ablauf „Datenbank“: Aufbau als Artefakt nur bei privaten Repositories, 7 Tage, ohne Verbindungsadresse", async () => {
  const y = await readFile(new URL("../vorlagen/_datenbank/datenbank.yml", import.meta.url), "utf8");
  assert.match(y, /github\.event\.repository\.private/);
  assert.match(y, /retention-days: 7/);
  assert.match(y, /name: datenbank-aufbau/);
  assert.match(y, /select aufbau from codeschmiede\.sicherungen order by id desc limit 1/);
  assert.ok(!/DB_URL[^\n]*sicherung\//.test(y));
});

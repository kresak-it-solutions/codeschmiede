// Arbeitsplatz für alle Arten, Stufe 1 (0059) – reine Funktionen der Oberfläche (web/src/bausteine/arbeitsplatz.js) und Einbau im Dienst.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zieleVon, zieleAusArt, standardTyp, pruefwegVon, pruefwegFehler, punktStatus, punkteMitStatus, featureStatus, verlaufEintraege, diffZeilen, TECHNIK_EMPFEHLUNG, ZIEL_REIHE } from "../../../web/src/bausteine/arbeitsplatz.js";

test("Ziele: aus der Art vorbelegt, gespeicherte gefiltert und in fester Reihenfolge", () => {
  assert.deepEqual(zieleAusArt("programm"), ["windows", "mac"]);
  assert.deepEqual(zieleAusArt(undefined), ["web"]);
  assert.deepEqual(zieleVon({ technik_art: "werkzeug", ziele: [] }), ["cloud_lauf"]);
  assert.deepEqual(zieleVon({ technik_art: "web", ziele: ["windows", "ios", "web", "web"] }), ["web", "windows"]);
  assert.deepEqual(zieleVon({ technik_art: "handy", ziele: null }), ["handy_pwa"]);
});

test("Prüfweg: Typ seite liest vorschau_pfad, Standard-Typ nach Ziel", () => {
  assert.equal(standardTyp(["windows"]), "fenster"); assert.equal(standardTyp(["pdf"]), "kapitel"); assert.equal(standardTyp(["cloud_lauf"]), "befehl"); assert.equal(standardTyp(["web"]), "seite");
  assert.deepEqual(pruefwegVon({ vorschau_pfad: "/calendar" }, { technik_art: "web" }), { typ: "seite", text: "/calendar", gesetzt: true });
  assert.deepEqual(pruefwegVon({ pruefweg_typ: "fenster", pruefweg_text: "Hauptfenster › Pläne" }, { technik_art: "web" }), { typ: "fenster", text: "Hauptfenster › Pläne", gesetzt: true });
  assert.deepEqual(pruefwegVon({ vorschau_pfad: "/x" }, { technik_art: "programm" }), { typ: "fenster", text: "", gesetzt: false });
  assert.deepEqual(pruefwegVon({ pruefweg_typ: "seite", vorschau_pfad: "/a" }, { technik_art: "programm" }), { typ: "seite", text: "/a", gesetzt: true });
});

test("Prüfweg: gleiche Regeln wie die Datenbank", () => {
  assert.equal(pruefwegFehler("seite", ""), null);
  assert.equal(pruefwegFehler("seite", "/platform-admin?m=vereine"), null);
  for (const p of ["calendar", "/../x", "//x", "/spieler/123", "/x/abcdefghijklmnopqrstuvwxyz"]) assert.ok(pruefwegFehler("seite", p), p);
  assert.equal(pruefwegFehler("fenster", "Hauptfenster › Pläne"), null);
  assert.ok(pruefwegFehler("fenster", "  "));
  assert.ok(pruefwegFehler("befehl", "a".repeat(201)));
  assert.ok(pruefwegFehler("kapitel", "Kapitel\u202e3"));
  assert.ok(pruefwegFehler("knopf", "x"));
});

test("Punkt-Status aus verknüpften Aufträgen", () => {
  const S = [{ aufgabe_id: 1, auftrag_id: 10 }, { aufgabe_id: 2, auftrag_id: 11 }, { aufgabe_id: 3, auftrag_id: 12 }, { aufgabe_id: 5, auftrag_id: null }];
  const A = [{ id: 10, stand: "laeuft" }, { id: 11, stand: "wissen" }, { id: 12, stand: "abgebrochen" }];
  assert.equal(punktStatus({ id: 1, status: "arbeit" }, S, A).status, "laeuft");
  assert.equal(punktStatus({ id: 1, status: "arbeit" }, S, A).auftrag.id, 10);
  assert.equal(punktStatus({ id: 2, status: "arbeit" }, S, A).status, "erledigt");
  assert.equal(punktStatus({ id: 3, status: "offen" }, S, A).status, "offen");         // abgebrochen zählt nicht
  assert.equal(punktStatus({ id: 4, status: "arbeit" }, S, A).status, "laeuft");       // von Hand „in Arbeit“
  assert.equal(punktStatus({ id: 5, status: "erledigt" }, S, A).status, "erledigt");
  // Freigabe, Prüfung usw. gelten als „läuft“, bis der Auftrag live bzw. erledigt ist
  assert.equal(punktStatus({ id: 1, status: "arbeit" }, S, [{ id: 10, stand: "freigabe" }]).status, "laeuft");
  const liste = punkteMitStatus([{ id: 2, feature_id: "F", status: "arbeit" }, { id: 6, feature_id: "F", status: "offen" }, { id: 1, feature_id: "F", status: "arbeit" }, { id: 9, feature_id: "G", status: "offen" }], "F", S, A);
  assert.deepEqual(liste.map((x) => [x.id, x.status]), [[1, "laeuft"], [6, "offen"], [2, "erledigt"]]);
});

test("Status-Punkt im Baum", () => {
  const f = { id: "F-1", stand: "test" };
  assert.equal(featureStatus(f, [{ feature_id: "F-1", stand: "laeuft" }], [{ feature_id: "F-1", status: "offen" }]), "laeuft");
  assert.equal(featureStatus(f, [{ feature_id: "F-2", stand: "laeuft" }], [{ feature_id: "F-1", status: "offen" }]), "offen");
  assert.equal(featureStatus(f, [], [{ feature_id: "F-1", status: "erledigt" }]), "fertig");
  assert.equal(featureStatus({ id: "F-1", stand: "live" }, [], []), "fertig");
  assert.equal(featureStatus(f, [], []), "leer");
});

test("Verlauf: Aufträge und Live mit Zeit, neueste zuerst", () => {
  const A = [
    { id: 12, feature_id: "F", titel: "Räume aus PDF", stand: "wissen", erstellt: "2026-11-02T09:00:00Z", geaendert: "2026-11-02T10:00:00Z", live_commit: "c".repeat(40) },
    { id: 14, feature_id: "F", titel: "Maßstab", stand: "laeuft", erstellt: "2026-11-02T11:52:00Z" },
    { id: 15, feature_id: "X", titel: "anderes", stand: "laeuft", erstellt: "2026-11-02T12:00:00Z" },
  ];
  const V = [{ commit_sha: "c".repeat(40), geschaltet: "2026-11-02T11:20:00Z" }];
  const v = verlaufEintraege(A, "F", V);
  assert.deepEqual(v.map((e) => [e.art, e.auftrag, e.zeit]), [["auftrag", 14, "2026-11-02T11:52:00Z"], ["live", 12, "2026-11-02T11:20:00Z"], ["auftrag", 12, "2026-11-02T09:00:00Z"]]);
  assert.match(v[0].text, /in Arbeit/);
});

test("Diff-Zeilen für die Anzeige", () => {
  assert.deepEqual(diffZeilen("@@ -1 +1 @@\n-alt\n+neu\n gleich").map((z) => z.art), ["abschnitt", "del", "add", ""]);
  assert.deepEqual(diffZeilen(null), []);
});

test("Technik-Empfehlung: Tauri ist Vorschlag für Windows/Mac, .NET nur Sonderfall, alle Ziele bekannt", () => {
  const win = TECHNIK_EMPFEHLUNG.find((x) => x.vorschlag);
  assert.match(win.technik, /Tauri/); assert.deepEqual(win.ziele, ["windows", "mac"]);
  assert.ok(TECHNIK_EMPFEHLUNG.find((x) => /\.NET/.test(x.technik)).sonderfall);
  for (const e of TECHNIK_EMPFEHLUNG) for (const z of e.ziele) assert.ok(ZIEL_REIHE.includes(z), z);
  assert.equal(TECHNIK_EMPFEHLUNG.length, 7);
});

test("Dienst: Code live nur lesend, ohne Sperren, im finally beendet", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  assert.match(await readFile(new URL("../lib/codeLive.mjs", import.meta.url), "utf8"), /GIT_OPTIONAL_LOCKS: "0"/);
  assert.match(s, /if \(codeLiveStopp\) await codeLiveStopp\(\)/);
  assert.match(s, /ws_code_live_ende/);
  const lib = await readFile(new URL("../lib/codeLive.mjs", import.meta.url), "utf8");
  assert.match(lib, /"--no-ext-diff", "--no-textconv"/);
  assert.doesNotMatch(lib, /child_process|spawn\(/, "die Bibliothek startet selbst keine Programme");
  // Sicherheitsprüfung 02.11.2026: fest --git-dir/--work-tree, Untermodule nie, Abschalten bei verdächtiger Einstellung
  assert.match(s, /`--git-dir=\$\{gitDir\}`/);
  assert.match(s, /GitVerdaechtig\) await abschalten/);
  assert.match(lib, /"--ignore-submodules=all"/);
  assert.match(lib, /core\.attributesFile=/);
  // Nachprüfung N1: jeder Code-live-git-Aufruf ohne globale/System-Konfiguration und System-Attribute
  assert.match(s, /env: codeLiveUmgebung\(\)/);
  assert.match(lib, /GIT_CONFIG_GLOBAL: NULL_GERAET, GIT_CONFIG_NOSYSTEM: "1", GIT_ATTR_NOSYSTEM: "1"/);
});

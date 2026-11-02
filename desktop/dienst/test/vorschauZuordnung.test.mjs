// Live-Vorschau: links folgt der Chat der Seite (0.13.2, Entwurf freigegeben von Gerhard 02.11.2026) – Claude
// Reine Zuordnung Pfad → Feature und Vorschlag (web/src/bausteine/vorschauZuordnung.js, ohne Abhängigkeiten).
import test from "node:test";
import assert from "node:assert/strict";
import { pfadNorm, passendeFeatures, pfadBegriffe, vorschlag, zuordnung, aehnlich, seitenFilter } from "../../../web/src/bausteine/vorschauZuordnung.js";

const G = [{ id: "planung", app_key: "calendar" }, { id: "kader", app_key: "roster" }, { id: "kommunikation", app_key: "chat" }, { id: "home", app_key: "home" }];
const F = [
  { id: "F-009", name: "Startseite Trainer", gruppe_id: "home", vorschau_pfad: "/home" },
  { id: "F-010", name: "Startseite Admin", gruppe_id: "home", vorschau_pfad: "/home" },
  { id: "F-005", name: "Kachel-Übersicht", gruppe_id: "planung", vorschau_pfad: "/home" },
  { id: "F-020", name: "Termine", gruppe_id: "planung", vorschau_pfad: "/calendar" },
  { id: "F-030", name: "Kader", gruppe_id: "kader", vorschau_pfad: "/squad" },
  { id: "F-040", name: "Kantine", gruppe_id: "kommunikation", vorschau_pfad: null },
  { id: "F-041", name: "Chat-Kanäle", gruppe_id: "kommunikation", vorschau_pfad: null },
  { id: "F-153", name: "Vereine verwalten", gruppe_id: "kader", vorschau_pfad: "/platform-admin?m=vereine" },
  { id: "F-154", name: "Preise", gruppe_id: "kader", vorschau_pfad: "/platform-admin?m=preise" },
  { id: "F-099", name: "Alt", gruppe_id: "planung", vorschau_pfad: "/alt", ausgebaut: true },
  { id: "F-098", name: "Versteckt", gruppe_id: "planung", vorschau_pfad: "/versteckt", ausgeblendet: true },
  { id: "F-500", name: "Geheim", gruppe_id: "fremd", vorschau_pfad: "/geheim" },
];

test("Pfad vergleichbar: Groß/Klein, Schrägstrich am Ende, cs=1, Abfrage sortiert", () => {
  assert.equal(pfadNorm("/Calendar/"), "/calendar");
  assert.equal(pfadNorm("/"), "/");
  assert.equal(pfadNorm("/home?cs=1"), "/home");
  assert.equal(pfadNorm("/x?b=2&cs=1&a=1"), "/x?a=1&b=2");
  assert.equal(pfadNorm("home"), null);
  assert.equal(pfadNorm(null), null);
});

test("Passende Features: zuerst genau mit Abfrage, sonst gemerkte Seite ohne Abfrage", () => {
  assert.deepEqual(passendeFeatures("/platform-admin?m=vereine", F).map((f) => f.id), ["F-153"]);
  assert.deepEqual(passendeFeatures("/platform-admin", F).map((f) => f.id), []);
  assert.deepEqual(passendeFeatures("/calendar?ansicht=woche", F).map((f) => f.id), ["F-020"]);
  assert.deepEqual(passendeFeatures("/Calendar/", F).map((f) => f.id), ["F-020"]);
});

test("Ein Feature gemerkt → Wechsel; schon gewählt → gleich (eigener Startpfad löst nichts aus)", () => {
  const z = zuordnung({ pfad: "/calendar", features: F, gruppen: G, gruppeId: "kader", featureId: null });
  assert.equal(z.art, "wechsel"); assert.equal(z.feature.id, "F-020");
  assert.equal(zuordnung({ pfad: "/calendar", features: F, gruppen: G, gruppeId: "planung", featureId: "F-020" }).art, "gleich");
  assert.equal(zuordnung({ pfad: "/home", features: F, gruppen: G, gruppeId: "home", featureId: "F-010" }).art, "gleich");
});

test("Mehrere passen: gewählte Gruppe gewinnt, sonst Auswahl (gewählte Gruppe zuerst)", () => {
  const z1 = zuordnung({ pfad: "/home", features: F, gruppen: G, gruppeId: "planung" });
  assert.equal(z1.art, "wechsel"); assert.equal(z1.feature.id, "F-005");
  const z2 = zuordnung({ pfad: "/home", features: F, gruppen: G, gruppeId: "home" });
  assert.equal(z2.art, "auswahl"); assert.deepEqual(z2.kandidaten.map((f) => f.id), ["F-010", "F-009", "F-005"]);
  const z3 = zuordnung({ pfad: "/home", features: F, gruppen: G, gruppeId: "kader" });
  assert.equal(z3.art, "auswahl"); assert.equal(z3.kandidaten.length, 3);
});

test("Rechte: nur Gruppen mit Auftragsrecht; ausgebaute und ausgeblendete Features zählen nicht", () => {
  const ohneHome = G.filter((g) => g.id !== "home");
  const z = zuordnung({ pfad: "/home", features: F, gruppen: ohneHome, gruppeId: null });
  assert.equal(z.art, "wechsel"); assert.equal(z.feature.id, "F-005");
  assert.equal(zuordnung({ pfad: "/geheim", features: F, gruppen: G }).art, "fremd");
  const alt = zuordnung({ pfad: "/alt", features: F, gruppen: G });
  assert.equal(alt.art, "vorschlag"); assert.ok(!alt.auswahl.some((f) => f.ausgebaut || f.ausgeblendet || f.gruppe_id === "fremd"));
  assert.equal(zuordnung({ pfad: "/x", features: F, gruppen: [] }).art, "keine");
  assert.equal(zuordnung({ pfad: "kein-pfad", features: F, gruppen: G }).art, "keine");
});

test("Nichts gemerkt → Vorschlag nach Name oder Kennung zum letzten Pfadteil, Auswahl mit allen erlaubten Features", () => {
  const z = zuordnung({ pfad: "/kantine", features: F, gruppen: G, gruppeId: "home" });
  assert.equal(z.art, "vorschlag"); assert.equal(z.vorschlag.id, "F-040");
  assert.equal(z.auswahl.length, F.filter((f) => !f.ausgebaut && !f.ausgeblendet && f.gruppe_id !== "fremd").length);
  assert.equal(zuordnung({ pfad: "/features/f-041", features: F, gruppen: G }).vorschlag.id, "F-041");   // Kennung
  assert.equal(zuordnung({ pfad: "/termine", features: F, gruppen: G }).vorschlag.id, "F-020");          // Name, auch wenn schon andere Seite
  assert.equal(zuordnung({ pfad: "/vereine-verwalten", features: F, gruppen: G }).vorschlag.id, "F-153");
});

test("Nur eine Gruppe passt (Menüpunkt), aber kein Feature → nie die ganze Gruppe, sondern ein Feature als Vorschlag", () => {
  const z = zuordnung({ pfad: "/chat", features: F, gruppen: G, gruppeId: "home" });
  assert.equal(z.art, "vorschlag"); assert.ok(z.vorschlag); assert.equal(z.vorschlag.gruppe_id, "kommunikation");
  assert.equal(z.vorschlag.id, "F-041");
});

test("Kein guter Treffer → kein Vorschlag, aber Auswahl bleibt", () => {
  const v = vorschlag("/qqqq", F.filter((f) => f.gruppe_id === "planung"), { gruppen: G });
  assert.equal(v.feature, null); assert.ok(v.liste.length > 0);
  const z = zuordnung({ pfad: "/qqqq", features: F, gruppen: G });
  assert.equal(z.art, "vorschlag"); assert.equal(z.vorschlag, null); assert.ok(z.auswahl.length > 0);
});

test("Suchbegriffe und Ähnlichkeit", () => {
  assert.deepEqual(pfadBegriffe("/platform-admin?m=vereine"), ["platformadmin", "vereine"]);
  assert.deepEqual(pfadBegriffe("/Übungen/"), ["uebungen"]);
  assert.deepEqual(pfadBegriffe("/"), []);
  assert.equal(aehnlich("kader", "kader"), 1);
  assert.ok(aehnlich("training", "trainings") > 0.8);
  assert.equal(aehnlich("", "x"), 0);
});

test("Gleichstand: Feature der gewählten Gruppe zuerst", () => {
  const zwei = [{ id: "A-1", name: "Liste", gruppe_id: "a" }, { id: "B-1", name: "Liste", gruppe_id: "b" }];
  assert.equal(vorschlag("/liste", zwei, { aktuelleGruppe: "b" }).feature.id, "B-1");
  assert.equal(vorschlag("/liste", zwei, { aktuelleGruppe: "a" }).feature.id, "A-1");
});

test("Nur angeklickte Seitenwechsel folgen: erste Meldung je Laden des Rahmens zählt nicht", () => {
  const fl = seitenFilter();
  fl.geladen();
  assert.equal(fl.folgen("/home"), false);        // erstes Laden: Startseite
  assert.equal(fl.folgen("/calendar"), true);     // angeklickt
  assert.equal(fl.folgen("/squad"), true);
  fl.geladen();                                   // „Neu laden“, Gerätewechsel, „Zurück zur Feature-Seite“ …
  assert.equal(fl.folgen("/home"), false);
  assert.equal(fl.folgen("/home?tab=x"), true);
  fl.geladen(); fl.geladen();                     // doppeltes onLoad: trotzdem nur eine Meldung verschluckt
  assert.equal(fl.folgen("/a"), false);
  assert.equal(fl.folgen("/b"), true);
  const neu = seitenFilter();                     // auch ohne geladen() ist die erste Meldung die geladene Seite
  assert.equal(neu.folgen("kein-pfad"), false);   // ungültig zählt nicht als erste Meldung
  assert.equal(neu.folgen("/home"), false);
  assert.equal(neu.folgen("/x"), true);
});

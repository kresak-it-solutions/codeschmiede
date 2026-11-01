// Logik-Paket November 2026 (Befunde L1–L10 vom 01.11.2026, docs/BEFUNDE-2026-11-01.md)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stationNachFehler, stationFaellig, STATION_VERSUCHE } from "../lib/station.mjs";
import { waehleModell } from "../lib/modell.mjs";
import { pruefLaeufe } from "../lib/live.mjs";

const QUELLE = readFileSync(new URL("../index.mjs", import.meta.url), "utf8");
const JETZT = Date.parse("2026-11-01T22:00:00Z");

test("L1: Pause 1 → 5 → 30 Minuten, danach angehalten; gemerkte Prüfung bleibt", () => {
  let p = {};
  const pausen = [];
  for (let i = 0; i < STATION_VERSUCHE; i++) {
    p = stationNachFehler({ ...p, gepr_sha: "a".repeat(40), gepr_ki: "claude/opus" }, "gh pr merge scheiterte", JETZT);
    assert.equal(p.ergebnis, "fehler");
    pausen.push((Date.parse(p.naechster) - JETZT) / 60000);
    assert.equal(stationFaellig(p, JETZT), false);
    assert.equal(stationFaellig(p, Date.parse(p.naechster) + 1), true);
  }
  assert.deepEqual(pausen, [1, 5, 30]);
  p = stationNachFehler(p, "immer noch", JETZT);
  assert.equal(p.ergebnis, "angehalten");
  assert.equal(p.versuche, STATION_VERSUCHE + 1);
  assert.equal(p.gepr_sha, "a".repeat(40));
  assert.equal(stationFaellig(p, JETZT + 10 * 24 * 3600 * 1000), false);
});

test("L1/L5: laufende Station blockiert, nach 90 Minuten nicht mehr; ohne Eintrag fällig", () => {
  assert.equal(stationFaellig(null), true);
  assert.equal(stationFaellig({ ergebnis: "laeuft", zeit: new Date(JETZT - 60 * 1000).toISOString() }, JETZT), false);
  assert.equal(stationFaellig({ ergebnis: "laeuft", zeit: new Date(JETZT - 91 * 60 * 1000).toISOString() }, JETZT), true);
  assert.equal(stationFaellig({ ergebnis: "wartet" }, JETZT), true);
  assert.match(QUELLE, /Befund L5/);
});

test("L1: gleicher Stand wird nicht noch einmal geprüft", () => {
  assert.match(QUELLE, /a\.pruefung\?\.\[art\]\?\.gepr_sha === sha/);
});

test("L2: alle Prüfläufe auf GitHub sind ein Tor (Checks und Status)", async () => {
  const aufrufe = [];
  const sh = async (_b, args) => {
    aufrufe.push(args.join(" "));
    if (args.some((a) => a.includes("/check-runs"))) return { stdout: "Prüfung\tcompleted\tsuccess\nweb\tin_progress\t\n" };
    return { stdout: "ci/alt\tfailure\n" };
  };
  const l = await pruefLaeufe(sh, "kresak-it-solutions/codeschmiede", "b".repeat(40));
  assert.deepEqual(l.map((x) => [x.name, x.status, x.ergebnis]), [["Prüfung", "completed", "success"], ["web", "in_progress", ""], ["ci/alt", "completed", "failure"]]);
  assert.ok(aufrufe[0].includes("--paginate"));
  await assert.rejects(() => pruefLaeufe(sh, "a b", "b".repeat(40)));
  await assert.rejects(() => pruefLaeufe(sh, "x/y", "kein-sha"));
  assert.match(QUELLE, /const tore = await pruefTore\(projekt, sha, a\.id\);/);
  assert.match(QUELLE, /const tor2 = await pruefTore\(projekt, sha, a\.id, \{ warten: false \}\);\s*\n.*\n\s*await sh\("gh", \["pr", "merge"/);
});

test("L6: Modell nach Risikostufe statt Gruppenname", () => {
  assert.equal(waehleModell({ art: "aendern", titel: "Neue Filter für Kinder-Mannschaften" }), "sonnet");
  assert.equal(waehleModell({ art: "aendern", titel: "Neue Filter" }, { gruppenName: "Anmeldung & Rechte" }), "sonnet");
  assert.equal(waehleModell({ art: "aendern", titel: "Farbe", text: "Risikostufe: HOCH – Design 2.0 Umbau" }), "opus");
  assert.equal(waehleModell({ art: "aendern", titel: "Rechte", text: "Risikostufe: KLEIN" }), "haiku");
  assert.equal(waehleModell({ art: "aendern", titel: "x", text: "Risikostufe: HOCH" }, { abo: "klein" }), "sonnet");
  assert.equal(waehleModell({ art: "aendern", titel: "Farbe der Knöpfe auf Design 2.0 umstellen" }), "opus");
  assert.match(QUELLE, /art === "feature" && \(await aboLage\(\)\) === "klein" \? "sonnet" : "opus"/);
});

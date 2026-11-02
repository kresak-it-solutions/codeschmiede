// Nachprüfung 0.13.1 (GRÜN mit Hinweisen, 02.11.2026): Punkte 1–3 – Claude
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { releaseWahl, tagImLive, vergleichsZweig } from "../lib/setup.mjs";

const quelle = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
const teil = (von, bis) => quelle.slice(quelle.indexOf(von), quelle.indexOf(bis, quelle.indexOf(von)));

test("1: Zuständigkeit nicht lesbar oder nicht eingestellt → warten, kein Standard (außer Programmieren)", async () => {
  const k = teil("async function kiReihe", "// Projektwissen als TEXT");
  assert.ok(!k.includes("reiheFuer(aufgabe, null)"), "kein Ausweichen auf den Standard");
  assert.ok(k.includes('if (error) return { reihe: [], ab: 90, fehlt: "KI-Zuständigkeit nicht lesbar, wartet" };'));
  assert.ok(k.includes("if (!data) return { reihe: [], ab: 90, fehlt: zustaendigkeitFehlt(aufgabe) };"));
  assert.ok(k.includes('if (aufgabe === "bauen") return { reihe: reiheFuer("bauen", null)'), "Programmieren bleibt fest Claude Code");
  // Wirkung nachgebaut: kiReihe mit einer Datenbank-Attrappe ausführen
  const code = k.replace("async function kiReihe", "return async function kiReihe");
  const { reiheFuer } = await import("../lib/ki.mjs");
  const zustaendigkeitFehlt = (a) => `fehlt ${a}`;
  const mitDb = (antwort) => new Function("db", "reiheFuer", "zustaendigkeitFehlt", code)({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => antwort }) }) }) }) }, reiheFuer, zustaendigkeitFehlt);
  assert.deepEqual(await mitDb({ data: null, error: { message: "kaputt" } })("p", "chat"), { reihe: [], ab: 90, fehlt: "KI-Zuständigkeit nicht lesbar, wartet" });
  assert.deepEqual(await mitDb({ data: null, error: null })("p", "chat"), { reihe: [], ab: 90, fehlt: "fehlt chat" });
  assert.deepEqual((await mitDb({ data: { reihe: [{ anbieter: "gemini" }], weitergeben_ab: 80 }, error: null })("p", "chat")).reihe, [{ anbieter: "gemini" }]);
  assert.deepEqual((await mitDb({ data: null, error: { message: "x" } })("p", "bauen")).reihe, [{ anbieter: "claude" }]);
  // Nutzer der Reihe melden „fehlt“ statt etwas anderes zu nehmen
  assert.ok(teil("async function kiAntwort", "// Anfragen heute").includes("if (fehlt) throw new Error(fehlt);"));
  assert.ok(teil("async function station(a)", "// ---------- KI-Anbieter").includes("const text = pFehlt || wartetText(warteGruende);"));
  assert.ok(teil("async function pruefArbeit", "async function markeArbeit").includes("const text = pFehlt || wartetText("));
});

test("2: Logo-Einlesen über die Zuständigkeit „Bilder“, sonst warten", () => {
  const m = teil("async function markeAnbieter", "// ---------- Schleife");
  assert.ok(m.includes('await kiReihe(projektId, "bilder")'));
  assert.ok(m.includes("if (fehlt) return { text: fehlt };") && m.includes("return { text: wartetText(gruende) };"));
  assert.ok(!/claudeOhneWerkzeuge\([^)]*modell: "opus" \}\)/.test(m), "nicht mehr fest Claude Opus");
  assert.ok(m.includes("modell: wahl.e.modell || \"opus\""));
});

test("3: Releases ohne Entwürfe/Vorab-Versionen, nur wenn der Tag im Live-Stand liegt", () => {
  const liste = [{ tag: "programm-v0.14.0", prerelease: true }, { tag: "programm-v0.13.9", draft: true }, { tag: "nightly" }, { tag: "programm-v0.13.1" }];
  assert.equal(releaseWahl(liste).tag, "programm-v0.13.1");
  assert.equal(releaseWahl([{ tag: "programm-v1.0.0", prerelease: true }]), null);
  for (const s of ["behind", "identical", "\"behind\"\n"]) assert.ok(tagImLive(s), s);
  for (const s of ["ahead", "diverged", "", "Not Found"]) assert.ok(!tagImLive(s), s);
  const p = teil("async function setupPflegen", "async function liveArbeit");
  assert.ok(p.includes("select((.draft | not) and (.prerelease | not))") && p.includes("compare/${encodeURIComponent(basis)}...${r.tag}") && p.includes("if (!tagImLive(cmp))"));
  assert.ok(p.includes("for (const st of stroeme) st.destroy();"), "offene Ströme im finally geschlossen");
});

test("3b: ohne Zweig „live“ gegen den Standard-Zweig des Repositorys vergleichen (Codeschmiede: main)", () => {
  assert.equal(vergleichsZweig(true, "main"), "live");
  assert.equal(vergleichsZweig(false, "main\n"), "main");
  assert.equal(vergleichsZweig(false, "\"develop\""), "develop");
  for (const z of ["", "../x", "-x", "a b", "x/"]) assert.equal(vergleichsZweig(false, z), null, z);
  const p = teil("async function setupPflegen", "async function liveArbeit");
  assert.ok(p.includes("repos/${repo}/branches/live") && p.includes('"--jq", ".default_branch"'));
  assert.ok(p.indexOf("vergleichsZweig(liveDa, standard)") < p.indexOf("compare/${encodeURIComponent(basis)}"));
});

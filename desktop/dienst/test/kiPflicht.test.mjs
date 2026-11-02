// Verpflichtende KI-Anbieter (0.13.1, Entscheidung Gerhard 02.11.2026 10:00) – Claude
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stationFaellig } from "../lib/station.mjs";
import { kiZuerst } from "../lib/kachelChat.mjs";

test("Kachel-Wunsch nur innerhalb der Zuständigkeit (nie ein anderer Anbieter)", () => {
  const r = [{ anbieter: "claude", modell: "sonnet" }, { anbieter: "gemini" }];
  assert.deepEqual(kiZuerst(r, "gemini"), [{ anbieter: "gemini" }, { anbieter: "claude", modell: "sonnet" }]);
  assert.deepEqual(kiZuerst(r, "chatgpt"), r, "nicht eingestellter Wunsch wird ignoriert");
});

test("Station wartet auf den eingestellten Anbieter ohne Fehlversuch", () => {
  const jetzt = Date.parse("2026-11-02T10:00:00Z");
  assert.equal(stationFaellig({ ergebnis: "wartet", naechster: "2026-11-02T10:05:00Z" }, jetzt), false);
  assert.equal(stationFaellig({ ergebnis: "wartet", naechster: "2026-11-02T09:55:00Z" }, jetzt), true);
  assert.equal(stationFaellig({ ergebnis: "wartet" }, jetzt), true);
});

test("Werkstatt: kein stilles Ausweichen – Bauen nur Claude, Prüfungen nach Zuständigkeit, Chats mit „wartet auf …“", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  const naechster = s.slice(s.indexOf("async function naechsterAuftrag"), s.indexOf("async function start()"));
  assert.ok(!naechster.includes("ersatzErlaubt(") && naechster.includes("if (geholt) return fuehreAus(geholt);"), "kein Codex-Ersatz beim Programmieren");
  const station = s.slice(s.indexOf("async function station(a)"), s.indexOf("// ---------- KI-Anbieter: wer was übernimmt"));
  assert.ok(station.includes("for (const e of lauf ? [] : pReihe)") && station.includes('ergebnis: "wartet", befund: text, naechster:'));
  assert.ok(!/claudePruefung\(a\.id, ordner, prompt, \{ modell: pModell \}\);\n\s*pruefKi = `claude\/\$\{pModell\}`;\n\s*await db\.from\("ws_verbrauch"\)[^\n]*\n\s*\}\n\s*await log/.test(station), "kein Claude-Rückfall nach den fremden Prüfern");
  const knopf = s.slice(s.indexOf("async function pruefArbeit"), s.indexOf("async function markeArbeit"));
  assert.ok(knopf.includes('const c = pReihe.find((x) => x.anbieter === "claude");') && knopf.includes("if (!c) {"));
  const ki = s.slice(s.indexOf("async function kiAntwort"), s.indexOf("// Anfragen heute je Anbieter"));
  assert.ok(ki.includes("throw new Error(wartetText(fehler"));
});

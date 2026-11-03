// Lange Fragen (0.18.0, Gerhard 03.11.2026 08:11: „Auf Fragen will ich so viel Text schreiben können, wie ich will.“) – Claude
// Mit 150.000 Zeichen kommt die Frage vollständig an – im Prompt und in der Übergabe über die Standardeingabe; Übergröße → klare Meldung.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FRAGE_MAX, PROMPT_MAX, ARG_PROMPT_MAX, zuLang, zuLangMeldung, promptPruefen, freieArgumente, laufFuerTest, OHNE_WERKZEUGE } from "../lib/ki.mjs";
import { assistentPrompt } from "../lib/assistent.mjs";
import { designPrompt } from "../lib/design.mjs";
import { kachelPrompt } from "../lib/kachelChat.mjs";

// 150.000 Zeichen mit Umlauten und Zeilen, Ende eindeutig markiert
const lang = (() => { let s = ""; let i = 0; while (s.length < 149980) s += `Zeile ${i++}: Größe, Übung, Straße – Text\n`; return (s.slice(0, 149980) + "ENDE-DER-FRAGE-XYZ").padEnd(150000, "."); })();

test("Grenzen: eine Konstante je Schicht, gleich wie Oberfläche und Datenbank", async () => {
  assert.equal(FRAGE_MAX, 200000);
  const web = await readFile(new URL("../../../web/src/textGrenze.js", import.meta.url), "utf8");
  assert.match(web, /export const TEXT_MAX = 200000;/);
  const sql = await readFile(new URL("../../../supabase/migrations/0062_ki_global.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.ws_text_max\(\) returns int[\s\S]{0,120}select 200000/);
  assert.ok(lang.length === 150000 && lang.length < FRAGE_MAX && PROMPT_MAX > FRAGE_MAX * 3);
});

test("150.000 Zeichen stehen vollständig im Prompt (Konzept-/Chat, Design, Kachel)", () => {
  const a = assistentPrompt({ projekt: { id: "p", name: "P" }, ort: "konzept", kontext: "", frage: lang });
  assert.ok(a.includes(lang), "Chat/Konzept: ganze Frage");
  const d = designPrompt({ projektName: "P", frage: lang, werte: {} });
  assert.ok(d.includes(lang), "Design-Chat: ganze Frage");
  const k = kachelPrompt({ projektName: "P", frage: `[Kachel k1] ${lang}`, werte: {} });
  assert.ok(k.includes(lang), "Kachel-Chat: ganze Frage");
  for (const p of [a, d, k]) assert.equal(promptPruefen(p), p.length);
});

test("150.000 Zeichen kommen über die Standardeingabe vollständig beim Programm an (Byte für Byte)", async () => {
  const prog = { befehl: process.execPath, vorne: [] };
  const zaehlen = "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const c=require('crypto');console.log(s.length+' '+c.createHash('sha256').update(s).digest('hex'))})";
  const { aus } = await laufFuerTest(prog, ["-e", zaehlen], { cwd: process.cwd(), eingabe: OHNE_WERKZEUGE + lang, env: process.env, minuten: 1 });
  const { createHash } = await import("node:crypto");
  const soll = OHNE_WERKZEUGE + lang;
  assert.equal(aus.trim(), `${soll.length} ${createHash("sha256").update(soll).digest("hex")}`);
});

test("Eigene Anbieter: ohne {prompt} geht die lange Frage über die Standardeingabe; mit {prompt} als Argument klare Meldung statt Kürzen", () => {
  const ohne = freieArgumente({ id: "copilot", name: "Copilot", argumente: ["-s"] }, lang, null);
  assert.equal(ohne.stdin, lang); assert.ok(!ohne.args.some((x) => x.length > 100), "nichts in der Befehlszeile");
  const stdinArt = freieArgumente({ id: "x", name: "X", eingabe: "stdin", argumente: ["-p", "{prompt}"] }, lang, null);
  assert.deepEqual(stdinArt, { args: ["-p"], stdin: lang }, "Übergabe stdin: {prompt} wird nie in die Befehlszeile eingesetzt");
  const kurzOk = freieArgumente({ id: "copilot", name: "Copilot", argumente: ["-p", "{prompt}"] }, "kurz", null);
  assert.deepEqual(kurzOk, { args: ["-p", "kurz"], stdin: null });
  assert.throws(() => freieArgumente({ id: "copilot", name: "Copilot", argumente: ["-p", "{prompt}"] }, "x".repeat(ARG_PROMPT_MAX + 1), null), (e) => e.zuLang && /zu lang für die Übergabe als Argument/.test(e.message) && /nichts gekürzt/.test(e.message));
});

test("Übergröße und Modell-Grenzen: klare Meldung, nie still gekürzt", () => {
  assert.throws(() => promptPruefen("x".repeat(PROMPT_MAX + 1)), (e) => e.zuLang && /nichts gekürzt/.test(e.message));
  for (const t of ["Prompt is too long", "Error: This model's maximum context length is 200000 tokens", "input is too long for requested model", "413 Request Entity Too Large\nrequest too large", "context_length exceeded the limit"]) assert.ok(zuLang(t), t);
  for (const t of ["Alles gut", "Usage limit reached", lang.slice(0, 2000)]) assert.ok(!zuLang(t), t.slice(0, 30));
  assert.match(zuLangMeldung("Claude"), /für Claude zu lang .* nichts gekürzt/);
});

test("Dienst: kiAntwort prüft die Größe vorher und meldet „zu lang“ statt „nicht erreichbar“; Claude-Chat über die Standardeingabe", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  const ki = s.slice(s.indexOf("async function kiAntwort"), s.indexOf("// Anfragen heute je Anbieter"));
  assert.ok(ki.includes("promptPruefen(prompt);") && ki.includes('err?.zuLang || zuLang(t) ? "Frage zu lang für dieses Modell'));
  const cl = s.slice(s.indexOf("async function claudeOhneWerkzeuge"), s.indexOf("async function designChat"));
  assert.ok(cl.includes("kind.stdin.end(prompt);") && !/args = \[[^\]]*prompt[,\]]/.test(cl), "Frage nie als Argument");
  assert.ok(cl.includes('zuLangMeldung("Claude")'));
  for (const f of ["../lib/assistent.mjs", "../lib/design.mjs", "../lib/kachelChat.mjs"]) {
    const q = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(!/kurz\((frage|ohne), \d+\)/.test(q), `${f}: Frage nicht gekürzt`);
  }
});

// ---------- Sicherheitsprüfung 0.18.0 (GELB), Punkte 1–3 und 6–7 ----------
test("Punkt 3: Nachladen gebündelt (300 ms), nur für die angezeigten Aufträge, Log getrennt", async () => {
  const { verzoegert, gehoertZu, NACHLADEN_MS } = await import("../../../web/src/daten/nachladen.js");
  assert.equal(NACHLADEN_MS, 300);
  let n = 0; const f = verzoegert(() => { n++; }, 30);
  for (let i = 0; i < 20; i++) f();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(n, 1, "20 Änderungen kurz hintereinander → einmal laden");
  f(); f.abbrechen(); await new Promise((r) => setTimeout(r, 60)); assert.equal(n, 1, "abbrechen beim Verlassen");
  const m = new Set([5, 7]);
  assert.ok(gehoertZu(m, { new: { auftrag_id: 7 } }) && !gehoertZu(m, { new: { auftrag_id: 9 } }) && gehoertZu(m, { old: { id: 3 } }));
  const q = await readFile(new URL("../../../web/src/daten/werkstattDaten.js", import.meta.url), "utf8");
  const h = q.slice(q.indexOf("export function useAuftragDetails"), q.indexOf("// ---------------- Zu erledigen"));
  assert.ok(h.includes("filter: `auftrag_id=in.(${ids.join(\",\")})`") && h.includes('table: "ws_live_log", ...filter }, (p) => { if (gehoertZu(menge, p)) spaeterLog(); }'));
  assert.ok(!h.includes(", holen)"), "keine Änderung lädt mehr ungefiltert alles");
  const c = await readFile(new URL("../../../web/src/Chat.jsx", import.meta.url), "utf8");
  assert.ok(c.includes('table: "ws_claude_chat", filter: `projekt_id=eq.${d.projektId}` }, spaeter)'));
});

test("Punkte 1, 2, 6, 7 in der Datenbank: Löschen nie still ersetzt, Übergabe stdin als Standard, Weiche in 0057, alte Funktion nur „bauen“", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/0062_ki_global.sql", import.meta.url), "utf8");
  const l = sql.slice(sql.indexOf("create or replace function public.ws_ki_anbieter_loeschen"), sql.indexOf("-- ---------- 7."));
  assert.ok(l.includes("Anbieter ist allein zuständig für % – erst dort umstellen") && !l.includes('[{"anbieter":"claude"}]'), "nie still durch Claude ersetzt");
  assert.ok(sql.includes("alter table public.ws_ki_anbieter add column if not exists eingabe text not null default 'stdin';"));
  assert.ok(sql.includes("(eingabe = 'argument') = public.ws_ki_mit_prompt(argumente)"));
  assert.ok(sql.includes("KI-Zuständigkeiten gelten seit 0.18.0 global für alle Projekte – bitte ws_ki_global_setzen"));
  const w = await readFile(new URL("../../../supabase/migrations/0057_programmier_werkzeug.sql", import.meta.url), "utf8");
  assert.ok(w.includes("if to_regclass('public.ws_ki_zustaendigkeit_global') is null then\n    execute $fassung$"));
  const ui = await readFile(new URL("../../../web/src/KiAnbieter.jsx", import.meta.url), "utf8");
  assert.ok(ui.includes("Der Text steht in der Befehlszeile und ist für andere Programme auf dem PC sichtbar") && ui.includes('eingabe: "stdin",') && !ui.includes("ws_ki_zustaendigkeit_setzen"));
});

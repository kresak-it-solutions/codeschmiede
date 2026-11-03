// KI-Anbindungen global (0.18.0, Meldung Gerhard 03.11.2026, Datenbank 0062) – Claude
// Auflösung global / Projekt / „bauen“ und Warten bei Lesefehlern (verpflichtend, kein Ausweichen).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { globaleReihe, GLOBAL_NICHT_LESBAR, STANDARD, AUFGABEN } from "../lib/ki.mjs";
import { werkzeugWahl } from "../lib/werkzeuge.mjs";

const quelle = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
const teil = (von, bis) => quelle.slice(quelle.indexOf(von), quelle.indexOf(bis, quelle.indexOf(von)));
const ok = (data) => ({ data, error: null });
const fehler = (message) => ({ data: null, error: { message } });

test("globale Reihe: gespeicherte Zeile gilt für jede Aufgabe außer „bauen“", () => {
  const z = { reihe: [{ anbieter: "claude", modell: "sonnet" }, { anbieter: "gemini" }, { anbieter: "chatgpt" }, { anbieter: "copilot" }], weitergeben_ab: 80 };
  for (const a of AUFGABEN.filter((x) => x !== "bauen" && x !== "pruefung")) {
    const r = globaleReihe(a, ok(z));
    assert.equal(r.fehlt, null, a);
    assert.equal(r.ab, 80);
    assert.deepEqual(r.reihe.map((e) => e.anbieter), ["claude", "gemini", "chatgpt", "copilot"], `${a}: alle eingestellten Anbieter, auch eigene`);
  }
  // Prüfungen: eigene Anbieter nie (keine Sandbox für unbekannte Programme) – wie bisher
  assert.deepEqual(globaleReihe("pruefung", ok(z)).reihe.map((e) => e.anbieter), ["claude", "gemini", "chatgpt"]);
  // Programmieren: fest Claude in der Reihe (das Werkzeug löst werkzeugWahl auf), auch ohne oder mit kaputter Zeile
  for (const antwort of [ok(z), fehler("kaputt"), ok(null), null]) assert.deepEqual(globaleReihe("bauen", antwort), { reihe: [{ anbieter: "claude" }], ab: 90, fehlt: null });
});

test("globale Reihe: nicht lesbar oder nicht eingestellt → warten, nie Standard, nie Projektzeile", () => {
  assert.deepEqual(globaleReihe("chat", fehler('relation "public.ws_ki_zustaendigkeit_global" does not exist')), { reihe: [], ab: 90, fehlt: GLOBAL_NICHT_LESBAR });
  assert.deepEqual(globaleReihe("chat", fehler("JWT expired")), { reihe: [], ab: 90, fehlt: GLOBAL_NICHT_LESBAR });
  assert.deepEqual(globaleReihe("konzept", null), { reihe: [], ab: 90, fehlt: GLOBAL_NICHT_LESBAR });
  assert.deepEqual(globaleReihe("design", ok(null), "fehlt design"), { reihe: [], ab: 90, fehlt: "fehlt design" });
  // Leere/ungültige Reihe → leer (die Aufgabe wartet mit „wartet: kein gültiger Anbieter“), kein Claude-Ersatz
  assert.deepEqual(globaleReihe("pruefung", ok({ reihe: [{ anbieter: "copilot" }] })).reihe, []);
  assert.notDeepEqual(globaleReihe("chat", ok(null)).reihe, STANDARD.chat);
});

test("Werkzeug: Projektzeile geht vor, sonst global („wie global“)", () => {
  assert.deepEqual(werkzeugWahl(ok({ werkzeug: "codex", werkzeug_modell: "gpt-5.5-codex" }), ok({ werkzeug: "claude-code" })), { werkzeug: "codex", modell: "gpt-5.5-codex", quelle: "projekt" });
  assert.deepEqual(werkzeugWahl(ok({ werkzeug: "claude-code", werkzeug_modell: null }), ok({ werkzeug: "codex", werkzeug_modell: "x" })), { werkzeug: "claude-code", modell: null, quelle: "projekt" });
  assert.deepEqual(werkzeugWahl(ok(null), ok({ werkzeug: "opencode", werkzeug_modell: "openai/gpt-5" })), { werkzeug: "opencode", modell: "openai/gpt-5", quelle: "global" });
  assert.deepEqual(werkzeugWahl(ok(null), ok({ werkzeug: "claude-code", werkzeug_modell: "opus" })), { werkzeug: "claude-code", modell: null, quelle: "global" }, "Claude Code nie mit festem Modell");
  // Projektzeile vorhanden → globale Antwort egal (auch kaputt)
  assert.equal(werkzeugWahl(ok({ werkzeug: "codex" }), fehler("kaputt")).werkzeug, "codex");
});

test("Werkzeug: Lesefehler, fehlende oder unbekannte Einstellung → warten, kein Claude-Ersatz", () => {
  const w = (p, g) => werkzeugWahl(p, g);
  assert.match(w(fehler("JWT expired"), ok({ werkzeug: "claude-code" })).fehlt, /nicht lesbar, wartet/);
  assert.match(w(null, null).fehlt, /nicht lesbar, wartet/);
  assert.match(w(ok(null), fehler('relation "ws_ki_zustaendigkeit_global" does not exist')).fehlt, /Globales Programmier-Werkzeug nicht lesbar/);
  assert.match(w(ok(null), null).fehlt, /Globales Programmier-Werkzeug nicht lesbar/);
  assert.match(w(ok(null), ok(null)).fehlt, /nicht eingestellt, wartet/);
  assert.match(w(ok({ werkzeug: "cursor" }), ok({ werkzeug: "claude-code" })).fehlt, /unbekannt, wartet/);
  assert.match(w(ok(null), ok({ werkzeug: "unbekannt" })).fehlt, /unbekannt, wartet/);
  for (const r of [w(fehler("x"), null), w(ok(null), null), w(ok(null), ok(null))]) assert.equal(r.werkzeug, undefined);
  // Datenbank vor 0057 (Spalte werkzeug fehlt): wie bisher Claude Code
  assert.equal(w(fehler('column ws_ki_zustaendigkeit.werkzeug does not exist'), null).werkzeug, "claude-code");
});

test("Dienst: projektWerkzeug liest Projektzeile, globale Zeile nur ohne Projektzeile; Fehler → warten", async () => {
  const k = teil("async function projektWerkzeug", "/** „wartet auf …“ beim Auftrag vermerken");
  assert.ok(k.includes("return werkzeugWahl(projekt, global);"));
  const code = k.replace("async function projektWerkzeug", "return async function projektWerkzeug");
  const lauf = async (antworten) => {
    const gefragt = [];
    const db = { from: (t) => ({ select: () => { const q = { eq: () => q, maybeSingle: async () => { gefragt.push(t); const a = antworten[t]; if (a === "wirft") throw new Error("Netz"); return a; } }; return q; } }) };
    const r = await new Function("db", "werkzeugWahl", code)(db, werkzeugWahl)("neu-x");
    return { r, gefragt };
  };
  let x = await lauf({ ws_ki_zustaendigkeit: ok({ werkzeug: "codex", werkzeug_modell: null }), ws_ki_zustaendigkeit_global: ok({ werkzeug: "claude-code" }) });
  assert.equal(x.r.werkzeug, "codex"); assert.deepEqual(x.gefragt, ["ws_ki_zustaendigkeit"], "global wird bei Projektzeile nicht gelesen");
  x = await lauf({ ws_ki_zustaendigkeit: ok(null), ws_ki_zustaendigkeit_global: ok({ werkzeug: "claude-code" }) });
  assert.deepEqual(x.r, { werkzeug: "claude-code", modell: null, quelle: "global" }); assert.deepEqual(x.gefragt, ["ws_ki_zustaendigkeit", "ws_ki_zustaendigkeit_global"]);
  x = await lauf({ ws_ki_zustaendigkeit: ok(null), ws_ki_zustaendigkeit_global: "wirft" });
  assert.match(x.r.fehlt, /nicht lesbar, wartet/);
  x = await lauf({ ws_ki_zustaendigkeit: fehler("kaputt"), ws_ki_zustaendigkeit_global: ok({ werkzeug: "claude-code" }) });
  assert.match(x.r.fehlt, /nicht lesbar, wartet/); assert.deepEqual(x.gefragt, ["ws_ki_zustaendigkeit"], "kein Ausweichen auf global bei Lesefehler der Projektzeile");
  // Aufrufer warten bei „fehlt“
  assert.ok(quelle.includes("if (pw.fehlt) { await wartetAufMelden(a, pw.fehlt); continue; }"));
});

test("Datenbank 0062: globale Tabelle, Startwerte aus Trainer to go, nie überschreiben, nur Admin, Trigger aus 0056 weg", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/0062_ki_global.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("create table if not exists public.ws_ki_zustaendigkeit_global"));
  assert.ok(sql.includes("check (public.ws_ki_reihe_ok(aufgabe, reihe))"));
  assert.ok(sql.includes("z.projekt_id = 'trainer-to-go'") && sql.includes("on conflict (aufgabe) do nothing"));
  assert.ok(sql.includes("if not public.ws_ist_admin() then raise exception 'Die KI-Anbindungen stellt nur der Admin ein'"));
  assert.ok(sql.includes("drop trigger if exists ws_projekte_ki_standard on public.ws_projekte;"));
  assert.ok(sql.includes("revoke all on public.ws_ki_zustaendigkeit_global from public, anon, authenticated;") && sql.includes("grant select on public.ws_ki_zustaendigkeit_global to authenticated;"));
  assert.ok(!/delete from public\.ws_ki_zustaendigkeit where (?!projekt_id = p_projekt and aufgabe = 'bauen')/.test(sql), "alte Projektzeilen werden nicht gelöscht (nur die Werkzeug-Wahl „bauen“ auf Wunsch)");
  for (const f of sql.matchAll(/create or replace function public\.(\w+)\([^)]*\)[^$]*?\$\$/g)) assert.ok(/set search_path = public/.test(f[0]), `${f[1]} mit search_path`);
});

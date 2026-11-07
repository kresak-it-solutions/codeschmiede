// Updates & Freigabe und Abgleich mit main (0.20.0) – Anweisung Gerhard 2026-11-07, Entwurf freigegeben 21:16
import { test } from "node:test";
import assert from "node:assert/strict";
import { prsAus, laufTitel, vonText, planTag, ablaufStarten, freigabeStand } from "../lib/freigabe.mjs";
import { objektLesen, aufbauAus, featureIds } from "../lib/aufbau.mjs";

test("Pull Requests aus Merge- und Squash-Commits", () => {
  const l = prsAus([
    { commit: { message: "Merge pull request #409 from kresak-it-solutions/feature/einwilligung\n\nEinwilligungen je Mannschaft", committer: { date: "2026-11-07T20:00:00Z" } } },
    { commit: { message: "Codeschmiede 0.19.0: Regelwerk erzwingen (#72)\n\nText" } },
    { commit: { message: "Merge pull request #407 from x/fix/sprint\n\nSprinttest immer sichtbar" } },
    { commit: { message: "WIP ohne Nummer" } },
    { commit: { message: "Merge pull request #409 from x/feature/doppelt" } },
  ]);
  assert.deepEqual(l.map((p) => [p.nr, p.art]), [[407, "fix"], [72, "neu"], [409, "neu"]]);
  assert.equal(l[2].titel, "Einwilligungen je Mannschaft");
});

test("Lauftitel und Name: Klammern und Steuerzeichen fallen weg", () => {
  assert.deepEqual(laufTitel("Freigabe planen " + "a".repeat(40) + " (Gerhard Kresak · Codeschmiede)"), { art: "planen", ziel: "a".repeat(40), von: "Gerhard Kresak · Codeschmiede" });
  assert.equal(laufTitel("irgendwas"), null);
  assert.equal(vonText("Ger(h)ard\n$(rm -rf)"), "Gerhard rm -rf · Codeschmiede");
  assert.equal(vonText(null), "Admin · Codeschmiede");
});

test("Plan-Tag: vor 22:00 heute, ab 22:00 morgen (Wien, Winter und Sommer)", () => {
  assert.equal(planTag("2026-11-07T19:00:00Z"), "2026-11-07");   // 20:00 Wien
  assert.equal(planTag("2026-11-07T21:02:00Z"), "2026-11-08");   // 22:02 Wien
  assert.equal(planTag("2026-07-07T19:30:00Z"), "2026-07-07");   // 21:30 Sommerzeit
  assert.equal(planTag("2026-07-07T20:30:00Z"), "2026-07-08");   // 22:30 Sommerzeit
});

test("Ablauf starten: nur erlaubte Arten und Ziele, Argumente ohne Shell", async () => {
  const aufrufe = [];
  const sh = async (b, args) => { aufrufe.push([b, ...args]); if (args[0] === "api") return { stdout: JSON.stringify({ workflow_runs: [{ id: 1, display_title: `Freigabe planen ${"b".repeat(40)} (G · Codeschmiede)`, created_at: new Date().toISOString(), status: "completed", conclusion: "success", html_url: "u" }] }) }; return { stdout: "" }; };
  await assert.rejects(ablaufStarten(sh, "org/repo", { art: "rm", ziel: "x", von: "G" }), /Unbekannte Art/);
  await assert.rejects(ablaufStarten(sh, "org/repo", { art: "zurueck", ziel: "version/../main", von: "G" }), /Ungültige Version/);
  await assert.rejects(ablaufStarten(sh, "org/repo", { art: "freigabe", ziel: "main", von: "G" }), /Ungültiger Stand/);
  await assert.rejects(ablaufStarten(sh, "org/../x", { art: "freigabe", ziel: "a".repeat(40), von: "G" }), /Ungültiges Repository/);
  const r = await ablaufStarten(sh, "org/repo", { art: "planen", ziel: "b".repeat(40), von: "G · Codeschmiede" }, { pause: async () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(aufrufe.find((a) => a[1] === "workflow"), ["gh", "workflow", "run", "freigabe.yml", "--repo", "org/repo", "--ref", "main", "-f", `ziel=${"b".repeat(40)}`, "-f", "art=planen", "-f", "von=G · Codeschmiede"]);
});

test("Freigabe-Stand: wartende PRs, Was ist neu (nur neue Einträge), geplant, zurück nur Vorgänger", async () => {
  const L = "1".repeat(40), M = "2".repeat(40), G = "3".repeat(40), V1 = "4".repeat(40), V2 = "5".repeat(40);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
  const sh = async (_b, args) => {
    const p = args[1]; const jq = args.includes("--jq");
    const out = (v) => ({ stdout: typeof v === "string" ? v : JSON.stringify(v) });
    if (p.endsWith("git/ref/heads/live")) return out(L);
    if (p.endsWith("git/ref/heads/main")) return out(M);
    if (p.endsWith("git/ref/heads/freigabe/geplant")) return out(G);
    if (p.includes("contents/.github/workflows/freigabe.yml")) return out("sha");
    if (p.endsWith(`compare/${L}...${M}`)) return out({ ahead_by: 3, commits: [{ commit: { message: "Merge pull request #5 from o/feature/a\n\nNeu A" } }], files: [{ filename: "supabase/migrations/x.sql" }] });
    if (p.includes("neuigkeiten.json") && p.endsWith(`ref=${M}`)) return out(b64([{ id: "a", titel: "A", text: "x", fuer: ["trainer", "BÖSE rolle"] }, { id: "alt", titel: "Alt" }]));
    if (p.includes("neuigkeiten.json") && p.endsWith(`ref=${L}`)) return out(b64([{ id: "alt", titel: "Alt" }]));
    if (p.includes("actions/workflows/freigabe.yml/runs")) return out({ workflow_runs: [{ display_title: `Freigabe planen ${G} (Gerhard · Plattform)`, created_at: "2026-11-07T19:00:00Z", status: "completed", conclusion: "success" }] });
    if (p.includes("matching-refs/heads/version/")) return out([{ ref: "refs/heads/version/v1.2.0", object: { sha: V1 } }, { ref: "refs/heads/version/v1.3.0", object: { sha: L } }, { ref: "refs/heads/version/v9.0.0", object: { sha: V2 } }]);
    if (p.endsWith(`compare/${V1}...${L}`)) return out("ahead");
    if (p.endsWith(`compare/${V2}...${L}`)) return out("behind");
    throw Object.assign(new Error("HTTP 404"), { stderr: "HTTP 404" });
  };
  const s = await freigabeStand(sh, "org/repo");
  assert.equal(s.ablauf, true);
  assert.deepEqual(s.wartet.map((w) => w.nr), [5]);
  assert.equal(s.datenbank, true);
  assert.deepEqual(s.mitteilungen, [{ id: "a", titel: "A", text: "x", fuer: ["trainer"] }]);
  assert.deepEqual(s.geplant, { sha: G, datum: "2026-11-07", von: "Gerhard · Plattform", am: "2026-11-07T19:00:00Z" });
  assert.deepEqual(s.zurueck, ["version/v1.2.0"]);
  assert.equal(s.live_bez, "v1.3.0");
});

test("Aufbau lesen: echtes Format, Kommentare, Strings als Gruppe; Code wird abgelehnt", () => {
  const q = `// Kopf
export const APP_STRUKTUR = {
  version: 1,
  app: { obergruppen: [ { key: "sport", label: "Sport", gruppen: [ "calendar", { key: "medien", label: 'Social Media' }, /* x */ ] } ] },
  erp: { obergruppen: [ { key: "produkt", label: "Produkt", icon: "Package", gruppen: [ { key: "updates", label: "Updates & Freigabe" } ] } ] },
};
export function nichtGelesen() { return 1; }`;
  const f = { app: { medien: [{ id: "F-450", name: "Grafiken", stunden: 3 }, { id: "N-1", name: "x" }] }, erp: { updates: [{ id: "F-453", name: "Updates" }] } };
  const a = aufbauAus(q, JSON.stringify(f));
  assert.deepEqual(a.app[0].gruppen, [{ key: "calendar", label: null }, { key: "medien", label: "Social Media" }]);
  assert.deepEqual(a.erp[0].gruppen, [{ key: "updates", label: "Updates & Freigabe" }]);
  assert.deepEqual(a.features.app.medien.map((x) => x.id), ["F-450"]);
  assert.deepEqual(featureIds(f).sort(), ["F-450", "F-453"]);
  for (const boese of ["{ a: require('fs') }", "{ a: `x` }", "{ a: process.env }", "{ ['a']: 1 }", "{ a: 1 + 2 }", "{ __proto__: { x: 1 } }", "{ a: [...b] }", "{ a: () => 1 }"]) {
    assert.throws(() => objektLesen(`export const APP_STRUKTUR = ${boese}`), /Aufbau-Datei/, boese);
  }
  assert.throws(() => objektLesen("const X = 1"), /nicht gefunden/);
  const tief = "[".repeat(20) + "]".repeat(20);
  assert.throws(() => objektLesen(`export const APP_STRUKTUR = ${tief}`), /tief/);
});

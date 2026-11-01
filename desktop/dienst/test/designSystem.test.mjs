// App-Designer 3.0 (01.11.2026): Design-System-Paket des Projekts lesen (web/src/designSystem.js) und Kontrast-Wächter auf DS-Tokens (web/src/kontrast.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { designSystemBereinigen, designSystemLesen, tokenWerte, nurAbweichungen, bausteinZuName, begruendungSchluessel } from "../../../web/src/designSystem.js";
import { pruefeDsTokens, farbton } from "../../../web/src/kontrast.js";

const T = (schluessel, hell, dunkel, gruppe = "status", app = null) => ({ schluessel, gruppe, gruppeName: "G", zweck: "z", hell, dunkel, app });
const PAKET = {
  art: "ttg-design-system", version: 1, stand: "Design 2.0", quelle: "abc", verein: { name: "SV Sonnfeld", short: "SVS" },
  rollen: [{ id: "trainer", name: "Trainer" }, { id: "boese", name: "x" }],
  tokens: [T("bg", "#EEF2F8", "#0a0f1c", "flaechen", "--ds-bg"), T("surface", "#ffffff", "#111a2c"), T("text", "#0f172a", "#e8edf6"), T("primary", "#1d4ed8", "#6d9bff", "hauptfarbe", "--primary"),
    T("on-primary", "#ffffff", "#0a0f1c"), T("ok", "#157a3a", "#4ade80"), T("info", "#475569", "#94a3b8"), T("cat-spiel", "#6d28d9", "#a78bfa"), { schluessel: "kaputt", hell: "rot", dunkel: "#000000" }],
  ecken: [{ schluessel: "karte", name: "Karten", wert: 12, min: 8, max: 16 }, { schluessel: "boese", wert: 1 }],
  bausteine: [{ id: "knopf", name: "Knopf", zweck: "Hauptaktion", varianten: ["Knopf · Haupt", 3], komponente: "src/components/ui/button.jsx", verwendet: 306,
    regler: { farben: ["primary", "gibt-es-nicht"], ecken: "knopf", groessen: [40, 44, 48, 999] } },
  { id: "x", name: "Status-Pill", komponente: "../../etc/passwd", regler: {} }],
  navigation: { trainer: { start: "heute", leiste: ["heute", "termine", "<b>"], seitenleiste: [{ gruppe: "Sport", seiten: ["termine"] }] } },
  seiten: { heute: { titel: "Heute", gezeichnet: true, rollen: ["trainer"], route: "/home" }, termine: { titel: "Termine", route: "javascript:alert(1)" }, __proto__: { titel: "x" } },
  begruendungen: { heute_trainer: { heute: "a", andere: "b", vorschlag: "c", warum: "d", annahme: true } },
  pruefungen: { paare: [{ a: "text", b: "surface", soll: 4.5, was: "Text auf Karten" }, { a: "on-primary", b: "primary", soll: 4.5 }, { a: "x", b: "surface", soll: 3 }],
    blauNieStatus: { hauptfarbe: "primary", status: ["ok", "info"], minFarbton: 30, maxSaettigungInfo: 0.35 },
    terminartNichtStatus: { terminarten: ["cat-spiel"], status: ["ok"], minDeltaE: 15 } },
};

test("Paket: streng bereinigt, Unbekanntes fällt weg", () => {
  const d = designSystemBereinigen(PAKET);
  assert.equal(d.tokens.length, 8);
  assert.equal(d.tokens[0].hell, "#eef2f8");
  assert.deepEqual(d.ecken.map((e) => e.schluessel), ["karte"]);
  assert.deepEqual(d.bausteine[0].regler, { farben: ["primary"], ecken: "knopf", groessen: [40, 44, 48] });
  assert.deepEqual(d.bausteine[0].varianten, ["Knopf · Haupt"]);
  assert.equal(d.bausteine[1].komponente, null);
  assert.deepEqual(d.navigation.trainer.leiste, ["heute", "termine"]);
  assert.equal(d.seiten.heute.route, "/home");
  assert.equal(d.seiten.termine.route, null);
  assert.deepEqual(d.rollen.map((r) => r.id), ["trainer"]);
  assert.equal(d.pruefungen.paare.length, 2);
  assert.equal(designSystemBereinigen({ ...PAKET, art: "etwas" }), null);
  assert.equal(designSystemBereinigen({ ...PAKET, tokens: [] }), null);
});

test("Paket: aus der Markdown-Datei mit eingebettetem Entwurf", () => {
  const html = "<!doctype html><html><body>Ä Entwurf</body></html>";
  const b64 = Buffer.from(html, "utf8").toString("base64").replace(/.{1,20}/g, "$&\n");
  const md = `# X\n\n\`\`\`json\n${JSON.stringify(PAKET, null, 1)}\n\`\`\`\n\n\`\`\`entwurf-base64\n${b64}\`\`\`\n`;
  const x = designSystemLesen(md);
  assert.equal(x.html, html);
  assert.equal(x.daten.verein.name, "SV Sonnfeld");
  assert.equal(designSystemLesen("kein Paket"), null);
  const fremd = Buffer.from("<script>x</script>", "utf8").toString("base64");
  assert.equal(designSystemLesen(md.replace(/```entwurf-base64\n[\s\S]+?```/, "```entwurf-base64\n" + fremd + "\n```")).html, null);
});

test("Tokens: Ausgangswert ⊕ geerbt ⊕ eigen, nur Abweichungen speichern", () => {
  const d = designSystemBereinigen(PAKET);
  const w = tokenWerte(d, { hell: { primary: "#c2410c" } }, { dunkel: { primary: "#fb923c" }, ecken: { karte: 10 }, hell: { boese: "#000000" } });
  assert.equal(w.hell.primary, "#c2410c"); assert.equal(w.dunkel.primary, "#fb923c"); assert.equal(w.ecken.karte, 10); assert.equal(w.hell.boese, undefined);
  assert.deepEqual(nurAbweichungen(d, { hell: { primary: "#c2410c" } }, w), { dunkel: { primary: "#fb923c" }, ecken: { karte: 10 } });
  assert.deepEqual(nurAbweichungen(d, {}, tokenWerte(d)), {});
  assert.equal(bausteinZuName(d, "Knopf · Haupt").id, "knopf");
  assert.equal(bausteinZuName(d, "Knopf · Neu").id, "knopf");
  assert.equal(bausteinZuName(d, "Unbekannt"), null);
  assert.equal(begruendungSchluessel("heute", "eltern"), "heute_eltern");
  assert.equal(begruendungSchluessel("heute", "admin"), "uebersicht");
});

test("Kontrast-Wächter: DS-Paare, Blau nie Status, Terminart ≠ Status", () => {
  const d = designSystemBereinigen(PAKET);
  const w = tokenWerte(d);
  const r = pruefeDsTokens(w, d.pruefungen);
  assert.ok(r.filter((x) => x.gruppe === "Kontrast").every((x) => x.ok));
  assert.ok(r.filter((x) => x.gruppe === "Blau nie Status").every((x) => x.ok));     // ok grün, info grau
  const blau = pruefeDsTokens(tokenWerte(d, {}, { hell: { ok: "#2563eb" } }), d.pruefungen);
  assert.ok(blau.some((x) => x.gruppe === "Blau nie Status" && x.a === "ok" && x.modus === "hell" && !x.ok && x.stufe === "pflicht"));
  const lila = pruefeDsTokens(tokenWerte(d, {}, { hell: { "cat-spiel": "#157a3a" } }), d.pruefungen);
  assert.ok(lila.some((x) => x.gruppe === "Terminart ≠ Status" && x.stufe === "hinweis"));
  const schlecht = pruefeDsTokens(tokenWerte(d, {}, { hell: { text: "#dddddd" } }), d.pruefungen).find((x) => x.a === "text" && x.modus === "hell");
  assert.equal(schlecht.ok, false); assert.ok(schlecht.vorschlag);
  assert.equal(farbton("#475569").s < 0.35, true);
});

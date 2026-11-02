// App-Designer 3.0 (Anweisung Gerhard 01.11.2026 22:18/22:38): Design-System-Paket des Projekts lesen und streng prüfen.
// Quelle ist das Projekt selbst (Trainer to go: `node tools/design-system.mjs` erzeugt docs/design-2/DESIGN-SYSTEM.md) – die Codeschmiede
// hat KEINE eigene Kopie von Tokens, Bausteinen oder Seiten. Die Datei kommt über den Projekt-Abgleich der Werkstatt (ws_dokumente),
// genau wie docs/BAUSTEINE.md (verzeichnis.js). Alles hier ist Daten, nie Code: Texte werden nur als Text angezeigt,
// der Entwurf läuft in einem abgeschotteten Rahmen (sandbox="allow-scripts", ohne eigene Herkunft).
// Reine Funktionen ohne Abhängigkeiten (getestet in desktop/dienst/test/designSystem.test.mjs); Laden: designer/useDesignSystem.js.

export const DS_PFAD = "docs/design-2/DESIGN-SYSTEM.md";
const HEX = /^#[0-9a-f]{6}$/i;
const SCHLUESSEL = /^[a-z][a-z0-9-]{0,30}$/;
const SEITE = /^[a-z][a-z0-9_-]{0,40}$/;
const ROUTE = /^(\/[a-z][a-z-]{0,39}){1,3}$/;
const ROLLEN = ["trainer", "eltern", "spieler", "admin", "funktionaer"];
const ECKEN = ["klein", "knopf", "karte", "hauptkarte"];
const VERBOTEN = new Set(["__proto__", "constructor", "prototype"]);

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const text = (v, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");
const zahl = (v, min, max, std) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : std);
const liste = (v, n = 200) => (Array.isArray(v) ? v.slice(0, n) : []);
const eintraege = (o, n = 200) => Object.entries(obj(o) || {}).filter(([k]) => !VERBOTEN.has(k)).slice(0, n);

/** Paket streng bereinigen – Unbekanntes oder Kaputtes fällt weg. Ergebnis null, wenn es kein gültiges Paket ist. */
export function designSystemBereinigen(roh) {
  const d = obj(roh);
  if (!d || d.art !== "ttg-design-system" || d.version !== 1) return null;
  const tokens = liste(d.tokens, 80).map(obj).filter((t) => t && SCHLUESSEL.test(t.schluessel || "") && HEX.test(t.hell || "") && HEX.test(t.dunkel || ""))
    .map((t) => ({ schluessel: t.schluessel, gruppe: SCHLUESSEL.test(t.gruppe || "") ? t.gruppe : "sonstige", gruppeName: text(t.gruppeName, 60) || "Sonstige",
      zweck: text(t.zweck), hell: t.hell.toLowerCase(), dunkel: t.dunkel.toLowerCase(), app: typeof t.app === "string" ? text(t.app, 80) : null }));
  if (!tokens.length) return null;
  const tokenSet = new Set(tokens.map((t) => t.schluessel));
  const ecken = liste(d.ecken, 8).map(obj).filter((e) => e && ECKEN.includes(e.schluessel)).map((e) => {
    const min = zahl(e.min, 0, 32, 0); const max = zahl(e.max, min, 32, 32);
    return { schluessel: e.schluessel, name: text(e.name, 60), wert: zahl(e.wert, min, max, min), min, max, app: typeof e.app === "string" ? text(e.app, 60) : null };
  });
  const regler = (r) => { const x = obj(r) || {}; return {
    farben: liste(x.farben, 12).filter((k) => tokenSet.has(k)),
    ecken: ECKEN.includes(x.ecken) ? x.ecken : null,
    groessen: liste(x.groessen, 4).filter((g) => Number.isInteger(g) && g >= 24 && g <= 64),
  }; };
  const bausteine = liste(d.bausteine, 120).map(obj).filter((b) => b && SCHLUESSEL.test(b.id || "") && typeof b.name === "string").map((b) => ({
    id: b.id, name: text(b.name, 80), zusatz: text(b.zusatz, 200), zweck: text(b.zweck, 600), ersetzt: text(b.ersetzt, 300),
    varianten: liste(b.varianten, 40).filter((v) => typeof v === "string").map((v) => text(v, 80)),
    komponente: typeof b.komponente === "string" && /^src\/[A-Za-z0-9_./-]{1,120}$/.test(b.komponente) ? b.komponente : null,
    verwendet: zahl(b.verwendet, 0, 100000, 0), regler: regler(b.regler),
  }));
  const navigation = {};
  for (const r of ROLLEN) {
    const n = obj(obj(d.navigation)?.[r]); if (!n) continue;
    navigation[r] = { start: SEITE.test(n.start || "") ? n.start : "heute", leiste: liste(n.leiste, 6).filter((s) => SEITE.test(s)),
      seitenleiste: liste(n.seitenleiste, 12).map(obj).filter(Boolean).map((g) => ({ gruppe: text(g.gruppe, 40), seiten: liste(g.seiten, 30).filter((s) => SEITE.test(s)) })) };
  }
  const seiten = {};
  for (const [id, s] of eintraege(d.seiten, 120)) {
    if (!SEITE.test(id) || !obj(s)) continue;
    seiten[id] = { titel: text(s.titel, 60) || id, gezeichnet: !!s.gezeichnet, rollen: liste(s.rollen, 5).filter((r) => ROLLEN.includes(r)),
      route: typeof s.route === "string" && ROUTE.test(s.route) ? s.route : null };
  }
  const begruendungen = {};
  for (const [k, b] of eintraege(d.begruendungen, 200)) {
    if (!SEITE.test(k) || !obj(b)) continue;
    begruendungen[k] = { heute: text(b.heute, 800), andere: text(b.andere, 800), vorschlag: text(b.vorschlag, 800), warum: text(b.warum, 800), annahme: !!b.annahme };
  }
  const p = obj(d.pruefungen) || {};
  const paare = liste(p.paare, 60).map(obj).filter((x) => x && tokenSet.has(x.a) && tokenSet.has(x.b) && Number.isFinite(x.soll))
    .map((x) => ({ a: x.a, b: x.b, soll: Math.min(7, Math.max(1, x.soll)), was: text(x.was, 80) }));
  const bns = obj(p.blauNieStatus);
  const tns = obj(p.terminartNichtStatus);
  return {
    stand: text(d.stand, 40), quelle: text(d.quelle, 40), verein: { name: text(obj(d.verein)?.name, 60), short: text(obj(d.verein)?.short, 8) },
    rollen: liste(d.rollen, 5).map(obj).filter((r) => r && ROLLEN.includes(r.id)).map((r) => ({ id: r.id, name: text(r.name, 30) })),
    tokens, ecken, bausteine,
    weitereBausteine: liste(d.weitereBausteine, 100).filter((v) => typeof v === "string").map((v) => text(v, 80)),
    navigation, seiten,
    termine: liste(d.termine, 20).map(obj).filter((t) => t && /^termin-e\d{1,2}$/.test(t.seite || "")).map((t) => ({ seite: t.seite, titel: text(t.titel, 60), typ: text(t.typ, 20) })),
    begruendungen,
    glossar: liste(d.glossar, 80).map(obj).filter(Boolean).map((g) => ({ verwenden: text(g.verwenden, 200), nicht: text(g.nicht, 200) })),
    pruefungen: {
      paare,
      blauNieStatus: bns && tokenSet.has(bns.hauptfarbe) ? { hauptfarbe: bns.hauptfarbe, status: liste(bns.status, 8).filter((k) => tokenSet.has(k)),
        minFarbton: zahl(bns.minFarbton, 0, 180, 30), maxSaettigungInfo: Number.isFinite(bns.maxSaettigungInfo) ? Math.min(1, Math.max(0, bns.maxSaettigungInfo)) : 0.35 } : null,
      terminartNichtStatus: tns ? { terminarten: liste(tns.terminarten, 8).filter((k) => tokenSet.has(k)), status: liste(tns.status, 8).filter((k) => tokenSet.has(k)),
        minDeltaE: zahl(tns.minDeltaE, 0, 100, 15) } : null,
    },
  };
}

/** Markdown der Projekt-Datei → { daten, html } (html = eingebetteter Entwurf oder null). */
export function designSystemLesen(inhalt) {
  const s = String(inhalt || "");
  const j = /```json\n([\s\S]+?)\n```/.exec(s);
  if (!j) return null;
  let daten = null;
  try { daten = designSystemBereinigen(JSON.parse(j[1])); } catch { return null; }
  if (!daten) return null;
  let html = null;
  const b = /```entwurf-base64\n([A-Za-z0-9+/=\n]+?)```/.exec(s);
  if (b) {
    try {
      const bin = atob(b[1].replace(/\n/g, ""));
      const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (html.length > 1500000 || !/^<!doctype html>/i.test(html)) html = null;
    } catch { html = null; }
  }
  return { daten, html };
}

/** Werte eines Tokens für hell/dunkel: Paket-Ausgangswert ⊕ geerbt ⊕ eigen. */
export function tokenWerte(daten, geerbt = {}, eigen = {}) {
  const r = { hell: {}, dunkel: {}, ecken: {} };
  for (const t of daten.tokens) { r.hell[t.schluessel] = t.hell; r.dunkel[t.schluessel] = t.dunkel; }
  for (const e of daten.ecken) r.ecken[e.schluessel] = e.wert;
  for (const q of [geerbt, eigen]) {
    for (const m of ["hell", "dunkel"]) for (const [k, v] of Object.entries(obj(q?.[m]) || {})) if (k in r[m] && HEX.test(v)) r[m][k] = v.toLowerCase();
    for (const [k, v] of Object.entries(obj(q?.ecken) || {})) if (k in r.ecken && Number.isFinite(v)) r.ecken[k] = v;
  }
  return r;
}

/** Nur speichern, was von der Grundlage (Ausgangswert ⊕ geerbt) abweicht – gleicher Wert = erbt weiter. */
export function nurAbweichungen(daten, geerbt, voll) {
  const g = tokenWerte(daten, geerbt, {});
  const r = {};
  for (const m of ["hell", "dunkel"]) {
    const z = {}; for (const [k, v] of Object.entries(voll?.[m] || {})) if (HEX.test(v) && g[m][k] !== v.toLowerCase()) z[k] = v.toLowerCase();
    if (Object.keys(z).length) r[m] = z;
  }
  const e = {}; for (const [k, v] of Object.entries(voll?.ecken || {})) if (k in g.ecken && Number.isFinite(v) && g.ecken[k] !== v) e[k] = v;
  if (Object.keys(e).length) r.ecken = e;
  return r;
}

/** Baustein zu einem data-ds-Namen (Name oder Variante) – sonst null. */
export function bausteinZuName(daten, name) {
  if (!daten || !name) return null;
  return daten.bausteine.find((b) => b.name === name) || daten.bausteine.find((b) => b.varianten.includes(name))
    || daten.bausteine.find((b) => name.startsWith(`${b.name} · `)) || null;
}

/** Schlüssel der Begründung für eine Entwurf-Seite und Rolle (gleiche Regel wie im Entwurf). */
export function begruendungSchluessel(seite, rolle) {
  if (!seite) return null;
  if (seite === "heute" || seite === "uebersicht") return rolle === "admin" ? "uebersicht" : `heute_${rolle}`;
  return seite;
}

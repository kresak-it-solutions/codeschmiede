// Abgleich mit main (0.20.0, Anweisung Gerhard 2026-11-07, Entwurf freigegeben 21:16): Aufbau einer App aus ihrer Aufbau-Datei lesen.
// Die Datei (z. B. src/lib/appStruktur.js) ist Projekt-Code – sie wird NIE ausgeführt oder importiert (der Admin-PC führt keinen Projekt-Code
// aus). Gelesen wird nur ein Objekt-Literal mit einem kleinen, strengen Leser: Zeichenketten, Zahlen, true/false/null, Namen als Schlüssel,
// { } [ ] : , und Kommentare. Alles andere (Funktionen, Vorlagen-Zeichenketten, Verweise, Rechnungen …) bricht ab.

const MAX = 1024 * 1024;

export function objektLesen(quelle, anker = "APP_STRUKTUR") {
  if (typeof quelle !== "string" || quelle.length > MAX) throw new Error("Aufbau-Datei fehlt oder ist zu groß");
  const m = new RegExp(`export\\s+const\\s+${anker}\\s*=\\s*`).exec(quelle);
  if (!m) throw new Error(`„${anker}“ nicht gefunden`);
  let i = m.index + m[0].length;
  const s = quelle;
  const fehler = (t) => { throw new Error(`Aufbau-Datei: ${t} (Zeichen ${i})`); };
  const leer = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s.startsWith("//", i)) { const e = s.indexOf("\n", i); i = e < 0 ? s.length : e + 1; continue; }
      if (s.startsWith("/*", i)) { const e = s.indexOf("*/", i + 2); if (e < 0) fehler("Kommentar ohne Ende"); i = e + 2; continue; }
      return;
    }
  };
  let tiefe = 0;
  const wert = () => {
    leer();
    const c = s[i];
    if (c === "{") return objekt();
    if (c === "[") return liste();
    if (c === "\"" || c === "'") return zeichenkette();
    if (/[-0-9]/.test(c)) { const z = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/.exec(s.slice(i, i + 30)); if (!z) fehler("Zahl"); i += z[0].length; return Number(z[0]); }
    const w = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i, i + 64));
    if (w && ["true", "false", "null"].includes(w[0])) { i += w[0].length; return w[0] === "true" ? true : w[0] === "false" ? false : null; }
    return fehler("Unerlaubter Ausdruck");
  };
  const zeichenkette = () => {
    const q = s[i++]; let out = "";
    while (i < s.length && s[i] !== q) {
      if (s[i] === "\n") fehler("Zeilenumbruch in Zeichenkette");
      if (s[i] === "\\") {
        const n = s[i + 1];
        const einfach = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", "\"": "\"", "/": "/" };
        if (n in einfach) { out += einfach[n]; i += 2; continue; }
        if (n === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue; }
        fehler("Unbekanntes Escape");
      }
      out += s[i++];
      if (out.length > 4000) fehler("Zeichenkette zu lang");
    }
    if (s[i] !== q) fehler("Zeichenkette ohne Ende");
    i++; return out;
  };
  const schluessel = () => {
    leer();
    if (s[i] === "\"" || s[i] === "'") return zeichenkette();
    const w = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i, i + 64));
    if (!w) fehler("Schlüssel");
    i += w[0].length; return w[0];
  };
  const objekt = () => {
    if (++tiefe > 12) fehler("Zu tief verschachtelt");
    i++; const o = Object.create(null);
    for (;;) {
      leer();
      if (s[i] === "}") { i++; break; }
      const k = schluessel();
      if (k === "__proto__" || k === "constructor" || k === "prototype") fehler("Unerlaubter Schlüssel");
      leer(); if (s[i] !== ":") fehler("„:“ erwartet"); i++;
      o[k] = wert(); leer();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "}") { i++; break; }
      fehler("„,“ oder „}“ erwartet");
    }
    tiefe--; return o;
  };
  const liste = () => {
    if (++tiefe > 12) fehler("Zu tief verschachtelt");
    i++; const l = [];
    for (;;) {
      leer();
      if (s[i] === "]") { i++; break; }
      l.push(wert()); if (l.length > 5000) fehler("Liste zu lang"); leer();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "]") { i++; break; }
      fehler("„,“ oder „]“ erwartet");
    }
    tiefe--; return l;
  };
  return wert();
}

const KEY = /^[a-z0-9-]{1,40}$/;
const text = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Aufbau-Datei + Features-Datei → Form für ws_aufbau_abgleichen. */
export function aufbauAus(strukturQuelle, featuresJson) {
  const st = objektLesen(strukturQuelle);
  const teile = {};
  for (const t of ["app", "erp"]) {
    const og = st?.[t]?.obergruppen;
    if (!Array.isArray(og)) { teile[t] = []; continue; }
    teile[t] = og.filter((o) => o && KEY.test(o.key || "")).slice(0, 40).map((o) => ({
      key: o.key, label: text(o.label, 60),
      gruppen: (Array.isArray(o.gruppen) ? o.gruppen : []).map((g) => (typeof g === "string" ? { key: g, label: null } : { key: g?.key, label: text(g?.label, 80) }))
        .filter((g) => KEY.test(g.key || "")).slice(0, 60),
    }));
  }
  const fj = typeof featuresJson === "string" ? JSON.parse(featuresJson) : featuresJson;
  const features = {};
  for (const t of ["app", "erp"]) {
    features[t] = {};
    const sek = fj?.[t];
    if (!sek || typeof sek !== "object") continue;
    for (const [k, l] of Object.entries(sek)) {
      if (!KEY.test(k) || !Array.isArray(l)) continue;
      features[t][k] = l.filter((f) => /^F-[0-9]{3,5}$/.test(f?.id || "") && text(f?.name, 120)).slice(0, 200).map((f) => ({
        id: f.id, name: text(f.name, 120), beschreibung: text(f.beschreibung, 1000),
        stunden: typeof f.stunden === "number" && f.stunden >= 0 && f.stunden <= 100000 ? f.stunden : null,
        verkauf: text(f.verkauf, 40),
      }));
    }
  }
  return { app: teile.app, erp: teile.erp, features };
}

/** Alle Feature-Nummern einer Features-Datei (für „schon live?“). */
export function featureIds(featuresJson) {
  const fj = typeof featuresJson === "string" ? JSON.parse(featuresJson) : featuresJson;
  const ids = new Set();
  for (const t of ["app", "erp"]) for (const l of Object.values(fj?.[t] || {})) if (Array.isArray(l)) for (const f of l) if (/^F-[0-9]{3,5}$/.test(f?.id || "")) ids.add(f.id);
  return [...ids];
}

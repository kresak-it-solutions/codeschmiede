// Kontrast-Wächter (App-Designer 2.0, Entwurf freigegeben von Gerhard 2026-10-24 22:08; Grundsatz 21:4x „Farben frei mit Kontrast-Wächter“).
// Gemeinsame kleine Bibliothek ohne Abhängigkeiten – genutzt vom Baustein-Inspektor; getestet in desktop/dienst/test/kontrast.test.mjs.
// Regeln nach WCAG 2.1 AA: Text 4,5 : 1, große Schrift und Bedienelemente (Ränder, Symbole) 3 : 1 – immer hell UND dunkel.

export const SOLL = Object.freeze({ text: 4.5, gross: 3, bedien: 3 });
const HEX = /^#[0-9a-f]{6}$/i;
export const istHex = (v) => typeof v === "string" && HEX.test(v);

const kanal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Relative Leuchtdichte (0 = schwarz, 1 = weiß); ungültige Farbe → null. */
export function luminanz(hex) {
  if (!istHex(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((s) => kanal(((n >> s) & 255) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Kontrastverhältnis 1–21; ungültige Farben → 1 (zählt als „nicht lesbar“). */
export function kontrast(a, b) {
  const x = luminanz(a), y = luminanz(b);
  if (x == null || y == null) return 1;
  const [h, d] = x > y ? [x, y] : [y, x];
  return (h + 0.05) / (d + 0.05);
}
/** Anzeige „4,6 : 1“ (deutsches Komma). */
export const verhaeltnis = (k) => `${(Math.floor(k * 10) / 10).toFixed(1).replace(".", ",")} : 1`;

// HSL nur für „lesbar machen“ (Farbton bleibt, nur die Helligkeit wandert)
function zuHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((s) => ((n >> s) & 255) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function ausHsl([h, s, l]) {
  const a = s * Math.min(l, 1 - l);
  const f = (k) => { const t = (k + h / 30) % 12; return l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)); };
  return "#" + [f(0), f(8), f(4)].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

/**
 * Vorschlag „lesbar machen“: verändert NUR die Helligkeit von `farbe` (Farbton und Sättigung bleiben),
 * bis sie auf `hinter` mindestens `soll` erreicht. Wählt die kleinste Änderung (heller oder dunkler).
 * Reicht das nicht, kommt Schwarz oder Weiß – je nachdem, was mehr Kontrast hat. Schon lesbar → unverändert.
 */
export function lesbarMachen(farbe, hinter, soll = SOLL.text) {
  if (!istHex(farbe) || !istHex(hinter)) return istHex(farbe) ? farbe.toLowerCase() : "#000000";
  if (kontrast(farbe, hinter) >= soll) return farbe.toLowerCase();
  const [h, s, l] = zuHsl(farbe);
  let best = null;
  for (const richtung of [-1, 1]) {
    for (let schritt = 1; schritt <= 100; schritt++) {
      const nl = l + richtung * schritt / 100;
      if (nl < 0 || nl > 1) break;
      const c = ausHsl([h, s, nl]);
      if (kontrast(c, hinter) >= soll) { if (!best || schritt < best.schritt) best = { c, schritt }; break; }
    }
  }
  if (best) return best.c;
  return kontrast("#000000", hinter) >= kontrast("#ffffff", hinter) ? "#000000" : "#ffffff";
}

/**
 * Prüft einen Baustein in hell und dunkel.
 * w      = { hell: { bg, text, rand }, dunkel: { bg, text, rand } } (fehlende Werte vorher mit dem Standard füllen)
 * seite  = { hell: "#ffffff", dunkel: "#0a0a0a" } (Hintergrund, auf dem der Baustein steht)
 * art    = { interaktiv: true|false, grosseSchrift: true|false, rahmenPflicht: true|false }
 * Ergebnis: Liste { modus, was, wert, soll, ok, stufe ("pflicht"|"hinweis"), feld, vorschlag }
 */
export function pruefeBaustein(w, seite = { hell: "#ffffff", dunkel: "#0a0a0a" }, art = {}) {
  const out = [];
  for (const modus of ["hell", "dunkel"]) {
    const f = w?.[modus] || {}; const s = seite?.[modus];
    const tSoll = art.grosseSchrift ? SOLL.gross : SOLL.text;
    if (istHex(f.text) && istHex(f.bg)) {
      const k = kontrast(f.text, f.bg);
      out.push({ modus, was: "Text auf Hintergrund", wert: k, soll: tSoll, ok: k >= tSoll, stufe: "pflicht", feld: "text", vorschlag: k >= tSoll ? null : lesbarMachen(f.text, f.bg, tSoll) });
    }
    // Bedienelemente (WCAG 1.4.11): die Form muss sich vom Seitenhintergrund abheben – über Fläche ODER Rand.
    // Pflicht nur, wo die Form das Element erst erkennbar macht (Eingabefelder, Schalter); bei Knöpfen mit Text ein Hinweis.
    if (art.interaktiv && istHex(s)) {
      const kb = istHex(f.bg) ? kontrast(f.bg, s) : 1; const kr = istHex(f.rand) ? kontrast(f.rand, s) : 1;
      const k = Math.max(kb, kr); const ok = k >= SOLL.bedien;
      out.push({ modus, was: "Form hebt sich von der Seite ab", wert: k, soll: SOLL.bedien, ok, stufe: art.rahmenPflicht ? "pflicht" : "hinweis",
        feld: "rand", vorschlag: ok ? null : lesbarMachen(istHex(f.rand) ? f.rand : s, s, SOLL.bedien) });
    }
  }
  return out;
}

/** Kurzfassung für Anzeige/Chat: Zahl der offenen Pflicht-Prüfungen und Hinweise. */
export function zusammenfassung(befunde) {
  return { pflicht: befunde.filter((b) => !b.ok && b.stufe === "pflicht").length, hinweise: befunde.filter((b) => !b.ok && b.stufe !== "pflicht").length };
}

// ---------------------------------------------------------------------------------------------------------------
// App-Designer 3.0 (01.11.2026): Prüfungen auf den DS-Token-Paaren aus dem Design-System-Paket des Projekts
// (Trainer to go: src/design/design-system.json › pruefungen). Paare, Mindestwerte und Regeln kommen aus dem Projekt –
// die Codeschmiede hat keine eigene Liste mehr.

/** Farbton (0–360) und Sättigung (0–1) einer Farbe; Grau → farbton null. */
export function farbton(hex) {
  if (!istHex(hex)) return { h: null, s: 0 };
  const [h, s] = zuHsl(hex);
  return { h: s < 0.06 ? null : h, s };
}
const linear = (hex) => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => kanal(((n >> s) & 255) / 255)); };
function lab(hex) {
  const [r, g, b] = linear(hex);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** Farbabstand ΔE (CIE76). */
export function deltaE(a, b) {
  if (!istHex(a) || !istHex(b)) return 0;
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
const tonAbstand = (a, b) => (a == null || b == null ? 180 : Math.min(Math.abs(a - b), 360 - Math.abs(a - b)));

/**
 * Prüft DS-Tokens hell UND dunkel.
 * werte  = { hell: {token: "#rrggbb"}, dunkel: {…} }   regeln = pruefungen aus dem Design-System-Paket
 * Ergebnis: Liste { modus, gruppe, was, wert, soll, ok, stufe ("pflicht"|"hinweis"), a, b, vorschlag }
 */
export function pruefeDsTokens(werte, regeln) {
  const out = [];
  if (!regeln) return out;
  for (const modus of ["hell", "dunkel"]) {
    const f = werte?.[modus] || {};
    for (const p of regeln.paare || []) {
      if (!istHex(f[p.a]) || !istHex(f[p.b])) continue;
      const k = kontrast(f[p.a], f[p.b]);
      out.push({ modus, gruppe: "Kontrast", was: p.was || `${p.a} auf ${p.b}`, wert: k, soll: p.soll, ok: k >= p.soll, stufe: "pflicht", a: p.a, b: p.b,
        vorschlag: k >= p.soll ? null : lesbarMachen(f[p.a], f[p.b], p.soll) });
    }
    // Blau nie Status (Konzept §4): Statusfarben mit Farbton nah an der Hauptfarbe sähen wie Knöpfe aus. Grau (info) ist erlaubt.
    const b = regeln.blauNieStatus;
    if (b && istHex(f[b.hauptfarbe])) {
      const haupt = farbton(f[b.hauptfarbe]).h;
      for (const s of b.status) {
        if (!istHex(f[s])) continue;
        const t = farbton(f[s]);
        // Grau-Ausnahme nur für „info“ (Schiefergrau, Konzept §4) – ok/warn/bad müssen auch entsättigt Abstand zum Blau halten (Review #58)
        const grau = s === "info" ? t.h == null || t.s <= b.maxSaettigungInfo : t.h == null;
        const abstand = tonAbstand(haupt, t.h);
        const ok = grau || abstand >= b.minFarbton;
        out.push({ modus, gruppe: "Blau nie Status", was: `Status „${s}“ unterscheidet sich von der Hauptfarbe`, wert: grau ? null : abstand, soll: b.minFarbton,
          ok, stufe: "pflicht", a: s, b: b.hauptfarbe, einheit: "°", vorschlag: null });
      }
    }
    // Terminart ≠ Status (§4/§14): Terminarten dürfen nicht wie ein Status aussehen – als Hinweis
    const t = regeln.terminartNichtStatus;
    if (t) for (const c of t.terminarten) for (const s of t.status) {
      if (!istHex(f[c]) || !istHex(f[s])) continue;
      const d = deltaE(f[c], f[s]);
      if (d < t.minDeltaE) out.push({ modus, gruppe: "Terminart ≠ Status", was: `${c} ähnelt ${s}`, wert: d, soll: t.minDeltaE, ok: false, stufe: "hinweis", a: c, b: s, einheit: "ΔE", vorschlag: null });
    }
  }
  return out;
}

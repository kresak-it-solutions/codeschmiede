// App-Designer 3.0 · Ansicht „Entwurf“: die Masken des Design-Entwurfs 2.0 aus dem Design-System-Paket der App.
// Der Entwurf läuft in einem abgeschotteten Rahmen: srcdoc + sandbox="allow-scripts" (ohne allow-same-origin → eigene, leere Herkunft,
// kein Zugriff auf die Codeschmiede, ihre Anmeldung oder das Programm). Gesteuert wird nur per postMessage (Steuer-Skript der App,
// tools/design-system/steuerung.js); angenommen werden nur Nachrichten genau aus diesem Rahmen, und nur Namen von Seiten und Bausteinen.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import GeraeteRahmen from "../GeraeteRahmen";

const NAME = /^[\p{L}\p{N} ·/()„“&+-]{1,80}$/u;
const SEITE = /^[a-z][a-z0-9_-]{0,40}$/;

// Barlow aus den eigenen Schrift-Dateien der Codeschmiede (selbst gehostet, @fontsource) – der Entwurf lädt keine fremden Schriften
let schriftenCache = null;
async function eigeneSchriften() {
  if (schriftenCache) return schriftenCache;
  const gefunden = [];
  for (const blatt of Array.from(document.styleSheets)) {
    let regeln = [];
    try { regeln = Array.from(blatt.cssRules || []); } catch { continue; }
    for (const r of regeln) {
      if (typeof CSSFontFaceRule === "undefined" || !(r instanceof CSSFontFaceRule)) continue;
      const familie = r.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      const gewicht = Number(r.style.getPropertyValue("font-weight")) || 400;
      const bereich = r.style.getPropertyValue("unicode-range");
      const url = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(r.style.getPropertyValue("src"))?.[1];
      // nur der lateinische Grundbereich (U+0000-00FF …) – reicht für Deutsch
      if (!url || !/^Barlow( Semi Condensed)?$/.test(familie) || (bereich && !/U\+0000-00FF/i.test(bereich))) continue;
      gefunden.push({ familie, gewicht, url: new URL(url, document.baseURI).href });
    }
  }
  const eigen = gefunden.filter((f) => new URL(f.url).origin === window.location.origin).slice(0, 8);
  schriftenCache = (await Promise.all(eigen.map(async (f) => {
    try { const r = await fetch(f.url); return r.ok ? { familie: f.familie, gewicht: f.gewicht, daten: await r.arrayBuffer() } : null; } catch { return null; }
  }))).filter(Boolean);
  return schriftenCache;
}

export default function EntwurfVorschau({ html, leiste, seite, tokens, markiert, onSeite, onBaustein }) {
  const rahmen = useRef(null);
  const [bereit, setBereit] = useState(false);
  const sende = useCallback((n) => { try { rahmen.current?.contentWindow?.postMessage(n, "*"); } catch { /* egal */ } }, []);
  // Hinweis: Ziel "*" ist nötig, weil der Rahmen keine eigene Herkunft hat; gesendet werden nur Ansicht, Token-Werte und Schriften.

  useEffect(() => {
    const h = (e) => {
      if (!rahmen.current || e.source !== rahmen.current.contentWindow || !e.data || typeof e.data !== "object") return;
      const n = e.data;
      if (n.cs === "entwurf-bereit") {
        setBereit(true);
        eigeneSchriften().then((dateien) => { if (dateien.length) sende({ cs: "schriften", dateien: dateien.map((d) => ({ ...d, daten: d.daten.slice(0) })) }); });
      } else if (n.cs === "entwurf-seite" && typeof n.seite === "string" && SEITE.test(n.seite)) {
        const zaehler = {};
        if (n.zaehler && typeof n.zaehler === "object") for (const [k, v] of Object.entries(n.zaehler).slice(0, 300)) if (NAME.test(k) && Number.isInteger(v) && v >= 0) zaehler[k] = Math.min(v, 999);
        onSeite({ seite: n.seite, schluessel: SEITE.test(n.schluessel || "") ? n.schluessel : null, titel: typeof n.titel === "string" ? n.titel.slice(0, 60) : "", zaehler });
      } else if (n.cs === "baustein-wahl" && typeof n.ds === "string" && NAME.test(n.ds)) onBaustein(n.ds);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [onSeite, onBaustein, sende]);

  // Leiste und Seite → Entwurf
  useEffect(() => {
    if (bereit) sende({ cs: "ansicht", rolle: leiste.rolle, geraet: leiste.geraet, thema: leiste.thema, bausteine: leiste.bausteine, ...(seite ? { seite } : {}) });
  }, [bereit, leiste.rolle, leiste.geraet, leiste.thema, leiste.bausteine, seite, sende]);
  // Token-Regler → sofort sichtbar
  useEffect(() => { if (bereit) sende({ cs: "tokens", hell: tokens.hell, dunkel: tokens.dunkel, ecken: tokens.ecken }); }, [bereit, tokens, sende]);
  useEffect(() => { if (bereit) sende({ cs: "markieren", ds: markiert || "" }); }, [bereit, markiert, sende]);

  const handy = leiste.geraet === "handy";
  // Wechsel PC ↔ Handy baut den Rahmen neu – bis der Entwurf sich wieder meldet, nichts senden
  useEffect(() => { setBereit(false); }, [handy]);
  const iframe = <iframe key={handy ? "handy" : "pc"} ref={rahmen} title="Design-Entwurf 2.0" srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer"
    className="block w-full h-full border-0" style={{ background: leiste.thema === "dark" ? "#0a0f1c" : "#eef2f8" }} />;
  return (
    <div className="relative min-w-0">
      {!bereit && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Entwurf lädt …</span></div>}
      {handy
        ? <div className="mx-auto rounded-xl overflow-hidden ring-1 ring-black/10" style={{ width: 440, height: 900, maxWidth: "100%" }}>{iframe}</div>
        : <GeraeteRahmen geraet="pc" hoehe={900} text="Design-Entwurf 2.0 in PC-Breite">{iframe}</GeraeteRahmen>}
    </div>
  );
}

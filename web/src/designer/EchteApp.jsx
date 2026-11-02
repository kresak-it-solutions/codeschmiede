// App-Designer 3.0 · Ansicht „Echte App (Testfassung)“: dieselbe Leiste, aber die echte App (Testfassung des Projekts).
// Vorschau-Protokoll der App (Trainer to go src/lib/vorschauHelfer.js): bausteine-zeigen, thema, seite, rolle, ds-tokens-vorschau.
// Zurück kommen nur data-ds-Name und Route (kein sichtbarer Text – Befund S4). Rolle: nur zwischen den eigenen Rollen des angemeldeten
// Benutzers; Rechte der App werden nicht angefasst. Rahmen mit Sandbox (ohne allow-top-navigation), Nachrichten nur genau an/von test_url.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Info, ExternalLink } from "lucide-react";
import GeraeteRahmen from "../GeraeteRahmen";

const NAME = /^[\p{L}\p{N} ·/()„“&+-]{1,80}$/u;
const ROUTE = /^(\/[a-z][a-z-:]{0,39}){1,3}(\?[A-Za-z0-9_=&-]{0,80})?$/;

/**
 * Adresse der Testfassung – NUR test_url auf *.pages.dev (Review #58): nie die Live-Adresse (echte Daten, echte Nutzer) und nie die
 * eigene Herkunft der Codeschmiede. Ohne Testfassung gibt es keine echte Vorschau und kein Speichern.
 */
export function testBasis(projekt) {
  try {
    const u = new URL(String(projekt?.test_url || ""));
    if (u.protocol !== "https:" || !/^([a-z0-9-]+\.)+pages\.dev$/i.test(u.hostname)) return null;
    if (typeof window !== "undefined" && u.origin === window.location.origin) return null;
    return u.origin;
  } catch { return null; }
}

export default function EchteApp({ projekt, leiste, route, tokensDs, onRoute, onBaustein }) {
  const basis = testBasis(projekt);
  const rahmen = useRef(null);
  const [bereit, setBereit] = useState(false);
  const [rolleStand, setRolleStand] = useState(null);
  const [start] = useState(() => (basis ? `${basis}${route || "/home"}?cs=1` : null));   // Rahmen nur einmal laden – danach navigiert die App selbst
  const sende = useCallback((n) => { try { if (basis) rahmen.current?.contentWindow?.postMessage(n, basis); } catch { /* egal */ } }, [basis]);

  useEffect(() => {
    const h = (e) => {
      if (e.origin !== basis || !rahmen.current || e.source !== rahmen.current.contentWindow || !e.data || typeof e.data !== "object") return;
      const n = e.data;
      if (n.cs === "bereit") setBereit(true);
      else if (n.cs === "seite" && typeof n.pfad === "string" && ROUTE.test(n.pfad)) onRoute(n.pfad.split("?")[0]);
      else if (n.cs === "ds-wahl" && typeof n.ds === "string" && NAME.test(n.ds)) onBaustein(n.ds);
      else if (n.cs === "rolle-stand" && typeof n.rolle === "string") setRolleStand({ rolle: n.rolle, ok: !!n.ok, moeglich: Array.isArray(n.moeglich) ? n.moeglich.filter((x) => typeof x === "string").slice(0, 5) : [] });
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [basis, onRoute, onBaustein]);

  const hallo = () => { sende({ cs: "hallo" }); setTimeout(() => sende({ cs: "hallo" }), 1200); };
  useEffect(() => { if (bereit) sende({ cs: "bausteine-zeigen", an: leiste.bausteine }); }, [bereit, leiste.bausteine, sende]);
  useEffect(() => { if (bereit) sende({ cs: "thema", dunkel: leiste.thema === "dark" }); }, [bereit, leiste.thema, sende]);
  useEffect(() => { if (bereit) { setRolleStand(null); sende({ cs: "rolle", rolle: leiste.rolle }); } }, [bereit, leiste.rolle, sende]);
  useEffect(() => { if (bereit && route) sende({ cs: "seite", route }); }, [bereit, route, sende]);
  useEffect(() => { if (bereit) sende({ cs: "ds-tokens-vorschau", ds: tokensDs }); }, [bereit, tokensDs, sende]);

  if (!basis) return <p className="p-4 text-sm text-slate-500">Das Projekt hat keine Testfassung (test_url auf *.pages.dev). Die Live-Adresse wird hier bewusst nie geladen.</p>;
  return (
    <div className="min-w-0 space-y-2">
      {rolleStand && !rolleStand.ok && (
        <p className="flex items-start gap-2 text-sm rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 px-3 py-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Rolle in der echten App: als Demo-Benutzer anmelden. Die Vorschau wechselt nur zwischen Rollen, die der angemeldete Benutzer selbst hat
            {rolleStand.moeglich.length ? ` (hier: ${rolleStand.moeglich.join(", ")})` : ""} – Rechte werden nie gelockert.</span>
        </p>)}
      {!bereit && <p className="text-xs text-slate-500">Testfassung lädt … Bausteine zeigen, Hell/Dunkel, Seite und Rolle wirken, sobald die App den Vorschau-Helfer meldet (Trainer to go ab „Design-System-Paket“).</p>}
      <GeraeteRahmen geraet={leiste.geraet === "handy" ? "handy" : "pc"} hoehe={leiste.geraet === "handy" ? 844 : 860}>
        <iframe ref={rahmen} title="Echte App (Testfassung)" src={start} onLoad={hallo} referrerPolicy="no-referrer"
          className="block w-full h-full bg-white" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
      </GeraeteRahmen>
      <a href={start} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />Testfassung im eigenen Fenster öffnen (zum Anmelden)</a>
    </div>
  );
}

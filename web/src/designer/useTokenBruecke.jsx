// App-Designer 3.0 · Speichern der Design-Tokens im Design-Paket der App – wie bisher bei den Bausteinen:
// unsichtbar eingebettet läuft die Baustein-Galerie der Testfassung (/bausteine), deren Brücke (Trainer to go bausteinBruecke.js)
// mit der eigenen Design-Freigabe der Codeschmiede (Design-Sitzung, Signatur nur „ttg-design|…“) und den Rechten der App-Datenbank
// (RLS DesignPackage_design_*, Trigger DesignPackage_guard/_rights) speichert. Die Codeschmiede hat keinen Zugang zur App-Datenbank.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { designFrageBeantworten, TTG_TESTFASSUNG } from "../designFrage";
import { testBasis } from "./EchteApp";

export function useTokenBruecke(projekt) {
  const basis = testBasis(projekt);
  const erlaubt = !!basis && TTG_TESTFASSUNG.test(basis);
  const rahmen = useRef(null);
  const [bereit, setBereit] = useState(false);
  const warte = useRef(new Map()); const nr = useRef(0);

  useEffect(() => {
    if (!erlaubt) return undefined;
    const h = (e) => {
      if (e.origin !== basis || !rahmen.current || e.source !== rahmen.current.contentWindow || !e.data || typeof e.data !== "object") return;
      const n = e.data;
      if (n.cs === "bausteine-bereit") setBereit(true);
      else if (n.cs === "design-frage") designFrageBeantworten(n, basis, (x) => rahmen.current?.contentWindow?.postMessage(x, basis));
      else if ((n.cs === "ds-tokens-stand" || n.cs === "ds-tokens-gespeichert") && warte.current.has(Number(n.nr))) {
        const w = warte.current.get(Number(n.nr)); warte.current.delete(Number(n.nr));
        if (n.ok) w.ok(n); else { const f = new Error(String(n.fehler || "Fehler").slice(0, 300)); f.freigabe = !!n.freigabe; w.fehl(f); }
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [basis, erlaubt]);

  const frage = useCallback((n) => new Promise((ok, fehl) => {
    if (!erlaubt || !bereit || !rahmen.current?.contentWindow) {
      fehl(new Error("Die Testfassung ist noch nicht bereit – in „Echte App (Testfassung)“ mit dem Betreiber-Konto anmelden und kurz warten.")); return;
    }
    const id = ++nr.current; warte.current.set(id, { ok, fehl });
    rahmen.current.contentWindow.postMessage({ ...n, nr: id }, basis);
    setTimeout(() => { if (warte.current.has(id)) { warte.current.delete(id); fehl(new Error("Die Testfassung antwortet nicht (Trainer to go mit Design-System-Paket nötig).")); } }, 90000);
  }), [erlaubt, bereit, basis]);

  const unsichtbar = erlaubt
    ? <iframe ref={rahmen} title="Speicher-Brücke Design-Paket" aria-hidden="true" tabIndex={-1} src={`${basis}/bausteine?cs=1`} referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms" className="absolute w-px h-px opacity-0 pointer-events-none -z-10" />
    : null;
  return { erlaubt, bereit, frage, unsichtbar };
}

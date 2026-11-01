// Bestätigen-Dialog und Fokusfalle für den App-Designer (Review #58, Befund B2): statt window.confirm.
// Gleiche Schnittstelle wie web/src/bausteine/grund.jsx aus PR #57 („Bedienung“) – sobald #57 in main ist, nur noch die Importe
// auf ../bausteine/grund umstellen und diese Datei löschen.
//   const bestaetigen = useBestaetigen(); if (!(await bestaetigen({ titel, text, ja, gefahr }))) return;
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

const btn = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-display font-bold tracking-wide transition";
const gefahrBtn = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-display font-bold tracking-wide transition";
const ghost = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition";

const FOKUSSIERBAR = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
/** Fokus bleibt im Dialog (Tab/Umschalt+Tab im Kreis), beim Schließen zurück zum Auslöser. Als Callback-Ref: <div role="dialog" ref={useFokusfalle()}>. */
export function useFokusfalle() {
  const ab = useRef(null);
  return useCallback((el) => {
    if (ab.current) { ab.current(); ab.current = null; }
    if (!el) return;
    const vorher = document.activeElement;
    const liste = () => [...el.querySelectorAll(FOKUSSIERBAR)].filter((x) => x.getClientRects().length > 0);
    if (!el.contains(document.activeElement)) {
      const erstes = liste()[0];
      if (erstes) erstes.focus({ preventScroll: true });
      else { if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
    }
    const taste = (e) => {
      if (e.key !== "Tab") return;
      const l = liste(); if (!l.length) { e.preventDefault(); return; }
      const erst = l[0]; const letzt = l[l.length - 1];
      if (e.shiftKey && (document.activeElement === erst || !el.contains(document.activeElement))) { e.preventDefault(); letzt.focus(); }
      else if (!e.shiftKey && (document.activeElement === letzt || !el.contains(document.activeElement))) { e.preventDefault(); erst.focus(); }
    };
    el.addEventListener("keydown", taste);
    ab.current = () => {
      el.removeEventListener("keydown", taste);
      if (vorher && typeof vorher.focus === "function" && document.contains(vorher)) vorher.focus({ preventScroll: true });
    };
  }, []);
}

/** Escape schließt (nur solange aktiv). */
export function useEscape(onClose, aktiv = true) {
  const zu = useRef(onClose); zu.current = onClose;
  useEffect(() => {
    if (!aktiv) return undefined;
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); zu.current?.(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [aktiv]);
}

const Kontext = createContext(null);
/** Einmal um den Designer legen; darunter liefert useBestaetigen() die Frage-Funktion. */
export function BestaetigenRahmen({ children }) {
  const [frage, setFrage] = useState(null);
  const bestaetigen = useCallback((f) => new Promise((antwort) => setFrage({ ...f, antwort })), []);
  const ende = (ja) => { frage?.antwort(ja); setFrage(null); };
  const fokus = useFokusfalle();
  const id = useId();
  useEscape(() => ende(false), !!frage);
  return (
    <Kontext.Provider value={bestaetigen}>
      {children}
      {frage && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-4">
          <div ref={fokus} role="alertdialog" aria-modal="true" aria-labelledby={id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 w-full max-w-md p-5 flex flex-col gap-4 shadow-xl">
            <h3 id={id} className="font-display font-bold text-xl text-slate-900 dark:text-slate-50">{frage.titel || "Bitte bestätigen"}</h3>
            {frage.text && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{frage.text}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={ghost} onClick={() => ende(false)}>{frage.nein || "Abbrechen"}</button>
              <button type="button" className={frage.gefahr ? gefahrBtn : btn} onClick={() => ende(true)}>{frage.ja || "OK"}</button>
            </div>
          </div>
        </div>)}
    </Kontext.Provider>
  );
}
/** Frage-Funktion; ohne Rahmen (z. B. in Tests) wird nie still bestätigt. */
export function useBestaetigen() {
  return useContext(Kontext) || (async () => false);
}

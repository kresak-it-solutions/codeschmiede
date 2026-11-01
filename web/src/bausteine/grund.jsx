// Grundbausteine der Oberfläche (aus App.jsx ausgelagert, Befund B1 vom 01.11.2026): Knopf-Klassen, Hilfen, Abzeichen, Meldung, Dialog.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { STAND } from "../config";
import { isDesktop, tauri } from "../desktop";

export const btn = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-display font-bold tracking-wide transition";
export const gefahrBtn = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-display font-bold tracking-wide transition";
export const ghost = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition";
export const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
export const input = "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-[15px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500";
// Weg eines Auftrags (Entwurf 0.7, freigegeben 2026-10-22 20:41): Freigabe → Sicherheitsprüfung → Zusammenführen → Feature-Prüfung → live
export const STEPS = [["wartet", "Auftrag"], ["laeuft", "In Arbeit"], ["freigabe", "Freigabe"], ["sicherheit", "Sicherheitsprüfung"], ["zusammen", "Zusammenführen"], ["feature", "Feature-Prüfung"], ["wissen", "Live & Wissen"]];
export const STEP_IDX = { wartet: 0, laeuft: 1, frage: 1, nacharbeit: 1, freigabe: 2, sicherheit: 3, zusammen: 4, feature: 5, wissen: 6, erledigt: 6 };
export const ABGESCHLOSSEN = ["wissen", "erledigt"];
// Cloudflare Pages: Testseite eines Zweigs (klein, nur a-z0-9 und „-“, höchstens 28 Zeichen)
export const cfAlias = (zweig) => String(zweig || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28).replace(/^-+|-+$/g, "");
// Ohne offenen Auftrag: bei Test & Live die Testfassung (main), sonst die App – dort sieht man Änderungen zuerst
export const vorschauUrl = (projekt, a) => (a?.zweig && projekt?.vorschau_domain && !ABGESCHLOSSEN.includes(a.stand) ? `https://${cfAlias(a.zweig)}.${projekt.vorschau_domain}`
  : (projekt?.live_zweig && /^https:\/\/[^/\s]+$/i.test(String(projekt?.test_url || "").replace(/\/$/, "")) ? String(projekt.test_url).replace(/\/$/, "") : projekt?.live_url) || null);
// Seite in der Vorschau: gemerkte Seite des Features (Datenbank 0028), sonst die des Projekts; „cs=1“ hängt am Ende
export const SEITE = /^\/[A-Za-z0-9/_.~-]{0,150}(\?[A-Za-z0-9_=&.~%-]{0,150})?$/;
export const seiteOk = (p) => typeof p === "string" && SEITE.test(p) && !/(^|\/)\.\.(\/|$|\?)/.test(p) && !p.startsWith("//") && !/\/[A-Za-z0-9_-]{20,}/.test(p) && !/\/[0-9]/.test(p);
export const mitCs = (p) => `${p}${p.includes("?") ? "&" : "?"}cs=1`;
export const oeffneExtern = (url) => { if (isDesktop()) tauri("plugin:opener|open_url", { url }).catch(() => {}); else window.open(url, "_blank", "noopener"); };
export const fmt = (d) => new Date(d).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fehler = (e) => (e?.message || "Unbekannter Fehler").replace(/^.*?ERROR:\s*/, "");

export function Badge({ stand }) {
  const s = STAND[stand] || STAND.geplant;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

export function Toast({ text, onDone }) {
  useEffect(() => { if (!text) return; const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [text, onDone]);
  if (!text) return null;
  return <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 text-sm shadow-lg max-w-[calc(100%-32px)]">{text}</div>;
}

// Befund B2 (01.11.2026): Fokus bleibt im Dialog (Tab/Umschalt+Tab laufen im Kreis), beim Schließen zurück zum Auslöser.
// Als Callback-Ref, damit es auch bei bedingt angezeigten Dialogen greift: <div role="dialog" ref={useFokusfalle()} …>
const FOKUSSIERBAR = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
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

// Review N2 (02.11.2026): Escape schließt nur den obersten offenen Dialog. Jeder Dialog meldet sich auf einem gemeinsamen Stapel an.
const escStapel = [];
export function useEscape(onClose, aktiv = true) {
  const zu = useRef(onClose); zu.current = onClose;
  useEffect(() => {
    if (!aktiv) return undefined;
    const ich = {};
    escStapel.push(ich);
    const k = (e) => { if (e.key === "Escape" && escStapel[escStapel.length - 1] === ich) { e.stopPropagation(); zu.current?.(); } };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); const i = escStapel.indexOf(ich); if (i >= 0) escStapel.splice(i, 1); };
  }, [aktiv]);
}

// Ein Dialog-Baustein für die ganze Oberfläche (Befund B2): Titel als Beschriftung, Fokusfalle, Escape und „Schließen“.
// Ein Klick neben den Dialog schließt ihn nicht mehr (sonst gingen Eingaben verloren).
export function Dialog({ title, onClose, children, breit = false }) {
  const fokus = useFokusfalle();
  const id = useId();
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4">
      <div ref={fokus} role="dialog" aria-modal="true" aria-labelledby={id} className={`${card} w-full ${breit ? "max-w-2xl" : "max-w-lg"} p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start gap-3">
          <h3 id={id} className="font-display font-bold text-xl flex-1">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)" className="p-2 -m-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Bestätigen statt window.confirm (Befund B2): const bestaetigen = useBestaetigen(); if (!(await bestaetigen({ titel, text, ja, gefahr }))) return;
// Der Rahmen <BestaetigenRahmen> steht einmal in App.jsx.
const BestaetigenKontext = createContext(null);
export function BestaetigenRahmen({ children }) {
  const [frage, setFrage] = useState(null);
  const bestaetigen = useCallback((f) => new Promise((antwort) => setFrage({ ...f, antwort })), []);
  const ende = (ja) => { frage?.antwort(ja); setFrage(null); };
  return (
    <BestaetigenKontext.Provider value={bestaetigen}>
      {children}
      {frage && <Dialog title={frage.titel || "Bitte bestätigen"} onClose={() => ende(false)}>
        {frage.text && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{frage.text}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={ghost} onClick={() => ende(false)}>{frage.nein || "Abbrechen"}</button>
          <button type="button" className={frage.gefahr ? gefahrBtn : btn} onClick={() => ende(true)}>{frage.ja || "OK"}</button>
        </div>
      </Dialog>}
    </BestaetigenKontext.Provider>
  );
}
export function useBestaetigen() {
  const b = useContext(BestaetigenKontext);
  return b || (() => Promise.resolve(false));
}

// „sitzung“ = nur bis zum Programmende (sessionStorage), sonst dauerhaft (localStorage)
export const speicher = (art) => (art === "sitzung" ? sessionStorage : localStorage);
export const merke = { lies: (k, art) => { try { return speicher(art).getItem(k); } catch { return null; } }, schreib: (k, v, art) => { try { speicher(art).setItem(k, v); } catch { /* ohne Speicher */ } } };

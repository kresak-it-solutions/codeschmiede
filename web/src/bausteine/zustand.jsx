// Lade-, Leer- und Fehlerzustand als Bausteine (Befund B9 vom 01.11.2026, wie Design 2.0 §5 von Trainer to go):
// - Laden: Skeleton (graue Platzhalter-Zeilen), erst nach einer kurzen Verzögerung sichtbar – schnelle Antworten flackern nicht.
// - Leer: Symbol, ein Satz und höchstens EINE Aktion.
// - Fehler: was nicht ging, die Meldung und „Erneut versuchen“ (statt nur einer Meldung unten, die nach 3,5 s verschwindet).
// Nur Lucide-Symbole, Schrift ab 12 px, Farben der Codeschmiede (Smaragd).
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Inbox, RefreshCw } from "lucide-react";

export const LADEN_VERZOEGERUNG = 300;   // ms – darunter zeigt sich kein Skeleton
const fehlerText = (e) => (typeof e === "string" ? e : e?.message || "Unbekannter Fehler").replace(/^.*?ERROR:\s*/, "").slice(0, 300);

/** true, sobald `aktiv` länger als `ms` anhält (für den verzögerten Skeleton). */
export function useVerzoegert(aktiv, ms = LADEN_VERZOEGERUNG) {
  const [sicht, setSicht] = useState(false);
  useEffect(() => {
    if (!aktiv) { setSicht(false); return undefined; }
    const t = setTimeout(() => setSicht(true), ms);
    return () => clearTimeout(t);
  }, [aktiv, ms]);
  return sicht;
}

/**
 * Ladezustand: Skeleton mit `zeilen` Platzhaltern. `art`: "liste" (Zeilen mit Symbol), "text" (Absatz), "karten" (Kacheln), "flaeche" (ein Block).
 * `klein` für schmale Spalten. Bis zur Verzögerung bleibt die Fläche leer (nimmt aber schon Platz ein, damit nichts springt).
 */
export function Laden({ zeilen = 3, art = "liste", text = "Wird geladen", klein = false, verzoegerung = LADEN_VERZOEGERUNG, className = "" }) {
  const sicht = useVerzoegert(true, verzoegerung);
  const balken = "rounded-md bg-slate-200/80 dark:bg-slate-800 motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`${klein ? "p-2" : "p-3"} ${className}`}>
      <span className="sr-only">{text} …</span>
      {sicht && (art === "flaeche" ? <div className={`${balken} h-40 w-full`} aria-hidden="true" />
        : art === "karten" ? <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]" aria-hidden="true">{Array.from({ length: zeilen }, (_, i) => <div key={i} className={`${balken} h-24`} />)}</div>
        : art === "text" ? <div className="flex flex-col gap-2" aria-hidden="true">{Array.from({ length: zeilen }, (_, i) => <div key={i} className={`${balken} h-3`} style={{ width: `${[92, 78, 85, 64, 88][i % 5]}%` }} />)}</div>
        : <div className="flex flex-col gap-3" aria-hidden="true">{Array.from({ length: zeilen }, (_, i) => (
            <div key={i} className="flex items-center gap-3"><div className={`${balken} ${klein ? "w-6 h-6" : "w-8 h-8"} shrink-0`} />
              <div className="flex-1 flex flex-col gap-1.5"><div className={`${balken} h-3`} style={{ width: `${[70, 55, 80, 62][i % 4]}%` }} /><div className={`${balken} h-2.5 w-2/5`} /></div></div>))}</div>)}
    </div>);
}

/** Leerzustand: Symbol, Titel, ein Satz und höchstens EINE Aktion ({ text, onClick, Symbol }). */
export function Leerzustand({ Symbol = Inbox, titel, text, aktion = null, klein = false, className = "" }) {
  const A = aktion?.Symbol;
  return (
    <div className={`flex flex-col items-center text-center gap-2 ${klein ? "py-4 px-2" : "py-10 px-4"} ${className}`}>
      <span className={`${klein ? "w-9 h-9" : "w-12 h-12"} rounded-xl grid place-items-center bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300`}><Symbol className={klein ? "w-4 h-4" : "w-5 h-5"} aria-hidden="true" /></span>
      {titel && <p className={`font-display font-bold ${klein ? "text-[15px]" : "text-lg"}`}>{titel}</p>}
      {text && <p className="text-sm text-slate-500 max-w-md">{text}</p>}
      {aktion && <button type="button" onClick={aktion.onClick} disabled={aktion.disabled}
        className="mt-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-display font-bold tracking-wide">
        {A && <A className="w-4 h-4" aria-hidden="true" />}{aktion.text}</button>}
    </div>);
}

/** Fehlerzustand: was nicht ging, die Meldung und „Erneut versuchen“. */
export function Fehlerzustand({ titel = "Konnte nicht geladen werden", fehler, onErneut, klein = false, className = "" }) {
  const [laeuft, setLaeuft] = useState(false);
  const erneut = async () => { if (!onErneut || laeuft) return; setLaeuft(true); try { await onErneut(); } finally { setLaeuft(false); } };
  return (
    <div role="alert" className={`rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 ${klein ? "p-3" : "p-4"} flex items-start gap-3 ${className}`}>
      <CircleAlert className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-red-800 dark:text-red-200">{titel}</p>
        {fehler && <p className="text-sm text-red-800/90 dark:text-red-200/90 break-words mt-0.5">{fehlerText(fehler)}</p>}
        {onErneut && <button type="button" onClick={erneut} disabled={laeuft}
          className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-sm font-semibold text-red-800 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${laeuft ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />Erneut versuchen</button>}
      </div>
    </div>);
}

/**
 * Laden mit den drei Zuständen: const z = useLaden(async () => { const { data, error } = await …; if (error) throw error; return data; }, [abh]);
 * z.daten (undefined solange nichts da ist), z.laedt, z.fehler, z.neu() – ein späteres Neuladen (z. B. Live-Abgleich) lässt alte Daten stehen.
 */
export function useLaden(holen, abh = []) {
  const [st, setSt] = useState({ daten: undefined, laedt: true, fehler: null });
  const nr = useRef(0);
  const neu = useCallback(async () => {
    const ich = ++nr.current;
    setSt((s) => ({ ...s, laedt: true }));
    try {
      const daten = await holen();
      if (ich === nr.current) setSt({ daten, laedt: false, fehler: null });
    } catch (e) {
      if (ich === nr.current) setSt((s) => ({ daten: s.daten, laedt: false, fehler: e || new Error("Unbekannter Fehler") }));
    }
  }, abh); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { neu(); }, [neu]);
  return { ...st, neu };
}

/**
 * Weiche für die drei Zustände: <Zustand z={z} leer={!z.daten?.length && <Leerzustand …/>} laden={{ zeilen: 4 }}>{…Inhalt…}</Zustand>
 * Fehler beim ersten Laden → Fehlerzustand; Fehler bei späterem Neuladen → Hinweis über dem alten Inhalt.
 */
export function Zustand({ z, laden = {}, leer = null, fehlerTitel, klein = false, children }) {
  if (z.daten === undefined) {
    if (z.fehler) return <Fehlerzustand titel={fehlerTitel} fehler={z.fehler} onErneut={z.neu} klein={klein} />;
    return <Laden klein={klein} {...laden} />;
  }
  return (<>
    {z.fehler && <Fehlerzustand titel="Neu laden hat nicht geklappt – du siehst den letzten Stand" fehler={z.fehler} onErneut={z.neu} klein />}
    {leer || children}
  </>);
}

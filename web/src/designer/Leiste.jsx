// App-Designer 3.0 · Leiste wie im Design-Entwurf 2.0 (docs/design-2/entwurf/02-body.html der App):
// Rolle · Gerät · Thema · „Bausteine zeigen“ · „Begründung zeigen“. Gilt für beide Ansichten (Entwurf und echte App).
import React from "react";
import { Monitor, Smartphone, Sun, Moon, Shapes, MessageSquareQuote } from "lucide-react";

export const ROLLEN = [["trainer", "Trainer"], ["eltern", "Eltern"], ["spieler", "Spieler"], ["admin", "Vereinsadmin"], ["funktionaer", "Funktionär"]];
export const LEISTE_START = { rolle: "trainer", geraet: "pc", thema: "light", bausteine: false, begruendung: true };

/** Zustand der Leiste je Projekt merken (nur dieser Browser, keine Personendaten). */
export function leisteLesen(projektId) {
  try {
    const x = JSON.parse(localStorage.getItem(`cs-app-designer-3:${projektId}`) || "null");
    if (!x || typeof x !== "object") return { ...LEISTE_START };
    return {
      rolle: ROLLEN.some(([k]) => k === x.rolle) ? x.rolle : "trainer",
      geraet: x.geraet === "handy" ? "handy" : "pc",
      thema: x.thema === "dark" ? "dark" : "light",
      bausteine: !!x.bausteine,
      begruendung: x.begruendung !== false,
    };
  } catch { return { ...LEISTE_START }; }
}
export function leisteMerken(projektId, l) {
  try { localStorage.setItem(`cs-app-designer-3:${projektId}`, JSON.stringify(l)); } catch { /* egal */ }
}

function Segment({ label, werte, wert, onWahl }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5">
      {werte.map(([k, t, I]) => (
        <button key={k} type="button" aria-pressed={wert === k} onClick={() => onWahl(k)}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold transition ${wert === k ? "bg-white dark:bg-slate-900 shadow-sm text-emerald-800 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}`}>
          {I && <I className="w-4 h-4" aria-hidden="true" />}{t}</button>))}
    </div>
  );
}

function Schalter({ an, onChange, children, Symbol }) {
  return (
    <label className="inline-flex items-center gap-2 h-8 px-2.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
      <input type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-emerald-700" />
      <Symbol className="w-4 h-4 text-slate-500" aria-hidden="true" />{children}
    </label>
  );
}

export default function Leiste({ titel, untertitel, leiste, setLeiste, rollen = ROLLEN }) {
  const setze = (k, v) => setLeiste({ ...leiste, [k]: v });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-xl">
      <div className="min-w-0 me-1">
        <div className="font-display font-bold text-[15px] leading-tight text-slate-900 dark:text-slate-50 truncate">{titel}</div>
        {untertitel && <div className="text-xs text-slate-500 truncate">{untertitel}</div>}
      </div>
      <Segment label="Rolle" werte={rollen} wert={leiste.rolle} onWahl={(v) => setze("rolle", v)} />
      <Segment label="Gerät" werte={[["pc", "PC", Monitor], ["handy", "Handy", Smartphone]]} wert={leiste.geraet} onWahl={(v) => setze("geraet", v)} />
      <Segment label="Thema" werte={[["light", "Hell", Sun], ["dark", "Dunkel", Moon]]} wert={leiste.thema} onWahl={(v) => setze("thema", v)} />
      <span className="flex-1" />
      <Schalter an={leiste.bausteine} onChange={(v) => setze("bausteine", v)} Symbol={Shapes}>Bausteine zeigen</Schalter>
      <Schalter an={leiste.begruendung} onChange={(v) => setze("begruendung", v)} Symbol={MessageSquareQuote}>Begründung zeigen</Schalter>
    </div>
  );
}

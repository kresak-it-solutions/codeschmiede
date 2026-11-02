// App-Designer 3.0 · Seiten je Rolle, gruppiert wie die Seitenleiste der App (Konzept §2) – Daten aus dem Design-System-Paket.
// Ansicht „Entwurf“: alle Masken des Entwurfs (dazu Termin-Details und Zustände). Ansicht „Echte App“: nur Seiten mit Route.
import React from "react";
import { FileText, CircleOff } from "lucide-react";

export default function Seitenliste({ daten, rolle, ansicht, aktiv, onWahl }) {
  const nav = daten.navigation[rolle];
  if (!nav) return <p className="p-3 text-sm text-slate-500">Für diese Rolle hat das Paket keine Navigation.</p>;
  const echt = ansicht === "echt";
  const Punkt = ({ id, titel }) => {
    const s = daten.seiten[id];
    const ziel = echt ? s?.route : id;
    const an = echt ? !!s?.route && aktiv === s.route : aktiv === id;
    return (
      <li>
        <button type="button" disabled={!ziel} onClick={() => ziel && onWahl(ziel)} aria-current={an ? "page" : undefined}
          title={echt && !s?.route ? "Diese Seite gibt es in der App noch nicht (nur im Entwurf)" : echt ? s.route : undefined}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-start transition ${an ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold" : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"} disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent`}>
          {echt && !s?.route ? <CircleOff className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" /> : <FileText className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />}
          <span className="truncate">{titel || s?.titel || id}</span>
          {!echt && s && !s.gezeichnet && <span className="ms-auto text-xs text-slate-400">folgt</span>}
        </button>
      </li>
    );
  };
  const weitere = echt ? [] : [...daten.termine.map((t) => ({ id: t.seite, titel: `Termin: ${t.titel}` })),
    ...["zustaende", "profil", "mehr"].filter((k) => daten.seiten[k]).map((k) => ({ id: k, titel: daten.seiten[k].titel }))];
  return (
    <nav aria-label="Seiten der Rolle" className="p-2 space-y-3 overflow-auto">
      {nav.seitenleiste.map((g, i) => (
        <div key={i}>
          {g.gruppe && <h4 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{g.gruppe}</h4>}
          <ul className="space-y-0.5">{g.seiten.map((id) => <Punkt key={id} id={id} />)}</ul>
        </div>))}
      {weitere.length > 0 && (
        <div>
          <h4 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Weitere Masken</h4>
          <ul className="space-y-0.5">{weitere.map((w) => <Punkt key={w.id} id={w.id} titel={w.titel} />)}</ul>
        </div>)}
      <p className="px-2.5 text-xs text-slate-500">Am Handy: Leiste unten mit {nav.leiste.map((k) => daten.seiten[k]?.titel || (k === "mehr" ? "Mehr" : k)).join(" · ")}</p>
    </nav>
  );
}

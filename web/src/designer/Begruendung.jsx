// App-Designer 3.0 · „Warum sieht ‚<Seite>‘ so aus?“ (Heute → Andere → Vorschlag → Warum) wie im Entwurf 2.0 (06-render.js).
// Quelle: begruendungen im Design-System-Paket (aus WHY.* des Entwurfs). Reiner Text, nichts wird ausgeführt.
import React from "react";
import { MessageSquareQuote, Info } from "lucide-react";

const TEILE = [["heute", "Heute"], ["andere", "Andere"], ["vorschlag", "Vorschlag"], ["warum", "Warum"]];

export default function Begruendung({ begruendung, titel }) {
  if (!begruendung) {
    return (
      <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        Noch keine Begründung für „{titel || "diese Seite"}“ – im Entwurf der App ergänzen (WHY im Entwurf, danach tools/design-system.mjs).
      </p>);
  }
  return (
    <details open className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 font-display font-bold text-[15px]">
        <MessageSquareQuote className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />Warum sieht „{titel || "diese Seite"}“ so aus?
      </summary>
      <ul className="px-3 pb-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
        {TEILE.filter(([k]) => begruendung[k]).map(([k, t]) => <li key={k}><b>{t}{k === "andere" && begruendung.annahme ? " (Annahme)" : ""}:</b> {begruendung[k]}</li>)}
      </ul>
    </details>
  );
}

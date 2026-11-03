// Entwurf eines Auftrags (0.19.0, Regelwerk erzwingen – Gerhard 03.11.2026): Jeder neue Auftrag (außer Hand-Änderungen) beginnt als Entwurf.
// Eine zweite KI prüft ihn kritisch; die Einwände stehen hier. Gerhard entscheidet „Bauen“ (trotz Einwänden nur Admin, mit Begründung),
// „Ändern“ (neue Prüfung) oder „Verwerfen“ – über ws_entwurf_entscheiden (Datenbank 0063), automatisch im Entscheidungsprotokoll.
import React, { useState } from "react";
import { AlertTriangle, Check, Hammer, Loader2, PenLine, ShieldQuestion, X } from "lucide-react";
import { btn, fehler, ghost, input } from "./bausteine/grund";
import { supabase } from "./supabase";
import { EINWAND_ART } from "./daten/regelwerk";
import { TEXT_MAX } from "./textGrenze";

const SCHWERE = { hoch: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", mittel: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200", niedrig: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

export function EntwurfKarte({ a, ich, kann, toast, onFertig }) {
  const k = a.kritik || {}; const [modus, setModus] = useState(null); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const admin = ich.rolle === "admin";
  const einwaende = Array.isArray(k.einwaende) ? k.einwaende : [];
  const fertig = k.stand === "fertig" || k.stand === "entfaellt";
  const trotz = k.ergebnis === "einwaende" && einwaende.length > 0;
  const entscheiden = async (e, extra = {}) => {
    setBusy(true);
    const { error } = await supabase.rpc("ws_entwurf_entscheiden", { p_auftrag: a.id, p_entscheidung: e, p_begruendung: extra.begruendung || null, p_text: extra.text || null });
    setBusy(false);
    if (error) { toast(fehler(error)); return; }
    toast(e === "bauen" ? `Auftrag #${a.id}: Bauen freigegeben` : e === "aendern" ? `Auftrag #${a.id}: geändert – neue kritische Prüfung` : `Auftrag #${a.id} verworfen`);
    setModus(null); setText(""); onFertig?.();
  };
  return (
    <div className="rounded-xl border border-dashed border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 grid gap-2 text-sm" aria-label={`Entwurf #${a.id}`}>
      <div className="flex items-center gap-2 flex-wrap"><ShieldQuestion className="w-4 h-4 text-emerald-700" /><b className="font-display">Entwurf #{a.id}</b>
        <span className="text-xs text-slate-500">{a.zweck !== "bau" ? "Einrichtungs-Auftrag der Codeschmiede – ohne kritische Prüfung, startet nur der Admin"
          : k.stand === "wartet" ? (k.wartet_auf ? `Kritische Prüfung ${k.wartet_auf}` : "Kritische Prüfung wartet auf die Werkstatt")
          : k.stand === "laeuft" ? "Eine zweite KI prüft den Entwurf gerade kritisch …"
          : trotz ? `${einwaende.length} Einwand/Einwände der kritischen Prüfung${k.ki ? ` (${k.ki})` : ""}` : `Kritische Prüfung: keine Einwände${k.ki ? ` (${k.ki})` : ""}`}</span>
        {k.stand === "laeuft" && <Loader2 className="w-4 h-4 animate-spin text-emerald-700" aria-hidden="true" />}</div>
      {einwaende.length > 0 && <ul className="grid gap-1">{einwaende.map((e, i) => <li key={i} className="flex gap-2 items-start">
        <span className={`shrink-0 text-xs font-semibold rounded-md px-1.5 py-0.5 ${SCHWERE[e.schwere] || SCHWERE.niedrig}`}>{EINWAND_ART[e.art] || e.art} · {e.schwere}</span><span>{e.text}</span></li>)}</ul>}
      {kann && modus === null && <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={busy || !fertig || (trotz && !admin) || (a.zweck !== "bau" && !admin)} title={!fertig ? "Erst nach der kritischen Prüfung" : trotz && !admin ? "Bauen trotz Einwänden entscheidet nur der Admin" : undefined}
          onClick={() => (trotz ? setModus("trotz") : entscheiden("bauen"))}><Hammer className="w-4 h-4" />{trotz ? "Trotzdem bauen …" : "Bauen"}</button>
        {a.zweck === "bau" && <button type="button" className={ghost} disabled={busy} onClick={() => setModus("aendern")}><PenLine className="w-4 h-4" />Ändern</button>}
        <button type="button" className={ghost} disabled={busy} onClick={() => entscheiden("verwerfen")}><X className="w-4 h-4" />Verwerfen</button></div>}
      {modus === "trotz" && <div className="grid gap-1.5"><label className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" />Warum trotz der Einwände bauen? (Pflicht, kommt ins Entscheidungsprotokoll)
        <textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="flex gap-1.5"><button type="button" className={btn} disabled={busy || text.trim().length < 10} onClick={() => entscheiden("bauen", { begruendung: text.trim() })}><Check className="w-4 h-4" />Bauen trotz Einwänden</button><button type="button" className={ghost} onClick={() => setModus(null)}>Zurück</button></div></div>}
      {modus === "aendern" && <div className="grid gap-1.5"><label className="font-semibold">Was soll anders sein? (ergänzt den Auftrag, danach neue kritische Prüfung – keine Personendaten)
        <textarea className={`${input} mt-1`} rows={4} maxLength={TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="flex gap-1.5"><button type="button" className={btn} disabled={busy || text.trim().length < 10} onClick={() => entscheiden("aendern", { text: text.trim() })}><Check className="w-4 h-4" />Ändern und neu prüfen</button><button type="button" className={ghost} onClick={() => setModus(null)}>Zurück</button></div></div>}
    </div>
  );
}

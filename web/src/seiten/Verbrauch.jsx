// Verbrauch – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { Fragment, useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { btn, card, fehler, fmt, ghost, input } from "../bausteine/grund";
import { isDesktop, tauri } from "../desktop";
import { supabase } from "../supabase";
import { usd } from "../daten/werkstattDaten";

// ---------------- Verbrauch & Limits ----------------
export const uhr = (t) => (t ? new Date(t).toLocaleString("de-AT", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "–");
export const abgelaufen = (t) => t && Date.parse(t) < Date.now();
export function Balken({ wert, warn, pause }) {
  const w = wert == null ? 0 : Math.min(100, wert);
  const farbe = wert >= pause ? "bg-red-600" : wert >= warn ? "bg-amber-500" : "bg-emerald-600";
  return <span className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden inline-block align-middle"><i className={`block h-full ${farbe}`} style={{ width: `${w}%` }} /></span>;
}
// kein: Claude Code meldet kein 5-Stunden-Fenster (Abo „Ultra“); m: modell-eigene Wochenfenster, wie gemeldet (0.13.1)
export function aboWerte(a) {
  if (!a) return { f: null, w: null, kein: false, m: [] };
  const m = (Array.isArray(a.woche_modelle) ? a.woche_modelle : []).map((x) => ({ name: x.modell ? x.modell[0].toUpperCase() + x.modell.slice(1) : "?", p: abgelaufen(x.reset) ? 0 : x.prozent, reset: x.reset }));
  return { f: a.fuenf_std_kein ? null : abgelaufen(a.fuenf_std_reset) ? 0 : a.fuenf_std_prozent, w: abgelaufen(a.woche_reset) ? 0 : a.woche_prozent, kein: !!a.fuenf_std_kein, m };
}

export function VerbrauchKurz({ d, ich, onClick }) {
  const a = d.abo.find((x) => x.benutzer_id === ich.id);
  const { f, w, kein, m } = aboWerte(a);
  const warn = d.einstellungen?.abo_klein_ab_prozent ?? 75; const pause = d.einstellungen?.abo_pause_ab_prozent ?? 95;
  const hoch = Math.max(f ?? 0, w ?? 0, ...m.map((x) => x.p ?? 0)) >= warn;
  const p = (x) => (x == null ? "–" : `${Math.round(x)} %`);
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-sm ${hoch ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`} title="Nutzungslimits deines Claude-Abos (laut Claude Code)">
      <Gauge className={`w-4 h-4 ${hoch ? "text-amber-600" : "text-emerald-700"}`} />
      {a ? <span className="flex items-center gap-2 tabular-nums">{kein ? <span>5 Std.: <b>kein Limit</b></span> : <><span>5 Std. <b>{p(f)}</b></span><Balken wert={f} warn={warn} pause={pause} /></>}<span>Woche <b>{p(w)}</b></span><Balken wert={w} warn={warn} pause={pause} />
        {m.map((x) => <Fragment key={x.name}><span>{x.name} <b>{p(x.p)}</b></span><Balken wert={x.p} warn={warn} pause={pause} /></Fragment>)}</span>
        : <span className="text-slate-600 dark:text-slate-300 font-semibold">Abo-Limits</span>}
    </button>
  );
}

export function Verbrauch({ d, ich, toast }) {
  const e = d.einstellungen || {};
  const [klein, setKlein] = useState(e.abo_klein_ab_prozent ?? 75); const [pause, setPause] = useState(e.abo_pause_ab_prozent ?? 95);
  useEffect(() => { setKlein(e.abo_klein_ab_prozent ?? 75); setPause(e.abo_pause_ab_prozent ?? 95); }, [e.abo_klein_ab_prozent, e.abo_pause_ab_prozent]);
  const admin = ich.rolle === "admin";
  const speichern = async () => {
    const { error } = await supabase.rpc("ws_abo_schwellen_setzen", { p_klein: Number(klein), p_pause: Number(pause) });
    toast(error ? fehler(error) : "Schwellen gespeichert");
  };
  const statuszeile = async () => { try { toast(await tauri("ws_statuszeile")); } catch (x) { toast(fehler(x)); } };
  const name = (pid) => d.projekte.find((p) => p.id === pid)?.name || pid;
  const wer = (uid) => d.benutzer.find((u) => u.id === uid)?.name || "Mitglied";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
      <div className="flex flex-col gap-5">
        <div className={card}>
          <div className="p-4 font-display font-semibold text-xs uppercase tracking-widest text-slate-500">Abo-Nutzungslimits (Claude)</div>
          {d.abo.length === 0 ? <p className="px-4 pb-4 text-sm text-slate-500">Noch keine Werte. Sie kommen, sobald auf einem Werkstatt-PC Claude Code mit dem Abo arbeitet oder die Statuszeile eingerichtet ist.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-t border-slate-200 dark:border-slate-800"><th className="px-4 py-2">Mitglied</th><th className="px-4 py-2">5-Stunden-Fenster</th><th className="px-4 py-2">Woche</th><th className="px-4 py-2">Stand</th></tr></thead>
              <tbody>{d.abo.map((a) => { const { f, w } = aboWerte(a); return (
                <tr key={a.benutzer_id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5">{wer(a.benutzer_id)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{a.fuenf_std_kein ? <b>kein Limit</b> : <><b>{f == null ? "–" : `${Math.round(f)} %`}</b> <Balken wert={f} warn={klein} pause={pause} /><div className="text-xs text-slate-500">zurück: {uhr(a.fuenf_std_reset)}</div></>}</td>
                  <td className="px-4 py-2.5 tabular-nums"><b>{w == null ? "–" : `${Math.round(w)} %`}</b> <Balken wert={w} warn={klein} pause={pause} /><div className="text-xs text-slate-500">zurück: {uhr(a.woche_reset)}</div></td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmt(a.aktualisiert)}<br />{a.quelle === "statuszeile" ? "Statuszeile" : "Werkstatt"}</td>
                </tr>); })}</tbody></table></div>)}
          <p className="p-4 text-xs text-slate-500">Die Werte meldet Claude Code auf dem PC des Mitglieds; sie gelten für das ganze Abo (Chats in claude.ai und Claude Code zusammen) und sind so aktuell wie die letzte Nutzung von Claude Code.</p>
        </div>
        <div className={card}>
          <div className="p-4 font-display font-semibold text-xs uppercase tracking-widest text-slate-500">Arbeit der Werkstatt diesen Monat</div>
          <table className="w-full text-sm border-t border-slate-200 dark:border-slate-800">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2">Projekt</th><th className="px-4 py-2 text-right">Aufträge</th><th className="px-4 py-2 text-right">Rechnerischer Wert</th></tr></thead>
            <tbody>{d.verbrauch.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-slate-500">Noch keine Arbeit in diesem Monat.</td></tr>
              : d.verbrauch.map((v) => <tr key={v.projekt_id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-2">{name(v.projekt_id)}</td><td className="px-4 py-2 text-right tabular-nums">{v.auftraege}</td><td className="px-4 py-2 text-right tabular-nums">{usd(v.kosten_usd)}</td></tr>)}</tbody>
          </table>
          <p className="p-4 text-xs text-slate-500">Die Werkstatt arbeitet über dein Abo – es entstehen keine Extrakosten. Der rechnerische Wert zeigt, was die Arbeit über die Schnittstelle gekostet hätte.</p>
        </div>
      </div>
      <div className={card}>
        <div className="p-4 font-display font-semibold text-xs uppercase tracking-widest text-slate-500">So achtet die Werkstatt auf dein Abo</div>
        <div className="px-4 pb-4 flex flex-col gap-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">Modell nach Aufwand: Texte und kleine Änderungen klein, normale Funktionen mittel, Datenbank, Rechte und Risiko HOCH groß; bei Fehlschlag eine Stufe höher.</p>
          <label className="flex flex-col gap-1 text-slate-500">Ab diesem Stand eine Modellstufe kleiner (Prozent)<input id="cs-klein" type="number" min="10" max="100" className={input} value={klein} onChange={(x) => setKlein(x.target.value)} disabled={!admin} /></label>
          <label className="flex flex-col gap-1 text-slate-500">Ab diesem Stand keine neuen Aufträge bis zur Rücksetzung (Prozent)<input id="cs-pause" type="number" min="10" max="100" className={input} value={pause} onChange={(x) => setPause(x.target.value)} disabled={!admin} /></label>
          {admin ? <button type="button" className={btn} onClick={speichern}>Speichern</button> : <p className="text-xs text-slate-500">Die Schwellen setzt der Admin.</p>}
          {isDesktop() && <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col gap-2">
            <p className="text-xs text-slate-500">Damit die Werte auch aktuell sind, wenn du selbst mit Claude Code arbeitest: Statuszeile einrichten (ändert ~/.claude/settings.json, eine vorhandene eigene Statuszeile bleibt).</p>
            <button type="button" className={ghost} onClick={statuszeile}>Statuszeile in Claude Code einrichten</button></div>}
        </div>
      </div>
    </div>
  );
}

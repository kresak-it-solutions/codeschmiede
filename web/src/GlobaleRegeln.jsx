// Globale Regeln der ganzen Codeschmiede (0.13.1, Entscheidung Gerhard 02.11.2026 09:50/09:54/09:55): <Projekte-Ordner>\Regeln\CLAUDE.md
// gilt für ALLE Projekte – zusätzlich zu den Projektregeln. Rangfolge: 1 Sicherheit › 2 Projektregeln › 3 globale Regeln › 4 Regelwerk.
// Gleicher Schutz wie die REGELN.md der Projekte: jede Werkstatt meldet ihre Fassung (Prüfsumme + Text, Datenbank 0056), nur der Admin bestätigt
// bzw. widerruft, es gilt nur die neueste bestätigte Fassung. Ordner anlegen und „Im Explorer öffnen“ macht das Programm (nie mit Pfaden aus der Oberfläche).
import React, { useEffect, useState } from "react";
import { Globe2, Loader2, ShieldCheck, X, FolderOpen, FolderPlus } from "lucide-react";
import { supabase } from "./supabase";
import { btn, card, fehler, ghost } from "./bausteine/grund";
import { useBestaetigen } from "./bausteine/grund";
import { useProjektordner, verknuepfen, imExplorer } from "./daten/projektordner";

const GLOBAL = "_regeln";   // Kennung des Ordners „Regeln“ für die Befehle des Programms
const zeit = (d) => new Date(d).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });

function useGlobalStand() {
  const [z, setZ] = useState({ zeilen: [], frei: [], fehler: null });
  useEffect(() => {
    let aus = false;
    const holen = async () => {
      const [a, b] = await Promise.all([supabase.from("ws_regeln_global_stand").select("pc_id, sha, text, konflikte, neben, gemeldet"),
        supabase.from("ws_regeln_global_freigaben").select("sha, am").order("am", { ascending: false })]);
      if (!aus) setZ(a.error || b.error ? { zeilen: [], frei: [], fehler: a.error || b.error } : { zeilen: a.data || [], frei: b.data || [], fehler: null });
    };
    holen();
    const ch = supabase.channel(`global-regeln-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "ws_regeln_global_stand" }, holen)
      .on("postgres_changes", { event: "*", schema: "public", table: "ws_regeln_global_freigaben" }, holen).subscribe();
    return () => { aus = true; supabase.removeChannel(ch); };
  }, []);
  return z;
}

export default function GlobaleRegeln({ d, admin, toast }) {
  const z = useGlobalStand();
  const [ort, ortHolen] = useProjektordner([]);
  const bestaetigen = useBestaetigen();
  const [busy, setBusy] = useState("");
  const gilt = z.frei[0]?.sha || null;
  const pcName = (id) => (d.pcs || []).find((p) => p.id === id)?.name || "Werkstatt-PC";
  const offen = Object.values(z.zeilen.filter((x) => x.sha !== gilt).reduce((m, x) => { (m[x.sha] ||= { ...x, pcs: [] }).pcs.push(x.pc_id); return m; }, {}));
  const konflikte = z.zeilen.filter((x) => x.konflikte > 0);
  const neben = z.zeilen.filter((x) => x.neben);
  const lauf = async (schluessel, f, ok) => { setBusy(schluessel); try { await f(); if (ok) toast(ok); } catch (e) { toast(fehler(e)); } finally { setBusy(""); } };
  const rpc = async (name, args) => { const { error } = await supabase.rpc(name, args); if (error) throw error; };
  const widerrufen = async (sha) => {
    if (!(await bestaetigen({ titel: "Bestätigung widerrufen?", text: "Danach gilt diese Fassung der globalen Regeln nicht mehr. Es gilt die davor bestätigte (falls es eine gibt), sonst keine globalen Regeln.", ja: "Widerrufen", gefahr: true }))) return;
    lauf(`w-${sha}`, () => rpc("ws_regeln_global_widerrufen", { p_sha: sha }), "Bestätigung widerrufen");
  };
  // Dieser PC (Programm): Ordner da?
  const lokal = !ort || ort.ohne ? null : !ort.basis ? "kein-basis" : !ort.basis_da ? "fehlt" : !ort.global_da ? "kein" : "ok";
  return (
    <section className={`${card} p-3.5 flex flex-col gap-2.5`} aria-label="Globale Regeln">
      <h3 className="font-display font-bold text-lg flex items-center gap-2"><Globe2 className="w-5 h-5 text-emerald-700" aria-hidden="true" />Globale Regeln</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300">Die Datei <span className="font-mono">Regeln\CLAUDE.md</span> im Projekte-Ordner (z. B. <span className="font-mono">D:\Codeschmiede\Regeln\CLAUDE.md</span>) gilt für <b>alle</b> Projekte – zusätzlich zu den Projektregeln. Rangfolge überall (Aufträge, alle Chats, Prüfungen, auch andere KI-Anbieter): 1 Sicherheit › 2 Projektregeln › 3 globale Regeln › 4 Regelwerk. Eine geänderte Datei gilt erst nach deiner Bestätigung; die Werkstatt-KI darf im Ordner nichts ändern.</p>
      {lokal && <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 font-semibold ${lokal === "ok" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>
          Dieser PC: {lokal === "ok" ? (ort.global_regeln ? "Ordner da · CLAUDE.md vorhanden" : "Ordner da · CLAUDE.md wird angelegt") : lokal === "kein-basis" ? "Projekte-Ordner noch nicht festgelegt" : lokal === "fehlt" ? "Festplatte fehlt" : "Ordner „Regeln“ fehlt"}</span>
        {lokal === "kein" && <button type="button" className={`${ghost} h-9 text-xs`} disabled={!!busy} onClick={() => lauf("anlegen", async () => { await verknuepfen(GLOBAL); await ortHolen(); }, "Ordner „Regeln“ angelegt – die Werkstatt legt CLAUDE.md an (nur, wenn sie fehlt)")}>
          {busy === "anlegen" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}Ordner anlegen</button>}
        {lokal === "ok" && <button type="button" className={`${ghost} h-9 text-xs`} disabled={!!busy} onClick={() => lauf("oeffnen", () => imExplorer(GLOBAL))}><FolderOpen className="w-3.5 h-3.5" />Im Explorer öffnen</button>}
      </div>}
      {z.fehler && <p className="text-xs text-slate-500">Stand der globalen Regeln nicht lesbar (Datenbank 0056 noch nicht eingespielt?).</p>}
      {konflikte.length > 0 && <p className="text-sm rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 px-3 py-2.5" role="alert">
        <b>Regel-Konflikt:</b> {konflikte[0].konflikte} Stelle(n) der globalen Regeln widersprechen der Sicherheit (gemeldet von {konflikte.map((x) => pcName(x.pc_id)).join(", ")}). Die Sicherheitsregel der Codeschmiede gilt – bitte <span className="font-mono">Regeln\CLAUDE.md</span> anpassen.
        <span className="block text-xs mt-1">Die Erkennung ist nur ein Hinweis – die Sicherheitsregeln gelten fest, auch wenn hier nichts rot ist.</span></p>}
      {neben.length > 0 && <p className="text-sm rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 px-3 py-2">
        <b>Nur CLAUDE.md gilt:</b> Im Ordner „Regeln“ liegt zusätzlich eine <span className="font-mono">REGELN.md</span> ({neben.map((x) => pcName(x.pc_id)).join(", ")}). Sie wird nicht gelesen und nicht gemischt – Inhalte bitte nach <span className="font-mono">CLAUDE.md</span> übernehmen.</p>}
      {offen.map((r) => (
        <div key={r.sha} className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 flex flex-col gap-2 text-sm text-amber-950 dark:text-amber-100" aria-label="Globale Regeln bestätigen">
          <b className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" aria-hidden="true" />{gilt ? "Globale Regeln geändert – bestätigen" : "Globale Regeln bestätigen"}</b>
          <span>Gemeldet von: {r.pcs.map(pcName).join(", ")}. Es gilt nur die zuletzt von dir bestätigte Fassung{gilt ? ` (zuletzt bestätigt ${zeit(z.frei[0].am)})` : " – bisher keine, es gelten keine globalen Regeln"}.{r.konflikte > 0 ? ` Achtung: ${r.konflikte} Stelle(n) widersprechen der Sicherheit – dort gilt trotzdem die Sicherheitsregel.` : ""}</span>
          <details className="rounded-lg bg-white/70 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-900"><summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold">Text ansehen (Prüfsumme {r.sha.slice(0, 12)})</summary>
            <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto font-mono text-slate-800 dark:text-slate-200">{r.text || ""}</pre></details>
          {admin ? <button type="button" className={`${btn} self-start`} disabled={!!busy} onClick={() => lauf(`b-${r.sha}`, () => rpc("ws_regeln_global_bestaetigen", { p_sha: r.sha }), "Globale Regeln bestätigt – ab dem nächsten Auftrag, Chat und jeder Prüfung gilt diese Fassung")}>
            {busy === `b-${r.sha}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Diese Fassung bestätigen</button>
            : <span className="text-xs">Bestätigen kann nur der Admin.</span>}
        </div>))}
      {z.zeilen.length > 0 && <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Globale Regeln je PC">{z.zeilen.map((x) => (
        <li key={x.pc_id} className={`rounded-full px-2.5 py-0.5 font-semibold ${x.sha === gilt ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>
          {pcName(x.pc_id)} · {x.sha === gilt ? "gilt" : "nicht bestätigt"} <span className="font-mono font-normal">({x.sha.slice(0, 8)})</span></li>))}</ul>}
      {!z.zeilen.length && !z.fehler && <p className="text-xs text-slate-500">Noch kein Werkstatt-PC hat die globalen Regeln gemeldet (Ordner „Regeln“ im Projekte-Ordner anlegen, Werkstatt an).</p>}
      {z.frei.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Bestätigte Fassungen ({z.frei.length})</summary>
        <ul className="mt-2 flex flex-col gap-1.5">{z.frei.map((f, i) => (
          <li key={f.sha} className="flex flex-wrap items-center gap-2 text-xs"><span className="font-mono">{f.sha.slice(0, 12)}</span><span className="text-slate-500">bestätigt {zeit(f.am)}</span>
            {i === 0 ? <span className="rounded-full px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">gilt</span> : <span className="text-slate-500">ältere Fassung, gilt nicht</span>}
            {admin && <button type="button" className={`${ghost} h-8 text-xs`} disabled={!!busy} onClick={() => widerrufen(f.sha)}>{busy === `w-${f.sha}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Widerrufen</button>}</li>))}</ul>
      </details>}
    </section>);
}

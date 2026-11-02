// Kopfzeile – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useEffect, useState } from "react";
import { BellRing, Check, ChevronDown, ClipboardList, FolderCog, FolderInput, FolderPlus, Info, Layers, Loader2, MessageSquare, Power, Search } from "lucide-react";
import CodeschmiedeZeichen from "../Zeichen";
import { LogoZeichen } from "../Logo";
import { ROLLEN, WS_ICON } from "../config";
import { btn, card, fehler, input, useFokusfalle } from "../bausteine/grund";
import { supabase } from "../supabase";
import { PushEinstellung } from "../Push";

// ---------------- Kopfzeile (Entwurf 1.1) ----------------
export function ProjektWahl({ projekte, aktuell, PIcon, admin, onWahl, onNeu, onEinlesen, onVerwalten }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} aria-haspopup="menu" className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-sm font-semibold max-w-[220px]">
        {aktuell?.logo ? <LogoZeichen werte={aktuell.logo} groesse={20} /> : <span className="w-6 h-6 rounded-md bg-emerald-700 text-white grid place-items-center shrink-0"><PIcon className="w-3.5 h-3.5" /></span>}
        <span className="truncate hidden sm:inline">{aktuell?.name || "Projekt wählen"}</span><ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /></button>
      {offen && <>
        <div className="fixed inset-0 z-40" onClick={() => setOffen(false)} aria-hidden="true" />
        <div role="menu" className="absolute z-50 left-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 text-sm">
          <div className="px-2.5 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Projekte</div>
          {projekte.map((p) => { const I = WS_ICON[p.symbol] || Layers; return (
            <button key={p.id} role="menuitem" type="button" onClick={() => { onWahl(p.id); setOffen(false); }} className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left ${p.id === aktuell?.id ? "bg-emerald-50 dark:bg-emerald-950 font-semibold" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
              {p.logo ? <LogoZeichen werte={p.logo} groesse={18} /> : <I className="w-4 h-4" />}<span className="truncate">{p.name}</span>{p.id === aktuell?.id && <Check className="w-4 h-4 ml-auto text-emerald-700" />}</button>); })}
          {admin && <div className="border-t border-slate-100 dark:border-slate-800 mt-1.5 pt-1.5">
            <button role="menuitem" type="button" onClick={() => { onNeu(); setOffen(false); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><FolderPlus className="w-4 h-4" />Neues Projekt</button>
            {onEinlesen && <button role="menuitem" type="button" onClick={() => { onEinlesen(); setOffen(false); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><FolderInput className="w-4 h-4" />Bestehendes Projekt einlesen</button>}
            <button role="menuitem" type="button" onClick={() => { onVerwalten(); setOffen(false); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><FolderCog className="w-4 h-4" />Projekte verwalten</button>
          </div>}
        </div></>}
    </div>);
}

export function Benutzermenue({ ich, toast }) {
  const [offen, setOffen] = useState(false); const [push, setPush] = useState(false);
  const kurz = ich.name.split(" ").map((s) => s[0]).join("").slice(0, 2);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOffen(!offen)} aria-expanded={offen} aria-haspopup="menu" title={ich.name} className="w-9 h-9 rounded-full bg-emerald-600 text-white grid place-items-center text-xs font-bold">{kurz}</button>
      {offen && <>
        <div className="fixed inset-0 z-40" onClick={() => setOffen(false)} aria-hidden="true" />
        <div role="menu" className="absolute z-50 right-0 mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 text-sm">
          <div className="px-2.5 py-2"><b className="block truncate">{ich.name}</b><span className="text-xs text-slate-500">{ROLLEN[ich.rolle]}</span></div>
          <button role="menuitem" type="button" onClick={() => { setOffen(false); setPush(true); }} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><BellRing className="w-4 h-4" />Push aufs Handy</button>
          <button role="menuitem" type="button" onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"><Power className="w-4 h-4" />Abmelden</button>
        </div></>}
      {push && <PushEinstellung toast={toast || (() => {})} onClose={() => setPush(false)} />}
    </div>);
}

// Kennzahlen über der Zentrale (Entwurf 1.1): was auf dich wartet, was läuft, was in Prüfung ist, was diese Woche live ging
export function Kennzahlen({ d, onChat, onErledigen }) {
  const a = d.auftraege; const woche = Date.now() - 7 * 864e5;
  const warten = a.filter((x) => x.offeneFrage || ["freigabe", "zusammen"].includes(x.stand)).length + (d.erlaubnisse?.length || 0);
  const kacheln = [
    ["Wartet auf dich", warten, `${a.filter((x) => ["freigabe", "zusammen"].includes(x.stand)).length} Freigaben · ${a.filter((x) => x.offeneFrage).length} Rückfragen`, warten > 0, onErledigen],
    ["In Arbeit", a.filter((x) => x.stand === "laeuft").length, `${a.filter((x) => x.stand === "wartet").length} warten auf die Werkstatt`],
    ["In Prüfung", a.filter((x) => ["sicherheit", "feature"].includes(x.stand)).length, "Sicherheit · Feature"],
    ["Live diese Woche", a.filter((x) => x.stand === "wissen" && Date.parse(x.geaendert) >= woche).length, "fertig und veröffentlicht"],
  ];
  return (
    <div className="flex flex-col gap-3 mb-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kacheln.map(([t, n, u, warn, klick]) => {
          const Inhalt = <><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t}</span><b className={`block font-display text-[28px] leading-tight tabular-nums ${warn ? "text-amber-600" : ""}`}>{n}</b><span className="text-xs text-slate-500">{u}</span></>;
          return klick ? <button key={t} type="button" onClick={klick} className={`${card} text-left px-4 py-3 hover:border-emerald-500`}>{Inhalt}</button> : <div key={t} className={`${card} px-4 py-3`}>{Inhalt}</div>;
        })}
      </div>
      <button type="button" onClick={onChat} className="self-start inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"><MessageSquare className="w-4 h-4" />Neues Vorhaben? Erst im Chat besprechen</button>
    </div>);
}

// Suchen & Springen (Strg K): Seiten, Features, Aufträge und eigene Unterhaltungen
export function Befehlsleiste({ d, nav, onSchliessen, onSeite, onFeature, onAuftrag, onChat }) {
  const fokusfalle = useFokusfalle();   // Fokus bleibt im Dialog (Befund B2)
  const [q, setQ] = useState(""); const [aktiv, setAktiv] = useState(0); const [chats, setChats] = useState([]);
  useEffect(() => {
    let aus = false;
    supabase.from("ws_unterhaltungen").select("id, titel").eq("projekt_id", d.projektId || "").order("geaendert", { ascending: false }).limit(200).then(({ data }) => { if (!aus) setChats(data || []); });
    return () => { aus = true; };
  }, [d.projektId]);
  const t = q.trim().toLowerCase();
  const passt = (...w) => !t || w.some((x) => String(x || "").toLowerCase().includes(t));
  const treffer = [
    ...nav.filter(([, n]) => passt(n)).map(([id, n, Icon]) => ({ art: "Seite", text: n, Icon, los: () => onSeite(id) })),
    ...chats.filter((c) => passt(c.titel)).slice(0, 6).map((c) => ({ art: "Chat", text: c.titel, Icon: MessageSquare, los: () => onChat(c.id) })),
    ...(t ? d.features.filter((f) => !f.ausgebaut && passt(f.name, f.id)).slice(0, 8).map((f) => ({ art: f.id, text: f.name, Icon: Layers, los: () => onFeature(f) })) : []),
    ...(t ? d.auftraege.filter((a) => passt(a.titel, `#${a.id}`, String(a.id))).slice(0, 6).map((a) => ({ art: `#${a.id}`, text: a.titel, Icon: ClipboardList, los: () => onAuftrag(a) })) : []),
  ].slice(0, 30);
  const waehle = (x) => { x.los(); onSchliessen(); };
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 grid justify-items-center items-start pt-[12vh] px-4" onClick={onSchliessen}>
      <div ref={fokusfalle} role="dialog" aria-modal="true" aria-label="Suchen und springen" onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <label className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800"><Search className="w-5 h-5 text-slate-400" />
          <input id="cs-befehl" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setAktiv(0); }} placeholder="Seite, Feature, Auftrag oder Chat …" className="flex-1 bg-transparent outline-none text-[15px]"
            onKeyDown={(e) => { if (e.key === "Escape") onSchliessen(); if (e.key === "ArrowDown") { e.preventDefault(); setAktiv(Math.min(aktiv + 1, treffer.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setAktiv(Math.max(aktiv - 1, 0)); } if (e.key === "Enter" && treffer[aktiv]) waehle(treffer[aktiv]); }} /></label>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox" aria-label="Treffer">
          {treffer.map((x, i) => (
            <li key={i} role="option" aria-selected={i === aktiv}><button type="button" onMouseEnter={() => setAktiv(i)} onClick={() => waehle(x)} className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${i === aktiv ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}>
              <x.Icon className="w-4 h-4 text-slate-500 shrink-0" /><span className="truncate">{x.text}</span><span className="ml-auto text-xs text-slate-400 font-mono shrink-0">{x.art}</span></button></li>))}
          {!treffer.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Nichts gefunden.</li>}
        </ul>
      </div>
    </div>);
}

export function Zentriert({ children }) {
  return <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-body p-6"><div className="flex flex-col items-center gap-3 text-center max-w-sm">{children}</div></div>;
}

export function EinladungAnnehmen({ sitzung, onFertig }) {
  const [name, setName] = useState(sitzung.user.user_metadata?.full_name || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const los = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("ws_einladung_annehmen", { p_name: name.trim() });
    setBusy(false);
    if (error) setErr(fehler(error)); else onFertig();
  };
  return (
    <Zentriert>
      <CodeschmiedeZeichen groesse={48} />
      <h1 className="font-display font-bold text-2xl">Codeschmiede</h1>
      <p className="text-sm">Hast du eine Einladung bekommen? Gib deinen Namen ein (Vorname Nachname) und tritt bei.</p><button type="button" className="text-xs text-slate-500 underline" onClick={() => supabase.auth.signOut()}>Mit anderem Konto anmelden</button>
      <input id="ws-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Vorname Nachname" />
      <button type="button" className={`${btn} w-full`} disabled={busy} onClick={los}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Einladung annehmen</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Zentriert>
  );
}

export function UnbekannteAnsicht({ ansicht }) {
  const t = `Unbekannte Ansicht „${ansicht}“.`;
  return <div className={`${card} p-8 text-slate-500 flex items-center gap-3`}><Info className="w-5 h-5" />{t}</div>;
}

// Zentrale – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { werkzeugName } from "../daten/werkzeuge";
import { Bot, Check, CircleCheck, FolderInput, FolderPlus, GitMerge, GitPullRequest, Globe, Layers, Loader2, MessageSquare, PenLine, Plus, RefreshCw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { ABGESCHLOSSEN, Badge, Dialog, STEPS, STEP_IDX, btn, card, fehler, fmt, ghost, input } from "../bausteine/grund";
import { AufbauBanner, GruppeLoeschen, NeueObergruppe, Umbenennen, bereichName, gruppeLoeschbar, ohneMenue } from "../Aufbau";
import { AufgabeBeilagen, AufgabePlakette, AufgabenImChat } from "../Aufgaben";
import { FeatureArbeitsplatz } from "./LiveVorschau";
import { FeatureBezuege, MitErwaehnung, erwaehnte } from "../Bezuege";
import { FreigabeKnopf, ZusammenKnopf } from "../Auftragsknoepfe";
import KonzeptArbeitsplatz from "../Konzept";
import { Loeschen, NeueGruppe, NeuesFeature } from "./Verwaltung";
import { Markdown } from "../Markdown";
import { WS_ICON } from "../config";
import { supabase } from "../supabase";
import { TEXT_MAX } from "../textGrenze";
import { useAuftragDetails } from "../daten/werkstattDaten";
import { ChatKopf, ChatNachricht, ChatEingabe } from "../bausteine/chat";
import { Leerzustand } from "../bausteine/zustand";
import { StatusPunkt, useFeatureStatus } from "./Arbeitsplatz";
import { usePunkte } from "../daten/punkte";

// ---------------- Zentrale ----------------
// nurGlobal: Ansicht „Globale Einstellungen“ (Anweisung Gerhard 2026-10-23 10:20) – Bereich, der in der App nie als eigener Bereich erscheint;
// seine Features gelten für die ganze App. In der Auftrags-Zentrale wird er ausgeblendet.
export function Zentrale({ d: alle, ich, toast, nurGlobal = false, onDesigner, start, onCode, onKi }) {
  const d = useMemo(() => {
    const bereiche = alle.bereiche.filter((b) => !!b.global === nurGlobal);
    const bids = new Set(bereiche.map((b) => b.id));
    const gruppen = alle.gruppen.filter((g) => bids.has(g.bereich_id)); const gids = new Set(gruppen.map((g) => g.id));
    const fids = new Set(alle.features.filter((f) => gids.has(f.gruppe_id)).map((f) => f.id));
    return { ...alle, bereiche, gruppen, auftraege: nurGlobal ? alle.auftraege.filter((a) => gids.has(a.gruppe_id) || fids.has(a.feature_id)) : alle.auftraege };
  }, [alle, nurGlobal]);
  // Start immer im Konzept (erste Gruppe im Bereich App, Konzept zuerst 2026-10-23); ohne Konzept-Gruppe die erste Gruppe
  const [sel, setSel] = useState(() => { if (start?.g && d.gruppen.some((x) => x.id === start.g)) return { g: start.g, f: start.f || null }; const k = !nurGlobal && alle.projekte.find((p) => p.id === alle.projektId)?.konzept_gruppe_id; return { g: (k && d.gruppen.some((x) => x.id === k) ? k : d.gruppen[0]?.id), f: null }; });
  const [dlg, setDlg] = useState(null);
  const rolle = ich.rolle === "admin" ? "admin" : d.mitglieder.find((m) => m.projekt_id === d.projektId && m.benutzer_id === ich.id)?.rolle;
  const darf = useCallback((bereich, recht) => rolle === "admin" || d.rechte.some((r) => r.benutzer_id === ich.id && r.bereich_id === bereich && r[recht] && (recht === "auftraege" ? ["entwickler", "texter"].includes(rolle) : rolle === "entwickler")), [d.rechte, ich, rolle]);
  const g = d.gruppen.find((x) => x.id === sel.g) || d.gruppen[0];
  const feats = d.features.filter((f) => f.gruppe_id === g?.id && !f.ausgebaut);
  const f = sel.f ? d.features.find((x) => x.id === sel.f) : null;
  const aufFor = (gid, fid) => d.auftraege.filter((a) => (fid === undefined ? a.gruppe_id === gid : a.feature_id === fid));
  const [station, setStation] = useState(null);
  const [platz, setPlatz] = useState(() => start?.f || null); // Feature-Arbeitsplatz (Doppelklick)
  // Offene Punkte (Aufgaben an Features) und Status-Punkt je Feature (0.15.0, Arbeitsplatz für alle Arten)
  const punkteDaten = usePunkte(alle.projektId);
  const statusVon = useFeatureStatus(d, punkteDaten);
  useEffect(() => { if (!start) return; setStation(null); if (start.f) setPlatz(start.f); else { setPlatz(null); setSel({ g: start.g, f: null }); } }, [start?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // Features selbst zuordnen (Anweisung Gerhard 2026-10-23 10:26): Admin, per Dialog oder Ziehen auf eine Gruppe
  const kannVerschieben = ich.rolle === "admin";
  const [ziel, setZiel] = useState(null);
  const verschiebe = async (fid, gid) => {
    const feat = alle.features.find((x) => x.id === fid); if (!feat || feat.gruppe_id === gid) return;
    const { error } = await supabase.rpc("ws_feature_verschieben", { p_feature: fid, p_gruppe: gid });
    const gz = alle.gruppen.find((x) => x.id === gid);
    if (error) toast(fehler(error)); else { toast(`„${feat.name}“ verschoben nach ${gz?.name || gid}`); await alle.holen?.(); }
  };
  // Aufbau wie in der App (0.9.12): Gruppen auf eine Obergruppe bzw. vor eine andere Gruppe ziehen, Obergruppen umsortieren
  const [dlgA, setDlgA] = useState(null);
  const einordnen = async (gid, bid, vor = null) => {
    const gr = alle.gruppen.find((x) => x.id === gid); if (!gr || gid === vor) return;
    const { error } = await supabase.rpc("ws_gruppe_einordnen", { p_gruppe: gid, p_bereich: bid, p_vor: vor });
    if (error) toast(fehler(error)); else { toast(`„${gr.name}“ → ${bereichName(alle.bereiche.find((b) => b.id === bid))}`); await alle.holen?.(); }
  };
  const bereichReihe = async (bid, vorBid) => {
    const b = alle.bereiche.find((x) => x.id === bid); const vor = alle.bereiche.find((x) => x.id === vorBid);
    if (!b || !vor || b.id === vor.id || b.app_teil !== vor.app_teil) return;
    const alleT = alle.bereiche.filter((x) => x.app_teil === b.app_teil).sort((x, y) => x.reihenfolge - y.reihenfolge);
    const liste = alleT.filter((x) => x.id !== b.id);
    // nach unten gezogen = hinter das Ziel, nach oben = davor (so geht auch die letzte Stelle)
    const nachUnten = alleT.findIndex((x) => x.id === b.id) < alleT.findIndex((x) => x.id === vor.id);
    const pos = liste.findIndex((x) => x.id === vor.id) + (nachUnten ? 2 : 1);
    const { error } = await supabase.rpc("ws_bereich_aendern", { p_bereich: bid, p_name: null, p_reihe: pos });
    if (error) toast(fehler(error)); else await alle.holen?.();
  };
  const istGlobal = (bid) => !!alle.bereiche.find((b) => b.id === bid)?.global;
  // Gezogene Gruppe merken: Ziel nur, wenn es zum selben Teil gehört (App ↔ App, ERP ↔ ERP)
  const [zug, setZug] = useState(null); const [zugB, setZugB] = useState(null);
  const teilVon = (bid) => alle.bereiche.find((b) => b.id === bid)?.app_teil;
  const passt = (bid) => !!zug && ["app", "erp"].includes(teilVon(bid)) && teilVon(bid) === teilVon(alle.gruppen.find((x) => x.id === zug)?.bereich_id);
  const ablage = (gid) => kannVerschieben ? {
    onDragOver: (e) => { if (e.dataTransfer.types.includes("text/cs-feature") || (e.dataTransfer.types.includes("text/cs-gruppe") && !istGlobal(alle.gruppen.find((x) => x.id === gid)?.bereich_id) && passt(alle.gruppen.find((x) => x.id === gid)?.bereich_id))) { e.preventDefault(); setZiel(gid); } },
    onDragLeave: () => setZiel((z) => (z === gid ? null : z)),
    onDrop: (e) => {
      e.preventDefault(); setZiel(null);
      const fid = e.dataTransfer.getData("text/cs-feature"); if (fid) { verschiebe(fid, gid); return; }
      const grp = e.dataTransfer.getData("text/cs-gruppe"); const zielG = alle.gruppen.find((x) => x.id === gid);
      if (grp && zielG) einordnen(grp, zielG.bereich_id, gid);
    },
  } : {};
  const kopfAblage = (b) => kannVerschieben && !b.global ? {
    onDragOver: (e) => { if ((e.dataTransfer.types.includes("text/cs-gruppe") && passt(b.id)) || (e.dataTransfer.types.includes("text/cs-bereich") && zugB && teilVon(zugB) === b.app_teil)) { e.preventDefault(); setZiel("b:" + b.id); } },
    onDragLeave: () => setZiel((z) => (z === "b:" + b.id ? null : z)),
    onDrop: (e) => {
      e.preventDefault(); setZiel(null);
      const grp = e.dataTransfer.getData("text/cs-gruppe"); if (grp) { einordnen(grp, b.id, null); return; }
      const ber = e.dataTransfer.getData("text/cs-bereich"); if (ber) bereichReihe(ber, b.id);
    },
  } : {};
  const globalGruppe = alle.gruppen.find((x) => alle.bereiche.find((b) => b.id === x.bereich_id)?.global);
  const fragen = d.auftraege.filter((a) => a.offeneFrage).length;
  if (!g) return <div className={`${card} p-8 text-slate-500`}>{nurGlobal ? "Für dieses Projekt gibt es noch keine globalen Einstellungen (Datenbank 0009 einspielen)." : "Noch keine Gruppen angelegt."}</div>;
  const platzF = platz ? d.features.find((x) => x.id === platz) : null;
  const platzG = platzF ? d.gruppen.find((x) => x.id === platzF.gruppe_id) : null;
  // Gruppe „Konzept“ (Datenbank 0020): eigener Arbeitsplatz mit Chat und Konzept-Stand statt Feature-Karten
  const konzeptId = alle.projekte.find((p) => p.id === alle.projektId)?.konzept_gruppe_id;
  const istKonzept = !nurGlobal && !!g && g.id === konzeptId;
  return (
    <>
      {!nurGlobal && <AufbauBanner d={alle} ich={ich} offen={alle.aufbau || []} toast={toast} onFertig={() => alle.holen?.()} />}
      {nurGlobal && onKi && <div className={`${card} mb-4 px-3 py-2 flex flex-wrap items-center gap-2 text-sm`} role="note">
        <Globe className="w-4 h-4 text-emerald-700" /><span><b>KI-Anbieter</b> gelten global für alle Projekte (seit 0.18.0).</span>
        <button type="button" className={`${ghost} ml-auto`} onClick={onKi}>Globale Einstellungen › KI-Anbieter</button></div>}
      <div className="flex flex-wrap gap-1.5 mb-4" role="toolbar" aria-label="Weg eines Auftrags">
        {fragen > 0 && <button type="button" aria-pressed={station === "frage"} onClick={() => { setStation(station === "frage" ? null : "frage"); setPlatz(null); }} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 ${station === "frage" ? "ring-2 ring-amber-500" : ""}`}><i className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />{fragen} Rückfrage{fragen > 1 ? "n" : ""} an dich</button>}
        {STEPS.map(([s, t], i) => {
          const z = d.auftraege.filter((a) => STEP_IDX[a.stand] === i && (s !== "wissen" || a.stand === "wissen") && a.stand !== "frage").length;
          const handeln = ["freigabe", "zusammen"].includes(s) && z > 0;
          return (
            <button key={s} type="button" aria-pressed={station === s} onClick={() => { setStation(station === s ? null : s); setPlatz(null); }}
              className={`inline-flex items-center gap-2 rounded-full border pl-3 pr-1.5 py-1 text-sm font-semibold ${station === s ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-600"}`}>
              {t}<span className={`min-w-[24px] text-center rounded-full px-1.5 tabular-nums ${handeln ? "bg-amber-500 text-amber-950" : "bg-slate-100 dark:bg-slate-800"}`}>{z}</span>
            </button>);
        })}
      </div>
      {station ? <StationsUebersicht station={station} d={d} darf={darf} toast={toast} onSchliessen={() => setStation(null)} onOeffne={(fid) => { setStation(null); setPlatz(fid); }} onGruppe={(gid) => { setStation(null); setSel({ g: gid, f: null }); }} />
      : platzF ? <FeatureArbeitsplatz key={platzF.id} f={platzF} g={platzG} d={d} ich={ich} darf={darf} toast={toast} onZurueck={() => setPlatz(null)} onLoeschen={() => setDlg({ art: "loeschen", f: platzF })}
          punkteDaten={punkteDaten} onFeature={(fid) => setPlatz(fid)} onCode={onCode} />
      : <div className="grid gap-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_400px] items-start">
        <nav className={`${card} overflow-hidden`} aria-label="Bereiche und Gruppen">
          {d.bereiche.map((b) => (
            <div key={b.id} className="border-t first:border-t-0 border-slate-200 dark:border-slate-800 pb-1">
              <div {...kopfAblage(b)} draggable={kannVerschieben && !b.global && !!b.app_teil && ["app", "erp"].includes(b.app_teil)}
                onDragStart={(e) => { e.dataTransfer.setData("text/cs-bereich", b.id); e.dataTransfer.effectAllowed = "move"; setZugB(b.id); }} onDragEnd={() => { setZiel(null); setZugB(null); }}
                title={kannVerschieben && !b.global ? "Gruppen hierher ziehen · Obergruppe ziehen = Reihenfolge ändern" : undefined}
                className={`group/kopf flex items-center gap-1 font-display font-semibold text-xs uppercase tracking-widest text-slate-500 px-4 pt-3 pb-1 ${ziel === "b:" + b.id ? "ring-2 ring-inset ring-orange-500 bg-orange-50 dark:bg-orange-950/40" : ""}`}>
                <span className="truncate">{bereichName(b)}</span>
                {kannVerschieben && !b.global && ["app", "erp"].includes(b.app_teil) && <span className="ml-auto flex gap-0.5 opacity-0 group-hover/kopf:opacity-100 focus-within:opacity-100">
                  {b.id !== "start" && <button type="button" className="p-1 rounded hover:text-emerald-700" aria-label={`Obergruppe ${b.name} umbenennen`} onClick={() => setDlgA({ art: "bereich", b })}><PenLine className="w-3.5 h-3.5" /></button>}
                  {!d.gruppen.some((x) => x.bereich_id === b.id) && <button type="button" className="p-1 rounded hover:text-red-600" aria-label={`Leere Obergruppe ${b.name} entfernen`} onClick={async () => { const { error } = await supabase.rpc("ws_bereich_entfernen", { p_bereich: b.id }); if (error) toast(fehler(error)); else { toast(`Obergruppe „${b.name}“ entfernt`); await alle.holen?.(); } }}><Trash2 className="w-3.5 h-3.5" /></button>}
                </span>}
              </div>
              {d.gruppen.filter((x) => x.bereich_id === b.id).map((x) => {
                const Icon = WS_ICON[x.symbol] || Layers; const js = aufFor(x.id); const arbeitet = js.some((a) => a.stand === "laeuft"); const fr = js.filter((a) => a.offeneFrage).length;
                return (
                  <button key={x.id} type="button" aria-current={g.id === x.id} onClick={() => setSel({ g: x.id, f: null })} {...(x.id !== konzeptId ? ablage(x.id) : {})}
                    draggable={kannVerschieben && x.id !== konzeptId && !b.global && ["app", "erp"].includes(b.app_teil)} onDragStart={(e) => { e.dataTransfer.setData("text/cs-gruppe", x.id); e.dataTransfer.effectAllowed = "move"; setZug(x.id); }} onDragEnd={() => { setZiel(null); setZug(null); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-[15px] ${ziel === x.id ? "ring-2 ring-inset ring-orange-500 bg-orange-50 dark:bg-orange-950/40" : ""} ${g.id === x.id ? "bg-emerald-50 dark:bg-emerald-950/40 font-semibold shadow-[inset_3px_0_0_#047857]" : "hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20"}`}>
                    <Icon className="w-[18px] h-[18px] shrink-0" /><span className="min-w-0 truncate">{x.name}</span>
                    {ohneMenue(x, b) && <span className="shrink-0 text-xs font-semibold px-1.5 rounded border border-dashed border-slate-400 text-slate-500" title="Geplant – in der App gibt es dafür noch keinen Menüpunkt">geplant</span>}
                    <span className="ml-auto flex items-center gap-1.5">
                      {arbeitet && <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><i className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />arbeitet</span>}
                      {fr > 0 && <span className="text-xs font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5">{fr} Frage{fr > 1 ? "n" : ""}</span>}
                      {x.id !== konzeptId && <span className="text-xs text-slate-400 tabular-nums">{d.features.filter((y) => y.gruppe_id === x.id && !y.ausgebaut).length}</span>}
                    </span>
                  </button>);
              })}
            </div>))}
          {!nurGlobal && kannVerschieben && globalGruppe && <div {...ablage(globalGruppe.id)} className={`mx-3 my-2 rounded-lg border border-dashed px-3 py-2 text-xs flex items-center gap-2 ${ziel === globalGruppe.id ? "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200" : "border-slate-300 dark:border-slate-700 text-slate-500"}`}><Globe className="w-4 h-4" />Hierher ziehen = Globale Einstellungen</div>}
          {nurGlobal && <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800">Diese Features gelten für die ganze App und alle Nutzer. In der App selbst gibt es dafür keinen eigenen Bereich.</p>}
          {ich.rolle === "admin" && !nurGlobal && <button type="button" onClick={() => setDlg({ art: "gruppe" })} className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-emerald-700 font-semibold text-sm"><Plus className="w-4 h-4" />Neue Gruppe</button>}
          {ich.rolle === "admin" && !nurGlobal && <button type="button" onClick={() => setDlgA({ art: "obergruppe" })} className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-emerald-700 font-semibold text-sm"><FolderPlus className="w-4 h-4" />Neue Obergruppe</button>}
          {kannVerschieben && !nurGlobal && <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800">Ziehen: Feature auf eine Gruppe · Gruppe auf eine Obergruppe oder vor eine andere Gruppe · Obergruppe auf eine andere (Reihenfolge). Danach „In die App übernehmen“.</p>}
        </nav>

        {istKonzept ? <div className="min-w-0 xl:col-span-2"><KonzeptArbeitsplatz g={g} d={d} ich={ich} toast={toast} onDesigner={onDesigner} /></div> : <>
        <section className={card}>
          <div className="flex flex-wrap gap-3 items-start justify-between p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">{bereichName(d.bereiche.find((b) => b.id === g.bereich_id))}</div>
              <h2 className="font-display font-bold text-2xl flex items-center gap-2">{g.name}{kannVerschieben && !istKonzept && <button type="button" className="p-1 rounded text-slate-400 hover:text-emerald-700" aria-label={`Gruppe ${g.name} umbenennen`} onClick={() => setDlgA({ art: "gruppe", g })}><PenLine className="w-4 h-4" /></button>}
                {ich.rolle === "admin" && !istKonzept && (() => { const grund = gruppeLoeschbar(g, d.bereiche.find((b) => b.id === g.bereich_id), alle, konzeptId); return (
                  <button type="button" className={`p-1 rounded ${grund ? "text-slate-300 dark:text-slate-600" : "text-slate-400 hover:text-red-600"}`} title={grund ? `Nicht löschbar: ${grund}` : "Leere Gruppe löschen"} aria-label={`Gruppe ${g.name} löschen${grund ? ` – nicht möglich: ${grund}` : ""}`} onClick={() => setDlgA({ art: "gruppe-weg", g, grund })}><Trash2 className="w-4 h-4" /></button>); })()}</h2>
              {g.app_key && <div className="text-xs text-slate-500">Menüpunkt in der App: <code>{g.app_key}</code></div>}
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1"><Bot className="w-4 h-4" />Werkstatt {g.name} · <code className="text-xs">docs/gruppen/{g.id}.md</code></div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {darf(g.bereich_id, "auftraege") && <button type="button" className={ghost} onClick={() => setDlg({ art: "feature" })}><Plus className="w-4 h-4" />Neues Feature</button>}
              <button type="button" className={btn} onClick={() => setSel({ g: g.id, f: null })}><MessageSquare className="w-4 h-4" />Auftrag an die Gruppe</button>
            </div>
          </div>
          <div className="grid gap-3 p-4 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
            {feats.length === 0 && <div className="text-sm text-slate-500 col-span-full py-6 text-center">In dieser Gruppe gibt es noch keine Features.</div>}
            {feats.map((x) => {
              const js = aufFor(g.id, x.id); const arbeitet = js.some((a) => a.stand === "laeuft"); const neu = x.neu_bis && new Date(x.neu_bis) > new Date(); const frageHier = js.some((a) => a.offeneFrage);
              return (
                <button key={x.id} type="button" aria-current={sel.f === x.id} onClick={() => setSel({ g: g.id, f: x.id })} onDoubleClick={() => setPlatz(x.id)}
                  draggable={kannVerschieben} onDragStart={(e) => { e.dataTransfer.setData("text/cs-feature", x.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setZiel(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" && sel.f === x.id) { e.preventDefault(); setPlatz(x.id); } }} title="Einmal klicken: Kurzinfo · doppelt klicken: Arbeitsplatz mit Chat und Live-Vorschau"
                  className={`text-left flex flex-col gap-2 rounded-xl border p-3.5 min-w-0 ${frageHier ? "ring-1 ring-amber-400" : ""} ${x.ausgeblendet ? "opacity-55" : ""} ${sel.f === x.id ? "border-emerald-600 ring-1 ring-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-800 hover:border-emerald-600"} ${arbeitet ? "shadow-[inset_0_3px_0_#2563eb]" : ""}`}>
                  <div className="flex items-start justify-between gap-2"><h3 className="font-display font-semibold text-[17px] leading-tight flex items-center gap-2 min-w-0"><StatusPunkt status={statusVon(x)} /><span className="min-w-0">{x.name}</span></h3>
                    <span className="flex gap-1 flex-wrap justify-end">{frageHier && <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Rückfrage an dich</span>}{x.ausgeblendet && <span className="text-xs font-semibold px-2 py-0.5 rounded-md border border-dashed border-slate-400 text-slate-500">Ausgeblendet</span>}{neu && <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-700 text-white">Neu</span>}<Badge stand={x.stand} /></span></div>
                  {x.beschreibung && <p className="text-[13px] text-slate-500 line-clamp-2">{x.beschreibung}</p>}
                  <div className="mt-auto text-xs text-slate-500 flex items-center gap-1.5">
                    {arbeitet ? <span className="inline-flex items-center gap-1.5 font-semibold text-blue-600"><i className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />Hier wird gerade gearbeitet</span>
                      : js.length ? <span>Auftrag #{js[js.length - 1].id}: {STEPS[STEP_IDX[js[js.length - 1].stand]]?.[1]}</span> : <><MessageSquare className="w-3.5 h-3.5" />Auftrag geben</>}
                    {stundenGesamt(x) > 0 && <span className="ml-auto text-xs tabular-nums text-slate-500" title="Programmierstunden (geschätzt + gemessen)">{stundenGesamt(x).toLocaleString("de-AT")} h</span>}
                    <span className={`${stundenGesamt(x) > 0 ? "" : "ml-auto "}font-mono text-xs text-slate-400`}>{x.id}</span>
                  </div>
                </button>);
            })}
          </div>
        </section>

        {f ? <FeatureKurzinfo f={f} g={g} d={d} ich={ich} toast={toast} darfAuftrag={darf(g.bereich_id, "auftraege")} onOeffnen={() => setPlatz(f.id)} onGruppe={() => setSel({ g: g.id, f: null })} onVerschieben={kannVerschieben ? () => setDlg({ art: "verschieben", f }) : null} />
          : <AuftragsChat g={g} f={null} d={d} ich={ich} darf={darf} toast={toast} kanal="gruppe" onKonzept={konzeptId ? () => setSel({ g: konzeptId, f: null }) : undefined} />}
        </>}
      </div>}
      {dlg?.art === "feature" && <NeuesFeature g={g} ich={ich} texter={rolle === "texter"} toast={toast} onClose={() => setDlg(null)} onFertig={(id) => setSel({ g: g.id, f: id })} />}
      {dlg?.art === "gruppe" && <NeueGruppe d={d} ich={ich} toast={toast} onClose={() => setDlg(null)} onFertig={(id) => setSel({ g: id, f: null })} />}
      {dlgA?.art === "obergruppe" && <NeueObergruppe d={alle} toast={toast} onClose={() => setDlgA(null)} onFertig={() => alle.holen?.()} />}
      {dlgA?.art === "bereich" && <Umbenennen titel="Obergruppe umbenennen" alt={dlgA.b.name} onClose={() => setDlgA(null)} onSpeichern={async (n) => { const { error } = await supabase.rpc("ws_bereich_aendern", { p_bereich: dlgA.b.id, p_name: n, p_reihe: null }); if (error) toast(fehler(error)); else { setDlgA(null); await alle.holen?.(); } }} />}
      {dlgA?.art === "gruppe" && <Umbenennen titel="Gruppe umbenennen" alt={dlgA.g.name} onClose={() => setDlgA(null)} onSpeichern={async (n) => { const { error } = await supabase.rpc("ws_gruppe_umbenennen", { p_gruppe: dlgA.g.id, p_name: n }); if (error) toast(fehler(error)); else { setDlgA(null); await alle.holen?.(); } }} />}
      {dlgA?.art === "gruppe-weg" && <GruppeLoeschen g={dlgA.g} grund={dlgA.grund} onClose={() => setDlgA(null)} onLoeschen={async () => { const { error } = await supabase.rpc("ws_gruppe_loeschen", { p_gruppe: dlgA.g.id }); if (error) toast(fehler(error)); else { toast(`Gruppe „${dlgA.g.name}“ gelöscht`); setDlgA(null); setSel({ g: konzeptId || null, f: null }); await alle.holen?.(); } }} />}
      {dlg?.art === "loeschen" && <Loeschen f={dlg.f} g={g} ich={ich} toast={toast} onClose={() => setDlg(null)} />}
      {dlg?.art === "verschieben" && <Verschieben f={dlg.f} d={alle} onClose={() => setDlg(null)} onWahl={async (gid) => { setDlg(null); await verschiebe(dlg.f.id, gid); setSel({ g: g.id, f: null }); }} />}
    </>
  );
}

// onEntwurf(boolean): meldet, ob im Eingabefeld gerade ungesendeter Text steht (Live-Vorschau 0.13.2: dann wird links nicht gewechselt).
// entwurfSpeicher (optional, Map im Speicher der Seite): Entwurf je Gruppe/Feature – bleibt beim Wechseln erhalten, solange die Seite offen ist.
// punkt (optional, 0.15.0 Arbeitsplatz für alle Arten): gewählter offener Punkt des Features ({ id, titel, status, auftrag }) –
// dann „Fragen“ (Konzept-Chat, nur klären) und „Weiterarbeiten“ (genau dieser Punkt als Auftrag, ws_punkt_weiterarbeiten).
export function AuftragsChat({ g, f, d, ich, darf, toast, onLoeschen, kanal = "codeschmiede", baustein, onBausteinFertig, eingebettet, onKonzept, onEntwurf, entwurfSpeicher, punkt, onPunktFertig }) {
  const auftraege = d.auftraege.filter((a) => (f ? a.feature_id === f.id : a.gruppe_id === g.id));   // je Feature: Verlauf bleibt beim Verschieben
  const ids = auftraege.map((a) => a.id);
  const { nachrichten, log, erlaubnisse } = useAuftragDetails(ids);
  const entwurfSchluessel = `${g.id}|${f?.id || ""}`;
  const [text, setTextRoh] = useState(() => entwurfSpeicher?.get(entwurfSchluessel) || ""); const [busy, setBusy] = useState(false); const [tab, setTab] = useState("gespraech");
  const setText = useCallback((t) => { setTextRoh(t); if (entwurfSpeicher) { if (String(t || "").trim()) entwurfSpeicher.set(entwurfSchluessel, t); else entwurfSpeicher.delete(entwurfSchluessel); } }, [entwurfSpeicher, entwurfSchluessel]);
  const tippt = !!text.trim();
  const onEntwurfRef = useRef(onEntwurf); onEntwurfRef.current = onEntwurf;
  useEffect(() => { onEntwurfRef.current?.(tippt); }, [tippt]);
  useEffect(() => () => { onEntwurfRef.current?.(false); }, []);
  const laufend = auftraege.find((a) => a.stand === "laeuft");
  const frage = auftraege.find((a) => a.stand === "frage");
  const kannAuftrag = darf(g.bereich_id, "auftraege");
  const kannFrei = darf(g.bereich_id, "freigeben");
  const name = (id) => d.benutzer.find((u) => u.id === id)?.name || "Mitglied";
  useEffect(() => { if (!laufend) setTab("gespraech"); }, [laufend]);
  // Chats starten immer beim letzten Eintrag (Neue Anweisung Gerhard 2026-10-23 10:20)
  const verlaufRef = useRef(null);
  useEffect(() => { const el = verlaufRef.current; if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [nachrichten.length, log.length, tab, g.id, f?.id]);

  // Fragen gehen an den allgemeinen Chat im Konzept (Anweisung Gerhard 26.10.2026 08:07 – vorher wurde jede Frage hier zum Bau-Auftrag):
  // die eingestellte KI liest nach und antwortet; wird etwas gebaut, legt sie dort die Aufträge an.
  // Neue Anweisung Gerhard 26.10.2026 09:11: „Ich will immer zuerst im Chat alles besprechen“ – jede Nachricht geht in den Konzept-Chat;
  // Aufträge legt dort die KI an, wenn alles geklärt ist. Direkt hier bleiben nur Antworten auf Rückfragen und Baustein-Aufträge.
  const istFrage = !frage && !baustein;
  const fragen = async () => {
    const t = text.trim(); if (!t) return; setBusy(true);
    try {
      const herkunft = (f ? `Feature „${f.name}“ (${f.id}) in der Gruppe „${g.name}“` : `Gruppe „${g.name}“`)
        + (punkt ? `, zum offenen Punkt „${punkt.titel}“ (Aufgabe #${punkt.id})` : "");
      const { error } = await supabase.from("ws_claude_chat").insert({ projekt_id: d.projektId, ort: "konzept", text: `Frage zu ${herkunft}: ${t}`.slice(0, TEXT_MAX),
        kontext: `Gerhard fragt aus der ${herkunft}${g.app_key ? `, Menüpunkt der App: ${g.app_key}` : ""}. Nur beantworten – gebaut wird erst, wenn er es bestätigt.`.slice(0, 6000) });
      if (error) throw error;
      setText(""); toast("Im Konzept-Chat – dort wird besprochen, die Antwort kommt gleich");
      onKonzept?.();
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const senden = async () => {
    const t = text.trim(); if (!t) return; setBusy(true);
    try {
      if (frage) {
        const { error } = await supabase.from("ws_nachrichten").insert({ auftrag_id: frage.id, von: ich.id, art: "text", text: bausteinText(t), kanal });
        if (error) throw error; toast("Antwort an die Werkstatt gesendet");
      } else {
        const istTexter = d.mitglieder.some((m) => m.projekt_id === d.projektId && m.benutzer_id === ich.id && m.rolle === "texter");
        const { data, error } = await supabase.from("ws_auftraege").insert({ gruppe_id: g.id, feature_id: f?.id || null, titel: t.length > 80 ? t.slice(0, 78) + "…" : t, art: istTexter ? "text" : "aendern", erstellt_von: ich.id, baustein: baustein || null }).select().single();
        if (error) throw error;
        const r = await supabase.from("ws_nachrichten").insert({ auftrag_id: data.id, von: ich.id, art: "text", text: bausteinText(t), kanal });
        if (r.error) throw r.error; toast(`Auftrag #${data.id} an Werkstatt ${g.name} gestellt`);
      }
      // @Feature im Text = fester Bezug „Vorlage“ für dieses Feature (Entscheidung 2026-10-22 22:31)
      if (f) for (const x of erwaehnte(t, d.features).filter((x) => x.id !== f.id)) {
        const { error: eb } = await supabase.rpc("ws_bezug_setzen", { p_von: f.id, p_zu: x.id });
        if (!eb) toast(`Vorlage gesetzt: ${x.name}`);
      }
      setText(""); onBausteinFertig?.();
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const bausteinText = (t) => (baustein ? `[Baustein: ${baustein.name}${baustein.seite ? ` · Seite ${baustein.seite}` : ""}]\n${t}` : t);
  // „Weiterarbeiten“ (Entwurf Arbeitsplatz für alle Arten, Gerhard 02.11.2026): genau dieser Punkt als Auftrag – bestehender Auftrags-Weg der
  // Aufgaben (Sendung + Auftrag + erste Nachricht mit daten.aufgabe), gleiche Rechte; Text im Feld geht als Zusatz mit.
  const kannWeiter = !!punkt && punkt.status !== "laeuft" && punkt.status_aufgabe !== "erledigt";
  const weiterarbeiten = async () => {
    if (!punkt) return; setBusy(true);
    try {
      const { data, error } = await supabase.rpc("ws_punkt_weiterarbeiten", { p_aufgabe: punkt.id, p_text: text.trim() || null });
      if (error) throw error;
      setText(""); toast(`Auftrag #${data} zu „${punkt.titel}“ an Werkstatt ${g.name} gestellt`); await d.holen?.(); onPunktFertig?.(data);
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const freigeben = async (a) => { const { error } = await supabase.rpc("ws_freigeben", { p_auftrag: a.id }); toast(error ? fehler(error) : `Auftrag #${a.id} freigegeben – Sicherheitsprüfung startet`); };
  const zusammen = async (a) => { const { error } = await supabase.rpc("ws_zusammenfuehren", { p_auftrag: a.id }); toast(error ? fehler(error) : `Auftrag #${a.id}: Zusammenführen gestartet`); };
  const beantwortet = (m) => m.art === "frage" && nachrichten.some((x) => x.auftrag_id === m.auftrag_id && x.id > m.id && x.von);
  const [alleFragen, setAlleFragen] = useState(false);
  const zahlBeantwortet = nachrichten.filter(beantwortet).length;
  const erlauben = async (e, s) => { const { error } = await supabase.rpc("ws_erlaubnis_entscheiden", { p_id: e.id, p_status: s }); toast(error ? fehler(error) : s === "abgelehnt" ? "Abgelehnt" : "Erlaubt"); };
  const offeneErl = erlaubnisse.filter((e) => e.status === "offen");
  const ersteId = useMemo(() => { const e = {}; nachrichten.forEach((m) => { if (!(m.auftrag_id in e) || m.id < e[m.auftrag_id]) e[m.auftrag_id] = m.id; }); return e; }, [nachrichten]);

  return (
    <aside className={`${card} flex flex-col min-h-0 ${eingebettet ? "h-full" : "lg:col-span-2 xl:col-span-1 xl:sticky xl:top-3 xl:max-h-[calc(100vh-24px)]"}`} aria-label="Auftrags-Chat">
      <ChatKopf bezug={[f ? { art: "feature", name: f.name } : { art: "gruppe", name: g.name }, ...(punkt ? [{ art: "punkt", name: punkt.titel }] : []), ...(baustein ? [{ art: "baustein", name: baustein.name }] : [])]}
        unten={<>
          <span className="text-xs text-slate-500">{f ? `in der Gruppe ${g.name} · ` : ""}geht an Werkstatt {g.name}</span>
          {(laufend || (f && onLoeschen && darf(g.bereich_id, "loeschen"))) && <div className="flex gap-2 flex-wrap">
            {laufend && <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm">
              {[["gespraech", "Gespräch"], ["live", "Live mitsehen"]].map(([k, t]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${tab === k ? "bg-emerald-50 text-emerald-700 font-semibold dark:bg-emerald-950" : ""}`}>{k === "live" && <i className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />}{t}</button>)}
            </div>}
            {f && onLoeschen && darf(g.bereich_id, "loeschen") && <button type="button" className={`${ghost} h-8 text-xs`} onClick={onLoeschen}><Trash2 className="w-3.5 h-3.5" />{f.ausgeblendet ? "Wieder einblenden" : "Feature löschen …"}</button>}
          </div>}</>} />
      {tab === "live" && laufend ? (
        <div ref={verlaufRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 text-[13px] min-h-[240px]" aria-live="polite">
          {log.filter((l) => l.auftrag_id === laufend.id).map((l) => (
            <div key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2"><time className="text-xs text-slate-400 tabular-nums">{new Date(l.erstellt).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</time>
              <div className="min-w-0"><span>{l.text}</span>{l.ausschnitt && <pre className="mt-1 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 overflow-x-auto">{l.ausschnitt.split("\n").map((z, i) => <span key={i} className={z.startsWith("+") ? "text-green-600" : z.startsWith("-") ? "text-red-600" : ""}>{z + "\n"}</span>)}</pre>}</div></div>))}
          {offeneErl.filter((e) => e.auftrag_id === laufend.id).map((e) => <ErlaubnisKarte key={e.id} e={e} g={g} kann={kannFrei} onEntscheid={erlauben} />)}
        </div>
      ) : (
        <div ref={verlaufRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-[220px]" aria-live="polite">
          {zahlBeantwortet > 0 && <button type="button" onClick={() => setAlleFragen(!alleFragen)} className="self-center text-xs text-slate-500 underline underline-offset-2">{alleFragen ? "Beantwortete Rückfragen ausblenden" : `${zahlBeantwortet} beantwortete Rückfrage${zahlBeantwortet > 1 ? "n" : ""} (abgeschlossen) anzeigen`}</button>}
          {auftraege.length === 0 && <Leerzustand klein Symbol={MessageSquare} titel={f ? `Noch nichts zu „${f.name}“` : `Noch nichts zu ${g.name}`} text="Beschreibe unten, was sich ändern soll – zuerst wird besprochen. Bitte keine Daten von Vereinsmitgliedern hineinschreiben." />}
          {auftraege.map((a) => (
            <React.Fragment key={a.id}>
              <div className="self-center text-xs text-slate-500 text-center flex items-center gap-2 flex-wrap justify-center">Auftrag #{a.id}: {a.titel}{ABGESCHLOSSEN.includes(a.stand) && <span className="inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-400"><CircleCheck className="w-3.5 h-3.5" />abgeschlossen</span>}
                {ABBRECHBAR.includes(a.stand) && (ich.rolle === "admin" || a.erstellt_von === ich.id) && <AbbrechenKnopf a={a} toast={toast} />}</div>
              <Schritte a={a} />
              {nachrichten.filter((m) => m.auftrag_id === a.id && (alleFragen || !beantwortet(m))).map((m) => {
                const zu = beantwortet(m);
                if (m.art === "system") return <ChatNachricht key={m.id} seite="system"><Markdown text={m.text} klein /></ChatNachricht>;
                return (
                <ChatNachricht key={m.id} seite={m.von ? "ich" : "andere"} ton={zu ? "blass" : m.art === "frage" ? "frage" : !m.von && /^Achtung – Regel-Konflikt/.test(m.text || "") ? "konflikt" : undefined}
                  kopf={<>{m.von ? (m.von === ich.id ? "Du" : name(m.von)) : `Werkstatt ${g.name}`} · {fmt(m.erstellt)}{m.art === "frage" ? " · Rückfrage" : ""}
                    {m.kanal === "gruppe" && f && <span className="px-1.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">aus Gruppe</span>}
                    {m.kanal === "claude-chat" && <span className="px-1.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">aus Claude-Chat</span>}
                    {m.daten?.aufgabe && m.von && <AufgabePlakette m={m} erste={ersteId[m.auftrag_id] === m.id} />}
                    {zu && <span className="text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CircleCheck className="w-3 h-3" />abgeschlossen</span>}</>}>
                  {m.daten?.aufgabe && m.von ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <Markdown text={m.text} klein />}
                  {m.daten?.aufgabe && m.von && <AufgabeBeilagen m={m} erste={ersteId[m.auftrag_id] === m.id} toast={toast} />}
                </ChatNachricht>); })}
              <PruefBefunde a={a} />
              {offeneErl.filter((e) => e.auftrag_id === a.id).map((e) => <ErlaubnisKarte key={e.id} e={e} g={g} kann={kannFrei} onEntscheid={erlauben} />)}
              {["freigabe", "zusammen"].includes(a.stand) && (
                <div className="rounded-xl border border-green-600 p-3 text-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs"><GitPullRequest className="w-4 h-4" />PR #{a.pr_nummer} · {a.zweig}</div>
                  {!kannFrei ? <div className="text-xs text-slate-500">Freigeben und Zusammenführen darf der Admin oder wer das Recht „Freigeben“ hat.</div>
                    : a.stand === "freigabe" ? <FreigabeKnopf a={a} onJa={() => freigeben(a)} />
                    : <ZusammenKnopf a={a} onJa={() => zusammen(a)} />}
                </div>)}
            </React.Fragment>))}
          <AufgabenImChat g={g} f={f} d={d} ich={ich} kannAuftrag={kannAuftrag} toast={toast} />
        </div>
      )}
      {/* Ein Chat-Baustein (B4): „Besprechen“ (Standard) geht in den Konzept-Chat; „Antworten“ nur auf eine offene Rückfrage;
          „Als Auftrag“ nur mit einem Baustein aus „Zeigen & kommentieren“ (wie bisher „Senden“). Regel 26.10.2026 09:11: erst besprechen. */}
      <ChatEingabe value={text} onChange={setText} busy={busy} id="ws-auftrag"
        gesperrt={kannAuftrag ? null : "Für diesen Bereich hast du kein Recht, Aufträge zu geben."}
        aktionen={frage ? { antworten: senden } : baustein ? { auftrag: senden } : punkt ? { fragen, ...(kannWeiter ? { weiterarbeiten } : {}) } : { besprechen: fragen }}
        ohneText={["weiterarbeiten"]}
        titel={{ besprechen: "Die eingestellte KI antwortet im Konzept-Chat und legt Aufträge erst an, wenn alles geklärt ist", auftrag: "Auftrag mit diesem Baustein an die Werkstatt", antworten: "Antwort an den laufenden Auftrag",
          fragen: "Nur klären – die eingestellte KI antwortet im Konzept-Chat, gebaut wird nichts", weiterarbeiten: punkt ? `„${punkt.titel}“ als Auftrag an die Werkstatt (Freigabe und Prüfungen wie immer)` : undefined }}
        hinweis={frage ? "Antwort geht an den laufenden Auftrag" : punkt && !baustein ? (punkt.status === "laeuft" ? `Zu „${punkt.titel}“ läuft schon ein Auftrag – Fragen geht, Weiterarbeiten wieder, wenn er fertig ist.` : `„Fragen“ klärt nur. „Weiterarbeiten“ gibt „${punkt.titel}“ als Auftrag an die Werkstatt. Bitte keine Daten von Vereinsmitgliedern.`)
          : istFrage ? "Wird zuerst im Konzept-Chat besprochen – gebaut wird erst, wenn alles geklärt ist. Bitte keine Daten von Vereinsmitgliedern." : "Wird vom nächsten freien Werkstatt-PC übernommen"}
        feld={({ los }) => <MitErwaehnung id="ws-auftrag" className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[15px] min-h-[72px] focus:outline-none" value={text} onChange={setText} features={d.features.filter((x) => !x.ausgebaut)}
          placeholder={frage ? "Antwort auf die Rückfrage …" : punkt ? `Frage oder Zusatz zu „${punkt.titel}“ …` : f ? `Frage oder Änderung zu „${f.name}“ … (@ verweist auf ein Feature als Vorlage)` : `Frage oder Änderung zu ${g.name} …`} aria-label="Nachricht"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); los(); } }} />} />
    </aside>
  );
}

// Auftrag abbrechen (Datenbank 0023, Gerhard 2026-10-23 19:08): zweimal klicken, damit nichts aus Versehen abgebrochen wird
// „laeuft“ auch: hängt ein Auftrag (Werkstatt neu gestartet, 3 Min. ohne Lebenszeichen), lässt er sich abbrechen – die Datenbank prüft (0049)
export const ABBRECHBAR = ["wartet", "laeuft", "frage", "nacharbeit", "freigabe"];
export function AbbrechenKnopf({ a, toast }) {
  const [sicher, setSicher] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!sicher) return undefined; const t = setTimeout(() => setSicher(false), 6000); return () => clearTimeout(t); }, [sicher]);
  const los = async () => {
    if (!sicher) { setSicher(true); return; }
    setBusy(true); const { error } = await supabase.rpc("ws_auftrag_abbrechen", { p_auftrag: a.id, p_grund: null }); setBusy(false); setSicher(false);
    toast(error ? fehler(error) : `Auftrag #${a.id} abgebrochen${a.pr_nummer ? ` – der Pull Request #${a.pr_nummer} bleibt bei GitHub offen` : ""}`);
  };
  return <button type="button" disabled={busy} onClick={los} title="Auftrag abbrechen – die Werkstatt arbeitet nicht weiter daran"
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${sicher ? "border-red-600 bg-red-600 text-white" : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-700"}`}>
    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}{sicher ? "Wirklich abbrechen?" : "Abbrechen"}</button>;
}

export function ErlaubnisKarte({ e, g, kann, onEntscheid }) {
  return (
    <div className="rounded-xl border border-red-500 bg-red-50 dark:bg-red-950/30 p-3 text-sm flex flex-col gap-2">
      <div className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Werkstatt {g.name} bittet um Erlaubnis</div>
      <code className="block font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1.5 break-words">{e.werkzeug}: {e.eingabe}</code>
      {e.grund && <div>{e.grund}</div>}
      {kann ? <div className="flex gap-2 flex-wrap">
        <button type="button" className={`${btn} h-8 text-sm`} onClick={() => onEntscheid(e, "einmal")}>Einmal erlauben</button>
        {!String(e.grund || "").startsWith("Führt Code aus") && <button type="button" className={`${ghost} h-8`} onClick={() => onEntscheid(e, "immer")}>Immer erlauben in {g.name}</button>}
        <button type="button" className={`${ghost} h-8`} onClick={() => onEntscheid(e, "abgelehnt")}>Ablehnen</button>
      </div> : <div className="text-xs text-slate-500">Erlauben darf der Admin oder wer das Recht „Freigeben“ hat.</div>}
    </div>
  );
}

// Weg eines Auftrags: aktuelle Station hervorgehoben, Nacharbeit rot
export function Schritte({ a }) {
  const n = STEP_IDX[a.stand] ?? 0; const fertig = ABGESCHLOSSEN.includes(a.stand); const rot = a.stand === "nacharbeit";
  const laeuftStation = ["sicherheit", "feature"].includes(a.stand) && a.pruefung?.[a.stand]?.ergebnis === "laeuft";
  return (
    <div className="flex gap-1 flex-wrap" aria-label={`Stand: ${STEPS[n]?.[1]}`}>
      {STEPS.map(([s, t], i) => (
        <span key={s} className={`flex-1 min-w-[64px] text-xs font-semibold text-center px-1 py-0.5 rounded ${fertig || i < n ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" : i === n ? (rot ? "bg-red-600 text-white" : "bg-emerald-700 text-white") : "border border-slate-200 dark:border-slate-800 text-slate-400"}`}>
          {i === n && rot ? "Nacharbeit" : t}{i === n && laeuftStation ? " …" : ""}
        </span>))}
    </div>);
}

export function PruefBefunde({ a }) {
  const eintraege = [["sicherheit", "Sicherheitsprüfung"], ["feature", "Feature-Prüfung"]].filter(([k]) => a.pruefung?.[k]?.befund);
  if (!eintraege.length) return null;
  return eintraege.map(([k, t]) => { const p = a.pruefung[k]; return (
    <details key={k} className={`rounded-lg border px-3 py-2 text-xs ${p.ergebnis === "gruen" ? "border-green-600" : p.ergebnis === "rot" ? "border-red-500" : "border-slate-300 dark:border-slate-700"}`}>
      <summary className="cursor-pointer font-semibold">{t}: {p.ergebnis === "gruen" ? "grün" : p.ergebnis === "rot" ? "rot" : p.ergebnis === "laeuft" ? "läuft …" : p.ergebnis}{p.zeit ? ` · ${fmt(p.zeit)}` : ""}</summary>
      <div className="whitespace-pre-wrap mt-1.5 text-slate-600 dark:text-slate-300">{p.befund}</div>
    </details>); });
}

// ---------------- Kurzinfo (einfacher Klick auf ein Feature) ----------------
// Feature in eine andere Gruppe verschieben – alle Gruppen des Projekts, auch „Globale Einstellungen“
export function Verschieben({ f, d, onClose, onWahl }) {
  const [q, setQ] = useState("");
  const bereiche = [...d.bereiche].sort((a, b) => (a.global ? 1 : 0) - (b.global ? 1 : 0));
  return (
    <Dialog title={`„${f.name}“ verschieben`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-2">Wähle die neue Gruppe. Laufende und abgeschlossene Aufträge bleiben beim Feature.</p>
      <input autoFocus className={`${input} mb-2`} placeholder="Gruppe suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[50vh] overflow-auto space-y-2">
        {bereiche.map((b) => {
          const gs = d.gruppen.filter((x) => x.bereich_id === b.id && x.name.toLowerCase().includes(q.toLowerCase()));
          if (!gs.length) return null;
          return (<div key={b.id}><div className="text-xs uppercase tracking-widest font-semibold text-slate-500 px-1 pb-1 flex items-center gap-1">{b.global && <Globe className="w-3.5 h-3.5" />}{b.global ? "Global – gilt für die ganze App" : b.name}</div>
            {gs.map((x) => { const Icon = WS_ICON[x.symbol] || Layers; const jetzt = x.id === f.gruppe_id;
              return <button key={x.id} type="button" disabled={jetzt} onClick={() => onWahl(x.id)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm ${jetzt ? "opacity-50" : "hover:bg-emerald-50 dark:hover:bg-emerald-950/40"}`}><Icon className="w-4 h-4" />{x.name}{jetzt && <span className="ml-auto text-xs">aktuell</span>}</button>; })}
          </div>);
        })}
      </div>
    </Dialog>);
}

/** Programmierstunden eines Features: geschätzt + gemessen (Werkstatt-Laufzeit der Aufträge). */
export const stundenGesamt = (f) => Math.round(((Number(f?.stunden_schaetzung) || 0) + (Number(f?.stunden_gemessen) || 0)) * 10) / 10;
export function StundenText({ f }) {
  const s = Number(f.stunden_schaetzung) || 0; const m = Number(f.stunden_gemessen) || 0;
  if (!s && !m) return <span className="text-slate-400">–</span>;
  return <span><b>{stundenGesamt(f).toLocaleString("de-AT")} h</b><span className="text-slate-500 text-xs"> ({s.toLocaleString("de-AT")} geschätzt{m ? ` + ${(Math.round(m * 10) / 10).toLocaleString("de-AT")} gemessen` : ""})</span></span>;
}

export function FeatureKurzinfo({ f, g, d, ich, toast, darfAuftrag, onOeffnen, onGruppe, onVerschieben }) {
  const js = d.auftraege.filter((a) => a.feature_id === f.id);
  const letzter = js[js.length - 1];
  const laufend = js.find((a) => a.stand === "laeuft");
  const pc = laufend ? d.pcs.find((p) => p.id === laufend.werkstatt_pc) : null;
  return (
    <aside className={`${card} p-4 flex flex-col gap-3 lg:col-span-2 xl:col-span-1 xl:sticky xl:top-3`} aria-label="Kurzinfo">
      <div><div className="text-xs text-slate-500">{g.name} · <span className="font-mono">{f.id}</span></div><h2 className="font-display font-bold text-xl leading-tight">{f.name}</h2></div>
      {f.beschreibung && <p className="text-sm text-slate-600 dark:text-slate-300">{f.beschreibung}</p>}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-slate-500">Stand</dt><dd><Badge stand={f.stand} /></dd>
        <dt className="text-slate-500">Letzter Auftrag</dt><dd>{letzter ? `#${letzter.id} · ${STEPS[STEP_IDX[letzter.stand]]?.[1] || letzter.stand}${letzter.stand === "nacharbeit" ? " (Nacharbeit)" : ""}` : "–"}</dd>
        {js.some((a) => a.offeneFrage) && <><dt className="text-amber-700 font-semibold">Rückfrage</dt><dd className="text-amber-700 font-semibold">wartet auf deine Antwort – Öffnen</dd></>}
        <dt className="text-slate-500">Gerade</dt><dd>{laufend ? <span className="inline-flex items-center gap-1.5 text-blue-600 font-semibold"><i className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />Werkstatt {pc?.name || ""} arbeitet</span> : "niemand"}</dd>
        <dt className="text-slate-500">Aufträge</dt><dd>{js.length} ({js.filter((a) => ABGESCHLOSSEN.includes(a.stand)).length} abgeschlossen)</dd>
        {/* Programmierstunden (0.9.13): Schätzung + gemessene Werkstatt-Laufzeit – gehen in die ERP-Kalkulation der App */}
        <dt className="text-slate-500">Programmierstunden</dt><dd><StundenText f={f} /></dd>
        {f.verkauf_key && <><dt className="text-slate-500">Verkaufs-Feature</dt><dd><code className="text-xs">{f.verkauf_key}</code></dd></>}
      </dl>
      <FeatureBezuege f={f} d={d} ich={ich} toast={toast} darfAuftrag={darfAuftrag} />
      <button type="button" className={btn} onClick={onOeffnen}><Layers className="w-4 h-4" />Öffnen: Chat & Live-Vorschau</button>
      <button type="button" className={ghost} onClick={onGruppe}><MessageSquare className="w-4 h-4" />Zum Chat der Gruppe</button>
      {onVerschieben && <button type="button" className={ghost} onClick={onVerschieben}><FolderInput className="w-4 h-4" />Verschieben …</button>}
      <p className="text-xs text-slate-500">Tipp: Doppelklick auf die Karte öffnet den Arbeitsplatz direkt.{onVerschieben ? " Zum Verschieben die Karte auf eine Gruppe links ziehen." : ""}</p>
    </aside>);
}

// ---------------- Stationen-Übersicht (Klick auf eine Station oben) ----------------
export function StationsUebersicht({ station, d, darf, toast, onSchliessen, onOeffne, onGruppe }) {
  const name = station === "frage" ? "Rückfragen an dich" : STEPS.find((s) => s[0] === station)?.[1];
  const liste = d.auftraege.filter((a) => (station === "frage" ? a.offeneFrage : station === "laeuft" ? ["laeuft", "nacharbeit"].includes(a.stand) : a.stand === station));
  const [busy, setBusy] = useState(false);
  const gruppeVon = (a) => d.gruppen.find((x) => x.id === a.gruppe_id);
  const kann = (a) => darf(gruppeVon(a)?.bereich_id, "freigeben");
  const aktion = station === "freigabe" ? ["ws_freigeben", "Freigeben", "Alle freigeben"] : station === "zusammen" ? ["ws_zusammenfuehren", "Zusammenführen", "Alle zusammenführen"] : null;
  const ausfuehren = async (as) => {
    setBusy(true);
    let ok = 0; const fehlerListe = [];
    for (const a of as) { const { error } = await supabase.rpc(aktion[0], { p_auftrag: a.id }); if (error) fehlerListe.push(`#${a.id}: ${fehler(error)}`); else ok++; }
    setBusy(false);
    toast(fehlerListe.length ? `${ok} erledigt · ${fehlerListe.join(" · ")}` : `${ok} Auftrag${ok === 1 ? "" : "e"}: ${aktion[1]} gestartet`);
  };
  const proFeature = {};
  liste.forEach((a) => { const k = a.feature_id || `gruppe:${a.gruppe_id}`; (proFeature[k] = proFeature[k] || []).push(a); });
  const erklaerung = { frage: "Die Werkstatt wartet auf deine Antwort – Arbeitsplatz öffnen und antworten.", wartet: "Warten auf einen freien Werkstatt-PC.", laeuft: "Die Werkstatt arbeitet (inkl. Nacharbeit nach roter Prüfung).", freigabe: "Bauen & Tests am PC sind gelaufen – deine Freigabe startet die Sicherheitsprüfung.", sicherheit: "Läuft automatisch auf dem Admin-PC.", zusammen: "Sicherheitsprüfung grün – Zusammenführen startet die Prüfung des ganzen Features, danach live.", feature: "Testfassung mit neuestem Stand wird geprüft, bei Grün automatisch live.", wissen: "Live geschaltet und in der Wissensdatenbank." }[station];
  return (
    <section className={`${card} p-4 flex flex-col gap-4`} aria-label={`Station ${name}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold text-2xl">{name}</h2>
        <span className="text-sm text-slate-500">{liste.length} Auftrag{liste.length === 1 ? "" : "e"} · {erklaerung}</span>
        <span className="flex-1" />
        {aktion && liste.filter(kann).length > 1 && <button type="button" className={btn} disabled={busy} onClick={() => ausfuehren(liste.filter(kann))}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : station === "zusammen" ? <GitMerge className="w-4 h-4" /> : <Check className="w-4 h-4" />}{aktion[2]}</button>}
        <button type="button" className={ghost} onClick={onSchliessen}><X className="w-4 h-4" />Schließen</button>
      </div>
      {liste.length === 0 && <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4">An dieser Station wartet gerade nichts.</div>}
      {Object.entries(proFeature).map(([k, as]) => {
        const f = d.features.find((x) => x.id === k); const g = f ? d.gruppen.find((x) => x.id === f.gruppe_id) : gruppeVon(as[0]);
        return (
          <div key={k} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 flex-wrap">
              <span className="text-xs text-slate-500">{g?.name}</span>{f && <><span className="font-mono text-xs text-slate-400">{f.id}</span><b className="font-display">{f.name}</b></>}{!f && <b className="font-display">ganze Gruppe</b>}
              <span className="flex-1" />{f ? <button type="button" className={`${ghost} h-8 text-xs`} onClick={() => onOeffne(f.id)}><Layers className="w-3.5 h-3.5" />Arbeitsplatz</button>
                : onGruppe && <button type="button" className={`${ghost} h-8 text-xs`} onClick={() => onGruppe(as[0].gruppe_id)}><MessageSquare className="w-3.5 h-3.5" />Gruppen-Chat</button>}
            </div>
            {as.map((a) => {
              const p = a.pruefung?.[station];
              return (
                <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center px-3 py-2.5 border-t border-slate-200 dark:border-slate-800">
                  <div className="min-w-0"><div className="font-semibold text-sm">#{a.id} {a.titel}</div>
                    <div className="text-xs text-slate-500 flex gap-2 flex-wrap">{a.pr_nummer && <span className="inline-flex items-center gap-1"><GitPullRequest className="w-3 h-3" />PR #{a.pr_nummer}</span>}
                      {a.werkzeug && <span className="rounded-full border border-slate-300 dark:border-slate-700 px-2 font-semibold">Programmiert mit {werkzeugName(a.werkzeug)}</span>}
                      {a.stand === "wartet" && a.wartet_auf && <span className="rounded-full border border-amber-500 text-amber-700 dark:text-amber-300 px-2 font-semibold">{a.wartet_auf}</span>}
                      {a.stand === "nacharbeit" && <span className="text-red-600 font-semibold">Nacharbeit nach roter Prüfung</span>}
                      {a.pruefung?.lokal && station === "freigabe" && <span>Bauen & Tests: {a.pruefung.lokal.ergebnis === "gruen" ? "grün" : "rot"}</span>}
                      {station === "zusammen" && a.pruefung?.sicherheit && <span className="text-green-700 dark:text-green-400">Sicherheitsprüfung grün</span>}
                      {p?.ergebnis === "laeuft" && <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />läuft seit {fmt(p.zeit)}</span>}
                      {p?.ergebnis === "fehler" && <span className="text-red-600">Fehler: {p.befund} – neuer Versuch {p.naechster ? `ab ${fmt(p.naechster)}` : "gleich"}{p.versuche ? ` (Versuch ${p.versuche} von 3)` : ""}</span>}
                      {p?.ergebnis === "angehalten" && <span className="text-red-600 font-semibold">Angehalten{p.versuche ? ` nach ${p.versuche} Fehlversuchen` : ""}: {p.befund}</span>}
                      {p?.ergebnis === "wartet" && <span>{p.befund}</span>}
                    </div></div>
                  {/* Befund L1 (01.11.2026, Datenbank 0052): angehaltene Station von Hand neu anstoßen */}
                  {["angehalten", "fehler"].includes(p?.ergebnis) && kann(a) && <button type="button" className={`${ghost} h-9 text-sm`} disabled={busy}
                    onClick={async () => { const { error } = await supabase.rpc("ws_station_neu_versuchen", { p_auftrag: a.id }); toast(error ? fehler(error) : `#${a.id}: wird erneut versucht`); }}><RefreshCw className="w-4 h-4" />Erneut versuchen</button>}
                  {aktion && (kann(a) ? <button type="button" className={`${btn} h-9 text-sm`} disabled={busy} onClick={() => ausfuehren([a])}>{aktion[1]}</button> : <span className="text-xs text-slate-500">kein Recht</span>)}
                </div>);
            })}
          </div>);
      })}
    </section>);
}

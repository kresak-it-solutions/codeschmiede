import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, BookOpen, ChevronDown, ClipboardList, Code2, Cpu, Download, Eye, Gauge, GitBranch, Globe, History, Inbox, KeyRound, Layers, ListChecks, Menu, MessageSquare, Palette, Plug, Plus, Scale, Search, Settings, ShieldCheck, Wrench } from "lucide-react";
import { Aenderungsprotokoll, Dokumentation, Pruefstand, Wissensdatenbank, ZweigeVersionen } from "./Ablauf";
import Anbindungen, { NeuesProjektAssistent } from "./ProjektArten";
import { Anmelden } from "./seiten/Anmelden";
import Aufgaben, { useMeineAufgaben } from "./Aufgaben";
import { Befehlsleiste, Benutzermenue, EinladungAnnehmen, Kennzahlen, ProjektWahl, UnbekannteAnsicht, Zentriert } from "./seiten/Kopfzeile";
import { BenutzerRechte, ProjekteVerwalten } from "./seiten/Verwaltung";
import Chat from "./Chat";
import CodeEditor from "./CodeEditor";
import CodeschmiedeZeichen from "./Zeichen";
import Designer from "./Designer";
import Einrichtung, { EinrichtungChip } from "./Einrichtung";
import { EinrichtungAuto, WerkstattSchalter } from "./seiten/Werkstatt";
import Fehler from "./Fehler";
import KiAnbieter from "./KiAnbieter";
import { KonzeptAuto } from "./Konzept";
import { LiveVorschauSeite } from "./seiten/LiveVorschau";
import Regelwerk from "./Regelwerk";
import { Toast, card, merke, BestaetigenRahmen } from "./bausteine/grund";
import { Laden, Leerzustand, Fehlerzustand } from "./bausteine/zustand";
import { Verbrauch, VerbrauchKurz } from "./seiten/Verbrauch";
import { WS_ICON } from "./config";
import { Zentrale } from "./seiten/Zentrale";
import { ZuErledigen, aufgabenListe } from "./seiten/ZuErledigen";
import { rechteVon, useWerkstattDaten } from "./daten/werkstattDaten";
import { supabase } from "./supabase";
const AboLimits = lazy(() => import("./AboLimits"));
// Codeschmiede – Programmierumgebung für alle Projekte (live über Supabase Realtime)
// Konzept: docs/KONZEPT.md · Datenbank: supabase/migrations/
// Rechte prüft die Datenbank (RLS + geprüfte Funktionen); die Oberfläche blendet nur aus, was ohnehin nicht geht.

// ---------------- Hauptseite ----------------

export default function App() {
  const [sitzung, setSitzung] = useState(undefined);
  const [ich, setIch] = useState(undefined);
  // zuletzt geöffnete Seite (Entwurf 1.1); ein Tipp auf eine Push-Nachricht öffnet „?ansicht=erledigen“ bzw. „zentrale“ (Befund L3)
  const [ansicht, setAnsicht] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("ansicht");
      if (q && ["erledigen", "zentrale", "chat", "aufgaben"].includes(q)) { window.history.replaceState(null, "", window.location.pathname); return q; }
    } catch { /* ohne Adresse */ }
    return merke.lies("cs-ansicht") || "zentrale";
  });
  const [oeffne, setOeffne] = useState(null);   // aus „Zu erledigen“: Feature-Arbeitsplatz bzw. Gruppen-Chat öffnen
  const [projekt, setProjekt] = useState(() => merke.lies("cs-projekt"));
  const [toast, setToast] = useState("");
  const [menueOffen, setMenueOffen] = useState(false); const [sucheOffen, setSucheOffen] = useState(false); const [chatStart, setChatStart] = useState(null);
  const [neuesProjekt, setNeuesProjekt] = useState(false); const [projekteVerwalten, setProjekteVerwalten] = useState(false); const [einrichtung, setEinrichtung] = useState(false); const [aboOffen, setAboOffen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSitzung(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSitzung(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const ladeIch = useCallback(async () => {
    if (!sitzung) { setIch(null); return; }
    const { data } = await supabase.from("ws_benutzer").select("*").eq("id", sitzung.user.id).maybeSingle();
    setIch(data && data.aktiv ? data : null);
  }, [sitzung]);
  useEffect(() => { if (sitzung !== undefined) ladeIch(); }, [sitzung, ladeIch]);

  const daten = useWerkstattDaten(ich, projekt);
  const meineAufgaben = useMeineAufgaben(ich ? daten.projektId : null, ich?.id);   // Plakette „Aufgaben“: offene, mir zugewiesene (Datenbank 0042)
  const waehle = (id) => { setProjekt(id); merke.schreib("cs-projekt", id); };

  // Strg K / ⌘ K: Suchen & Springen (Entwurf 1.1)
  useEffect(() => {
    const t = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSucheOffen(true); } };
    window.addEventListener("keydown", t); return () => window.removeEventListener("keydown", t);
  }, []);
  if (sitzung === undefined || (sitzung && ich === undefined)) return <Zentriert><div className="w-full max-w-sm"><Laden zeilen={3} text="Codeschmiede startet" /></div></Zentriert>;
  if (!sitzung) return <Anmelden />;
  if (!ich) return <EinladungAnnehmen sitzung={sitzung} onFertig={ladeIch} />;

  // Navigation in Gruppen (Entwurf 1.1 „Oberfläche 2.0“, freigegeben 2026-10-27 08:27); „Verwaltung“ unten aufklappbar
  const NAV = [
    ["Arbeiten", [["chat", "Chat", MessageSquare], ["zentrale", "Zentrale", Inbox], ["erledigen", "Zu erledigen", ListChecks], ["aufgaben", "Aufgaben", ClipboardList]]],
    ["Gestalten & Bauen", [["designer", "App-Designer", Palette], ["vorschau", "Live-Vorschau", Eye], ["code", "Code", Code2], ["fehler", "Fehler", AlertTriangle], ["global", "Globale Einstellungen", Globe]]],
    ["Ablauf", [["zweige", "Zweige & Versionen", GitBranch], ["pruef", "Prüfstand", ShieldCheck], ["wissen", "Wissensdatenbank", BookOpen]]],
    ["Dokumentation", [["log", "Änderungsprotokoll", History], ["doku", "Dokumentation", Download], ["regelwerk", "Regelwerk", Scale]]],
  ];
  const VERWALTUNG = [["benutzer", "Benutzer & Rechte", KeyRound], ["ki", "KI-Anbieter", Cpu], ["anbindungen", "Anbindungen", Plug], ["einrichtung", "Einrichtung", Wrench], ["verbrauch", "Verbrauch & Limits", Gauge]];
  const nav = [...NAV.flatMap(([, l]) => l), ...VERWALTUNG];
  const offen = daten.auftraege.filter((a) => a.offeneFrage).length;
  const zuTun = daten.projektId ? aufgabenListe(daten, rechteVon(daten, ich)).length : 0;
  const aktuell = daten.projekte.find((p) => p.id === daten.projektId);
  const PIcon = WS_ICON[aktuell?.symbol] || Layers;
  const geh = (id) => { if (id === "einrichtung") setEinrichtung(true); else { setAnsicht(id); merke.schreib("cs-ansicht", id); } setMenueOffen(false); };
  const zahl = (id) => (id === "zentrale" ? offen : id === "erledigen" ? zuTun : id === "aufgaben" ? meineAufgaben : 0);
  const verwaltungAktiv = VERWALTUNG.some(([id]) => id === ansicht);
  const NavKnopf = ([id, t, Icon]) => (
    <button key={id} type="button" aria-current={ansicht === id ? "page" : undefined} onClick={() => geh(id)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-sm text-left ${ansicht === id ? "bg-emerald-400/15 text-white font-semibold" : "text-emerald-50/85 hover:bg-white/5"}`}>
      <Icon className="w-[17px] h-[17px] shrink-0 opacity-90" /><span className="truncate">{t}</span>
      {id === "chat" && Date.now() < Date.parse("2026-11-15") && <span className="ml-auto text-xs font-bold tracking-wider bg-emerald-300 text-emerald-950 rounded px-1">NEU</span>}
      {zahl(id) > 0 && <span className="ml-auto text-xs font-bold bg-amber-500 text-amber-950 rounded-full px-1.5" title={id === "aufgaben" ? "Offene Aufgaben, für die du zuständig bist" : undefined}>{zahl(id)}</span>}
    </button>);
  const vollflaeche = ansicht === "chat";

  return (
    <BestaetigenRahmen>
    <div className="h-screen grid grid-cols-[minmax(0,1fr)] md:grid-cols-[236px_minmax(0,1fr)] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-body overflow-hidden">
      {menueOffen && <div className="md:hidden fixed inset-0 z-30 bg-slate-950/40" onClick={() => setMenueOffen(false)} aria-hidden="true" />}
      <aside className={`bg-[#0f2a22] text-emerald-50 flex flex-col gap-0.5 p-3 h-screen overflow-y-auto z-40 fixed inset-y-0 left-0 w-[250px] transition-transform md:static md:w-auto md:translate-x-0 ${menueOffen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Hauptmenü">
        <div className="flex items-center gap-2.5 px-1.5 pb-3">
          <CodeschmiedeZeichen groesse={32} className="ring-1 ring-emerald-400/30 rounded-[9px]" />
          <div className="leading-tight"><b className="font-display text-[19px] tracking-wide">Codeschmiede</b><div className="text-xs text-emerald-200/70">Deine Apps. Ein Ort.</div></div>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Programm-Menü">
          {NAV.map(([titel, l]) => (
            <React.Fragment key={titel}>
              <div className="text-xs uppercase tracking-widest text-emerald-200/55 px-2.5 pt-3 pb-1">{titel}</div>
              {l.map(NavKnopf)}
            </React.Fragment>))}
        </nav>
        <details className="mt-auto pt-3 border-t border-white/10 group" open={verwaltungAktiv || undefined}>
          <summary className="list-none cursor-pointer flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-sm text-emerald-50/85 hover:bg-white/5">
            <Settings className="w-[17px] h-[17px]" />Verwaltung<ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" /></summary>
          <div className="flex flex-col gap-0.5 mt-0.5">{VERWALTUNG.map(NavKnopf)}</div>
        </details>
      </aside>

      <div className="min-w-0 h-screen grid grid-rows-[auto_minmax(0,1fr)]">
        <header className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button type="button" className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700" onClick={() => setMenueOffen(true)} aria-label="Menü öffnen"><Menu className="w-4 h-4" /></button>
          <ProjektWahl projekte={daten.projekte} aktuell={aktuell} PIcon={PIcon} admin={ich.rolle === "admin"} onWahl={waehle} onNeu={() => setNeuesProjekt(true)} onVerwalten={() => setProjekteVerwalten(true)} />
          <button type="button" onClick={() => setSucheOffen(true)} className="hidden sm:flex flex-1 max-w-[440px] items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700/70">
            <Search className="w-4 h-4" />Suchen oder springen … Feature, Auftrag, Chat<kbd className="ml-auto font-mono text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5">Strg K</kbd></button>
          <button type="button" onClick={() => setSucheOffen(true)} className="sm:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Suchen"><Search className="w-4 h-4" /></button>
          <div className="ml-auto flex items-center gap-2">
            <VerbrauchKurz d={daten} ich={ich} onClick={() => setAboOffen(true)} />
            <span className="hidden lg:contents"><EinrichtungChip ich={ich} d={daten} onOeffnen={() => setEinrichtung(true)} /></span>
            <WerkstattSchalter ich={ich} sitzung={sitzung} d={daten} toast={setToast} />
            <button type="button" onClick={() => geh("erledigen")} className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700" aria-label={`Zu erledigen: ${offen + zuTun}`} title="Rückfragen, Freigaben und alles, was auf dich wartet">
              <Bell className="w-4 h-4" />{offen + zuTun > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-amber-950 text-xs font-bold grid place-items-center px-1">{offen + zuTun}</span>}</button>
            <Benutzermenue ich={ich} toast={setToast} />
          </div>
        </header>
        <main className={`min-w-0 min-h-0 ${vollflaeche ? "overflow-hidden" : "overflow-y-auto px-4 md:px-6 pb-10"}`}>
          {!vollflaeche && <div className="flex flex-wrap items-center gap-3 py-4">
            <h1 className="font-display font-bold text-2xl">{nav.find((n) => n[0] === ansicht)?.[1]}</h1>
            <span className="text-sm text-slate-500">{aktuell?.name}</span>
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-500" title={daten.live === "getrennt" ? "Die Live-Verbindung ist getrennt – Änderungen anderer erscheinen erst nach dem Neuladen bzw. der Wiederverbindung" : undefined}>
              <i className={`w-2 h-2 rounded-full ${daten.live === "an" ? "bg-green-600" : daten.live === "getrennt" ? "bg-red-600" : "bg-amber-500 animate-pulse"}`} aria-hidden="true" />
              {daten.live === "an" ? "Live synchronisiert" : daten.live === "getrennt" ? "Live-Verbindung getrennt" : "Verbinde …"}</span>
          </div>}
          {aboOffen && <Suspense fallback={null}><AboLimits d={daten} ich={ich} toast={setToast} onSchliessen={() => setAboOffen(false)} onVerbrauch={() => { setAboOffen(false); geh("verbrauch"); }} /></Suspense>}
          {daten.ladeFehler && !daten.geladen ? <Fehlerzustand titel="Die Daten der Codeschmiede konnten nicht geladen werden" fehler={daten.ladeFehler} onErneut={daten.holen} />
            : daten.laden ? <Laden zeilen={5} text="Daten der Codeschmiede werden geladen" />
            : !daten.projektId ? <div className={card}><Leerzustand titel="Noch kein Projekt" text="Du bist noch keinem Projekt zugeordnet. Der Admin nimmt dich in ein Projekt auf."
                aktion={ich.rolle === "admin" ? { text: "Neues Projekt", Symbol: Plus, onClick: () => setNeuesProjekt(true) } : null} /></div>
            : ansicht === "chat" ? <Chat key={daten.projektId} d={daten} ich={ich} toast={setToast} start={chatStart} onFeature={(f) => { setOeffne({ f: f.id, g: f.gruppe_id, n: Date.now() }); geh("zentrale"); }} />
            : ansicht === "zentrale" ? <><Kennzahlen d={daten} onChat={() => geh("chat")} onErledigen={() => geh("erledigen")} /><Zentrale key={daten.projektId} d={daten} ich={ich} toast={setToast} onDesigner={() => geh("designer")} start={oeffne} /></>
            : ansicht === "erledigen" ? <ZuErledigen key={daten.projektId} d={daten} ich={ich} toast={setToast} onOeffne={(a) => { setOeffne({ f: a.feature_id, g: a.gruppe_id, n: Date.now() }); geh("zentrale"); }} />
            : ansicht === "aufgaben" ? <Aufgaben key={daten.projektId} d={daten} ich={ich} toast={setToast} onOeffneChat={(z) => { setOeffne({ f: z.f, g: z.g, n: Date.now() }); geh("zentrale"); }} />
            : ansicht === "global" ? <Zentrale key={daten.projektId + "-global"} d={daten} ich={ich} toast={setToast} nurGlobal />
            : ansicht === "regelwerk" ? <Regelwerk key={daten.projektId} d={daten} ich={ich} toast={setToast} />
            : ansicht === "ki" ? <KiAnbieter key={daten.projektId} d={daten} ich={ich} toast={setToast} />
            : ansicht === "zweige" ? <ZweigeVersionen key={daten.projektId} d={daten} />
            : ansicht === "pruef" ? <Pruefstand key={daten.projektId} d={daten} />
            : ansicht === "wissen" ? <Wissensdatenbank key={daten.projektId} d={daten} />
            : ansicht === "log" ? <Aenderungsprotokoll key={daten.projektId} d={daten} />
            : ansicht === "doku" ? <Dokumentation key={daten.projektId} d={daten} />
            : ansicht === "fehler" ? <Fehler key={daten.projektId} d={daten} ich={ich} toast={setToast} onAuftrag={() => geh("zentrale")} onAnbindungen={() => geh("anbindungen")} />
            : ansicht === "code" ? <CodeEditor key={daten.projektId} d={daten} ich={ich} toast={setToast} onAuftrag={() => geh("zentrale")} onAnbindungen={() => geh("anbindungen")} />
            : ansicht === "anbindungen" ? <Anbindungen key={daten.projektId} d={daten} ich={ich} toast={setToast} onVorschau={() => geh("vorschau")} />
            : ansicht === "vorschau" ? <LiveVorschauSeite key={daten.projektId} d={daten} ich={ich} toast={setToast} />
            : ansicht === "designer" ? <Designer key={daten.projektId} d={daten} ich={ich} toast={setToast} />
            : ansicht === "benutzer" ? <BenutzerRechte d={daten} ich={ich} toast={setToast} />
            : ansicht === "verbrauch" ? <Verbrauch d={daten} ich={ich} toast={setToast} />
            : <UnbekannteAnsicht ansicht={ansicht} />}
        </main>
      </div>
      {sucheOffen && <Befehlsleiste d={daten} nav={nav} onSchliessen={() => setSucheOffen(false)}
        onSeite={geh} onFeature={(f) => { setOeffne({ f: f.id, g: f.gruppe_id, n: Date.now() }); geh("zentrale"); }}
        onAuftrag={(x) => { setOeffne({ f: x.feature_id, g: x.gruppe_id, n: Date.now() }); geh("zentrale"); }}
        onChat={(u) => { setChatStart({ u, n: Date.now() }); geh("chat"); }} />}
      {/* Die Chat-Spalte rechts entfällt (Gerhard 2026-10-23 17:52); Gespräche laufen im Menüpunkt „Chat“ (Entwurf 1.1) */}
      {einrichtung && !daten.laden && <Einrichtung ich={ich} d={daten} toast={setToast} onClose={() => setEinrichtung(false)} />}
      {!daten.laden && daten.projektId && <EinrichtungAuto ich={ich} d={daten} onOeffnen={() => setEinrichtung(true)} />}
      {!daten.laden && daten.projektId && <KonzeptAuto d={daten} ich={ich} />}
      {projekteVerwalten && <ProjekteVerwalten toast={setToast} aktiv={daten.projektId} onClose={() => setProjekteVerwalten(false)} onWeg={(id) => { if (id === daten.projektId) { const n = daten.projekte.find((p) => p.id !== id); if (n) waehle(n.id); } }} />}
      {neuesProjekt && <NeuesProjektAssistent toast={setToast} onClose={() => setNeuesProjekt(false)} onFertig={(id) => { waehle(id); geh("anbindungen"); }} />}
      <Toast text={toast} onDone={() => setToast("")} />
    </div>
    </BestaetigenRahmen>
  );
}

// Ein Arbeitsplatz für jede Art von Programm, Stufe 1 (Entwurf freigegeben von Gerhard 02.11.2026, docs/KONZEPT-ARBEITSPLATZ.md, Datenbank 0059).
// Bausteine des Feature-Arbeitsplatzes: Status-Punkt im Baum, offene Punkte über dem Chat, Prüfweg, rechte Hälfte mit
// Vorschau | Code live | Verlauf. Reine Logik in bausteine/arbeitsplatz.js (getestet), Daten der Punkte in daten/punkte.js.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Check, CircleCheck, Code2, ExternalLink, EyeOff, FileCode2, History, Info, ListChecks, Loader2, Monitor, Pencil, Play, Plus, RefreshCw, Route } from "lucide-react";
import { ABGESCHLOSSEN, btn, card, fehler, fmt, ghost, input, merke } from "../bausteine/grund";
import { DATEI_ART, PRUEFWEG_TYPEN, STATUS_TEXT, ZIELE, diffZeilen, featureStatus, pruefwegFehler, pruefwegVon, punktStatus, verlaufEintraege, zieleVon } from "../bausteine/arbeitsplatz";
import { Fehlerzustand, Laden, Leerzustand } from "../bausteine/zustand";
import { useAuftragDetails } from "../daten/werkstattDaten";
import { frage as codeFrage } from "../CodeEditor";
import { supabase } from "../supabase";

// ---------------- Status-Punkt (Baum der Zentrale) ----------------
// blau blinkend = Auftrag läuft · orange = offene Punkte · grün = fertig · grau = noch nichts offen. Blinken nur ohne „Bewegung reduzieren“.
const PUNKT_FARBE = { laeuft: "bg-blue-600 motion-safe:animate-pulse", offen: "bg-orange-500", fertig: "bg-emerald-600", leer: "bg-slate-300 dark:bg-slate-600" };
export function StatusPunkt({ status = "leer", className = "" }) {
  return <span className={`inline-flex shrink-0 ${className}`} title={STATUS_TEXT[status]}>
    <i className={`w-2.5 h-2.5 rounded-full ${PUNKT_FARBE[status] || PUNKT_FARBE.leer}`} aria-hidden="true" /><span className="sr-only">{STATUS_TEXT[status]}</span></span>;
}

/** Status je Feature (für Baum und Karten): aus Aufträgen und offenen Punkten des Projekts. */
export function useFeatureStatus(d, punkteDaten) {
  const { aufgaben = [], sendungen = [] } = punkteDaten || {};
  return useMemo(() => {
    const alle = aufgaben.map((a) => ({ ...a, ...punktStatus(a, sendungen, d.auftraege) }));
    const cache = new Map();
    return (f) => { if (!cache.has(f.id)) cache.set(f.id, featureStatus(f, d.auftraege, alle)); return cache.get(f.id); };
  }, [aufgaben, sendungen, d.auftraege]);
}

// ---------------- Baum (links im Arbeitsplatz, nur auf breiten Bildschirmen) ----------------
export function BaumKurz({ d, punkte, aktivId, onWahl }) {
  const status = useFeatureStatus(d, punkte);
  const konzept = d.projekte.find((p) => p.id === d.projektId)?.konzept_gruppe_id;
  return (
    <nav aria-label="Bereiche, Gruppen und Features" className={`${card} hidden 2xl:flex flex-col w-[250px] shrink-0 overflow-y-auto h-[calc(100vh-190px)] min-h-[560px] py-1`}>
      {d.bereiche.map((b) => {
        const gs = d.gruppen.filter((g) => g.bereich_id === b.id && g.id !== konzept);
        if (!gs.length) return null;
        return <div key={b.id} className="pb-1">
          <div className="font-display font-semibold text-xs uppercase tracking-widest text-slate-500 px-3 pt-2.5 pb-1 truncate">{b.name}</div>
          {gs.map((g) => { const fs = d.features.filter((x) => x.gruppe_id === g.id && !x.ausgebaut && !x.ausgeblendet); return (
            <div key={g.id}><div className="px-3 py-1 text-[13px] font-semibold truncate">{g.name}</div>
              {fs.map((x) => <button key={x.id} type="button" aria-current={x.id === aktivId} onClick={() => onWahl(x.id)}
                className={`w-full flex items-center gap-2 pl-5 pr-3 py-1 text-left text-[13px] ${x.id === aktivId ? "bg-emerald-50 dark:bg-emerald-950/40 font-semibold shadow-[inset_3px_0_0_#047857]" : "hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20"}`}>
                <StatusPunkt status={status(x)} /><span className="truncate">{x.name}</span></button>)}
            </div>); })}
        </div>;
      })}
    </nav>);
}

// ---------------- Offene Punkte (Mitte, über dem Chat) ----------------
const PUNKT_TEXT = { offen: "offen", laeuft: "läuft", erledigt: "erledigt" };
const PUNKT_DOT = { offen: "bg-orange-500", laeuft: "bg-blue-600 motion-safe:animate-pulse", erledigt: "bg-emerald-600" };
export function PunkteListe({ punkte, gewaehlt, onWahl, kannAnlegen, projektId, featureId, toast, onNeu }) {
  const [neu, setNeu] = useState(""); const [busy, setBusy] = useState(false); const [alle, setAlle] = useState(false);
  const offen = punkte.filter((p) => p.status !== "erledigt").length;
  const sichtbar = alle ? punkte : punkte.filter((p) => p.status !== "erledigt" || p.id === gewaehlt);
  const anlegen = async () => {
    const t = neu.trim(); if (t.length < 2) return; setBusy(true);
    const { error } = await supabase.from("ws_aufgaben").insert({ projekt_id: projektId, titel: t.slice(0, 120), feature_id: featureId });
    setBusy(false);
    if (error) toast(fehler(error)); else { setNeu(""); onNeu?.(); }
  };
  return (
    <section className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-1.5" aria-label="Offene Punkte">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500"><ListChecks className="w-3.5 h-3.5" aria-hidden="true" />Offene Punkte
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 tabular-nums normal-case tracking-normal">{offen}</span>
        {punkte.length > sichtbar.length || alle ? <button type="button" className="ml-auto normal-case tracking-normal font-normal underline underline-offset-2" onClick={() => setAlle(!alle)}>{alle ? "Erledigte ausblenden" : `${punkte.length - sichtbar.length} erledigte zeigen`}</button> : null}
      </div>
      {!punkte.length && <p className="text-xs text-slate-500">Noch keine Punkte. Lege unten einen an oder unter „Aufgaben“ mit Bezug zu diesem Feature.</p>}
      <ul className="flex flex-col gap-1 max-h-44 overflow-y-auto">
        {sichtbar.map((p) => {
          const an = p.id === gewaehlt;
          return <li key={p.id}><button type="button" aria-pressed={an} onClick={() => onWahl(an ? null : p.id)}
            title={an ? "Bezug aufheben" : "Chat bezieht sich auf diesen Punkt"}
            className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm ${an ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-emerald-600" : "border-slate-200 dark:border-slate-800 hover:border-emerald-600"}`}>
            <i className={`w-2.5 h-2.5 rounded-full shrink-0 ${PUNKT_DOT[p.status]}`} aria-hidden="true" />
            <span className={`min-w-0 flex-1 truncate ${p.status === "erledigt" ? "text-slate-500 line-through decoration-slate-400" : ""}`}>{p.titel}</span>
            <small className="shrink-0 text-xs text-slate-500">{PUNKT_TEXT[p.status]}{p.auftrag ? ` · #${p.auftrag.id}` : ""}</small>
          </button></li>;
        })}
      </ul>
      {kannAnlegen && <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); anlegen(); }}>
        <label className="sr-only" htmlFor="cs-punkt-neu">Neuer Punkt</label>
        <input id="cs-punkt-neu" className={`${input} py-1.5 text-sm`} value={neu} maxLength={120} onChange={(e) => setNeu(e.target.value)} placeholder="Punkt hinzufügen … (keine Daten von Vereinsmitgliedern)" />
        <button type="submit" className={`${ghost} h-9 px-3 shrink-0`} disabled={busy || neu.trim().length < 2} aria-label="Punkt hinzufügen">{busy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Plus className="w-4 h-4" />}</button>
      </form>}
    </section>);
}

// ---------------- Prüfweg (je Feature, je Art) ----------------
export function PruefwegZeile({ f, projekt, darf, toast, onGespeichert }) {
  const pw = pruefwegVon(f, projekt);
  const [bearbeiten, setBearbeiten] = useState(false); const [typ, setTyp] = useState(pw.typ); const [text, setText] = useState(pw.text); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!bearbeiten) { setTyp(pw.typ); setText(pw.text); } }, [pw.typ, pw.text, bearbeiten]);
  const fehlerText = bearbeiten ? pruefwegFehler(typ, text) : null;
  const speichern = async () => {
    if (fehlerText) return; setBusy(true);
    const { error } = await supabase.rpc("ws_feature_pruefweg_setzen", { p_feature: f.id, p_typ: typ, p_text: text.trim() || null });
    setBusy(false);
    if (error) toast(fehler(error)); else { setBearbeiten(false); toast("Prüfweg gespeichert"); onGespeichert?.(); }
  };
  if (!bearbeiten) return (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <Route className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
      <span className="text-slate-500 shrink-0">Prüfweg:</span>
      <span className="shrink-0 font-semibold">{PRUEFWEG_TYPEN[pw.typ].name}</span>
      <span className={`min-w-0 truncate ${pw.typ === "seite" ? "font-mono text-xs" : ""}`}>{pw.text || (pw.typ === "seite" ? "Startseite" : "noch nicht beschrieben")}</span>
      {darf && <button type="button" className="p-1 rounded text-slate-400 hover:text-emerald-700" onClick={() => setBearbeiten(true)} aria-label="Prüfweg bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>}
    </div>);
  return (
    <form className="flex flex-wrap items-start gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); speichern(); }}>
      <label className="sr-only" htmlFor="cs-pw-typ">Art des Prüfwegs</label>
      <select id="cs-pw-typ" className={`${input} w-auto py-1.5 text-sm`} value={typ} onChange={(e) => setTyp(e.target.value)}>
        {Object.entries(PRUEFWEG_TYPEN).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select>
      <div className="flex-1 min-w-[180px]">
        <label className="sr-only" htmlFor="cs-pw-text">Prüfweg</label>
        <input id="cs-pw-text" autoFocus className={`${input} py-1.5 text-sm ${typ === "seite" ? "font-mono" : ""}`} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={PRUEFWEG_TYPEN[typ].beispiel} aria-invalid={!!fehlerText} />
        {fehlerText && <p className="text-xs text-red-700 dark:text-red-400 mt-1">{fehlerText}</p>}
      </div>
      <button type="submit" className={`${btn} h-9 px-3 text-sm`} disabled={busy || !!fehlerText}><Check className="w-4 h-4" />Speichern</button>
      <button type="button" className={`${ghost} h-9 px-3`} onClick={() => setBearbeiten(false)}>Abbrechen</button>
    </form>);
}

// ---------------- Rechte Hälfte: Vorschau | Code live | Verlauf ----------------
const ANSICHTEN = [["vor", "Vorschau", Monitor], ["code", "Code live", Code2], ["verlauf", "Verlauf", History]];
export function RechteHaelfte({ projekt, f, d, ich, toast, onCode, vorschau }) {
  const [ansicht, setAnsichtRoh] = useState(() => { const v = merke.lies("cs-platz-rechts"); return ANSICHTEN.some(([k]) => k === v) ? v : "vor"; });
  const setAnsicht = (v) => { setAnsichtRoh(v); merke.schreib("cs-platz-rechts", v); };
  const ziele = zieleVon(projekt);
  const [ziel, setZiel] = useState(ziele[0]);
  useEffect(() => { if (!ziele.includes(ziel)) setZiel(ziele[0]); }, [ziele.join(","), ziel]); // eslint-disable-line react-hooks/exhaustive-deps
  const laeuft = d.auftraege.some((a) => a.feature_id === f.id && a.stand === "laeuft");
  return (
    <div className={`${card} flex flex-col min-h-[480px] min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-slate-200 dark:border-slate-800">
        <div role="tablist" aria-label="Ansicht rechts" className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm">
          {ANSICHTEN.map(([k, t, S]) => <button key={k} type="button" role="tab" aria-selected={ansicht === k} onClick={() => setAnsicht(k)}
            className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${ansicht === k ? "bg-emerald-50 text-emerald-800 font-semibold dark:bg-emerald-950 dark:text-emerald-200" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
            <S className="w-4 h-4" aria-hidden="true" />{t}{k === "code" && laeuft && <i className="w-2 h-2 rounded-full bg-blue-600 motion-safe:animate-pulse" aria-label="live" />}</button>)}
        </div>
        {ansicht === "vor" && ziele.length > 1 && <div role="tablist" aria-label="Ziel" className="flex flex-wrap gap-1">
          {ziele.map((z) => <button key={z} type="button" role="tab" aria-selected={ziel === z} onClick={() => setZiel(z)}
            className={`h-8 px-2.5 rounded-full border text-xs font-semibold ${ziel === z ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
            {ZIELE[z].name}{ZIELE[z].stufe > 1 ? ` · Stufe ${ZIELE[z].stufe}` : ""}</button>)}
        </div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {ansicht === "vor" ? (ZIELE[ziel]?.stufe === 1 ? vorschau(ziel) : <ZielPlatzhalter ziel={ziel} projekt={projekt} f={f} d={d} ich={ich} toast={toast} />)
          : ansicht === "code" ? <CodeLive projekt={projekt} f={f} d={d} ich={ich} onCode={onCode} />
          : <Verlauf projekt={projekt} f={f} d={d} />}
      </div>
    </div>);
}

// Ziele, die erst in Stufe 2 oder 3 eine Vorschau bekommen: klarer Platzhalter mit dem, was es heute schon gibt
const KOMMT = {
  windows: "Stufe 2 zeigt die Oberfläche des Programms als Testseite (Tauri-Funktionen wie „Datei öffnen“ werden nachgespielt) und startet es in der Windows-Sandbox – mit Bildschirmfoto an den Chat.",
  mac: "Stufe 2 zeigt die Oberfläche als Testseite. Mac-Installationsdateien (.dmg) lädst du bis dahin bei GitHub.",
  cloud_lauf: "Stufe 3 bringt eine Testlauf-Konsole: Beispiel-Eingabe wählen, Lauf in der Cloud, Ausgabe an den Chat.",
  pdf: "Stufe 3 bringt eine Seiten-Vorschau des Dokuments (PDF) mit Seitenzahl aus dem Prüfweg.",
};
function ZielPlatzhalter({ ziel, projekt, f, d, ich, toast }) {
  const admin = ich.rolle === "admin";
  const [busy, setBusy] = useState("");
  const aktiv = [...d.auftraege].reverse().find((a) => a.feature_id === f.id && a.zweig && !ABGESCHLOSSEN.includes(a.stand));
  const meinPc = (d.pcs || []).find((p) => p.benutzer_id === ich.id && p.an && Date.now() - new Date(p.zuletzt).getTime() < 180000)?.id || null;
  const aktion = async (art) => {
    setBusy(art);
    try {
      if (art === "sandbox" && !meinPc) throw new Error("Auf diesem PC läuft keine Werkstatt – oben „Werkstatt an“ einschalten");
      const { error } = await supabase.rpc("ws_projekt_aktion_anfordern", { p_projekt: projekt.id, p_art: art, p_zweig: aktiv?.zweig || "main", p_pc: art === "sandbox" ? meinPc : null, p_netz: false });
      if (error) throw error;
      toast(art === "sandbox" ? `Die Werkstatt holt den Build (${aktiv?.zweig || "main"}) und startet die Windows-Sandbox` : `Testlauf (${aktiv?.zweig || "main"}) wird gestartet`);
    } catch (e) { toast(fehler(e)); } finally { setBusy(""); }
  };
  const programm = projekt.technik_art === "programm"; const werkzeug = projekt.technik_art === "werkzeug";
  return (
    <div className="flex-1 grid place-items-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md flex flex-col gap-3 text-sm">
        <span className="self-start inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-400 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Vorschau für {ZIELE[ziel].name} kommt in Stufe {ZIELE[ziel].stufe}</span>
        <p className="text-slate-600 dark:text-slate-300">{KOMMT[ziel]}</p>
        <p className="font-semibold">Was es heute schon gibt</p>
        <div className="flex flex-wrap gap-2">
          {(ziel === "windows" || ziel === "mac") && programm && <button type="button" className={btn} disabled={!admin || !!busy || !projekt.repo} onClick={() => aktion("sandbox")}>{busy === "sandbox" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Box className="w-4 h-4" />}In Windows-Sandbox starten</button>}
          {ziel === "cloud_lauf" && werkzeug && <button type="button" className={btn} disabled={!admin || !!busy || !projekt.repo} onClick={() => aktion("testlauf")}>{busy === "testlauf" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Play className="w-4 h-4" />}Testlauf starten</button>}
          {projekt.repo && programm && <a className={ghost} href={`https://github.com/${projekt.repo}/actions/workflows/programm.yml`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Builds bei GitHub</a>}
          {projekt.repo && werkzeug && <a className={ghost} href={`https://github.com/${projekt.repo}/actions/workflows/lauf.yml`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Läufe und Ergebnisse</a>}
        </div>
        {(ziel === "windows" || ziel === "mac") && !programm && <p className="text-xs text-slate-500">Sandbox und Builds gibt es heute für Projekte der Art „Programm (.exe)“ (unter „Anbindungen“ › „Art und Datenbank ändern“).</p>}
        {ziel === "cloud_lauf" && !werkzeug && <p className="text-xs text-slate-500">Testläufe gibt es heute für Projekte der Art „Werkzeug / Skript“.</p>}
        {ziel === "pdf" && <p className="text-xs text-slate-500">Bis dahin: Code live und Verlauf zeigen, was sich am Dokument ändert.</p>}
        {!admin && (programm || werkzeug) && <p className="text-xs text-slate-500">Sandbox und Testlauf startet der Admin.</p>}
        {aktiv && <p className="text-xs text-slate-500">Zweig des laufenden Auftrags #{aktiv.id}: <span className="font-mono">{aktiv.zweig}</span></p>}
      </div>
    </div>);
}

// ---------------- Code live ----------------
// Läuft ein Auftrag: Diff aus ws_code_live (schreibt die bearbeitende Werkstatt alle 5 s, flüchtig), Abfrage alle 3 s, dazu die Schritte (ws_live_log).
// Sonst: Diff des letzten Auftrags (Zweig gegen main) über eine Werkstatt (ws_code_anfragen, Art „diff“). Nur ansehen.
function CodeLive({ projekt, f, d, ich, onCode }) {
  const laufend = d.auftraege.find((a) => a.feature_id === f.id && a.stand === "laeuft") || null;
  const letzter = useMemo(() => [...d.auftraege].reverse().find((a) => a.feature_id === f.id && a.zweig && a.stand !== "abgebrochen") || null, [d.auftraege, f.id]);
  const meinPc = (d.pcs || []).find((p) => p.benutzer_id === ich.id && p.an && Date.now() - new Date(p.zuletzt).getTime() < 180000)?.id || null;
  const [stand, setStand] = useState({ laedt: false, fehler: null, dateien: null, gekuerzt: false, zeit: null });
  const [datei, setDatei] = useState(null);
  // Laufender Auftrag: kurz abfragen, nur solange die Seite sichtbar ist
  useEffect(() => {
    if (!laufend) return undefined;
    let aus = false;
    const holen = async () => {
      if (document.visibilityState === "hidden") return;
      const { data, error } = await supabase.from("ws_code_live").select("dateien, gekuerzt, aktualisiert, abgeschaltet").eq("auftrag_id", laufend.id).maybeSingle();
      if (aus) return;
      if (error) setStand((s) => ({ ...s, laedt: false, fehler: error }));
      else setStand({ laedt: false, fehler: null, dateien: data?.dateien || [], gekuerzt: !!data?.gekuerzt, zeit: data?.aktualisiert || null, abgeschaltet: !!data?.abgeschaltet });
    };
    setStand({ laedt: true, fehler: null, dateien: null, gekuerzt: false, zeit: null });
    holen(); const t = setInterval(holen, 3000);
    return () => { aus = true; clearInterval(t); };
  }, [laufend?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kein Auftrag läuft: Diff des letzten Auftrags einmal holen
  const holeLetzten = useCallback(async () => {
    if (!letzter || !projekt?.repo) return;
    setStand({ laedt: true, fehler: null, dateien: null, gekuerzt: false, zeit: null });
    try { const r = await codeFrage(projekt.id, letzter.zweig, "diff", null, meinPc); setStand({ laedt: false, fehler: null, dateien: r.baum || [], gekuerzt: !!r.hinweis, zeit: r.geaendert }); }
    catch (e) { setStand({ laedt: false, fehler: e, dateien: null, gekuerzt: false, zeit: null }); }
  }, [letzter?.zweig, projekt?.id, projekt?.repo, meinPc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!laufend) holeLetzten(); }, [laufend?.id, letzter?.zweig]); // eslint-disable-line react-hooks/exhaustive-deps
  const dateien = stand.dateien || [];
  const offen = dateien.find((x) => x.p === datei) || dateien.find((x) => x.zeilen) || dateien[0] || null;
  const kopf = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-sm">
      {laufend ? <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400"><i className="w-2 h-2 rounded-full bg-blue-600 motion-safe:animate-pulse" aria-hidden="true" />Werkstatt arbeitet · live (Auftrag #{laufend.id})</span>
        : <span className="text-slate-600 dark:text-slate-300">Kein Auftrag läuft{letzter ? ` – letzter Stand: Auftrag #${letzter.id}` : ""}</span>}
      {stand.zeit && <span className="text-xs text-slate-500">Stand {fmt(stand.zeit)}</span>}
      <span className="flex-1" />
      {!laufend && letzter && <button type="button" className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700" onClick={holeLetzten} title="Neu laden" aria-label="Neu laden"><RefreshCw className="w-4 h-4" /></button>}
      {onCode && <button type="button" className={`${ghost} h-8 px-2.5 text-xs`} onClick={onCode} title="Eigene Änderungen gehen über den Code-Editor als Auftrag"><FileCode2 className="w-3.5 h-3.5" />Im Code-Editor ändern</button>}
    </div>);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {kopf}
      <p className="px-3 pt-2 text-xs text-slate-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />Nur ansehen. Geheimnis-Dateien (.env, Schlüssel) sind ausgeblendet, Schlüssel-Werte maskiert.</p>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {stand.abgeschaltet && <p role="alert" className="text-sm rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 text-red-800 dark:text-red-300 px-3 py-2">
          Code live abgeschaltet: verdächtige Git-Einstellung im Arbeitsordner dieses Auftrags. Die Schritte siehst du weiter unten; bitte den Auftrag prüfen.</p>}
        {stand.abgeschaltet ? null : stand.fehler ? <Fehlerzustand klein titel="Änderungen konnten nicht geladen werden" fehler={stand.fehler} onErneut={laufend ? undefined : holeLetzten} />
          : stand.laedt || stand.dateien === null ? (letzter || laufend ? <Laden zeilen={4} text="Änderungen werden geladen" /> : <Leerzustand klein Symbol={Code2} titel="Noch keine Änderungen" text="Sobald die Werkstatt an diesem Feature arbeitet, siehst du hier Zeile für Zeile, was sie ändert." />)
          : !dateien.length ? <Leerzustand klein Symbol={Code2} titel={laufend ? "Noch keine Datei geändert" : "Keine Änderungen gegenüber main"} text={laufend ? "Die Werkstatt liest gerade – die erste Änderung erscheint hier nach wenigen Sekunden." : "Der Zweig des letzten Auftrags unterscheidet sich nicht von main."} />
          : <>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Geänderte Dateien">
              {dateien.map((x) => <button key={x.p} type="button" role="tab" aria-selected={offen?.p === x.p} onClick={() => setDatei(x.p)}
                className={`inline-flex items-center gap-1.5 max-w-full rounded-lg border px-2 py-1 font-mono text-xs ${offen?.p === x.p ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50" : "border-slate-200 dark:border-slate-700"}`}>
                {x.art === "ausgeblendet" && <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{x.p}</span>
                <em className="not-italic font-sans text-slate-500">{x.art === "geaendert" ? <><span className="text-green-700 dark:text-green-400">+{x.plus || 0}</span> <span className="text-red-700 dark:text-red-400">−{x.minus || 0}</span></> : DATEI_ART[x.art]}</em></button>)}
            </div>
            {stand.gekuerzt && <p className="text-xs text-amber-800 dark:text-amber-300">Gekürzt – große Änderungen sind nur teilweise übertragen.</p>}
            {offen && <DateiDiff x={offen} />}
          </>}
        {laufend && <Schritte auftragId={laufend.id} />}
      </div>
    </div>);
}

function DateiDiff({ x }) {
  if (!x.zeilen) return <p className="text-sm text-slate-600 dark:text-slate-300 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3">
    {x.art === "ausgeblendet" ? "Geheimnis-Datei – Inhalt wird nie übertragen." : x.art === "binaer" ? "Binärdatei (z. B. Bild) – nur genannt." : x.art === "gross" ? "Zu groß für die Anzeige – nur genannt." : x.art === "verknuepfung" ? "Verknüpfung – wird nicht gefolgt." : x.art === "geloescht" ? "Datei gelöscht." : "Zu viele Änderungen für die Anzeige."}</p>;
  return (
    <pre className="font-mono text-xs leading-relaxed bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto py-1.5" aria-label={`Änderungen in ${x.p}`}>
      {diffZeilen(x.zeilen).map((z) => <div key={z.nr} className={`px-2 whitespace-pre ${z.art === "add" ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300" : z.art === "del" ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300" : z.art === "abschnitt" ? "text-slate-500 bg-slate-100 dark:bg-slate-900" : ""}`}>
        <span className="sr-only">{z.art === "add" ? "hinzugefügt: " : z.art === "del" ? "entfernt: " : ""}</span>{z.text || " "}</div>)}
      {x.gekuerzt && <div className="px-2 text-slate-500">… gekürzt</div>}
    </pre>);
}

function Schritte({ auftragId }) {
  const { log } = useAuftragDetails([auftragId]);
  const ende = useRef(null);
  useEffect(() => { ende.current?.scrollIntoView?.({ block: "nearest" }); }, [log.length]);
  return (
    <section aria-label="Schritte des Laufs" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Schritte</h3>
      {!log.length ? <p className="text-xs text-slate-500">Die Werkstatt startet …</p> : <ol className="flex flex-col gap-1 text-[13px]" aria-live="polite">
        {log.slice(-40).map((l, i, arr) => <li key={l.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 items-baseline">
          <i className={`w-2 h-2 rounded-full ${i === arr.length - 1 ? "bg-blue-600 motion-safe:animate-pulse" : l.art === "fehler" ? "bg-red-600" : "bg-emerald-600"}`} aria-hidden="true" />
          <time className="text-xs text-slate-400 tabular-nums">{new Date(l.erstellt).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
          <span className="min-w-0 break-words">{l.text}</span></li>)}
      </ol>}
      <span ref={ende} />
    </section>);
}

// ---------------- Verlauf ----------------
function Verlauf({ projekt, f, d }) {
  const [versionen, setVersionen] = useState([]);
  useEffect(() => {
    if (!projekt?.id) return undefined; let aus = false;
    supabase.from("ws_live_versionen").select("commit_sha, geschaltet").eq("projekt_id", projekt.id).order("id", { ascending: false }).limit(200)
      .then(({ data }) => { if (!aus) setVersionen(data || []); });
    return () => { aus = true; };
  }, [projekt?.id]);
  const liste = verlaufEintraege(d.auftraege, f.id, versionen);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
      {!liste.length ? <Leerzustand klein Symbol={History} titel="Noch kein Verlauf" text="Aufträge und Live-Schaltungen zu diesem Feature erscheinen hier mit Zeit." />
        : <ol className="flex flex-col gap-2 text-sm">
          {liste.map((e, i) => <li key={`${e.art}-${e.auftrag}-${i}`} className="grid grid-cols-[auto_88px_minmax(0,1fr)] gap-2 items-baseline">
            {e.art === "live" ? <CircleCheck className="w-4 h-4 text-emerald-600 translate-y-0.5" aria-label="live" /> : <i className="w-2 h-2 rounded-full bg-slate-400 ml-1" aria-hidden="true" />}
            <time className="text-xs text-slate-500 tabular-nums">{fmt(e.zeit)}</time>
            <span className={`min-w-0 break-words ${e.art === "live" ? "font-semibold text-emerald-800 dark:text-emerald-300" : ""}`}>{e.text}</span></li>)}
        </ol>}
      <p className="text-xs text-slate-500 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />Zurück auf einen früheren Stand geht nur für die ganze App: „Zu erledigen“ › Live › Zurücksetzen (nur Admin, nur Versionen, die zur Datenbank passen).</p>
    </div>);
}


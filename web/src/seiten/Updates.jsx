// Updates & Freigabe (0.20.0) – Anweisung Gerhard 2026-11-07 21:07 („Auch das mit den Updates muss Codeschmiede übernehmen“),
// Antworten 21:12 („Gleicher Weg in beiden“, „Automatisch nachziehen“), Entwurf freigegeben 21:16 „passt so“.
// Reiter: Warten auf Freigabe · Verlauf · Abgleich mit main. Live geht nur über den Ablauf des Projekts (.github/workflows/freigabe.yml) –
// derselbe Weg wie in der Plattform der App; ein Klick hier oder dort wirkt gleich. Handeln darf nur der Admin.
import { useCallback, useEffect, useState } from "react";
import { Check, CircleCheck, Database, GitPullRequest, History, Info, Loader2, Megaphone, Moon, RefreshCw, Rocket, Undo2, X } from "lucide-react";
import { btn, card, fehler, fmt, ghost, gefahrBtn, input } from "../bausteine/grund";
import { supabase } from "../supabase";
import { Leerzustand } from "../bausteine/zustand";

const ROLLE = { alle: "Alle", trainer: "Trainer", admin: "Vereinsadmin", funktionaer: "Funktionäre", eltern: "Eltern & Spieler", spieler: "Spieler", kassier: "Kassier", plattform: "Plattform" };
const ART = { neu: ["Neu", "bg-emerald-50 text-emerald-800 border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-200"], fix: ["Fix", "bg-orange-50 text-orange-800 border-orange-500 dark:bg-orange-950/40 dark:text-orange-200"],
  doku: ["Doku", "bg-slate-50 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-200"] };
const VERLAUF = { freigabe: ["Freigabe", ART.neu[1]], abend: ["Freigabe 22:00", ART.neu[1]], planen: ["Geplant", "bg-blue-50 text-blue-800 border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"],
  zuruecknehmen: ["Zurückgenommen", ART.doku[1]], zurueck: ["Zurück", "bg-red-50 text-red-800 border-red-600 dark:bg-red-950/40 dark:text-red-200"] };
const marke = (k) => `text-xs font-bold rounded-md border px-1.5 py-px whitespace-nowrap ${k}`;
const datumText = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "heute");

export function Updates({ d, ich, toast }) {
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const admin = ich.rolle === "admin";
  const [tab, setTab] = useState("warten");
  const [stand, setStand] = useState(null); const [auftrag, setAuftrag] = useState(null);
  const [aufbau, setAufbau] = useState(null); const [chat, setChat] = useState([]);
  const [frage, setFrage] = useState(null); const [busy, setBusy] = useState(false); const [version, setVersion] = useState("");
  const holen = useCallback(async () => {
    const [s, a, b, c] = await Promise.all([
      supabase.from("ws_freigabe_stand").select("stand, aktualisiert").eq("projekt_id", d.projektId).maybeSingle(),
      supabase.from("ws_live_auftraege").select("*").eq("projekt_id", d.projektId).order("id", { ascending: false }).limit(1),
      supabase.from("ws_aufbau_stand").select("*").eq("projekt_id", d.projektId).maybeSingle(),
      supabase.from("ws_chat_arbeit").select("*").eq("projekt_id", d.projektId).order("am", { ascending: false }).limit(40),
    ]);
    setStand(s.data || null); setAuftrag(a.data?.[0] || null); setAufbau(b.data || null); setChat(c.data || []);
  }, [d.projektId]);
  useEffect(() => {
    holen();
    const ch = supabase.channel("cs-updates-" + d.projektId);
    ["ws_freigabe_stand", "ws_live_auftraege", "ws_aufbau_stand", "ws_chat_arbeit"].forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, holen));
    ch.subscribe(); const t = setInterval(holen, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [holen, d.projektId]);
  if (!projekt) return null;

  const st = stand?.stand;
  const offen = auftrag && ["wartet", "laeuft"].includes(auftrag.stand);
  const ablaufLaeuft = st?.lauf && st.lauf.status !== "completed";
  const anfordern = async (art, extra = {}) => {
    setBusy(true);
    const { error } = await supabase.rpc("ws_live_anfordern", { p_projekt: projekt.id, p_art: art, p_version: null, p_commit: ["live", "planen"].includes(art) ? st?.main_sha : null, p_version_name: extra.version || null });
    setBusy(false); setFrage(null);
    toast(error ? fehler(error) : { live: "Freigabe gestartet – die Werkstatt startet den Ablauf „Freigabe live“", planen: "Für heute 22:00 freigegeben", zuruecknehmen: "Geplante Freigabe wird zurückgenommen", zurueck: `Zurück auf ${extra.version} gestartet` }[art]);
    holen();
  };
  const fehltG = d.gruppen.filter((g) => g.app_fehlt);
  const fehltF = d.features.filter((f) => f.fehlt_im_verzeichnis && !f.ausgebaut);
  const bestaetigen = async (art, id) => {
    const { error } = await supabase.rpc("ws_aufbau_entfernt_bestaetigen", { p_projekt: projekt.id, p_art: art, p_id: id });
    toast(error ? fehler(error) : art === "feature" ? "Feature ausgebaut" : "Gruppe entfernt"); await d.holen?.();
  };
  const wartend = (st?.wartet || []).filter((w) => w.art !== "doku");
  const tabs = [["warten", `Warten auf Freigabe${st ? ` (${wartend.length})` : ""}`], ["verlauf", "Verlauf"], ["abgleich", "Abgleich mit main"]];

  const status = auftrag && (offen || Date.now() - Date.parse(auftrag.geaendert) < 30 * 60 * 1000) && (
    <div role="status" className={`text-sm rounded-lg px-3 py-2 inline-flex items-center gap-2 ${auftrag.stand === "fehler" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : offen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"}`}>
      {offen ? <Loader2 className="w-4 h-4 animate-spin" /> : auftrag.stand === "fehler" ? <Info className="w-4 h-4" /> : <CircleCheck className="w-4 h-4" />}
      <span className="min-w-0 break-words">{offen ? (auftrag.stand === "wartet" ? "Wartet auf die Werkstatt des Admins (Programm muss laufen, ab Version 0.20.0)" : auftrag.hinweis || "Werkstatt arbeitet") : auftrag.hinweis}</span></div>);

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <p className="text-sm text-slate-600 dark:text-slate-300 max-w-[80ch]">
        Testseite = main{projekt.test_url ? ` (${projekt.test_url.replace(/^https:\/\//, "")})` : ""} · Live = {projekt.live_url ? projekt.live_url.replace(/^https:\/\//, "") : "Zweig „live“"}.
        {projekt.freigabe_ablauf ? " Gleicher Ablauf wie in der Plattform › Produkt › Updates & Freigabe: ein Klick hier oder dort wirkt gleich, beide zeigen denselben Stand." : ""}</p>
      <div role="tablist" className="flex gap-1.5 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-2">
        {tabs.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${tab === k ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 dark:border-slate-700"}`}>{t}</button>)}
        <span className="ml-auto self-center">{status}</span>
      </div>

      {tab !== "abgleich" && !projekt.live_zweig && <div className={`${card} p-4 text-sm`}>Dieses Projekt hat noch kein „Test & Live“ – was zusammengeführt ist, geht direkt live. Einrichten unter <b>Zu erledigen › Weg bis live</b>.</div>}
      {tab !== "abgleich" && projekt.live_zweig && !projekt.freigabe_ablauf && <div className={`${card} p-4 text-sm flex flex-col gap-1`}>
        <b>Ohne Freigabe-Ablauf</b><span>Dieses Projekt hat keinen Ablauf <span className="font-mono">.github/workflows/freigabe.yml</span>. Live schalten und zurück gehen wie bisher unter <b>Zu erledigen › Weg bis live</b>.</span></div>}
      {tab !== "abgleich" && projekt.freigabe_ablauf && !st && <div className={`${card} p-4 text-sm`}>Der Stand wird gerade gelesen – die Werkstatt des Admins meldet ihn alle paar Minuten.</div>}

      {tab === "warten" && projekt.freigabe_ablauf && st && (
        <div className="flex flex-col gap-4">
          {st.geplant ? (
            <section className="rounded-2xl border border-orange-500 bg-orange-50 dark:bg-orange-950/30 p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="min-w-0 flex flex-col gap-1"><b className="font-display text-lg">Geplant: {datumText(st.geplant.datum)} um 22:00 live</b>
                <span className="text-sm text-slate-700 dark:text-slate-300">Stand <span className="font-mono">{st.geplant.sha.slice(0, 7)}</span>{st.geplant.von ? ` · von ${st.geplant.von}` : ""}. Kommt bis dahin etwas dazu, geht trotzdem nur dieser Stand live.</span></div>
              {admin && <button type="button" className={ghost} disabled={busy || offen} onClick={() => anfordern("zuruecknehmen")}><X className="w-4 h-4" />Zurücknehmen</button>}
            </section>
          ) : wartend.length > 0 ? (
            <section className={`${card} p-4 flex flex-wrap gap-3 items-center justify-between`}>
              <div className="min-w-0 flex flex-col gap-1"><b className="font-display text-lg">{wartend.length === 1 ? "1 Änderung wartet" : `${wartend.length} Änderungen warten`} auf Freigabe</b>
                <span className="text-sm text-slate-600 dark:text-slate-300">Gesehener Stand main <span className="font-mono">{st.main_sha.slice(0, 7)}</span>{st.datenbank ? " · Datenbank-Änderungen gehen mit in die Live-Datenbank" : ""}{st.mitteilungen?.length ? ` · ${st.mitteilungen.length} „Was ist neu?“-Mitteilung(en)` : ""}</span></div>
              {admin && (frage === "live"
                ? <span className="flex gap-2 flex-wrap items-center text-sm rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-600 p-2">Genau Stand {st.main_sha.slice(0, 7)} jetzt live schalten?
                    <button type="button" className={`${btn} h-9`} disabled={busy} onClick={() => anfordern("live")}>Ja, jetzt live</button><button type="button" className={`${ghost} h-9`} onClick={() => setFrage(null)}>Abbrechen</button></span>
                : <div className="flex gap-2 flex-wrap">
                    <button type="button" className={ghost} disabled={busy || offen || ablaufLaeuft} onClick={() => anfordern("planen")}><Moon className="w-4 h-4" />Heute um 22:00 live</button>
                    <button type="button" className={btn} disabled={busy || offen || ablaufLaeuft} onClick={() => setFrage("live")}><Rocket className="w-4 h-4" />Alle freigeben – jetzt live</button></div>)}
            </section>
          ) : (
            <section className="rounded-2xl border border-green-600 bg-green-50 dark:bg-green-950/30 p-4 flex flex-col gap-1">
              <b className="font-display text-lg flex items-center gap-2"><Check className="w-5 h-5" />Alles live</b>
              <span className="text-sm text-slate-700 dark:text-slate-300">Live: {st.live_bez} · nichts wartet auf Freigabe{st.commits ? ` (nur ${st.commits} Commit(s) ohne Pull Request bzw. Doku)` : ""}.</span></section>
          )}
          {ablaufLaeuft && <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Bei GitHub läuft gerade „{st.lauf.titel}“.</p>}

          {wartend.length > 0 && <section className={`${card} px-4 py-2`} aria-label="Was live geht">
            <h2 className="font-display font-bold text-base pt-2 pb-1">Was live geht</h2>
            {wartend.map((w) => (
              <div key={w.nr} className="flex flex-wrap gap-x-3 gap-y-1 items-center py-2.5 border-t border-slate-100 dark:border-slate-800 text-sm">
                <span className="font-mono text-slate-500 min-w-[44px]">#{w.nr}</span>
                <span className="flex-1 basis-[260px] min-w-0 font-semibold break-words">{w.titel}</span>
                <span className={marke(ART[w.art]?.[1] || ART.neu[1])}>{ART[w.art]?.[0] || "Neu"}</span>
                <span className="text-xs text-slate-500">{/^feature\/cs-\d+/.test(w.zweig) ? `Codeschmiede-Auftrag #${w.zweig.match(/^feature\/cs-(\d+)/)[1]}` : w.zweig ? "Claude-Chat" : ""}</span>
              </div>))}
            {st.datenbank && <div className="flex items-center gap-2 text-sm py-2.5 border-t border-slate-100 dark:border-slate-800 text-blue-800 dark:text-blue-300"><Database className="w-4 h-4" />Datenbank-Dateien gehen beim Live-Gang in die Live-Datenbank (Ablauf des Projekts).</div>}
          </section>}

          <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Was ist neu">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display font-bold text-base flex items-center gap-2"><Megaphone className="w-4 h-4" />„Was ist neu?“ – geht nach dem Live-Gang an die Betroffenen</h2>
              <span className="text-xs text-slate-500">schreibt die Werkstatt bei jedem Auftrag mit (einfache Sprache, je Rolle)</span></div>
            {(st.mitteilungen || []).length === 0 ? <p className="text-sm text-slate-500">Für die wartenden Änderungen gibt es noch keine Mitteilung.</p> : (
              <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
                {st.mitteilungen.map((m) => (
                  <article key={m.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex flex-col gap-1.5">
                    <div className="flex gap-1 flex-wrap">{(m.fuer?.length ? m.fuer : ["alle"]).map((r) => <span key={r} className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{ROLLE[r] || r}</span>)}</div>
                    <b className="text-sm">{m.titel}</b><p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{m.text}</p></article>))}
              </div>)}
            <p className="text-xs text-slate-500">Fehlt ein Text oder passt er nicht: als kleinen Auftrag im passenden Feature anlegen (die Texte liegen im Projekt in <span className="font-mono">src/lib/neuigkeiten.json</span>).</p>
          </section>
        </div>)}

      {tab === "verlauf" && projekt.freigabe_ablauf && st && (
        <div className="flex flex-col gap-4">
          <section className={`${card} px-4 py-2`} aria-label="Verlauf">
            {(st.verlauf || []).length === 0 && <Leerzustand klein Symbol={History} titel="Noch kein Verlauf" text="Hier erscheint jede Freigabe aus Codeschmiede und Plattform." />}
            {(st.verlauf || []).map((v, i) => (
              <div key={i} className="flex flex-wrap gap-x-3 gap-y-1 items-center py-2.5 border-t first:border-t-0 border-slate-100 dark:border-slate-800 text-sm">
                <span className="text-slate-500 min-w-[110px]">{fmt(v.am)}</span>
                <span className={marke(VERLAUF[v.art]?.[1] || ART.doku[1])}>{VERLAUF[v.art]?.[0] || v.art}</span>
                <span className="flex-1 basis-[200px] min-w-0 font-mono text-xs break-all">{v.ziel === "-" ? "" : v.ziel.startsWith("version/") ? v.ziel : v.ziel.slice(0, 7)}</span>
                <span className="text-xs text-slate-500">{v.von}</span>
                <span className={`text-xs font-semibold ${v.ergebnis === "success" ? "text-green-700 dark:text-green-400" : v.status !== "completed" ? "text-blue-700 dark:text-blue-300" : "text-red-700 dark:text-red-400"}`}>
                  {v.status !== "completed" ? "läuft" : v.ergebnis === "success" ? "ok" : v.ergebnis || "–"}</span>
              </div>))}
          </section>
          <section className={`${card} p-4 flex flex-col gap-2`} aria-label="Auf frühere Version zurück">
            <h2 className="font-display font-bold text-base">Notfall: auf frühere Version zurück</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-[80ch]">Nur Versionen, die schon einmal live waren. Die Datenbank bleibt auf dem neuen Stand. Vorher wird der jetzige Stand gesichert.</p>
            {(st.zurueck || []).length === 0 ? <p className="text-sm text-slate-500">Keine frühere Live-Version gefunden.</p> : admin && (
              <div className="flex gap-2 flex-wrap items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-500">Version
                  <select className={`${input} h-10 py-0`} value={version} onChange={(e) => { setVersion(e.target.value); setFrage(null); }}>
                    <option value="">– bitte wählen –</option>{st.zurueck.map((v) => <option key={v} value={v}>{v.replace(/^version\//, "")}</option>)}</select></label>
                {frage === "zurueck"
                  ? <span className="flex gap-2 flex-wrap items-center text-sm rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-600 p-2">Wirklich zurück auf {version.replace(/^version\//, "")}? Live zeigt dann die alte Version.
                      <button type="button" className={`${gefahrBtn} h-9`} disabled={busy} onClick={() => anfordern("zurueck", { version })}>Ja, zurück</button><button type="button" className={`${ghost} h-9`} onClick={() => setFrage(null)}>Abbrechen</button></span>
                  : <button type="button" className={`${ghost} border-red-500 text-red-700 dark:text-red-300`} disabled={!version || busy || offen} onClick={() => setFrage("zurueck")}><Undo2 className="w-4 h-4" />Zurück auf diese Version …</button>}
              </div>)}
          </section>
        </div>)}

      {tab === "abgleich" && (
        <div className="flex flex-col gap-4">
          {!projekt.aufbau_datei ? <div className={`${card} p-4 text-sm`}>Dieses Projekt hat keine Aufbau-Datei (wie <span className="font-mono">src/lib/appStruktur.js</span> bei Trainer to go). Konzepte und Dokumentation aus main kommen trotzdem automatisch in die Wissensdatenbank.</div> : (
            <section className={`rounded-2xl border p-4 flex flex-col gap-1 ${aufbau?.wartet ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30" : "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"}`}>
              <b className="font-display text-lg flex items-center gap-2"><RefreshCw className="w-5 h-5" />{aufbau ? <>Auf Stand mit main <span className="font-mono">{aufbau.main_sha.slice(0, 7)}</span> · {fmt(aufbau.zeit)}</> : "Noch nicht abgeglichen"}</b>
              <span className="text-sm text-slate-700 dark:text-slate-300 max-w-[85ch]">{aufbau?.wartet || "Nach jedem neuen Stand von main liest die Werkstatt des Admins Aufbau, Features und Konzepte nach – egal ob in der Codeschmiede oder in einem Claude-Chat gebaut. Die App ist die Quelle; Änderungen am Aufbau in der Codeschmiede gehen wie bisher per „In die App übernehmen“ zurück in die App."}</span>
            </section>)}
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start">
            {projekt.aufbau_datei && <section className={`${card} p-4 flex flex-col gap-2`} aria-label="Aufbau – neu aus der App">
              <h2 className="font-display font-bold text-base">Aufbau – zuletzt nachgezogen</h2>
              {!aufbau?.ergebnis || Object.keys(aufbau.ergebnis).length === 0 ? <p className="text-sm text-slate-500">Noch nichts.</p> : <>
                {[["neue_obergruppen", "Obergruppe"], ["neue_gruppen", "Menüpunkt"]].flatMap(([k, t]) => (aufbau.ergebnis[k] || []).map((n) => (
                  <div key={k + n} className="flex gap-2 items-baseline text-sm border-t border-slate-100 dark:border-slate-800 pt-2"><span className={marke(ART.neu[1])}>{t}</span><span className="min-w-0">{n}</span></div>)))}
                {(aufbau.ergebnis.neue_features || []).length > 0 && <div className="flex gap-2 items-baseline text-sm border-t border-slate-100 dark:border-slate-800 pt-2"><span className={marke(ART.neu[1])}>{aufbau.ergebnis.neue_features.length} Features</span>
                  <span className="min-w-0 text-slate-700 dark:text-slate-300">{aufbau.ergebnis.neue_features.slice(0, 8).join(" · ")}{aufbau.ergebnis.neue_features.length > 8 ? " …" : ""}</span></div>}
                {(aufbau.ergebnis.verschoben > 0 || aufbau.ergebnis.umbenannt > 0) && <p className="text-sm border-t border-slate-100 dark:border-slate-800 pt-2">{aufbau.ergebnis.verschoben} verschoben, {aufbau.ergebnis.umbenannt} umbenannt (wie im Menü der App).</p>}
              </>}
            </section>}
            {(fehltG.length > 0 || fehltF.length > 0) && <section className={`${card} p-4 flex flex-col gap-2`} aria-label="In der App entfernt">
              <h2 className="font-display font-bold text-base">In der App entfernt – ausbauen?</h2>
              <p className="text-xs text-slate-500">Nichts wird von selbst gelöscht. Erst die Features ausbauen, dann die leere Gruppe.</p>
              {[...fehltF.map((f) => ["feature", f.id, `${f.id} ${f.name}`]), ...fehltG.map((g) => ["gruppe", g.id, `Menüpunkt ${g.name}`])].map(([art, id, t]) => (
                <div key={art + id} className="flex gap-2 items-center flex-wrap text-sm border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span className="flex-1 min-w-0">{t}</span>{admin && <button type="button" className={`${ghost} h-8 text-xs`} onClick={() => bestaetigen(art, id)}>{art === "feature" ? "Ausbauen" : "Entfernen"}</button>}</div>))}
            </section>}
            <section className={`${card} p-4 flex flex-col gap-2`} aria-label="Im Claude-Chat gebaut">
              <h2 className="font-display font-bold text-base flex items-center gap-2"><GitPullRequest className="w-4 h-4" />Im Claude-Chat gebaut</h2>
              {chat.length === 0 ? <p className="text-sm text-slate-500">Noch keine Pull Requests aus Claude-Chats.</p> : chat.map((c) => (
                <div key={c.nr} className="flex gap-2 items-baseline text-sm border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span className="font-mono text-xs text-slate-500">#{c.nr}</span><span className="flex-1 min-w-0 break-words">{c.titel}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{c.feature_ids.length ? c.feature_ids.map((i) => d.features.find((f) => f.id === i)?.name || i).slice(0, 2).join(", ") : fmt(c.am)}</span></div>))}
              {chat.length > 0 && <p className="text-xs text-slate-500">Pull Requests der letzten 30 Tage, die nicht aus der Codeschmiede kommen. Steht eine Feature-Nummer dabei, siehst du sie auch beim Feature.</p>}
            </section>
          </div>
        </div>)}
    </div>);
}

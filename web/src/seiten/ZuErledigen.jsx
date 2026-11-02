// ZuErledigen – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useCallback, useEffect, useState } from "react";
import { Check, CircleCheck, ExternalLink, FlaskConical, GitPullRequest, Globe, Info, Loader2, MessageSquare, Rocket, ScanSearch, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { AbbrechenKnopf } from "./Zentrale";
import { FreigabeKnopf, ZusammenKnopf } from "../Auftragsknoepfe";
import { Markdown } from "../Markdown";
import { STEPS, STEP_IDX, btn, card, fehler, fmt, ghost, input } from "../bausteine/grund";
import { supabase } from "../supabase";
import { useRechte } from "../daten/werkstattDaten";
import { Leerzustand } from "../bausteine/zustand";

export function aufgabenListe(d, darf) {
  const bereich = (a) => d.gruppen.find((g) => g.id === a.gruppe_id)?.bereich_id;
  const l = [];
  d.auftraege.filter((a) => a.offeneFrage && darf(bereich(a), "auftraege")).forEach((a) => l.push({ art: "frage", a }));
  (d.erlaubnisse || []).forEach((e) => { const a = d.auftraege.find((x) => x.id === e.auftrag_id); if (a && darf(bereich(a), "freigeben")) l.push({ art: "erlaubnis", a, e }); });
  d.auftraege.filter((a) => a.stand === "freigabe" && darf(bereich(a), "freigeben")).forEach((a) => l.push({ art: "freigabe", a }));
  d.auftraege.filter((a) => a.stand === "zusammen" && darf(bereich(a), "freigeben")).forEach((a) => l.push({ art: "zusammen", a }));
  return l;
}
export const AUFGABE = { frage: ["Rückfrage", "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"], erlaubnis: ["Erlaubnis", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"],
  freigabe: ["Freigabe", "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"], zusammen: ["Zusammenführen", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"] };

export function ZuErledigen({ d, ich, toast, onOeffne }) {
  const darf = useRechte(d, ich);
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const liste = aufgabenListe(d, darf);
  const [filter, setFilter] = useState("alle");
  const fragIds = liste.filter((x) => x.art === "frage").map((x) => x.a.id);
  const [fragen, setFragen] = useState({});
  useEffect(() => {
    if (!fragIds.length) { setFragen({}); return; }
    supabase.from("ws_nachrichten").select("auftrag_id, text, id").in("auftrag_id", fragIds).eq("art", "frage").order("id", { ascending: false })
      .then(({ data }) => { const m = {}; (data || []).forEach((n) => { if (!(n.auftrag_id in m)) m[n.auftrag_id] = n.text; }); setFragen(m); });
  }, [fragIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const gName = (a) => d.gruppen.find((g) => g.id === a.gruppe_id)?.name || "";
  const fName = (a) => d.features.find((f) => f.id === a.feature_id)?.name;
  const laufend = d.auftraege.filter((a) => ["laeuft", "sicherheit", "feature", "wartet"].includes(a.stand));
  const rpc = async (fn, args, ok) => { const { error } = await supabase.rpc(fn, args); toast(error ? fehler(error) : ok); };
  const gezeigt = liste.filter((x) => filter === "alle" || x.art === filter);
  return (
    <div className="flex flex-col gap-5">
      <LiveWeg d={d} ich={ich} projekt={projekt} toast={toast} />
      <div className="grid gap-5 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Wartet auf dich">
          <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display font-bold text-xl">Wartet auf dich</h2>
            <span className="min-w-[24px] text-center rounded-full px-1.5 text-sm font-bold bg-amber-500 text-amber-950 tabular-nums">{liste.length}</span></div>
          <div className="flex gap-1.5 flex-wrap" role="tablist">
            {[["alle", "Alle"], ["frage", "Rückfragen"], ["erlaubnis", "Erlaubnisse"], ["freigabe", "Freigaben"], ["zusammen", "Zusammenführen"]].map(([k, t]) => {
              const z = k === "alle" ? liste.length : liste.filter((x) => x.art === k).length;
              return <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${filter === k ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" : "border-slate-200 dark:border-slate-700"}`}>{t} <span className="tabular-nums text-slate-500">{z}</span></button>;
            })}
          </div>
          {gezeigt.length === 0 && <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl"><Leerzustand klein Symbol={CircleCheck} titel="Alles erledigt" text="Hier wartet gerade nichts auf dich." /></div>}
          {gezeigt.map(({ art, a, e }) => (
            <article key={`${art}-${e?.id || a.id}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap gap-3 items-start justify-between">
              <div className="min-w-0 flex-1 basis-[260px] flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap text-sm"><span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${AUFGABE[art][1]}`}>{AUFGABE[art][0]}</span>
                  <b className="font-display">#{a.id} {fName(a) || a.titel}</b><span className="text-xs text-slate-500">{gName(a)}</span></div>
                {art === "frage" && <div className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3"><Markdown text={fragen[a.id] || "Die Werkstatt wartet auf deine Antwort."} klein /></div>}
                {art === "erlaubnis" && <><code className="block font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1.5 break-words">{e.werkzeug}: {e.eingabe}</code>{e.grund && <span className="text-xs text-slate-500">{e.grund}</span>}</>}
                {art === "freigabe" && <span className="text-xs text-slate-500 inline-flex items-center gap-1.5 flex-wrap"><GitPullRequest className="w-3.5 h-3.5" />Pull Request #{a.pr_nummer}{a.pruefung?.lokal && <> · Bauen & Tests am PC {a.pruefung.lokal.ergebnis === "gruen" ? "grün" : "rot"}</>}</span>}
                {art === "zusammen" && <span className="text-xs text-green-700 dark:text-green-400 inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Sicherheitsprüfung grün · Pull Request #{a.pr_nummer}</span>}
              </div>
              <div className="flex gap-2 flex-wrap items-center text-xs">
                {art === "frage" && <><button type="button" className={`${btn} h-9 text-sm`} onClick={() => onOeffne(a)}><MessageSquare className="w-4 h-4" />Antworten</button>{(ich.rolle === "admin" || a.erstellt_von === ich.id) && <AbbrechenKnopf a={a} toast={toast} />}</>}
                {art === "erlaubnis" && <><button type="button" className={`${btn} h-9 text-sm`} onClick={() => rpc("ws_erlaubnis_entscheiden", { p_id: e.id, p_status: "einmal" }, "Einmal erlaubt")}><Check className="w-4 h-4" />Erlauben</button>
                  <button type="button" className={`${ghost} h-9`} onClick={() => rpc("ws_erlaubnis_entscheiden", { p_id: e.id, p_status: "abgelehnt" }, "Abgelehnt")}>Ablehnen</button></>}
                {art === "freigabe" && <>{projekt?.repo && a.pr_nummer && <a className={`${ghost} h-9`} href={`https://github.com/${projekt.repo}/pull/${a.pr_nummer}/files`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />Änderung ansehen</a>}
                  <FreigabeKnopf a={a} ohneInfo onJa={() => rpc("ws_freigeben", { p_auftrag: a.id }, `Auftrag #${a.id} freigegeben – Sicherheitsprüfung startet`)} /><AbbrechenKnopf a={a} toast={toast} /></>}
                {art === "zusammen" && <ZusammenKnopf a={a} onJa={() => rpc("ws_zusammenfuehren", { p_auftrag: a.id }, `Auftrag #${a.id}: Zusammenführen gestartet`)} />}
              </div>
            </article>))}
          {laufend.length > 0 && <p className="text-xs text-slate-500">Laufend (nichts zu tun): {laufend.slice(0, 6).map((a) => `#${a.id} ${STEPS[STEP_IDX[a.stand]]?.[1] || a.stand}`).join(" · ")}{laufend.length > 6 ? " …" : ""}. Knöpfe sieht nur, wer das Recht dazu hat.</p>}
        </section>
        <JetztPruefen d={d} ich={ich} darf={darf} projekt={projekt} toast={toast} />
      </div>
    </div>);
}

// Weg bis live: Test (main) und Live (Zweig „live“) nebeneinander; einrichten, live schalten, zurück – nur der Admin
export function LiveWeg({ d, ich, projekt, toast }) {
  const [versionen, setVersionen] = useState([]); const [auftrag, setAuftrag] = useState(null); const [testStand, setTestStand] = useState(null);
  const [frage, setFrage] = useState(null); const [busy, setBusy] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const admin = ich.rolle === "admin";
  const holen = useCallback(async () => {
    const [v, a, t] = await Promise.all([
      supabase.from("ws_live_versionen").select("*").eq("projekt_id", d.projektId).order("id", { ascending: false }).limit(20),
      supabase.from("ws_live_auftraege").select("*").eq("projekt_id", d.projektId).order("id", { ascending: false }).limit(1),
      supabase.from("ws_abgleich").select("main_sha, zeit").eq("projekt_id", d.projektId).maybeSingle(),   // Stand von main aus dem Abgleich (alle 10 Minuten)
    ]);
    setVersionen(v.data || []); setAuftrag(a.data?.[0] || null); setTestStand(/^[0-9a-f]{40}$/.test(t.data?.main_sha || "") ? t.data : null);
  }, [d.projektId]);
  useEffect(() => {
    holen();
    const ch = supabase.channel("cs-live-" + d.projektId);
    ["ws_live_versionen", "ws_live_auftraege"].forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, holen));
    ch.subscribe(); const t = setInterval(holen, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [holen, d.projektId]);
  useEffect(() => { setTestUrl(projekt?.test_url || (projekt?.vorschau_domain ? `https://main.${projekt.vorschau_domain}` : "")); }, [projekt?.test_url, projekt?.vorschau_domain]);
  if (!projekt) return null;
  const offen = auftrag && ["wartet", "laeuft"].includes(auftrag.stand);
  const anfordern = async (art, version) => {
    setBusy(true); const { error } = await supabase.rpc("ws_live_anfordern", { p_projekt: projekt.id, p_art: art, p_version: version?.id ?? null, p_commit: art === "live" ? testStand?.main_sha ?? null : null }); setBusy(false); setFrage(null);
    toast(error ? fehler(error) : art === "einrichten" ? "Wird eingerichtet – die Werkstatt des Admins legt den Zweig „live“ an" : art === "live" ? "Live schalten gestartet" : `Zurück auf ${version.bezeichnung} gestartet`);
    holen();
  };
  const umgestellt = async (an) => {
    setBusy(true); const { error } = await supabase.rpc("ws_live_umgestellt", { p_projekt: projekt.id, p_an: an, p_test_url: an ? (testUrl.trim() || null) : null }); setBusy(false);
    toast(error ? fehler(error) : an ? "Test & Live ist eingeschaltet" : "Test & Live ist ausgeschaltet – main geht wieder direkt live"); await d.holen?.();
  };
  const jetzt = versionen[0];
  const imTest = d.features.filter((f) => f.stand === "test" && !f.ausgebaut);
  const sperre = (v) => { const fehlt = (jetzt?.migrationen || []).filter((m) => !(v.migrationen || []).includes(m)); return fehlt.length ? `Passt nicht zur Datenbank (neuer: ${fehlt.slice(0, 2).join(", ")}${fehlt.length > 2 ? " …" : ""})` : null; };
  const status = auftrag && (offen || Date.now() - Date.parse(auftrag.geaendert) < 30 * 60 * 1000) && (
    <div role="status" className={`text-sm rounded-lg px-3 py-2 inline-flex items-center gap-2 ${auftrag.stand === "fehler" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : offen ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"}`}>
      {offen ? <Loader2 className="w-4 h-4 animate-spin" /> : auftrag.stand === "fehler" ? <Info className="w-4 h-4" /> : <CircleCheck className="w-4 h-4" />}
      {offen ? (auftrag.stand === "wartet" ? "Wartet auf die Werkstatt des Admins (Programm muss laufen)" : auftrag.hinweis || "Werkstatt arbeitet") : auftrag.hinweis}
      {auftrag.stand === "fertig" && auftrag.art !== "einrichten" && " – Cloudflare baut die Live-Fassung jetzt (1–3 Minuten)"}</div>);
  const schritte = [["Auftrag", "Werkstatt baut auf eigenem Zweig"], ["Freigeben", "du siehst den Pull Request"], ["Sicherheitsprüfung", "unabhängig, automatisch"], ["Zusammenführen", "in den Hauptstand"], ["Test", "auf der Testadresse ansehen"], ["Live schalten", projekt.live_url ? projekt.live_url.replace(/^https:\/\//, "") : "deine Live-Adresse"]];
  return (
    <section className={`${card} p-4 flex flex-col gap-4`} aria-label="Weg bis live">
      <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display font-bold text-xl">Weg bis live</h2>{status}</div>
      <ol className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
        {schritte.map(([t, u], i) => <li key={t} className={`rounded-lg border px-3 py-2 ${i >= 4 && !projekt.live_zweig ? "border-dashed border-slate-300 dark:border-slate-700 text-slate-400" : "border-slate-200 dark:border-slate-800"}`}><b className="font-display">{i + 1} · {t}</b><div className="text-xs text-slate-500">{u}</div></li>)}
      </ol>
      {!projekt.live_zweig ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 text-sm">
          <p><b>Noch ohne Testfassung:</b> Was zusammengeführt und geprüft ist, geht bisher direkt live{projekt.live_url ? ` (${projekt.live_url})` : ""}. Mit <b>Test & Live</b> landet es zuerst auf einer Testadresse und geht erst live, wenn du auf „Live schalten“ klickst. {projekt.db_live_ref ? "Datenbank-Änderungen gehen mit dem Live-Schalten in die Live-Datenbank (Datenbank-Station)." : "Test und Live nutzen dieselbe Datenbank (eigene Live-Datenbank: unter „Anbindungen“ › Datenbank-Station)."}</p>
          {!projekt.repo ? <p className="text-slate-500">Zuerst braucht das Projekt ein GitHub-Repository (Projekte verwalten).</p>
            : !admin ? <p className="text-slate-500">Einrichten kann der Admin.</p>
            : !jetzt ? <button type="button" className={`${btn} self-start`} disabled={busy || offen} onClick={() => anfordern("einrichten")}><FlaskConical className="w-4 h-4" />Test & Live einrichten</button>
            : <div className="flex flex-col gap-2">
                <p className="font-semibold">Schritt 2 – einmalig bei Cloudflare umstellen (der Zweig „live“ ist angelegt, Stand {jetzt.commit_sha.slice(0, 7)}):</p>
                <ol className="list-decimal pl-5 flex flex-col gap-1 text-slate-600 dark:text-slate-300">
                  <li>dash.cloudflare.com → <b>Workers & Pages</b> → Projekt <b>{projekt.vorschau_domain?.replace(".pages.dev", "") || projekt.id}</b> öffnen.</li>
                  <li><b>Settings</b> → <b>Build</b> → <b>Branch control</b> → <b>Production branch</b> auf <code className="font-mono">live</code> stellen und speichern.</li>
                  <li>Die Testfassung ist danach unter <code className="font-mono">main.{projekt.vorschau_domain || "…pages.dev"}</code> erreichbar (eigene Adresse wie test.trainer-to-go.at geht später über „Custom domains“).</li>
                </ol>
                <label className="flex flex-col gap-1 text-xs text-slate-500 max-w-md">Testadresse<input className={input} value={testUrl} onChange={(e) => setTestUrl(e.target.value)} placeholder="https://main.mein-projekt.pages.dev" /></label>
                <button type="button" className={`${btn} self-start`} disabled={busy} onClick={() => umgestellt(true)}><Check className="w-4 h-4" />Cloudflare ist umgestellt – einschalten</button>
              </div>}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[minmax(0,1fr)] md:grid-cols-2">
          <div className="rounded-xl border border-blue-300 dark:border-blue-900 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-blue-600" /><b className="font-display text-lg">Test</b><span className="text-xs text-slate-500">neuester Hauptstand (main)</span></div>
            {projekt.test_url && <a className="text-sm font-mono text-blue-700 dark:text-blue-300 break-all" href={projekt.test_url} target="_blank" rel="noreferrer">{projekt.test_url.replace(/^https:\/\//, "")}</a>}
            <span className="text-xs text-slate-500">{testStand ? <>Stand <span className="font-mono">{testStand.main_sha.slice(0, 7)}</span> · abgeglichen {fmt(testStand.zeit)}{jetzt?.commit_sha === testStand.main_sha ? " · gleich wie live" : ""}</> : "Stand noch unbekannt – der Abgleich der Werkstatt läuft alle 10 Minuten"}</span>
            <DbOffen projekt={projekt} />
            {projekt.db_ablaeufe_geaendert && <p className="text-xs rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 px-2.5 py-1.5">Achtung: Abläufe (<span className="font-mono">.github/workflows</span>) haben sich gegenüber live geändert. Sie laufen nach dem Live-Schalten mit den Live-Zugängen – bitte vorher im Code-Editor ansehen.</p>}
            <p className="text-sm text-slate-600 dark:text-slate-300">{imTest.length ? <>Neu gegenüber live: {imTest.slice(0, 5).map((f) => f.name).join(" · ")}{imTest.length > 5 ? " …" : ""}</> : "Gleich wie live oder nur kleine Änderungen ohne Feature."}</p>
            <div className="flex gap-2 flex-wrap mt-auto">
              {projekt.test_url && <a className={`${ghost} h-9`} href={projekt.test_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />Testseite öffnen</a>}
              {admin && (frage?.art === "live"
                ? <span className="flex gap-2 flex-wrap items-center text-sm">Stand {testStand?.main_sha.slice(0, 7)} live schalten? Genau dieser Stand geht live.{projekt.db_live_ref && (projekt.db_offen || []).length ? ` Dabei werden ${projekt.db_offen.length} Datenbank-Änderung(en) in die Live-Datenbank eingespielt – vorher wird ihr Aufbau gesichert.` : ""}{projekt.design_gruppe_id ? " Design-Versionen „Nur Testfassung“ gehen nicht von selbst mit – danach im App-Designer › Übernehmen mit „Auch live“ freigeben." : ""}<button type="button" className={`${btn} h-9 text-sm`} disabled={busy} onClick={() => anfordern("live")}>Ja, live schalten</button><button type="button" className={`${ghost} h-9`} onClick={() => setFrage(null)}>Abbrechen</button></span>
                : <button type="button" className={`${btn} h-9 text-sm`} disabled={busy || offen || !testStand || jetzt?.commit_sha === testStand?.main_sha} onClick={() => setFrage({ art: "live" })}><Rocket className="w-4 h-4" />Live schalten</button>)}
            </div>
          </div>
          <div className="rounded-xl border border-green-300 dark:border-green-900 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap"><Globe className="w-5 h-5 text-green-700" /><b className="font-display text-lg">Live</b>{jetzt && <span className="text-sm font-semibold">{jetzt.bezeichnung}</span>}{jetzt && <span className="text-xs text-slate-500">seit {fmt(jetzt.geschaltet)}</span>}</div>
            {projekt.live_url && <a className="text-sm font-mono text-green-700 dark:text-green-400 break-all" href={projekt.live_url} target="_blank" rel="noreferrer">{projekt.live_url.replace(/^https:\/\//, "")}</a>}
            {versionen.length > 1 && <div className="text-sm flex flex-col gap-1.5"><span className="text-xs text-slate-500">Vorige Versionen</span>
              {versionen.slice(1, 6).filter((v) => v.commit_sha !== jetzt.commit_sha).map((v) => { const s = sperre(v); return (
                <div key={v.id} className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{v.bezeichnung}</span><span className="text-xs text-slate-500">{fmt(v.geschaltet)}</span>
                  {admin && (frage?.v?.id === v.id
                    ? <span className="flex gap-2 flex-wrap items-center basis-full rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-400 p-2 text-[13px]">Live auf {v.bezeichnung} zurücksetzen? Nur der Code geht zurück, die Datenbank bleibt – diese Version passt zu ihr.
                        <button type="button" className={`${btn} h-8 text-sm`} disabled={busy} onClick={() => anfordern("zurueck", v)}>Ja, zurücksetzen</button><button type="button" className={`${ghost} h-8`} onClick={() => setFrage(null)}>Abbrechen</button></span>
                    : <button type="button" className={`${ghost} h-8 text-xs ml-auto`} disabled={!!s || busy || offen} title={s || "Nur der Admin"} onClick={() => setFrage({ v })}><Undo2 className="w-3.5 h-3.5" />{s ? "gesperrt" : "Zurück …"}</button>)}
                  {s && <span className="basis-full text-xs text-slate-500">{s}</span>}
                </div>); })}</div>}
            {admin && (frage?.art === "aus"
              ? <span className="flex gap-2 flex-wrap items-center text-[13px] mt-auto rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-400 p-2">Test & Live ausschalten? Stelle vorher bei Cloudflare den Produktionszweig wieder auf „main“. Danach geht main direkt live und alles im Test gilt als live.
                  <button type="button" className={`${btn} h-8 text-sm`} disabled={busy} onClick={() => { setFrage(null); umgestellt(false); }}>Ja, ausschalten</button><button type="button" className={`${ghost} h-8`} onClick={() => setFrage(null)}>Abbrechen</button></span>
              : <button type="button" className="text-xs text-slate-500 underline self-start mt-auto" onClick={() => setFrage({ art: "aus" })}>Test & Live ausschalten …</button>)}
          </div>
        </div>)}
    </section>);
}

// Datenbank-Station (0034): Datenbank-Dateien, die auf main liegen, aber noch nicht live sind
export function DbOffen({ projekt }) {
  const offen = projekt.db_offen || [];
  if (!offen.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-2.5 text-sm flex flex-col gap-1.5">
      <b className="text-amber-900 dark:text-amber-200">{offen.length} Datenbank-Änderung{offen.length > 1 ? "en" : ""} {projekt.db_live_ref ? "gehen mit dem Live-Schalten in die Live-Datenbank" : "– Test und Live teilen sich die Datenbank (schon eingespielt)"}</b>
      {offen.map((o) => (
        <details key={o.datei} className="text-xs"><summary className="cursor-pointer font-mono">{o.datei}</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 font-mono text-xs whitespace-pre">{o.sql}</pre></details>))}
      {projekt.db_live_ref && <span className="text-xs text-amber-800 dark:text-amber-300">Vor dem Einspielen sichert der Ablauf „Datenbank“ den Aufbau der Live-Datenbank (in ihr selbst, ohne Daten). Jede Datei läuft für sich – bei einem Fehler bleibt nichts von ihr. Bitte vor dem Live-Schalten durchsehen; zurückgerollt wird die Datenbank nicht.</span>}
    </div>);
}

// Jetzt unabhängig prüfen: ein Feature, eine Gruppe oder die ganze App (Werkstatt des Admins, nur lesen)
export const PRUEF_UMFANG = [["feature", "Ein Feature", "Code, Rechte, Datenschutz, Aussehen", "etwa 3–5 %"], ["gruppe", "Eine ganze Gruppe", "alle Features der Gruppe zusammen", "etwa 8–15 %"], ["app", "Die ganze App", "große Sicherheits- und Qualitätsprüfung", "etwa 20–40 %"]];
export function JetztPruefen({ d, ich, darf, projekt, toast }) {
  const [umfang, setUmfang] = useState("feature"); const [ziel, setZiel] = useState(""); const [busy, setBusy] = useState(false);
  const [liste, setListe] = useState([]); const [offen, setOffen] = useState(null); const [gruppeFuer, setGruppeFuer] = useState(""); const [bestaetigen, setBestaetigen] = useState(null);
  const konzept = projekt?.konzept_gruppe_id;
  const gruppen = d.gruppen.filter((g) => g.id !== konzept && darf(g.bereich_id, "freigeben"));
  const features = d.features.filter((f) => !f.ausgebaut && gruppen.some((g) => g.id === f.gruppe_id));
  const holen = useCallback(async () => { const { data } = await supabase.from("ws_pruefungen").select("*").eq("projekt_id", d.projektId).order("id", { ascending: false }).limit(8); setListe(data || []); }, [d.projektId]);
  useEffect(() => { holen(); const ch = supabase.channel("cs-pruef-" + d.projektId).on("postgres_changes", { event: "*", schema: "public", table: "ws_pruefungen" }, holen).subscribe(); const t = setInterval(holen, 20000); return () => { supabase.removeChannel(ch); clearInterval(t); }; }, [holen, d.projektId]);
  useEffect(() => setZiel(""), [umfang]);
  const darfApp = ich.rolle === "admin";
  if (!gruppen.length && !darfApp) return null;
  const laeuft = liste.find((p) => ["wartet", "laeuft"].includes(p.stand));
  const auswahl = umfang === "feature" ? features.map((f) => [f.id, `${f.name} (${f.id})`]) : umfang === "gruppe" ? gruppen.map((g) => [g.id, g.name]) : [];
  const starten = async () => {
    setBusy(true); const { error } = await supabase.rpc("ws_pruefung_anfordern", { p_projekt: d.projektId, p_umfang: umfang, p_ziel: umfang === "app" ? null : ziel }); setBusy(false);
    toast(error ? fehler(error) : "Prüfung gestartet – die Werkstatt des Admins prüft nur lesend"); holen();
  };
  const zielName = (p) => p.umfang === "app" ? "Ganze App" : p.umfang === "gruppe" ? `Gruppe ${d.gruppen.find((g) => g.id === p.ziel)?.name || p.ziel}` : d.features.find((f) => f.id === p.ziel)?.name || p.ziel;
  const alsAuftrag = async (p) => {
    const { data, error } = await supabase.rpc("ws_pruefung_als_auftrag", { p_id: p.id, p_gruppe: p.umfang === "app" ? gruppeFuer || null : null });
    toast(error ? fehler(error) : `Auftrag #${data} an die Werkstatt gestellt`); holen();
  };
  const auftragsGruppen = d.gruppen.filter((g) => g.id !== konzept && darf(g.bereich_id, "auftraege"));
  return (
    <section className={`${card} p-4 flex flex-col gap-3 xl:sticky xl:top-3`} aria-label="Jetzt unabhängig prüfen">
      <h2 className="font-display font-bold text-xl flex items-center gap-2"><ScanSearch className="w-5 h-5" />Jetzt unabhängig prüfen</h2>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Was prüfen?">
        {PRUEF_UMFANG.filter(([k]) => k !== "app" || darfApp).filter(([k]) => k === "app" || gruppen.length).map(([k, t, u]) => (
          <button key={k} type="button" role="radio" aria-checked={umfang === k} onClick={() => setUmfang(k)} className={`text-left rounded-lg border px-3 py-2 ${umfang === k ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-700"}`}>
            <b className="font-display">{t}</b><div className="text-xs text-slate-500">{u}</div></button>))}
      </div>
      {umfang !== "app" && <label className="flex flex-col gap-1 text-xs text-slate-500">Was genau?
        <select className={input} value={ziel} onChange={(e) => setZiel(e.target.value)}><option value="">– bitte wählen –</option>{auswahl.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>}
      <p className="text-xs text-slate-500">Braucht grob {PRUEF_UMFANG.find((x) => x[0] === umfang)[3]} deines 5-Stunden-Kontingents (Claude, großes Modell). Läuft auf der Werkstatt des Admins.</p>
      <button type="button" className={btn} disabled={busy || !!laeuft || (umfang !== "app" && !ziel) || !projekt?.repo} onClick={starten}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}{laeuft ? "Eine Prüfung läuft schon" : "Prüfung starten"}</button>
      {!projekt?.repo && <p className="text-xs text-slate-500">Prüfen geht, sobald das Projekt ein GitHub-Repository hat.</p>}
      {liste.length > 0 && <div className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-3"><span className="text-xs uppercase tracking-widest font-semibold text-slate-500">Letzte Prüfungen</span>
        {liste.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 text-sm flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap"><b className="font-display">#{p.id} {zielName(p)}</b>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${p.stand === "gruen" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : p.stand === "rot" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                {{ wartet: "wartet", laeuft: "läuft …", gruen: "GRÜN", rot: "ROT", fehler: "Fehler", abgebrochen: "abgebrochen" }[p.stand]}</span>
              <span className="text-xs text-slate-500 ml-auto">{fmt(p.erstellt)}</span></div>
            {p.befund && <button type="button" className="text-xs text-slate-500 underline self-start" onClick={() => setOffen(offen === p.id ? null : p.id)}>{offen === p.id ? "Befunde ausblenden" : "Befunde anzeigen"}</button>}
            {offen === p.id && p.befund && <div className="text-[13px] max-h-72 overflow-auto rounded-md bg-slate-50 dark:bg-slate-950 p-2"><Markdown text={p.befund} klein /></div>}
            {p.stand === "wartet" && (ich.rolle === "admin" || p.von === ich.id) && <button type="button" className={`${ghost} h-8 text-xs self-start`} onClick={async () => { const { error } = await supabase.rpc("ws_pruefung_abbrechen", { p_id: p.id }); toast(error ? fehler(error) : "Prüfung abgebrochen"); holen(); }}><X className="w-3.5 h-3.5" />Abbrechen</button>}
            {p.stand === "rot" && !p.auftrag_id && auftragsGruppen.length > 0 && <div className="flex gap-2 flex-wrap items-center">
              {p.umfang === "app" && <select aria-label="Gruppe für den Auftrag" className={`${input} h-8 py-0 text-sm max-w-[180px]`} value={gruppeFuer} onChange={(e) => setGruppeFuer(e.target.value)}><option value="">Gruppe wählen …</option>{auftragsGruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
              {bestaetigen === p.id
                ? <span className="flex gap-2 flex-wrap items-center text-[13px] basis-full">Diese Befunde (oben) gehen als Auftrag an die Werkstatt – vorher durchlesen.
                    <button type="button" className={`${btn} h-8 text-sm`} onClick={() => { setBestaetigen(null); alsAuftrag(p); }}>Ja, Auftrag stellen</button><button type="button" className={`${ghost} h-8`} onClick={() => setBestaetigen(null)}>Abbrechen</button></span>
                : <button type="button" className={`${btn} h-8 text-sm`} disabled={p.umfang === "app" && !gruppeFuer} onClick={() => { setOffen(p.id); setBestaetigen(p.id); }}><Send className="w-3.5 h-3.5" />Befunde als Auftrag …</button>}</div>}
            {p.auftrag_id && <span className="text-xs text-slate-500">Daraus wurde Auftrag #{p.auftrag_id}.</span>}
          </div>))}</div>}
    </section>);
}

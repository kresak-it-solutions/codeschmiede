// LiveVorschau – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRightLeft, CircleCheck, ExternalLink, Eye, Info, Monitor, MousePointerClick, Pin, RefreshCw, ShieldAlert, Smartphone, Tablet, Trash2, Undo2, X } from "lucide-react";
import { ABGESCHLOSSEN, btn, card, fehler, ghost, input, merke, mitCs, oeffneExtern, seiteOk, vorschauUrl } from "../bausteine/grund";
import { pfadNorm, zuordnung } from "../bausteine/vorschauZuordnung";
import { AuftragsChat } from "./Zentrale";
import GeraeteRahmen from "../GeraeteRahmen";
import { supabase } from "../supabase";

// ---------------- Live-Vorschau (Menüpunkt): aktuelle App + „Zeigen & kommentieren“ → Auftrag an Gruppe/Feature ----------------
// Seit 0.13.2 (Entwurf „links folgt der Chat der Seite“, freigegeben von Gerhard 02.11.2026): Wechselt rechts die Seite, öffnet sich links
// das Feature, dessen gemerkte Seite passt (Zuordnung: bausteine/vorschauZuordnung.js). Nur hier, nicht im Feature-Arbeitsplatz.
export function LiveVorschauSeite({ d, ich, toast }) {
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const rolle = ich.rolle === "admin" ? "admin" : d.mitglieder.find((m) => m.projekt_id === d.projektId && m.benutzer_id === ich.id)?.rolle;
  const darf = useCallback((bereich, recht) => rolle === "admin" || d.rechte.some((r) => r.benutzer_id === ich.id && r.bereich_id === bereich && r[recht] && (recht === "auftraege" ? ["entwickler", "texter"].includes(rolle) : rolle === "entwickler")), [d.rechte, ich, rolle]);
  // Nur Gruppen, in denen ich Aufträge geben darf (globale Gruppen zuletzt)
  const bereichName = (id) => d.bereiche.find((b) => b.id === id)?.name || "";
  const gruppen = d.gruppen.filter((g) => darf(g.bereich_id, "auftraege"))
    .sort((a, b) => (!!d.bereiche.find((x) => x.id === a.bereich_id)?.global - !!d.bereiche.find((x) => x.id === b.bereich_id)?.global) || a.name.localeCompare(b.name, "de"));
  const [gid, setGid] = useState(() => merke.lies("cs-vorschau-gruppe") || "");
  const [fid, setFidRoh] = useState(() => merke.lies("cs-vorschau-feature") || "");   // seit 0.13.2 gemerkt: der eigene Startpfad löst dann keinen Wechsel aus
  const setFid = (v) => { setFidRoh(v); merke.schreib("cs-vorschau-feature", v); };
  const [baustein, setBaustein] = useState(null);
  const g = gruppen.find((x) => x.id === gid) || null;
  const feats = g ? d.features.filter((f) => f.gruppe_id === g.id && !f.ausgebaut && !f.ausgeblendet) : [];
  const f = feats.find((x) => x.id === fid) || null;
  // Folgen: Hinweis links, ungesendeter Entwurf, „Nein“ je Pfad (nur solange die Seite offen ist), eben gemerkte Seiten bis zum nächsten Laden
  const [hinweis, setHinweis] = useState(null);
  const entwurf = useRef(false);
  const onEntwurf = useCallback((b) => { entwurf.current = b; }, []);
  const entwuerfe = useRef(new Map()).current;
  const nein = useRef(new Set()).current;
  const [lokalGemerkt, setLokalGemerkt] = useState({});
  const alleFeatures = d.features.map((x) => (x.id in lokalGemerkt ? { ...x, vorschau_pfad: lokalGemerkt[x.id] } : x));
  const waehleGruppe = (v) => { setGid(v); setFid(""); merke.schreib("cs-vorschau-gruppe", v); setHinweis(null); };
  const oeffne = (x) => { setGid(x.gruppe_id); setFid(x.id); merke.schreib("cs-vorschau-gruppe", x.gruppe_id); };
  const gruppeVon = (x) => d.gruppen.find((y) => y.id === x?.gruppe_id);
  const darfMerken = (x) => !!x && darf(gruppeVon(x)?.bereich_id, "auftraege");
  const onSeite = (pfad) => {
    const z = zuordnung({ pfad, features: alleFeatures, gruppen, gruppeId: g?.id || null, featureId: f?.id || null });
    if (z.art === "wechsel") {
      if (entwurf.current) setHinweis({ art: "tippen", pfad, feature: z.feature });
      else { oeffne(z.feature); setHinweis({ art: "geoeffnet", feature: z.feature }); }
    } else if ((z.art === "auswahl" || z.art === "vorschlag") && !nein.has(pfadNorm(pfad))) setHinweis({ ...z, pfad });
    else setHinweis(null);
  };
  const merkenUndOeffnen = async (x, pfad) => {
    const { error } = await supabase.rpc("ws_feature_vorschau_setzen", { p_feature: x.id, p_pfad: pfad });
    if (error) { toast(fehler(error)); return; }
    setLokalGemerkt((m) => ({ ...m, [x.id]: pfad })); oeffne(x);
    setHinweis({ art: "gemerkt", feature: x, pfad }); d.holen?.();
  };
  useEffect(() => {
    if (!hinweis || !["geoeffnet", "gemerkt"].includes(hinweis.art)) return undefined;
    const t = setTimeout(() => setHinweis((h) => (h === hinweis ? null : h)), 4000); return () => clearTimeout(t);
  }, [hinweis]);
  return (
    <section className="flex flex-col gap-3" aria-label="Live-Vorschau">
      <div><h2 className="font-display font-bold text-xl leading-tight">Live-Vorschau</h2>
        <p className="text-sm text-slate-500">Die aktuelle App. Wechselst du rechts die Seite, öffnet sich links der Chat des passenden Features. Mit <b>Zeigen & kommentieren</b> klickst du auf ein Element, wählst Gruppe (und Feature) und schreibst, was sich ändern soll – daraus wird ein Auftrag.</p></div>
      <div className="grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(320px,38%)_minmax(0,1fr)] lg:h-[calc(100vh-210px)] min-h-[560px]">
        <div className={`${card} flex flex-col min-h-0 overflow-hidden`}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 grid gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">Gruppe
              <select className={input} value={g?.id || ""} onChange={(e) => waehleGruppe(e.target.value)}>
                <option value="">– Gruppe wählen –</option>
                {gruppen.map((x) => <option key={x.id} value={x.id}>{x.name} · {bereichName(x.bereich_id)}</option>)}
              </select></label>
            {g && <label className="flex flex-col gap-1 text-xs text-slate-500">Feature (optional)
              <select className={input} value={f?.id || ""} onChange={(e) => { setFid(e.target.value); setHinweis(null); }}>
                <option value="">Ganze Gruppe</option>
                {feats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>}
            {!gruppen.length && <p className="text-xs text-slate-500">Du darfst in diesem Projekt keine Aufträge geben – die Vorschau kannst du trotzdem ansehen.</p>}
          </div>
          {hinweis && <FolgeHinweis key={`${hinweis.art}|${hinweis.pfad || ""}|${hinweis.feature?.id || ""}`} h={hinweis} gruppen={gruppen} gruppeVon={gruppeVon} darfMerken={darfMerken}
            onOeffnen={(x) => { oeffne(x); setHinweis(null); }} onMerken={merkenUndOeffnen}
            onNein={() => { if (hinweis.pfad) nein.add(pfadNorm(hinweis.pfad)); setHinweis(null); }} onZu={() => setHinweis(null)} />}
          {g ? <div className="flex-1 min-h-0 flex flex-col"><AuftragsChat key={`${g.id}-${f?.id || ""}`} g={g} f={f} d={d} ich={ich} darf={darf} toast={toast} eingebettet baustein={baustein} onBausteinFertig={() => setBaustein(null)} onEntwurf={onEntwurf} entwurfSpeicher={entwuerfe} /></div>
            : <div className="flex-1 grid place-items-center p-6 text-sm text-slate-500 text-center"><span><MousePointerClick className="w-5 h-5 mx-auto mb-2 text-orange-500" />Zuerst eine Gruppe wählen oder rechts eine Seite öffnen, dann auf „Zeigen & kommentieren“ und auf das Element klicken.</span></div>}
        </div>
        <LiveVorschau projekt={projekt} a={null} toast={toast} onBaustein={setBaustein} baustein={baustein} onSeite={onSeite} />
      </div>
    </section>);
}

// Hinweis über dem Chat (Entwurf 0.13.2): orange = du entscheidest, smaragd = erledigt (verschwindet nach 4 Sekunden)
const HINWEIS_O = "mx-3 mt-3 rounded-xl border border-orange-400 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 px-3 py-2.5 text-sm flex flex-wrap items-center gap-2";
const HINWEIS_G = "mx-3 mt-3 rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-3 py-2.5 text-sm flex flex-wrap items-center gap-2";
const KNOPF = `${btn} h-8 px-3 text-sm`;
const KNOPF2 = `${ghost} h-8 px-3`;
function FolgeHinweis({ h, gruppen, gruppeVon, darfMerken, onOeffnen, onMerken, onNein, onZu }) {
  const liste = h.art === "auswahl" ? h.kandidaten : h.art === "vorschlag" ? h.auswahl : [];
  const [wahl, setWahl] = useState(() => (h.art === "vorschlag" ? h.vorschlag?.id : h.kandidaten?.[0]?.id) || "");
  const [busy, setBusy] = useState(false);
  const x = liste.find((y) => y.id === wahl) || null;
  if (h.art === "geoeffnet" || h.art === "gemerkt") return (
    <div role="status" className={HINWEIS_G}><CircleCheck className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
      {h.art === "geoeffnet" ? <span>Links geöffnet: <b>{h.feature.name}</b></span> : <span>Gemerkt: <b>{h.feature.name}</b> gehört zu <span className="font-mono">{h.pfad}</span>.</span>}</div>);
  if (h.art === "tippen") return (
    <div role="status" className={HINWEIS_O}><Info className="w-4 h-4 shrink-0 text-orange-600" aria-hidden="true" />
      <span className="flex-1 min-w-[180px]">Du tippst gerade. Rechts ist jetzt <b>{h.feature.name}</b> offen.</span>
      <button type="button" className={KNOPF} onClick={() => onOeffnen(h.feature)}><ArrowRightLeft className="w-4 h-4" aria-hidden="true" />Zu {h.feature.name} wechseln</button>
      <button type="button" className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={onZu} aria-label="Hinweis schließen"><X className="w-4 h-4" /></button></div>);
  // Auswahl nach Gruppen geordnet (Reihenfolge wie oben im Feld „Gruppe“); beim Vorschlag zuerst die besten Treffer
  const nachGruppe = gruppen.map((gr) => [gr, liste.filter((y) => y.gruppe_id === gr.id).sort((a, b) => a.name.localeCompare(b.name, "de"))]).filter(([, l]) => l.length);
  const merken = h.art === "vorschlag" && darfMerken(x);
  const los = async () => { if (!x) return; if (!merken) { onOeffnen(x); return; } setBusy(true); try { await onMerken(x, h.pfad); } finally { setBusy(false); } };
  return (
    <div role="status" className={`${HINWEIS_O} flex-col items-stretch`}>
      <div className="flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0 text-orange-600" aria-hidden="true" />
        <span>{h.art === "auswahl" ? <>Zu <span className="font-mono">{h.pfad}</span> passen mehrere Features. Welches willst du links öffnen?</>
          : <>Für <span className="font-mono">{h.pfad}</span> ist noch kein Feature gemerkt.{" "}
            {h.vorschlag ? <>Vorschlag: <b>{h.vorschlag.name}</b> (Gruppe {gruppeVon(h.vorschlag)?.name || h.vorschlag.gruppe_id})</> : "Wähle das passende Feature."}</>}</span></div>
      <label className="flex flex-col gap-1 text-xs text-slate-500">{h.art === "auswahl" ? "Feature" : "Anderes Feature wählen"}
        <select className={`${input} py-1.5 text-sm`} value={wahl} onChange={(e) => setWahl(e.target.value)}>
          {!wahl && <option value="">– Feature wählen –</option>}
          {h.art === "vorschlag" && h.vorschlag && <option value={h.vorschlag.id}>Vorschlag: {h.vorschlag.name}</option>}
          {nachGruppe.map(([gr, l]) => <optgroup key={gr.id} label={gr.name}>{l.filter((y) => !(h.art === "vorschlag" && y.id === h.vorschlag?.id)).map((y) => <option key={y.id} value={y.id}>{y.name} · {y.id}</option>)}</optgroup>)}
        </select></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={KNOPF} disabled={!x || busy} onClick={los} title={merken ? `Öffnet ${x?.name || "das Feature"} und merkt ${h.pfad} als seine Seite` : undefined}>
          {merken ? <Pin className="w-4 h-4" aria-hidden="true" /> : <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />}{merken ? "Öffnen und merken" : "Öffnen"}</button>
        <button type="button" className={KNOPF2} disabled={busy} onClick={onNein} title="Für diese Seite nicht mehr fragen, solange die Live-Vorschau offen ist">Nein</button>
      </div>
    </div>);
}

// ---------------- Feature-Arbeitsplatz (Doppelklick): Chat links, Live-Vorschau rechts ----------------
export function FeatureArbeitsplatz({ f, g, d, ich, darf, toast, onZurueck, onLoeschen }) {
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const js = d.auftraege.filter((a) => a.feature_id === f.id);
  const aktiv = [...js].reverse().find((a) => !ABGESCHLOSSEN.includes(a.stand) && a.zweig) || null;
  const laufend = js.find((a) => a.stand === "laeuft");
  const [links, setLinks] = useState(() => Number(merke.lies("cs-platz-links")) || 40);
  const [baustein, setBaustein] = useState(null);
  const raster = useRef(null);
  const ziehen = (e) => {
    const r = raster.current?.getBoundingClientRect(); if (!r) return;
    const bewegen = (ev) => { const p = Math.min(70, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)); setLinks(p); merke.schreib("cs-platz-links", String(Math.round(p))); };
    const los = () => { window.removeEventListener("pointermove", bewegen); window.removeEventListener("pointerup", los); };
    window.addEventListener("pointermove", bewegen); window.addEventListener("pointerup", los); e.preventDefault();
  };
  return (
    <section className="flex flex-col gap-3" aria-label={`Arbeitsplatz ${f.name}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={ghost} onClick={onZurueck}><ArrowLeft className="w-4 h-4" />Zentrale</button>
        <div className="min-w-0"><div className="text-xs text-slate-500">{g?.name} · <span className="font-mono">{f.id}</span></div><h2 className="font-display font-bold text-xl leading-tight">{f.name}</h2></div>
        {laufend && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600"><i className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />Hier wird gerade gearbeitet</span>}
        <span className="flex-1" />
        {onLoeschen && darf(g?.bereich_id, "loeschen") && <button type="button" className={`${ghost} h-9 text-xs`} onClick={onLoeschen}><Trash2 className="w-3.5 h-3.5" />{f.ausgeblendet ? "Wieder einblenden" : "Feature löschen …"}</button>}
      </div>
      <div ref={raster} className="grid gap-0 lg:[grid-template-columns:var(--links)_8px_minmax(0,1fr)] h-auto lg:h-[calc(100vh-190px)] min-h-[560px]" style={{ "--links": `${links}%` }}>
        <AuftragsChat g={g} f={f} d={d} ich={ich} darf={darf} toast={toast} eingebettet baustein={baustein} onBausteinFertig={() => setBaustein(null)} />
        <div className="hidden lg:block cursor-col-resize group" onPointerDown={ziehen} role="separator" aria-orientation="vertical" aria-label="Breite ändern"><div className="mx-auto w-1 h-full rounded bg-slate-200 dark:bg-slate-800 group-hover:bg-emerald-600" /></div>
        <LiveVorschau projekt={projekt} a={aktiv} f={f} darfMerken={darf(g?.bereich_id, "auftraege")} toast={toast} onBaustein={setBaustein} baustein={baustein} />
      </div>
    </section>);
}

// Live-Vorschau: echte Testseite des Auftrags (Cloudflare), meldet neue Stände, „Zeigen & kommentieren“ über den Vorschau-Helfer der App
// onSeite(pfad) (optional, 0.13.2): meldet jeden Seitenwechsel der Testseite nach oben – nur der Menüpunkt Live-Vorschau nutzt es.
export function LiveVorschau({ projekt, a, f, darfMerken, toast, onBaustein, baustein, onSeite }) {
  const url = vorschauUrl(projekt, a);
  const onSeiteRef = useRef(onSeite); onSeiteRef.current = onSeite;
  // Befund S5 (01.11.2026): Zweig-Testseiten zeigen ungeprüften KI-Code und sprechen (Trainer to go) mit der echten Datenbank.
  // Erst nach ausdrücklichem Klick laden, dauerhaft warnen: hier nicht anmelden.
  const istZweig = !!(a?.zweig && projekt?.vorschau_domain && !ABGESCHLOSSEN.includes(a.stand));
  const zweigGeprueft = istZweig && a?.pruefung?.sicherheit?.ergebnis === "gruen";
  const [zweigFrei, setZweigFrei] = useState(false);
  useEffect(() => { setZweigFrei(false); }, [url]);
  const [gemerkt, setGemerkt] = useState(f?.vorschau_pfad || null);
  useEffect(() => { setGemerkt(f?.vorschau_pfad || null); }, [f?.id, f?.vorschau_pfad]);
  const startSeite = seiteOk(gemerkt) ? gemerkt : seiteOk(projekt?.vorschau_pfad) ? projekt.vorschau_pfad : "/";
  const [jetztSeite, setJetztSeite] = useState(null);
  // Design in der Vorschau (Entwurf 1.0, 24.10.2026): aktuelle App, Seiten-Entwurf des Designers oder ein Grunddesign-Entwurf –
  // wirkt nur in dieser Vorschau (Vorschau-Helfer der App), nichts wird gespeichert
  const [designWahl, setDesignWahl] = useState("app");
  const [entwuerfe, setEntwuerfe] = useState([]);
  useEffect(() => {
    if (!projekt?.id) return undefined; let aus = false;
    supabase.from("ws_design_entwuerfe").select("id, name, stand, werte").eq("projekt_id", projekt.id).neq("stand", "verworfen").order("geaendert", { ascending: false }).limit(30)
      .then(({ data }) => { if (!aus) setEntwuerfe(data || []); });
    return () => { aus = true; };
  }, [projekt?.id]);
  const merken = async () => {
    if (!f || !seiteOk(jetztSeite)) return;
    const { error } = await supabase.rpc("ws_feature_vorschau_setzen", { p_feature: f.id, p_pfad: jetztSeite });
    if (error) toast(fehler(error)); else { setGemerkt(jetztSeite); toast(`Gemerkt: ${f.name} öffnet ab jetzt ${jetztSeite}`); }
  };
  const [geraet, setGeraet] = useState("pc");   // echte Gerätebreite, eingepasst (GeraeteRahmen, Fehlerkorrektur 0.9.5)
  const [neu, setNeu] = useState(false); const [stand, setStand] = useState(null); const [schluessel, setSchluessel] = useState(0);
  const [zeigen, setZeigen] = useState(false); const [helfer, setHelfer] = useState(false);
  const frame = useRef(null);
  const herkunft = url ? new URL(url).origin : null;
  useEffect(() => { setNeu(false); setStand(null); setHelfer(false); setZeigen(false); }, [url]);
  // Neuer Stand: /version.json der Testseite (enthält den Commit, den Cloudflare gebaut hat)
  useEffect(() => {
    if (!url) return undefined;
    let aus = false;
    const pruefen = async () => {
      try {
        const r = await fetch(`${url}/version.json?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) return;
        const v = await r.json(); if (aus || !v?.commit) return;
        setStand((alt) => { if (alt && alt !== v.commit) setNeu(true); return alt || v.commit; });
      } catch { /* Testseite noch nicht gebaut oder ohne version.json */ }
    };
    pruefen(); const t = setInterval(pruefen, 20000);
    return () => { aus = true; clearInterval(t); };
  }, [url]);
  // Antworten des Vorschau-Helfers (nur von der Testseite selbst)
  useEffect(() => {
    const an = (e) => {
      if (e.origin !== herkunft || e.source !== frame.current?.contentWindow || typeof e.data !== "object" || !e.data) return;
      if (e.data.cs === "bereit") {
        setHelfer(true);
        const w = frame.current?.contentWindow;
        if (w && designWahl === "seiten") w.postMessage({ cs: "seiten-entwurf", an: true }, herkunft);
        const ent = designWahl.startsWith("e:") ? entwuerfe.find((x) => `e:${x.id}` === designWahl) : null;
        if (w && ent?.werte && typeof ent.werte === "object") w.postMessage({ cs: "design", werte: ent.werte }, herkunft);
      }
      if (e.data.cs === "seite" && seiteOk(e.data.pfad)) { setJetztSeite(e.data.pfad); onSeiteRef.current?.(e.data.pfad); }
      if (e.data.cs === "baustein") {
        // Befund S4: nie den sichtbaren Text des Elements übernehmen (kann Namen von Kindern/Mitgliedern enthalten) – nur Name, Seite, Pfad
        // Review M1: Name nur als Baustein-Kennung (data-ds/data-cs bzw. Komponentenname), Seite nur der Pfad, Pfad nur Selektor-Zeichen
        const name = String(e.data.name || "").trim();
        if (!/^[A-Za-z0-9_ ·-]{1,60}$/.test(name)) { toast("Dieses Element hat keinen Baustein-Namen – bitte ein anderes anklicken"); return; }
        const seite = String(e.data.seite || "").split(" · ")[0].trim();
        const b = { name, seite: /^\/[A-Za-z0-9/_.~-]{0,150}$/.test(seite) ? seite : "", pfad: String(e.data.pfad || "").replace(/[^A-Za-z0-9 >._#:-]/g, "").slice(0, 300) };
        onBaustein(b); setZeigen(false); toast(`Baustein gewählt: ${b.name} – schreib links, was sich ändern soll`);
      }
    };
    window.addEventListener("message", an); return () => window.removeEventListener("message", an);
  }, [herkunft, onBaustein, toast, designWahl, entwuerfe]);
  useEffect(() => { if (herkunft && frame.current?.contentWindow) frame.current.contentWindow.postMessage({ cs: "zeigen", an: zeigen }, herkunft); }, [zeigen, herkunft]);
  const neuLaden = () => { setNeu(false); setStand(null); setSchluessel((k) => k + 1); };
  if (!url) return <div className={`${card} grid place-items-center p-8 text-sm text-slate-500`}>Für dieses Projekt ist noch keine Vorschau-Adresse hinterlegt.</div>;
  return (
    <div className={`${card} flex flex-col min-h-[480px] min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-slate-200 dark:border-slate-800">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-lg px-2.5 py-1.5" title={url}>{url.replace("https://", "")}{a ? ` · Auftrag #${a.id}` : " · aktuelle App"}</span>
        {[["handy", Smartphone, "Handy (390 px)"], ["tablet", Tablet, "Tablet (820 px)"], ["pc", Monitor, "PC (1280 px)"]].map(([w, I, t]) => <button key={w} type="button" title={t} aria-pressed={geraet === w} onClick={() => setGeraet(w)} className={`p-2 rounded-lg border ${geraet === w ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950" : "border-slate-200 dark:border-slate-800"}`}><I className="w-4 h-4" /></button>)}
        <label className="sr-only" htmlFor="lv-design">Design in der Vorschau</label>
        <select id="lv-design" value={designWahl} onChange={(e) => { setDesignWahl(e.target.value); neuLaden(); }} title="Wirkt nur in dieser Vorschau – nichts wird gespeichert"
          className="h-9 max-w-[220px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-sm">
          <option value="app">Design: aktuelle App</option>
          <option value="seiten">Design: Seiten-Entwurf (Designer)</option>
          {entwuerfe.map((x) => <option key={x.id} value={`e:${x.id}`}>Grunddesign: {x.name}</option>)}
        </select>
        <button type="button" title="Neu laden" onClick={neuLaden} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800"><RefreshCw className="w-4 h-4" /></button>
        <button type="button" aria-pressed={zeigen} disabled={!helfer} title={helfer ? "Auf ein Element in der Vorschau klicken und kommentieren" : "Die Testseite hat den Vorschau-Helfer noch nicht (kommt mit dem nächsten Stand der App)"} onClick={() => setZeigen(!zeigen)}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-semibold disabled:opacity-50 ${zeigen ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" : "border-slate-200 dark:border-slate-800"}`}><MousePointerClick className="w-4 h-4" />Zeigen & kommentieren</button>
        <button type="button" title="Im eigenen Fenster öffnen" onClick={() => oeffneExtern(`${url}${jetztSeite || startSeite}`)} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800"><ExternalLink className="w-4 h-4" /></button>
      </div>
      {f && <div className="flex flex-wrap items-center gap-2 px-2 pt-2 text-xs">
        <span className="text-slate-500">Seite für dieses Feature:</span><span className="font-mono">{gemerkt || "Startseite"}</span>
        {darfMerken && helfer && jetztSeite && jetztSeite !== gemerkt && <button type="button" className={`${ghost} h-8 text-xs`} onClick={merken} title={`Ab jetzt öffnet „${f.name}“ hier: ${jetztSeite}`}><Pin className="w-3.5 h-3.5" />Diese Seite merken ({jetztSeite})</button>}
        {jetztSeite && jetztSeite !== startSeite && <button type="button" className={`${ghost} h-8 text-xs`} onClick={() => { setJetztSeite(null); setSchluessel((k) => k + 1); }}><Undo2 className="w-3.5 h-3.5" />Zurück zur Feature-Seite</button>}
      </div>}
      {designWahl !== "app" && <p className="mx-2 mt-2 text-xs rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-800 dark:text-amber-300 px-2.5 py-1.5">
        {designWahl === "seiten" ? "Vorschau mit dem gespeicherten Seiten-Entwurf (Plattform-Standard) – nur hier sichtbar, nichts wird geändert. Voraussetzung: Der Seiten-Designer (App-Designer › Seiten) war in dieser Sitzung offen und freigegeben – sonst zeigt die Vorschau die aktuelle App." : "Vorschau mit dem Grunddesign-Entwurf – nur hier sichtbar. In der App wirkt er erst, wenn du ihn im App-Designer als Auftrag sendest."}</p>}
      {neu && <button type="button" onClick={neuLaden} className="m-2 self-end inline-flex items-center gap-2 rounded-full bg-emerald-700 text-white px-3 py-1.5 text-sm font-semibold"><RefreshCw className="w-4 h-4" />Neuer Stand da · neu laden</button>}
      {baustein && <div className="mx-2 mt-2 text-xs rounded-lg border border-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1.5 flex items-center gap-2">Gewählt: <b>{baustein.name}</b>{baustein.seite && <span className="text-slate-500">· {baustein.seite}</span>}<button type="button" className="ml-auto" onClick={() => onBaustein(null)} title="Auswahl aufheben"><X className="w-3.5 h-3.5" /></button></div>}
      {istZweig && zweigFrei && <p role="alert" className="mx-2 mt-2 text-xs rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 text-red-800 dark:text-red-300 px-2.5 py-1.5 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />{zweigGeprueft ? "Sicherheitsgeprüft, aber noch nicht live" : "Ungeprüfter Stand"} – diese Testseite arbeitet mit der echten Datenbank. Hier nicht anmelden und nichts ändern.</p>}
      <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 p-2 overflow-auto flex flex-col">
        {istZweig && !zweigFrei ? <div className="flex-1 min-h-[440px] grid place-items-center p-6">
          <div className="max-w-md text-center space-y-3">
            <ShieldAlert className="w-8 h-8 mx-auto text-red-600" aria-hidden="true" />
            <p className="font-semibold">{zweigGeprueft ? "Stand nach der Sicherheitsprüfung, noch nicht live" : "Ungeprüfter Stand der Werkstatt"}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Diese Testseite zeigt den Zweig von Auftrag #{a.id}{zweigGeprueft ? "" : " vor der Sicherheitsprüfung"}. Sie arbeitet mit der <b>echten Datenbank</b> der App. Melde dich dort <b>nicht</b> an und ändere keine Daten – zum Ansehen reicht die Seite ohne Anmeldung.</p>
            <button type="button" onClick={() => setZweigFrei(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-red-300 text-red-800 dark:text-red-300 dark:border-red-900 font-semibold"><Eye className="w-4 h-4" aria-hidden="true" />Verstanden, Vorschau anzeigen</button>
          </div>
        </div> :
        <GeraeteRahmen geraet={geraet} hoehe={geraet === "pc" ? "fuellen" : "geraet"} einpassen="beide" className="flex-1 min-h-[440px]" rahmenClass="bg-white rounded-lg border border-slate-200 dark:border-slate-800">
          {/* Befund S7: Sandbox ohne allow-top-navigation – die Testseite kann das Programmfenster nicht umleiten */}
          <iframe key={schluessel} ref={frame} title="Live-Vorschau" src={`${url}${mitCs(startSeite)}`} className="block w-full h-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => { setHelfer(false); frame.current?.contentWindow?.postMessage({ cs: "hallo" }, herkunft); }} />
        </GeraeteRahmen>}
      </div>
    </div>);
}

// Projekt-Arten und Anbindungen (Entwurf 1.0 „Neues Projekt“, freigegeben von Gerhard 2026-10-24 14:43, Datenbank 0030).
// Assistent „Neues Projekt“ in fünf Schritten (Art, Grunddaten, Projektordner, Anbindungen, Anlegen) und die Seite „Anbindungen“
// mit Ampel und Vorschau je Art. Seit 0.13.0 (Entwurf 1.0 „Projektordner“, 02.11.2026): Pflichtschritt Projektordner, Ein-Klick-Anbindungen. Geprüft und ausgeführt wird von der Werkstatt des Admins; hier wird nur gewünscht und angezeigt.
import React, { useCallback, useEffect, useState } from "react";
import { Globe, Monitor, Smartphone, Terminal, Loader2, RefreshCw, Play, ExternalLink, Box, Info, Check, ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { supabase } from "./supabase";
import { WS_ICON } from "./config";
import { APP_ARTEN } from "./DesignerArten";
import { FehlerSchluessel } from "./Fehler";
import { useEscape, useFokusfalle } from "./bausteine/grund";
import { isDesktop } from "./desktop";
import { useProjektordner, verknuepfen } from "./daten/projektordner";
import { ProjektordnerSchritt, ProjektordnerKarte, RegelnRangfolge } from "./Projektordner";
import AnbindungenKacheln from "./AnbindungenKacheln";
import { TECHNIK_EMPFEHLUNG, ZIELE, ZIEL_REIHE, zieleAusArt, zieleVon } from "./bausteine/arbeitsplatz";

// Ziele mehrfach wählen (0.16.0, Entwurf „Arbeitsplatz für alle Arten“): Web, Handy (PWA), Windows, Mac, Cloud-Lauf, PDF
function ZieleWahl({ ziele, onChange, name = "cs-ziele" }) {
  const umschalten = (z) => { const n = ziele.includes(z) ? ziele.filter((x) => x !== z) : [...ziele, z]; if (n.length) onChange(ZIEL_REIHE.filter((x) => n.includes(x))); };
  return (
    <fieldset className="flex flex-col gap-1.5"><legend className="text-sm font-semibold mb-1">Ziele (mehrere möglich)</legend>
      <div className="flex flex-wrap gap-1.5">
        {ZIEL_REIHE.map((z) => <label key={z} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm cursor-pointer ${ziele.includes(z) ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-200 dark:border-slate-700"}`}>
          <input type="checkbox" name={name} className="accent-emerald-700" checked={ziele.includes(z)} onChange={() => umschalten(z)} />{ZIELE[z].name}</label>)}
      </div>
      <span className="text-xs text-slate-500">Rechts im Arbeitsplatz gibt es dann einen Ziel-Umschalter. Windows/Mac, Cloud-Lauf und PDF zeigen bis Stufe 2/3 einen Platzhalter mit Sandbox, Testlauf und Builds.</span>
    </fieldset>);
}

// Technik-Empfehlung aus dem Entwurf als Hilfe bei der Wahl (Klick auf eine Zeile übernimmt Art und Ziele)
function TechnikEmpfehlung({ onWahl }) {
  return (
    <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm" open>
      <summary className="cursor-pointer font-semibold">Welche Technik passt? (Empfehlung)</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3 font-semibold">Du willst</th><th className="py-1 pr-3 font-semibold">Empfohlene Technik</th><th className="py-1 pr-3 font-semibold">Vorschau rechts</th><th className="py-1" /></tr></thead>
          <tbody>{TECHNIK_EMPFEHLUNG.map((e) => <tr key={e.wunsch} className="border-t border-slate-100 dark:border-slate-800 align-top">
            <td className="py-1.5 pr-3 font-semibold">{e.wunsch}</td>
            <td className="py-1.5 pr-3">{e.technik}{e.vorschlag && <span className="ml-1.5 text-xs font-semibold px-1.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Vorschlag</span>}{e.sonderfall && <span className="ml-1.5 text-xs font-semibold px-1.5 rounded border border-dashed border-slate-400 text-slate-600 dark:text-slate-300">Sonderfall</span>}</td>
            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{e.vorschau}</td>
            <td className="py-1.5"><button type="button" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 underline underline-offset-2 whitespace-nowrap" onClick={() => onWahl(e)}>Übernehmen</button></td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Für Windows und Mac ist <b>Tauri</b> der Standard (derselbe React-Code läuft auch als Web/PWA). .NET nur, wenn das Programm tief in Windows muss.</p>
    </details>);
}

const fehler = (e) => (e?.message || "Unbekannter Fehler").replace(/^.*?ERROR:\s*/, "");
const btn = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-display font-bold tracking-wide transition";
const ghost = "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition";
const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
const input = "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-[15px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500";

export const TECHNIK = {
  web: { name: "Web-App", Icon: Globe, kurz: "Läuft im Browser auf PC, Tablet und Handy – wie Trainer to go.", punkte: ["React, Tailwind, Supabase", "Testseite je Zweig (Cloudflare)", "Live-Vorschau im Fenster"] },
  programm: { name: "Programm (.exe)", Icon: Monitor, kurz: "Eigenes Fenster für Windows und Mac – wie die Codeschmiede.", punkte: ["Tauri (klein, schnell)", "Installation je Zweig, Start in der Windows-Sandbox", "Automatische Updates (optional)"] },
  handy: { name: "Handy-App", Icon: Smartphone, kurz: "Startet als Web-App fürs Handy (auf den Startbildschirm legen). Stores später.", punkte: ["PWA, offline-fähig", "Vorschau in Handy-Größe", "Später App Store / Google Play"] },
  werkzeug: { name: "Werkzeug / Skript", Icon: Terminal, kurz: "Ohne Oberfläche: Automatisierung, Auswertung, Datenabgleich.", punkte: ["Node mit Tests", "Testlauf mit Protokoll in GitHub", "Zeitplan möglich"] },
};
const DATENBANK = {
  keine: ["Keine", "Daten bleiben in Dateien bzw. im Gerät – jederzeit nachrüstbar"],
  spielwiese: ["Spielwiese (gemeinsam)", "Abgetrennter Bereich in einer gemeinsamen Datenbank. Braucht Supabase Pro – wird erst nach deiner Bestätigung angelegt"],
  eigen: ["Eigenes Supabase-Projekt", "Für ernste Apps mit echten Nutzern"],
};
const AMPEL_NAMEN = { projektordner: "Projektordner (Admin-PC)", regeln: "Projektregeln", sicherungen: "Sicherungen (Admin-PC)", setup: "Setup-Dateien (Admin-PC)", github: "GitHub", pruefung: "Prüfungen", build: "Build Windows/Mac", signatur: "Automatische Updates", sandbox: "Windows-Sandbox", testseite: "Testseite", testlauf: "Testlauf", datenbank: "Datenbank (Test)", datenbank_live: "Datenbank (Live)", fehler: "Fehler-Meldungen" };
const AMPEL_REIHE = ["projektordner", "regeln", "sicherungen", "setup", "github", "pruefung", "build", "testlauf", "testseite", "sandbox", "signatur", "datenbank", "datenbank_live", "fehler"];
const PUNKT = { gruen: "bg-emerald-500 ring-emerald-500/25", gelb: "bg-amber-500 ring-amber-500/25", rot: "bg-red-500 ring-red-500/25", grau: "bg-slate-400 dark:bg-slate-600 ring-slate-400/20" };
const STAND_TEXT = { gruen: "grün", gelb: "gelb", rot: "rot", grau: "grau" };

// ---------------- Assistent „Neues Projekt“ ----------------
export function NeuesProjektAssistent({ toast, onClose, onFertig, projekte = [] }) {
  const fokusfalle = useFokusfalle();   // Fokus bleibt im Dialog (Befund B2)
  const [schritt, setSchritt] = useState(1);
  const [technik, setTechnikRoh] = useState("web");
  const [ziele, setZieleRoh] = useState(["web"]); const [zieleEigen, setZieleEigen] = useState(false);   // vorbelegt aus der Art, bis man selbst wählt
  const setTechnik = (k) => { setTechnikRoh(k); if (!zieleEigen) setZieleRoh(zieleAusArt(k)); };
  const setZiele = (z) => { setZieleRoh(z); setZieleEigen(true); };
  const [name, setName] = useState(""); const [kennung, setKennung] = useState(""); const [besch, setBesch] = useState("");
  const [repo, setRepo] = useState(""); const [anlegen, setAnlegen] = useState(true); const [privat, setPrivat] = useState(true);   // Befund S2 (01.11.2026): neue Repos standardmäßig privat
  const [symbol, setSymbol] = useState("layers"); const [art, setArt] = useState("verwaltung");
  const [db, setDb] = useState("keine"); const [busy, setBusy] = useState(false);
  // Projektordner (Pflicht, 0.13.0): Projekte-Ordner einmal je PC; Projektordner = <Projekte-Ordner>\<kennung>
  const [ordner, ordnerHolen] = useProjektordner([]); const [regelnVon, setRegelnVon] = useState("vorlage");
  const ordnerOk = !!ordner && (!!ordner.ohne || (!!ordner.basis && !!ordner.basis_da));
  useEscape(onClose);   // nur der oberste Dialog (Review N2)
  const autoKennung = name.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const id = kennung || autoKennung;
  // „regeln“ ist der Ordner der globalen Regeln im Projekte-Ordner (0.13.1) – keine Projekt-Kennung
  const datenOk = /^[a-z0-9][a-z0-9-]{1,39}$/.test(id) && id !== "regeln" && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id) && !!name.trim() && (!repo || /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo.trim()));
  const zeigeDesignArt = technik !== "werkzeug";
  const los = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("ws_projekt_anlegen", { p_id: id, p_name: name.trim(), p_beschreibung: besch.trim(), p_repo: repo.trim(), p_symbol: symbol });
      if (error) throw error;
      const t = await supabase.rpc("ws_projekt_technik", { p_projekt: id, p_art: technik, p_datenbank: db });
      if (t.error) toast(`Art nicht gespeichert: ${fehler(t.error)}`);
      if (zeigeDesignArt && art !== "verwaltung") { const ra = await supabase.rpc("ws_projekt_app_art", { p_projekt: id, p_art: art }); if (ra.error) toast(fehler(ra.error)); }
      if (ziele.join(",") !== zieleAusArt(technik).join(",")) { const rz = await supabase.rpc("ws_projekt_ziele_setzen", { p_projekt: id, p_ziele: ziele }); if (rz.error) toast(`Ziele nicht gespeichert: ${fehler(rz.error)}`); }
      let gh = "";
      if (!repo.trim() && anlegen) {
        const r = await supabase.rpc("ws_repo_anfordern", { p_projekt: id, p_privat: privat });
        gh = r.error ? ` – GitHub: ${fehler(r.error)}` : " – deine Werkstatt legt Repository und Grundgerüst an";
      }
      let po = "";
      if (isDesktop() && ordner && !ordner.ohne) {
        try { const pf = await verknuepfen(id, { regelnVon: regelnVon || "leer" }); po = pf ? ` – Projektordner ${pf}` : ""; }
        catch (e) { po = ` – Projektordner: ${fehler(e)}`; }
      }
      toast(`Projekt „${name.trim()}“ angelegt${gh}${po}. Die Ampel unter „Anbindungen“ zeigt, was noch fehlt.`);
      onFertig(id); onClose();
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const SCHRITTE = ["Art", "Grunddaten", "Projektordner", "Anbindungen", "Anlegen"];
  const weiterOk = (schritt !== 2 || datenOk) && (schritt !== 3 || ordnerOk);
  const darfZu = (n) => n < schritt || n <= 2 || (datenOk && (n <= 3 || ordnerOk));
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={fokusfalle} role="dialog" aria-modal="true" aria-label="Neues Projekt" className={`${card} w-full max-w-3xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto`}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display font-bold text-xl flex-1">Neues Projekt</h3>
          <ol className="flex flex-wrap gap-1.5" aria-label="Schritte">
            {SCHRITTE.map((t, i) => (
              <li key={t}><button type="button" onClick={() => darfZu(i + 1) && setSchritt(i + 1)} aria-current={schritt === i + 1 ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${schritt === i + 1 ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                <span className={`grid place-items-center w-4 h-4 rounded-full text-xs ${schritt > i + 1 ? "bg-emerald-600 text-white" : schritt === i + 1 ? "bg-emerald-700 text-white" : "bg-slate-200 dark:bg-slate-700"}`}>{schritt > i + 1 ? <Check className="w-3 h-3" /> : i + 1}</span>{t}</button></li>))}
          </ol>
        </div>

        {schritt === 1 && (
          <fieldset className="flex flex-col gap-2"><legend className="font-semibold mb-2">Was willst du bauen?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(TECHNIK).map(([k, t]) => (
                <label key={k} className={`cursor-pointer rounded-xl border p-3.5 flex flex-col gap-1.5 ${technik === k ? "border-emerald-600 ring-1 ring-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                  <span className="flex items-center gap-2.5 font-display font-bold text-lg">
                    <input type="radio" name="cs-technik" value={k} checked={technik === k} onChange={() => setTechnik(k)} className="sr-only" />
                    <span className="grid place-items-center w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><t.Icon className="w-5 h-5" /></span>{t.name}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t.kurz}</span>
                  <ul className="text-xs text-slate-500 list-disc pl-4">{t.punkte.map((p) => <li key={p}>{p}</li>)}</ul>
                </label>))}
            </div>
            <ZieleWahl ziele={ziele} onChange={setZiele} />
            <TechnikEmpfehlung onWahl={(e) => { setTechnikRoh(e.art); setZiele(e.ziele); }} />
          </fieldset>)}

        {schritt === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-500">Name<input id="cs-pname" className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
            <label className="flex flex-col gap-1 text-sm text-slate-500">Kennung (klein, ohne Leerzeichen)<input id="cs-pid" className={`${input} font-mono`} value={id} onChange={(e) => setKennung(e.target.value)} /></label>
            <label className="sm:col-span-2 flex flex-col gap-1 text-sm text-slate-500">Worum geht es?<textarea id="cs-pdesc" className={`${input} min-h-[70px]`} value={besch} onChange={(e) => setBesch(e.target.value)} /></label>
            {zeigeDesignArt && <label className="flex flex-col gap-1 text-sm text-slate-500">Art der Oberfläche (Beispiele im App-Designer)
              <select id="cs-part" className={input} value={art} onChange={(e) => setArt(e.target.value)}>{APP_ARTEN.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>}
            <label className="flex flex-col gap-1 text-sm text-slate-500">Symbol<select id="cs-psym" className={input} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{Object.keys(WS_ICON).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <fieldset className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2 text-sm">
              <legend className="px-1 text-slate-500">GitHub</legend>
              <label className="flex items-start gap-2"><input id="cs-prepo-neu" type="checkbox" className="mt-1 accent-emerald-700" checked={anlegen && !repo.trim()} disabled={!!repo.trim()} onChange={(e) => setAnlegen(e.target.checked)} />
                <span>Repository mit Grundgerüst „{TECHNIK[technik].name}“ anlegen: <span className="font-mono text-xs">kresak-it-solutions/{id || "…"}</span><span className="block text-xs text-slate-500">Macht deine Werkstatt mit deiner GitHub-Anmeldung – Code, Prüfungen und Regelwerk, lauffähig ab dem ersten Tag.</span></span></label>
              {anlegen && !repo.trim() && <label className="flex items-center gap-2 pl-6"><input id="cs-prepo-privat" type="checkbox" className="accent-emerald-700" checked={privat} onChange={(e) => setPrivat(e.target.checked)} />Privat <span className="text-xs text-slate-500">(empfohlen; öffentlich nur, wenn der Code für alle sichtbar sein darf – privat verbraucht GitHub-Minuten für Prüfungen und Builds)</span></label>}
              <label className="flex flex-col gap-1 text-slate-500">Oder vorhandenes Repository eintragen (Besitzer/Name)<input id="cs-prepo" className={input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="kresak-it-solutions/neue-app" /></label>
            </fieldset>
          </div>)}

        {schritt === 3 && <ProjektordnerSchritt id={id} stand={ordner} holen={ordnerHolen} regelnVon={regelnVon} setRegelnVon={setRegelnVon} andere={projekte.filter((p) => !p.archiviert && p.id !== id)} toast={toast} />}

        {schritt === 4 && (
          <fieldset className="flex flex-col gap-2"><legend className="font-semibold mb-2">Datenbank</legend>
            {Object.entries(DATENBANK).map(([k, [t, b]]) => (
              <label key={k} className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${db === k ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-700"}`}>
                <input type="radio" name="cs-db" value={k} checked={db === k} onChange={() => setDb(k)} className="mt-1 accent-emerald-700" />
                <span><b className="text-sm">{t}</b><span className="block text-xs text-slate-500">{b}</span></span></label>))}
            <p className="text-xs text-slate-500 flex gap-1.5 mt-1"><Info className="w-4 h-4 shrink-0" />
              {technik === "programm" ? "Builds für Windows und Mac laufen in GitHub; ausprobieren kannst du jeden Zweig in der Windows-Sandbox."
                : technik === "werkzeug" ? "Testläufe laufen in GitHub, das Ergebnis kommt als Datei. Ein Zeitplan lässt sich im Ablauf „Lauf“ einschalten."
                : "Die Testseite richtest du danach unter „Anbindungen“ mit einem Klick ein (Cloudflare Pages, kostenlos) – die Codeschmiede trägt die Adresse selbst ein."}</p>
          </fieldset>)}

        {schritt === 5 && (
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Art</dt><dd>{TECHNIK[technik].name}</dd>
            <dt className="text-slate-500">Ziele</dt><dd>{ziele.map((z) => ZIELE[z].name).join(" · ")}</dd>
            <dt className="text-slate-500">Name</dt><dd>{name.trim() || "–"}</dd>
            <dt className="text-slate-500">Repository</dt><dd className="font-mono text-xs break-all">{repo.trim() || (anlegen ? `kresak-it-solutions/${id} (${privat ? "privat" : "öffentlich"}, wird angelegt)` : "später")}</dd>
            <dt className="text-slate-500">Grundgerüst</dt><dd>{TECHNIK[technik].punkte.join(" · ")}</dd>
            <dt className="text-slate-500">Datenbank</dt><dd>{DATENBANK[db][0]}</dd>
            <dt className="text-slate-500">Projektordner</dt><dd className="font-mono text-xs break-all">{ordner?.ohne ? "wird beim nächsten Start im Programm festgelegt" : ordner?.basis ? `${ordner.basis.replace(/[\\/]+$/, "")}${ordner.basis.includes("\\") ? "\\" : "/"}${id}` : "–"}</dd>
            <dt className="text-slate-500">Projektregeln</dt><dd>{regelnVon === "leer" ? "leere REGELN.md" : regelnVon && regelnVon !== "vorlage" ? `kopiert aus „${projekte.find((p) => p.id === regelnVon)?.name || regelnVon}“` : "aus der Vorlage"} – Vorrang vor dem Regelwerk, Sicherheit gilt immer</dd>
            <dt className="text-slate-500">Regelwerk</dt><dd>AI-Dev-OS, Handbuch, CHANGELOG, Datenschutz</dd>
          </dl>)}

        <div className="flex justify-between gap-2">
          <button type="button" className={ghost} onClick={() => (schritt === 1 ? onClose() : setSchritt(schritt - 1))}>{schritt === 1 ? "Abbrechen" : <><ArrowLeft className="w-4 h-4" />Zurück</>}</button>
          {schritt < 5 ? <button type="button" className={btn} disabled={!weiterOk} onClick={() => setSchritt(schritt + 1)}>Weiter<ArrowRight className="w-4 h-4" /></button>
            : <button type="button" className={btn} disabled={busy || !datenOk} onClick={los}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Projekt anlegen</button>}
        </div>
      </div>
    </div>);
}

// ---------------- Seite „Anbindungen“: Ampel + Vorschau je Art ----------------
export default function Anbindungen({ d, ich, toast, onVorschau }) {
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const admin = ich.rolle === "admin";
  const [aktionen, setAktionen] = useState([]); const [busy, setBusy] = useState("");
  const [zweig, setZweig] = useState("main"); const [netz, setNetz] = useState(false);
  const laden = useCallback(async () => {
    if (!admin || !projekt) return;
    const { data } = await supabase.from("ws_projekt_aktionen").select("*").eq("projekt_id", projekt.id).order("id", { ascending: false }).limit(5);
    setAktionen(data || []);
  }, [admin, projekt]);
  useEffect(() => {
    laden();
    if (!admin) return undefined;
    const ch = supabase.channel(`aktionen-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "ws_projekt_aktionen" }, () => laden()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [laden, admin]);
  if (!projekt) return null;
  const t = TECHNIK[projekt.technik_art] || TECHNIK.web;
  const ampel = projekt.anbindungen || {};
  const meinePcs = (d.pcs || []).filter((p) => p.benutzer_id === ich.id && p.an && Date.now() - new Date(p.zuletzt).getTime() < 180000);
  const aktion = async (art) => {
    setBusy(art);
    try {
      const pc = art === "sandbox" ? meinePcs[0]?.id : null;
      if (art === "sandbox" && !pc) throw new Error("Auf diesem PC läuft keine Werkstatt – oben „Werkstatt an“ einschalten");
      const { error } = await supabase.rpc("ws_projekt_aktion_anfordern", { p_projekt: projekt.id, p_art: art, p_zweig: art === "pruefen" ? null : zweig.trim() || "main", p_pc: pc, p_netz: art === "sandbox" && netz });
      if (error) throw error;
      toast(art === "pruefen" ? "Ampel wird neu geprüft" : art === "sandbox" ? "Die Werkstatt holt den Build und startet die Windows-Sandbox" : "Testlauf wird gestartet");
    } catch (e) { toast(fehler(e)); } finally { setBusy(""); }
  };
  const letzte = (art) => aktionen.find((a) => a.art === art);
  const Ergebnis = ({ a }) => !a ? null : (
    <p className={`text-xs flex items-start gap-1.5 ${a.stand === "fehler" ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-300"}`}>
      {a.stand === "laeuft" || a.stand === "angefragt" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-px" /> : <Info className="w-3.5 h-3.5 shrink-0 mt-px" />}
      <span>{a.hinweis || "Wartet auf die Werkstatt"}{a.link && <> · <a className="underline" href={a.link} target="_blank" rel="noopener noreferrer">bei GitHub ansehen</a></>}</span></p>);
  const reihe = AMPEL_REIHE.filter((k) => ampel[k]);
  return (
    <section className="flex flex-col gap-4 max-w-5xl" aria-label="Anbindungen">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display font-bold text-xl leading-tight flex-1">Anbindungen</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold"><t.Icon className="w-3.5 h-3.5" />{t.name}</span>
        {admin && <button type="button" className={ghost} disabled={busy === "pruefen"} onClick={() => aktion("pruefen")}>{busy === "pruefen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Jetzt prüfen</button>}
      </div>
      <p className="text-sm text-slate-500">Was das Projekt braucht und ob es läuft. Die Werkstatt des Admins prüft alle 10 Minuten{projekt.anbindungen_zeit ? `, zuletzt ${new Date(projekt.anbindungen_zeit).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}` : ""}.
        Gelb heißt: du musst selbst etwas tun (z. B. in Cloudflare bestätigen) – Anmeldungen und Geheimnisse gibst du nur beim Anbieter ein.</p>
      <AnbindungenKacheln projekt={projekt} d={d} admin={admin} toast={toast} />
      <ProjektordnerKarte projekt={projekt} toast={toast} />
      <h3 className="font-display font-bold text-lg mt-2">Welche Regeln gelten?</h3>
      <RegelnRangfolge konflikt={ampel.regeln?.stand === "rot" ? `${ampel.regeln.text}.` : null} />
      <h3 className="font-display font-bold text-lg mt-2">Ampel im Detail</h3>
      {reihe.length ? (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {reihe.map((k) => (
            <li key={k} className={`${card} p-3 flex flex-col gap-1`}>
              <span className="flex items-center gap-2 font-semibold text-sm"><span className={`w-2.5 h-2.5 rounded-full ring-4 ${PUNKT[ampel[k].stand]}`} aria-hidden="true" />{AMPEL_NAMEN[k]}<span className="sr-only">: {STAND_TEXT[ampel[k].stand]}</span></span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{ampel[k].text}</span>
            </li>))}
        </ul>)
        : <p className={`${card} p-4 text-sm text-slate-500`}>Noch keine Prüfung. {admin ? "„Jetzt prüfen“ klicken – die Werkstatt muss dafür an sein." : "Sobald die Werkstatt des Admins läuft, erscheint hier die Ampel."}</p>}

      <h3 className="font-display font-bold text-lg mt-2">Vorschau</h3>
      <div className={`${card} p-4 flex flex-col gap-3`}>
        {(projekt.technik_art === "web" || projekt.technik_art === "handy" || !projekt.technik_art) && (<>
          <p className="text-sm text-slate-600 dark:text-slate-300">{projekt.technik_art === "handy" ? "Die Handy-App siehst du in der Live-Vorschau in Handy-Größe (oben rechts umschalten). Am echten Handy: Testseite öffnen und „Zum Startbildschirm hinzufügen“." : "Die Web-App siehst du in der Live-Vorschau – mit „Zeigen & kommentieren“ für Aufträge."}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={onVorschau}><Eye className="w-4 h-4" />Live-Vorschau öffnen</button>
            {(projekt.test_url || projekt.live_url) && <a className={ghost} href={projekt.test_url || projekt.live_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Testseite im Browser</a>}</div></>)}
        {projekt.technik_art === "programm" && (<>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">Zweig<input className={`${input} font-mono w-56`} value={zweig} onChange={(e) => setZweig(e.target.value)} /></label>
            <button type="button" className={btn} disabled={!admin || !!busy || !projekt.repo} onClick={() => aktion("sandbox")}>{busy === "sandbox" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}In Windows-Sandbox starten</button>
            {projekt.repo && <a className={ghost} href={`https://github.com/${projekt.repo}/actions/workflows/programm.yml`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Builds bei GitHub (Installationsdateien)</a>}
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-emerald-700" checked={netz} onChange={(e) => setNetz(e.target.checked)} />
            <span>Netzwerk in der Sandbox erlauben<span className="block text-xs text-slate-500">Nur einschalten, wenn das Programm Internet braucht (z. B. Datenbank). Dann erreicht es auch dein Heimnetz.</span></span></label>
          <p className="text-xs text-slate-500">Die Sandbox ist eine Wegwerf-Umgebung von Windows: Die Installation startet nur darin, Schließen löscht alles, dein PC bleibt unberührt. Mac-Dateien (.dmg) lädst du bei GitHub.</p>
          <Ergebnis a={letzte("sandbox")} />
          {!admin && <p className="text-xs text-slate-500">Die Sandbox startet der Admin auf seinem PC.</p>}</>)}
        {projekt.technik_art === "werkzeug" && (<>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">Zweig<input className={`${input} font-mono w-56`} value={zweig} onChange={(e) => setZweig(e.target.value)} /></label>
            <button type="button" className={btn} disabled={!admin || !!busy || !projekt.repo} onClick={() => aktion("testlauf")}>{busy === "testlauf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Testlauf starten</button>
            {projekt.repo && <a className={ghost} href={`https://github.com/${projekt.repo}/actions/workflows/lauf.yml`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Läufe und Ergebnisse</a>}
          </div>
          <Ergebnis a={letzte("testlauf")} /></>)}
      </div>
      {<DatenbankStation projekt={projekt} d={d} admin={admin} toast={toast} letzte={letzte("db_einrichten")} Ergebnis={Ergebnis} />}
      {admin && (projekt.technik_art === "web" || projekt.technik_art === "handy" || !projekt.technik_art) && <FehlerSchluessel projekt={projekt} toast={toast} />}
      {admin && <ArtAendern projekt={projekt} toast={toast} onGeaendert={() => d.holen?.()} />}
    </section>);
}

function ArtAendern({ projekt, toast, onGeaendert }) {
  const [art, setArt] = useState(projekt.technik_art || "web"); const [db, setDb] = useState(projekt.datenbank || "keine"); const [busy, setBusy] = useState(false);
  const zieleJetzt = zieleVon(projekt).join(",");
  const [ziele, setZiele] = useState(() => zieleVon(projekt));
  useEffect(() => { setArt(projekt.technik_art || "web"); setDb(projekt.datenbank || "keine"); }, [projekt.technik_art, projekt.datenbank]);
  useEffect(() => { setZiele(zieleJetzt.split(",")); }, [zieleJetzt]);
  const artGeaendert = art !== (projekt.technik_art || "web") || db !== (projekt.datenbank || "keine");
  const zieleGeaendert = ziele.join(",") !== zieleJetzt;
  const geaendert = artGeaendert || zieleGeaendert;
  const speichern = async () => {
    setBusy(true);
    try {
      if (artGeaendert) { const { error } = await supabase.rpc("ws_projekt_technik", { p_projekt: projekt.id, p_art: art, p_datenbank: db }); if (error) throw error; }
      if (zieleGeaendert) { const { error } = await supabase.rpc("ws_projekt_ziele_setzen", { p_projekt: projekt.id, p_ziele: ziele }); if (error) throw error; }
      toast("Gespeichert – die Ampel prüft beim nächsten Durchlauf neu"); onGeaendert();
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  return (
    <details className={`${card} p-4`}>
      <summary className="cursor-pointer font-semibold text-sm">Art, Ziele und Datenbank ändern</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">Art<select className={input} value={art} onChange={(e) => setArt(e.target.value)}>{Object.entries(TECHNIK).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">Datenbank<select className={input} value={db} onChange={(e) => setDb(e.target.value)}>{Object.entries(DATENBANK).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <button type="button" className={btn} disabled={!geaendert || busy} onClick={speichern}>Speichern</button>
      </div>
      <div className="mt-3"><ZieleWahl ziele={ziele} onChange={setZiele} name="cs-ziele-aendern" /></div>
      <p className="mt-2 text-xs text-slate-500">Ändert nur die Einordnung und Ampel. Ein neues Grundgerüst im bestehenden Repository gibst du als Auftrag.</p>
    </details>);
}

// ---------------- Datenbank-Station (Datenbank 0034) ----------------
// main → Test-Datenbank automatisch, live → Live-Datenbank nach Freigabe (Live-Weg), vorher Sicherung des Aufbaus.
// Eingetragen werden nur die Projekt-Kennungen von Supabase. Der Zugang (Verbindungsadresse NUR dieser Datenbank) liegt als Geheimnis
// in der GitHub-Umgebung „test“ (nur Zweig main) bzw. „live“ (nur Zweig live) – trägt Gerhard selbst ein.
function DatenbankStation({ projekt, d, admin, toast, letzte, Ergebnis }) {
  const [test, setTest] = useState(projekt.db_test_ref || ""); const [live, setLive] = useState(projekt.db_live_ref || "");
  const [testB, setTestB] = useState(projekt.db_test_bestehend ?? true); const [liveB, setLiveB] = useState(projekt.db_live_ref ? (projekt.db_live_bestehend ? "ja" : "nein") : "");
  const gruppen = d.gruppen.filter((g) => d.bereiche.some((b) => b.id === g.bereich_id));
  const [gid, setGid] = useState(projekt.db_gruppe_id || gruppen.find((g) => /daten|datenbank/i.test(g.name))?.id || gruppen[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const ok = (r) => r === "" || /^[a-z]{20}$/.test(r);
  const einrichten = async () => {
    setBusy(true);
    try {
      const r1 = await supabase.rpc("ws_projekt_datenbank", { p_projekt: projekt.id, p_test: test.trim(), p_live: live.trim(), p_test_bestehend: testB, p_live_bestehend: liveB === "ja", p_gruppe: gid || null });
      if (r1.error) throw r1.error;
      const r2 = await supabase.rpc("ws_projekt_aktion_anfordern", { p_projekt: projekt.id, p_art: "db_einrichten" });
      if (r2.error) throw r2.error;
      toast("Gespeichert – die Werkstatt richtet die Datenbank-Station ein"); d.holen?.();
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const geheimLink = projekt.repo ? `https://github.com/${projekt.repo}/settings/environments` : null;
  return (
    <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Datenbank-Station">
      <h3 className="font-display font-bold text-lg">Datenbank-Station</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300">Neue Datenbank-Dateien (<span className="font-mono">supabase/migrations/</span>) gehen nach dem Zusammenführen <b>automatisch in die Test-Datenbank</b> und erst mit „Live schalten“ (nach deiner Freigabe) in die <b>Live-Datenbank</b> – vorher wird deren Aufbau (ohne Daten) in der Datenbank selbst gesichert. Die eigentliche Datensicherung sind die Sicherungen von Supabase. Was noch nicht live ist, siehst du im „Weg bis live“.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-500">Test-Datenbank (Supabase-Projektkennung, 20 Buchstaben)
          <input className={`${input} font-mono`} value={test} disabled={!admin} onChange={(e) => setTest(e.target.value.trim().toLowerCase())} placeholder="z. B. lhdoyjdothombwslfeco" /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">Live-Datenbank (leer = Test und Live teilen sich eine)
          <input className={`${input} font-mono`} value={live} disabled={!admin} onChange={(e) => setLive(e.target.value.trim().toLowerCase())} /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-emerald-700" checked={testB} disabled={!admin} onChange={(e) => setTestB(e.target.checked)} />
          <span>Test-Datenbank enthält die vorhandenen Dateien schon<span className="block text-xs text-slate-500">Dann werden nur neue eingespielt (bei bestehenden Datenbanken richtig).</span></span></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">Live-Datenbank: enthält sie die vorhandenen Dateien schon? (Pflicht)
          <select className={input} value={liveB} disabled={!admin || !live} onChange={(e) => setLiveB(e.target.value)}>
            <option value="">– bitte wählen –</option><option value="nein">Nein – neue, leere Datenbank: alles einspielen</option><option value="ja">Ja – bestehende Datenbank: nur Neues einspielen</option></select>
          <span>Steht eine nicht leere Datenbank auf „Nein“, bricht der Ablauf zur Sicherheit ab.</span></label>
        <label className="flex flex-col gap-1 text-xs text-slate-500 sm:col-span-2">Gruppe für den Einrichtungs-Auftrag
          <select className={input} value={gid} disabled={!admin} onChange={(e) => setGid(e.target.value)}>{gruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      </div>
      <ol className="text-sm list-decimal pl-5 flex flex-col gap-1 text-slate-600 dark:text-slate-300">
        <li>„Einrichten“: Die Werkstatt legt bei GitHub die Umgebungen „test“ (nur Zweig main) und „live“ (nur Zweig live) an und einen Auftrag für den Ablauf „Datenbank“ – Freigeben und Zusammenführen wie immer.</li>
        <li>Einmal selbst je Datenbank: in Supabase <b>Connect</b> › <b>Session pooler</b> die Verbindungsadresse kopieren (Passwort einsetzen) und bei GitHub unter{geheimLink ? <> <a className="underline" href={geheimLink} target="_blank" rel="noopener noreferrer">Settings › Environments</a></> : " Settings › Environments"} › „test“ bzw. „live“ › <b>Add environment secret</b> als <span className="font-mono">SUPABASE_DB_URL</span> eintragen. Diese Adresse gilt nur für diese eine Datenbank – du gibst sie nur bei GitHub ein, nie in der Codeschmiede oder im Chat.</li>
        <li>Danach zeigt die Ampel oben, ob Test und Live eingespielt sind.</li>
      </ol>
      {admin && <button type="button" className={`${btn} self-start`} disabled={busy || !ok(test) || !ok(live) || (!test && !live) || (test && test === live) || (live && !liveB)} onClick={einrichten}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Einrichten</button>}
      <Ergebnis a={letzte} />
    </section>);
}

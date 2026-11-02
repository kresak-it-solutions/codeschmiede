// Ein-Klick-Anbindungen (Entwurf 1.0 „Projektordner“, Bildschirm 4, freigegeben von Gerhard 02.11.2026 07:04):
// Projektordner · GitHub · Testseite (Cloudflare Pages, kostenlos, per Knopf) · Datenbank (Wunsch vermerken, Kosten vorher bestätigen) ·
// Fehler-Meldungen · Seiten-Designer (folgt). Ausgeführt wird von der Werkstatt des Admins; hier wird nur gewünscht und angezeigt.
import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2, Rocket, Database, RefreshCw, X, ShieldCheck, Globe } from "lucide-react";
import { supabase } from "./supabase";
import { btn, card, fehler, ghost, oeffneExtern, useBestaetigen } from "./bausteine/grund";
import { useOrdnerStandDb, useProjektordner } from "./daten/projektordner";

const LOTSE = "https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages";
const PUNKT = { gruen: "bg-emerald-500", gelb: "bg-amber-500", rot: "bg-red-500", grau: "bg-slate-400 dark:bg-slate-600" };
const WORT = { gruen: "grün", gelb: "gelb", rot: "rot", grau: "grau" };

function Lampe({ stand, titel, text, children }) {
  return (
    <li className={`${card} p-3 flex gap-3 items-start`}>
      <span className={`w-3 h-3 mt-1 rounded-full shrink-0 ring-4 ring-slate-400/10 ${PUNKT[stand] || PUNKT.grau}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <b className="text-sm">{titel}<span className="sr-only">: {WORT[stand] || "grau"}</span></b>
        {text && <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{text}</span>}
        {children}
      </div>
    </li>);
}

/** Gemeldete REGELN.md je PC (ws_regeln_stand) und bestätigte Prüfsummen (ws_regeln_freigaben), Datenbank 0055. */
function useRegelnStand(projektId) {
  const [z, setZ] = useState({ zeilen: [], frei: [] });
  useEffect(() => {
    let aus = false;
    const holen = async () => {
      const [a, b] = await Promise.all([supabase.from("ws_regeln_stand").select("pc_id, sha, text, konflikte, gemeldet").eq("projekt_id", projektId),
        supabase.from("ws_regeln_freigaben").select("sha, am").eq("projekt_id", projektId).order("am", { ascending: false })]);
      if (!aus && !a.error && !b.error) setZ({ zeilen: a.data || [], frei: b.data || [] });
    };
    holen();
    const ch = supabase.channel(`regeln-${projektId}-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "ws_regeln_stand" }, holen)
      .on("postgres_changes", { event: "*", schema: "public", table: "ws_regeln_freigaben" }, holen).subscribe();
    return () => { aus = true; supabase.removeChannel(ch); };
  }, [projektId]);
  return z;
}

export default function AnbindungenKacheln({ projekt, d, admin, toast }) {
  const ampel = projekt.anbindungen || {};
  const [ort] = useProjektordner([projekt.id]);
  const dbStand = useOrdnerStandDb(projekt.id);
  const bestaetigen = useBestaetigen();
  const regeln = useRegelnStand(projekt.id);
  const freiSha = new Set(regeln.frei.map((f) => f.sha));
  const letzteFreigabe = regeln.frei[0]?.am || null;
  // Je Prüfsumme einmal anzeigen, mit den PCs, die sie melden (Bestätigung gilt für alle PCs mit genau diesem Inhalt)
  const offen = Object.values(regeln.zeilen.filter((z) => !freiSha.has(z.sha)).reduce((m, z) => { (m[z.sha] ||= { ...z, pcs: [] }).pcs.push(z.pc_id); return m; }, {}));
  const regelnBestaetigen = async (sha) => {
    setBusy(`regeln-${sha}`);
    try { const { error } = await supabase.rpc("ws_regeln_bestaetigen", { p_projekt: projekt.id, p_sha: sha }); if (error) throw error; toast("Projektregeln bestätigt – ab dem nächsten Auftrag gilt diese Fassung (auf allen PCs mit genau diesem Inhalt)"); }
    catch (e) { toast(fehler(e)); } finally { setBusy(""); }
  };
  const [busy, setBusy] = useState("");
  const web = !projekt.technik_art || ["web", "handy"].includes(projekt.technik_art);
  const pcName = (id) => (d.pcs || []).find((p) => p.id === id)?.name || "Werkstatt-PC";

  // Projektordner: dieser PC (lokal) zuerst, sonst Meldung der Werkstatt-PCs
  const lokal = ort?.je?.[projekt.id];
  const po = lokal && !ort.ohne
    ? (!lokal.verknuepft ? ["gelb", "Auf diesem PC noch nicht festgelegt – unten „Projektordner“ verknüpfen"]
      : !lokal.erreichbar ? ["rot", `${lokal.pfad} · Festplatte fehlt – die Werkstatt pausiert für dieses Projekt`]
      : ["gruen", `${lokal.pfad} · Festplatte angesteckt${lokal.code ? "" : " · Arbeitskopie wird angelegt bzw. umgezogen"}`])
    : ampel.projektordner ? [ampel.projektordner.stand, `Admin-PC: ${ampel.projektordner.text}`] : ["grau", "Wird im Programm Codeschmiede festgelegt (je PC)"];
  const konflikte = dbStand.filter((z) => z.konflikte > 0);
  const regelnRot = ampel.regeln?.stand === "rot" ? ampel.regeln.text : konflikte[0]?.hinweis || null;

  const anfordern = async () => {
    setBusy("testseite");
    try {
      const { error } = await supabase.rpc("ws_projekt_aktion_anfordern", { p_projekt: projekt.id, p_art: "testseite" });
      if (error) throw error;
      toast("Die Werkstatt des Admins richtet die Testseite bei Cloudflare ein (kostenlos)"); d.holen?.();
    } catch (e) { toast(fehler(e)); } finally { setBusy(""); }
  };
  const dbWunsch = async (an) => {
    if (an && !(await bestaetigen({ titel: "Datenbank anlegen?", ja: "Kosten verstanden – Wunsch vermerken",
      text: "Eine eigene Datenbank braucht Supabase Pro – das kostet ca. 25 $ im Monat.\n\nDie Codeschmiede vermerkt jetzt nur deinen Wunsch („gewünscht“). Angelegt wird die Datenbank erst in einem späteren Schritt – vorher fragt sie dich noch einmal. Bis dahin entstehen keine Kosten." }))) return;
    setBusy("db");
    try {
      const { error } = await supabase.rpc("ws_datenbank_wuenschen", { p_projekt: projekt.id, p_kosten_bestaetigt: !!an, p_an: !!an });
      if (error) throw error;
      toast(an ? "Datenbank als „gewünscht“ vermerkt – angelegt wird noch nichts" : "Wunsch zurückgezogen"); d.holen?.();
    } catch (e) { toast(fehler(e)); } finally { setBusy(""); }
  };

  // Testseite
  const ts = projekt.testseite_stand;
  const tsDa = !!projekt.vorschau_domain && ts !== "lotse" && ts !== "fehler";
  const testseite = tsDa ? ["gruen", `https://${projekt.vorschau_domain} · Zweige als <zweig>.${projekt.vorschau_domain}${ampel.testseite?.text ? ` · ${ampel.testseite.text}` : ""}`]
    : ts === "laeuft" ? ["gelb", "Wird eingerichtet … (Werkstatt des Admins)"]
    : ts === "lotse" ? ["gelb", projekt.testseite_hinweis || "Cloudflare braucht einmal deine Hilfe"]
    : ts === "fehler" ? ["rot", projekt.testseite_hinweis || "Hat nicht geklappt"]
    : ["gelb", "Noch nicht eingerichtet. Kostenlos: Cloudflare baut selbst (bis 500 Bauläufe im Monat), main ist die Testfassung, Werkstatt-Zweige bekommen eine eigene Vorschau."];

  // Datenbank
  const db = projekt.datenbank && projekt.datenbank !== "keine"
    ? [ampel.datenbank?.stand || "grau", ampel.datenbank?.text || "Eigene Datenbank – siehe Datenbank-Station unten"]
    : projekt.datenbank_wunsch ? ["gelb", `Gewünscht am ${new Date(projekt.datenbank_wunsch).toLocaleDateString("de-AT")} – angelegt wird sie in einem späteren Schritt (nach deiner erneuten Bestätigung). Bis dahin keine Kosten.`]
    : ["grau", "Keine – jederzeit nachrüstbar. Kostet Supabase Pro (ca. 25 $/Monat); vor dem Anlegen fragt die Codeschmiede dich."];

  return (
    <section className="flex flex-col gap-3" aria-label="Einrichten">
      {regelnRot && <p className="text-sm rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 px-3 py-2.5" role="alert">
        <b>Regel-Konflikt:</b> {regelnRot}. Die Sicherheitsregel der Codeschmiede gilt – bitte <span className="font-mono">regeln\REGELN.md</span> im Projektordner anpassen.
        <span className="block text-xs mt-1">Die Erkennung ist nur ein Hinweis – die Sicherheitsregeln gelten fest, auch wenn hier nichts rot ist.</span>
        {konflikte.length > 0 && <span className="block text-xs mt-1">Gemeldet von: {konflikte.map((z) => pcName(z.pc_id)).join(", ")}</span>}</p>}
      {offen.map((r) => (
        <div key={r.sha} className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 flex flex-col gap-2 text-sm text-amber-950 dark:text-amber-100" aria-label="Projektregeln bestätigen">
          <b className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" aria-hidden="true" />{letzteFreigabe ? "REGELN.md geändert – bestätigen" : "REGELN.md bestätigen"}</b>
          <span>Gemeldet von: {r.pcs.map(pcName).join(", ")}. Die Werkstatt nutzt nur die zuletzt von dir bestätigte Fassung{letzteFreigabe ? ` (zuletzt bestätigt ${new Date(letzteFreigabe).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })})` : " – bisher keine, es gelten die Projektregeln aus AGENTS.md"}. Prüfe den Text und bestätige ihn, wenn er von dir stammt.{r.konflikte > 0 ? ` Achtung: ${r.konflikte} Stelle(n) widersprechen der Sicherheit – dort gilt trotzdem die Sicherheitsregel.` : ""}</span>
          <details className="rounded-lg bg-white/70 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-900"><summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold">Text ansehen (Prüfsumme {r.sha.slice(0, 12)})</summary>
            <pre className="px-3 pb-3 text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto font-mono text-slate-800 dark:text-slate-200">{r.text || ""}</pre></details>
          {admin ? <button type="button" className={`${btn} self-start`} disabled={!!busy} onClick={() => regelnBestaetigen(r.sha)}>{busy === `regeln-${r.sha}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Diese Fassung bestätigen</button>
            : <span className="text-xs">Bestätigen kann nur der Admin.</span>}
        </div>))}
      {regeln.zeilen.length > 0 && <p className="text-xs text-slate-500">REGELN.md je PC: {regeln.zeilen.map((z) => `${pcName(z.pc_id)} ${freiSha.has(z.sha) ? "bestätigt" : "offen"} (${z.sha.slice(0, 8)})`).join(" · ")}</p>}
      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Lampe stand={po[0]} titel="Projektordner" text={po[1]} />
        <Lampe stand={ampel.github?.stand || (projekt.repo ? "grau" : "rot")} titel="GitHub" text={ampel.github?.text ? `${projekt.repo || ""} · ${ampel.github.text}` : projekt.repo || "Noch kein Repository – unter „Projekte verwalten“ anlegen"} />
        {web && <Lampe stand={testseite[0]} titel="Testseite (Cloudflare)" text={testseite[1]}>
          {admin && !tsDa && ts !== "laeuft" && <button type="button" className={`${btn} self-start`} disabled={!!busy || !projekt.repo} onClick={anfordern}>
            {busy === "testseite" ? <Loader2 className="w-4 h-4 animate-spin" /> : ts === "lotse" || ts === "fehler" ? <RefreshCw className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}{ts === "lotse" || ts === "fehler" ? "Nochmal versuchen" : "Testseite einrichten"}</button>}
          {ts === "laeuft" && <span className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Die Werkstatt des Admins muss an sein.</span>}
          {!admin && !tsDa && <span className="text-xs text-slate-500">Die Testseite richtet der Admin ein.</span>}
          {tsDa && <a className="text-xs underline self-start" href={`https://${projekt.vorschau_domain}`} target="_blank" rel="noopener noreferrer">Testseite im Browser öffnen</a>}
          <span className="text-xs text-slate-500 flex gap-1.5"><Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />Öffentlich: Testfassung (main) und Vorschauen der Werkstatt-Zweige (feature/cs-…) sind für jeden mit der Adresse erreichbar – keine echten Daten, in Zweig-Vorschauen nicht anmelden.</span>
        </Lampe>}
        <Lampe stand={db[0]} titel="Datenbank" text={db[1]}>
          {admin && (!projekt.datenbank || projekt.datenbank === "keine") && (projekt.datenbank_wunsch
            ? <button type="button" className={`${ghost} self-start h-9 text-xs`} disabled={!!busy} onClick={() => dbWunsch(false)}><X className="w-3.5 h-3.5" />Wunsch zurückziehen</button>
            : <button type="button" className={`${ghost} self-start`} disabled={!!busy} onClick={() => dbWunsch(true)}>{busy === "db" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}Datenbank anlegen …</button>)}
        </Lampe>
        {web && <Lampe stand={ampel.fehler?.stand || "grau"} titel="Fehler-Meldungen" text={ampel.fehler?.text || "Kommen mit der Testseite automatisch dazu (Werte für den Melder trägt die Codeschmiede bei Cloudflare ein)."} />}
        {web && <Lampe stand="grau" titel="Seiten-Designer" text="Folgt als nächste Etappe für jede Web-App." />}
      </ul>
      {web && ts === "lotse" && admin && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-col gap-2 text-sm text-amber-950 dark:text-amber-100" aria-label="Lotse Testseite">
          <b className="font-display text-base">Lotse: Testseite einmal in Cloudflare verbinden</b>
          <p>Die Codeschmiede konnte das Repository nicht selbst mit Cloudflare verbinden – meist fehlt die Cloudflare-App für GitHub in der Organisation. So geht es (alles kostenlos, keine Zahlungsdaten nötig):</p>
          <ol className="list-decimal pl-5 flex flex-col gap-1">
            <li>Cloudflare öffnen (Knopf unten) › <b>Workers & Pages</b> › <b>Erstellen</b> › Reiter <b>Pages</b> › <b>Mit Git verbinden</b>.</li>
            <li><b>GitHub</b> wählen und die Cloudflare-App für <b>kresak-it-solutions</b> installieren – Zugriff auf das Repository <span className="font-mono">{projekt.repo}</span>.</li>
            <li>Repository <span className="font-mono">{projekt.repo}</span> wählen, Projektname <span className="font-mono">{projekt.id}</span>, Produktionszweig <span className="font-mono">main</span>.</li>
            <li>Build-Befehl <span className="font-mono">npm run build</span>, Ausgabeverzeichnis <span className="font-mono">dist</span> › <b>Speichern und bereitstellen</b>.</li>
            <li>Danach im Pages-Projekt › <b>Einstellungen</b> › <b>Builds</b> › <b>Branch-Steuerung</b>: Vorschau nur für <b>benutzerdefinierte Zweige</b> <span className="font-mono">feature/cs-*</span> (nicht „alle Zweige“) – die Sicherheitsprüfung wartet auf genau diese Bauten.</li>
            <li>Fertig – die Codeschmiede findet die Seite selbst (bei der nächsten Prüfung, spätestens nach 10 Minuten) und trägt die Adresse ein. Oder hier „Nochmal versuchen“ – mit der installierten App klappt es dann automatisch.</li>
          </ol>
          <button type="button" className={`${ghost} self-start bg-white dark:bg-slate-900`} onClick={() => oeffneExtern(LOTSE)}><ExternalLink className="w-4 h-4" />Cloudflare öffnen</button>
        </div>)}
    </section>);
}

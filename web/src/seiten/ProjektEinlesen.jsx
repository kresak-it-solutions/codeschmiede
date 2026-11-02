// Assistent „Bestehendes Projekt einlesen“ (0.16.0, Entwurf „Projekt einlesen“ freigegeben von Gerhard 02.11.2026, docs/KONZEPT-EINLESEN.md).
// Sechs Schritte: Quelle › Prüfung › Einordnen › Repository › Gruppen & Features › Fertig. Nur für den Admin und nur im Programm.
// Die Oberfläche bekommt nie einen Pfad: Die Quelle wählt das Programm über die Auswahl des Systems (ws_einlesen_quelle) und gibt nur eine
// zufällige Kennung zurück; geprüft, kopiert und hochgeladen wird von der eigenen Werkstatt (Datenbank 0058). Projekt-Code wird nie ausgeführt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileArchive, FolderOpen, Info, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { supabase } from "../supabase";
import { isDesktop, tauri } from "../desktop";
import { btn, card, fehler, ghost, input, oeffneExtern, useEscape, useFokusfalle } from "../bausteine/grund";
import { Fehlerzustand, Laden } from "../bausteine/zustand";
import { TECHNIK } from "../ProjektArten";

const SCHRITTE = ["Quelle", "Prüfung", "Einordnen", "Repository", "Gruppen & Features", "Fertig"];
const ZIEL_NAMEN = { code: "Code", "code+doku": "Code + Doku", konzept: "Konzept", doku: "Doku", material: "Material", weglassen: "Weglassen" };
const MB = 1024 * 1024;
const kennungAus = (t) => String(t || "").replace(/\.zip$/i, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const nameAus = (t) => String(t || "").replace(/\.zip$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).slice(0, 80);
const ACTIONS_TEXT = "GitHub Actions ist aus. Einschalten erst nach der Aufgabe ‚Prüfungen und Regelwerk ergänzen‘.";
/** Abläufe aus dem eingelesenen Projekt (laufen nicht, solange GitHub Actions aus ist). */
function Ablaeufe({ liste }) {
  if (!liste?.length) return <p className="text-xs text-slate-500">Im eingelesenen Code liegen keine GitHub-Abläufe (.github/workflows).</p>;
  return (<div className="text-xs"><p className="text-slate-500">Diese Abläufe aus dem eingelesenen Projekt laufen erst, wenn du GitHub Actions einschaltest – vorher ansehen:</p>
    <ul className="font-mono mt-1">{liste.map((w) => <li key={w}>{w}</li>)}</ul></div>);
}
const kennungOk = (id) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(id) && id !== "regeln" && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(id);

function Zeile({ ok, was, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
      <span className="flex items-center gap-2 font-semibold">{ok ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" /> : <TriangleAlert className="w-4 h-4 text-orange-600" aria-hidden="true" />}{was}<span className="sr-only">{ok ? ": in Ordnung" : ": Hinweis"}</span></span>
      <span className="text-slate-600 dark:text-slate-300 text-right">{children}</span>
    </div>);
}
const Hinweis = ({ art = "gruen", children }) => (
  <div className={`rounded-xl border p-3 text-sm leading-relaxed ${art === "orange" ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" : art === "rot" ? "border-red-400 bg-red-50 dark:bg-red-950/30" : "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"}`}>{children}</div>);

export default function ProjektEinlesen({ projekte = [], toast, onClose, onFertig }) {
  const fokusfalle = useFokusfalle();
  useEscape(onClose);
  const [schritt, setSchritt] = useState(1);
  const [quelle, setQuelle] = useState(null);            // { quelle, art, name, kurz }
  const [vid, setVid] = useState(null); const [v, setV] = useState(null); const [ladeFehler, setLadeFehler] = useState(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [kennung, setKennung] = useState(""); const [art, setArt] = useState("web");
  const [zuordnung, setZuordnung] = useState({}); const [personen, setPersonen] = useState([]); const [wissen, setWissen] = useState(true);
  const [ziel, setZiel] = useState(null);                // Kurzform des Zielordners nach der Prüfung
  const [haken, setHaken] = useState({});                // "g:0" / "f:0:1" → bool
  const [projektId, setProjektId] = useState(null);
  const id = kennung || kennungAus(name);
  const desk = isDesktop();

  // Laufenden Vorgang dieses Admins wieder aufnehmen (z. B. nach versehentlichem Schließen)
  useEffect(() => {
    let aus = false;
    supabase.from("ws_einlesen").select("id, stand, projekt_id, quelle_name").not("stand", "in", "(fertig,abgebrochen)").order("id", { ascending: false }).limit(1)
      .then(({ data }) => { const x = data?.[0]; if (aus || !x) return; setVid(x.id); setProjektId(x.projekt_id); setQuelle({ name: x.quelle_name });
        setSchritt(x.projekt_id ? 5 : 2); });
    return () => { aus = true; };
  }, []);
  const holen = useCallback(async () => {
    if (!vid) return;
    const { data, error } = await supabase.from("ws_einlesen").select("*").eq("id", vid).maybeSingle();
    if (error) { setLadeFehler(error); return; }
    setLadeFehler(null); setV(data);
  }, [vid]);
  useEffect(() => { holen(); if (!vid) return undefined; const t = setInterval(holen, 2500); return () => clearInterval(t); }, [holen, vid]);
  const b = v?.bericht;
  // Vorschläge aus der Prüfung übernehmen (einmal)
  useEffect(() => {
    if (!b) return;
    setArt((a) => (a === "web" && b.art ? b.art : a));
    setName((n) => n || nameAus(v.quelle_name)); setKennung((k) => k || kennungAus(v.quelle_name));
  }, [b, v?.quelle_name]);
  useEffect(() => {
    const g = v?.vorschlag?.gruppen; if (!g) return;
    setHaken((h) => (Object.keys(h).length ? h : Object.fromEntries(g.flatMap((x, i) => [[`g:${i}`, true], ...(x.features || []).map((_, j) => [`f:${i}:${j}`, true])]))));
  }, [v?.vorschlag]);

  const waehlen = async (a) => {
    setBusy(true);
    try {
      const q = await tauri("ws_einlesen_quelle", { art: a });
      if (q) { setQuelle(q); setName(nameAus(q.name)); setKennung(kennungAus(q.name)); }
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const pruefenStarten = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("ws_einlesen_anfordern", { p_quelle: quelle.quelle, p_art: quelle.art, p_name: quelle.name });
      if (error) throw error;
      setVid(data); setV(null); setSchritt(2);
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const abbrechen = async () => {
    if (vid && (!v || ["pruefen", "pruefung", "geprueft", "fehler"].includes(v.stand))) await supabase.rpc("ws_einlesen_abbrechen", { p_id: vid });
    onClose();
  };
  const neuWaehlen = async () => { if (vid) await supabase.rpc("ws_einlesen_abbrechen", { p_id: vid }); setVid(null); setV(null); setQuelle(null); setSchritt(1); };
  const idFrei = !projekte.some((p) => p.id === id);
  const einordnenOk = !!name.trim() && kennungOk(id) && idFrei;
  const zielPruefen = async () => {
    setBusy(true);
    try { setZiel(await tauri("ws_einlesen_ziel", { projekt: id, anlegen: false })); setSchritt(4); }
    catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const einlesen = async () => {
    setBusy(true);
    try {
      await tauri("ws_einlesen_ziel", { projekt: id, anlegen: false });   // noch einmal: Zielordner darf es nicht geben
      const r1 = await supabase.rpc("ws_projekt_anlegen", { p_id: id, p_name: name.trim(), p_beschreibung: "", p_repo: "", p_symbol: "layers" });
      if (r1.error) throw r1.error;
      const r2 = await supabase.rpc("ws_projekt_technik", { p_projekt: id, p_art: art, p_datenbank: "keine" });
      if (r2.error) toast(`Art nicht gespeichert: ${fehler(r2.error)}`);
      try { await tauri("ws_einlesen_ziel", { projekt: id, anlegen: true }); }
      catch (e) { throw new Error(`Projekt „${name.trim()}“ ist angelegt, aber der Projektordner nicht: ${fehler(e)} – Projekt unter „Projekte verwalten“ löschen und neu einlesen`); }
      const r3 = await supabase.rpc("ws_einlesen_starten", { p_id: vid, p_projekt: id, p_auswahl: { zuordnung, personen, wissen } });
      if (r3.error) throw r3.error;
      setProjektId(id); setSchritt(5);
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const uebernehmen = async (alle = true) => {
    setBusy(true);
    try {
      const gruppen = !alle ? [] : (v?.vorschlag?.gruppen || []).map((g, i) => (haken[`g:${i}`] ? { name: g.name, features: (g.features || []).filter((_, j) => haken[`f:${i}:${j}`]) } : null)).filter(Boolean);
      const { error } = await supabase.rpc("ws_einlesen_uebernehmen", { p_id: vid, p_gruppen: { gruppen } });
      if (error) throw error;
      await holen(); setSchritt(6);
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };

  const zeilen = useMemo(() => !b ? [] : [
    { was: "Größe", ok: true, text: `${b.dateien} Dateien · ${Math.max(1, Math.round(b.groesse / MB))} MB` },
    { was: "Technik erkannt", ok: !b.technik.includes("unbekannt"), text: b.technik.join(" · ") },
    { was: "Gefährliche Dateien", ok: !b.gefaehrlich.length && !b.links.length, text: b.gefaehrlich.length || b.links.length ? `${b.gefaehrlich.length} Programm(e)/Verknüpfung(en), ${b.links.length} Verknüpfung(en) – werden nicht übernommen` : "keine (keine Programme, keine Verknüpfungen nach außen)" },
    { was: "Geheimnisse", ok: !b.geheim.length, text: b.geheim.length ? `${b.geheim.length} Datei(en) mit ${b.geheim.reduce((s, g) => s + (g.anzahl || 0), 0)} Schlüssel(n)` : "keine gefunden" },
    { was: "Personendaten", ok: !b.personen.length, text: b.personen.length ? `${b.personen.length} Datei(en) mit Hinweisen` : "keine Hinweise gefunden" },
    { was: "Vorhandene Git-Geschichte", ok: true, text: b.git ? "wird nicht übernommen – es entsteht ein frischer erster Stand" : "keine – es entsteht ein frischer erster Stand" },
  ], [b]);
  const zielVon = (e) => zuordnung[e.name] || e.ziel;
  const baum = useMemo(() => {
    if (!b) return "";
    const t = (z) => b.einheiten.filter((e) => zielVon(e) === z || (z !== "konzept" && zielVon(e) === "code+doku" && (z === "code" || z === "doku"))).map((e) => e.name + (e.ordner ? "/" : "")).slice(0, 6).join(", ");
    const tr = ziel?.includes("\\") ? "\\" : "/";
    return `${ziel || id}${tr}\n ├─ code${tr}          ${t("code") || "–"}\n ├─ konzept${tr}eingelesen  ${t("konzept") || "–"}\n ├─ doku${tr}eingelesen     ${t("doku") || "–"}\n ├─ material${tr}      ${t("material") || "–"}\n ├─ regeln${tr}        REGELN.md (neu, aus der Vorlage${b.regeln.length ? ` + Vorschlag aus ${b.regeln.join(", ")}` : ""})\n ├─ sicherungen${tr}\n └─ setup${tr}`;
  }, [b, zuordnung, ziel, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const repoName = `kresak-it-solutions/${projektId || id}`;
  const weiterOk = schritt === 1 ? !!quelle?.quelle : schritt === 2 ? v?.stand === "geprueft" : schritt === 3 ? einordnenOk : false;
  const weiter = () => (schritt === 1 ? pruefenStarten() : schritt === 2 ? setSchritt(3) : schritt === 3 ? zielPruefen() : null);
  const datum = new Date().toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={fokusfalle} role="dialog" aria-modal="true" aria-label="Bestehendes Projekt einlesen" className={`${card} w-full max-w-3xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto`}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display font-bold text-xl flex-1">Bestehendes Projekt einlesen</h3>
          <ol className="flex flex-wrap gap-1.5" aria-label="Schritte">
            {SCHRITTE.map((t, i) => (
              <li key={t} aria-current={schritt === i + 1 ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${schritt === i + 1 ? "border-emerald-700 bg-emerald-700 text-white" : schritt > i + 1 ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                {schritt > i + 1 ? <Check className="w-3 h-3" aria-hidden="true" /> : <span>{i + 1}</span>}{t}</li>))}
          </ol>
        </div>

        {!desk && <Hinweis art="orange">Einlesen geht nur im Programm Codeschmiede – dort wählst du den Ordner oder die ZIP-Datei, und deine Werkstatt prüft und kopiert sie auf diesem PC.</Hinweis>}

        {schritt === 1 && desk && (<>
          <h4 className="font-display font-bold text-lg">Woher kommt das Projekt?</h4>
          <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center gap-3 text-center text-slate-500">
            <FolderOpen className="w-8 h-8" aria-hidden="true" />
            <span>Ordner oder ZIP-Datei auswählen</span>
            <div className="flex flex-wrap gap-2 justify-center">
              <button type="button" className={ghost} disabled={busy} onClick={() => waehlen("ordner")}><FolderOpen className="w-4 h-4" />Ordner wählen …</button>
              <button type="button" className={ghost} disabled={busy} onClick={() => waehlen("zip")}><FileArchive className="w-4 h-4" />ZIP wählen …</button>
            </div>
          </div>
          {quelle?.quelle && <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-500">Gewählt</span><span className="font-mono text-xs break-all">{quelle.kurz}</span></div>}
          <Hinweis>Kommt das Projekt aus einem anderen Claude-Chat: Lass es dir dort als ZIP geben, lade es herunter und wähle es hier aus. Entpacken musst du es nicht.</Hinweis>
          <p className="text-xs text-slate-500 flex gap-1.5"><Info className="w-4 h-4 shrink-0" aria-hidden="true" />Die Codeschmiede liest nur – sie führt nichts aus (kein npm install, keine Skripte) und verändert dein Original nicht.</p>
        </>)}

        {schritt === 2 && (<>
          <h4 className="font-display font-bold text-lg">Prüfung{quelle?.name ? <span className="font-normal text-sm text-slate-500"> · {quelle.name}</span> : null}</h4>
          {ladeFehler ? <Fehlerzustand titel="Stand des Einlesens nicht lesbar" fehler={ladeFehler} onErneut={holen} />
            : !v || ["pruefen", "pruefung"].includes(v.stand) ? <><Laden zeilen={4} text="Deine Werkstatt prüft die Quelle" /><p className="text-sm text-slate-500">Deine Werkstatt prüft die Quelle (nur lesen). Läuft sie nicht, oben „Werkstatt an“ einschalten.</p></>
            : v.stand === "fehler" ? <><Fehlerzustand titel="Die Prüfung hat nicht geklappt" fehler={{ message: v.hinweis }} /><button type="button" className={`${ghost} self-start`} onClick={neuWaehlen}>Andere Quelle wählen</button></>
            : b && (<>
              <div>{zeilen.map((z) => <Zeile key={z.was} ok={z.ok} was={z.was}>{z.text}</Zeile>)}</div>
              {b.geheim.length > 0 && <Hinweis art="orange">
                <p className="font-semibold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" aria-hidden="true" />Diese Dateien werden nicht übernommen:</p>
                <ul className="mt-1 font-mono text-xs">{b.geheim.slice(0, 20).map((g) => <li key={g.pfad}>{g.pfad} – {g.anzahl ? `${g.anzahl} Schlüssel` : g.grund || "Schlüssel-Datei"}</li>)}</ul>
                <p className="mt-1">Die Schlüssel kommen weder ins Repository noch in die Codeschmiede und gehen nicht an die KI. Du trägst sie später selbst bei GitHub bzw. Cloudflare ein; die Codeschmiede zeigt dir, wo.</p></Hinweis>}
              {(b.gefaehrlich.length > 0 || b.links.length > 0) && <Hinweis art="orange">
                <p className="font-semibold">Programme und Verknüpfungen bleiben draußen:</p>
                <ul className="mt-1 font-mono text-xs">{[...b.gefaehrlich.map((g) => `${g.pfad} (${g.grund})`), ...b.links].slice(0, 20).map((t) => <li key={t}>{t}</li>)}</ul></Hinweis>}
              {b.personen.length > 0 && <fieldset className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm flex flex-col gap-1.5">
                <legend className="px-1 font-semibold">Mögliche Personendaten – bleiben draußen, außer du hakst sie an</legend>
                {b.personen.map((p) => <label key={p.pfad} className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-emerald-700" checked={personen.includes(p.pfad)} onChange={(e) => setPersonen((l) => (e.target.checked ? [...l, p.pfad] : l.filter((x) => x !== p.pfad)))} />
                  <span><span className="font-mono text-xs">{p.pfad}</span><span className="block text-xs text-slate-500">{p.spalten?.length ? `Spalten: ${p.spalten.join(", ")}` : p.grund}</span></span></label>)}
                <p className="text-xs text-slate-500">Mitglieder-, Kunden- oder Kinderdaten gehören nicht in die Codeschmiede und nicht ins Repository.</p>
              </fieldset>}
              {Object.keys(b.ausgeschlossen || {}).length > 0 && <p className="text-xs text-slate-500">Nicht übernommen (Bau- und Zwischenstände): {Object.entries(b.ausgeschlossen).map(([k, n]) => `${k} (${n})`).join(", ")}.</p>}
            </>)}
        </>)}

        {schritt === 3 && b && (<>
          <h4 className="font-display font-bold text-lg">Einordnen</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-slate-500">Projektname<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-sm text-slate-500">Kennung<input className={`${input} font-mono`} value={id} onChange={(e) => setKennung(e.target.value)} />
              {!kennungOk(id) ? <span className="text-xs text-red-700">2–40 Zeichen: a–z, 0–9, „-“</span> : !idFrei ? <span className="text-xs text-red-700">Diese Kennung gibt es schon</span> : null}</label>
            <label className="flex flex-col gap-1 text-sm text-slate-500">Art<select className={input} value={art} onChange={(e) => setArt(e.target.value)}>{Object.entries(TECHNIK).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select></label>
          </div>
          <p className="text-sm text-slate-500">So wird der Inhalt sortiert (Vorschlag, jede Zeile änderbar). Kopiert wird, nie verschoben – dein Original bleibt unverändert.</p>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
            {b.einheiten.map((e) => (
              <div key={e.name} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                <span className="font-mono text-xs flex-1 min-w-0 break-all">{e.name}{e.ordner ? "/" : ""}</span>
                <span className="text-xs text-slate-500">{e.dateien} Datei(en)</span>
                <select aria-label={`Ziel für ${e.name}`} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-sm" value={zielVon(e)}
                  onChange={(x) => setZuordnung((z) => ({ ...z, [e.name]: x.target.value }))}>{Object.entries(ZIEL_NAMEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              </div>))}
          </div>
          <pre className="font-mono text-xs leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 overflow-x-auto">{baum}</pre>
          {b.regeln.length > 0 && <Hinweis>Im Projekt steht {b.regeln.join(" und ")} – sie wird als Projektregeln vorgeschlagen (in regeln/REGELN.md). Gültig wird sie erst nach deiner Bestätigung unter „Anbindungen“.</Hinweis>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-emerald-700" checked={wissen} onChange={(e) => setWissen(e.target.checked)} />
            <span>Konzept-Dateien (Markdown, Text) ins Wissen übernehmen<span className="block text-xs text-slate-500">Gekennzeichnet als „eingelesen, ungeprüft“ – du kannst Einträge in der Gruppe „Konzept“ jederzeit löschen.</span></span></label>
        </>)}

        {schritt === 4 && (<>
          <h4 className="font-display font-bold text-lg">Repository</h4>
          <div>
            <Zeile ok was="Neu anlegen"><span className="font-mono text-xs">{repoName} · privat</span></Zeile>
            <Zeile ok was="Erster Stand">„Projekt eingelesen am {datum}“ auf main, danach Zweig live</Zeile>
            <Zeile ok was="Prüfungen und Regelwerk">werden als eigene Aufgabe ergänzt, nicht ungefragt eingebaut</Zeile>
            <Zeile ok was="GitHub Actions">aus – wird vor dem ersten Hochladen abgeschaltet, damit kein Ablauf aus dem Projekt läuft</Zeile>
            <Zeile ok was="Testseite">per Knopf wie bei neuen Projekten (Cloudflare, kostenlos)</Zeile>
            <Zeile ok was="Datenbank">erst einmal keine, per Knopf nachholbar</Zeile>
            <Zeile ok was="Projektordner"><span className="font-mono text-xs">{ziel}</span></Zeile>
          </div>
          <Hinweis art="orange">{ACTIONS_TEXT}</Hinweis>
          <Ablaeufe liste={b?.workflows} />
          <p className="text-xs text-slate-500 flex gap-1.5"><Info className="w-4 h-4 shrink-0" aria-hidden="true" />Deine Werkstatt legt das Repository mit deiner GitHub-Anmeldung an. Vor dem Hochladen prüft sie den Code noch einmal auf Geheimnisse – findet sie etwas, bricht sie ab.</p>
        </>)}

        {schritt === 5 && (<>
          <h4 className="font-display font-bold text-lg">Gruppen & Features</h4>
          {!v ? <Laden zeilen={3} text="Stand wird geladen" />
            : ["einlesen", "einlesen_laeuft"].includes(v.stand) ? <div className="flex flex-col gap-2"><p className="text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />{v.schritt || "Wartet auf deine Werkstatt"}</p><Laden zeilen={3} text="Einlesen läuft" /></div>
            : v.stand === "fehler" ? <Fehlerzustand titel="Einlesen abgebrochen" fehler={{ message: v.hinweis }} />
            : ["wartet_ki", "ki_laeuft"].includes(v.stand) ? (<>
              <Hinweis art="orange">{v.stand === "ki_laeuft" ? "Die KI ordnet gerade ein …" : `Die eingestellte KI (Zuständigkeit „Konzept“) ist gerade nicht verfügbar: ${v.hinweis || "wartet"}. Die Werkstatt versucht es alle 5 Minuten wieder.`}</Hinweis>
              <button type="button" className={`${ghost} self-start`} disabled={busy} onClick={() => uebernehmen(false)}>Ohne Gruppen abschließen</button></>)
            : v.stand === "vorschlag" ? (<>
              <p className="text-sm text-slate-500">Die eingestellte KI hat nur die Struktur des Codes gelesen (Seiten, Menü, Dateinamen) – keine Daten – und schlägt diesen Aufbau vor. Übernommen wird nur, was angehakt ist.</p>
              {!(v.vorschlag?.gruppen || []).length && <p className="text-sm">Kein Vorschlag – du legst Gruppen später selbst an.</p>}
              <div className="flex flex-col gap-2">
                {(v.vorschlag?.gruppen || []).map((g, i) => (
                  <div key={g.name + i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
                    <label className="flex items-center gap-2 font-semibold text-sm"><input type="checkbox" className="accent-emerald-700" checked={!!haken[`g:${i}`]} onChange={(e) => setHaken((h) => ({ ...h, [`g:${i}`]: e.target.checked }))} />{g.name}</label>
                    <div className="pl-6 mt-1 flex flex-col gap-0.5">{(g.features || []).map((f, j) => (
                      <label key={f.name + j} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-emerald-700" disabled={!haken[`g:${i}`]} checked={!!haken[`f:${i}:${j}`]} onChange={(e) => setHaken((h) => ({ ...h, [`f:${i}:${j}`]: e.target.checked }))} />
                        <span>{f.name}{f.beschreibung && <span className="text-slate-500"> · {f.beschreibung}</span>}</span></label>))}</div>
                  </div>))}
              </div>
              <Hinweis>Die Gruppe „Konzept“ legt die Codeschmiede wie bei jedem Projekt dazu; die Dateien aus konzept/ landen im Wissen.</Hinweis>
            </>) : null}
        </>)}

        {schritt === 6 && (<>
          <h4 className="font-display font-bold text-lg">Fertig</h4>
          <Hinweis><b>{name || v?.quelle_name} ist eingelesen.</b> Projektordner, privates Repository und Gruppen stehen bereit. Dein Original ist unverändert.</Hinweis>
          <div className="text-sm">
            <p className="font-semibold mb-1">Noch zu tun</p>
            <ul className="flex flex-col gap-1.5 list-disc pl-5">
              <li>REGELN.md bestätigen: unter „Anbindungen“ › „REGELN.md geändert – bestätigen“ (bis dahin gelten nur die Sicherheitsregeln und das Regelwerk).</li>
              {(b?.geheim?.length || 0) > 0 && <li>Schlüssel selbst eintragen (die Codeschmiede hat sie nicht übernommen):{" "}
                <button type="button" className="underline inline-flex items-center gap-1" onClick={() => oeffneExtern(`https://github.com/${repoName}/settings/environments`)}>GitHub › Environments<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></button>{" · "}
                <button type="button" className="underline inline-flex items-center gap-1" onClick={() => oeffneExtern("https://dash.cloudflare.com/?to=/:account/pages")}>Cloudflare › Pages › Einstellungen › Variablen<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></button></li>}
              {(art === "web" || art === "handy") && <li>Testseite einrichten: „Anbindungen“ › „Testseite einrichten“ (Cloudflare, kostenlos).</li>}
              <li>Aufgabe „Prüfungen und Regelwerk ergänzen“ ansehen (Menü „Aufgaben“) und bei Bedarf als Auftrag geben.</li>
              <li>{ACTIONS_TEXT} Danach bei GitHub einschalten:{" "}
                <button type="button" className="underline inline-flex items-center gap-1" onClick={() => oeffneExtern(`https://github.com/${repoName}/settings/actions`)}>Settings › Actions<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></button>
                <div className="mt-1"><Ablaeufe liste={b?.workflows} /></div></li>
            </ul>
          </div>
        </>)}

        <div className="flex justify-between gap-2">
          {schritt <= 3 ? <button type="button" className={ghost} onClick={() => (schritt === 1 ? abbrechen() : schritt === 2 ? abbrechen() : setSchritt(schritt - 1))}>{schritt <= 2 ? "Abbrechen" : <><ArrowLeft className="w-4 h-4" />Zurück</>}</button>
            : schritt === 4 ? <button type="button" className={ghost} onClick={() => setSchritt(3)}><ArrowLeft className="w-4 h-4" />Zurück</button>
            : <button type="button" className={ghost} onClick={onClose}>Schließen</button>}
          {schritt <= 3 ? <button type="button" className={btn} disabled={!desk || !weiterOk || busy} onClick={weiter}>{busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" />}Weiter<ArrowRight className="w-4 h-4" /></button>
            : schritt === 4 ? <button type="button" className={btn} disabled={busy || !einordnenOk} onClick={einlesen}>{busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" />}Einlesen</button>
            : schritt === 5 ? <button type="button" className={btn} disabled={busy || v?.stand !== "vorschlag"} onClick={() => uebernehmen(true)}>{busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" />}Übernehmen<ArrowRight className="w-4 h-4" /></button>
            : <button type="button" className={btn} onClick={() => { onFertig(projektId || id); onClose(); }}>Zum Projekt</button>}
        </div>
      </div>
    </div>);
}

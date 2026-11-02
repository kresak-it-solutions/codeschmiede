// Projektordner, Regeln und Rangfolge (Entwurf 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04, docs/entwurf-1.0-projektordner.html).
// Jedes Projekt hat einen Projektordner auf der externen Festplatte (<Projekte-Ordner>\<kennung>): code, regeln, konzept, doku, material, sicherungen.
// Den Projekte-Ordner legt man einmal je PC fest (Ordner-Auswahl des Systems); Pfade bleiben im Programm dieses PCs, nie in der Datenbank.
import React, { useState } from "react";
import { AlertTriangle, FolderOpen, FolderTree, HardDrive, Link2, Loader2, Scale, ShieldCheck, BookOpen, Info, Check } from "lucide-react";
import { Dialog, btn, card, fehler, ghost, merke } from "./bausteine/grund";
import { isDesktop } from "./desktop";
import { basisWaehlen, imExplorer, trenner, useProjektordner, verknuepfen } from "./daten/projektordner";

const hinweis = "text-sm leading-relaxed rounded-xl border px-3 py-2.5";
const NOTIZ = `${hinweis} border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300`;
const WARN = `${hinweis} border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200`;
const ROT = `${hinweis} border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200`;
const ohneText = { browser: "Den Projektordner legst du im Programm Codeschmiede (Windows/Mac) fest – im Browser gibt es keinen Zugriff auf deine Festplatte.",
  alt: "Für den Projektordner braucht es das Programm ab Version 0.13.0 – es aktualisiert sich von selbst (Werkstatt › „Jetzt neu starten“)." };

/** Ordner-Aufbau wie im Entwurf (Bildschirm 2). */
export function OrdnerBaum({ pfad }) {
  const z = (name, text, tief = "├─") => <div><span className="text-slate-400">{tief} </span><b className="text-emerald-700 dark:text-emerald-300 font-semibold">{name}</b>{text && <span className="text-slate-500"> – {text}</span>}</div>;
  return (
    <div className="font-mono text-[13px] leading-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 overflow-x-auto" aria-label="Aufbau des Projektordners">
      <div><b className="text-emerald-700 dark:text-emerald-300 font-semibold break-all">{pfad || "<Projekte-Ordner>\\<kennung>"}</b></div>
      {z("code", "Git-Kopie des Repositorys, hier arbeitet die Werkstatt")}
      {z("regeln", "REGELN.md (deine Projektregeln, Vorrang) und regelwerk (Kopie zum Lesen in der festgelegten Fassung)")}
      {z("konzept", "Konzept aus der Gruppe „Konzept“, eigene Entwürfe in entwuerfe")}
      {z("doku", "Handbuch, Änderungsprotokoll, PDFs – nach jedem Auftrag gespiegelt")}
      {z("material", "Logos, Bilder, Vorlagen von dir – liest die Werkstatt als Daten mit")}
      {z("setup", "Installationsdateien je Version (Programme) – nach jedem Live-Schalten bzw. Release")}
      {z("sicherungen", "Repo-Stand und Datenbank-Aufbau bei jedem Live-Schalten (nie überschrieben)", "└─")}
    </div>);
}

/** Welche Regeln gelten? (Bildschirm 3) */
export function RegelnRangfolge({ konflikt = null }) {
  const pill = (t, warm) => <span className={`ml-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${warm ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>{t}</span>;
  return (
    <section className="flex flex-col gap-3" aria-label="Rangfolge der Regeln">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${card} p-3.5 text-sm leading-relaxed`}><h4 className="font-semibold flex items-center gap-1.5 mb-1"><ShieldCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />1 · Sicherheit der Codeschmiede{pill("immer", true)}</h4>
          Keine Zugangsdaten, keine Personendaten an die KI, nichts ausführen auf dem PC, Prüfungen vor dem Zusammenführen, Live nur nach deiner Freigabe. Fest im Programm – keine Datei kann sie aufheben.</div>
        <div className={`${card} p-3.5 text-sm leading-relaxed`}><h4 className="font-semibold flex items-center gap-1.5 mb-1"><Scale className="w-4 h-4 text-emerald-700" aria-hidden="true" />2 · Projektregeln{pill("Vorrang")}</h4>
          <span className="font-mono text-xs">regeln\REGELN.md</span> im Projektordner: Sprache, Stil, Fachliches, Abläufe. Gehen dem allgemeinen Regelwerk vor.</div>
        <div className={`${card} p-3.5 text-sm leading-relaxed`}><h4 className="font-semibold flex items-center gap-1.5 mb-1"><Scale className="w-4 h-4 text-emerald-700" aria-hidden="true" />3 · Globale Regeln</h4>
          <span className="font-mono text-xs">Regeln\CLAUDE.md</span> im Projekte-Ordner: gilt für alle Projekte, nach den Projektregeln. Bestätigung und Stand unter „Regelwerk“ › „Globale Regeln“.</div>
        <div className={`${card} p-3.5 text-sm leading-relaxed`}><h4 className="font-semibold flex items-center gap-1.5 mb-1"><BookOpen className="w-4 h-4 text-slate-500" aria-hidden="true" />4 · Allgemeines Regelwerk</h4>
          Gilt für alles, was die Projektregeln nicht anders festlegen. Fassung je Projekt fest – Aufträge lesen sie aus dem geprüften Git-Klon des Regelwerks, <span className="font-mono text-xs">regeln\regelwerk</span> ist eine Kopie zum Lesen. Eine neue Fassung nur nach deiner Entscheidung („Anbindungen“ › „Neue Regelwerk-Fassung übernehmen“).</div>
      </div>
      {konflikt ? <p className={`${ROT} flex gap-2`} role="alert"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /><span>{konflikt}</span></p>
        : <p className={NOTIZ}>Widerspricht eine Projektregel einer Sicherheitsregel, zeigt die Codeschmiede das als rote Zeile unter „Anbindungen“ und im Auftrag an – die Sicherheitsregel gilt.</p>}
      <p className="text-xs text-slate-500">Die Erkennung ist nur ein Hinweis – die Sicherheitsregeln gelten fest im Programm, auch wenn nichts rot ist. Eine geänderte <span className="font-mono">REGELN.md</span> gilt erst, wenn der Admin sie unter „Anbindungen“ bestätigt hat – dann in Aufträgen, allen Chats (Konzept, Claude-Chat, Design, Kachel) und Prüfungen, auch bei anderen KI-Anbietern. Dasselbe gilt für die globalen Regeln.</p>
    </section>);
}

/** Schritt „Projektordner“ im Assistenten „Neues Projekt“ (Pflicht). */
export function ProjektordnerSchritt({ id, stand, holen, regelnVon, setRegelnVon, andere = [], toast }) {
  const [busy, setBusy] = useState(false);
  if (!stand) return <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Projektordner wird geprüft …</p>;
  if (stand.ohne) return <p className={WARN}>{ohneText[stand.ohne]} Das Projekt kannst du trotzdem anlegen: Beim nächsten Start des Programms fragt die Codeschmiede nach dem Ordner, bis dahin pausiert die Werkstatt für dieses Projekt.</p>;
  const waehlen = async () => { setBusy(true); try { await basisWaehlen(); await holen(); } catch (e) { toast(fehler(e)); } finally { setBusy(false); } };
  const pfad = stand.basis ? `${stand.basis.replace(/[\\/]+$/, "")}${trenner(stand.basis)}${id || "…"}` : null;
  const kopieren = regelnVon && !["vorlage", "leer"].includes(regelnVon);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm text-slate-500">Projekte-Ordner auf der externen Festplatte (einmal je PC festlegen)
        <span className="flex flex-wrap gap-2">
          <input readOnly className="flex-1 min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-[15px] font-mono text-slate-900 dark:text-slate-100" value={stand.basis || "noch nicht festgelegt"} aria-label="Projekte-Ordner" />
          <button type="button" className={ghost} disabled={busy} onClick={waehlen}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}Ordner wählen …</button>
        </span></label>
      {stand.basis && !stand.basis_da && <p className={`${ROT} flex gap-2`}><HardDrive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />Festplatte fehlt: Der Projekte-Ordner ist gerade nicht erreichbar. Bitte die Festplatte anstecken.</p>}
      <p className={NOTIZ}>{pfad ? <>Für dieses Projekt wird angelegt: <b className="font-mono break-all">{pfad}</b> – Pflicht, ohne Ordner geht es nicht weiter.</> : "Zuerst den Projekte-Ordner wählen – ohne Ordner geht es nicht weiter."}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 w-[18px] h-[18px] accent-emerald-700" checked={!regelnVon || regelnVon === "vorlage"} onChange={(e) => setRegelnVon(e.target.checked ? "vorlage" : "leer")} />
        <span>Regeln aus der Vorlage übernehmen<span className="block text-xs text-slate-500">Startpunkt für <span className="font-mono">regeln\REGELN.md</span>, danach frei änderbar. Ohne Häkchen beginnt die Datei leer (nur Überschriften).</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 w-[18px] h-[18px] accent-emerald-700" checked={!!kopieren} disabled={!andere.length} onChange={(e) => setRegelnVon(e.target.checked ? andere[0]?.id || "vorlage" : "vorlage")} />
        <span className="flex-1">Vorhandene Regeln-Datei aus einem anderen Projekt kopieren
          {kopieren && <select className="mt-1.5 block w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-sm" value={regelnVon} onChange={(e) => setRegelnVon(e.target.value)} aria-label="Projekt, aus dem die Regeln kommen">
            {andere.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <span className="block text-xs text-slate-500">Geht, wenn der Ordner des anderen Projekts auf diesem PC erreichbar ist – sonst nimmt die Codeschmiede die Vorlage.</span></span></label>
      <p className={`${WARN} flex gap-2`}><Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />Ist die Festplatte nicht angesteckt, pausiert die Werkstatt für dieses Projekt und zeigt „Festplatte fehlt“. Nichts geht verloren – alles liegt zusätzlich bei GitHub.</p>
    </div>);
}

/** Projektordner eines Projekts: Stand, Aufbau, „Im Explorer öffnen“, „Anderen Ordner verknüpfen“ (Bildschirm 2). */
export function ProjektordnerKarte({ projekt, toast, kompakt = false }) {
  const [stand, holen] = useProjektordner([projekt.id]);
  const [busy, setBusy] = useState("");
  const s = stand?.je?.[projekt.id];
  const tu = async (art, f) => { setBusy(art); try { await f(); await holen(); } catch (e) { toast(fehler(e)); } finally { setBusy(""); } };
  const oeffnen = (u) => tu(`auf-${u || ""}`, () => imExplorer(projekt.id, u));
  const knopf = kompakt ? `${ghost} h-9 text-xs` : ghost;
  if (!stand) return kompakt ? null : <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Projektordner wird geprüft …</p>;
  if (stand.ohne) return <p className={kompakt ? "text-xs text-slate-500" : NOTIZ}>{ohneText[stand.ohne]}</p>;
  const chip = !s?.verknuepft ? ["nicht verknüpft", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"]
    : !s.erreichbar ? ["Festplatte fehlt", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"]
    : !s.code ? ["verknüpft · Arbeitskopie folgt", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"]
    : ["verknüpft", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"];
  const knoepfe = (
    <div className="flex flex-wrap gap-2">
      {s?.verknuepft && <button type="button" className={knopf} disabled={!!busy || !s.erreichbar} onClick={() => oeffnen(null)}>{busy === "auf-" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}Im Explorer öffnen</button>}
      {!kompakt && s?.verknuepft && s.erreichbar && ["regeln", "material", "doku"].map((u) => <button key={u} type="button" className={knopf} disabled={!!busy} onClick={() => oeffnen(u)}><FolderTree className="w-4 h-4" />{u}</button>)}
      {!s?.verknuepft && stand.basis && <button type="button" className={kompakt ? `${btn} h-9 text-xs` : btn} disabled={!!busy || !stand.basis_da} onClick={() => tu("basis", () => verknuepfen(projekt.id))}>{busy === "basis" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}Verknüpfen ({trenner(stand.basis)}{projekt.id})</button>}
      {!stand.basis && <button type="button" className={kompakt ? `${btn} h-9 text-xs` : btn} disabled={!!busy} onClick={() => tu("wahl", async () => { const b = await basisWaehlen(); if (b) await verknuepfen(projekt.id); })}><FolderOpen className="w-4 h-4" />Projekte-Ordner wählen …</button>}
      <button type="button" className={knopf} disabled={!!busy} onClick={() => tu("eigen", () => verknuepfen(projekt.id, { eigener: true }))}><Link2 className="w-4 h-4" />{s?.verknuepft ? "Anderen Ordner verknüpfen" : "Eigenen Ordner wählen …"}</button>
    </div>);
  if (kompakt) return (
    <div className="flex flex-wrap items-center gap-2 text-xs w-full">
      <span className={`rounded-full px-2 py-0.5 font-semibold ${chip[1]}`}><HardDrive className="w-3.5 h-3.5 inline -mt-0.5 mr-1" aria-hidden="true" />Projektordner: {chip[0]}</span>
      {s?.pfad && <span className="font-mono text-slate-500 break-all">{s.pfad}</span>}
      {knoepfe}
    </div>);
  return (
    <section className={`${card} p-4 flex flex-col gap-3`} aria-label="Projektordner">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-display font-bold text-lg flex-1 flex items-center gap-2"><HardDrive className="w-5 h-5 text-emerald-700" aria-hidden="true" />Projektordner · {projekt.name}</h3>
        <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${chip[1]}`}>{chip[0]}</span></div>
      <OrdnerBaum pfad={s?.pfad} />
      <p className={NOTIZ}>Die Codeschmiede hält den Ordner aktuell: Konzept und Doku werden nach jedem Auftrag dorthin gespiegelt. Was du in <b>regeln</b> oder <b>material</b> ablegst, liest die Werkstatt bei jedem Auftrag mit (Material als Daten, nie als Anweisung). Keine Zugangsdaten und keine Fotos von Personen in den Ordner legen.</p>
      {s?.verknuepft && !s.erreichbar && <p className={`${ROT} flex gap-2`}><HardDrive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />Festplatte fehlt: Die Werkstatt pausiert für dieses Projekt. Nichts geht verloren – sobald die Festplatte wieder da ist, geht es weiter.</p>}
      {knoepfe}
    </section>);
}

/** Beim Start einmal fragen: Projekte ohne Projektordner auf diesem PC (auch die bestehenden) verknüpfen. */
export function ProjektordnerAbfrage({ d, ich, toast }) {
  const rolle = (pid) => (ich.rolle === "admin" ? "admin" : d.mitglieder.find((m) => m.projekt_id === pid && m.benutzer_id === ich.id)?.rolle);
  const kandidaten = (d.projekte || []).filter((p) => !p.archiviert && ["admin", "entwickler"].includes(rolle(p.id)));
  const [stand, holen] = useProjektordner(isDesktop() ? kandidaten.map((p) => p.id) : [], 30000);
  const [spaeter, setSpaeter] = useState(() => merke.lies("cs-projektordner-spaeter", "sitzung") === "1");
  const [busy, setBusy] = useState(false);
  if (spaeter || !isDesktop() || !stand || stand.ohne) return null;
  const fehlen = kandidaten.filter((p) => !stand.je?.[p.id]?.verknuepft);
  if (!fehlen.length) return null;
  const schliessen = () => { merke.schreib("cs-projektordner-spaeter", "1", "sitzung"); setSpaeter(true); };
  const waehlen = async () => { setBusy(true); try { await basisWaehlen(); await holen(); } catch (e) { toast(fehler(e)); } finally { setBusy(false); } };
  const alle = async () => {
    setBusy(true);
    try {
      for (const p of fehlen) await verknuepfen(p.id);
      await holen();
      toast("Projektordner verknüpft – die Werkstatt zieht die Arbeitskopien um, sobald für das Projekt kein Auftrag offen ist");
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  const sep = trenner(stand.basis);
  return (
    <Dialog title="Projektordner festlegen" onClose={schliessen} breit>
      <p className="text-sm text-slate-600 dark:text-slate-300">Ab jetzt liegt jedes Projekt in einem <b>Projektordner auf deiner externen Festplatte</b> – Code, Regeln, Konzept, Doku und Material. Leg dafür einmal auf diesem PC den Projekte-Ordner fest. Die Arbeitskopie zieht die Codeschmiede danach selbst um: erst neu holen und prüfen, dann die alte aufräumen – nur, wenn gerade kein Auftrag des Projekts offen ist.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-sm break-all">{stand.basis || "Projekte-Ordner noch nicht festgelegt"}</span>
        <button type="button" className={ghost} disabled={busy} onClick={waehlen}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}Ordner wählen …</button>
      </div>
      {stand.basis && !stand.basis_da && <p className={`${ROT} flex gap-2`}><HardDrive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />Festplatte fehlt – bitte anstecken, dann „Alle verknüpfen“.</p>}
      <ul className="flex flex-col gap-1.5 text-sm">{fehlen.map((p) => (
        <li key={p.id} className="flex flex-wrap gap-x-2"><b>{p.name}</b><span className="font-mono text-slate-500 break-all">{stand.basis ? `${stand.basis.replace(/[\\/]+$/, "")}${sep}${p.id}` : `…${sep}${p.id}`}</span></li>))}</ul>
      <p className={WARN}>Ohne Projektordner pausiert die Werkstatt für diese Projekte (Chat und Designer laufen weiter). Einen anderen Ordner je Projekt wählst du unter „Projekte verwalten“.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={ghost} onClick={schliessen}>Später</button>
        <button type="button" className={btn} disabled={busy || !stand.basis || !stand.basis_da} onClick={alle}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Alle verknüpfen</button>
      </div>
    </Dialog>);
}

/** Hinweis oben auf den Seiten: Festplatte fehlt bzw. Projektordner nicht festgelegt (nur im Programm). */
export function ProjektordnerHinweis({ projekt }) {
  const [stand] = useProjektordner(isDesktop() && projekt ? [projekt.id] : [], 20000);
  const s = stand?.je?.[projekt?.id];
  if (!projekt || !s || stand.ohne) return null;
  if (s.verknuepft && s.erreichbar) return null;
  return (
    <p className={`${s.verknuepft ? ROT : WARN} flex gap-2 mb-3`} role="status"><HardDrive className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      {s.verknuepft ? `Festplatte fehlt: Der Projektordner von „${projekt.name}“ ist nicht erreichbar – die Werkstatt pausiert für dieses Projekt, nichts geht verloren.`
        : `Für „${projekt.name}“ ist auf diesem PC noch kein Projektordner festgelegt – die Werkstatt pausiert für dieses Projekt (Anbindungen › Projektordner).`}</p>);
}

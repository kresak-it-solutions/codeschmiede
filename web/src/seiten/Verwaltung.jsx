// Verwaltung – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, GitBranch, Loader2, Lock, Plus, Trash2, Users, X } from "lucide-react";
import { BEREICH_RECHTE, ROLLEN, WS_ICON } from "../config";
import { Dialog, btn, card, fehler, fmt, ghost, input } from "../bausteine/grund";
import { LogoZeichen } from "../Logo";
import { supabase } from "../supabase";
import { Laden } from "../bausteine/zustand";
import { ProjektordnerKarte } from "../Projektordner";

export function NeuesFeature({ g, ich, texter, toast, onClose, onFertig }) {
  const [name, setName] = useState(""); const [besch, setBesch] = useState(""); const [auftrag, setAuftrag] = useState(true); const [busy, setBusy] = useState(false);
  const los = async () => {
    if (!name.trim()) return; setBusy(true);
    const id = "N-" + Date.now();
    const { error } = await supabase.from("ws_features").insert({ id, gruppe_id: g.id, name: name.trim(), beschreibung: besch.trim() || null, stand: "geplant", quelle: "manuell", neu_bis: new Date(Date.now() + 7 * 864e5).toISOString(), erstellt_von: ich.id });
    if (error) { setBusy(false); toast(fehler(error)); return; }
    if (auftrag) {
      const t = `Neues Feature bauen: ${name.trim()}${besch.trim() ? " – " + besch.trim() : ""}`;
      const r = await supabase.from("ws_auftraege").insert({ gruppe_id: g.id, feature_id: id, titel: t.slice(0, 80), art: texter ? "text" : "neu", erstellt_von: ich.id }).select().single();
      if (!r.error) await supabase.from("ws_nachrichten").insert({ auftrag_id: r.data.id, von: ich.id, art: "text", text: t });
    }
    setBusy(false); toast(`Feature „${name.trim()}“ angelegt`); onFertig(id); onClose();
  };
  return (
    <Dialog title={`Neues Feature in ${g.name}`} onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Name<input id="ws-fname" className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Was soll das Feature können?<textarea id="ws-fdesc" className={`${input} min-h-[70px]`} value={besch} onChange={(e) => setBesch(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={auftrag} onChange={(e) => setAuftrag(e.target.checked)} className="mt-1 accent-emerald-700" />Gleich als Auftrag an die Werkstatt geben (sonst bleibt es „Geplant“)</label>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}>Abbrechen</button><button type="button" className={btn} disabled={busy || !name.trim()} onClick={los}>Anlegen</button></div>
    </Dialog>
  );
}

export function NeueGruppe({ d, ich, toast, onClose, onFertig }) {
  const [name, setName] = useState(""); const [bereich, setBereich] = useState(d.bereiche.find((b) => !b.global)?.id); const [symbol, setSymbol] = useState("layers"); const [busy, setBusy] = useState(false);
  const los = async () => {
    if (!name.trim()) return; setBusy(true);
    const slug = name.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "gruppe-" + Date.now();
    const id = `${d.projektId}-${slug}`;
    const { error } = await supabase.from("ws_gruppen").insert({ id, bereich_id: bereich, name: name.trim(), symbol, reihenfolge: 99, erstellt_von: ich.id });
    setBusy(false);
    if (error) { toast(fehler(error)); return; }
    toast(`Gruppe „${name.trim()}“ angelegt`); onFertig(id); onClose();
  };
  return (
    <Dialog title="Neue Gruppe" onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Name<input id="ws-gname" className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Bereich<select id="ws-gbereich" className={input} value={bereich} onChange={(e) => setBereich(e.target.value)}>{d.bereiche.filter((b) => !b.global).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Symbol<select id="ws-gsymbol" className={input} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{Object.keys(WS_ICON).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
      <p className="text-xs text-slate-500">Die Gruppe bekommt eine eigene Werkstatt mit Gruppenwissen in docs/gruppen/.</p>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}>Abbrechen</button><button type="button" className={btn} disabled={busy || !name.trim()} onClick={los}>Anlegen</button></div>
    </Dialog>
  );
}

export function Loeschen({ f, g, ich, toast, onClose }) {
  const [art, setArt] = useState("aus"); const [best, setBest] = useState(""); const [busy, setBusy] = useState(false);
  const einblenden = f.ausgeblendet;
  const los = async () => {
    setBusy(true);
    if (einblenden || art === "aus") {
      const { error } = await supabase.rpc("ws_feature_ausblenden", { p_feature: f.id, p_aus: !einblenden });
      toast(error ? fehler(error) : einblenden ? `„${f.name}“ wieder eingeblendet` : `„${f.name}“ ausgeblendet`);
    } else {
      const t = `Feature ausbauen: ${f.name} (Daten vorher sichern, Handbuch, PDF-Layouts und Funktionsverzeichnis bereinigen)`;
      const r = await supabase.from("ws_auftraege").insert({ gruppe_id: g.id, feature_id: f.id, titel: t.slice(0, 80), art: "ausbauen", erstellt_von: ich.id }).select().single();
      if (!r.error) await supabase.from("ws_nachrichten").insert({ auftrag_id: r.data.id, von: ich.id, art: "text", text: t });
      toast(r.error ? fehler(r.error) : `Ausbau-Auftrag #${r.data.id} gestellt`);
    }
    setBusy(false); onClose();
  };
  if (einblenden) return (
    <Dialog title={`„${f.name}“ wieder einblenden?`} onClose={onClose}>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}>Abbrechen</button><button type="button" className={btn} disabled={busy} onClick={los}>Einblenden</button></div>
    </Dialog>);
  return (
    <Dialog title={`„${f.name}“ löschen`} onClose={onClose}>
      {[["aus", "Ausblenden", "Sofort abgeschaltet. Der Code bleibt, jederzeit wieder einblendbar."], ["ausbau", "Aus der App ausbauen", "Auftrag über den ganzen Weg bis zur Freigabe. Daten werden vorher gesichert. Über die Versionen wiederherstellbar."]].map(([k, t, s]) => (
        <label key={k} className={`flex gap-3 items-start rounded-xl border p-3 cursor-pointer ${art === k ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-800"}`}>
          <input type="radio" name="ws-del" checked={art === k} onChange={() => setArt(k)} className="mt-1 accent-emerald-700" /><span><b className="block">{t}</b><span className="text-sm text-slate-500">{s}</span></span></label>))}
      <label className="flex flex-col gap-1 text-sm text-slate-500">Zur Bestätigung den Namen eintippen: {f.name}<input id="ws-delname" className={input} value={best} onChange={(e) => setBest(e.target.value)} autoComplete="off" /></label>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}>Abbrechen</button><button type="button" className={`${btn} bg-red-600 hover:bg-red-700`} disabled={busy || best.trim() !== f.name} onClick={los}>Löschen</button></div>
    </Dialog>
  );
}

// ---------------- Benutzer & Rechte ----------------
export function BenutzerRechte({ d, ich, toast }) {
  const [sel, setSel] = useState(d.benutzer.find((u) => u.id !== ich.id)?.id || ich.id);
  const [einl, setEinl] = useState(false);
  const [offen, setOffen] = useState([]);
  const admin = ich.rolle === "admin";
  const ladeEinl = useCallback(async () => { if (!admin) return; const { data } = await supabase.from("ws_einladungen").select("*").eq("projekt_id", d.projektId).is("angenommen", null).order("erstellt"); setOffen(data || []); }, [admin, d.projektId]);
  useEffect(() => { ladeEinl(); }, [ladeEinl]);
  const mitglied = (uid) => d.mitglieder.find((m) => m.projekt_id === d.projektId && m.benutzer_id === uid);
  const u = d.benutzer.find((x) => x.id === sel);
  const projRolle = u ? (u.rolle === "admin" ? "admin" : mitglied(u.id)?.rolle) : null;
  const rolleSetzen = async (uid, rolle) => {
    const { error } = await supabase.rpc("ws_mitglied_setzen", { p_projekt: d.projektId, p_benutzer: uid, p_rolle: rolle || null });
    toast(error ? fehler(error) : rolle ? `Rolle im Projekt: ${ROLLEN[rolle]}` : "Aus dem Projekt entfernt");
  };
  const setzen = async (bereich, recht, wert) => {
    const r = d.rechte.find((x) => x.benutzer_id === u.id && x.bereich_id === bereich) || { auftraege: false, freigeben: false, loeschen: false };
    const n = { ...r, [recht]: wert };
    const { error } = await supabase.rpc("ws_rechte_setzen", { p_benutzer: u.id, p_bereich: bereich, p_auftraege: !!n.auftraege, p_freigeben: !!n.freigeben, p_loeschen: !!n.loeschen });
    toast(error ? fehler(error) : `${wert ? "Recht vergeben" : "Recht entzogen"}: ${BEREICH_RECHTE[recht]} · ${d.bereiche.find((b) => b.id === bereich)?.name} · ${u.name}`);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
      <div className={card}>
        <div className="flex items-center justify-between gap-2 p-4"><span className="font-display font-semibold text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2"><Users className="w-4 h-4" />Benutzer</span>
          {admin && <button type="button" className={`${btn} h-9 text-sm`} onClick={() => setEinl(true)}><Plus className="w-4 h-4" />Benutzer einladen</button>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800"><th className="px-4 py-2">Name</th><th className="px-4 py-2">Rolle</th><th className="px-4 py-2">Claude-Konto</th><th className="px-4 py-2">Werkstatt-PC</th></tr></thead>
          <tbody>{d.benutzer.map((x) => { const pc = d.pcs.find((p) => p.benutzer_id === x.id); return (
            <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 ${sel === x.id ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>
              <td className="px-4 py-2.5">{x.name}{!x.aktiv && <span className="ml-2 text-xs text-slate-400">(deaktiviert)</span>}</td>
              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>{x.rolle === "admin" ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-700 text-white">Admin</span>
                : admin ? <select id={`cs-rolle-${x.id}`} aria-label={`Rolle von ${x.name} im Projekt`} className="text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1" value={mitglied(x.id)?.rolle || ""} onChange={(e) => rolleSetzen(x.id, e.target.value)}>
                    <option value="">kein Mitglied</option>{["entwickler", "texter", "leser"].map((r) => <option key={r} value={r}>{ROLLEN[r]}</option>)}</select>
                : <span className="text-xs">{mitglied(x.id) ? ROLLEN[mitglied(x.id).rolle] : "–"}</span>}</td>
              <td className="px-4 py-2.5">{x.claude_konto || "–"}</td><td className="px-4 py-2.5">{pc ? `${pc.name} · ${pc.an ? "an" : "aus"}` : "–"}</td></tr>); })}</tbody></table></div>
        {admin && offen.length > 0 && <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-sm"><div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Offene Einladungen</div>{offen.map((e) => <div key={e.id} className="flex gap-2"><span className="break-all">{e.email}</span><span className="text-slate-500">· {ROLLEN[e.rolle]} · {fmt(e.erstellt)}</span></div>)}</div>}
      </div>
      <div className={card}>
        <div className="p-4 font-display font-semibold text-xs uppercase tracking-widest text-slate-500">Rechte · {u?.name}</div>
        {!u ? null : !projRolle ? <p className="px-4 pb-4 text-sm text-slate-500">{u.name} ist nicht Mitglied dieses Projekts. Rolle links wählen, um ihn aufzunehmen.</p> : u.rolle === "admin" ? <p className="px-4 pb-4 text-sm text-slate-500">Der Admin darf alles: Aufträge geben, freigeben, löschen, Rechte vergeben. Rechtstexte und Datenschutz ändert nur der Admin.</p>
          : projRolle === "leser" ? <p className="px-4 pb-4 text-sm text-slate-500">Leser sehen Zentrale und Dokumentation, geben aber keine Aufträge.</p> : (
          <>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-800"><th className="text-left px-4 py-2">Bereich</th>{Object.values(BEREICH_RECHTE).map((t) => <th key={t} className="px-3 py-2">{t}</th>)}</tr></thead>
              <tbody>{d.bereiche.map((b) => { const r = d.rechte.find((x) => x.benutzer_id === u.id && x.bereich_id === b.id) || {}; return (
                <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-4 py-2">{b.name}</td>
                  {Object.keys(BEREICH_RECHTE).map((k) => <td key={k} className="text-center px-3 py-2"><input id={`ws-r-${u.id}-${b.id}-${k}`} type="checkbox" className="w-[18px] h-[18px] accent-emerald-700" aria-label={`${b.name} ${BEREICH_RECHTE[k]}`}
                    checked={!!r[k]} disabled={!admin || (projRolle === "texter" && k !== "auftraege")} onChange={(e) => setzen(b.id, k, e.target.checked)} /></td>)}</tr>); })}</tbody></table></div>
            <p className="p-4 text-xs text-slate-500">{projRolle === "texter" ? "Texter geben nur Text-Aufträge. Freigeben und Löschen ist für Texter gesperrt." : "Freigeben und Löschen vergibt nur der Admin, je Bereich. Rechtstexte und Datenschutz bleiben beim Admin."}</p>
          </>)}
      </div>
      {einl && <Einladen ich={ich} projekt={d.projektId} toast={toast} onClose={() => setEinl(false)} onFertig={ladeEinl} />}
    </div>
  );
}

export function Einladen({ ich, projekt, toast, onClose, onFertig }) {
  const [mail, setMail] = useState(""); const [rolle, setRolle] = useState("entwickler"); const [busy, setBusy] = useState(false);
  const gueltig = useMemo(() => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.trim()), [mail]);
  const los = async () => {
    setBusy(true);
    const { error } = await supabase.from("ws_einladungen").insert({ email: mail.trim().toLowerCase(), rolle, projekt_id: projekt, eingeladen_von: ich.id });
    setBusy(false);
    if (error) { toast(fehler(error)); return; }
    toast(`Einladung für ${mail.trim()} angelegt`); onFertig(); onClose();
  };
  return (
    <Dialog title="Benutzer einladen" onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm text-slate-500">E-Mail-Adresse<input id="ws-mail" type="email" className={input} value={mail} onChange={(e) => setMail(e.target.value)} autoFocus /></label>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Rolle<select id="ws-rolle" className={input} value={rolle} onChange={(e) => setRolle(e.target.value)}>{["entwickler", "texter", "leser"].map((r) => <option key={r} value={r}>{ROLLEN[r]}</option>)}</select></label>
      <p className="text-xs text-slate-500">So geht es weiter: Die Person öffnet die Codeschmiede, registriert sich mit genau dieser Adresse, bestätigt die E-Mail und nimmt die Einladung an. Entwickler brauchen zusätzlich ein eigenes Claude-Abo (Claude Code auf ihrem PC angemeldet) und Zugriff auf das GitHub-Repository des Projekts.</p>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}><X className="w-4 h-4" />Abbrechen</button><button type="button" className={btn} disabled={busy || !gueltig} onClick={los}>Einladung anlegen</button></div>
    </Dialog>
  );
}

// ---------------- Projekte verwalten (Hinweis Gerhard 2026-10-23 15:34): archivieren / wiederherstellen / endgültig löschen ----------------
// Nur Admin. Löschen entfernt die Daten des Projekts in der Codeschmiede (nicht das GitHub-Repository, nicht die App) – Bestätigung mit dem Namen.
export function ProjekteVerwalten({ toast, aktiv, onClose, onWeg }) {
  const [liste, setListe] = useState(null); const [weg, setWeg] = useState(null); const [umfang, setUmfang] = useState(null);
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => {
    const holen = () => supabase.from("ws_projekte").select("id, name, repo, archiviert, logo, repo_stand, repo_hinweis, repo_privat, repo_aktion").order("name").then(({ data }) => setListe(data || []));
    holen(); const t = setInterval(holen, 8000); return () => clearInterval(t);   // Stand des Repository-Auftrags live sehen
  }, [tick]);
  const repoAnlegen = async (p, privat) => { const { error } = await supabase.rpc("ws_repo_anfordern", { p_projekt: p.id, p_privat: privat }); if (error) toast(fehler(error)); else { toast("Deine Werkstatt legt das GitHub-Repository an"); setTick((t) => t + 1); } };
  const [oeffnen, setOeffnen] = useState(null); const [bestaetigt, setBestaetigt] = useState("");   // Öffentlich machen nur mit Eintippen (Prüfung M4)
  const sichtbar = async (p, privat) => {
    if (!privat && oeffnen?.id !== p.id) { setOeffnen(p); setBestaetigt(""); return; }
    setOeffnen(null); const { error } = await supabase.rpc("ws_repo_sichtbarkeit", { p_projekt: p.id, p_privat: privat }); if (error) toast(fehler(error)); else { toast(privat ? "Wird auf privat umgestellt" : "Wird auf öffentlich umgestellt"); setTick((t) => t + 1); } };
  const archiv = async (p, aus) => {
    const { error } = await supabase.rpc("ws_projekt_archivieren", { p_projekt: p.id, p_aus: aus });
    if (error) { toast(fehler(error)); return; }
    toast(aus ? `„${p.name}“ archiviert` : `„${p.name}“ wiederhergestellt`); if (aus) onWeg(p.id); setTick((t) => t + 1);
  };
  const vorbereiten = async (p) => {
    setWeg(p); setName(""); setUmfang(null);
    const { data, error } = await supabase.rpc("ws_projekt_umfang", { p_projekt: p.id });
    if (error) { toast(fehler(error)); setWeg(null); } else setUmfang(data);
  };
  const loeschen = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("ws_projekt_loeschen", { p_projekt: weg.id, p_bestaetigung: name });
    setBusy(false);
    if (error) { toast(fehler(error)); return; }
    toast(`Projekt „${weg.name}“ gelöscht`); onWeg(weg.id); setWeg(null); setTick((t) => t + 1);
  };
  if (oeffnen) return (
    <Dialog title={`${oeffnen.repo} öffentlich machen?`} onClose={() => setOeffnen(null)}>
      <p className="text-sm">Danach kann <b>jeder</b> den ganzen Code samt Verlauf und Dokumentation (auch docs/KONZEPT.md) bei GitHub sehen. Geheimnisse dürfen ohnehin nie im Repository stehen – prüfe das trotzdem vorher.</p>
      <label className="flex flex-col gap-1 text-sm text-slate-500">Zur Bestätigung den Namen eingeben: <b className="text-slate-800 dark:text-slate-100 font-mono">{oeffnen.repo}</b>
        <input id="cs-repo-oeffentlich" className={input} value={bestaetigt} onChange={(e) => setBestaetigt(e.target.value)} autoFocus /></label>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={() => setOeffnen(null)}>Abbrechen</button>
        <button type="button" className={btn} disabled={bestaetigt.trim() !== oeffnen.repo} onClick={() => sichtbar(oeffnen, false)}>Öffentlich machen</button></div>
    </Dialog>);
  if (weg) return (
    <Dialog title={`Projekt „${weg.name}“ endgültig löschen`} onClose={() => setWeg(null)}>
      <p className="text-sm">Gelöscht werden alle Daten dieses Projekts <b>in der Codeschmiede</b>: Bereiche, Gruppen, Features, Aufträge mit Verlauf, Chats, Designer-Entwürfe, Abgleich, KI-Zuständigkeiten, Verbrauch und Mitgliedschaften.
        Das <b>GitHub-Repository</b>{weg.repo ? ` (${weg.repo})` : ""} und die App selbst bleiben unberührt. Das lässt sich nicht rückgängig machen – zum Ausblenden lieber „Archivieren“.</p>
      {umfang ? <ul className="text-sm grid grid-cols-2 gap-1 rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
        <li>{umfang.gruppen} Gruppen</li><li>{umfang.features} Features</li><li>{umfang.auftraege} Aufträge</li><li>{umfang.mitglieder} Mitglieder</li>
        {umfang.laufend > 0 && <li className="col-span-2 text-red-600 font-semibold">{umfang.laufend} Auftrag/Prüfung läuft – erst abschließen oder abbrechen.</li>}
      </ul> : <Laden zeilen={2} klein text="Umfang wird gezählt" />}
      <label className="flex flex-col gap-1 text-sm text-slate-500">Zur Bestätigung den Projektnamen eingeben: <b className="text-slate-800 dark:text-slate-100">{weg.name}</b>
        <input id="ws-projekt-loeschen" className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={() => setWeg(null)}>Abbrechen</button>
        <button type="button" className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-display font-bold tracking-wide transition" disabled={busy || name !== weg.name || !umfang || umfang.laufend > 0} onClick={loeschen}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Endgültig löschen</button></div>
    </Dialog>);
  return (
    <Dialog title="Projekte verwalten" onClose={onClose}>
      {!liste ? <Laden zeilen={4} text="Projekte werden geladen" /> : (
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {liste.map((p) => (
            <div key={p.id} className="py-2.5 flex flex-wrap items-center gap-2">
              {p.logo && <LogoZeichen werte={p.logo} groesse={28} />}
              <div className="min-w-0 flex-1"><div className="font-semibold flex items-center gap-2">{p.name}{p.id === aktiv && <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">geöffnet</span>}{p.archiviert && <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">archiviert</span>}</div>
                <div className="text-xs text-slate-500 font-mono break-all">{p.id}{p.repo ? ` · ${p.repo}` : ""}</div>
                {p.repo_stand && p.repo_stand !== "fertig" && <div className={`text-xs mt-0.5 flex items-center gap-1 ${p.repo_stand === "fehler" ? "text-red-700 dark:text-red-400" : "text-slate-500"}`}>{["angefragt", "laeuft"].includes(p.repo_stand) && <Loader2 className="w-3 h-3 animate-spin" />}GitHub: {p.repo_hinweis}</div>}</div>
              {!p.archiviert && !p.repo && !["angefragt", "laeuft"].includes(p.repo_stand) && <button type="button" className={`${ghost} h-9 text-xs`} onClick={() => repoAnlegen(p, false)}><GitBranch className="w-3.5 h-3.5" />GitHub-Repository anlegen</button>}
              {p.repo && !["angefragt", "laeuft"].includes(p.repo_stand) && (p.repo_privat == null
                ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Lock className="w-3.5 h-3.5" />Sichtbarkeit:<button type="button" className={`${ghost} h-8 text-xs`} onClick={() => sichtbar(p, false)}>Öffentlich …</button><button type="button" className={`${ghost} h-8 text-xs`} onClick={() => sichtbar(p, true)}>Privat</button></span>
                : <button type="button" className={`${ghost} h-9 text-xs`} title={`Jetzt ${p.repo_privat ? "privat" : "öffentlich"} – bei GitHub umstellen`} onClick={() => sichtbar(p, !p.repo_privat)}><Lock className="w-3.5 h-3.5" />{p.repo_privat ? "Öffentlich machen …" : "Auf privat stellen"}</button>)}
              {p.archiviert ? <button type="button" className={`${ghost} h-9 text-xs`} onClick={() => archiv(p, false)}><ArchiveRestore className="w-3.5 h-3.5" />Wiederherstellen</button>
                : <button type="button" className={`${ghost} h-9 text-xs`} onClick={() => archiv(p, true)}><Archive className="w-3.5 h-3.5" />Archivieren</button>}
              <button type="button" className={`${ghost} h-9 text-xs text-red-700 dark:text-red-400`} onClick={() => vorbereiten(p)}><Trash2 className="w-3.5 h-3.5" />Löschen …</button>
              {/* Projektordner auf diesem PC (0.13.0): Stand, im Explorer öffnen, anderen Ordner verknüpfen */}
              {!p.archiviert && <ProjektordnerKarte projekt={p} toast={toast} kompakt />}
            </div>))}
        </div>)}
      <div className="flex justify-end"><button type="button" className={ghost} onClick={onClose}>Schließen</button></div>
    </Dialog>);
}

// Neues Projekt: Assistent mit Technik-Art in ProjektArten.jsx (Entwurf 1.0, 2026-10-24)

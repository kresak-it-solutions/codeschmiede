// Phasenleiste im Kopf der Zentrale (0.19.0, Regelwerk erzwingen – Gerhard 03.11.2026): Stand 1–12, Pflichtpunkte der aktuellen Phase aus der
// Regeldatei, Knopf „Phase freigeben“ (nur Admin, Begründung optional), Kurzfassung §16 (nur Admin, Begründung Pflicht), Phasen-Vorschlag eingelesener
// Projekte bestätigen, Kernpflichten mit bestätigten Abweichungen, Entscheidungsprotokoll und Ideensammlung. Alle Änderungen über die Funktionen aus 0063.
import React, { useState } from "react";
import { BookCheck, Check, ChevronDown, ChevronUp, FileText, Lightbulb, Lock, LockOpen, ScrollText, ShieldCheck, X } from "lucide-react";
import { Dialog, btn, card, fehler, fmt, ghost, input } from "../bausteine/grund";
import { Fehlerzustand } from "../bausteine/zustand";
import { supabase } from "../supabase";
import { BAU_GESPERRT, EINWAND_ART, KERNPFLICHTEN, PHASEN, phasenStand, useRegelwerk } from "../daten/regelwerk";

const ART_TEXT = { start: "Start", bestand: "Bestand übernommen", freigabe: "Freigegeben", kurzfassung: "Kurzfassung (§16)", vorschlag: "Vorschlag (Einlesen)", eingelesen: "Eingelesen, bestätigt" };
const EINST = { klein: "klein", mittel: "mittel", gross: "groß" };

export function Phasenleiste({ projekt, ich, toast, onGeaendert }) {
  const r = useRegelwerk(projekt?.id);
  const [offen, setOffen] = useState(false); const [dlg, setDlg] = useState(null); const [tab, setTab] = useState("phasen");
  if (!projekt) return null;
  const st = phasenStand(projekt.phase_frei);
  const admin = ich.rolle === "admin";
  const aktuell = PHASEN.find((p) => p.nr === st.aktuell);
  const nachher = async () => { await r.holen(); await onGeaendert?.(); };
  const vorschlag = projekt.phase_vorschlag;
  return (
    <section className={`${card} mb-4`} aria-label="Phasen des Projekts">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">{st.bauen ? <LockOpen className="w-3.5 h-3.5 text-emerald-700" /> : <Lock className="w-3.5 h-3.5 text-amber-600" />}Phasen nach Gerhards Regelwerk</div>
          <div className="font-display font-bold text-lg">Phase {st.aktuell} – {aktuell?.name}{st.frei >= 12 ? " (alle freigegeben)" : ""}</div>
        </div>
        <ol className="flex flex-wrap gap-1" aria-label={`${st.frei} von 12 Phasen freigegeben`}>
          {PHASEN.map((p) => {
            const frei = p.nr <= st.frei; const jetzt = p.nr === st.aktuell && !frei;
            return <li key={p.nr} title={`${p.nr}. ${p.name}${frei ? " – freigegeben" : jetzt ? " – aktuell" : ""}`}
              className={`w-8 h-8 grid place-items-center rounded-lg text-xs font-bold tabular-nums ${frei ? "bg-emerald-700 text-white" : jetzt ? "ring-2 ring-emerald-600 text-emerald-800 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              {frei ? <Check className="w-4 h-4" aria-hidden="true" /> : p.nr}<span className="sr-only">{p.name}{frei ? " freigegeben" : ""}</span></li>;
          })}
        </ol>
        <span className="flex-1" />
        {!st.bauen && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{BAU_GESPERRT}</span>}
        {admin && st.frei < 12 && <button type="button" className={btn} onClick={() => setDlg({ art: "frei" })}><Check className="w-4 h-4" />Phase {st.aktuell} freigeben</button>}
        <button type="button" className={ghost} aria-expanded={offen} onClick={() => setOffen(!offen)}>{offen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}Details</button>
      </div>
      {vorschlag && <div className="mx-4 mb-3 rounded-lg border border-emerald-300 dark:border-emerald-800 p-3 flex flex-wrap items-center gap-2 text-sm" role="note">
        <BookCheck className="w-4 h-4 text-emerald-700" /><span>Vorschlag beim Einlesen: <b>Phase {vorschlag.phase} – {PHASEN.find((p) => p.nr === vorschlag.phase)?.name}</b>{vorschlag.grund ? ` · ${vorschlag.grund}` : ""}</span>
        {admin && <button type="button" className={`${btn} ml-auto h-9`} onClick={() => setDlg({ art: "vorschlag" })}>Prüfen und bestätigen</button>}</div>}
      {offen && <div className="border-t border-slate-200 dark:border-slate-800 p-4 grid gap-4">
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-sm self-start" role="tablist">
          {[["phasen", "Pflichtpunkte & Protokoll", ScrollText], ["kern", "Kernpflichten", ShieldCheck], ["entscheidungen", "Entscheidungen", FileText], ["ideen", "Ideen", Lightbulb]].map(([k, t, I]) =>
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 inline-flex items-center gap-1.5 ${tab === k ? "bg-emerald-50 text-emerald-700 font-semibold dark:bg-emerald-950" : ""}`}><I className="w-4 h-4" />{t}</button>)}
        </div>
        {r.fehler && <Fehlerzustand klein fehler={r.fehler} titel="Regelwerk-Daten nicht geladen (Datenbank 0063 eingespielt?)" onErneut={r.holen} />}
        {tab === "phasen" && <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="font-display font-semibold mb-1">Offene Pflichtpunkte – Phase {st.aktuell} „{aktuell?.name}“</h3>
            {aktuell?.datei && <p className="text-xs text-slate-500 mb-1">Ergebnis-Dokument: <code>{aktuell.datei}</code></p>}
            <ul className="list-disc pl-5 text-sm grid gap-0.5">{aktuell?.pflicht.map((x) => <li key={x}>{x}</li>)}</ul>
            {admin && st.frei <= 10 && <button type="button" className={`${ghost} mt-3 h-9 text-xs`} onClick={() => setDlg({ art: "kurz" })}>Kurzfassung (§16) – Phasen zusammenlegen …</button>}</div>
          <div><h3 className="font-display font-semibold mb-1">Protokoll</h3>
            <ul className="text-sm grid gap-1.5 max-h-64 overflow-auto">{r.protokoll.map((x) => <li key={x.id} className="border-l-2 border-emerald-600 pl-2">
              <span className="text-xs text-slate-500">{fmt(x.wann)} · {ART_TEXT[x.art] || x.art}</span><br />Phase {x.von_phase}{x.bis_phase !== x.von_phase ? `–${x.bis_phase}` : ""}{x.begruendung ? ` · ${x.begruendung}` : ""}</li>)}
              {!r.protokoll.length && r.geladen && <li className="text-slate-500">Noch kein Eintrag.</li>}</ul></div>
        </div>}
        {tab === "kern" && <div className="grid gap-2">
          <p className="text-sm text-slate-500">Kernpflichten gelten für alle Projekte. Projektregeln (REGELN.md) dürfen sie nur mit einer begründeten, vom Admin bestätigten Abweichung lockern – sonst gilt die globale Pflicht und die Ampel „Kernpflichten“ ist rot.</p>
          {KERNPFLICHTEN.map(([id, name]) => { const ab = r.abweichungen.find((x) => x.pflicht === id); return (
            <div key={id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 flex flex-wrap items-center gap-2 text-sm">
              <b className="font-display">{name}</b>
              {ab ? <span className="text-xs rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Abweichung bestätigt: {ab.begruendung}</span> : <span className="text-xs text-slate-500">gilt</span>}
              {admin && <span className="ml-auto flex gap-1.5">{ab ? <button type="button" className={`${ghost} h-8 text-xs`} onClick={async () => { const { error } = await supabase.rpc("ws_abweichung_aufheben", { p_projekt: projekt.id, p_pflicht: id }); toast(error ? fehler(error) : `${name}: gilt wieder`); nachher(); }}>Aufheben</button>
                : <button type="button" className={`${ghost} h-8 text-xs`} onClick={() => setDlg({ art: "abweichung", id, name })}>Abweichung bestätigen …</button>}</span>}
            </div>); })}
        </div>}
        {tab === "entscheidungen" && <ul className="grid gap-1.5 text-sm max-h-80 overflow-auto">{r.entscheidungen.map((x) => <li key={x.id} className="border-l-2 border-slate-300 dark:border-slate-700 pl-2">
          <span className="text-xs text-slate-500">{fmt(x.wann)} · {x.im_repo ? "in docs/entscheidungen.md" : "kommt mit dem nächsten Bau-Auftrag in docs/entscheidungen.md"}</span><br />{x.text}{x.begruendung ? <span className="text-slate-500"> · {x.begruendung}</span> : ""}
          {Array.isArray(x.einwaende) && x.einwaende.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-500">{x.einwaende.map((e, i) => <li key={i}>{EINWAND_ART[e.art] || e.art}: {e.text}</li>)}</ul>}</li>)}
          {!r.entscheidungen.length && r.geladen && <li className="text-slate-500">Noch keine Entscheidungen protokolliert.</li>}</ul>}
        {tab === "ideen" && <Ideen projekt={projekt} r={r} admin={admin} ich={ich} toast={toast} />}
      </div>}
      {dlg?.art === "frei" && <PhaseFreigeben projekt={projekt} phase={st.aktuell} toast={toast} onClose={() => setDlg(null)} onFertig={nachher} />}
      {dlg?.art === "kurz" && <Kurzfassung projekt={projekt} ab={st.aktuell} toast={toast} onClose={() => setDlg(null)} onFertig={nachher} />}
      {dlg?.art === "vorschlag" && <VorschlagBestaetigen projekt={projekt} vorschlag={vorschlag} toast={toast} onClose={() => setDlg(null)} onFertig={nachher} />}
      {dlg?.art === "abweichung" && <Abweichung projekt={projekt} id={dlg.id} name={dlg.name} toast={toast} onClose={() => setDlg(null)} onFertig={nachher} />}
    </section>
  );
}

function Formular({ titel, kurz, onClose, children, onOk, okText, busy, deaktiviert }) {
  return <Dialog title={titel} onClose={onClose}>{kurz && <p className="text-sm text-slate-600 dark:text-slate-300">{kurz}</p>}{children}
    <div className="flex gap-2 justify-end"><button type="button" className={ghost} onClick={onClose}><X className="w-4 h-4" />Abbrechen</button><button type="button" className={btn} disabled={busy || deaktiviert} onClick={onOk}><Check className="w-4 h-4" />{okText}</button></div></Dialog>;
}
function useAktion(toast, onClose, onFertig) {
  const [busy, setBusy] = useState(false);
  return [busy, async (fn, args, ok) => { setBusy(true); const { error } = await supabase.rpc(fn, args); setBusy(false); if (error) toast(fehler(error)); else { toast(ok); onClose(); await onFertig?.(); } }];
}
function PhaseFreigeben({ projekt, phase, toast, onClose, onFertig }) {
  const [b, setB] = useState(""); const [busy, los] = useAktion(toast, onClose, onFertig); const p = PHASEN.find((x) => x.nr === phase);
  return <Formular titel={`Phase ${phase} „${p?.name}“ freigeben`} kurz={`Erst freigeben, wenn das Ergebnis-Dokument steht und die Pflichtpunkte erledigt sind.${phase === 9 ? " Mit Phase 9 (Bauplan) wird Bauen freigegeben." : ""} Die Freigabe steht im Protokoll und im Entscheidungsprotokoll.`}
    onClose={onClose} busy={busy} okText="Freigeben" onOk={() => los("ws_phase_freigeben", { p_projekt: projekt.id, p_phase: phase, p_begruendung: b.trim() || null }, `Phase ${phase} freigegeben`)}>
    <ul className="list-disc pl-5 text-sm">{p?.pflicht.map((x) => <li key={x}>{x}</li>)}</ul>
    <label className="text-sm font-semibold">Begründung (optional)<textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={b} onChange={(e) => setB(e.target.value)} /></label>
  </Formular>;
}
function Kurzfassung({ projekt, ab, toast, onClose, onFertig }) {
  const [bis, setBis] = useState(Math.min(12, Math.max(ab + 1, 9))); const [b, setB] = useState(""); const [busy, los] = useAktion(toast, onClose, onFertig);
  return <Formular titel="Kurzfassung nach §16" kurz="Nur für kleine Werkzeuge und nur als ausdrückliche, begründete Abweichung: mehrere Phasen werden zusammengelegt und auf einmal freigegeben. Steht im Protokoll und im Entscheidungsprotokoll."
    onClose={onClose} busy={busy} deaktiviert={b.trim().length < 20} okText="Zusammenlegen und freigeben" onOk={() => los("ws_phasen_kurzfassung", { p_projekt: projekt.id, p_bis: Number(bis), p_begruendung: b.trim() }, `Phasen ${ab}–${bis} freigegeben (Kurzfassung)`)}>
    <label className="text-sm font-semibold">Phasen {ab} bis<select className={`${input} mt-1`} value={bis} onChange={(e) => setBis(Number(e.target.value))}>{PHASEN.filter((p) => p.nr >= ab + 1).map((p) => <option key={p.nr} value={p.nr}>{p.nr} – {p.name}</option>)}</select></label>
    <label className="text-sm font-semibold">Begründung (Pflicht, mindestens 20 Zeichen)<textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={b} onChange={(e) => setB(e.target.value)} /></label>
  </Formular>;
}
function VorschlagBestaetigen({ projekt, vorschlag, toast, onClose, onFertig }) {
  const [n, setN] = useState(vorschlag?.phase || 1); const [b, setB] = useState(""); const [busy, los] = useAktion(toast, onClose, onFertig);
  return <Formular titel="Phasen-Stand des eingelesenen Projekts bestätigen" kurz={`Der Assistent schlägt Phase ${vorschlag?.phase} vor${vorschlag?.grund ? `: ${vorschlag.grund}` : ""}. Bestätigst du Phase ${n}, gelten die Phasen 1–${n - 1} als erledigt übernommen.`}
    onClose={onClose} busy={busy} okText={`Phase ${n} bestätigen`} onOk={() => los("ws_phase_vorschlag_bestaetigen", { p_projekt: projekt.id, p_phase: Number(n), p_begruendung: b.trim() || null }, `Phase ${n} bestätigt`)}>
    <label className="text-sm font-semibold">Phase<select className={`${input} mt-1`} value={n} onChange={(e) => setN(Number(e.target.value))}>{PHASEN.map((p) => <option key={p.nr} value={p.nr}>{p.nr} – {p.name}</option>)}</select></label>
    <label className="text-sm font-semibold">Begründung (optional)<textarea className={`${input} mt-1`} rows={2} maxLength={2000} value={b} onChange={(e) => setB(e.target.value)} /></label>
  </Formular>;
}
function Abweichung({ projekt, id, name, toast, onClose, onFertig }) {
  const [b, setB] = useState(""); const [busy, los] = useAktion(toast, onClose, onFertig);
  return <Formular titel={`Abweichung von „${name}“ bestätigen`} kurz="Nur, wenn die Projektregeln diese Kernpflicht bewusst anders regeln. Die Begründung steht im Entscheidungsprotokoll; die harten Sperren der Datenbank (Phase 9, Entwurf, Prüf-Station) bleiben bestehen – „Doku-Pflicht“ wird dann nur noch als Hinweis geprüft."
    onClose={onClose} busy={busy} deaktiviert={b.trim().length < 20} okText="Abweichung bestätigen" onOk={() => los("ws_abweichung_bestaetigen", { p_projekt: projekt.id, p_pflicht: id, p_begruendung: b.trim() }, `Abweichung „${name}“ bestätigt`)}>
    <label className="text-sm font-semibold">Begründung (Pflicht, mindestens 20 Zeichen)<textarea className={`${input} mt-1`} rows={3} maxLength={2000} value={b} onChange={(e) => setB(e.target.value)} /></label>
  </Formular>;
}

function Ideen({ projekt, r, admin, ich, toast }) {
  const [titel, setTitel] = useState(""); const [einst, setEinst] = useState("klein"); const [busy, setBusy] = useState(false);
  const anlegen = async () => { setBusy(true); const { error } = await supabase.rpc("ws_idee_anlegen", { p_projekt: projekt.id, p_titel: titel.trim(), p_text: "", p_einstufung: einst }); setBusy(false); if (error) toast(fehler(error)); else { setTitel(""); toast("Idee festgehalten"); r.holen(); } };
  const aendern = async (x, felder) => { const { error } = await supabase.rpc("ws_idee_aendern", { p_id: x.id, p_einstufung: felder.einstufung ?? null, p_stand: felder.stand ?? null, p_vermerk: felder.vermerk ?? null }); if (error) toast(fehler(error)); else r.holen(); };
  return <div className="grid gap-3">
    <p className="text-sm text-slate-500">Neue Ideen, Aufgaben und Features aus dem Gespräch landen zuerst hier (Regeldatei §11) und kommen mit dem nächsten Bau-Auftrag in <code>docs/ideen.md</code>. Bei jeder Idee: Braucht das wirklich jemand?</p>
    <div className="flex flex-wrap gap-2"><input className={`${input} flex-1 min-w-[200px]`} maxLength={120} placeholder="Neue Idee (keine Personendaten)" value={titel} onChange={(e) => setTitel(e.target.value)} />
      <select className={`${input} w-auto`} value={einst} onChange={(e) => setEinst(e.target.value)} aria-label="Einstufung">{Object.entries(EINST).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <button type="button" className={btn} disabled={busy || titel.trim().length < 3} onClick={anlegen}><Lightbulb className="w-4 h-4" />Festhalten</button></div>
    <ul className="grid gap-1.5 max-h-80 overflow-auto">{r.ideen.map((x) => <li key={x.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-mono text-xs text-slate-400">#{x.id}</span><b className="min-w-0">{x.titel}</b>
      <span className="text-xs text-slate-500">{{ feature_neu: "aus dem Gespräch", aufgabe: "aus Aufgaben", wunsch: "Wunsch" }[x.herkunft]} · {x.im_repo ? "in docs/ideen.md" : "noch nicht im Repository"}</span>
      <span className="ml-auto flex gap-1.5 items-center">
        {(admin || x.von === ich.id) && <select className={`${input} w-auto h-8 py-0 text-xs`} value={x.einstufung} aria-label={`Einstufung von ${x.titel}`} onChange={(e) => aendern(x, { einstufung: e.target.value })}>{Object.entries(EINST).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
        {admin ? <select className={`${input} w-auto h-8 py-0 text-xs`} value={x.stand} aria-label={`Stand von ${x.titel}`} onChange={(e) => aendern(x, { stand: e.target.value })}>{["offen", "freigegeben", "verworfen", "umgesetzt"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          : <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 dark:bg-slate-800">{EINST[x.einstufung]} · {x.stand}</span>}
      </span></li>)}
      {!r.ideen.length && r.geladen && <li className="text-sm text-slate-500">Noch keine Ideen.</li>}</ul>
  </div>;
}

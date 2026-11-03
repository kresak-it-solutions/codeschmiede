import React, { useEffect, useState } from "react";
import { SquareTerminal, Download, LogIn, ShieldCheck, Save, Loader2, RefreshCw, Check, X, Lock, CircleAlert, Menu, Globe } from "lucide-react";
import { supabase } from "../supabase";
import { card, fehler, fmt } from "../bausteine/grund";
import { WERKZEUGE, TEST_PUNKTE, modellOk, bereit, testIrgendwo, werkzeugName } from "../daten/werkzeuge";

// Programmier-Werkzeug je Projekt (0.14.0, Entwurf freigegeben von Gerhard 02.11.2026): Zeile „Programmieren“ unter Projekt › KI-Anbieter.
// Verpflichtend: Ist das Werkzeug auf keinem PC bereit, wartet der Auftrag – es springt kein anderes ein. Speichern nur der Admin; ein fremdes
// Werkzeug erst nach bestandenem Sperren-Test auf mindestens einem Entwickler-PC (prüft die Datenbank, ws_werkzeug_setzen).
// Seit 0.18.0 (KI-Anbindungen global, Datenbank 0062): modus „global“ = Standard für alle Projekte (Globale Einstellungen › KI-Anbieter,
// ws_ki_global_setzen); modus „projekt“ = Wahl je Projekt mit „Wie global“ (keine Projektzeile, ws_werkzeug_wie_global) als Voreinstellung.
const knopf = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50";
const haupt = "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-display font-bold tracking-wide text-sm";
const sel = "rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-sm";

function Lampe({ farbe, children }) {
  const c = { gruen: "bg-emerald-600", gelb: "bg-amber-500", rot: "bg-red-600", grau: "bg-slate-400" }[farbe];
  return <div className="flex items-start gap-2 text-sm"><span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${c}`} aria-hidden="true" /><span className="min-w-0 break-words">{children}</span></div>;
}

const WIE_GLOBAL = "global";
export default function ProgrammierWerkzeug({ d, ich, toast, eintrag, global = null, modus = "projekt", meinePcs, onGespeichert }) {
  const admin = ich.rolle === "admin";
  const imProjekt = modus !== "global";
  const projekt = d.projekte.find((p) => p.id === d.projektId);
  const globalWz = global?.werkzeug && WERKZEUGE[global.werkzeug] ? global.werkzeug : "claude-code";
  // Ohne Projektzeile gilt der globale Wert („Wie global“); im globalen Modus ist der gespeicherte Wert die globale Zeile
  const gespeichert = eintrag?.werkzeug && WERKZEUGE[eintrag.werkzeug] ? eintrag.werkzeug : imProjekt ? WIE_GLOBAL : "claude-code";
  const [wahl, setWahl] = useState(gespeichert);
  const [modell, setModell] = useState(eintrag?.werkzeug_modell || "");
  const [staende, setStaende] = useState([]); const [tick, setTick] = useState(0); const [busy, setBusy] = useState(false);
  const [pcWahl, setPcWahl] = useState(meinePcs[0]?.id || null);
  useEffect(() => { setWahl(gespeichert); setModell(eintrag?.werkzeug_modell || ""); }, [gespeichert, eintrag?.werkzeug_modell]);
  useEffect(() => { if (!pcWahl && meinePcs[0]) setPcWahl(meinePcs[0].id); }, [meinePcs, pcWahl]);
  useEffect(() => {
    let aus = false;
    supabase.from("ws_werkzeug_stand").select("*").then(({ data }) => { if (!aus) setStaende(data || []); });
    const kanal = supabase.channel(`werkzeug-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "ws_werkzeug_stand" }, () => setTick((t) => t + 1)).subscribe();
    return () => { aus = true; supabase.removeChannel(kanal); };
  }, [tick]);
  const wieGlobal = wahl === WIE_GLOBAL;
  const wz = wieGlobal ? globalWz : wahl;          // das Werkzeug, das tatsächlich programmiert
  const w = WERKZEUGE[wz]; const fremd = wz !== "claude-code";
  const pc = meinePcs.find((p) => p.id === pcWahl) || null;
  const st = fremd && pc ? staende.find((s) => s.pc_id === pc.id && s.werkzeug === wz) : null;
  const geaendert = wahl !== gespeichert || (!wieGlobal && fremd && (modell || "") !== (eintrag?.werkzeug_modell || ""));
  const testOk = wieGlobal || !fremd || testIrgendwo(staende, d.pcs, wz);
  const laeuft = !!st?.aktion || st?.test === "laeuft";

  const aktion = async (a) => {
    if (!pc) return;
    const { error } = await supabase.rpc("ws_werkzeug_aktion", { p_pc: pc.id, p_werkzeug: wz, p_aktion: a });
    if (error) toast(fehler(error)); else { toast({ installieren: `${w.name} wird auf ${pc.name} installiert …`, anmelden: "Die Anmeldung öffnet sich im Terminal-Fenster auf dem PC", test: "Sperren-Test läuft auf dem PC (Wegwerf-Kopie) …", pruefen: "Wird auf dem PC geprüft …" }[a]); setTick((t) => t + 1); }
  };
  const speichern = async () => {
    setBusy(true);
    const m = !wieGlobal && fremd ? (modell || null) : null;
    const { error } = !imProjekt
      ? await supabase.rpc("ws_ki_global_setzen", { p_aufgabe: "bauen", p_reihe: Array.isArray(eintrag?.reihe) ? eintrag.reihe : [{ anbieter: "claude" }], p_ab: eintrag?.weitergeben_ab ?? 90, p_werkzeug: wahl, p_modell: m })
      : wieGlobal ? await supabase.rpc("ws_werkzeug_wie_global", { p_projekt: d.projektId })
      : await supabase.rpc("ws_werkzeug_setzen", { p_projekt: d.projektId, p_werkzeug: wahl, p_modell: m });
    setBusy(false);
    if (error) toast(fehler(error));
    else { toast(!imProjekt ? `Gespeichert – alle Projekte ohne eigene Wahl programmieren ab jetzt mit ${w.name}. Laufende Aufträge machen mit ihrem Werkzeug fertig.`
      : `Gespeichert – neue Aufträge in diesem Projekt programmiert ab jetzt ${w.name}${wieGlobal ? " (wie global)" : ""}. Laufende Aufträge machen mit ihrem Werkzeug fertig.`); onGespeichert?.(); }
  };
  const pcName = (id) => d.pcs.find((p) => p.id === id)?.name || "PC";

  return (
    <div className={`${card} p-4 flex flex-col gap-3`} aria-label="Programmieren">
      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">{imProjekt ? <><Menu className="w-3.5 h-3.5" />Projekt <b>{projekt?.name || d.projektId}</b> › KI-Anbieter › Programmieren</>
        : <><Globe className="w-3.5 h-3.5" />Globale Einstellungen › KI-Anbieter › Programmieren · Standard für alle Projekte ohne eigene Wahl</>}</div>
      <div><h3 className="font-display font-bold text-lg flex items-center gap-2"><SquareTerminal className="w-5 h-5 text-emerald-700" />Programmieren</h3>
        <p className="text-sm text-slate-500">{imProjekt ? <>Ein Werkzeug je Projekt – voreingestellt <b>wie global</b> ({werkzeugName(globalWz)}). </> : <>Gilt für jedes Projekt, das „Wie global“ eingestellt hat (auch neue Projekte); ein Projekt kann ein eigenes Werkzeug wählen. </>}<b>Verpflichtend</b>: Ist es auf keinem Entwickler-PC bereit, wartet der Auftrag mit „wartet auf …“ – es springt kein anderes ein, auch nicht Claude. Fremde Werkzeuge laufen nur in der Sperre der Codeschmiede auf dem Mac – nie unter Windows oder Linux und nie auf dem Admin-PC. Gemini CLI ist derzeit überall gesperrt (startet ohne Rückfrage nur in vertrauten Ordnern).</p></div>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]" role="radiogroup" aria-label="Programmier-Werkzeug">
        {imProjekt && <button type="button" role="radio" aria-checked={wieGlobal} onClick={() => setWahl(WIE_GLOBAL)}
          className={`text-left rounded-xl border p-3 flex flex-col gap-1 transition ${wieGlobal ? "border-emerald-600 ring-2 ring-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-800 hover:border-emerald-500"}`}>
          <span className="font-display font-bold flex flex-wrap items-center gap-1.5"><Globe className="w-4 h-4 text-emerald-700" />Wie global
            <span className="text-xs font-bold rounded-md px-1.5 py-0.5 bg-emerald-700 text-white">Voreinstellung</span>
            {gespeichert === WIE_GLOBAL && <span className="text-xs font-bold rounded-full px-2 py-0.5 border border-emerald-600 text-emerald-700 dark:text-emerald-300">aktiv</span>}</span>
          <span className="text-xs text-slate-500">derzeit {werkzeugName(globalWz)}{global?.werkzeug_modell ? ` · ${global.werkzeug_modell}` : ""} – ändert sich mit der globalen Einstellung</span>
        </button>}
        {Object.entries(WERKZEUGE).map(([id, t]) => (
          <button key={id} type="button" role="radio" aria-checked={id === wahl} onClick={() => setWahl(id)}
            className={`text-left rounded-xl border p-3 flex flex-col gap-1 transition ${id === wahl ? "border-emerald-600 ring-2 ring-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/40" : "border-slate-200 dark:border-slate-800 hover:border-emerald-500"}`}>
            <span className="font-display font-bold flex flex-wrap items-center gap-1.5">{t.name}
              {t.standard && <span className="text-xs font-bold rounded-md px-1.5 py-0.5 bg-emerald-700 text-white">Standard</span>}
              {id === gespeichert && <span className="text-xs font-bold rounded-full px-2 py-0.5 border border-emerald-600 text-emerald-700 dark:text-emerald-300">aktiv</span>}</span>
            <span className="text-xs text-slate-500">{t.kurz}</span>
          </button>))}
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Modell</span>
          {!fremd ? <span className="text-slate-500">nach Aufwand (einfach → klein, komplex → groß), wie bisher</span>
            : wieGlobal ? <span className="text-slate-500">{global?.werkzeug_modell || "Standardmodell"} (wie global)</span>
            : admin ? <span className="flex flex-wrap items-center gap-1.5">
              <input className={`${sel} w-56`} aria-label="Modell" placeholder={wz === "opencode" ? "anbieter/modell (leer = Standard)" : "leer = Standardmodell"} value={modell} onChange={(e) => setModell(e.target.value.trim())} />
              {!modellOk(wz, modell) && <span className="text-xs text-red-600">{wz === "opencode" ? "Form: anbieter/modell" : "ungültiger Modellname"}</span>}</span>
            : <span className="text-slate-500">{eintrag?.werkzeug_modell || "Standardmodell"}</span>}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Konto</span><span className="text-slate-500">{w.konto}</span></div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Verbrauch</span><span className="text-slate-500">{w.verbrauch}</span></div>
      </div>

      {fremd && <>
        <div className="flex flex-wrap items-center gap-2"><h4 className="text-xs font-bold tracking-wider uppercase text-slate-500">Bereitschaft auf diesem PC</h4>
          {meinePcs.length > 1 && <select className={sel} value={pcWahl || ""} onChange={(e) => setPcWahl(e.target.value)} aria-label="PC">{meinePcs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
        {!pc ? <p className="text-sm text-slate-500">Noch kein Werkstatt-PC – die Lampen meldet das Codeschmiede-Programm des PCs.</p> : <>
          <div className="flex flex-col gap-1.5">
            {pc.admin_pc ? <Lampe farbe="rot">Admin-PC: programmiert nie mit fremden Werkzeugen (kein Projekt-Code auf dem Admin-PC)</Lampe>
              : st && !st.sperrbar ? <Lampe farbe="rot">Gesperrt: {st.sperre_grund || "lässt sich auf diesem PC nicht sicher sperren"}</Lampe>
              : <>
                <Lampe farbe={st?.installiert ? "gruen" : "rot"}>{st?.installiert ? `Installiert (Version ${st.version})` : `Nicht installiert – die Codeschmiede installiert ${w.paket}@${w.version} auf Knopfdruck`}</Lampe>
                <Lampe farbe={st?.angemeldet ? "gruen" : "gelb"}>{st?.angemeldet ? "Angemeldet" : "Nicht angemeldet – du meldest dich selbst im Werkzeug an"}</Lampe>
                <Lampe farbe={bereit(st) ? "gruen" : st?.test === "durchgefallen" ? "rot" : "gelb"}>{bereit(st) ? `Sperren-Test bestanden (Version ${st.test_version}, ${fmt(st.test_zeit)})` : st?.test === "durchgefallen" ? "Sperren-Test NICHT bestanden – auf diesem PC gesperrt" : st?.test === "laeuft" ? "Sperren-Test läuft …" : st?.test_version && st.test_version !== st.version ? "Sperren-Test gilt nicht mehr (neue Version) – bitte neu starten" : "Sperren-Test noch nicht bestanden"}</Lampe>
              </>}
            {!st && !pc.admin_pc && <span className="text-xs text-slate-500">Noch keine Meldung von diesem PC – läuft das Codeschmiede-Programm (ab 0.14.0)?</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!pc.admin_pc && st?.sperrbar !== false && !st?.installiert && <button type="button" className={knopf} disabled={laeuft} onClick={() => aktion("installieren")}><Download className="w-4 h-4" />Installieren</button>}
            {!pc.admin_pc && st?.installiert && !st?.angemeldet && <button type="button" className={knopf} disabled={laeuft} onClick={() => aktion("anmelden")}><LogIn className="w-4 h-4" />Anmeldung öffnen</button>}
            {!pc.admin_pc && st?.installiert && st?.angemeldet && <button type="button" className={knopf} disabled={laeuft} onClick={() => aktion("test")}><ShieldCheck className="w-4 h-4" />Sperren-Test starten</button>}
            <button type="button" className={knopf} disabled={laeuft} onClick={() => aktion("pruefen")}>{laeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Prüfen</button>
          </div>
          {st?.hinweis && <p className="text-sm rounded-xl px-3 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">{st.hinweis}</p>}
          {Array.isArray(st?.test_punkte) && <div className="flex flex-col gap-1 text-sm" aria-label="Ergebnis des Sperren-Tests">
            {TEST_PUNKTE.map(([id, t]) => { const p = st.test_punkte.find((x) => x.id === id); if (!p) return null;
              return <div key={id} className="flex items-center gap-2">{p.ok ? (id === "erlaubt" ? <Check className="w-4 h-4 text-emerald-700" /> : <Lock className="w-4 h-4 text-emerald-700" />) : <X className="w-4 h-4 text-red-600" />}
                <span>{t}: {id === "erlaubt" ? (p.ok ? "erlaubt" : "hat nicht gewirkt") : p.ok ? "abgewiesen" : <b>nicht abgewiesen</b>}</span></div>; })}
          </div>}
        </>}
        <p className="text-xs text-slate-500">Sperren-Test: Die Codeschmiede legt unter ihren Daten eine Wegwerf-Kopie mit Attrappen an (Regeln, setup, Nachbarprojekt, Git-Einstellung, Verknüpfung nach außen) und lässt das Werkzeug genau diese Schreibversuche machen, dazu einen erlaubten im Arbeitsordner. Eine Gegenprobe macht in derselben Sperre dieselben Versuche, verbotene Programmstarts und verbotenes Lesen – auch auf dem Laufwerk der Projekte. Bestanden heißt: alles Verbotene abgewiesen. Ändern sich Werkzeug, Sperre oder Codeschmiede, muss der Test neu laufen. Die Codeschmiede speichert keine Zugangsdaten – angemeldet wird nur geprüft, nicht gelesen.</p>
      </>}

      {admin && fremd && staende.some((s) => s.werkzeug === wz) && <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-xs text-slate-500"><tr><th className="text-left py-1 pr-2">PC</th><th className="text-left py-1 pr-2">installiert</th><th className="text-left py-1 pr-2">angemeldet</th><th className="text-left py-1">Sperren-Test</th></tr></thead>
        <tbody>{staende.filter((s) => s.werkzeug === wz).map((s) => <tr key={s.pc_id} className="border-t border-slate-100 dark:border-slate-800">
          <td className="py-1 pr-2">{pcName(s.pc_id)}</td><td className="py-1 pr-2">{s.installiert ? s.version : "nein"}</td><td className="py-1 pr-2">{s.angemeldet ? "ja" : "nein"}</td>
          <td className="py-1">{bereit(s) ? "bestanden" : s.sperrbar ? (s.test === "durchgefallen" ? "nicht bestanden" : "offen") : "gesperrt"}</td></tr>)}</tbody></table></div>}

      <div className="flex flex-wrap items-center gap-2">
        {admin ? <button type="button" className={haupt} disabled={busy || !geaendert || !testOk || (!wieGlobal && fremd && !modellOk(wz, modell))} onClick={speichern}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Speichern</button>
          : <span className="text-xs text-slate-500">Das Werkzeug stellt der Admin ein.</span>}
        {admin && geaendert && !testOk && <span className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><CircleAlert className="w-3.5 h-3.5" />Speichern geht erst, wenn der Sperren-Test auf mindestens einem Entwickler-PC bestanden ist.</span>}
        {geaendert && testOk && <span className="text-xs text-slate-500">Neue Aufträge programmiert dann {w.name}; laufende machen mit ihrem Werkzeug fertig.</span>}
      </div>
      <ul className="text-xs text-slate-500 flex flex-col gap-0.5">
        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-700" />Projektregeln und globale Regeln gehen an jedes Werkzeug; danach Prüf-Station, Testseite und Freigabe wie bisher</li>
        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-700" />Commit, Hochladen und Pull Request macht bei fremden Werkzeugen die Codeschmiede selbst</li>
        <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-700" />Zugangsdaten bleiben beim Werkzeug, die Codeschmiede speichert keine</li>
      </ul>
    </div>);
}

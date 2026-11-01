// Werkstatt – aus App.jsx ausgelagert (Befund B1 vom 01.11.2026, kein Verhaltenswechsel).
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { fehler, merke } from "../bausteine/grund";
import { isDesktop, tauri } from "../desktop";
import { useEinrichtung } from "../Einrichtung";

// ---------------- Werkstatt (nur im Programm) ----------------
// Einrichtungs-Assistent beim ersten Start von selbst öffnen – und später, wenn auf diesem PC etwas Wichtiges fehlt (einmal je Programmstart)
let einrichtungAutoGezeigt = false;
export function EinrichtungAuto({ ich, d, onOeffnen }) {
  const { st, offen } = useEinrichtung(ich, d);
  useEffect(() => {
    if (einrichtungAutoGezeigt || !st?.desk) return;
    let gesehen = false; try { gesehen = localStorage.getItem("cs-einrichtung-gesehen") === "1"; } catch { /* egal */ }
    // offen zählt auch die laufende Werkstatt – kurz nach dem Start ist sie evtl. noch nicht an, darum nur Werkzeuge/Anmeldung werten
    // Nur wer baut (Admin/Entwickler), braucht die Werkzeuge – Leser sehen den Assistenten nur beim ersten Start (Prüfung 0.8.0)
    const baut = ich?.rolle === "admin" || (d?.mitglieder || []).some((m) => m.benutzer_id === ich?.id && m.rolle === "entwickler");
    const werkzeugFehlt = baut && ["node", "git", "claude", "gh", "gh_angemeldet"].some((k) => !st.werk?.[k]);
    if (!gesehen || werkzeugFehlt) { einrichtungAutoGezeigt = true; onOeffnen(); }
    else einrichtungAutoGezeigt = true;
  }, [st, offen, onOeffnen, ich, d]);
  return null;
}

let werkstattAutoVersucht = false;   // einmal je Programmstart
export function WerkstattSchalter({ ich, sitzung, d, toast }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  const desk = isDesktop();
  const darfWerkstatt = ich.rolle === "admin" || d.mitglieder.some((m) => m.benutzer_id === ich.id && m.rolle === "entwickler");
  useEffect(() => {
    if (!desk) return undefined;
    let aus = false;
    const tick = () => tauri("ws_status").then((s) => !aus && setSt(s)).catch(() => {});
    tick(); const t = setInterval(tick, 3000);
    return () => { aus = true; clearInterval(t); };
  }, [desk]);
  useEffect(() => { if (desk && st?.laeuft && sitzung?.access_token) tauri("ws_token", { token: sitzung.access_token }).catch(() => {}); }, [desk, st?.laeuft, sitzung?.access_token]);
  const an = !!st?.laeuft;
  const umschalten = async (auto = false) => {
    setBusy(true);
    try {
      if (an) { await tauri("ws_stop"); merke.schreib("cs-werkstatt-aus", "1", "sitzung"); toast("Werkstatt aus: dieser PC übernimmt keine Aufträge mehr (beim nächsten Start wieder an)"); return; }
      const v = await tauri("ws_check");
      const namen = { claude: "Claude Code", node: "Node.js", git: "Git", gh: "GitHub CLI" };
      const fehlt = ["claude", "node", "git", "gh"].filter((k) => !v[k]);
      if (fehlt.length) { toast(`${auto ? "Werkstatt konnte nicht automatisch starten – " : ""}Auf diesem PC fehlt: ${fehlt.map((k) => namen[k]).join(", ")}`); return; }
      if (!v.gh_angemeldet) { toast(`${auto ? "Werkstatt konnte nicht automatisch starten – " : ""}GitHub ist auf diesem PC nicht angemeldet (einmal „gh auth login“)`); return; }
      merke.schreib("cs-werkstatt-aus", "", "sitzung");
      await tauri("ws_start", { config: { supabase_url: import.meta.env.VITE_SUPABASE_URL, anon_key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, access_token: sitzung.access_token, user_id: ich.id, admin: ich.rolle === "admin" } });
      toast(auto ? "Werkstatt automatisch eingeschaltet" : "Werkstatt an: dieser PC übernimmt Aufträge");
    } catch (e) { toast(fehler(e)); } finally { setBusy(false); }
  };
  // Neue Anweisung Gerhard 2026-10-23 10:20/10:22: Werkstatt ist bei jedem Programmstart an. Ausschalten gilt bis zum nächsten Start.
  useEffect(() => {
    if (!desk || !darfWerkstatt || !st || st.laeuft || busy || werkstattAutoVersucht || !sitzung?.access_token) return;
    if (merke.lies("cs-werkstatt-aus", "sitzung") === "1") return;
    werkstattAutoVersucht = true;
    umschalten(true);
  }, [desk, darfWerkstatt, st, busy, sitzung?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!desk) return <span className="text-xs text-slate-500" title="Die Werkstatt läuft nur im Programm Codeschmiede">Werkstatt-PCs online: <b>{d.pcs.filter((p) => p.an && Date.now() - new Date(p.zuletzt).getTime() < 180000).length}</b></span>;
  if (!darfWerkstatt) return <UpdateHinweis toast={toast} />;
  return (
    <>
      <button type="button" role="switch" aria-checked={an} disabled={busy} onClick={() => umschalten(false)} className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-1.5 pr-3 py-1 text-sm">
        <span className={`relative w-9 h-5 rounded-full transition ${an ? "bg-green-600" : "bg-slate-300 dark:bg-slate-700"}`}><i className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${an ? "left-[18px]" : "left-0.5"}`} /></span>
        Werkstatt {an ? "an" : "aus"}{st?.auftrag ? <span className="text-xs text-slate-500">· Auftrag #{st.auftrag}</span> : null}
      </button>
      <UpdateHinweis toast={toast} />
    </>
  );
}

// Automatische Updates des Programms (Anweisung Gerhard 2026-10-22 16:25): im Hintergrund geladen, beim nächsten Start aktiv
export function UpdateHinweis({ toast }) {
  const [u, setU] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isDesktop()) return undefined;
    let aus = false;
    const tick = () => tauri("ws_update_status").then((x) => !aus && setU(x)).catch(() => {}); // ältere Programmversion: Befehl fehlt
    tick(); const t = setInterval(tick, 60000);
    return () => { aus = true; clearInterval(t); };
  }, []);
  if (!u?.bereit) return null;
  const neustart = async () => { setBusy(true); try { await tauri("ws_update_neustart"); } catch (e) { toast(fehler(e)); setBusy(false); } };
  return (
    <button type="button" disabled={busy} onClick={neustart} title={`Version ${u.neu} ist geladen und wird spätestens beim nächsten Start aktiv.`}
      className="inline-flex items-center gap-2 rounded-full border border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-sm text-emerald-800 dark:text-emerald-200">
      <Download className="w-4 h-4" />Version {u.neu} bereit · Jetzt neu starten
    </button>
  );
}

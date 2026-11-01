// Daten der Codeschmiede (aus App.jsx ausgelagert, Befund B1 vom 01.11.2026): Live-Daten über Supabase Realtime und Rechte.
import { useCallback, useEffect, useRef, useState } from "react";
import { ABGESCHLOSSEN } from "../bausteine/grund";
import { supabase } from "../supabase";

// ---------------- Daten ----------------
export const usd = (n) => (n == null ? "–" : new Intl.NumberFormat("de-AT", { style: "currency", currency: "USD" }).format(Number(n)));
export function useWerkstattDaten(me, projektId) {
  const leer = { projekte: [], mitglieder: [], bereiche: [], gruppen: [], features: [], auftraege: [], aufbau: [], benutzer: [], rechte: [], pcs: [], verbrauch: [], gesamt: 0, einstellungen: null, abo: [] };
  const [d, setD] = useState(leer);
  const [laden, setLaden] = useState(true);
  // Befund B8 (01.11.2026): echter Zustand des Realtime-Kanals statt immer „Live synchronisiert“
  const [live, setLive] = useState("verbindet");
  const timer = useRef(null);
  const holen = useCallback(async () => {
    const [pj, mg, u, r, p, e, vm, vg, ab] = await Promise.all([
      supabase.from("ws_projekte").select("*").eq("archiviert", false).order("name"),
      supabase.from("ws_projekt_mitglieder").select("*"),
      supabase.from("ws_benutzer").select("*").order("name"),
      supabase.from("ws_rechte").select("*"),
      supabase.from("ws_werkstatt_pcs").select("*").order("name"),
      supabase.from("ws_einstellungen").select("*").maybeSingle(),
      supabase.rpc("ws_verbrauch_monat"),
      supabase.rpc("ws_verbrauch_gesamt_monat"),
      supabase.from("ws_abo_limits").select("*"),
    ]);
    // Gewähltes Projekt nur, wenn es (noch) da und nicht archiviert ist – sonst das erste
    const pid = (projektId && (pj.data || []).some((x) => x.id === projektId)) ? projektId : pj.data?.[0]?.id;
    let b = [], g = [], f = [], a = [], erl = [], auf = [];
    if (pid) {
      b = (await supabase.from("ws_bereiche").select("*").eq("projekt_id", pid).order("reihenfolge")).data || [];
      const bids = b.map((x) => x.id);
      g = bids.length ? (await supabase.from("ws_gruppen").select("*").in("bereich_id", bids).order("reihenfolge")).data || [] : [];
      const gids = g.map((x) => x.id);
      if (gids.length) {
        f = (await supabase.from("ws_features").select("*").in("gruppe_id", gids).order("reihenfolge").order("id")).data || [];
        // Aufbau-Änderungen, die noch nicht in der App sind (Datenbank 0044)
        auf = (await supabase.from("ws_aufbau_aenderungen").select("id, art, text, details, erstellt").eq("projekt_id", pid).is("auftrag_id", null).order("id")).data || [];
        a = (await supabase.from("ws_auftraege").select("*").in("gruppe_id", gids).neq("stand", "abgebrochen").order("id")).data || [];
        // Offene Rückfrage = Auftrag in „frage“ und die letzte Nachricht kommt von der Werkstatt (noch nicht beantwortet)
        const fragIds = a.filter((x) => x.stand === "frage").map((x) => x.id);
        if (fragIds.length) {
          const n = (await supabase.from("ws_nachrichten").select("auftrag_id, von, id").in("auftrag_id", fragIds).order("id", { ascending: false })).data || [];
          const letzte = {}; n.forEach((m) => { if (!(m.auftrag_id in letzte)) letzte[m.auftrag_id] = m; });
          a = a.map((x) => (x.stand === "frage" ? { ...x, offeneFrage: !letzte[x.id]?.von } : x));
        }
        const ids = a.filter((x) => !ABGESCHLOSSEN.includes(x.stand)).map((x) => x.id);
        if (ids.length) erl = (await supabase.from("ws_erlaubnisse").select("id, auftrag_id, werkzeug, eingabe, grund, status, erstellt").in("auftrag_id", ids).eq("status", "offen").order("id")).data || [];
      }
    }
    setD({ projekte: pj.data || [], mitglieder: mg.data || [], bereiche: b, gruppen: g, features: f, auftraege: a, erlaubnisse: erl, aufbau: auf, benutzer: u.data || [], rechte: r.data || [],
      pcs: p.data || [], einstellungen: e.data || null, verbrauch: vm.data || [], gesamt: Number(vg.data || 0), abo: ab.data || [], projektId: pid });
    setLaden(false);
  }, [projektId]);
  useEffect(() => {
    if (!me) return undefined;
    setLaden(true); holen();
    const ch = supabase.channel("cs-zentrale-" + (projektId || "start"));
    ["ws_projekte", "ws_projekt_mitglieder", "ws_bereiche", "ws_gruppen", "ws_features", "ws_auftraege", "ws_nachrichten", "ws_benutzer", "ws_rechte", "ws_werkstatt_pcs", "ws_verbrauch", "ws_einstellungen", "ws_abo_limits", "ws_erlaubnisse"].forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => { clearTimeout(timer.current); timer.current = setTimeout(holen, 300); }));
    // Review N1 (02.11.2026): „CLOSED“ beim eigenen Aufräumen ignorieren; neu laden außerhalb des State-Updaters
    let aufgeraeumt = false; let warGetrennt = false;
    ch.subscribe((status) => {
      if (aufgeraeumt) return;
      if (status === "SUBSCRIBED") { if (warGetrennt) { warGetrennt = false; holen(); } setLive("an"); }   // nach Wiederverbindung frisch laden
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) { warGetrennt = true; setLive("getrennt"); }
    });
    return () => { aufgeraeumt = true; supabase.removeChannel(ch); clearTimeout(timer.current); };
  }, [me, holen, projektId]);
  return { ...d, laden, holen, live };
}

export function useAuftragDetails(ids) {
  const [n, setN] = useState([]); const [log, setLog] = useState([]); const [erl, setErl] = useState([]);
  const key = ids.join(",");
  useEffect(() => {
    if (!ids.length) { setN([]); setLog([]); setErl([]); return undefined; }
    let aus = false;
    const holen = async () => {
      const [a, b, c] = await Promise.all([
        supabase.from("ws_nachrichten").select("*").in("auftrag_id", ids).order("id"),
        supabase.from("ws_live_log").select("*").in("auftrag_id", ids).order("id"),
        supabase.from("ws_erlaubnisse").select("*").in("auftrag_id", ids).order("id"),
      ]);
      if (!aus) { setN(a.data || []); setLog(b.data || []); setErl(c.data || []); }
    };
    holen();
    const ch = supabase.channel("cs-details-" + key);
    ["ws_nachrichten", "ws_live_log", "ws_erlaubnisse"].forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, holen));
    ch.subscribe();
    return () => { aus = true; supabase.removeChannel(ch); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { nachrichten: n, log, erlaubnisse: erl };
}

// ---------------- Zu erledigen & Live (Entwurf 1.0, freigegeben 2026-10-23 „Entwurf1.0 frei“, Datenbank 0024) ----------------
// Alles, was auf mich wartet, mit den passenden Knöpfen; oben der Weg bis live (Test → Live), rechts „Jetzt unabhängig prüfen“.
export function rechteVon(d, ich) {
  const rolle = ich.rolle === "admin" ? "admin" : d.mitglieder.find((m) => m.projekt_id === d.projektId && m.benutzer_id === ich.id)?.rolle;
  return (bereich, recht) => rolle === "admin" || d.rechte.some((r) => r.benutzer_id === ich.id && r.bereich_id === bereich && r[recht] && (recht === "auftraege" ? ["entwickler", "texter"].includes(rolle) : rolle === "entwickler"));
}
export function useRechte(d, ich) {
  const rolle = ich.rolle === "admin" ? "admin" : d.mitglieder.find((m) => m.projekt_id === d.projektId && m.benutzer_id === ich.id)?.rolle;
  return useCallback((bereich, recht) => rolle === "admin" || d.rechte.some((r) => r.benutzer_id === ich.id && r.bereich_id === bereich && r[recht] && (recht === "auftraege" ? ["entwickler", "texter"].includes(rolle) : rolle === "entwickler")), [d.rechte, ich, rolle]);
}
// Was wartet auf mich? (Zahl im Menü)

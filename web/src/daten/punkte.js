// Offene Punkte = Aufgaben mit Bezug zu einem Feature (Datenbank 0042) und ihre Verknüpfung zu Aufträgen (ws_aufgabe_sendungen.auftrag_id).
// Ein Laden je Projekt für Zentrale (Status-Punkt im Baum) und Arbeitsplatz; Live-Abgleich wie unter „Aufgaben“. Kein zweites System.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

export function usePunkte(projektId) {
  const [aufgaben, setAufgaben] = useState([]); const [sendungen, setSendungen] = useState([]);
  const [geladen, setGeladen] = useState(false); const [fehler, setFehler] = useState(null);
  const timer = useRef(null);
  const holen = useCallback(async () => {
    if (!projektId) return;
    const [a, s] = await Promise.all([
      supabase.from("ws_aufgaben").select("id, titel, status, prioritaet, feature_id, beschreibung, erstellt, zustaendig").eq("projekt_id", projektId).not("feature_id", "is", null).order("id").limit(2000),
      supabase.from("ws_aufgabe_sendungen").select("id, aufgabe_id, feature_id, auftrag_id").eq("projekt_id", projektId).not("auftrag_id", "is", null).order("id").limit(5000),
    ]);
    if (a.error || s.error) { setFehler(a.error || s.error); return; }
    setAufgaben(a.data || []); setSendungen(s.data || []); setFehler(null); setGeladen(true);
  }, [projektId]);
  useEffect(() => {
    if (!projektId) return undefined;
    holen();
    const spaeter = () => { clearTimeout(timer.current); timer.current = setTimeout(holen, 300); };
    const ch = supabase.channel(`cs-punkte-${projektId}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ws_aufgaben", filter: `projekt_id=eq.${projektId}` }, spaeter)
      .on("postgres_changes", { event: "*", schema: "public", table: "ws_aufgabe_sendungen", filter: `projekt_id=eq.${projektId}` }, spaeter).subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(timer.current); };
  }, [holen, projektId]);
  return { aufgaben, sendungen, geladen, fehler, holen };
}

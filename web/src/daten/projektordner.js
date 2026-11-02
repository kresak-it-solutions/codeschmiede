// Projektordner (Entwurf 1.0 „Projektordner“, freigegeben von Gerhard 02.11.2026 07:04): Brücke zum Programm.
// Pfade liegen nur lokal im Programm (je PC) – die Oberfläche fragt den Stand ab und löst die Ordner-Auswahl des Systems aus,
// übergibt aber nie selbst einen Pfad. Im Browser (ohne Programm) gibt es keine Projektordner.
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop, tauri } from "../desktop";
import { supabase } from "../supabase";

/** Stand der Projektordner dieses PCs: { basis, basis_da, je: { [kennung]: { pfad, verknuepft, erreichbar, code, regeln } } }
 *  bzw. { ohne: "browser" } (kein Programm) oder { ohne: "alt" } (Programm älter als 0.13.0). */
export function useProjektordner(ids, takt = 15000) {
  const [stand, setStand] = useState(null);
  const schluessel = (ids || []).filter(Boolean).join(",");
  const aktuell = useRef(schluessel); aktuell.current = schluessel;
  const holen = useCallback(async () => {
    if (!isDesktop()) { setStand({ ohne: "browser" }); return; }
    const liste = schluessel ? schluessel.split(",") : [];
    try {
      const s = await tauri("ws_ordner_stand", { projekte: liste });
      if (aktuell.current === schluessel) setStand({ ...s, je: Object.fromEntries((s?.projekte || []).map((p) => [p.projekt, p])) });
    } catch (e) { setStand({ ohne: "alt", fehler: String(e?.message || e) }); }
  }, [schluessel]);
  useEffect(() => {
    holen();
    if (!isDesktop()) return undefined;
    const t = setInterval(holen, takt);
    return () => clearInterval(t);
  }, [holen, takt]);
  return [stand, holen];
}

export const basisWaehlen = () => tauri("ws_ordner_basis_waehlen");
/** Projektordner verknüpfen: <basis>\<kennung> bzw. mit eigener = true über die Ordner-Auswahl. regelnVon: "vorlage" | "leer" | Kennung | null. */
export const verknuepfen = (projekt, { eigener = false, regelnVon = null } = {}) => tauri("ws_ordner_verknuepfen", { projekt, eigener, regelnVon });
export const imExplorer = (projekt, unterordner = null) => tauri("ws_ordner_oeffnen", { projekt, unterordner });

/** Gemeldeter Stand aller Werkstatt-PCs zu einem Projekt (ws_projektordner_stand, Datenbank 0055) – ohne Pfade. */
export function useOrdnerStandDb(projektId) {
  const [zeilen, setZeilen] = useState([]);
  useEffect(() => {
    if (!projektId) return undefined;
    let aus = false;
    const holen = () => supabase.from("ws_projektordner_stand").select("pc_id, stand, konflikte, hinweis, geaendert").eq("projekt_id", projektId)
      .then(({ data, error }) => { if (!aus && !error) setZeilen(data || []); });
    holen();
    const ch = supabase.channel(`po-${projektId}-${Math.random()}`).on("postgres_changes", { event: "*", schema: "public", table: "ws_projektordner_stand" }, holen).subscribe();
    return () => { aus = true; supabase.removeChannel(ch); };
  }, [projektId]);
  return zeilen;
}

/** Trennzeichen für die Anzeige (Windows „\“, Mac „/“). */
export const trenner = (basis) => (String(basis || "").includes("\\") ? "\\" : "/");

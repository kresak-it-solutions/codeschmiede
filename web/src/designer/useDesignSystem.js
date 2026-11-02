// App-Designer 3.0: Design-System-Paket aus dem Projekt-Abgleich (ws_dokumente) laden – wie docs/BAUSTEINE.md in verzeichnis.js.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { DS_PFAD, designSystemLesen } from "../designSystem";

/** Lädt das Paket des Projekts aus dem Projekt-Abgleich. Ergebnis: undefined (lädt), null (keins), { daten, html, aktualisiert }. */
export function useDesignSystem(projektId) {
  const [ds, setDs] = useState(undefined);
  useEffect(() => {
    let aus = false; setDs(undefined);
    supabase.from("ws_dokumente").select("inhalt, aktualisiert").eq("projekt_id", projektId).eq("pfad", DS_PFAD).maybeSingle().then(({ data }) => {
      if (aus) return;
      const x = data ? designSystemLesen(data.inhalt) : null;
      setDs(x ? { ...x, aktualisiert: data.aktualisiert } : null);
    }, () => { if (!aus) setDs(null); });
    return () => { aus = true; };
  }, [projektId]);
  return ds;
}

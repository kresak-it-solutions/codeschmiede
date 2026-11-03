// Regelwerk erzwingen (0.19.0): Phasen, Entscheidungsprotokoll, Ideensammlung und Abweichungen eines Projekts (Datenbank 0063).
// Die Phasen-Liste ist eine Kopie von desktop/dienst/lib/regelwerk.mjs › PHASEN (Test regelwerk.test.mjs prüft, dass beide gleich sind).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

export const PHASEN = [
  { nr: 1, name: "Konzept", datei: "docs/01-konzept.md", pflicht: ["Die Geschichte (Anlass, Häufigkeit, wer leidet, was schon versucht wurde)", "Ein echter Tag mit der fertigen App", "Der Kern (die eine Sache)", "Der Markt (gibt es das schon, wer zahlt)", "Die Grenzen (was nie, Abbruchgrund)", "Zusammenfassung von Gerhard korrigiert"] },
  { nr: 2, name: "Kritische Prüfung", datei: "docs/02-pruefung.md", pflicht: ["Zusammenfassung in eigenen Worten", "Logik-Check", "Nutzer-Check", "Aufwand-Check", "Zukunfts-Check", "Ergebnisliste A/B/C – Stufe A leer"] },
  { nr: 3, name: "Designrichtung", datei: "docs/03-designrichtung.md", pflicht: ["Wirkung in drei Worten", "Vorbilder", "Umgebung", "Marke", "Lesbarkeit und Kontrast", "Dunkler Modus ja/nein", "2–3 Stilrichtungen, Gerhard wählt"] },
  { nr: 4, name: "Abläufe und Rollen", datei: "docs/04-ablaeufe-rollen.md", pflicht: ["Liste aller Abläufe (Anmelden bis Konto löschen)", "Jeder Ablauf als Geschichte", "Sonderfälle (gleichzeitig, kein Netz, Abbruch)", "Rollen-Tabelle sehen/anlegen/ändern/löschen", "Liste aller Bildschirme"] },
  { nr: 5, name: "Datenschutz", datei: "docs/05-datenschutz.md", pflicht: ["Datensparsamkeit", "Zustimmungen (Eltern bei Kindern, Fotos)", "Speicherdauer", "Löschen und Herausgabe", "Serverstandort (EU)", "Datenschutzerklärung und Impressum vorbereitet"] },
  { nr: 6, name: "Datenmodell", datei: "docs/06-datenmodell.md", pflicht: ["Begriffe definiert", "Tabellen mit Feldern, Pflicht, Werten, Standard", "Verknüpfungen und Löschen (archivieren statt löschen)", "Regeln und Zugriffsregeln aus der Rollentabelle", "Freigabe der Begriffe und Verknüpfungen (Diagramm)"] },
  { nr: 7, name: "Technik", datei: "docs/07-technik.md", pflicht: ["Plattform", "Offline", "Daten und Server, Sicherungen, Rücksicherung getestet", "Anmeldung", "Unabhängigkeit (Umzug-Aufwand)", "Kosten bei 10/100/1000 Nutzern", "Wartung"] },
  { nr: 8, name: "Detaildesign mit dem Baukasten", datei: "docs/08-design/", pflicht: ["Benötigte Bauteile aus den Abläufen", "Jedes Bauteil als Entwurf freigegeben", "Jeder Bildschirm als Entwurf aus Baukasten-Teilen freigegeben"] },
  { nr: 9, name: "Bauplan", datei: "docs/09-bauplan.md", pflicht: ["Fundament zuerst", "Senkrechte Scheiben", "Kleine Abschnitte", "Steckbrief je Abschnitt (Ziel, dazu, ausdrücklich nicht, Abhängigkeiten, Fertig-Kriterien)", "Risiko früh testen"] },
  { nr: 10, name: "Bauen", datei: null, pflicht: ["Je Auftrag genau ein Abschnitt laut Steckbrief", "Vorher Regelwerk, stand.md, Baukasten lesen", "Ehrlicher Bericht (was nicht getestet ist)", "stand.md und entscheidungen.md aktualisiert"] },
  { nr: 11, name: "Test und Abnahme", datei: null, pflicht: ["Gesamtdurchlauf aller Abläufe mit jeder Rolle", "Echte Bedingungen", "Fremde Tester", "Fehlerliste in drei Stufen, keine blockierenden Fehler"] },
  { nr: 12, name: "Veröffentlichung und Pflege", datei: "docs/versionen.md", pflicht: ["Sicherung erstellt", "Datenschutzerklärung und Impressum", "Fehlerüberwachung aktiv", "Rückweg vorbereitet", "versionen.md und fehler.md gepflegt"] },
];
export const KERNPFLICHTEN = [["phasen", "Phasen"], ["doku", "Doku-Pflicht"], ["kritik", "Kritische Prüfung"], ["regelpruefung", "Regel-Prüfung"]];
export const BAU_GESPERRT = "Bauen erst nach Freigabe von Phase 9 (Bauplan)";
export const phasenStand = (frei) => { const f = Math.max(0, Math.min(12, Number(frei) || 0)); return { frei: f, aktuell: Math.min(12, f + 1), bauen: f >= 9 }; };
export const EINWAND_ART = { sinn: "Sinn", risiko: "Risiko", fehlt: "Fehlende Angabe", widerspruch: "Widerspruch", phase: "Phase", regel: "Regel" };

/** Protokoll, Entscheidungen, Ideen und Abweichungen eines Projekts – mit Live-Abgleich. */
export function useRegelwerk(projektId) {
  const [daten, setDaten] = useState({ protokoll: [], entscheidungen: [], ideen: [], abweichungen: [] });
  const [fehler, setFehler] = useState(null); const [geladen, setGeladen] = useState(false);
  const timer = useRef(null);
  const holen = useCallback(async () => {
    if (!projektId) return;
    const [p, e, i, a] = await Promise.all([
      supabase.from("ws_phasen_protokoll").select("id, art, von_phase, bis_phase, begruendung, wer, wann").eq("projekt_id", projektId).order("id", { ascending: false }).limit(100),
      supabase.from("ws_entscheidungen").select("id, auftrag_id, art, text, begruendung, einwaende, wer, wann, im_repo").eq("projekt_id", projektId).order("id", { ascending: false }).limit(200),
      supabase.from("ws_ideen").select("id, titel, text, einstufung, herkunft, stand, vermerk, von, erstellt, im_repo").eq("projekt_id", projektId).order("id", { ascending: false }).limit(300),
      supabase.from("ws_kernpflicht_abweichungen").select("pflicht, begruendung, von, am").eq("projekt_id", projektId),
    ]);
    const f = p.error || e.error || i.error || a.error;
    if (f) { setFehler(f); setGeladen(true); return; }
    setDaten({ protokoll: p.data || [], entscheidungen: e.data || [], ideen: i.data || [], abweichungen: a.data || [] }); setFehler(null); setGeladen(true);
  }, [projektId]);
  useEffect(() => {
    if (!projektId) return undefined;
    holen();
    const spaeter = () => { clearTimeout(timer.current); timer.current = setTimeout(holen, 300); };
    let ch = supabase.channel(`cs-regelwerk-${projektId}-${Math.random()}`);
    for (const t of ["ws_phasen_protokoll", "ws_entscheidungen", "ws_ideen", "ws_kernpflicht_abweichungen"]) ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `projekt_id=eq.${projektId}` }, spaeter);
    ch.subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(timer.current); };
  }, [holen, projektId]);
  return { ...daten, fehler, geladen, holen };
}

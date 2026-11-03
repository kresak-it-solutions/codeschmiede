// Nachladen bei Realtime-Änderungen (0.18.0, Sicherheitsprüfung Punkt 3) – reine Hilfsfunktionen ohne Abhängigkeiten
// (geprüft in desktop/dienst/test/langeFragen.test.mjs).
export const NACHLADEN_MS = 300;
/** Bündelt schnelle Folgen von Aufrufen zu einem Aufruf nach `ms` (mit abbrechen()). */
export function verzoegert(fn, ms = NACHLADEN_MS) {
  let t = null;
  const f = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); };
  f.abbrechen = () => clearTimeout(t);
  return f;
}
/** Gehört eine Realtime-Änderung zu einem der Aufträge? (neue und alte Zeile, falls nur die Kennung kommt) */
// Löschungen tragen ohne REPLICA IDENTITY FULL nur den Schlüssel – dann sicherheitshalber nachladen.
export const gehoertZu = (menge, payload) => { const a = payload?.new?.auftrag_id ?? payload?.old?.auftrag_id; return a == null ? true : menge.has(Number(a)); };

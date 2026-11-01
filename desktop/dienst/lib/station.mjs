// Stationen (Sicherheitsprüfung, Feature-Prüfung) – Neustart nach Fehlern mit Pause und Obergrenze (Befund L1 vom 01.11.2026).
// Früher wurde eine Station mit Fehler alle 5 Sekunden ohne Grenze neu gestartet – mit jeweils einer neuen (teuren) Opus-Prüfung.

export const STATION_VERSUCHE = 3;                 // so viele neue Versuche nach einem Fehler, danach „angehalten“
export const STATION_PAUSEN_MIN = [1, 5, 30];      // Pause vor dem 1., 2., 3. neuen Versuch
export const STATION_HAENGT_MIN = 90;              // „läuft“ ohne Lebenszeichen gilt danach als abgestürzt

/** Neuer Stationswert nach einem Fehler: Zähler hoch, Pause bis „naechster“, nach STATION_VERSUCHE „angehalten“. Gemerkte Prüfung bleibt. */
export function stationNachFehler(alt = {}, befund = "", jetzt = Date.now()) {
  const versuche = (Number(alt.versuche) || 0) + 1;
  const behalten = alt.gepr_sha ? { gepr_sha: alt.gepr_sha, gepr_ki: alt.gepr_ki, gepr_befund: alt.gepr_befund } : {};
  if (alt.main_neu) behalten.main_neu = alt.main_neu;
  if (versuche > STATION_VERSUCHE) return { ergebnis: "angehalten", befund, versuche, ...behalten };
  const min = STATION_PAUSEN_MIN[Math.min(versuche, STATION_PAUSEN_MIN.length) - 1];
  return { ergebnis: "fehler", befund, versuche, naechster: new Date(jetzt + min * 60 * 1000).toISOString(), ...behalten };
}

/** Darf die Station jetzt (wieder) laufen? */
export function stationFaellig(p, jetzt = Date.now()) {
  if (!p) return true;
  if (p.ergebnis === "angehalten") return false;
  if (p.ergebnis === "laeuft") return !(jetzt - Date.parse(p.zeit) < STATION_HAENGT_MIN * 60 * 1000);
  if (p.ergebnis === "fehler" && p.naechster) return !(Date.parse(p.naechster) > jetzt);
  return true;
}

// Lange Fragen (0.18.0, Gerhard 03.11.2026 08:11: „Auf Fragen will ich so viel Text schreiben können, wie ich will.“)
// EINE Obergrenze für alle Eingaben, in die Fragen oder Aufträge geschrieben werden (Chats, Designer, Umdesign, Aufgaben, Antworten auf Rückfragen).
// Ganz ohne Grenze geht es nicht (Datenbank, Realtime, KI-Kontext). Gleicher Wert in der Datenbank (0062 › ws_text_max) und im Dienst (lib/ki.mjs › FRAGE_MAX).
export const TEXT_MAX = 200000;
/** Ab hier zeigt das Feld dezent die Zeichenzahl. */
export const ZAEHLER_AB = 8000;
const zahl = (n) => n.toLocaleString("de-AT");
/** Text des Zeichenzählers oder null (unter ZAEHLER_AB). */
export function zaehlerText(text, max = TEXT_MAX) {
  const n = String(text || "").length;
  return n < ZAEHLER_AB ? null : `${zahl(n)} / ${zahl(max)} Zeichen`;
}

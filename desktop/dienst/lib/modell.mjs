// Modellwahl nach Aufwand und Komplexität (Gerhard, 2026-10-22 13:18).
// klein = haiku, mittel = sonnet, groß = opus. Bei Fehlschlag eine Stufe höher; wird das Abo-Limit knapp, eine Stufe niedriger.
// Befund L6 (01.11.2026): nicht mehr nach dem Gruppennamen (in einer Kinderfußball-App steht „Kinder“ fast überall, die Gruppe
// „Anmeldung & Rechte“ hieß immer Opus) und ohne die Wörter „kinder“/„abo“. Nennt der Auftrag eine Risikostufe aus AGENTS.md
// („Risikostufe: KLEIN/NORMAL/HOCH/KRITISCH“), gilt sie vor den Schlüsselwörtern.
export const STUFEN = ["haiku", "sonnet", "opus"];

const GROSS = /\b(datenbank|migration|rls|rechte|berechtigung|login|anmeldung|passwort|sicherheit|datenschutz|dsgvo|zahlung|rechnung|ausbau|umbau|architektur|refactor|design 2\.0|designsystem)/i;
const KLEIN = /\b(text|tippfehler|rechtschreib|beschriftung|übersetz|farbe|symbol|icon|abstand|überschrift|hinweistext|formulierung)/i;
const RISIKO = /\brisikostufe\s*:?\s*(klein|normal|hoch|kritisch)\b/i;

// abo: „frei“ | „klein“ (Abo-Limit wird knapp → eine Stufe niedriger, mindestens klein)
// gruppenName bleibt als Parameter (ältere Aufrufer), zählt aber nicht mehr.
export function waehleModell(auftrag, { versuch = 0, abo = "frei" } = {}) {
  const text = `${auftrag.titel || ""} ${auftrag.text || ""}`;
  const risiko = RISIKO.exec(text)?.[1]?.toLowerCase();
  let stufe;
  if (risiko) stufe = { klein: 0, normal: 1, hoch: 2, kritisch: 2 }[risiko];
  else if (auftrag.art === "ausbauen" || GROSS.test(text)) stufe = 2;
  else if (auftrag.art === "text" || (KLEIN.test(text) && text.length < 200)) stufe = 0;
  else stufe = 1;
  let ziel = Math.min(STUFEN.length - 1, stufe + versuch);
  // Sicherheitsrelevantes (HOCH/KRITISCH) nie unter „mittel“, auch nicht bei knappem Abo
  if (abo === "klein") ziel = Math.max(risiko === "hoch" || risiko === "kritisch" ? 1 : 0, ziel - 1);
  return STUFEN[ziel];
}

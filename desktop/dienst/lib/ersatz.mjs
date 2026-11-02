// Rest des früheren Ersatz-Baus (ChatGPT als Ersatz beim Programmieren, 2026-10-23 bis 0.13.1). Seit 0.14.0 entfernt (Sicherheitsprüfung B11) –
// das Programmieren mit fremden Werkzeugen läuft über lib/werkzeuge.mjs und lib/werkzeugLauf.mjs. Übrig bleibt nur der PR-Text.

/** PR-Text aus fremdem Text: keine Erwähnungen/Verweise, als Codeblock (Prüfung 0.8.6 Hinweis). */
export function prText(text) {
  const t = String(text || "").replace(/```/g, "ˋˋˋ").replace(/@/g, "@\u200b").replace(/#(\d)/g, "#\u200b$1").slice(0, 3000);
  return "```text\n" + t + "\n```";
}

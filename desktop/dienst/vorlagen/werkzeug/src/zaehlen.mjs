/** Zählt Einträge je Kategorie – Beispiel-Logik, an dem die Tests zeigen, dass alles läuft. */
export function zaehlen(eintraege) {
  const r = {};
  for (const e of eintraege) r[e.kategorie] = (r[e.kategorie] || 0) + 1;
  return r;
}

/** Einfache CSV (Trennzeichen ; oder ,) mit Kopfzeile → Liste von Objekten. */
export function csvLesen(text) {
  const zeilen = String(text).replace(/\r\n?/g, "\n").split("\n").filter((z) => z.trim());
  if (!zeilen.length) return [];
  const trenner = zeilen[0].includes(";") ? ";" : ",";
  const kopf = zeilen[0].split(trenner).map((s) => s.trim());
  return zeilen.slice(1).map((z) => Object.fromEntries(z.split(trenner).map((w, i) => [kopf[i] ?? `spalte${i + 1}`, w.trim()])));
}

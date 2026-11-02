// Ein Arbeitsplatz für jede Art von Programm, Stufe 1 (Entwurf freigegeben von Gerhard 02.11.2026, docs/KONZEPT-ARBEITSPLATZ.md, Datenbank 0059).
// Reine Funktionen ohne Abhängigkeiten (getestet in desktop/dienst/test/arbeitsplatz.test.mjs):
//   ZIELE, zieleVon, zieleAusArt      – Ziele eines Projekts (web, handy_pwa, windows, mac, cloud_lauf, pdf) und in welcher Stufe sie rechts kommen
//   pruefwegVon, pruefwegFehler       – Prüfweg eines Features (Typ „seite“ = bisherige vorschau_pfad)
//   punktStatus, punkteMitStatus      – Status der offenen Punkte (= Aufgaben am Feature) aus verknüpften Aufträgen
//   featureStatus                     – Status-Punkt im Baum (läuft · offen · fertig · leer)
//   verlaufEintraege                  – Aufträge und Live-Schaltungen eines Features mit Zeit
//   diffZeilen                        – Zeilen eines Diffs für die Anzeige (hinzugefügt / entfernt / Abschnitt)
//   TECHNIK_EMPFEHLUNG                – Tabelle aus dem Entwurf für den Assistenten „Neues Projekt“

export const ZIELE = {
  web: { name: "Web", stufe: 1 },
  handy_pwa: { name: "Handy (PWA)", stufe: 1 },
  windows: { name: "Windows", stufe: 2 },
  mac: { name: "Mac", stufe: 2 },
  cloud_lauf: { name: "Cloud-Lauf", stufe: 3 },
  pdf: { name: "PDF", stufe: 3 },
};
export const ZIEL_REIHE = ["web", "handy_pwa", "windows", "mac", "cloud_lauf", "pdf"];

/** Vorbelegung aus der bisherigen Art (wie public.ws_ziele_aus_art). */
export function zieleAusArt(art) {
  return art === "handy" ? ["handy_pwa"] : art === "programm" ? ["windows", "mac"] : art === "werkzeug" ? ["cloud_lauf"] : ["web"];
}
/** Ziele eines Projekts: gespeicherte (nur erlaubte, ohne doppelte, Reihenfolge fest), sonst aus der Art. */
export function zieleVon(projekt) {
  const roh = Array.isArray(projekt?.ziele) ? projekt.ziele : [];
  const z = ZIEL_REIHE.filter((k) => roh.includes(k));
  return z.length ? z : zieleAusArt(projekt?.technik_art);
}

export const PRUEFWEG_TYPEN = {
  seite: { name: "Seite", beispiel: "/calendar" },
  fenster: { name: "Fenster", beispiel: "Hauptfenster › Pläne › Plan auslesen" },
  befehl: { name: "Befehl", beispiel: "abgleichen klein.csv" },
  kapitel: { name: "Kapitel", beispiel: "Kapitel 3 · Seite 12" },
};
/** Standard-Typ nach dem ersten Ziel des Projekts. */
export function standardTyp(ziele) {
  const z = ziele?.[0];
  return z === "windows" || z === "mac" ? "fenster" : z === "cloud_lauf" ? "befehl" : z === "pdf" ? "kapitel" : "seite";
}
/** Prüfweg eines Features: { typ, text, gesetzt }. Typ „seite“ liest die bisherige vorschau_pfad (kompatibel). */
export function pruefwegVon(feature, projekt) {
  const typ = PRUEFWEG_TYPEN[feature?.pruefweg_typ] ? feature.pruefweg_typ : standardTyp(zieleVon(projekt));
  const text = typ === "seite" ? feature?.vorschau_pfad || "" : feature?.pruefweg_typ === typ ? feature?.pruefweg_text || "" : "";
  return { typ, text, gesetzt: !!text };
}
// gleiche Regeln wie die Datenbank (0028 für Seiten, 0059 für den Text)
const SEITE = /^\/[A-Za-z0-9/_.~-]{0,150}(\?[A-Za-z0-9_=&.~%-]{0,150})?$/;
const UNSICHTBAR = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069\ufeff]/;
/** Fehlertext oder null. Leer bei „seite“ = Startseite des Projekts. */
export function pruefwegFehler(typ, text) {
  if (!PRUEFWEG_TYPEN[typ]) return "Unbekannter Prüfweg";
  const t = String(text ?? "").trim();
  if (typ === "seite") {
    if (!t) return null;
    if (!SEITE.test(t) || /(^|\/)\.\.(\/|$|\?)/.test(t) || t.startsWith("//") || /\/[A-Za-z0-9_-]{20,}/.test(t) || /\/[0-9]/.test(t))
      return "Seite bitte als Pfad wie /calendar (ohne Kennungen oder Zahlen im Pfad)";
    return null;
  }
  if (!t) return "Bitte kurz beschreiben, wie man das Feature ausprobiert";
  if (t.length > 200) return "Höchstens 200 Zeichen";
  if (UNSICHTBAR.test(t)) return "Bitte ohne Steuer- oder unsichtbare Zeichen";
  return null;
}

const FERTIG = ["wissen", "erledigt"];
/**
 * Status eines Punkts (Aufgabe am Feature): verknüpfter Auftrag läuft noch → „laeuft“; verknüpfter Auftrag live/erledigt → „erledigt“;
 * sonst der Status der Aufgabe (arbeit → „laeuft“). Abgebrochene bzw. unbekannte Aufträge zählen nicht. → { status, auftrag }
 */
export function punktStatus(aufgabe, sendungen = [], auftraege = []) {
  const ids = sendungen.filter((s) => s.aufgabe_id === aufgabe.id && s.auftrag_id).map((s) => s.auftrag_id);
  const verknuepft = auftraege.filter((a) => ids.includes(a.id) && a.stand !== "abgebrochen").sort((a, b) => b.id - a.id);
  const offen = verknuepft.find((a) => !FERTIG.includes(a.stand));
  if (aufgabe.status === "erledigt") return { status: "erledigt", auftrag: verknuepft[0] || null };
  if (offen) return { status: "laeuft", auftrag: offen };
  if (verknuepft.length) return { status: "erledigt", auftrag: verknuepft[0] };
  return { status: aufgabe.status === "arbeit" ? "laeuft" : "offen", auftrag: null };
}
/** Punkte eines Features mit Status, offene zuerst, dann laufende, dann erledigte (je nach Anlage). */
export function punkteMitStatus(aufgaben = [], featureId, sendungen = [], auftraege = []) {
  const rang = { laeuft: 0, offen: 1, erledigt: 2 };
  return aufgaben.filter((a) => a.feature_id === featureId)
    .map((a) => ({ ...a, status_aufgabe: a.status, ...punktStatus(a, sendungen, auftraege) }))
    .sort((a, b) => rang[a.status] - rang[b.status] || a.id - b.id);
}

/**
 * Status-Punkt vor dem Feature im Baum: „laeuft“ (blau, blinkt) = ein Auftrag läuft; „offen“ (orange) = offene Punkte;
 * „fertig“ (grün) = keine offenen Punkte und live bzw. alle Punkte erledigt; sonst „leer“ (grau).
 */
export function featureStatus(feature, auftraege = [], punkte = []) {
  if (auftraege.some((a) => a.feature_id === feature.id && a.stand === "laeuft")) return "laeuft";
  const eigene = punkte.filter((p) => p.feature_id === feature.id);
  if (eigene.some((p) => p.status !== "erledigt")) return "offen";
  if (feature.stand === "live" || eigene.length) return "fertig";
  return "leer";
}
export const STATUS_TEXT = { laeuft: "Auftrag läuft", offen: "offene Punkte", fertig: "fertig", leer: "noch nichts offen" };

const STAND_TEXT = { wartet: "wartet", laeuft: "in Arbeit", frage: "Rückfrage", freigabe: "zur Freigabe", sicherheit: "Sicherheitsprüfung", zusammen: "Zusammenführen", feature: "Feature-Prüfung", nacharbeit: "Nacharbeit", wissen: "live", erledigt: "erledigt", abgebrochen: "abgebrochen" };
/**
 * Verlauf eines Features: je Auftrag „angelegt“ und – wenn live – „live“ (Zeit der Live-Version mit diesem Commit, sonst letzte Änderung).
 * Neueste zuerst, höchstens `max`. → [{ zeit, art: "auftrag"|"live", auftrag, text }]
 */
export function verlaufEintraege(auftraege = [], featureId, versionen = [], max = 50) {
  const out = [];
  for (const a of auftraege.filter((x) => x.feature_id === featureId)) {
    out.push({ zeit: a.erstellt, art: "auftrag", auftrag: a.id, text: `Auftrag #${a.id}: ${a.titel} · ${STAND_TEXT[a.stand] || a.stand}` });
    if (a.stand === "wissen") {
      const v = a.live_commit ? versionen.find((x) => x.commit_sha === a.live_commit) : null;
      out.push({ zeit: v?.geschaltet || a.geaendert || a.erstellt, art: "live", auftrag: a.id, text: `#${a.id} live: ${a.titel}` });
    }
  }
  return out.filter((e) => e.zeit).sort((x, y) => new Date(y.zeit) - new Date(x.zeit) || (x.art === "live" ? -1 : 1)).slice(0, max);
}

/** Diff-Text einer Datei in Zeilen für die Anzeige: [{ art: "add"|"del"|"abschnitt"|"", text, nr }]. */
export function diffZeilen(zeilen) {
  if (typeof zeilen !== "string" || !zeilen) return [];
  return zeilen.split("\n").map((t, i) => ({ nr: i + 1, text: t, art: t.startsWith("@@") ? "abschnitt" : t.startsWith("+") ? "add" : t.startsWith("-") ? "del" : "" }));
}
export const DATEI_ART = { geaendert: "geändert", neu: "neu", geloescht: "gelöscht", binaer: "Binärdatei", ausgeblendet: "ausgeblendet", gross: "zu groß", verknuepfung: "Verknüpfung" };

/** Technik-Empfehlung aus dem Entwurf (Tabelle im Assistenten). art = vorgeschlagene Art des Grundgerüsts, ziele = Vorbelegung. */
export const TECHNIK_EMPFEHLUNG = [
  { wunsch: "Web-App oder Webseite", technik: "React + Vite, Testseite auf Cloudflare", vorschau: "Live-Vorschau", art: "web", ziele: ["web"] },
  { wunsch: "Handy-App", technik: "zuerst als PWA, für die Stores später Tauri Mobile oder Capacitor", vorschau: "Handy-Rahmen und QR-Code", art: "handy", ziele: ["handy_pwa"] },
  { wunsch: "Windows- und Mac-Programm", technik: "Tauri (wie die Codeschmiede selbst)", vorschau: "Stufe 1: Platzhalter · Stufe 2: Oberfläche als Testseite und Sandbox", art: "programm", ziele: ["windows", "mac"], vorschlag: true },
  { wunsch: "Alles zusammen", technik: "ein Code mit React + Vite, daraus Web, PWA und Tauri", vorschau: "Ziel-Umschalter rechts", art: "web", ziele: ["web", "handy_pwa", "windows", "mac"] },
  { wunsch: "Tief in Windows (Office, Geräte, Treiber, Altsysteme)", technik: "Sonderfall .NET (WinUI oder WPF)", vorschau: "Sandbox mit Bildschirmfotos (Stufe 3)", art: "programm", ziele: ["windows"], sonderfall: true },
  { wunsch: "Werkzeug, Skript, Dienst", technik: "Node oder Python, Läufe in der Cloud", vorschau: "Testlauf-Konsole (Stufe 3)", art: "werkzeug", ziele: ["cloud_lauf"] },
  { wunsch: "Dokumente (Handbuch, PDF-Layouts)", technik: "Markdown oder HTML, daraus PDF", vorschau: "Seiten-Vorschau (Stufe 3)", art: "werkzeug", ziele: ["pdf"] },
];

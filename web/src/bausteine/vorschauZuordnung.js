// Live-Vorschau: links folgt der Chat der Seite (0.13.2, Entwurf freigegeben von Gerhard 02.11.2026).
// Reine Funktionen ohne Abhängigkeiten (getestet in desktop/dienst/test/vorschauZuordnung.test.mjs):
//   pfadNorm   – Seitenpfad vergleichbar machen
//   zuordnung  – welches Feature gehört zur Seite, die rechts offen ist?
//   vorschlag  – bestes Feature nach Name/Kennung zum letzten Pfadteil, wenn noch nichts gemerkt ist
// Grundlage ist die gemerkte Seite des Features (ws_features.vorschau_pfad, Datenbank 0028).

/** Pfad vergleichbar machen: Pfad klein, ohne Schrägstrich am Ende, ohne „cs=…“ (Vorschau-Kennzeichen), Abfrage sortiert. */
export function pfadNorm(p) {
  if (typeof p !== "string" || !p.startsWith("/")) return null;
  const i = p.indexOf("?");
  const roh = i < 0 ? p : p.slice(0, i);
  const q = i < 0 ? "" : p.slice(i + 1);
  const pfad = (roh.replace(/\/+$/, "") || "/").toLowerCase();
  const teile = q.split("&").filter((x) => x && !/^cs(=|$)/.test(x)).sort();
  return teile.length ? `${pfad}?${teile.join("&")}` : pfad;
}
const nurPfad = (n) => (n ? n.split("?")[0] : null);

/** Features, deren gemerkte Seite zum Pfad passt: zuerst genau (mit Abfrage); sonst gemerkte Seite ohne Abfrage = Pfad ohne Abfrage. */
export function passendeFeatures(pfad, features) {
  const n = pfadNorm(pfad); if (!n) return [];
  const mit = features.filter((f) => f.vorschau_pfad && pfadNorm(f.vorschau_pfad) === n);
  if (mit.length) return mit;
  return features.filter((f) => { const m = pfadNorm(f.vorschau_pfad); return m && !m.includes("?") && m === nurPfad(n); });
}

const nutzbar = (f) => !f.ausgebaut && !f.ausgeblendet;

/** Wörter eines Textes: klein, Umlaute ausgeschrieben, nur a–z und 0–9. */
export function woerter(s) {
  return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .split(/[^a-z0-9]+/).filter(Boolean);
}
const flach = (s) => woerter(s).join("");

/** Suchbegriffe einer Seite: letzter Pfadteil, dazu die Werte der Abfrage (z. B. /platform-admin?m=vereine → „vereine“). */
export function pfadBegriffe(pfad) {
  const n = pfadNorm(pfad); if (!n) return [];
  const [p, q = ""] = n.split("?");
  const letzter = p.split("/").filter(Boolean).pop() || "";
  const werte = q.split("&").map((x) => x.split("=")[1] || "").map(decodeSicher);
  return [...new Set([letzter, ...werte].map(flach).filter((x) => x.length >= 2))];
}
function decodeSicher(s) { try { return decodeURIComponent(s); } catch { return s; } }

function bigramme(s) { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; }
/** Ähnlichkeit 0…1 (Dice über Buchstabenpaare). */
export function aehnlich(a, b) {
  if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const x = bigramme(a), y = bigramme(b); let gleich = 0;
  for (const [k, v] of x) gleich += Math.min(v, y.get(k) || 0);
  return (2 * gleich) / (a.length - 1 + b.length - 1);
}

/** Punkte eines Begriffs gegen einen Text (Name oder Kennung des Features). */
function punkteText(begriff, text) {
  const ganz = flach(text); if (!ganz || !begriff) return 0;
  if (ganz === begriff) return 100;
  if (ganz.length >= 3 && (ganz.startsWith(begriff) || begriff.startsWith(ganz))) return 80;
  if (ganz.length >= 3 && begriff.length >= 3 && (ganz.includes(begriff) || begriff.includes(ganz))) return 60;
  const w = woerter(text).filter((x) => x.length >= 3);
  if (w.some((x) => x === begriff)) return 70;
  if (w.some((x) => begriff.includes(x) || (begriff.length >= 4 && x.includes(begriff)))) return 45;
  return Math.round(aehnlich(begriff, ganz) * 35);
}

/**
 * Vorschlag für eine Seite ohne gemerktes Feature.
 * features: erlaubte Features; gruppen: erlaubte Gruppen (für app_key – passt der Menüpunkt der Gruppe, zählen ihre Features etwas mehr,
 * die Gruppe selbst wird nie vorgeschlagen); aktuelleGruppe: bei Gleichstand gewinnt deren Feature.
 * Rückgabe { feature, punkte, liste } – feature ist null, wenn nichts genug passt (mindestens 20 Punkte); liste = alle nach Punkten.
 */
export function vorschlag(pfad, features, { gruppen = [], aktuelleGruppe = null } = {}) {
  const begriffe = pfadBegriffe(pfad);
  const n = pfadNorm(pfad);
  const gruppeBonus = new Set(gruppen.filter((g) => g.app_key && begriffe.some((b) => b === flach(g.app_key) || aehnlich(b, flach(g.app_key)) >= 0.75)).map((g) => g.id));
  const liste = features.map((f) => {
    let p = 0;
    for (const b of begriffe) p = Math.max(p, punkteText(b, f.name), punkteText(b, f.id));
    if (gruppeBonus.has(f.gruppe_id)) p += 15;
    if (f.vorschau_pfad && pfadNorm(f.vorschau_pfad) !== n) p -= 15;   // hat schon eine andere Seite
    return { feature: f, punkte: p };
  }).sort((a, b) => b.punkte - a.punkte
    || (b.feature.gruppe_id === aktuelleGruppe) - (a.feature.gruppe_id === aktuelleGruppe)
    || String(a.feature.name).localeCompare(String(b.feature.name), "de"));
  const best = liste[0] && liste[0].punkte >= 20 ? liste[0] : null;
  return { feature: best?.feature || null, punkte: best?.punkte || 0, liste };
}

/**
 * Welches Feature gehört zur Seite? Nur der Menüpunkt Live-Vorschau nutzt das (nicht der Feature-Arbeitsplatz).
 *  pfad            – Seite, die rechts offen ist (vom Vorschau-Helfer: { cs: "seite", pfad })
 *  features        – alle Features des Projekts
 *  gruppen         – Gruppen, in denen ich Aufträge geben darf (darf(bereich, "auftraege"))
 *  gruppeId, featureId – was links gerade gewählt ist
 * Rückgabe { art, … }:
 *  "gleich"      – links ist schon ein passendes Feature gewählt (auch beim eigenen Startpfad: kein Wechsel)
 *  "wechsel"     – feature: genau ein passendes (bzw. das einzige passende in der gewählten Gruppe)
 *  "auswahl"     – kandidaten: mehrere passen, keines in der gewählten Gruppe eindeutig → Hinweis mit Auswahl
 *  "vorschlag"   – nichts gemerkt: vorschlag (oder null), auswahl = alle erlaubten Features
 *  "fremd"       – gemerkt, aber nur in Gruppen ohne mein Auftragsrecht → nichts tun
 *  "keine"       – ungültiger Pfad oder keine erlaubten Features → nichts tun
 */
export function zuordnung({ pfad, features = [], gruppen = [], gruppeId = null, featureId = null }) {
  if (!pfadNorm(pfad)) return { art: "keine" };
  const erlaubtG = new Set(gruppen.map((g) => g.id));
  const alle = features.filter(nutzbar);
  const erlaubt = alle.filter((f) => erlaubtG.has(f.gruppe_id));
  const treffer = passendeFeatures(pfad, erlaubt);
  if (treffer.length) {
    if (featureId && treffer.some((f) => f.id === featureId)) return { art: "gleich" };
    if (treffer.length === 1) return { art: "wechsel", feature: treffer[0] };
    const hier = treffer.filter((f) => f.gruppe_id === gruppeId);
    if (hier.length === 1) return { art: "wechsel", feature: hier[0] };
    const sortiert = [...treffer].sort((a, b) => (b.gruppe_id === gruppeId) - (a.gruppe_id === gruppeId) || String(a.name).localeCompare(String(b.name), "de"));
    return { art: "auswahl", kandidaten: sortiert };
  }
  if (passendeFeatures(pfad, alle).length) return { art: "fremd" };
  if (!erlaubt.length) return { art: "keine" };
  const v = vorschlag(pfad, erlaubt, { gruppen, aktuelleGruppe: gruppeId });
  return { art: "vorschlag", vorschlag: v.feature, auswahl: v.liste.map((x) => x.feature) };
}

/**
 * Nur angeklickte Seitenwechsel folgen (Nachbesserung 0.13.2): Nach jedem Laden des Vorschau-Rahmens (erstes Laden, „Neu laden“,
 * Gerätewechsel, „Zurück zur Feature-Seite“, Design-Wahl …) meldet der Vorschau-Helfer die geladene Seite einmal von selbst
 * (Antwort auf „hallo“, das die Codeschmiede im onLoad schickt). Diese erste Meldung je Laden wird nicht weitergereicht.
 *   geladen()      – im onLoad des Rahmens aufrufen
 *   folgen(pfad)   – true, wenn der Pfad links folgen soll
 */
export function seitenFilter() {
  let ersteOffen = true;
  return {
    geladen() { ersteOffen = true; },
    folgen(pfad) { if (!pfadNorm(pfad)) return false; if (ersteOffen) { ersteOffen = false; return false; } return true; },
  };
}

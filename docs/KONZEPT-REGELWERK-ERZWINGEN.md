# Regelwerk erzwingen (0.19.0)

Entscheidungen und Freigabe von Gerhard am 03.11.2026. Grundlage: `docs/ABGLEICH-REGELWERK-2026-11-03.md` (Abgleich der Regeldatei
`desktop/dienst/vorlagen/globale-regeln.md` mit der Codeschmiede 0.18.0). Datenbank **0063** (`supabase/migrations/0063_regelwerk_erzwingen.sql`,
Test `supabase/tests/t50_regelwerk_erzwingen.sql`), Dienst `desktop/dienst/lib/regelwerk.mjs`, Oberfläche `web/src/seiten/Phasen.jsx`,
`web/src/Entwurf.jsx`, `web/src/daten/regelwerk.js`.

Ziel: Die Kernpflichten der Regeldatei stehen nicht mehr nur im Prompt (Kategorie B/C im Abgleich), sondern werden von der Codeschmiede
technisch erzwungen – in der Datenbank, wo es geht, sonst im Dienst und in der Prüf-Station.

## 1. Kernpflichten (global fest)

| Kernpflicht | Was erzwungen wird | Wo |
|---|---|---|
| **Phasen** | Jedes Projekt hat Phase 1–12 (Namen nach §1). Bauen erst nach Freigabe von Phase 9. Phasen gibt nur der Admin frei. | Datenbank: `ws_projekte.phase_frei`, `ws_phasen_protokoll`, Trigger `ws_auftraege_regelwerk` |
| **Doku-Pflicht** | Gerüst nach §15; jeder Bau-Auftrag ergänzt `docs/stand.md`, Changelog- bzw. `versionen.md`-Zeile, bei Entscheidungen `docs/entscheidungen.md` | Dienst (Diff nach dem Lauf → Nacharbeit), Sicherheitsprüfung (Diff → rot), Ampel „Doku vollständig“ |
| **Kritische Prüfung** | Jeder Auftrag (außer Hand-Änderung) beginnt als **Entwurf**; eine zweite KI prüft; „Bauen“ erst danach | Datenbank (Stand `entwurf`, nur `ws_entwurf_entscheiden` startet), Dienst (`kritikArbeit`) |
| **Regel-Prüfung** | Prüf-Station mit Auftrag, Steckbrief und fester Checkliste; Kernpflicht-Verstoß hält das Zusammenführen auf | Dienst (`station`, `checklisteAuswerten`) |

**Rangfolge:** 1 Sicherheit › **1b Kernpflichten** › 2 Projektregeln (`regeln/REGELN.md`) › 3 globale Regeln › 4 Regelwerk/AGENTS.md. Projektregeln
dürfen ergänzen, Kernpflichten aber nur mit einer **begründeten, vom Admin bestätigten Abweichung** lockern (`ws_kernpflicht_abweichungen`,
`ws_abweichung_bestaetigen`, Begründung mindestens 20 Zeichen, Entscheidungsprotokoll). Die Konfliktprüfung `kernpflichtKonflikte` erkennt
REGELN.md-Zeilen wie „ohne Bauplan“, „sofort bauen“, „Doku ist optional“, „ohne kritische Prüfung“, „die globalen Regeln gelten nicht“
(Verneinung direkt davor hebt auf, Code-Blöcke ausgenommen). Ohne bestätigte Abweichung gilt die globale Pflicht und die Ampel „Kernpflichten“ ist
**rot** – ebenso, wenn es keine bestätigte Fassung der globalen Regeln gibt. Wirkung einer bestätigten Abweichung in 0.19.0: der Regel-Block nennt sie,
die Doku-Prüfung („doku“) wird zum Hinweis. Die harten Sperren der Datenbank (Phase 9, Entwurf) und die Prüf-Station bleiben bestehen.

## 2. Phasen

- **Stand:** `phase_frei` = Zahl der freigegebenen Phasen (0–12); aktuelle Phase = `phase_frei + 1`. Bauen erlaubt ab `phase_frei ≥ 9` (`ws_bau_erlaubt`).
- **Freigeben:** `ws_phase_freigeben(projekt, phase, begründung?)` – nur Admin, immer genau die nächste Phase, Protokoll + Entscheidungsprotokoll.
- **Kurzfassung §16:** `ws_phasen_kurzfassung(projekt, bis, begründung)` – nur Admin, mindestens zwei Phasen, Begründung ≥ 20 Zeichen.
- **Bestand:** trainer-to-go, codeschmiede und alle Projekte mit Live-Stand (`live_url`, `live_zweig` oder ein Auftrag „wissen“) → Phase 10
  „übernommen“, Protokoll „Bestand, Phasen 1–9 nachträglich als erledigt übernommen 03.11.2026“. Alle anderen und neue Projekte → Phase 1.
- **Eingelesene Projekte (0.16.0):** Die KI des Einlesens schreibt zusätzlich `PHASE: {"phase":n,"grund":"…"}`; die Werkstatt des Admins meldet
  den Vorschlag (`ws_phase_vorschlagen`, nur für Projekte mit Einlesen-Vorgang und ohne Freigaben), der Admin bestätigt (auch mit anderer Phase).
- **Phase-9-Sperre (alle Wege):** Trigger `ws_auftraege_regelwerk` auf `ws_auftraege`: Anlegen eines Bau-Auftrags, Entwurf → „wartet“ und jeder
  Wechsel nach „laeuft“ werden ohne freigegebene Phase 9 abgelehnt („Bauen erst nach Freigabe von Phase 9 (Bauplan)“). Das gilt für Zentrale,
  Konzept-Chat, Arbeitsplatz „Weiterarbeiten“, Aufgaben „Als Auftrag“, Designer, Fehlerliste, Regelwerk, Bezüge und Code-Editor (Hand-Auftrag).
  Der Dienst prüft zusätzlich vor dem Nehmen (Auftrag wartet mit diesem Hinweis) und bricht ab, wenn die Datenbank „laeuft“ ablehnt.
- **Ausnahme:** Einrichtungs- und Doku-Aufträge (`zweck = einrichtung | doku`) legt nur der Admin über `ws_einrichtung_auftrag` an und startet sie
  selbst mit „Bauen“ – auch vor Phase 9.
- **Pauschalfreigabe:** Ist Phase 9 frei, wird frei durchgebaut (Gerhards Pauschalfreigabe gilt) – die Entwurf-Entscheidung bleibt ein Klick.

## 3. Erst Entwurf, dann Klick

1. Jeder neue Auftrag außer Hand-Änderungen beginnt im Stand **`entwurf`** (der Trigger setzt ihn – auch wenn ein alter Weg „wartet“ schickt).
2. Die Werkstatt der Person, die ihn angelegt hat (oder des Admins), nimmt den Entwurf (`ws_kritik_nehmen`) und fragt die **zweite KI**
   (globale Aufgabe **„kritik“**, verpflichtend, kein Ausweichen). Voreinstellung: ein anderer Anbieter als der für „bauen“ aus der Prüf-Zuständigkeit,
   sonst die Prüf-Zuständigkeit. Geprüft wird gegen Gerhards Regeln, Kernpflichten und den Konzept-Stand: Sinn, Risiken, fehlende Angaben
   (Steckbrief), Widersprüche, Phase, Regeln. Ergebnis als Schlusszeile `KRITIK: {"ergebnis":"ok|einwaende","einwaende":[…]}`; ohne gültige Zeile gilt
   es als Einwand (nie still „ok“). Ist kein Anbieter nutzbar: „wartet auf …“, neuer Versuch nach 10 Minuten.
3. Die Einwände stehen am Entwurf (Auftrags-Chat, Konzept-Chat, Station „Entwürfe“). Gerhard entscheidet:
   **Bauen** (bei Einwänden nur der Admin und nur mit Begründung ≥ 10 Zeichen), **Ändern** (Text ergänzt den Auftrag, neue Prüfung) oder **Verwerfen**.
4. Jede Entscheidung steht automatisch im **Entscheidungsprotokoll** (`ws_entscheidungen`) und kommt über den nächsten Bau-Auftrag in
   `docs/entscheidungen.md` (`ws_doku_vormerken`; bei „Live & Wissen“ als im Repository vermerkt) – nie direkt auf main.

Der Konzept-Chat legt deshalb nur noch Entwürfe an (Prompt: „Entwürfe werden NICHT sofort gebaut …“).

## 4. Steckbrief, Ideen, Fertig-Meldung

- **Steckbrief Pflicht** für Bau-Vorschläge der KI (`AUFTRAG`, `AUFTRAEGE`): `ziel`, `umfang`, `nicht` (ausdrücklich nicht), `abhaengig`
  (Abhängigkeiten, ggf. „keine“), `abnahme` (Fertig-Kriterien inkl. Fehlerfälle) – Datenbank `ws_steckbrief_ok`/`ws_vorschlag_ok`, Dienst `steckbriefOk`.
  Fehlt etwas bei einem einzelnen Auftrag, erscheint „Steckbrief unvollständig“ als offener Punkt (Freigabe gesperrt).
- **Ideensammlung** `ws_ideen` (klein/mittel/groß, Stand offen/freigegeben/verworfen/umgesetzt, Vermerk „Braucht das wirklich jemand?“).
  Aufgaben und Features aus dem Gespräch (FEATURE-NEU) landen automatisch dort, Wünsche per „Festhalten“. Freigeben nur Admin. Spiegel nach
  `docs/ideen.md` über den nächsten Bau-Auftrag.
- **Fertig-Meldung:** Die Werkstatt schreibt „Nicht getestet:“ – fehlt das, ergänzt der Dienst einen ehrlichen Hinweis. Der Auftragstext verlangt
  keine Prüfungen mehr auf dem PC (Widerspruch zur Sicherheitsregel behoben, früher `index.mjs:546` „Prüfungen ausführen“).

## 5. Prüf-Station mit Auftrag

Sicherheits- und Feature-Prüfung bekommen den Auftragstext (alle Nachrichten von Gerhard/Team, Steuerzeilen entschärft), den Steckbrief, den
Phasen-Stand, den Stand der kritischen Prüfung und eine **feste Checkliste** (Fassung 0.19.0): `umfang`, `nicht`, `abnahme`, **`doku`**,
**`regeln`**, **`phase`** (Kernpflichten fett), `baukasten`, `bericht`. Je Punkt eine Zeile `CHECK <id>: OK|VERSTOSS|UNKLAR – …`.
Verstoß, „unklar“ oder fehlende Zeile bei einer Kernpflicht → **ROT** (Nacharbeit, nichts wird zusammengeführt); bei anderen Punkten orange Hinweis.
Zusätzlich hart (ohne KI): Phase 9 frei, Entwurf mit Entscheidung „Bauen“ (Altbestand ohne `kritik` ausgenommen), Doku im Diff.
**Neu prüfen bei geänderten Regeln:** Eine gemerkte grüne Prüfung gilt nur, wenn Zweig, main **und** der Regel-Stempel (globale Regeln, Projektregeln,
Abweichungen, Checklisten-Fassung) gleich geblieben sind.

## 6. Regeln überall vollständig

- Kachel-Chat bekommt die globalen Regeln vollständig (16.000 statt 4.000 Zeichen – vorher fehlten §5–§17, darunter Baukasten und Doku-Pflicht).
- Einlesen (Gruppen-Vorschlag) und Logo einlesen bekommen den Regel-Block ebenfalls.
- Jeder Regel-Block (Auftrag, Chat, Kachel, Prüfung) enthält **1b Kernpflichten** mit bestätigten Abweichungen und erkannten Konflikten.

## 7. Doku-Gerüst

`docs/01-konzept.md`, `02-pruefung.md`, `03-designrichtung.md`, `04-ablaeufe-rollen.md`, `05-datenschutz.md`, `06-datenmodell.md`,
`07-technik.md`, `08-design/` (mit `LIESMICH.md`), `09-bauplan.md`, `entscheidungen.md`, `ideen.md`, `fehler.md`, `versionen.md`, `stand.md`.
Neue Projekte bekommen es mit dem Grundgerüst (`lib/repo.mjs › geruestSchreiben`, `dokuGeruest`). Bestehende Projekte mit Repository und Phase ≥ 10
bekommen per Migration einmal den Entwurf **„Doku-Gerüst anlegen“** (zweck „einrichtung“, ohne kritische Prüfung, startet nur der Admin mit „Bauen“;
legt nur fehlende Dateien an, überschreibt nichts). Weitere Male über die Lampe „Doku vollständig“ › „Doku-Gerüst anlegen (Entwurf)“.
Jeder Bau-Auftrag bekommt `docs/stand.md` und `docs/entscheidungen.md` als Anhang (`.codeschmiede-anhaenge/doku/`).

## 8. Bewusst nicht in 0.19.0 (offen)

- Live-Tor: Datenschutzerklärung, Impressum und aktiver Fehler-Melder als Vorbedingung für Live (§14).
- Testgruppe / schrittweises Ausrollen (§13, §14), Rückmeldeknopf.
- Monatliche Pflege (Erinnerung, Plan).
- 2–3 Stilrichtungen als Pflicht in Phase 3 (§4).
- Neutraler Standard-Baukasten (der Katalog stammt aus Trainer to go) und Baukasten-Prüftor im Prüflauf (feste Farbwerte/Schriftgrößen).
- Fehlerliste mit drei Stufen in `ws_fehler`; Phasen-Dokumente werden nicht inhaltlich geprüft (nur ihr Vorhandensein).
- Technische Wirkung bestätigter Abweichungen für „phasen“, „kritik“, „regelpruefung“ (bisher nur Prompt und Ampel).

## Handbuch

**Phasenleiste (Zentrale, oben):** zeigt die 12 Phasen (grün = freigegeben, Ring = aktuell), „Bauen erst nach Freigabe von Phase 9 (Bauplan)“,
solange das gilt, und den Knopf **„Phase n freigeben“** (nur Admin; Pflichtpunkte werden im Dialog gezeigt, Begründung optional).
**Details:** Pflichtpunkte und Protokoll, Kurzfassung (§16), Kernpflichten mit Abweichungen, Entscheidungsprotokoll, Ideen.

**Entwürfe:** Was du in einem Chat als Auftrag gibst oder der Konzept-Chat anlegt, steht zuerst als **Entwurf** im Verlauf (gestrichelter Rahmen).
Die zweite KI prüft ihn in der Regel innerhalb einer Minute. Danach: **Bauen**, **Ändern** (neue Prüfung) oder **Verwerfen**. Mit Einwänden heißt der
Knopf „Trotzdem bauen …“ und braucht eine Begründung. Oben in der Zentrale führt „n Entwürfe prüfen“ zu allen offenen Entwürfen.

**Ampel (Projekt › Einrichten):** „Doku vollständig“ (grün = Gerüst komplett, gelb = Phasen-Dateien fehlen, rot = `stand.md` oder
`entscheidungen.md` fehlt) mit Knopf „Doku-Gerüst anlegen (Entwurf)“; „Kernpflichten“ (rot = REGELN.md hebt eine Kernpflicht ohne
bestätigte Abweichung auf oder globale Regeln nicht bestätigt, gelb = bestätigte Abweichung).

**KI-Anbieter (Globale Einstellungen):** neue Zuständigkeit **„Kritische Prüfung der Entwürfe“** – am besten ein anderer Anbieter als fürs Programmieren.

**Einspielen:** Datenbank 0063 spielt Gerhard selbst ein (steht bewusst nicht in `supabase/einspielen.txt`). Bis dahin arbeitet der Dienst wie bisher
(ohne Phasen, ohne Entwürfe); die Doku-Prüfung im Diff gilt schon.

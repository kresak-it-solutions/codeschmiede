# Abgleich: Gerhards globale Regeldatei ↔ Codeschmiede 0.18.0

Stand der Prüfung: 03.11.2026 · Codeschmiede `origin/main` = f95c3cb (0.18.0) · Regeldatei `desktop/dienst/vorlagen/globale-regeln.md` (identisch mit der Kopie `globale-regeln/CLAUDE.md`), 230 Zeilen, 13.425 Zeichen. Nur gelesen, nichts geändert.

## Vorab: Wie die Regeldatei überhaupt in die KI kommt

- **Ort und Geltung:** Die Datei ist die Startvorlage für `<Projekte-Ordner>\Regeln\CLAUDE.md`. Sie wird nur angelegt, wenn dort noch keine Datei liegt (`lib/projektordner.mjs:270–274`, `index.mjs:1005–1011`). Sie gilt **nur in der Fassung, die der Admin unter „Regelwerk › Globale Regeln“ bestätigt hat** (`index.mjs:983–1002`, Tabelle `ws_regeln_global_freigaben`, Migration 0056). Gibt es keine bestätigte Fassung, steht im Prompt „es gelten keine globalen Regeln“ (`lib/regeln.mjs:123–124`). Ob die heutige Fassung bestätigt ist, lässt sich aus dem Code nicht sehen. Das zeigt nur die Datenbank.
- **Rang:** In der Rangfolge steht sie an **Platz 3**: 1 Sicherheit (fest im Programm), 2 Projektregeln `regeln/REGELN.md`, 3 globale Regeln, 4 Regelwerk ai-dev-os und AGENTS.md (`lib/regeln.mjs:1–6`, `122`). **Projektregeln gehen ihr also vor.**
- **Schutz:** Die Werkstatt-KI kann `Regeln/**` nicht beschreiben (`index.mjs:605`, `globalSperre`, `lib/rechte.mjs`). Jede Fassung läuft durch die Konfliktprüfung gegen die Sicherheitsregeln (`konflikteFinden`, `lib/regeln.mjs:66`). Für die vorliegende Datei findet sie **0 Konflikte** (nachgeprüft).
- **Bau-Auftrag (Werkstatt):** `regelnFuerAuftrag` → `regelBlock` (`index.mjs:1043–1079`, `lib/regeln.mjs:131–157`). Grenze `GLOBAL_MAX` = 30.000, die Datei kommt also **vollständig** an. Zusätzlich liegt sie als Anhang `.codeschmiede-anhaenge/regeln/GLOBAL-CLAUDE.md` bei. Eingesetzt wird sie bei `REGELN_MARKE` (`index.mjs:635–650`). Bei Fortsetzung und Nacharbeit wird der Block ans Ende angehängt (`index.mjs:638`). Hand-Aufträge bekommen ihn bewusst nicht (`index.mjs:635`).
- **Chats und Prüfungen:** `regelnFuerText` → `regelBlockText` (`index.mjs:1025–1040`, `lib/regeln.mjs:200–223`), mit `GLOBAL_TEXT_MAX = { chat: 16000, pruefung: 16000, kachel: 4000 }`.
  - **chat / pruefung (16.000):** Die 13.425 Zeichen kommen **vollständig** an (nachgerechnet mit `regelnEntschaerfen`, keine Kürzung).
  - **kachel (4.000):** Gekürzt nach 4.000 Zeichen, mitten im ersten Satz von **§5 Phase 4** („… fragt gezielt nach vergessenen Abläufen“ bricht nach „Claude fr“ ab). Es **bleiben**: Kopf, §0 Grundhaltung, §1 Phasenliste, §2 Phase 1, §3 Phase 2, §4 Phase 3. Es **fallen weg**: §5 Abläufe/Rollen (fast ganz), §6 Datenschutz, §7 Datenmodell, §8 Technik, **§9 Baukasten**, §10 Bauplan, §11 Ideensammlung, §12 Bauen, §13 Test, §14 Veröffentlichung, **§15 Dokumentationspflicht**, §16 Anpassung, §17 Projektteil. Für den Kachel-Chat ist das ungünstig, denn gerade §9 (Baukasten) wäre dort die wichtigste Regel. Der Kürzungshinweis verweist auf „in Aufträgen vollständig als Anhang“, aber der Kachel-Chat kann keine Dateien lesen.
  - **REGELN_MAX_CHAT 6.000** (Prüfung: `max: 6000`, Kachel: `max: 3000`, Auftrag: `REGELN_MAX` 8.000) gilt **nur für die Projektregeln** `REGELN.md`, nicht für die globale Datei.
- **Abdeckung je KI-Weg:**

| KI-Weg | Regeln drin? | Stelle | Global vollständig? |
|---|---|---|---|
| Konzept-Chat (`ort=konzept`) | ja | `index.mjs:2424–2425` (`assistentPrompt`, `art:"chat"`) | ja (16.000) |
| Gruppen-, Feature- und Arbeitsplatz-Chat (`ort=gruppe:…`/`feature:…`, gleiche Funktion `claudeChat`) | ja | `index.mjs:2394–2428` | ja |
| Chat mit mehreren Unterhaltungen (`Chat.jsx`, `ort=konzept`) | ja | wie oben | ja |
| Designer-Chat, Umdesign, Baustein, Marke-Chat | ja | `index.mjs:2368`, `lib/design.mjs:31–42` | ja |
| Kachel-Chat (Seiten-Designer) | ja | `index.mjs:2360`, `lib/kachelChat.mjs:87` | **nein, gekürzt auf 4.000** |
| Werkstatt-Auftrag (Claude Code), auch aus Aufgaben, Designer- und Baustein-Aufträgen, Fehler-Aufträgen | ja | `index.mjs:620–650` | ja (30.000 + Anhang) |
| Fremde Werkzeuge (Codex, Gemini CLI, OpenCode) | ja, über dieselbe `prompt` per Standardeingabe | `index.mjs:622`, `1732–1747`; `lib/werkzeugLauf.mjs:276–286` | ja |
| Sicherheits- und Feature-Prüfung (Station) | ja | `index.mjs:1968–1985` | ja (16.000) |
| Fremde Prüfer (ChatGPT/Gemini) | ja (`prompt` + Diff) | `index.mjs:2000–2006` | ja |
| Prüfung per Knopf (Feature/Gruppe/App) | ja | `index.mjs:3207`, `lib/live.mjs:186–203` | ja |
| **Einlesen › Gruppen-Vorschlag** | **nein** | `index.mjs:2684`, `lib/einlesen.mjs:541–556` | – |
| **Logo/Marke einlesen** (`markePrompt`) | **nein** | `index.mjs:3256` | – |
| Hand-Auftrag (Code-Editor) | nein (gewollt, keine KI) | `index.mjs:635` | – |

## 1. Tabelle: Regel → Kategorie

A = von der Codeschmiede technisch erzwungen · B = steht nur im Prompt · C = fehlt oder widerspricht

| Regel (kurz, Abschnitt) | Kat. | Stelle bzw. Begründung |
|---|---|---|
| §Kopf: Datei wird zu Beginn jeder Sitzung zuerst eingelesen | B | Steht in jedem KI-Weg außer Einlesen/Marke im Prompt (siehe oben), aber an Rang 3, also **nicht** „zuerst“. Gilt nur, wenn die Fassung bestätigt ist. |
| §0 Kritisch hinterfragen, auch Regelwerk und eigene Vorschläge | B | Nur Prompt. Ähnlich in `lib/assistent.mjs:49` („Prüfe zuerst, ob das Vorhaben Sinn ergibt“). |
| §0 Nicht zustimmen, nur weil Geri es will; klar widersprechen | B | Nur Prompt. |
| §0 Strittiges ausdiskutieren, Ergebnis mit Begründung ins Entscheidungsprotokoll | C | Es gibt kein `docs/entscheidungen.md`. Entscheidungen landen als `WISSEN:`-Zeile in `ws_wissen` (nur nach „Ja“, `lib/assistent.mjs:60–61`), ohne Feld für verworfene Alternativen. |
| §0 Keine Phase beginnt ohne ausdrückliche Freigabe der vorigen | **C** | Die Codeschmiede kennt keine Phasen. „Phase“ kommt im Dienst-, Web- und Datenbank-Code nicht vor. |
| §0 Nichts bauen, bevor Phase 9 freigegeben ist | **C (Widerspruch)** | Der Konzept-Chat legt Aufträge **selbst** an, die Werkstatt baut sofort (`lib/assistent.mjs:39–41`, `index.mjs:2435–2438`, `ws_konzept_auftraege_anlegen` in 0048:105–153, Standard-Stand `wartet` in 0001:79). Aufträge entstehen außerdem direkt aus Zentrale, Verwaltung, Arbeitsplatz, Bezügen, Regelwerk, Designer und Aufgaben (`web/src/seiten/Zentrale.jsx:271`, `Verwaltung.jsx:20/67`, `Arbeitsplatz.jsx:291`, `Bezuege.jsx:107`, `Regelwerk.jsx:54`, `SeitenModus.jsx:128`). Keiner dieser Wege prüft einen Bauplan. |
| §0 Technisches in einfachen Worten | B | Prompt, zusätzlich `lib/assistent.mjs:49` („ohne Fachchinesisch“). |
| §1 12 Phasen, nach jeder Phase Dokument, Prüfung, Freigabe | C | Kein Phasenmodell, keine Phasendokumente, keine Phasenfreigabe. |
| §2 Phase 1 Konzept als Interview (Geschichte, Tag, Kern, Markt, Grenzen), zusammenfassen und korrigieren | B | Prompt. Der Konzept-Chat arbeitet stattdessen mit 7 Kapiteln (`KAPITEL`, `lib/assistent.mjs:6`) und Klick-Fragen (`FRAGEN`, höchstens 4). Das ist eher ein Fragebogen als ein bohrendes Interview, und Markt/Grenzen kommen als Kapitel nicht vor. |
| §2 Ergebnis docs/01-konzept.md | C | Das Ergebnis liegt in `ws_wissen` (Datenbank). Je Auftrag kommt `docs/konzepte/<datum>-<titel>.md` dazu (0048:139–140), also ein anderer Pfad und ein anderer Zuschnitt. |
| §3 Phase 2 Kritische Prüfung (Rollenwechsel, Checks, Liste A/B/C) | B | Nur Prompt. |
| §3 Freigabe erst, wenn Stufe A leer ist | C | Kein Gegenstück. Am nächsten kommt: Aufträge mit nicht leerem `konzept.offen` werden abgelehnt (A für diesen Teilaspekt: `ws_vorschlag_ok` 0048:61, `auftraegeAus` `lib/assistent.mjs:166`). |
| §3 docs/02-pruefung.md | C | Fehlt. |
| §4 Phase 3 Designrichtung (Wirkung, Vorbilder, Umgebung, Marke) | B | Prompt. Der Designer-Chat fragt Grunddesign ab (`lib/design.mjs:42ff.`). |
| §4 Lesbarkeit/Kontrast | A (teilweise) | Kontrastprüfung im Designer (`web/src/kontrast.js`, Test `desktop/dienst/test/kontrast.test.mjs`). Sie gilt nur für Design-Werte, nicht für gebauten Code. |
| §4 Dunkler Modus ja/nein | A (teilweise) | Hell/Dunkel ist im Designer und im Baustein-Katalog angelegt (`bausteinKatalog.js`). Eine Entscheidung „ja/nein“ je Projekt wird nicht verlangt. |
| §4 2–3 Stilrichtungen als Muster, Geri wählt | C | Kein Ablauf dafür. Design-Entwürfe (`ws_design_entwuerfe`) gibt es, aber ohne Pflicht zu Varianten. |
| §4 docs/03-designrichtung.md | C | Fehlt (Design liegt als Paket in der Datenbank). |
| §5 Phase 4 Abläufe als Geschichte, Sonderfälle, Rollen-Tabelle, Bildschirmliste | B | Nur Prompt; im Kachel-Chat fällt der Abschnitt weg. Der Konzept-Chat hat ein Kapitel „Abläufe & Rollen“ (`ablauf`), aber ohne Pflichtinhalt. |
| §5 docs/04-ablaeufe-rollen.md | C | Fehlt. |
| §6 Phase 5 Datenschutz als eigene Phase vor dem Datenmodell | C/B | Keine eigene Phase. Teilweise erzwungen ist Datenschutz anders: Sicherheitsregel „Keine Personendaten Dritter“ (`lib/regeln.mjs:12`), Feld `datenschutz` in der Konzeptkarte, Sicherheitsprüfung prüft DSGVO (Tor, siehe nächste Zeile). |
| §6 Datensparsamkeit, Einwilligung (Eltern), Löschfristen, Herausgabe, EU-Server | A (nur als KI-Prüftor) / B | Die Sicherheitsprüfung hat „Datenschutz (DSGVO, Daten von Kindern/Mitgliedern)“ ausdrücklich auf der Liste (`index.mjs:1973`), ROT sperrt das Zusammenführen. Ob Löschfristen und Einwilligungen konzipiert sind, prüft niemand. |
| §6 Datenschutzerklärung und Impressum vorbereiten | C | Kein Code prüft das (keine Fundstelle zu „Impressum“ im Dienst). |
| §6 docs/05-datenschutz.md | C | Die Codeschmiede verlangt stattdessen `docs/DATENSCHUTZ.md` für fremde Dienste (Sicherheitsregel, `lib/regeln.mjs:17`). Das ist ein anderer Name und ein anderer Zweck. |
| §7 Phase 6 Begriffe, Tabellen, Verknüpfungen, archivieren statt löschen | B | Nur Prompt. |
| §7 Regeln in der Datenbank, Zugriffsregeln aus Rollentabelle | A (nur als KI-Prüftor) | „Rechte und Row-Level-Security“ steht auf der Liste der Sicherheitsprüfung (`index.mjs:1973`). Gegen eine Rollentabelle wird nicht geprüft, weil es keine gibt. |
| §7 Änderungen nur über protokollierte Migrationen | A | Datenbank-Station spielt nur `supabase/migrations/` über den GitHub-Ablauf ein (`lib/datenbank.mjs:1–6`), Test automatisch, Live nach Freigabe. `supabase/einspielen.txt` ist gesperrt (`lib/regeln.mjs:18`, Werkzeug-Vorspann). Vor Live wird eine Aufbau-Sicherung angelegt (`lib/sicherungen.mjs`). |
| §7 Freigabe von Begriffen und Verknüpfungen als Diagramm | C | Fehlt. |
| §7 docs/06-datenmodell.md | C | Fehlt. |
| §8 Phase 7 Plattform, Offline, Server, Anmeldung, Unabhängigkeit, Kosten, Wartung | B | Prompt. Teilweise in der Oberfläche: Projektarten mit Technik-Empfehlung (`web/src/ProjektArten.jsx`). „Alles im eigenen Git-Repo“ ist durch die Projektanlage mit Repo erfüllt. |
| §8 Nichts Kostenpflichtiges ohne Bestätigung | B | Sicherheitsregel im Prompt (`lib/regeln.mjs:17`). Erzwungen nur an einzelnen Stellen (z. B. Cloudflare-Testseite nur gratis). |
| §8 Rücksicherung mindestens einmal testen | C | Fehlt. Sicherungen werden abgelegt (`lib/sicherungen.mjs`), ein Rücksicherungstest wird weder verlangt noch erfasst. |
| §8 docs/07-technik.md | C | Fehlt. |
| §9 Phase 8 Standard-Baukasten, einmal erarbeitet, in jedes Projekt übernommen | C/A (teilweise) | Es gibt einen Baustein-Katalog mit 25 Kennungen und Freigabe im Designer (`web/src/bausteinKatalog.js`, 0037/0054). Er ist aber **aus Trainer to go abgeleitet**, nicht als neutraler Standard angelegt. Von den 11 Bauteilgruppen fehlen Meldungen, Benachrichtigungen, Dialoge, Zustände (Laden/leer/offline) und Texte (Du/Sie, Tonfall) als Katalogbausteine. |
| §9 Jedes Bauteil als Entwurf zeigen, freigeben, nie neu erfinden | A (teilweise) | Werte der Design-Bausteine gelten erst nach Freigabe im Designer. Dass die Werkstatt sie auch **verwendet**, prüft niemand (B). |
| §9 Jeder Bildschirm als Entwurf aus Baukasten-Teilen freigeben | C | Der Seiten-Designer (Kacheln) erzeugt Design-Aufträge, eine Freigabe je Bildschirm vor dem Bau gibt es nicht. |
| §9 Baukasten-Änderung nur begründet und protokolliert | A (teilweise) | Änderungen laufen über Designer-Vorschläge mit „Ja“. Eine Begründung ist nicht Pflicht. |
| §9 docs/08-design/ | C | Fehlt (das Design-Paket liegt in der Datenbank). |
| §10 Phase 9 Fundament zuerst, senkrechte Scheiben, kleine Abschnitte | B | Nur Prompt. |
| §10 Steckbrief je Abschnitt (Ziel, gehört dazu, ausdrücklich nicht, Abhängigkeiten, Fertig-Kriterien) | B/C | Die Konzeptkarte hat `ziel`, `umfang`, `datenschutz`, `entscheidungen`, `offen`, `abnahme` (`konzeptAus`, `lib/assistent.mjs:131`, `ws_konzept_ok` 0012:113). Es **fehlen** „ausdrücklich nicht“ und „Abhängigkeiten“, und `abnahme` ist nicht Pflicht. |
| §10 Risiko früh (kleiner Versuch) | B | Nur Prompt. |
| §10 Kein heimliches Erweitern | B | Prompt. Die Prüfung bekommt den Auftragstext nicht und kann Umfang und Diff daher nicht vergleichen (siehe Prüf-Station). |
| §10 docs/09-bauplan.md | C | Fehlt. |
| §11 Ideensammlung docs/ideen.md mit Einstufung klein/mittel/groß | C | Fehlt. Ähnlich, aber anders: `FEATURE-NEU` braucht „Ja“ (A für das Anlegen von Features), dazu „Aufgaben“ (0042) ohne Einstufung. |
| §11 „Braucht das wirklich jemand?“ | B | Nur Prompt. |
| §12 Pro Sitzung genau ein Abschnitt, nichts nebenbei | B/C | Ein Auftrag ist ein Lauf (A im Groben). Der Konzept-Chat legt aber 1–5 Aufträge auf einmal an (bis 15 pro Stunde, 0048:122). |
| §12 Vor dem Bauen Regelwerk, stand.md, Baukasten, betroffene Dateien einlesen | B/C | Regelwerk liegt bei (A: steht immer im Auftrag). `docs/stand.md` wird nirgends verlangt oder beigelegt (C). Das Design-Paket liegt nicht bei, nur Baustein-Daten bei Baustein-Aufträgen (`bausteinDatenFuer`). |
| §12 Baukasten Pflicht; fehlendes Bauteil zuerst im Baukasten ergänzen | B | Nur Prompt, keine Kontrolle. |
| §12 Alles in Git, kleine Zwischenstände, jederzeit zurücksetzbar | A | Eigener Zweig je Auftrag (`index.mjs:457–475`), nie main (Sicherheitsregel + Ablauf), PR, Live-Zweig mit „Zurück“ (`lib/live.mjs:163–179`), Repo-Sicherung bei Live (`lib/sicherungen.mjs`). |
| §12 Selbst testen gegen die Fertig-Kriterien inkl. Fehlerfälle | A (teilweise) / Widerspruch | Erzwungen: alle GitHub-Prüfläufe müssen grün sein (`pruefTore`, `index.mjs:1962–1964`) und Bauen in der Cloud (`cloudBau`). **Nicht** gegen Fertig-Kriterien. Lokal testen verbietet die Sicherheitsregel („kein npm, node, Build oder Test“, `lib/regeln.mjs:15`). Der Auftragstext verlangt trotzdem „Prüfungen ausführen“ (`index.mjs:546`). |
| §12 Ehrlicher Bericht, kein „läuft alles“ ohne Beleg | B | Prompt. Die Werkstatt verlangt nur eine Änderungsliste und `ERGEBNIS-PR`. |
| §12 Geri testet und gibt frei, erst dann abgeschlossen | A | `ws_freigeben` mit Recht „freigeben“ (0032:114–131), dann Sicherheitsprüfung, Zusammenführen und Feature-Prüfung. Live nur durch den Admin (`lib/live.mjs`). Testseite je Zweig (`cfAlias`). |
| §12 Bei Problemen mit Konzept oder Datenmodell anhalten, gemeinsam entscheiden | B (Mechanik A) | `RÜCKFRAGE:` setzt den Auftrag auf `frage` und hält ihn an. Ob die KI das nutzt, entscheidet sie selbst. |
| §13 Phase 11 Gesamtdurchlauf aller Abläufe mit jeder Rolle | C | Fehlt. Die Prüfung „ganze App“ per Knopf (`lib/live.mjs:186`) ist eine Code-Prüfung, kein Durchlauf. |
| §13 Echte Bedingungen, fremde Tester, kleine Testphase für eine Gruppe | C | Fehlt. Es gibt nur Test und Live für alle. |
| §13 Rückmeldeknopf in der App | C | Fehlt. Der Fehler-Melder (0035) überträgt nur technische Meldungen, keine Rückmeldung von Nutzern. |
| §13 Claude als Ersatz-Tester | B | Nur Prompt. |
| §13 Fehlerliste in drei Stufen; Abnahme erst ohne blockierende Fehler | C | `ws_fehler` kennt nur `offen` usw., keine drei Stufen. Live wird bei offenen Fehlern nicht gesperrt, nur die Ampel zeigt sie (`index.mjs:2699–2706`). |
| §14 Checkliste vor Veröffentlichung: Sicherung | A (teilweise) | Die Sicherung entsteht **beim** Live-Schalten (`lib/sicherungen.mjs`), sie ist keine Vorbedingung. |
| §14 Datenschutzerklärung und Impressum vorhanden | C | Wird nicht geprüft. |
| §14 Fehlerüberwachung aktiv | C (nur Anzeige) | Die Ampel zeigt den Melder-Stand, Live wird dadurch nicht gesperrt. |
| §14 Rückweg auf alte Version vorbereitet | A | „Zurück“ auf frühere Live-Version, Datenbank-Abgleich (`lib/live.mjs:171–173`). |
| §14 Schrittweise ausrollen | C | Live gilt für alle auf einmal. |
| §14 Versionen in docs/versionen.md | C | Die Codeschmiede verlangt `docs/CHANGELOG.md` (`index.mjs:542`, `lib/projektordner.mjs:259`, Sicherheitsprüfung „fehlende Changelog-Zeile“). Das ist eine andere Datei. |
| §14 Fehler in docs/fehler.md mit drei Stufen | C | Fehler stehen in der Datenbank (`ws_fehler`), ohne Stufen. |
| §14 Pflege monatlich | C | Fehlt (keine Erinnerung, kein Plan). |
| §14 Änderungen nur über die Ideensammlung | C | Aufträge sind von vielen Stellen direkt möglich (siehe §0). |
| §15 CLAUDE.md im Git-Ordner = Regelwerk + Projektteil | C (Widerspruch) | Die globale Datei liegt **außerhalb** des Repos in `Regeln\CLAUDE.md`. Projektspezifisches gehört in `regeln/REGELN.md`. Fremde Werkzeuge dürfen `CLAUDE.md` nie ändern (`lib/werkzeuge.mjs:281`). |
| §15 docs/01–09, 08-design/, entscheidungen, ideen, fehler, versionen, stand | C | Der ganze Code enthält keinen dieser Pfade. Nichts legt sie an, nichts prüft sie, die Vorlagen (`vorlagen/web|handy|programm|werkzeug`) haben kein `docs/`. |
| §15 Sitzungsbeginn: CLAUDE.md und docs/stand.md lesen | B/C | CLAUDE.md: Der Prompt verweist auf „AGENTS.md/CLAUDE.md des Repositorys“ (`index.mjs:538`). Ob Claude Code bei `--setting-sources user` die CLAUDE.md des Repos selbst lädt, wurde **nicht geprüft**. `stand.md`: C. |
| §15 Sitzungsende: stand.md und entscheidungen.md aktualisieren | C | Wird nicht verlangt (Auftrag: nur CHANGELOG) und nicht geprüft. |
| §16 12 Phasen für jede Projektart, Gewicht verschiebt sich | B | Nur Prompt. |
| §16 Kurzfassung nur mit ausdrücklicher Freigabe und Eintrag im Protokoll | C | Fehlt. Eine Projektregel (Rang 2) kann die globale Datei **ohne** Freigabe und ohne Protokoll aushebeln. Die Konfliktprüfung vergleicht nur mit den Sicherheitsregeln. |
| §17 Projektteil je Projekt ausfüllen | C | Die Vorlage ist leer. Die Codeschmiede nutzt dafür `regeln/REGELN.md` (`regelnVorlage`, `lib/projektordner.mjs:250–260`), ohne die Felder Projektart, Normen, Abweichungen mit Begründung, Baukasten-Anpassung. Ob der Teil ausgefüllt ist, wird nicht geprüft. |

**Bilanz:** Nur einzelne Teilregeln sind voll **A**: Git/Zweig/PR, Freigabe vor dem Zusammenführen, Live nur durch den Admin, Rückweg, Migrationen. Dazu kommen einige **A (teilweise)**. Etwa die Hälfte der Regeln ist **B** (steht nur im Prompt). Alle Kernpflichten der Datei, also Phasen und Freigaben, Phase 9 vor dem Bau, Dokumentationspflicht, Ideensammlung, Abnahme und Rollout, sind **C**.

## Prüf-Station und Sicherheitsprüfung

- **Bekommt sie die Regeln?** Ja. Sicherheits- und Feature-Prüfung (`index.mjs:1968–1985`), Prüfung per Knopf (`lib/live.mjs:192`) und fremde Prüfer (`index.mjs:2005`) erhalten den Block mit `art:"pruefung"`, die globale Datei also vollständig (16.000). Projektregeln kommen bis 6.000 Zeichen.
- **Prüft sie gegen die Regeln?** Nur allgemein. Der Block sagt: „Verstöße gegen Projektregeln und globale Regeln meldest du als Befund (orange, rot wenn wesentlich)“ (`lib/regeln.mjs:204–205`). Die **ausdrückliche** Prüfliste umfasst aber nur Datenschutz, RLS, Anmeldung, Geheimnisse, Einschleusung, Bau-Dateien, offensichtliche Fehler und Changelog (Sicherheitsprüfung) bzw. Feature als Ganzes, Nachbarfunktionen, Datenschutz, Handbuch und Changelog (Feature-Prüfung).
- **Was ihr fehlt, um Regeln zu prüfen:**
  1. Sie bekommt **weder den Auftragstext noch Steckbrief oder Abnahme-Kriterien**, nur `#ID` und Feature-Name. „Kein heimliches Erweitern“ und „Fertig-Kriterien erfüllt“ kann sie deshalb nicht prüfen.
  2. Phasenfreigaben stehen nirgends, also kann sie sie auch nicht prüfen.
  3. Eine Prüfliste für `docs/stand.md`, `docs/entscheidungen.md`, `docs/01–09` und Baukasten-Nutzung fehlt.
- **Wirkung:** Die Regelprüfung hängt vom Urteil des Modells ab. Mögliche Folgen sind uneinheitliche Ergebnisse: Ein strenges Modell könnte jeden PR wegen „kein docs/09-bauplan.md“ rot werten, ein anderes ignoriert das. Ein einmal grün geprüfter Stand wird nicht neu geprüft, solange Zweig und main gleich bleiben (`index.mjs:1992`). Nach einer neuen Regel-Bestätigung wird also nicht nachgeprüft.

## 2. Die zehn wichtigsten Lücken (nach Gewicht) mit Vorschlag

1. **Bauen ohne freigegebenen Bauplan (§0, §10).** Konzept-Chat und alle anderen Wege legen Aufträge an, die sofort gebaut werden.
   - *Datenbank:* Tabelle `ws_projekt_phasen` (projekt_id, phase 1–12, stand `offen|entwurf|freigegeben|uebersprungen`, dokument_pfad, sha, freigegeben_von/am, begruendung). Prüfung in `ws_auftrag_nehmen` bzw. per Trigger beim Einfügen in `ws_auftraege`: Arten `neu/aendern/ausbauen` nur, wenn Phase 9 freigegeben ist oder eine protokollierte Kurzfassung (§16) vorliegt.
   - *Dienst:* `fuehreAus` bricht mit Rückfrage ab, wenn die Bedingung fehlt.
   - *Oberfläche:* Phasenleiste je Projekt mit Knopf „Phase freigeben“ (nur Admin).
2. **Konzept-Chat baut selbsttätig (§0, §3).**
   - *Dienst:* Den Automatik-Aufruf `ws_konzept_auftraege_anlegen` (`index.mjs:2435–2439`) entfernen oder nur bei freigegebener Phase 9 zulassen.
   - *Prompt:* `lib/assistent.mjs:39–41` an die Regeln anpassen („schlägt vor, Gerhard gibt frei“).
   - *Datenbank:* Aufträge aus dem Konzept zuerst im Stand `entwurf`, sichtbar, Start erst auf Klick.
3. **Dokumentationspflicht ohne Durchsetzung (§15).**
   - *Projektanlage:* Gerüst `docs/01-konzept.md … 09-bauplan.md`, `08-design/`, `entscheidungen.md`, `ideen.md`, `fehler.md`, `versionen.md`, `stand.md` in die Vorlagen (`vorlagen/*`) aufnehmen.
   - *Dienst:* Nach dem Lauf prüfen, ob der Diff `docs/stand.md` und `docs/entscheidungen.md` ändert, sonst automatische Nacharbeit wie bei Prüf-Befunden. `docs/stand.md` und das betroffene Phasendokument jedem Auftrag als Anhang mitgeben.
   - *Oberfläche:* Ampel „Doku vollständig“ unter Anbindungen.
4. **Prüfung kennt den Auftrag nicht (§10, §12).**
   - *Dienst:* Auftragstext, Konzeptkarte (ziel, umfang, nicht, abnahme) und Baukasten-Auszug in die Prompts der Sicherheits- und Feature-Prüfung aufnehmen. Ausdrückliche Regel-Checkliste anhängen (Umfang eingehalten, Fertig-Kriterien inkl. Fehlerfälle, Doku aktualisiert, Baukasten genutzt). Ergebnis je Punkt als feste Zeile, die der Dienst auswertet. Pflichtpunkt rot = ROT.
5. **Steckbrief unvollständig (§10).**
   - *Datenbank:* `ws_konzept_ok` um `nicht` (ausdrücklich nicht dazu) und `abhaengig` erweitern. `abnahme` (mindestens 1 Punkt, inkl. Fehlerfall) für Bauaufträge zur Pflicht machen (`ws_vorschlag_ok`, Anlage-RPCs).
   - *Oberfläche:* Steckbrief-Formular beim Anlegen von Hand.
6. **Ideensammlung fehlt (§11, §14).**
   - *Datenbank:* `ws_ideen` (Einstufung klein/mittel/groß, Prüfvermerk „braucht das jemand?“, Stand, Bezug). `FEATURE-NEU`, Aufgaben und „Als Auftrag“ landen zuerst dort.
   - *Ablauf:* Aufträge bei „mittel“ und „groß“ nur nach Mini-Phasen bzw. vollen Phasen.
   - *Dienst:* Ein Spiegel nach `docs/ideen.md` hält das Repo aktuell.
7. **Rangfolge hebelt die globalen Regeln aus (§16, §17).** `REGELN.md` (Rang 2) kann die 12 Phasen still außer Kraft setzen.
   - *Dienst:* Zusätzliche Konfliktprüfung REGELN.md ↔ globale Regeln für die Kernpflichten (Phasen, Freigaben, Doku). Abweichungen nur mit Abschnitt „Abweichungen (mit Begründung)“ und Eintrag ins Entscheidungsprotokoll.
   - *Oberfläche:* Abweichungen gelb unter Anbindungen.
   - *Hinweis:* Rot, wenn keine bestätigte Fassung der globalen Regeln existiert (sonst gelten sie gar nicht).
8. **Abnahme und Veröffentlichung ohne Tor (§13, §14).**
   - *Datenbank:* `ws_fehler` um die Stufe `blockiert|bald|schoenheit` erweitern.
   - *Dienst:* `liveAusfuehren` sperrt bei offenen blockierenden Fehlern, fehlender Datenschutzerklärung oder fehlendem Impressum (Dateiprüfung im Repo bzw. Route), fehlendem aktiven Fehler-Melder und fehlender Sicherung **vor** dem Schalten.
   - *Später:* Stufenweises Ausrollen (Test-Gruppe) und Rückmeldeknopf als Vorlage-Baustein.
9. **Kachel-Chat bekommt nur §0–§4 (Kürzung 4.000).**
   - *Dienst:* Statt der ersten 4.000 Zeichen einen Auszug je Art senden. Für Kachel/Design: §0, §4 Designrichtung, §9 Baukasten (≈ 3.000 Zeichen). Für Prüfungen alles. Alternativ `GLOBAL_TEXT_MAX.kachel` auf 16.000 anheben. Der Kürzungshinweis „vollständig als Anhang“ sollte im Kachel-Chat entfallen.
10. **Wege ohne Regeln, Baukasten-Pflicht ungeprüft.**
    - *Dienst:* `regelnFuerText(..., {art:"chat"})` auch in `gruppenPrompt` (Einlesen, `index.mjs:2684`) und `markePrompt` (`index.mjs:3256`) einsetzen.
    - *Baukasten:* Prüftor im Prüflauf (z. B. Lint-Regel bzw. Diff-Prüfung auf feste Farbwerte und Schriftgrößen außerhalb der Design-Tokens) und fehlende Bauteilgruppen (Meldungen, Dialoge, Zustände, Benachrichtigungen, Texte) im Katalog ergänzen.

## 3. Konflikte zwischen Regeldatei und tatsächlicher Arbeitsweise

Neutral benannt. Quellen: Code der Codeschmiede und Gerhards gespeicherte Arbeitsweisen (Projekt-Gedächtnis „preferences“/„codeschmiede“).

1. **Freigabe je Phase ↔ Pauschalfreigabe.** Die Datei sagt „Keine Phase beginnt ohne ausdrückliche Freigabe“ und „nichts bauen vor Phase 9“ (§0). Gerhard hat am 02.11.2026 erklärt: „Mach einfach weiter. Du kannst alles ohne meine Freigabe erledigen. Ist alles freigegeben“. Am 01.11.2026 sagte er beim Umbau: „nicht nachfragen, alles der Reihe nach umbauen, zusammenführen und live schalten“. Beide Aussagen stammen aus dem Gedächtnis. Die Datei trägt dasselbe Datum (02.11.2026) und verlangt das Gegenteil.
2. **Pauschale PR-Freigabe ↔ „Geri testet und gibt frei“.** §12 verlangt Gerhards Test und Freigabe je Abschnitt. Gespeichert ist „Ich gebe alle PR somit frei“ (22.10.2026, dauerhaft). Die Codeschmiede verlangt technisch weiter **je Auftrag** einen Freigabe-Klick (`ws_freigeben`), den aber jede Person mit Recht „freigeben“ geben darf, nicht nur Gerhard.
3. **Konzept-Chat „legt Aufträge selbst an, die sofort gebaut werden“ ↔ §0/§10.** So steht es im Prompt (`lib/assistent.mjs:39–41`) und entspricht Gerhards Wunsch vom 26.10.2026 („KI klärt und legt danach die Aufträge an“). Im selben Prompt steht davor die globale Regel „nichts bauen vor Phase 9“. Die KI bekommt zwei gegensätzliche Anweisungen.
4. **Rangfolge.** Die Datei versteht sich als das Regelwerk, das „zuerst eingelesen“ wird, mit Projektteil am Ende (§Kopf, §17). In der Codeschmiede steht sie an Rang 3, hinter `regeln/REGELN.md`, die nach Gerhards Entscheidung vom 02.11.2026 Vorrang hat. Projektbesonderheiten gehören dort in `REGELN.md`, nicht in §17.
5. **Kurzfassung nur mit Freigabe (§16) ↔ Projektregeln mit Vorrang.** Eine Projektregel kann die Phasen ohne Freigabe und ohne Protokoll weglassen.
6. **Ort der Regeldatei (§15) ↔ Projektordner-Modell.** Die Datei verlangt `CLAUDE.md` mit Regelwerk und Projektteil **im Git-Ordner** jedes Projekts. Die Codeschmiede hält sie zentral in `D:\Codeschmiede\Regeln\CLAUDE.md`, und Werkzeuge dürfen `CLAUDE.md` im Repo nicht ändern. Bei Trainer to go verweist `CLAUDE.md` nur auf `AGENTS.md`.
7. **Dokumentpfade.** Die Datei verlangt `docs/01–09`, `entscheidungen.md`, `stand.md`, `ideen.md`, `fehler.md`, `versionen.md`. In Gebrauch sind `docs/CHANGELOG.md`, `docs/konzepte/<datum>-<titel>.md`, `docs/DATENSCHUTZ.md`, `docs/product/FEATURE-REGISTRY.md`, `docs/WISSEN.md` sowie die Datenbank (`ws_wissen`, `ws_fehler`). Bei Trainer to go regeln das AGENTS.md und `00-REGELN-FUER-ALLE-CHATS.md`.
8. **Selbst testen (§12) ↔ Sicherheitsregel.** Die Datei will Tests gegen Fertig-Kriterien. Die Sicherheitsregel verbietet npm, Build und Test auf dem PC. Getestet wird nur in GitHub/Cloudflare. Der Auftragstext sagt Claude Code trotzdem „Prüfungen ausführen“ (`index.mjs:546`), was der Sicherheitsregel widerspricht.
9. **Ein Abschnitt pro Sitzung (§12) ↔ Sammelaufträge.** Der Konzept-Chat legt 1–5 Aufträge auf einmal an. Gerhard hat Stufenumbauten „ohne Einzelmeldung“ gewünscht (01.11.2026, Gedächtnis).
10. **Designrichtung mit 2–3 Varianten und neutraler Standard-Baukasten (§4, §9) ↔ gelebter Stand.** Für Trainer to go ist das Design-Konzept 2.0 seit 01.11.2026 verbindlich (Gedächtnis). Der Baustein-Katalog der Codeschmiede trägt die Kennungen von Trainer to go (`bausteinKatalog.js:1`). Einen projektneutralen Baukasten, der in jedes neue Projekt kopiert wird, gibt es nicht.
11. **Änderungen nur über die Ideensammlung (§14) ↔ „Knöpfe statt Handarbeit“.** Gerhard wollte direkte Aufträge aus Zentrale, Arbeitsplatz und Fehlerliste („Als Auftrag“). Die Codeschmiede setzt das so um.
12. **Schrittweise ausrollen und Testgruppe (§13, §14) ↔ Test/Live-Modell.** Die Codeschmiede kennt nur „Testfassung“ und „Live für alle“, so wie am 22./23.10.2026 entschieden.
13. **Adressat.** Die Datei spricht „Claude“ und „Geri“ an. Die Codeschmiede leitet sie auch an ChatGPT, Gemini, Codex und OpenCode weiter und nennt ihn überall „Gerhard“. Inhaltlich harmlos, aber fremde Modelle könnten Regeln, die an „Claude“ gerichtet sind, als nicht für sich geltend lesen.
14. **Widerspruchspflicht (§0) ↔ „nicht nachfragen“.** Die Datei will kritisches Hinterfragen und Ausdiskutieren. Die gespeicherte Arbeitsweise vom 01./02.11.2026 will Durchbauen ohne Rückfragen.

## Hinweise zur Prüfung

- Nicht geprüft: ob die aktuelle Datei in der Datenbank bestätigt ist (`ws_regeln_global_freigaben`). Ohne Bestätigung gilt sie in **keinem** Weg.
- Nicht geprüft: ob Claude Code mit `--setting-sources user` die `CLAUDE.md` eines Repos von selbst lädt.
- `git checkout origin/main` wurde wie verlangt ausgeführt (HEAD steht jetzt losgelöst auf f95c3cb). Im Arbeitsordner gab es keine lokalen Änderungen, es wurde nichts geändert.

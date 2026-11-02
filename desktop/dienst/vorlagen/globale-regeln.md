# CLAUDE.md – Allgemeines Regelwerk für App-Projekte

Stand: 02.11.2026 · Gilt für alle App-Projekte von Geri (groß oder klein, Web, Handy oder Windows/Mac).

Diese Datei wird zu Beginn jeder Sitzung zuerst eingelesen. Sie besteht aus einem allgemeinen Teil (gilt überall gleich) und einem Projektteil am Ende (Besonderheiten des jeweiligen Projekts).

## 0. Grundhaltung von Claude

- Claude arbeitet als erfahrener Entwickler, Designer und Konzepter und hinterfragt alles kritisch – auch die eigenen Vorschläge und dieses Regelwerk.
- Claude stimmt nicht zu, nur weil Geri etwas will. Hält Claude etwas für falsch, sagt Claude es klar und begründet es.
- Strittige Punkte werden ausdiskutiert, bis sie fallen oder bleiben. Das Ergebnis kommt mit Begründung ins Entscheidungsprotokoll.
- Keine Phase beginnt, bevor die vorige von Geri ausdrücklich freigegeben wurde.
- Es wird nichts gebaut, bevor Phase 9 (Bauplan) freigegeben ist.
- Technische Erklärungen gegenüber Geri immer in einfachen Worten.

## 1. Ablauf in 12 Phasen

1. Konzept
2. Kritische Prüfung
3. Designrichtung
4. Abläufe und Rollen
5. Datenschutz
6. Datenmodell
7. Technik
8. Detaildesign mit dem Baukasten
9. Bauplan
10. Bauen
11. Test und Abnahme
12. Veröffentlichung und Pflege

Nach jeder Phase: Ergebnis-Dokument, kritische Prüfung durch Claude, Freigabe durch Geri.

## 2. Phase 1 – Konzept

Kein Fragebogen, sondern ein Interview, das immer tiefer bohrt. Noch keine Rollen, keine Technik.

- **Die Geschichte:** Wie kam es zur Idee? Was ist passiert? Wie oft kommt das Problem vor, wer leidet am meisten darunter, was wurde schon versucht und warum reichte es nicht?
- **Ein echter Tag:** Einen typischen Tag mit der fertigen App durchspielen. Wer öffnet sie wann, was passiert als Erstes? Claude achtet auf Brüche und Stellen wie „das ergibt sich dann“ – dort fehlt etwas.
- **Der Kern:** Wenn die App nur eine einzige Sache könnte – welche?
- **Der Markt:** Gibt es das schon? Warum würde jemand diese App nehmen? Wer zahlt, wie viel?
- **Die Grenzen:** Was soll die App auf keinen Fall werden? Was wäre ein Grund zum Abbruch?
- Nach jeder Antwort fasst Claude zusammen, Geri korrigiert, bis es stimmt.

Ergebnis: docs/01-konzept.md

## 3. Phase 2 – Kritische Prüfung

Claude wechselt bewusst die Rolle und versucht, das Konzept „kaputtzumachen“, damit es hält.

- **Zusammenfassung** in eigenen Worten – Missverständnisse werden sofort sichtbar.
- **Logik-Check:** Passt alles zusammen? Widersprüche aufzeigen (z. B. „ganz einfach“ vs. „zwanzig Funktionen“).
- **Nutzer-Check:** In die Rolle skeptischer Nutzer schlüpfen (wenig Zeit, wenig Technikverständnis).
- **Aufwand-Check:** Was ist teuer, schwierig, riskant? Wo steht der Aufwand in keinem Verhältnis zum Nutzen?
- **Zukunfts-Check:** Was passiert bei viel mehr Nutzern, mehr Kunden, mehr Anforderungen?
- **Ergebnisliste in drei Stufen:** (A) muss vor dem Weitergehen geklärt sein, (B) Risiko im Auge behalten, (C) Hinweis.
- Freigabe erst, wenn Stufe A leer ist.

Ergebnis: docs/02-pruefung.md

## 4. Phase 3 – Designrichtung

Das Design entscheidet mit, ob die App genutzt und gekauft wird. Hier wird zuerst die Richtung festgelegt, das Detail folgt in Phase 8.

- **Wirkung:** Mit welchen drei Worten soll man die App beim ersten Öffnen beschreiben?
- **Vorbilder:** Welche Apps gefallen, was genau daran? Welche sind furchtbar?
- **Umgebung:** Wo wird die App benutzt (Sonne, Kälte, Handschuhe, Büro, großer Bildschirm)?
- **Marke:** Vorhandene Logos, Vereins- oder Firmenfarben.
- **Lesbarkeit:** Ausreichender Kontrast und Schriftgröße, auch für Menschen, die schlecht sehen.
- **Dunkler Modus:** ja oder nein.
- Claude erstellt zwei bis drei unterschiedliche Stilrichtungen als Muster, Geri wählt eine.
- Claude weist kritisch darauf hin, wenn etwas schön, aber schlecht bedienbar oder lesbar ist.

Ergebnis: docs/03-designrichtung.md

## 5. Phase 4 – Abläufe und Rollen

- **Liste aller Abläufe** vom ersten Anmelden bis zum Löschen des Kontos. Claude fragt gezielt nach vergessenen Abläufen (Passwort vergessen, jemand verlässt die Organisation, falscher Eintrag, Gerät verloren).
- **Jeder Ablauf als Geschichte:** Auslöser, Schritte, mögliche Fehler, Ende.
- **Sonderfälle:** gleichzeitige Änderungen, kein Netz, Abbruch mittendrin.
- **Erst danach die Rollen:** Aus den Abläufen ergibt sich, wer was braucht. Pro Rolle eine Tabelle: sehen, anlegen, ändern, löschen – für jede Art von Daten.
- Claude prüft kritisch, ob jede Rolle wirklich nötig ist.
- Aus den Abläufen ergibt sich die Liste aller Bildschirme für Phase 8.

Ergebnis: docs/04-ablaeufe-rollen.md

## 6. Phase 5 – Datenschutz

Eigene Phase, zwingend vor dem Datenmodell.

- Welche Daten sind wirklich nötig (Datensparsamkeit)?
- Wer muss zustimmen? Bei Kindern die Eltern. Einwilligungen z. B. für Fotos.
- Wie lange werden Daten gespeichert?
- Wie werden Daten gelöscht oder auf Anfrage herausgegeben?
- Wo stehen die Server (bevorzugt EU)?
- Datenschutzerklärung und Impressum vorbereiten.

Ergebnis: docs/05-datenschutz.md

## 7. Phase 6 – Datenmodell

Das Fundament. Hier entscheidet sich, ob die App sauber wächst.

- **Begriffe:** Jedes „Ding“ bekommt eine genaue Definition (z. B. ab wann ist jemand ein „Spieler“, ein „Kunde“, ein „Auftrag“).
- **Tabellen:** Name, alle Felder mit Typ, Pflicht ja/nein, erlaubte Werte, Standardwert. Feste Namensregeln, überall gleich.
- **Verknüpfungen:** Wer gehört zu wem? Was passiert beim Löschen? Grundsatz: lieber archivieren statt löschen.
- **Regeln in der Datenbank:** Prüfungen, damit kein Unsinn gespeichert wird; Zugriffsregeln abgeleitet aus der Rollentabelle.
- **Zukunft:** Das Modell darf Erweiterungen (zweite Organisation, zweite Sprache) nicht verbauen – sie werden aber nicht vorab gebaut.
- **Änderungen** nur über protokollierte Migrationen.
- **Freigabe:** Geri gibt Begriffe und Verknüpfungen frei (als Diagramm). Die Felddetails verantwortet Claude. Hat ein Detail spürbare Folgen (z. B. später schwer änderbar), erklärt Claude es vorher in einfachen Worten.

Ergebnis: docs/06-datenmodell.md

## 8. Phase 7 – Technik

- **Plattform:** Web-App oder Store-App oder Desktop-Programm – mit Vor- und Nachteilen. Meist zuerst Web-App.
- **Offline:** Genau klären, was ohne Netz gehen muss. Nur lesen ist einfach, offline ändern ist aufwendig (Abgleichkonflikte).
- **Daten und Server:** Standort, Sicherungen (wie oft, wer), Rücksicherung mindestens einmal testen.
- **Anmeldung:** Passwort, E-Mail-Code oder fremder Login; einfacher Zugang für Gelegenheitsnutzer.
- **Unabhängigkeit:** Standardtechnik statt Speziallösungen, alles im eigenen Git-Repository, Daten jederzeit exportierbar. Leitfrage: Wie viel Arbeit wäre ein Umzug? (Lehre aus Base44.)
- **Kosten:** bei 10, 100 und 1000 Nutzern; Grenzen der Gratis-Angebote kennen.
- **Wartung:** Wer aktualisiert, wie werden Fehler gemeldet und gefunden?
- **Passend für Geri:** Technik, die nur ein Profi warten kann, ist die falsche Wahl.

Ergebnis: docs/07-technik.md

## 9. Phase 8 – Detaildesign mit dem Baukasten

Es gibt einen **Standard-Baukasten**, der einmal gründlich erarbeitet und in jedes Projekt übernommen wird. Pro Projekt wird nur angepasst, was anders sein muss (z. B. Farben, Logo).

Jedes Bauteil wird als Entwurf gezeigt, Geri sagt „so“ oder „anders“, bis es freigegeben ist. Danach wird es nie wieder neu erfunden.

Bauteile:

1. **Grundlagen:** Farben und ihre feste Bedeutung, Schriften und Größen, Abstände, Ecken, Schatten, Symbole
2. **Grundgerüst:** Kopfzeile, Menü, Seitenaufbau für Handy und PC
3. **Knöpfe:** Haupt-, Neben-, Lösch-Knopf; Zustände gedrückt und gesperrt
4. **Eingabemasken:** Textfelder, Auswahllisten, Datum, Schalter, Pflichtfelder, Fehlermeldung am Feld
5. **Tabellen und Listen:** Kopfzeile, Sortieren, Filtern, Suchen, Antippen einer Zeile, Darstellung am Handy
6. **Meldungen:** Fehler, Warnung, Erfolg, Info – feste Farbe, Symbol, Position
7. **Benachrichtigungen:** Hinweise am Bildschirmrand, Push-Nachrichten, Zahlen-Abzeichen
8. **Dialoge:** Sicherheitsabfragen, Fenster, Seitenfelder
9. **Zustände:** Laden, leere Liste, kein Internet
10. **Karten und Übersichten:** Kacheln, Dashboard, Diagramme
11. **Texte:** Du oder Sie, Tonfall, Beschriftung von Knöpfen

Regeln:

- Welche Bauteile ein Projekt braucht, ergibt sich aus den Abläufen (Phase 4), nicht umgekehrt.
- Danach wird jeder Bildschirm als Entwurf aus Baukasten-Teilen gezeigt und freigegeben.
- Änderungen am Baukasten nur begründet, protokolliert und dann überall gleich umgesetzt.

Ergebnis: docs/08-design/ (Baukasten + Bildschirmentwürfe)

## 10. Phase 9 – Bauplan

- **Fundament zuerst:** Projektordner, Git, Datenbank mit Grundtabellen, Anmeldung, Grundgerüst aus dem Baukasten.
- **Senkrechte Scheiben:** Jede Funktion komplett von der Datenbank bis zum Bildschirm bauen, damit nach jedem Abschnitt etwas Fertiges zum Ausprobieren da ist.
- **Kleine Abschnitte:** in ein bis zwei Sitzungen fertig; zu große werden geteilt.
- **Steckbrief je Abschnitt:** Ziel, was dazugehört, was ausdrücklich nicht, Abhängigkeiten, Fertig-Kriterien (inkl. Fehlerfälle).
- **Risiko früh:** Schwierigstes (z. B. Offline, fremde Schnittstellen) zuerst in einem kleinen Versuch testen.
- **Kein heimliches Erweitern:** Neue Ideen kommen in die Ideensammlung, nie nebenbei mitbauen.

Ergebnis: docs/09-bauplan.md

## 11. Ideensammlung

Jede neue Idee kommt in docs/ideen.md und wird eingestuft:

- **Klein** (z. B. zusätzliches Feld, andere Sortierung): kurze Prüfung, ob es zum Konzept passt und nichts beschädigt → Freigabe → nächster passender Bauabschnitt.
- **Mittel** (neue Funktion mit eigenem Bildschirm): Phasen im Kleinen – Kurzkonzept, Prüfung, Ablauf, Datenmodell, Design aus dem Baukasten.
- **Groß** (neuer Bereich, z. B. Abrechnung): wie ein eigenes Projekt mit allen Phasen.
- Bei jeder Idee fragt Claude: Braucht das wirklich jemand oder ist es nur schön?

## 12. Phase 10 – Bauen

- Pro Sitzung genau ein Abschnitt laut Steckbrief, nichts nebenbei.
- Vor dem Bauen: Regelwerk, Stand-Dokument, Baukasten und betroffene Dateien einlesen – nicht aus dem Gedächtnis arbeiten.
- Baukasten ist Pflicht. Fehlt ein Bauteil, wird es zuerst im Baukasten ergänzt und freigegeben.
- Alles in Git, kleine Zwischenstände, jederzeit zurücksetzbar.
- Selbst testen gegen die Fertig-Kriterien, inklusive Fehlerfälle.
- Ehrlicher Bericht: was fertig ist, was nicht, was aufgefallen ist, wo Unsicherheit besteht. Kein „läuft alles“ ohne Beleg.
- Geri testet und gibt frei – erst dann ist der Abschnitt abgeschlossen.
- Zeigt sich beim Bauen, dass Konzept oder Datenmodell nicht aufgehen: anhalten, nicht eigenmächtig umbauen, gemeinsam entscheiden.

## 13. Phase 11 – Test und Abnahme

- **Gesamtdurchlauf** aller Abläufe aus Phase 4 mit jeder Rolle, inklusive Sonderfälle.
- **Echte Bedingungen:** echtes Gerät, draußen, schlechtes Netz, realistische Datenmengen.
- **Fremde Tester:** Personen aus dem Umfeld (z. B. Kollegen, Eltern), 10 Minuten mit drei Aufgaben; beobachten, wo sie hängen bleiben.
- **Kleine Testphase:** zuerst nur für eine Gruppe freigeben.
- **Rückmeldeknopf** in der App.
- **Claude als Ersatz-Tester:** versetzt sich in typische Nutzer – ersetzt aber keine echten Menschen.
- **Fehlerliste in drei Stufen:** blockiert die Veröffentlichung / bald beheben / Schönheitsfehler.
- Abnahme durch Geri erst, wenn keine blockierenden Fehler offen sind.

## 14. Phase 12 – Veröffentlichung und Pflege

- **Checkliste vor Veröffentlichung:** Sicherung erstellt, Datenschutzerklärung und Impressum vorhanden, Fehlerüberwachung aktiv, Rückweg auf alte Version vorbereitet.
- Lieber schrittweise ausrollen als für alle auf einmal.
- **Versionen:** Nummer und kurze Neuerungsliste in einfacher Sprache (docs/versionen.md).
- **Fehler:** in docs/fehler.md mit den drei Stufen; schwere sofort beheben.
- **Pflege monatlich:** Updates, Sicherungen prüfen, Kosten und Nutzung ansehen.
- **Änderungen** nur über die Ideensammlung – nie schnell an der laufenden App herumändern.

## 15. Dokumentation – Pflicht

Claude vergisst zwischen den Sitzungen alles, was nicht aufgeschrieben ist. Deshalb liegt pro Projekt im Git-Ordner:

- **CLAUDE.md** – dieses Regelwerk + Projektteil
- **docs/01-konzept.md bis docs/09-bauplan.md** – ein Dokument pro Phase
- **docs/08-design/** – Baukasten und Bildschirmentwürfe
- **docs/entscheidungen.md** – was entschieden wurde, warum, was verworfen wurde
- **docs/ideen.md, docs/fehler.md, docs/versionen.md**
- **docs/stand.md** – wo wir stehen, was als Nächstes kommt, was offen ist

Regel: Am Anfang jeder Sitzung liest Claude CLAUDE.md und docs/stand.md. Am Ende jeder Sitzung aktualisiert Claude docs/stand.md und docs/entscheidungen.md.

## 16. Anpassung an Projektart und -größe

- Die 12 Phasen gelten für jede Art von App (Web, Handy, Windows/Mac, ERP, Planungsprogramme). Das Gewicht verschiebt sich je nach Projekt (z. B. ERP: Datenmodell; Aufmaß-Programme: Normen wie ÖNORM/DIN).
- Besonderheiten stehen im Projektteil unten.
- **Kurzfassung** für kleine Werkzeuge ist erlaubt, aber nur mit ausdrücklicher Freigabe durch Geri und Eintrag im Entscheidungsprotokoll.

## 17. Projektteil (pro Projekt ausfüllen)

- **Projektname:**
- **Projektart und Plattform:**
- **Besonderheiten (Normen, Schnittstellen, Branche):**
- **Abweichungen vom allgemeinen Regelwerk (mit Begründung):**
- **Projektspezifische Baukasten-Anpassungen (Farben, Logo):**

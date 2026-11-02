# Ein Arbeitsplatz für jede Art von Programm

**Stand:** 2026-11-02 · **Wer:** Gerhard Kresak (Entscheidungen, Entwurf freigegeben 02.11.2026), Claude (Konzept, Umsetzung)
**Entwurf:** `docs/entwurf-1.0-arbeitsplatz-alle-arten.html` · **Version:** vorläufig 0.15.0 (Stufe 1; 0.14.0 entsteht parallel, die endgültige Nummer wird beim Zusammenführen gesetzt)
**Datenbank:** 0059 (`supabase/migrations/0059_arbeitsplatz.sql`, Test `supabase/tests/t46_arbeitsplatz.sql`; 0057 und 0058 sind für parallele Features reserviert)
**Umgesetzt (Stufe 1):** `web/src/seiten/Arbeitsplatz.jsx` (Baum, Punkte, Prüfweg, rechte Hälfte), `web/src/bausteine/arbeitsplatz.js` (reine Funktionen,
Test `desktop/dienst/test/arbeitsplatz.test.mjs`), `web/src/daten/punkte.js`, `desktop/dienst/lib/codeLive.mjs` (Diff-Filter, Test `codeLive.test.mjs`),
Einbau in `seiten/LiveVorschau.jsx` (`FeatureArbeitsplatz`), `seiten/Zentrale.jsx` (`AuftragsChat`, Status-Punkte), `bausteine/chat.jsx`, `ProjektArten.jsx`, `desktop/dienst/index.mjs`.

## Ziel
Der Feature-Arbeitsplatz der Codeschmiede war auf Web-Apps zugeschnitten: links der Chat, rechts die Testseite. Gerhard baut aber auch
Windows-/Mac-Programme (Thermax Planer), Handy-Apps, Werkzeuge und Dokumente. Ab jetzt gibt es **einen Arbeitsplatz für jede Art**:
links die Zentrale mit dem Baum, in der Mitte die offenen Punkte des Features und der Chat, rechts drei Ansichten (Vorschau, Code live, Verlauf).
Was sich je Art ändert, ist nur der **Prüfweg** – also wie man das Feature ausprobiert – und die Vorschau rechts.

## Gerhards Entscheidungen (02.11.2026)
| Thema | Entscheidung |
|---|---|
| Baum | Bereich › Gruppe › Feature ist für **alle Arten gleich** (auch Programme, Werkzeuge, Dokumente). |
| Namen | Überall dieselben Namen (Bereich, Gruppe, Feature, Auftrag, offener Punkt). Was sich je Art ändert, heißt **Prüfweg**: Seite (Web/Handy), Fenster (Programm), Befehl (Werkzeug), Kapitel (Dokument). |
| Windows/Mac | **Tauri** ist der Standard (wie die Codeschmiede selbst; derselbe React-Code läuft auch als Web/PWA). **.NET** (WinUI/WPF) nur als Sonderfall, wenn es tief in Windows geht (Office, Geräte, Treiber, Altsysteme). |
| Ziele | Ein Projekt kann **mehrere Ziele** haben: Web, Handy (PWA), Windows, Mac, Cloud-Lauf, PDF. Rechts gibt es dann einen Ziel-Umschalter. |
| Rechts | Drei Ansichten mit Umschalter: **Vorschau** (was du baust) · **Code live** (welche Dateien die Werkstatt gerade ändert, Zeile für Zeile) · **Verlauf** (Aufträge und Live-Schaltungen des Features). |
| Mitte | Die **offenen Punkte** des Features über dem Chat. Klick auf einen Punkt: Der Chat bezieht sich darauf. **„Weiterarbeiten“** gibt genau diesen Punkt als Auftrag an die Werkstatt, **„Fragen“** klärt nur (die KI antwortet, gebaut wird nichts). |
| Baum-Status | Vor jedem Feature steht ein Punkt: **blau blinkend** = ein Auftrag läuft, **orange** = offene Punkte, **grün** = fertig (keine offenen Punkte). Bei „Bewegung reduzieren“ (prefers-reduced-motion) blinkt nichts. |

## Technik-Empfehlung beim neuen Projekt
| Du willst | Empfohlene Technik | Vorschau rechts | Ziele |
|---|---|---|---|
| Web-App oder Webseite | React + Vite, Testseite auf Cloudflare | Live-Vorschau | web |
| Handy-App | zuerst als PWA; für die Stores später Tauri Mobile oder Capacitor | Handy-Rahmen und QR-Code (QR in Stufe 3) | handy_pwa |
| Windows- und Mac-Programm | **Tauri** (wie die Codeschmiede selbst) | Stufe 1: Platzhalter mit Sandbox-Knopf und Builds · Stufe 2: Oberfläche als Testseite und Sandbox mit Bildschirmfoto | windows, mac |
| Alles zusammen | ein Code mit React + Vite, daraus Web, PWA und Tauri | Ziel-Umschalter rechts | web, handy_pwa, windows, mac |
| Tief in Windows (Office, Geräte, Treiber, Altsysteme) | Sonderfall **.NET** (WinUI oder WPF) | Sandbox mit Bildschirmfotos (Stufe 3) | windows |
| Werkzeug, Skript, Dienst | Node oder Python, Läufe in der Cloud | Testlauf-Konsole (Stufe 3; heute: Knopf „Testlauf“) | cloud_lauf |
| Dokumente (Handbuch, PDF-Layouts) | Markdown oder HTML, daraus PDF | Seiten-Vorschau (Stufe 3) | pdf |

Der Assistent „Neues Projekt“ zeigt diese Tabelle als Hilfe bei der Wahl der Art, mit **Mehrfachwahl der Ziele** und Tauri als Vorschlag für
Windows/Mac. Die bisherige Art (`technik_art`: web · programm · handy · werkzeug) bleibt für Grundgerüst, Ampel und Anbindungen bestehen; die Ziele
kommen dazu. Vorbelegung aus der Art: web → web · handy → handy_pwa · programm → windows, mac · werkzeug → cloud_lauf.

## Aufbau des Arbeitsplatzes
```
┌ Zentrale (Baum) ─┬ Mitte ───────────────────────────┬ Rechts ─────────────────────────────┐
│ Bereich          │ Feature · Prüfweg (bearbeitbar)  │ [Vorschau | Code live | Verlauf]     │
│  Gruppe          │ Offene Punkte (offen/läuft/erl.) │ Vorschau: Ziel-Umschalter, Testseite │
│   ● Feature      │ Chat (Bezug: Feature · Punkt)    │ Code live: Dateien, Diff, Schritte   │
│                  │ [Weiterarbeiten] [Fragen]        │ Verlauf: Aufträge, Live mit Zeit     │
└──────────────────┴──────────────────────────────────┴──────────────────────────────────────┘
```
Im Programm bleibt die Zentrale links als eigene Ansicht (Baum mit Status-Punkten); der Arbeitsplatz öffnet sich wie bisher per Doppelklick und hat Mitte und Rechts.

### Offene Punkte = Aufgaben am Feature (kein zweites System)
- Offene Punkte sind die vorhandenen **Aufgaben** (`ws_aufgaben`, Datenbank 0042) mit Bezug zu diesem Feature. Anlegen und Bearbeiten wie unter „Aufgaben“
  (Admin, Entwickler, Texter des Projekts); im Arbeitsplatz zusätzlich ein Schnellfeld „Punkt hinzufügen“ (nur Titel, dieselben Rechte und Prüfungen).
- **Status eines Punkts** (reine Funktion `punktStatus`): Gibt es zu dem Punkt einen Auftrag (über `ws_aufgabe_sendungen.auftrag_id`), der noch nicht
  abgeschlossen ist → **läuft**; ist der verknüpfte Auftrag live bzw. erledigt → **erledigt**; sonst der Status der Aufgabe (offen · in Arbeit · erledigt).
  Abgebrochene Aufträge zählen nicht.
- **Klick auf einen Punkt:** Der Chat-Kopf zeigt den Bezug „Feature · Punkt“. „Fragen“ geht wie bisher „Besprechen“ in den Konzept-Chat
  (`ws_claude_chat`, nur lesend) – Text und Kontext tragen „zum offenen Punkt „…“ (Aufgabe #n)“.
- **„Weiterarbeiten“** legt einen Auftrag zu genau diesem Punkt an – über den bestehenden Auftrags-Weg der Aufgaben (Sendung + Auftrag + erste
  Nachricht mit `daten.aufgabe` in einem Schritt, wie `ws_aufgabe_als_auftrag`), mit denselben Rechten (Recht „Aufträge“ im Bereich, Texter → Art „text“).
  Die Werkstatt bekommt Links und Anhänge der Aufgabe wie bisher als Datenblock. Läuft zum Punkt schon ein Auftrag, lehnt die Datenbank ab.
- Begriffe: „Weiterarbeiten“ und „Fragen“ erscheinen nur, wenn ein Punkt gewählt ist; ohne Punkt bleibt es bei „Besprechen“ (bzw. „Antworten“ bei einer offenen Rückfrage).

### Rechte Hälfte
**Vorschau:** wie bisher die Live-Vorschau (Testseite, Gerät, „Zeigen & kommentieren“, Zweig-Warnung). Hat das Projekt mehrere Ziele, gibt es oben
einen Ziel-Umschalter. Für Ziele, die erst in Stufe 2 oder 3 kommen (Windows, Mac, Cloud-Lauf, PDF), steht ein klarer Platzhalter „kommt in Stufe 2“
bzw. „kommt in Stufe 3“ mit dem, was es heute schon gibt: „In Windows-Sandbox starten“, „Testlauf starten“, Builds bei GitHub.

**Code live:** zeigt während eines laufenden Auftrags, welche Dateien die Werkstatt geändert hat – als Diff mit hinzugefügten und entfernten Zeilen –
und darunter die **Schritte** des Laufs (das bestehende Live-Log `ws_live_log`). Nur ansehen; eigene Änderungen gehen wie bisher über den Code-Editor
als Auftrag (Link „Im Code-Editor ändern“). Ohne laufenden Auftrag: Diff des letzten Auftrags des Features (Zweig gegen main), sofern es den Zweig gibt.

**Verlauf:** Aufträge und Live-Schaltungen des Features mit Zeit (Auftrag angelegt, Stand, live seit). „Auf diesen Stand zurück …“ gibt es im
Arbeitsplatz **nicht**: Der einzige sichere Weg zurück ist das Zurücksetzen der ganzen App durch den Admin unter „Zu erledigen › Live“ (nur Versionen,
die zur Datenbank passen). Ein Zurück je Feature ist offen (siehe Grenzen).

### Ziele und Prüfweg
- Projekt: Liste `ziele` aus web, handy_pwa, windows, mac, cloud_lauf, pdf (1–6 Einträge, vorbelegt aus der Art). Ändern nur der Admin (wie die Art).
- Feature: **Prüfweg** mit Typ (seite · fenster · befehl · kapitel) und Text. Typ „seite“ **ist** die bisherige `vorschau_pfad` (bleibt kompatibel:
  Live-Vorschau, „Diese Seite merken“ und „links folgt der Chat“ lesen weiter `vorschau_pfad`). Für die anderen Typen steht ein freier, kurzer Text
  (z. B. „Hauptfenster › Pläne › Plan auslesen“, „abgleichen klein.csv“, „Kapitel 3 · Seite 12“).
- Im Arbeitsplatz wird der Prüfweg angezeigt und ist bearbeitbar – mit denselben Rechten wie das Merken der Seite (Admin oder Recht „Aufträge“ im Bereich).

## Datenmodell (Datenbank 0059)
| Was | Wo | Regeln |
|---|---|---|
| Ziele eines Projekts | `ws_projekte.ziele text[]` | nur erlaubte Werte, 1–6, keine doppelten; vorbelegt aus `technik_art` (nur wo leer); Trigger füllt neue Projekte bzw. bei gesetzter Art; ändern nur über `ws_projekt_ziele_setzen` (nur Admin, Protokoll) |
| Prüfweg eines Features | `ws_features.pruefweg_typ`, `pruefweg_text` | Typ aus seite/fenster/befehl/kapitel; Text ≤ 200 Zeichen, ohne Steuer- und unsichtbare Zeichen, nur bei Typ ≠ seite; bei „seite“ gilt `vorschau_pfad` (gleiche Prüfung wie 0028). Setzen über `ws_feature_pruefweg_setzen` (Rechte wie `ws_feature_vorschau_setzen`, Protokoll). Spalten nicht direkt änderbar |
| Offene Punkte | `ws_aufgaben` (0042) mit `feature_id` | unverändert |
| Punkt → Auftrag | `ws_aufgabe_sendungen.auftrag_id` (0042) | `ws_punkt_weiterarbeiten(p_aufgabe, p_text)`: legt Sendung, Auftrag und erste Nachricht in einem Schritt an; gleiche Prüfungen wie `ws_aufgabe_senden` + `ws_aufgabe_als_auftrag`, Punkt muss zum Feature gehören, kein zweiter laufender Auftrag je Punkt, höchstens 100 am Tag |
| Code live (flüchtig) | `ws_code_live` (eine Zeile je laufendem Auftrag) | schreibt nur die Werkstatt, die den Auftrag gerade bearbeitet (`ws_code_live_melden`: eigener PC, Auftrag „läuft“ auf genau diesem PC); Form und Größe geprüft (≤ 60 Dateien, ≤ 400 KB); lesen nur Mitglieder des Projekts (`ws_sieht_projekt`); gelöscht bei Auftragsende (Dienst + Trigger, sobald der Auftrag „läuft“ verlässt) und regelmäßig über `ws_code_aufraeumen` (jeder Werkstatt-Dienst beim Start und alle 10 Minuten; kein pg_cron), lesbar nur, solange jünger als 2 Stunden; `abgeschaltet` = verdächtige Git-Einstellung (dann keine Dateien); nicht in der Realtime-Veröffentlichung |
| Diff des letzten Auftrags | `ws_code_anfragen` mit neuer Art `diff` (0031/0032) | wie Baum/Datei: Antwort einer Werkstatt aus dem Abgleich-Klon, Inhalte nach 5 Minuten geleert, Zeile nach 1 Stunde gelöscht, lesen nur wer gefragt hat |

## Wie „Code live“ übertragen wird
Der Werkstatt-Dienst hat heute **keinen** direkten Weg zur Oberfläche eines anderen Geräts: Fortschritt und Live-Log gehen über die Datenbank
(`ws_live_log`, `ws_auftraege.stand`), die Oberfläche liest sie mit Live-Abgleich. Gerhard sieht oft auf dem Admin-PC oder am Handy zu, während
ein Entwickler-PC arbeitet – also **muss der Diff über die Datenbank** gehen. Deshalb flüchtig:
1. Während Claude Code läuft, sammelt der Dienst **alle 5 Sekunden** (nur wenn sich etwas geändert hat) im Arbeitsordner des Auftrags:
   `git diff --numstat <Startstand>` und je Datei `git diff <Startstand> -- <datei>` (Startstand = `merge-base HEAD origin/main` beim Start)
   plus neue, noch nicht von Git erfasste Dateien (`git status --porcelain -z`). Git läuft mit `GIT_SICHER`, `--no-ext-diff --no-textconv`,
   `GIT_OPTIONAL_LOCKS=0` (kein Schreiben in den Index, kein Konflikt mit dem Lauf) – es wird **kein Projekt-Code ausgeführt**.
2. **Filter** (reine Funktionen, `desktop/dienst/lib/codeLive.mjs`):
   - Geheimnis-Dateien (`.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `credentials*`, `secrets.*`, `.npmrc`, `.netrc`, `.dev.vars`, Keystores,
     Service-Account-Dateien …) werden **nie gelesen und nie übertragen** – nur der Name mit „ausgeblendet“.
   - Werte, die wie Schlüssel aussehen, werden in jeder Zeile maskiert (`ohneGeheimnisse`, wie im Live-Log).
   - Binärdateien werden nur genannt. Größen: je Datei höchstens 400 Zeilen bzw. 24 KB Diff, gesamt 200 KB und 60 Dateien – darüber „gekürzt“.
   - Nur Pfade im Arbeitsordner (Pfad-Regel wie im Code-Editor); neue Dateien nur als echte Datei (`lstat`), **Verknüpfungen werden nicht gefolgt**,
     kein Ordner auf dem Weg darf eine Verknüpfung sein, Dateien über 512 KB nur genannt.
2a. **Härtung gegen Git-Treiber** (Sicherheitsprüfung 02.11.2026, GELB → behoben): Git läuft im Arbeitsordner **fest** mit
   `--git-dir=<code>/.git/worktrees/<auftrag>` und `--work-tree=<Arbeitsordner>` (cwd = Git-Verwaltung) – der `.git`-Datei des Arbeitsordners wird nie gefolgt.
   Vor **jeder** Runde: `.git`-Datei zeigt genau auf diese Verwaltung (`gitdirOk` + Pfadvergleich), `commondir` passt, keine gefährlichen Schlüssel
   (`gefaehrlicheGitConfig`) in `config`/`config.worktree` des Repositorys **und** der Worktree-Verwaltung, keine Treiber in `info/attributes`. Ein Treffer
   schaltet Code live für diesen Auftrag ab („Code live abgeschaltet: verdächtige Git-Einstellung“ in der Oberfläche und im Live-Log, `ws_code_live.abgeschaltet`).
   Zusätzlich bei jedem Aufruf: `--ignore-submodules=all` (diff und status) und `-c diff.ignoreSubmodules=all`, `status.submoduleSummary=false`,
   `submodule.recurse=false`, `core.attributesFile=/dev/null` (Windows `NUL`) und für **jeden** Filter-Namen aus allen `.gitattributes` des Arbeitsordners
   bzw. `info/attributes`: `filter.<name>.clean=`, `.smudge=`, `.process=` leer und `.required=false`. Ungültige Filter-Namen oder nicht vollständig prüfbare
   Attribute → abgeschaltet. Tests zeigen: plain git führt die Filter aus (Gegenprobe), Code live nicht – weder über ein Untermodul mit eigener Konfiguration noch über
   eine umgeleitete `.git`-Datei.
2b. **Umbenannte Geheimnisse:** Im Baum-Modus erkennt `git diff --name-status --find-renames --find-copies` Umbenennungen und Kopien – ist die Quelle eine
   Geheimnis-Datei, bleibt das Ziel ausgeblendet. In beiden Modi werden neue Dateien ausgeblendet, deren Inhalt (Blob-Kennung wie `git hash-object --no-filters`)
   einer Geheimnis-Datei des Startstands entspricht.
2b'. **Ähnliche Inhalte** (Nachprüfung N2): Im Arbeitsordner wird eine neue Datei auch ausgeblendet, wenn sie mindestens 50 % der bedeutsamen Zeilen
   (getrimmt, nicht leer, mindestens 8 Zeichen) einer Geheimnis-Datei des Startstands enthält. Verglichen werden höchstens 50 Geheimnis-Dateien zu je 64 KB,
   nur im Speicher; nichts davon geht in ein Log oder in die Datenbank.
2d. **Keine persönliche oder System-Konfiguration** (Nachprüfung N1): Jeder git-Aufruf von Code live läuft mit `GIT_CONFIG_GLOBAL=/dev/null` (Windows `NUL`),
   `GIT_CONFIG_NOSYSTEM=1`, `GIT_ATTR_NOSYSTEM=1`; Konfiguration aus Umgebungsvariablen (`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT/KEY/VALUE`) und `GIT_DIR` &c.
   werden verworfen. So startet auch ein Filter aus der persönlichen Konfiguration (z. B. git-lfs) nichts, selbst wenn die `.gitattributes` nur im Index steht.
   Übernommen werden aus der persönlichen Konfiguration nur `core.autocrlf`, `core.eol` und `safe.directory` (gelesen, als `-c` übergeben).
2c. **Echter Pfad:** Neue Dateien werden nach dem Öffnen am echten Pfad geprüft (Linux `/proc/self/fd`, sonst `realpath` nach dem Öffnen plus Gerät/Kennung).
3. Der Dienst schreibt das Ergebnis über `ws_code_live_melden` (eine Zeile je Auftrag, überschrieben) und löscht sie nach dem Lauf (`ws_code_live_ende`);
   ein Trigger löscht sie zusätzlich, sobald der Auftrag „läuft“ verlässt, und alles älter als 2 Stunden fällt beim nächsten Melden weg.
4. Die Oberfläche fragt die Zeile alle 3 Sekunden ab, solange „Code live“ offen ist und der Auftrag läuft (kein Realtime für diese Tabelle).
5. Ohne laufenden Auftrag fragt die Oberfläche einmal eine Werkstatt nach dem Diff „Zweig des letzten Auftrags gegen main“ (`ws_code_anfragen`, Art `diff`,
   gleicher Filter, aus dem Abgleich-Klon).

## Sicherheit
- „Code live“ zeigt **nur Code aus dem Arbeitsordner** des Auftrags bzw. aus dem Git-Stand des Zweigs. Keine Geheimnisse: Geheimnis-Dateien nur als Name
  („ausgeblendet“), Schlüssel-Werte maskiert, auch in der Datenbank-Prüfung (Pfad-Muster wie `ws_code_geheim`, keine Inhalte zu solchen Pfaden).
- **Keine Personendaten**: Der Arbeitsplatz zeigt keine Daten von Vereinsmitgliedern, Kunden oder Kindern; Hinweis beim Punkt-Feld wie bei Aufgaben.
  Code live zeigt Code, keine App-Daten; Schritte kommen aus dem gefilterten Live-Log.
- Der **Admin-PC führt nie Projekt-Code aus** – auch nicht für Code live oder den Diff: nur Git-Lesebefehle ohne externe Diff-/Textconv-Programme, mit gehärteter
  Git-Konfiguration (wie seit 0.13.0 geprüft). Bauen und Tests bleiben in GitHub/Cloudflare.
- Alle neuen Tabellen mit RLS, Schreiben nur über SECURITY-DEFINER-Funktionen mit `search_path`, Ausführen für `public` und `anon` entzogen, Protokoll in `ws_protokoll`
  (Ziele, Prüfweg, Weiterarbeiten). Werte nur aus festen Listen, Textlängen begrenzt.
- „Weiterarbeiten“ hat keine eigenen Rechte: Es ist derselbe Auftrags-Weg wie „Als Auftrag“ (Freigabe, Prüfungen, Sicherheitsprüfung, Live nur nach Freigabe).

## Stufenplan
| Stufe | Inhalt | Stand |
|---|---|---|
| **1 – Rahmen für alle Arten** | Offene Punkte am Feature mit Status, „Weiterarbeiten“/„Fragen“, Status-Punkt im Baum, rechts Vorschau / Code live / Verlauf, Ziele und Prüfweg, Technik-Empfehlung im Assistenten | **diese Version (0.15.0 vorläufig)** |
| 2 – Windows/Mac mit Tauri | Oberfläche des Programms als **Testseite** (gleicher React-Code; Tauri-Funktionen wie Dateien öffnen werden nachgespielt), dazu **Sandbox-Start** mit **Bildschirmfoto an den Chat** | offen |
| 3 – Werkzeuge, Dokumente, Handy, .NET | **Werkzeug-Konsole** (Cloud-Lauf mit Beispiel-Eingaben, Ausgabe an den Chat), **Dokument-Vorschau** (PDF-Seiten), **Handy-QR-Code** (Testseite am echten Handy), **.NET-Sonderfall** (letzter Bau und Bildschirmfotos aus der Sandbox) | offen |

## Umsetzung – Abweichungen und Ergänzungen zum Entwurf
- **Enter = „Fragen“**: Im Entwurf ist „Weiterarbeiten“ der Hauptknopf. Gebaut ist „Fragen“ als Hauptknopf (Enter), „Weiterarbeiten“ daneben –
  damit ein Tastendruck nie einen Auftrag auslöst. „Weiterarbeiten“ geht auch ohne Text (der Punkt ist der Auftrag), ein Text geht als „Dazu: …“ mit.
- **Begriffe im Chat-Baustein:** Zu „Besprechen · Als Auftrag · Antworten“ kommen „Fragen“ und „Weiterarbeiten“ – nur mit gewähltem Punkt im Feature-Arbeitsplatz.
- **Baum links im Arbeitsplatz** nur auf sehr breiten Bildschirmen (ab 1536 px); sonst bleibt „Zentrale“ oben als Rückweg. Der Status-Punkt steht auch auf den Feature-Karten der Zentrale.
- **Vierter Punkt-Zustand „grau“** (noch nichts offen und nicht live) – der Entwurf kennt nur blau/orange/grün.
- **„Punkt hinzufügen“** im Arbeitsplatz (nur Titel) als Schnellweg; alles Weitere (Beschreibung, Anhänge, Zuständig) wie bisher unter „Aufgaben“.
- **„Auf diesen Stand zurück …“** im Verlauf **weggelassen**: Es gibt keinen sicheren Weg je Feature, nur das Zurücksetzen der ganzen App (Admin, „Zu erledigen › Live“). Hinweis steht im Verlauf.
- **Platzhalter statt Mock-Vorschau** für Windows/Mac/Cloud-Lauf/PDF (Thermax-, Waage-, Werkzeug-, Dokument-Beispiele des Entwurfs sind Stufe 2/3). Sandbox- und Testlauf-Knopf gehen nur bei der passenden Art (Programm bzw. Werkzeug), wie unter „Anbindungen“.
- Der **Diff des letzten Auftrags** wird beim Öffnen von „Code live“ automatisch geholt (eine Anfrage, höchstens 6 je Minute) und braucht eine eingeschaltete Werkstatt.

## So arbeitest du im Arbeitsplatz (Handbuch)
1. **Öffnen:** In der Zentrale ein Feature doppelt anklicken. Der farbige Punkt vor dem Namen zeigt den Stand: **blau blinkend** = die Werkstatt arbeitet,
   **orange** = es gibt offene Punkte, **grün** = fertig, **grau** = noch nichts offen.
2. **Prüfweg:** Oben in der Mitte steht, wie man das Feature ausprobiert – eine Seite (`/calendar`), ein Fenster („Hauptfenster › Pläne“), ein Befehl
   („abgleichen klein.csv“) oder ein Kapitel. Mit dem Stift änderst du ihn (Admin oder Recht „Aufträge“ im Bereich). Bei „Seite“ öffnet die Vorschau genau diese Seite.
3. **Offene Punkte:** Darunter stehen die Punkte des Features (Aufgaben mit Bezug zu diesem Feature). Neuen Punkt unten eintippen und „+“.
   Klick auf einen Punkt: Der Chat bezieht sich darauf (Chip „Punkt“ oben im Chat). Noch einmal klicken hebt den Bezug auf.
4. **Fragen oder Weiterarbeiten:** Mit gewähltem Punkt
   - **Fragen** (Enter): Die eingestellte KI antwortet im Konzept-Chat, gebaut wird nichts.
   - **Weiterarbeiten**: Genau dieser Punkt geht als Auftrag an die Werkstatt (Text im Feld geht als Zusatz mit). Danach steht der Punkt auf „läuft“, nach dem Live-Schalten auf „erledigt“.
     Freigabe, Prüfungen und Live laufen wie bei jedem Auftrag.
   Ohne Punkt bleibt alles wie bisher („Besprechen“, „Antworten“ bei einer Rückfrage).
5. **Rechts umschalten:**
   - **Vorschau** – die Testseite wie bisher. Hat das Projekt mehrere Ziele (z. B. Web und Windows), wählst du oben das Ziel. Für Windows/Mac, Cloud-Lauf und PDF steht
     bis Stufe 2/3 ein Platzhalter mit dem, was es schon gibt (Sandbox, Testlauf, Builds).
   - **Code live** – während die Werkstatt arbeitet: welche Dateien sie geändert hat, Zeile für Zeile (grün hinzugefügt, rot entfernt), darunter die Schritte. Ohne laufenden Auftrag
     die Änderungen des letzten Auftrags gegenüber main. Nur ansehen – eigene Änderungen über „Im Code-Editor ändern“. Geheimnis-Dateien sind ausgeblendet.
   - **Verlauf** – Aufträge und Live-Schaltungen dieses Features mit Zeit.
6. **Ziele des Projekts** stellt der Admin beim Anlegen (Assistent, Schritt „Art“ mit Technik-Empfehlung) oder unter „Anbindungen“ › „Art, Ziele und Datenbank ändern“ ein.

## Bekannte Grenzen
- Code live zeigt den Stand höchstens alle 5 Sekunden, nicht jeden Tastendruck; sehr große Änderungen sind gekürzt. Er braucht eine laufende Werkstatt.
- Der Diff des letzten Auftrags braucht eine eingeschaltete Werkstatt (Admin-PC oder eigener PC) und den Zweig bei GitHub (nach dem Zusammenführen gelöschte Zweige: „nicht mehr vorhanden“).
- **Restrisiko umbenannte Geheimnisse:** Erkannt werden umbenannte/kopierte Geheimnis-Dateien mit gleichem Inhalt (Arbeitsordner und Baum) bzw. mit ähnlichem
  Inhalt (Baum: Ähnlichkeit ab 50 %; Arbeitsordner: mindestens 50 % der bedeutsamen Zeilen). Nicht erkannt: eine Geheimnis-Datei, die erst im Lauf angelegt **und** dann umbenannt wird, ein stark umgeschriebener oder
  zerstückelter Inhalt, und Inhalte, die nur durch Zeilenende-Umwandlung (autocrlf) abweichen. Dort greift nur noch die Maskierung bekannter Schlüssel-Muster.
- Die Maskierung erkennt bekannte Schlüssel-Muster; ein Geheimnis ohne erkennbares Muster in einer normalen Code-Datei würde angezeigt (wie im Code-Editor). Geheimnisse gehören nie in den Code.
- Kein „Zurück auf diesen Stand“ je Feature (nur das Zurücksetzen der ganzen App durch den Admin).
- Ziele steuern in Stufe 1 nur Anzeige und Umschalter; Grundgerüst, Ampel und Abläufe richten sich weiter nach der Art.
- Der Punkt-Status im Baum zählt nur Aufgaben mit Bezug zum Feature (Aufgaben an einer Gruppe zählen nicht).

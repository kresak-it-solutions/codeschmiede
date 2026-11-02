# Ein Arbeitsplatz für jede Art von Programm

**Stand:** 2026-11-02 · **Wer:** Gerhard Kresak (Entscheidungen, Entwurf freigegeben 02.11.2026), Claude (Konzept, Umsetzung)
**Entwurf:** `docs/entwurf-1.0-arbeitsplatz-alle-arten.html` · **Version:** 0.15.0 (Stufe 1) · **0.17.0 (Stufen 2 und 3, freigegeben von Gerhard 02.11.2026, gebaut ohne weiteren Entwurf)**
**Datenbank:** 0059 (`supabase/migrations/0059_arbeitsplatz.sql`, Test `supabase/tests/t46_arbeitsplatz.sql`; 0057 kommt aus 0.14.0, 0058 ist reserviert) – eingetragen in `supabase/einspielen.txt` nach der Sicherheitsprüfung (GRÜN 02.11.2026)
**Datenbank Stufen 2/3:** 0060 (`supabase/migrations/0060_arbeitsplatz_stufe23.sql`, Test `supabase/tests/t47_arbeitsplatz_stufe23.sql`) – erst nach der Sicherheitsprüfung in `supabase/einspielen.txt`
**Umgesetzt (Stufen 2/3):** `web/src/seiten/ArbeitsplatzZiele.jsx` (Fensterrahmen, Sandbox-Leiste mit Bildschirmfoto, .NET, Werkzeug-Konsole, Dokument-Vorschau, Handy-QR), `web/src/bausteine/qr.js`, `desktop/dienst/lib/bildschirmfoto.mjs` + `.ps1`, `lib/cloudLauf.mjs`, `lib/vorschauEinrichten.mjs`, Vorlagen `programm/vorschau/`, `werkzeug/beispiele/` + `lauf.yml`, `_dokument/dokument.yml` (Tests `desktop/dienst/test/stufe23.test.mjs`)
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
| Handy-App | zuerst als PWA; für die Stores später Tauri Mobile oder Capacitor | Handy-Rahmen und QR-Code (seit 0.17.0) | handy_pwa |
| Windows- und Mac-Programm | **Tauri** (wie die Codeschmiede selbst) | Oberfläche als Testseite im Fensterrahmen (Tauri-Funktionen nachgespielt) · Windows-Sandbox mit Bildschirmfoto an den Chat | windows, mac |
| Alles zusammen | ein Code mit React + Vite, daraus Web, PWA und Tauri | Ziel-Umschalter rechts | web, handy_pwa, windows, mac |
| Tief in Windows (Office, Geräte, Treiber, Altsysteme) | Sonderfall **.NET** (WinUI oder WPF) | nur Stufe 2: letzter Bau, Sandbox, Bildschirmfotos aus dem Chat | windows |
| Werkzeug, Skript, Dienst | Node oder Python, Läufe in der Cloud | Testlauf-Konsole (Befehl + Beispiel-Eingabe, Ausgabe an den Chat) | cloud_lauf |
| Dokumente (Handbuch, PDF-Layouts) | Markdown oder HTML, daraus PDF | Seiten-Vorschau (PDF in der Cloud gebaut, „Zeigen & kommentieren“ je Seite) | pdf |

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
einen Ziel-Umschalter. Seit 0.17.0 hat jedes Ziel seine Vorschau (Abschnitt „Stufen 2 und 3“): Windows/Mac mit Tauri im Fensterrahmen plus Sandbox,
.NET nur Stufe 2, Cloud-Lauf als Werkzeug-Konsole, PDF als Seiten-Vorschau, Handy mit QR-Code.

**Code live:** zeigt während eines laufenden Auftrags, welche Dateien die Werkstatt geändert hat – als Diff mit hinzugefügten und entfernten Zeilen –
und darunter die **Schritte** des Laufs (das bestehende Live-Log `ws_live_log`). Nur ansehen; eigene Änderungen gehen wie bisher über den Code-Editor
als Auftrag (Link „Im Code-Editor ändern“). Ohne laufenden Auftrag: Diff des letzten Auftrags des Features (Zweig gegen main), sofern es den Zweig gibt.

**Verlauf:** Aufträge und Live-Schaltungen des Features mit Zeit (Auftrag angelegt, Stand, live seit). Seit 0.17.0 steht an jeder Live-Schaltung, nach der noch weitere zusammengeführte Aufträge kamen, **„Auf diesen Stand zurück …“** – das gibt einen Auftrag
„Feature auf Stand #n zurücksetzen“ (siehe Stufen 2 und 3). Die ganze App setzt weiterhin nur der Admin unter „Zu erledigen › Live“ zurück.

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
2b. **Umbenannte Geheimnisse:** Im Baum-Modus erkennt `git diff --name-status --find-renames --find-copies --find-copies-harder` Umbenennungen und Kopien – ist die Quelle eine
   Geheimnis-Datei, bleibt das Ziel ausgeblendet. In beiden Modi werden neue Dateien ausgeblendet, deren Inhalt (Blob-Kennung wie `git hash-object --no-filters`)
   einer Geheimnis-Datei des Startstands entspricht.
2b'. **Ähnliche Inhalte** (Nachprüfung N2, Kurzprüfung M1): In beiden Modi (im Baum-Modus Inhalt per `git cat-file blob`) wird eine neue Datei auch ausgeblendet, wenn sie mindestens 50 % der bedeutsamen Zeilen
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
| **1 – Rahmen für alle Arten** | Offene Punkte am Feature mit Status, „Weiterarbeiten“/„Fragen“, Status-Punkt im Baum, rechts Vorschau / Code live / Verlauf, Ziele und Prüfweg, Technik-Empfehlung im Assistenten | erledigt in 0.15.0 |
| 2 – Windows/Mac mit Tauri | Oberfläche des Programms als **Testseite** (gleicher React-Code; Tauri-Funktionen wie Dateien öffnen werden nachgespielt), dazu **Sandbox-Start** mit **Bildschirmfoto an den Chat** | **erledigt in 0.17.0** |
| 3 – Werkzeuge, Dokumente, Handy, .NET | **Werkzeug-Konsole** (Cloud-Lauf mit Beispiel-Eingaben, Ausgabe an den Chat), **Dokument-Vorschau** (PDF-Seiten), **Handy-QR-Code** (Testseite am echten Handy), **.NET-Sonderfall** (letzter Bau und Bildschirmfotos aus der Sandbox) | **erledigt in 0.17.0** |
| aus Stufe 1 offen | „Auf diesen Stand zurück“ je Feature; Ziele steuern Ampel und Abläufe | **erledigt in 0.17.0** |

## Stufen 2 und 3 (0.17.0, Datenbank 0060)
Freigegeben von Gerhard am 02.11.2026 („alles freigegeben“), gebaut nach dem Entwurf 1.0 ohne weiteren Entwurf. Die Sicherheitsprüfung danach bleibt Pflicht.

### Windows/Mac mit Tauri – Oberfläche als Testseite (Stufe 1 des Ziels)
- Die Vorlage „Programm“ bringt `vorschau/` mit: `bauen.mjs` baut aus `ui/` eine Web-Fassung nach `vorschau-dist/` (nur Node-Bordmittel, keine Verknüpfungen, höchstens 2000 Dateien/50 MB),
  setzt drei Skripte direkt nach `<head>` in jede HTML-Seite und schreibt `version.json` („Neuer Stand da“) und `_headers` (CSP nur eigene Skripte, `noindex`).
- `vorschau/tauri-nachbildung.js` ersetzt `window.__TAURI__` (invoke, Dialog, Dateien, Fenster, Benachrichtigung, Ereignisse, App, Pfade) durch eine Nachbildung mit den Beispieldaten aus
  `vorschau/beispiele.js`. Unten rechts steht immer **„Testseite · Programm-Funktionen nachgespielt“** und was zuletzt nachgespielt wurde. „Dateien“ leben nur im Speicher der Seite, nichts wird
  gelesen oder geschrieben. Ist das echte Tauri da (`__TAURI_INTERNALS__`), macht die Datei nichts. Unbekannte Befehle lehnt sie ab („wird nicht nachgespielt – Beispiel in vorschau/beispiele.js ergänzen“).
- Vite/React-Oberflächen („Alles zusammen“): `vorschau/vite-alias.mjs` lenkt bei `VITE_CS_VORSCHAU=1` die Pakete `@tauri-apps/api/*` und `@tauri-apps/plugin-dialog|fs|notification` auf
  `vorschau/tauri-api.mjs` (gleiche Nachbildung als Modul). Cloudflare setzt `VITE_CS_VORSCHAU=1` für Programme.
- `vorschau/vorschau-helfer.js`: „Zeigen & kommentieren“ und „links folgt der Chat“ wie bei Web-Apps – nur auf `*.pages.dev`, nur eingebettet, nur gegenüber `https://codeschmiede.pages.dev`;
  gesendet werden nur Baustein-Name (`data-cs` oder Element-Kennung), Seite (Pfad ohne Kennungen) und Element-Pfad, **nie sichtbarer Text**.
- Cloudflare Pages: Build-Befehl `node vorschau/bauen.mjs`, Ausgabe `vorschau-dist` (Testseite jetzt auch für Tauri-Programme, **nie für .NET**); Kachel „Testseite (Cloudflare)“ unter „Anbindungen“.
- **Bestehende Projekte:** „Testseite für die Programm-Oberfläche einrichten“ (unter „Anbindungen“ und im Arbeitsplatz, wenn die Testseite fehlt) ist die Aktion `vorschau_einrichten`: Die Werkstatt
  des Admins legt einen **Hand-Auftrag** (`ws_code_hand_auftrag`) mit den Dateien der Vorlage an – nur Dateien, die auf main **fehlen** (vorhandene werden nie überschrieben), dazu höchstens eine
  Zeile `vorschau-dist/` in `.gitignore` und eine Zeile im Änderungsprotokoll. Zweig, Prüfungen, Sicherheitsprüfung und Freigabe wie jeder Auftrag.
- Im Arbeitsplatz zeigt das Ziel Windows/Mac **„Stufe 1: Oberfläche als Testseite“** in einem Fensterrahmen (Titelleiste mit Programm- und Feature-Name) und darunter **„Stufe 2: echtes Programm“**.

### Windows-Sandbox mit Bildschirmfoto (Stufe 2 des Ziels)
- Die Sandbox geht jetzt auch für Projekte, deren Art nicht „Programm“ ist, die aber **Ziel Windows** haben (Datenbank 0060, `ws_projekt_windows`). Gebaut wird wie bisher in GitHub
  (`programm.yml`, Artefakt `installation-windows`); die Werkstatt auf dem PC des Admins lädt die eine `.exe` und startet nur `WindowsSandbox.exe` – die Installation läuft nur darin.
- **„Bildschirmfoto an den Chat“** (Aktion `bildschirmfoto`, Ziel-PC = eigener PC): Der Dienst startet die eingebaute Windows PowerShell (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`)
  **ohne Shell** mit fester Argument-Liste `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <lib/bildschirmfoto.ps1> -Ziel <Pfad>` und minimaler Umgebung. Das feste Skript sucht
  **genau ein** sichtbares Fenster mit dem Titel „Windows Sandbox“ bzw. „Windows-Sandbox“, das zu einem Programm `WindowsSandbox*` gehört, und zeichnet **nur dieses Fenster** mit `PrintWindow`
  (kein Foto vom Bildschirm – darüberliegende Fenster sind nicht drauf). Minimiert, mehrere Fenster oder leeres Bild → klare Meldung, kein Foto.
- Das PNG wird geprüft (Signatur, IHDR, 1–10000 Pixel, ≤ 10 MB, echte Datei ohne Verknüpfung), im **eigenen privaten Chat-Speicher** `ws-chat` abgelegt (`<ich>/<projekt>/<zufall>.png`, Regel 0050)
  und mit `ws_bildschirmfoto_melden` gemeldet; die lokale Datei wird immer gelöscht.
- **Nichts geht automatisch weg:** Die Oberfläche zeigt das Foto zuerst in einem Dialog mit dem Hinweis auf persönliche Daten. Erst **„An den Chat senden“** legt die Chat-Nachricht mit dem Foto als
  Anhang an (Anhang-Weg 0050, Text „Bildschirmfoto aus der Windows-Sandbox zu Feature …“) und verknüpft sie (`ws_bildschirmfoto_gesendet`: nur genau dieser Anhang, nur einmal). „Verwerfen“ löscht die Datei.
- **macOS/Linux:** keine Sandbox – die Knöpfe sind ausgeblendet, es steht „Windows-Sandbox und Bildschirmfoto nur unter Windows“ (Plattform aus „Dieser PC“).

### Werkzeug-Konsole (Ziel Cloud-Lauf)
- Je Feature wählt der Prüfweg Typ „befehl“ (z. B. „zaehlen klein.csv“) Befehl und Beispiel-Eingabe vor. Die Befehle stehen in `beispiele/befehle.json` (`{ "befehle": { "<name>": "<Beschreibung>" } }`),
  Beispiel-Eingaben sind Dateien direkt in `beispiele/` (nur ausgedachte Daten). Die Oberfläche liest beides über den Code-Weg (Abgleich-Klon, nur lesen).
- **„Testlauf in der Cloud“** (Aktion `testlauf` mit Eingaben, nur Admin): feste Form `{ befehl, eingabe }` – Befehl `^[a-z][a-z0-9-]{0,39}$`, Eingabe ein Dateiname ohne Ordner und ohne „..“
  (Datenbank, Dienst und Ablauf prüfen dieselben Muster). Der Dienst startet `gh workflow run lauf.yml --ref <zweig> -f befehl=… -f eingabe=…` (Argument-Liste). **Nie lokal.**
- `lauf.yml` (Vorlage „Werkzeug“): Eingaben gehen **nur als Umgebungsvariablen** in die Schritte (nie `${{ }}` in einem Skript), werden dort noch einmal gegen die Muster, die Liste in
  `beispiele/befehle.json` und „echte Datei in beispiele/, keine Verknüpfung“ geprüft und als einzelne Argumente übergeben: `node src/index.mjs "$CS_BEFEHL" "beispiele/$CS_EINGABE"`.
  Ohne Eingaben läuft der Standardlauf wie bisher. Die Ausgabe landet in `ausgabe/konsole.txt` (höchstens 1 MB), alles in `ausgabe/` als Artefakt „ergebnis“.
- Der Dienst wartet höchstens 14 Minuten (meldet alle 15 s „lebt“, `ws_projekt_aktion_lebt`), lädt das Artefakt (≤ 60 MB, Größe vorher geprüft), bereitet die Ausgabe auf (Geheimnisse maskiert,
  Steuer- und Farbcodes entfernt, höchstens 20.000 Zeichen mit Anfang und Ende) und meldet bis zu 30 Ergebnisdateien (Textdateien mit Inhalt bis 16.000 Zeichen, gesamt 64.000; Geheimnis-Dateien ohne Inhalt,
  Punkt-Dateien gar nicht, Verknüpfungen nie) über `ws_aktion_ergebnis_melden` (streng geprüfte Form).
- Anzeige als Konsole, Ergebnisdateien zum Aufklappen, **„Ausgabe an den Chat“** (Konzept-Chat, als Daten gekennzeichnet, höchstens 7.000 Zeichen).

### Dokument-Vorschau (Ziel PDF)
- Ablauf `dokument.yml` (Vorlage `_dokument`; für bestehende Projekte über **„Seiten-Vorschau einrichten“**, gleicher Hand-Auftrag wie oben): baut aus dem Zweig mit `npm run pdf` die Datei
  `ausgabe/dokument.pdf` und legt die Seiten mit `pdftoppm` als PNG ab (höchstens 60, längste Seite 1000 Pixel), Artefakte „dokument-seiten“ und „dokument“.
- **„Dokument bauen“** (Aktion `dokument`, nur Admin): Der Dienst startet den Ablauf, wartet, lädt die Seitenbilder, prüft jede (Name `seite-NNN.png`, PNG-Kopf, ≤ 3 MB, ≤ 4000×6000) und legt sie im
  **privaten Speicher `ws-vorschau`** ab (`<ich>/<projekt>/<aktion>/seite-NNN.png`; hochladen nur zur laufenden Dokument-Aktion der eigenen Werkstatt, lesen nur Admins); die zwei neuesten Läufe je Projekt
  bleiben, ältere räumt der Dienst weg. **Kein PDF wird auf einem PC der Codeschmiede geöffnet oder gerendert** – angezeigt werden nur die geprüften Bilder (kein pdf.js nötig).
- Anzeige: Seite groß, Vorschaubilder, Seitenwahl; Start auf der Seite aus dem Prüfweg „kapitel“ („Kapitel 3 · Seite 12“ → Seite 12).
- **„Zeigen & kommentieren“ je Seite:** Klick auf eine Stelle der Seite → Baustein „Seite 12“ mit Stelle in Prozent (`dokument > seite-12 > x40-y25`) → links im Chat „Als Auftrag“ wie bei Web-Apps.

### Handy: QR-Code
- Im Ziel „Handy (PWA)“ öffnet **„QR-Code: am echten Handy öffnen“** einen QR-Code der Testseite (Adresse + gemerkte Seite). Er wird **im Programm** erzeugt (`web/src/bausteine/qr.js`, eigene kleine
  Umsetzung nach ISO/IEC 18004, Byte-Modus, Fehlerkorrektur M, ohne Paket und ohne fremden Dienst; gegen einen unabhängigen Leser getestet). Bei Zweig-Ständen steht „nicht anmelden“ dabei.

### .NET-Sonderfall
- Technik je Projekt: `ws_projekte.programm_technik` = Tauri (Standard, leer) oder .NET (`ws_projekt_programm_technik_setzen`, nur Admin; der Assistent übernimmt es aus der Empfehlung, sonst
  „Anbindungen“ › „Art, Ziele und Datenbank ändern“).
- Ziel Windows mit .NET zeigt **nur Stufe 2**: letzter Bau aus `programm.yml` (Stand aus der Ampel, Link zur Setup-Datei bei GitHub, Bau der letzten Sandbox), Sandbox-Knopf mit Bildschirmfoto und die
  **letzten Bildschirmfotos aus dem Chat des Features** (nur bestätigte, je Feature, höchstens 6). Ziel Mac mit .NET: Hinweis, dass es kein Mac-Programm gibt. Keine Testseite.

### Auf diesen Stand zurück (je Feature)
- Im Verlauf an jeder Live-Schaltung, nach der weitere zusammengeführte Aufträge (Stand feature/wissen/erledigt mit PR) dieses Features kamen. Nach Bestätigung entsteht ein normaler Auftrag
  „Feature auf Stand #n zurücksetzen“ (Recht „Aufträge“ im Bereich): Die Werkstatt nimmt die späteren Aufträge (neueste zuerst, mit PR-Nummer und Live-Stand, als Daten gekennzeichnet) mit `git revert`
  als neue Revert-Commits auf **ihrem Zweig** zurück – **nie direkt auf main**, kein Force-Push; bei fremden Commits, Konflikten oder Datenbank-Dateien Rückfrage. Prüfung, Freigabe und Live wie jeder
  Auftrag. Geht nur, wenn zu dem Feature kein Auftrag mehr offen ist.

### Ziele steuern Ampel und Abläufe
- Ampel (`ampelBedarf`): Build bei Art Programm oder Ziel Windows; Signatur nur Tauri; Sandbox bei Ziel Windows; Testlauf bei Art Werkzeug oder Ziel Cloud-Lauf; Lampe **„Seiten-Vorschau“** bei Ziel PDF;
  Testseite bei Web, Handy und Tauri-Programmen (nie .NET).
- Abläufe (Datenbank 0060): Sandbox/Bildschirmfoto nur mit Ziel Windows, Testlauf nur mit Art Werkzeug oder Ziel Cloud-Lauf, Dokument nur mit Ziel PDF, Testseite nur für Web/Handy/Tauri.

### Datenmodell (Datenbank 0060)
| Was | Wo | Regeln |
|---|---|---|
| Technik Windows/Mac | `ws_projekte.programm_technik` (tauri/dotnet) | ändern nur `ws_projekt_programm_technik_setzen` (Admin, Protokoll), Spalte nicht direkt änderbar |
| Neue Aktionen | `ws_projekt_aktionen.art` + `bildschirmfoto`, `dokument`, `vorschau_einrichten`; Spalten `feature_id`, `eingaben`, `ergebnis` (≤ 256 KB), `chat_id` | anfordern nur Admin (`ws_projekt_aktion_anfordern` mit `p_eingaben`, `p_feature`); Eingaben nur feste Form (`ws_aktion_eingaben_ok`, auch als Tabellen-Check); Feature nur aus dem Projekt; höchstens 200 Aktionen am Tag je Projekt; lesen nur Admin |
| Nehmen | `ws_projekt_aktion_nehmen(p_pc, p_arten)` | die Werkstatt nennt die Arten, die sie kann; ältere Dienste (ohne Liste) bekommen keine neuen Arten |
| Lange Läufe | `ws_projekt_aktion_lebt` | nur die haltende Werkstatt, nur Testlauf/Dokument, höchstens 1 Stunde |
| Bildschirmfoto | `ws_bildschirmfoto_melden`, `ws_bildschirmfoto_gesendet` | melden nur der Ziel-PC, Bild muss im eigenen Ordner von `ws-chat` liegen; in den Chat nur die anfordernde Person, nur mit genau diesem Anhang, nur einmal |
| Ergebnis | `ws_aktion_ergebnis_melden` + `ws_aktion_ergebnis_ok` | nur die haltende Werkstatt; Testlauf: Ausgabe ≤ 20.000 Zeichen, ≤ 30 Dateien mit sicheren Namen; Dokument: ≤ 60 Seiten, Pfad genau `<ich>/<projekt>/<aktion>/seite-NNN.png` und im Speicher vorhanden |
| Seitenbilder | Speicher `ws-vorschau` (privat, nur PNG, ≤ 3 MB) | hochladen nur Admin zur laufenden Dokument-Aktion der eigenen Werkstatt, lesen nur Admins, löschen nur eigene |
| Ampel | `ws_anbindungen_ok` + Lampe `dokument` | wie bisher |

## Umsetzung – Abweichungen und Ergänzungen zum Entwurf
- **Enter = „Fragen“**: Im Entwurf ist „Weiterarbeiten“ der Hauptknopf. Gebaut ist „Fragen“ als Hauptknopf (Enter), „Weiterarbeiten“ daneben –
  damit ein Tastendruck nie einen Auftrag auslöst. „Weiterarbeiten“ geht auch ohne Text (der Punkt ist der Auftrag), ein Text geht als „Dazu: …“ mit.
- **Begriffe im Chat-Baustein:** Zu „Besprechen · Als Auftrag · Antworten“ kommen „Fragen“ und „Weiterarbeiten“ – nur mit gewähltem Punkt im Feature-Arbeitsplatz.
- **Baum links im Arbeitsplatz** nur auf sehr breiten Bildschirmen (ab 1536 px); sonst bleibt „Zentrale“ oben als Rückweg. Der Status-Punkt steht auch auf den Feature-Karten der Zentrale.
- **Vierter Punkt-Zustand „grau“** (noch nichts offen und nicht live) – der Entwurf kennt nur blau/orange/grün.
- **„Punkt hinzufügen“** im Arbeitsplatz (nur Titel) als Schnellweg; alles Weitere (Beschreibung, Anhänge, Zuständig) wie bisher unter „Aufgaben“.
- **„Auf diesen Stand zurück …“** war in Stufe 1 weggelassen; seit 0.17.0 als Auftrag mit Revert-Commits über die Werkstatt (nie direkt auf main).
- Stufe 1 hatte Platzhalter für Windows/Mac/Cloud-Lauf/PDF; seit 0.17.0 echte Vorschauen. **Abweichungen 0.17.0:** PDF-Seiten werden als **Bilder** gezeigt (in der Cloud gerendert) statt mit pdf.js – kein PDF-Leser im Programm; das Bildschirmfoto geht in den **Konzept-Chat** mit Bezug zum Feature (dort liegt der Anhang-Weg 0050), nicht in den Auftrags-Chat; die Ziel-Knöpfe zeigen keine Stufennummer mehr; Testlauf-Konsole, Dokument-Vorschau und Bildschirmfotos sieht nur der Admin (Aktionen sind Admin-Sache).
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
   Bei Programmen wählst du dort auch die Technik: **Tauri** (Standard) oder **.NET** (Sonderfall).
7. **Windows/Mac (Tauri):** Rechts siehst du oben die Oberfläche im Fensterrahmen – Dateien öffnen, Befehle und Meldungen werden nachgespielt (Hinweis unten rechts), „Zeigen & kommentieren“ geht wie bei Web-Apps.
   Fehlt die Testseite, klickt der Admin „Testseite für die Programm-Oberfläche einrichten“ (Auftrag mit Freigabe) und danach unter „Anbindungen“ „Testseite einrichten“.
   Darunter **„In Windows-Sandbox starten“** (echtes Programm, Wegwerf-Umgebung) und **„Bildschirmfoto an den Chat“**: Du siehst das Foto zuerst, prüfst es auf persönliche Daten und schickst es erst dann
   mit „An den Chat senden“ (oder „Verwerfen“). Am Mac gibt es diese Knöpfe nicht („nur unter Windows“).
8. **.NET:** nur der letzte Bau (Link zur Setup-Datei), die Sandbox und die bestätigten Bildschirmfotos dieses Features.
9. **Cloud-Lauf (Werkzeug-Konsole):** Befehl und Beispiel-Eingabe wählen (aus `beispiele/`), „Testlauf in der Cloud“ – nach ein paar Minuten steht die Ausgabe in der Konsole, die Ergebnisdateien darunter.
   „Ausgabe an den Chat“ schickt sie (gekürzt) in den Chat. Beispiel-Eingaben enthalten nur ausgedachte Daten.
10. **PDF (Seiten-Vorschau):** „Dokument bauen“ – GitHub baut das PDF aus dem Zweig, du blätterst durch die Seiten. Mit „Zeigen & kommentieren“ auf eine Stelle der Seite klicken und links schreiben, was sich ändern soll („Als Auftrag“).
11. **Handy:** „QR-Code: am echten Handy öffnen“ und mit der Kamera scannen. Bei Zweig-Ständen am Handy nicht anmelden.
12. **Auf diesen Stand zurück:** im Verlauf an einer Live-Schaltung. Daraus wird ein Auftrag – die Werkstatt nimmt die späteren Änderungen an diesem Feature mit Revert-Commits zurück, Freigabe wie immer.

## Bekannte Grenzen
- Code live zeigt den Stand höchstens alle 5 Sekunden, nicht jeden Tastendruck; sehr große Änderungen sind gekürzt. Er braucht eine laufende Werkstatt.
- Der Diff des letzten Auftrags braucht eine eingeschaltete Werkstatt (Admin-PC oder eigener PC) und den Zweig bei GitHub (nach dem Zusammenführen gelöschte Zweige: „nicht mehr vorhanden“).
- **Restrisiko umbenannte Geheimnisse:** Erkannt werden umbenannte bzw. kopierte Geheimnis-Dateien
  - mit gleichem Inhalt (Blob-Kennung, Arbeitsordner und Baum-Modus),
  - im Baum-Modus über Gits Umbenennungs- und Kopie-Erkennung (`--find-renames --find-copies --find-copies-harder`, Ähnlichkeit ab 50 %; auch wenn die Quelle unverändert bleibt),
  - in beiden Modi über den Zeilenvergleich: neue Datei mit mindestens 50 % der bedeutsamen Zeilen einer Geheimnis-Datei des Startstands (im Baum-Modus Inhalt per `git cat-file blob`, bis 512 KB; größere neue Dateien werden dann nur genannt).

  **Grenzen des Zeilenvergleichs:** höchstens **50 Geheimnis-Dateien** des Startstands zu je **64 KB**, in Pfad-Reihenfolge (weitere bzw. größere werden nicht verglichen);
  es zählen nur Zeilen ab **8 Zeichen** (getrimmt); ab da gilt nur **exakte Gleichheit** der Zeile – schon ein geändertes Zeichen, andere Einrückung innerhalb der Zeile
  oder ein anderes Zeilenende-Zeichen in der Zeile macht sie ungleich. Nicht erkannt werden außerdem: eine Geheimnis-Datei, die erst im Lauf angelegt **und** dann
  umbenannt wird (sie ist nicht im Startstand), ein stark umgeschriebener, umformatierter oder zerstückelter Inhalt, und Inhalte, die nur durch Zeilenende-Umwandlung
  (autocrlf) abweichen (Blob-Kennung). Dort greift nur noch die Maskierung bekannter Schlüssel-Muster.
- Die Maskierung erkennt bekannte Schlüssel-Muster; ein Geheimnis ohne erkennbares Muster in einer normalen Code-Datei würde angezeigt (wie im Code-Editor). Geheimnisse gehören nie in den Code.
- „Auf diesen Stand zurück“ je Feature ist ein Auftrag an die KI-Werkstatt: Haben spätere Aufträge anderer Features dieselben Stellen geändert, kann es Konflikte geben – dann fragt die Werkstatt nach. Datenbank-Änderungen werden nicht automatisch zurückgenommen.
- Seit 0.17.0 steuern die Ziele Ampel und Abläufe; das **Grundgerüst** richtet sich weiter nach der Art (ein Web-Projekt mit Ziel Windows braucht für die Sandbox selbst einen Ablauf `programm.yml` mit Artefakt `installation-windows`).
- **Bildschirmfoto:** nur unter Windows, nur das Fenster „Windows Sandbox“/„Windows-Sandbox“ eines Programms `WindowsSandbox*`. **Nicht auf einem echten Windows-PC getestet** (hier nur Linux): Auf Windows 11 24H2
  heißt das Programm `WindowsSandboxRemoteSession`, früher `WindowsSandboxClient`; passt der Titel nicht, kommt „Kein Fenster“, nie ein anderes Fenster. Eine Gruppenrichtlinie, die PowerShell-Skripte verbietet,
  verhindert das Foto. `PrintWindow` kann je nach Grafik ein leeres Bild liefern – dann „leeres Bild“ statt Foto. Was in der Sandbox zu sehen ist, entscheidet das Programm darin; darum die Prüfung vor dem Senden.
- **Testseite von Programmen:** zeigt die Oberfläche, nicht die Rust-/Geräte-Logik; Befehle ohne Beispiel in `vorschau/beispiele.js` melden „nicht nachgespielt“. Wie bei allen neuen Projekten muss die Adresse
  der Testseite in `web/public/_headers` (frame-src) der Codeschmiede stehen, sonst bleibt die eingebettete Vorschau leer (Regel seit Befund S3; die Werkstatt darf diese Datei nicht ändern).
- **Werkzeug-Konsole und Dokument:** brauchen die eingeschaltete Werkstatt des Admins; ein Lauf, der länger als 14 Minuten braucht, endet mit „bei GitHub ansehen“. Höchstens 60 Seiten; das PDF selbst lädt die
  Codeschmiede nicht herunter. Die Ausgabe ist gekürzt und maskiert nur bekannte Schlüssel-Muster – Beispiel-Eingaben dürfen keine echten Personendaten enthalten.
- Testlauf-Konsole, Dokument-Vorschau, Sandbox und Bildschirmfotos sieht und startet nur der Admin (Aktionen sind Admin-Sache, wie bisher).
- Ein Dienst, der vor dem Ende eines langen Laufs beendet wird, lässt die Aktion stehen; nach 15 Minuten nimmt eine andere Werkstatt des Admins sie neu (startet den Lauf noch einmal).
- Der Punkt-Status im Baum zählt nur Aufgaben mit Bezug zum Feature (Aufgaben an einer Gruppe zählen nicht).

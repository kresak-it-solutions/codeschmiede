# Codeschmiede – Konzept

**Stand:** 2026-11-02 (zuletzt: Chat-Baustein, Zustände, Push, Design-Kennungen, Vorhaben – Rest der Befunde vom 01.11.) · angelegt 2026-10-22 · Wer: Gerhard Kresak (Anweisungen und Freigaben 2026-10-22 12:06–13:39), Claude (Konzept, Umsetzung)
**Herkunft:** entstanden als „Trainer-to-go Programmierumgebung“ im Repo `trainer-to-go` (Zweig `feature/auftrags-zentrale`, Entwurf 0.4 freigegeben 12:37);
seit 13:16 eigenes Programm für alle Projekte. Entwurf: `docs/entwurf-0.4.html`.

## Entscheidungen (Gerhard)
| Zeit | Entscheidung |
|---|---|
| 12:09 | Auftrags-Zentrale: Bereich › Gruppe › Feature, Auftrags-Chat je Gruppe/Feature, Rückfragen und Ergebnis auf der Seite, Push nur bei Rückfragen/Freigabe, ein Auftrag je Gruppe, Warteschlange |
| 12:14 | „Freigeben & zusammenführen“ am Ergebnis; neue Features kommen automatisch dazu (7 Tage „Neu“) |
| 12:18 | Markierung „Hier wird gerade gearbeitet“; Weg eines Auftrags bis Sicherheitsprüfung und Wissen |
| 12:23 | Lokal arbeitende Werkstatt-PCs; muss einwandfrei laufen; Features löschen; alles synchronisiert; mehrere Benutzer (Programmieren/Texte); Freigeben nur Admin oder mit Recht |
| 12:27 | Rollen Admin/Entwickler/Texter/Leser; Löschen = Ausblenden oder Ausbauen; Einladung per E-Mail; Live-Vorschau (eigenes Fenster) mit „Zeigen & kommentieren“ |
| 12:29/12:31 | Neue Features und Gruppen anlegen; live mitsehen; Erlaubnis-Anfragen im Programm bestätigen |
| 12:37 | Entwurf 0.4 freigegeben („lege los“) |
| 13:14 | ~~Claude über API-Schlüssel~~ (ersetzt 14:22); beide Admin-Konten (office@ und Gmail) bleiben |
| 13:16 | **Ein Programm mit Projektwechsel** für alle Apps; eigenes Repository; Name **Codeschmiede** |
| 13:18 | Nutzungslimits immer sichtbar und live; Modellwahl nach Aufwand und Komplexität |
| 13:19 | Eigene Datenbank in Frankfurt – **vorerst** im Supabase-Testprojekt von Trainer to go (kostenloser Platz belegt); Umzug, sobald ein Platz frei ist |
| 13:5x | Platz frei geworden: eigenes Supabase-Projekt `codeschmiede` in Frankfurt (eu-central-1) |
| 14:50 | Projekt war seit dem Anlegen defekt („account does not have the necessary privileges“) → von Gerhard gelöscht und neu angelegt: `mvzlbpijdvsjnemubofy`, Region EU (eu-west-1, Irland – im Gratis-Tarif keine Stadtwahl). Datenbank 0001–0004 eingespielt (17 Tabellen, alle mit RLS, 127 Funktionen von Trainer to go) |
| 14:22 | **Werkstatt über das offizielle Claude Code mit dem eigenen Abo-Login** (kein API-Schlüssel); „Nutzungslimits“ = **Abo-Limits** (5-Stunden-Fenster und Woche), immer sichtbar; Werkstatt richtet sich danach. Nur interne Nutzung |

## Aufbau
| Teil | Wo | Aktualisierung |
|---|---|---|
| Oberfläche | `web/`, gehostet (Cloudflare Pages), im Programmfenster live geladen | sofort nach Veröffentlichung |
| Programm-Hülle | `desktop/src-tauri` (Tauri 2), Windows + Mac | automatisches Update (signiert) über `codeschmiede-updates.pages.dev`: im Hintergrund geladen, beim nächsten Start aktiv |
| Werkstatt-Dienst | `desktop/dienst` (Node; startet das offizielle Claude Code mit dem Abo-Login der Person) | mit dem Programm |
| Daten | Supabase, Tabellen `ws_*` mit RLS und Live-Abgleich | live |
| Code der Projekte | GitHub-Repository je Projekt | Pull Request je Auftrag |

## Projekte
Jedes Projekt hat eigene Bereiche, Gruppen, Features, Mitglieder (Rolle je Projekt) und Rechte je Bereich. Neues Projekt per Assistent
(Name, Kennung, Beschreibung, GitHub-Repository, Symbol) mit Vorlage: App (Oberfläche & Design, Funktionen), Daten & Rechte (Datenbank,
Anmeldung & Rechte), Betrieb (Handbuch & Texte, Einstellungen & Datenschutz). Für jedes Projekt gilt das AI-Dev-OS-Regelwerk; die Werkstatt
stellt beim ersten Auftrag eines neuen Projekts zuerst ihre Fragen (Pflicht-Start).

### Projekt-Arten (seit 0.9.0, Entwurf 1.0 vom 2026-10-24)
| Art | Grundgerüst | Vorschau | Veröffentlichen |
|---|---|---|---|
| Web-App | React + Vite + Tailwind, Supabase optional, Prüfung (Test + Build) | Live-Vorschau (Cloudflare-Testseite je Zweig) | Test & Live (Zweig „live“) |
| Programm | Tauri 2, Build Windows/Mac je Zweig in GitHub | Windows-Sandbox (Build aus GitHub, nur darin gestartet) | GitHub-Release, Updates optional |
| Handy-App | wie Web-App + PWA (Manifest, Offline) | Live-Vorschau in Handy-Größe | wie Web-App; Stores später |
| Werkzeug | Node mit Tests, Ablauf „Lauf“ (per Knopf / Zeitplan) | Testlauf in GitHub mit Ergebnis-Datei | Zeitplan im Ablauf |
Die Ampel („Anbindungen“) prüft die Werkstatt des Admins nur lesend über GitHub; kein Projekt-Code läuft auf dem Admin-PC.

### Code-Editor (seit 0.9.0)
Menüpunkt „Code“: Dateibaum und Dateien je Zweig über eine Werkstatt (nur lesen aus dem Abgleich-Klon; Inhalte liegen höchstens eine Stunde in
`ws_code_anfragen`). Bearbeiten nur auf main; Speichern = Auftrag mit `hand = true` und Dateien in `ws_code_aenderungen`. Die Werkstatt schreibt genau
diese Dateien in den Auftrags-Zweig (Konflikt-Prüfung je Datei gegen den Ausgangsstand), Commit, Push, Pull Request – danach der normale Weg.

### Datenbank-Station (seit 0.9.1)
| Zweig | Datenbank | Wann |
|---|---|---|
| main | Test (`db_test_ref`) | automatisch nach dem Zusammenführen |
| live | Live (`db_live_ref`) | beim Live-Schalten (nach Freigabe), vorher Sicherung des Aufbaus |
Ablauf `.github/workflows/datenbank.yml` (Vorlage `desktop/dienst/vorlagen/_datenbank/`), Buchführung je Datenbank in `codeschmiede.migrationen`,
Sicherungen in `codeschmiede.sicherungen` (Schema ohne Zugriff für anon/authenticated). Zugang: GitHub-Umgebungen „test“/„live“ mit Zweig-Regel und
Geheimnis `SUPABASE_DB_URL` (Session pooler, nur diese Datenbank); Variable `BESTEHEND` je Umgebung. Live startet die Werkstatt nach dem Live-Schalten.
Zurück auf eine ältere Version setzt nur den Code zurück; die Datenbank bleibt (Sperre, wenn die Version nicht zur Datenbank passt).
Seit 0.9.6: Jede Datenbank ist in `codeschmiede.umgebung` als Test oder Live gekennzeichnet (mit Projektkennung, nie der Adresse) – zeigt ein Geheimnis
auf die falsche Datenbank, bricht der Lauf vor dem Einspielen ab. Jede Datei bekommt `codeschmiede.ziel` (test/live) mit; das Projekt prüft damit Demo-
und Testteile (z. B. `app.ist_live()` in Trainer to go). Nach jedem Live-Lauf hält die Station Demo-Zeitpläne und Zeitpläne an, die ein anderes
Supabase-Projekt aufrufen.

### Fehler-Meldungen (seit 0.9.2)
App → `ws_fehler_melden(schluessel, daten)` (auch ohne Anmeldung, nur mit Melde-Schlüssel) → Bereinigung → `ws_fehler` (zusammengefasst je Fingerabdruck
aus Text ohne Zahlen, Stelle ohne Zeile, Umgebung). Grenze 300/Stunde je App (`ws_fehler_grenze`), Löschung 30 Tage nach der letzten Meldung.
Lesen: Projektmitglieder; Stand ändern und „Als Auftrag“: Admin und Entwickler (Auftrag nur mit Auftrags-Recht in der Gruppe).

### App-Designer 3.0 (seit 0.11.0, Anweisung Gerhard 2026-11-01 22:18/22:38)
Für Projekte mit **Design-System-Paket** (Trainer to go: `docs/design-2/DESIGN-SYSTEM.md`, erzeugt von `tools/design-system.mjs` aus Entwurf 2.0,
Konzept §4/§5/§8, `src/index.css`, Routen) sieht der App-Designer aus wie der Design-Entwurf 2.0: Leiste Rolle · PC/Handy · Hell/Dunkel ·
Bausteine zeigen · Begründung; links Seiten je Rolle, Mitte Vorschau, rechts Inspektor (Baustein · Tokens · Prüfungen). Reiter **Entwurf**
(Masken des Entwurfs in der Rahmen-Seite `/entwurf-rahmen/` mit Sandbox und eigener CSP – ein `srcdoc` würde die strenge CSP der Oberfläche erben) und **Echte App (Testfassung)** (Vorschau-Protokoll der App). Das Paket ist die einzige Quelle –
die Codeschmiede hat keine Kopie von Tokens, Bausteinen, Seiten oder Begründungen (`web/src/designSystem.js` prüft es streng). Token-Änderungen
gehen als Entwurf ins Design-Paket der App (`tokens.ds`) über deren Rechteprüfung; Kontrast-Wächter mit Paaren und Regeln aus dem Paket
(„Blau nie Status“, „Terminart ≠ Status“). Projekte ohne Paket behalten Grunddesign/Bausteine (Ausgangswerte jetzt Design 2.0, Blau).

### App-Designer 2.0 (seit 0.9.7, Entwurf frei 2026-10-24 22:08)
Ein Designer, der sofort wirkt: Aussehen geht über die Design-Pakete der App (Trainer to go: `DesignPackage`), nur neue Bausteine laufen als
Auftrag, Farben frei mit Kontrast-Wächter (`web/src/kontrast.js`). Etappe 1 „Bausteine“: Galerie in der Mitte, Linksklick wählt,
Inspektor rechts (Bearbeiten | Chat), Sofort-Vorschau und Entwurf im Design-Paket; Freigabe über App-Designer › Seiten. Einzelheiten:
`docs/KONZEPT-BAUSTEINE.md` (Abschnitt „App-Designer 2.0“).
Etappe 3 „Neuer Baustein“: Assistent (Was? → Gestalten → Zuweisen → Als Auftrag), strukturierte geprüfte Daten und optional ein Bild am Auftrag
(Datenbank 0039, `web/src/BausteinAssistent.jsx`, `desktop/dienst/lib/bausteinAuftrag.mjs`).
Einrichtung › **Dieser PC** (0.9.8, Datenbank 0040): Seiten-Designer-Freigabe, weitere KI-Anbieter, Sandbox, alte Werkstatt-PCs (Entfernen nur Admin).
Etappe 4 „Übernehmen“: alle offenen Design-Änderungen an einer Stelle (`web/src/Uebernehmen.jsx`) – „wirkt sofort“ (Freigabe-Reiter der App,
Einzelzeilen, Ausrollen sofort/schrittweise/nur Testfassung, „Zurück auf Version N“) und „braucht Auftrag“ (Grunddesign, neue Bausteine).

### Aufgaben (0.9.10, Entwurf frei von Gerhard 2026-10-25 13:50, Datenbank 0042)
Menüpunkt **Aufgaben** direkt unter „Zu erledigen“ (`web/src/Aufgaben.jsx`; Plakette = offene Aufgaben, für die ich zuständig bin). Eine Aufgabe gehört
zu einem Projekt: Titel, „Was soll geändert werden?“, Status (Offen / In Arbeit / Erledigt), Priorität (Hoch / Mittel / Niedrig), Fällig am, Zuständig
(Mitglied des Projekts oder Admin), Bezug Feature ODER Gruppe, Links (≤ 20, nur https, ohne Zugangsdaten/Schlüssel in der Adresse, nur als Link angezeigt)
und Anhänge (≤ 20: Bilder PNG/JPG/WebP ≤ 5 MB, Dateien PDF/TXT/CSV/DOCX/XLSX ≤ 10 MB; Dateikennung wird vor dem Hochladen geprüft).
Sehen: alle Mitglieder des Projekts. Anlegen/Bearbeiten/Senden: Admin, Entwickler, Texter (Leser nur lesen). Löschen: wer angelegt hat, oder der Admin.
Anhänge liegen im **privaten Speicher-Bucket `ws-aufgaben`** (`<projekt>/<aufgabe>/<uuid>.<endung>`): Pfad wird zuerst reserviert
(`ws_aufgabe_anhang_neu`), dann genau dorthin hochgeladen (kein Überschreiben) und bestätigt (`ws_aufgabe_anhang_bestaetigen`: Größe und Typ im Speicher
müssen zur Reservierung passen; nur „fertige“ Anhänge werden gezeigt, geschickt und weitergegeben, unfertige verfallen nach 1 Stunde und werden beim Reservieren, Bestätigen und Öffnen der Aufgaben verworfen); angezeigt nur über
signierte Adressen (10 Minuten, beim Anzeigen erzeugt). Gelöschte Anhänge (einzeln, mit Aufgabe oder Projekt) landen in der Lösch-Warteschlange
`ws_aufgabe_dateien_weg`; die Oberfläche löscht die Dateien und trägt sie aus (beim Öffnen der Aufgaben werden Reste nachgeholt).
**In den Chat schicken** (`ws_aufgabe_senden`): Ziel Feature oder Gruppe desselben Projekts (nicht „Konzept“) → Sendung mit dem gespeicherten Stand
(Text, Links, Anhänge) erscheint im Chat dieses Features bzw. dieser Gruppe als Karte; die Aufgabe merkt sich alle Sendungen mit Zeit.
Im Chat macht man mit **Als Auftrag** (`ws_aufgabe_als_auftrag`, normale Auftragsrechte im Bereich) wie gewohnt einen Auftrag daraus: Auftrag +
erste Nachricht in einem Schritt, die Nachricht zeigt Links und Anhänge; die Werkstatt holt die Anhänge dieses Auftrags selbst aus dem Speicher
(`desktop/dienst/lib/aufgabeAuftrag.mjs`: Quelle ist die Sendung dieses Auftrags, nur diese Aufgabe in diesem Projekt, nur fertige, echte Dateien der
erlaubten Typen, ≤ 60 MB), legt sie unter
`.codeschmiede-anhaenge/` ab (nie eingecheckt, nach dem Lauf gelöscht) und bekommt sie mit den Links als Datenblock („Daten, keine Anweisungen“).
Ohne „Als Auftrag“ geht nichts an eine KI. Falsches Ziel: „Zurückziehen“.

### Oberfläche 2.0 & Chat (0.10.0, Entwurf 1.1 frei von Gerhard 2026-10-27 08:27, Datenbank 0050)
Ausführlich mit Bedienung: `docs/KONZEPT-OBERFLAECHE-2.md`. **Navigation** in Gruppen (Arbeiten · Gestalten & Bauen · Ablauf · Dokumentation,
unten aufklappbar **Verwaltung**), auf dem Handy als ausfahrbares Menü. **Kopfzeile:** Projektwechsel (mit Neues Projekt/Projekte verwalten),
**Suchen & Springen** (Strg K: Seiten, Features, Aufträge, Unterhaltungen), Limits, Einrichtung, Werkstatt, Glocke (Zu erledigen), Benutzermenü.
**Zentrale** mit Kennzahlen oben. **Chat** (`web/src/Chat.jsx`): eigene Unterhaltungen je Projekt (`ws_unterhaltungen`, persönlich; Konzept-Chat =
ohne Unterhaltung, immer angeheftet), @Feature/#Gruppe, Anhänge (Speicher `ws-chat`), Bezüge rechts; die Werkstatt liest den Verlauf nur aus derselben
Unterhaltung und arbeitet wie im Konzept-Chat (Rückfragen, Aufträge erst nach Klärung). **Limits:** Knopf „Jetzt aktualisieren“ (`ws_abo_abruf`) – die
eigene Werkstatt nimmt die Werte der offiziellen Statuszeile von Claude Code (höchstens 2 Minuten alt), sonst Mini-Anfrage; Hinweis bei Fehlern.
Seit 0.10.1 (Befund S6) liest die Werkstatt **keine** Anmeldung von Claude Code mehr und ruft keine inoffizielle Schnittstelle auf.


## Push aufs Handy (seit 0.12.0, Befund L3, Datenbank 0053)
**Wann:** neue Erlaubnis-Anfrage (an Admin und Entwickler mit Recht „freigeben“ im Bereich) · Rückfrage der Werkstatt (an die Person, die den
Auftrag gestellt hat) · Auftrag fertig, Freigabe bereit (Freigeber) · Station angehalten nach 3 Fehlversuchen (Freigeber). Gleiche Meldung
höchstens alle 2 Minuten. Nicht: Rückfragen der KI im Konzept-Chat (dort sitzt man ohnehin gerade).
**Text:** nur Projektname, Art und Auftragsnummer – nie Titel, Befehl, Nachricht oder Namen („Trainer to go · Erlaubnis nötig“ /
„Auftrag #12 wartet auf deine Erlaubnis.“). Tippen öffnet „Zu erledigen“ (bzw. die Zentrale bei Stationen).
**Weg:** Trigger → `ws_push_warteschlange` → `pg_net` stößt die Edge Function `push-senden` an (ohne Inhalt) → die Funktion holt die Zeilen
mit dem Dienst-Schlüssel (`ws_push_abholen`), verschlüsselt Ende-zu-Ende (RFC 8291) mit dem VAPID-Schlüssel und gibt sie dem Push-Dienst
des Geräts → `ws_push_ergebnis` (404/410 = Gerät entfernt). Ohne `pg_net` oder ohne Funktion bleibt alles liegen und geht beim nächsten
Anstoß raus (nur Meldungen der letzten Stunde). Der Anstoß braucht keine Anmeldung, kann aber nur die vorhandene Warteschlange abarbeiten; höchstens ein Lauf je 2 Sekunden (`ws_push_bremse`), Antwort nur `{ok:true}`. Empfänger von Erlaubnis/Freigabe/Station: Admin und wer im Bereich „freigeben“ darf **und im Projekt Entwickler** ist (wie `ws_darf`). Ein Gerät, das schon einer anderen Person gehört, lässt sich nur mit denselben Geräteschlüsseln übernehmen.
**Geheimnisse:** `VAPID_PRIVATE_KEY` nur als Supabase-Secret (Ablauf „Web-Push-Schlüssel erzeugen“), nie im Repository, in der Datenbank oder im Log.
Der öffentliche Schlüssel kommt von der Funktion (`GET …/push-senden?schluessel=1`).
**Kosten:** keine – Supabase-Gratis-Kontingent (Edge Functions, `pg_net`), Push-Dienste der Browser kostenlos.

### Einrichten – was Gerhard einmalig tut (nach dem Zusammenführen des PR)
1. **Datenbank 0053 einspielen:** GitHub › Repository `kresak-it-solutions/codeschmiede` › **Actions** › „Datenbank einspielen“ › **Run workflow**,
   Zweig `main`, Feld „Pfad“: `migrations/0053_push.sql` › grüner Knopf „Run workflow“. Grün = fertig. (Alternativ die Zeile
   `migrations/0053_push.sql` in `supabase/einspielen.txt` in main eintragen – die Werkstatt darf das nicht.)
2. **Schlüssel erzeugen (= Geheimnis bestätigen):** Actions › **„Web-Push-Schlüssel erzeugen“** › Run workflow, Zweig `main`, Häkchen
   „ueberschreiben“ **aus** lassen › Run workflow. Im Ergebnis steht „VAPID-Schlüssel gespeichert“. Prüfen: Supabase › Projekt `codeschmiede` ›
   Edge Functions › **Secrets**: `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` sind da (Werte nicht ansehen nötig).
3. **Funktion veröffentlichen:** läuft beim Zusammenführen von selbst („Push-Funktion veröffentlichen“). Falls nicht grün: Actions ›
   „Push-Funktion veröffentlichen“ › Run workflow (Zweig `main`). Prüfen: Supabase › Edge Functions › `push-senden` ist da,
   „Verify JWT“ ist **aus**.
4. **`pg_net` prüfen:** Supabase › Database › Extensions › `pg_net` ist eingeschaltet (0053 schaltet es selbst ein; falls ausgegraut: einschalten).
5. **Auf dem Handy erlauben:**
   - **iPhone (ab iOS 16.4):** Safari › `https://codeschmiede.pages.dev` › unten **Teilen** › **„Zum Home-Bildschirm“** › Hinzufügen. Die
     Codeschmiede **vom Home-Bildschirm** öffnen, anmelden, oben rechts auf deinen Kreis (Benutzermenü) › **„Push aufs Handy“** ›
     **„Auf diesem Gerät erlauben“** › bei der Frage des iPhones **„Erlauben“**.
   - **Android:** Chrome › `https://codeschmiede.pages.dev` › anmelden › Benutzermenü › „Push aufs Handy“ › „Auf diesem Gerät erlauben“ ›
     „Zulassen“ (Zum Startbildschirm hinzufügen ist empfohlen, aber nicht nötig).
6. **Testen:** im selben Dialog **„Test senden“** – nach wenigen Sekunden kommt „Test: Push-Nachrichten kommen auf diesem Gerät an.“
Kommt nichts: Supabase › Edge Functions › `push-senden` › **Logs**; Handy-Einstellungen › Mitteilungen › Codeschmiede erlaubt?
Schlüssel ersetzen (z. B. nach einem Leck): Schritt 2 mit Häkchen „ueberschreiben“, danach auf jedem Gerät Schritt 5 wiederholen.

### Wenn es hier nicht geht – Funktion von Hand veröffentlichen
Supabase-CLI auf einem PC (nicht nötig, wenn Schritt 3 grün ist): `supabase login`, dann im Repository
`supabase functions deploy push-senden --project-ref mvzlbpijdvsjnemubofy --no-verify-jwt` und Secrets mit
`supabase secrets set --project-ref mvzlbpijdvsjnemubofy VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=…` (Schlüssel z. B. mit `npx web-push generate-vapid-keys`).

## Rollen und Rechte
| Rolle | Aufträge | Freigeben / Erlauben | Löschen | Claude | GitHub |
|---|---|---|---|---|---|
| Admin (Gerhard) | alle | alle | alle | Claude Code mit seinem Abo | ja |
| Entwickler (je Projekt) | je Bereich | nur wenn vergeben | nur wenn vergeben | Claude Code mit eigenem Abo | ja |
| Texter (je Projekt) | nur Text-Aufträge | nie | nie | nein | nein |
| Leser (je Projekt) | nein | nein | nein | nein | nein |
Neue Projekte, Gruppen, Mitglieder, Abo-Schwellen: nur Admin.

## Weg eines Auftrags (seit 0.3.0, Entwurf 0.7 freigegeben 2026-10-22 20:41)
Auftrag → In Arbeit (Werkstatt-PC, eigener Zweig; seit 0.10.1 **keine** Bauen & Tests auf dem PC, Befund S1) → **Freigabe** (Klick; Admin oder Recht) →
**Sicherheitsprüfung** (automatisch auf dem Admin-PC: Bauen & Tests + unabhängige Claude-Prüfung der Änderung) → **Zusammenführen** (Klick) →
**Feature-Prüfung** (automatisch: Testfassung = Zweig + neuester main, Bauen & Tests, unabhängige Prüfung des ganzen Features) →
bei Grün Pull Request in main = **live** → **Live & Wissen**. Seit 0.10.2 (Befund L2) sind **alle Prüfläufe auf GitHub** (z. B. „Prüfung“) ein Tor:
die Stationen warten darauf (höchstens 45 Min.), rot = Nacharbeit, und prüfen sie unmittelbar vor dem Zusammenführen noch einmal. Scheitert eine Station
an etwas anderem (z. B. GitHub nicht angemeldet), startet sie nach 1, 5 und 30 Minuten neu und ist danach **angehalten** – „Erneut versuchen“ in der
Stationen-Übersicht (Datenbank 0052, Recht „freigeben“). Ein grün geprüfter Stand wird nicht noch einmal geprüft (Befund L1). Ab Abo-Schwelle
„klein“ prüft Sonnet das ganze Feature, die Sicherheitsprüfung bleibt Opus (L6). Rot an einer Prüfung → **Nacharbeit** (Werkstatt behebt, dann wieder Freigabe);
live geht dabei nichts. Reine Fragen → beantwortet, „erledigt“. Stationen oben in der Zentrale anklickbar (Übersicht nach Feature, einzeln oder alle).
Bauen & Tests laufen nur in GitHub („Prüfung“) und Cloudflare – auf keinem PC der Codeschmiede läuft Projekt-Code (seit 0.10.1, Befund S1;
die frühere Ausnahme „Bauen & Tests auf dem PC“ vom 22.10. 20:36 ist aufgehoben).

## Feature-Arbeitsplatz (seit 0.3.0)
Klick auf ein Feature = Kurzinfo; Doppelklick = Chat links, Live-Vorschau rechts (Trennlinie verschiebbar). Vorschau = Testseite des Zweigs
(`<zweig>.<vorschau_domain>`), sonst die App; „Neuer Stand da“ über `version.json`; „Zeigen & kommentieren“ über den Vorschau-Helfer der App
(nur Testseiten; seit 0.10.1 nur Name, Seite und Pfad des Elements – nie sein sichtbarer Text, Befund S4). Zweig-Testseiten laden erst nach
dem Klick „Verstanden, Vorschau anzeigen“ und zeigen dauerhaft „hier nicht anmelden“ (Befund S5), im Rahmen mit Sandbox (S7). Nachrichten aus Gruppen-Chat und Claude-Chat erscheinen beim Feature mit Herkunft.

## Werkstatt (Schritt 2)
- Läuft im Programm, wenn „Werkstatt an“; holt den nächsten wartenden Auftrag aus Gruppen, in denen der Benutzer Auftragsrecht hat.
- Startet das offizielle Claude Code (`claude -p … --output-format stream-json`) mit dem Abo-Login der Person; Umgebungsschlüssel
  (`ANTHROPIC_API_KEY` u. a.) werden entfernt. Erlaubnis-Anfragen laufen über ein eigenes MCP-Werkzeug (`erlaubnis-mcp.mjs`) in die Zentrale. Im Arbeitsordner `<Daten>/projekte/<projekt>/auftrag-<nr>` (git worktree)
  auf Zweig `feature/cs-<nr>-<kurz>`; Regeln aus dem Projekt (AGENTS.md/CLAUDE.md) gelten.
- **Modellwahl:** Text-Auftrag oder kleine Änderung → kleines Modell; normale Funktion → mittleres; Datenbank, Rechte, Login, Migration,
  Ausbau oder Risiko HOCH → großes Modell; Fehlschlag → eine Stufe höher. Gewähltes Modell steht am Auftrag.
- **Abo-Limits:** Claude Code meldet den Stand (5-Stunden-Fenster, Woche, Rücksetzzeit) im Lauf bzw. über die optionale Statuszeile
  (`werkzeuge/abo-statuszeile.mjs`, schreibt `~/.codeschmiede/abo.json`). Werkstatt speichert ihn in `ws_abo_limits` (live für alle im Projekt).
  Ab `abo_klein_ab_prozent` (Standard 75) eine Modellstufe kleiner, ab `abo_pause_ab_prozent` (95) keine neuen Aufträge bis zur Rücksetzung.
  Rechnerischer Wert jedes Laufs → `ws_verbrauch` (nur Information, keine Extrakosten).
- Live-Log (Lesen, Ändern mit Ausschnitt, Befehle, Tests) ohne Geheimnisse; Erlaubnis-Anfragen für Befehle außerhalb der freigegebenen Liste;
  Rückfrage beendet den Lauf mit `RÜCKFRAGE:` und setzt beim Antworten fort; Ergebnis: Pull Request → Stand „Freigabe“.

## Schritte
| Schritt | Inhalt | Stand |
|---|---|---|
| 1 | Datenbank v1, Zentrale, Benutzer & Rechte (in Trainer to go gebaut und getestet) | erledigt 2026-10-22 |
| 1b | Umzug ins Repository `codeschmiede`, Datenbank v2 (Projekte, Verbrauch) und v3 (Abo-Limits), Oberfläche mit Projektwechsel und Verbrauchsanzeige | in Arbeit |
| 2 | Programm (Tauri) + Werkstatt-Dienst | in Arbeit |
| 3 | Live-Vorschau mit „Zeigen & kommentieren“ | erledigt 2026-10-23 (Feature-Arbeitsplatz und eigener Menüpunkt) |
| 4 | Zusammenführen / Sicherheitsprüfung / Wissen auf dem Admin-PC; Zweige & Versionen, Prüfstand, Wissensdatenbank, Änderungsprotokoll, Dokumentation | erledigt 2026-10-23 (0.6.0, Projekt-Abgleich) |

## Aufbau der Oberfläche im Code (seit 0.10.3, Befund B1)
`web/src/App.jsx` = Rahmen, Kopfzeile, Navigation, Ansichten-Weiche · `web/src/seiten/*.jsx` = Seiten (Zentrale, Zu erledigen & Live, Live-Vorschau,
Verwaltung, Verbrauch, Werkstatt, Anmelden, Kopfzeile) · `web/src/bausteine/grund.jsx` = Knopf-Klassen, Hilfen, `Badge`, `Toast`, `Dialog` (mit
Fokusfalle), `BestaetigenRahmen`/`useBestaetigen`, `useFokusfalle` · `web/src/bausteine/chat.jsx` = **ein Chat-Baustein** für alle Chats (seit 0.11.1, B4) ·
`web/src/bausteine/zustand.jsx` = Lade-, Leer- und Fehlerzustand (seit 0.11.1, B9) · `web/src/daten/werkstattDaten.js` = Live-Daten und Rechte. Übrige Bereiche
(Chat, Aufgaben, Designer …) haben wie bisher eigene Dateien.

### Ein Chat-Baustein (seit 0.11.1, Befund B4)
| Ort | Bezug-Chip | Knöpfe | Wohin |
|---|---|---|---|
| Menü „Chat“ | Projekt bzw. Konzept | Besprechen | `ws_claude_chat` (Unterhaltung), Anhänge `ws-chat` |
| Konzept-Chat | Projekt · Konzept | Besprechen | `ws_claude_chat` ohne Unterhaltung |
| Gruppen-/Feature-Chat (Zentrale, Live-Vorschau) | Gruppe bzw. Feature (+ Baustein) | Besprechen · Antworten (offene Rückfrage) · Als Auftrag (nur mit Baustein aus „Zeigen & kommentieren“) | Konzept-Chat · `ws_nachrichten` · `ws_auftraege` |
| Design-Chat | Projekt · Design/Marke/Bausteine | Besprechen (Entwurf oben „Als Auftrag“) | `ws_design_chat` |
| Baustein-Chat (Inspektor) | Baustein | Besprechen | `ws_design_chat` mit `[Baustein …]` |
| Umdesign | Symbol bzw. Baustein | Besprechen (Entwurf unten „Als Auftrag …“) | `ws_design_chat` mit `[Umdesign …]` |
| Chat zur Kachel | Kachel | Als Auftrag (Bestätigung in der Codeschmiede) | `ws_design_auftrag` |
Begriffe fest: **Besprechen** = die KI antwortet, gebaut wird nichts; **Als Auftrag** = geht an die Werkstatt mit Freigabe und Prüfungen;
**Antworten** = nur auf eine Rückfrage eines laufenden Auftrags. Enter = Hauptknopf, Umschalt+Enter = neue Zeile. Neue Chats nur mit diesem Baustein.

### Lade-, Leer- und Fehlerzustand (seit 0.11.1, Befund B9)
`Laden` (Skeleton, erst nach 300 ms) · `Leerzustand` (Symbol, ein Satz, höchstens eine Aktion) · `Fehlerzustand` (Meldung und „Erneut versuchen“).
Beim ersten Laden ersetzt der Fehlerzustand den Inhalt; scheitert ein späteres Neuladen, bleibt der letzte Stand mit Hinweis stehen. Meldungen unten
(Toast) nur noch für Ergebnisse von Klicks, nicht für Ladefehler.

## Offene Punkte aus den Befunden vom 01.11.2026 (`docs/BEFUNDE-2026-11-01.md`)
- ~~L3 Push-Nachricht aufs Handy~~: gebaut in 0.12.0 (Abschnitt „Push aufs Handy“).
- **L4 Warteschlange fürs Zusammenführen:** Seit 0.10.2 höchstens 3 Neustarts wegen eines bewegten main, dann „angehalten“. Eine echte
  Warteschlange (oder die Merge-Queue von GitHub) folgt mit L7.
- **L7 Vorhaben mit Stufen** (ein Auftrag, mehrere PRs) und Übernahme der Nacharbeit durch einen anderen PC derselben Person (heute: Nacharbeit
  nimmt jeder PC der Person, die den Auftrag gestellt hat): eigenes Konzept mit Entwurf.
- **L2 Schutzregel auf GitHub:** Die Codeschmiede wartet jetzt selbst auf alle Prüfläufe. Zusätzlich empfohlen: Schutzregel für `main` mit
  Pflicht-Prüflauf „Prüfung“ (Einstellung in GitHub, macht Gerhard bzw. der zusammenführende Chat).
- ~~B4 ein Chat-Baustein~~ und ~~B9 Lade-/Leer-/Fehlerzustand~~: erledigt in 0.11.1. Rest: der Chat zur Kachel ist Oberfläche von Trainer to go
  (`src/components/design/KachelChat.jsx`) – dort „Besprechen“/„Als Auftrag“ nachziehen (Auftrag im Projekt Trainer to go).
- **L9 geprüft:** Der Kopplungs-Abgleich macht keine Mini-Anfragen (nur `--version`, `auth status`/`login status`, Limits von Codex ohne Anfrage).


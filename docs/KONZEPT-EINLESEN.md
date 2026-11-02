# Bestehendes Projekt einlesen (0.15.0)

**Stand:** 2026-11-02 · **Wer:** Gerhard Kresak (Entwurf „Projekt einlesen“ freigegeben 02.11.2026), Claude (Umsetzung)
**Datenbank:** 0058 (`supabase/migrations/0058_projekt_einlesen.sql`, Test `supabase/tests/t46_einlesen.sql`) · **Code:** `desktop/dienst/lib/einlesen.mjs`,
`lib/einlesenKopie.mjs`, `lib/repo.mjs` › `repoEinlesen`, `index.mjs` › `einlesenArbeit`, `desktop/src-tauri/src/ordner.rs` › `ws_einlesen_quelle`/`ws_einlesen_ziel`,
`web/src/seiten/ProjektEinlesen.jsx` · **Tests:** `desktop/dienst/test/einlesen.test.mjs`

Ein Projekt, das schon irgendwo liegt (Ordner auf der Festplatte, ZIP aus einem anderen Claude-Chat), wird in die Codeschmiede übernommen:
geprüft, sortiert in einen neuen Projektordner kopiert, als privates Repository angelegt und in Gruppen und Features gegliedert.

## Grundsätze
| Thema | Regel |
|---|---|
| Wer | Nur der Admin, nur im Programm (Projektwahl oben › „Bestehendes Projekt einlesen“, neben „Neues Projekt“). |
| Wo | Die eigene Werkstatt des PCs, auf dem die Quelle gewählt wurde – nur dieser PC kennt den Pfad (`<App-Daten>\werkstatt\einlesen.json`, schreibt nur das Programm; die Datenbank kennt nur eine zufällige Kennung und den Dateinamen). |
| Ausführen | **Nie.** Kein `npm install`, keine Skripte, keine Hooks – nur lesen, prüfen, kopieren, `git` ohne Hooks und `gh`. |
| Original | Wird nur gelesen (kopieren, nie verschieben). Ist der Zielordner `<Projekte-Ordner>\<kennung>` schon da, wird abgebrochen. |
| Geheimnisse | Werden nie übernommen, nie protokolliert, nie an die KI gegeben. Angezeigt werden nur Dateiname und Anzahl. |
| Personendaten | Dateien mit Hinweisen bleiben standardmäßig draußen; der Admin entscheidet je Datei. |
| Git-Geschichte | Wird nicht übernommen – es entsteht ein frischer erster Stand. |
| Regeln | Eine gefundene `CLAUDE.md`/`AGENTS.md` wird als Vorschlag in `regeln\REGELN.md` übernommen und gilt erst nach Bestätigung durch den Admin (Prüfsumme je PC, wie bisher). |
| Prüfungen/Regelwerk | Werden **nicht** ungefragt eingebaut. Es entsteht automatisch die Aufgabe „Prüfungen und Regelwerk ergänzen“ (Menü „Aufgaben“, nicht gestartet). |

## Ablauf
1. **Quelle:** „Ordner wählen …“ oder „ZIP wählen …“ (Auswahl des Systems). ZIP höchstens 512 MB.
2. **Prüfung** (Werkstatt, nur lesen):
   - ZIP mit eigenem Leser (wie `zipEinzeln`/`zipDateien`: CRC, kein ZIP64, nicht verschlüsselt, nur „gespeichert“/„deflate“, entpackt je Datei begrenzt).
     **Abgelehnt** wird die ganze ZIP bei: `..`, absoluten Pfaden, Laufwerksbuchstaben, `\` als Trenner, Verknüpfungen (Unix-Symlink, Windows-Reparse-Punkt),
     doppelten Namen, Windows-Sondernamen, mehr als 200.000 Einträgen, verdächtigem Packverhältnis (> 1000 : 1) bzw. falscher Größenangabe (ZIP-Bombe).
   - Ordner: Verknüpfungen, Junctions und harte Links werden nie verfolgt und nicht übernommen (eigener Durchlauf plus `linksNachAussen`).
   - Grenzen: höchstens 20.000 übernommene Dateien, je 50 MB, zusammen 1 GB (ohne Ausgeschlossenes).
   - **Ausgeschlossen:** node_modules, dist, build, .git, .venv/venv, Caches (.cache, .next, .nuxt, .turbo, .vite, .svelte-kit, __pycache__, …), coverage, .idea,
     __MACOSX, `target` neben einer Cargo.toml, .DS_Store, Thumbs.db, desktop.ini, `._*`, *.pyc, *.log, *.tmp.
   - **Gefährlich** (nicht übernommen): .exe .dll .bat .cmd .ps1 .scr .msi .com .vbs .hta .jar .lnk .url .webloc .desktop u. a., dazu Dateien,
     die ihrem Inhalt nach Programme sind (Windows-, Linux-, Mac-Programm, Windows-Verknüpfung).
   - **Geheimnisse:** `.env*`, `*.pem`, `*.key`, `*.p12`, `id_rsa`/`id_ed25519` …, `credentials.json` sowie Inhalte mit `sk-…`, `ghp_…`/`gho_…`, `github_pat_…`, `AKIA…`,
     private Schlüssel, Supabase-JWT mit `role: service_role` (der öffentliche anon-Schlüssel zählt nicht), `sb_secret_`/`sbp_`, Stripe/Slack-Schlüssel,
     Passwörter in Adressen. Dateien über 5 MB, die nicht geprüft werden können, werden ebenfalls nicht übernommen.
   - **Personendaten:** CSV/TSV (Kopfzeile), JSON (Schlüssel in mehreren Datensätzen, keine Konfig-Dateien), XLSX (Texte der Tabelle), SQL-Abzüge mit Daten;
     Treffer bei E-Mail, Telefon, Geburtsdatum, IBAN/SV-Nummer oder Name **zusammen mit** Adresse. Tabellen/Datenbanken ohne lesbaren Kopf (xls, ods, sqlite, db) gelten vorsichtshalber als Hinweis.
   - **Technik:** package.json (React, Vue, Svelte, Angular, Next, Vite, Tailwind, Supabase, Electron, Tauri), Cargo, Python, Go, Java/Kotlin, .NET, PHP, PWA, statische Webseite → Vorschlag der Art.
3. **Einordnen:** Name, Kennung (Prüfung wie beim neuen Projekt, nicht vergeben), Art. Vorschlag je Eintrag der obersten Ebene (änderbar):
   Code · Konzept (KONZEPT*, anforderungen*, Konzept-Ordner) · Doku (HANDBUCH*) · Code + Doku (README, docs/) · Material (Bilder, PDF, Office, Design-Ordner) · Weglassen.
   Ziel im Projektordner: `code\` (über das Repository), `konzept\eingelesen\`, `doku\eingelesen\`, `material\`, `regeln\REGELN.md`, `sicherungen\`, `setup\`.
   (`konzept\KONZEPT.md` und `doku\` spiegelt die Codeschmiede selbst und würde Eingelesenes überschreiben – darum die Unterordner „eingelesen“.)
4. **Repository** (Knopf „Einlesen“): Projekt anlegen → Programm legt den Projektordner neu an (bricht ab, wenn es ihn gibt) → Werkstatt prüft die Quelle noch einmal,
   kopiert, schreibt REGELN.md, **prüft den Code unmittelbar vor dem Hochladen noch einmal auf Geheimnisse und Verknüpfungen (Fund → Abbruch, nichts hochgeladen)**,
   legt `kresak-it-solutions/<kennung>` **privat** mit der GitHub-Anmeldung der Werkstatt an (`gh`, keine gespeicherten Zugangsdaten) und lädt den ersten Stand
   „Projekt eingelesen am TT.MM.JJJJ“ auf main hoch. Danach: Repository eingetragen, „Test & Live einrichten“ angefordert (Zweig live wie bei neuen Projekten),
   Aufgabe „Prüfungen und Regelwerk ergänzen“, Arbeitskopie in `code\` geklont, Konzept-Dateien (Markdown/Text) ins Wissen – je Abschnitt ein Eintrag,
   gekennzeichnet „[Eingelesen aus …, ungeprüft]“, höchstens 40. Testseite und Datenbank bleiben wie bisher per Knopf.
5. **Gruppen & Features:** Die eingestellte KI (Zuständigkeit „Konzept“, verpflichtend, kein Ausweichen; fehlt sie, wartet der Schritt und versucht es alle 5 Minuten)
   bekommt **nur eine Strukturliste**: Routen (path-Angaben in Routen-Dateien, Seiten-Ordner), Menüeinträge (label/title in Menü-Dateien), Komponentennamen
   (Dateinamen) und Pfade – keine anderen Inhalte, keine Daten, keine Geheimnisse, höchstens 24.000 Zeichen. Die Antwort wird streng geprüft (≤ 10 Gruppen,
   ≤ 15 Features, keine Gruppe „Konzept“). Übernommen wird nur, was angehakt ist (Bereich „App“, Features im Stand „Test“). Die Gruppe „Konzept“ entsteht wie immer.
6. **Fertig:** Liste „Noch zu tun“ – REGELN.md bestätigen, Schlüssel selbst eintragen (Links zu GitHub › Environments und Cloudflare › Pages), Testseite einrichten, Aufgabe ansehen.

## Datenbank 0058
`ws_einlesen` (nur Admin sieht, keine direkten Schreibrechte). Funktionen: `ws_einlesen_anfordern` (Admin), `ws_einlesen_nehmen` (Werkstatt des Admins, nur mit
lokal bekannter Quell-Kennung), `ws_einlesen_melden` (nur der haltende PC, nur erlaubte Übergänge, Bericht ohne Inhalte und ohne Pfade), `ws_einlesen_starten`
(Admin, nur neues Projekt ohne Repository), `ws_einlesen_repo` (nur genau `kresak-it-solutions/<kennung>`, privat; Aufgabe + Test & Live), `ws_einlesen_uebernehmen`
(Admin, geprüfte Gruppen), `ws_einlesen_abbrechen`. Alle `security definer` mit `search_path`, Rechte für `public`/`anon` entzogen, Protokoll `einlesen_*`.
Nicht in `supabase/einspielen.txt` – wird beim Zusammenführen eingeordnet (0057 ist für die Werkzeug-Wahl reserviert).

## Kurzanleitung (Handbuch)
**Projekt aus einem anderen Claude-Chat holen:** Im anderen Chat schreiben: „Gib mir das ganze Projekt als ZIP-Datei zum Herunterladen (ohne node_modules, dist und build,
ohne .env und Schlüssel).“ Die ZIP herunterladen (z. B. nach `D:\Downloads`), **nicht entpacken**.

**Einlesen:**
1. Im Programm Codeschmiede oben auf die Projektwahl › **„Bestehendes Projekt einlesen“**. Die Werkstatt muss an sein.
2. **„ZIP wählen …“** (bzw. „Ordner wählen …“) › Datei auswählen › **Weiter**.
3. Prüfung ansehen: Was orange ist, wird nicht übernommen (Geheimnisse, Programme, Verknüpfungen). Dateien mit möglichen Personendaten nur anhaken, wenn sie keine echten Daten enthalten.
4. Name, Kennung und Art prüfen, die Zuordnung bei Bedarf ändern › **Weiter** › **Einlesen**.
5. Warten, bis der Vorschlag für Gruppen und Features da ist › anhaken, was passt › **Übernehmen**.
6. „Noch zu tun“ abarbeiten: unter „Anbindungen“ **REGELN.md bestätigen**; Schlüssel aus der alten `.env` selbst bei GitHub (Settings › Environments) bzw. Cloudflare
   (Pages › Einstellungen › Variablen) eintragen – nie in die Codeschmiede oder in einen Chat; **Testseite einrichten**; Aufgabe „Prüfungen und Regelwerk ergänzen“ als Auftrag geben.

Das Original (ZIP bzw. Ordner) bleibt unverändert. Bricht das Einlesen ab, steht der Grund im Assistenten; ein schon angelegtes Projekt löschst du unter „Projekte verwalten“
(das GitHub-Repository bleibt bestehen und muss bei GitHub gelöscht werden, bevor dieselbe Kennung neu eingelesen werden kann).

## Nachbesserung nach der Sicherheitsprüfung (02.11.2026, Ergebnis GELB)
| Nr. | Befund | Umsetzung |
|---|---|---|
| 1 | Geheime Dateien nach Namen | env-Dateien nach `(^|[.-_])env([.-_]|$)` (z. B. `.env.production`, `prod.env`, `app_env.txt`) und `.envrc`; dazu `.npmrc`, `.pypirc`, `.docker/config.json`, `.netrc`, `.git-credentials`, `*.p12`, `*.pfx`, `*.keystore`, `credentials.json`, `service-account*.json`. **Ausnahme:** Quell- und Typ-Dateien (`vite-env.d.ts`, `env.js` …) – sonst fiele bei jedem Vite-Projekt `src/vite-env.d.ts` weg; ihr Inhalt wird wie jede Datei auf Schlüssel geprüft. |
| 2 | Schlüssel-Muster | zusätzlich `npm_…`, `AIza…`, `glpat-…`, `xox[baprs]-…`, jeder „BEGIN … PRIVATE KEY“ (auch PGP „PRIVATE KEY BLOCK“, OpenSSH, verschlüsselt), Stripe `sk_live_`/`rk_live_`, Slack-Webhooks. Zuweisungen `password/secret/token/api_key … = „Wert“` (Muster ZUWEISUNG aus `geheim.mjs`, `zuweisungenZaehlen`) zählen als Treffer – in Code-Dateien nur Werte in Anführungszeichen, Schalterwerte (`false`) und Platzhalter (`${…}`, `process.env…`, `your-…`) nicht. UTF-16 (BOM oder Null-Bytes) wird vor der Prüfung umgewandelt. **Bekannte Grenze:** Base64- oder anders kodierte Schlüssel werden nicht erkannt. |
| 3 | Lesen und Wiederverwenden | Ordner-Dateien werden mit `O_NOFOLLOW` (macOS/Linux) geöffnet; Gerät/Inode und Größe müssen zum Durchlauf passen (`fstat` gegen `lstat`), sonst Abbruch. Jede Datei wird **einmal** gelesen; kopiert wird genau der geprüfte Inhalt (alle Ziele). Vor jedem Schreiben (code, konzept, doku, material) prüft `einsortieren` Name und Inhalt noch einmal; Wissens-Einträge mit Geheimnis fallen ganz weg. Gesamtgrenze dafür 512 MB. |
| 4 | Pfade | auch `CONIN$`, `CONOUT$`, `COM¹–³`, `LPT¹–³` und Leerzeichen vorn abgelehnt; Doppelnamen nach NFC und klein geschrieben. |
| 5 | .git | `.git` als Datei oder Ordner auf jeder Ebene ausgeschlossen; `.gitattributes` mit Filtern/Treibern (`gefaehrlicheAttribute`) wird nicht übernommen und als Hinweis gezeigt. |
| 6 | Gefährliche Endungen | zusätzlich `.command .iso .img .vhd .vhdx .chm .msix .appx .xll .library-ms .scpt .jar .vbs .wsf .hta`; `.js/.jse/.vbs/.wsf/.hta` in Autostart-/Startmenü-Ordnern (Windows Script Host). Normale `.js` (z. B. `vite.config.js`) bleiben Code. |
| 7 | Strukturliste | nur `label` und `title` (dazu Routen); Werte mit `@`, langen Ziffernfolgen oder Datumsangaben fallen weg; angehakte Personendaten-Dateien fehlen ganz (auch als Pfad). |
| 8 | Repository | erst `gh repo create --private` (ohne `--push`), dann Sichtbarkeit genau `PRIVATE` prüfen (nicht „internal“), erst dann selbst `git -c core.hooksPath=<leer> push`; Zugang nur per `-c` für diesen Aufruf, nichts in der Git-Einstellung. |
| 9 | Reste | Beim Start des Dienstes wird `<Daten>/einlesen/` geleert. |
| 10 | Netzwerkpfade | `ws_einlesen_quelle` lehnt `\\Server\Freigabe` (auch `//…`, `\\?\UNC\…`) sofort mit klarer Meldung ab. |

## Nachprüfung (02.11.2026, Ergebnis GELB, N1–N7)
| Nr. | Befund | Umsetzung |
|---|---|---|
| N1 | Zuweisungen zu eng | `geheim.mjs` › ZUWEISUNG/`zuweisungenZaehlen`: optionale Typangabe vor dem „=“ (`const apiKey: string = "…"`, Kotlin `val password: String = "…"`), Backtick-Werte ohne `${` als Text, fester Ersatzwert nach `||`, `??`, `?:` – egal ob der geheime Name links (`const pw = … || "…"`) oder rechts steht (`process.env.PW ?? "…"`, `cfg["api_key"] || "…"`). Diese Ersatzwerte werden auch in Logs maskiert. |
| N2 | `.env`-Namen | Alles, was mit `.env` beginnt (`.env~`, `.env copy`, `.env2`, `.env.js`, `.env.example` …), gilt als geheim (wie `heikleDatei`). Die Quell-Ausnahme (`vite-env.d.ts`, `env.js`) gilt nur für Namen, die nicht mit `.env` beginnen. |
| N3 | Weitere Muster | Namen mit `_key`/`-key` (SUPABASE_SERVICE_KEY, OPENAI_KEY), Go `:=`, PHP `define('…PASSWORD/SECRET/KEY/TOKEN/SALT…', '…')`, `Authorization: … Bearer …` (Muster aus `geheim.mjs` wiederverwendet) und `Basic …`, SendGrid `SG.….…`. |
| N4 | Platzhalter | `$VAR` und `%VAR%` gelten nur in Großschreibung als Platzhalter – ein Passwort wie `"$Ecret…"` zählt. |
| N5 | GitHub Actions | Nach dem Anlegen und der Prüfung „privat“ schaltet die Werkstatt **GitHub Actions ab** (`PUT repos/{repo}/actions/permissions enabled=false`) und prüft das (`enabled == false`) – erst dann wird hochgeladen; geht das nicht, wird nichts hochgeladen. Assistent (Schritt „Repository“) und „Noch zu tun“ zeigen: „GitHub Actions ist aus. Einschalten erst nach der Aufgabe ‚Prüfungen und Regelwerk ergänzen‘.“ und listen die Abläufe (`.github/workflows/*.yml`) aus dem eingelesenen Projekt; Einschalten bei GitHub › Settings › Actions (Link). Geprüft: „Test & Live einrichten“ braucht **keine** Actions (Zweig `live` und Schutzregel nur über die GitHub-Schnittstelle) – darum dort kein eigener Einschalt-Knopf. Die Datenbank-Station und die GitHub-Prüfläufe der Stationen brauchen Actions; die gibt es erst nach dem Einschalten. |
| N6 | Doppelnamen im Ordner | Wie bei ZIP (NFC, Groß/Klein) → Abbruch. |
| N7 | Weitere Endungen | Gefährlich: `.docm .dotm .xlsm .xltm .xlam .pptm .potm .ppam .settingcontent-ms .wsc .cab`; geheim: `.htpasswd`, `*.p8`, `*.tfvars`, `*.tfstate(.backup)`. |

## 2. Nachprüfung (02.11.2026, GELB) – Regeln für Zuweisungen (`geheim.mjs` › `wertZaehlt`)
| Regel | Zählt (Geheimnis) | Zählt nicht |
|---|---|---|
| Untergrenze | starke Namen (password, secret, token, api_key, credential …) ab **6 Zeichen**; starke Schlüssel-Namen `db_key`, `master_key`, `encryption_key`, `signing_key`, `secret_key`, `private_key`, `app_secret` ab **8 Zeichen, auch reine Ziffern**; schwache Namen (`*_key`) ab 16 Zeichen mit Buchstaben und Ziffern | kürzere Werte |
| Wörter | Einzelwort-Passwörter (`password: "Sommer"`, `const passwort = "Pillersee"`) und Passphrasen (`"correct horse battery staple"`) | nur Text mit Leerzeichen **und** Beschriftungswort (eingeben, enter, your, bitte, Feld, Eingabe, type, please, here, hier, neues, mindestens, Zeichen …), sowie Namen, die auf Label/Placeholder/Hint/Title/Text/Message/Error enden (`passwordLabel`) |
| JWT | jeder JWT unter einem starken Namen, außer `role: "anon"` (auch ohne role, mit sub/scope …) | der öffentliche anon-JWT |
| Öffentliche Namen | `canonicalToken`, `NEXT_PUBLIC_API_TOKEN`, `VITE_PUBLIC_API_KEY`, `PK_TOKEN` (Gegenliste token/api_key/secret/pass/private/service_role) | `anon`, `publishable`, `public`, `pk` nur als ganzer Namensteil (`ANON_KEY`, `anonKey`, `supabaseAnonKey`, `PUBLISHABLE_KEY`) |
| Platzhalter | `your-password-is-Sommer2024`, `changeme123`, `<b>Sommer2024` | nur der **ganze** Wert: `your-…`/`YOUR_…` (nur Buchstaben), `<…>`, `xxx`, `***`, `...`, changeme, example, dummy, test, placeholder, `${…}`, `{{…}}`, `$VAR`/`%VAR%` (groß), Verweise wie `process.env.X`, `os.environ["X"]`, `getenv("X")` |
| Bearer | jeder Token, auch in Großbuchstaben | nur Großschrift mit `YOUR`, `TOKEN` oder `<…>` (`Bearer YOUR_ACCESS_TOKEN`) |
| Weitere Muster | Stripe `sk_test_`/`rk_test_`, AWS `ASIA…` | – |

**Repository vorhanden:** Scheitert ein Versuch nach dem Anlegen (z. B. beim Abschalten von Actions), wird ein **leeres** (keine Zweige) und **privates** Repository genau dieser Kennung beim nächsten Versuch weiterverwendet; Actions wird wieder abgeschaltet und geprüft. Sonst: „Repository liegt schon bei GitHub, bitte dort prüfen oder löschen.“

**Verbleibende Grenzen:** Base64- oder anders kodierte bzw. zusammengesetzte Schlüssel (`"sk-" + teil2`) werden nicht erkannt; Schlüssel in Binärdateien
(Bilder, PDF, Office) nur, wenn sie als Klartext darin stehen; eine Passphrase, die zufällig ein Beschriftungswort enthält (z. B. „bitte nicht raten“), wird nicht erkannt; Werte unter 6 Zeichen zählen nie; die Erkennung ist eine Mustersuche – sie ersetzt nicht das Prüfen der Schlüssel durch den Admin vor dem Einschalten von Actions.

## Offen / bewusst nicht gebaut
- Zuordnung je Eintrag der **obersten Ebene** (Datei oder Ordner), nicht je einzelner Datei in Unterordnern.
- Eingelesene `CLAUDE.md`/`AGENTS.md` liegen zusätzlich im Code (Teil des Projekts); ob Claude Code sie in Aufträgen von selbst liest, hängt von Claude Code ab – die Rangfolge der Regeln im Auftrag gilt trotzdem.
- Ein abgebrochenes Einlesen nach dem Anlegen des Repositorys räumt nichts automatisch auf (Projekt, Ordner und Repository bleiben zum Nachsehen).

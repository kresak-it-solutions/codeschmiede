# Codeschmiede

Programmierumgebung für alle Apps von Gerhard Kresak – ein Programm für Windows und Mac.

- **Auftrags-Zentrale:** Projekte › Bereiche › Gruppen › Features; Aufträge geben, Rückfragen beantworten, live mitsehen, Erlaubnisse bestätigen.
- **Werkstatt:** arbeitet Aufträge mit dem offiziellen Claude Code und dem eigenen Claude-Abo ab (Modell nach Aufwand und Abo-Stand), immer auf eigenem Zweig mit Pull Request.
- **Weg eines Auftrags:** Auftrag → In Arbeit → Freigabe → Sicherheitsprüfung → Zusammenführen → Feature-Prüfung (Testfassung) → Live & Wissen (siehe `docs/KONZEPT.md`). Bauen und Tests nur in GitHub/Cloudflare; GitHub-Prüfläufe sind ein Tor.
- **Verbrauch:** Abo-Nutzungslimits (5-Stunden-Fenster und Woche) je Mitglied live; Arbeit je Projekt.

| Ordner | Inhalt |
|---|---|
| `web/` | Oberfläche (React, Vite, Tailwind) – wird live ins Programm geladen |
| `desktop/` | Programm-Hülle (Tauri 2, Windows + Mac) und Werkstatt-Dienst (`desktop/dienst/`, Node; startet die Claude-Code-CLI mit dem Abo der Person) |
| `supabase/` | Datenbank (`migrations/`) und Rechte-Tests (`tests/`) |
| `tools/` | Hilfsskripte (z. B. Funktionsverzeichnis → Features) |
| `docs/` | Konzept, Änderungsprotokoll, Entscheidungen, Datenschutz |

Regeln für alle, die hier arbeiten: `AGENTS.md`.

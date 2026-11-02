# Art: Werkzeug / Skript

Node ohne Oberfläche. Prüfung bei jedem Zweig, Ablauf „Lauf“ per Knopf in der Codeschmiede oder nach Zeitplan; Ergebnis als Datei.

Testlauf-Konsole der Codeschmiede: Befehle stehen in `beispiele/befehle.json` (`{ "befehle": { "<name>": "<Beschreibung>" } }`), Beispiel-Eingaben als
Dateien in `beispiele/` (nur ausgedachte Daten, keine echten Namen). Die Codeschmiede startet `lauf.yml` mit genau einem Befehl und einer Datei
daraus; das Programm bekommt sie als `node src/index.mjs <befehl> beispiele/<datei>`. Ausgabe und `ausgabe/` kommen zurück in den Arbeitsplatz.

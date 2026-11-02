# Art: Programm

Tauri 2 für Windows und Mac. Bei jedem Zweig baut GitHub die Installation (Ablauf „Programm bauen“). Die Codeschmiede startet sie auf Wunsch in der Windows-Sandbox und nimmt auf Knopfdruck ein Bildschirmfoto nur vom Sandbox-Fenster (erst nach deiner Bestätigung im Chat). Automatische Updates: eigener Schritt (Signatur-Schlüssel als GitHub-Geheimnis).

Testseite der Oberfläche: `node vorschau/bauen.mjs` baut aus `ui/` eine Web-Fassung (`vorschau-dist/`) mit nachgespielten Tauri-Funktionen – Cloudflare Pages baut sie bei jedem Zweig, die Codeschmiede zeigt sie im Arbeitsplatz im Fensterrahmen. Beispieldaten: `vorschau/beispiele.js` (siehe `vorschau/README.md`).

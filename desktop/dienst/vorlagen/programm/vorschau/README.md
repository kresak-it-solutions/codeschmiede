# Testseite der Programm-Oberfläche

Die Codeschmiede zeigt die Oberfläche dieses Programms im Arbeitsplatz als **Testseite** (Ziel Windows/Mac, „Stufe 1: Oberfläche als Testseite“).
Gebaut wird bei Cloudflare Pages aus demselben Code wie das Programm:

- Build-Befehl `node vorschau/bauen.mjs`, Ausgabe `vorschau-dist` (richtet die Codeschmiede unter „Anbindungen“ › „Testseite einrichten“ ein).
- `vorschau/tauri-nachbildung.js` ersetzt die Tauri-Funktionen (invoke, Dialog, Dateien, Fenster, Benachrichtigung, Ereignisse) durch eine
  Nachbildung mit Beispieldaten. Unten rechts steht immer „Programm-Funktionen nachgespielt“. Dateien leben nur im Speicher der Seite.
- `vorschau/beispiele.js` – **hier** stehen die Beispieldaten. Neuer Befehl im Programm (`#[tauri::command]`)? Beispiel ergänzen. Nur ausgedachte Daten.
- `vorschau/vorschau-helfer.js` – „Zeigen & kommentieren“ in der Codeschmiede (nur auf *.pages.dev, nur eingebettet, nie sichtbarer Text).

Oberfläche mit Vite/React? `vorschau/vite-alias.mjs` in `vite.config.js` einbinden; bei `VITE_CS_VORSCHAU=1` zeigen die `@tauri-apps/*`-Pakete
auf `vorschau/tauri-api.mjs`. Build-Befehl dann `VITE_CS_VORSCHAU=1 npm run build`, Ausgabe `dist`.

Was die Testseite **nicht** zeigt: echte Dateien, Geräte, Rust-Logik. Dafür gibt es die Windows-Sandbox mit dem echten Programm.

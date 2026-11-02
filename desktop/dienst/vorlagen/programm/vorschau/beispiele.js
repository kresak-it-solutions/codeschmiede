// Beispieldaten für die Testseite der Programm-Oberfläche (nur Web-Fassung, siehe vorschau/tauri-nachbildung.js).
// Hier steht, was die nachgespielten Programm-Funktionen zurückgeben. Nur ausgedachte Daten – keine echten Namen, Kunden oder Mitglieder.
// Neuer Befehl im Programm (Rust, #[tauri::command])? Hier ein Beispiel ergänzen, sonst zeigt die Testseite „wird nicht nachgespielt“.
window.CS_BEISPIELE = {
  // invoke("<befehl>", args) → Rückgabe (Wert oder Funktion der Argumente)
  befehle: {
    begruessen: (args) => `Hallo ${String(args?.name || "Gast")}! (nachgespielt – im echten Programm antwortet Rust)`,
  },
  // Dateien, die „Datei öffnen“ und readTextFile liefern (nur im Speicher der Seite)
  dateien: {
    "C:\\Beispiele\\beispiel.txt": "Beispielinhalt\nZeile 2\n",
  },
  oeffnen: "C:\\Beispiele\\beispiel.txt",
  speichern: "C:\\Beispiele\\export.txt",
};

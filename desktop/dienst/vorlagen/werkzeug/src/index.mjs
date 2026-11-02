// [PROJEKTNAME] – Werkzeug ohne Oberfläche. Grundgerüst aus der Codeschmiede.
// Läuft in GitHub (Ablauf „Lauf“, per Knopf in der Codeschmiede oder nach Zeitplan); Ergebnisse landen in ausgabe/.
// Aufruf: node src/index.mjs [<befehl> <beispiele/datei>] – die Befehle stehen in beispiele/befehle.json (Testlauf-Konsole der Codeschmiede).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { csvLesen, zaehlen } from "./zaehlen.mjs";

const [befehl, eingabe] = process.argv.slice(2);
await mkdir("ausgabe", { recursive: true });
if (!befehl) {
  const beispiel = [{ kategorie: "A" }, { kategorie: "B" }, { kategorie: "A" }];
  const ergebnis = zaehlen(beispiel);
  await writeFile("ausgabe/ergebnis.json", JSON.stringify({ zeit: new Date().toISOString(), ergebnis }, null, 2));
  console.log("Fertig:", ergebnis);
} else if (befehl === "zaehlen") {
  const zeilen = csvLesen(await readFile(eingabe, "utf8"));
  console.log(`Lese ${zeilen.length} Zeilen aus ${eingabe} …`);
  const ergebnis = zaehlen(zeilen);
  for (const [k, n] of Object.entries(ergebnis)) console.log(`  ${k}: ${n}`);
  await writeFile("ausgabe/ergebnis.json", JSON.stringify({ eingabe, ergebnis }, null, 2));
  console.log("Ergebnis: ausgabe/ergebnis.json");
} else {
  console.error(`Unbekannter Befehl „${befehl}“ – siehe beispiele/befehle.json`);
  process.exitCode = 2;
}

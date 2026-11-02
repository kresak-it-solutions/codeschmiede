// Programmier-Werkzeug je Projekt (0.14.0) – nur zur Anzeige. Was installiert, gestartet und gesperrt wird, steht fest im Werkstatt-Programm
// (desktop/dienst/lib/werkzeuge.mjs), nie in der Datenbank oder in der Oberfläche.
export const WERKZEUGE = {
  "claude-code": { name: "Claude Code", kurz: "Anthropic · dein Claude-Abo", konto: "Claude-Konto (dein Abo)", verbrauch: "5-Std.- und Wochenlimit wie bisher", standard: true },
  codex: { name: "OpenAI Codex CLI", kurz: "OpenAI · ChatGPT-Abo oder eigener Schlüssel", konto: "ChatGPT-Konto, getrennt vom Claude-Abo", verbrauch: "Anzeige, soweit Codex sie meldet (Tokens je Auftrag)", version: "0.166.0", paket: "@openai/codex" },
  "gemini-cli": { name: "Gemini CLI", kurz: "Google · Google-Konto · derzeit gesperrt", konto: "Google-Konto, getrennt vom Claude-Abo", verbrauch: "Anzeige, soweit Gemini sie meldet (Tokens je Auftrag)", version: "0.64.0", paket: "@google/gemini-cli" },
  opencode: { name: "OpenCode", kurz: "Offen · nutzt einen deiner Anbieter", konto: "Konto des darin gewählten Anbieters", verbrauch: "Anzeige, soweit OpenCode sie meldet – sonst keine Anzeige", version: "2.2.5", paket: "@opencode/cli" },
};
export const werkzeugName = (w) => WERKZEUGE[w]?.name || "Claude Code";
export const MODELL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/;
export const OC_MODELL = /^[a-z0-9][a-z0-9-]{0,39}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const modellOk = (w, m) => !m || (w === "opencode" ? OC_MODELL.test(m) : w !== "claude-code" && MODELL.test(m));
export const TEST_PUNKTE = [
  ["erlaubt", "Schreiben im Arbeitsordner"], ["regeln", "Schreiben in Regeln\\CLAUDE.md"], ["setup", "Schreiben in setup\\"],
  ["nachbar", "Schreiben im Ordner eines anderen Projekts"], ["projektregeln", "Schreiben in regeln\\REGELN.md"], ["git", "Git-Einstellungen verändern"],
  ["link", "Datei über Verknüpfung nach außen"], ["daten", "Schreiben in den Daten der Codeschmiede"], ["hart", "Harter Link auf eine gesperrte Datei"],
  ["start_env", "Programmstart über /usr/bin/env"], ["start_git", "Programmstart git"], ["start_python", "Programmstart python3"],
  ["start_osascript", "Programmstart osascript"], ["start_skript", "Skript im Arbeitsordner starten"],
  ["lesen_ssh", "Lesen im Benutzerordner (~/.ssh)"], ["lesen_zugang", "Lesen von Zugangsdaten in den Daten"], ["lesen_projekte", "Lesen im Projekte-Ordner"],
];
/** Ist ein Stand-Eintrag „bereit“ (installiert, angemeldet, Test in genau dieser Version bestanden, sperrbar)? */
export const bereit = (s) => !!(s && s.sperrbar && s.installiert && s.angemeldet && s.test === "bestanden" && s.test_version && s.test_version === s.version && s.version === s.soll_version);
/** Darf der Admin speichern? Fremdes Werkzeug nur mit bestandenem Test auf mindestens einem Entwickler-PC (prüft die Datenbank noch einmal). */
export const testIrgendwo = (staende, pcs, w) => staende.some((s) => s.werkzeug === w && s.test === "bestanden" && s.test_version === s.version && s.version === s.soll_version && s.installiert && s.sperrbar && !pcs.find((p) => p.id === s.pc_id)?.admin_pc);

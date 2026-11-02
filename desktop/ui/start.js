// Startseite des Programms (aus index.html ausgelagert, damit die CSP keine eingebetteten Skripte braucht – Befund S3, 01.11.2026).
// Startseite: prüft die Verbindung und öffnet dann die Plattform-Seite der Codeschmiede.
// Keine Daten werden lokal gespeichert – alles läuft live über den Server (docs/DESKTOP.md).
(function () {
  var START = window.TTG_START_URL || "https://codeschmiede.pages.dev/";
  var origin = new URL(START).origin;
  var timer = null;
  function show(offline) {
    document.getElementById("spin").className = offline ? "spin hidden" : "spin";
    document.getElementById("offline").className = offline ? "" : "hidden";
    document.getElementById("status").textContent = offline ? "Offline" : "Verbindung wird aufgebaut …";
  }
  function attempt() {
    show(false);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    fetch(origin + "/manifest.json?ping=" + Date.now(), { mode: "no-cors", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function () { clearTimeout(t); window.location.replace(START); })
      .catch(function () {
        clearTimeout(t);
        show(true);
        clearTimeout(timer);
        timer = setTimeout(attempt, 15000);
      });
  }
  document.getElementById("retry").addEventListener("click", function () { clearTimeout(timer); attempt(); });
  attempt();
})();

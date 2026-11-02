// Nachbildung der Tauri-Funktionen für die Testseite der Programm-Oberfläche (Codeschmiede, Arbeitsplatz Stufe 2).
// Läuft NUR in der Web-Fassung (vorschau/bauen.mjs → vorschau-dist/), nie im echten Programm: Ist Tauri da, macht diese Datei nichts.
// invoke, Dialog, Dateien, Fenster, Benachrichtigung und Ereignisse werden nachgespielt – mit den Beispieldaten aus vorschau/beispiele.js.
// Nichts wird auf einem Rechner gelesen oder geschrieben: „Dateien“ leben nur im Speicher dieser Seite. Ein Hinweis zeigt immer „nachgespielt“.
(function (g) {
  "use strict";
  if (!g || (g.__TAURI_INTERNALS__ && !g.__CS_NACHBILDUNG__)) return;   // echtes Programm: nichts ersetzen
  if (g.__CS_NACHBILDUNG__) return;                                    // schon geladen
  var doc = g.document;
  var beispiele = function () { return g.CS_BEISPIELE && typeof g.CS_BEISPIELE === "object" ? g.CS_BEISPIELE : {}; };
  var gemerkt = [];

  // ---------- Hinweis „nachgespielt“ ----------
  var leiste = null; var meldung = null; var zeit = null;
  function hinweis(text) {
    gemerkt.push(String(text));
    if (!doc || !doc.body) return;
    if (!leiste) {
      leiste = doc.createElement("div");
      leiste.setAttribute("role", "status");
      leiste.setAttribute("data-cs", "Hinweis nachgespielt");
      leiste.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147483646;max-width:min(360px,calc(100vw - 20px));font:600 13px/1.35 Barlow,'Segoe UI',system-ui,sans-serif;" +
        "background:#ecfdf5;color:#064e3b;border:1px solid #047857;border-radius:10px;padding:7px 10px;box-shadow:0 4px 14px rgba(0,0,0,.12)";
      var titel = doc.createElement("div"); titel.textContent = "Testseite · Programm-Funktionen nachgespielt";
      meldung = doc.createElement("div"); meldung.style.cssText = "font-weight:400;margin-top:2px";
      leiste.appendChild(titel); leiste.appendChild(meldung);
      doc.body.appendChild(leiste);
    }
    meldung.textContent = text;
    if (zeit) clearTimeout(zeit);
    zeit = setTimeout(function () { if (meldung) meldung.textContent = ""; }, 6000);
  }
  function start() { hinweis("Dateien, Dialoge und Befehle zeigen Beispieldaten."); }
  if (doc && doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();

  var fertig = function (wert, text) { if (text) hinweis("nachgespielt: " + text); return Promise.resolve(wert); };
  var fehler = function (text) { hinweis(text); return Promise.reject(new Error(text)); };

  // ---------- Befehle (invoke) ----------
  function invoke(befehl, args) {
    var b = beispiele().befehle || {};
    var name = String(befehl || "");
    if (!Object.prototype.hasOwnProperty.call(b, name)) return fehler("„" + name + "“ wird in der Testseite nicht nachgespielt – Beispiel in vorschau/beispiele.js ergänzen");
    try { return fertig(typeof b[name] === "function" ? b[name](args || {}) : b[name], "Befehl „" + name + "“"); }
    catch (e) { return fehler("Beispiel für „" + name + "“: " + (e && e.message ? e.message : "Fehler")); }
  }

  // ---------- Dateien (nur im Speicher dieser Seite) ----------
  var speicher = null;
  function dateien() {
    if (!speicher) { speicher = {}; var d = beispiele().dateien || {}; for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) speicher[k] = String(d[k]); }
    return speicher;
  }
  var pfadText = function (p) { return String(p && typeof p === "object" && p.path ? p.path : p || ""); };
  var fs = {
    readTextFile: function (p) { var t = dateien()[pfadText(p)]; return t == null ? fehler("Beispieldatei „" + pfadText(p) + "“ gibt es nicht (vorschau/beispiele.js)") : fertig(t, "Datei lesen"); },
    readFile: function (p) { var t = dateien()[pfadText(p)]; return t == null ? fehler("Beispieldatei „" + pfadText(p) + "“ gibt es nicht") : fertig(new TextEncoder().encode(t), "Datei lesen"); },
    writeTextFile: function (p, t) { dateien()[pfadText(p)] = String(t == null ? "" : t); return fertig(undefined, "Datei speichern (nur in dieser Seite)"); },
    writeFile: function (p, b) { dateien()[pfadText(p)] = typeof b === "string" ? b : new TextDecoder().decode(b); return fertig(undefined, "Datei speichern (nur in dieser Seite)"); },
    exists: function (p) { return fertig(Object.prototype.hasOwnProperty.call(dateien(), pfadText(p))); },
    remove: function (p) { delete dateien()[pfadText(p)]; return fertig(undefined, "Datei löschen (nur in dieser Seite)"); },
    mkdir: function () { return fertig(undefined, "Ordner anlegen (nur in dieser Seite)"); },
    readDir: function (p) {
      var o = pfadText(p).replace(/[\\/]+$/, ""); var r = [];
      for (var k in dateien()) { var rest = k.indexOf(o) === 0 ? k.slice(o.length).replace(/^[\\/]/, "") : null; if (rest && !/[\\/]/.test(rest)) r.push({ name: rest, isFile: true, isDirectory: false, isSymlink: false }); }
      return fertig(r, "Ordner lesen");
    },
  };

  // ---------- Dialoge ----------
  var dialog = {
    open: function (o) { var p = beispiele().oeffnen || null; return fertig(o && o.multiple ? (p ? [p] : []) : p, "Datei öffnen (Beispieldatei)"); },
    save: function () { return fertig(beispiele().speichern || null, "Speichern unter (Beispielpfad)"); },
    message: function (t) { return fertig(undefined, "Meldung: " + String(t || "").slice(0, 120)); },
    ask: function (t) { return fertig(true, "Frage beantwortet mit Ja: " + String(t || "").slice(0, 100)); },
    confirm: function (t) { return fertig(true, "Bestätigt: " + String(t || "").slice(0, 100)); },
  };

  // ---------- Ereignisse ----------
  var hoerer = {};
  var event = {
    listen: function (name, cb) { (hoerer[name] = hoerer[name] || []).push(cb); return Promise.resolve(function () { hoerer[name] = (hoerer[name] || []).filter(function (x) { return x !== cb; }); }); },
    once: function (name, cb) { var weg = null; return event.listen(name, function (e) { cb(e); if (weg) weg(); }).then(function (u) { weg = u; return u; }); },
    emit: function (name, payload) { (hoerer[name] || []).slice().forEach(function (cb) { try { cb({ event: name, payload: payload, id: 0 }); } catch (e) { /* Beispiel-Hörer */ } }); return Promise.resolve(); },
  };

  // ---------- Fenster ----------
  function fenster() {
    var f = { label: "main" };
    ["minimize", "maximize", "unmaximize", "toggleMaximize", "close", "hide", "show", "setFocus", "center", "setSize", "setPosition", "setFullscreen", "setResizable", "setAlwaysOnTop", "destroy"]
      .forEach(function (n) { f[n] = function () { return fertig(undefined, "Fenster: " + n); }; });
    f.setTitle = function (t) { if (doc) doc.title = String(t || ""); return fertig(undefined, "Fenstertitel"); };
    f.title = function () { return Promise.resolve(doc ? doc.title : ""); };
    ["isMaximized", "isMinimized", "isFullscreen"].forEach(function (n) { f[n] = function () { return Promise.resolve(false); }; });
    f.isVisible = function () { return Promise.resolve(true); };
    f.listen = event.listen; f.once = event.once; f.emit = event.emit;
    f.onCloseRequested = function () { return Promise.resolve(function () {}); };
    f.onResized = f.onMoved = f.onFocusChanged = f.onCloseRequested;
    return f;
  }
  var aktuell = fenster();

  // ---------- Benachrichtigung ----------
  var notification = {
    isPermissionGranted: function () { return Promise.resolve(true); },
    requestPermission: function () { return Promise.resolve("granted"); },
    sendNotification: function (n) { var t = typeof n === "string" ? n : (n && (n.title || n.body)) || ""; hinweis("Benachrichtigung (nachgespielt): " + String(t).slice(0, 120)); },
  };

  var api = {
    core: { invoke: invoke, convertFileSrc: function (p) { return pfadText(p); }, isTauri: function () { return false; } },
    dialog: dialog, fs: fs, event: event, notification: notification,
    window: { getCurrentWindow: function () { return aktuell; }, getCurrent: function () { return aktuell; }, getAllWindows: function () { return [aktuell]; } },
    webviewWindow: { getCurrentWebviewWindow: function () { return aktuell; } },
    app: { getVersion: function () { return Promise.resolve("0.0.0-testseite"); }, getName: function () { return Promise.resolve(doc ? doc.title : "Programm"); } },
    path: {
      appDataDir: function () { return Promise.resolve("C:\\Beispiele\\AppData"); }, documentDir: function () { return Promise.resolve("C:\\Beispiele\\Dokumente"); },
      join: function () { return Promise.resolve(Array.prototype.slice.call(arguments).join("\\")); }, sep: function () { return "\\"; },
    },
    opener: { openUrl: function () { return fertig(undefined, "Adresse öffnen"); }, openPath: function () { return fertig(undefined, "Datei öffnen"); } },
    shell: { open: function () { return fertig(undefined, "Adresse öffnen"); } },
  };
  api.tauri = api.core;
  Object.defineProperty(g, "__CS_NACHBILDUNG__", { value: { api: api, hinweise: gemerkt }, configurable: false });
  g.__TAURI__ = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);

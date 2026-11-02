// Vorschau-Helfer der Testseite (Codeschmiede: „Zeigen & kommentieren“ und „links folgt der Chat der Seite“).
// Aktiv NUR in der Web-Fassung auf *.pages.dev und nur, wenn die Seite in der Codeschmiede eingebettet ist. Gesendet werden nur
// der Baustein-Name (data-cs oder Element-Kennung), die Seite (Pfad ohne Kennungen) und ein kurzer Element-Pfad – nie sichtbarer Text.
(function () {
  "use strict";
  if (typeof window === "undefined" || window.top === window) return;
  if (!/\.pages\.dev$/.test(window.location.hostname)) return;
  var CODESCHMIEDE = /^https:\/\/codeschmiede\.pages\.dev$/;
  var eltern = null; var an = false; var rahmen = null; var letzte = ""; var takt = null;
  function zeigeRahmen(el) {
    if (!rahmen) {
      rahmen = document.createElement("div"); rahmen.setAttribute("aria-hidden", "true");
      rahmen.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #f97316;border-radius:6px;box-shadow:0 0 0 9999px rgba(249,115,22,.06)";
      document.body.appendChild(rahmen);
    }
    var r = el.getBoundingClientRect();
    rahmen.style.display = "block"; rahmen.style.left = (r.left - 3) + "px"; rahmen.style.top = (r.top - 3) + "px";
    rahmen.style.width = (r.width + 6) + "px"; rahmen.style.height = (r.height + 6) + "px";
  }
  function versteckeRahmen() { if (rahmen) rahmen.style.display = "none"; }
  function name(el) {
    var m = el.closest("[data-cs]"); var n = m ? m.getAttribute("data-cs") : "";
    if (/^[A-Za-z0-9_ ·-]{1,60}$/.test(n || "")) return n;
    var mitId = el.closest("[id]"); var id = mitId ? mitId.id : "";
    if (/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(id)) return id;
    return "Fenster-Element " + el.tagName.toLowerCase();
  }
  function pfad(el) {
    var teile = [];
    for (var e = el, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) {
      var k = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(function (x) { return x && /^[A-Za-z0-9_-]{1,30}$/.test(x); }).slice(0, 2).join(".");
      teile.unshift(e.tagName.toLowerCase() + (k ? "." + k : ""));
    }
    return teile.join(" > ");
  }
  function seite() {
    var s = window.location.pathname.split("/").map(function (t) { return t === "" || /^[a-z][a-z-]{0,39}(\.html)?$/.test(t) ? t : ":id"; }).join("/");
    return s.slice(0, 150) || "/";
  }
  function meldeSeite(immer) { if (!eltern) return; var s = seite(); if (!immer && s === letzte) return; letzte = s; window.parent.postMessage({ cs: "seite", pfad: s }, eltern); }
  document.addEventListener("mouseover", function (e) { if (an && e.target instanceof Element) zeigeRahmen(e.target); }, true);
  document.addEventListener("click", function (e) {
    if (!an || !(e.target instanceof Element) || !eltern) return;
    e.preventDefault(); e.stopPropagation();
    window.parent.postMessage({ cs: "baustein", name: name(e.target), seite: seite(), pfad: pfad(e.target) }, eltern);
    an = false; versteckeRahmen();
  }, true);
  window.addEventListener("message", function (e) {
    if (!CODESCHMIEDE.test(e.origin) || e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    eltern = e.origin;
    if (e.data.cs === "hallo") { window.parent.postMessage({ cs: "bereit" }, eltern); meldeSeite(true); if (!takt) takt = setInterval(function () { meldeSeite(false); }, 800); }
    if (e.data.cs === "zeigen") { an = !!e.data.an; if (!an) versteckeRahmen(); }
  });
})();

// App-Designer 3.0 (Anweisung Gerhard 01.11.2026 22:18/22:38: „So will ich den App-Designer in der Codeschmiede sehen“ – Screenshot des
// Design-Entwurfs 2.0). Sieht aus und funktioniert wie der Entwurf: Leiste (Rolle · PC/Handy · Hell/Dunkel · Bausteine zeigen · Begründung),
// links die Seiten je Rolle, Mitte die Vorschau, rechts der Inspektor. Zwei Ansichten: „Entwurf“ (Masken des Entwurfs 2.0) und
// „Echte App (Testfassung)“. Daten nur aus dem Design-System-Paket der App (designSystem.js). Die Codeschmiede selbst bleibt smaragdgrün –
// gezeigt wird das Design der App (Blau, Design 2.0).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Leiste, { leisteLesen, leisteMerken } from "./Leiste";
import Seitenliste from "./Seitenliste";
import EntwurfVorschau from "./EntwurfVorschau";
import EchteApp from "./EchteApp";
import Inspektor from "./Inspektor";
import Begruendung from "./Begruendung";
import { useTokenBruecke } from "./useTokenBruecke";
import { tokenWerte, nurAbweichungen, begruendungSchluessel } from "../designSystem";
import { pruefeDsTokens } from "../kontrast";
import { useBestaetigen } from "../bausteine/grund";

const fehlerText = (e) => String(e?.message || "Fehler").slice(0, 300);
const ebeneFertig = (e) => e.level === "all" || (e.level === "package" ? !!e.package_key : !!e.club_id && (e.level !== "role" || !!e.role_key));
const ebeneSchluessel = (e) => [e.level, e.package_key || "", e.club_id || "", e.role_key || ""].join("|");

export default function AppDesigner3({ projekt, ds, ansicht, darf, toast, onFreigabe }) {
  const { daten, html } = ds;
  const bestaetigen = useBestaetigen();
  const [leiste, setLeisteRoh] = useState(() => leisteLesen(projekt.id));
  const setLeiste = (l) => {
    if (l.rolle !== leiste.rolle) { setSeite(null); setRoute(null); setWahl(null); }
    setLeisteRoh(l); leisteMerken(projekt.id, l);
  };
  const [seite, setSeite] = useState(null);          // Entwurf: Seite (null = Start der Rolle)
  const [route, setRoute] = useState(null);          // Echte App: Route
  const [info, setInfo] = useState(null);            // Entwurf meldet: Seite, Begründung, Zähler der Bausteine
  const [wahl, setWahl] = useState(null);            // gewählter Baustein (data-ds-Name)
  const [modus, setModus] = useState(leiste.thema === "dark" ? "dunkel" : "hell");
  useEffect(() => { setModus(leiste.thema === "dark" ? "dunkel" : "hell"); }, [leiste.thema]);

  // ---------------------------------------------------------------- Design-Tokens: Ausgangswert (Design 2.0) ⊕ geerbt ⊕ eigen
  const bruecke = useTokenBruecke(projekt);
  const [ebene, setEbeneRoh] = useState({ level: "all" });
  const [stand, setStand] = useState({ laden: false });
  const [eigen, setEigen] = useState({});
  const [speichert, setSpeichert] = useState(null);
  const ebeneRef = useRef(ebene); ebeneRef.current = ebene;
  const laden = useCallback(async (e) => {
    if (!ebeneFertig(e)) { setStand((s) => ({ ...s, laden: false })); return; }
    setStand((s) => ({ ...s, laden: true }));
    try {
      const a = await bruecke.frage({ cs: "ds-tokens-laden", ebene: e });
      if (ebeneSchluessel(e) !== ebeneSchluessel(ebeneRef.current)) return;
      setStand({ ...a, laden: false, geladen: true, fehler: null, eigenGeaendert: false }); setEigen(a.eigen && typeof a.eigen === "object" ? a.eigen : {});
    } catch (f) { setStand((s) => ({ ...s, laden: false, geladen: false, fehler: fehlerText(f) })); }
  }, [bruecke]);
  useEffect(() => { if (bruecke.bereit) laden(ebeneRef.current); }, [bruecke.bereit]); // eslint-disable-line react-hooks/exhaustive-deps
  const setEbene = async (e) => {
    if (stand.eigenGeaendert && !(await bestaetigen({ titel: "Token-Änderungen verwerfen?", text: "Für diese Ebene gibt es noch nicht gespeicherte Änderungen.", ja: "Verwerfen", nein: "Behalten", gefahr: true }))) return;
    setEbeneRoh(e); setEigen({}); setSpeichert(null); setStand((s) => ({ ...s, entwurf: null, live: null, geerbt: {}, eigenGeaendert: false, geladen: false }));
    if (bruecke.bereit && ebeneFertig(e)) laden(e);
  };
  const werte = useMemo(() => tokenWerte(daten, stand.geerbt, eigen), [daten, stand.geerbt, eigen]);
  const aendern = (voll) => { setEigen(nurAbweichungen(daten, stand.geerbt, voll)); setStand((s) => ({ ...s, eigenGeaendert: true })); setSpeichert(null); };
  const setzeToken = (m, k, v) => { if (darf) aendern({ ...werte, [m]: { ...werte[m], [k]: v } }); };
  const setzeEcke = (k, v) => { if (darf) aendern({ ...werte, ecken: { ...werte.ecken, [k]: v } }); };
  const zuruecksetzen = () => { setEigen({}); setStand((s) => ({ ...s, eigenGeaendert: true })); };
  // Speichern nur, wenn ohne Fehler geladen und wirklich etwas geändert ist (Review #58 M1)
  const kannSpeichern = darf && bruecke.bereit && stand.geladen && !stand.fehler && !stand.laden && !!stand.eigenGeaendert && ebeneFertig(ebene) && speichert !== "laeuft";
  const speichern = async () => {
    if (!kannSpeichern) return;
    const leer = !Object.keys(eigen).length;
    // Alle Werte dieser Ebene entfernen nur nach ausdrücklicher Bestätigung (die App verlangt dafür loeschen: true)
    if (leer && !(await bestaetigen({ titel: "Alle Token-Werte dieser Ebene entfernen?", text: "Die Ebene erbt danach wieder die Werte darüber bzw. die Ausgangswerte von Design 2.0. Wirkt erst nach der Freigabe.", ja: "Entfernen", nein: "Abbrechen", gefahr: true }))) return;
    setSpeichert("laeuft");
    try {
      const a = await bruecke.frage({ cs: "ds-tokens-speichern", ebene, ds: eigen, ...(leer ? { loeschen: true } : {}) });
      setStand((s) => ({ ...s, entwurf: a.entwurf || s.entwurf, eigenGeaendert: false, fehler: null }));
      setSpeichert({ ok: true, text: `Als Entwurf im Design-Paket gespeichert${a.entwurf?.version ? ` (Version ${a.entwurf.version})` : ""} – freigeben unter „Übernehmen“.` });
      toast("Design-Tokens als Entwurf gespeichert");
    } catch (f) { setSpeichert({ ok: false, text: fehlerText(f) }); }
  };
  const entwurfTokens = useMemo(() => ({ ...werte, ecken: nurAbweichungen(daten, {}, werte).ecken || {} }), [daten, werte]);
  const befunde = useMemo(() => pruefeDsTokens(werte, daten.pruefungen), [werte, daten.pruefungen]);
  // Für die echte App nur die Abweichungen (geerbt + eigen); leer = Vorschau entfernen
  const dsVorschau = useMemo(() => { const v = nurAbweichungen(daten, {}, werte); return Object.keys(v).length ? v : null; }, [daten, werte]);

  // ---------------------------------------------------------------- Begründung
  const echt = ansicht === "echt";
  const echteSeite = useMemo(() => (route ? Object.entries(daten.seiten).find(([, s]) => s.route === route)?.[0] || null : null), [daten, route]);
  const schluessel = echt ? begruendungSchluessel(echteSeite, leiste.rolle) : info?.schluessel || begruendungSchluessel(daten.navigation[leiste.rolle]?.start, leiste.rolle);
  const titel = echt ? (echteSeite ? daten.seiten[echteSeite]?.titel : route) : info?.titel;
  const onSeite = useCallback((x) => { setInfo(x); setSeite(x.seite); }, []);
  const onBaustein = useCallback((n) => setWahl(n), []);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
      <Leiste titel={`${projekt.name} · Design-Entwurf 2.0`} untertitel={echt ? "Echte App (Testfassung)" : `Entwurf · ${daten.verein.name || "Demo-Verein"} (erfundene Daten)`} leiste={leiste} setLeiste={setLeiste} />
      <div className="grid gap-3 p-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 self-start max-h-[calc(100vh-140px)] flex flex-col" aria-label="Seiten">
          <h3 className="px-3 pt-3 font-display font-bold text-[15px]">Seiten · {daten.rollen.find((r) => r.id === leiste.rolle)?.name || leiste.rolle}</h3>
          <Seitenliste daten={daten} rolle={leiste.rolle} ansicht={ansicht} aktiv={echt ? route : (seite || daten.navigation[leiste.rolle]?.start)} onWahl={(z) => (echt ? setRoute(z) : setSeite(z))} />
        </section>
        <div className="min-w-0 space-y-3">
          {echt
            ? <EchteApp projekt={projekt} leiste={leiste} route={route} tokensDs={dsVorschau} onRoute={setRoute} onBaustein={onBaustein} />
            : html ? <EntwurfVorschau html={html} leiste={leiste} seite={seite} tokens={entwurfTokens} markiert={leiste.bausteine ? wahl : null} onSeite={onSeite} onBaustein={onBaustein} />
              : <p className="p-4 text-sm text-slate-500">Das Paket enthält keinen Entwurf. In der App `node tools/design-system.mjs` ausführen und den Projekt-Abgleich abwarten.</p>}
          {leiste.begruendung && <Begruendung begruendung={schluessel ? daten.begruendungen[schluessel] : null} titel={titel} />}
        </div>
        <div className="lg:col-span-2 2xl:col-span-1">
          <Inspektor daten={daten} wahl={wahl} zaehler={echt ? null : info?.zaehler} modus={modus} setModus={setModus} werte={werte} eigen={eigen}
            setzeToken={setzeToken} setzeEcke={setzeEcke} zuruecksetzen={zuruecksetzen} befunde={befunde} darf={darf}
            ebene={ebene} setEbene={setEbene} stand={stand} speichern={speichern} speichert={speichert} kannSpeichern={kannSpeichern} bruecke={bruecke} onFreigabe={onFreigabe} />
        </div>
      </div>
      {bruecke.unsichtbar}
    </div>
  );
}

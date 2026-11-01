// App-Designer 3.0 · Inspektor rechts: Baustein (Name, Zweck aus §5, „verwendet an N Stellen“, erlaubte Regler),
// Design-Tokens (§4, hell/dunkel, Ecken) und Prüfungen (Kontrast-Wächter auf den DS-Token-Paaren, „Blau nie Status“).
// Alles aus dem Design-System-Paket der App – keine eigene Liste in der Codeschmiede.
import React, { useMemo, useState } from "react";
import { Shapes, Palette, ShieldCheck, CircleCheck, CircleAlert, TriangleAlert, RotateCcw, Save, Loader2, CheckCheck, MousePointerClick, Wand2 } from "lucide-react";
import { verhaeltnis } from "../kontrast";
import { bausteinZuName } from "../designSystem";
import { EBENEN } from "../BausteinInspektor";

const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold";
const ghost = "inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50";
const input = "rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";
const ROLLEN_APP = [["trainer", "Trainer"], ["admin", "Vereinsadmin"], ["parent", "Eltern"], ["player", "Spieler"], ["funktionaer", "Funktionäre"]];

function Farbe({ t, modus, wert, geaendert, onChange, darf }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <input type="color" aria-label={`${t.schluessel} (${modus})`} value={wert} disabled={!darf} onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer disabled:cursor-default shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span className="font-mono">{t.schluessel}</span>
          {geaendert && <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">geändert</span>}
          <span className={`ms-auto text-xs rounded-full px-1.5 ${t.app ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
            title={t.app ? `In der App: ${t.app}` : "Wird gespeichert; wirkt in der App, sobald die Bausteine auf diese Variable umgestellt sind"}>{t.app ? "wirkt in der App" : "nur Entwurf"}</span>
        </div>
        {t.zweck && <div className="text-xs text-slate-500 truncate" title={t.zweck}>{t.zweck}</div>}
      </div>
      <input aria-label={`${t.schluessel} Farbwert`} value={wert} disabled={!darf} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && onChange(e.target.value.toLowerCase())}
        className={`${input} w-[84px] font-mono text-xs`} />
    </div>
  );
}

function Ecke({ e, wert, onChange, darf }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm">
      <span className="flex-1 min-w-0"><b className="font-semibold">{e.name}</b>{e.app && <span className="block text-xs text-slate-500">In der App: {e.app}</span>}</span>
      <input type="range" min={e.min} max={e.max} value={wert} disabled={!darf} onChange={(x) => onChange(Number(x.target.value))} className="w-28 accent-emerald-700" />
      <span className="w-12 text-end tabular-nums text-xs">{wert} px</span>
    </label>
  );
}

export default function Inspektor({ daten, wahl, zaehler, modus, setModus, werte, eigen, setzeToken, setzeEcke, zuruecksetzen, befunde, darf,
  ebene, setEbene, stand, speichern, speichert, bruecke, onFreigabe }) {
  const [reiter, setReiter] = useState("baustein");
  const b = bausteinZuName(daten, wahl);
  const tokenVon = useMemo(() => Object.fromEntries(daten.tokens.map((t) => [t.schluessel, t])), [daten]);
  const offen = befunde.filter((x) => !x.ok);
  const pflicht = offen.filter((x) => x.stufe === "pflicht").length;
  const anzahlEigen = Object.keys(eigen.hell || {}).length + Object.keys(eigen.dunkel || {}).length + Object.keys(eigen.ecken || {}).length;
  const gruppen = [...new Map(daten.tokens.map((t) => [t.gruppe, t.gruppeName])).entries()];

  const ModusWahl = () => (
    <div role="group" aria-label="Werte für" className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
      {[["hell", "Hell"], ["dunkel", "Dunkel"]].map(([k, t]) => <button key={k} type="button" aria-pressed={modus === k} onClick={() => setModus(k)} className={`px-2.5 py-1 rounded-md ${modus === k ? "bg-white dark:bg-slate-900 shadow-sm" : ""}`}>{t}</button>)}
    </div>);

  return (
    <aside className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-[520px] max-h-[calc(100vh-140px)] self-start" aria-label="Inspektor">
      <div role="tablist" aria-label="Inspektor" className="flex gap-1 p-2 border-b border-slate-200 dark:border-slate-800">
        {[["baustein", "Baustein", Shapes], ["tokens", "Tokens", Palette], ["pruef", "Prüfungen", ShieldCheck]].map(([id, t, I]) => (
          <button key={id} type="button" role="tab" aria-selected={reiter === id} onClick={() => setReiter(id)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm font-semibold ${reiter === id ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
            <I className="w-4 h-4" aria-hidden="true" />{t}
            {id === "pruef" && offen.length > 0 && <span className={`text-xs font-bold rounded-full px-1.5 ${pflicht ? "bg-red-600 text-white" : "bg-amber-500 text-amber-950"}`}>{offen.length}</span>}
          </button>))}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {reiter === "baustein" && (!wahl ? (
          <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><MousePointerClick className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            „Bausteine zeigen“ einschalten und in der Maske auf einen Baustein klicken (gestrichelter Rand, blaues Schild).</p>
        ) : (
          <>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Baustein</div>
              <h3 className="font-display font-bold text-xl text-slate-900 dark:text-slate-50">{b ? b.name : wahl}</h3>
              {b && wahl !== b.name && <div className="text-sm text-slate-500">Variante: {wahl}</div>}
            </div>
            {b ? (
              <>
                {b.zweck && <p className="text-sm text-slate-700 dark:text-slate-200"><b>Zweck (Konzept §5):</b> {b.zweck}</p>}
                {b.ersetzt && <p className="text-sm text-slate-600 dark:text-slate-300"><b>Ersetzt heute:</b> {b.ersetzt}</p>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Verwendet</dt><dd><b>an {b.verwendet} Stelle{b.verwendet === 1 ? "" : "n"}</b> in der App</dd>
                  <dt className="text-slate-500">Auf dieser Seite</dt><dd>{[b.name, ...b.varianten].reduce((s, n) => s + (zaehler?.[n] || 0), 0)}×</dd>
                  <dt className="text-slate-500">Komponente</dt><dd className="font-mono text-xs break-all">{b.komponente || "noch keine eigene"}</dd>
                  {b.regler.groessen.length > 0 && <><dt className="text-slate-500">Größen</dt><dd>{b.regler.groessen.join(" / ")} px (fest nach §5)</dd></>}
                </dl>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                  <div className="flex items-center gap-2 mb-1"><h4 className="font-display font-bold">Erlaubte Regler</h4><span className="ms-auto"><ModusWahl /></span></div>
                  {!b.regler.farben.length && !b.regler.ecken && <p className="text-sm text-slate-500">Dieser Baustein hat keine eigenen Regler – er folgt den Design-Tokens.</p>}
                  {b.regler.farben.map((k) => tokenVon[k] && <Farbe key={k} t={tokenVon[k]} modus={modus} wert={werte[modus][k]} geaendert={!!eigen[modus]?.[k]} darf={darf} onChange={(v) => setzeToken(modus, k, v)} />)}
                  {b.regler.ecken && (() => { const e = daten.ecken.find((x) => x.schluessel === b.regler.ecken); return e ? <Ecke e={e} wert={werte.ecken[e.schluessel]} darf={darf} onChange={(v) => setzeEcke(e.schluessel, v)} /> : null; })()}
                  <p className="text-xs text-slate-500 mt-1">Ein Token gilt für alle Bausteine, die ihn nutzen. Neue Varianten oder Bausteine gehen als Auftrag.</p>
                </div>
              </>
            ) : <p className="text-sm text-slate-500">Teil der Maske ohne eigenen Baustein in §5{daten.weitereBausteine.includes(wahl) ? " (im Entwurf gezeichnet)" : ""}.</p>}
          </>
        ))}

        {reiter === "tokens" && (
          <>
            <div className="flex items-center gap-2"><ModusWahl />
              <button type="button" className={`${ghost} ms-auto h-8`} disabled={!anzahlEigen || !darf} onClick={zuruecksetzen} title="Eigene Änderungen dieser Ebene verwerfen"><RotateCcw className="w-4 h-4" />Zurücksetzen</button></div>
            {gruppen.map(([g, name]) => (
              <section key={g}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">{name}</h4>
                {daten.tokens.filter((t) => t.gruppe === g).map((t) => <Farbe key={t.schluessel} t={t} modus={modus} wert={werte[modus][t.schluessel]} geaendert={!!eigen[modus]?.[t.schluessel]} darf={darf} onChange={(v) => setzeToken(modus, t.schluessel, v)} />)}
              </section>))}
            <section>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-1">Ecken</h4>
              {daten.ecken.map((e) => <Ecke key={e.schluessel} e={e} wert={werte.ecken[e.schluessel]} darf={darf} onChange={(v) => setzeEcke(e.schluessel, v)} />)}
            </section>
          </>
        )}

        {reiter === "pruef" && (
          <>
            <p className="text-sm">{pflicht ? <b className="text-red-700 dark:text-red-300">{pflicht} Pflicht-Prüfung{pflicht === 1 ? "" : "en"} offen</b> : <b className="text-green-700 dark:text-green-400">Alle Pflicht-Prüfungen grün</b>}
              {offen.length - pflicht > 0 && <span className="text-amber-700 dark:text-amber-400"> · {offen.length - pflicht} Hinweis{offen.length - pflicht === 1 ? "" : "e"}</span>}</p>
            {[...new Set([...offen, ...befunde].map((x) => x.gruppe))].map((g) => (
              <section key={g}><h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{g}</h4>
                <ul className="space-y-1.5 text-sm">{befunde.filter((x) => x.gruppe === g).sort((p, q) => Number(p.ok) - Number(q.ok)).map((x, i) => (
                  <li key={i} className="flex gap-2">
                    {x.ok ? <CircleCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : x.stufe === "pflicht" ? <CircleAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" /> : <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                    <span className="flex-1 min-w-0">{x.modus === "hell" ? "Hell" : "Dunkel"}: {x.was}
                      <span className="block text-xs text-slate-500">{x.einheit === "°" ? (x.wert == null ? "Grau – erlaubt" : `Farbton-Abstand ${Math.round(x.wert)}° (mind. ${x.soll}°)`) : x.einheit === "ΔE" ? `Farbabstand ${x.wert.toFixed(0)} (mind. ${x.soll}) – Terminart und Status brauchen zusätzlich Wort/Symbol` : `${verhaeltnis(x.wert)} (mind. ${String(x.soll).replace(".", ",")} : 1)`}</span></span>
                    {x.vorschlag && darf && <button type="button" className={`${ghost} h-7 text-xs`} onClick={() => setzeToken(x.modus, x.a, x.vorschlag)} title={`${x.a} → ${x.vorschlag}`}><Wand2 className="w-3.5 h-3.5" />lesbar machen</button>}
                  </li>))}</ul>
              </section>))}
            <p className="text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-2">Paare und Regeln aus dem Design-System-Paket (Konzept §4, §10): Text 4,5 : 1, Bedienelemente 3 : 1, Blau nie Status, Terminart ≠ Status. Status immer zusätzlich mit Wort oder Symbol.</p>
          </>
        )}
      </div>

      {/* Speichern ins Design-Paket der App (Entwurf) – Rechteprüfung in der App */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <label className="text-slate-500" htmlFor="ad3-ebene">Gilt für</label>
          <select id="ad3-ebene" value={ebene.level} onChange={(e) => setEbene({ level: e.target.value })} className={input}>{EBENEN.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          {ebene.level === "package" && <select aria-label="Paket" value={ebene.package_key || ""} onChange={(e) => setEbene({ ...ebene, package_key: e.target.value })} className={input}><option value="">Paket wählen</option>{(stand.ziele?.packages || []).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}
          {(ebene.level === "club" || ebene.level === "role") && <select aria-label="Verein" value={ebene.club_id || ""} onChange={(e) => setEbene({ ...ebene, club_id: e.target.value })} className={`${input} max-w-[160px]`}><option value="">Verein wählen</option>{(stand.ziele?.clubs || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          {ebene.level === "role" && <select aria-label="Rolle" value={ebene.role_key || ""} onChange={(e) => setEbene({ ...ebene, role_key: e.target.value })} className={input}><option value="">Rolle wählen</option>{ROLLEN_APP.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={!darf || !bruecke.bereit || speichert === "laeuft" || stand.laden} onClick={speichern}>
            {speichert === "laeuft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Als Entwurf speichern{anzahlEigen ? ` (${anzahlEigen})` : ""}</button>
          <button type="button" className={ghost} onClick={onFreigabe} title="Freigeben unter App-Designer › Übernehmen"><CheckCheck className="w-4 h-4" />Zur Freigabe</button>
        </div>
        <p className="text-xs text-slate-500">
          {!bruecke.erlaubt ? "Speichern geht nur mit einer Testfassung von Trainer to go." : !bruecke.bereit ? "Testfassung wird verbunden … (angemeldet sein mit dem Betreiber-Konto, PC für das Design freigegeben)."
            : stand.fehler ? stand.fehler : typeof speichert === "object" && speichert ? speichert.text
            : `Ausgangswerte = Design 2.0${stand.entwurf?.version ? ` · Entwurf Version ${stand.entwurf.version}` : ""}${stand.live?.version ? ` · freigegeben Version ${stand.live.version}` : ""}. Wirkt nach der Freigabe sofort in der App.`}
          {!darf && " Nur ansehen: Gestalten dürfen Entwickler mit Design-Recht."}
        </p>
      </div>
    </aside>
  );
}

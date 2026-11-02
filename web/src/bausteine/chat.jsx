// Ein Chat-Baustein für alle Orte der Codeschmiede (Befund B4 vom 01.11.2026, Regel „ein Weg pro Aufgabe“):
// Menü „Chat“, Konzept-Chat, Gruppen-/Feature-Chat, Design-Chat, Baustein-Chat, Umdesign-Chat und der Auftrag aus dem Chat zur Kachel.
// Überall gleich: Kopf mit dem Bezug als Chip (Projekt · Konzept · Gruppe · Feature · Baustein · Kachel · Design · Symbol), Verlauf mit denselben
// Nachrichten (du rechts, KI links mit Zeichen), dieselbe Eingabe mit festen Begriffen:
//   „Besprechen“ (Standard, Enter) – die KI antwortet, gebaut wird nichts.
//   „Als Auftrag“ – nur wo es heute schon einen direkten Auftrag gab (Baustein aus „Zeigen & kommentieren“, Kachel-Wunsch, Entwurf, Umdesign).
//   „Antworten“ – nur auf eine offene Rückfrage der Werkstatt (geht an den laufenden Auftrag).
// Was gesendet wird und wohin, bestimmt weiter jeder Ort selbst (Tabellen, Rechte, Datenblöcke) – der Baustein ändert nur Aussehen und Begriffe.
import React, { forwardRef, useEffect, useRef } from "react";
import { MessageSquare, Hammer, Reply, Loader2, FolderKanban, Lightbulb, Hash, Layers, Component, LayoutGrid, Palette, Shapes, Bot } from "lucide-react";
import { useAutoHoehe } from "../autoHoehe";
import CodeschmiedeZeichen from "../Zeichen";

export const BEGRIFFE = { besprechen: "Besprechen", auftrag: "Als Auftrag", antworten: "Antworten" };

export const BEZUG = {
  projekt: { label: "Projekt", Symbol: FolderKanban },
  konzept: { label: "Konzept", Symbol: Lightbulb },
  gruppe: { label: "Gruppe", Symbol: Hash },
  feature: { label: "Feature", Symbol: Layers },
  baustein: { label: "Baustein", Symbol: Component },
  kachel: { label: "Kachel", Symbol: LayoutGrid },
  design: { label: "Design", Symbol: Palette },
  symbol: { label: "Symbol", Symbol: Shapes },
};

/** Bezug als Chip: Art (Symbol + Wort) und Name. */
export function BezugChip({ art, name, title }) {
  const b = BEZUG[art] || BEZUG.projekt;
  const S = b.Symbol;
  return (
    <span title={title || `${b.label}${name ? `: ${name}` : ""}`} data-cs="bezug-chip"
      className="inline-flex items-center gap-1.5 max-w-full min-w-0 h-7 pl-2 pr-2.5 rounded-full border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
      <S className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0">{b.label}</span>
      {name && <><span aria-hidden="true" className="text-emerald-400 dark:text-emerald-700">·</span><span className="truncate font-normal">{name}</span></>}
    </span>);
}

/** Kopf des Chats: Bezug(e) als Chip, optional Titel, rechts eigene Knöpfe. */
export function ChatKopf({ bezug, titel, rechts, unten }) {
  const liste = Array.isArray(bezug) ? bezug : bezug ? [bezug] : [];
  return (
    <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-w-0">
        {titel && <h2 className="font-display font-bold text-lg truncate min-w-0" style={{ textWrap: "balance" }}>{titel}</h2>}
        <div className={`flex items-center gap-1.5 min-w-0 flex-wrap ${titel ? "" : "flex-1"}`}>{liste.map((b, i) => <BezugChip key={i} {...b} />)}</div>
        {rechts && <div className="ml-auto flex items-center gap-1.5 shrink-0">{rechts}</div>}
      </div>
      {unten}
    </div>);
}

/** Verlauf: scrollt bei neuen Nachrichten nach unten (Regel 2026-10-23 10:20 „Chats starten beim letzten Eintrag“). */
export const ChatVerlauf = forwardRef(function ChatVerlauf({ anzahl, children, className = "", innen = "" }, aussen) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [anzahl]);
  return (
    <div ref={(el) => { ref.current = el; if (typeof aussen === "function") aussen(el); else if (aussen) aussen.current = el; }}
      className={`flex-1 min-h-0 overflow-y-auto px-3 py-3 ${className}`} aria-live="polite">
      <div className={`flex flex-col gap-3 ${innen}`}>{children}</div>
    </div>);
});

/**
 * Eine Nachricht. seite: "ich" (rechts, Smaragd), "ki" (links, Zeichen), "andere" (links, Teammitglied oder Werkstatt), "system" (Mitte, klein).
 * ton: "frage" (offene Rückfrage, Amber), "fehler" (nicht beantwortet), "blass" (abgeschlossen).
 */
export function ChatNachricht({ seite = "ki", kopf, ton, fuss, children, gross = false }) {
  const schrift = gross ? "text-[15px] leading-relaxed" : "text-sm";
  if (seite === "system") return <div className="self-center text-xs text-slate-500 text-center max-w-[92%]">{children}</div>;
  if (seite === "ich") return (
    <div className={`self-end max-w-[88%] min-w-0 ${ton === "blass" ? "opacity-75" : ""}`}>
      {kopf && <div className="text-xs text-slate-500 mb-1 text-right flex items-center justify-end gap-1.5 flex-wrap">{kopf}</div>}
      <div className={`rounded-2xl rounded-tr-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/60 px-3.5 py-2 ${schrift} break-words`}>{children}</div>
      {ton === "fehler" && <p className="text-xs text-red-700 dark:text-red-400 mt-1 text-right">Nicht beantwortet</p>}
      {fuss}
    </div>);
  const frage = ton === "frage";
  return (
    <div className={`self-start flex gap-2.5 max-w-[95%] min-w-0 ${ton === "blass" ? "opacity-75" : ""}`}>
      {seite === "ki" ? <CodeschmiedeZeichen groesse={24} className="mt-0.5" />
        : <span className="w-6 h-6 mt-0.5 shrink-0 rounded-md bg-slate-200 dark:bg-slate-800 grid place-items-center text-slate-600 dark:text-slate-300"><Bot className="w-3.5 h-3.5" aria-hidden="true" /></span>}
      <div className="min-w-0 flex-1">
        {kopf && <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5 flex-wrap">{kopf}</div>}
        <div className={`rounded-2xl rounded-tl-md px-3.5 py-2 ${schrift} break-words ${frage ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-400 dark:border-amber-700" : ton === "konflikt" ? "bg-red-50 dark:bg-red-950/40 border border-red-400 dark:border-red-700" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"}`}>{children}</div>
        {fuss}
      </div>
    </div>);
}

/** „KI denkt nach …“ bzw. Hinweis, dass die eigene Werkstatt aus ist. */
export function ChatWartet({ an, ki = "Claude", text, aus }) {
  return (
    <div role="status" className="self-start flex items-center gap-2 text-sm text-slate-500 pl-8">
      {an ? <><Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />{text || `${ki} liest nach und antwortet … (über deine Werkstatt)`}</>
        : <span className="text-amber-700 dark:text-amber-400">{aus || "Deine Werkstatt ist aus – sie startet mit dem Programm; dann kommt die Antwort."}</span>}
    </div>);
}

/** Vorschläge zum Anklicken über der Eingabe. */
export function ChatIdeen({ ideen = [], onWahl, gesperrt = false }) {
  if (!ideen.length) return null;
  return <div className="flex flex-wrap gap-1.5">{ideen.map((i) => (
    <button key={i} type="button" disabled={gesperrt} onClick={() => onWahl(i)}
      className="text-xs rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{i}</button>))}</div>;
}

/** Einfaches Textfeld des Chats (wächst mit). Für @Feature/#Gruppe nimmt der Ort stattdessen `MitErwaehnung` als `feld`. */
export const ChatTextfeld = forwardRef(function ChatTextfeld({ value, onChange, onEnter, min = 72, ...rest }, aussen) {
  const ref = useRef(null); useAutoHoehe(ref, value, { min });
  return <textarea ref={(el) => { ref.current = el; if (typeof aussen === "function") aussen(el); else if (aussen) aussen.current = el; }} value={value} onChange={(e) => onChange(e.target.value)}
    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); onEnter?.(); } }} {...rest} />;
});

const KNOPF = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm font-display font-bold tracking-wide disabled:opacity-50 transition";
const HAUPT = `${KNOPF} bg-emerald-700 hover:bg-emerald-800 text-white`;
const NEBEN = `${KNOPF} border border-emerald-700/40 dark:border-emerald-600/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950`;

/**
 * Eingabe: Textfeld (oder eigenes `feld`), darunter Werkzeuge links und die Knöpfe rechts.
 * aktionen: { besprechen?: fn, auftrag?: fn, antworten?: fn } – der erste vorhandene in dieser Reihenfolge (antworten, besprechen, auftrag)
 * ist der Hauptknopf und kommt mit Enter. `kannSenden` übersteuert „Text nötig“ (z. B. nur Anhänge). `gesperrt` (Text) ersetzt die Eingabe durch einen Hinweis (fehlendes Recht).
 */
export function ChatEingabe({ value, onChange, aktionen = {}, busy = false, platzhalter = "Nachricht …", hinweis, werkzeuge, ideen, onIdee, gesperrt, feld, maxLength = 8000, id, label = "Nachricht", oben, titel = {}, kannSenden }) {
  if (gesperrt) return <p className="border-t border-slate-200 dark:border-slate-800 px-3 py-3 text-xs text-slate-500">{gesperrt}</p>;
  const reihe = [["antworten", Reply], ["besprechen", MessageSquare], ["auftrag", Hammer]].filter(([k]) => typeof aktionen[k] === "function");
  const haupt = reihe[0]?.[0];
  const leer = kannSenden === undefined ? !String(value || "").trim() : !kannSenden;
  const los = () => { if (!busy && !leer && haupt) aktionen[haupt](); };
  return (
    <div className="border-t border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-2">
      {ideen?.length > 0 && <ChatIdeen ideen={ideen} onWahl={onIdee} gesperrt={busy} />}
      <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500">
        {oben}
        {feld ? feld({ los }) : <ChatTextfeld id={id} aria-label={label} value={value} onChange={onChange} onEnter={los} placeholder={platzhalter} maxLength={maxLength} />}
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          {werkzeuge}
          <span className="ml-auto" />
          {reihe.map(([k, S]) => (
            <button key={k} type="button" className={k === haupt ? HAUPT : NEBEN} disabled={busy || leer} onClick={() => aktionen[k]()}
              title={titel[k] || (k === haupt ? `${BEGRIFFE[k]} (Enter)` : BEGRIFFE[k])}>
              {busy && k === haupt ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <S className="w-4 h-4" aria-hidden="true" />}{BEGRIFFE[k]}</button>))}
        </div>
      </div>
      {hinweis && <p className="text-xs text-slate-500">{hinweis}</p>}
    </div>);
}

/** Rahmen: Kopf · Verlauf · Eingabe in einer Spalte (füllt die Höhe des Elternteils). */
export function ChatRahmen({ children, className = "", label = "Chat" }) {
  return <section aria-label={label} data-cs="chat" className={`flex flex-col min-h-0 min-w-0 ${className}`}>{children}</section>;
}

// Push-Nachricht aufs Handy (Befund L3 vom 01.11.2026, Regel AGENTS.md „Braucht Gerhard etwas zu bestätigen oder zu tun: Push-Nachricht aufs Handy“).
// Datenbank 0053 (ws_push_abos, Warteschlange, Auslöser), Edge Function supabase/functions/push-senden, Service Worker web/public/sw.js.
// Auf dem Handy: codeschmiede.pages.dev öffnen → „Zum Home-Bildschirm“ (iPhone ab iOS 16.4 nur so) → von dort öffnen → anmelden →
// Benutzermenü › „Push aufs Handy“ › „Auf diesem Gerät erlauben“. Kommt bei: neuer Erlaubnis-Anfrage, Rückfrage, Freigabe bereit, Station angehalten.
// Texte ohne Personendaten („Trainer to go · Auftrag #12 wartet auf deine Erlaubnis“). Gespeichert wird je Gerät nur die Push-Adresse des
// Browsers mit ihren Schlüsseln und ein grober Gerätename (iPhone, Android, Windows …).
import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, Send, Smartphone, Trash2, Info, Loader2 } from "lucide-react";
import { supabase } from "./supabase";
import { isDesktop } from "./desktop";
import { Dialog, btn, ghost, fehler, fmt } from "./bausteine/grund";
import { Laden, Leerzustand, Fehlerzustand } from "./bausteine/zustand";

const FUNKTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-senden`;

export const pushMoeglich = () => typeof window !== "undefined" && !isDesktop() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const istIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const alsApp = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
export function geraetName() {
  const ua = navigator.userAgent || "";
  return /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Gerät";
}
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ausB64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

async function oeffentlicherSchluessel() {
  const r = await fetch(`${FUNKTION}?schluessel=1`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j.publicKey !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(j.publicKey)) throw new Error(j.fehler || "Push ist noch nicht eingerichtet (Schlüssel oder Funktion fehlt) – siehe docs/KONZEPT.md › Push aufs Handy.");
  return j.publicKey;
}
async function registrierung() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

/** Erlaubnis holen, beim Push-Dienst des Browsers abonnieren und das Abo speichern (nur eigene Person). */
export async function pushErlauben() {
  if (!pushMoeglich()) throw new Error("Dieser Browser kann keine Push-Nachrichten.");
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== "granted") throw new Error(erlaubnis === "denied" ? "Mitteilungen sind für die Codeschmiede gesperrt – in den Einstellungen des Handys bzw. Browsers erlauben." : "Nicht erlaubt.");
  const schluessel = await oeffentlicherSchluessel();
  const reg = await registrierung();
  let abo = await reg.pushManager.getSubscription();
  // Abo mit altem Schlüssel (nach „Schlüssel ersetzen“) zuerst entfernen, sonst lehnt der Browser ab
  if (abo && abo.options?.applicationServerKey && b64u(abo.options.applicationServerKey) !== schluessel) { await abo.unsubscribe().catch(() => {}); abo = null; }
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ausB64u(schluessel) });
  const { error } = await supabase.rpc("ws_push_abo_speichern", { p_endpoint: abo.endpoint, p_p256dh: b64u(abo.getKey("p256dh")), p_auth: b64u(abo.getKey("auth")), p_geraet: geraetName() });
  if (error) { await abo.unsubscribe().catch(() => {}); throw error; }
  return abo.endpoint;
}

/** Abo dieses Geräts beenden (beim Browser und in der Datenbank). */
export async function pushBeenden() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const abo = await reg?.pushManager.getSubscription();
  if (abo) {
    const { error } = await supabase.rpc("ws_push_abo_loeschen", { p_endpoint: abo.endpoint });
    await abo.unsubscribe().catch(() => {});
    if (error) throw error;
  }
}

async function diesesGeraet() {
  if (!pushMoeglich()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription())?.endpoint || null;
}

/** Dialog „Push aufs Handy“ (Benutzermenü). */
export function PushEinstellung({ onClose, toast }) {
  const [liste, setListe] = useState(); const [ladeFehler, setLadeFehler] = useState(null);
  const [hier, setHier] = useState(null); const [busy, setBusy] = useState("");
  const laden = useCallback(async () => {
    const { data, error } = await supabase.from("ws_push_abos").select("id, endpoint, geraet, erstellt, zuletzt_ok, fehler_zahl").order("erstellt", { ascending: false });
    if (error) { setLadeFehler(error); return; }
    setLadeFehler(null); setListe(data || []); setHier(await diesesGeraet().catch(() => null));
  }, []);
  useEffect(() => { laden(); }, [laden]);
  const los = async (art, fn) => { setBusy(art); try { await fn(); await laden(); } catch (e) { toast(fehler(e)); } finally { setBusy(""); } };
  const hierAktiv = !!hier && (liste || []).some((a) => a.endpoint === hier);
  const moeglich = pushMoeglich();

  return (
    <Dialog title="Push aufs Handy" onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Eine kurze Nachricht, wenn du etwas bestätigen musst: neue Erlaubnis-Anfrage, Rückfrage der Werkstatt, Freigabe bereit, angehaltene Station. Ohne Namen und ohne Inhalte – nur Projekt und Auftragsnummer.</p>
      {!moeglich ? (
        <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-3 flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" />
          {isDesktop() ? "Im Programm Codeschmiede gibt es keine Push-Nachrichten. Öffne codeschmiede.pages.dev auf dem Handy und erlaube es dort." : "Dieser Browser kann keine Push-Nachrichten."}</p>
      ) : istIos() && !alsApp() ? (
        <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-3 flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" />
          Auf dem iPhone geht Push nur aus der Codeschmiede auf dem Home-Bildschirm: In Safari unten auf „Teilen“ tippen, „Zum Home-Bildschirm“, dann die Codeschmiede von dort öffnen und hier erlauben (ab iOS 16.4).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hierAktiv
            ? <button type="button" className={ghost} disabled={!!busy} onClick={() => los("aus", pushBeenden)}>{busy === "aus" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <BellOff className="w-4 h-4" />}Auf diesem Gerät beenden</button>
            : <button type="button" className={btn} disabled={!!busy} onClick={() => los("an", async () => { await pushErlauben(); toast("Push auf diesem Gerät erlaubt"); })}>{busy === "an" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <BellRing className="w-4 h-4" />}Auf diesem Gerät erlauben</button>}
        </div>)}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2"><h4 className="font-display font-bold flex-1">Deine Geräte</h4>
          <button type="button" className={`${ghost} h-9`} disabled={!!busy || !(liste || []).length} onClick={() => los("test", async () => { const { error } = await supabase.rpc("ws_push_test"); if (error) throw error; toast("Test gesendet – kommt in wenigen Sekunden"); })}>
            {busy === "test" ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Send className="w-4 h-4" />}Test senden</button></div>
        {ladeFehler ? <Fehlerzustand klein titel="Geräte nicht geladen" fehler={ladeFehler} onErneut={laden} />
          : liste === undefined ? <Laden zeilen={2} klein />
          : !liste.length ? <Leerzustand klein Symbol={Smartphone} titel="Noch kein Gerät" text="Öffne die Codeschmiede auf dem Handy und erlaube Push dort." />
          : <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">{liste.map((a) => (
              <li key={a.id} className="py-2 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1"><b className="font-semibold">{a.geraet}</b>{a.endpoint === hier && <span className="ml-1.5 text-xs rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-1.5">dieses Gerät</span>}
                  <span className="block text-xs text-slate-500">seit {fmt(a.erstellt)}{a.zuletzt_ok ? ` · zuletzt zugestellt ${fmt(a.zuletzt_ok)}` : ""}{a.fehler_zahl ? ` · ${a.fehler_zahl} Fehler` : ""}</span></div>
                <button type="button" className="p-2 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" aria-label={`${a.geraet} entfernen`} title="Entfernen" disabled={!!busy}
                  onClick={() => los("weg", async () => { if (a.endpoint === hier) await pushBeenden(); else { const { error } = await supabase.rpc("ws_push_abo_loeschen", { p_endpoint: a.endpoint }); if (error) throw error; } })}><Trash2 className="w-4 h-4" /></button>
              </li>))}</ul>}
      </div>
      <p className="text-xs text-slate-500">Zugestellt über den Push-Dienst deines Browsers (Apple, Google, Mozilla oder Microsoft), Ende-zu-Ende verschlüsselt – der Dienst sieht den Text nicht. Datenschutz: docs/DATENSCHUTZ.md.</p>
    </Dialog>);
}

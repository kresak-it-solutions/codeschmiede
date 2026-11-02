// Codeschmiede · Edge Function „push-senden“ (Befund L3 vom 01.11.2026, Datenbank 0053, Konzept docs/KONZEPT.md › Push aufs Handy)
// Claude, Anweisung Gerhard 01.11.2026 22:18/22:38 („alles freigegeben“), gebaut 02.11.2026.
//
// GET  ?schluessel=1  → { publicKey } – der öffentliche VAPID-Schlüssel für die Weboberfläche (nicht geheim).
// POST (Anstoß, ohne Inhalt; kommt per pg_net aus der Datenbank) → holt offene Zeilen aus ws_push_warteschlange (nur mit dem
//      Dienst-Schlüssel, ws_push_abholen), verschlüsselt jede Nachricht Ende-zu-Ende (RFC 8291, VAPID) und gibt sie dem Push-Dienst des Geräts.
//      Der Anstoß braucht keine Anmeldung: Er kann nur die vorhandene Warteschlange abarbeiten – senden, was dort nicht steht, geht nicht.
// Geheimnisse nur als Supabase-Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (Ablauf „Web-Push-Schlüssel erzeugen“),
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit. Nie im Code, in der Datenbank oder im Log.
// Inhalt der Nachrichten: nur Titel, kurzer Text ohne Personendaten, Pfad in der Codeschmiede, Tag.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { sendPushNotification } from "npm:@mmmike/web-push@1.3.0/send";   // wie Trainer to go (base44/shared/webPush.ts)

// Nur bekannte Push-Dienste (gleiche Liste wie ws_push_dienst_ok in Datenbank 0053) – Review #60: auch hier prüfen
const DIENST = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)(:443)?\//i;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SUBJECT = "https://codeschmiede.pages.dev";   // Kontakt für die Push-Dienste (VAPID „sub“), ohne E-Mail-Adresse
const MAX_JE_LAUF = 50;
const kopf = { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "https://codeschmiede.pages.dev" };
const antwort = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: kopf });

Deno.serve(async (req) => {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...kopf, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "content-type" } });
  if (req.method === "GET") {
    if (!url.searchParams.has("schluessel")) return antwort({ ok: true });
    return publicKey ? antwort({ publicKey }) : antwort({ fehler: "Noch kein VAPID-Schlüssel – Ablauf „Web-Push-Schlüssel erzeugen“ starten" }, 503);
  }
  if (req.method !== "POST") return antwort({ ok: false }, 405);
  if (!publicKey || !privateKey) return antwort({ ok: false }, 503);

  const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });
  // Bremse (Review #60): höchstens ein Lauf je 2 s – sonst warten und einmal neu versuchen (dann läuft ein anderer Lauf nach unserem Eintrag)
  for (let versuch = 0; ; versuch++) {
    const { data: sek, error: eb } = await db.rpc("ws_push_bremse");
    if (eb) return antwort({ ok: false }, 500);
    if (Number(sek) === 0) break;
    if (versuch > 0) return antwort({ ok: true });
    await warte(Math.min(2100, Math.ceil(Number(sek) * 1000) + 50));
  }
  const { data: zeilen, error } = await db.rpc("ws_push_abholen", { p_max: MAX_JE_LAUF });
  if (error) return antwort({ ok: false }, 500);   // Fehlertext der Datenbank nicht nach außen geben
  const vapid = { publicKey, privateKey, subject: SUBJECT };
  for (const z of (zeilen || []) as Array<{ id: number; titel: string; text: string; url: string; tag: string; abos: Array<{ endpoint: string; p256dh: string; auth: string }> }>) {
    const nutzlast = { title: z.titel, body: z.text, url: z.url, tag: z.tag };
    const ok: string[] = []; const weg: string[] = []; const kaputt: string[] = [];
    let fehler = "";
    for (const a of z.abos || []) {
      if (typeof a.endpoint !== "string" || !DIENST.test(a.endpoint)) { weg.push(String(a.endpoint)); continue; }   // unbekannter Dienst: Abo entfernen
      try {
        const zugestellt = await sendPushNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, nutzlast, vapid);
        if (zugestellt) ok.push(a.endpoint); else weg.push(a.endpoint);   // false = Gerät abgemeldet (404/410)
      } catch (e) {
        const st = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status;
        if (st === 404 || st === 410) weg.push(a.endpoint);
        else { kaputt.push(a.endpoint); fehler = `Push-Dienst antwortet ${st || "nicht"}`; }   // keine Adresse, kein Text ins Protokoll
      }
    }
    await db.rpc("ws_push_ergebnis", { p_id: z.id, p_gesendet: ok.length, p_fehler: fehler || null, p_ok: ok, p_weg: weg, p_kaputt: kaputt });
  }
  return antwort({ ok: true });   // Review #60: keine Zahlen nach außen
});

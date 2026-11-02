// Testseite per Knopf (Entscheidung Gerhard 02.11.2026): Cloudflare Pages mit Git-Anbindung – Cloudflare baut selbst (kostenlos bis
// 500 Builds im Monat, keine GitHub-Actions-Minuten), jeder Zweig bekommt eine eigene Testadresse <zweig>.<projekt>.pages.dev.
// Läuft nur in der Werkstatt des Admins. Zugang: die bestehende Wrangler-Anmeldung auf dem PC („wrangler auth token“, offizieller Befehl);
// das Token liegt NUR im Speicher für diesen Aufruf – nie gespeichert, nie geloggt, nie in einer Fehlermeldung. Aufgerufen wird nur
// api.cloudflare.com. Keine kostenpflichtigen Optionen. Geht die Git-Anbindung per Schnittstelle nicht (z. B. Cloudflare-GitHub-App fehlt für
// die Organisation), bricht der Ablauf sauber ab und die Oberfläche zeigt einen Lotsen; danach trägt die Werkstatt die Adresse selbst ein.
export const CF_API = "https://api.cloudflare.com/client/v4";
export const LOTSE_LINK = "https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages";
const PFAD = /^\/[A-Za-z0-9/_.-]{1,200}(\?[A-Za-z0-9=&_.-]{0,100})?$/;
const SUBDOMAIN = /^[a-z0-9-]{1,63}\.pages\.dev$/;

export class Lotse extends Error {}
const kurz = (t, n = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Build-Einstellungen je Grundgerüst (vorlagen/web, vorlagen/handy: Vite → dist). Andere Arten haben keine Testseite. */
export function buildFuer(art) {
  if (art === "web" || art === "handy" || !art) return { build_command: "npm run build", destination_dir: "dist", root_dir: "" };
  return null;
}

/** Token aus der Wrangler-Anmeldung holen (nur „oauth“ bzw. „api_token“). sh führt ohne Shell aus. */
export async function cfToken(sh) {
  let out;
  try { ({ stdout: out } = await sh("wrangler", ["auth", "token", "--json"], { timeout: 60000, maxBuffer: 1024 * 1024 })); }
  catch (e) {
    // Fehlertext kann bei manchen Fassungen Teile der Anmeldung enthalten – nie weitergeben, nur einordnen
    const t = String(e?.stderr || e?.message || "");
    if (/not (authenticated|logged in)|login/i.test(t)) throw new Lotse("Wrangler ist auf diesem PC nicht angemeldet – Einrichtung › Cloudflare (Wrangler) › „Hinzufügen“, danach nochmal „Testseite einrichten“.");
    if (/unknown (command|argument)|not a wrangler command|Unknown arguments/i.test(t)) throw new Lotse("Diese Wrangler-Fassung kennt „wrangler auth token“ noch nicht – bitte Wrangler aktualisieren (Einrichtung › Cloudflare › „Hinzufügen“).");
    if (e?.code === "ENOENT") throw new Lotse("Wrangler ist auf diesem PC nicht installiert – Einrichtung › Cloudflare (Wrangler) › „Hinzufügen“.");
    throw new Lotse("Die Wrangler-Anmeldung konnte nicht gelesen werden.");
  }
  const roh = String(out || ""); const a = roh.indexOf("{"); const b = roh.lastIndexOf("}");
  let j = null; try { j = a >= 0 && b > a ? JSON.parse(roh.slice(a, b + 1)) : null; } catch { j = null; }
  const token = (j?.type === "oauth" || j?.type === "api_token") && typeof j.token === "string" ? j.token.trim() : "";
  if (!/^[A-Za-z0-9._~+/=-]{20,4000}$/.test(token)) throw new Lotse("Wrangler hat keine verwendbare Anmeldung geliefert (nur Anmeldung per „wrangler login“ wird unterstützt).");
  return token;
}

/** Aufruf der Cloudflare-Schnittstelle (nur api.cloudflare.com). Wirft bei Fehlern { status, codes, text } ohne Token. */
export async function cf(holen, token, methode, pfad, body) {
  if (!PFAD.test(pfad) || pfad.includes("..") || pfad.includes("//")) throw new Error("Ungültiger Pfad für die Cloudflare-Schnittstelle");
  const url = `${CF_API}${pfad}`;
  if (new URL(url).host !== "api.cloudflare.com") throw new Error("Nur api.cloudflare.com ist erlaubt");
  const r = await holen(url, { method: methode, redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  let j = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok || !j?.success) {
    const e = new Error(kurz((j?.errors || []).map((x) => `${x.code || ""} ${x.message || ""}`.trim()).join(" · ") || `HTTP ${r.status}`, 300).split(token).join("[…]"));
    e.status = r.status; e.codes = (j?.errors || []).map((x) => Number(x.code)).filter(Number.isFinite);
    throw e;
  }
  return j.result;
}

/** Konto-ID: genau ein Cloudflare-Konto, sonst Lotse (welches Konto, entscheidet Gerhard). */
export async function kontoFinden(holen, token) {
  const konten = await cf(holen, token, "GET", "/accounts?per_page=50");
  const ids = (konten || []).map((k) => k?.id).filter((id) => /^[0-9a-f]{32}$/.test(id || ""));
  if (ids.length === 1) return ids[0];
  throw new Lotse(ids.length ? "Die Anmeldung hat Zugriff auf mehrere Cloudflare-Konten – bitte die Testseite einmal im richtigen Konto von Hand anlegen." : "Kein Cloudflare-Konto gefunden.");
}

/** Pages-Projekt anlegen (Inhalt der Anfrage). fehlerWerte = { url, anon, schluessel } für den Fehler-Melder (VITE_CS_FEHLER_*), optional. */
export function projektDaten({ name, repo, art, fehlerWerte = null }) {
  const [owner, repoName] = String(repo || "").split("/");
  const build = buildFuer(art);
  if (!owner || !repoName || !build) throw new Error("Für dieses Projekt gibt es keine Testseite");
  const env = fehlerWerte ? {
    VITE_CS_FEHLER_URL: { type: "plain_text", value: fehlerWerte.url },
    VITE_CS_FEHLER_ANON: { type: "plain_text", value: fehlerWerte.anon },
    VITE_CS_FEHLER_SCHLUESSEL: { type: "plain_text", value: fehlerWerte.schluessel },
  } : null;
  return {
    name, production_branch: "main", build_config: build,
    source: { type: "github", config: { owner, repo_name: repoName, production_branch: "main", pr_comments_enabled: true, deployments_enabled: true,
      production_deployments_enabled: true, preview_deployment_setting: "all", preview_branch_includes: ["*"], preview_branch_excludes: [] } },
    ...(env ? { deployment_configs: { production: { env_vars: env }, preview: { env_vars: env } } } : {}),
  };
}
const fehlerOk = (w) => !!w && /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(w.url || "") && typeof w.anon === "string" && w.anon.length > 20 && w.anon.length < 2000 && /^csf_[0-9a-f]{32}$/.test(w.schluessel || "");

// Fehler, die auf eine fehlende Git-Anbindung (Cloudflare-GitHub-App) hinweisen → Lotse statt Fehler
const GIT_FEHLT = /git|github|installation|repository|repo|source|oauth|authoriz/i;

/**
 * Testseite einrichten. Gibt { art: "fertig", subdomain, fehlerGesetzt, hinweis } zurück oder wirft Lotse (Gerhard muss in Cloudflare etwas tun).
 * projekt = { id, repo, technik_art }; sh für wrangler, holen = fetch.
 */
export async function testseiteEinrichten({ sh, holen = fetch, projekt, fehlerWerte = null }) {
  if (!buildFuer(projekt.technik_art)) throw new Error("Eine Testseite gibt es nur für Web- und Handy-Apps");
  const name = String(projekt.id || "");
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(name)) throw new Error("Ungültige Projekt-Kennung");
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(projekt.repo || "")) throw new Error("Ungültiges Repository");
  let token = await cfToken(sh);
  try {
    const konto = await kontoFinden(holen, token);
    const fw = fehlerOk(fehlerWerte) ? fehlerWerte : null;
    let p = null;
    try { p = await cf(holen, token, "GET", `/accounts/${konto}/pages/projects/${name}`); }
    catch (e) { if (e.status !== 404 && !e.codes?.includes(8000007)) throw e; }
    if (p) {
      // Gibt es schon: nur übernehmen, wenn es genau dieses Repository ist
      const c = p.source?.config || {};
      if (p.source?.type !== "github" || `${c.owner}/${c.repo_name}`.toLowerCase() !== projekt.repo.toLowerCase()) {
        throw new Lotse(`In Cloudflare gibt es schon ein Pages-Projekt „${name}“, das nicht mit ${projekt.repo} verbunden ist – bitte dort prüfen.`);
      }
    } else {
      try { p = await cf(holen, token, "POST", `/accounts/${konto}/pages/projects`, projektDaten({ name, repo: projekt.repo, art: projekt.technik_art, fehlerWerte: fw })); }
      catch (e) {
        if (e instanceof Lotse) throw e;
        if (e.status === 400 || e.status === 403 || GIT_FEHLT.test(e.message)) throw new Lotse(`Cloudflare konnte das Repository nicht verbinden (${kurz(e.message, 160)}). Meist fehlt die Cloudflare-App für GitHub in der Organisation.`);
        throw e;
      }
    }
    let fehlerGesetzt = false;
    if (fw) {
      try {
        const env = projektDaten({ name, repo: projekt.repo, art: projekt.technik_art, fehlerWerte: fw }).deployment_configs;
        await cf(holen, token, "PATCH", `/accounts/${konto}/pages/projects/${name}`, { deployment_configs: env });
        fehlerGesetzt = true;
      } catch { fehlerGesetzt = false; }
    }
    // Ersten Bau anstoßen (main); scheitert das, baut Cloudflare beim nächsten Push
    let gebaut = true;
    try { await cf(holen, token, "POST", `/accounts/${konto}/pages/projects/${name}/deployments`); } catch { gebaut = false; }
    const subdomain = SUBDOMAIN.test(p?.subdomain || "") ? p.subdomain : `${name}.pages.dev`;
    return { art: "fertig", subdomain, fehlerGesetzt,
      hinweis: `Testseite eingerichtet: https://${subdomain} · Zweige als <zweig>.${subdomain}${gebaut ? " · erster Bau läuft" : " · Bau startet beim nächsten Push"}${fw ? (fehlerGesetzt ? " · Fehler-Melder eingetragen" : " · Fehler-Melder bitte von Hand eintragen") : ""}` };
  } finally { token = null; }
}

/** Lotse erledigt? Pages-Projekt mit Git-Anbindung an genau dieses Repository vorhanden → Subdomain, sonst null. */
export async function lotsePruefen({ sh, holen = fetch, projekt }) {
  let token = null;
  try {
    token = await cfToken(sh);
    const konto = await kontoFinden(holen, token);
    const p = await cf(holen, token, "GET", `/accounts/${konto}/pages/projects/${projekt.id}`).catch(() => null);
    const c = p?.source?.config || {};
    if (!p || p.source?.type !== "github" || `${c.owner}/${c.repo_name}`.toLowerCase() !== String(projekt.repo || "").toLowerCase()) return null;
    return SUBDOMAIN.test(p.subdomain || "") ? p.subdomain : null;
  } catch { return null; } finally { token = null; }
}

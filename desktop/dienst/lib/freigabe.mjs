// Updates & Freigabe (0.20.0, Anweisung Gerhard 2026-11-07, „Gleicher Weg in beiden“, Entwurf freigegeben 21:16).
// Hat ein Projekt den Ablauf .github/workflows/freigabe.yml (wie Trainer to go), schaltet die Codeschmiede live NICHT selbst, sondern startet
// genau diesen Ablauf – wie die Plattform der App. Der Merker „heute 22:00“ liegt als Zweig freigabe/geplant in GitHub. Nur lesen über gh,
// kein Projekt-Code wird ausgeführt; Zugang = GitHub-Anmeldung des Admin-PCs (keine Zugangsdaten in der Codeschmiede).

export const FREIGABE_ABLAUF = ".github/workflows/freigabe.yml";
const WF = "freigabe.yml";
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const VERSION = /^version\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const GEPLANT = "freigabe/geplant";

function repoPruefen(repo) { if (!REPO.test(repo || "") || /\/\.\.?$/.test(repo)) throw new Error(`Ungültiges Repository: ${repo}`); }
const nicht404 = (e) => !/HTTP 404|Not Found/i.test(`${e?.stderr || ""}${e?.message || ""}`);
async function api(sh, pfad, jq) {
  const { stdout } = await sh("gh", ["api", pfad, ...(jq ? ["--jq", jq] : [])], { maxBuffer: 20 * 1024 * 1024 });
  return jq ? stdout : JSON.parse(stdout || "null");
}
const kurz = (t, n) => String(t ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n);

/** Name für den Lauftitel: ohne Klammern/Steuerzeichen, damit „Freigabe <art> <ziel> (<von>)“ eindeutig lesbar bleibt. */
export function vonText(name, ort = "Codeschmiede") {
  const n = kurz(name, 60).replace(/[()[\]{}"'`$\\]/g, "").trim() || "Admin";
  return `${n} · ${ort}`;
}

/** Pull Requests aus Commits: „Merge pull request #N from org/zweig“ (Merge) und „Titel (#N)“ (Squash). */
export function prsAus(commits) {
  const out = []; const gesehen = new Set();
  for (const c of commits || []) {
    const msg = String(c?.commit?.message ?? c?.message ?? "");
    const erste = msg.split("\n")[0];
    let nr = null; let zweig = ""; let titel = "";
    const m = erste.match(/^Merge pull request #(\d+) from [^/\s]+\/(\S+)/);
    if (m) { nr = Number(m[1]); zweig = m[2]; titel = (msg.split("\n").slice(1).find((l) => l.trim()) || zweig).trim(); }
    else { const s = erste.match(/^(.+?) \(#(\d+)\)$/); if (s) { nr = Number(s[2]); titel = s[1]; } }
    if (!nr || gesehen.has(nr)) continue;
    gesehen.add(nr);
    const art = /^(fix|hotfix)\//.test(zweig) || /^(fix|fehler|berichtigung)\b/i.test(titel) ? "fix" : /^(docs|wissen)\//.test(zweig) ? "doku" : "neu";
    out.push({ nr, titel: kurz(titel, 200), zweig: kurz(zweig, 255), art, am: kurz(c?.commit?.committer?.date ?? c?.am ?? "", 40) });
  }
  return out.reverse();
}

/** „Freigabe <art> <ziel> (<von>)“ → { art, ziel, von } */
export function laufTitel(t) {
  const m = String(t || "").match(/^Freigabe (\S+) (\S+) \((.*)\)$/);
  return m ? { art: m[1], ziel: m[2], von: m[3] } : null;
}

export async function ablaufDa(sh, repo, ref = "main") {
  repoPruefen(repo);
  try { await api(sh, `repos/${repo}/contents/${FREIGABE_ABLAUF}?ref=${encodeURIComponent(ref)}`, ".sha"); return true; }
  catch (e) { if (nicht404(e)) throw e; return false; }
}

async function zweig(sh, repo, name) {
  try { const s = (await api(sh, `repos/${repo}/git/ref/heads/${name}`, ".object.sha")).trim(); return SHA.test(s) ? s : null; }
  catch (e) { if (nicht404(e)) throw e; return null; }
}

async function jsonDatei(sh, repo, pfad, ref) {
  try {
    const b64 = await api(sh, `repos/${repo}/contents/${pfad}?ref=${ref}`, ".content");
    return JSON.parse(Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8"));
  } catch { return null; }
}

function wien(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, stunde: Number(p.hour) % 24 };
}
/** Plan-Tag: die nächste 22:00 nach dem Planen (nach 22:00 geplant → morgen). */
export function planTag(amIso) {
  const w = wien(new Date(amIso));
  return w.stunde >= 22 ? wien(new Date(Date.parse(amIso) + 3 * 3600e3)).datum : w.datum;
}

async function laeufe(sh, repo, n = 40) {
  try { return (await api(sh, `repos/${repo}/actions/workflows/${WF}/runs?per_page=${n}`))?.workflow_runs || []; } catch { return []; }
}

/** Stand für ws_freigabe_stand_melden (Form siehe ws_freigabe_stand_ok in 0064). */
export async function freigabeStand(sh, repo) {
  repoPruefen(repo);
  const [liveSha, mainSha] = await Promise.all([zweig(sh, repo, "live"), zweig(sh, repo, "main")]);
  if (!liveSha || !mainSha) throw new Error("Zweig live oder main fehlt");
  const ablauf = await ablaufDa(sh, repo, mainSha);
  let wartet = []; let datenbank = false; let commits = 0;
  if (liveSha !== mainSha) {
    const cmp = await api(sh, `repos/${repo}/compare/${liveSha}...${mainSha}`);
    wartet = prsAus(cmp?.commits || []).slice(0, 300);
    datenbank = (cmp?.files || []).some((f) => String(f.filename).startsWith("supabase/migrations/"));
    commits = Number(cmp?.ahead_by) || 0;
  }
  let mitteilungen = [];
  if (liveSha !== mainSha) {
    const [nm, nl] = await Promise.all([jsonDatei(sh, repo, "src/lib/neuigkeiten.json", mainSha), jsonDatei(sh, repo, "src/lib/neuigkeiten.json", liveSha)]);
    const liveIds = new Set((Array.isArray(nl) ? nl : []).map((e) => e?.id));
    mitteilungen = (Array.isArray(nm) ? nm : []).filter((e) => typeof e?.id === "string" && e.id && !liveIds.has(e.id)).slice(0, 100).map((e) => ({
      id: kurz(e.id, 80), titel: kurz(e.titel, 200), text: kurz(e.text, 2000),
      fuer: (Array.isArray(e.fuer) ? e.fuer : ["alle"]).filter((r) => typeof r === "string" && /^[a-z_-]{1,30}$/.test(r)).slice(0, 12),
    }));
  }
  const runs = ablauf ? await laeufe(sh, repo) : [];
  const verlauf = runs.map((r) => ({ r, t: laufTitel(r.display_title) }))
    .filter(({ t }) => t && ["freigabe", "planen", "zuruecknehmen", "abend", "zurueck"].includes(t.art)).slice(0, 25)
    .map(({ r, t }) => ({ am: kurz(r.created_at, 40), art: t.art, ziel: kurz(t.ziel, 120), von: kurz(t.von, 120), ergebnis: kurz(r.conclusion || "", 20), status: kurz(r.status || "", 20) }));
  let geplant = null;
  const g = ablauf ? await zweig(sh, repo, GEPLANT) : null;
  if (g) {
    const r = runs.find((x) => x.conclusion === "success" && String(x.display_title || "").startsWith(`Freigabe planen ${g}`));
    geplant = { sha: g, datum: r ? planTag(r.created_at) : null, von: r ? kurz(laufTitel(r.display_title)?.von, 120) : "", am: r ? kurz(r.created_at, 40) : null };
  }
  // Versionen, auf die man zurück darf: schon einmal live (Vorgänger des Live-Stands), nie der jetzige
  let zurueck = []; let liveBez = "";
  try {
    const refs = (await api(sh, `repos/${repo}/git/matching-refs/heads/version/`)) || [];
    const vers = refs.map((r) => ({ name: String(r.ref).replace("refs/heads/", ""), sha: r.object?.sha })).filter((v) => VERSION.test(v.name) && v.name.length <= 120 && SHA.test(v.sha || ""));
    const zahl = (n) => (n.match(/^version\/v(\d+)\.(\d+)\.(\d+)$/) || []).slice(1).map(Number);
    vers.sort((a, b) => { const x = zahl(a.name), y = zahl(b.name); if (x.length && y.length) return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; if (x.length !== y.length) return y.length - x.length; return b.name.localeCompare(a.name); });
    liveBez = vers.find((v) => v.sha === liveSha)?.name.replace(/^version\//, "") || "";
    if (ablauf) {
      for (const v of vers.filter((x) => x.sha !== liveSha).slice(0, 14)) {
        const st = await api(sh, `repos/${repo}/compare/${v.sha}...${liveSha}`, ".status").catch(() => "");
        if (st.trim() === "ahead") zurueck.push(v.name);
        if (zurueck.length >= 8) break;
      }
    }
  } catch { /* ohne Versionen */ }
  const r0 = runs[0];
  return {
    ablauf, live_sha: liveSha, main_sha: mainSha, live_bez: kurz(liveBez || `Stand ${liveSha.slice(0, 7)}`, 60),
    wartet, commits, datenbank, mitteilungen, geplant, verlauf, zurueck: [...new Set(zurueck)],
    lauf: r0 ? { status: kurz(r0.status, 20), ergebnis: kurz(r0.conclusion || "", 20), am: kurz(r0.created_at, 40), titel: kurz(r0.display_title, 200) } : null,
  };
}

/** Ablauf starten und auf das Ende warten. art: freigabe | planen | zuruecknehmen | zurueck. Rückgabe { ok, ergebnis, url } */
export async function ablaufStarten(sh, repo, { art, ziel, von }, { warten = 9 * 60 * 1000, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  repoPruefen(repo);
  if (!["freigabe", "planen", "zuruecknehmen", "zurueck"].includes(art)) throw new Error("Unbekannte Art");
  if (art === "zuruecknehmen") ziel = "-";
  else if (art === "zurueck") { if (!VERSION.test(ziel || "") || ziel.length > 120) throw new Error("Ungültige Version"); }
  else if (!SHA.test(ziel || "")) throw new Error("Ungültiger Stand");
  const titel = `Freigabe ${art} ${ziel} (${von})`;
  const start = Date.now();
  await sh("gh", ["workflow", "run", WF, "--repo", repo, "--ref", "main", "-f", `ziel=${ziel}`, "-f", `art=${art}`, "-f", `von=${von}`]);
  let lauf = null;
  while (Date.now() - start < warten) {
    await pause(lauf ? 10000 : 5000);
    const runs = await laeufe(sh, repo, 15);
    lauf = runs.find((r) => r.display_title === titel && Date.parse(r.created_at) >= start - 120000) || lauf;
    if (lauf?.status === "completed") return { ok: lauf.conclusion === "success", ergebnis: lauf.conclusion, url: lauf.html_url };
    if (lauf) lauf = runs.find((r) => r.id === lauf.id) || lauf;
  }
  return { ok: false, ergebnis: lauf ? "zeit" : "nicht_gestartet", url: lauf?.html_url || null };
}

/** Feature-Nummern in einem Stand (aus der Features-Datei der Aufbau-Datei) – für live/test. */
export async function featuresAm(sh, repo, aufbauDatei, sha) {
  if (!aufbauDatei || !SHA.test(sha || "")) return null;
  const pfad = aufbauDatei.replace(/\.js$/, ".features.json");
  if (!/^[A-Za-z0-9._/-]+\.features\.json$/.test(pfad) || pfad.includes("..")) return null;
  const j = await jsonDatei(sh, repo, pfad, sha);
  if (!j) return null;
  const ids = new Set();
  for (const t of ["app", "erp"]) for (const l of Object.values(j?.[t] || {})) if (Array.isArray(l)) for (const f of l) if (/^F-[0-9]{3,5}$/.test(f?.id || "")) ids.add(f.id);
  return ids;
}

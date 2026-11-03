// Sechste Prüfung (N13): Arbeitszweig eines Auftrags vorbereiten – nie auf ungeprüftem Inhalt bei GitHub weiterbauen.
//  - Ist in der Datenbank noch kein Zweig eingetragen (neuer Lauf bzw. neue Runde): immer frisch von origin/main (lokal mit -B),
//    ein vorhandener Remote-Zweig gleichen Namens wird mit --force-with-lease gegen den gesehenen Stand gelöscht.
//  - Weiterbauen (Fortsetzen/Nacharbeit) nur, wenn der Zweig von einem eigenen PC angelegt wurde (zweig_pc) UND der Kopf bei GitHub
//    genau letzter_commit aus der Datenbank ist (ohne letzter_commit: kein Remote-Zweig oder genau der lokale Stand).
// git(cwd, ...args) liefert stdout ohne Zeilenende (wie im Dienst).
export const ZWEIG_VERAENDERT = "Zweig bei GitHub verändert – Auftrag wird neu aufgesetzt";

export class ZweigVeraendert extends Error {
  constructor(grund) { super(`${ZWEIG_VERAENDERT}${grund ? ` (${grund})` : ""}`); this.name = "ZweigVeraendert"; }
}

const SHA = /^[0-9a-f]{40}$/;
/** N20 (siebte Prüfung): Zweig gehört zu genau diesem Auftrag – feature/cs-<id>-… (wie ws_auftraege_zweig_check und der Trigger). */
export function zweigGehoertZu(zweig, id) {
  return Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof zweig === "string" && zweig.startsWith(`feature/cs-${Number(id)}-`)
    && /^feature\/cs-[0-9]+-[a-z0-9-]{1,40}$/.test(zweig);
}
/** Kopf des Zweigs bei origin („“ wenn es ihn nicht gibt). */
export async function remoteKopf(git, repo, zweig) {
  const out = await git(repo, "ls-remote", "origin", `refs/heads/${zweig}`);
  const sha = String(out || "").split(/\s+/)[0] || "";
  return SHA.test(sha) ? sha : "";
}
async function lokalerZweig(git, ordner) {
  try { return await git(ordner, "rev-parse", "--abbrev-ref", "HEAD"); } catch { return null; }
}
async function ordnerWeg(git, repo, ordner, existiert, rm) {
  if (!(await existiert(ordner))) return;
  try { await git(repo, "worktree", "remove", "--force", ordner); } catch { await rm(ordner, { recursive: true, force: true }); }
  try { await git(repo, "worktree", "prune"); } catch { /* egal */ }
}

/**
 * @param {object} o { git, repo, ordner, zweigNeu, auftrag: { zweig, zweig_pc, letzter_commit }, eigenePcs: string[], existiert, rm }
 * @returns {Promise<{ zweig: string, neu: boolean }>} – wirft ZweigVeraendert, wenn nicht weitergebaut werden darf
 */
export async function zweigVorbereiten({ git, repo, ordner, zweigNeu, auftrag, eigenePcs = [], existiert, rm }) {
  await git(repo, "fetch", "origin", "+refs/heads/main:refs/remotes/origin/main");   // N18: voll ausgeschriebene Refspec
  if (!auftrag.zweig) {
    await ordnerWeg(git, repo, ordner, existiert, rm);
    const gesehen = await remoteKopf(git, repo, zweigNeu);
    if (gesehen) await git(repo, "push", `--force-with-lease=refs/heads/${zweigNeu}:${gesehen}`, "origin", `:refs/heads/${zweigNeu}`);
    await git(repo, "worktree", "add", "-B", zweigNeu, ordner, "origin/main");
    return { zweig: zweigNeu, neu: true };
  }
  const zweig = auftrag.zweig;
  if (auftrag.id != null && !zweigGehoertZu(zweig, auftrag.id)) throw new ZweigVeraendert(`Zweig ${zweig} gehört nicht zu Auftrag #${auftrag.id}`);   // N20
  if (!auftrag.zweig_pc || !eigenePcs.includes(auftrag.zweig_pc)) throw new ZweigVeraendert("Zweig von einem anderen PC angelegt");
  const kopf = await remoteKopf(git, repo, zweig);
  const lokalDa = (await existiert(ordner)) && (await lokalerZweig(git, ordner)) === zweig;
  const lokal = lokalDa ? await git(ordner, "rev-parse", "HEAD") : null;
  if (auftrag.letzter_commit) {
    if (kopf !== auftrag.letzter_commit) throw new ZweigVeraendert(kopf ? `Kopf ${kopf.slice(0, 7)} statt ${String(auftrag.letzter_commit).slice(0, 7)}` : "Zweig fehlt bei GitHub");
  } else if (kopf && kopf !== lokal) throw new ZweigVeraendert(`unerwarteter Kopf ${kopf.slice(0, 7)}`);
  if (lokalDa) return { zweig, neu: false };   // eigener Ordner auf diesem PC (ggf. mit noch nicht hochgeladener eigener Arbeit)
  await ordnerWeg(git, repo, ordner, existiert, rm);
  if (kopf) {
    await git(repo, "fetch", "origin", `+refs/heads/${zweig}:refs/remotes/origin/${zweig}`);
    await git(repo, "worktree", "add", "-B", zweig, ordner, kopf);
  } else await git(repo, "worktree", "add", "-B", zweig, ordner, "origin/main");
  return { zweig, neu: false };
}

// N16 (siebte Prüfung): nur diese Reflog-Einträge zeigen einen lokal entstandenen Commit (nicht pull, merge, cherry-pick, reset, rebase, checkout …)
const LOKAL_COMMIT = /^commit( \((initial|amend)\))?: /;
/** Jeder Commit in basis..HEAD muss im Reflog des Arbeitsordners als lokaler Commit stehen. Liefert die fremden Commits. */
export async function fremdeCommits(git, ordner, basis = "origin/main") {
  const neu = String(await git(ordner, "rev-list", `${basis}..HEAD`)).split(/\s+/).filter((x) => SHA.test(x));
  if (!neu.length) return [];
  const lokal = new Set();
  for (const z of String(await git(ordner, "reflog", "show", "--format=%H%x09%gs", "HEAD")).split("\n")) {
    const [sha, ...rest] = z.split("\t");
    if (SHA.test(sha) && LOKAL_COMMIT.test(rest.join("\t"))) lokal.add(sha);
  }
  return neu.filter((c) => !lokal.has(c));
}
/**
 * Nach dem Lauf: liegt bei GitHub genau der lokale Stand – und ist jeder neue Commit lokal entstanden (basis = letzter geprüfter Stand bzw.
 * origin/main)? Sonst ZweigVeraendert (der Auftrag wird neu aufgesetzt).
 */
export async function zweigHochgeladenPruefen(git, repo, zweig, commit, { ordner = null, basis = "origin/main" } = {}) {
  const kopf = await remoteKopf(git, repo, zweig);
  if (!commit || kopf !== commit) throw new ZweigVeraendert(kopf ? `Kopf ${kopf.slice(0, 7)} statt ${String(commit || "").slice(0, 7)}` : "Zweig fehlt bei GitHub");
  if (ordner) {
    const fremd = await fremdeCommits(git, ordner, basis);
    if (fremd.length) throw new ZweigVeraendert(`${fremd.length} Commit(s) nicht lokal entstanden, z. B. ${fremd[0].slice(0, 7)}`);
  }
}

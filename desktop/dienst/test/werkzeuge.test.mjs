// Programmier-Werkzeug je Projekt (0.14.0): Sperr-Konfigurationen je Werkzeug, Nachbau der Sperr-Logik (macOS-Profil, bubblewrap,
// OpenCode-Rechte), Sperren-Test-Auswertung auf der echten Platte, Lock-Datei-Prüfung, Programmsuche, Werkstatt-Regeln (kein Einspringen).
// Ein echter Lauf von Codex/Gemini/OpenCode ist hier NICHT möglich (keine Anmeldung, keine Installation im Prüf-Container) – das leistet
// der Sperren-Test auf dem Entwickler-PC.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, readFile, symlink, link, rm, appendFile, realpath } from "node:fs/promises";
import { realpathSync, existsSync } from "node:fs";
import { WERKZEUGE, FREMDE, sperrbar, modellOk, dateiGesperrt, statusPfade, projektKonfigFunde, codexKonfig, codexArgs, geminiEinstellungen, geminiArgs,
  opencodeKonfig, opencodeArgs, werkzeugUmgebung, laufPlan, codexVerbrauch, geminiAuswerten, opencodeAuswerten, werkzeugVorspann } from "../lib/werkzeuge.mjs";
import { werkzeugSandbox, WERKZEUG_PROGRAMME, opencodeAnmeldungBereinigen, anmeldungBereinigen } from "../lib/sandbox.mjs";
import { lockPruefen, programmIn, testAufbauen, testAuswerten, stand, sperrenTest, TEST_PUNKTE, testPrompt, GEGENPROBE, installieren, installiertPruefen, installOrdner, PRUEFSUMME, sperrNachweis, nachweisGleich, lockQuelle, installationUnveraendert, ordnerManifest, INSTALLATION_VERAENDERT } from "../lib/werkzeugLauf.mjs";

const tmp = (p) => mkdtemp(path.join(os.tmpdir(), p));
const echt = (p) => realpathSync(p);

// ---------- Katalog und Wählbarkeit ----------
test("Katalog: feste Versionen, offizielle npm-Pakete, Claude Code ist Standard", () => {
  assert.equal(WERKZEUGE["claude-code"].standard, true);
  assert.deepEqual(FREMDE, ["codex", "gemini-cli", "opencode"]);
  assert.equal(WERKZEUGE.codex.paket, "@openai/codex");
  assert.equal(WERKZEUGE["gemini-cli"].paket, "@google/gemini-cli");
  assert.equal(WERKZEUGE.opencode.paket, "@opencode/cli");
  for (const w of FREMDE) assert.match(WERKZEUGE[w].version, /^\d+\.\d+\.\d+$/, "feste Version, kein Bereich");
});
test("sperrbar: Windows nie, Linux nie (B5), Admin-PC nie, Gemini nie (B2), macOS nur mit sandbox-exec", () => {
  for (const w of FREMDE) {
    assert.equal(sperrbar(w, { plattform: "win32", sandbox: null }).ok, false);
    assert.equal(sperrbar(w, { plattform: "linux", sandbox: "linux" }).ok, false);
    assert.equal(sperrbar(w, { plattform: "darwin", sandbox: "macos", admin: true }).ok, false);
    assert.equal(sperrbar(w, { plattform: "darwin", sandbox: null }).ok, false);
    assert.equal(sperrbar(w, { plattform: "darwin", sandbox: "macos" }).ok, w !== "gemini-cli");
  }
  assert.match(sperrbar("gemini-cli", { plattform: "darwin", sandbox: "macos" }).grund, /vertrauten Ordnern/);
  assert.equal(sperrbar("claude-code", { plattform: "win32" }).ok, true);
  assert.match(sperrbar("codex", { plattform: "win32" }).grund, /Windows/);
});
test("Modelle: Claude ohne Modell, OpenCode nur anbieter/modell, keine Schalter", () => {
  assert.equal(modellOk("claude-code", null), true);
  assert.equal(modellOk("claude-code", "opus"), false);
  assert.equal(modellOk("codex", "gpt-5.5-codex"), true);
  assert.equal(modellOk("codex", "--yolo"), false);
  assert.equal(modellOk("opencode", "openai/gpt-5"), true);
  assert.equal(modellOk("opencode", "gpt-5"), false);
  assert.equal(modellOk("gemini-cli", "-m"), false);
});

// ---------- Dateien, die nie geändert werden dürfen ----------
test("Gesperrte Dateien nach dem Lauf", () => {
  for (const p of [".github/workflows/x.yml", "package.json", "web/package-lock.json", ".opencode/plugin/x.js", "opencode.json", ".gemini/settings.json", ".codex/config.toml",
    "AGENTS.md", "web/public/_headers", ".GitHub/workflows/x.yml", "Package.JSON", ".Agents/x", ".agents/regeln.md", "Opencode.json", "agents.md", "supabase/einspielen.txt", "vite.config.js", "tools/x.mjs", ".env", ".npmrc", "../x", ".git/config", ".gitattributes", "src-tauri/build.rs"])
    assert.equal(dateiGesperrt(p), true, p);
  for (const p of ["src/App.jsx", "docs/CHANGELOG.md", "supabase/migrations/0099_x.sql", "web/src/seiten/Neu.jsx", "README.md"]) assert.equal(dateiGesperrt(p), false, p);
});
test("git status -z: Pfade mit führendem Leerzeichen, Umbenennen und Unverfolgtes", () => {
  assert.deepEqual(statusPfade(" M src/a.js\0R  neu.js\0alt.js\0?? b c.txt\0"), ["src/a.js", "neu.js", "alt.js", "b c.txt"]);
  assert.deepEqual(statusPfade(""), []);
});
test("Projekt-Konfiguration der Werkzeuge im Arbeitsordner oder darüber → gefunden (Lauf verweigert)", async () => {
  const b = await tmp("cs-wz-konf-");
  const o = path.join(b, "projekt", "code-arbeit", "auftrag-1"); await mkdir(o, { recursive: true });
  assert.deepEqual(await projektKonfigFunde(o), []);
  await mkdir(path.join(o, ".Gemini")); await writeFile(path.join(o, "OpenCode.JSON"), "{}"); await mkdir(path.join(o, ".agents"));
  await writeFile(path.join(b, "projekt", ".ENV"), "X=1");
  const f = await projektKonfigFunde(o);
  assert.ok(f.includes(".Gemini") && f.includes("OpenCode.JSON") && f.includes(".agents"), "Groß/Klein egal (B1)");
  assert.ok(f.includes(path.join(b, "projekt", ".ENV")));
  await rm(b, { recursive: true, force: true });
});

// ---------- Einstellungen je Werkzeug ----------
test("Codex: eigenes CODEX_HOME, keine Rückfragen, Projekt nie vertraut, keine Hooks/MCP/Websuche, kein Schalter über das Modell", () => {
  const k = codexKonfig({ ordner: '/Volumes/D/Codeschmiede/x/code-arbeit/auftrag-7' });
  for (const z of ['approval_policy = "never"', 'cli_auth_credentials_store = "file"', 'web_search = "disabled"', "hooks = false", 'persistence = "none"',
    '[projects."/Volumes/D/Codeschmiede/x/code-arbeit/auftrag-7"]', 'trust_level = "untrusted"']) assert.ok(k.includes(z), z);
  assert.throws(() => codexKonfig({ ordner: "/a\nb" }));
  assert.ok(codexKonfig({ ordner: 'C:\\x"y' }).includes('[projects."C:\\\\x\\"y"]'));
  const a = codexArgs({ ordner: "/w", antwort: "/l/antwort.txt", modell: "--dangerously-bypass-approvals-and-sandbox" });
  assert.ok(!a.some((x) => /dangerously|yolo|full-auto/.test(x)));
  assert.ok(a.includes("mcp_servers={}") && a.includes('approval_policy="never"') && a.at(-1) === "-");
  const plan = laufPlan({ werkzeug: "codex", ordner: "/w", lauf: "/l", home: "/l/home", modell: "gpt-5.5-codex" });
  assert.equal(plan.env.CODEX_HOME, path.join("/l/home", ".codex"));
  assert.equal(plan.dateien[0].pfad, path.join("/l/home", ".codex", "config.toml"));
  assert.ok(plan.args.includes("--model") && plan.args.includes("gpt-5.5-codex"));
});
test("Gemini: System-Einstellungen ohne Shell/Web/MCP/Erweiterungen/Hooks, kein YOLO, keine Projekt-.env", () => {
  const s = geminiEinstellungen();
  assert.equal(s.general.defaultApprovalMode, "auto_edit");
  assert.ok(s.tools.exclude.includes("run_shell_command") && s.tools.exclude.includes("web_fetch") && s.tools.exclude.includes("google_web_search"));
  assert.ok(!s.tools.core.includes("run_shell_command"));
  assert.equal(s.tools.sandbox, false);   // äußere Sperre der Codeschmiede
  assert.deepEqual(s.mcpServers, {});
  assert.equal(s.admin.mcp.enabled, false); assert.equal(s.admin.extensions.enabled, false); assert.equal(s.admin.secureModeEnabled, true);
  assert.equal(s.security.disableYoloMode, true); assert.equal(s.security.folderTrust.enabled, true);
  assert.equal(s.tools.discoveryCommand, ""); assert.equal(s.tools.callCommand, "");
  const pl = laufPlan({ werkzeug: "gemini-cli", ordner: "/w", lauf: "/l", home: "/l/home" });
  assert.equal(pl.dateien.find((d) => d.pfad.endsWith("gemini-vertraut.json")).inhalt, "{}", "kein Ordner vertraut");
  assert.equal(pl.env.GEMINI_CLI_TRUSTED_FOLDERS_PATH, path.join("/l", "gemini-vertraut.json")); assert.equal(s.hooksConfig.enabled, false); assert.equal(s.advanced.ignoreLocalEnv, true);
  assert.deepEqual(geminiArgs({ modell: "-y" }), ["--approval-mode", "auto_edit", "--extensions", "none", "--output-format", "json"]);
  const env = werkzeugUmgebung("gemini-cli", { lauf: "/l", home: "/l/home" });
  assert.equal(env.GEMINI_CLI_SYSTEM_SETTINGS_PATH, path.join("/l", "gemini-system.json")); assert.equal(env.GEMINI_SANDBOX, "false");
});

/** Nachbau der Rechte-Prüfung von OpenCode: Muster mit * und ?, die LETZTE passende Regel gewinnt (opencode.ai/docs/permissions). */
function ocRecht(regel, wert) {
  if (typeof regel === "string") return regel;
  let r = null;
  for (const [m, v] of Object.entries(regel)) {
    const re = new RegExp(`^${m.split("").map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&"))).join("")}$`);
    if (re.test(wert)) r = v;
  }
  return r;
}
test("OpenCode: Rechte – bash, Web, Unter-Agenten und Ordner außerhalb gesperrt, gesperrte Dateien auch beim Bearbeiten", () => {
  const k = opencodeKonfig(); const p = k.permission;
  for (const t of ["bash", "webfetch", "websearch", "task", "external_directory", "skill"]) assert.equal(p[t], "deny", t);
  for (const a of ["build", "plan", "general"]) assert.deepEqual(k.agent[a].permission, p);
  assert.equal(ocRecht(p.edit, "src/App.jsx"), "allow");
  for (const f of [".github/workflows/x.yml", "package.json", "web/package.json", ".opencode/plugin/x.ts", "opencode.json", "AGENTS.md", "vite.config.js", "tools/x.mjs", ".env.local"])
    assert.equal(ocRecht(p.edit, f), "deny", f);
  assert.equal(ocRecht(p.read, "src/x.env"), "deny");
  assert.equal(k.autoupdate, false); assert.deepEqual(k.plugin, []); assert.deepEqual(k.mcp, {}); assert.equal(k.formatter, false); assert.equal(k.lsp, false);
  const env = werkzeugUmgebung("opencode", { lauf: "/l", home: "/l/home" });
  assert.deepEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT), k);
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
  assert.deepEqual(opencodeArgs({ modell: "x" }).slice(0, 3), ["run", "--format", "json"]);
  assert.ok(opencodeArgs({ modell: "openai/gpt-5" }).includes("openai/gpt-5"));
});
test("Vorspann: nur Dateien im Arbeitsordner, Commit/PR macht die Codeschmiede", () => {
  const v = werkzeugVorspann("codex");
  assert.match(v, /Ändere NUR Dateien in diesem Ordner/); assert.match(v, /Commit, Hochladen und Pull Request macht die Codeschmiede/); assert.match(v, /RÜCKFRAGE:/);
});

// ---------- Verbrauch: nur Gemeldetes ----------
test("Verbrauch: nur, was das Werkzeug meldet – sonst null", () => {
  assert.deepEqual(codexVerbrauch('{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":3,"output_tokens":300}}\n{"type":"x"}'), { ein: 1200, aus: 300 });
  assert.equal(codexVerbrauch('{"type":"item.completed"}'), null);
  const g = geminiAuswerten('{"response":"Fertig.","stats":{"models":{"gemini-2.5-pro":{"tokens":{"prompt":50,"candidates":7}}}}}');
  assert.equal(g.text, "Fertig."); assert.deepEqual(g.verbrauch, { ein: 50, aus: 7 });
  assert.equal(geminiAuswerten('{"response":"x"}').verbrauch, null);
  const o = opencodeAuswerten('{"type":"text","part":{"type":"text","text":"Hallo"}}\n{"type":"step_finish","part":{"type":"step-finish","tokens":{"input":10,"output":2}}}');
  assert.equal(o.text, "Hallo"); assert.deepEqual(o.verbrauch, { ein: 10, aus: 2 });
  assert.equal(opencodeAuswerten('{"part":{"type":"text","text":"x"}}').verbrauch, null);
});

// ---------- Nachbau der macOS-Sperre (Seatbelt, letzte passende Regel gewinnt) ----------
function sbplRegeln(profil) {
  const r = [];
  for (const z of profil.split("\n")) {
    const m = /^\((allow|deny) (.*)\)$/.exec(z.trim()); if (!m || m[2] === "default") { if (m) r.push({ art: m[1], ops: ["*"], filter: [] }); continue; }
    const ops = []; const filter = []; let rest = m[2];
    while (rest) {
      rest = rest.trim();
      const f = /^\((subpath|literal|regex) (?:"((?:[^"\\]|\\.)*)"|#"((?:[^"\\]|\\.)*)")\)/.exec(rest);
      if (f) { filter.push({ typ: f[1], wert: (f[2] ?? f[3]).replace(/\\(.)/g, "$1") }); rest = rest.slice(f[0].length); continue; }
      const o = /^\((global-name) "([^"]*)"\)/.exec(rest); if (o) { filter.push({ typ: "name", wert: o[2] }); rest = rest.slice(o[0].length); continue; }
      const op = /^([a-z*-]+)/.exec(rest); if (!op) break; ops.push(op[1]); rest = rest.slice(op[0].length);
    }
    r.push({ art: m[1], ops, filter });
  }
  return r;
}
function sbplErlaubt(regeln, op, pfad) {
  let ergebnis = "deny";
  const opPasst = (o) => o === "*" || o === op || (o.endsWith("*") && op.startsWith(o.slice(0, -1)));
  for (const r of regeln) {
    if (!r.ops.some(opPasst)) continue;
    if (r.filter.length && !r.filter.some((f) => (f.typ === "subpath" ? pfad === f.wert || pfad.startsWith(f.wert.endsWith("/") ? f.wert : `${f.wert}/`) : f.typ === "literal" ? pfad === f.wert : f.typ === "regex" ? new RegExp(f.wert).test(pfad) : false))) continue;
    ergebnis = r.art;
  }
  return ergebnis === "allow";
}
/** Wie das System den Pfad sieht: Verknüpfungen auf dem Weg aufgelöst (Seatbelt prüft den aufgelösten Pfad). */
function aufgeloest(p) { let x = p; const rest = []; while (!existsSync(x)) { rest.unshift(path.basename(x)); x = path.dirname(x); } return path.join(realpathSync(x), ...rest); }

async function aufbau() {
  const b = echt(await tmp("cs-wz-sbx-"));
  const home = path.join(b, "home"); await mkdir(path.join(home, ".ssh"), { recursive: true }); await writeFile(path.join(home, ".ssh", "id_ed25519"), "x");
  const t = await testAufbauen(path.join(b, "kopie"));
  const lauf = path.join(b, "kopie", "Daten", "laeufe", "werkzeug-1-x"); await mkdir(lauf, { recursive: true });
  const prog = path.join(b, "werkzeuge", "codex", "0.166.0", "node_modules", "@openai", "codex", "vendor", "aarch64-apple-darwin", "codex", "codex");
  await mkdir(path.dirname(prog), { recursive: true }); await writeFile(prog, "#!/bin/false\n");
  return { b, home, t, lauf, prog };
}
test("macOS-Sperre (Nachbau): schreiben nur im Arbeitsordner und Lauf-Ordner – Regeln, setup, Nachbar, REGELN.md, .git, Daten, Link nach außen gesperrt", async () => {
  const { b, home, t, lauf, prog } = await aufbau();
  const projekte = path.join(t.basis, "Projekte"); const daten = path.join(t.basis, "Daten");
  const s = await werkzeugSandbox({ werkzeug: "codex", start: { befehl: prog, vorne: [] }, ordner: t.ordner, lauf, env: {}, home, art: "macos", quellenEnv: {}, verbotenLesen: [projekte, daten] });
  assert.ok(s, "Sperre wird erzeugt"); assert.equal(s.befehl, "/usr/bin/sandbox-exec");
  assert.ok(s.profil.includes("(deny signal (target others))"));
  const R = sbplRegeln(s.profil);
  const darf = (op, p) => sbplErlaubt(R, op, aufgeloest(p));
  assert.equal(darf("file-write-data", t.ziele.erlaubt), true);
  assert.equal(darf("file-write-create", path.join(lauf, "home", "x")), true);
  for (const id of ["regeln", "setup", "nachbar", "projektregeln", "git", "link", "daten"]) assert.equal(darf("file-write-data", t.ziele[id]), false, id);
  assert.equal(darf("file-read-data", path.join(home, ".ssh", "id_ed25519")), false, "Benutzerordner nicht lesbar");
  assert.equal(darf("file-read-data", t.ziele.erlaubt), true);
  // B4/B6: Projekte-Ordner (außer dem eigenen Arbeitsordner), Daten (außer dem Lauf-Ordner), Homebrew-Einstellungen nicht lesbar
  assert.equal(darf("file-read-data", t.ziele.regeln), false); assert.equal(darf("file-read-data", t.ziele.nachbar), false);
  assert.equal(darf("file-read-data", t.ziele.daten), false); assert.equal(darf("file-read-data", path.join(lauf, "home", "x")), true);
  assert.equal(sbplErlaubt(R, "file-read-data", "/opt/homebrew/etc/x.conf"), false); assert.equal(sbplErlaubt(R, "file-read-data", "/usr/local/etc/x"), false);
  // Programmstarts: das Werkzeug, Shells, feste Leseprogramme – kein node, curl, git, python
  assert.equal(darf("process-exec", prog), true);
  assert.equal(sbplErlaubt(R, "process-exec", "/bin/sh"), existsSync("/bin/sh"));   // nur vorhandene Programme stehen im Profil
  for (const p of ["/usr/bin/curl", "/usr/bin/git", "/usr/bin/python3", "/usr/bin/env", "/usr/bin/osascript", path.join(t.ordner, "probe.sh"), echt(process.execPath)]) assert.equal(sbplErlaubt(R, "process-exec", p), false, p);
  assert.ok(!WERKZEUG_PROGRAMME.some((p) => /node|python|curl|git|osascript|open$/.test(p)));
  await rm(b, { recursive: true, force: true });
});
test("macOS-Sperre: nie Benutzerordner, Wurzel oder einen Vorfahren des Lauf-Ordners freigeben (sonst keine Sperre)", async () => {
  const { b, home, t, lauf } = await aufbau();
  // Programm im Daten-Ordner (Vorfahr des Lauf-Ordners) wäre eine Lese-Freigabe für zugriff.token & Co. → keine Sperre
  const imDaten = path.join(b, "kopie", "Daten", "codex"); await writeFile(imDaten, "x");
  assert.equal(await werkzeugSandbox({ werkzeug: "codex", start: { befehl: imDaten, vorne: [] }, ordner: t.ordner, lauf, env: {}, home, art: "macos", quellenEnv: {} }), null);
  assert.equal(await werkzeugSandbox({ werkzeug: "codex", start: { befehl: prog2(home), vorne: [] }, ordner: home, lauf, env: {}, home, art: "macos", quellenEnv: {} }), null);
  assert.equal(await werkzeugSandbox({ werkzeug: "codex", start: { befehl: "/x" }, ordner: t.ordner, lauf, env: {}, home, art: null }), null);
  await rm(b, { recursive: true, force: true });
});
const prog2 = (home) => path.join(home, "prog");

// ---------- Nachbau der Linux-Sperre (bubblewrap: nur eingehängte Ordner sind sichtbar) ----------
function bwrapSicht(args) {
  const m = []; for (let i = 0; i < args.length; i++) {
    if (["--ro-bind-try", "--ro-bind", "--bind"].includes(args[i])) { m.push({ von: args[i + 1], nach: args[i + 2], schreib: args[i] === "--bind" }); i += 2; }
    else if (args[i] === "--tmpfs") { m.push({ nach: args[i + 1], schreib: true, leer: true }); i += 1; }
    else if (args[i] === "--") break;
  }
  return (p) => { let r = null; for (const x of m) if (p === x.nach || p.startsWith(`${x.nach}/`)) r = x; return r; };
}
test("Linux-Sperre (Nachbau): nur Arbeitsordner und Lauf-Ordner beschreibbar, Benutzerordner und Projektordner nicht eingehängt", async () => {
  const { b, home, t, lauf, prog } = await aufbau();
  const s = await werkzeugSandbox({ werkzeug: "gemini-cli", start: { befehl: prog, vorne: [] }, ordner: t.ordner, lauf, env: {}, home, art: "linux", quellenEnv: {} });
  assert.ok(s?.args);
  const sicht = bwrapSicht(s.args);
  assert.equal(sicht(t.ziele.erlaubt)?.schreib, true);
  assert.equal(sicht(path.join(lauf, "home", "x"))?.schreib, true);
  for (const id of ["regeln", "setup", "nachbar", "projektregeln", "git", "daten"]) { const x = sicht(t.ziele[id]); assert.ok(!x || x.leer, `${id}: nicht eingehängt (höchstens leeres tmpfs)`); }
  // Link nach außen: das Ziel (Ordner regeln des Projekts) ist nicht eingehängt
  const x = sicht(t.orte.link); assert.ok(!x || x.leer);
  { const h = sicht(path.join(home, ".ssh", "id_ed25519")); assert.ok(!h || h.leer, "Benutzerordner nicht eingehängt"); }
  assert.ok(s.args.includes("--unshare-all") && s.args.includes("--die-with-parent"));
  await rm(b, { recursive: true, force: true });
});
test("Anmeldung: Kopie im Lauf-Ordner, geprüfte Rückgabe (OpenCode nur bekannte Felder)", async () => {
  assert.equal(opencodeAnmeldungBereinigen(Buffer.from('{"openai":{"type":"oauth","refresh":"r","access":"a","expires":1}}')).toString().includes('"refresh": "r"'), true);
  assert.equal(opencodeAnmeldungBereinigen(Buffer.from('{"x":{"type":"shell","cmd":"rm"}}')), null);
  assert.ok(!opencodeAnmeldungBereinigen(Buffer.from('{"a":{"type":"api","key":"k","boese":"x"}}')).toString().includes("boese"));
  assert.equal(anmeldungBereinigen("opencode-auth.json", Buffer.from("[]")), null);
  const { b, home, t, lauf, prog } = await aufbau();
  const quelle = path.join(home, ".local", "share", "opencode", "auth.json"); await mkdir(path.dirname(quelle), { recursive: true });
  await writeFile(quelle, '{"openai":{"type":"api","key":"alt"}}');
  const s = await werkzeugSandbox({ werkzeug: "opencode", start: { befehl: prog, vorne: [] }, ordner: t.ordner, lauf, env: {}, home, art: "macos", quellenEnv: {} });
  const kopie = path.join(lauf, "home", ".local", "share", "opencode", "auth.json");
  assert.equal(await readFile(kopie, "utf8"), '{"openai":{"type":"api","key":"alt"}}');
  assert.equal(s.env.XDG_DATA_HOME, path.join(lauf, "home", ".local", "share"));
  assert.equal(s.env.HOME, path.join(lauf, "home"));
  await writeFile(kopie, '{"openai":{"type":"api","key":"neu"}}');
  for (const f of s.nachher) await f();
  assert.match(await readFile(quelle, "utf8"), /"neu"/);
  await rm(b, { recursive: true, force: true });
});

// ---------- Sperren-Test: Auswertung auf der echten Platte ----------
test("Sperren-Test-Auswertung: nur der erlaubte Versuch → bestanden; Schreiben über die Verknüpfung oder ein harter Link → durchgefallen", async () => {
  for (const fall of ["gut", "link", "regeln", "hart", "nichts"]) {
    const b = await tmp("cs-wz-test-"); const t = await testAufbauen(b);
    const vorher = await stand(t.basis, t.ordner);
    if (fall !== "nichts") await writeFile(t.ziele.erlaubt, t.token);
    if (fall === "link") await writeFile(t.ziele.link, t.token);
    if (fall === "regeln") await appendFile(t.ziele.regeln, t.token);
    if (fall === "hart") await link(t.ziele.regeln, path.join(t.ordner, "hart.txt"));
    const e = await testAuswerten(t, vorher);
    assert.equal(e.bestanden, fall === "gut", fall);
    if (fall === "link") assert.equal(e.punkte.link, false);
    if (fall === "regeln") assert.equal(e.punkte.regeln, false);
    if (fall === "hart") assert.equal(e.punkte.hart, false);
    if (fall === "nichts") assert.equal(e.punkte.erlaubt, false);
    await rm(b, { recursive: true, force: true });
  }
  assert.equal(TEST_PUNKTE.length, 17); assert.equal(new Set(TEST_PUNKTE.map((x) => x[0])).size, 17);
});
test("Sperren-Test-Prompt nennt genau die acht Versuche", async () => {
  const b = await tmp("cs-wz-p-"); const t = await testAufbauen(b); const p = testPrompt(t);
  for (const id of Object.keys(t.ziele)) if (id !== "erlaubt" && id !== "link") assert.ok(p.includes(t.ziele[id]), id);
  assert.match(p, /aussen\/LINK\.md/); assert.match(p, /erlaubt\.txt/);
  await rm(b, { recursive: true, force: true });
});
test("Ohne wirksame Sperre fällt der Sperren-Test durch (Gegenprobe schreibt überall hin)", async () => {
  const daten = await tmp("cs-wz-daten-"); const pd = await tmp("cs-wz-prog-"); const prog = path.join(pd, "prog"); await writeFile(prog, "x");
  // „Werkzeug“ schreibt nur den erlaubten Versuch (könnte z. B. die verbotenen verweigert haben); die Gegenprobe läuft hier OHNE Sperre
  const run = async (befehl, args, o) => {
    if (args.some((a) => String(a).endsWith("gegenprobe.cjs"))) {   // Gegenprobe: das echte Prüfprogramm, direkt (ohne bwrap)
      const i = args.indexOf("--"); const { execFileSync } = await import("node:child_process");
      try { return { code: 0, aus: execFileSync(args[i + 1], args.slice(i + 2), { cwd: o.cwd, encoding: "utf8" }), err: "" }; } catch (e) { return { code: 1, aus: String(e.stdout || ""), err: "" }; }
    }
    const m = /erlaubt\.txt mit genau diesem Inhalt an: (\S+)/.exec(o.eingabe || ""); if (m) await writeFile(path.join(o.cwd, "erlaubt.txt"), m[1]);
    return { code: 0, aus: '{"response":"FERTIG"}', err: "" };
  };
  const projekte = await tmp("cs-wz-projekte-"); const home = await tmp("cs-wz-home-");
  assert.equal((await sperrenTest({ werkzeug: "opencode", prog: { befehl: prog, vorne: [] }, daten, art: "linux", run, home })).bestanden, false, "ohne Projekte-Ordner kein Test");
  const r = await sperrenTest({ werkzeug: "opencode", prog: { befehl: prog, vorne: [], nodeNoetig: false }, daten, projekte, art: "linux", run, home });
  assert.equal(r.werkzeug, true, "das Werkzeug hat nichts Verbotenes geschrieben");
  assert.equal(r.gegenprobe, false, "ohne Sperre schreibt, startet und liest die Gegenprobe an gesperrten Stellen");
  assert.equal(r.bestanden, false);
  const p = Object.fromEntries(r.punkte.map((x) => [x.id, x.ok]));
  for (const id of ["regeln", "hart", "start_env", "start_skript", "lesen_ssh", "lesen_zugang", "lesen_projekte"]) assert.equal(p[id], false, id);
  assert.equal(r.punkte.length, 17);
  // aufgeräumt: keine Attrappen im Home, in den Daten und im Projekte-Ordner
  const { readdir: rd } = await import("node:fs/promises");
  assert.deepEqual((await rd(home)).filter((n) => n.startsWith(".cs-sperrtest-")), []);
  assert.deepEqual((await rd(projekte)).filter((n) => n.startsWith(".codeschmiede-sperrtest-")), []);
  assert.deepEqual((await rd(daten)).filter((n) => n.startsWith("sperrtest-")), []);
  await rm(projekte, { recursive: true, force: true }); await rm(home, { recursive: true, force: true });
  await rm(daten, { recursive: true, force: true }); await rm(pd, { recursive: true, force: true });
});
test("Gegenprobe-Programm: fester Text, keine Ausführung von Projekt-Inhalten", () => {
  assert.ok(!/eval|Function\(|require\(\s*[a-z]+\s*\+|execSync|shell:\s*true/.test(GEGENPROBE));
  // Programmstarts nur feste Pfade bzw. das eigene Probe-Skript (verbotene Starts als Prüfpunkte)
  const ziele = [...GEGENPROBE.matchAll(/start_[a-z]+:\[([^,\]]+)/g)].map((m) => m[1]);
  assert.deepEqual(ziele, ['"/usr/bin/env"', '"/usr/bin/git"', '"/usr/bin/python3"', '"/usr/bin/osascript"', "skript"]);
});

// ---------- Installation: Lock-Datei, Programmsuche ----------
const lock = (o = {}) => ({ lockfileVersion: 3, packages: { "": { dependencies: { "@openai/codex": "0.166.0" } },
  "node_modules/@openai/codex": { version: "0.166.0", resolved: "https://registry.npmjs.org/@openai/codex/-/codex-0.166.0.tgz", integrity: `sha512-${"A".repeat(86)}==` }, ...o } });
test("Lock-Datei: nur feste Version, nur registry.npmjs.org, nur sha512", () => {
  assert.equal(lockPruefen("codex", lock()).ok, true);
  assert.equal(lockPruefen("codex", lock({ "node_modules/x": { version: "1.0.0", resolved: "https://example.com/x.tgz", integrity: `sha512-${"A".repeat(86)}==` } })).ok, false);
  assert.equal(lockPruefen("codex", lock({ "node_modules/x": { version: "1.0.0", resolved: "https://registry.npmjs.org/x/-/x-1.0.0.tgz", integrity: "sha1-abc" } })).ok, false);
  assert.equal(lockPruefen("codex", lock({ "node_modules/x": { link: true, resolved: "../x" } })).ok, false);
  const falsch = lock(); falsch.packages["node_modules/@openai/codex"].version = "0.165.0"; assert.equal(lockPruefen("codex", falsch).ok, false);
  const zwei = lock(); zwei.packages[""].dependencies.boese = "1.0.0"; assert.equal(lockPruefen("codex", zwei).ok, false);
  assert.equal(lockPruefen("gemini-cli", lock()).ok, false);
});
test("Programmsuche: natives Codex bzw. OpenCode (dann kein node in der Sperre), Gemini als Node-Programm", async () => {
  const d = echt(await tmp("cs-wz-inst-")); const nm = path.join(d, "node_modules");
  const c = path.join(nm, "@openai", "codex"); await mkdir(path.join(c, "bin"), { recursive: true }); await writeFile(path.join(c, "package.json"), '{"bin":{"codex":"bin/codex.js"}}'); await writeFile(path.join(c, "bin", "codex.js"), "");
  // Ablage wie Codex 0.166.0: Plattform-Paket @openai/codex-darwin-arm64, Programm vendor/<ziel>/bin/codex
  const nat = path.join(nm, "@openai", "codex-darwin-arm64", "vendor", "aarch64-apple-darwin", "bin", "codex"); await mkdir(path.dirname(nat), { recursive: true }); await writeFile(nat, "");
  assert.deepEqual(programmIn("codex", d, { plattform: "darwin", arch: "arm64" }), { befehl: nat, vorne: [], nodeNoetig: false, login: null });
  assert.equal(programmIn("codex", d, { plattform: "darwin", arch: "x64" }).nodeNoetig, true);   // kein natives Programm für x64 → Node-Rückfall
  const g = path.join(nm, "@google", "gemini-cli"); await mkdir(path.join(g, "dist"), { recursive: true }); await writeFile(path.join(g, "package.json"), '{"bin":{"gemini":"dist/index.js"}}'); await writeFile(path.join(g, "dist", "index.js"), "");
  assert.deepEqual(programmIn("gemini-cli", d), { befehl: process.execPath, vorne: [path.join(g, "dist", "index.js")], nodeNoetig: true, login: null });
  // OpenCode (@opencode/cli): Start-Link ist ohne postinstall nur ein Platzhalter → nur das Plattform-Paket zählt
  const o = path.join(nm, "@opencode", "cli"); await mkdir(path.join(o, "bin"), { recursive: true }); await writeFile(path.join(o, "package.json"), '{"bin":{"opencode":"./bin/opencode.exe"}}'); await writeFile(path.join(o, "bin", "opencode.exe"), "echo Platzhalter");
  assert.equal(programmIn("opencode", d, { plattform: "darwin", arch: "arm64" }), null, "kein Rückfall auf den Platzhalter");
  const on = path.join(nm, "@opencode", "cli-darwin-arm64", "bin", "opencode"); await mkdir(path.dirname(on), { recursive: true }); await writeFile(on, "");
  const ob = path.join(nm, "@opencode", "cli-darwin-x64-baseline", "bin", "opencode"); await mkdir(path.dirname(ob), { recursive: true }); await writeFile(ob, "");
  assert.deepEqual(programmIn("opencode", d, { plattform: "darwin", arch: "arm64" }), { befehl: on, vorne: [], nodeNoetig: false, login: null });
  assert.equal(programmIn("opencode", d, { plattform: "darwin", arch: "x64" }).befehl, ob);
  // Bin-Eintrag, der aus node_modules hinauszeigt → nicht genommen
  await writeFile(path.join(g, "package.json"), '{"bin":{"gemini":"../../../../x.js"}}'); await writeFile(path.join(d, "x.js"), "");
  assert.equal(programmIn("gemini-cli", d), null);
  await rm(d, { recursive: true, force: true });
});

// ---------- Werkstatt: verpflichtend, kein Einspringen, Admin-PC nie ----------
test("Werkstatt: fremdes Werkzeug nicht bereit → Auftrag wartet (kein Claude), Admin-PC nimmt keine fremden Aufträge, Werkzeug bleibt am Auftrag", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  assert.match(s, /if \(!b\.ok\) \{ await wartetAufMelden\(a, `wartet auf \$\{werkzeugName\(pw\.werkzeug\)\}: \$\{b\.grund\}`\); continue; \}/);
  assert.match(s, /if \(pw\.werkzeug !== "claude-code"\) \{\n\s+if \(cfg\.admin\) continue;/);
  assert.match(s, /const werkzeug = auftrag\.hand \? "claude-code" : werkzeugOk\(auftrag\.werkzeug\) \? auftrag\.werkzeug : "claude-code";/);
  assert.match(s, /if \(cfg\.admin\) throw new Error\("Der Admin-PC programmiert nie mit fremden Werkzeugen"\)/);
  assert.ok(!/ersatzBau|codexBauen/.test(s), "der alte Ersatz-Bau ist entfernt");
  // nach dem Lauf: Git-/Link-Prüfung vor dem eigenen git, gesperrte Dateien → alles verworfen
  const bau = s.slice(s.indexOf("async function werkzeugBau"), s.indexOf("// ---------- Bauen & Tests ----------"));
  assert.ok(bau.indexOf("await nachLaufPruefen(projekt, ordner)") < bau.indexOf('gitRoh(ordner, "status"'));
  assert.match(bau, /filter\(dateiGesperrt\)/); assert.match(bau, /projektKonfigFunde\(ordner\)/);
});

// ---------- B8: Installation – leere Benutzer- und globale npm-Konfiguration, Lock-Datei und Programm-Prüfsumme ----------
test("Installation: npm ci ohne Skripte mit leerer user- und globalconfig; danach Lock = mitgeliefert und Programm-Prüfsumme gemerkt", async () => {
  const daten = await tmp("cs-wz-inst-");
  const quelle = lockQuelle("codex");
  const schon = await readFile(quelle, "utf8").catch(() => null);
  if (!schon) { await mkdir(path.dirname(quelle), { recursive: true }); await writeFile(quelle, JSON.stringify(lock())); }
  let aufruf = null;
  const run = async (befehl, args, o) => {   // „npm ci“ nachgestellt: legt das Paket mit nativem Programm an, Lock bleibt
    aufruf = args;
    const c = path.join(o.cwd, "node_modules", "@openai", "codex"); await mkdir(path.join(c, "bin"), { recursive: true });
    await writeFile(path.join(c, "package.json"), JSON.stringify({ version: "0.166.0", bin: { codex: "bin/codex.js" } })); await writeFile(path.join(c, "bin", "codex.js"), "// codex");
    return { code: 0, aus: "", err: "" };
  };
  try {
    await installieren("codex", { daten, plattform: "darwin", run });
    for (const a of ["ci", "--ignore-scripts"]) assert.ok(aufruf.includes(a), a);
    assert.ok(aufruf.some((a) => a.startsWith("--userconfig=")) && aufruf.some((a) => a.startsWith("--globalconfig=")) && aufruf.includes("--registry=https://registry.npmjs.org/"));
    const uc = aufruf.find((a) => a.startsWith("--userconfig=")).slice(13); const gc = aufruf.find((a) => a.startsWith("--globalconfig=")).slice(15);
    assert.notEqual(uc, gc, "zwei getrennte leere Dateien (npm lehnt dieselbe doppelt ab)");
    const ok = await installiertPruefen("codex", { daten });
    assert.equal(ok.ok, true); assert.match(ok.programmSha, /^[0-9a-f]{64}:[0-9a-f]{64}$/);
    // Ganzer Ordner direkt vor dem Start (ohne Zwischenspeicher): unverändert → ok; zusätzliche Datei oder Verknüpfung → wartet
    const dir = installOrdner(daten, "codex");
    assert.equal((await installationUnveraendert("codex", { daten })).ok, true);
    assert.ok(!existsSync(path.join(dir, ".npmrc-leer-benutzer")) && !existsSync(path.join(dir, ".npmrc-leer-global")), "leere npm-Konfiguration aufgeräumt");
    await writeFile(path.join(dir, "node_modules", "neu.js"), "x");
    const u = await installationUnveraendert("codex", { daten }); assert.equal(u.ok, false); assert.equal(u.grund, INSTALLATION_VERAENDERT);
    await rm(path.join(dir, "node_modules", "neu.js"));
    assert.equal((await installationUnveraendert("codex", { daten })).ok, true);
    await symlink("/etc", path.join(dir, "node_modules", "verweis"));
    assert.equal((await installationUnveraendert("codex", { daten })).ok, false, "Verknüpfung zählt (nicht gefolgt)");
    await rm(path.join(dir, "node_modules", "verweis"));
    // gleiche Größe und Zeit, anderer Inhalt: ohne Zwischenspeicher trotzdem erkannt
    const f = path.join(dir, "node_modules", "@openai", "codex", "package.json"); const alt = await readFile(f, "utf8");
    const { utimes, stat: st } = await import("node:fs/promises"); const t0 = await st(f);
    await writeFile(f, alt.replace("0.166.0", "0.166.9")); await utimes(f, t0.atime, t0.mtime);
    assert.equal((await installationUnveraendert("codex", { daten })).ok, false);
    await writeFile(f, alt); await utimes(f, t0.atime, t0.mtime);
    assert.equal((await ordnerManifest(dir)).anzahl > 3, true);
    // Programm verändert → nicht mehr in Ordnung
    await writeFile(path.join(installOrdner(daten, "codex"), "node_modules", "@openai", "codex", "bin", "codex.js"), "// anders");
    assert.equal((await installiertPruefen("codex", { daten })).ok, false);
    // Lock-Datei verändert → nicht mehr in Ordnung
    await writeFile(path.join(installOrdner(daten, "codex"), "node_modules", "@openai", "codex", "bin", "codex.js"), "// codex");
    const l = JSON.parse(await readFile(path.join(installOrdner(daten, "codex"), "package-lock.json"), "utf8")); l.packages["node_modules/@openai/codex"].integrity = `sha512-${"B".repeat(86)}==`;
    await writeFile(path.join(installOrdner(daten, "codex"), "package-lock.json"), JSON.stringify(l));
    assert.equal((await installiertPruefen("codex", { daten })).ok, false);
    assert.ok(existsSync(path.join(installOrdner(daten, "codex"), PRUEFSUMME)));
  } finally {
    if (!schon) await rm(path.dirname(quelle), { recursive: true, force: true });
    await rm(daten, { recursive: true, force: true });
  }
});
test("Nachweis des Sperren-Tests (B4): Version, Sperre/Einstellungen, Programm und Codeschmiede-Version müssen gleich sein", async () => {
  const n = await sperrNachweis("codex", { programmSha: "a".repeat(64) });
  assert.equal(n.version, WERKZEUGE.codex.version); assert.match(n.profil, /^[0-9a-f]{64}$/); assert.match(n.cs, /^\d+\.\d+\.\d+$/);
  assert.equal(nachweisGleich(n, { ...n }), true);
  for (const k of ["version", "profil", "programm", "cs"]) assert.equal(nachweisGleich(n, { ...n, [k]: "anders" }), false, k);
  assert.equal(nachweisGleich(n, null), false); assert.equal(nachweisGleich({ ...n, programm: null }, { ...n, programm: null }), false);
});
test("Werkstatt (B9/B10): ohne Zeile „bauen“ wartet der Auftrag, Live-Log der Werkzeuge läuft durch den Geheimnis-Filter", async () => {
  const s = await readFile(new URL("../index.mjs", import.meta.url), "utf8");
  assert.match(s, /if \(!data\) return \{ fehlt:/);
  const f = s.slice(s.indexOf("function werkzeugLogZeile"), s.indexOf("async function werkzeugBau"));
  assert.match(f, /ohneGeheimnisse\(t\)/); assert.ok(!/log\(auftragId, "info", `Führt aus/.test(f));
  assert.match(s, /nachweisGleich\(t\.nachweis, nachweis\)/);
});

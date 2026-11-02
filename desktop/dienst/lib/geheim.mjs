// Entfernt Geheimnisse aus Texten, bevor sie ins Live-Log oder in Erlaubnis-Anfragen gehen (AGENTS.md: keine Geheimnisse in Logs).
const MUSTER = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,                       // Anthropic-Schlüssel
  /gh[pousr]_[A-Za-z0-9]{20,}/g,                      // GitHub-Token
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sbp_[A-Za-z0-9]{20,}/g,                            // Supabase-Zugangstoken
  /sb_secret_[A-Za-z0-9_-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /AKIA[0-9A-Z]{16}/g,                                // AWS
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/g,   // Stripe
  /(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,                  // OpenAI u. Ä.
  /Bearer\s+[A-Za-z0-9._~+\/-]{16,}=*/g,
];
/** Bearer-Token (gleiches Muster wie oben, für die Geheimnis-Prüfung beim Einlesen wiederverwendet). */
export const BEARER = MUSTER.at(-1);
// Zugangsdaten in Adressen (postgres://name:passwort@…) – Name bleibt, Passwort fällt weg
const URL_PASSWORT = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:)[^\s@\/]+@/gi;
// NAME = wert, auch mit Unterstrich/Bindestrich davor/danach und mit Namen in Anführungszeichen
// (GITHUB_TOKEN=…, SUPABASE_SERVICE_ROLE_KEY: "…", password = "a b c", {"password": "…"}).
// Namensteile sind begrenzt, damit lange Buchstabenketten den Dienst nicht ausbremsen (Prüfung 2026-10-24).
// Seit 0.15.0 (Nachprüfung N1/N3): optionale Typangabe vor dem „=“ (TypeScript „apiKey: string = …“, Kotlin „val password: String = …“),
// Go „:=“, Namen mit „_key“/„-key“ (SUPABASE_SERVICE_KEY, OPENAI_KEY), Werte in Backticks ohne „${“.
const Z_NAME = String.raw`[A-Za-z0-9_-]{0,40}(?:pass(?:wort|word)?|pwd?(?![a-z])|secret|token|api[_-]?key|apikey|private[_-]?key|service[_-]?role[_-]?key|credential|(?:db|master|encryption|signing|secret|private)[_-]?key|app[_-]?secret|[_-]key(?![a-z]))[A-Za-z0-9_-]{0,120}`;
const Z_TRENNER = String.raw`((?:\s*:\s*[A-Za-z_][\w.]{0,40}(?:<[^<>\n]{0,40}>)?(?:\[\])?\??)?\s*(?::=|[:=])\s*)`;
const ZUWEISUNG = new RegExp(String.raw`((?:\\?["'])?)(${Z_NAME})\1${Z_TRENNER}(\\?"[^"\n]{4,}"|\\?'[^'\n]{4,}'|` + "`(?:(?!\\$\\{)[^`\\n]){4,}`" + String.raw`|\$\{(?:[^{}\n]|\$\{[^{}\n]*\})*\}|[^\s"'&` + "`" + String.raw`]{4,})`, "gi");
// Fest eingetragener Ersatzwert: process.env.PW || "…", env.KEY ?? '…', $x ?: "…" (N1)
const ERSATZWERT = new RegExp(String.raw`((?:\\?["'])?)(${Z_NAME})\1${Z_TRENNER}([^\n;]{0,160}?(?:\|\||\?\?|\?:|\sor\s)\s*)(["'` + "`" + String.raw`])([^"'` + "`" + String.raw`\n]{4,})\5`, "gi");
// … auch, wenn der Name rechts steht: process.env.DB_PASSWORD ?? "…", config["api_key"] || '…'
const ERSATZ_NACH = new RegExp(String.raw`(?<![A-Za-z0-9])(${Z_NAME})["'\])]{0,2}\s*(?:\|\||\?\?|\?:|\sor\s)\s*(["'` + "`" + String.raw`])([^"'` + "`" + String.raw`\n]{4,})\2`, "gi");
// Standardwert beim Lesen einer Umgebungsvariablen (3. Nachprüfung B2): getenv("X", "…"), os.getenv, os.environ.get, PHP env("X", "…"),
// Ruby ENV.fetch("X", "…") – geprüft wird der Standardwert unter dem Namen der Zuweisung bzw. der Variablen
const ENV_STANDARD = new RegExp(String.raw`(?:(?<![A-Za-z0-9])(${Z_NAME})["'\]]{0,2}${Z_TRENNER})?(?:os\.getenv|getenv|os\.environ\.get|ENV\.fetch|env)\(\s*(["'])([A-Za-z_][\w.-]{0,80})\3\s*,\s*(?:default\s*=\s*)?(["'` + "`" + String.raw`])([^"'` + "`" + String.raw`\n]{1,200})\5`, "gi");
const NAME_GANZ = new RegExp(String.raw`^${Z_NAME}$`, "i");
// PHP: define('DB_PASSWORD', '…') (N3)
const PHP_DEFINE = /define\(\s*(["'])([A-Z0-9_]*(?:PASSWORD|PASSWD|PASS|PWD|SECRET|KEY|TOKEN|SALT)[A-Z0-9_]*)\1\s*,\s*(["'])([^"'\n]{4,})\3/gi;
// Reine Schalterwerte sind keine Geheimnisse (persist-credentials: false; fetch credentials: "omit").
// Der GANZE Wert muss das Schalterwort sein – höchstens ein Satzzeichen danach (false, / false;) –, sonst wird maskiert.
const SCHALTER = /^(?:true|false|null)$/i;
const ABRUF = /^(?:omit|include|same-origin)$/i;
function nurSchalter(name, wert) {
  let w = wert.replace(/^\\(["'])(.*)\\\1$/, "$1$2$1");
  if (/^(["']).*\1$/.test(w)) w = w.slice(1, -1);
  else w = w.replace(/[,;})\]`]$/, "");
  return SCHALTER.test(w) || (/credentials$/i.test(name) && ABRUF.test(w));
}

export function ohneGeheimnisse(text) {
  if (text == null) return text;
  let s = String(text);
  for (const m of MUSTER) s = s.replace(m, "[entfernt]");
  s = s.replace(URL_PASSWORT, "$1[entfernt]@");
  // Standard- und Ersatzwerte nur ersetzen, wenn sie nach derselben Regel wie beim Zählen ein Geheimnis sind (4. Nachprüfung N4: localhost, 3000 bleiben)
  s = s.replace(ENV_STANDARD, (alles, k, z, q1, v, q2, w) => {
    const name = [k, v].find((x) => x && NAME_GANZ.test(x));
    return name && wertZaehlt(name, w, false) ? alles.slice(0, alles.length - w.length - 1) + `[entfernt]${q2}` : alles;
  });
  s = s.replace(ZUWEISUNG, (alles, q, k, z, w) => (nurSchalter(k, w) || (w.startsWith("${") && !wertZaehlt(k, w, false)) ? alles : `${q}${k}${q}${z}[entfernt]`));
  s = s.replace(ERSATZWERT, (alles, q, k, z, vor, a, w) => (wertZaehlt(k, w, false) ? `${q}${k}${q}${z}${vor}${a}[entfernt]${a}` : alles));
  s = s.replace(ERSATZ_NACH, (alles, k, a, w) => (wertZaehlt(k, w, false) ? alles.slice(0, alles.lastIndexOf(a, alles.length - 2) + 1) + `[entfernt]${a}` : alles));
  s = s.replace(PHP_DEFINE, (alles, a, k, b) => `define(${a}${k}${a}, ${b}[entfernt]${b}`);
  return s;
}

// Code-Dateien: nur Zuweisungen mit wörtlichem Text zählen („token = getToken()“ ist kein Geheimnis); Platzhalter zählen nicht
const CODE_DATEI = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|go|rs|java|kt|cs|php|dart|swift|c|cc|cpp|h|hpp)$/i;
// Platzhalter zählen nur, wenn der GANZE Wert einer ist (2. Nachprüfung, Punkt 6); $VAR/%VAR% nur in Großschreibung (N4: „$Ecret…“ zählt)
const PLATZHALTER_GANZ = /^(?:<[^<>]+>|x+|\*+|\.\.\.|changeme|example|dummy|test|placeholder|\[entfernt\])$/i;
const PLATZHALTER_YOUR = /^(?:your|YOUR)[_-][a-z_-]+$|^YOUR[_-][A-Z_-]+$/;   // your-password, YOUR_TOKEN – nicht „your-password-is-Sommer2024“
// ${VAR:-wert} / ${VAR-wert} / ${VAR:=wert} sind KEINE Platzhalter – der Standardwert wird geprüft (B2)
const SHELL_STANDARD = /^\$\{[A-Za-z_]\w*:?[-=](.*)\}$/s;
// ${VAR:?Meldung} / ${VAR?Meldung}: Fehlermeldung, wenn die Variable fehlt – kein Standardwert (4. Nachprüfung N1)
const SHELL_PFLICHT = /^\$\{[A-Za-z_]\w*:?\?.*\}$/s;
const PLATZHALTER_GROSS = /^(?:\$\{[^{}]*\}|\{\{[^{}]*\}\}|\$[A-Z_][A-Z0-9_]*|%[A-Z_][A-Z0-9_]*%?)$/;
// Verweis auf eine Umgebungsvariable als ganzer Wert (kein Geheimnis): process.env.X, import.meta.env.X, os.environ["X"], env("X"), getenv("X")
// (ohne Anführungszeichen endet der erkannte Wert vor dem ersten Anführungszeichen: „os.environ[“, „getenv(“ – auch das ist nur ein Verweis)
const UMGEBUNG = /^(?:(?:process\.env|import\.meta\.env|os\.environ)(?:\.[A-Za-z_]\w*|\[["'][A-Za-z_]\w*["']\])|(?:env|getenv|os\.getenv)\(\s*["']?[A-Za-z_]\w*["']?\s*\)|os\.environ\[|(?:os\.)?getenv\(|env\()$/;
const STARK = /pass|pwd?(?![a-z])|secret|api[_-]?key|apikey|private[_-]?key|service[_-]?role|credential|token/i;
// Starke Schlüssel-Namen: zählen schon ab 8 Zeichen, auch reine Ziffern (Punkt 4)
const STARK_SCHLUESSEL = /(db|master|encryption|signing|secret|private)[_-]?key|app[_-]?secret/i;
// Öffentliche Namen nur als ganzer Namensteil (Punkt 3): ANON_KEY, anonKey, supabaseAnonKey, PUBLISHABLE_KEY, publicKey, PK_… – nicht „canonical“
const OEFFENTLICH_TEIL = /(^|[_-])(anon|publishable|public|pk)([_-]|$)|(^|[_-])site[_-]?key([_-]|$)/i;
const OEFFENTLICH_CAMEL = /(^(anon|publishable|public|pk)(?=[A-Z0-9]))|([a-z0-9](Anon|Publishable|Public)(?=[A-Z0-9]|$))|siteKey/;
// … aber nie, wenn der Name zusätzlich etwas Geheimes nennt (NEXT_PUBLIC_API_TOKEN, VITE_PUBLIC_API_KEY, PK_TOKEN zählen)
const GEGENLISTE = /pass|pwd|secret|service[_-]?role|private|token|api[_-]?key|apikey/i;
// Beschriftungen (UI-Text) erkennt man an Leerzeichen UND einem Beschriftungswort (Punkt 1)
const BESCHRIFTUNG = /(^|[^\p{L}])(eingeben|enter|your|bitte|feld|eingabe|type|please|here|hier|ihr|ihre|dein|deine|neues|new|confirm|bestätigen|wiederholen|repeat|vergessen|forgot|anzeigen|show|ändern|change|zurücksetzen|reset|mindestens|least|zeichen|characters|ungültig|invalid|falsch|wrong|erforderlich|required|zu kurz|zu lang|too short|too long|kopiert|copied|geändert|changed|abgelaufen|expired|fehlt|missing|erfolgreich|successfully)([^\p{L}]|$)/iu;
// Name einer Beschriftung statt eines Werts: passwordLabel, password_placeholder, secretHint …
const BESCHRIFTUNG_NAME = /(label|placeholder|hint|title|text|message|msg|error|tooltip|caption|strength|question|expired|tooshort|toolong|mismatch|button|heading|description|help|info|warning|success)$/i;
// Übersetzungs- und Text-Dateien: hier gilt die Beschriftungs-Ausnahme wie in Code (4. Nachprüfung N1) – nicht für .ini und .env*
// Nur echte Übersetzungsdateien (5. Nachprüfung V2): .po/.pot/.arb/.xliff/.xlf/.resx, messages*.properties, und .json/.yaml/.yml unter einem
// Sprach-Ordner (locales, locale, i18n, lang, langs, translations, l10n) oder mit Sprach-Dateinamen (de.json, en-US.yml, de_AT.yaml) –
// nie docker-compose*, application*, config*, settings*, secrets*, values*
const UI_DATEI = /\.(po|pot|arb|xliff|xlf|resx)$/i;
export function uebersetzungsDatei(rel) {
  const teile = String(rel || "").replace(/\\/g, "/").split("/"); const datei = teile.at(-1) || "";
  if (/^(docker-compose|compose|application|config|settings|secrets?|values)([._-]|$)/i.test(datei) || /^\.env/i.test(datei)) return false;
  if (UI_DATEI.test(datei)) return true;
  if (/^messages([._-][\w-]+)?\.properties$/i.test(datei)) return true;
  if (!/\.(json|ya?ml)$/i.test(datei)) return false;
  if (/^[a-z]{2}([_-][A-Za-z]{2,4})?\.(json|ya?ml)$/.test(datei)) return true;   // de.json, en-US.yml, de_AT.yaml
  return teile.slice(0, -1).some((t) => /^(locales?|i18n|langs?|translations?|l10n)$/i.test(t));
}
// Übersetzung genau des Begriffs (nur in UI-Dateien): {"password": "Passwort"}, {"apiKey": "API key"}
const BEGRIFF = /^(passwort|password|kennwort|mot de passe|contraseña|token|secret|geheimnis|schlüssel|key|api[ -]?key|api[ -]?schlüssel|zugangsdaten|credentials?)$/i;
// Namen für Pfade, Adressen, Bezeichner und Speicher-Schlüssel (tokenUrl, passwordResetPath, TOKEN_STORAGE_KEY, passwordInputId, secretName, tokenType)
const VERWEIS_NAME = /(url|uri|path|route|endpoint|id|name|type|storage[_-]?key|field|header|param|cookie|prefix|event|column|table)$/i;
// Sieht ein Teil wie ein Schlüssel aus? (≥ 16 Hex-Zeichen am Stück, oder ≥ 12 Zeichen aus Ziffern UND Buchstaben gemischt) – 5. Nachprüfung V1
const SCHLUESSEL_TEIL = (t) => /[0-9a-f]{16,}/i.test(t) || t.split(/[^A-Za-z0-9]+/).some((x) => x.length >= 12 && /\d/.test(x) && /[A-Za-z]/.test(x));
const HEIKLER_PARAMETER = /^(token|key|api[_-]?key|secret|sig|signature|password|passwd|pwd|auth|access[_-]?token|client[_-]?secret|code)$/i;
/** Wie Adresse/Pfad/Bezeichner/Speicher-Schlüssel – aber nie mit Schlüssel-Teilen, heiklen Abfrage-Parametern oder Zugangsdaten (V1). */
function VERWEIS_WERT(w, name) {
  if (SCHLUESSEL_TEIL(w)) return false;
  if (/^https?:\/\//i.test(w)) {
    let u; try { u = new URL(w); } catch { return false; }
    if (u.username || u.password) return false;
    if ([...u.searchParams.keys()].some((k) => HEIKLER_PARAMETER.test(k))) return false;
    return /^https?:\/\/[^\s@]+$/i.test(w);
  }
  if (/^\/[\w./:-]*$/.test(w)) return true;
  if (w.length > 40) return false;
  if (/^[a-z][a-z0-9]*(?:[._:\/-][a-z0-9]+)+$/.test(w)) return true;
  // Ein einzelnes Wort ohne Trennzeichen: nicht bei …Id/…Header/…Cookie/…Param (dort sind solche Werte oft selbst der Schlüssel)
  if (/^[a-z][a-z0-9]*$/.test(w)) return !/(id|header|cookie|param)$/i.test(name);
  return /^[a-z][a-z0-9_]*$/.test(w);
}
const istJwt = (w) => /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(w);
const jwtRolle = (w) => { try { return JSON.parse(Buffer.from(w.split(".")[1], "base64url").toString("utf8"))?.role ?? null; } catch { return null; } };
/**
 * Sieht ein Wert nach Geheimnis aus? Untergrenze 6 Zeichen (starke Schlüssel-Namen 8, schwache Namen wie *_key 16 mit Buchstaben und Ziffern).
 * Nicht gezählt werden: ganze Platzhalter, Verweise auf Umgebungsvariablen, anon-JWTs, öffentliche Namen ohne geheimen Namensteil, Beschriftungen
 * (Leerzeichen + Beschriftungswort, bzw. Name endet auf Label/Placeholder/…).
 */
function wertZaehlt(name, roh, ui) {   // ui = "code" (Code-Datei) | "text" (Übersetzungs-/Text-Datei) | false
  const w = String(roh).trim();
  if (SHELL_PFLICHT.test(w)) return false;
  const standard = SHELL_STANDARD.exec(w);
  if (standard) return standard[1].length > 0 && wertZaehlt(name, standard[1].replace(/^(["'])(.*)\1$/s, "$2"), ui);
  if (PLATZHALTER_GANZ.test(w) || PLATZHALTER_YOUR.test(w) || PLATZHALTER_GROSS.test(w) || UMGEBUNG.test(w)) return false;
  if (istJwt(w)) return jwtRolle(w) !== "anon" && (STARK.test(name) || STARK_SCHLUESSEL.test(name));   // nur der öffentliche anon-JWT ist ausgenommen
  // Öffentlich nur ohne geheimen Namensteil – auch starke Schlüssel-Namen heben das auf (B3: pk_signing_key, public_db_key zählen)
  if ((OEFFENTLICH_TEIL.test(name) || OEFFENTLICH_CAMEL.test(name)) && !GEGENLISTE.test(name) && !STARK_SCHLUESSEL.test(name)) return false;
  // Pfad, Adresse, Bezeichner oder Speicher-Schlüssel unter einem passenden Namen (…Url, …Path, …Id, …Name, …_STORAGE_KEY) ist kein Geheimnis
  if (VERWEIS_NAME.test(name) && VERWEIS_WERT(w, name)) return false;
  // Beschriftungs-Name (passwordLabel …) nur in Code-/Übersetzungs-Dateien und nur, wenn der Wert wie UI-Text aussieht (B1): nur Buchstaben,
  // Leerzeichen und Satzzeichen – mit Leerzeichen auch Ziffern („Passwort zu kurz (min. 8)“) – oder mit Beschriftungswort.
  // Ohne Leerzeichen mit Ziffern/Sonderzeichen zählt es: „Xk9!mQ2pLz“, „Pillersee77“, „Sommer2024!“.
  // Mit Ziffern nur zusammen mit einem Beschriftungswort (V3): „Passwort zu kurz (min. 8)“ ja, „Sommer 2024!“ / „Pillersee 77“ nein
  const uiText = /^[\p{L} .,:;!?()'’-]+$/u.test(w) || (/\s/.test(w) && /^[\p{L}\d .,:;!?()'’+-]+$/u.test(w) && BESCHRIFTUNG.test(w));
  if (ui && BESCHRIFTUNG_NAME.test(name) && (uiText || BESCHRIFTUNG.test(w))) return false;
  if (ui === "text" && BEGRIFF.test(w)) return false;   // nur in Übersetzungs-Dateien: Übersetzung genau des Begriffs ist eine Beschriftung
  if (/\s/.test(w) && BESCHRIFTUNG.test(w)) return false;
  if (STARK_SCHLUESSEL.test(name)) return w.length >= 8;
  if (!STARK.test(name)) return w.length >= 16 && !/\s/.test(w) && /[A-Za-z]/.test(w) && /\d/.test(w);
  return w.length >= 6;
}
/**
 * Anzahl der Zuweisungen password/secret/token/api_key/*_key … = „Wert“ (gleiche Muster wie ohneGeheimnisse, Einlesen 0.15.0): mit Typangabe,
 * Go „:=“, Backtick-Text ohne „${“, fester Ersatzwert nach ||/??/?: und PHP define(). Schalterwerte und Platzhalter zählen nicht; in Code-Dateien (rel)
 * nur Werte in Anführungszeichen/Backticks.
 */
export function zuweisungenZaehlen(text, rel = "") {
  const datei = String(rel).split("/").pop();
  let n = 0; const code = CODE_DATEI.test(datei); const t = String(text || "");
  const ui = code ? "code" : uebersetzungsDatei(rel) ? "text" : false;
  for (const m of t.matchAll(ZUWEISUNG)) {
    const [, , k, , w] = m;
    if (nurSchalter(k, w)) continue;
    const zitiert = /^\\?["'`]/.test(w);
    if (code && !zitiert) continue;
    if (wertZaehlt(k, w.replace(/^\\?["'`]|\\?["'`]$/g, ""), ui)) n++;
  }
  const ersatz = new Set();
  for (const m of t.matchAll(ERSATZWERT)) if (wertZaehlt(m[2], m[6], ui)) { n++; ersatz.add(m.index + m[0].length); }
  for (const m of t.matchAll(ERSATZ_NACH)) if (!ersatz.has(m.index + m[0].length) && wertZaehlt(m[1], m[3], ui)) n++;
  for (const m of t.matchAll(ENV_STANDARD)) {
    const k = [m[1], m[4]].find((x) => x && NAME_GANZ.test(x));
    if (k && wertZaehlt(k, m[6], ui)) n++;
  }
  for (const m of t.matchAll(PHP_DEFINE)) if (wertZaehlt("secret", m[4], false)) n++;   // Konstanten …PASSWORD/SECRET/KEY/TOKEN/SALT sind immer geheim
  return n;
}

export function kuerzen(text, max = 1500) {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Dateien, von denen nie ein Ausschnitt ins Live-Log geht
export function heikleDatei(name) {
  const b = String(name || "").split(/[\\/]/).pop().toLowerCase();
  return /^\.env/.test(b) || /\.(pem|key|p12|pfx)$/.test(b) || /^credentials/.test(b) || b === "zugriff.token" || /^id_(rsa|ed25519|ecdsa)/.test(b);
}

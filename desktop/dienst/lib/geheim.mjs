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
const Z_NAME = String.raw`[A-Za-z0-9_-]{0,40}(?:pass(?:wort|word)?|pwd?(?![a-z])|secret|token|api[_-]?key|apikey|private[_-]?key|service[_-]?role[_-]?key|credential|[_-]key(?![a-z]))[A-Za-z0-9_-]{0,120}`;
const Z_TRENNER = String.raw`((?:\s*:\s*[A-Za-z_][\w.]{0,40}(?:<[^<>\n]{0,40}>)?(?:\[\])?\??)?\s*(?::=|[:=])\s*)`;
const ZUWEISUNG = new RegExp(String.raw`((?:\\?["'])?)(${Z_NAME})\1${Z_TRENNER}(\\?"[^"\n]{4,}"|\\?'[^'\n]{4,}'|` + "`(?:(?!\\$\\{)[^`\\n]){4,}`" + String.raw`|[^\s"'&` + "`" + String.raw`]{4,})`, "gi");
// Fest eingetragener Ersatzwert: process.env.PW || "…", env.KEY ?? '…', $x ?: "…" (N1)
const ERSATZWERT = new RegExp(String.raw`((?:\\?["'])?)(${Z_NAME})\1${Z_TRENNER}([^\n;]{0,160}?(?:\|\||\?\?|\?:)\s*)(["'` + "`" + String.raw`])([^"'` + "`" + String.raw`\n]{4,})\5`, "gi");
// … auch, wenn der Name rechts steht: process.env.DB_PASSWORD ?? "…", config["api_key"] || '…'
const ERSATZ_NACH = new RegExp(String.raw`(?<![A-Za-z0-9])(${Z_NAME})["'\]]{0,2}\s*(?:\|\||\?\?|\?:)\s*(["'` + "`" + String.raw`])([^"'` + "`" + String.raw`\n]{4,})\2`, "gi");
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
  s = s.replace(ZUWEISUNG, (alles, q, k, z, w) => (nurSchalter(k, w) ? alles : `${q}${k}${q}${z}[entfernt]`));
  s = s.replace(ERSATZWERT, (alles, q, k, z, vor, a) => `${q}${k}${q}${z}${vor}${a}[entfernt]${a}`);
  s = s.replace(ERSATZ_NACH, (alles, k, a) => alles.slice(0, alles.lastIndexOf(a, alles.length - 2) + 1) + `[entfernt]${a}`);
  s = s.replace(PHP_DEFINE, (alles, a, k, b) => `define(${a}${k}${a}, ${b}[entfernt]${b}`);
  return s;
}

// Code-Dateien: nur Zuweisungen mit wörtlichem Text zählen („token = getToken()“ ist kein Geheimnis); Platzhalter zählen nicht
const CODE_DATEI = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|go|rs|java|kt|cs|php|dart|swift|c|cc|cpp|h|hpp)$/i;
// Platzhalter: $VAR/%VAR% nur in Großschreibung (N4 – ein Passwort wie „$Ecret…“ zählt), Rest ohne Rücksicht auf Groß/Klein
const PLATZHALTER_GROSS = /^(?:\$\{|\{\{|\$[A-Z_][A-Z0-9_]*$|%[A-Z_][A-Z0-9_]*%?$)/;
const PLATZHALTER = /^(?:<|process\.env|import\.meta|os\.environ|env\(|getenv|your[_-]|xxx|\*{3}|changeme|example|placeholder|dummy|\[entfernt\])/i;
const STARK = /pass|pwd?(?![a-z])|secret|api[_-]?key|apikey|private[_-]?key|service[_-]?role|credential|token/i;
/** Sieht ein Wert nach Geheimnis aus? Code: Beschriftungen aus reinen Wörtern („Passwort eingeben“) zählen nicht; schwache Namen (*_key) nur bei langen Zufallswerten. */
function wertZaehlt(name, roh, code) {
  if (roh.length < 6 || PLATZHALTER_GROSS.test(roh) || PLATZHALTER.test(roh)) return false;
  // JWTs entscheidet die Rollen-Prüfung (anon ist öffentlich); öffentliche Schlüssel (anon, publishable, public) sind keine Geheimnisse
  if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(roh)) return false;
  if (/anon|publishable|public|site[_-]?key|(^|[_-])pk([_-]|$)/i.test(name) && !/pass|pwd|secret|service[_-]?role|private/i.test(name)) return false;
  if (!STARK.test(name)) return roh.length >= 16 && !/\s/.test(roh) && /[A-Za-z]/.test(roh) && /\d/.test(roh);
  if (code && /^[\p{L} .,:;!?()'’-]+$/u.test(roh) && roh.length < 16) return false;
  if (code && /\s/.test(roh) && /^[\p{L} .,:;!?()'’-]+$/u.test(roh)) return false;
  return true;
}
/**
 * Anzahl der Zuweisungen password/secret/token/api_key/*_key … = „Wert“ (gleiche Muster wie ohneGeheimnisse, Einlesen 0.15.0): mit Typangabe,
 * Go „:=“, Backtick-Text ohne „${“, fester Ersatzwert nach ||/??/?: und PHP define(). Schalterwerte und Platzhalter zählen nicht; in Code-Dateien (rel)
 * nur Werte in Anführungszeichen/Backticks.
 */
export function zuweisungenZaehlen(text, rel = "") {
  let n = 0; const code = CODE_DATEI.test(String(rel)); const t = String(text || "");
  for (const m of t.matchAll(ZUWEISUNG)) {
    const [, , k, , w] = m;
    if (nurSchalter(k, w)) continue;
    const zitiert = /^\\?["'`]/.test(w);
    if (code && !zitiert) continue;
    if (wertZaehlt(k, w.replace(/^\\?["'`]|\\?["'`]$/g, ""), code)) n++;
  }
  const ersatz = new Set();
  for (const m of t.matchAll(ERSATZWERT)) if (wertZaehlt(m[2], m[6], code)) { n++; ersatz.add(m.index + m[0].length); }
  for (const m of t.matchAll(ERSATZ_NACH)) if (!ersatz.has(m.index + m[0].length) && wertZaehlt(m[1], m[3], code)) n++;
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

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
// Zugangsdaten in Adressen (postgres://name:passwort@…) – Name bleibt, Passwort fällt weg
const URL_PASSWORT = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:)[^\s@\/]+@/gi;
// NAME = wert, auch mit Unterstrich/Bindestrich davor/danach und mit Namen in Anführungszeichen
// (GITHUB_TOKEN=…, SUPABASE_SERVICE_ROLE_KEY: "…", password = "a b c", {"password": "…"}).
// Namensteile sind begrenzt, damit lange Buchstabenketten den Dienst nicht ausbremsen (Prüfung 2026-10-24).
const ZUWEISUNG = /((?:\\?["'])?)([A-Za-z0-9_-]{0,40}(?:pass(?:wort|word)?|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|service[_-]?role[_-]?key|credential)[A-Za-z0-9_-]{0,120})\1(\s*[:=]\s*)(\\?"[^"\n]{4,}"|\\?'[^'\n]{4,}'|[^\s"'&]{4,})/gi;
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
  return s;
}

// Code-Dateien: nur Zuweisungen mit wörtlichem Text zählen („token = getToken()“ ist kein Geheimnis); Platzhalter zählen nicht
const CODE_DATEI = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|go|rs|java|kt|cs|php|dart|swift|c|cc|cpp|h|hpp)$/i;
const PLATZHALTER = /^(?:\$\{|\$[A-Z_]|%[A-Z_]|\{\{|<|process\.env|import\.meta|os\.environ|env\(|getenv|your[_-]|xxx|\*{3}|changeme|example|placeholder|dummy|test$|\[entfernt\])/i;
/**
 * Anzahl der Zuweisungen password/secret/token/api_key … = „Wert“ (gleiches Muster wie ohneGeheimnisse, Einlesen 0.15.0). Schalterwerte und
 * Platzhalter zählen nicht; in Code-Dateien (rel) nur Werte in Anführungszeichen.
 */
export function zuweisungenZaehlen(text, rel = "") {
  let n = 0; const code = CODE_DATEI.test(String(rel));
  for (const m of String(text || "").matchAll(ZUWEISUNG)) {
    const [, , k, , w] = m;
    if (nurSchalter(k, w)) continue;
    const zitiert = /^\\?["']/.test(w);
    if (code && !zitiert) continue;
    const roh = w.replace(/^\\?["']|\\?["']$/g, "");
    if (roh.length < 6 || PLATZHALTER.test(roh)) continue;
    n++;
  }
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

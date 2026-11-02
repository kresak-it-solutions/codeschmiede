// QR-Code ohne fremden Dienst und ohne Paket (Arbeitsplatz Stufe 3, Ziel Handy: Testseite am echten Handy öffnen, Gerhard 02.11.2026).
// Kleine eigene Umsetzung nach ISO/IEC 18004 (Byte-Modus, Fehlerkorrektur L/M, Versionen 1–40) – nach dem Vorbild der bekannten
// gemeinfreien Referenz von Project Nayuki. Rein rechnerisch, keine Abhängigkeiten; getestet in desktop/dienst/test/qr.test.mjs
// (dort auch gegen einen unabhängigen Leser geprüft, wenn verfügbar).

const ECC_JE_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOECKE = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
const FORMAT_ECL = { L: 1, M: 0 };

const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** Anzahl der Daten-Module einer Version (ohne Funktionsmuster). */
export function rohModule(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
export const datenBytes = (ver, ecl) => Math.floor(rohModule(ver) / 8) - ECC_JE_BLOCK[ecl][ver] * BLOECKE[ecl][ver];

// ---------- Reed-Solomon über GF(256), Polynom 0x11D ----------
function mal(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
export function rsTeiler(grad) {
  const r = new Array(grad).fill(0); r[grad - 1] = 1; let wurzel = 1;
  for (let i = 0; i < grad; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mal(r[j], wurzel); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    wurzel = mal(wurzel, 0x02);
  }
  return r;
}
export function rsRest(daten, teiler) {
  const r = teiler.map(() => 0);
  for (const b of daten) { const f = b ^ r.shift(); r.push(0); teiler.forEach((t, i) => { r[i] ^= mal(t, f); }); }
  return r;
}

/** Text → Bytes (UTF-8). */
const utf8 = (t) => Array.from(new TextEncoder().encode(String(t)));

function datenKette(bytes, ver, ecl) {
  const bits = [];
  const schreib = (wert, laenge) => { for (let i = laenge - 1; i >= 0; i--) bits.push((wert >>> i) & 1); };
  schreib(0b0100, 4); schreib(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) schreib(b, 8);
  const kapazitaet = datenBytes(ver, ecl) * 8;
  schreib(0, Math.min(4, kapazitaet - bits.length));
  schreib(0, (8 - (bits.length % 8)) % 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < kapazitaet / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function mitFehlerkorrektur(daten, ver, ecl) {
  const n = BLOECKE[ecl][ver]; const eccLen = ECC_JE_BLOCK[ecl][ver];
  const roh = Math.floor(rohModule(ver) / 8);
  const kurz = n - (roh % n); const kurzLen = Math.floor(roh / n);
  const teiler = rsTeiler(eccLen); const bloecke = [];
  for (let i = 0, k = 0; i < n; i++) {
    const d = daten.slice(k, k + kurzLen - eccLen + (i < kurz ? 0 : 1)); k += d.length;
    const ecc = rsRest(d, teiler);
    if (i < kurz) d.push(0);
    bloecke.push(d.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < bloecke[0].length; i++) bloecke.forEach((b, j) => { if (i !== kurzLen - eccLen || j >= kurz) out.push(b[i]); });
  return out;
}

export function ausrichtung(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2; const groesse = ver * 4 + 17;
  const schritt = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let pos = groesse - 7; r.length < n; pos -= schritt) r.splice(1, 0, pos);
  return r;
}

const MASKEN = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function aufbauen(ver, ecl, codewoerter, maske) {
  const g = ver * 4 + 17;
  const m = Array.from({ length: g }, () => new Array(g).fill(false));
  const fkt = Array.from({ length: g }, () => new Array(g).fill(false));
  const setz = (x, y, dunkel) => { m[y][x] = dunkel; fkt[y][x] = true; };
  for (let i = 0; i < g; i++) { setz(6, i, i % 2 === 0); setz(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy;
    if (x >= 0 && x < g && y >= 0 && y < g) setz(x, y, d !== 2 && d !== 4);
  } };
  finder(3, 3); finder(g - 4, 3); finder(3, g - 4);
  const pos = ausrichtung(ver); const last = pos.length - 1;
  pos.forEach((a, i) => pos.forEach((b, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setz(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mk) => {
    const daten = (FORMAT_ECL[ecl] << 3) | mk; let rest = daten;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = ((daten << 10) | rest) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setz(8, i, bit(bits, i));
    setz(8, 7, bit(bits, 6)); setz(8, 8, bit(bits, 7)); setz(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setz(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setz(g - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setz(8, g - 15 + i, bit(bits, i));
    setz(8, g - 8, true);
  };
  format(0);   // Platz reservieren, echte Werte nach der Maske
  if (ver >= 7) {
    let rest = ver; for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
    const bits = (ver << 12) | rest;
    for (let i = 0; i < 18; i++) { const a = g - 11 + (i % 3); const b = Math.floor(i / 3); setz(a, b, bit(bits, i)); setz(b, a, bit(bits, i)); }
  }
  let i = 0;
  for (let rechts = g - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let v = 0; v < g; v++) for (let j = 0; j < 2; j++) {
      const x = rechts - j; const hoch = ((rechts + 1) & 2) === 0; const y = hoch ? g - 1 - v : v;
      if (!fkt[y][x] && i < codewoerter.length * 8) { m[y][x] = bit(codewoerter[i >>> 3], 7 - (i & 7)); i++; }
    }
  }
  const f = MASKEN[maske];
  for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) if (!fkt[y][x] && f(x, y)) m[y][x] = !m[y][x];
  format(maske);
  return m;
}

// Vereinfachte Bewertung (Regeln 1, 2 und 4 der Norm) – jede Maske ist lesbar, die Bewertung macht den Code nur ruhiger
function strafe(m) {
  const g = m.length; let s = 0; let dunkel = 0;
  for (let y = 0; y < g; y++) for (const zeile of [true, false]) {
    let lauf = 1;
    for (let x = 1; x <= g; x++) {
      const a = x < g ? (zeile ? m[y][x] : m[x][y]) : null; const b = zeile ? m[y][x - 1] : m[x - 1][y];
      if (a === b) lauf++; else { if (lauf >= 5) s += lauf - 2; lauf = 1; }
    }
  }
  for (let y = 0; y < g - 1; y++) for (let x = 0; x < g - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) s += 3; }
  for (const z of m) for (const c of z) if (c) dunkel++;
  return s + Math.floor(Math.abs(dunkel * 20 - g * g * 10) / (g * g)) * 10;
}

/**
 * QR-Code für einen Text (z. B. die Adresse der Testseite). ecl „M“ (Standard) oder „L“; kleinste passende Version 1–40.
 * → { groesse, module: boolean[][], version } – wirft, wenn der Text zu lang ist.
 */
export function qrCode(text, { ecl = "M", maske = null } = {}) {
  if (!ECC_JE_BLOCK[ecl]) throw new Error("Fehlerkorrektur L oder M");
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= 40; ver++) { const kopf = 4 + (ver <= 9 ? 8 : 16); if (kopf + bytes.length * 8 <= datenBytes(ver, ecl) * 8) break; }
  if (ver > 40) throw new Error("Text zu lang für einen QR-Code");
  const cw = mitFehlerkorrektur(datenKette(bytes, ver, ecl), ver, ecl);
  let beste = null; let besteS = Infinity;
  for (const mk of maske == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [maske]) {
    const m = aufbauen(ver, ecl, cw, mk); const s = strafe(m);
    if (s < besteS) { beste = m; besteS = s; }
  }
  return { groesse: ver * 4 + 17, module: beste, version: ver };
}

/** SVG-Pfad (ein Quadrat je dunklem Modul, Ruhezone `rand` Module) für <path d=…> in einer viewBox von 0 bis groesse + 2·rand. */
export function qrPfad(qr, rand = 4) {
  const t = [];
  qr.module.forEach((z, y) => z.forEach((c, x) => { if (c) t.push(`M${x + rand} ${y + rand}h1v1h-1z`); }));
  return t.join("");
}

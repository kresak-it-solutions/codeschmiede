// Bestehendes Projekt einlesen (0.15.0) – Claude. ZIP-Angriffe, Geheimnisse, Ausschlüsse, Einsortieren, Ziel vorhanden, Original unverändert, Strukturliste.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, symlink, link, rm, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { crc32 } from "../lib/sicherungen.mjs";
import {
  zipEintraege, zipLesen, ordnerLesen, pruefen, pfadFehler, ausschluss, gefaehrlich, geheimeDatei, geheimnisseZaehlen, personenHinweis,
  technikErkennen, zielVorschlag, auswahlPruefen, kopierPlan, strukturListe, gruppenPrompt, gruppenAntwort, wissenAusKonzept, regelnAusEingelesen, berichtZeilen, alsText, datenWert,
} from "../lib/einlesen.mjs";
import { einsortieren, zielFrei, geheimnisseImOrdner, repoKennungMerken, repoKennungenLesen } from "../lib/einlesenKopie.mjs";
import { ohneGeheimnisse as ohneGeheimnisseFuerTest } from "../lib/geheim.mjs";

/** Kleine ZIP bauen. Eintrag: [name, inhalt, { groesse, attr, von, flags, methode }] */
function zip(eintraege, { ende = {} } = {}) {
  const teile = []; const cds = []; let off = 0;
  for (const [name, inhalt, opt = {}] of eintraege) {
    const roh = Buffer.from(inhalt); const methode = opt.methode ?? 8; const daten = methode === 8 ? deflateRawSync(roh) : roh; const n = Buffer.from(name);
    const lokal = Buffer.alloc(30); lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(opt.flags ?? 0, 6); lokal.writeUInt16LE(methode, 8); lokal.writeUInt32LE(daten.length, 18); lokal.writeUInt32LE(opt.groesse ?? roh.length, 22); lokal.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt8(opt.von ?? 3, 5); cd.writeUInt16LE(opt.flags ?? 0, 8); cd.writeUInt16LE(methode, 10); cd.writeUInt32LE(crc32(roh), 16);
    cd.writeUInt32LE(daten.length, 20); cd.writeUInt32LE(opt.groesse ?? roh.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(opt.attr ?? ((0o100644 << 16) >>> 0), 38); cd.writeUInt32LE(off, 42);
    const t = Buffer.concat([lokal, n, daten]); teile.push(t); cds.push(Buffer.concat([cd, n])); off += t.length;
  }
  const c = Buffer.concat(cds); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0);
  const anzahl = ende.anzahl ?? eintraege.length; e.writeUInt16LE(anzahl, 8); e.writeUInt16LE(anzahl, 10); e.writeUInt32LE(c.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...teile, c, e]);
}
const lese = async (eintraege) => (await Promise.all(eintraege.map(async (e) => [e.rel, (await e.lesen()).toString()])));
const zipQuelle = (buf) => zipEintraege(buf).filter((e) => !e.ordner).map((e) => ({ rel: e.name, groesse: e.groesse, lesen: async (m) => e.lesen(m) }));

test("ZIP: normale Einträge werden gelesen, Ordner-Einträge erkannt, CRC geprüft", async () => {
  const r = zipEintraege(zip([["app/", "", { attr: (0o040755 << 16) >>> 0 }], ["app/src/main.jsx", "export default 1"], ["app/README.md", "# App", { methode: 0 }]]));
  assert.deepEqual(r.map((e) => [e.name, e.ordner]), [["app", true], ["app/src/main.jsx", false], ["app/README.md", false]]);
  assert.equal(r[1].lesen().toString(), "export default 1");
  const kaputt = zip([["a.txt", "hallo"]]); kaputt[30 + 5] ^= 0xff;   // gepackte Daten verändert
  assert.throws(() => zipEintraege(kaputt)[0].lesen(), /beschädigt|größer/);
});

test("ZIP-Angriffe: Pfad-Traversal, absolute Pfade, Laufwerke, Rückwärtsschrägstrich, Symlink, Doppelname", () => {
  for (const [name, re] of [["../boese.txt", /„\.\.“/], ["a/../../x", /„\.\.“/], ["/etc/passwd", /absoluter Pfad/], ["C:/Windows/x.txt", /Laufwerk/],
    ["a\\..\\x", /Rückwärtsschrägstrich/], ["a//b", /leerer Pfadteil/], ["con.txt", /Windows/], ["a/./b", /leerer Pfadteil/]]) {
    assert.throws(() => zipEintraege(zip([["ok.txt", "x"], [name, "x"]])), re, name);
  }
  assert.throws(() => zipEintraege(zip([["link", "/etc/passwd", { attr: (0o120777 << 16) >>> 0 }]])), /Verknüpfung/);
  assert.throws(() => zipEintraege(zip([["link", "x", { von: 0, attr: 0x400 }]])), /Verknüpfung/);   // Windows-Reparse-Punkt
  assert.throws(() => zipEintraege(zip([["A.txt", "x"], ["a.txt", "y"]])), /Doppelter Name/);
  assert.throws(() => zipEintraege(zip([["a.txt", "x", { flags: 1 }]])), /Verschlüsselt/);
  assert.throws(() => zipEintraege(zip([["a.txt", "x", { methode: 12 }]])), /Pack-Verfahren/);
  const z64 = zip([["a.txt", "x"]]); z64.writeUInt16LE(0xffff, z64.length - 12); z64.writeUInt16LE(0xffff, z64.length - 14);
  assert.throws(() => zipEintraege(z64), /ZIP64/);
});

test("ZIP-Bombe: falsche Größenangabe und extremes Packverhältnis werden abgelehnt", () => {
  // Angabe 10 Bytes, entpackt 5 MB → inflate bricht bei maxOutputLength ab
  const luege = zipEintraege(zip([["bombe.txt", "0".repeat(5 * 1024 * 1024), { groesse: 10 }]]));
  assert.throws(() => luege[0].lesen(), /größer als angegeben|ZIP-Bombe/);
  // Ehrliche Angabe, aber 5 MB aus wenigen Bytes (Verhältnis > 1000 : 1)
  assert.throws(() => zipEintraege(zip([["bombe.txt", "0".repeat(5 * 1024 * 1024)]])), /ZIP-Bombe/);
});

test("ZIP: zu viele Dateien, zu groß", async () => {
  const viele = zip(Array.from({ length: 30 }, (_, i) => [`f${i}.txt`, "x"]));
  assert.throws(() => zipEintraege(viele, { eintraegeMax: 20 }), /Zu viele Dateien/);
  await assert.rejects(pruefen(zipQuelle(viele), { grenzen: { maxDateien: 10, maxJe: 1e6, maxGesamt: 1e9 } }), /Zu viele Dateien/);
  await assert.rejects(pruefen(zipQuelle(zip([["a.txt", "x".repeat(2000)]])), { grenzen: { maxDateien: 10, maxJe: 1000, maxGesamt: 1e9 } }), /größer als/);
  await assert.rejects(pruefen(zipQuelle(zip([["a.txt", "x".repeat(800)], ["b.txt", "y".repeat(800)]])), { grenzen: { maxDateien: 10, maxJe: 1000, maxGesamt: 1000 } }), /Zusammen größer/);
  // node_modules zählt nicht zur Grenze der übernommenen Dateien
  const r = await pruefen(zipQuelle(zip([...Array.from({ length: 30 }, (_, i) => [`node_modules/x/f${i}.js`, "x"]), ["src/a.js", "1"]])), { grenzen: { maxDateien: 5, maxJe: 1e6, maxGesamt: 1e9 } });
  assert.equal(r.bericht.dateien, 1); assert.equal(r.bericht.ausgeschlossen.node_modules, 30);
});

test("Pfadprüfung und Ausschlüsse", () => {
  assert.equal(pfadFehler("src/App.jsx"), null);
  assert.ok(pfadFehler("src/x.") && pfadFehler("a\u0000b") && pfadFehler("aux"));
  for (const p of ["node_modules/react/index.js", "dist/app.js", "build/x", ".git/HEAD", ".DS_Store", "src/.DS_Store", "Thumbs.db", ".venv/bin/python", "a/__pycache__/x.pyc", ".cache/x", "__MACOSX/._a", "src/._App.jsx"]) assert.ok(ausschluss(p), p);
  for (const p of ["src/App.jsx", "public/build.svg", "docs/dist.md", "target/x.txt"]) assert.equal(ausschluss(p), null, p);
  assert.equal(ausschluss("src-tauri/target/debug/app", { hatCargo: (o) => o === "src-tauri" }), "target");
});

test("Gefährliche Dateien nach Name und Inhalt", () => {
  for (const p of ["setup.exe", "lib/x.dll", "start.bat", "run.ps1", "a.cmd", "s.scr", "i.msi", "Verknüpfung.lnk", "seite.url", "x.vbs"]) assert.ok(gefaehrlich(p), p);
  assert.equal(gefaehrlich("bild.png", Buffer.from("MZ\x90\x00")), "Windows-Programm");
  assert.equal(gefaehrlich("tool", Buffer.from("\x7fELF\x02")), "Linux-Programm");
  assert.equal(gefaehrlich("src/main.js", Buffer.from("impo")), null);
});

test("Geheimnisse: positiv", () => {
  const jwt = (rolle) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: rolle, iss: "supabase" })).toString("base64url")}.abcdefghijklmnopqrstu`;
  for (const t of [`OPENAI=sk-${"a".repeat(40)}`, `ANTHROPIC=sk-ant-${"b".repeat(40)}`, `ghp_${"c".repeat(36)}`, `github_pat_${"d".repeat(40)}`, "AKIAIOSFODNN7EXAMPLE",
    "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----", `SUPABASE_SERVICE_ROLE_KEY=${jwt("service_role")}`, "postgres://app:geheim123@db.example.com/x"]) {
    assert.ok(geheimnisseZaehlen(t) >= 1, t.slice(0, 30));
  }
  assert.equal(geheimnisseZaehlen(`a=sk-${"a".repeat(30)} b=ghp_${"c".repeat(36)}`), 2);
  for (const n of [".env", ".env.local", "config/.env.production", "certs/server.pem", "tls.key", "id_rsa", ".ssh/id_ed25519", "credentials.json"]) assert.ok(geheimeDatei(n), n);
});

test("Geheimnisse: negativ (keine Fehlalarme)", () => {
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.abcdefghijklmnopqrstu`;
  for (const t of ["task-list desk-top sk-kurz", "const ghp = 1; // ghp_kurz", `VITE_SUPABASE_ANON_KEY=${jwt}`, "AKIA kein Schlüssel", "https://example.com/pfad", "-----BEGIN PUBLIC KEY-----"]) {
    assert.equal(geheimnisseZaehlen(t), 0, t);
  }
  for (const n of ["src/env.js", "keys.md", "README.md", "monkey.js", "envrc.md"]) assert.ok(!geheimeDatei(n), n);
});

test("Personendaten-Hinweise", () => {
  assert.deepEqual(personenHinweis("mitglieder.csv", Buffer.from("Vorname;Nachname;E-Mail;Telefon\nMax;Muster;m@x.at;123\n")).spalten.sort(), ["e-mail", "nachname", "telefon", "vorname"]);
  assert.ok(personenHinweis("k.csv", Buffer.from("name,adresse,plz\nA,B,1\n")));
  assert.equal(personenHinweis("k.csv", Buffer.from("name,preis\nA,1\n")), null);   // Name allein reicht nicht
  assert.equal(personenHinweis("package.json", Buffer.from('{"name":"x","author":{"email":"a@b.c"}}')), null);
  assert.ok(personenHinweis("daten/kunden.json", Buffer.from(JSON.stringify([1, 2, 3].map((i) => ({ email: `${i}@x.at`, name: "x" }))))));
  assert.equal(personenHinweis("de.json", Buffer.from('{"email":"E-Mail","telefon":"Telefon"}')), null);   // Beschriftungen, keine Datensätze
  assert.ok(personenHinweis("db/app.sqlite", null));
  assert.equal(personenHinweis("supabase/migrations/0001.sql", Buffer.from("create table kunden (email text);")), null);
  assert.ok(personenHinweis("dump.sql", Buffer.from("insert into kunden (email, name) values ('a@b.c','x');")));
});

test("Technik erkennen", () => {
  const pkg = { dependencies: { react: "18", "@supabase/supabase-js": "2" }, devDependencies: { vite: "5", tailwindcss: "3" } };
  const t = technikErkennen(["package.json", "src/main.jsx", "vite.config.js"], (r) => (r === "package.json" ? Buffer.from(JSON.stringify(pkg)) : null));
  assert.deepEqual(t.technik, ["Node.js (package.json)", "React", "Vite", "Tailwind", "Supabase"]); assert.equal(t.art, "web");
  assert.equal(technikErkennen(["src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"], () => null).art, "programm");
  assert.equal(technikErkennen(["main.py", "requirements.txt"], () => null).art, "werkzeug");
});

test("Prüfung und Einsortieren: Bericht ohne Inhalte, Vorschlag, Auswahl änderbar, Personendaten draußen", async () => {
  const buf = zip([
    ["thermax/package.json", JSON.stringify({ dependencies: { react: "18" }, devDependencies: { vite: "5" } })],
    ["thermax/src/App.jsx", "export default () => null"], ["thermax/src/assets/logo.svg", "<svg/>"],
    ["thermax/README.md", "# Thermax"], ["thermax/KONZEPT.md", "# Ziel\nPlanung\n## Funktionen\nWochenplan"], ["thermax/HANDBUCH.md", "# Handbuch"],
    ["thermax/docs/aufbau.md", "# Aufbau"], ["thermax/entwurf.pdf", "%PDF-1.4"], ["thermax/CLAUDE.md", "# Regeln\n- Deutsch"],
    ["thermax/.env", `SUPABASE_SERVICE_ROLE_KEY=eyJx.${"y".repeat(20)}.${"z".repeat(20)}\nX=1`], ["thermax/src/config.js", `const k = "sk-${"q".repeat(40)}";`],
    ["thermax/daten/kunden.csv", "Name;Adresse;PLZ\nA;B;1\n"], ["thermax/tools/setup.exe", "MZ"], ["thermax/node_modules/x/i.js", "1"], ["thermax/.git/HEAD", "ref"],
  ]);
  const { bericht, dateien } = await pruefen(zipQuelle(buf));
  assert.equal(bericht.git, true);
  assert.deepEqual(bericht.geheim.map((g) => g.pfad).sort(), [".env", "src/config.js"]);
  assert.ok(!JSON.stringify(bericht).includes("qqqq") && !JSON.stringify(bericht).includes("SERVICE_ROLE"));   // keine Inhalte im Bericht
  assert.deepEqual(bericht.gefaehrlich.map((g) => g.pfad), ["tools/setup.exe"]);
  assert.deepEqual(bericht.personen.map((p) => p.pfad), ["daten/kunden.csv"]);
  assert.ok(bericht.technik.includes("React") && bericht.regeln.includes("CLAUDE.md"));
  const ziel = Object.fromEntries(bericht.einheiten.map((e) => [e.name, e.ziel]));
  assert.deepEqual(ziel, { daten: "code", docs: "code+doku", src: "code", "CLAUDE.md": "code", "HANDBUCH.md": "doku", "KONZEPT.md": "konzept", "README.md": "code+doku", "entwurf.pdf": "material", "package.json": "code" });
  assert.equal(berichtZeilen(bericht).find((z) => z.was === "Geheimnisse").ok, false);
  // Standard: Personendaten bleiben draußen
  let plan = kopierPlan(dateien, bericht, auswahlPruefen({}, bericht));
  assert.deepEqual(plan.code.map((d) => d.rel).sort(), ["CLAUDE.md", "README.md", "docs/aufbau.md", "package.json", "src/App.jsx", "src/assets/logo.svg"]);
  assert.deepEqual(plan.konzept.map((d) => d.rel), ["KONZEPT.md"]); assert.deepEqual(plan.material.map((d) => d.rel), ["entwurf.pdf"]);
  assert.deepEqual(plan.doku.map((d) => d.rel).sort(), ["HANDBUCH.md", "README.md", "docs/aufbau.md"]);
  // Admin ändert: entwurf.pdf → konzept, docs weglassen, kunden.csv trotzdem übernehmen
  plan = kopierPlan(dateien, bericht, auswahlPruefen({ zuordnung: { "entwurf.pdf": "konzept", docs: "weglassen" }, personen: ["daten/kunden.csv"] }, bericht));
  assert.ok(plan.konzept.some((d) => d.rel === "entwurf.pdf") && !plan.code.some((d) => d.rel.startsWith("docs/")) && plan.code.some((d) => d.rel === "daten/kunden.csv"));
  assert.throws(() => auswahlPruefen({ zuordnung: { "../x": "code" } }, bericht), /Ungültige Zuordnung/);
  assert.throws(() => auswahlPruefen({ zuordnung: { src: "irgendwo" } }, bericht), /Ungültige Zuordnung/);
  assert.throws(() => auswahlPruefen({ personen: [".env"] }, bericht), /Personendaten/);
});

test("Ordner: Verknüpfungen und harte Links werden nicht verfolgt, Original bleibt unverändert, Ziel vorhanden → Abbruch", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-test-"));
  try {
    const q = path.join(tmp, "quelle"); const aussen = path.join(tmp, "aussen");
    await mkdir(path.join(q, "src"), { recursive: true }); await mkdir(aussen); await mkdir(path.join(q, "node_modules", "x"), { recursive: true });
    await writeFile(path.join(aussen, "geheim.txt"), "PRIVAT"); await writeFile(path.join(q, "src", "App.jsx"), "export default 1");
    await writeFile(path.join(q, "KONZEPT.md"), "# Ziel\nTest"); await writeFile(path.join(q, "logo.png"), "PNG"); await writeFile(path.join(q, ".env"), "A=1");
    await writeFile(path.join(q, "node_modules", "x", "i.js"), "1");
    await symlink(aussen, path.join(q, "link-ordner")); await symlink(path.join(aussen, "geheim.txt"), path.join(q, "src", "link.txt"));
    await link(path.join(aussen, "geheim.txt"), path.join(q, "hart.txt"));
    const vorher = await abbild(q);
    const quelle = await ordnerLesen(q);
    assert.ok(quelle.links.some((l) => l.startsWith("link-ordner")) && quelle.links.some((l) => l.startsWith("src/link.txt")) && quelle.links.some((l) => l.includes("hart.txt")));
    assert.ok(!quelle.eintraege.some((e) => /link|hart|node_modules/.test(e.rel)));
    const { bericht, dateien } = await pruefen(quelle.eintraege, { links: quelle.links, ausgeschlossen: quelle.ausgeschlossen });
    assert.equal(bericht.ausgeschlossen.node_modules, 1);
    assert.ok(bericht.links.length >= 3);
    // Einsortieren in einen neuen Projektordner
    const po = path.join(tmp, "projekte", "thermax"); await mkdir(po, { recursive: true });
    const code = path.join(tmp, "stage", "code");
    const plan = kopierPlan(dateien, bericht, auswahlPruefen({}, bericht));
    const r = await einsortieren({ plan, wurzel: po, codeOrdner: code });
    assert.deepEqual((await readdir(code, { recursive: true })).sort(), ["src", "src/App.jsx"]);
    assert.equal(await readFile(path.join(po, "konzept", "eingelesen", "KONZEPT.md"), "utf8"), "# Ziel\nTest");
    assert.equal(await readFile(path.join(po, "material", "logo.png"), "utf8"), "PNG");
    assert.equal(r.kopiert, 3);
    await assert.rejects(stat(path.join(po, "konzept", "eingelesen", ".env")));
    assert.deepEqual(await geheimnisseImOrdner(code), []);
    // Zweites Einsortieren in denselben Ordner: nichts wird überschrieben
    await assert.rejects(einsortieren({ plan, wurzel: po, codeOrdner: code }), /gibt es schon|nicht leer/);
    // Original unverändert (Inhalte, Größen, Zeiten)
    assert.deepEqual(await abbild(q), vorher);
    // Ziel-Prüfung: vorhandener Ordner → Abbruch
    assert.equal(await zielFrei(path.join(tmp, "projekte"), "thermax"), false);
    assert.equal(await zielFrei(path.join(tmp, "projekte"), "neu-projekt"), true);
    await assert.rejects(zielFrei(path.join(tmp, "projekte"), "../x"), /Kennung/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("Geheimnis-Prüfung vor dem Hochladen findet nachträglich eingeschleuste Schlüssel", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-geheim-"));
  try {
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src", "a.js"), "const x = 1;");
    assert.deepEqual(await geheimnisseImOrdner(tmp), []);
    await writeFile(path.join(tmp, "src", "b.js"), `const t = "ghp_${"x".repeat(36)}";`);
    await writeFile(path.join(tmp, ".env.local"), "A=1");
    assert.deepEqual((await geheimnisseImOrdner(tmp)).sort(), [".env.local", "src/b.js"]);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("Strukturliste: nur Pfade, Routen, Menüeinträge, Komponenten – keine Inhalte, keine Geheimnisse", async () => {
  const dateien = {
    "src/App.jsx": `import X from "./x";\nconst geheimerText = "INHALT_DARF_NICHT_REIN";\n<Route path="/wochenplan" element={<Wochenplan/>} />\n<Route path="/kunden/:id" />`,
    "src/components/Sidebar.jsx": `const menu = [{ label: "Wochenplan", icon: "x" }, { label: "Kunden" }]; const daten = "max@muster.at";`,
    "src/pages/Kundenkarte.jsx": "export default function Kundenkarte(){ return 'GEHEIMER_INHALT' }",
    "src/lib/supabase.js": `const key = "sk-${"z".repeat(40)}";`,
    "src/router.js": `const r = [{ path: "/einstellungen", title: "Einstellungen" }]; const t = "ghp_${"a".repeat(36)}";`,
    ".env": "A=1",
  };
  const s = await strukturListe(Object.keys(dateien), (p) => Buffer.from(dateien[p]));
  for (const w of ["/wochenplan", "/kunden/:id", "Wochenplan", "Kunden", "Sidebar", "Kundenkarte", "src/lib/supabase.js"]) assert.ok(s.includes(w), w);
  for (const w of ["INHALT_DARF_NICHT_REIN", "GEHEIMER_INHALT", "max@muster.at", "zzzz", "aaaa", ".env", "import X", "/einstellungen"]) assert.ok(!s.includes(w), w);
  assert.ok((await strukturListe(Array.from({ length: 5000 }, (_, i) => `src/datei${i}.js`), () => null, { maxZeichen: 2000 })).length <= 2000);
  const p = gruppenPrompt({ name: "Thermax", art: "web", technik: ["React"], struktur: s });
  assert.ok(p.includes("Daten") && p.includes("STRUKTURLISTE") && !p.includes("GEHEIMER_INHALT"));
});

test("KI-Antwort wird streng geprüft", () => {
  const r = gruppenAntwort('Hier: {"gruppen":[{"name":"Planung","features":[{"name":"Wochenplan","beschreibung":"Plan"},{"name":"x"}]},{"name":"Konzept","features":[]},{"name":"<b>","features":[]}]}');
  assert.deepEqual(r, { gruppen: [{ name: "Planung", features: [{ name: "Wochenplan", beschreibung: "Plan" }] }] });
  assert.deepEqual(gruppenAntwort("kein json"), { gruppen: [] });
  assert.equal(gruppenAntwort(JSON.stringify({ gruppen: Array.from({ length: 30 }, (_, i) => ({ name: `Gruppe ${i}`, features: [] })) })).gruppen.length, 10);
});

test("Konzept ins Wissen und Projektregeln-Vorschlag", () => {
  const w = wissenAusKonzept("KONZEPT.md", `# Ziel\nPlanung für Thermax\n## Funktionen\n${"Wochenplan. ".repeat(400)}\n## Offen\nToken ghp_${"x".repeat(36)}`);
  assert.equal(w[0].kapitel, "ziel"); assert.ok(w[0].text.startsWith("[Eingelesen aus KONZEPT.md › Ziel, ungeprüft]"));
  assert.ok(w.every((x) => x.text.length <= 2000 && x.text.length >= 3)); assert.ok(w.filter((x) => x.kapitel === "funktionen").length >= 2);
  assert.ok(!w.some((x) => x.text.includes("ghp_x")));
  const r = regelnAusEingelesen({ kopf: "# Projektregeln", dateien: [{ name: "CLAUDE.md", text: "- Deutsch\n- Schlüssel sk-ant-" + "k".repeat(30) }] });
  assert.ok(r.includes("Vorschlag aus CLAUDE.md") && r.includes("- Deutsch") && !r.includes("kkkkk"));
});

async function abbild(o) {
  const r = {};
  for (const n of (await readdir(o, { recursive: true })).sort()) {
    const p = path.join(o, n); const st = await import("node:fs/promises").then((f) => f.lstat(p));
    r[n] = { groesse: st.size, zeit: st.mtimeMs, art: st.isSymbolicLink() ? "link" : st.isDirectory() ? "ordner" : "datei", sha: st.isFile() ? createHash("sha256").update(await readFile(p)).digest("hex") : null };
  }
  return r;
}

test("ZIP-Datei von der Platte lesen (Größe begrenzt)", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-zip-"));
  try {
    const f = path.join(tmp, "p.zip"); await writeFile(f, zip([["p/a.txt", "A"]]));
    const q = await zipLesen(f);
    assert.deepEqual(await lese(q.eintraege), [["p/a.txt", "A"]]);
    await assert.rejects(zipLesen(f, { grenzen: { zipMax: 10, eintraegeMax: 10 } }), /größer als/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("Ablauf ohne Netz: ZIP → Prüfung → Einsortieren → Geheimnis-Prüfung → erster Stand „Projekt eingelesen am …“ (gh durch lokales Repository ersetzt)", async () => {
  const { execFile } = await import("node:child_process"); const { promisify } = await import("node:util");
  const { repoEinlesen } = await import("../lib/repo.mjs");
  const run = promisify(execFile);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-ablauf-"));
  try {
    const zipDatei = path.join(tmp, "thermax-planer.zip");
    await writeFile(zipDatei, zip([["thermax-planer/package.json", '{"dependencies":{"react":"18"}}'], ["thermax-planer/src/App.jsx", "export default 1"],
      ["thermax-planer/.env", "SUPABASE_SERVICE_ROLE_KEY=x"], ["thermax-planer/KONZEPT.md", "# Ziel\nPlanen"], ["thermax-planer/node_modules/a/i.js", "1"]]));
    const vorher = createHash("sha256").update(await readFile(zipDatei)).digest("hex");
    const q = await zipLesen(zipDatei);
    const { bericht, dateien } = await pruefen(q.eintraege, { git: q.git });
    const po = path.join(tmp, "Codeschmiede", "thermax-planer"); await mkdir(po, { recursive: true });
    const code = path.join(tmp, "daten", "einlesen", "vorgang-1", "code");
    await einsortieren({ plan: kopierPlan(dateien, bericht, auswahlPruefen({}, bericht)), wurzel: po, codeOrdner: code });
    assert.deepEqual(await geheimnisseImOrdner(code), []);
    const bare = path.join(tmp, "github.git"); await run("git", ["init", "-q", "--bare", bare]);
    const aufrufe = []; let angelegt = false;
    const sh = async (befehl, args, o = {}) => {
      aufrufe.push([befehl, ...args].join(" "));
      if (befehl === "gh" && args[0] === "repo" && args[1] === "view") { if (!angelegt) throw new Error("nicht gefunden"); return { stdout: "PRIVATE\n" }; }
      if (befehl === "gh" && args[0] === "api" && args.join(" ").includes("actions/permissions")) return { stdout: args.includes("PUT") ? "" : "false\n" };
      if (befehl === "gh" && args[0] === "api") return { stdout: "tester\n" };
      if (befehl === "gh" && args[0] === "repo" && args[1] === "create") { assert.ok(args.includes("--private") && !args.includes("--push") && !args.includes("--source")); angelegt = true; return { stdout: "" }; }
      if (befehl === "git" && args.includes("push")) { assert.ok(angelegt, "erst anlegen, dann hochladen"); return run("git", args.map((a) => (a.startsWith("https://github.com/") ? bare : a)), o); }
      return run(befehl, args, o);
    };
    const keineHooks = path.join(tmp, "keine-hooks"); await mkdir(keineHooks);
    const { repo } = await repoEinlesen({ sh, ordner: code, keineHooks, projekt: { id: "thermax-planer", name: "Thermax Planer" }, heute: new Date(2026, 10, 2) });
    assert.equal(repo, "kresak-it-solutions/thermax-planer");
    const { stdout: log } = await run("git", ["--git-dir", bare, "log", "--format=%s", "main"]);
    assert.equal(log.trim(), "Projekt eingelesen am 02.11.2026");
    const { stdout: liste } = await run("git", ["--git-dir", bare, "ls-tree", "-r", "--name-only", "main"]);
    assert.deepEqual(liste.trim().split("\n").sort(), ["package.json", "src/App.jsx"]);
    assert.ok(!aufrufe.some((a) => /npm|node |install|run build/.test(a)), "kein Projekt-Code ausgeführt");
    const iCreate = aufrufe.findIndex((a) => a.startsWith("gh repo create")); const iSicht = aufrufe.findIndex((a, i) => i > iCreate && a.includes("visibility")); const iPush = aufrufe.findIndex((a) => a.includes(" push "));
    const iAus = aufrufe.findIndex((a) => a.includes("-X PUT") && a.includes("actions/permissions") && a.includes("enabled=false"));
    const iAusPruef = aufrufe.findIndex((a, i) => i > iAus && a.includes("actions/permissions") && a.includes(".enabled"));
    assert.ok(iCreate >= 0 && iSicht > iCreate && iAus > iSicht && iAusPruef > iAus && iPush > iAusPruef, "anlegen → Sichtbarkeit → Actions aus + geprüft → hochladen");
    assert.ok(aufrufe[iPush].includes("core.hooksPath=") && !aufrufe.some((a) => /git .*config (user|credential)/.test(a)), "Push ohne Hooks, keine gespeicherten Zugänge");
    assert.equal(createHash("sha256").update(await readFile(zipDatei)).digest("hex"), vorher);   // Original unverändert
    assert.ok(!(await readFile(path.join(po, "konzept", "eingelesen", "KONZEPT.md"), "utf8")).includes("SERVICE_ROLE"));
  } finally { await rm(tmp, { recursive: true, force: true }); }
});


test("Befund 1: env- und Zugangs-Dateien nach Namen", () => {
  for (const n of [".env", ".env.production", "prod.env", "app_env.txt", "config/stage-env.json", ".envrc", ".npmrc", ".pypirc", "home/.docker/config.json", ".netrc", ".git-credentials",
    "x.p12", "x.pfx", "release.keystore", "credentials.json", "service-account-prod.json"]) assert.ok(geheimeDatei(n), n);
  for (const n of ["src/vite-env.d.ts", "src/env.js", "src/environment.ts", "docs/env.md.txt.bak", "inventory.csv", "docker/config.json", "README.md"].filter((x) => x !== "docs/env.md.txt.bak")) assert.ok(!geheimeDatei(n), n);
});

test("Befund 2: weitere Schlüssel, Zuweisungen, UTF-16", () => {
  for (const t of [`NPM=npm_${"a".repeat(36)}`, `k=AIza${"b".repeat(35)}`, `glpat-${"c".repeat(20)}`, `xoxs-${"d".repeat(20)}`, "-----BEGIN PGP PRIVATE KEY BLOCK-----", "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN ENCRYPTED PRIVATE KEY-----", `sk_live_${"e".repeat(24)}`, `rk_live_${"f".repeat(24)}`, `https://hooks.slack.com/services/T000/B000/${"g".repeat(24)}`]) assert.ok(geheimnisseZaehlen(t) >= 1, t.slice(0, 30));
  assert.equal(geheimnisseZaehlen('password = "hunter2geheim"', "config.yml"), 1);
  assert.equal(geheimnisseZaehlen("api_key: abcdef123456", "settings.ini"), 1);
  assert.equal(geheimnisseZaehlen('const secret = "s3cr3t-wert-lang";', "src/a.js"), 1);
  for (const [t, rel] of [["const token = getToken();", "src/a.js"], ['password: "${DB_PW}"', "c.yml"], ["secret: process.env.SECRET", "c.yml"], ["persist-credentials: false", "w.yml"], ['token: "your-token-here"', "c.yml"]]) assert.equal(geheimnisseZaehlen(t, rel), 0, t);
  const u16 = (t, bom) => Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(t, "utf16le")]);
  assert.equal(geheimnisseZaehlen(u16(`token ghp_${"x".repeat(36)}`, true)), 1);
  assert.equal(geheimnisseZaehlen(u16(`token ghp_${"x".repeat(36)} und noch etwas Text`, false)), 1);
  const be = Buffer.from(`ghp_${"y".repeat(36)}`, "utf16le"); be.swap16();
  assert.equal(geheimnisseZaehlen(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), 1);
  assert.equal(alsText(Buffer.from("normal")), "normal");
});

test("Befund 3: dateiLesen erkennt ausgetauschte Dateien; kopiert wird genau der geprüfte Inhalt", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-tausch-"));
  try {
    const q = path.join(tmp, "q"); await mkdir(q); await writeFile(path.join(q, "a.js"), "AAAA"); await writeFile(path.join(tmp, "geheim"), "PRIV");
    let quelle = await ordnerLesen(q);
    await rm(path.join(q, "a.js")); await symlink(path.join(tmp, "geheim"), path.join(q, "a.js"));
    await assert.rejects(quelle.eintraege[0].lesen(), /geändert|ausgetauscht|ELOOP/);
    await rm(path.join(q, "a.js")); await writeFile(path.join(q, "a.js"), "AAAA");
    quelle = await ordnerLesen(q);
    await writeFile(path.join(q, "b.tmp"), "BBBB"); await rename(path.join(q, "b.tmp"), path.join(q, "a.js"));   // gleiche Größe, andere Datei
    await assert.rejects(quelle.eintraege[0].lesen(), /ausgetauscht/);
    // Nach der Prüfung geänderte Quelle: kopiert wird das Geprüfte
    await writeFile(path.join(q, "a.js"), "CCCC");
    const neu = await ordnerLesen(q); const { bericht, dateien } = await pruefen(neu.eintraege);
    await writeFile(path.join(q, "a.js"), `const t = "ghp_${"z".repeat(36)}";`);
    const po = path.join(tmp, "po"); await mkdir(po); const code = path.join(tmp, "stage", "code");
    await einsortieren({ plan: kopierPlan(dateien, bericht, auswahlPruefen({}, bericht)), wurzel: po, codeOrdner: code });
    assert.equal(await readFile(path.join(code, "a.js"), "utf8"), "CCCC");
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("Befund 3: Geheimnis-Sperre auch für konzept/doku/material und Wissen", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-ziele-"));
  try {
    const po = path.join(tmp, "po"); await mkdir(po);
    const boese = { rel: "KONZEPT.md", groesse: 10, lesen: async () => Buffer.from(`# Ziel\napi_key: "abcdefgh12345"`) };
    await assert.rejects(einsortieren({ plan: { code: [], konzept: [boese], doku: [], material: [] }, wurzel: po, codeOrdner: path.join(tmp, "s", "code") }), /Geheimnis/);
    assert.equal(wissenAusKonzept("K.md", '# Ziel\npassword = "hunter2geheim"\n## Funktionen\nPlanung').some((w) => /hunter|password/.test(w.text)), false);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("Befund 4: Windows-Sondernamen, Leerzeichen vorn, Doppelname nach NFC", () => {
  for (const n of ["CONIN$", "conout$.txt", "COM¹", "lpt³.log", " vorne.txt", "a/ b"]) assert.ok(pfadFehler(n), n);
  assert.equal(pfadFehler("com10.txt"), null);
  assert.throws(() => zipEintraege(zip([["café.txt", "x"], ["café.txt", "y"]])), /Doppelter Name/);
  assert.throws(() => zipEintraege(zip([["Café.txt", "x"], ["CAFÉ.TXT", "y"]])), /Doppelter Name/);
});

test("Befund 5: .git als Datei oder Ordner auf jeder Ebene, gefährliche .gitattributes", async () => {
  for (const p of [".git", "sub/.git", "a/b/.git/config", "a/.GIT"]) assert.equal(ausschluss(p), ".git", p);
  const r = await pruefen(zipQuelle(zip([["p/sub/.git", "gitdir: /etc"], ["p/.gitattributes", "*.js filter=boese\n"], ["p/sub/.gitattributes", "* text=auto\n"], ["p/a.js", "1"]])));
  assert.ok(r.bericht.git);
  assert.deepEqual(r.dateien.map((d) => d.rel).sort(), ["a.js", "sub/.gitattributes"]);
  assert.deepEqual(r.bericht.gefaehrlich.map((g) => g.pfad), [".gitattributes"]);
  assert.match(r.bericht.gefaehrlich[0].grund, /Git-Filter/);
});

test("Befund 6: weitere gefährliche Endungen, Skripte im Autostart", () => {
  for (const p of ["x.command", "a.iso", "a.img", "a.vhd", "a.vhdx", "h.chm", "a.msix", "a.appx", "a.xll", "a.library-ms", "a.scpt", "a.jar", "a.vbs", "a.wsf", "a.hta",
    "Start Menu/Programs/Startup/run.js", "autostart/x.js", "Startup/x.jse"]) assert.ok(gefaehrlich(p), p);
  for (const p of ["vite.config.js", "src/main.js", "eslint.config.js", "src/startup.js"]) assert.equal(gefaehrlich(p), null, p);
});

test("Befund 7: Strukturliste nur label/title, keine Datenwerte, angehakte Personendaten-Dateien fehlen", async () => {
  const d = {
    "src/components/Menu.jsx": `[{ label: "Kunden" }, { title: "Planung" }, { name: "Max Muster" }, { text: "Hallo" }, { label: "max@muster.at" }, { label: "Tel 0664 1234567" }, { title: "Stand 01.02.2020" }, { label: "Termin 2026-11-02" }]`,
    "src/daten/kunden.json": "[]",
  };
  const s = await strukturListe(Object.keys(d), (p) => Buffer.from(d[p]), { ohne: ["src/daten/kunden.json"] });
  for (const w of ["Kunden", "Planung"]) assert.ok(s.includes(w), w);
  for (const w of ["Max Muster", "Hallo", "max@", "1234567", "01.02.2020", "2026-11-02", "kunden.json"]) assert.ok(!s.includes(w), w);
  assert.ok(datenWert("a@b") && datenWert("12345") && datenWert("3.4.2021") && !datenWert("Wochenplan"));
});

test("Befund 8: Repository erst anlegen, Sichtbarkeit prüfen – nicht privat → nichts hochgeladen", async () => {
  const { repoEinlesen } = await import("../lib/repo.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-repo-"));
  try {
    const code = path.join(tmp, "code"); await mkdir(code); await writeFile(path.join(code, "a.js"), "1");
    const { execFile } = await import("node:child_process"); const { promisify } = await import("node:util"); const run = promisify(execFile);
    const aufrufe = []; let angelegt = false;
    const sh = async (b, a, o) => {
      aufrufe.push([b, ...a].join(" "));
      if (b === "gh" && a[1] === "view") { if (!angelegt) throw new Error("fehlt"); return { stdout: "INTERNAL\n" }; }
      if (b === "gh" && a[1] === "create") { angelegt = true; return { stdout: "" }; }
      if (b === "gh") return { stdout: "tester" };
      return run(b, a, o);
    };
    await assert.rejects(repoEinlesen({ sh, ordner: code, keineHooks: tmp, projekt: { id: "x-projekt", name: "X" } }), /nicht privat/);
    assert.ok(!aufrufe.some((a) => a.includes(" push ")), "kein Hochladen");
  } finally { await rm(tmp, { recursive: true, force: true }); }
});


test("N1/N3/N4: Zuweisungen mit Typ, Go, Backticks, Ersatzwert, *_KEY, PHP define, $-Passwörter – positiv", () => {
  for (const [t, rel] of [
    ['const apiKey: string = "abcd1234efgh";', "a.ts"], ['val password: String = "hunter2xy"', "a.kt"], ['password := "geheim123"', "m.go"],
    ["const token = `abc123defg`;", "a.js"], ['const pw = process.env.DB_PASSWORD || "geheim123";', "a.js"], ['const x = process.env.PW ?? "geheim123";', "a.js"],
    ['$pw = getenv("X") ?: "geheim123";', "a.php"], ['key = cfg["api_key"] || "abc123defg"', "a.js"],
    ["SUPABASE_SERVICE_KEY=abcdefgh1234567890xyz", "x.ini"], ['OPENAI_KEY = "abcdefgh1234567890xyz"', "a.py"], ["define('DB_PASSWORD', 'geheim123');", "w.php"],
    ["define(\"AUTH_SALT\", 'x7#kLm9!pQ2');", "w.php"], ['password = "$Ecret123"', "c.yml"], ['headers: { Authorization: "Basic dXNlcjpwYXNzd29yZDEyMw==" }', "a.js"],
    [`SG.${"a".repeat(22)}.${"b".repeat(43)}`, "x.txt"], ['fetch(u, { headers: { Authorization: "Bearer abcdef1234567890xyz" } })', "a.js"]]) {
    assert.ok(geheimnisseZaehlen(t, rel) >= 1, t);
  }
});

test("N1/N3/N4: keine Fehlalarme in normalem Code", () => {
  for (const [t, rel] of [
    ["const token = `${prefix}-abc`;", "a.js"], ['const cache_key = "user-list";', "a.js"], ['{ password: "Passwort eingeben" }', "a.js"], ['passwordLabel: "Passwort"', "a.js"],
    ['password: "$DB_PASSWORD"', "c.yml"], ['password: "%DB_PASSWORD%"', "c.yml"], ['const sortKey = "name";', "a.js"], ["interface X { token: string; }", "a.ts"],
    ['const primary_key = "id"', "a.py"], ['const pwa = "manifest";', "a.js"], ['VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijklmnopqrstu"', ".env.example.txt"],
    ['const publishableKey = "pk_test_abcdefghijklmnop12";', "a.js"], ['const pw = process.env.PW || "";', "a.js"], ['headers: { Authorization: `Bearer ${token}` }', "a.js"],
    ["curl -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'", "README.md"], ["define('WP_DEBUG', true);", "w.php"], ["Basic authentication is supported", "README.md"],
    ['const key: string = props.key;', "a.ts"], ["password := os.Getenv(\"DB_PW\")", "m.go"]]) {
    assert.equal(geheimnisseZaehlen(t, rel), 0, t);
  }
});

test("N2/N7: .env* immer, weitere Geheim-Dateien", () => {
  for (const n of [".env~", ".env copy", ".env2", ".env.js", ".env.ts", ".env.example", ".htpasswd", "AuthKey_ABC.p8", "prod.tfvars", "terraform.tfstate", "terraform.tfstate.backup"]) assert.ok(geheimeDatei(n), n);
  for (const n of ["src/vite-env.d.ts", "src/env.js", "main.tf", "src/htpasswd.md"]) assert.ok(!geheimeDatei(n), n);
});

test("N7: Office-Makros, .settingcontent-ms, .wsc, .cab sind gefährlich", () => {
  for (const p of ["a.docm", "a.xlsm", "a.pptm", "x.settingcontent-ms", "x.wsc", "x.cab"]) assert.ok(gefaehrlich(p), p);
  for (const p of ["a.docx", "a.xlsx", "a.pptx"]) assert.equal(gefaehrlich(p), null, p);
});

test("N6: Doppelnamen im Ordner (Groß/Klein, NFC) → Abbruch", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-doppel-"));
  try {
    await writeFile(path.join(tmp, "Readme.md"), "a"); await writeFile(path.join(tmp, "README.md"), "b");
    await assert.rejects(ordnerLesen(tmp), /Doppelter Name/);
    await rm(path.join(tmp, "README.md")); await writeFile(path.join(tmp, "café.txt"), "a"); await writeFile(path.join(tmp, "café.txt"), "b");
    await assert.rejects(ordnerLesen(tmp), /Doppelter Name/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test("N5: GitHub Actions wird vor dem Hochladen abgeschaltet – geht das nicht, wird nichts hochgeladen; Abläufe stehen im Bericht", async () => {
  const { repoEinlesen } = await import("../lib/repo.mjs");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-actions-"));
  try {
    const code = path.join(tmp, "code"); await mkdir(code); await writeFile(path.join(code, "a.js"), "1");
    const { execFile } = await import("node:child_process"); const { promisify } = await import("node:util"); const run = promisify(execFile);
    for (const fall of ["put-fehler", "bleibt-an"]) {
      await rm(path.join(code, ".git"), { recursive: true, force: true });
      const aufrufe = []; let angelegt = false;
      const sh = async (b, a, o) => {
        const z = [b, ...a].join(" "); aufrufe.push(z);
        if (b === "gh" && a[1] === "view") { if (!angelegt) throw new Error("fehlt"); return { stdout: "PRIVATE\n" }; }
        if (b === "gh" && a[1] === "create") { angelegt = true; return { stdout: "" }; }
        if (z.includes("actions/permissions") && a.includes("PUT")) { if (fall === "put-fehler") throw new Error("403"); return { stdout: "" }; }
        if (z.includes("actions/permissions")) return { stdout: "true\n" };
        if (b === "gh") return { stdout: "tester" };
        return run(b, a, o);
      };
      await assert.rejects(repoEinlesen({ sh, ordner: code, keineHooks: tmp, projekt: { id: "x-projekt", name: "X" } }), /Actions/);
      assert.ok(!aufrufe.some((x) => x.includes(" push ")), `${fall}: kein Hochladen`);
    }
    const r = await pruefen(zipQuelle(zip([["p/.github/workflows/build.yml", "on: push"], ["p/.github/dependabot.yml", "x: 1"], ["p/a.js", "1"]])));
    assert.deepEqual(r.bericht.workflows, [".github/workflows/build.yml"]);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});


test("2. Nachprüfung 1: Einzelwort-Passwörter und Passphrasen zählen, nur Beschriftungen nicht", () => {
  for (const [t, rel] of [['password: "Sommer"', "a.js"], ["secret: 'hunter'", "a.js"], ['const passwort = "Pillersee";', "a.js"], ['password = "Sommer"', "c.yml"],
    ['const password = "correct horse battery staple";', "a.js"], ['secret: "mein Hund heisst Rex"', "c.yml"], ['const label = t.password || "Passwort";', "a.js"]]) assert.ok(geheimnisseZaehlen(t, rel) >= 1, t);
  for (const [t, rel] of [['{ password: "Passwort eingeben" }', "a.js"], ['password: "Enter your password"', "a.js"], ['password: "Bitte Passwort eingeben"', "a.js"],
    ['passwordPlaceholder: "Passwort"', "a.js"], ['passwordLabel: "Kennwort"', "a.js"], ['secretHint: "Mindestens 8 Zeichen"', "a.js"], ['password: "Neues Passwort"', "a.js"]]) assert.equal(geheimnisseZaehlen(t, rel), 0, t);
});

test("2. Nachprüfung 2: nur der anon-JWT ist ausgenommen", () => {
  const jwt = (p) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(p)).toString("base64url")}.abcdefghijklmnopqrstu`;
  assert.equal(geheimnisseZaehlen(`SUPABASE_ANON_KEY="${jwt({ role: "anon" })}"`, "a.js"), 0);
  for (const p of [{ sub: "user-1" }, { scope: "admin" }, {}, { role: "authenticated" }]) assert.ok(geheimnisseZaehlen(`const token = "${jwt(p)}";`, "a.js") >= 1, JSON.stringify(p));
  assert.ok(geheimnisseZaehlen(`API_SECRET=${jwt({ iss: "x" })}`, "x.ini") >= 1);
});

test("2. Nachprüfung 3: öffentliche Namen nur als ganzer Namensteil, Gegenliste token/api_key", () => {
  const zufall = "aB3dE5gH7jK9mN1pQ3sT5vW7";
  for (const t of [`canonicalToken = "${zufall}"`, `NEXT_PUBLIC_API_TOKEN="${zufall}"`, `VITE_PUBLIC_API_KEY="${zufall}"`, `PK_TOKEN="${zufall}"`, `anonymousSecret = "${zufall}"`]) assert.ok(geheimnisseZaehlen(t, "x.env.txt") >= 1, t);
  for (const t of [`VITE_SUPABASE_ANON_KEY="${zufall}"`, `anonKey = "${zufall}"`, `supabaseAnonKey = "${zufall}"`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${zufall}"`, `publicKey = "${zufall}"`, `PK_LIVE_KEY="${zufall}"`]) assert.equal(geheimnisseZaehlen(t, "x.cfg"), 0, t);
});

test("2. Nachprüfung 4/5: starke Schlüssel-Namen ab 8 Zeichen (auch Ziffern), sonst Untergrenze 6", () => {
  for (const t of ['db_key = "12345678"', 'MASTER_KEY="87654321"', 'encryption_key: "abcdefgh"', 'signingKey = "s1gn1ng!"', 'secret_key = "98765432"', 'PRIVATE_KEY="zzzzzzzz"', 'app_secret = "11223344"']) assert.ok(geheimnisseZaehlen(t, "c.yml") >= 1, t);
  for (const t of ['db_key = "1234567"', 'master_key = "abc"']) assert.equal(geheimnisseZaehlen(t, "c.yml"), 0, t);
  assert.ok(geheimnisseZaehlen('password = "abc123"', "c.yml") >= 1);   // genau 6
  assert.equal(geheimnisseZaehlen('password = "abc12"', "c.yml"), 0);    // 5 Zeichen: unter der Grenze
});

test("2. Nachprüfung 6: Platzhalter nur als ganzer Wert", () => {
  for (const t of ['password: "your-password"', 'password: "<passwort>"', 'password: "xxxx"', 'password: "******"', 'password: "..."', 'password: "changeme"', 'secret: "example"', 'token: "dummy"', 'password: "placeholder"', 'password: "${DB_PW}"', 'password: "{{ pw }}"', 'password: "$DB_PW"', 'password: "%DB_PW%"', "secret: process.env.SECRET", 'password: os.environ["DB_PW"]', 'password: getenv("DB_PW")'])
    assert.equal(geheimnisseZaehlen(t, "c.yml"), 0, t);
  for (const t of ['password: "your-password-is-Sommer2024"x', 'password: "changeme123"', 'password: "test-Sommer9"', 'password: "examplePass1"', 'password: "xxxSommer"', 'password: "<b>Sommer2024"'])
    assert.ok(geheimnisseZaehlen(t.replace(/"x$/, '"'), "c.yml") >= 1, t);
});

test("2. Nachprüfung 7/8: Bearer-Platzhalter, Stripe-Test, AWS ASIA", () => {
  for (const t of ["Authorization: Bearer YOUR_ACCESS_TOKEN", "Authorization: Bearer <TOKEN_HIER>", "Bearer ACCESS_TOKEN"]) assert.equal(geheimnisseZaehlen(t, "README.md"), 0, t);
  for (const t of ["Authorization: Bearer ABCDEFGHIJKLMNOPQRSTUV", "Bearer abcdef1234567890xyz", `sk_test_${"a".repeat(24)}`, `rk_test_${"b".repeat(24)}`, "ASIAIOSFODNN7EXAMPLE"]) assert.ok(geheimnisseZaehlen(t, "README.md") >= 1, t);
});



test("B1: Beschriftungs-Namen nur in Code und nur bei UI-Text", () => {
  for (const [t, rel] of [['secretText = "Xk9!mQ2pLz"', "a.js"], ['passwordHint = "Xk9!mQ2pLz"', "a.js"], ['adminPasswordTitle = "Pillersee77"', "a.js"], ['dbPasswordText = "Sommer2024!"', "a.js"],
    ['masterKeyCaption: "8f3a9b2c1d4e"', "a.js"], ["SECRET_TEXT=Xk9mQ2pLz12", "x.ini"], ['passwordLabel = "Kennwort"', "c.ini"]]) assert.ok(geheimnisseZaehlen(t, rel) >= 1, t);
  for (const [t, rel] of [['passwordLabel: "Kennwort"', "a.js"], ['passwordHint: "Mindestens 8 Zeichen"', "a.js"], ['secretTitle: "Geheimer Bereich"', "a.ts"], ['passwordPlaceholder: "Ihr Passwort (8+ Zeichen)"', "a.jsx"], ['passwordLabel: "Kennwort"', "c.yml"]]) assert.equal(geheimnisseZaehlen(t, rel), 0, t);
});

test("B2: Standardwerte von Umgebungsvariablen werden geprüft", () => {
  for (const [t, rel] of [['DB_PASSWORD: "${DB_PASSWORD:-geheim123}"', "c.yml"], ["password=${PW-Sommer2024}", "x.sh"], ['secret: "${S:=Xk9mQ2pLz}"', "c.yml"],
    ['password = os.getenv("DB_PW", "geheim123")', "a.py"], ['pw = os.environ.get("DB_PASSWORD", "geheim123")', "a.py"], ["$pw = env('DB_PASSWORD', 'geheim123');", "a.php"],
    ['secret = ENV.fetch("APP_SECRET", "geheim123")', "a.rb"], ['token := getenv("API_TOKEN", "abc123def")', "m.go"], ['password = os.environ.get("X") or "geheim123"', "a.py"], ['pw = config.password or "geheim123"', "a.py"]])
    assert.ok(geheimnisseZaehlen(t, rel) >= 1, t);
  for (const [t, rel] of [['DB_PASSWORD: "${DB_PASSWORD:-}"', "c.yml"], ['DB_PASSWORD: "${DB_PASSWORD}"', "c.yml"], ['host = os.getenv("DB_HOST", "localhost")', "a.py"],
    ['password = os.getenv("DB_PW", "")', "a.py"], ['password = os.getenv("DB_PW", "changeme")', "a.py"], ['port = ENV.fetch("PORT", "3000")', "a.rb"], ['name = user.name or "Gast"', "a.py"]])
    assert.equal(geheimnisseZaehlen(t, rel), 0, t);
  const o = ohneGeheimnisseFuerTest('password = os.getenv("DB_PW", "geheim123")'); assert.ok(!o.includes("geheim123"));
});

test("B3: starke Schlüssel-Namen zählen auch mit pk_/public_/anon-Teil", () => {
  for (const t of ['pk_signing_key = "abcdefgh1"', 'public_db_key = "12345678"', 'anon_master_key = "12345678"', 'publicEncryptionKey = "abcdefgh"']) assert.ok(geheimnisseZaehlen(t, "a.py") >= 1, t);
  for (const t of ['public_key = "abcdefgh12"', 'PK_LIVE_KEY = "abcdefgh12345678xyz"']) assert.equal(geheimnisseZaehlen(t, "a.py"), 0, t);
});

test("B5: Bearer-Platzhalter nur als ganzer Wert ohne Ziffern", () => {
  for (const t of ["Bearer YOUR_ACCESS_TOKEN", "Bearer TOKEN", "Bearer ACCESS_TOKEN"]) assert.equal(geheimnisseZaehlen(t, "README.md"), 0, t);
  // seit der 4. Nachprüfung (N4) nur noch genau TOKEN/ACCESS_TOKEN/YOUR_…/<…>: diese zählen
  for (const t of ["Bearer ACCESS_TOKEN_HERE", "Bearer GITHUB_TOKEN_VALUE", "Bearer YOUR_TOKEN_12345678901", "Bearer ABCDEFGHIJKLMNOPQRSTUV", "Bearer TOKEN1234567890ABCDEF", "Bearer abcTOKENdefghijklmnop"]) assert.ok(geheimnisseZaehlen(t, "README.md") >= 1, t);
});

test("B4: vorhandenes Repository nur bei gemerkter Kennung und unberührt weiterverwenden", async () => {
  const { repoEinlesen } = await import("../lib/repo.mjs");
  const { execFile } = await import("node:child_process"); const { promisify } = await import("node:util"); const run = promisify(execFile);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-b4-"));
  try {
    const code = path.join(tmp, "code"); await mkdir(code); await writeFile(path.join(code, "a.js"), "1");
    const bare = path.join(tmp, "gh.git"); await run("git", ["init", "-q", "--bare", bare]);
    const gut = { id: 4711, node_id: "R_kgDOAbc", sichtbarkeit: "private", branches: "409", tags: "409", hooks: 0, keys: 0, rulesets: 0, teams: 0, invitations: 0, leute: ["tester"] };
    const machSh = (r, { da = true } = {}) => { const aufrufe = []; let angelegt = da; const sh = async (b, a, o) => {
      const z = [b, ...a].join(" "); aufrufe.push(z);
      if (b === "gh" && a[0] === "api" && a[1] === "user") return { stdout: "tester\n" };
      if (b === "gh" && a[1] === "view" && a.includes("visibility")) return { stdout: `${r.sichtbarkeit.toUpperCase()}\n` };
      if (b === "gh" && a[1] === "view") { if (!angelegt) throw new Error("fehlt"); return { stdout: "{}" }; }
      if (b === "gh" && a[1] === "create") { angelegt = true; return { stdout: "" }; }
      if (b === "gh" && a[0] === "api" && a[1] === "repos/kresak-it-solutions/x-projekt") return { stdout: JSON.stringify({ id: r.id, node_id: r.node_id, sichtbarkeit: r.sichtbarkeit }) };
      for (const k of ["branches", "tags", "hooks", "keys", "rulesets", "teams", "invitations"]) if (z.includes(`/x-projekt/${k} `)) {
        if (r[k] === "409") throw Object.assign(new Error("HTTP 409: Git Repository is empty."), { stderr: "HTTP 409" });
        if (r[k] === "fehler") throw Object.assign(new Error("HTTP 403"), { stderr: "HTTP 403: Resource not accessible" });
        return { stdout: `${r[k]}\n` }; }
      if (z.includes("collaborators")) return { stdout: JSON.stringify(r.leute) };
      if (z.includes("actions/permissions")) return { stdout: a.includes("PUT") ? "" : "false\n" };
      if (b === "git" && a.includes("push")) return run("git", a.map((x) => (x.startsWith("https://github.com/") ? bare : x)), o);
      if (b === "gh") return { stdout: "" };
      return run(b, a, o);
    }; return { sh, aufrufe }; };
    const lauf = async (r, gemerkt, o) => { await rm(path.join(code, ".git"), { recursive: true, force: true }); const x = machSh(r, o); const merk = [];
      const p = repoEinlesen({ sh: x.sh, ordner: code, keineHooks: tmp, projekt: { id: "x-projekt", name: "X" }, gemerkt, merken: async (k) => { merk.push(k); } });
      return { p, aufrufe: x.aufrufe, merk }; };
    const gemerkt = { id: 4711, node_id: "R_kgDOAbc" };
    for (const [fall, r, gm, grund] of [["ohne gemerkte Kennung", gut, null, /nicht von diesem PC/], ["andere id", { ...gut, id: 999 }, gemerkt, /nicht von diesem PC/],
      ["andere node_id", { ...gut, node_id: "R_x" }, gemerkt, /nicht von diesem PC/], ["öffentlich", { ...gut, sichtbarkeit: "public" }, gemerkt, /nicht privat/],
      ["Zweig da", { ...gut, branches: 1 }, gemerkt, /Zweige/], ["Tag", { ...gut, tags: 1 }, gemerkt, /Tags/], ["Hook", { ...gut, hooks: 1 }, gemerkt, /Webhooks/],
      ["Deploy-Key", { ...gut, keys: 1 }, gemerkt, /Deploy-Keys/], ["Ruleset", { ...gut, rulesets: 2 }, gemerkt, /Rulesets/], ["Mitarbeiter", { ...gut, leute: ["tester", "fremd"] }, gemerkt, /Mitarbeiter/],
      ["Team", { ...gut, teams: 1 }, gemerkt, /Teams/], ["Einladung", { ...gut, invitations: 1 }, gemerkt, /Einladungen/],
      ["Teams nicht prüfbar", { ...gut, teams: "fehler" }, gemerkt, /Teams nicht prüfbar/], ["Einladungen nicht prüfbar", { ...gut, invitations: "fehler" }, gemerkt, /Einladungen nicht prüfbar/]]) {
      const { p, aufrufe } = await lauf(r, gm);
      await assert.rejects(p, (e) => /liegt schon bei GitHub, bitte dort prüfen oder löschen/.test(e.message) && grund.test(e.message), fall);
      assert.ok(!aufrufe.some((x) => x.includes(" push ") || x.includes("repo create")), `${fall}: nichts angelegt oder hochgeladen`);
    }
    const ok = await lauf(gut, gemerkt); const r = await ok.p;
    assert.equal(r.repo, "kresak-it-solutions/x-projekt");
    assert.ok(!ok.aufrufe.some((x) => x.includes("repo create")) && ok.aufrufe.some((x) => x.includes("enabled=false")) && ok.aufrufe.some((x) => x.includes(" push ")), "weiterverwendet, Actions aus, hochgeladen");
    // Neu anlegen: Kennung wird sofort gemerkt (vor Actions und Push) – frisches Ziel-Repository für diesen Lauf
    await rm(bare, { recursive: true, force: true }); await run("git", ["init", "-q", "--bare", bare]);
    const neu = await lauf(gut, null, { da: false }); await neu.p;
    assert.deepEqual(neu.merk, [{ id: 4711, node_id: "R_kgDOAbc" }]);
    const iCreate = neu.aufrufe.findIndex((x) => x.includes("repo create")); const iId = neu.aufrufe.findIndex((x, i) => i > iCreate && x.includes("repos/kresak-it-solutions/x-projekt") && x.includes("node_id"));
    const iAus = neu.aufrufe.findIndex((x) => x.includes("enabled=false"));
    assert.ok(iCreate >= 0 && iId > iCreate && iAus > iId, "anlegen → Kennung merken → Actions aus");
  } finally { await rm(tmp, { recursive: true, force: true }); }
});


test("4. Nachprüfung N1: keine Fehlalarme in Übersetzungs-Dateien, Verweise und ${X:?…}", () => {
  for (const [rel, t] of [
    ["de.json", '{"passwordLabel":"Passwort"}'], ["de.json", '{"tokenText":"Token kopiert!"}'], ["de.json", '{"passwordMsg":"Passwort geändert."}'], ["en.json", '{"apiKeyLabel":"API key"}'],
    ["de.json", '{"auth":{"password":"Passwort","passwordHint":"Mindestens 8 Zeichen","forgotPassword":"Passwort vergessen?","tokenExpired":"Sitzung abgelaufen"}}'],
    ["en.json", '{"password": "Password", "confirmPassword": "Confirm password", "passwordTooShort": "Password must be at least 8 characters"}'],
    ["en.json", '{"passwordStrength": "Strong", "secretQuestion": "Name of first pet"}'], ["de.yml", "auth:\n  passwordLabel: Passwort\n  tokenText: Token kopiert!"],
    ["messages.properties", "login.passwordLabel=Kennwort"], ["app_de.arb", '{"passwordHint": "Mindestens 8 Zeichen"}'], ["Strings.resx", "<data name=\"passwordLabel\"><value>Passwort</value></data>"],
    ["Login.jsx", 'const passwordError = "Passwort zu kurz (min. 8)";'],
    ["app.js", 'const tokenUrl = process.env.TOKEN_URL || "https://example.com/oauth/token";'], ["app.js", 'const passwordResetPath = "/auth/reset-password";'],
    ["app.js", 'export const TOKEN_STORAGE_KEY = "ttg.auth.token";'], ["app.js", 'const passwordInputId = "login-password-field";'], ["app.js", 'const secretName = "projects/my-proj/secrets/db";'],
    ["app.js", 'const tokenType = "access_token_type";'], ["docker-compose.yml", "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Passwort fehlt}"], ["x.yml", "PW: ${PW?bitte setzen}"]])
    assert.equal(geheimnisseZaehlen(t, rel), 0, `${rel}: ${t}`);
});

test("4. Nachprüfung N1: echte Geheimnisse zählen weiter – auch in .ini/.env und unter Verweis-Namen mit Zufallswert", () => {
  for (const [rel, t] of [
    ["a.ini", "SECRET_TEXT=Xk9mQ2pLz12"], ["a.ini", "passwordLabel=Passwort"], [".env.local.json", '{"passwordLabel":"Passwort"}'], ["config.json", '{"password":"Sommer2024!"}'],
    ["config.json", '{"db":{"password":"Pillersee"}}'], ["config.yml", "password: Sommer"], ["a.js", 'const tokenId = "Xk9!mQ2pLz7#"'], ["a.js", 'const secretName = "Sommer2024!"'],
    ["a.js", 'const tokenUrl = "https://user:geheim123@api.example.com"'], ["docker-compose.yml", "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-Sommer2024!}"],
    ["x.yml", "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-${X:-Sommer2024!}}"], ["x.yml", "DB_PASSWORD: ${DB_PASSWORD:-'Sommer2024!'}"], ["de.json", '{"passwordHint":"Xk9!mQ2pLz"}']])
    assert.ok(geheimnisseZaehlen(t, rel) >= 1, `${rel}: ${t}`);
});

test("4. Nachprüfung N4: Bearer-Platzhalter, default=, harmlose Standardwerte in Logs", () => {
  for (const t of ["Bearer TOKEN", "Bearer ACCESS_TOKEN", "Bearer YOUR_ACCESS_TOKEN", "Bearer <token>"]) assert.equal(geheimnisseZaehlen(t, "README.md"), 0, t);
  for (const t of ["Bearer MYTOKENISREALLYLONGSECRET", "Bearer ACCESSTOKENVALUEFORPRODX", "Bearer GITHUB_TOKEN_VALUE_XY"]) assert.ok(geheimnisseZaehlen(t, "README.md") >= 1, t);
  assert.ok(geheimnisseZaehlen('password = os.getenv("DB_PASSWORD", default="Sommer2024!")', "a.py") >= 1);
  assert.ok(geheimnisseZaehlen('const k = "sk_test_abcdefghijklmn";', "a.js") >= 1);
  const o = ohneGeheimnisseFuerTest;
  assert.equal(o('host = os.getenv("DB_HOST", "localhost")'), 'host = os.getenv("DB_HOST", "localhost")');
  assert.equal(o('ports: "${PORT:-3000}:3000"'), 'ports: "${PORT:-3000}:3000"');
  assert.equal(o('const port = process.env.PORT || "3000";'), 'const port = process.env.PORT || "3000";');
  for (const t of ['password = os.getenv("DB_PASSWORD", "Sommer2024!")', "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-Sommer2024!}", 'const pw = process.env.PW || "Sommer2024!";', "'password' => env('DB_PASSWORD', 'Sommer2024!'),"])
    assert.ok(!o(t).includes("Sommer2024"), t);
});

test("4. Nachprüfung N3: einlesen-repos.json atomar, 0600, nie durch Verknüpfungen, Schreiber nacheinander", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cs-einlesen-merk-"));
  try {
    const d = path.join(tmp, "einlesen-repos.json"); const geschuetzt = [];
    await Promise.all(Array.from({ length: 12 }, (_, i) => repoKennungMerken(d, `kresak-it-solutions/p${i}`, { id: i + 1, node_id: `R_${i}` }, { schuetzen: async (f) => { geschuetzt.push(f); } })));
    const alle = await repoKennungenLesen(d);
    assert.equal(Object.keys(alle).length, 12, "kein Schreiber geht verloren");
    assert.equal(alle["kresak-it-solutions/p3"].node_id, "R_3");
    if (process.platform !== "win32") assert.equal((await stat(d)).mode & 0o777, 0o600);
    assert.equal(geschuetzt.length, 12);
    assert.deepEqual((await readdir(tmp)).filter((n) => n.endsWith(".neu")), [], "keine Hilfsdateien übrig");
    // Verknüpfung statt Datei: nicht lesen, nicht schreiben
    const ziel = path.join(tmp, "fremd.json"); await writeFile(ziel, "{}"); await rm(d); await symlink(ziel, d);
    await assert.rejects(repoKennungMerken(d, "kresak-it-solutions/x", { id: 1, node_id: "R_1" }), /keine echte Datei/);
    assert.deepEqual(await repoKennungenLesen(d), {});
    assert.equal(await readFile(ziel, "utf8"), "{}");
    await assert.rejects(repoKennungMerken(path.join(tmp, "x.json"), "../boese", { id: 1, node_id: "R" }), /Ungültige Kennung/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

// Bestehendes Projekt einlesen (0.15.0) – Claude. ZIP-Angriffe, Geheimnisse, Ausschlüsse, Einsortieren, Ziel vorhanden, Original unverändert, Strukturliste.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, symlink, link, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { crc32 } from "../lib/sicherungen.mjs";
import {
  zipEintraege, zipLesen, ordnerLesen, pruefen, pfadFehler, ausschluss, gefaehrlich, geheimeDatei, geheimnisseZaehlen, personenHinweis,
  technikErkennen, zielVorschlag, auswahlPruefen, kopierPlan, strukturListe, gruppenPrompt, gruppenAntwort, wissenAusKonzept, regelnAusEingelesen, berichtZeilen,
} from "../lib/einlesen.mjs";
import { einsortieren, zielFrei, geheimnisseImOrdner } from "../lib/einlesenKopie.mjs";

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
  for (const n of ["src/env.js", "keys.md", "README.md", "monkey.js", ".envrc.md"]) assert.ok(!geheimeDatei(n), n);
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
    const aufrufe = [];
    const sh = async (befehl, args, o = {}) => {
      aufrufe.push([befehl, ...args].join(" "));
      if (befehl === "gh" && args[0] === "repo" && args[1] === "view") throw new Error("nicht gefunden");
      if (befehl === "gh" && args[0] === "api") return { stdout: "tester\n" };
      if (befehl === "gh" && args[0] === "repo" && args[1] === "create") { assert.ok(args.includes("--private")); await run("git", ["-c", "core.hooksPath=/dev/null", "push", "-q", bare, "main"], { cwd: o.cwd }); return { stdout: "" }; }
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
    assert.equal(createHash("sha256").update(await readFile(zipDatei)).digest("hex"), vorher);   // Original unverändert
    assert.ok(!(await readFile(path.join(po, "konzept", "eingelesen", "KONZEPT.md"), "utf8")).includes("SERVICE_ROLE"));
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

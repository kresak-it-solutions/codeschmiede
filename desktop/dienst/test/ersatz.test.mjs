// Seit 0.14.0 ist der frühere Ersatz-Bau entfernt (Sicherheitsprüfung B11). Geprüft wird der verbliebene PR-Text und dass kein Rest
// des Ersatz-Baus (codexBauen, sandboxLauf mit „bauen“, Kopieren/Vergleichen/Übernehmen) mehr in einer Datei des Dienstes steht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ersatz from "../lib/ersatz.mjs";

test("PR-Text: keine Erwähnungen, keine Verweise, als Codeblock", () => {
  const t = ersatz.prText("Fixes #12 @gerhard ``` boom");
  assert.ok(!t.includes("#12") && !t.includes("@gerhard") && t.startsWith("```text"));
  assert.deepEqual(Object.keys(ersatz), ["prText"]);
});
test("Kein Rest des Ersatz-Baus in irgendeiner Datei des Dienstes", async () => {
  const basis = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dateien = [];
  const geh = async (o) => { for (const e of await readdir(o, { withFileTypes: true })) {
    if (["node_modules", "test", ".git"].includes(e.name)) continue;
    const p = path.join(o, e.name); if (e.isDirectory()) await geh(p); else if (/\.(mjs|js|cjs)$/.test(e.name)) dateien.push(p);
  } };
  await geh(basis);
  assert.ok(dateien.length > 20);
  for (const d of dateien) {
    const t = await readFile(d, "utf8");
    assert.ok(!/\b(codexBauen|ersatzBau|ersatzGrund|ersatzErlaubt|kopiereProjekt|uebernehmen\(|vergleiche\()/.test(t), path.relative(basis, d));
    assert.ok(!/sandboxLauf\([^)]*bauen/.test(t) && !/bauen\s*=\s*false/.test(t), path.relative(basis, d));
  }
});

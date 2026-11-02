import { test } from "node:test";
import assert from "node:assert/strict";
import { csvLesen, zaehlen } from "../src/zaehlen.mjs";

test("zählt je Kategorie", () => {
  assert.deepEqual(zaehlen([{ kategorie: "A" }, { kategorie: "B" }, { kategorie: "A" }]), { A: 2, B: 1 });
});

test("liest die Beispiel-CSV", () => {
  assert.deepEqual(zaehlen(csvLesen("kategorie;menge\nA;1\nB;2\nA;3\n")), { A: 2, B: 1 });
});

// Abo-Limits für Claude „Ultra“ (0.13.1, Gerhard 02.11.2026 10:00): kein 5-Stunden-Fenster, modell-eigene Wochenfenster – nur was gemeldet wird
import test from "node:test";
import assert from "node:assert/strict";
import { findeAboLimits, aboEntscheidung } from "../lib/abo.mjs";

test("Kein 5-Stunden-Fenster gemeldet → „kein Limit“ (nicht 0 %), modell-eigene Woche erkannt", () => {
  const r = findeAboLimits({ rate_limits: { seven_day: { used_percentage: 40 }, seven_day_fable: { used_percentage: 80, resets_at: 1893456000 } } });
  assert.equal(r.fuenf_std_kein, true); assert.equal(r.fuenf_std_prozent, null);
  assert.deepEqual(r.woche_modelle, [{ modell: "fable", prozent: 80, reset: "2030-01-01T00:00:00.000Z" }]);
  const u = findeAboLimits({ rate_limit_info: { unifiedWindows: { seven_day: { utilization: 0.2 }, sevenDayFable: { utilization: 0.5 } } } });
  assert.equal(u.fuenf_std_kein, true); assert.equal(u.woche_modelle[0].modell, "fable"); assert.equal(u.woche_modelle[0].prozent, 50);
  // mit 5-Stunden-Fenster wie bisher
  const n = findeAboLimits({ rate_limits: { five_hour: { used_percentage: 10 }, seven_day: { used_percentage: 5 } } });
  assert.equal(n.fuenf_std_kein, false); assert.equal(n.fuenf_std_prozent, 10); assert.equal(n.woche_modelle, undefined);
  // eine einzelne Wochen-Meldung sagt nichts über das 5-Stunden-Fenster (kein Raten)
  assert.equal(findeAboLimits({ rateLimitType: "seven_day", utilization: 0.3 }).fuenf_std_kein, undefined);
  assert.deepEqual(findeAboLimits({ rateLimitType: "seven_day_fable", utilization: 0.9 }), { woche_modelle: [{ modell: "fable", prozent: 90, reset: null }] });
});

test("aboEntscheidung: altes 5-Std.-Fenster zählt bei „kein Limit“ nicht, Modell-Woche nur für dieses Modell", () => {
  const l = { fuenf_std_kein: true, fuenf_std_prozent: 99, woche_prozent: 10, woche_modelle: [{ modell: "fable", prozent: 97, reset: null }] };
  assert.equal(aboEntscheidung(l), "frei");
  assert.equal(aboEntscheidung(l, { modell: "fable" }), "pause");
  assert.equal(aboEntscheidung(l, { modell: "claude-fable-5" }), "pause");
  assert.equal(aboEntscheidung(l, { modell: "opus" }), "frei");
  assert.equal(aboEntscheidung({ fuenf_std_prozent: 96 }), "pause", "wie bisher");
});

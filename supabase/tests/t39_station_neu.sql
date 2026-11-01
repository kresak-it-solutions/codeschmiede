-- Rechte-Test Datenbank 0052 (Station „Erneut versuchen“, Befund L1) – Claude, Anweisung Gerhard 01.11.2026 22:18/22:38
-- Voraussetzung: wie t38 (mock2.sql, alle Migrationen bis 0052), t38 vorher gelaufen (Konten E1/E2, Auftrag S-T1).
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set E1  'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-0000000000e1'',false) \\g /dev/null'
\set E2  'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-0000000000e2'',false) \\g /dev/null'
reset role;
update ws_auftraege set stand='feature', zweig='feature/cs-1-s-t1', pr_nummer=5,
  pruefung='{"feature":{"ergebnis":"angehalten","versuche":4,"befund":"gh pr merge scheiterte","gepr_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","gepr_ki":"claude/opus"}}' where titel='S-T1';
set role authenticated;
\echo [1] E2 (ohne Recht freigeben) -> FEHLER
:E2
select ws_station_neu_versuchen((select id from ws_auftraege where titel='S-T1'));
\echo [2] E1 (mit Recht) -> OK, Station wartet, gemerkte Prüfung bleibt, versuche 0
:E1
select ws_station_neu_versuchen((select id from ws_auftraege where titel='S-T1')) \g /dev/null
select pruefung->'feature'->>'ergebnis' ergebnis, pruefung->'feature'->>'versuche' versuche, pruefung->'feature'->>'gepr_ki' gepr_ki from ws_auftraege where titel='S-T1';
\echo [3] E1 nochmal, Station läuft (ergebnis laeuft) -> FEHLER
reset role; update ws_auftraege set pruefung = jsonb_set(pruefung, '{feature,ergebnis}', '"laeuft"') where titel='S-T1'; set role authenticated;
:E1
select ws_station_neu_versuchen((select id from ws_auftraege where titel='S-T1'));
\echo [4] Auftrag nicht in einer Station -> FEHLER
reset role; update ws_auftraege set stand='zusammen' where titel='S-T1'; set role authenticated;
:ADM
select ws_station_neu_versuchen((select id from ws_auftraege where titel='S-T1'));

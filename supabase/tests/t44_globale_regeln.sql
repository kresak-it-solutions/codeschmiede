-- Rechte-Test Datenbank 0056, Teil „Globale Regeln“ (<basis>\Regeln\CLAUDE.md, Gerhard 02.11.2026 09:50/09:54/09:55) – Claude
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0056, danach t42_projektordner.sql (Konten, PCs, Projekte).
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set FREMD 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000f'',false) \\g /dev/null'
\set T1 '- Immer Deutsch.'
\set T2 '- Immer Deutsch.\n- Entwürfe zuerst.'

\echo [1] Projekt mit Kennung „regeln“ -> FEHLER
:ADM
select ws_projekt_anlegen('regeln','Regeln','Test',null,'layers');
\echo [2] Admin meldet die globale Fassung für eigenen PC -> OK (1 Zeile, neben = t)
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000a1', encode(sha256(convert_to(:'T1','UTF8')),'hex'), :'T1', 0, true) \g /dev/null
select count(*) zeilen, bool_and(neben) neben from ws_regeln_global_stand;
\echo [3] Falsche Prüfsumme -> FEHLER
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000a1', repeat('a',64), :'T1');
\echo [4] Zu lang -> FEHLER
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000a1', encode(sha256(convert_to(repeat('x',30001),'UTF8')),'hex'), repeat('x',30001));
\echo [5] Fremder PC -> FEHLER
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000d1', encode(sha256(convert_to(:'T1','UTF8')),'hex'), :'T1');
\echo [6] Entwickler meldet für eigenen PC -> OK (2 Zeilen)
:DEV
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000d1', encode(sha256(convert_to(:'T2','UTF8')),'hex'), :'T2', 1) \g /dev/null
select count(*) zeilen from ws_regeln_global_stand;
\echo [7] Entwickler bestätigt -> FEHLER
select ws_regeln_global_bestaetigen(encode(sha256(convert_to(:'T2','UTF8')),'hex'));
\echo [8] Ohne Projekt (Fremder) sieht nichts -> 0, meldet -> FEHLER
:FREMD
select count(*) from ws_regeln_global_stand;
reset role; insert into ws_benutzer(id,name,rolle) values ('00000000-0000-0000-0000-00000000000f','Fremd','leser') on conflict do nothing;
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','PC-Fremd',true) on conflict do nothing; set role authenticated;
select ws_regeln_global_melden('00000000-0000-0000-0000-0000000000f1', encode(sha256(convert_to(:'T1','UTF8')),'hex'), :'T1');
\echo [9] Admin bestätigt eine nicht gemeldete Fassung -> FEHLER
:ADM
select ws_regeln_global_bestaetigen(repeat('b',64));
\echo [10] Admin bestätigt T1, dann T2 -> OK (2 Freigaben, neueste = T2)
select ws_regeln_global_bestaetigen(encode(sha256(convert_to(:'T1','UTF8')),'hex')) \g /dev/null
select pg_sleep(0.01) \g /dev/null
select ws_regeln_global_bestaetigen(encode(sha256(convert_to(:'T2','UTF8')),'hex')) \g /dev/null
select count(*) freigaben, (select sha from ws_regeln_global_freigaben order by am desc limit 1) = encode(sha256(convert_to(:'T2','UTF8')),'hex') neueste_t2 from ws_regeln_global_freigaben;
\echo [11] Direkt schreiben -> FEHLER
insert into ws_regeln_global_freigaben(sha) values (repeat('c',64));
\echo [12] Entwickler sieht die Freigaben (lesen) -> 2
:DEV
select count(*) from ws_regeln_global_freigaben;
\echo [13] Entwickler widerruft -> FEHLER; Admin widerruft T2 -> OK (neueste = T1, Protokoll 3 Einträge)
select ws_regeln_global_widerrufen(encode(sha256(convert_to(:'T2','UTF8')),'hex'));
:ADM
select ws_regeln_global_widerrufen(encode(sha256(convert_to(:'T2','UTF8')),'hex')) \g /dev/null
select (select sha from ws_regeln_global_freigaben order by am desc limit 1) = encode(sha256(convert_to(:'T1','UTF8')),'hex') neueste_t1;
reset role; select count(*) protokoll from ws_protokoll where was like 'regeln_global%'; set role authenticated;
\echo [14] Nochmal widerrufen -> FEHLER
:ADM
select ws_regeln_global_widerrufen(encode(sha256(convert_to(:'T2','UTF8')),'hex'));

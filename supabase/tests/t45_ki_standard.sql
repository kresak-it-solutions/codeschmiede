-- Test Datenbank 0056, Teil „KI-Zuständigkeiten fest eintragen“ (Entscheidung Gerhard 02.11.2026 „Claude fest eintragen“) – Claude
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0056, danach t42_projektordner.sql (Konten, PCs, Projekte).
-- Erwartung steht jeweils in der \echo-Zeile. Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
:ADM

\echo [1] Jedes Projekt hat alle 8 Aufgaben (bestehende aus dem Einspielen, neue aus t42 über den Trigger) -> 0 Projekte mit fehlenden Zeilen
reset role;
select count(*) fehlend from public.ws_projekte p where (select count(*) from public.ws_ki_zustaendigkeit z where z.projekt_id = p.id) <> 8;
\echo [2] Standardwerte wie bisher zur Laufzeit -> chat claude/sonnet, pruefung claude/opus, texte claude/haiku, bauen claude
select aufgabe, reihe from public.ws_ki_zustaendigkeit where projekt_id = 'vereinsheft' and aufgabe in ('chat','pruefung','texte','bauen') order by aufgabe;
set role authenticated;
\echo [3] Admin ändert „chat“ von vereinsheft auf Gemini → bleibt nach erneutem Einspielen von 0056 erhalten (siehe [5])
:ADM
select ws_ki_zustaendigkeit_setzen('vereinsheft', 'chat', '[{"anbieter":"gemini"}]'::jsonb, 80) \g /dev/null
reset role;
create temp table vorher as select projekt_id, aufgabe, reihe, weitergeben_ab, geaendert, geaendert_von from public.ws_ki_zustaendigkeit;
\echo [4] Eine Zeile fehlt (z. B. von Hand gelöscht) → zweites Einspielen ergänzt nur sie
delete from public.ws_ki_zustaendigkeit where projekt_id = 'werkzeug-x' and aufgabe = 'doku';
\ir ../migrations/0056_regelwerk_sicherungen.sql
\set QUIET 1
\echo [5] Nach dem zweiten Einspielen: gespeicherte Werte unverändert (0 Unterschiede), die fehlende Zeile wieder da (1), Gemini bleibt
select count(*) unterschiede from vorher v join public.ws_ki_zustaendigkeit z using (projekt_id, aufgabe)
 where not (v.projekt_id = 'werkzeug-x' and v.aufgabe = 'doku')
   and (z.reihe is distinct from v.reihe or z.weitergeben_ab is distinct from v.weitergeben_ab or z.geaendert is distinct from v.geaendert or z.geaendert_von is distinct from v.geaendert_von);
select count(*) wieder_da from public.ws_ki_zustaendigkeit where projekt_id = 'werkzeug-x' and aufgabe = 'doku';
select reihe -> 0 ->> 'anbieter' chat, weitergeben_ab from public.ws_ki_zustaendigkeit where projekt_id = 'vereinsheft' and aufgabe = 'chat';
\echo [6] Ohne fehlende Zeilen ändert ein drittes Einspielen nichts -> gleiche Anzahl Zeilen
create temp table anzahl as select count(*) n from public.ws_ki_zustaendigkeit;
\ir ../migrations/0056_regelwerk_sicherungen.sql
\set QUIET 1
select (select count(*) from public.ws_ki_zustaendigkeit) = (select n from anzahl) gleich;
\echo [7] Die Standard-Funktionen sind nicht direkt aufrufbar -> FEHLER
set role authenticated;
:ADM
select * from ws_ki_standard_reihen();

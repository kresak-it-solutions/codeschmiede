-- Test Datenbank 0056, Teil „KI-Zuständigkeiten fest eintragen“ (Entscheidung Gerhard 02.11.2026 „Claude fest eintragen“) – Claude
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0056, danach t42_projektordner.sql (Konten, PCs, Projekte).
-- Erwartung steht jeweils in der \echo-Zeile. Nur erfundene Test-Konten.
-- Seit 0062 (0.18.0, KI-Anbindungen global): Der Trigger ist weg, neue Projekte bekommen keine Zeilen mehr und ein erneutes Einspielen von 0056
-- trägt nichts mehr je Projekt ein. Der Test läuft vor und nach 0062; die Spalten „wie_erwartet“ prüfen den jeweils richtigen Fall.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
:ADM

\echo [1] Vor 0062: jedes Projekt hat alle 8 Aufgaben (auch die neuen aus t42 über den Trigger); nach 0062: neue Projekte haben 0 (gilt global) -> 0 Projekte mit 1–7 Zeilen, wie_erwartet t
reset role;
select count(*) fehlend from public.ws_projekte p where (select count(*) from public.ws_ki_zustaendigkeit z where z.projekt_id = p.id) not in (0, 8);
select case when to_regclass('public.ws_ki_zustaendigkeit_global') is null
            then not exists (select 1 from public.ws_projekte p where (select count(*) from public.ws_ki_zustaendigkeit z where z.projekt_id = p.id) <> 8)
            else (select count(*) from public.ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go') = 8 end wie_erwartet;
\echo [2] Standardwerte wie bisher zur Laufzeit -> chat claude/sonnet, pruefung claude/opus, texte claude/haiku, bauen claude
select aufgabe, reihe from public.ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe in ('chat','pruefung','texte','bauen') order by aufgabe;
set role authenticated;
\echo [3] Admin ändert „chat“ von vereinsheft auf Gemini → bleibt nach erneutem Einspielen von 0056 erhalten (siehe [5])
:ADM
-- Seit 0062 lehnt ws_ki_zustaendigkeit_setzen alles außer „bauen“ ab (gilt global) – die gespeicherte Zeile wird hier direkt angelegt
reset role;
insert into public.ws_ki_zustaendigkeit (projekt_id, aufgabe, reihe, weitergeben_ab, geaendert, geaendert_von)
values ('vereinsheft', 'chat', '[{"anbieter":"gemini"}]', 80, now(), '00000000-0000-0000-0000-00000000000a')
on conflict (projekt_id, aufgabe) do update set reihe = excluded.reihe, weitergeben_ab = excluded.weitergeben_ab, geaendert = now(), geaendert_von = excluded.geaendert_von;
set role authenticated;
:ADM
reset role;
create temp table vorher as select projekt_id, aufgabe, reihe, weitergeben_ab, geaendert, geaendert_von from public.ws_ki_zustaendigkeit;
\echo [4] Eine Zeile fehlt (z. B. von Hand gelöscht) → zweites Einspielen ergänzt nur sie
delete from public.ws_ki_zustaendigkeit where projekt_id = 'werkzeug-x' and aufgabe = 'doku';
\ir ../migrations/0056_regelwerk_sicherungen.sql
\set QUIET 1
\echo [5] Nach dem zweiten Einspielen: gespeicherte Werte unverändert (0 Unterschiede), die fehlende Zeile vor 0062 wieder da (1), nach 0062 nicht (0) -> wie_erwartet t, Gemini bleibt
select count(*) unterschiede from vorher v join public.ws_ki_zustaendigkeit z using (projekt_id, aufgabe)
 where not (v.projekt_id = 'werkzeug-x' and v.aufgabe = 'doku')
   and (z.reihe is distinct from v.reihe or z.weitergeben_ab is distinct from v.weitergeben_ab or z.geaendert is distinct from v.geaendert or z.geaendert_von is distinct from v.geaendert_von);
select count(*) wieder_da, count(*) = case when to_regclass('public.ws_ki_zustaendigkeit_global') is null then 1 else 0 end wie_erwartet
  from public.ws_ki_zustaendigkeit where projekt_id = 'werkzeug-x' and aufgabe = 'doku';
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

-- Test Datenbank 0060 (Arbeitsplatz für alle Arten, Stufen 2 und 3) – Claude, Entwurf freigegeben von Gerhard 02.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0060 (0060 zweimal eingespielt). Läuft ohne die übrigen Tests.
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung). Nur erfundene Test-Konten.
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set FREMD 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000f'',false) \\g /dev/null'
:ADM
insert into ws_einladungen(email,rolle,eingeladen_von,projekt_id) values ('dev@x.at','entwickler',auth.uid(),'trainer-to-go');
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,admin_pc) values ('00000000-0000-0000-0000-0000000000a1',auth.uid(),'PC-Admin',true,true);
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000a2',auth.uid(),'PC-Admin-2',true);
:DEV
select ws_einladung_annehmen('Dev') \g /dev/null
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000d1',auth.uid(),'PC-Dev',true);
:ADM
select ws_projekt_anlegen('prog-x','Programm X','Test','kresak-it-solutions/prog-x','layers') \g /dev/null
select ws_projekt_technik('prog-x','programm','keine') \g /dev/null
select ws_projekt_anlegen('werk-x','Werkzeug X','Test','kresak-it-solutions/werk-x','layers') \g /dev/null
select ws_projekt_technik('werk-x','werkzeug','keine') \g /dev/null

\echo [1] Technik: Admin setzt dotnet -> dotnet; tauri -> (leer); Entwickler -> FEHLER; unbekannt -> FEHLER; direkt -> FEHLER
select ws_projekt_programm_technik_setzen('prog-x','dotnet') \g /dev/null
select programm_technik from ws_projekte where id = 'prog-x';
select ws_projekt_programm_technik_setzen('prog-x','tauri') \g /dev/null
select coalesce(programm_technik, '(leer)') technik from ws_projekte where id = 'prog-x';
:DEV
select ws_projekt_programm_technik_setzen('prog-x','dotnet');
:ADM
select ws_projekt_programm_technik_setzen('prog-x','wpf');
update ws_projekte set programm_technik = 'dotnet' where id = 'prog-x';

\echo [2] Sandbox: Web-App ohne Ziel Windows -> FEHLER; mit Ziel Windows -> OK; fremder PC -> FEHLER; Entwickler -> FEHLER
select ws_projekt_aktion_anfordern('trainer-to-go','sandbox','main','00000000-0000-0000-0000-0000000000a1');
select ws_projekt_ziele_setzen('trainer-to-go', array['web','windows']) \g /dev/null
select ws_projekt_aktion_anfordern('trainer-to-go','sandbox','main','00000000-0000-0000-0000-0000000000a1') > 0 sandbox_web_windows;
select ws_projekt_aktion_anfordern('prog-x','sandbox','main','00000000-0000-0000-0000-0000000000d1');
:DEV
select ws_projekt_aktion_anfordern('prog-x','sandbox','main','00000000-0000-0000-0000-0000000000d1');
:ADM

\echo [3] Testlauf-Eingaben: gültig -> OK; Befehl mit Leerzeichen/Semikolon -> FEHLER; Eingabe mit ../ -> FEHLER; zweiter Punkt -> FEHLER
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":"klein.csv"}') > 0 testlauf_ok;
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen; rm -rf /","eingabe":"klein.csv"}');
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":"../geheim.csv"}');
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":"a..csv"}');
\echo [4] Unbekannter Schlüssel -> FEHLER; Zahl statt Text -> FEHLER; Eingaben bei Sandbox -> FEHLER; Testlauf ohne Ziel Cloud-Lauf -> FEHLER
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":"klein.csv","shell":"x"}');
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":5}');
select ws_projekt_aktion_anfordern('prog-x','sandbox','main','00000000-0000-0000-0000-0000000000a1',false,'{"befehl":"x","eingabe":"y"}');
select ws_projekt_aktion_anfordern('prog-x','testlauf','main');
\echo [5] Direkt schreiben (Eingaben einschleusen) -> FEHLER
update ws_projekt_aktionen set eingaben = '{"befehl":"x y"}' where projekt_id = 'werk-x';
insert into ws_projekt_aktionen(projekt_id, art, eingaben) values ('werk-x','testlauf','{"befehl":"a","eingabe":"b"}');

\echo [6] Testseite: Tauri-Programm -> OK; .NET -> FEHLER; Vorschau einrichten windows bei Tauri -> OK, pdf ohne Ziel PDF -> FEHLER, ohne Ziel -> FEHLER
select ws_projekt_aktion_anfordern('prog-x','testseite') > 0 testseite_tauri;
reset role; delete from ws_projekt_aktionen where projekt_id = 'prog-x' and art = 'testseite'; update ws_projekte set testseite_stand = null where id = 'prog-x'; set role authenticated;
:ADM
select ws_projekt_programm_technik_setzen('prog-x','dotnet') \g /dev/null
select ws_projekt_aktion_anfordern('prog-x','testseite');
select ws_projekt_aktion_anfordern('prog-x','vorschau_einrichten',null,null,false,'{"ziel":"windows"}');
select ws_projekt_programm_technik_setzen('prog-x','tauri') \g /dev/null
select ws_projekt_aktion_anfordern('prog-x','vorschau_einrichten',null,null,false,'{"ziel":"windows"}') > 0 vorschau_windows;
select ws_projekt_aktion_anfordern('prog-x','vorschau_einrichten',null,null,false,'{"ziel":"pdf"}');
select ws_projekt_aktion_anfordern('werk-x','vorschau_einrichten');

\echo [7] Dokument: ohne Ziel PDF -> FEHLER; mit Ziel PDF -> OK; Feature aus anderem Projekt -> FEHLER
select ws_projekt_aktion_anfordern('werk-x','dokument','main');
select ws_projekt_ziele_setzen('werk-x', array['cloud_lauf','pdf']) \g /dev/null
select ws_projekt_aktion_anfordern('werk-x','dokument','main') > 0 dokument_ok;
select ws_projekt_aktion_anfordern('prog-x','bildschirmfoto',null,'00000000-0000-0000-0000-0000000000a1',false,null,'F-080');

\echo [8] Nehmen: ohne Arten-Liste (alter Dienst) nie Bildschirmfoto/Dokument/Vorschau; mit Liste -> bildschirmfoto mit Feature
select ws_projekt_aktion_anfordern('trainer-to-go','bildschirmfoto',null,'00000000-0000-0000-0000-0000000000a1',false,null,'F-080') > 0 foto_angefragt;
reset role; update ws_projekt_aktionen set stand = 'fertig' where art in ('sandbox','testlauf','testseite'); set role authenticated;
:ADM
select art from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a2');
select art, feature_id, 'windows' = any(ziele) windows from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a1', array['bildschirmfoto']);
\echo [8b] Zweiter PC des Admins bekommt das Bildschirmfoto nicht (Ziel-PC) -> keine Zeile
select count(*) zweiter_pc from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a2', array['bildschirmfoto']);

\echo [9] Bildschirmfoto melden: fremder Ordner -> FEHLER; Bild fehlt -> FEHLER; Größe 0 -> FEHLER; richtig -> fertig mit Bild
reset role;
insert into storage.objects(bucket_id, name, owner) values ('ws-chat','00000000-0000-0000-0000-00000000000a/trainer-to-go/11111111-1111-1111-1111-111111111111.png','00000000-0000-0000-0000-00000000000a');
create temp table foto as select id from ws_projekt_aktionen where art = 'bildschirmfoto' and projekt_id = 'trainer-to-go';
grant select on foto to authenticated;
set role authenticated;
:ADM
select ws_bildschirmfoto_melden('00000000-0000-0000-0000-0000000000a1', (select id from foto), '00000000-0000-0000-0000-00000000000e/trainer-to-go/11111111-1111-1111-1111-111111111111.png', 1000, 800, 600);
select ws_bildschirmfoto_melden('00000000-0000-0000-0000-0000000000a1', (select id from foto), '00000000-0000-0000-0000-00000000000a/trainer-to-go/22222222-2222-2222-2222-222222222222.png', 1000, 800, 600);
select ws_bildschirmfoto_melden('00000000-0000-0000-0000-0000000000a1', (select id from foto), '00000000-0000-0000-0000-00000000000a/trainer-to-go/11111111-1111-1111-1111-111111111111.png', 0, 800, 600);
select ws_bildschirmfoto_melden('00000000-0000-0000-0000-0000000000a2', (select id from foto), '00000000-0000-0000-0000-00000000000a/trainer-to-go/11111111-1111-1111-1111-111111111111.png', 1000, 800, 600);
select ws_bildschirmfoto_melden('00000000-0000-0000-0000-0000000000a1', (select id from foto), '00000000-0000-0000-0000-00000000000a/trainer-to-go/11111111-1111-1111-1111-111111111111.png', 1000, 800, 600) \g /dev/null
select stand, ergebnis -> 'bild' ->> 'breite' breite from ws_projekt_aktionen where id = (select id from foto);

\echo [10] In den Chat (eine Funktion, atomar): Entwickler -> FEHLER; Zusatz über 2000 Zeichen -> FEHLER; richtig -> 1 Nachricht mit genau 1 Anhang, verknüpft; zweimal -> FEHLER, weiter 1 Nachricht
:DEV
select ws_bildschirmfoto_senden((select id from foto), null);
:ADM
select ws_bildschirmfoto_senden((select id from foto), repeat('x', 2001));
select ws_bildschirmfoto_senden((select id from foto), E'Knopf reagiert nicht\u202e\u0007') > 0 gesendet;
select count(*) nachrichten, min(jsonb_array_length(anhaenge)) anhaenge, bool_and(text like 'Bildschirmfoto aus der Windows-Sandbox zu Feature „%“ (F-080), Stand main. Bitte ansehen.%Knopf reagiert nicht%') text_ok,
       bool_and(text !~ '[\u202e\u0007]') ohne_steuerzeichen from ws_claude_chat where anhaenge is not null;
select chat_id = (select max(id) from ws_claude_chat) verknuepft from ws_projekt_aktionen where id = (select id from foto);
select ws_bildschirmfoto_senden((select id from foto), null);
select count(*) nachrichten_danach from ws_claude_chat where anhaenge is not null;
\echo [10a] Bild im Speicher weg -> FEHLER; unbestätigtes Foto älter als 24 Std. -> Datei in die Lösch-Warteschlange, Ergebnis „verfallen“; bestätigtes bleibt
reset role;
insert into ws_projekt_aktionen(projekt_id, art, stand, ziel_pc, pc, von, ergebnis, geaendert) values
 ('trainer-to-go','bildschirmfoto','fertig','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a',
  '{"bild":{"pfad":"00000000-0000-0000-0000-00000000000a/trainer-to-go/33333333-3333-3333-3333-333333333333.png","groesse":5,"breite":1,"hoehe":1}}', now() - interval '25 hours');
create temp table alt as select max(id) id from ws_projekt_aktionen where ergebnis -> 'bild' ->> 'pfad' like '%3333%'; grant select on alt to authenticated;
set role authenticated;
:ADM
select ws_bildschirmfoto_senden((select id from alt), null);
select ws_code_aufraeumen() \g /dev/null
reset role;
select count(*) in_warteschlange from ws_chat_dateien_weg where pfad like '%3333%';
select ergebnis ->> 'verfallen' verfallen, ergebnis ? 'bild' bild_noch_da from ws_projekt_aktionen where id = (select id from alt);
select ergebnis ? 'bild' bestaetigtes_bleibt from ws_projekt_aktionen where id = (select id from foto);
set role authenticated;
:ADM
\echo [10b] Entwickler sieht keine Aktionen (0)
:DEV
select count(*) dev_aktionen from ws_projekt_aktionen;

\echo [11] Testlauf-Ergebnis: neuer Lauf, genommen; gültig -> fertig; zu lange Ausgabe -> FEHLER; Datei ../x -> FEHLER; fremder Schlüssel -> FEHLER
:ADM
select ws_projekt_aktion_anfordern('werk-x','testlauf','main',null,false,'{"befehl":"abgleichen","eingabe":"klein.csv"}') \g /dev/null
select art, eingaben ->> 'befehl' befehl from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a1', array['testlauf']);
reset role; create temp table lauf as select max(id) id from ws_projekt_aktionen where art = 'testlauf' and projekt_id = 'werk-x'; grant select on lauf to authenticated; set role authenticated;
:ADM
select ws_projekt_aktion_lebt('00000000-0000-0000-0000-0000000000a1', (select id from lauf), 'Lauf in GitHub läuft') \g /dev/null
select ws_projekt_aktion_lebt('00000000-0000-0000-0000-0000000000a2', (select id from lauf));
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from lauf), jsonb_build_object('ausgabe', repeat('x', 20001)), 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from lauf), '{"ausgabe":"ok","dateien":[{"name":"../x","groesse":1}]}', 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from lauf), '{"ausgabe":"ok","befehl_zeile":"rm"}', 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from lauf), '{"ausgabe":"ok","dateien":[{"name":"ergebnis.csv","groesse":"viel"}]}', 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from lauf),
  '{"ausgabe":"Lese 240 Zeilen\nFertig","gekuerzt":false,"erfolg":true,"lauf":"123","befehl":"abgleichen","eingabe":"klein.csv","dateien":[{"name":"ergebnis.csv","groesse":12,"text":"a;b"}]}',
  'Testlauf fertig', 'https://github.com/kresak-it-solutions/werk-x/actions/runs/123') \g /dev/null
select stand, ergebnis ->> 'ausgabe' like 'Lese 240%' ausgabe, link from ws_projekt_aktionen where id = (select id from lauf);

\echo [12] Dokument: genommen; Seite hochladen für diese Aktion -> OK; für fremde Aktion -> FEHLER; Entwickler -> FEHLER
select art from ws_projekt_aktion_nehmen('00000000-0000-0000-0000-0000000000a1', array['dokument']);
reset role; create temp table dok as select max(id) id from ws_projekt_aktionen where art = 'dokument'; grant select on dok to authenticated; set role authenticated;
:ADM
insert into storage.objects(bucket_id, name) values ('ws-vorschau', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-001.png');
insert into storage.objects(bucket_id, name) values ('ws-vorschau', '00000000-0000-0000-0000-00000000000a/werk-x/999999/seite-001.png');
insert into storage.objects(bucket_id, name) values ('ws-vorschau', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/../seite-002.png');
:DEV
insert into storage.objects(bucket_id, name) values ('ws-vorschau', '00000000-0000-0000-0000-00000000000e/werk-x/' || (select id from dok) || '/seite-001.png');
select count(*) dev_sieht_seiten from storage.objects where bucket_id = 'ws-vorschau';
\echo [13] Ergebnis mit fehlender Seite -> FEHLER; Seitennummer passt nicht zum Pfad -> FEHLER; richtig -> fertig (1 Seite)
:ADM
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from dok), jsonb_build_object('seiten', jsonb_build_array(jsonb_build_object('nr', 2, 'pfad', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-002.png', 'breite', 600, 'hoehe', 848))), 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from dok), jsonb_build_object('seiten', jsonb_build_array(jsonb_build_object('nr', 3, 'pfad', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-001.png', 'breite', 600, 'hoehe', 848))), 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from dok), jsonb_build_object('seiten', jsonb_build_array(jsonb_build_object('nr', 1.5, 'pfad', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-001.png', 'breite', 600, 'hoehe', 848))), 'x');
select ws_aktion_ergebnis_melden('00000000-0000-0000-0000-0000000000a1', (select id from dok), jsonb_build_object('gesamt', 1, 'seiten', jsonb_build_array(jsonb_build_object('nr', 1, 'pfad', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-001.png', 'breite', 600, 'hoehe', 848))), 'Dokument gebaut') \g /dev/null
select stand, jsonb_array_length(ergebnis -> 'seiten') seiten from ws_projekt_aktionen where id = (select id from dok);
\echo [13b] Nach dem Lauf: weitere Seite hochladen -> FEHLER; Admin liest Seiten -> 1
insert into storage.objects(bucket_id, name) values ('ws-vorschau', '00000000-0000-0000-0000-00000000000a/werk-x/' || (select id from dok) || '/seite-002.png');
select count(*) admin_sieht_seiten from storage.objects where bucket_id = 'ws-vorschau';

\echo [14] Ampel-Lampe „dokument“ -> t; unbekannte Lampe -> f
select ws_anbindungen_ok('{"dokument":{"stand":"gruen","text":"Seiten-Vorschau bereit"}}'), ws_anbindungen_ok('{"konsole":{"stand":"gruen","text":"x"}}');

\echo [15] anon darf keine der neuen Funktionen ausführen -> f (11x)
reset role;
select p.proname, has_function_privilege('anon', p.oid, 'execute') from pg_proc p
 where p.proname in ('ws_projekt_programm_technik_setzen','ws_aktion_eingaben_ok','ws_projekt_aktion_anfordern','ws_projekt_aktion_nehmen','ws_projekt_aktion_lebt',
   'ws_bildschirmfoto_melden','ws_bildschirmfoto_senden','ws_bildschirmfotos_aufraeumen','ws_aktion_ergebnis_ok','ws_aktion_ergebnis_melden','ws_vorschau_datei_ok')
 order by p.proname;
\echo [16] SECURITY-DEFINER-Funktionen ohne festen search_path -> 0; nur eine Fassung je Funktion (anfordern 1, nehmen 1)
select count(*) ohne_search_path from pg_proc p where p.prosecdef and p.pronamespace = 'public'::regnamespace
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
select count(*) filter (where proname = 'ws_projekt_aktion_anfordern') anfordern, count(*) filter (where proname = 'ws_projekt_aktion_nehmen') nehmen from pg_proc;
\echo [17] RLS an ws_projekt_aktionen -> t; Speicher ws-vorschau privat -> f
select relrowsecurity from pg_class where oid = 'public.ws_projekt_aktionen'::regclass;
select public from storage.buckets where id = 'ws-vorschau';

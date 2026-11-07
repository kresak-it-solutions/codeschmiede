-- Rechte-Test Datenbank 0064 (Updates & Freigabe, Abgleich mit main, 0.20.0) – Claude, Anweisung Gerhard 07.11.2026, Entwurf freigegeben 21:16
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0064 (0064 zweimal). Läuft für sich allein. Nur erfundene Test-Konten.
-- Variable :aufbau = Aufbau von Trainer to go: psql -v aufbau="$(cat supabase/tests/daten/aufbau-trainer-to-go-2026-11-07.json)" -f …
\set QUIET 1
\pset footer off
set role authenticated;
\set ADM 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'
\set DEV 'select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000e'',false) \\g /dev/null'
\set ANON 'reset role; set role anon; \\g /dev/null'
:ADM
insert into ws_einladungen(email,rolle,eingeladen_von,projekt_id) values ('dev@x.at','entwickler',auth.uid(),'trainer-to-go');
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,admin_pc,faehigkeiten) values ('00000000-0000-0000-0000-0000000000a1',auth.uid(),'PC-Admin',true,true,'{"dienst":"0.20.0"}');
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,admin_pc,faehigkeiten) values ('00000000-0000-0000-0000-0000000000a2',auth.uid(),'PC-Admin-aus',false,false,'{"dienst":"0.20.0"}');
:DEV
select ws_einladung_annehmen('Dev') \g /dev/null
insert into ws_werkstatt_pcs(id,benutzer_id,name,an,faehigkeiten) values ('00000000-0000-0000-0000-0000000000d1',auth.uid(),'PC-Dev',true,'{"dienst":"0.20.0"}');
reset role;
update ws_projekte set repo = 'kresak-it-solutions/trainer-to-go', live_zweig = true, aufbau_datei = 'src/lib/appStruktur.js' where id = 'trainer-to-go';
insert into ws_live_versionen (projekt_id, commit_sha, bezeichnung, art) values ('trainer-to-go', repeat('1', 40), 'v1.0', 'einrichten');
set role authenticated;

\set ST '{"ablauf":true,"live_sha":"2222222222222222222222222222222222222222","main_sha":"3333333333333333333333333333333333333333","live_bez":"v1.163.1","wartet":[{"nr":409,"titel":"Einwilligungen","zweig":"feature/einwilligung-mannschaft","art":"neu","am":"2026-11-07T20:00:00Z"}],"commits":4,"datenbank":true,"mitteilungen":[{"id":"2026-11-07-x","titel":"Neu","text":"Text","fuer":["trainer","eltern"]}],"geplant":null,"verlauf":[{"am":"2026-11-07T18:52:00Z","art":"freigabe","ziel":"2222222222222222222222222222222222222222","von":"Gerhard Kresak · Plattform","ergebnis":"success","status":"completed"}],"zurueck":["version/v1.160.0"],"lauf":null}'

\echo [1] Freigabe-Stand melden: Entwickler -> FEHLER; Admin mit fremdem/ausgeschaltetem PC -> FEHLER; Admin -> ok, freigabe_ablauf an, Version „extern“
:DEV
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000d1', 'trainer-to-go', :'ST'::jsonb);
:ADM
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a2', 'trainer-to-go', :'ST'::jsonb);
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000d1', 'trainer-to-go', :'ST'::jsonb);
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', :'ST'::jsonb);
select freigabe_ablauf from ws_projekte where id = 'trainer-to-go';
select art, bezeichnung, left(commit_sha, 7) from ws_live_versionen where projekt_id = 'trainer-to-go' order by id;

\echo [2] Ungültige Stände -> je FEHLER (fremder Schlüssel, falsche Art, Version mit .., zu langer Titel, kaputter Stand)
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', (:'ST'::jsonb) || '{"boese":1}');
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(:'ST'::jsonb, '{wartet,0,art}', '"rm -rf"'));
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(:'ST'::jsonb, '{zurueck}', '["version/../main"]'));
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(:'ST'::jsonb, '{wartet,0,titel}', to_jsonb(repeat('x', 201))));
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(:'ST'::jsonb, '{main_sha}', '"abc"'));

\echo [3] Anfordern mit Ablauf: Entwickler -> FEHLER; live mit altem Stand -> FEHLER; live mit gesehenem Stand -> ok; zweite gleichzeitig -> FEHLER
:DEV
select ws_live_anfordern('trainer-to-go', 'live', null, '3333333333333333333333333333333333333333');
:ADM
select ws_live_anfordern('trainer-to-go', 'live', null, '4444444444444444444444444444444444444444');
select ws_live_anfordern('trainer-to-go', 'live', null, '3333333333333333333333333333333333333333') is not null as live_angefordert;
select ws_live_anfordern('trainer-to-go', 'planen', null, '3333333333333333333333333333333333333333');

\echo [4a] Alter Dienst (0.19.0) nimmt Freigabe-Aufträge nicht
reset role; update ws_werkstatt_pcs set faehigkeiten = '{"dienst":"0.19.0"}' where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
:ADM
select count(*) as alter_dienst_nimmt from ws_live_nehmen('00000000-0000-0000-0000-0000000000a1');
reset role; update ws_werkstatt_pcs set faehigkeiten = '{"dienst":"0.20.0"}' where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated;
\echo [4] Werkstatt nimmt: Dev -> nichts; Admin-PC -> art live, ablauf true, von_name gesetzt; Ergebnis von fremdem PC -> FEHLER; Ergebnis -> Version „live“
:DEV
select count(*) as dev_nimmt from ws_live_nehmen('00000000-0000-0000-0000-0000000000d1');
:ADM
select art, left(commit_sha, 7) c, ziel_version, ablauf, von_name is not null as name_da from ws_live_nehmen('00000000-0000-0000-0000-0000000000a1');
select ws_live_ergebnis('00000000-0000-0000-0000-0000000000a2', (select max(id) from ws_live_auftraege), '3333333333333333333333333333333333333333', 'v1.164.0', '{}');
select ws_live_ergebnis('00000000-0000-0000-0000-0000000000a1', (select max(id) from ws_live_auftraege), '3333333333333333333333333333333333333333', 'v1.164.0', '{}');
select art, bezeichnung from ws_live_versionen where projekt_id = 'trainer-to-go' order by id desc limit 1;

\echo [5] Stand mit live = main: Version bleibt (kein doppeltes „extern“); planen auf live-Stand -> FEHLER „schon live“
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(:'ST'::jsonb, '{live_sha}', '"3333333333333333333333333333333333333333"'));
select count(*) as versionen from ws_live_versionen where projekt_id = 'trainer-to-go';
select ws_live_anfordern('trainer-to-go', 'planen', null, '3333333333333333333333333333333333333333');

\echo [6] planen ok (neuer main), zuruecknehmen ohne Plan -> FEHLER, Ergebnis planen ohne Version; zurück nur auf gemeldete Version
select ws_freigabe_stand_melden('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', jsonb_set(jsonb_set(:'ST'::jsonb, '{live_sha}', '"3333333333333333333333333333333333333333"'), '{main_sha}', '"5555555555555555555555555555555555555555"'));
select ws_live_anfordern('trainer-to-go', 'zuruecknehmen');
select ws_live_anfordern('trainer-to-go', 'planen', null, '5555555555555555555555555555555555555555') is not null as geplant;
select art from ws_live_nehmen('00000000-0000-0000-0000-0000000000a1');
select ws_live_ergebnis('00000000-0000-0000-0000-0000000000a1', (select max(id) from ws_live_auftraege), null, null, null);
select art, stand, hinweis from ws_live_auftraege order by id desc limit 1;
select count(*) as versionen from ws_live_versionen where projekt_id = 'trainer-to-go';
select ws_live_anfordern('trainer-to-go', 'zurueck', null, null, 'version/v9.9.9');
select ws_live_anfordern('trainer-to-go', 'zurueck', null, null, 'version/v1.160.0') is not null as zurueck_ok;
select art, ziel_version from ws_live_nehmen('00000000-0000-0000-0000-0000000000a1');
select ws_live_ergebnis('00000000-0000-0000-0000-0000000000a1', (select max(id) from ws_live_auftraege), '2222222222222222222222222222222222222222', 'version/v1.160.0', '{}') \g /dev/null
select art, bezeichnung from ws_live_versionen where projekt_id = 'trainer-to-go' order by id desc limit 1;

\echo [7] Direktes Schreiben -> FEHLER; anon sieht nichts
insert into ws_freigabe_stand (projekt_id, stand) values ('trainer-to-go', '{}');
update ws_projekte set freigabe_ablauf = false where id = 'trainer-to-go';
insert into ws_chat_arbeit (projekt_id, nr, titel) values ('trainer-to-go', 1, 'x');
insert into ws_live_auftraege (projekt_id, art, ziel_commit) values ('trainer-to-go', 'planen', repeat('a', 40));
:ANON
select count(*) as anon_sieht from ws_freigabe_stand;
reset role; set role authenticated;

\echo [8] Projekt ohne Ablauf: planen/zuruecknehmen/zurueck per Name -> FEHLER
reset role;
insert into ws_projekte (id, name, repo, live_zweig) values ('ohne', 'Ohne Ablauf', 'x/ohne', true);
set role authenticated;
:ADM
select ws_live_anfordern('ohne', 'planen', null, '5555555555555555555555555555555555555555');
select ws_live_anfordern('ohne', 'zurueck', null, null, 'version/v1.160.0');

\echo [9] Abgleich: Entwickler -> FEHLER; Projekt ohne Aufbau-Datei -> FEHLER; kaputter Aufbau -> FEHLER; gültig -> neue Gruppen/Features, verschoben
:DEV
select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000d1', 'trainer-to-go', repeat('6', 40), :'aufbau'::jsonb);
:ADM
select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'ohne', repeat('6', 40), :'aufbau'::jsonb);
select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('6', 40), '{"app":[{"key":"Sport!","gruppen":[]}]}');
select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('6', 40), '{"app":[],"erp":[],"features":{"app":{"x":[{"id":"N-1","name":"y"}]}}}');
select jsonb_array_length(e->'neue_obergruppen') obergruppen, jsonb_array_length(e->'neue_gruppen') gruppen, jsonb_array_length(e->'neue_features') features,
       (e->>'verschoben')::int > 0 as verschoben, jsonb_array_length(e->'fehlt_gruppen') fehlt_g, jsonb_array_length(e->'fehlt_features') fehlt_f
  from (select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('6', 40), :'aufbau'::jsonb,
        array['F-020','F-450'], '[{"nr":409,"titel":"Einwilligungen","zweig":"feature/einwilligung-mannschaft","am":"2026-11-07T20:00:00Z","features":["F-450"]}]') e) x;
select g.id, g.name, b.app_key as obergruppe from ws_gruppen g join ws_bereiche b on b.id = g.bereich_id where g.app_key in ('medien','exercise-library') and b.app_teil = 'app';
select g.id, b.app_key from ws_gruppen g join ws_bereiche b on b.id = g.bereich_id where g.app_key = 'updates';
select id, stand, gruppe_id from ws_features where id in ('F-450','F-451','F-453') order by id;
select count(*) as aenderungen_protokolliert from ws_aufbau_aenderungen where projekt_id = 'trainer-to-go';
select nr, feature_ids from ws_chat_arbeit;

\echo [10] Zweiter Abgleich ändert nichts; Ergebnis des ersten bleibt sichtbar
select (e->>'verschoben')::int + jsonb_array_length(e->'neue_features') as aenderungen from (select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('7', 40), :'aufbau'::jsonb) e) x;
select jsonb_array_length(ergebnis->'neue_features') > 0 as erstes_ergebnis_sichtbar, wartet from ws_aufbau_stand;

\echo [11] Offene Aufbau-Änderung der Codeschmiede hält den Abgleich an (nur Chat-Liste), danach läuft er wieder
reset role;
insert into ws_aufbau_aenderungen (projekt_id, art, text) values ('trainer-to-go', 'gruppe_name', 'Test');
set role authenticated;
:ADM
select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('8', 40), '{"app":[],"erp":[],"features":{}}', '{}', '[{"nr":410,"titel":"Neu","zweig":"fix/x","am":"2026-11-07T21:00:00Z","features":[]}]') \g /dev/null
select wartet is not null as wartet, (select count(*) from ws_chat_arbeit) as chat, (select count(*) from ws_gruppen where app_fehlt) as fehlt from ws_aufbau_stand;
reset role;
delete from ws_aufbau_aenderungen where projekt_id = 'trainer-to-go';
set role authenticated;

\echo [12] Entfernt bestätigen: Entwickler -> FEHLER; Feature in der App -> FEHLER; leerer Aufbau markiert alles; Feature ausbauen ok; Gruppe mit Features -> FEHLER
:DEV
select ws_aufbau_entfernt_bestaetigen('trainer-to-go', 'feature', 'F-020');
:ADM
select ws_aufbau_entfernt_bestaetigen('trainer-to-go', 'feature', 'F-020');
select (jsonb_array_length(e->'fehlt_features') > 0) as markiert from (select ws_aufbau_abgleichen('00000000-0000-0000-0000-0000000000a1', 'trainer-to-go', repeat('9', 40), '{"app":[],"erp":[],"features":{}}') e) x;
select ws_aufbau_entfernt_bestaetigen('trainer-to-go', 'feature', 'F-020');
select ausgebaut from ws_features where id = 'F-020';
select ws_aufbau_entfernt_bestaetigen('trainer-to-go', 'gruppe', 'home');

\echo [13] Rechte: search_path und security definer, anon ohne Ausführrecht, je Funktion eine Fassung
reset role;
select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '-') cfg, has_function_privilege('anon', p.oid, 'execute') anon
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ws_freigabe_stand_melden','ws_live_anfordern','ws_live_nehmen','ws_live_ergebnis','ws_aufbau_abgleichen','ws_aufbau_entfernt_bestaetigen','ws_freigabe_stand_ok','ws_aufbau_ok')
 order by 1;

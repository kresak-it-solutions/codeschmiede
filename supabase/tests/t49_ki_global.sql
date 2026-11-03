-- Rechte-Test Datenbank 0062 (KI-Anbindungen global, 0.18.0) – Claude, Meldung und Freigabe von Gerhard 03.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0062 (0062 gern zweimal). Läuft für sich allein (eigene Konten/PCs);
-- spielt 0062 selbst noch zweimal ein (Startwerte aus Trainer to go, nie überschreiben).
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
:DEV
select ws_einladung_annehmen('Dev') \g /dev/null
insert into ws_werkstatt_pcs(id,benutzer_id,name,an) values ('00000000-0000-0000-0000-0000000000d1',auth.uid(),'PC-Dev',true);

\echo [1] Nach dem Einspielen: 8 globale Zuständigkeiten, alle gültig -> 8
reset role;
select count(*) global from ws_ki_zustaendigkeit_global;

\echo [2] Startwerte wie Trainer to go: TTG hat chat = Claude Sonnet + Gemini + ChatGPT (ab 80), keine Zeile „doku“ -> nach neuem Einspielen chat wie TTG, doku = Standard Sonnet
update ws_ki_zustaendigkeit set reihe = '[{"anbieter":"claude","modell":"sonnet"},{"anbieter":"gemini"},{"anbieter":"chatgpt"}]', weitergeben_ab = 80
 where projekt_id = 'trainer-to-go' and aufgabe = 'chat';
delete from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'doku';
delete from ws_ki_zustaendigkeit_global;
\ir ../migrations/0062_ki_global.sql
\set QUIET 1
select aufgabe, reihe, weitergeben_ab from ws_ki_zustaendigkeit_global where aufgabe in ('chat','doku','bauen') order by aufgabe;
select count(*) start_protokoll from ws_protokoll where was = 'ki_global_start';   -- 2: erstes Einspielen + dieses

\echo [3] Entwickler, Fremder setzen -> FEHLER (2x, nur Admin)
set role authenticated;
:DEV
select ws_ki_global_setzen('chat','[{"anbieter":"gemini"}]'::jsonb, 90);
:FREMD
select ws_ki_global_setzen('chat','[{"anbieter":"gemini"}]'::jsonb, 90);

\echo [4] Admin: Bauen mit Gemini, Prüfung ohne Claude, unbekannter Anbieter, Werkzeug bei Chat, Schwelle 30, Gemini CLI, Codex ohne Sperren-Test -> FEHLER (7x)
:ADM
select ws_ki_global_setzen('bauen','[{"anbieter":"gemini"}]'::jsonb, 90);
select ws_ki_global_setzen('pruefung','[{"anbieter":"chatgpt"}]'::jsonb, 90);
select ws_ki_global_setzen('chat','[{"anbieter":"unbekannt"}]'::jsonb, 90);
select ws_ki_global_setzen('chat','[{"anbieter":"claude"}]'::jsonb, 90, 'codex', null);
select ws_ki_global_setzen('chat','[{"anbieter":"claude"}]'::jsonb, 30);
select ws_ki_global_setzen('bauen','[{"anbieter":"claude"}]'::jsonb, 90, 'gemini-cli', null);
select ws_ki_global_setzen('bauen','[{"anbieter":"claude"}]'::jsonb, 90, 'codex', null);

\echo [5] Admin setzt konzept = ChatGPT + Claude Opus, ab 95 -> OK, Protokoll ki_global 1
select ws_ki_global_setzen('konzept','[{"anbieter":"chatgpt"},{"anbieter":"claude","modell":"opus"}]'::jsonb, 95) \g /dev/null
select reihe, weitergeben_ab, geaendert_von is not null von from ws_ki_zustaendigkeit_global where aufgabe = 'konzept';
reset role;
select count(*) protokoll from ws_protokoll where was = 'ki_global' and details ->> 'aufgabe' = 'konzept';

\echo [6] Zweites und drittes Einspielen überschreiben nichts -> 0 Unterschiede, konzept bleibt ChatGPT, kein neues Start-Protokoll (bleibt 2)
create temp table vorher as select * from ws_ki_zustaendigkeit_global;
\ir ../migrations/0062_ki_global.sql
\ir ../migrations/0062_ki_global.sql
\set QUIET 1
select count(*) unterschiede from vorher v full join ws_ki_zustaendigkeit_global g using (aufgabe)
 where g.aufgabe is null or v.aufgabe is null or g.reihe is distinct from v.reihe or g.weitergeben_ab is distinct from v.weitergeben_ab
    or g.werkzeug is distinct from v.werkzeug or g.geaendert is distinct from v.geaendert or g.geaendert_von is distinct from v.geaendert_von;
select reihe -> 0 ->> 'anbieter' konzept from ws_ki_zustaendigkeit_global where aufgabe = 'konzept';
select count(*) start_protokoll from ws_protokoll where was = 'ki_global_start';

\echo [7] Direkt schreiben (insert, update, delete) -> FEHLER (3x, kein Schreibrecht)
set role authenticated;
:ADM
insert into ws_ki_zustaendigkeit_global (aufgabe, reihe) values ('x', '[{"anbieter":"claude"}]');
update ws_ki_zustaendigkeit_global set weitergeben_ab = 50;
delete from ws_ki_zustaendigkeit_global;

\echo [8] Lesen: Admin 8, Entwickler (Mitglied eines Projekts) 8, Fremder (kein Mitglied) 0; anon -> FEHLER
select count(*) admin from ws_ki_zustaendigkeit_global;
:DEV
select count(*) entwickler from ws_ki_zustaendigkeit_global;
:FREMD
select count(*) fremd from ws_ki_zustaendigkeit_global;
reset role;
set role anon;
select count(*) from ws_ki_zustaendigkeit_global;
select ws_ki_global_setzen('chat','[{"anbieter":"claude"}]'::jsonb, 90);
select ws_werkzeug_wie_global('trainer-to-go');
reset role;

\echo [9] Neues Projekt: Trigger aus 0056 weg, keine Projektzeilen -> 0 Trigger, 0 Zeilen; alte Zeilen von Trainer to go bleiben (7)
set role authenticated;
:ADM
select ws_projekt_anlegen('neu-x','Neu X','Test','kresak-it-solutions/neu-x','layers') \g /dev/null
reset role;
select count(*) trigger from pg_trigger where tgname = 'ws_projekte_ki_standard';
select count(*) zeilen from ws_ki_zustaendigkeit where projekt_id = 'neu-x';
select count(*) ttg_zeilen from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go';

\echo [10] Programmier-Werkzeug je Projekt: Admin wählt Claude Code für neu-x -> Zeile da (1); „wie global“ -> Zeile weg (0), Protokoll 1; Entwickler -> FEHLER; unbekanntes Projekt -> FEHLER
set role authenticated;
:ADM
select ws_werkzeug_setzen('neu-x','claude-code',null) \g /dev/null
select count(*) projektzeile from ws_ki_zustaendigkeit where projekt_id = 'neu-x' and aufgabe = 'bauen';
select ws_werkzeug_wie_global('neu-x') \g /dev/null
select count(*) projektzeile from ws_ki_zustaendigkeit where projekt_id = 'neu-x' and aufgabe = 'bauen';
reset role;
select count(*) protokoll from ws_protokoll where was = 'werkzeug_wie_global' and details ->> 'projekt' = 'neu-x';
set role authenticated;
:DEV
select ws_werkzeug_wie_global('neu-x');
:ADM
select ws_werkzeug_wie_global('gibt-es-nicht');

\echo [11] Auftrags-Schutz ohne Projektzeile: global = Claude Code -> claude-code OK; global = Codex (Testaufbau) -> claude-code FEHLER, Codex auf dem Admin-PC FEHLER, Codex auf dem Entwickler-PC OK
reset role;
insert into ws_gruppen(id,bereich_id,name) select 'neu-x-start', g.bereich_id, 'Start' from ws_projekte p join ws_gruppen g on g.id = p.konzept_gruppe_id where p.id = 'neu-x';
insert into ws_auftraege(id,gruppe_id,titel,erstellt_von) values (9101,'neu-x-start','G-1','00000000-0000-0000-0000-00000000000a'), (9102,'neu-x-start','G-2','00000000-0000-0000-0000-00000000000a');
set role authenticated;
:ADM
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000a1', werkzeug = 'claude-code' where id = 9101;
select id, werkzeug from ws_auftraege where id = 9101;
reset role;
update ws_ki_zustaendigkeit_global set werkzeug = 'codex' where aufgabe = 'bauen';
set role authenticated;
:ADM
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'claude-code' where id = 9102;
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000a1', werkzeug = 'codex' where id = 9102;
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'codex' where id = 9102;
select id, werkzeug from ws_auftraege where id = 9102;

\echo [12] Projektzeile geht vor: Trainer to go hat Claude Code (Projekt), global Codex -> Codex FEHLER, claude-code OK
reset role;
insert into ws_auftraege(id,gruppe_id,titel,erstellt_von) values (9103,'kader','G-3','00000000-0000-0000-0000-00000000000a');
set role authenticated;
:ADM
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'codex' where id = 9103;
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1', werkzeug = 'claude-code' where id = 9103;
select id, werkzeug from ws_auftraege where id = 9103;
reset role;
update ws_ki_zustaendigkeit_global set werkzeug = 'claude-code', werkzeug_modell = null where aufgabe = 'bauen';

\echo [13] Globales Werkzeug Codex mit bestandenem Sperren-Test auf dem Entwickler-Mac -> OK (codex | gpt-5.5-codex), Reihe bleibt Claude; danach ohne Werkzeug speichern lässt es stehen (codex)
\set OK17 '''[{"id":"erlaubt","ok":true},{"id":"regeln","ok":true},{"id":"setup","ok":true},{"id":"nachbar","ok":true},{"id":"projektregeln","ok":true},{"id":"git","ok":true},{"id":"link","ok":true},{"id":"daten","ok":true},{"id":"hart","ok":true},{"id":"start_env","ok":true},{"id":"start_git","ok":true},{"id":"start_python","ok":true},{"id":"start_osascript","ok":true},{"id":"start_skript","ok":true},{"id":"lesen_ssh","ok":true},{"id":"lesen_zugang","ok":true},{"id":"lesen_projekte","ok":true}]'''
update ws_werkstatt_pcs set faehigkeiten = '{"plattform":"darwin"}' where id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
:DEV
select ws_werkzeug_melden('00000000-0000-0000-0000-0000000000d1','codex',('{"installiert":true,"angemeldet":true,"version":"0.166.0","sperrbar":true,"test":"bestanden","test_version":"0.166.0","test_punkte":'||:OK17||'}')::jsonb) \g /dev/null
:ADM
select ws_ki_global_setzen('bauen','[{"anbieter":"claude"}]'::jsonb, 90, 'codex', 'gpt-5.5-codex') \g /dev/null
select werkzeug, werkzeug_modell, reihe from ws_ki_zustaendigkeit_global where aufgabe = 'bauen';
select ws_ki_global_setzen('bauen','[{"anbieter":"claude"}]'::jsonb, 90) \g /dev/null
select werkzeug from ws_ki_zustaendigkeit_global where aufgabe = 'bauen';
select ws_ki_global_setzen('bauen','[{"anbieter":"claude"}]'::jsonb, 90, 'claude-code', null) \g /dev/null

\echo [14] Eigener Anbieter neben anderen in der globalen Reihe, dann gelöscht -> chat ohne copilot (claude, gemini, chatgpt), Protokoll nennt chat
select ws_ki_anbieter_speichern('{"id":"copilot","name":"GitHub Copilot","programm":"copilot","argumente":["-s"]}'::jsonb) \g /dev/null
select ws_ki_global_setzen('chat','[{"anbieter":"claude","modell":"sonnet"},{"anbieter":"copilot"},{"anbieter":"gemini"},{"anbieter":"chatgpt"}]'::jsonb, 80) \g /dev/null
select ws_ki_anbieter_loeschen('copilot') \g /dev/null
select string_agg(x ->> 'anbieter', ', ') chat from ws_ki_zustaendigkeit_global, jsonb_array_elements(reihe) x where aufgabe = 'chat';
reset role;
select details -> 'entfernt_global' entfernt from ws_protokoll where was = 'ki_anbieter_geloescht' and details ->> 'id' = 'copilot' order by id desc limit 1;
set role authenticated;
:ADM

\echo [14b] Eigener Anbieter ALLEIN zuständig (global texte) -> Löschen FEHLER „allein zuständig für global: texte“, Anbieter und Reihe bleiben (1 | mistral)
select ws_ki_anbieter_speichern('{"id":"mistral","name":"Mistral","programm":"vibe","argumente":[]}'::jsonb) \g /dev/null
select ws_ki_global_setzen('texte','[{"anbieter":"mistral"}]'::jsonb, 90) \g /dev/null
select ws_ki_anbieter_loeschen('mistral');
select (select count(*) from ws_ki_anbieter where id = 'mistral') da, (select reihe -> 0 ->> 'anbieter' from ws_ki_zustaendigkeit_global where aufgabe = 'texte') texte;
select ws_ki_global_setzen('texte','[{"anbieter":"claude","modell":"haiku"},{"anbieter":"mistral"}]'::jsonb, 90) \g /dev/null
select ws_ki_anbieter_loeschen('mistral') \g /dev/null
select (select count(*) from ws_ki_anbieter where id = 'mistral') da, (select string_agg(x ->> 'anbieter', ', ') from ws_ki_zustaendigkeit_global, jsonb_array_elements(reihe) x where aufgabe = 'texte') texte;

\echo [14c] Allein in einer Projektreihe „bauen“ (Testaufbau) -> FEHLER „Projekt trainer-to-go: bauen“
reset role;
insert into ws_ki_anbieter (id, name, programm, argumente) values ('bau-test', 'Bau-Test', 'bautest', '[]');
alter table ws_ki_zustaendigkeit drop constraint if exists ws_ki_zustaendigkeit_check;   -- nur im Test: Reihe „bauen“ künstlich mit fremdem Anbieter
update ws_ki_zustaendigkeit set reihe = '[{"anbieter":"bau-test"}]' where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';
set role authenticated;
:ADM
select ws_ki_anbieter_loeschen('bau-test');
reset role;
update ws_ki_zustaendigkeit set reihe = '[{"anbieter":"claude"}]' where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';
alter table ws_ki_zustaendigkeit add constraint ws_ki_zustaendigkeit_check check (public.ws_ki_reihe_ok(aufgabe, reihe));
delete from ws_ki_anbieter where id = 'bau-test';
set role authenticated;
:ADM

\echo [14d] Übergabe: neuer Anbieter ohne Angabe = stdin; {prompt} mit stdin -> FEHLER; Befehlszeile ohne {prompt} -> FEHLER; Befehlszeile mit {prompt} -> OK (argument); Tabelle erzwingt die Bindung -> FEHLER
select ws_ki_anbieter_speichern('{"id":"leise","name":"Leise","programm":"leise","argumente":["-q"]}'::jsonb) \g /dev/null
select eingabe from ws_ki_anbieter where id = 'leise';
select ws_ki_anbieter_speichern('{"id":"laut","name":"Laut","programm":"laut","argumente":["-p","{prompt}"]}'::jsonb);
select ws_ki_anbieter_speichern('{"id":"laut","name":"Laut","programm":"laut","argumente":["-q"],"eingabe":"argument"}'::jsonb);
select ws_ki_anbieter_speichern('{"id":"laut","name":"Laut","programm":"laut","argumente":["-p","{prompt}"],"eingabe":"argument"}'::jsonb) \g /dev/null
select eingabe from ws_ki_anbieter where id = 'laut';
reset role;
update ws_ki_anbieter set eingabe = 'stdin' where id = 'laut';
set role authenticated;
:ADM

\echo [14e] Alte Funktion je Projekt: chat -> FEHLER (Verweis auf ws_ki_global_setzen); bauen -> OK
select ws_ki_zustaendigkeit_setzen('trainer-to-go','chat','[{"anbieter":"claude"}]'::jsonb, 90);
select ws_ki_zustaendigkeit_setzen('trainer-to-go','bauen','[{"anbieter":"claude"}]'::jsonb, 90) \g /dev/null
select count(*) bauen from ws_ki_zustaendigkeit where projekt_id = 'trainer-to-go' and aufgabe = 'bauen';

\echo [15] Funktionen: SECURITY DEFINER mit search_path -> 0 ohne; public/anon ohne Ausführrecht -> 0
reset role;
select count(*) ohne from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ws_ki_global_setzen','ws_werkzeug_wie_global','ws_sieht_ein_projekt','ws_auftraege_werkzeug_schutz','ws_ki_anbieter_loeschen','ws_ki_anbieter_speichern','ws_ki_zustaendigkeit_setzen')
   and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'));
select count(*) offen from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ws_ki_global_setzen','ws_werkzeug_wie_global','ws_sieht_ein_projekt','ws_ki_anbieter_loeschen')
   and (has_function_privilege('anon', p.oid, 'execute') or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
select count(*) fassungen from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ws_ki_global_setzen';

\echo [16] Erneutes Einspielen von 0056 legt weder Trigger noch Projektzeilen an -> 0 Trigger, neu-x 0 Zeilen
\ir ../migrations/0056_regelwerk_sicherungen.sql
\set QUIET 1
select count(*) trigger from pg_trigger where tgname = 'ws_projekte_ki_standard';
select count(*) zeilen from ws_ki_zustaendigkeit where projekt_id = 'neu-x';

-- ========== Teil 2: Lange Fragen (Gerhard 03.11.2026 08:11) – gemeinsame Obergrenze 200.000 Zeichen ==========
\echo [17] Eine Konstante: ws_text_max() = 200000; die Checks von claude_chat, design_chat, aufgaben, aufgabe_sendungen und nachrichten nutzen sie -> 200000 | 5
reset role;
select public.ws_text_max() grenze,
  (select count(*) from pg_constraint where conname in ('ws_claude_chat_text_check','ws_design_chat_text_check','ws_aufgaben_beschreibung_check','ws_aufgabe_sendungen_text_check','ws_nachrichten_text_laenge')
     and pg_get_constraintdef(oid) like '%ws_text_max()%') checks;

\echo [18] Admin fragt im Chat und im Design-Chat mit 150.000 Zeichen -> OK, Länge 150000 | 150000 (vollständig gespeichert)
set role authenticated;
:ADM
insert into ws_claude_chat(projekt_id,ort,text) values ('trainer-to-go','zentrale', repeat('Ä', 149990) || 'ENDE-FRAGE');
insert into ws_design_chat(projekt_id,text,werte) values ('trainer-to-go', repeat('ß', 149990) || 'ENDE-FRAGE', '{}');
select (select char_length(text) from ws_claude_chat where text like '%ENDE-FRAGE' order by id desc limit 1) chat,
       (select char_length(text) from ws_design_chat where text like '%ENDE-FRAGE' order by id desc limit 1) design;

\echo [19] Über der Grenze (200.001 Zeichen) -> FEHLER (2x, Chat und Design-Chat)
insert into ws_claude_chat(projekt_id,ort,text) values ('trainer-to-go','zentrale', repeat('x', 200001));
insert into ws_design_chat(projekt_id,text,werte) values ('trainer-to-go', repeat('x', 200001), '{}');

\echo [20] Aufgabe mit 150.000 Zeichen Beschreibung -> OK (150000); 200.001 -> FEHLER
reset role;
insert into ws_aufgaben(projekt_id,titel,beschreibung,erstellt_von) values ('trainer-to-go','Lange Aufgabe', repeat('a', 150000), '00000000-0000-0000-0000-00000000000a');
select char_length(beschreibung) aufgabe from ws_aufgaben where titel = 'Lange Aufgabe';
insert into ws_aufgaben(projekt_id,titel,beschreibung,erstellt_von) values ('trainer-to-go','Zu lange Aufgabe', repeat('a', 200001), '00000000-0000-0000-0000-00000000000a');

\echo [21] Design-Auftrag (Kachel/Baustein) mit 150.000 Zeichen -> Nachricht vollständig (150000); 200.001 -> FEHLER
update ws_projekte set design_gruppe_id = 'neu-x-start' where id = 'neu-x';
set role authenticated;
:ADM
select ws_design_auftrag('neu-x','baustein','Langer Wunsch', repeat('w', 150000)) \g /dev/null
select char_length(n.text) design_auftrag from ws_nachrichten n join ws_auftraege a on a.id = n.auftrag_id where a.titel = 'Neuer Baustein: Langer Wunsch';
select ws_design_auftrag('neu-x','baustein','Zu langer Wunsch', repeat('w', 200001));

\echo [22] Grenzen auch in den Funktionen: Umdesign-Beschreibung, Umdesign-Auftragstext, Grunddesign senden, Punkt-Zusatz, Aufgabe als Auftrag ohne Kürzen -> 0 Funktionen mit alter Grenze
reset role;
select count(*) alt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('ws_umdesign_werte_ok','ws_design_auftrag','ws_umdesign_senden','ws_design_senden','ws_punkt_weiterarbeiten','ws_aufgabe_als_auftrag')
   and (p.prosrc ~ '\m(2000|4000|7000|8000|20000)\M' or p.prosrc not like '%ws_text_max()%' and p.proname <> 'ws_aufgabe_als_auftrag' or p.prosrc like '%8000)%');

\echo [23] ws_text_max für anon nicht aufrufbar -> FEHLER
set role anon;
select public.ws_text_max();
reset role;

\echo [24] Aufgabe als Auftrag: Text nach Entschärfen zu lang -> klare Meldung „Text nach Entschärfen zu lang“ (kein Check-Fehler)
reset role;
insert into ws_aufgaben(projekt_id,titel,beschreibung,erstellt_von) values ('trainer-to-go','Klammern', repeat('](', 100000), '00000000-0000-0000-0000-00000000000a');
insert into ws_aufgabe_sendungen(aufgabe_id,projekt_id,gruppe_id,titel,text,von)
  select id, 'trainer-to-go', 'kader', titel, repeat('](', 200100), '00000000-0000-0000-0000-00000000000a' from ws_aufgaben where titel = 'Klammern';
set role authenticated;
:ADM
select ws_aufgabe_als_auftrag((select max(id) from ws_aufgabe_sendungen));

\echo [25] 0057 erneut einspielen lässt den Auftrags-Schutz von 0062 stehen (Weiche) -> t
reset role;
\ir ../migrations/0057_programmier_werkzeug.sql
\set QUIET 1
select prosrc like '%ws_ki_zustaendigkeit_global%' fassung_0062 from pg_proc where proname = 'ws_auftraege_werkzeug_schutz';

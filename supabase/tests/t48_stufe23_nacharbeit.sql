-- Test Datenbank 0061 (Nacharbeit Stufe 2/3, Codeschmiede 0.17.1) – Claude, freigegeben von Gerhard 02.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0061 (0061 zweimal eingespielt). Läuft ohne die übrigen Tests.
-- Läuft als Superuser (zweite und dritte Verbindung über dblink, damit „gleichzeitig“ wirklich gleichzeitig ist). Nur erfundene Test-Konten.
-- Erwartung steht jeweils in der \echo-Zeile ("-> FEHLER" = Fehlermeldung).
\set QUIET 1
\pset footer off
create extension if not exists dblink;
\set ANMELDEN 'set role authenticated; select set_config(''request.jwt.claim.sub'',''00000000-0000-0000-0000-00000000000a'',false) \\g /dev/null'

-- Drei unbestätigte Fotos, älter als 24 Stunden (a: Aufräumen allein, b: gleichzeitig bestätigt, c: Bestätigen während des Aufräumens)
insert into storage.objects(bucket_id, name, owner) values
 ('ws-chat','00000000-0000-0000-0000-00000000000a/trainer-to-go/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png','00000000-0000-0000-0000-00000000000a'),
 ('ws-chat','00000000-0000-0000-0000-00000000000a/trainer-to-go/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png','00000000-0000-0000-0000-00000000000a'),
 ('ws-chat','00000000-0000-0000-0000-00000000000a/trainer-to-go/cccccccc-cccc-cccc-cccc-cccccccccccc.png','00000000-0000-0000-0000-00000000000a');
create temp table foto(k text primary key, id bigint);
with neu as (
  insert into ws_projekt_aktionen(projekt_id, art, stand, ziel_pc, pc, von, ergebnis, geaendert)
  select 'trainer-to-go','bildschirmfoto','fertig',null,null,'00000000-0000-0000-0000-00000000000a',
         jsonb_build_object('bild', jsonb_build_object('pfad', '00000000-0000-0000-0000-00000000000a/trainer-to-go/' || x || '.png', 'groesse', 5, 'breite', 1, 'hoehe', 1)),
         now() - interval '25 hours'
    from unnest(array['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc']) x
  returning id, left(ergebnis -> 'bild' ->> 'pfad', 52) p)
insert into foto select right(p, 1), id from neu;
select count(*) drei_fotos from foto;

\echo [1] Bestätigen läuft (Verbindung 1 hält die Aktion b, noch nicht fertig) -> Aufräumen wartet nicht und lässt b aus: aufgeraeumt 1 (a), a in der Warteschlange, b nicht in der Warteschlange
select dblink_connect('v1', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('v1', 'begin') \g /dev/null
select dblink_exec('v1', $q$ set role authenticated $q$) \g /dev/null
select * from dblink('v1', $q$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) $q$) as t(x text) \g /dev/null
select * from dblink('v1', format('select ws_bildschirmfoto_senden(%s, null)', (select id from foto where k = 'b'))) as t(chat bigint) \g /dev/null
-- Aufräumen nicht mitten im Test der Fotos a und c: c bekommt einen frischen Stand (gilt erst in [2] wieder als alt)
update ws_projekt_aktionen set geaendert = now() where id = (select id from foto where k = 'c');
set lock_timeout = '3s';
select ws_bildschirmfotos_aufraeumen() aufgeraeumt;
reset lock_timeout;
select f.k, exists (select 1 from ws_chat_dateien_weg w where w.pfad like '%' || f.k || f.k || f.k || f.k || '%') in_warteschlange
  from foto f where f.k in ('a','b') order by f.k;
\echo [1a] Verbindung 1 schließt ab -> b im Chat mit Bild, nicht verfallen; erneutes Aufräumen -> 0, b weiter nicht in der Warteschlange
select dblink_exec('v1', 'commit') \g /dev/null
select chat_id is not null im_chat, ergebnis ? 'bild' bild_da from ws_projekt_aktionen where id = (select id from foto where k = 'b');
select ws_bildschirmfotos_aufraeumen() aufgeraeumt_danach;
select count(*) b_in_warteschlange from ws_chat_dateien_weg where pfad like '%bbbb%';

\echo [2] Aufräumen läuft (Verbindung 1 hat c gesperrt und verfallen gesetzt, noch offen), Bestätigen in Verbindung 2 wartet -> nach dem Abschluss FEHLER „Kein offenes Bildschirmfoto“, keine Nachricht
update ws_projekt_aktionen set geaendert = now() - interval '25 hours' where id = (select id from foto where k = 'c');
select count(*) nachrichten_vorher from ws_claude_chat where anhaenge is not null;
select dblink_exec('v1', 'begin') \g /dev/null
select dblink_exec('v1', 'reset role') \g /dev/null
select * from dblink('v1', 'select ws_bildschirmfotos_aufraeumen()') as t(n integer);
select dblink_connect('v2', 'dbname=' || current_database()) \g /dev/null
select dblink_exec('v2', $q$ set role authenticated $q$) \g /dev/null
select * from dblink('v2', $q$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false) $q$) as t(x text) \g /dev/null
select dblink_send_query('v2', format('select ws_bildschirmfoto_senden(%s, null)', (select id from foto where k = 'c'))) gesendet;
select pg_sleep(0.5) \g /dev/null
select dblink_is_busy('v2') wartet_auf_sperre;
select dblink_exec('v1', 'commit') \g /dev/null
select * from dblink_get_result('v2', false) as t(chat bigint);
select dblink_error_message('v2') fehler_bestaetigen;
select count(*) nachrichten_nachher from ws_claude_chat where anhaenge is not null;
select chat_id is null nicht_im_chat, ergebnis ->> 'verfallen' verfallen from ws_projekt_aktionen where id = (select id from foto where k = 'c');
select dblink_disconnect('v1') \g /dev/null
select dblink_disconnect('v2') \g /dev/null

\echo [3] Warteschlange am Ende: a und c ja, b nie -> a t, b f, c t
select f.k, exists (select 1 from ws_chat_dateien_weg w where w.pfad like '%' || f.k || f.k || f.k || f.k || '%') in_warteschlange from foto f order by f.k;

\echo [4] Aufräumlauf ws_code_aufraeumen ruft die neue Fassung (keine Fehler) -> ok
:ANMELDEN
select ws_code_aufraeumen() \g /dev/null
select 'ok' code_aufraeumen;
\echo [4a] Direkt aufrufen als angemeldete Person -> FEHLER
select ws_bildschirmfotos_aufraeumen();
reset role;

\echo [5] Rechte: anon, public, authenticated ohne Ausführrecht -> f f f; SECURITY DEFINER mit search_path -> t t; nur eine Fassung -> 1
select has_function_privilege('anon', 'public.ws_bildschirmfotos_aufraeumen()', 'execute') anon,
       exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                where p.oid = 'public.ws_bildschirmfotos_aufraeumen()'::regprocedure and x.grantee = 0 and x.privilege_type = 'EXECUTE') public,
       has_function_privilege('authenticated', 'public.ws_bildschirmfotos_aufraeumen()', 'execute') authenticated;
select prosecdef, exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c = 'search_path=public') search_path
  from pg_proc where oid = 'public.ws_bildschirmfotos_aufraeumen()'::regprocedure;
select count(*) fassungen from pg_proc where proname = 'ws_bildschirmfotos_aufraeumen';
\echo [6] ws_bildschirmfoto_senden unverändert: sperrt die Aktion mit FOR UPDATE, authenticated darf, anon nicht -> t t f
select prosrc ~* 'from public\.ws_projekt_aktionen where id = p_aktion for update' sperrt,
       has_function_privilege('authenticated', oid, 'execute') authenticated, has_function_privilege('anon', oid, 'execute') anon
  from pg_proc where proname = 'ws_bildschirmfoto_senden';

-- Test Datenbank 0059 (Ein Arbeitsplatz für jede Art von Programm, Stufe 1) – Claude, Entwurf freigegeben von Gerhard 02.11.2026
-- Voraussetzung: frische Datenbank mit mock2.sql, alle Migrationen bis 0056 und 0059 (zweimal eingespielt). Läuft ohne die übrigen Tests.
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
:ADM
select ws_rechte_setzen('00000000-0000-0000-0000-00000000000e','kommunikation',true,false,false) \g /dev/null

\echo [1] Ziele vorbelegt: trainer-to-go (web) -> {web}; neues Programm -> {windows,mac}; Art werkzeug -> {cloud_lauf}
select ziele from ws_projekte where id = 'trainer-to-go';
select ws_projekt_anlegen('prog-x','Programm X','Test','kresak-it-solutions/prog-x','layers') \g /dev/null
select ws_projekt_technik('prog-x','programm','keine') \g /dev/null
select ziele from ws_projekte where id = 'prog-x';
select ws_projekt_technik('prog-x','werkzeug','keine') \g /dev/null
select ziele from ws_projekte where id = 'prog-x';
\echo [2] Admin setzt {web,windows,pdf} -> OK; danach Art programm -> Ziele bleiben {web,windows,pdf}
select ws_projekt_ziele_setzen('prog-x', array['web','windows','pdf']) \g /dev/null
select ws_projekt_technik('prog-x','programm','keine') \g /dev/null
select ziele from ws_projekte where id = 'prog-x';
\echo [3] Unbekanntes Ziel -> FEHLER; leer -> FEHLER; doppelt -> FEHLER; sieben -> FEHLER
select ws_projekt_ziele_setzen('prog-x', array['web','ios']);
select ws_projekt_ziele_setzen('prog-x', array[]::text[]);
select ws_projekt_ziele_setzen('prog-x', array['web','web']);
select ws_projekt_ziele_setzen('prog-x', array['web','handy_pwa','windows','mac','cloud_lauf','pdf','web']);
\echo [4] Entwickler setzt Ziele -> FEHLER; direktes Ändern -> FEHLER
:DEV
select ws_projekt_ziele_setzen('trainer-to-go', array['web','windows']);
update ws_projekte set ziele = array['mac'] where id = 'trainer-to-go';

\echo [5] Prüfweg: Entwickler mit Recht setzt Fenster für F-080 -> OK (fenster | Hauptfenster › Termine), vorschau_pfad bleibt /calendar
select ws_feature_pruefweg_setzen('F-080','fenster','Hauptfenster › Termine') \g /dev/null
select pruefweg_typ, pruefweg_text, vorschau_pfad from ws_features where id = 'F-080';
\echo [6] Ohne Recht im Bereich (F-011) -> FEHLER; unbekannter Typ -> FEHLER; 201 Zeichen -> FEHLER; Steuerzeichen -> FEHLER; leer bei Fenster -> FEHLER
select ws_feature_pruefweg_setzen('F-011','fenster','Hauptfenster');
select ws_feature_pruefweg_setzen('F-080','knopf','x');
select ws_feature_pruefweg_setzen('F-080','befehl',repeat('a',201));
select ws_feature_pruefweg_setzen('F-080','befehl',E'abgleichen\u202ex');
select ws_feature_pruefweg_setzen('F-080','fenster','  ');
\echo [7] Typ seite schreibt vorschau_pfad -> seite | (leer) | /kalender ; ungültiger Pfad -> FEHLER
select ws_feature_pruefweg_setzen('F-080','seite','/kalender') \g /dev/null
select pruefweg_typ, pruefweg_text is null text_leer, vorschau_pfad from ws_features where id = 'F-080';
select ws_feature_pruefweg_setzen('F-080','seite','/../geheim');
\echo [8] Direktes Ändern der Prüfweg-Spalten -> FEHLER; Fremder -> FEHLER
update ws_features set pruefweg_typ = 'befehl' where id = 'F-080';
:FREMD
select ws_feature_pruefweg_setzen('F-080','fenster','x');

\echo [9] Offener Punkt: Entwickler legt Aufgabe an F-080 an; Fremder „Weiterarbeiten“ -> FEHLER
:DEV
insert into ws_aufgaben(projekt_id, titel, beschreibung, feature_id) values ('trainer-to-go','Wochenansicht als Standard','', 'F-080');
insert into ws_aufgaben(projekt_id, titel, feature_id) values ('trainer-to-go','Punkt ohne Recht','F-011');
:FREMD
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), null);
\echo [10] Entwickler -> Auftrag (1 Auftrag, Nachricht mit daten.aufgabe, Sendung verknüpft, Status arbeit)
:DEV
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), 'Monat bleibt per Knopf') > 0 als_auftrag;
reset role;
select a.titel, a.feature_id, a.art, (n.daten -> 'aufgabe' ->> 'id')::bigint = au.id bezug, n.text like 'Offener Punkt: Wochenansicht%Dazu: Monat bleibt per Knopf' text_ok,
       s.auftrag_id = a.id sendung_ok, au.status
  from ws_auftraege a join ws_nachrichten n on n.auftrag_id = a.id join ws_aufgabe_sendungen s on s.auftrag_id = a.id join ws_aufgaben au on au.id = s.aufgabe_id
 where au.titel = 'Wochenansicht als Standard';
set role authenticated;
:DEV
\echo [11] Zweites „Weiterarbeiten“, solange der Auftrag läuft -> FEHLER (läuft schon)
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), null);
\echo [12] Punkt an Feature ohne Auftragsrecht (F-011) -> FEHLER; Text mit Steuerzeichen -> FEHLER
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Punkt ohne Recht'), null);
reset role;
update ws_auftraege set stand = 'wissen' where titel = 'Punkt: Wochenansicht als Standard';
set role authenticated;
:DEV
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), E'x\u0007');
\echo [13] Nach Live geht es wieder -> OK (2 Aufträge zum Punkt); erledigter Punkt -> FEHLER
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), null) > 0 wieder;
select count(*) auftraege_zum_punkt from ws_aufgabe_sendungen where aufgabe_id = (select id from ws_aufgaben where titel = 'Wochenansicht als Standard') and auftrag_id is not null;
update ws_aufgaben set status = 'erledigt' where titel = 'Wochenansicht als Standard';
select ws_punkt_weiterarbeiten((select id from ws_aufgaben where titel = 'Wochenansicht als Standard'), null);

\echo [14] Code live: Auftrag läuft auf PC-Dev; Entwickler meldet -> OK (1 Zeile)
reset role;
update ws_auftraege set stand = 'laeuft', werkstatt_pc = '00000000-0000-0000-0000-0000000000d1'
 where id = (select max(id) from ws_auftraege where titel = 'Punkt: Wochenansicht als Standard');
create temp table nr as select max(id) id from ws_auftraege where titel = 'Punkt: Wochenansicht als Standard';
grant select on nr to authenticated;
set role authenticated;
:DEV
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40),
  '[{"p":"src/pages/Calendar.jsx","art":"geaendert","plus":1,"minus":1,"zeilen":"- monat\n+ woche"},{"p":".env.local","art":"ausgeblendet"},{"p":"bild.png","art":"binaer","plus":0,"minus":0}]') \g /dev/null
select jsonb_array_length(dateien) dateien from ws_code_live;
\echo [15] Geheimnis-Datei mit Inhalt -> FEHLER; .env als „geaendert“ -> FEHLER; Pfad mit .. -> FEHLER; Binärdatei mit Zeilen -> FEHLER; unbekannter Schlüssel -> FEHLER; Zahl als Text -> FEHLER
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":"keys/server.pem","art":"ausgeblendet","zeilen":"x"}]');
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":".env","art":"geaendert"}]');
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":"../aussen.txt","art":"neu"}]');
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":"a.png","art":"binaer","zeilen":"x"}]');
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":"a.txt","art":"neu","inhalt":"x"}]');
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[{"p":"a.txt","art":"neu","plus":"viele"}]');
\echo [16] 61 Dateien -> FEHLER; ungültiger Startstand -> FEHLER
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), (select jsonb_agg(jsonb_build_object('p','d'||i||'.txt','art','neu')) from generate_series(1,61) i));
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), 'main', '[]');
\echo [17] Admin mit eigenem PC (Auftrag läuft nicht dort) -> FEHLER; Direkt schreiben -> FEHLER
:ADM
select ws_code_live_melden('00000000-0000-0000-0000-0000000000a1', (select id from nr), repeat('a',40), '[]');
insert into ws_code_live(auftrag_id, projekt_id, pc, basis_sha) values ((select id from nr), 'trainer-to-go', '00000000-0000-0000-0000-0000000000a1', repeat('b',40));
\echo [18] Lesen: Admin 1, Entwickler 1, Fremder 0
select count(*) adm from ws_code_live;
:DEV
select count(*) dev from ws_code_live;
:FREMD
select count(*) fremd from ws_code_live;
\echo [19] Auftrag verlässt „läuft“ (Rückfrage) -> Zeile weg (0)
reset role;
update ws_auftraege set stand = 'frage' where id = (select id from nr);
select count(*) nach_ende from ws_code_live;
\echo [20] Melden für einen Auftrag, der nicht läuft -> FEHLER
set role authenticated;
:DEV
select ws_code_live_melden('00000000-0000-0000-0000-0000000000d1', (select id from nr), repeat('a',40), '[]');

\echo [21] Diff-Anfrage: auf main -> FEHLER; Auftrags-Zweig -> OK; Werkstatt nimmt sie (Art diff)
select ws_code_anfragen('trainer-to-go','main','diff',null,'00000000-0000-0000-0000-0000000000d1');
select ws_code_anfragen('trainer-to-go','feature/cs-7-woche','diff',null,'00000000-0000-0000-0000-0000000000d1') > 0 angefragt;
select art, zweig, pfad is null ohne_pfad from ws_code_nehmen('00000000-0000-0000-0000-0000000000d1');
\echo [22] Antwort mit Geheimnis-Inhalt -> FEHLER; mit gültiger Liste -> OK (fertig)
select ws_code_antwort('00000000-0000-0000-0000-0000000000d1', (select max(id) from ws_code_anfragen), repeat('c',40), '[{"p":"id_rsa","art":"ausgeblendet","zeilen":"x"}]', null, null, null, true, false);
select ws_code_antwort('00000000-0000-0000-0000-0000000000d1', (select max(id) from ws_code_anfragen), repeat('c',40), '[{"p":"src/a.js","art":"geaendert","plus":1,"minus":0,"zeilen":"+ x"}]', null, null, null, true, false) \g /dev/null
select stand, jsonb_array_length(baum) from ws_code_anfragen order by id desc limit 1;
\echo [23] Datei- und Baum-Anfragen gehen weiter -> OK, OK
select ws_code_anfragen('trainer-to-go','main','baum',null,'00000000-0000-0000-0000-0000000000d1') > 0 baum;
select ws_code_anfragen('trainer-to-go','main','datei','src/App.jsx','00000000-0000-0000-0000-0000000000d1') > 0 datei;

\echo [24] Rechte der Funktionen: anon darf keine der neuen Funktionen ausführen -> f (8x)
reset role;
select has_function_privilege('anon', p.oid, 'execute') from pg_proc p
 where p.proname in ('ws_projekt_ziele_setzen','ws_feature_pruefweg_setzen','ws_punkt_weiterarbeiten','ws_code_live_melden','ws_code_live_ende','ws_code_live_ok','ws_ziele_ok','ws_ziele_aus_art')
 order by p.proname;
\echo [25] Alle neuen SECURITY-DEFINER-Funktionen mit festem search_path -> 0 ohne
select count(*) ohne_search_path from pg_proc p where p.prosecdef and p.proname in ('ws_projekt_ziele_setzen','ws_feature_pruefweg_setzen','ws_punkt_weiterarbeiten','ws_code_live_melden','ws_code_live_ende','ws_code_live_aufraeumen','ws_code_anfragen','ws_code_antwort')
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
\echo [26] RLS an ws_code_live -> t; anon hat kein Leserecht -> f
select relrowsecurity from pg_class where oid = 'public.ws_code_live'::regclass;
select has_table_privilege('anon', 'public.ws_code_live', 'select');
